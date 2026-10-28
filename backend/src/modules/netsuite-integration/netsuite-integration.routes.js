'use strict';
// BLT NOW: MISMA API HMAC, mismo contrato y rutas; destinos aislados por lote.
// Portafolio existente permanece SIN CAMBIOS. Tickets se habilita de forma independiente.
const express=require('express');
const {requireIntegrationAuthFor}=require('../../middleware/integration-auth.middleware');
const contract=require('./netsuite-integration.contract');
const {createReceiver:createPortafolioReceiver}=require('./netsuite-portafolio.receiver');
const {createReceiver:createTicketsReceiver}=require('./netsuite-tickets.receiver');
const router=express.Router();
const portafolio=createPortafolioReceiver();
const tickets=createTicketsReceiver();
const routeOwners=new Map();
const OWNER_IDLE_MS=40*60*1000;
const MAX_OWNER_ENTRIES=128;

router.use(requireIntegrationAuthFor('INTEGRATION_NETSUITE_ID', {
  alwaysRequireAuth:true,algorithm:'sha256'
}));
function invalid(code,message,statusCode=409) {
  const error=new Error(message);error.code=code;error.statusCode=statusCode;return error;
}
function cleanupOwners() {
  const now=Date.now();
  for (const [id,owner] of routeOwners) {
    if (now-owner.touched>OWNER_IDLE_MS) routeOwners.delete(id);
  }
  while (routeOwners.size>MAX_OWNER_ENTRIES) routeOwners.delete(routeOwners.keys().next().value);
}
function apiCredentialsReady() {
  // Compatibilidad con Portafolio: su status depende de las credenciales HMAC existentes.
  return portafolio.status().persistenciaHabilitada;
}
function ready(receiver) {
  if (!apiCredentialsReady() || !receiver.status().persistenciaHabilitada) {
    throw invalid('NS_DATASET_DESTINATION_PENDING',
      'Dataset aun cerrado o sin credenciales generales de NetSuite.',503);
  }
}
function receiverForDataset(dataset) {
  if (dataset==='PORTAFOLIO') return portafolio;
  if (dataset==='TICKETS') return tickets;
  throw invalid('NS_DATASET_SOURCE_DENIED','Dataset no autorizado para esta API.',403);
}
function ownerReceiver(loteId) {
  cleanupOwners();
  const owner=routeOwners.get(loteId);
  if (owner) owner.touched=Date.now();
  // Mantener el comportamiento original para lotes desconocidos: Portafolio
  // devuelve NOT_FOUND/ABORTADO como antes. Nunca redirigir hacia Tickets.
  return owner?.dataset==='TICKETS'?tickets:portafolio;
}
function receive(validate,operation) {
  return (req,res,next)=>{
    try {
      validate(req);
      // Mantener el rechazo sincrono de la API original cuando no hay HMAC configurado.
      if (!apiCredentialsReady()) return res.status(503).json({
        ok:false,code:'NS_DATASET_DESTINATION_PENDING',
        message:'Credenciales generales NetSuite no configuradas.'
      });
    } catch(error){return next(error);}
    Promise.resolve().then(()=>operation(req))
      .then(result=>res.json(result)).catch(next);
  };
}
router.get('/estado',(_req,res)=>res.json({
  ...portafolio.status(),
  destinos:{PORTAFOLIO:portafolio.status().persistenciaHabilitada,
    TICKETS:tickets.status().persistenciaHabilitada}
}));

router.post('/lotes',receive(
  req=>contract.validateBegin(req.body),
  async req=>{
    // Conservar 503 sin secretos incluso si el dataset entrante es desconocido.
    if (!apiCredentialsReady()) ready(portafolio);
    const receiver=receiverForDataset(req.body.dataset);
    ready(receiver);
    cleanupOwners();
    const id=req.body.loteId, old=routeOwners.get(id);
    if (old && old.dataset!==req.body.dataset) {
      throw invalid('NS_DATASET_LOTE_CONFLICT','Un mismo lote no puede cambiar de dataset.');
    }
    if (!old) routeOwners.set(id,{dataset:req.body.dataset,touched:Date.now()});
    try {
      const result=await receiver.begin(req.body);
      const entry=routeOwners.get(id);
      if (entry) entry.touched=Date.now();
      return result;
    } catch(error) {
      if (!old) routeOwners.delete(id);
      throw error;
    }
  }
));
router.post('/lotes/:loteId/paginas',receive(
  req=>contract.validatePage(req.params.loteId,req.body),
  req=>{
    const receiver=ownerReceiver(req.params.loteId);
    ready(receiver);
    return receiver.page(req.params.loteId,req.body);
  }
));
router.post('/lotes/:loteId/finalizar',receive(
  req=>contract.validateFinish(req.params.loteId,req.body),
  req=>{
    const receiver=ownerReceiver(req.params.loteId);
    ready(receiver);
    return receiver.finish(req.params.loteId,req.body);
  }
));
router.post('/lotes/:loteId/abortar',receive(
  req=>contract.validateAbort(req.params.loteId,req.body),
  async req=>{
    const receiver=ownerReceiver(req.params.loteId);
    // Se permite abortar staging Tickets aun si se apago el flag de escritura,
    // siempre con HMAC general y credenciales validas; Portafolio conserva su gate.
    if (receiver===tickets) {
      if (!apiCredentialsReady()) ready(portafolio);
    } else ready(portafolio);
    const result=await receiver.abort(req.params.loteId,req.body);
    if (result.estado==='ABORTADO' || result.estado==='SIN_LOTE_ACTIVO') {
      routeOwners.delete(req.params.loteId);
    }
    return result;
  }
));
module.exports=router;

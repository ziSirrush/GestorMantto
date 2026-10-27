'use strict';
// Contrato HTTP V1 y autenticacion M2M general NetSuite, SIN llamadas Azure/Aiven.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const Module = require('node:module');
const contract = require('../src/modules/netsuite-integration/netsuite-integration.contract');
const auth = require('../src/middleware/integration-auth.middleware');

const loteId='5ba8905a-8597-49ae-b5ed-d49e31d663e8';
const basePath='/api/integraciones/netsuite/v1';
const secret='TEST_ONLY_BLT_NS_SECRET_NOT_A_REAL_CREDENTIAL_64_CHARACTERS';
function validBegin(){return {versionContrato:1,loteId,origen:'NETSUITE',
  dataset:'PRUEBA',modoCarga:'COMPLETA',busquedaGuardada:'customscript_fuente_piloto',
  fechaExtraccionUtc:'2026-10-26T17:00:00.000Z',filasEsperadas:1,
  paginasEsperadas:1,tamanoPagina:300,
  columnas:[{indice:0,nombre:'internalid',join:null,summary:null,label:null},
    {indice:1,nombre:'entityid',join:null,summary:null,label:'Empresa'}]};}
function validPage(){const filas=[{posicion:1,idOrigen:'123',tipoOrigen:'customer',
  valores:['123','Cliente de prueba']}];return {pagina:1,filas,
    hashPagina:crypto.createHash('sha256').update(JSON.stringify(filas)).digest('hex')};}
function validFinish(){return {loteId,
  hashCarga:crypto.createHash('sha256').update(validPage().hashPagina).digest('hex'),
  filasEsperadas:1,paginasEsperadas:1};}
function captureError(fn){assert.throws(fn,e=>e.statusCode===422 && typeof e.code==='string');}

test('Contrato: inicio valido compatible con Emisor Universal',()=>{
  assert.deepEqual(contract.validateBegin(validBegin()),
    {loteId,dataset:'PRUEBA',paginasEsperadas:1,numeroColumnas:2});
});
test('Contrato: rechaza version, origen y dataset invalidos',()=>{
  for(const [key,value] of [['versionContrato',2],['origen','GAS'],['dataset','no permitido']]){
    const b=validBegin();b[key]=value;captureError(()=>contract.validateBegin(b));
  }
});
test('Contrato: numero de paginas debe concordar con filas',()=>{
  const b=validBegin();b.paginasEsperadas=2;captureError(()=>contract.validateBegin(b));
});
test('Contrato: columnas requieren indice consistente',()=>{
  const b=validBegin();b.columnas[1].indice=0;captureError(()=>contract.validateBegin(b));
});
test('Contrato: hash SHA256 de pagina correcto',()=>{
  assert.deepEqual(contract.validatePage(loteId,validPage()),
    {loteId,pagina:1,hashPagina:validPage().hashPagina,cantidad:1});
});
test('Contrato: hash alterado es rechazado',()=>{
  const p=validPage();p.filas[0].valores[1]='Manipulado';
  captureError(()=>contract.validatePage(loteId,p));
});
test('Contrato: fila fuera de posicion es rechazada',()=>{
  const p=validPage();p.filas[0].posicion=2;
  p.hashPagina=crypto.createHash('sha256').update(JSON.stringify(p.filas)).digest('hex');
  captureError(()=>contract.validatePage(loteId,p));
});
test('Contrato: manifiesto final valida lote y SHA256',()=>{
  assert.equal(contract.validateFinish(loteId,validFinish()).loteId,loteId);
  captureError(()=>contract.validateFinish('1ba8905a-8597-49ae-b5ed-d49e31d663e8',validFinish()));
});
function fakeReq(method,url,payload,headers={}){
  const raw=payload===null?'':JSON.stringify(payload);
  return {method,originalUrl:url,rawBody:Buffer.from(raw),body:payload,
    get(name){return headers[String(name).toLowerCase()];}};
}
function signed(req,id='netsuite-bltnow',pass=secret,stamp=String(Math.floor(Date.now()/1000))){
  const canonical=Buffer.concat([
    Buffer.from(`${stamp}\n${req.method}\n${req.originalUrl}\n`),req.rawBody]);
  const signature=crypto.createHmac('sha256',pass).update(canonical).digest('hex');
  return fakeReq(req.method,req.originalUrl,req.body,{
    'x-integration-id':id,'x-integration-timestamp':stamp,
    'x-integration-signature':signature});
}
function response(){return {statusCode:200,payload:null,
  status(code){this.statusCode=code;return this;},
  json(data){this.payload=data;return this;}};}

const originals={INTEGRATION_NETSUITE_ID:process.env.INTEGRATION_NETSUITE_ID,
  INTEGRATION_NETSUITE_SECRET:process.env.INTEGRATION_NETSUITE_SECRET,
  INTEGRATION_AUTH_ENABLED:process.env.INTEGRATION_AUTH_ENABLED};
process.env.INTEGRATION_NETSUITE_ID='netsuite-bltnow';
process.env.INTEGRATION_NETSUITE_SECRET=secret;
process.env.INTEGRATION_AUTH_ENABLED='false';
process.once('exit',()=>{
  for(const [k,v] of Object.entries(originals)){
    if(v===undefined)delete process.env[k];else process.env[k]=v;
  }
});
const requireNsAuth=auth.requireIntegrationAuthFor('INTEGRATION_NETSUITE_ID',{
  alwaysRequireAuth:true,algorithm:'sha256'});

test('Auth general obligatoria aunque el flag global este false',()=>{
  const req=fakeReq('GET',basePath+'/estado',null),res=response();let passed=false;
  requireNsAuth(req,res,()=>{passed=true;});
  assert.equal(passed,false);assert.equal(res.statusCode,401);
  assert.equal(res.payload.code,'INTEGRATION_AUTH_HEADERS_MISSING');
});
test('Auth general acepta ID+HMAC correctos, sin credenciales por modulo',()=>{
  const req=signed(fakeReq('POST',basePath+'/lotes',validBegin()));
  const res=response();let passed=false;
  requireNsAuth(req,res,()=>{passed=true;});
  assert.equal(passed,true);assert.equal(req.integrationAuth.integrationId,'netsuite-bltnow');
});
test('Auth general rechaza secreto incorrecto',()=>{
  const req=signed(fakeReq('POST',basePath+'/lotes',validBegin()),'netsuite-bltnow','WRONG');
  const res=response();let passed=false;
  requireNsAuth(req,res,()=>{passed=true;});
  assert.equal(passed,false);assert.equal(res.statusCode,401);
  assert.equal(res.payload.code,'INTEGRATION_AUTH_INVALID_SIGNATURE');
});
test('Auth general rechaza identidad ajena',()=>{
  const req=signed(fakeReq('POST',basePath+'/lotes',validBegin()),'otra-integracion');
  const res=response();let passed=false;
  requireNsAuth(req,res,()=>{passed=true;});
  assert.equal(passed,false);assert.equal(res.statusCode,401);
});
test('Auth general rechaza timestamp vencido',()=>{
  const req=signed(fakeReq('POST',basePath+'/lotes',validBegin()),
    'netsuite-bltnow',secret,'1698329999');
  const res=response();let passed=false;
  requireNsAuth(req,res,()=>{passed=true;});
  assert.equal(passed,false);assert.equal(res.payload.code,'INTEGRATION_AUTH_EXPIRED_TIMESTAMP');
});
test('Auth general liga firma a ruta original',()=>{
  const req=signed(fakeReq('POST',basePath+'/lotes',validBegin()));
  req.originalUrl=basePath+'/lotes/'+loteId+'/finalizar';
  const res=response();let passed=false;
  requireNsAuth(req,res,()=>{passed=true;});
  assert.equal(passed,false);assert.equal(res.payload.code,'INTEGRATION_AUTH_INVALID_SIGNATURE');
});

test('Rutas existentes usan auth general y fallan cerrado sin credencial',()=>{
  const recorder={uses:[],posts:new Map(),gets:new Map()};
  const fakeExpress={Router(){return {
    use(...handlers){recorder.uses.push(handlers);},
    get(path,...handlers){recorder.gets.set(path,handlers);},
    post(path,...handlers){recorder.posts.set(path,handlers);}};}};
  const oldLoad=Module._load;
  Module._load=function(request,parent,isMain){
    if(request==='express')return fakeExpress;
    return oldLoad.apply(this,[request,parent,isMain]);
  };
  try {
    const p=require.resolve('../src/modules/netsuite-integration/netsuite-integration.routes');
    delete require.cache[p];require(p);
  } finally {Module._load=oldLoad;}
  assert.equal(recorder.uses.length,1);
  assert.ok(recorder.gets.has('/estado'));
  assert.equal(recorder.posts.size,3);
  // Sin secreto de la API general, el receptor debe rechazar ANTES de acceder a Aiven.
  const saved=process.env.INTEGRATION_NETSUITE_SECRET;
  delete process.env.INTEGRATION_NETSUITE_SECRET;
  try {
    const status=response();recorder.gets.get('/estado')[0]({},status);
    assert.equal(status.payload.persistenciaHabilitada,false);
    for(const [route,body] of [['/lotes',validBegin()],
      ['/lotes/:loteId/paginas',validPage()],
      ['/lotes/:loteId/finalizar',validFinish()]]){
      const res=response();let error=null;
      recorder.posts.get(route)[0]({body,params:{loteId}},res,e=>{error=e;});
      assert.equal(error,null);assert.equal(res.statusCode,503);
      assert.equal(res.payload.code,'NS_DATASET_DESTINATION_PENDING');
    }
  } finally {process.env.INTEGRATION_NETSUITE_SECRET=saved;}
});

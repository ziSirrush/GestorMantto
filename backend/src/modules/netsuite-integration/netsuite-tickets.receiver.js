'use strict';
// NetSuite -> API general Azure (HMAC M2M existente) -> Aiven, solo Tickets experimental.
// Un COMMIT atomico al finalizar el lote, sin escrituras parciales ni tablas productivas.
// El middleware integration-auth.middleware.js autentica con
// INTEGRATION_NETSUITE_ID / INTEGRATION_NETSUITE_SECRET (YA existentes).
// Mismas credenciales M2M. La habilitacion de escritura TICKETS es independiente
// y permanece FALSE por defecto hasta aprobar DDL real y QA de Aiven.
const crypto = require('node:crypto');
const contract = require('./netsuite-integration.contract');
const mapping = require('./netsuite-tickets.mapping');
const MAX_ROWS = 10000;
const MAX_STAGE_BYTES = 24 * 1024 * 1024;
const MAX_IDLE_MS = 40 * 60 * 1000;
const MAX_RECENT = 10;
const DATASET = 'TICKETS';
// Fecha y hora de Tickets: local CDMX DD/MM/AAAA (mapping normaliza a DATETIME).
// Si la cuenta usa otro locale, debe aprobarse explicitamente antes del envio.
const DATE_FORMAT = 'DD/MM/YYYY';
const SCRIPT_ID = /^customscript_[a-z0-9_]+$/i;

const sha = value => crypto.createHash('sha256').update(value,'utf8').digest('hex');

// Mismas dos variables que YA consume integration-auth.middleware.js.
// La identidad, el secreto y la firma se validan en el middleware para CADA peticion.
function configReady() {
  return Boolean(String(process.env.INTEGRATION_NETSUITE_ID || '').trim() &&
    String(process.env.INTEGRATION_NETSUITE_SECRET || '').trim() &&
    String(process.env.NS_TICKETS_WRITE_ENABLED || '').trim().toLowerCase() === 'true');
}
function paused() {
  return mapping.invalid('Receptor TICKETS cerrado: revisar credenciales generales y NS_TICKETS_WRITE_ENABLED.',
    503,'NS_DATASET_DESTINATION_PENDING');
}
function assertConfig(begin) {
  if (!configReady()) throw paused();
  if (begin.dataset !== DATASET || !SCRIPT_ID.test(String(begin.busquedaGuardada || ''))) {
    throw mapping.invalid('Origen/dataset no autorizado para Tickets experimental.',
      403,'NS_TICKETS_SOURCE_DENIED');
  }
  if (begin.filasEsperadas > MAX_ROWS) {
    throw mapping.invalid('La busqueda supera el limite de 10000 filas. No se guardaron datos.',
      413,'NS_TICKETS_CAPACITY_LIMIT');
  }
  return { dateFormat: DATE_FORMAT };
}

function createReceiver({repository = () => require('./netsuite-tickets.repository'), clock = () => Date.now()} = {}) {
  let active = null;
  const recent = new Map();
  function cleanup() {
    const now=clock();
    if (active && !active.committing && now - active.touched > MAX_IDLE_MS) {
      console.warn('[NS_TICKETS_LOTE_EXPIRADO]', JSON.stringify({
        loteId:active.id,paginasDescartadas:active.pages.size,filasDescartadas:active.countRows
      }));
      active=null;
    }
    for (const [key, entry] of recent) {
      if (now - entry.completed > MAX_IDLE_MS) recent.delete(key);
    }
    while (recent.size > MAX_RECENT) recent.delete(recent.keys().next().value);
  }
  function status() {
    cleanup();
    const enabled=configReady();
    return {
      ok:true, origen:'NETSUITE', contrato:1, autenticado:true,
      persistenciaHabilitada:enabled, destino:DATASET,
      estado:!enabled?'PENDIENTE_CREDENCIALES_API_GENERAL':
        active?.committing?'PUBLICANDO_ATOMICAMENTE':active?'RECIBIENDO':'CONFIGURADO_PRECHECK_PENDIENTE',
      loteActivo:Boolean(active), loteId:active?.id||null, paginasRecibidas:active?.pages.size||0,
      paginasEsperadas:active?.countPages||0, filasRecibidas:active?.countRows||0,
      sinEscriturasParciales:true
    };
  }
  function abort(loteId, body) {
    const { loteId: id } = contract.validateAbort(loteId, body);
    cleanup();
    const done=recent.get(id);
    if (done) {
      // El servidor nunca revierte lotes ya confirmados en Aiven.
      return {ok:true,loteId:id,estado:'PUBLICADO',filasConfirmadas:done.totalRows};
    }
    if (!active) return {ok:true,loteId:id,estado:'SIN_LOTE_ACTIVO'};
    if (active.id!==id) {
      throw mapping.invalid('No se puede cancelar un lote distinto del activo.',
        409,'NS_TICKETS_ABORT_DIFFERENT_LOT');
    }
    if (active.committing) {
      throw mapping.invalid('No se puede cancelar un lote durante su COMMIT.',
        409,'NS_TICKETS_COMMITTING');
    }
    const discarded=active;
    active=null; // staging exclusivamente en memoria: sin DML ni escrituras parciales.
    console.warn('[NS_TICKETS_LOTE_ABORTADO]', JSON.stringify({
      loteId:id,paginasDescartadas:discarded.pages.size,filasDescartadas:discarded.countRows
    }));
    return {ok:true,loteId:id,estado:'ABORTADO'};
  }

  async function begin(body) {
    cleanup();
    const b=contract.validateBegin(body);
    const cfg=assertConfig(body);
    const sourceMapping=mapping.validateColumns(body.columnas);
    const fingerprint=sha(JSON.stringify(body));
    const done=recent.get(b.loteId);
    if (done) {
      if (done.beginHash !== fingerprint) {
        throw mapping.invalid('Lote ya publicado con distinta cabecera.',409,'NS_TICKETS_LOTE_CONFLICT');
      }
      return {ok:true,loteId:b.loteId,estado:'PUBLICADO'};
    }
    if (active) {
      if (active.id !== b.loteId) {
        console.warn('[NS_TICKETS_BUSY]', JSON.stringify({
          loteActivo:active.id,loteSolicitado:b.loteId,
          inactividadMs:Math.max(0,clock()-active.touched)
        }));
        throw mapping.invalid('Ya hay otro lote Tickets en curso.',429,'NS_TICKETS_BUSY');
      }
      if (active.beginHash !== fingerprint) {
        throw mapping.invalid('La cabecera de un lote no puede cambiar.',409,'NS_TICKETS_LOTE_CONFLICT');
      }
      const current=active;
      await current.ready;
      if (active!==current) {
        throw mapping.invalid('Lote cancelado durante la verificacion de esquema.',
          409,'NS_TICKETS_LOTE_NOT_FOUND');
      }
      current.touched=clock();
      return {ok:true,loteId:b.loteId,estado:'RECIBIENDO'};
    }
    const lot={
      id:b.loteId, beginHash:fingerprint, map:sourceMapping,
      countPages:b.paginasEsperadas, totalRows:body.filasEsperadas,
      sourceId:body.busquedaGuardada, dateFormat:cfg.dateFormat,
      pages:new Map(), keys:new Set(), originIds:new Set(), bytes:0, countRows:0,
      touched:clock(), ready:null, committing:false, commitPromise:null, lengths:null
    };
    active=lot;
    lot.ready=Promise.resolve().then(()=>repository().preflight()).then(lengths=>{
      lot.lengths=lengths;
    }).catch(error=>{
      if (active===lot) active=null;
      throw error;
    });
    await lot.ready;
    if (active!==lot) {
      throw mapping.invalid('Lote cancelado durante la verificacion de esquema.',
        409,'NS_TICKETS_LOTE_NOT_FOUND');
    }
    return {ok:true,loteId:b.loteId,estado:'RECIBIENDO'};
  }
  async function page(loteId,body) {
    cleanup();
    const p=contract.validatePage(loteId,body);
    if (!configReady()) throw paused();
    const done=recent.get(p.loteId);
    if (done) {
      if (done.pages.get(p.pagina)?.hash !== p.hashPagina) {
        throw mapping.invalid('Pagina publicada distinta del manifiesto.',409,'NS_TICKETS_PAGE_CONFLICT');
      }
      return {ok:true,loteId:p.loteId,pagina:p.pagina,estado:'PUBLICADO'};
    }
    const lot=active;
    if (!lot || lot.id!==p.loteId) throw mapping.invalid('Lote no iniciado o expirado. Reejecutar el envio completo.',
      409,'NS_TICKETS_LOTE_NOT_FOUND');
    await lot.ready;
    if (active!==lot) throw mapping.invalid('Lote cancelado antes de recibir la pagina.',
      409,'NS_TICKETS_LOTE_NOT_FOUND');
    if (lot.committing) throw mapping.invalid('El lote ya se esta publicando.',409,'NS_TICKETS_COMMITTING');
    if (p.pagina > lot.countPages) throw mapping.invalid('Pagina fuera del lote.');
    const existing=lot.pages.get(p.pagina);
    if (existing) {
      if (existing.hash!==p.hashPagina) throw mapping.invalid('Reintento de pagina con contenido distinto.',
        409,'NS_TICKETS_PAGE_CONFLICT');
      lot.touched=clock();
      return {ok:true,loteId:p.loteId,pagina:p.pagina,estado:'PAGINA_RECIBIDA'};
    }
    const expected=p.pagina < lot.countPages ? contract.MAX_PAGE_SIZE :
      lot.totalRows - (lot.countPages-1)*contract.MAX_PAGE_SIZE;
    if (p.cantidad !== expected) throw mapping.invalid('Pagina incompleta: no se escribe.',422,'NS_TICKETS_PAGE_COUNT');
    const bytes=Buffer.byteLength(JSON.stringify(body.filas),'utf8');
    if (lot.bytes + bytes > MAX_STAGE_BYTES) throw mapping.invalid('Lote demasiado grande para staging seguro.',
      413,'NS_TICKETS_MEMORY_LIMIT');
    const converted=[];
    const localKeys=new Set();
    const localIds=new Set();
    for (const row of body.filas) {
      const record=mapping.convertRow(row,lot.map,lot.lengths,lot.dateFormat);
      const key=record.ticket.normalize('NFKC').toLowerCase();
      if (lot.keys.has(key) || localKeys.has(key)) {
        throw mapping.invalid('ticket duplicado en el lote completo.',422,'NS_TICKETS_DUPLICATE_KEY');
      }
      const sourceId=record.id_interno;
      if (lot.originIds.has(sourceId) || localIds.has(sourceId)) {
        throw mapping.invalid('ID interno de Ticket duplicado en el lote.',422,'NS_TICKETS_DUPLICATE_ORIGIN');
      }
      localKeys.add(key);localIds.add(sourceId);
      converted.push(record);
    }
    // Hasta finalizar, TODOS los registros quedan en memoria; NINGUN INSERT/UPDATE.
    lot.pages.set(p.pagina,{hash:p.hashPagina,rows:converted,count:p.cantidad});
    for (const key of localKeys) lot.keys.add(key);
    for (const id of localIds) lot.originIds.add(id);
    lot.bytes+=bytes;lot.countRows+=p.cantidad;lot.touched=clock();
    return {ok:true,loteId:p.loteId,pagina:p.pagina,estado:'PAGINA_RECIBIDA'};
  }
  async function finish(loteId,body) {
    cleanup();
    const f=contract.validateFinish(loteId,body);
    if (!configReady()) throw paused();
    const done=recent.get(f.loteId);
    if (done) {
      if (done.hash !== f.hashCarga || done.totalRows!==f.filasEsperadas) {
        throw mapping.invalid('Manifiesto final de lote publicado no coincide.',409,'NS_TICKETS_LOTE_CONFLICT');
      }
      return {ok:true,loteId:f.loteId,estado:'PUBLICADO',filasConfirmadas:done.totalRows};
    }
    const lot=active;
    if (!lot || lot.id!==f.loteId) throw mapping.invalid('Lote no iniciado o expirado. Reejecutar el envio completo.',
      409,'NS_TICKETS_LOTE_NOT_FOUND');
    await lot.ready;
    if (active!==lot) throw mapping.invalid('Lote cancelado antes de finalizar.',
      409,'NS_TICKETS_LOTE_NOT_FOUND');
    if (lot.commitPromise) return lot.commitPromise;
    if (f.filasEsperadas!==lot.totalRows || f.paginasEsperadas!==lot.countPages ||
        lot.pages.size!==lot.countPages || lot.countRows!==lot.totalRows || lot.keys.size!==lot.totalRows || lot.originIds.size!==lot.totalRows) {
      throw mapping.invalid('Faltan paginas o registros. No se escribio en Aiven.',409,'NS_TICKETS_INCOMPLETE');
    }
    const hashes=[];
    const rows=[];
    for (let i=1;i<=lot.countPages;i++) {
      const page=lot.pages.get(i);
      if (!page) throw mapping.invalid('Pagina faltante.',409,'NS_TICKETS_INCOMPLETE');
      hashes.push(page.hash);
      rows.push(...page.rows);
    }
    if (sha(hashes.join('\n'))!==f.hashCarga) throw mapping.invalid('SHA-256 final no coincide.',
      422,'NS_TICKETS_BATCH_HASH_MISMATCH');
    lot.committing=true;
    const promise=(async()=>{
      // Unica transaccion InnoDB para todo el lote. Si falla, ROLLBACK completo.
      const result=await repository().publishRows(rows,undefined,()=>configReady());
      const ledger=new Map([...lot.pages].map(([idx,v])=>[idx,{hash:v.hash}]));
      recent.set(lot.id,{
        beginHash:lot.beginHash,hash:f.hashCarga,pages:ledger,
        completed:clock(),totalRows:lot.totalRows
      });
      if(active===lot)active=null;
      cleanup();
      console.info('[NS_TICKETS_PUBLICADO]', JSON.stringify({
        loteId:lot.id,destino:'ns_tickets_pruebas',paginas:lot.countPages,
        filasConfirmadas:result.filasConfirmadas,fechaUtc:new Date().toISOString()
      }));
      return {ok:true,loteId:lot.id,estado:'PUBLICADO',filasConfirmadas:result.filasConfirmadas};
    })();
    lot.commitPromise=promise;
    try { return await promise; }
    catch(error) { lot.committing=false;lot.commitPromise=null;throw error; }
  }
  return Object.freeze({status,begin,page,finish,abort});
}

module.exports = {createReceiver,configReady,MAX_ROWS,MAX_STAGE_BYTES,MAX_IDLE_MS};

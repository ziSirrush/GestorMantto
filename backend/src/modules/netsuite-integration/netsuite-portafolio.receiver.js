'use strict';
// NetSuite -> API general Azure (HMAC M2M existente) -> Aiven, solo Portafolio experimental.
// Un COMMIT atomico al finalizar el lote, sin escrituras parciales ni tablas productivas.
// El middleware integration-auth.middleware.js autentica con
// INTEGRATION_NETSUITE_ID / INTEGRATION_NETSUITE_SECRET (YA existentes).
// No requiere variables NS_PORTAFOLIO_* ni introduce credenciales por modulo.
const crypto = require('node:crypto');
const contract = require('./netsuite-integration.contract');
const mapping = require('./netsuite-portafolio.mapping');
const MAX_ROWS = 10000;
const MAX_STAGE_BYTES = 24 * 1024 * 1024;
const MAX_IDLE_MS = 40 * 60 * 1000;
const MAX_RECENT = 10;
const DATASET = 'PORTAFOLIO';
// Contrato de fechas de BLT NOW: DD/MM/AAAA. Tambien admite YYYY-MM-DD (mapping).
// Si NS emplea otra preferencia regional, la fuente debe normalizar a ISO antes de enviar.
const DATE_FORMAT = 'DD/MM/YYYY';
const SCRIPT_ID = /^customscript_[a-z0-9_]+$/i;

const sha = value => crypto.createHash('sha256').update(value,'utf8').digest('hex');

// Mismas dos variables que YA consume integration-auth.middleware.js.
// La identidad, el secreto y la firma se validan en el middleware para CADA peticion.
function configReady() {
  return Boolean(String(process.env.INTEGRATION_NETSUITE_ID || '').trim() &&
    String(process.env.INTEGRATION_NETSUITE_SECRET || '').trim());
}
function paused() {
  return mapping.invalid('La credencial de la API general NetSuite no esta configurada.',
    503,'NS_DATASET_DESTINATION_PENDING');
}
function assertConfig(begin) {
  if (!configReady()) throw paused();
  if (begin.dataset !== DATASET || !SCRIPT_ID.test(String(begin.busquedaGuardada || ''))) {
    throw mapping.invalid('Origen/dataset no autorizado para Portafolio experimental.',
      403,'NS_PORTAFOLIO_SOURCE_DENIED');
  }
  if (begin.filasEsperadas > MAX_ROWS) {
    throw mapping.invalid('La busqueda supera el limite de 10000 filas. No se guardaron datos.',
      413,'NS_PORTAFOLIO_CAPACITY_LIMIT');
  }
  return { dateFormat: DATE_FORMAT };
}

function createReceiver({repository = () => require('./netsuite-portafolio.repository'), clock = () => Date.now()} = {}) {
  let active = null;
  const recent = new Map();
  function cleanup() {
    const now=clock();
    if (active && !active.committing && now - active.touched > MAX_IDLE_MS) active=null;
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
      loteActivo:Boolean(active), paginasRecibidas:active?.pages.size||0,
      paginasEsperadas:active?.countPages||0, filasRecibidas:active?.countRows||0,
      sinEscriturasParciales:true
    };
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
        throw mapping.invalid('Lote ya publicado con distinta cabecera.',409,'NS_PORTAFOLIO_LOTE_CONFLICT');
      }
      return {ok:true,loteId:b.loteId,estado:'PUBLICADO'};
    }
    if (active) {
      if (active.id !== b.loteId) {
        throw mapping.invalid('Ya hay otro lote Portafolio en curso.',429,'NS_PORTAFOLIO_BUSY');
      }
      if (active.beginHash !== fingerprint) {
        throw mapping.invalid('La cabecera de un lote no puede cambiar.',409,'NS_PORTAFOLIO_LOTE_CONFLICT');
      }
      await active.ready;
      active.touched=clock();
      return {ok:true,loteId:b.loteId,estado:'RECIBIENDO'};
    }
    const lot={
      id:b.loteId, beginHash:fingerprint, map:sourceMapping,
      countPages:b.paginasEsperadas, totalRows:body.filasEsperadas,
      sourceId:body.busquedaGuardada, dateFormat:cfg.dateFormat,
      pages:new Map(), keys:new Set(), bytes:0, countRows:0,
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
    return {ok:true,loteId:b.loteId,estado:'RECIBIENDO'};
  }
  async function page(loteId,body) {
    cleanup();
    const p=contract.validatePage(loteId,body);
    if (!configReady()) throw paused();
    const done=recent.get(p.loteId);
    if (done) {
      if (done.pages.get(p.pagina)?.hash !== p.hashPagina) {
        throw mapping.invalid('Pagina publicada distinta del manifiesto.',409,'NS_PORTAFOLIO_PAGE_CONFLICT');
      }
      return {ok:true,loteId:p.loteId,pagina:p.pagina,estado:'PUBLICADO'};
    }
    const lot=active;
    if (!lot || lot.id!==p.loteId) throw mapping.invalid('Lote no iniciado o expirado. Reejecutar el envio completo.',
      409,'NS_PORTAFOLIO_LOTE_NOT_FOUND');
    await lot.ready;
    if (lot.committing) throw mapping.invalid('El lote ya se esta publicando.',409,'NS_PORTAFOLIO_COMMITTING');
    if (p.pagina > lot.countPages) throw mapping.invalid('Pagina fuera del lote.');
    const existing=lot.pages.get(p.pagina);
    if (existing) {
      if (existing.hash!==p.hashPagina) throw mapping.invalid('Reintento de pagina con contenido distinto.',
        409,'NS_PORTAFOLIO_PAGE_CONFLICT');
      lot.touched=clock();
      return {ok:true,loteId:p.loteId,pagina:p.pagina,estado:'PAGINA_RECIBIDA'};
    }
    const expected=p.pagina < lot.countPages ? contract.MAX_PAGE_SIZE :
      lot.totalRows - (lot.countPages-1)*contract.MAX_PAGE_SIZE;
    if (p.cantidad !== expected) throw mapping.invalid('Pagina incompleta: no se escribe.',422,'NS_PORTAFOLIO_PAGE_COUNT');
    const bytes=Buffer.byteLength(JSON.stringify(body.filas),'utf8');
    if (lot.bytes + bytes > MAX_STAGE_BYTES) throw mapping.invalid('Lote demasiado grande para staging seguro.',
      413,'NS_PORTAFOLIO_MEMORY_LIMIT');
    const converted=[];
    const localKeys=new Set();
    for (const row of body.filas) {
      const record=mapping.convertRow(row,lot.map,lot.lengths,lot.dateFormat);
      const key=record.numero_equipo.toLowerCase();
      if (lot.keys.has(key) || localKeys.has(key)) {
        throw mapping.invalid('numero_equipo duplicado en el lote completo.',422,'NS_PORTAFOLIO_DUPLICATE_KEY');
      }
      localKeys.add(key);
      converted.push(record);
    }
    // Hasta finalizar, TODOS los registros quedan en memoria; NINGUN INSERT/UPDATE.
    lot.pages.set(p.pagina,{hash:p.hashPagina,rows:converted,count:p.cantidad});
    for (const key of localKeys) lot.keys.add(key);
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
        throw mapping.invalid('Manifiesto final de lote publicado no coincide.',409,'NS_PORTAFOLIO_LOTE_CONFLICT');
      }
      return {ok:true,loteId:f.loteId,estado:'PUBLICADO',filasConfirmadas:done.totalRows};
    }
    const lot=active;
    if (!lot || lot.id!==f.loteId) throw mapping.invalid('Lote no iniciado o expirado. Reejecutar el envio completo.',
      409,'NS_PORTAFOLIO_LOTE_NOT_FOUND');
    await lot.ready;
    if (lot.commitPromise) return lot.commitPromise;
    if (f.filasEsperadas!==lot.totalRows || f.paginasEsperadas!==lot.countPages ||
        lot.pages.size!==lot.countPages || lot.countRows!==lot.totalRows || lot.keys.size!==lot.totalRows) {
      throw mapping.invalid('Faltan paginas o registros. No se escribio en Aiven.',409,'NS_PORTAFOLIO_INCOMPLETE');
    }
    const hashes=[];
    const rows=[];
    for (let i=1;i<=lot.countPages;i++) {
      const page=lot.pages.get(i);
      if (!page) throw mapping.invalid('Pagina faltante.',409,'NS_PORTAFOLIO_INCOMPLETE');
      hashes.push(page.hash);
      rows.push(...page.rows);
    }
    if (sha(hashes.join('\n'))!==f.hashCarga) throw mapping.invalid('SHA-256 final no coincide.',
      422,'NS_PORTAFOLIO_BATCH_HASH_MISMATCH');
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
      console.info('[NS_PORTAFOLIO_PUBLICADO]', JSON.stringify({
        loteId:lot.id,destino:'ns_portafolio_pruebas',paginas:lot.countPages,
        filasConfirmadas:result.filasConfirmadas,fechaUtc:new Date().toISOString()
      }));
      return {ok:true,loteId:lot.id,estado:'PUBLICADO',filasConfirmadas:result.filasConfirmadas};
    })();
    lot.commitPromise=promise;
    try { return await promise; }
    catch(error) { lot.committing=false;lot.commitPromise=null;throw error; }
  }
  return Object.freeze({status,begin,page,finish});
}

module.exports = {createReceiver,configReady,MAX_ROWS,MAX_STAGE_BYTES,MAX_IDLE_MS};

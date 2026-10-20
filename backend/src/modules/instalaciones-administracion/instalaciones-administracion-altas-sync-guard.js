'use strict';

// BLT NOW | 2026-10-20 | ALTAS FASE 4 V001
// Preflight GAS: bloquear lote completo cuando contiene equipos ya creados
// manualmente desde Administracion. No altera la integracion ni salta filas
// de forma silenciosa. El candado coordina el preflight con POST /altas.
const db = require('../../config/db');
const logger = require('../../shared/logger');
const origin = require('./instalaciones-administracion-altas-origin');

function validInputCor(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const ppns = String(row.id_proyecto ?? '').trim();
  const ref = String(row.referencia_sitio ?? '').trim();
  return ppns && ref ? {id_proyecto:ppns,referencia_sitio:ref} : null;
}

async function conflictsCor(connection, incoming) {
  const candidates = Array.isArray(incoming) ? incoming.map(validInputCor).filter(Boolean) : [];
  if (!candidates.length) return [];
  const matching = [];
  for (let start=0;start<candidates.length;start+=100) {
    const part=candidates.slice(start,start+100);
    const clauses=part.map(()=>' (f.id_proyecto = ? AND f.referencia_sitio = ?) ').join(' OR ');
    const [rows]=await connection.query(
      `SELECT f.id_ins_fl,f.id_proyecto,f.referencia_sitio
         FROM ins_fl f WHERE ${clauses}`,
      part.flatMap(row=>[row.id_proyecto,row.referencia_sitio])
    );
    matching.push(...rows);
  }
  const ids=await origin.humanCreatedIdsCor(connection,matching);
  return [...new Map(matching.filter(row=>ids.has(Number(row.id_ins_fl)))
    .map(row=>[Number(row.id_ins_fl),row])).values()];
}

async function protectManualAltasCor(req,res,next) {
  const rows=req.body?.rows;
  if (!Array.isArray(rows) || !rows.length) return next();
  let conn;
  let locked=false;
  let releasePromise=null;
  function release() {
    if(releasePromise)return releasePromise;
    // Una sola promesa para finish y finally del controlador.
    releasePromise=(async()=>{
      try {if(locked) await origin.releaseCor(conn);}
      finally {conn?.release();}
    })();
    return releasePromise;
  }
  try {
    conn=await db.getConnection();
    locked=await origin.acquireCor(conn);
    if(!locked){await release();return res.status(503).json({
      ok:false,code:'INS_FL_SYNC_ALTA_BLOQUEADA',
      message:'Sincronizacion temporalmente ocupada; el lote no se proceso.'
    });}
    const conflicting=await conflictsCor(conn,rows);
    if(conflicting.length){await release();return res.status(409).json({
      ok:false,code:'INS_FL_SYNC_ALTA_HUMANA_PROTEGIDA',
      message:'El lote contiene equipos creados manualmente en Administracion. No se proceso ninguna fila: separar y conciliar los equipos en conflicto.',
      rejected:conflicting.length,
      conflicts:conflicting.slice(0,20).map(row=>({
        id_ins_fl:row.id_ins_fl,id_proyecto:row.id_proyecto,
        referencia_sitio:row.referencia_sitio
      }))
    });}
    // Caso extremo: el cliente puede cerrar HTTP antes del COMMIT de GAS.
    // No liberar por `close` prematuro. El wrapper del controlador liberara
    // al concluir su promesa, aun cuando la respuesta nunca llegue a finish.
    req.bltnowInsFlGuardReleaseCor=release;
    res.once('finish',()=>{void release().catch(error=>logger.error('[InsFl sync] Liberacion de lock fallo.',error));});
    res.once('close',()=>{
      if(res.writableFinished) void release().catch(error=>logger.error('[InsFl sync] Liberacion al cerrar fallo.',error));
    });
    return next();
  } catch(error) {
    try {await release();}catch(releaseError){logger.error('[InsFl sync] Lock no liberado.',releaseError);}
    return res.status(503).json({
      ok:false,code:'INS_FL_SYNC_PREFLIGHT_NO_DISPONIBLE',
      message:'No se pudo confirmar la seguridad del lote de sincronizacion; no se proceso.'
    });
  }
}

module.exports = Object.freeze({validInputCor,conflictsCor,protectManualAltasCor});

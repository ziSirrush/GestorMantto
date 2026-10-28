'use strict';
// BLT NOW | Experimental NS | F6 | Huella ligera por modulo y periodo solicitado.
// Las revisiones NUNCA recorren los 53k tickets historicos.
const crypto = require('node:crypto');
const db = require('../../config/db');
const scope = require('./experimental-ns.scope');
const periods = require('./experimental-ns-periodos');

const REVISION_TABLES = Object.freeze(['ns_portafolio_pruebas','ns_tickets_pruebas']);

function moduleFromRequest(req) {
  // Las rutas de revisión Live se fijan en backend con guards individuales.
  // Valor por defecto solo para los tests unitarios que invocan el repositorio directamente.
  const path=String(req?.path||req?.originalUrl||'');
  if (/\/live\/proyectos-mantenimiento\/revision(?:\?|$)/.test(path))return 'proyectos-mantenimiento';
  if (/\/live\/equipos-criticos\/revision(?:\?|$)/.test(path))return 'equipos-criticos';
  return 'resumen-dia';
}

function revisionWindow(req) {
  const moduleName=moduleFromRequest(req);
  if (moduleName==='resumen-dia')return periods.dayWindow(periods.requestedDate(req));
  if (moduleName==='proyectos-mantenimiento') {
    return periods.historicalWindow(undefined,[periods.lookbackDays(req?.query?.dias_criticos,35)]);
  }
  const fallback=Number(req?.user?.criticos_periodo);
  const days=Number.isSafeInteger(fallback)&&fallback>=1&&fallback<=3650?fallback:35;
  return periods.historicalWindow(undefined,[
    periods.lookbackDays(req?.query?.dias,days),
    periods.lookbackDays(req?.query?.dias_proyectos,days)
  ]);
}

function queries(req) {
  scope.assertScope(req);
  const p = scope.portafolioScope(req);
  const t = scope.ticketsScope(req);
  const window=revisionWindow(req);
  const portafolio = `SELECT COUNT(*) AS total, COALESCE(MAX(p.id_portafolio),0) AS max_id,
      COALESCE(MAX(UNIX_TIMESTAMP(p.updated_at)),0) AS ultima,
      COALESCE(SUM(UNIX_TIMESTAMP(p.updated_at)),0) AS suma
    FROM ns_portafolio_pruebas p WHERE (${p.sql}) AND p.estado_registro = 1`;
  const tickets = `SELECT COUNT(*) AS total, COALESCE(MAX(t.id),0) AS max_id,
      COALESCE(MAX(UNIX_TIMESTAMP(t.actualizado_en)),0) AS ultima,
      COALESCE(SUM(UNIX_TIMESTAMP(t.actualizado_en)),0) AS suma
    FROM ns_tickets_pruebas t
    WHERE t.fecha_reporte >= ? AND t.fecha_reporte < ? AND (${t.sql})`;
  scope.assertNoProductionTables(portafolio);
  scope.assertNoProductionTables(tickets);
  return {portafolio, tickets, pParams:p.params,
    tParams:[window.inicio,window.fin,...t.params]};
}

async function revision(req) {
  const q = queries(req);
  // Secuencial para respetar el limite de conexiones del backend Azure.
  const [pRows] = await db.query(q.portafolio,q.pParams);
  const [tRows] = await db.query(q.tickets,q.tParams);
  if (!Array.isArray(pRows)||pRows.length!==1||!Array.isArray(tRows)||tRows.length!==1) {
    const err = new Error('No fue posible leer el estado de las tablas NS.');
    err.statusCode=503;err.code='EXPERIMENTAL_NS_LIVE_REVISION_UNAVAILABLE';throw err;
  }
  // Huella opaca; no devuelve IDs, filas o marcas de tiempo al cliente.
  const fingerprint = [pRows[0],tRows[0]].flatMap(row =>
    ['total','max_id','ultima','suma'].map(key => String(row[key] ?? '0'))).join('|');
  return crypto.createHash('sha256').update(fingerprint).digest('hex');
}
module.exports = { REVISION_TABLES,queries,revision,revisionWindow,moduleFromRequest };

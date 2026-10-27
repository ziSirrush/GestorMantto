'use strict';
// BLT NOW | EXPERIMENTAL NS | F6 | Metadatos de revision SOLO de las tablas NS.
// No introduce tablas, indices, DML ni dependencia con el motor de sync global.
const crypto = require('node:crypto');
const db = require('../../config/db');
const scope = require('./experimental-ns.scope');

const REVISION_TABLES = Object.freeze(['ns_portafolio_pruebas','ns_tickets_pruebas']);

function queries(req) {
  scope.assertScope(req);
  const p = scope.portafolioScope(req);
  const t = scope.ticketsScope(req);
  const portafolio = `SELECT COUNT(*) AS total, COALESCE(MAX(p.id_portafolio),0) AS max_id,
      COALESCE(MAX(UNIX_TIMESTAMP(p.updated_at)),0) AS ultima,
      COALESCE(SUM(UNIX_TIMESTAMP(p.updated_at)),0) AS suma
    FROM ns_portafolio_pruebas p WHERE (${p.sql}) AND p.estado_registro = 1`;
  const tickets = `SELECT COUNT(*) AS total, COALESCE(MAX(t.id),0) AS max_id,
      COALESCE(MAX(UNIX_TIMESTAMP(t.actualizado_en)),0) AS ultima,
      COALESCE(SUM(UNIX_TIMESTAMP(t.actualizado_en)),0) AS suma
    FROM ns_tickets_pruebas t WHERE (${t.sql})`;
  scope.assertNoProductionTables(portafolio);
  scope.assertNoProductionTables(tickets);
  return {portafolio, tickets, pParams:p.params,tParams:t.params};
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
  // Huella opaca, no devuelve ids, territorios, filas ni marcas de tiempo al cliente.
  // Los metadatos MAX/SUM/COUNT son aproximacion: el cliente fuerza revalidacion
  // periodica para cubrir actualizaciones dentro del mismo segundo.
  const fingerprint = [pRows[0],tRows[0]].flatMap(row =>
    ['total','max_id','ultima','suma'].map(key => String(row[key] ?? '0'))).join('|');
  return crypto.createHash('sha256').update(fingerprint).digest('hex');
}
module.exports = { REVISION_TABLES,queries,revision };

'use strict';

// BLT NOW | EXPERIMENTAL_NS_F4 | Snapshot de calendario requerido, SOLO NS.
const db = require('../../config/db');
const base = require('./experimental-ns.repository');
const scope = require('./experimental-ns.scope');
const periods = require('./experimental-ns-periodos');

const MAX_EQUIPMENT = 50000;
const MAX_TICKETS = 50000;
const COLUMNS = Object.freeze({
  ns_portafolio_pruebas: Object.freeze([
    'id_portafolio', 'id_proyecto_cobranza', 'numero_equipo', 'proyecto', 'ciudad',
    'zona_id', 'zona_operativa', 'identificacion_sitio', 'supervisor_zona',
    'superintendente', 'estatus_servicio', 'inactivo', 'estado_registro'
  ]),
  ns_tickets_pruebas: Object.freeze([
    'id', 'ticket', 'codigo_equipo', 'proyecto', 'proyecto_padre', 'fecha_reporte',
    'estado_ticket', 'estado', 'zona', 'descripcion', 'referencia_en_zona_operativa',
    'responsabilidad', 'estatus_equipo_final', 'causa', 'causa_falla',
    'tiempo_llegada', 'tiempo_solucion', 'ticket_excede', 'custeventblt_mot_det'
  ])
});

function failUnavailable(code, message, details) {
  const e = new Error(message);
  e.code = code;
  e.statusCode = 503;
  if (details) e.details = details;
  return e;
}

async function requireCriticalSchema() {
  await base.requireSchema();
  const [rows] = await db.query(`
    SELECT TABLE_NAME, COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME IN ('ns_portafolio_pruebas','ns_tickets_pruebas')
  `);
  const existing = new Map(Object.keys(COLUMNS).map(name => [name,new Set()]));
  for (const row of rows || []) {
    if (existing.has(row.TABLE_NAME)) existing.get(row.TABLE_NAME).add(row.COLUMN_NAME);
  }
  const missing = {};
  for (const [table, columns] of Object.entries(COLUMNS)) {
    const absent = columns.filter(col => !existing.get(table).has(col));
    if (absent.length) missing[table] = absent;
  }
  if (Object.keys(missing).length) {
    throw failUnavailable('EXPERIMENTAL_NS_CRITICAL_SCHEMA_INCOMPLETE',
      'Experimental NS requiere columnas adicionales del modulo Equipos Criticos.', missing);
  }
}

function dayCriteria(req) {
  // Misma fuente de preferencias usada por el servicio de Criticos.
  // Solo se amplia la ventana si se solicita expresamente un periodo mayor.
  const rawDefault=Number(req?.user?.criticos_periodo);
  const userDays=Number.isSafeInteger(rawDefault)&&rawDefault>=1&&rawDefault<=3650?rawDefault:35;
  return [periods.lookbackDays(req?.query?.dias,userDays),
    periods.lookbackDays(req?.query?.dias_proyectos,userDays)];
}

function queryStatements(req) {
  const pScope = scope.portafolioScope(req);
  const tScope = scope.ticketsScope(req);
  const window=periods.historicalWindow(undefined,dayCriteria(req));
  const pSql = `
    SELECT p.id_portafolio,p.id_proyecto_cobranza,p.numero_equipo,p.proyecto,
      p.ciudad,p.zona_id,p.zona_operativa,p.identificacion_sitio,
      p.supervisor_zona,p.superintendente,p.estatus_servicio,p.inactivo,p.estado_registro
    FROM ns_portafolio_pruebas p
    WHERE (${pScope.sql}) AND p.estado_registro = 1
    ORDER BY p.id_portafolio DESC LIMIT ?`;
  const tSql = `
    SELECT t.id,t.ticket,t.codigo_equipo,t.proyecto,t.proyecto_padre,
      DATE_FORMAT(t.fecha_reporte,'%Y-%m-%d') AS fecha_dia,
      DATE_FORMAT(t.fecha_reporte,'%Y-%m-%d %H:%i:%s') AS fecha_reporte,
      t.estado_ticket,t.estado,t.zona,t.descripcion,t.referencia_en_zona_operativa,
      t.responsabilidad,t.estatus_equipo_final,t.causa,t.causa_falla,
      t.tiempo_llegada,t.tiempo_solucion,t.ticket_excede,t.custeventblt_mot_det
    FROM ns_tickets_pruebas t
    WHERE t.fecha_reporte >= ? AND t.fecha_reporte < ? AND (${tScope.sql})
    ORDER BY t.id DESC LIMIT ?`;
  scope.assertNoProductionTables(pSql);
  scope.assertNoProductionTables(tSql);
  return {
    pSql, tSql,
    pParams: [...pScope.params, MAX_EQUIPMENT + 1],
    tParams: [window.inicio,window.fin,...tScope.params, MAX_TICKETS + 1],
    window
  };
}

async function readSnapshot(req) {
  scope.assertScope(req);
  await requireCriticalSchema();
  const {pSql,tSql,pParams,tParams} = queryStatements(req);
  const [pRows] = await db.query(pSql, pParams);
  if (!Array.isArray(pRows)||pRows.length > MAX_EQUIPMENT) throw failUnavailable('EXPERIMENTAL_NS_EQUIPMENT_LIMIT',
    'La muestra NS excede el limite del piloto (50000 equipos). No se genera un resultado parcial.');
  const [tRows] = await db.query(tSql, tParams);
  if (!Array.isArray(tRows)||tRows.length > MAX_TICKETS) throw failUnavailable('EXPERIMENTAL_NS_TICKETS_LIMIT',
    'El periodo solicitado excede el limite seguro de 50000 tickets. No se genera criticidad parcial.');
  return { portafolio: pRows, tickets: tRows };
}

module.exports = { COLUMNS, MAX_EQUIPMENT, MAX_TICKETS, queryStatements, requireCriticalSchema, readSnapshot };

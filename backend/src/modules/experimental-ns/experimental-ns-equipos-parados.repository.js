'use strict';

// BLT NOW | 2026-11-10 | Experimental NS | Equipos Parados V001
// Solo lectura sobre ns_tickets_pruebas + ns_portafolio_pruebas.
const db = require('../../config/db');
const base = require('./experimental-ns.repository');
const scope = require('./experimental-ns.scope');

const MAX_ROWS = 10000;
const REQUIRED_COLUMNS = Object.freeze({
  ns_tickets_pruebas: Object.freeze([
    'id','ticket','id_interno','estado_ticket','codigo_equipo','proyecto','proyecto_padre',
    'zona','descripcion','fecha_reporte','fecha_cierre','estatus_equipo_ir','estatus_equipo_final',
    'responsabilidad','prioridad','tipo_equipo','referencia_en_zona_operativa','custeventblt_mot_det'
  ]),
  ns_portafolio_pruebas: Object.freeze([
    'numero_equipo','proyecto','identificacion_sitio','zona_operativa','superintendente',
    'estatus_servicio','inactivo','estado_registro','prioridad','producto','marca'
  ])
});

function unavailable(code, message, details) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = 503;
  if (details) error.details = details;
  return error;
}

async function requireSchema() {
  await base.requireSchema();
  const [rows] = await db.query([
    'SELECT TABLE_NAME, COLUMN_NAME',
    'FROM INFORMATION_SCHEMA.COLUMNS',
    "WHERE TABLE_SCHEMA = DATABASE()",
    "AND TABLE_NAME IN ('ns_tickets_pruebas','ns_portafolio_pruebas')"
  ].join(' '));
  const found = new Map(Object.keys(REQUIRED_COLUMNS).map((name) => [name, new Set()]));
  for (const row of rows || []) {
    const set = found.get(row.TABLE_NAME);
    if (set) set.add(row.COLUMN_NAME);
  }
  const missing = {};
  for (const [table, columns] of Object.entries(REQUIRED_COLUMNS)) {
    const absent = columns.filter((column) => !found.get(table).has(column));
    if (absent.length) missing[table] = absent;
  }
  if (Object.keys(missing).length) {
    throw unavailable('EXPERIMENTAL_NS_STOPPED_SCHEMA_INCOMPLETE',
      'Faltan columnas requeridas para Equipos Parados Experimental NS.', missing);
  }
}

function queryStatement(req) {
  const tScope = scope.ticketsScope(req);
  const pScope = scope.portafolioScope(req);
  const sql = [
    'SELECT',
    't.id,t.ticket,t.id_interno,',
    "COALESCE(NULLIF(TRIM(t.proyecto),''),NULLIF(TRIM(t.proyecto_padre),''),p.proyecto) AS proyecto,",
    "COALESCE(NULLIF(TRIM(p.zona_operativa),''),NULLIF(TRIM(t.zona),'')) AS zona,",
    't.codigo_equipo,',
    "COALESCE(NULLIF(TRIM(t.referencia_en_zona_operativa),''),NULLIF(TRIM(p.identificacion_sitio),'')) AS referencia,",
    "COALESCE(NULLIF(TRIM(p.prioridad),''),NULLIF(TRIM(t.prioridad),'')) AS prioridad,",
    't.responsabilidad,t.descripcion,t.custeventblt_mot_det,',
    "DATE_FORMAT(t.fecha_reporte,'%Y-%m-%d %H:%i:%s') AS fecha_reporte,",
    "COALESCE(NULLIF(TRIM(p.superintendente),''),'Sin asignar') AS superintendente,",
    "COALESCE(NULLIF(TRIM(t.tipo_equipo),''),NULLIF(TRIM(p.producto),'')) AS tipo_equipo,",
    'p.marca,p.estatus_servicio,p.inactivo',
    'FROM ns_tickets_pruebas t',
    'INNER JOIN ns_portafolio_pruebas p ON p.estado_registro = 1 AND TRIM(p.numero_equipo)=TRIM(t.codigo_equipo)',
    'WHERE (' + tScope.sql + ') AND (' + pScope.sql + ')',
    'AND t.fecha_reporte IS NOT NULL',
    'AND t.fecha_cierre IS NULL',
    "AND UPPER(TRIM(COALESCE(t.estado_ticket,''))) NOT LIKE '%CERRAD%'",
    "AND (UPPER(TRIM(COALESCE(t.estatus_equipo_final,''))) LIKE '%NO%FUNCION%'",
    " OR UPPER(TRIM(COALESCE(t.estatus_equipo_ir,''))) LIKE '%NO%FUNCION%'",
    " OR UPPER(TRIM(COALESCE(t.estatus_equipo_ir,''))) = 'FUERA DE SERVICIO')",
    "AND (p.inactivo IS NULL OR TRIM(p.inactivo)='' OR UPPER(TRIM(p.inactivo)) IN ('0','NO','FALSE','ACTIVO'))",
    "AND UPPER(TRIM(COALESCE(p.estatus_servicio,''))) = 'EN SERVICIO'",
    'ORDER BY t.fecha_reporte ASC,t.id ASC',
    'LIMIT ?'
  ].join(' ');
  scope.assertNoProductionTables(sql);
  return { sql, params: [...tScope.params, ...pScope.params, MAX_ROWS + 1] };
}

async function listStopped(req) {
  scope.assertScope(req);
  await requireSchema();
  const query = queryStatement(req);
  const [rows] = await db.query(query.sql, query.params);
  if (!Array.isArray(rows) || rows.length > MAX_ROWS) {
    throw unavailable('EXPERIMENTAL_NS_STOPPED_LIMIT',
      'Equipos Parados supera el limite seguro de 10,000 registros; no se entrega resultado parcial.');
  }
  return rows;
}

module.exports = { MAX_ROWS, REQUIRED_COLUMNS, requireSchema, queryStatement, listStopped };
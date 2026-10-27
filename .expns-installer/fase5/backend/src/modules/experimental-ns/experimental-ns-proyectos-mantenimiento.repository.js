'use strict';

// BLT NOW | EXPERIMENTAL_NS_F5 | Las unicas tablas operativas son las dos NS.
// Permisos/alcance se resuelven externamente por los guards oficiales F2.
const db = require('../../config/db');
const base = require('./experimental-ns.repository');
const scope = require('./experimental-ns.scope');

const MAX_EQUIPMENT = 50000;
const MAX_TICKETS = 50000;
const SELECT_COLUMNS = Object.freeze({
  ns_portafolio_pruebas: Object.freeze([
    'id_portafolio','id_proyecto_cobranza','proyecto','proyecto_cc_x_port','numero_equipo',
    'identificacion_sitio','ciudad','estado','zona_id','zona_operativa','supervisor_zona',
    'superintendente','categoria','tipo_poliza','producto','estatus_servicio','inactivo',
    'estado_registro'
  ]),
  ns_tickets_pruebas: Object.freeze([
    'id','ticket','codigo_equipo','proyecto','proyecto_padre','estado_ticket',
    'fecha_reporte','fecha_cierre','estatus_equipo_final','responsabilidad','causa',
    'causa_falla','custeventblt_mot_det'
  ])
});

function unavailable(code, message, details) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = 503;
  if (details) error.details = details;
  return error;
}

async function requireProjectSchema() {
  await base.requireSchema();
  const [rows] = await db.query(`
    SELECT TABLE_NAME, COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME IN ('ns_portafolio_pruebas','ns_tickets_pruebas')
  `);
  const found = new Map(Object.keys(SELECT_COLUMNS).map(name => [name,new Set()]));
  for (const row of rows || []) {
    const set = found.get(row.TABLE_NAME);
    if (set) set.add(row.COLUMN_NAME);
  }
  const missing = {};
  for (const [table, columns] of Object.entries(SELECT_COLUMNS)) {
    const absent = columns.filter(col => !found.get(table).has(col));
    if (absent.length) missing[table] = absent;
  }
  if (Object.keys(missing).length) {
    throw unavailable('EXPERIMENTAL_NS_PROJECT_SCHEMA_INCOMPLETE',
      'No es posible consultar Proyectos de Mantenimiento: faltan columnas experimentales.',missing);
  }
}

function queryStatements(req) {
  const pScope = scope.portafolioScope(req);
  const tScope = scope.ticketsScope(req);
  // Lista fija y comprobada contra INFORMATION_SCHEMA: ningun identificador procede del usuario.
  const pColumns = SELECT_COLUMNS.ns_portafolio_pruebas.map(col => `p.\`${col}\``).join(', ');
  const tColumns = SELECT_COLUMNS.ns_tickets_pruebas.map(col =>
    col === 'fecha_reporte' || col === 'fecha_cierre'
      ? `DATE_FORMAT(t.\`${col}\`, '%Y-%m-%d %H:%i:%s') AS \`${col}\``
      : `t.\`${col}\``
  ).join(', ');
  const pSql = `SELECT ${pColumns} FROM ns_portafolio_pruebas p
    WHERE (${pScope.sql}) AND p.estado_registro = 1 ORDER BY p.id_portafolio DESC LIMIT ?`;
  const tSql = `SELECT ${tColumns} FROM ns_tickets_pruebas t
    WHERE (${tScope.sql}) AND t.fecha_reporte IS NOT NULL ORDER BY t.id DESC LIMIT ?`;
  scope.assertNoProductionTables(pSql);
  scope.assertNoProductionTables(tSql);
  return { pSql,tSql,pParams:[...pScope.params,MAX_EQUIPMENT + 1],
    tParams:[...tScope.params,MAX_TICKETS + 1] };
}

async function readSnapshot(req) {
  scope.assertScope(req);
  await requireProjectSchema();
  const query = queryStatements(req);
  // Secuencial para respetar el cap de conexiones compartidas de Aiven/Azure.
  const [portafolio] = await db.query(query.pSql,query.pParams);
  if (!Array.isArray(portafolio) || portafolio.length > MAX_EQUIPMENT) {
    throw unavailable('EXPERIMENTAL_NS_PROJECT_EQUIPMENT_LIMIT',
      'La muestra NS excede 50,000 equipos o devolvio un formato invalido. No se calculan parciales.');
  }
  const [tickets] = await db.query(query.tSql,query.tParams);
  if (!Array.isArray(tickets) || tickets.length > MAX_TICKETS) {
    throw unavailable('EXPERIMENTAL_NS_PROJECT_TICKETS_LIMIT',
      'La muestra NS excede 50,000 tickets o devolvio un formato invalido. No se calculan parciales.');
  }
  return { portafolio, tickets };
}

module.exports = { MAX_EQUIPMENT, MAX_TICKETS, SELECT_COLUMNS, requireProjectSchema, queryStatements, readSnapshot };

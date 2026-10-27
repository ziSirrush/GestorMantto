'use strict';

// [BLT NOW | 2026-10-26 | EXPERIMENTAL_NS_F2_REPOSITORY_V001]
// Consultas exclusivamente de lectura; tablas fijas sin parametros de nombre.
const db = require('../../config/db');
const scopes = require('./experimental-ns.scope');

const REQUIRED_COLUMNS = Object.freeze({
  ns_portafolio_pruebas: Object.freeze([
    'id_portafolio', 'numero_equipo', 'id_equipo_ns', 'proyecto',
    'identificacion_sitio', 'estado', 'ciudad', 'zona_id', 'zona_operativa',
    'prioridad', 'estatus_servicio', 'categoria', 'inactivo', 'estado_registro',
    'updated_at'
  ]),
  ns_tickets_pruebas: Object.freeze([
    'id', 'ticket', 'id_interno', 'estado_ticket', 'codigo_equipo',
    'proyecto', 'proyecto_padre', 'zona', 'descripcion', 'fecha_reporte',
    'fecha_llegada', 'fecha_cierre', 'estatus_equipo_ir', 'estatus_equipo_final',
    'responsabilidad', 'tiempo_llegada', 'tiempo_solucion', 'actualizado_en',
    'custeventblt_mot_det'
  ])
});

const SELECT_PORTAFOLIO = Object.freeze(REQUIRED_COLUMNS.ns_portafolio_pruebas.map(col => 'p.`' + col + '`'));
const SELECT_TICKETS = Object.freeze(REQUIRED_COLUMNS.ns_tickets_pruebas.map(col => 't.`' + col + '`'));

function schemaError(details) {
  const error = new Error('Estructura experimental incompleta. Verifica las tablas y columnas requeridas.');
  error.code = 'EXPERIMENTAL_NS_SCHEMA_INCOMPLETE';
  error.statusCode = 503;
  error.details = details;
  return error;
}

async function getSchemaStatus() {
  const [records] = await db.query(`
    SELECT TABLE_NAME, COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME IN ('ns_portafolio_pruebas', 'ns_tickets_pruebas')
  `);
  const found = new Map(Object.keys(REQUIRED_COLUMNS).map(table => [table, new Set()]));
  for (const row of records || []) {
    const columns = found.get(row.TABLE_NAME);
    if (columns) columns.add(row.COLUMN_NAME);
  }
  const tables = {};
  for (const [table, required] of Object.entries(REQUIRED_COLUMNS)) {
    const columns = found.get(table);
    const missing = required.filter(column => !columns.has(column));
    tables[table] = {
      disponible: columns.size > 0,
      columnasRequeridas: required.length,
      faltantes: missing
    };
  }
  return { listas: Object.values(tables).every(table => table.disponible && table.faltantes.length === 0), tablas: tables };
}

async function requireSchema() {
  const status = await getSchemaStatus();
  if (!status.listas) throw schemaError(status.tablas);
}

function whereSearch(input, fields) {
  if (!input.buscar) return { sql: '', params: [] };
  const pattern = '%' + input.buscar + '%';
  return {
    sql: ' AND (' + fields.map(field => field + ' LIKE ?').join(' OR ') + ')',
    params: fields.map(() => pattern)
  };
}

async function listPortafolio(req, input) {
  const scope = scopes.portafolioScope(req);
  await requireSchema();
  const search = whereSearch(input, ['p.numero_equipo', 'p.proyecto', 'p.identificacion_sitio']);
  const clauses = [];
  const params = [...scope.params];
  if (input.equipo) { clauses.push('p.numero_equipo = ?'); params.push(input.equipo); }
  if (input.proyecto) { clauses.push('p.proyecto = ?'); params.push(input.proyecto); }
  const where = `WHERE (${scope.sql}) AND p.estado_registro = 1` +
    (clauses.length ? ' AND ' + clauses.join(' AND ') : '') + search.sql;
  const allParams = [...params, ...search.params];
  const from = `FROM ns_portafolio_pruebas p ${where}`;
  scopes.assertNoProductionTables(from);
  const [countRows] = await db.query(`SELECT COUNT(*) AS total ${from}`, allParams);
  const [rows] = await db.query(
    `SELECT ${SELECT_PORTAFOLIO.join(', ')} ${from} ORDER BY p.id_portafolio DESC LIMIT ? OFFSET ?`,
    [...allParams, input.limite, input.desde]
  );
  return { rows, total: Number(countRows?.[0]?.total || 0) };
}

async function listTickets(req, input) {
  const scope = scopes.ticketsScope(req);
  await requireSchema();
  const search = whereSearch(input, ['t.ticket', 't.codigo_equipo', 't.proyecto']);
  const clauses = [];
  const params = [...scope.params];
  if (input.equipo) { clauses.push('t.codigo_equipo = ?'); params.push(input.equipo); }
  if (input.proyecto) { clauses.push('t.proyecto = ?'); params.push(input.proyecto); }
  const where = `WHERE (${scope.sql})` +
    (clauses.length ? ' AND ' + clauses.join(' AND ') : '') + search.sql;
  const allParams = [...params, ...search.params];
  const from = `FROM ns_tickets_pruebas t ${where}`;
  scopes.assertNoProductionTables(from);
  const [countRows] = await db.query(`SELECT COUNT(*) AS total ${from}`, allParams);
  const [rows] = await db.query(
    `SELECT ${SELECT_TICKETS.join(', ')} ${from} ORDER BY t.id DESC LIMIT ? OFFSET ?`,
    [...allParams, input.limite, input.desde]
  );
  return { rows, total: Number(countRows?.[0]?.total || 0) };
}

module.exports = {
  REQUIRED_COLUMNS,
  getSchemaStatus,
  requireSchema,
  listPortafolio,
  listTickets
};

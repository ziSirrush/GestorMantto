'use strict';

// [ChatGPT | 2026-10-15 | BLT NOW | CX VISITAS FASE 2 V001]
// Unica fuente operativa: Aiven MySQL. Tablas/columnas de Fase 1 V001.
// Ninguna tabla ajena se modifica. Toda consulta incorpora baja logica y scope.

const db = require('../../config/db');

const VISIT_COLUMNS_COR = `
  v.id_visita, v.id_usuario_creador, v.id_usuario_responsable,
  v.id_usuario_ultima_modificacion, v.titulo, v.objetivo,
  v.resultado, v.observaciones, v.referencia_origen, v.referencia_id,
  v.proyecto_nombre, v.cliente_nombre, v.ubicacion,
  v.fecha_programada_utc, v.fecha_realizada_utc, v.estado,
  v.inactivo, v.created_at, v.updated_at`;

// La lista es cerrada: no se construyen identificadores SQL desde la peticion.
const EDITABLE_COLUMNS_COR = Object.freeze(new Set([
  'titulo', 'objetivo', 'observaciones', 'referencia_origen',
  'referencia_id', 'proyecto_nombre', 'cliente_nombre', 'ubicacion',
  'fecha_programada_utc', 'id_usuario_responsable'
]));

function scopeSql_cor(scope, alias = 'v') {
  if (scope?.full === true) return { sql: '', params: [] };
  if (!scope || !Array.isArray(scope.users)) {
    throw new Error('CX_VISITAS_SCOPE_NOT_VALIDATED');
  }
  if (!scope.users.length) return { sql: ' AND 1 = 0', params: [] };
  const marks = scope.users.map(() => '?').join(', ');
  return {
    sql: ` AND (${alias}.id_usuario_creador IN (${marks}) OR ${alias}.id_usuario_responsable IN (${marks}))`,
    params: [...scope.users, ...scope.users]
  };
}

function listSql_cor(filters, scope) {
  const conditions = ['v.inactivo = 0'];
  const params = [];

  if (filters.q) {
    conditions.push(`INSTR(LOWER(CONCAT_WS(' ', v.titulo, v.proyecto_nombre, v.cliente_nombre, v.referencia_id)), LOWER(?)) > 0`);
    params.push(filters.q);
  }
  if (filters.estado) {
    conditions.push('v.estado = ?');
    params.push(filters.estado);
  }
  if (filters.id_usuario_responsable) {
    conditions.push('v.id_usuario_responsable = ?');
    params.push(filters.id_usuario_responsable);
  }
  if (filters.desde) {
    conditions.push('v.fecha_programada_utc >= ?');
    params.push(filters.desde);
  }
  if (filters.hasta_fin) {
    conditions.push('v.fecha_programada_utc <= ?');
    params.push(filters.hasta_fin);
  }
  const scoped = scopeSql_cor(scope);
  return {
    sql: ` WHERE ${conditions.join(' AND ')}${scoped.sql}`,
    params: [...params, ...scoped.params]
  };
}

async function getConnection_cor() {
  return db.getConnection();
}

async function list_cor(connection, filters, scope) {
  const where = listSql_cor(filters, scope);
  const [count] = await connection.query(
    `SELECT COUNT(*) AS total FROM cx_visitas v${where.sql}`, where.params
  );
  const [rows] = await connection.query(
    `SELECT ${VISIT_COLUMNS_COR} FROM cx_visitas v${where.sql}
     ORDER BY v.fecha_programada_utc DESC, v.id_visita DESC
     LIMIT ? OFFSET ?`,
    [...where.params, filters.page_size, filters.offset]
  );
  return { total: Number(count[0]?.total || 0), rows };
}

async function getById_cor(connection, id, scope, options = {}) {
  const scoped = scopeSql_cor(scope);
  const [rows] = await connection.query(
    `SELECT ${VISIT_COLUMNS_COR} FROM cx_visitas v
     WHERE v.id_visita = ?${options.includeInactive ? '' : ' AND v.inactivo = 0'}${scoped.sql}${options.forUpdate ? ' FOR UPDATE' : ''}`,
    [id, ...scoped.params]
  );
  return rows[0] || null;
}

async function listHistory_cor(connection, id, pagination) {
  const [counts] = await connection.query(
    'SELECT COUNT(*) AS total FROM cx_visitas_historial WHERE id_visita = ?', [id]
  );
  const [rows] = await connection.query(
    `SELECT id_evento, id_visita, id_actor_usuario, accion, detalle, created_at
       FROM cx_visitas_historial WHERE id_visita = ?
      ORDER BY id_evento DESC LIMIT ? OFFSET ?`,
    [id, pagination.page_size, pagination.offset]
  );
  return { total: Number(counts[0]?.total || 0), rows };
}

async function getActiveAssignee_cor(connection, id) {
  const [rows] = await connection.query(
    'SELECT id_SB, empresa FROM usuarios WHERE id_SB = ? AND estado = 1 LIMIT 1',
    [id]
  );
  return rows[0] || null;
}

async function insert_cor(connection, data, actorId) {
  const [result] = await connection.query(
    `INSERT INTO cx_visitas (
       id_usuario_creador, id_usuario_responsable,
       id_usuario_ultima_modificacion, titulo, objetivo, observaciones,
       referencia_origen, referencia_id, proyecto_nombre, cliente_nombre,
       ubicacion, fecha_programada_utc, estado, inactivo
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'BORRADOR', 0)`,
    [
      actorId, data.id_usuario_responsable, actorId,
      data.titulo, data.objetivo, data.observaciones,
      data.referencia_origen, data.referencia_id,
      data.proyecto_nombre, data.cliente_nombre, data.ubicacion,
      data.fecha_programada_utc
    ]
  );
  return Number(result.insertId);
}

async function update_cor(connection, id, changes, actorId) {
  const keys = Object.keys(changes);
  if (!keys.length || keys.some(key => !EDITABLE_COLUMNS_COR.has(key))) {
    throw new Error('CX_VISITAS_INVALID_UPDATE_FIELDS');
  }
  const assignments = keys.map(key => `\`${key}\` = ?`).join(', ');
  const [result] = await connection.query(
    `UPDATE cx_visitas SET ${assignments},
       id_usuario_ultima_modificacion = ?, updated_at = UTC_TIMESTAMP(3)
     WHERE id_visita = ? AND inactivo = 0`,
    [...keys.map(key => changes[key]), actorId, id]
  );
  return Number(result.affectedRows || 0);
}

async function deactivate_cor(connection, id, actorId) {
  const [result] = await connection.query(
    `UPDATE cx_visitas
        SET inactivo = 1, id_usuario_ultima_modificacion = ?,
            updated_at = UTC_TIMESTAMP(3)
      WHERE id_visita = ? AND inactivo = 0`,
    [actorId, id]
  );
  return Number(result.affectedRows || 0);
}

async function insertHistory_cor(connection, id, actorId, action, details) {
  await connection.query(
    `INSERT INTO cx_visitas_historial (id_visita, id_actor_usuario, accion, detalle)
     VALUES (?, ?, ?, ?)`,
    [id, actorId, action, JSON.stringify(details)]
  );
}

module.exports = Object.freeze({
  getConnection_cor,
  list_cor,
  getById_cor,
  listHistory_cor,
  getActiveAssignee_cor,
  insert_cor,
  update_cor,
  deactivate_cor,
  insertHistory_cor,
  scopeSql_cor
});

'use strict';

const db = require('../../config/db');

const TABLE = 'ventas_cotizaciones_historial';

async function getConnection() {
  return db.getConnection();
}

function buildScopeClause(scope, alias = 'c') {
  if (!scope || scope.mode === 'ALL') return { sql: '', params: [] };
  const ids = Array.isArray(scope.advisorIds)
    ? [...new Set(scope.advisorIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))]
    : [];
  if (!ids.length) return { sql: '1 = 0', params: [] };
  const placeholders = ids.map(() => '?').join(', ');
  return {
    sql: `(${alias}.id_asesor IN (${placeholders}) OR ${alias}.id_admin IN (${placeholders}))`,
    params: [...ids, ...ids]
  };
}

async function create(connection, record) {
  const [result] = await connection.query(
    `INSERT INTO ${TABLE} (
       id_cotizacion,
       estatus_anterior,
       estatus_nuevo,
       motivo,
       comentario,
       campo_origen,
       valor_anterior,
       valor_nuevo,
       id_usuario,
       iniciales_usuario,
       origen_movimiento,
       empresa,
       activo
     )
     SELECT
       c.id_cotizacion,
       ?,
       COALESCE(?, c.estatus_proyecto, 'Sin estatus'),
       ?,
       ?,
       ?,
       ?,
       ?,
       ?,
       u.iniciales,
       ?,
       NULL,
       1
     FROM ventas_cotizaciones_cor c
     LEFT JOIN usuarios u ON u.id_SB = ?
     WHERE c.id_cotizacion = ?
     LIMIT 1`,
    [
      record.estatus_anterior,
      record.estatus_nuevo,
      record.motivo,
      record.comentario,
      record.campo_origen,
      record.valor_anterior,
      record.valor_nuevo,
      record.id_usuario,
      record.origen_movimiento,
      record.id_usuario,
      record.id_cotizacion
    ]
  );

  if (!result.affectedRows) {
    const error = new Error('No fue posible registrar el historial porque la cotización no existe.');
    error.statusCode = 404;
    throw error;
  }

  return result;
}

function historyProjection() {
  return `h.*,
          h.origen_movimiento AS accion,
          h.valor_anterior AS detalle_anterior,
          h.valor_nuevo AS detalle_nuevo,
          NULL AS proxima_fecha,
          u.nombre AS usuario_nombre,
          COALESCE(h.iniciales_usuario, u.iniciales) AS usuario_iniciales,
          c.nombre_proyecto,
          c.cliente,
          c.asesor,
          c.estatus_proyecto AS estatus_actual`;
}

async function listByCotizacion(connection, idCotizacion, options, scope) {
  const scopeClause = buildScopeClause(scope, 'c');
  const clauses = ['h.id_cotizacion = ?', 'h.activo = 1'];
  const params = [idCotizacion];
  if (scopeClause.sql) {
    clauses.push(scopeClause.sql);
    params.push(...scopeClause.params);
  }
  if (options.accion) {
    clauses.push('h.origen_movimiento = ?');
    params.push(options.accion);
  }

  const where = `WHERE ${clauses.join(' AND ')}`;
  const [countRows] = await connection.query(
    `SELECT COUNT(*) AS total
       FROM ${TABLE} h
       INNER JOIN ventas_cotizaciones_cor c ON c.id_cotizacion = h.id_cotizacion
       ${where}`,
    params
  );
  const [rows] = await connection.query(
    `SELECT ${historyProjection()}
       FROM ${TABLE} h
       INNER JOIN ventas_cotizaciones_cor c ON c.id_cotizacion = h.id_cotizacion
       LEFT JOIN usuarios u ON u.id_SB = h.id_usuario
       ${where}
      ORDER BY h.fecha_movimiento DESC, h.id_historial DESC
      LIMIT ? OFFSET ?`,
    [...params, options.pageSize, options.offset]
  );
  return { rows, total: Number(countRows[0]?.total || 0) };
}

async function listGlobal(connection, options, scope) {
  const clauses = ['h.activo = 1'];
  const params = [];
  const scopeClause = buildScopeClause(scope, 'c');
  if (scopeClause.sql) {
    clauses.push(scopeClause.sql);
    params.push(...scopeClause.params);
  }
  if (options.accion) {
    clauses.push('h.origen_movimiento = ?');
    params.push(options.accion);
  }
  if (options.idCotizacion) {
    clauses.push('h.id_cotizacion = ?');
    params.push(options.idCotizacion);
  }
  if (options.desde) {
    clauses.push('h.fecha_movimiento >= ?');
    params.push(options.desde);
  }
  if (options.hasta) {
    clauses.push('h.fecha_movimiento < DATE_ADD(?, INTERVAL 1 DAY)');
    params.push(options.hasta);
  }
  if (options.search) {
    const like = `%${options.search}%`;
    clauses.push(`(
      c.nombre_proyecto LIKE ? OR c.cliente LIKE ? OR c.asesor LIKE ? OR
      h.origen_movimiento LIKE ? OR h.motivo LIKE ? OR h.comentario LIKE ? OR
      CAST(h.id_cotizacion AS CHAR) LIKE ?
    )`);
    params.push(...Array(7).fill(like));
  }
  const where = `WHERE ${clauses.join(' AND ')}`;
  const [countRows] = await connection.query(
    `SELECT COUNT(*) AS total
       FROM ${TABLE} h
       INNER JOIN ventas_cotizaciones_cor c ON c.id_cotizacion = h.id_cotizacion
       ${where}`,
    params
  );
  const [rows] = await connection.query(
    `SELECT ${historyProjection()}
       FROM ${TABLE} h
       INNER JOIN ventas_cotizaciones_cor c ON c.id_cotizacion = h.id_cotizacion
       LEFT JOIN usuarios u ON u.id_SB = h.id_usuario
       ${where}
      ORDER BY h.fecha_movimiento DESC, h.id_historial DESC
      LIMIT ? OFFSET ?`,
    [...params, options.pageSize, options.offset]
  );
  return { rows, total: Number(countRows[0]?.total || 0) };
}

module.exports = { getConnection, create, listByCotizacion, listGlobal };

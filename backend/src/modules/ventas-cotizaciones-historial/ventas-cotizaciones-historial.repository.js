const db = require('../../config/db');

const TABLE = 'ventas_cotizaciones_historial';

async function getConnection() {
  return db.getConnection();
}

function buildScopeClause(scope, alias = 'c') {
  if (!scope || scope.mode === 'ALL') return { sql: '', params: [] };
  const ids = Array.isArray(scope.advisorIds) ? scope.advisorIds.filter(Number.isInteger) : [];
  if (!ids.length) return { sql: '1 = 0', params: [] };
  return { sql: `${alias}.id_asesor IN (${ids.map(() => '?').join(', ')})`, params: ids };
}

async function create(connection, record) {
  const columns = Object.keys(record);
  const values = columns.map((column) => record[column]);
  const [result] = await connection.query(
    `INSERT INTO ${TABLE} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    values
  );
  return result;
}

async function listByCotizacion(connection, idCotizacion, options, scope) {
  const scopeClause = buildScopeClause(scope, 'c');
  const clauses = ['h.id_cotizacion = ?'];
  const params = [idCotizacion];
  if (scopeClause.sql) {
    clauses.push(scopeClause.sql);
    params.push(...scopeClause.params);
  }
  if (options.accion) {
    clauses.push('h.accion = ?');
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
    `SELECT h.*, u.nombre AS usuario_nombre, u.iniciales AS usuario_iniciales,
            c.nombre_proyecto, c.cliente, c.asesor, c.estatus_proyecto AS estatus_actual
       FROM ${TABLE} h
       INNER JOIN ventas_cotizaciones_cor c ON c.id_cotizacion = h.id_cotizacion
       LEFT JOIN usuarios u ON u.id_SB = h.id_usuario
       ${where}
      ORDER BY h.created_at DESC, h.id_historial DESC
      LIMIT ? OFFSET ?`,
    [...params, options.pageSize, options.offset]
  );
  return { rows, total: Number(countRows[0]?.total || 0) };
}

async function listGlobal(connection, options, scope) {
  const clauses = [];
  const params = [];
  const scopeClause = buildScopeClause(scope, 'c');
  if (scopeClause.sql) {
    clauses.push(scopeClause.sql);
    params.push(...scopeClause.params);
  }
  if (options.accion) {
    clauses.push('h.accion = ?');
    params.push(options.accion);
  }
  if (options.idCotizacion) {
    clauses.push('h.id_cotizacion = ?');
    params.push(options.idCotizacion);
  }
  if (options.desde) {
    clauses.push('h.created_at >= ?');
    params.push(options.desde);
  }
  if (options.hasta) {
    clauses.push('h.created_at < DATE_ADD(?, INTERVAL 1 DAY)');
    params.push(options.hasta);
  }
  if (options.search) {
    const like = `%${options.search}%`;
    clauses.push(`(
      c.nombre_proyecto LIKE ? OR c.cliente LIKE ? OR c.asesor LIKE ? OR
      h.accion LIKE ? OR h.motivo LIKE ? OR h.comentario LIKE ? OR
      CAST(h.id_cotizacion AS CHAR) LIKE ?
    )`);
    params.push(...Array(7).fill(like));
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const [countRows] = await connection.query(
    `SELECT COUNT(*) AS total
       FROM ${TABLE} h
       INNER JOIN ventas_cotizaciones_cor c ON c.id_cotizacion = h.id_cotizacion
       ${where}`,
    params
  );
  const [rows] = await connection.query(
    `SELECT h.*, u.nombre AS usuario_nombre, u.iniciales AS usuario_iniciales,
            c.nombre_proyecto, c.cliente, c.asesor, c.estatus_proyecto AS estatus_actual
       FROM ${TABLE} h
       INNER JOIN ventas_cotizaciones_cor c ON c.id_cotizacion = h.id_cotizacion
       LEFT JOIN usuarios u ON u.id_SB = h.id_usuario
       ${where}
      ORDER BY h.created_at DESC, h.id_historial DESC
      LIMIT ? OFFSET ?`,
    [...params, options.pageSize, options.offset]
  );
  return { rows, total: Number(countRows[0]?.total || 0) };
}

module.exports = { getConnection, create, listByCotizacion, listGlobal };

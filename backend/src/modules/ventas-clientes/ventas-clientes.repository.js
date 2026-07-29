const db = require('../../config/db');

const TABLE = 'ventas_clientes';

async function getConnection() {
  return db.getConnection();
}

function buildVisibilityClause(scope, actorId, alias = 'vc') {
  if (!scope || scope.mode === 'ALL') return { sql: '', params: [] };

  const advisorIds = Array.isArray(scope.advisorIds)
    ? scope.advisorIds.filter(Number.isInteger)
    : [];

  const clauses = [];
  const params = [];

  if (Number.isInteger(actorId)) {
    clauses.push(`${alias}.created_by = ?`);
    params.push(actorId);
  }

  if (advisorIds.length) {
    clauses.push(`EXISTS (
      SELECT 1
        FROM ventas_cotizaciones_cor vcc
       WHERE vcc.activo = 1
         AND UPPER(TRIM(vcc.cliente)) = UPPER(TRIM(${alias}.nombre_empresa))
         AND vcc.id_asesor IN (${advisorIds.map(() => '?').join(', ')})
    )`);
    params.push(...advisorIds);
  }

  if (!clauses.length) return { sql: '1 = 0', params: [] };
  return { sql: `(${clauses.join(' OR ')})`, params };
}

function buildWhere(options = {}, scope = null, actorId = null, alias = 'vc') {
  const clauses = [`${alias}.activo = 1`];
  const params = [];

  const search = String(options.search || '').trim();
  if (search) {
    const like = `%${search}%`;
    clauses.push(`(
      ${alias}.nombre_empresa LIKE ? OR
      ${alias}.razon_social LIKE ? OR
      ${alias}.ciudad LIKE ? OR
      ${alias}.estado LIKE ? OR
      ${alias}.ubicacion LIKE ? OR
      ${alias}.nombre_contacto LIKE ? OR
      ${alias}.email LIKE ? OR
      ${alias}.telefono LIKE ? OR
      ${alias}.tipo_cliente LIKE ? OR
      ${alias}.estatus_cliente LIKE ? OR
      ${alias}.proyecto_vendido LIKE ? OR
      ${alias}.iniciales LIKE ? OR
      ${alias}.comentarios LIKE ?
    )`);
    params.push(...Array(13).fill(like));
  }

  const allowedFilters = ['tipo_cliente', 'estatus_cliente', 'ciudad', 'estado', 'iniciales'];
  for (const field of allowedFilters) {
    const value = options.filters?.[field];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      clauses.push(`${alias}.${field} = ?`);
      params.push(String(value).trim());
    }
  }

  const visibility = buildVisibilityClause(scope, actorId, alias);
  if (visibility.sql) {
    clauses.push(visibility.sql);
    params.push(...visibility.params);
  }

  return { sql: `WHERE ${clauses.join(' AND ')}`, params };
}

async function list(connection, options, scope, actorId) {
  const where = buildWhere(options, scope, actorId);
  const allowedSort = new Set([
    'id_cliente', 'nombre_empresa', 'razon_social', 'ciudad', 'estado',
    'tipo_cliente', 'estatus_cliente', 'created_at', 'updated_at'
  ]);
  const sortBy = allowedSort.has(options.sortBy) ? options.sortBy : 'nombre_empresa';
  const direction = options.sortDirection === 'desc' ? 'DESC' : 'ASC';

  const [countRows] = await connection.query(
    `SELECT COUNT(*) AS total FROM ${TABLE} vc ${where.sql}`,
    where.params
  );

  const [rows] = await connection.query(
    `SELECT vc.*
       FROM ${TABLE} vc
       ${where.sql}
      ORDER BY vc.${sortBy} ${direction}, vc.id_cliente ASC
      LIMIT ? OFFSET ?`,
    [...where.params, options.pageSize, options.offset]
  );

  return { rows, total: Number(countRows[0]?.total || 0) };
}

async function getKpis(connection, options, scope, actorId) {
  const where = buildWhere(options, scope, actorId);
  const [rows] = await connection.query(
    `SELECT
       COUNT(*) AS total_clientes,
       SUM(CASE WHEN NULLIF(TRIM(estatus_cliente), '') IS NOT NULL THEN 1 ELSE 0 END) AS con_estatus,
       SUM(CASE WHEN NULLIF(TRIM(proyecto_vendido), '') IS NOT NULL THEN 1 ELSE 0 END) AS con_proyecto_vendido,
       COUNT(DISTINCT NULLIF(TRIM(tipo_cliente), '')) AS tipos_cliente,
       COUNT(DISTINCT NULLIF(TRIM(estado), '')) AS estados
     FROM ${TABLE} vc
     ${where.sql}`,
    where.params
  );
  return rows[0] || {};
}

async function getCatalogos(connection, scope, actorId) {
  const where = buildWhere({}, scope, actorId);
  const fields = ['tipo_cliente', 'estatus_cliente', 'ciudad', 'estado', 'iniciales'];
  const result = {};

  for (const field of fields) {
    const [rows] = await connection.query(
      `SELECT DISTINCT TRIM(vc.${field}) AS valor
         FROM ${TABLE} vc
         ${where.sql}
          AND NULLIF(TRIM(vc.${field}), '') IS NOT NULL
        ORDER BY valor ASC`,
      where.params
    );
    result[field] = rows.map((row) => row.valor);
  }

  return result;
}

async function findById(connection, idCliente, { includeInactive = false, scope = null, actorId = null } = {}) {
  const clauses = ['vc.id_cliente = ?'];
  const params = [idCliente];
  if (!includeInactive) clauses.push('vc.activo = 1');

  const visibility = buildVisibilityClause(scope, actorId, 'vc');
  if (visibility.sql) {
    clauses.push(visibility.sql);
    params.push(...visibility.params);
  }

  const [rows] = await connection.query(
    `SELECT vc.* FROM ${TABLE} vc WHERE ${clauses.join(' AND ')} LIMIT 1`,
    params
  );
  return rows[0] || null;
}

async function findBySyncKey(connection, claveSync) {
  const [rows] = await connection.query(
    `SELECT id_cliente FROM ${TABLE} WHERE clave_sync = ? LIMIT 1`,
    [claveSync]
  );
  return rows[0] || null;
}

async function insert(connection, data) {
  const fields = Object.keys(data);
  const [result] = await connection.query(
    `INSERT INTO ${TABLE} (${fields.join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`,
    fields.map((field) => data[field])
  );
  return result.insertId;
}

async function update(connection, idCliente, data) {
  const fields = Object.keys(data);
  if (!fields.length) return 0;
  const [result] = await connection.query(
    `UPDATE ${TABLE}
        SET ${fields.map((field) => `${field} = ?`).join(', ')}
      WHERE id_cliente = ?`,
    [...fields.map((field) => data[field]), idCliente]
  );
  return result.affectedRows;
}

async function softDelete(connection, idCliente, actorId) {
  const [result] = await connection.query(
    `UPDATE ${TABLE}
        SET activo = 0, updated_by = ?
      WHERE id_cliente = ? AND activo = 1`,
    [actorId, idCliente]
  );
  return result.affectedRows;
}

async function upsertBatch(connection, records) {
  if (!records.length) return { affectedRows: 0 };

  const fields = [
    'clave_sync', 'id_cliente_origen', 'nombre_empresa', 'razon_social', 'ciudad',
    'estado', 'ubicacion', 'nombre_contacto', 'email', 'telefono', 'tipo_cliente',
    'estatus_cliente', 'proyecto_vendido', 'iniciales', 'visualiza', 'comentarios',
    'activo', 'created_by', 'updated_by'
  ];

  const placeholders = records
    .map(() => `(${fields.map(() => '?').join(', ')})`)
    .join(', ');
  const params = records.flatMap((record) => fields.map((field) => record[field]));

  const [result] = await connection.query(
    `INSERT INTO ${TABLE} (${fields.join(', ')})
     VALUES ${placeholders}
     ON DUPLICATE KEY UPDATE
       id_cliente_origen = VALUES(id_cliente_origen),
       nombre_empresa = VALUES(nombre_empresa),
       razon_social = VALUES(razon_social),
       ciudad = VALUES(ciudad),
       estado = VALUES(estado),
       ubicacion = VALUES(ubicacion),
       nombre_contacto = VALUES(nombre_contacto),
       email = VALUES(email),
       telefono = VALUES(telefono),
       tipo_cliente = VALUES(tipo_cliente),
       estatus_cliente = VALUES(estatus_cliente),
       proyecto_vendido = VALUES(proyecto_vendido),
       iniciales = VALUES(iniciales),
       visualiza = VALUES(visualiza),
       comentarios = VALUES(comentarios),
       activo = VALUES(activo),
       updated_by = VALUES(updated_by)`,
    params
  );

  return result;
}

module.exports = {
  getConnection,
  list,
  getKpis,
  getCatalogos,
  findById,
  findBySyncKey,
  insert,
  update,
  softDelete,
  upsertBatch
};

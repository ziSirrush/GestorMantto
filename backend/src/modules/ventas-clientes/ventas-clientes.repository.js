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
        FROM usuarios vu
       WHERE vu.estado = 1
         AND vu.id_SB IN (${advisorIds.map(() => '?').join(', ')})
         AND UPPER(TRIM(vu.iniciales)) = UPPER(TRIM(${alias}.iniciales))
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
    `SELECT vc.*,
            (SELECT MIN(u.id_SB) FROM usuarios u WHERE u.estado=1 AND UPPER(TRIM(u.iniciales))=UPPER(TRIM(vc.iniciales))) AS id_asesor
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
    `SELECT vc.*,
            (SELECT MIN(u.id_SB) FROM usuarios u WHERE u.estado=1 AND UPPER(TRIM(u.iniciales))=UPPER(TRIM(vc.iniciales))) AS id_asesor
       FROM ${TABLE} vc WHERE ${clauses.join(' AND ')} LIMIT 1`,
    params
  );
  return rows[0] || null;
}

async function findByIdentity(connection, data, excludeId = null) {
  const clauses = [
    'UPPER(TRIM(nombre_empresa)) = UPPER(TRIM(?))',
    "COALESCE(UPPER(TRIM(nombre_contacto)), '') = COALESCE(UPPER(TRIM(?)), '')",
    "COALESCE(LOWER(TRIM(email)), '') = COALESCE(LOWER(TRIM(?)), '')",
    "COALESCE(TRIM(telefono), '') = COALESCE(TRIM(?), '')"
  ];
  const params = [
    data.nombre_empresa,
    data.nombre_contacto,
    data.email,
    data.telefono
  ];

  if (Number.isInteger(excludeId)) {
    clauses.push('id_cliente <> ?');
    params.push(excludeId);
  }

  const [rows] = await connection.query(
    `SELECT id_cliente, activo
       FROM ${TABLE}
      WHERE ${clauses.join(' AND ')}
      ORDER BY activo DESC, id_cliente ASC
      LIMIT 1`,
    params
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

function commercialRolePredicate(userAlias = 'u') {
  return `EXISTS (
    SELECT 1
      FROM roles r
     WHERE r.estado = 1
       AND r.id_rol = ${userAlias}.rol_id
       AND (
         r.rol = 'Asesor Comercial'
         OR r.rol = 'Director Ventas'
         OR r.rol = 'Gerente de Cuentas Corporativas'
         OR r.rol LIKE 'Gerente Comercial%'
       )
  ) OR EXISTS (
    SELECT 1
      FROM usuario_roles ur
      INNER JOIN roles r
        ON r.id_rol = ur.id_rol
       AND r.estado = 1
     WHERE ur.id_usuario = ${userAlias}.id_SB
       AND ur.activo = 1
       AND (
         r.rol = 'Asesor Comercial'
         OR r.rol = 'Director Ventas'
         OR r.rol = 'Gerente de Cuentas Corporativas'
         OR r.rol LIKE 'Gerente Comercial%'
       )
  )`;
}

async function listAssignableCommercialUsers(connection) {
  const [rows] = await connection.query(
    `SELECT u.id_SB, u.nombre, u.iniciales, u.puesto
       FROM usuarios u
      WHERE u.estado = 1
        AND NULLIF(TRIM(u.iniciales), '') IS NOT NULL
        AND (${commercialRolePredicate('u')})
      ORDER BY
        CASE
          WHEN u.puesto = 'Director Ventas' THEN 1
          WHEN u.puesto LIKE 'Gerente%' THEN 2
          WHEN u.puesto = 'Asesor Comercial' THEN 3
          ELSE 4
        END,
        u.nombre ASC,
        u.id_SB ASC`
  );
  return rows;
}

async function isAssignableCommercialUser(connection, userId) {
  const [rows] = await connection.query(
    `SELECT 1 AS found
       FROM usuarios u
      WHERE u.id_SB = ?
        AND u.estado = 1
        AND NULLIF(TRIM(u.iniciales), '') IS NOT NULL
        AND (${commercialRolePredicate('u')})
      LIMIT 1`,
    [userId]
  );
  return Boolean(rows[0]);
}

async function listAdminAdvisors(connection, adminId) {
  const [rows] = await connection.query(
    `SELECT DISTINCT
            asesor.id_SB,
            asesor.nombre,
            asesor.iniciales,
            asesor.puesto
       FROM usuarios_rel_admin ura
       INNER JOIN usuarios asesor
         ON asesor.id_SB = ura.id_asesor
        AND asesor.estado = 1
      WHERE ura.id_admin = ?
        AND NULLIF(TRIM(asesor.iniciales), '') IS NOT NULL
      ORDER BY asesor.nombre ASC, asesor.id_SB ASC`,
    [adminId]
  );
  return rows;
}

async function isAdminInRelations(connection, adminId) {
  const [rows] = await connection.query(
    'SELECT 1 AS found FROM usuarios_rel_admin WHERE id_admin = ? LIMIT 1',
    [adminId]
  );
  return Boolean(rows[0]);
}

async function findActiveUserById(connection, userId) {
  const [rows] = await connection.query(
    `SELECT id_SB, nombre, iniciales, puesto
       FROM usuarios
      WHERE id_SB = ?
        AND estado = 1
      LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

async function findActiveUserByInitials(connection, initials) {
  const [rows] = await connection.query(
    `SELECT id_SB, nombre, iniciales, puesto
       FROM usuarios
      WHERE estado = 1
        AND UPPER(TRIM(iniciales)) = UPPER(TRIM(?))
      ORDER BY id_SB ASC
      LIMIT 1`,
    [initials]
  );
  return rows[0] || null;
}

async function isAdvisorLinkedToAdmin(connection, adminId, advisorId) {
  const [rows] = await connection.query(
    `SELECT 1 AS found
       FROM usuarios_rel_admin
      WHERE id_admin = ?
        AND id_asesor = ?
      LIMIT 1`,
    [adminId, advisorId]
  );
  return Boolean(rows[0]);
}

module.exports = {
  getConnection,
  list,
  getKpis,
  getCatalogos,
  findById,
  findByIdentity,
  insert,
  update,
  softDelete,
  listAssignableCommercialUsers,
  isAssignableCommercialUser,
  listAdminAdvisors,
  isAdminInRelations,
  findActiveUserById,
  findActiveUserByInitials,
  isAdvisorLinkedToAdmin
};

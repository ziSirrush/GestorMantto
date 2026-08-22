'use strict';

const db = require('../../config/db');

const TABLE = 'ventas_redes';

function getConnection() {
  return db.getConnection();
}

function positiveIds(values) {
  return [...new Set((values || []).map(Number).filter((value) => Number.isInteger(value) && value > 0))];
}

function buildRecordScope(scope, alias = 'vr') {
  if (!scope || scope.mode === 'ALL') return { sql: '', params: [] };

  const ids = positiveIds(scope.advisorIds);
  if (!ids.length) return { sql: '1 = 0', params: [] };

  const placeholders = ids.map(() => '?').join(', ');
  return {
    sql: `${alias}.id_usuario_asignado IN (${placeholders})`,
    params: ids
  };
}

function buildQuotationScope(scope, alias = 'vc') {
  if (!scope || scope.mode === 'ALL') return { sql: '', params: [] };

  const ids = positiveIds(scope.advisorIds);
  if (!ids.length) return { sql: '1 = 0', params: [] };

  const placeholders = ids.map(() => '?').join(', ');
  return {
    sql: `(${alias}.id_asesor IN (${placeholders}) OR ${alias}.id_admin IN (${placeholders}))`,
    params: [...ids, ...ids]
  };
}

const LIST_FROM = `
  FROM ${TABLE} vr
  LEFT JOIN catalogo_general contacto_via
    ON contacto_via.id_catalogo = vr.id_contacto_via
  LEFT JOIN catalogo_general estado
    ON estado.id_catalogo = vr.id_estado
  LEFT JOIN catalogo_general solicitud
    ON solicitud.id_catalogo = vr.id_solicitud
  LEFT JOIN catalogo_general estatus
    ON estatus.id_catalogo = vr.id_estatus
  LEFT JOIN usuarios asignado
    ON asignado.id_SB = vr.id_usuario_asignado
  LEFT JOIN usuarios creador
    ON creador.id_SB = vr.created_by
  LEFT JOIN usuarios actualizador
    ON actualizador.id_SB = vr.updated_by
  LEFT JOIN ventas_cotizaciones_cor cotizacion
    ON cotizacion.id_cotizacion = vr.id_cotizacion
`;

const LIST_SELECT = `
  SELECT
    vr.*,
    contacto_via.articulo AS contacto_via,
    contacto_via.descripcion AS contacto_via_descripcion,
    estado.articulo AS estado,
    solicitud.articulo AS solicitud,
    solicitud.descripcion AS solicitud_descripcion,
    estatus.articulo AS estatus,
    estatus.descripcion AS estatus_descripcion,
    asignado.nombre AS usuario_asignado_nombre,
    asignado.iniciales AS usuario_asignado_iniciales,
    asignado.puesto AS usuario_asignado_puesto,
    asignado.area AS usuario_asignado_area,
    asignado.empresa AS usuario_asignado_empresa,
    creador.nombre AS creado_por_nombre,
    creador.iniciales AS creado_por_iniciales,
    actualizador.nombre AS actualizado_por_nombre,
    actualizador.iniciales AS actualizado_por_iniciales,
    cotizacion.id_cot_origen AS cotizacion_id_origen,
    cotizacion.nombre_proyecto AS cotizacion_nombre,
    cotizacion.cliente AS cotizacion_cliente,
    cotizacion.estatus_proyecto AS cotizacion_estatus,
    cotizacion.activo AS cotizacion_activa,
    (
      SELECT COUNT(*)
      FROM ventas_redes_archivos vra
      WHERE vra.id_redes = vr.id_redes
        AND vra.activo = 1
    ) AS total_evidencias,
    (
      SELECT COUNT(*)
      FROM ventas_redes_comentarios vrc
      WHERE vrc.id_redes = vr.id_redes
        AND vrc.activo = 1
    ) AS total_comentarios
`;

function buildListWhere(options = {}, scope = null, alias = 'vr') {
  const clauses = [];
  const params = [];

  if (options.includeInactive !== true) {
    clauses.push(`${alias}.activo = 1`);
  } else if (options.activo !== undefined && options.activo !== null) {
    clauses.push(`${alias}.activo = ?`);
    params.push(options.activo);
  }

  const scopeClause = buildRecordScope(scope, alias);
  if (scopeClause.sql) {
    clauses.push(scopeClause.sql);
    params.push(...scopeClause.params);
  }

  const search = String(options.search || '').trim();
  if (search) {
    const like = `%${search}%`;
    clauses.push(`(
      ${alias}.nombre_contacto LIKE ? OR
      ${alias}.email LIKE ? OR
      ${alias}.telefono LIKE ? OR
      ${alias}.nombre_empresa LIKE ? OR
      ${alias}.ciudad LIKE ? OR
      ${alias}.nombre_proyecto LIKE ? OR
      ${alias}.informacion_enviada LIKE ? OR
      contacto_via.articulo LIKE ? OR
      estado.articulo LIKE ? OR
      solicitud.articulo LIKE ? OR
      estatus.articulo LIKE ? OR
      asignado.nombre LIKE ? OR
      asignado.iniciales LIKE ? OR
      creador.nombre LIKE ? OR
      creador.iniciales LIKE ? OR
      cotizacion.nombre_proyecto LIKE ? OR
      cotizacion.cliente LIKE ?
    )`);
    params.push(...Array(17).fill(like));
  }

  const idFilters = [
    'id_contacto_via',
    'id_estado',
    'id_solicitud',
    'id_usuario_asignado',
    'created_by',
    'id_estatus',
    'id_cotizacion'
  ];

  for (const field of idFilters) {
    const value = options[field];
    if (value !== undefined && value !== null) {
      clauses.push(`${alias}.${field} = ?`);
      params.push(value);
    }
  }

  if (options.sinAsignar === true) clauses.push(`${alias}.id_usuario_asignado IS NULL`);
  if (options.conAsignacion === true) clauses.push(`${alias}.id_usuario_asignado IS NOT NULL`);
  if (options.sinCotizacion === true) clauses.push(`${alias}.id_cotizacion IS NULL`);
  if (options.conCotizacion === true) clauses.push(`${alias}.id_cotizacion IS NOT NULL`);

  if (options.fechaDesde) {
    clauses.push(`${alias}.created_at >= ?`);
    params.push(options.fechaDesde);
  }
  if (options.fechaHasta) {
    clauses.push(`${alias}.created_at < DATE_ADD(?, INTERVAL 1 DAY)`);
    params.push(options.fechaHasta);
  }

  return {
    sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    params
  };
}

async function list(connection, options, scope) {
  const where = buildListWhere(options, scope);
  const allowedSort = new Set([
    'id_redes',
    'nombre_contacto',
    'nombre_empresa',
    'ciudad',
    'nombre_proyecto',
    'fecha_cambio_estatus',
    'created_at',
    'updated_at'
  ]);
  const sortBy = allowedSort.has(options.sortBy) ? options.sortBy : 'created_at';
  const direction = options.sortDirection === 'asc' ? 'ASC' : 'DESC';

  const [[countRow]] = await connection.query(
    `SELECT COUNT(DISTINCT vr.id_redes) AS total ${LIST_FROM} ${where.sql}`,
    where.params
  );

  const [rows] = await connection.query(
    `${LIST_SELECT}
     ${LIST_FROM}
     ${where.sql}
     ORDER BY vr.${sortBy} ${direction}, vr.id_redes DESC
     LIMIT ? OFFSET ?`,
    [...where.params, options.pageSize, options.offset]
  );

  return { rows, total: Number(countRow?.total || 0) };
}

async function findById(connection, idRedes, { includeInactive = false, scope = null, forUpdate = false } = {}) {
  const options = { includeInactive, activo: includeInactive ? null : 1 };
  const where = buildListWhere(options, scope);
  const clauses = [where.sql ? where.sql.replace(/^WHERE\s+/i, '') : '1 = 1', 'vr.id_redes = ?'];

  if (forUpdate) {
    const [lockedRows] = await connection.query(
      `SELECT vr.id_redes
         FROM ${TABLE} vr
        WHERE ${clauses.join(' AND ')}
        LIMIT 1
        FOR UPDATE`,
      [...where.params, idRedes]
    );
    if (!lockedRows.length) return null;
  }

  const [rows] = await connection.query(
    `${LIST_SELECT}
     ${LIST_FROM}
     WHERE ${clauses.join(' AND ')}
     LIMIT 1`,
    [...where.params, idRedes]
  );

  return rows[0] || null;
}

async function insert(connection, record) {
  const columns = Object.keys(record);
  const [result] = await connection.query(
    `INSERT INTO ${TABLE} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    columns.map((column) => record[column])
  );
  return Number(result.insertId);
}

async function update(connection, idRedes, changes) {
  const columns = Object.keys(changes);
  if (!columns.length) return 0;

  const [result] = await connection.query(
    `UPDATE ${TABLE}
        SET ${columns.map((column) => `${column} = ?`).join(', ')}
      WHERE id_redes = ?`,
    [...columns.map((column) => changes[column]), idRedes]
  );
  return Number(result.affectedRows || 0);
}

async function softDelete(connection, idRedes, actorId) {
  const [result] = await connection.query(
    `UPDATE ${TABLE}
        SET activo = 0,
            updated_by = ?,
            updated_at = CURRENT_TIMESTAMP(3)
      WHERE id_redes = ?
        AND activo = 1`,
    [actorId, idRedes]
  );
  return Number(result.affectedRows || 0);
}

async function findCatalogById(connection, idCatalogo, area, elemento) {
  const [rows] = await connection.query(
    `SELECT id_catalogo, area, elemento, articulo, descripcion, orden, activo
       FROM catalogo_general
      WHERE id_catalogo = ?
        AND area = ?
        AND elemento = ?
        AND activo = 1
      LIMIT 1`,
    [idCatalogo, area, elemento]
  );
  return rows[0] || null;
}

async function listCatalog(connection, area, elemento) {
  const [rows] = await connection.query(
    `SELECT id_catalogo, area, elemento, articulo, descripcion, orden
       FROM catalogo_general
      WHERE area = ?
        AND elemento = ?
        AND activo = 1
      ORDER BY orden ASC, articulo ASC, id_catalogo ASC`,
    [area, elemento]
  );
  return rows;
}

async function findActiveUserById(connection, idUsuario) {
  const [rows] = await connection.query(
    `SELECT id_SB, nombre, iniciales, puesto, area, empresa, rol_id
       FROM usuarios
      WHERE id_SB = ?
        AND estado = 1
      LIMIT 1`,
    [idUsuario]
  );
  return rows[0] || null;
}

async function listActiveUsers(connection, search = null, limit = 200) {
  const clauses = ['u.estado = 1'];
  const params = [];
  if (search) {
    const like = `%${search}%`;
    clauses.push(`(u.nombre LIKE ? OR u.iniciales LIKE ? OR u.puesto LIKE ? OR u.area LIKE ? OR u.empresa LIKE ?)`);
    params.push(like, like, like, like, like);
  }

  const [rows] = await connection.query(
    `SELECT u.id_SB, u.nombre, u.iniciales, u.puesto, u.area, u.empresa, u.rol_id
       FROM usuarios u
      WHERE ${clauses.join(' AND ')}
      ORDER BY u.area ASC, u.puesto ASC, u.nombre ASC, u.id_SB ASC
      LIMIT ?`,
    [...params, limit]
  );
  return rows;
}

async function findActiveQuotationById(connection, idCotizacion, scope = null) {
  const clauses = ['vc.id_cotizacion = ?', 'vc.activo = 1'];
  const params = [idCotizacion];
  const scopeClause = buildQuotationScope(scope, 'vc');
  if (scopeClause.sql) {
    clauses.push(scopeClause.sql);
    params.push(...scopeClause.params);
  }

  const [rows] = await connection.query(
    `SELECT
       vc.id_cotizacion,
       vc.id_cot_origen,
       vc.nombre_proyecto,
       vc.cliente,
       vc.estatus_proyecto,
       vc.fecha_cotizacion,
       vc.id_asesor,
       vc.id_admin,
       vc.created_by,
       asesor.nombre AS asesor_nombre,
       asesor.iniciales AS asesor_iniciales
     FROM ventas_cotizaciones_cor vc
     LEFT JOIN usuarios asesor ON asesor.id_SB = vc.id_asesor
     WHERE ${clauses.join(' AND ')}
     LIMIT 1`,
    params
  );
  return rows[0] || null;
}

async function listActiveQuotations(connection, { search = null, limit = 100 } = {}, scope = null) {
  const clauses = ['vc.activo = 1'];
  const params = [];
  const scopeClause = buildQuotationScope(scope, 'vc');
  if (scopeClause.sql) {
    clauses.push(scopeClause.sql);
    params.push(...scopeClause.params);
  }
  if (search) {
    const like = `%${search}%`;
    clauses.push(`(vc.nombre_proyecto LIKE ? OR vc.cliente LIKE ? OR CAST(vc.id_cotizacion AS CHAR) LIKE ? OR CAST(vc.id_cot_origen AS CHAR) LIKE ?)`);
    params.push(like, like, like, like);
  }

  const [rows] = await connection.query(
    `SELECT
       vc.id_cotizacion,
       vc.id_cot_origen,
       vc.nombre_proyecto,
       vc.cliente,
       vc.estatus_proyecto,
       vc.fecha_cotizacion,
       vc.id_asesor,
       vc.id_admin,
       asesor.nombre AS asesor_nombre,
       asesor.iniciales AS asesor_iniciales
     FROM ventas_cotizaciones_cor vc
     LEFT JOIN usuarios asesor ON asesor.id_SB = vc.id_asesor
     WHERE ${clauses.join(' AND ')}
     ORDER BY vc.nombre_proyecto ASC, vc.cliente ASC, vc.id_cotizacion DESC
     LIMIT ?`,
    [...params, limit]
  );
  return rows;
}

async function listEvidence(connection, idRedes, { includeInactive = false } = {}) {
  const clauses = ['a.id_redes = ?'];
  const params = [idRedes];
  if (!includeInactive) clauses.push('a.activo = 1');

  const [rows] = await connection.query(
    `SELECT a.*, u.nombre AS usuario_nombre, u.iniciales AS usuario_iniciales
       FROM ventas_redes_archivos a
       LEFT JOIN usuarios u ON u.id_SB = a.id_usuario
      WHERE ${clauses.join(' AND ')}
      ORDER BY a.orden_archivo ASC, a.id_archivo ASC`,
    params
  );
  return rows;
}

async function findEvidenceByOrder(connection, idRedes, order, { forUpdate = false, includeInactive = true } = {}) {
  const clauses = ['a.id_redes = ?', 'a.orden_archivo = ?'];
  const params = [idRedes, order];
  if (!includeInactive) clauses.push('a.activo = 1');
  const lock = forUpdate ? ' FOR UPDATE' : '';

  const [rows] = await connection.query(
    `SELECT a.*, u.nombre AS usuario_nombre, u.iniciales AS usuario_iniciales
       FROM ventas_redes_archivos a
       LEFT JOIN usuarios u ON u.id_SB = a.id_usuario
      WHERE ${clauses.join(' AND ')}
      LIMIT 1${lock}`,
    params
  );
  return rows[0] || null;
}

async function findEvidenceById(connection, idRedes, idArchivo, { forUpdate = false, includeInactive = false } = {}) {
  const clauses = ['a.id_redes = ?', 'a.id_archivo = ?'];
  const params = [idRedes, idArchivo];
  if (!includeInactive) clauses.push('a.activo = 1');
  const lock = forUpdate ? ' FOR UPDATE' : '';

  const [rows] = await connection.query(
    `SELECT a.*, u.nombre AS usuario_nombre, u.iniciales AS usuario_iniciales
       FROM ventas_redes_archivos a
       LEFT JOIN usuarios u ON u.id_SB = a.id_usuario
      WHERE ${clauses.join(' AND ')}
      LIMIT 1${lock}`,
    params
  );
  return rows[0] || null;
}

async function insertEvidence(connection, record) {
  const columns = Object.keys(record);
  const [result] = await connection.query(
    `INSERT INTO ventas_redes_archivos (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    columns.map((column) => record[column])
  );
  return Number(result.insertId);
}

async function updateEvidence(connection, idArchivo, changes) {
  const columns = Object.keys(changes);
  if (!columns.length) return 0;
  const [result] = await connection.query(
    `UPDATE ventas_redes_archivos
        SET ${columns.map((column) => `${column} = ?`).join(', ')},
            updated_at = CURRENT_TIMESTAMP(3)
      WHERE id_archivo = ?`,
    [...columns.map((column) => changes[column]), idArchivo]
  );
  return Number(result.affectedRows || 0);
}

async function softDeleteEvidence(connection, idRedes, idArchivo) {
  const [result] = await connection.query(
    `UPDATE ventas_redes_archivos
        SET activo = 0,
            updated_at = CURRENT_TIMESTAMP(3)
      WHERE id_redes = ?
        AND id_archivo = ?
        AND activo = 1`,
    [idRedes, idArchivo]
  );
  return Number(result.affectedRows || 0);
}

async function listComments(connection, idRedes, { page = 1, pageSize = 50 } = {}) {
  const offset = (page - 1) * pageSize;
  const [rows] = await connection.query(
    `SELECT c.*, u.nombre AS usuario_nombre, u.iniciales AS usuario_iniciales, u.puesto AS usuario_puesto
       FROM ventas_redes_comentarios c
       LEFT JOIN usuarios u ON u.id_SB = c.id_usuario
      WHERE c.id_redes = ?
        AND c.activo = 1
      ORDER BY COALESCE(c.fecha_hora, c.created_at) ASC, c.id_comentario ASC
      LIMIT ? OFFSET ?`,
    [idRedes, pageSize, offset]
  );

  const [[countRow]] = await connection.query(
    `SELECT COUNT(*) AS total
       FROM ventas_redes_comentarios
      WHERE id_redes = ?
        AND activo = 1`,
    [idRedes]
  );

  return { rows, total: Number(countRow?.total || 0) };
}

async function findComment(connection, idRedes, idComentario, { forUpdate = false } = {}) {
  const lock = forUpdate ? ' FOR UPDATE' : '';
  const [rows] = await connection.query(
    `SELECT c.*, u.nombre AS usuario_nombre, u.iniciales AS usuario_iniciales, u.puesto AS usuario_puesto
       FROM ventas_redes_comentarios c
       LEFT JOIN usuarios u ON u.id_SB = c.id_usuario
      WHERE c.id_redes = ?
        AND c.id_comentario = ?
        AND c.activo = 1
      LIMIT 1${lock}`,
    [idRedes, idComentario]
  );
  return rows[0] || null;
}

async function insertComment(connection, record) {
  const columns = Object.keys(record);
  const [result] = await connection.query(
    `INSERT INTO ventas_redes_comentarios (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    columns.map((column) => record[column])
  );
  return Number(result.insertId);
}

async function updateComment(connection, idRedes, idComentario, comentario) {
  const [result] = await connection.query(
    `UPDATE ventas_redes_comentarios
        SET comentario = ?,
            editado = 1,
            updated_at = CURRENT_TIMESTAMP(3)
      WHERE id_redes = ?
        AND id_comentario = ?
        AND activo = 1`,
    [comentario, idRedes, idComentario]
  );
  return Number(result.affectedRows || 0);
}

async function softDeleteComment(connection, idRedes, idComentario) {
  const [result] = await connection.query(
    `UPDATE ventas_redes_comentarios
        SET activo = 0,
            updated_at = CURRENT_TIMESTAMP(3)
      WHERE id_redes = ?
        AND id_comentario = ?
        AND activo = 1`,
    [idRedes, idComentario]
  );
  return Number(result.affectedRows || 0);
}

async function listAttachmentsByCommentIds(connection, commentIds) {
  const ids = positiveIds(commentIds);
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(', ');

  const [rows] = await connection.query(
    `SELECT a.*, u.nombre AS usuario_nombre, u.iniciales AS usuario_iniciales
       FROM ventas_redes_comentarios_adjuntos a
       LEFT JOIN usuarios u ON u.id_SB = a.id_usuario
      WHERE a.id_comentario IN (${placeholders})
        AND a.activo = 1
      ORDER BY a.created_at ASC, a.id_adjunto ASC`,
    ids
  );
  return rows;
}

async function listAttachmentsByComment(connection, idComentario, { forUpdate = false } = {}) {
  const lock = forUpdate ? ' FOR UPDATE' : '';
  const [rows] = await connection.query(
    `SELECT a.*, u.nombre AS usuario_nombre, u.iniciales AS usuario_iniciales
       FROM ventas_redes_comentarios_adjuntos a
       LEFT JOIN usuarios u ON u.id_SB = a.id_usuario
      WHERE a.id_comentario = ?
        AND a.activo = 1
      ORDER BY a.created_at ASC, a.id_adjunto ASC${lock}`,
    [idComentario]
  );
  return rows;
}

async function findAttachment(connection, idRedes, idComentario, idAdjunto, { forUpdate = false } = {}) {
  const lock = forUpdate ? ' FOR UPDATE' : '';
  const [rows] = await connection.query(
    `SELECT a.*, c.id_redes, c.id_usuario AS comentario_usuario_id,
            u.nombre AS usuario_nombre, u.iniciales AS usuario_iniciales
       FROM ventas_redes_comentarios_adjuntos a
       INNER JOIN ventas_redes_comentarios c
         ON c.id_comentario = a.id_comentario
        AND c.activo = 1
       LEFT JOIN usuarios u ON u.id_SB = a.id_usuario
      WHERE c.id_redes = ?
        AND c.id_comentario = ?
        AND a.id_adjunto = ?
        AND a.activo = 1
      LIMIT 1${lock}`,
    [idRedes, idComentario, idAdjunto]
  );
  return rows[0] || null;
}

async function insertAttachment(connection, record) {
  const columns = Object.keys(record);
  const [result] = await connection.query(
    `INSERT INTO ventas_redes_comentarios_adjuntos (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    columns.map((column) => record[column])
  );
  return Number(result.insertId);
}

async function softDeleteAttachment(connection, idAdjunto) {
  const [result] = await connection.query(
    `UPDATE ventas_redes_comentarios_adjuntos
        SET activo = 0,
            updated_at = CURRENT_TIMESTAMP(3)
      WHERE id_adjunto = ?
        AND activo = 1`,
    [idAdjunto]
  );
  return Number(result.affectedRows || 0);
}

async function softDeleteAttachmentsByComment(connection, idComentario) {
  const [result] = await connection.query(
    `UPDATE ventas_redes_comentarios_adjuntos
        SET activo = 0,
            updated_at = CURRENT_TIMESTAMP(3)
      WHERE id_comentario = ?
        AND activo = 1`,
    [idComentario]
  );
  return Number(result.affectedRows || 0);
}

module.exports = {
  getConnection,
  buildRecordScope,
  buildQuotationScope,
  list,
  findById,
  insert,
  update,
  softDelete,
  findCatalogById,
  listCatalog,
  findActiveUserById,
  listActiveUsers,
  findActiveQuotationById,
  listActiveQuotations,
  listEvidence,
  findEvidenceByOrder,
  findEvidenceById,
  insertEvidence,
  updateEvidence,
  softDeleteEvidence,
  listComments,
  findComment,
  insertComment,
  updateComment,
  softDeleteComment,
  listAttachmentsByCommentIds,
  listAttachmentsByComment,
  findAttachment,
  insertAttachment,
  softDeleteAttachment,
  softDeleteAttachmentsByComment
};

'use strict';

const db = require('../../config/db');

function placeholders_cor(values) {
  return values.map(() => '?').join(', ');
}

function executor_cor(executor) {
  return executor && typeof executor.query === 'function' ? executor : db;
}

async function getConnection_cor() {
  return db.getConnection();
}

async function getEffectivePermissionsBulk_cor(userId, permissionCodes) {
  const codes = Array.from(new Set(
    (Array.isArray(permissionCodes) ? permissionCodes : [])
      .map(code => String(code || '').trim())
      .filter(Boolean)
  ));

  if (!codes.length) return {};

  const [rows] = await db.query(
    `SELECT
       psa.codigo_permiso,
       (
         SELECT up.permitido
         FROM usuario_permisos up
         WHERE up.id_usuario = ?
           AND up.id_subelemento_accion = psa.id_subelemento_accion
           AND up.activo = 1
           AND (up.fecha_inicio IS NULL OR up.fecha_inicio <= NOW())
           AND (up.fecha_fin IS NULL OR up.fecha_fin >= NOW())
         ORDER BY up.updated_at DESC, up.id_usuario_permiso DESC
         LIMIT 1
       ) AS personalizado,
       EXISTS (
         SELECT 1
         FROM rol_permisos rp
         INNER JOIN (
           SELECT ur.id_rol
           FROM usuario_roles ur
           WHERE ur.id_usuario = ?
             AND ur.activo = 1
           UNION
           SELECT u.rol_id
           FROM usuarios u
           WHERE u.id_SB = ?
             AND u.estado = 1
             AND u.rol_id IS NOT NULL
         ) roles_usuario
           ON roles_usuario.id_rol = rp.id_rol
         INNER JOIN roles r
           ON r.id_rol = rp.id_rol
          AND r.estado = 1
         WHERE rp.id_subelemento_accion = psa.id_subelemento_accion
           AND rp.permitido = 1
       ) AS heredado
     FROM perm_subelemento_acciones psa
     WHERE psa.codigo_permiso IN (${placeholders_cor(codes)})
       AND psa.activo = 1`,
    [userId, userId, userId, ...codes]
  );

  const result = Object.fromEntries(codes.map(code => [code, false]));
  rows.forEach(row => {
    const hasCustom = row.personalizado !== null && row.personalizado !== undefined;
    result[row.codigo_permiso] = hasCustom
      ? Number(row.personalizado) === 1
      : Number(row.heredado) === 1;
  });
  return result;
}

async function listRegisteredFolders_cor(executor) {
  const conn = executor_cor(executor);
  const [rows] = await conn.query(
    `SELECT
       c.id_carpeta,
       c.nombre_carpeta,
       c.carpeta_id,
       c.enlace,
       c.activo,
       c.fecha_sincronizacion,
       c.updated_at,
       r.id_proyecto_drive,
       r.id_proyecto,
       r.nombre_proyecto,
       r.vinculado_at
     FROM instalaciones_drive_carpetas c
     LEFT JOIN instalaciones_proyecto_drive r
       ON r.id_carpeta = c.id_carpeta
      AND r.activo = 1
     WHERE c.activo = 1
     ORDER BY c.nombre_carpeta ASC, c.id_carpeta ASC`
  );
  return rows;
}

async function listAvailableFolders_cor(executor) {
  const conn = executor_cor(executor);
  const [rows] = await conn.query(
    `SELECT
       c.id_carpeta,
       c.nombre_carpeta,
       c.carpeta_id
     FROM instalaciones_drive_carpetas c
     WHERE c.activo = 1
       AND NOT EXISTS (
         SELECT 1
         FROM instalaciones_proyecto_drive r
         WHERE r.id_carpeta = c.id_carpeta
           AND r.activo = 1
       )
     ORDER BY c.nombre_carpeta ASC, c.id_carpeta ASC`
  );
  return rows;
}

async function listProjectsWithoutFolder_cor(executor) {
  const conn = executor_cor(executor);
  const [rows] = await conn.query(
    `WITH proyectos AS (
       SELECT
         TRIM(f.id_proyecto) AS id_proyecto,
         MAX(NULLIF(TRIM(f.proyecto), '')) AS nombre_proyecto,
         MAX(NULLIF(TRIM(f.ciudad), '')) AS ciudad,
         MAX(NULLIF(TRIM(f.estado), '')) AS estado,
         GROUP_CONCAT(
           DISTINCT NULLIF(TRIM(f.supervisor_fl), '')
           ORDER BY TRIM(f.supervisor_fl)
           SEPARATOR ', '
         ) AS supervisores,
         COUNT(*) AS total_equipos,
         SUM(CASE WHEN TRIM(COALESCE(f.estatus, '')) = '08-T' THEN 1 ELSE 0 END) AS equipos_cerrados
       FROM ins_fl f
       WHERE NULLIF(TRIM(f.id_proyecto), '') IS NOT NULL
       GROUP BY TRIM(f.id_proyecto)
     )
     SELECT
       p.id_proyecto,
       p.nombre_proyecto,
       p.ciudad,
       p.estado,
       p.supervisores,
       p.total_equipos,
       p.equipos_cerrados,
       CASE
         WHEN p.total_equipos > 0 AND p.equipos_cerrados = p.total_equipos THEN 0
         ELSE 1
       END AS proyecto_activo
     FROM proyectos p
      WHERE NOT EXISTS (
          SELECT 1
          FROM instalaciones_proyecto_drive r
          WHERE r.id_proyecto = p.id_proyecto
            AND r.activo = 1
        )
     ORDER BY p.nombre_proyecto ASC, p.id_proyecto ASC`
  );
  return rows;
}

async function findProjectByIdForUpdate_cor(connection, projectId) {
  const [rows] = await connection.query(
    `SELECT
       id_ins_fl,
       TRIM(id_proyecto) AS id_proyecto,
       NULLIF(TRIM(proyecto), '') AS nombre_proyecto,
       activo
     FROM ins_fl
     WHERE id_proyecto = ?
     ORDER BY activo DESC, updated_at DESC, id_ins_fl DESC
     LIMIT 1
     FOR UPDATE`,
    [projectId]
  );
  return rows[0] || null;
}

async function findFolderByIdForUpdate_cor(connection, folderId) {
  const [rows] = await connection.query(
    `SELECT
       id_carpeta,
       nombre_carpeta,
       carpeta_id,
       enlace,
       activo,
       fecha_sincronizacion
     FROM instalaciones_drive_carpetas
     WHERE id_carpeta = ?
     LIMIT 1
     FOR UPDATE`,
    [folderId]
  );
  return rows[0] || null;
}

async function findRelationByProjectForUpdate_cor(connection, projectId) {
  const [rows] = await connection.query(
    `SELECT
       id_proyecto_drive,
       id_proyecto,
       nombre_proyecto,
       id_carpeta,
       activo,
       vinculado_at,
       created_by,
       updated_by
     FROM instalaciones_proyecto_drive
     WHERE id_proyecto = ?
     LIMIT 1
     FOR UPDATE`,
    [projectId]
  );
  return rows[0] || null;
}

async function findRelationByFolderForUpdate_cor(connection, folderId) {
  const [rows] = await connection.query(
    `SELECT
       id_proyecto_drive,
       id_proyecto,
       nombre_proyecto,
       id_carpeta,
       activo,
       vinculado_at,
       created_by,
       updated_by
     FROM instalaciones_proyecto_drive
     WHERE id_carpeta = ?
     LIMIT 1
     FOR UPDATE`,
    [folderId]
  );
  return rows[0] || null;
}

async function insertRelation_cor(connection, input) {
  const [result] = await connection.query(
    `INSERT INTO instalaciones_proyecto_drive
       (id_proyecto, nombre_proyecto, id_carpeta, activo, vinculado_at, created_by, updated_by)
     VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP, ?, ?)`,
    [
      input.id_proyecto,
      input.nombre_proyecto,
      input.id_carpeta,
      input.id_usuario,
      input.id_usuario
    ]
  );
  return Number(result.insertId);
}

async function reactivateRelation_cor(connection, relationId, input) {
  const [result] = await connection.query(
    `UPDATE instalaciones_proyecto_drive
     SET id_proyecto = ?,
         nombre_proyecto = ?,
         id_carpeta = ?,
         activo = 1,
         vinculado_at = CURRENT_TIMESTAMP,
         updated_by = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id_proyecto_drive = ?
       AND activo = 0`,
    [
      input.id_proyecto,
      input.nombre_proyecto,
      input.id_carpeta,
      input.id_usuario,
      relationId
    ]
  );
  return Number(result.affectedRows || 0);
}

async function getRelationDetail_cor(connection, relationId) {
  const [rows] = await connection.query(
    `SELECT
       r.id_proyecto_drive,
       r.id_proyecto,
       r.nombre_proyecto,
       r.id_carpeta,
       r.activo,
       r.vinculado_at,
       r.created_at,
       r.updated_at,
       r.created_by,
       r.updated_by,
       c.nombre_carpeta,
       c.carpeta_id,
       c.activo AS carpeta_activa
     FROM instalaciones_proyecto_drive r
     INNER JOIN instalaciones_drive_carpetas c
       ON c.id_carpeta = r.id_carpeta
     WHERE r.id_proyecto_drive = ?
     LIMIT 1`,
    [relationId]
  );
  return rows[0] || null;
}

module.exports = {
  getConnection_cor,
  getEffectivePermissionsBulk_cor,
  listRegisteredFolders_cor,
  listAvailableFolders_cor,
  listProjectsWithoutFolder_cor,
  findProjectByIdForUpdate_cor,
  findFolderByIdForUpdate_cor,
  findRelationByProjectForUpdate_cor,
  findRelationByFolderForUpdate_cor,
  insertRelation_cor,
  reactivateRelation_cor,
  getRelationDetail_cor
};

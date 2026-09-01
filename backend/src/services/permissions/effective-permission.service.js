'use strict';

const db = require('../../config/db');

function activeUserRolesSql() {
  return `(
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
  )`;
}

async function hasEffectivePermission(userId, permissionCode, conn = db) {
  const normalizedUserId = Number(userId);
  const normalizedCode = String(permissionCode || '').trim();

  if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0 || !normalizedCode) {
    return false;
  }

  const [rows] = await conn.query(
    `SELECT
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
           INNER JOIN ${activeUserRolesSql()} roles_usuario
                   ON roles_usuario.id_rol = rp.id_rol
           INNER JOIN roles r
                   ON r.id_rol = rp.id_rol
                  AND r.estado = 1
          WHERE rp.id_subelemento_accion = psa.id_subelemento_accion
            AND rp.permitido = 1
       ) AS heredado
     FROM perm_subelemento_acciones psa
     WHERE psa.codigo_permiso = ?
       AND psa.activo = 1
     LIMIT 1`,
    [normalizedUserId, normalizedUserId, normalizedUserId, normalizedCode]
  );

  if (!rows.length) return false;
  if (rows[0].personalizado !== null && rows[0].personalizado !== undefined) {
    return Number(rows[0].personalizado) === 1;
  }
  return Number(rows[0].heredado) === 1;
}

async function listUsersWithEffectivePermission(permissionCode, conn = db) {
  const normalizedCode = String(permissionCode || '').trim();
  if (!normalizedCode) return [];

  const [rows] = await conn.query(
    `SELECT u.id_SB AS idUsuario
       FROM usuarios u
       INNER JOIN perm_subelemento_acciones psa
               ON psa.codigo_permiso = ?
              AND psa.activo = 1
      WHERE u.estado = 1
        AND CASE
          WHEN EXISTS (
            SELECT 1
              FROM usuario_permisos up_exists
             WHERE up_exists.id_usuario = u.id_SB
               AND up_exists.id_subelemento_accion = psa.id_subelemento_accion
               AND up_exists.activo = 1
               AND (up_exists.fecha_inicio IS NULL OR up_exists.fecha_inicio <= NOW())
               AND (up_exists.fecha_fin IS NULL OR up_exists.fecha_fin >= NOW())
          ) THEN COALESCE((
            SELECT up.permitido
              FROM usuario_permisos up
             WHERE up.id_usuario = u.id_SB
               AND up.id_subelemento_accion = psa.id_subelemento_accion
               AND up.activo = 1
               AND (up.fecha_inicio IS NULL OR up.fecha_inicio <= NOW())
               AND (up.fecha_fin IS NULL OR up.fecha_fin >= NOW())
             ORDER BY up.updated_at DESC, up.id_usuario_permiso DESC
             LIMIT 1
          ), 0)
          ELSE EXISTS (
            SELECT 1
              FROM rol_permisos rp
              INNER JOIN roles r
                      ON r.id_rol = rp.id_rol
                     AND r.estado = 1
             WHERE rp.id_subelemento_accion = psa.id_subelemento_accion
               AND rp.permitido = 1
               AND (
                 u.rol_id = rp.id_rol
                 OR EXISTS (
                   SELECT 1
                     FROM usuario_roles ur
                    WHERE ur.id_usuario = u.id_SB
                      AND ur.id_rol = rp.id_rol
                      AND ur.activo = 1
                 )
               )
          )
        END = 1
      ORDER BY u.id_SB`,
    [normalizedCode]
  );

  return [...new Set(rows
    .map(row => Number(row.idUsuario))
    .filter(id => Number.isInteger(id) && id > 0))];
}

module.exports = {
  hasEffectivePermission,
  listUsersWithEffectivePermission
};

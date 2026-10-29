'use strict';

const db = require('../../config/db');

// [Aster | 2026-10-29 | ASTER-MG | AST-05 ROLE REVOCATION V001]
// Solo asignaciones vigentes. El rol primario legacy es un fallback
// exclusivamente para usuarios sin NINGUNA fila de usuario_roles.
// Una asignacion inactiva no puede resucitar desde usuarios.rol_id.
function activeUserRolesSql() {
  return `(
    SELECT ur.id_rol
      FROM usuario_roles ur
      INNER JOIN roles r ON r.id_rol = ur.id_rol AND r.estado = 1
     WHERE ur.id_usuario = ?
       AND ur.activo = 1
    UNION
    SELECT u.rol_id
      FROM usuarios u
      INNER JOIN roles r ON r.id_rol = u.rol_id AND r.estado = 1
     WHERE u.id_SB = ?
       AND u.estado = 1
       AND u.rol_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM usuario_roles ur_any WHERE ur_any.id_usuario = u.id_SB)
  )`;
}

function normalizePermissionCodes_gnral(values) {
  return [...new Set((Array.isArray(values) ? values : [values])
    .map((value) => String(value || '').trim())
    .filter(Boolean))];
}

function normalizeRoleIds_gnral(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(Number)
    .filter((value) => Number.isInteger(value) && value > 0))]
    .sort((a, b) => a - b);
}

async function listEffectivePermissions(userId, permissionCodes, conn = db, options = {}) {
  const normalizedUserId = Number(userId);
  const codes = normalizePermissionCodes_gnral(permissionCodes);
  const result = new Map(codes.map((code) => [code, false]));

  if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0 || !codes.length) {
    return result;
  }

  // Nunca confiar en roleIds del JWT ni del contexto. La autoridad es Aiven.
  const codePlaceholders = codes.map(() => '?').join(', ');
  const inheritedSql = `EXISTS (
    SELECT 1
      FROM rol_permisos rp
      INNER JOIN ${activeUserRolesSql()} roles_usuario ON roles_usuario.id_rol = rp.id_rol
     WHERE rp.id_subelemento_accion = psa.id_subelemento_accion AND rp.permitido = 1
  )`;
  const params = [normalizedUserId, normalizedUserId, normalizedUserId, ...codes];

  const [rows] = await conn.query(
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
       ${inheritedSql} AS heredado
     FROM perm_subelemento_acciones psa
     WHERE psa.codigo_permiso IN (${codePlaceholders})
       AND psa.activo = 1`,
    params
  );

  for (const row of Array.isArray(rows) ? rows : []) {
    const code = String(row.codigo_permiso || '').trim();
    if (!result.has(code)) continue;
    const allowed = row.personalizado !== null && row.personalizado !== undefined
      ? Number(row.personalizado) === 1
      : Number(row.heredado) === 1;
    result.set(code, allowed);
  }
  return result;
}

async function hasEffectivePermission(userId, permissionCode, conn = db, options = {}) {
  const normalizedCode = String(permissionCode || '').trim();
  if (!normalizedCode) return false;
  const permissions = await listEffectivePermissions(userId, [normalizedCode], conn, options);
  return permissions.get(normalizedCode) === true;
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
                 (u.rol_id = rp.id_rol
                  AND NOT EXISTS (SELECT 1 FROM usuario_roles ur_any WHERE ur_any.id_usuario = u.id_SB))
                 OR EXISTS (
                   SELECT 1 FROM usuario_roles ur
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
  listEffectivePermissions,
  listUsersWithEffectivePermission,
  normalizePermissionCodes_gnral,
  normalizeRoleIds_gnral
};

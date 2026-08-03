'use strict';

const db = require('../config/db');

const PERMISSION_CODES = Object.freeze({
  ver: 'VENTAS_COTIZACIONES_OPERACION.VER',
  crear: 'VENTAS_COTIZACIONES_OPERACION.CREAR',
  editar: 'VENTAS_COTIZACIONES_OPERACION.EDITAR',
  eliminar: 'VENTAS_COTIZACIONES_OPERACION.ELIMINAR'
});

async function hasPermission(userId, permissionCode) {
  const [rows] = await db.query(
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
           ) roles_usuario ON roles_usuario.id_rol = rp.id_rol
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
    [userId, userId, userId, permissionCode]
  );

  if (!rows.length) return false;
  if (rows[0].personalizado !== null && rows[0].personalizado !== undefined) {
    return Number(rows[0].personalizado) === 1;
  }
  return Number(rows[0].heredado) === 1;
}

function requireVentasPermission(action) {
  const permissionCode = PERMISSION_CODES[action];
  if (!permissionCode) throw new Error(`Permiso de Ventas no configurado: ${action}`);

  return async function ventasPermissionGuard(req, res, next) {
    try {
      const contextUser = req.contextUser || req.user;
      const userId = Number(contextUser?.id_SB);
      if (!Number.isInteger(userId) || userId <= 0) {
        return res.status(401).json({ ok: false, message: 'Sesión sin usuario válido.' });
      }

      const allowed = await hasPermission(userId, permissionCode);
      if (!allowed) {
        return res.status(403).json({
          ok: false,
          message: 'No tienes permisos para realizar esta acción.',
          permiso: permissionCode
        });
      }

      return next();
    } catch (error) {
      console.error('[VentasCotizaciones][Permisos]', {
        action,
        permissionCode,
        userId: Number((req.contextUser || req.user)?.id_SB) || null,
        code: error?.code || null,
        errno: error?.errno || null,
        sqlMessage: error?.sqlMessage || null,
        message: error?.message || String(error)
      });
      return next(error);
    }
  };
}

module.exports = { PERMISSION_CODES, hasPermission, requireVentasPermission };

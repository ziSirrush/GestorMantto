const db = require('../config/db');

const PERMISSION_CODES = Object.freeze({
  ver: 'VENTAS_COTIZACIONES_OPERACION.VER',
  crear: 'VENTAS_COTIZACIONES_OPERACION.CREAR',
  editar: 'VENTAS_COTIZACIONES_OPERACION.EDITAR',
  eliminar: 'VENTAS_COTIZACIONES_OPERACION.ELIMINAR'
});

async function hasPermission(userId, permissionCode) {
  const [rows] = await db.query(`
    SELECT
      MAX(CASE WHEN up.id_usuario_permiso IS NOT NULL THEN up.permitido ELSE NULL END) AS personalizado,
      COALESCE(MAX(CASE WHEN rp.permitido = 1 THEN 1 ELSE 0 END), 0) AS heredado
    FROM perm_subelemento_acciones psa
    LEFT JOIN usuario_permisos up
      ON up.id_usuario = ?
     AND up.id_subelemento_accion = psa.id_subelemento_accion
     AND up.activo = 1
     AND (up.fecha_inicio IS NULL OR up.fecha_inicio <= NOW())
     AND (up.fecha_fin IS NULL OR up.fecha_fin >= NOW())
    LEFT JOIN usuario_roles ur
      ON ur.id_usuario = ?
     AND ur.activo = 1
    LEFT JOIN roles r
      ON r.id_rol = ur.id_rol
     AND r.estado = 1
    LEFT JOIN rol_permisos rp
      ON rp.id_rol = r.id_rol
     AND rp.id_subelemento_accion = psa.id_subelemento_accion
    WHERE psa.codigo_permiso = ?
      AND psa.activo = 1
    GROUP BY psa.id_subelemento_accion
    LIMIT 1
  `, [userId, userId, permissionCode]);

  if (!rows.length) return false;
  if (rows[0].personalizado !== null) return Number(rows[0].personalizado) === 1;
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
      return next(error);
    }
  };
}

module.exports = { PERMISSION_CODES, requireVentasPermission };

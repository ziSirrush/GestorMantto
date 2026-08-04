'use strict';

const db = require('../config/db');
const {
  resolveVisibilityScope
} = require('../modules/ventas/ventas-visibility.service');

const SALES_GROUP_CODE = 'VENTAS';
const VISUAL_ACTION_CODE = 'ACCESO_VISUAL';

const PERMISSION_CODES = Object.freeze({
  ver: 'VENTAS_COTIZACIONES_OPERACION.VER',
  crear: 'VENTAS_COTIZACIONES_OPERACION.CREAR',
  editar: 'VENTAS_COTIZACIONES_OPERACION.EDITAR',
  eliminar: 'VENTAS_COTIZACIONES_OPERACION.ELIMINAR'
});

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
    [userId, userId, userId, permissionCode]
  );

  if (!rows.length) return false;
  if (rows[0].personalizado !== null && rows[0].personalizado !== undefined) {
    return Number(rows[0].personalizado) === 1;
  }
  return Number(rows[0].heredado) === 1;
}

/**
 * Determina si el usuario ya tiene una matriz granular real cargada para
 * Ventas. Los permisos ACCESO_VISUAL no activan el modo granular porque su
 * finalidad es únicamente mostrar agrupaciones o módulos en construcción.
 *
 * Tanto una asignación permitida como una denegada cuentan como permiso
 * granular cargado. Esto evita que una denegación explícita reactive el
 * fallback temporal de acceso total.
 */
async function hasLoadedSalesGranularPermissions(userId) {
  const [rows] = await db.query(
    `SELECT EXISTS (
       SELECT 1
         FROM perm_agrupaciones pag
         INNER JOIN perm_modulos pm
                 ON pm.id_agrupacion = pag.id_agrupacion
                AND pm.activo = 1
         INNER JOIN perm_elementos pe
                 ON pe.id_modulo = pm.id_modulo
                AND pe.activo = 1
         INNER JOIN perm_subelementos ps
                 ON ps.id_elemento = pe.id_elemento
                AND ps.activo = 1
         INNER JOIN perm_subelemento_acciones psa
                 ON psa.id_subelemento = ps.id_subelemento
                AND psa.activo = 1
         INNER JOIN perm_acciones pac
                 ON pac.id_accion = psa.id_accion
                AND pac.activo = 1
         LEFT JOIN usuario_permisos up
                ON up.id_usuario = ?
               AND up.id_subelemento_accion = psa.id_subelemento_accion
               AND up.activo = 1
               AND (up.fecha_inicio IS NULL OR up.fecha_inicio <= NOW())
               AND (up.fecha_fin IS NULL OR up.fecha_fin >= NOW())
         LEFT JOIN rol_permisos rp
                ON rp.id_subelemento_accion = psa.id_subelemento_accion
               AND rp.id_rol IN ${activeUserRolesSql()}
         LEFT JOIN roles r
                ON r.id_rol = rp.id_rol
               AND r.estado = 1
        WHERE pag.codigo = ?
          AND pag.activo = 1
          AND pac.codigo <> ?
          AND (up.id_usuario_permiso IS NOT NULL OR r.id_rol IS NOT NULL)
     ) AS cargados`,
    [userId, userId, userId, SALES_GROUP_CODE, VISUAL_ACTION_CODE]
  );

  return Number(rows[0]?.cargados) === 1;
}

/**
 * Verifica si el usuario conserva acceso visual efectivo a algún contenedor
 * de la agrupación Ventas. Una denegación personalizada sobre el mismo
 * permiso visual prevalece sobre la herencia del rol.
 */
async function hasSalesVisualAccess(userId) {
  const [rows] = await db.query(
    `SELECT
       psa.id_subelemento_accion,
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
      FROM perm_agrupaciones pag
      INNER JOIN perm_modulos pm
              ON pm.id_agrupacion = pag.id_agrupacion
             AND pm.activo = 1
      INNER JOIN perm_elementos pe
              ON pe.id_modulo = pm.id_modulo
             AND pe.activo = 1
      INNER JOIN perm_subelementos ps
              ON ps.id_elemento = pe.id_elemento
             AND ps.activo = 1
      INNER JOIN perm_subelemento_acciones psa
              ON psa.id_subelemento = ps.id_subelemento
             AND psa.activo = 1
      INNER JOIN perm_acciones pac
              ON pac.id_accion = psa.id_accion
             AND pac.activo = 1
     WHERE pag.codigo = ?
       AND pag.activo = 1
       AND pac.codigo = ?`,
    [userId, userId, userId, SALES_GROUP_CODE, VISUAL_ACTION_CODE]
  );

  return rows.some((row) => {
    if (row.personalizado !== null && row.personalizado !== undefined) {
      return Number(row.personalizado) === 1;
    }
    return Number(row.heredado) === 1;
  });
}

async function hasTemporaryFullAccess(req, userId) {
  const visualAccess = await hasSalesVisualAccess(userId);
  if (visualAccess) return true;

  // Conserva el acceso total histórico de los perfiles directivos/de prueba
  // mientras la matriz granular de Ventas todavía no esté cargada.
  const contextUser = req.contextUser || req.user;
  const scope = await resolveVisibilityScope(db, { user: contextUser });
  return Boolean(scope?.accessTotal);
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

      const granularPermissionsLoaded = await hasLoadedSalesGranularPermissions(userId);

      if (!granularPermissionsLoaded) {
        const temporaryFullAccess = await hasTemporaryFullAccess(req, userId);
        if (temporaryFullAccess) return next();

        return res.status(403).json({
          ok: false,
          message: 'No tienes acceso visual a la agrupación Ventas.',
          permiso: permissionCode,
          modo_permisos: 'ACCESO_TOTAL_TEMPORAL'
        });
      }

      const allowed = await hasPermission(userId, permissionCode);
      if (!allowed) {
        return res.status(403).json({
          ok: false,
          message: 'No tienes permisos para realizar esta acción.',
          permiso: permissionCode,
          modo_permisos: 'GRANULAR'
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

module.exports = {
  PERMISSION_CODES,
  hasPermission,
  hasLoadedSalesGranularPermissions,
  hasSalesVisualAccess,
  requireVentasPermission
};

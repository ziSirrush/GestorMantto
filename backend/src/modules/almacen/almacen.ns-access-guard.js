'use strict';

// El inventario NetSuite no tiene relaciones por persona o zona. Su alcance
// se deriva exclusivamente de las llaves maestras del usuario efectivo.
const db = require('../../config/db');
const { requireAuth } = require('../../middleware/auth.middleware');
const { hasEffectivePermission } = require('../../services/permissions/effective-permission.service');
const {
  resolveMasterAccess_gnral
} = require('../../services/alcance/alcance-resolver.service');

const SUBSIDIARIES = Object.freeze({
  CORELLIAN: Object.freeze({
    id: '2',
    domain: 'CORELLIAN',
    aliases: Object.freeze(['Corellian', 'Corellian SA de CV', 'Corellian S.A de C.V'])
  }),
  NUBIAN: Object.freeze({
    id: '3',
    domain: 'NUBIAN',
    aliases: Object.freeze(['Nubian', 'Nubian SA de CV', 'Nubian S.A de C.V'])
  }),
  UNITED: Object.freeze({
    id: '5',
    domain: 'UNITED',
    aliases: Object.freeze(['United', 'United Elevadores'])
  })
});

function effectiveUserId(req) {
  const user = req?.contextUser || req?.user || {};
  const id = Number(user.id_SB || user.id || user.user_id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function actorUserId(req) {
  const user = req?.actorUser || req?.user || {};
  const id = Number(user.id_SB || user.id || user.user_id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function isSafeRead(req) {
  return ['GET', 'HEAD', 'OPTIONS'].includes(String(req?.method || 'GET').toUpperCase());
}

function buildAlmacenNsScope(masterKeys = {}) {
  const corellian = masterKeys.corellian === true;
  const united = masterKeys.united === true;
  const subsidiaries = [];

  if (corellian) subsidiaries.push(SUBSIDIARIES.CORELLIAN);
  // NUBIAN no crea un tercer dominio: exige simultaneamente las dos llaves.
  if (corellian && united) subsidiaries.push(SUBSIDIARIES.NUBIAN);
  if (united) subsidiaries.push(SUBSIDIARIES.UNITED);

  if (!subsidiaries.length) return null;
  return Object.freeze({
    masterKeys: Object.freeze({ corellian, united }),
    domains: Object.freeze([
      ...(corellian ? ['CORELLIAN'] : []),
      ...(united ? ['UNITED'] : [])
    ]),
    subsidiaries: Object.freeze(subsidiaries),
    subsidiaryIds: Object.freeze(subsidiaries.map((item) => item.id))
  });
}

function deny(res, status, code, message) {
  return res.status(status).json({ ok: false, code, message });
}

function almacenNsAccessGuard(permissionCodesAny) {
  const permissionCodes = [...new Set((Array.isArray(permissionCodesAny)
    ? permissionCodesAny
    : [permissionCodesAny])
    .map((value) => String(value || '').trim())
    .filter(Boolean))];

  if (!permissionCodes.length) {
    throw new Error('Almacen NetSuite requiere al menos un permiso funcional.');
  }

  return [requireAuth, async function almacenNsScopeGuard(req, res, next) {
    let connection;
    try {
      const userId = effectiveUserId(req);
      if (!userId) {
        return deny(res, 401, 'EFFECTIVE_USER_REQUIRED', 'Sesion requerida.');
      }
      if (req.viewerContext?.active && !isSafeRead(req)) {
        return deny(res, 403, 'VIEWER_READ_ONLY', 'El Visor de usuarios es de solo lectura.');
      }

      connection = await db.getConnection();
      let grantedPermissionCode = null;
      for (const permissionCode of permissionCodes) {
        if (await hasEffectivePermission(userId, permissionCode, connection)) {
          grantedPermissionCode = permissionCode;
          break;
        }
      }
      if (!grantedPermissionCode) {
        return deny(res, 403, 'FUNCTIONAL_PERMISSION_DENIED', 'No tienes permisos para acceder a esta informacion.');
      }

      const corellian = await resolveMasterAccess_gnral(connection, req, 'CORELLIAN');
      const united = await resolveMasterAccess_gnral(connection, req, 'UNITED');
      const scope = buildAlmacenNsScope({
        corellian: corellian?.enabled === true,
        united: united?.enabled === true
      });
      if (!scope) {
        return deny(res, 403, 'ALMACEN_NS_SCOPE_UNRESOLVED', 'No tienes una llave maestra autorizada para consultar Almacen.');
      }

      req.almacenNsScope = scope;
      req.informationAccess = Object.freeze({
        actor_user_id: actorUserId(req),
        effective_user_id: userId,
        permission_code: grantedPermissionCode,
        permission_codes_any: Object.freeze([...permissionCodes]),
        acceso_puerta: true,
        acceso_dominio_completo: true,
        dominios: scope.domains,
        subsidiarias_ns: scope.subsidiaries,
        subsidiaryIds: scope.subsidiaryIds
      });
      return next();
    } catch (error) {
      console.error('[ALMACEN_NS_ACCESS_GUARD]', error);
      return deny(res, error?.status === 401 ? 401 : 503,
        error?.code || 'ALMACEN_NS_SCOPE_UNAVAILABLE',
        error?.status === 401 ? error.message : 'No fue posible validar el alcance de Almacen.');
    } finally {
      if (connection) connection.release();
    }
  }];
}

module.exports = {
  SUBSIDIARIES,
  buildAlmacenNsScope,
  almacenNsAccessGuard
};

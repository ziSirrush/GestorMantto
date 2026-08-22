'use strict';

const db = require('../config/db');
const { requireAuth } = require('./auth.middleware');
const { hasEffectivePermission } = require('../services/permissions/effective-permission.service');
const {
  GENERAL_COMPANY,
  resolveAlcanceGnral_gnral
} = require('../services/alcance/alcance-gnral.service');
const {
  CORELLIAN_COMPANY
} = require('../services/alcance/alcance-cor.service');
const {
  UNITED_COMPANY
} = require('../services/alcance/alcance-uni.service');
const {
  normalizeGroupingCompany_gnral,
  resolveInformationDoor_gnral,
  resolveMasterAccess_gnral,
  resolveAlcanceByGrouping_gnral
} = require('../services/alcance/alcance-resolver.service');

const SUPPORTED_DOMAINS_GNRAL = new Set([
  GENERAL_COMPANY,
  CORELLIAN_COMPANY,
  UNITED_COMPANY
]);
const SAFE_READ_METHODS_GNRAL = new Set(['GET', 'HEAD', 'OPTIONS']);

function guardConfigurationError_gnral(message) {
  const error = new Error(message);
  error.status = 500;
  error.code = 'INFORMATION_GUARD_CONFIGURATION_ERROR';
  return error;
}

function normalizePositiveInteger_gnral(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeDomain_gnral(value) {
  if (value == null || value === '') return null;
  const domain = normalizeGroupingCompany_gnral(value);
  if (!domain || !SUPPORTED_DOMAINS_GNRAL.has(domain)) {
    throw guardConfigurationError_gnral(
      `Dominio no soportado por Guard General: ${String(value || '').trim() || '(vacio)'}.`
    );
  }
  return domain;
}

function normalizeStringList_gnral(values) {
  const source = Array.isArray(values) ? values : (values == null ? [] : [values]);
  return [...new Set(source.map((value) => String(value || '').trim()).filter(Boolean))];
}

function normalizePositiveIntegerList_gnral(values) {
  const source = Array.isArray(values) ? values : (values == null ? [] : [values]);
  return [...new Set(source.map(normalizePositiveInteger_gnral).filter(Boolean))];
}

function normalizeGroupingPermissionPairs_gnral(values) {
  const source = Array.isArray(values) ? values : [];

  return source.map((pair, index) => {
    if (!pair || typeof pair !== 'object' || Array.isArray(pair)) {
      throw guardConfigurationError_gnral(
        `groupingPermissionPairsAny[${index}] debe ser un objeto de configuracion.`
      );
    }

    const groupingId = pair.groupingId == null
      ? null
      : normalizePositiveInteger_gnral(pair.groupingId);
    const groupingCode = String(pair.groupingCode || '').trim() || null;

    if (pair.groupingId != null && !groupingId) {
      throw guardConfigurationError_gnral(
        `groupingPermissionPairsAny[${index}].groupingId debe ser un entero positivo.`
      );
    }
    if ((groupingId && groupingCode) || (!groupingId && !groupingCode)) {
      throw guardConfigurationError_gnral(
        `groupingPermissionPairsAny[${index}] requiere exactamente groupingId o groupingCode.`
      );
    }

    const permissionCodesAny = normalizeStringList_gnral([
      pair.permissionCode,
      ...(Array.isArray(pair.permissionCodesAny) ? pair.permissionCodesAny : [])
    ]);
    if (!permissionCodesAny.length) {
      throw guardConfigurationError_gnral(
        `groupingPermissionPairsAny[${index}] requiere permissionCode o permissionCodesAny.`
      );
    }

    return { groupingId, groupingCode, permissionCodesAny };
  });
}

function normalizeGuardConfiguration_gnral(options = {}) {
  const directPermissionCodesAny = normalizeStringList_gnral([
    options.permissionCode,
    ...(Array.isArray(options.permissionCodesAny) ? options.permissionCodesAny : [])
  ]);
  const groupingPermissionPairsAny = normalizeGroupingPermissionPairs_gnral(
    options.groupingPermissionPairsAny
  );

  if (!directPermissionCodesAny.length && !groupingPermissionPairsAny.length) {
    throw guardConfigurationError_gnral(
      'Guard General requiere permissionCode, permissionCodesAny o groupingPermissionPairsAny.'
    );
  }
  if (directPermissionCodesAny.length && groupingPermissionPairsAny.length) {
    throw guardConfigurationError_gnral(
      'Guard General no permite mezclar permisos globales con groupingPermissionPairsAny.'
    );
  }

  const hasDirectGroupingConfiguration = Boolean(
    options.groupingId != null
    || options.groupingCode != null
    || (Array.isArray(options.groupingIdsAny) && options.groupingIdsAny.length)
    || (Array.isArray(options.groupingCodesAny) && options.groupingCodesAny.length)
  );
  if (groupingPermissionPairsAny.length && hasDirectGroupingConfiguration) {
    throw guardConfigurationError_gnral(
      'Guard General no permite mezclar agrupaciones globales con groupingPermissionPairsAny.'
    );
  }

  const domain = normalizeDomain_gnral(options.domain);
  const groupingIdsAny = groupingPermissionPairsAny.length
    ? normalizePositiveIntegerList_gnral(groupingPermissionPairsAny.map((pair) => pair.groupingId))
    : normalizePositiveIntegerList_gnral([
      options.groupingId,
      ...(Array.isArray(options.groupingIdsAny) ? options.groupingIdsAny : [])
    ]);
  const groupingCodesAny = groupingPermissionPairsAny.length
    ? normalizeStringList_gnral(groupingPermissionPairsAny.map((pair) => pair.groupingCode))
    : normalizeStringList_gnral([
      options.groupingCode,
      ...(Array.isArray(options.groupingCodesAny) ? options.groupingCodesAny : [])
    ]);

  if (options.groupingId != null && !normalizePositiveInteger_gnral(options.groupingId)) {
    throw guardConfigurationError_gnral('groupingId debe ser un entero positivo.');
  }

  if (!domain && !groupingIdsAny.length && !groupingCodesAny.length) {
    throw guardConfigurationError_gnral(
      'Guard General requiere domain y/o una agrupacion de informacion.'
    );
  }

  const permissionCodesAny = groupingPermissionPairsAny.length
    ? normalizeStringList_gnral(groupingPermissionPairsAny.flatMap((pair) => pair.permissionCodesAny))
    : directPermissionCodesAny;

  return {
    permissionCode: permissionCodesAny[0],
    permissionCodesAny,
    directPermissionCodesAny,
    groupingPermissionPairsAny,
    domain,
    groupingId: groupingIdsAny[0] || null,
    groupingCode: groupingCodesAny[0] || null,
    groupingIdsAny,
    groupingCodesAny
  };
}

function effectiveUserFromRequest_gnral(req) {
  return req?.contextUser || req?.user || null;
}

function actorUserFromRequest_gnral(req) {
  return req?.actorUser || req?.user || null;
}

function positiveUserId_gnral(user) {
  return normalizePositiveInteger_gnral(user?.id_SB || user?.id || user?.user_id);
}

function isSafeReadMethod_gnral(req) {
  return SAFE_READ_METHODS_GNRAL.has(String(req?.method || 'GET').toUpperCase());
}

async function resolveGuardGroupings_gnral(connection, configuration) {
  const ids = configuration.groupingIdsAny || [];
  const codes = configuration.groupingCodesAny || [];
  if (!ids.length && !codes.length) return [];

  const rows = [];
  const seen = new Set();

  for (const id of ids) {
    const [found] = await connection.query(
      `SELECT id_agrupacion, codigo, nombre, empresa, orden, activo
         FROM perm_agrupaciones
        WHERE activo = 1
          AND id_agrupacion = ?
        LIMIT 1`,
      [id]
    );
    if (!found.length) {
      throw guardConfigurationError_gnral(
        `La agrupacion configurada en Guard General no existe o esta inactiva: ${id}.`
      );
    }
    const groupingId = Number(found[0].id_agrupacion);
    if (!seen.has(groupingId)) {
      seen.add(groupingId);
      rows.push(found[0]);
    }
  }

  for (const code of codes) {
    const [found] = await connection.query(
      `SELECT id_agrupacion, codigo, nombre, empresa, orden, activo
         FROM perm_agrupaciones
        WHERE activo = 1
          AND codigo = ?
        LIMIT 1`,
      [code]
    );
    if (!found.length) {
      throw guardConfigurationError_gnral(
        `La agrupacion configurada en Guard General no existe o esta inactiva: ${code}.`
      );
    }
    const groupingId = Number(found[0].id_agrupacion);
    if (!seen.has(groupingId)) {
      seen.add(groupingId);
      rows.push(found[0]);
    }
  }

  return rows.map((row) => {
    const groupingDomain = normalizeGroupingCompany_gnral(row.empresa);
    if (!groupingDomain || !SUPPORTED_DOMAINS_GNRAL.has(groupingDomain)) {
      throw guardConfigurationError_gnral(
        `La agrupacion ${row.codigo || row.id_agrupacion} no pertenece a GENERAL, UNITED o CORELLIAN.`
      );
    }
    if (configuration.domain && configuration.domain !== groupingDomain) {
      throw guardConfigurationError_gnral(
        `La agrupacion ${row.codigo || row.id_agrupacion} pertenece a ${groupingDomain}, no a ${configuration.domain}.`
      );
    }
    return {
      id_agrupacion: Number(row.id_agrupacion),
      codigo: row.codigo,
      nombre: row.nombre,
      empresa_origen: row.empresa,
      empresa: groupingDomain,
      activo: true,
      dominio: groupingDomain
    };
  });
}

async function resolveEffectivePermission_gnral(connection, userId, permissionCodes) {
  for (const permissionCode of permissionCodes) {
    if (await hasEffectivePermission(userId, permissionCode, connection)) {
      return permissionCode;
    }
  }
  return null;
}

function denyFunctionalPermission_gnral(res) {
  return res.status(403).json({
    ok: false,
    code: 'FUNCTIONAL_PERMISSION_DENIED',
    message: 'No tienes permisos para acceder a esta informacion.'
  });
}

function denyGeneralInformationAccess_gnral(res) {
  return res.status(403).json({
    ok: false,
    code: 'INFORMATION_ACCESS_DENIED',
    message: 'No tienes alcance de informacion para esta seccion.'
  });
}

function denyViewerWrite_gnral(res) {
  return res.status(403).json({
    ok: false,
    code: 'VIEWER_READ_ONLY',
    message: 'El Visor de usuarios es de solo lectura.'
  });
}

function failClosed_gnral(res, error) {
  console.error('[INFORMATION_ACCESS_GUARD]', error);
  return res.status(error?.status === 500 ? 500 : 503).json({
    ok: false,
    code: error?.code === 'INFORMATION_GUARD_CONFIGURATION_ERROR'
      ? error.code
      : 'INFORMATION_SCOPE_UNAVAILABLE',
    message: error?.code === 'INFORMATION_GUARD_CONFIGURATION_ERROR'
      ? 'El Guard General de informacion esta mal configurado.'
      : 'No fue posible validar el alcance de informacion.'
  });
}

function buildInformationAccessContext_gnral({
  req,
  configuration,
  groupings,
  allowedGrouping,
  door,
  scope,
  grantedPermissionCode
}) {
  const effectiveUser = effectiveUserFromRequest_gnral(req);
  const actorUser = actorUserFromRequest_gnral(req);
  const effectiveUserId = positiveUserId_gnral(effectiveUser);
  const actorUserId = positiveUserId_gnral(actorUser);
  const domain = scope?.empresa
    || configuration.domain
    || allowedGrouping?.empresa
    || groupings[0]?.empresa
    || null;
  const masterKey = scope?.llave_maestra === true;
  const completeDomain = masterKey
    && !(domain === UNITED_COMPANY && scope?.requiere_filtro_zona === true);

  return {
    actor_user_id: actorUserId,
    effective_user_id: effectiveUserId,
    permission_code: grantedPermissionCode,
    permission_codes_any: [...configuration.permissionCodesAny],
    dominio: domain,
    empresa: domain,
    motor: scope?.motor || null,
    agrupacion: allowedGrouping || groupings[0] || null,
    agrupaciones: groupings,
    acceso_puerta: true,
    acceso_puerta_via: door?.via || (domain === GENERAL_COMPANY ? 'GENERAL_DEFAULT' : null),
    acceso_dominio_completo: completeDomain,
    llave_maestra: masterKey,

    // Compatibilidad CORELLIAN con los filtros ya existentes.
    requiere_filtro_usuario: scope?.requiere_filtro_usuario === true,
    usuarios_visibles: scope?.requiere_filtro_usuario === true
      ? [...(scope.usuarios_visibles || [])]
      : null,
    usuarios_automaticos: Array.isArray(scope?.usuarios_automaticos)
      ? [...scope.usuarios_automaticos]
      : null,
    usuarios_adicionales: Array.isArray(scope?.usuarios_adicionales)
      ? [...scope.usuarios_adicionales]
      : null,

    // Contrato territorial UNITED.
    requiere_filtro_zona: scope?.requiere_filtro_zona === true,
    zona_ids: scope?.requiere_filtro_zona === true ? [...(scope.zona_ids || [])] : null,
    zona_codigos: scope?.requiere_filtro_zona === true ? [...(scope.zona_codigos || [])] : null,
    zonas_operativas: Array.isArray(scope?.zonas_operativas)
      ? [...scope.zonas_operativas]
      : scope?.zonas_operativas ?? null,

    // Contrato GENERAL.
    identidad: scope?.identidad || null,
    reglas: scope?.reglas || null,
    alcance: scope
  };
}

function informationAccessContext_gnral(source) {
  return source?.informationAccess || source || null;
}

function informationAccessRequiresUserFilter_gnral(source) {
  const context = informationAccessContext_gnral(source);
  return Boolean(context && context.requiere_filtro_usuario);
}

function informationAccessVisibleUserIds_gnral(source) {
  const context = informationAccessContext_gnral(source);
  if (!context) return [];
  if (!context.requiere_filtro_usuario) return null;
  return [...new Set((Array.isArray(context.usuarios_visibles) ? context.usuarios_visibles : [])
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0))]
    .sort((a, b) => a - b);
}

function informationAccessAllowsUser_gnral(source, userId) {
  const context = informationAccessContext_gnral(source);
  const targetId = normalizePositiveInteger_gnral(userId);
  if (!context || !targetId) return false;
  if (!context.requiere_filtro_usuario) return true;
  return informationAccessVisibleUserIds_gnral(context).includes(targetId);
}

function informationAccessZoneIds_gnral(source) {
  const context = informationAccessContext_gnral(source);
  if (!context) return [];
  if (!context.requiere_filtro_zona) return null;
  return [...new Set((Array.isArray(context.zona_ids) ? context.zona_ids : [])
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0))]
    .sort((a, b) => a - b);
}

async function resolveDomainOnlyScope_gnral(connection, req, domain) {
  if (domain === GENERAL_COMPANY) {
    const master = await resolveMasterAccess_gnral(connection, req, GENERAL_COMPANY);
    return {
      door: {
        allowed: true,
        masterAccess: master.enabled,
        via: master.enabled ? (master.source || 'DOMINIO_COMPLETO') : 'GENERAL_DEFAULT',
        grouping: null
      },
      grouping: null,
      scope: resolveAlcanceGnral_gnral(req, { masterAccess: master.enabled })
    };
  }

  const master = await resolveMasterAccess_gnral(connection, req, domain);
  if (!master.enabled) return { door: { allowed: false }, grouping: null, scope: null };

  const syntheticGrouping = {
    id_agrupacion: null,
    codigo: `__DOMINIO_${domain}__`,
    nombre: domain,
    empresa: domain,
    activo: 1
  };
  const scope = await resolveAlcanceByGrouping_gnral(
    connection,
    req,
    syntheticGrouping,
    { masterAccess: true }
  );
  return {
    door: { allowed: true, masterAccess: true, via: master.source || 'DOMINIO_COMPLETO', grouping: syntheticGrouping },
    grouping: syntheticGrouping,
    scope
  };
}

function buildInformationAccessGuard_gnral(options = {}) {
  const configuration = normalizeGuardConfiguration_gnral(options);

  return async function informationAccessGuard_gnral(req, res, next) {
    let connection;
    try {
      const effectiveUser = effectiveUserFromRequest_gnral(req);
      const effectiveUserId = positiveUserId_gnral(effectiveUser);
      if (!effectiveUserId) {
        return res.status(401).json({
          ok: false,
          code: 'EFFECTIVE_USER_REQUIRED',
          message: 'Sesion requerida.'
        });
      }

      if (req.viewerContext?.active && !isSafeReadMethod_gnral(req)) {
        return denyViewerWrite_gnral(res);
      }

      connection = await db.getConnection();

      let groupings = [];
      let grantedPermissionCode = null;
      let allowedGrouping = null;
      let door = null;
      let scope = null;

      if (configuration.groupingPermissionPairsAny.length) {
        // Modo emparejado: conserva el flujo introducido por F3/F4.
        // Se resuelven las agrupaciones necesarias para poder evaluar cada
        // par permiso + puerta de manera atomica.
        groupings = await resolveGuardGroupings_gnral(connection, configuration);
        let hasFunctionalPermissionInAnyPair = false;

        for (const pair of configuration.groupingPermissionPairsAny) {
          const grouping = groupings.find((candidate) => (
            pair.groupingId
              ? Number(candidate.id_agrupacion) === Number(pair.groupingId)
              : String(candidate.codigo || '').trim() === String(pair.groupingCode || '').trim()
          ));
          if (!grouping) {
            throw guardConfigurationError_gnral(
              `No fue posible resolver la agrupacion emparejada ${pair.groupingCode || pair.groupingId}.`
            );
          }

          const pairPermission = await resolveEffectivePermission_gnral(
            connection,
            effectiveUserId,
            pair.permissionCodesAny
          );
          if (!pairPermission) continue;
          hasFunctionalPermissionInAnyPair = true;

          const candidateDoor = await resolveInformationDoor_gnral(connection, req, grouping);
          if (!candidateDoor.allowed) continue;

          grantedPermissionCode = pairPermission;
          allowedGrouping = candidateDoor.grouping || grouping;
          door = candidateDoor;
          break;
        }

        if (!grantedPermissionCode) {
          return hasFunctionalPermissionInAnyPair
            ? denyGeneralInformationAccess_gnral(res)
            : denyFunctionalPermission_gnral(res);
        }

        scope = await resolveAlcanceByGrouping_gnral(
          connection,
          req,
          allowedGrouping,
          { masterAccess: door.masterAccess === true }
        );
      } else {
        // Modo historico: restaurar exactamente el orden previo al FIX F3/F4.
        // Pregunta 1: permiso funcional. Si falla, no se consulta la
        // configuracion de agrupaciones ni las puertas de informacion.
        grantedPermissionCode = await resolveEffectivePermission_gnral(
          connection,
          effectiveUserId,
          configuration.permissionCodesAny
        );
        if (!grantedPermissionCode) return denyFunctionalPermission_gnral(res);

        groupings = await resolveGuardGroupings_gnral(connection, configuration);

        if (groupings.length) {
          // Pregunta 2: puerta de informacion. La primera agrupacion autorizada
          // determina el motor por perm_agrupaciones.empresa.
          for (const grouping of groupings) {
            const candidateDoor = await resolveInformationDoor_gnral(connection, req, grouping);
            if (candidateDoor.allowed) {
              allowedGrouping = candidateDoor.grouping || grouping;
              door = candidateDoor;
              break;
            }
          }
          if (!door?.allowed) return denyGeneralInformationAccess_gnral(res);

          scope = await resolveAlcanceByGrouping_gnral(
            connection,
            req,
            allowedGrouping,
            { masterAccess: door.masterAccess === true }
          );
        } else {
          const domain = configuration.domain;
          if (!domain) {
            throw guardConfigurationError_gnral('No fue posible resolver empresa/agrupacion del Guard General.');
          }
          const resolved = await resolveDomainOnlyScope_gnral(connection, req, domain);
          if (!resolved.door?.allowed) return denyGeneralInformationAccess_gnral(res);
          door = resolved.door;
          allowedGrouping = resolved.grouping;
          scope = resolved.scope;
        }
      }

      if (!scope?.motor || !scope?.empresa) {
        throw guardConfigurationError_gnral('El motor global de alcance no devolvio un contexto valido.');
      }

      req.informationAccess = buildInformationAccessContext_gnral({
        req,
        configuration,
        groupings,
        allowedGrouping,
        door,
        scope,
        grantedPermissionCode
      });

      return next();
    } catch (error) {
      return failClosed_gnral(res, error);
    } finally {
      if (connection) connection.release();
    }
  };
}

function humanInformationGuard_gnral(options = {}) {
  return [requireAuth, buildInformationAccessGuard_gnral(options)];
}

function dynamicHumanInformationGuard_gnral(resolveOptions) {
  if (typeof resolveOptions !== 'function') {
    throw guardConfigurationError_gnral('dynamicHumanInformationGuard_gnral requiere una funcion de configuracion.');
  }
  return [
    requireAuth,
    async function dynamicInformationAccessGuard_gnral(req, res, next) {
      try {
        const options = resolveOptions(req) || {};
        return buildInformationAccessGuard_gnral(options)(req, res, next);
      } catch (error) {
        return failClosed_gnral(res, error);
      }
    }
  ];
}

function requireCompleteInformationDomain_gnral(domain) {
  const expectedDomain = normalizeDomain_gnral(domain);
  return function completeInformationDomainGuard_gnral(req, res, next) {
    const context = informationAccessContext_gnral(req);
    if (
      context
      && context.acceso_dominio_completo === true
      && String(context.dominio || '').trim().toUpperCase() === expectedDomain
    ) {
      return next();
    }
    return res.status(403).json({
      ok: false,
      code: 'INFORMATION_COMPLETE_DOMAIN_REQUIRED',
      message: 'Esta consulta agregada requiere acceso completo al dominio.'
    });
  };
}

module.exports = {
  normalizeGuardConfiguration_gnral,
  buildInformationAccessGuard_gnral,
  humanInformationGuard_gnral,
  dynamicHumanInformationGuard_gnral,
  requireCompleteInformationDomain_gnral,
  informationAccessContext_gnral,
  informationAccessRequiresUserFilter_gnral,
  informationAccessVisibleUserIds_gnral,
  informationAccessAllowsUser_gnral,
  informationAccessZoneIds_gnral
};

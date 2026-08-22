'use strict';

const {
  hasEffectivePermission
} = require('../permissions/effective-permission.service');
const {
  resolveInformationDoor_gnral,
  resolveAlcanceByGrouping_gnral
} = require('./alcance-resolver.service');

const CROSS_BLOCK_REASON = Object.freeze({
  ALLOWED: 'ALLOWED',
  FUNCTIONAL_PERMISSION_DENIED: 'FUNCTIONAL_PERMISSION_DENIED',
  INFORMATION_DOOR_DENIED: 'INFORMATION_DOOR_DENIED',
  INFORMATION_SCOPE_DENIED: 'INFORMATION_SCOPE_DENIED'
});

function configurationError_cross(message) {
  const error = new Error(message);
  error.status = 500;
  error.code = 'INFORMACION_CRUZADA_CONFIGURATION_ERROR';
  return error;
}

function userRequiredError_cross() {
  const error = new Error('Usuario efectivo no disponible para validar informacion cruzada.');
  error.status = 401;
  error.code = 'INFORMACION_CRUZADA_USER_REQUIRED';
  return error;
}

function normalizePositiveInteger_cross(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function effectiveUserFromSource_cross(source) {
  if (!source) return null;
  if (source.contextUser || source.user) return source.contextUser || source.user;
  return source;
}

function effectiveUserId_cross(source) {
  const user = effectiveUserFromSource_cross(source) || {};
  return normalizePositiveInteger_cross(user.id_SB || user.id || user.user_id);
}

function assertExecutor_cross(executor) {
  if (!executor || typeof executor.query !== 'function') {
    throw configurationError_cross('Executor SQL no disponible para informacion cruzada.');
  }
  return executor;
}

function normalizeStringList_cross(values) {
  const source = Array.isArray(values) ? values : (values == null ? [] : [values]);
  return [...new Set(source
    .map((value) => String(value || '').trim())
    .filter(Boolean))];
}

function normalizeBlockDefinition_cross(definition) {
  const source = definition || {};
  const codigo = String(source.codigo || source.code || '').trim();
  const payloadKey = String(source.payloadKey || source.payload_key || codigo).trim();
  const permissionCodesAny = normalizeStringList_cross([
    source.permissionCode,
    ...(Array.isArray(source.permissionCodesAny) ? source.permissionCodesAny : [])
  ]);
  const groupingRef = source.groupingRef ?? source.grouping ?? source.agrupacion ?? null;

  if (!codigo) throw configurationError_cross('Cada bloque cruzado requiere codigo.');
  if (!payloadKey) throw configurationError_cross(`El bloque ${codigo} requiere payloadKey.`);
  if (!permissionCodesAny.length) {
    throw configurationError_cross(`El bloque ${codigo} requiere permissionCode o permissionCodesAny.`);
  }
  if (groupingRef == null || groupingRef === '') {
    throw configurationError_cross(`El bloque ${codigo} requiere groupingRef.`);
  }

  return {
    codigo,
    payloadKey,
    permissionCodesAny,
    groupingRef,
    recordScopeCheck: typeof source.recordScopeCheck === 'function' ? source.recordScopeCheck : null,
    load: typeof source.load === 'function' ? source.load : null,
    meta: source.meta && typeof source.meta === 'object' ? source.meta : null
  };
}

async function resolveAnyEffectivePermission_cross(
  executor,
  userId,
  permissionCodes,
  permissionResolver = hasEffectivePermission
) {
  const db = assertExecutor_cross(executor);
  const id = normalizePositiveInteger_cross(userId);
  if (!id) throw userRequiredError_cross();
  if (typeof permissionResolver !== 'function') {
    throw configurationError_cross('Resolver de permisos no disponible para informacion cruzada.');
  }

  const codes = normalizeStringList_cross(permissionCodes);
  for (const code of codes) {
    if (await permissionResolver(id, code, db)) return code;
  }
  return null;
}

function normalizeScopeCheckResult_cross(value) {
  if (value === true) return { allowed: true, reason: null, meta: null };
  if (value === false || value == null) {
    return { allowed: false, reason: CROSS_BLOCK_REASON.INFORMATION_SCOPE_DENIED, meta: null };
  }

  if (typeof value !== 'object') {
    throw configurationError_cross('recordScopeCheck debe devolver boolean u objeto { allowed }.');
  }

  return {
    allowed: value.allowed === true,
    reason: value.allowed === true
      ? null
      : String(value.reason || CROSS_BLOCK_REASON.INFORMATION_SCOPE_DENIED),
    meta: value.meta && typeof value.meta === 'object' ? value.meta : null
  };
}

function deniedDecision_cross({ block, userId, permissionCode = null, reason, scope = null, scopeMeta = null }) {
  return {
    codigo: block.codigo,
    payload_key: block.payloadKey,
    visible: false,
    consultar: false,
    motivo: reason,
    effective_user_id: userId,
    permiso_otorgado: permissionCode,
    agrupacion: scope?.agrupacion || null,
    motor: scope?.motor || null,
    empresa: scope?.empresa || null,
    llave_maestra: Boolean(scope?.llave_maestra),
    alcance_meta: scopeMeta || null,
    meta: block.meta || null
  };
}

function allowedDecision_cross({ block, userId, permissionCode, scope, scopeMeta = null }) {
  return {
    codigo: block.codigo,
    payload_key: block.payloadKey,
    visible: true,
    consultar: true,
    motivo: CROSS_BLOCK_REASON.ALLOWED,
    effective_user_id: userId,
    permiso_otorgado: permissionCode,
    agrupacion: scope?.agrupacion || null,
    motor: scope?.motor || null,
    empresa: scope?.empresa || null,
    llave_maestra: Boolean(scope?.llave_maestra),
    alcance_meta: scopeMeta || null,
    meta: block.meta || null,
    alcance: scope
  };
}

/**
 * Tercera capa para vistas que mezclan informacion de varios modulos.
 *
 * Orden obligatorio por bloque hijo:
 * 1. permiso funcional propio del bloque;
 * 2. puerta de informacion propia de la agrupacion del bloque;
 * 3. alcance del registro/contexto propio del bloque;
 * 4. solo si las tres capas pasan, se autoriza consultar/cargar el bloque.
 *
 * El acceso al padre NO se hereda al hijo.
 * Una llave DOMINIO_COMPLETO validada conserva el permiso funcional como
 * requisito, pero elimina el filtro interno de registros de su propio dominio.
 */
async function resolveCrossInformationBlock_gnral(
  executor,
  source,
  definition,
  options = {}
) {
  const db = assertExecutor_cross(executor);
  const block = normalizeBlockDefinition_cross(definition);
  const userId = effectiveUserId_cross(source);
  if (!userId) throw userRequiredError_cross();

  const permissionResolver = options.permissionResolver || hasEffectivePermission;
  const scopeResolver = options.scopeResolver || resolveAlcanceByGrouping_gnral;
  if (typeof scopeResolver !== 'function') {
    throw configurationError_cross('Resolver de alcance no disponible para informacion cruzada.');
  }

  const permissionCode = await resolveAnyEffectivePermission_cross(
    db,
    userId,
    block.permissionCodesAny,
    permissionResolver
  );
  if (!permissionCode) {
    return deniedDecision_cross({
      block,
      userId,
      reason: CROSS_BLOCK_REASON.FUNCTIONAL_PERMISSION_DENIED
    });
  }

  const doorResolver = options.doorResolver || resolveInformationDoor_gnral;
  if (typeof doorResolver !== 'function') {
    throw configurationError_cross('Resolver de puerta no disponible para informacion cruzada.');
  }
  const doorOptions = {};
  if (Object.prototype.hasOwnProperty.call(options, 'masterAccess')) {
    doorOptions.masterAccess = options.masterAccess === true;
  }
  const door = await doorResolver(db, source, block.groupingRef, doorOptions);
  if (!door?.allowed) {
    return deniedDecision_cross({
      block,
      userId,
      permissionCode,
      reason: CROSS_BLOCK_REASON.INFORMATION_DOOR_DENIED,
      scopeMeta: { puerta: door || null }
    });
  }

  const scope = await scopeResolver(db, source, door.grouping || block.groupingRef, {
    masterAccess: door.masterAccess === true
  });

  // DOMINIO_COMPLETO ya fue validado por la capa de puerta/resolver.
  // Mantiene el permiso funcional, pero no debe reintroducir un filtro de
  // registro dentro del mismo dominio, incluido UNITED.
  if (scope?.llave_maestra === true) {
    return allowedDecision_cross({
      block,
      userId,
      permissionCode,
      scope,
      scopeMeta: { puerta: door }
    });
  }

  if (!block.recordScopeCheck) {
    throw configurationError_cross(
      `El bloque ${block.codigo} requiere recordScopeCheck para validar el registro concreto.`
    );
  }

  const scopeCheck = normalizeScopeCheckResult_cross(await block.recordScopeCheck({
    executor: db,
    source,
    block,
    scope,
    door,
    userId,
    permissionCode
  }));

  if (!scopeCheck.allowed) {
    return deniedDecision_cross({
      block,
      userId,
      permissionCode,
      reason: scopeCheck.reason || CROSS_BLOCK_REASON.INFORMATION_SCOPE_DENIED,
      scope,
      scopeMeta: { puerta: door, ...(scopeCheck.meta || {}) }
    });
  }

  return allowedDecision_cross({
    block,
    userId,
    permissionCode,
    scope,
    scopeMeta: { puerta: door, ...(scopeCheck.meta || {}) }
  });
}

async function loadCrossInformationBlock_gnral(executor, source, definition, options = {}) {
  const block = normalizeBlockDefinition_cross(definition);
  if (!block.load) {
    throw configurationError_cross(`El bloque ${block.codigo} requiere load para cargar informacion.`);
  }

  const access = await resolveCrossInformationBlock_gnral(executor, source, block, options);
  if (!access.visible || !access.consultar) {
    return {
      codigo: block.codigo,
      payload_key: block.payloadKey,
      incluido: false,
      acceso: access
    };
  }

  const data = await block.load({
    executor,
    source,
    block,
    access,
    scope: access.alcance
  });

  return {
    codigo: block.codigo,
    payload_key: block.payloadKey,
    incluido: true,
    acceso: access,
    data
  };
}

async function loadCrossInformationBlocks_gnral(executor, source, definitions, options = {}) {
  const items = Array.isArray(definitions) ? definitions : [];
  const results = [];

  for (const definition of items) {
    results.push(await loadCrossInformationBlock_gnral(executor, source, definition, options));
  }
  return results;
}

function mergeCrossInformationPayload_gnral(basePayload, blockResults, options = {}) {
  const payload = {
    ...(basePayload && typeof basePayload === 'object' ? basePayload : {})
  };
  const visibility = {};

  for (const result of (Array.isArray(blockResults) ? blockResults : [])) {
    const key = String(result?.payload_key || '').trim();
    if (!key) continue;

    const visible = result?.incluido === true && result?.acceso?.visible === true;
    visibility[key] = visible;
    if (visible) payload[key] = result.data;
    else delete payload[key];
  }

  if (options.includeVisibility === true) {
    payload.secciones_disponibles = visibility;
  }

  return payload;
}

module.exports = {
  CROSS_BLOCK_REASON,
  effectiveUserId_cross,
  normalizeBlockDefinition_cross,
  resolveAnyEffectivePermission_cross,
  resolveCrossInformationBlock_gnral,
  loadCrossInformationBlock_gnral,
  loadCrossInformationBlocks_gnral,
  mergeCrossInformationPayload_gnral
};

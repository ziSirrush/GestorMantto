'use strict';

const legacyVisibility = require('./ventas-visibility.legacy.service');
const {
  resolveInformationScopeForContext_gnral,
  hasCompleteDomain_gnral,
  effectiveUserIdFromContext_gnral,
  runInformationScopeWithFallback_gnral
} = require('../../services/information-scope-gnral.service');

function normalizeVisibleUserIds_cor(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0))]
    .sort((a, b) => a - b);
}

function resolveGuardScope_cor(actionContext) {
  const informationAccess = actionContext?.informationAccess || null;
  if (!informationAccess) return null;

  const domain = String(informationAccess.dominio || '').trim().toUpperCase();
  if (domain !== 'CORELLIAN') return null;

  const actorId = effectiveUserIdFromContext_gnral(actionContext)
    || Number(informationAccess.effective_user_id)
    || null;
  const accessTotal = informationAccess.acceso_dominio_completo === true
    || informationAccess.requiere_filtro_usuario === false;
  const advisorIds = accessTotal
    ? []
    : normalizeVisibleUserIds_cor(informationAccess.usuarios_visibles);

  return {
    mode: accessTotal ? 'ALL' : 'LIMITED',
    accessTotal,
    advisorIds,
    actorId,
    profile: null,
    source: 'INFORMATION_ACCESS_GUARD',
    informationScope: informationAccess.alcance || null,
    informationAccess
  };
}

async function resolveModernScope_cor(connection, actionContext) {
  // Compatibilidad temporal para consumidores aun no migrados o integraciones que
  // no pasan por el Guard General. El resolver moderno sigue siendo la fuente.
  const informationScope = await resolveInformationScopeForContext_gnral(connection, actionContext);
  const actorId = effectiveUserIdFromContext_gnral(actionContext);
  const accessTotal = hasCompleteDomain_gnral(informationScope, 'CORELLIAN');
  const advisorIds = accessTotal
    ? []
    : normalizeVisibleUserIds_cor(informationScope.usuarios_visibles);

  return {
    mode: accessTotal ? 'ALL' : 'LIMITED',
    accessTotal,
    advisorIds,
    actorId,
    profile: null,
    source: 'INFORMATION_SCOPE',
    informationScope
  };
}

async function resolveVisibilityScope(connection, actionContext) {
  // Si la ruta humana ya paso por humanInformationGuard_gnral, ese resultado es
  // autoritativo. No debe ser reemplazado por INFORMATION_SCOPE_MODE=LEGACY ni
  // por una segunda resolucion especifica de Ventas.
  const guardedScope = resolveGuardScope_cor(actionContext);
  if (guardedScope) return guardedScope;

  return runInformationScopeWithFallback_gnral({
    label: 'ventas',
    modern: () => resolveModernScope_cor(connection, actionContext),
    legacy: () => legacyVisibility.resolveVisibilityScope(connection, actionContext)
  });
}

function toClientVisibility(scope) {
  if (!['INFORMATION_SCOPE', 'INFORMATION_ACCESS_GUARD'].includes(scope?.source)) {
    return legacyVisibility.toClientVisibility(scope);
  }
  return {
    acceso_total: Boolean(scope.accessTotal),
    modo: scope.mode,
    usuario_id: scope.actorId,
    ids_asesores_visibles: scope.accessTotal ? [] : scope.advisorIds,
    fuente: scope.source === 'INFORMATION_ACCESS_GUARD'
      ? 'GUARD_GENERAL_ALCANCE_INFORMACION'
      : 'ALCANCE_INFORMACION'
  };
}

module.exports = {
  resolveVisibilityScope,
  toClientVisibility,
  // Compatibilidad temporal para cualquier consumidor no migrado. No participan
  // en el camino normal cuando la peticion ya trae req.informationAccess.
  getProfile: legacyVisibility.getProfile,
  getDirectReportIds: legacyVisibility.getDirectReportIds,
  getAdminAdvisorIds_cor: legacyVisibility.getAdminAdvisorIds_cor
};

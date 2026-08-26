'use strict';

const VALID_POLICIES_GNRAL = new Set(['OBLIGATORIA', 'OPCIONAL']);

function boolWithDefault_gnral(value, fallback) {
  if (value === undefined || value === null) return Number(fallback) === 1;
  return value === true || value === 1 || value === '1';
}

function normalizePolicy_gnral(value) {
  const policy = String(value || '').trim().toUpperCase();
  return VALID_POLICIES_GNRAL.has(policy) ? policy : null;
}

function uniquePositiveIds_gnral(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(Number)
    .filter((value) => Number.isInteger(value) && value > 0))]
    .sort((a, b) => a - b);
}

function resolveMatrixRecipientDecision_gnral({ rows, event, zoneScope } = {}) {
  const userRows = Array.isArray(rows) ? rows : [];
  const scope = zoneScope || { noAplica: false, ids: [] };

  if (!userRows.length) {
    return {
      eligible: false,
      reason: 'USUARIO_INACTIVO_O_NO_EXISTE',
      policy: null,
      role_ids: [],
      bell_enabled: false,
      push_enabled: false,
      scope_allowed: false
    };
  }

  const applicableRows = userRows.filter((row) => {
    const roleId = Number(row.id_rol);
    const active = Number(row.configuracion_activa) === 1;
    return Number.isInteger(roleId) && roleId > 0 && active && normalizePolicy_gnral(row.politica);
  });

  if (!applicableRows.length) {
    return {
      eligible: false,
      reason: 'SIN_ROL_ASOCIADO',
      policy: null,
      role_ids: [],
      bell_enabled: false,
      push_enabled: false,
      scope_allowed: false
    };
  }

  const roleIds = uniquePositiveIds_gnral(applicableRows.map((row) => row.id_rol));
  const mandatory = applicableRows.some((row) => normalizePolicy_gnral(row.politica) === 'OBLIGATORIA');
  const policy = mandatory ? 'OBLIGATORIA' : 'OPCIONAL';

  const unitedMaster = userRows.some((row) => Number(row.united_dominio_completo) === 1);
  const zoneAuthorized = userRows.some((row) => Number(row.zona_autorizada) === 1);
  const scopeAllowed = scope.noAplica === true || unitedMaster || zoneAuthorized;

  if (!scopeAllowed) {
    return {
      eligible: false,
      reason: 'SIN_ALCANCE',
      policy,
      role_ids: roleIds,
      bell_enabled: false,
      push_enabled: false,
      scope_allowed: false,
      scope_via: 'DENEGADO'
    };
  }

  const preferenceRow = applicableRows.find((row) => (
    row.campana !== null || row.push !== null || row.silenciada !== null
  )) || applicableRows[0];

  let bellEnabled = false;
  let pushEnabled = false;

  if (mandatory) {
    bellEnabled = true;
    pushEnabled = true;
  } else {
    const silenced = Number(preferenceRow.silenciada || 0) === 1;
    if (!silenced) {
      bellEnabled = boolWithDefault_gnral(preferenceRow.campana, event?.campana_default ?? 1);
      pushEnabled = boolWithDefault_gnral(preferenceRow.push, event?.push_default ?? 0);
    }
  }

  if (!bellEnabled && !pushEnabled) {
    return {
      eligible: false,
      reason: 'PREFERENCIA_DESACTIVADA',
      policy,
      role_ids: roleIds,
      bell_enabled: false,
      push_enabled: false,
      scope_allowed: true,
      scope_via: scope.noAplica === true
        ? 'NO_APLICA'
        : (unitedMaster ? 'DOMINIO_COMPLETO' : 'ZONA_OPERATIVA')
    };
  }

  return {
    eligible: true,
    reason: null,
    policy,
    role_ids: roleIds,
    bell_enabled: bellEnabled,
    push_enabled: pushEnabled,
    scope_allowed: true,
    scope_via: scope.noAplica === true
      ? 'NO_APLICA'
      : (unitedMaster ? 'DOMINIO_COMPLETO' : 'ZONA_OPERATIVA')
  };
}

module.exports = {
  boolWithDefault_gnral,
  normalizePolicy_gnral,
  resolveMatrixRecipientDecision_gnral
};

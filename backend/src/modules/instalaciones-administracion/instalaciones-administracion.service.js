'use strict';

// [Aster | 2026-10-08 | ASTER-MG | FASE_5_INSTALACIONES_ADMINISTRACION_INTEGRACION_QA_V001]

const db = require('../../config/db');
const visibilityService = require('../ventas/ventas-visibility.service');
const { hasEffectivePermission } = require('../../services/permissions/effective-permission.service');
const repository = require('./instalaciones-administracion.repository');
const auditService = require('./instalaciones-administracion.audit-service');
const {
  GROUPS_COR,
  SYSTEM_READONLY_FIELDS_COR,
  POLICY_PENDING_FIELDS_COR,
  DERIVED_POLICY_PENDING_FIELDS_COR,
  RESPONSIBLE_ID_FIELDS_COR,
  ACCESS_PERMISSION_COR,
  GROUP_PERMISSIONS_COR
} = require('./instalaciones-administracion.constants');
const {
  knownError_cor,
  positiveId_cor,
  normalizeGroupUpdate_cor,
  publicContract_cor,
  VARCHAR_LIMITS_COR
} = require('./instalaciones-administracion.validation');
const {
  normalizeEditedFields_cor,
  fieldMeta_cor
} = require('./instalaciones-administracion.field-policy');

const DEFAULT_SEARCH_LIMIT_COR = 25;
const MAX_SEARCH_LIMIT_COR = 100;

async function resolveScope_cor(req) {
  return visibilityService.resolveVisibilityScope(db, req);
}

function effectiveUserId_cor(req) {
  const user = req?.contextUser || req?.user || null;
  const id = Number(user?.id_SB || user?.id || 0);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function resolveGroupPermissions_cor(req) {
  const userId = effectiveUserId_cor(req);
  if (!userId) {
    throw knownError_cor(401, 'INSTALACIONES_ADMINISTRACION_SESION_REQUERIDA', 'Sesion requerida.');
  }

  const viewerReadonly = req?.viewerContext?.active === true;
  const entries = Object.entries(GROUP_PERMISSIONS_COR);
  const resolved = await Promise.all(entries.map(async ([groupKey, codes]) => {
    const [view, edit] = await Promise.all([
      hasEffectivePermission(userId, codes.view),
      hasEffectivePermission(userId, codes.edit)
    ]);
    return [groupKey, {
      can_view: Boolean(view || edit),
      can_edit: Boolean(edit) && !viewerReadonly,
      view_code: codes.view,
      edit_code: codes.edit
    }];
  }));

  return Object.fromEntries(resolved);
}

async function ensureGroupEditPermission_cor(req, groupKey) {
  const codes = GROUP_PERMISSIONS_COR[groupKey];
  if (!codes) {
    throw knownError_cor(404, 'INSTALACIONES_ADMINISTRACION_GRUPO_NO_EXISTE', 'El grupo solicitado no existe.', {
      group: groupKey
    });
  }

  if (req?.viewerContext?.active === true) {
    throw knownError_cor(403, 'INSTALACIONES_ADMINISTRACION_VISOR_SOLO_LECTURA', 'El Visor de Usuarios no permite editar.');
  }

  const userId = effectiveUserId_cor(req);
  const allowed = userId && await hasEffectivePermission(userId, codes.edit);
  if (!allowed) {
    throw knownError_cor(403, 'INSTALACIONES_ADMINISTRACION_EDICION_DENEGADA', 'No tienes permiso para editar este grupo.', {
      group: groupKey
    });
  }
}

function normalizeSearch_cor(query = {}) {
  const search = String(query.q ?? query.buscar ?? '').trim();
  if (search.length > 255) {
    throw knownError_cor(400, 'INSTALACIONES_ADMINISTRACION_BUSQUEDA_INVALIDA', 'La busqueda excede 255 caracteres.');
  }

  const rawLimit = query.limit === undefined || query.limit === null || query.limit === ''
    ? DEFAULT_SEARCH_LIMIT_COR
    : Number(query.limit);

  if (!Number.isInteger(rawLimit) || rawLimit <= 0 || rawLimit > MAX_SEARCH_LIMIT_COR) {
    throw knownError_cor(400, 'INSTALACIONES_ADMINISTRACION_LIMITE_INVALIDO', `limit debe estar entre 1 y ${MAX_SEARCH_LIMIT_COR}.`);
  }

  return { search, limit: rawLimit };
}

function visibleRecord_cor(row, permissions) {
  const output = {};
  for (const field of SYSTEM_READONLY_FIELDS_COR) {
    output[field] = row?.[field] ?? null;
  }
  for (const [groupKey, group] of Object.entries(GROUPS_COR)) {
    if (!permissions?.[groupKey]?.can_view) continue;
    for (const field of group.fields) output[field] = row?.[field] ?? null;
  }
  return output;
}

function visibleGroupData_cor(row, groupKey) {
  const group = GROUPS_COR[groupKey];
  const output = {
    id_ins_fl: row?.id_ins_fl ?? null,
    updated_at: row?.updated_at ?? null
  };
  for (const field of group.fields) output[field] = row?.[field] ?? null;
  return output;
}

function visibleFieldNames_cor(permissions) {
  return Object.entries(GROUPS_COR).flatMap(([key, group]) => (
    permissions?.[key]?.can_view ? group.fields : []
  ));
}

function ensureAnyVisibleGroup_cor(permissions) {
  if (Object.values(permissions).some(item => item.can_view)) return;
  throw knownError_cor(403, 'INSTALACIONES_ADMINISTRACION_SIN_GRUPOS_VISIBLES', 'No tienes autorizacion para consultar grupos de informacion.');
}

async function getContract_cor(req) {
  const permissions = await resolveGroupPermissions_cor(req);
  const groups = publicContract_cor().map(group => ({
    ...group,
    permissions: permissions[group.key]
  }));
  const fieldMeta = {};
  for (const group of groups) {
    for (const field of group.fields) {
      fieldMeta[field] = fieldMeta_cor(field, VARCHAR_LIMITS_COR);
    }
  }

  return {
    module: 'instalaciones-administracion',
    source: 'ins_fl',
    phase: 5,
    access_permission: ACCESS_PERMISSION_COR,
    groups,
    field_meta: fieldMeta,
    system_readonly_fields: [...SYSTEM_READONLY_FIELDS_COR],
    pending_policy_fields: [...POLICY_PENDING_FIELDS_COR],
    derived_pending_policy_fields: [...DERIVED_POLICY_PENDING_FIELDS_COR],
    security_activation: 'ACTIVE_PERMISSION_GUARDED',
    audit_mode: 'ATOMIC_USUARIO_INTERACCIONES',
    partial_update: 'CHANGED_FIELDS_ONLY',
    concurrency: 'FIELD_LEVEL_EXPECTED_VALUES'
  };
}

async function searchRecords_cor(req, query = {}) {
  const permissions = await resolveGroupPermissions_cor(req);
  ensureAnyVisibleGroup_cor(permissions);
  const scope = await resolveScope_cor(req);
  const normalized = normalizeSearch_cor(query);
  const rows = await repository.searchRecords_cor({
    scope,
    search: normalized.search,
    limit: normalized.limit,
    visibleFields: visibleFieldNames_cor(permissions)
  });

  return {
    data: rows,
    limit: normalized.limit,
    returned: rows.length
  };
}

async function getRecord_cor(req, idValue) {
  const id = positiveId_cor(idValue);
  const permissions = await resolveGroupPermissions_cor(req);
  ensureAnyVisibleGroup_cor(permissions);
  const scope = await resolveScope_cor(req);
  const row = await repository.getRecordById_cor({ id, scope });

  if (!row) {
    throw knownError_cor(404, 'INSTALACIONES_ADMINISTRACION_REGISTRO_NO_ENCONTRADO', 'Registro de instalacion no encontrado.');
  }

  return {
    data: visibleRecord_cor(row, permissions),
    group_permissions: permissions
  };
}

async function getResponsibleOptions_cor(req) {
  await ensureGroupEditPermission_cor(req, 'responsables');
  const rows = await repository.listActiveUsers_cor();
  return { data: rows, returned: rows.length };
}

async function validateResponsibleIds_cor(changes) {
  const requested = RESPONSIBLE_ID_FIELDS_COR
    .filter(field => Object.prototype.hasOwnProperty.call(changes, field))
    .map(field => changes[field])
    .filter(value => value !== null);

  if (!requested.length) return;

  const existing = new Set(await repository.listExistingActiveUsers_cor(requested));
  const missing = [...new Set(requested)].filter(id => !existing.has(Number(id)));
  if (missing.length) {
    throw knownError_cor(400, 'INSTALACIONES_ADMINISTRACION_USUARIO_INVALIDO', 'Uno o mas responsables no corresponden a usuarios activos.', {
      ids: missing
    });
  }
}

function expectedValues_cor(body, changes) {
  const expected = body?.expected;
  if (!expected || typeof expected !== 'object' || Array.isArray(expected)) {
    throw knownError_cor(400, 'INSTALACIONES_ADMINISTRACION_EXPECTED_REQUERIDO', 'Se requiere expected con los valores originales de los campos a editar.');
  }
  const selected = {};
  for (const field of Object.keys(changes)) {
    if (!Object.prototype.hasOwnProperty.call(expected, field)) {
      throw knownError_cor(400, 'INSTALACIONES_ADMINISTRACION_EXPECTED_REQUERIDO', `Falta expected.${field}.`, { field });
    }
    const value = expected[field];
    if (value !== null && (typeof value === 'object' || typeof value === 'undefined')) {
      throw knownError_cor(400, 'INSTALACIONES_ADMINISTRACION_EXPECTED_INVALIDO', `expected.${field} debe ser escalar o null.`, { field });
    }
    selected[field] = value;
  }
  return selected;
}

async function updateGroup_cor(req, idValue, groupKey, body = {}) {
  const id = positiveId_cor(idValue);
  if (!GROUPS_COR[groupKey]) {
    throw knownError_cor(404, 'INSTALACIONES_ADMINISTRACION_GRUPO_NO_EXISTE', 'El grupo solicitado no existe.', { group: groupKey });
  }

  // Defence in depth: route also checks EDITAR and Viewer write prohibition.
  await ensureGroupEditPermission_cor(req, groupKey);

  const initialChanges = normalizeGroupUpdate_cor(groupKey, body);
  const expected = expectedValues_cor(body, initialChanges);
  const changes = normalizeEditedFields_cor(initialChanges);
  await validateResponsibleIds_cor(changes);

  const scope = await resolveScope_cor(req);
  const result = await repository.updateRecordById_cor({
    id,
    scope,
    changes,
    expected,
    beforeCommit: async ({ connection, before, after, changes: actualChanges }) => {
      await auditService.recordGroupUpdate_cor(req, {
        executor: connection,
        id_ins_fl: id,
        group: groupKey,
        before,
        after,
        changes: actualChanges
      });
    }
  });

  if (!result.found) {
    throw knownError_cor(404, 'INSTALACIONES_ADMINISTRACION_REGISTRO_NO_ENCONTRADO', 'Registro de instalacion no encontrado.');
  }

  return {
    group: groupKey,
    changed: result.changed,
    changed_fields: Object.keys(result.changes || {}),
    data: visibleGroupData_cor(result.after, groupKey),
    audit: result.changed ? 'RECORDED_ATOMICALLY' : 'NOT_REQUIRED_NO_CHANGE'
  };
}

module.exports = {
  DEFAULT_SEARCH_LIMIT_COR,
  MAX_SEARCH_LIMIT_COR,
  getContract_cor,
  searchRecords_cor,
  getRecord_cor,
  getResponsibleOptions_cor,
  updateGroup_cor,
  normalizeSearch_cor,
  resolveGroupPermissions_cor,
  ensureGroupEditPermission_cor,
  visibleRecord_cor,
  expectedValues_cor
};

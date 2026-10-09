'use strict';

// [Aster | 2026-10-09 | ASTER-MG | FIX_4_INSTALACIONES_ADMINISTRACION_INTEGRACION_QA_V001]

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
    detail_update: 'ONE_RECORD_MULTI_GROUP_ATOMIC',
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

  // FIX 4: no devolver la imagen posterior del registro. El grupo
  // responsables puede cambiar id_sup/id_asesor/id_admin y revocar el alcance
  // del usuario DURANTE el PATCH. El frontend debe hacer GET nuevo bajo Guard.
  // Mantener solo metadatos de resultado: mismo patron que Detalle y Lote.
  return {
    group: groupKey,
    changed: result.changed,
    changed_fields: Object.keys(result.changes || {}),
    audit: result.changed ? 'RECORDED_ATOMICALLY' : 'NOT_REQUIRED_NO_CHANGE'
  };
}


// [Aster | 2026-10-08 | ASTER-MG | FIX_2_INSTALACIONES_ADMINISTRACION_DETALLE_EQUIPO_V001]
// Un solo equipo / registro, varios grupos, una transaccion y auditoria por
// grupo. La autorizacion real y el alcance siguen siendo responsabilidad del
// Guard central + el servicio + el repositorio existente.
function normalizeDetailUpdate_cor(body = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(key => key !== 'groups')) {
    throw knownError_cor(400, 'INSTALACIONES_ADMINISTRACION_DETALLE_INVALIDO',
      'El detalle solo admite un objeto groups.');
  }
  const input = body.groups;
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      !Object.keys(input).length || Object.keys(input).length > Object.keys(GROUPS_COR).length) {
    throw knownError_cor(400, 'INSTALACIONES_ADMINISTRACION_GRUPOS_INVALIDOS',
      'Se requiere al menos un grupo valido y no mas de once.');
  }

  const selected = {};
  const changes = {};
  const expected = {};
  const seen = new Set();

  for (const [groupKey, entry] of Object.entries(input)) {
    if (!Object.prototype.hasOwnProperty.call(GROUPS_COR, groupKey)) {
      throw knownError_cor(404, 'INSTALACIONES_ADMINISTRACION_GRUPO_NO_EXISTE',
        'El grupo solicitado no existe.', { group: groupKey });
    }
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) ||
        Object.keys(entry).some(key => key !== 'changes' && key !== 'expected')) {
      throw knownError_cor(400, 'INSTALACIONES_ADMINISTRACION_GRUPO_INVALIDO',
        'Cada grupo requiere changes y expected sin otras propiedades.', { group: groupKey });
    }
    // Se reutilizan las mismas reglas que el PATCH individual de Fases 4-5.
    const initial = normalizeGroupUpdate_cor(groupKey, entry);
    const original = expectedValues_cor(entry, initial);
    const normalized = normalizeEditedFields_cor(initial);
    const fields = Object.keys(normalized);
    for (const field of fields) {
      if (seen.has(field)) {
        throw knownError_cor(400, 'INSTALACIONES_ADMINISTRACION_CAMPO_DUPLICADO',
          'Un campo no puede modificarse en dos grupos.', { field });
      }
      seen.add(field);
      changes[field] = normalized[field];
      expected[field] = original[field];
    }
    selected[groupKey] = { fields };
  }
  return {selected, changes, expected};
}

async function updateDetail_cor(req, idValue, body = {}) {
  const id = positiveId_cor(idValue);
  const payload = normalizeDetailUpdate_cor(body);
  const groupKeys = Object.keys(payload.selected);

  // Verifica EDITAR por CADA grupo antes de abrir la transaccion.
  // Nunca se confia en el frontend ni en un permiso de solo lectura.
  for (const groupKey of groupKeys) {
    await ensureGroupEditPermission_cor(req, groupKey);
  }
  await validateResponsibleIds_cor(payload.changes);
  const scope = await resolveScope_cor(req);

  const result = await repository.updateRecordById_cor({
    id, scope, changes: payload.changes, expected: payload.expected,
    beforeCommit: async ({connection, before, after, changes: actualChanges}) => {
      // INSERTs de auditoria en la MISMA conexion que UPDATE. Si cualquiera
      // falla, el repositorio ejecuta ROLLBACK de datos y auditorias.
      for (const groupKey of groupKeys) {
        const own = {};
        for (const field of payload.selected[groupKey].fields) {
          if (Object.prototype.hasOwnProperty.call(actualChanges, field)) {
            own[field] = actualChanges[field];
          }
        }
        if (Object.keys(own).length) {
          await auditService.recordGroupUpdate_cor(req, {
            executor: connection, id_ins_fl: id, group: groupKey,
            before, after, changes: own
          });
        }
      }
    }
  });

  if (!result.found) {
    throw knownError_cor(404, 'INSTALACIONES_ADMINISTRACION_REGISTRO_NO_ENCONTRADO',
      'Registro de instalacion no encontrado.');
  }
  const changedGroups = groupKeys.filter(key => payload.selected[key].fields.some(field => (
    Object.prototype.hasOwnProperty.call(result.changes || {}, field)
  )));
  return {
    id_ins_fl: id,
    changed: result.changed,
    changed_groups: changedGroups,
    changed_fields: Object.keys(result.changes || {}),
    audit: result.changed ? 'RECORDED_ATOMICALLY_PER_GROUP' : 'NOT_REQUIRED_NO_CHANGE'
    // No se devuelve el row completo: el alcance podria haber cambiado
    // por editar id_sup/id_asesor/id_admin. El cliente debe releer con Guard.
  };
}

// [Aster | 2026-10-08 | ASTER-MG | FIX_1_INSTALACIONES_ADMINISTRACION_REDISENO_V001]
const MAX_BROWSE_LIMIT_COR = 50;
function normalizeBrowse_cor(query = {}, permissions) {
  const search = String(query.q ?? '').trim();
  const estatus = String(query.estatus ?? '').trim();
  const supervisor = String(query.supervisor ?? '').trim();
  const limit = query.limit == null || query.limit === '' ? 20 : Number(query.limit);
  const offset = query.offset == null || query.offset === '' ? 0 : Number(query.offset);
  if (search.length > 255 || estatus.length > 255 ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > MAX_BROWSE_LIMIT_COR ||
      !Number.isSafeInteger(offset) || offset < 0 || offset > 1000000) {
    throw knownError_cor(400,'INSTALACIONES_ADMINISTRACION_FILTROS_INVALIDOS',
      'Busqueda, filtros o paginacion invalidos.');
  }
  if (!permissions?.proyecto?.can_view) {
    throw knownError_cor(403,'INSTALACIONES_ADMINISTRACION_PROYECTOS_DENEGADOS',
      'Requieres permiso para consultar Proyecto e identificacion.');
  }
  if (estatus && !permissions.proyecto.can_view) {
    throw knownError_cor(403,'INSTALACIONES_ADMINISTRACION_FILTRO_DENEGADO','No tienes permiso para filtrar por estatus.');
  }
  if (supervisor && !permissions?.responsables?.can_view) {
    throw knownError_cor(403,'INSTALACIONES_ADMINISTRACION_FILTRO_DENEGADO','No tienes permiso para filtrar por supervisor.');
  }
  if (supervisor && supervisor !== 'SIN_ASIGNAR' &&
      (!/^[1-9]\d{0,14}$/.test(supervisor) || !Number.isSafeInteger(Number(supervisor)))) {
    throw knownError_cor(400,'INSTALACIONES_ADMINISTRACION_SUPERVISOR_INVALIDO','Supervisor invalido.');
  }
  return {search,estatus,supervisor,limit,offset};
}

async function listProjects_cor(req, query = {}) {
  const permissions = await resolveGroupPermissions_cor(req);
  const normalized = normalizeBrowse_cor(query,permissions);
  const scope = await resolveScope_cor(req);
  return repository.listProjects_cor({scope,...normalized,
    visibleFields:visibleFieldNames_cor(permissions)});
}

async function listProjectEquipments_cor(req, projectKey, query = {}) {
  const permissions = await resolveGroupPermissions_cor(req);
  const normalized = normalizeBrowse_cor(query,permissions);
  // El repositorio valida y aplica el ID de proyecto de nuevo en SQL.
  const scope = await resolveScope_cor(req);
  return repository.listProjectEquipments_cor({scope,projectKey,...normalized,
    visibleFields:visibleFieldNames_cor(permissions)});
}

async function listBrowseFilters_cor(req) {
  const permissions = await resolveGroupPermissions_cor(req);
  if (!permissions?.proyecto?.can_view) {
    throw knownError_cor(403,'INSTALACIONES_ADMINISTRACION_PROYECTOS_DENEGADOS',
      'Requieres permiso para consultar Proyecto e identificacion.');
  }
  const scope = await resolveScope_cor(req);
  return repository.listBrowseFilters_cor({scope,
    canViewStatus:permissions.proyecto.can_view,
    canViewSupervisor:permissions.responsables?.can_view===true});
}


// [Aster | 2026-10-09 | ASTER-MG | FIX_3_INSTALACIONES_ADMINISTRACION_EDICION_MULTIPLE_V001]
const MAX_BATCH_EQUIPMENTS_COR = 20;
const MAX_BATCH_FIELDS_COR = 40;

function normalizeMultiUpdate_cor(projectKey, body = {}) {
  const key = String(projectKey || '');
  // Identidad del proyecto estructurada: NO agrupar registros sin id_proyecto.
  if (!/^P:.{1,100}$/.test(key) || !key.slice(2).trim()) {
    throw knownError_cor(400, 'INSTALACIONES_ADMINISTRACION_PROYECTO_NO_AGRUPABLE',
      'La edicion multiple requiere un proyecto con PP NS valido.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(name => !['ids', 'groups', 'expected'].includes(name))) {
    throw knownError_cor(400, 'INSTALACIONES_ADMINISTRACION_LOTE_INVALIDO',
      'El lote solo admite ids, groups y expected.');
  }
  if (!Array.isArray(body.ids) || body.ids.length < 2 || body.ids.length > MAX_BATCH_EQUIPMENTS_COR) {
    throw knownError_cor(400, 'INSTALACIONES_ADMINISTRACION_CANTIDAD_INVALIDA',
      `Selecciona entre 2 y ${MAX_BATCH_EQUIPMENTS_COR} equipos del mismo proyecto.`);
  }
  const ids = body.ids.map(id => positiveId_cor(id));
  if (new Set(ids).size !== ids.length) {
    throw knownError_cor(400, 'INSTALACIONES_ADMINISTRACION_EQUIPOS_DUPLICADOS',
      'Los equipos del lote no pueden repetirse.');
  }
  const input = body.groups;
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      !Object.keys(input).length || Object.keys(input).length > Object.keys(GROUPS_COR).length) {
    throw knownError_cor(400, 'INSTALACIONES_ADMINISTRACION_GRUPOS_INVALIDOS',
      'El lote requiere grupos de edicion autorizados.');
  }

  const selected = Object.create(null), changes = Object.create(null);
  const groups = Object.keys(input);
  for (const groupKey of groups) {
    if (!Object.prototype.hasOwnProperty.call(GROUPS_COR, groupKey)) {
      throw knownError_cor(404, 'INSTALACIONES_ADMINISTRACION_GRUPO_NO_EXISTE',
        'Grupo de edicion no existente.');
    }
    const groupInput = input[groupKey];
    if (!groupInput || typeof groupInput !== 'object' || Array.isArray(groupInput) ||
        Object.keys(groupInput).some(field => field !== 'changes')) {
      throw knownError_cor(400, 'INSTALACIONES_ADMINISTRACION_GRUPO_INVALIDO',
        'Cada grupo del lote admite exclusivamente changes.');
    }
    const normalized = normalizeEditedFields_cor(
      normalizeGroupUpdate_cor(groupKey, { changes: groupInput.changes })
    );
    for (const field of Object.keys(normalized)) {
      if (Object.prototype.hasOwnProperty.call(changes, field)) {
        throw knownError_cor(400, 'INSTALACIONES_ADMINISTRACION_CAMPO_DUPLICADO',
          'Un campo no se puede incluir en mas de un grupo.');
      }
      changes[field] = normalized[field];
    }
    selected[groupKey] = Object.keys(normalized);
  }
  if (Object.keys(changes).length > MAX_BATCH_FIELDS_COR) {
    throw knownError_cor(400, 'INSTALACIONES_ADMINISTRACION_CAMPOS_EXCEDIDOS',
      `Solo pueden modificarse ${MAX_BATCH_FIELDS_COR} campos por lote.`);
  }

  const expected = body.expected;
  if (!expected || typeof expected !== 'object' || Array.isArray(expected) ||
      Object.keys(expected).length !== ids.length) {
    throw knownError_cor(400, 'INSTALACIONES_ADMINISTRACION_EXPECTED_REQUERIDO',
      'Se requieren los valores originales de TODOS los equipos seleccionados.');
  }
  const originals = Object.create(null);
  for (const id of ids) {
    if (!Object.prototype.hasOwnProperty.call(expected, String(id)) ||
        !expected[id] || typeof expected[id] !== 'object' || Array.isArray(expected[id]) ||
        Object.keys(expected[id]).length !== Object.keys(changes).length) {
      throw knownError_cor(400, 'INSTALACIONES_ADMINISTRACION_EXPECTED_REQUERIDO',
        'Faltan valores originales de un equipo o se incluyeron campos ajenos.');
    }
    originals[id] = expectedValues_cor({ expected: expected[id] }, changes);
  }
  return { key, ids, selected, changes, expectedById: originals };
}

async function updateMulti_cor(req, projectKey, body = {}) {
  const payload = normalizeMultiUpdate_cor(projectKey, body);
  const permissions = await resolveGroupPermissions_cor(req);
  // La capacidad de agrupar equipos depende tambien de poder consultar
  // proyectos; no admitir por URL directa lo que el navegador denegaria.
  if (!permissions?.proyecto?.can_view) {
    throw knownError_cor(403, 'INSTALACIONES_ADMINISTRACION_PROYECTOS_DENEGADOS',
      'No tienes autorizacion para seleccionar equipos por proyecto.');
  }
  // Defensa en profundidad: no basta el permiso visual ni un rol privilegiado.
  for (const groupKey of Object.keys(payload.selected)) {
    await ensureGroupEditPermission_cor(req, groupKey);
  }
  await validateResponsibleIds_cor(payload.changes);
  const scope = await resolveScope_cor(req);
  const results = await repository.updateProjectBatch_cor({
    projectKey: payload.key,
    ids: payload.ids,
    scope,
    changes: payload.changes,
    expectedById: payload.expectedById,
    beforeCommit: async ({ connection, id, before, after, changes }) => {
      for (const [groupKey, fields] of Object.entries(payload.selected)) {
        const actual = Object.fromEntries(fields
          .filter(field => Object.prototype.hasOwnProperty.call(changes, field))
          .map(field => [field, changes[field]]));
        if (!Object.keys(actual).length) continue;
        await auditService.recordGroupUpdate_cor(req, {
          executor: connection,
          id_ins_fl: id,
          group: groupKey,
          before,
          after,
          changes: actual
        });
      }
    }
  });
  // No devolver datos operativos posteriores: algun usuario podria perder alcance.
  return {
    project_key: payload.key,
    selected: results.affected,
    updated: results.changed,
    unchanged: results.affected - results.changed,
    records: results.records,
    audit: results.changed ? 'RECORDED_ATOMICALLY_PER_EQUIPMENT_AND_GROUP' : 'NOT_REQUIRED_NO_CHANGE'
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
  updateDetail_cor,
  updateMulti_cor,
  normalizeMultiUpdate_cor,
  normalizeDetailUpdate_cor,
  normalizeSearch_cor,
  resolveGroupPermissions_cor,
  ensureGroupEditPermission_cor,
  visibleRecord_cor,
  expectedValues_cor,
  normalizeBrowse_cor,
  listProjects_cor,
  listProjectEquipments_cor,
  listBrowseFilters_cor
};

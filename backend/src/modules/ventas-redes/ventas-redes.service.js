'use strict';

const repository = require('./ventas-redes.repository');
const ventasVisibility = require('../ventas/ventas-visibility.service');
const azureStorage = require('../../services/storage/azure-storage.service');
const storageAccess = require('../../services/storage/storage-access.service');
const storageAdapters = require('../../services/storage/storage-metadata.adapters');
const { hasEffectivePermission } = require('../../services/permissions/effective-permission.service');

const CATALOG_PATHS = Object.freeze({
  id_contacto_via: Object.freeze({ area: 'Ventas', elemento: 'Tipo Contacto' }),
  id_estado: Object.freeze({ area: 'General', elemento: 'Estado' }),
  id_solicitud: Object.freeze({ area: 'Ventas', elemento: 'Soli Red' }),
  id_estatus: Object.freeze({ area: 'Ventas', elemento: 'Estatus Pros' })
});

const TEXT_FIELDS = Object.freeze({
  nombre_contacto: 180,
  email: 190,
  telefono: 30,
  nombre_empresa: 200,
  ciudad: 150,
  nombre_proyecto: 220,
  informacion_enviada: null
});

const ID_FIELDS = Object.freeze([
  'id_contacto_via',
  'id_estado',
  'id_solicitud',
  'id_usuario_asignado',
  'id_estatus',
  'id_cotizacion'
]);

const REDES_PERMISSIONS_COR = Object.freeze({
  crear: 'VENTAS_ASIGNACION_REDES_TABLA_REGISTROS_NUEVA_ASIGNACION.CREAR',
  asignar_crear: 'VENTAS_ASIGNACION_REDES_TABLA_REGISTROS_NUEVA_ASIGNACION.ASIGNAR_RESPONSABLES',
  editar: 'VENTAS_ASIGNACION_REDES_TABLA_REGISTROS_EDITAR.EDITAR',
  asignar_editar: 'VENTAS_ASIGNACION_REDES_TABLA_REGISTROS_EDITAR.ASIGNAR_RESPONSABLES',
  cambiar_estado: 'VENTAS_ASIGNACION_REDES_TABLA_REGISTROS_DETALLE.CAMBIAR_ESTADO',
  relacion_cotizacion: 'VENTAS_ASIGNACION_REDES_TABLA_REGISTROS_RELACION_COTIZACION.GESTIONAR_RELACION_COTIZACION'
});

function httpError(statusCode, message, details, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.status = statusCode;
  if (details !== undefined) error.details = details;
  if (code) error.code = code;
  return error;
}

function cleanText(value, maxLength = null) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return maxLength ? text.slice(0, maxLength) : text;
}

function positiveInteger(value, field = 'id') {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw httpError(400, `${field} debe ser un entero positivo.`);
  }
  return number;
}

function parseActive(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  const text = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'si', 'sí', 'activo'].includes(text)) return 1;
  if (['0', 'false', 'no', 'inactivo'].includes(text)) return 0;
  throw httpError(400, 'activo debe ser 0 o 1.');
}

function parseBoolean(value) {
  return ['1', 'true', 'yes', 'si', 'sí', 'on'].includes(String(value || '').trim().toLowerCase());
}

function parseDateOnly(value, field) {
  const text = cleanText(value, 10);
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(new Date(`${text}T00:00:00Z`).getTime())) {
    throw httpError(400, `${field} debe usar el formato AAAA-MM-DD.`);
  }
  return text;
}

function boundedInteger(value, fallback, min, max, field) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number.parseInt(value, 10);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw httpError(400, `${field} debe estar entre ${min} y ${max}.`);
  }
  return number;
}

function actorId(actionContext) {
  const id = positiveInteger(actionContext?.user?.id_SB || actionContext?.user?.id, 'usuario autenticado');
  if (!id) throw httpError(401, 'Sesión requerida.');
  return id;
}

function contextUser(actionContext) {
  return actionContext?.contextUser || actionContext?.user || null;
}

function permissionUserId(actionContext) {
  const user = contextUser(actionContext);
  const id = Number(user?.id_SB || user?.id || user?.user_id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function hasRedesPermission(connection, actionContext, permissionCode) {
  const userId = permissionUserId(actionContext);
  return Boolean(userId && await hasEffectivePermission(userId, permissionCode, connection));
}

async function requireRedesPermission(connection, actionContext, permissionCode, message) {
  if (await hasRedesPermission(connection, actionContext, permissionCode)) return;
  throw httpError(403, message || 'No tienes permiso para realizar esta acción en Asignación a Redes.');
}

async function canAssignRedes(connection, actionContext) {
  const [createAssign, editAssign] = await Promise.all([
    hasRedesPermission(connection, actionContext, REDES_PERMISSIONS_COR.asignar_crear),
    hasRedesPermission(connection, actionContext, REDES_PERMISSIONS_COR.asignar_editar)
  ]);
  return createAssign || editAssign;
}

function scopeAllowsAssignedUser(scope, userId) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return false;
  if (scope?.mode === 'ALL') return true;
  return new Set((scope?.advisorIds || []).map(Number)).has(id);
}

async function resolveScope(connection, actionContext) {
  const user = contextUser(actionContext);
  if (!user) throw httpError(401, 'Sesión requerida.');
  return ventasVisibility.resolveVisibilityScope(connection, { user });
}

function parseListOptions(query = {}) {
  const page = boundedInteger(query.page, 1, 1, 100000, 'page');
  const pageSize = boundedInteger(query.page_size || query.pageSize, 50, 1, 500, 'page_size');
  const sortDirection = String(query.sort_direction || query.sortDirection || 'desc').trim().toLowerCase() === 'asc'
    ? 'asc'
    : 'desc';

  const options = {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
    search: cleanText(query.search || query.buscar, 250),
    sortBy: cleanText(query.sort_by || query.sortBy, 50) || 'created_at',
    sortDirection,
    includeInactive: parseBoolean(query.include_inactive || query.incluir_inactivos),
    sinAsignar: parseBoolean(query.sin_asignar),
    conAsignacion: parseBoolean(query.con_asignacion),
    sinCotizacion: parseBoolean(query.sin_cotizacion),
    conCotizacion: parseBoolean(query.con_cotizacion),
    fechaDesde: parseDateOnly(query.fecha_desde, 'fecha_desde'),
    fechaHasta: parseDateOnly(query.fecha_hasta, 'fecha_hasta')
  };

  if (query.activo !== undefined && query.activo !== '') options.activo = parseActive(query.activo);
  for (const field of ID_FIELDS) {
    if (query[field] !== undefined && query[field] !== '') options[field] = positiveInteger(query[field], field);
  }
  if (query.created_by !== undefined && query.created_by !== '') {
    options.created_by = positiveInteger(query.created_by, 'created_by');
  }
  return options;
}

function normalizeRecordPayload(payload = {}, { partial = false } = {}) {
  const normalized = {};

  for (const [field, maxLength] of Object.entries(TEXT_FIELDS)) {
    if (partial && !Object.prototype.hasOwnProperty.call(payload, field)) continue;
    normalized[field] = cleanText(payload[field], maxLength);
  }

  for (const field of ID_FIELDS) {
    if (partial && !Object.prototype.hasOwnProperty.call(payload, field)) continue;
    normalized[field] = positiveInteger(payload[field], field);
  }

  if (!partial) normalized.activo = 1;

  return normalized;
}

function sameNullableId(left, right) {
  const a = left === undefined || left === null || left === '' ? null : Number(left);
  const b = right === undefined || right === null || right === '' ? null : Number(right);
  return a === b;
}

async function validateCatalogRelations(connection, record) {
  for (const [field, path] of Object.entries(CATALOG_PATHS)) {
    if (!Object.prototype.hasOwnProperty.call(record, field) || record[field] === null) continue;
    const value = await repository.findCatalogById(connection, record[field], path.area, path.elemento);
    if (!value) {
      throw httpError(400, `${field} no pertenece al catálogo ${path.area} / ${path.elemento}.`, {
        field,
        id_catalogo: record[field],
        ruta: `catalogo_general\\${path.area}\\${path.elemento}\\`
      });
    }
  }
}

async function validateRecordRelations(connection, record, scope, { assignmentChanged = false } = {}) {
  await validateCatalogRelations(connection, record);

  if (Object.prototype.hasOwnProperty.call(record, 'id_usuario_asignado') && record.id_usuario_asignado !== null) {
    const user = await repository.findActiveUserById(connection, record.id_usuario_asignado);
    if (!user) throw httpError(400, 'El usuario asignado no existe o está inactivo.');
    if (assignmentChanged && !scopeAllowsAssignedUser(scope, record.id_usuario_asignado)) {
      throw httpError(403, 'El usuario asignado queda fuera de tu Alcance de Información.');
    }
  }

  if (Object.prototype.hasOwnProperty.call(record, 'id_cotizacion') && record.id_cotizacion !== null) {
    const quotation = await repository.findActiveQuotationById(connection, record.id_cotizacion, scope);
    if (!quotation) {
      throw httpError(400, 'La cotización no existe, está inactiva o queda fuera del alcance del usuario.');
    }
  }
}

async function assertVisibleRecord(connection, rawId, actionContext, options = {}) {
  const idRedes = positiveInteger(rawId, 'id_redes');
  if (!idRedes) throw httpError(400, 'id_redes es obligatorio.');
  const scope = options.scope || await resolveScope(connection, actionContext);
  const record = await repository.findById(connection, idRedes, {
    includeInactive: options.includeInactive === true,
    forUpdate: options.forUpdate === true,
    scope
  });
  if (!record) throw httpError(404, 'Registro de Redes no encontrado o fuera de tu alcance.');
  return { idRedes, record, scope };
}

function userDto(row) {
  const initials = cleanText(row?.iniciales, 20);
  const name = cleanText(row?.nombre, 200);
  return {
    id_usuario: Number(row.id_SB),
    nombre: name,
    iniciales: initials,
    puesto: row.puesto || null,
    area: row.area || null,
    empresa: row.empresa || null,
    etiqueta: initials && name ? `${initials} · ${name}` : (name || initials || `Usuario ${row.id_SB}`)
  };
}

function quotationDto(row) {
  const project = cleanText(row?.nombre_proyecto, 200) || `Cotización ${row.id_cotizacion}`;
  const client = cleanText(row?.cliente, 200);
  return {
    id_cotizacion: Number(row.id_cotizacion),
    id_cot_origen: row.id_cot_origen == null ? null : Number(row.id_cot_origen),
    nombre_proyecto: row.nombre_proyecto || null,
    cliente: row.cliente || null,
    estatus_proyecto: row.estatus_proyecto || null,
    fecha_cotizacion: row.fecha_cotizacion || null,
    id_asesor: row.id_asesor == null ? null : Number(row.id_asesor),
    asesor_nombre: row.asesor_nombre || null,
    asesor_iniciales: row.asesor_iniciales || null,
    etiqueta: client ? `${project} — ${client}` : project
  };
}

function normalizeLegacyUrl(value) {
  const url = cleanText(value, 2000);
  return url && /^https:\/\//i.test(url) ? url : null;
}

function providerOf(file) {
  return String(file?.storage_provider || (file?.storage_blob_name ? azureStorage.PROVIDER : 'LEGACY'))
    .trim()
    .toUpperCase();
}

function presentEvidence(file, idRedes) {
  const provider = providerOf(file);
  const azure = provider === azureStorage.PROVIDER && Boolean(cleanText(file.storage_blob_name, 1024));
  const legacyUrl = azure ? null : normalizeLegacyUrl(file.storage_url);

  return {
    id_archivo: Number(file.id_archivo),
    id_redes: Number(file.id_redes || idRedes),
    orden_archivo: file.orden_archivo == null ? null : Number(file.orden_archivo),
    nombre_archivo: file.nombre_archivo || null,
    nombre_original: file.nombre_original || file.nombre_archivo || 'Imagen',
    extension: file.extension || null,
    mime_type: file.mime_type || null,
    tamanio_bytes: file.tamanio_bytes == null ? null : Number(file.tamanio_bytes),
    storage_provider: provider,
    tipo_archivo: file.tipo_archivo || null,
    descripcion: file.descripcion || null,
    id_usuario: file.id_usuario == null ? null : Number(file.id_usuario),
    usuario_nombre: file.usuario_nombre || null,
    usuario_iniciales: file.usuario_iniciales || null,
    activo: Number(file.activo ?? 1),
    created_at: file.created_at || null,
    updated_at: file.updated_at || null,
    legacy: !azure,
    disponible: azure || Boolean(legacyUrl),
    legacy_url: legacyUrl,
    access_endpoint: azure
      ? `/api/ventas/redes/${encodeURIComponent(idRedes)}/archivos/${encodeURIComponent(file.id_archivo)}/acceso`
      : null
  };
}

function presentAttachment(file, idRedes, idComentario) {
  const provider = providerOf(file);
  const azure = provider === azureStorage.PROVIDER && Boolean(cleanText(file.storage_blob_name, 1024));
  const legacyUrl = azure ? null : normalizeLegacyUrl(file.storage_url);

  return {
    id_adjunto: Number(file.id_adjunto),
    id_comentario: Number(file.id_comentario || idComentario),
    nombre_archivo: file.nombre_archivo || null,
    nombre_original: file.nombre_original || file.nombre_archivo || 'Archivo',
    extension: file.extension || null,
    mime_type: file.mime_type || null,
    tamanio_bytes: file.tamanio_bytes == null ? null : Number(file.tamanio_bytes),
    storage_provider: provider,
    tipo_archivo: file.tipo_archivo || null,
    descripcion: file.descripcion || null,
    id_usuario: file.id_usuario == null ? null : Number(file.id_usuario),
    usuario_nombre: file.usuario_nombre || null,
    usuario_iniciales: file.usuario_iniciales || null,
    activo: Number(file.activo ?? 1),
    created_at: file.created_at || null,
    updated_at: file.updated_at || null,
    legacy: !azure,
    disponible: azure || Boolean(legacyUrl),
    legacy_url: legacyUrl,
    access_endpoint: azure
      ? `/api/ventas/redes/${encodeURIComponent(idRedes)}/comentarios/${encodeURIComponent(idComentario)}/adjuntos/${encodeURIComponent(file.id_adjunto)}/acceso`
      : null
  };
}

function storageCompany(actionContext) {
  return cleanText(contextUser(actionContext)?.empresa || actionContext?.user?.empresa, 150) || 'General';
}

function storageRecord(uploaded) {
  if (typeof storageAdapters.forVentasRedes_gnral === 'function') {
    return storageAdapters.forVentasRedes_gnral(uploaded);
  }
  return {
    nombre_archivo: uploaded.nombre_archivo,
    nombre_original: uploaded.nombre_original,
    extension: uploaded.extension,
    mime_type: uploaded.mime_type,
    tamanio_bytes: uploaded.tamano_bytes,
    storage_provider: uploaded.storage_provider,
    storage_url: uploaded.storage_url,
    storage_container: uploaded.storage_container,
    storage_blob_name: uploaded.storage_blob_name
  };
}

async function cleanupAzureFiles(files, context = {}) {
  const results = [];
  for (const file of files || []) {
    if (providerOf(file) !== azureStorage.PROVIDER || !cleanText(file.storage_blob_name, 1024)) continue;
    const item = {
      id_archivo: Number(file.id_archivo || file.id_adjunto || 0) || null,
      attempted: true,
      completed: false,
      queued_operation_id: null
    };
    try {
      const result = await azureStorage.deleteBlob_gnral(file.storage_blob_name, {
        containerName: file.storage_container,
        queueOnFailure: true,
        queueContext: context
      });
      item.completed = result.queued !== true;
      item.queued_operation_id = result.id_operacion || null;
    } catch (error) {
      item.error = error.message;
      item.queued_operation_id = error.queue_operation_id || null;
    }
    results.push(item);
  }
  return results;
}

function evidenceInput(files = []) {
  return (files || [])
    .filter((item) => item && item.file && [1, 2].includes(Number(item.order)))
    .map((item) => ({ order: Number(item.order), file: item.file }));
}

async function uploadEvidenceSet(connection, idRedes, files, actionContext, tracking = {}) {
  const actor = actorId(actionContext);
  const input = evidenceInput(files);
  const uploaded = Array.isArray(tracking.uploaded) ? tracking.uploaded : [];
  const replaced = Array.isArray(tracking.replaced) ? tracking.replaced : [];

  for (const item of input) {
    const previous = await repository.findEvidenceByOrder(connection, idRedes, item.order, {
      forUpdate: true,
      includeInactive: true
    });

    const storage = await azureStorage.uploadPrivate_gnral({
      file: item.file,
      empresa: storageCompany(actionContext),
      modulo: 'ventas',
      entidadTipo: 'redes',
      entidadId: idRedes,
      subruta: 'evidencias',
      policyName: 'IMAGE',
      metadata: {
        uploaded_by: actor,
        id_redes: idRedes,
        orden_archivo: item.order
      }
    });
    uploaded.push(storage);

    const record = {
      ...storageRecord(storage),
      id_redes: idRedes,
      orden_archivo: item.order,
      tipo_archivo: 'EVIDENCIA_CONTACTO',
      descripcion: item.order === 1 ? 'Imagen 1' : 'Imagen 2',
      id_usuario: actor,
      activo: 1
    };

    if (previous) {
      await repository.updateEvidence(connection, previous.id_archivo, record);
      if (providerOf(previous) === azureStorage.PROVIDER && previous.storage_blob_name !== storage.storage_blob_name) {
        replaced.push(previous);
      }
    } else {
      await repository.insertEvidence(connection, record);
    }
  }

  return { uploaded, replaced };
}

async function uploadCommentAttachments(
  connection,
  idRedes,
  idComentario,
  files,
  actionContext,
  tracking = {}
) {
  const actor = actorId(actionContext);
  const uploaded = Array.isArray(tracking.uploaded) ? tracking.uploaded : [];
  const createdIds = Array.isArray(tracking.createdIds) ? tracking.createdIds : [];

  for (const file of files || []) {
    const storage = await azureStorage.uploadPrivate_gnral({
      file,
      empresa: storageCompany(actionContext),
      modulo: 'ventas',
      entidadTipo: 'redes_comentario',
      entidadId: idRedes,
      subruta: `comentarios-${idComentario}`,
      policyName: 'GENERAL',
      metadata: {
        uploaded_by: actor,
        id_redes: idRedes,
        id_comentario: idComentario
      }
    });
    uploaded.push(storage);

    const idAdjunto = await repository.insertAttachment(connection, {
      ...storageRecord(storage),
      id_comentario: idComentario,
      tipo_archivo: storage.mime_type || null,
      descripcion: null,
      id_usuario: actor,
      activo: 1
    });
    createdIds.push(idAdjunto);
  }

  return { uploaded, createdIds };
}

async function list(query, actionContext) {
  const options = parseListOptions(query);
  const connection = await repository.getConnection();
  try {
    const scope = await resolveScope(connection, actionContext);
    const [result, puedeAsignar] = await Promise.all([
      repository.list(connection, options, scope),
      canAssignRedes(connection, actionContext)
    ]);
    return {
      ok: true,
      source: 'aiven',
      data: result.rows,
      pagination: {
        page: options.page,
        page_size: options.pageSize,
        total: result.total,
        total_pages: Math.ceil(result.total / options.pageSize)
      },
      visibilidad: ventasVisibility.toClientVisibility(scope),
      puede_asignar: puedeAsignar
    };
  } finally {
    connection.release();
  }
}

async function getById(rawId, actionContext) {
  const connection = await repository.getConnection();
  try {
    const { idRedes, record, scope } = await assertVisibleRecord(connection, rawId, actionContext);
    const [evidence, puedeAsignar] = await Promise.all([
      repository.listEvidence(connection, idRedes),
      canAssignRedes(connection, actionContext)
    ]);
    return {
      ok: true,
      source: 'aiven',
      registro: {
        ...record,
        archivos: evidence.map((file) => presentEvidence(file, idRedes))
      },
      visibilidad: ventasVisibility.toClientVisibility(scope),
      puede_asignar: puedeAsignar
    };
  } finally {
    connection.release();
  }
}

async function getCatalogs(actionContext) {
  const connection = await repository.getConnection();
  try {
    const scope = await resolveScope(connection, actionContext);
    const [contactoVia, estados, solicitudes, estatus, puedeAsignar] = await Promise.all([
      repository.listCatalog(connection, 'Ventas', 'Tipo Contacto'),
      repository.listCatalog(connection, 'General', 'Estado'),
      repository.listCatalog(connection, 'Ventas', 'Soli Red'),
      repository.listCatalog(connection, 'Ventas', 'Estatus Pros'),
      canAssignRedes(connection, actionContext)
    ]);

    return {
      ok: true,
      source: 'aiven',
      catalogos: {
        contacto_via: contactoVia,
        estados,
        solicitudes,
        estatus
      },
      rutas: {
        contacto_via: 'catalogo_general\\Ventas\\Tipo Contacto\\',
        estado: 'catalogo_general\\General\\Estado\\',
        solicitud: 'catalogo_general\\Ventas\\Soli Red\\',
        estatus: 'catalogo_general\\Ventas\\Estatus Pros\\'
      },
      puede_asignar: puedeAsignar,
      visibilidad: ventasVisibility.toClientVisibility(scope)
    };
  } finally {
    connection.release();
  }
}

async function getAssignableUsers(query, actionContext) {
  const connection = await repository.getConnection();
  try {
    const scope = await resolveScope(connection, actionContext);
    const puedeAsignar = await canAssignRedes(connection, actionContext);
    if (!puedeAsignar) {
      return { ok: true, source: 'aiven', puede_asignar: false, usuarios: [] };
    }
    const search = cleanText(query?.search || query?.buscar, 200);
    const limit = boundedInteger(query?.limit, 200, 1, 500, 'limit');
    let rows = await repository.listActiveUsers(connection, search, limit);
    if (scope.mode !== 'ALL') {
      const allowed = new Set((scope.advisorIds || []).map(Number));
      rows = rows.filter((row) => allowed.has(Number(row.id_SB)));
    }
    return {
      ok: true,
      source: 'aiven',
      puede_asignar: true,
      usuarios: rows.map(userDto)
    };
  } finally {
    connection.release();
  }
}

async function getActiveQuotations(query, actionContext) {
  const connection = await repository.getConnection();
  try {
    const scope = await resolveScope(connection, actionContext);
    const search = cleanText(query?.search || query?.buscar, 200);
    const limit = boundedInteger(query?.limit, 100, 1, 300, 'limit');
    const rows = await repository.listActiveQuotations(connection, { search, limit }, scope);
    return {
      ok: true,
      source: 'aiven',
      cotizaciones: rows.map(quotationDto)
    };
  } finally {
    connection.release();
  }
}

async function create(payload, files, actionContext) {
  const actor = actorId(actionContext);
  const record = normalizeRecordPayload(payload || {});
  record.created_by = actor;
  record.updated_by = actor;
  record.fecha_cambio_estatus = null;

  const connection = await repository.getConnection();
  let uploaded = [];
  try {
    await connection.beginTransaction();
    const scope = await resolveScope(connection, actionContext);
    await requireRedesPermission(
      connection,
      actionContext,
      REDES_PERMISSIONS_COR.crear,
      'No tienes permiso para crear registros de Redes.'
    );
    const assignmentChanged = record.id_usuario_asignado !== null;
    if (assignmentChanged) {
      await requireRedesPermission(
        connection,
        actionContext,
        REDES_PERMISSIONS_COR.asignar_crear,
        'No tienes permiso para asignar responsables al crear registros de Redes.'
      );
    }
    await validateRecordRelations(connection, record, scope, { assignmentChanged });

    const idRedes = await repository.insert(connection, record);
    await uploadEvidenceSet(connection, idRedes, files, actionContext, { uploaded });

    await connection.commit();
    // El registro acaba de ser creado por el actor autenticado. Se consulta por
    // su PK sin reaplicar el alcance visual para evitar que el modo visor o una
    // asignación todavía nula oculten la respuesta de la propia operación.
    const created = await repository.findById(connection, idRedes);
    const evidence = await repository.listEvidence(connection, idRedes);

    return {
      ok: true,
      source: 'aiven',
      message: 'Registro de Redes creado correctamente.',
      id_redes: idRedes,
      registro: {
        ...created,
        archivos: evidence.map((file) => presentEvidence(file, idRedes))
      }
    };
  } catch (error) {
    try { await connection.rollback(); } catch (_rollbackError) {}
    if (uploaded.length) {
      await cleanupAzureFiles(uploaded, {
        modulo: 'ventas',
        entidad_tipo: 'redes',
        solicitado_por: actor,
        motivo: 'Compensación por fallo al crear registro de Redes.'
      });
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function update(rawId, payload, actionContext) {
  const actor = actorId(actionContext);
  const changes = normalizeRecordPayload(payload || {}, { partial: true });
  const connection = await repository.getConnection();

  try {
    await connection.beginTransaction();
    const scope = await resolveScope(connection, actionContext);
    const { idRedes, record } = await assertVisibleRecord(connection, rawId, actionContext, {
      scope,
      includeInactive: false,
      forUpdate: true
    });

    const assignmentChanged = Object.prototype.hasOwnProperty.call(changes, 'id_usuario_asignado')
      && !sameNullableId(record.id_usuario_asignado, changes.id_usuario_asignado);
    await validateRecordRelations(connection, changes, scope, { assignmentChanged });

    const statusChanged = Object.prototype.hasOwnProperty.call(changes, 'id_estatus')
      && !sameNullableId(record.id_estatus, changes.id_estatus);
    if (statusChanged) changes.fecha_cambio_estatus = new Date();

    changes.updated_by = actor;
    await repository.update(connection, idRedes, changes);
    const updated = await repository.findById(connection, idRedes, {
      includeInactive: true,
      scope
    });
    await connection.commit();

    return {
      ok: true,
      source: 'aiven',
      message: 'Registro de Redes actualizado correctamente.',
      id_redes: idRedes,
      registro: updated,
      estatus_actualizado: statusChanged,
      asignacion_actualizada: assignmentChanged
    };
  } catch (error) {
    try { await connection.rollback(); } catch (_rollbackError) {}
    throw error;
  } finally {
    connection.release();
  }
}

async function updateGeneral(rawId, payload, actionContext) {
  const connection = await repository.getConnection();
  try {
    await requireRedesPermission(connection, actionContext, REDES_PERMISSIONS_COR.editar, 'No tienes permiso para editar registros de Redes.');
    if (Object.prototype.hasOwnProperty.call(payload || {}, 'id_usuario_asignado')) {
      await requireRedesPermission(connection, actionContext, REDES_PERMISSIONS_COR.asignar_editar, 'No tienes permiso para asignar responsables en Redes.');
    }
    if (Object.prototype.hasOwnProperty.call(payload || {}, 'id_estatus')) {
      await requireRedesPermission(connection, actionContext, REDES_PERMISSIONS_COR.cambiar_estado, 'No tienes permiso para cambiar el estado en Redes.');
    }
    if (Object.prototype.hasOwnProperty.call(payload || {}, 'id_cotizacion')) {
      await requireRedesPermission(connection, actionContext, REDES_PERMISSIONS_COR.relacion_cotizacion, 'No tienes permiso para gestionar la relación con cotización en Redes.');
    }
  } finally {
    connection.release();
  }
  return update(rawId, payload, actionContext);
}

async function updateStatus(rawId, payload, actionContext) {
  if (!Object.prototype.hasOwnProperty.call(payload || {}, 'id_estatus')) {
    throw httpError(400, 'Debes enviar id_estatus.');
  }
  const connection = await repository.getConnection();
  try {
    await requireRedesPermission(connection, actionContext, REDES_PERMISSIONS_COR.cambiar_estado, 'No tienes permiso para cambiar el estado en Redes.');
  } finally {
    connection.release();
  }
  return update(rawId, { id_estatus: payload.id_estatus }, actionContext);
}

async function updateAssignment(rawId, payload, actionContext) {
  if (!Object.prototype.hasOwnProperty.call(payload || {}, 'id_usuario_asignado')) {
    throw httpError(400, 'Debes enviar id_usuario_asignado.');
  }

  const connection = await repository.getConnection();
  try {
    await requireRedesPermission(connection, actionContext, REDES_PERMISSIONS_COR.asignar_editar, 'No tienes permiso para asignar o reasignar responsables en Redes.');
  } finally {
    connection.release();
  }

  return update(rawId, { id_usuario_asignado: payload.id_usuario_asignado }, actionContext);
}

async function updateQuotation(rawId, payload, actionContext) {
  if (!Object.prototype.hasOwnProperty.call(payload || {}, 'id_cotizacion')) {
    throw httpError(400, 'Debes enviar id_cotizacion.');
  }
  const connection = await repository.getConnection();
  try {
    await requireRedesPermission(connection, actionContext, REDES_PERMISSIONS_COR.relacion_cotizacion, 'No tienes permiso para gestionar la relación con cotización en Redes.');
  } finally {
    connection.release();
  }
  return update(rawId, { id_cotizacion: payload.id_cotizacion }, actionContext);
}

async function remove(rawId, actionContext) {
  const actor = actorId(actionContext);
  const connection = await repository.getConnection();
  try {
    await connection.beginTransaction();
    const scope = await resolveScope(connection, actionContext);
    const { idRedes } = await assertVisibleRecord(connection, rawId, actionContext, {
      scope,
      forUpdate: true
    });
    await repository.softDelete(connection, idRedes, actor);
    await connection.commit();
    return {
      ok: true,
      source: 'aiven',
      message: 'Registro de Redes desactivado correctamente.',
      id_redes: idRedes,
      eliminado: true
    };
  } catch (error) {
    try { await connection.rollback(); } catch (_rollbackError) {}
    throw error;
  } finally {
    connection.release();
  }
}

async function listEvidence(rawId, actionContext) {
  const connection = await repository.getConnection();
  try {
    const { idRedes } = await assertVisibleRecord(connection, rawId, actionContext);
    const rows = await repository.listEvidence(connection, idRedes);
    return {
      ok: true,
      source: 'aiven',
      id_redes: idRedes,
      archivos: rows.map((file) => presentEvidence(file, idRedes))
    };
  } finally {
    connection.release();
  }
}

async function uploadEvidence(rawId, files, actionContext) {
  const actor = actorId(actionContext);
  const input = evidenceInput(files);
  if (!input.length) throw httpError(400, 'Selecciona Imagen 1 y/o Imagen 2.');

  const connection = await repository.getConnection();
  let uploaded = [];
  let replaced = [];
  let idRedes = null;

  try {
    await connection.beginTransaction();
    const scope = await resolveScope(connection, actionContext);
    const visible = await assertVisibleRecord(connection, rawId, actionContext, {
      scope,
      forUpdate: true
    });
    idRedes = visible.idRedes;

    await uploadEvidenceSet(connection, idRedes, input, actionContext, { uploaded, replaced });
    await connection.commit();
  } catch (error) {
    try { await connection.rollback(); } catch (_rollbackError) {}
    if (uploaded.length) {
      await cleanupAzureFiles(uploaded, {
        modulo: 'ventas',
        entidad_tipo: 'redes',
        entidad_id: idRedes,
        solicitado_por: actor,
        motivo: 'Compensación por fallo al guardar evidencia de Redes.'
      });
    }
    throw error;
  } finally {
    connection.release();
  }

  const cleanup = await cleanupAzureFiles(replaced, {
    modulo: 'ventas',
    entidad_tipo: 'redes_evidencia_reemplazada',
    entidad_id: idRedes,
    solicitado_por: actor,
    motivo: 'Reemplazo de evidencia principal de Redes.'
  });

  const readConnection = await repository.getConnection();
  try {
    const rows = await repository.listEvidence(readConnection, idRedes);
    return {
      ok: true,
      source: 'aiven',
      message: 'Evidencias actualizadas correctamente.',
      id_redes: idRedes,
      archivos: rows.map((file) => presentEvidence(file, idRedes)),
      cleanup
    };
  } finally {
    readConnection.release();
  }
}

async function getEvidenceAccess(rawId, rawFileId, query, actionContext) {
  const idArchivo = positiveInteger(rawFileId, 'id_archivo');
  const connection = await repository.getConnection();
  try {
    const { idRedes } = await assertVisibleRecord(connection, rawId, actionContext);
    const file = await repository.findEvidenceById(connection, idRedes, idArchivo);
    if (!file) throw httpError(404, 'Evidencia no encontrada.');

    if (providerOf(file) !== azureStorage.PROVIDER || !file.storage_blob_name) {
      const legacyUrl = normalizeLegacyUrl(file.storage_url);
      if (!legacyUrl) throw httpError(404, 'La evidencia no tiene una referencia disponible.');
      return {
        ok: true,
        source: 'legacy',
        legacy: true,
        access_url: legacyUrl,
        expires_at: null
      };
    }

    const access = await storageAccess.createReadAccess_gnral({
      actorUser: actionContext.user,
      contextUser: contextUser(actionContext),
      reference: file,
      download: parseBoolean(query?.download),
      context: {
        modulo: 'ventas-redes',
        entidadTipo: 'redes',
        entidadId: idRedes,
        archivoId: idArchivo
      },
      authorize: async () => ({ allowed: true, metadata: { id_redes: idRedes } })
    });

    return { ok: true, source: 'azure', legacy: false, ...access };
  } finally {
    connection.release();
  }
}

async function deleteEvidence(rawId, rawFileId, actionContext) {
  const actor = actorId(actionContext);
  const idArchivo = positiveInteger(rawFileId, 'id_archivo');
  const connection = await repository.getConnection();
  let file = null;
  let idRedes = null;

  try {
    await connection.beginTransaction();
    const scope = await resolveScope(connection, actionContext);
    const visible = await assertVisibleRecord(connection, rawId, actionContext, {
      scope,
      forUpdate: true
    });
    idRedes = visible.idRedes;
    file = await repository.findEvidenceById(connection, idRedes, idArchivo, { forUpdate: true });
    if (!file) throw httpError(404, 'Evidencia no encontrada.');
    await repository.softDeleteEvidence(connection, idRedes, idArchivo);
    await connection.commit();
  } catch (error) {
    try { await connection.rollback(); } catch (_rollbackError) {}
    throw error;
  } finally {
    connection.release();
  }

  const cleanup = await cleanupAzureFiles([file], {
    modulo: 'ventas',
    entidad_tipo: 'redes_evidencia',
    entidad_id: idArchivo,
    solicitado_por: actor,
    motivo: 'Baja de evidencia de Redes.'
  });

  return {
    ok: true,
    source: 'aiven',
    message: 'Evidencia eliminada correctamente.',
    id_archivo: idArchivo,
    cleanup
  };
}

async function listComments(rawId, query, actionContext) {
  const page = boundedInteger(query?.page, 1, 1, 100000, 'page');
  const pageSize = boundedInteger(query?.page_size || query?.pageSize, 50, 1, 200, 'page_size');
  const connection = await repository.getConnection();
  try {
    const { idRedes } = await assertVisibleRecord(connection, rawId, actionContext);
    const result = await repository.listComments(connection, idRedes, { page, pageSize });
    const commentIds = result.rows.map((row) => Number(row.id_comentario));
    const attachments = await repository.listAttachmentsByCommentIds(connection, commentIds);
    const byComment = new Map();

    for (const file of attachments) {
      const key = Number(file.id_comentario);
      if (!byComment.has(key)) byComment.set(key, []);
      byComment.get(key).push(presentAttachment(file, idRedes, key));
    }

    return {
      ok: true,
      source: 'aiven',
      id_redes: idRedes,
      comentarios: result.rows.map((comment) => ({
        ...comment,
        adjuntos: byComment.get(Number(comment.id_comentario)) || []
      })),
      pagination: {
        page,
        page_size: pageSize,
        total: result.total,
        total_pages: Math.ceil(result.total / pageSize)
      }
    };
  } finally {
    connection.release();
  }
}

async function createComment(rawId, payload, files, actionContext) {
  const actor = actorId(actionContext);
  const comentario = cleanText(payload?.comentario, 10000);
  if (!comentario && !(files || []).length) {
    throw httpError(400, 'Escribe un comentario o adjunta al menos un archivo.');
  }

  const connection = await repository.getConnection();
  let uploaded = [];
  let idRedes = null;
  try {
    await connection.beginTransaction();
    const scope = await resolveScope(connection, actionContext);
    const visible = await assertVisibleRecord(connection, rawId, actionContext, {
      scope,
      forUpdate: true
    });
    idRedes = visible.idRedes;

    const idComentario = await repository.insertComment(connection, {
      id_redes: idRedes,
      id_usuario: actor,
      comentario,
      fecha_hora: new Date(),
      editado: 0,
      activo: 1
    });

    await uploadCommentAttachments(
      connection,
      idRedes,
      idComentario,
      files || [],
      actionContext,
      { uploaded }
    );

    const created = await repository.findComment(connection, idRedes, idComentario);
    const attachmentRows = await repository.listAttachmentsByComment(connection, idComentario);
    await connection.commit();

    return {
      ok: true,
      source: 'aiven',
      message: uploaded.length ? 'Comentario y adjuntos registrados correctamente.' : 'Comentario registrado correctamente.',
      comentario: {
        ...created,
        adjuntos: attachmentRows.map((file) => presentAttachment(file, idRedes, idComentario))
      }
    };
  } catch (error) {
    try { await connection.rollback(); } catch (_rollbackError) {}
    if (uploaded.length) {
      await cleanupAzureFiles(uploaded, {
        modulo: 'ventas',
        entidad_tipo: 'redes_comentario',
        entidad_id: idRedes,
        solicitado_por: actor,
        motivo: 'Compensación por fallo al registrar comentario de Redes.'
      });
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function updateComment(rawId, rawCommentId, payload, actionContext) {
  const actor = actorId(actionContext);
  const idComentario = positiveInteger(rawCommentId, 'id_comentario');
  const comentario = cleanText(payload?.comentario, 10000);
  if (!comentario) throw httpError(400, 'comentario es obligatorio para editar.');

  const connection = await repository.getConnection();
  try {
    await connection.beginTransaction();
    const scope = await resolveScope(connection, actionContext);
    const { idRedes } = await assertVisibleRecord(connection, rawId, actionContext, {
      scope,
      forUpdate: true
    });
    const existing = await repository.findComment(connection, idRedes, idComentario, { forUpdate: true });
    if (!existing) throw httpError(404, 'Comentario no encontrado.');
    if (Number(existing.id_usuario) !== actor) {
      throw httpError(403, 'Solo el autor puede editar el comentario.');
    }

    await repository.updateComment(connection, idRedes, idComentario, comentario);
    const updated = await repository.findComment(connection, idRedes, idComentario);
    await connection.commit();
    return {
      ok: true,
      source: 'aiven',
      message: 'Comentario actualizado correctamente.',
      comentario: updated
    };
  } catch (error) {
    try { await connection.rollback(); } catch (_rollbackError) {}
    throw error;
  } finally {
    connection.release();
  }
}

async function deleteComment(rawId, rawCommentId, actionContext) {
  const actor = actorId(actionContext);
  const idComentario = positiveInteger(rawCommentId, 'id_comentario');
  const connection = await repository.getConnection();
  let attachments = [];
  let idRedes = null;

  try {
    await connection.beginTransaction();
    const scope = await resolveScope(connection, actionContext);
    const visible = await assertVisibleRecord(connection, rawId, actionContext, {
      scope,
      forUpdate: true
    });
    idRedes = visible.idRedes;
    const existing = await repository.findComment(connection, idRedes, idComentario, { forUpdate: true });
    if (!existing) throw httpError(404, 'Comentario no encontrado.');
    if (Number(existing.id_usuario) !== actor) {
      throw httpError(403, 'Solo el autor puede eliminar el comentario.');
    }

    attachments = await repository.listAttachmentsByComment(connection, idComentario, { forUpdate: true });
    if (attachments.length) await repository.softDeleteAttachmentsByComment(connection, idComentario);
    await repository.softDeleteComment(connection, idRedes, idComentario);
    await connection.commit();
  } catch (error) {
    try { await connection.rollback(); } catch (_rollbackError) {}
    throw error;
  } finally {
    connection.release();
  }

  const cleanup = await cleanupAzureFiles(attachments, {
    modulo: 'ventas',
    entidad_tipo: 'redes_comentario',
    entidad_id: idComentario,
    solicitado_por: actor,
    motivo: 'Baja coordinada de comentario y adjuntos de Redes.'
  });

  return {
    ok: true,
    source: 'aiven',
    message: 'Comentario y adjuntos eliminados correctamente.',
    id_comentario: idComentario,
    adjuntos_desactivados: attachments.length,
    cleanup
  };
}

async function addCommentAttachments(rawId, rawCommentId, files, actionContext) {
  const actor = actorId(actionContext);
  const idComentario = positiveInteger(rawCommentId, 'id_comentario');
  if (!(files || []).length) throw httpError(400, 'Selecciona al menos un archivo.');

  const connection = await repository.getConnection();
  let uploaded = [];
  let idRedes = null;
  try {
    await connection.beginTransaction();
    const scope = await resolveScope(connection, actionContext);
    const visible = await assertVisibleRecord(connection, rawId, actionContext, {
      scope,
      forUpdate: true
    });
    idRedes = visible.idRedes;
    const comment = await repository.findComment(connection, idRedes, idComentario, { forUpdate: true });
    if (!comment) throw httpError(404, 'Comentario no encontrado.');
    if (Number(comment.id_usuario) !== actor) {
      throw httpError(403, 'Solo el autor puede agregar adjuntos al comentario.');
    }

    await uploadCommentAttachments(
      connection,
      idRedes,
      idComentario,
      files,
      actionContext,
      { uploaded }
    );
    const rows = await repository.listAttachmentsByComment(connection, idComentario);
    await connection.commit();

    return {
      ok: true,
      source: 'aiven',
      message: 'Adjuntos agregados correctamente.',
      id_comentario: idComentario,
      adjuntos: rows.map((file) => presentAttachment(file, idRedes, idComentario))
    };
  } catch (error) {
    try { await connection.rollback(); } catch (_rollbackError) {}
    if (uploaded.length) {
      await cleanupAzureFiles(uploaded, {
        modulo: 'ventas',
        entidad_tipo: 'redes_comentario',
        entidad_id: idComentario,
        solicitado_por: actor,
        motivo: 'Compensación por fallo al agregar adjuntos de comentario de Redes.'
      });
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function getAttachmentAccess(rawId, rawCommentId, rawAttachmentId, query, actionContext) {
  const idComentario = positiveInteger(rawCommentId, 'id_comentario');
  const idAdjunto = positiveInteger(rawAttachmentId, 'id_adjunto');
  const connection = await repository.getConnection();
  try {
    const { idRedes } = await assertVisibleRecord(connection, rawId, actionContext);
    const file = await repository.findAttachment(connection, idRedes, idComentario, idAdjunto);
    if (!file) throw httpError(404, 'Adjunto no encontrado.');

    if (providerOf(file) !== azureStorage.PROVIDER || !file.storage_blob_name) {
      const legacyUrl = normalizeLegacyUrl(file.storage_url);
      if (!legacyUrl) throw httpError(404, 'El adjunto no tiene una referencia disponible.');
      return {
        ok: true,
        source: 'legacy',
        legacy: true,
        access_url: legacyUrl,
        expires_at: null
      };
    }

    const access = await storageAccess.createReadAccess_gnral({
      actorUser: actionContext.user,
      contextUser: contextUser(actionContext),
      reference: file,
      download: parseBoolean(query?.download),
      context: {
        modulo: 'ventas-redes',
        entidadTipo: 'redes_comentario',
        entidadId: idRedes,
        archivoId: idAdjunto
      },
      authorize: async () => ({
        allowed: true,
        metadata: { id_redes: idRedes, id_comentario: idComentario }
      })
    });

    return { ok: true, source: 'azure', legacy: false, ...access };
  } finally {
    connection.release();
  }
}

async function deleteAttachment(rawId, rawCommentId, rawAttachmentId, actionContext) {
  const actor = actorId(actionContext);
  const idComentario = positiveInteger(rawCommentId, 'id_comentario');
  const idAdjunto = positiveInteger(rawAttachmentId, 'id_adjunto');
  const connection = await repository.getConnection();
  let file = null;
  let idRedes = null;

  try {
    await connection.beginTransaction();
    const scope = await resolveScope(connection, actionContext);
    const visible = await assertVisibleRecord(connection, rawId, actionContext, {
      scope,
      forUpdate: true
    });
    idRedes = visible.idRedes;
    file = await repository.findAttachment(connection, idRedes, idComentario, idAdjunto, { forUpdate: true });
    if (!file) throw httpError(404, 'Adjunto no encontrado.');
    if (Number(file.id_usuario) !== actor && Number(file.comentario_usuario_id) !== actor) {
      throw httpError(403, 'Solo el autor puede eliminar el adjunto.');
    }

    await repository.softDeleteAttachment(connection, idAdjunto);
    await connection.commit();
  } catch (error) {
    try { await connection.rollback(); } catch (_rollbackError) {}
    throw error;
  } finally {
    connection.release();
  }

  const cleanup = await cleanupAzureFiles([file], {
    modulo: 'ventas',
    entidad_tipo: 'redes_comentario_adjunto',
    entidad_id: idAdjunto,
    solicitado_por: actor,
    motivo: 'Baja individual de adjunto de comentario de Redes.'
  });

  return {
    ok: true,
    source: 'aiven',
    message: 'Adjunto eliminado correctamente.',
    id_adjunto: idAdjunto,
    cleanup
  };
}

module.exports = {
  CATALOG_PATHS,
  list,
  getById,
  getCatalogs,
  getAssignableUsers,
  getActiveQuotations,
  create,
  update,
  updateGeneral,
  updateStatus,
  updateAssignment,
  updateQuotation,
  remove,
  listEvidence,
  uploadEvidence,
  getEvidenceAccess,
  deleteEvidence,
  listComments,
  createComment,
  updateComment,
  deleteComment,
  addCommentAttachments,
  getAttachmentAccess,
  deleteAttachment
};

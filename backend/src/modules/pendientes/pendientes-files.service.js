const db = require('../../config/db');
const azureStorage = require('../../services/storage/azure-storage.service');
const storageContract = require('../../services/storage/storage-contract.service');
const storageAdapters = require('../../services/storage/storage-metadata.adapters');
const storageAccess = require('../../services/storage/storage-access.service');
const filePolicy = require('../../services/storage/storage-file-policy.service');
const pendienteAccess = require('./pendientes-access.service');
const repository = require('./pendientes-files.repository');

const AZURE_PROVIDER = azureStorage.PROVIDER;

function httpError(message, status, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.expose = true;
  return error;
}

function parseBoolean_gnral(value) {
  if (typeof value === 'boolean') return value;
  return ['1', 'true', 'yes', 'on', 'si', 'sí'].includes(String(value || '').trim().toLowerCase());
}

function parseJsonArray_gnral(value, fallback = []) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : fallback;
    } catch (_error) {
      return fallback;
    }
  }
  return fallback;
}

function normalizeTaskBody_gnral(body = {}) {
  const source = body && typeof body === 'object' ? body : {};
  const usuarios = parseJsonArray_gnral(
    source.usuarios_json !== undefined ? source.usuarios_json : source.usuarios,
    []
  );
  const subtareas = parseJsonArray_gnral(
    source.subtareas_json !== undefined ? source.subtareas_json : source.subtareas,
    []
  );

  return {
    ...source,
    usuarios,
    subtareas,
    con_subtareas: parseBoolean_gnral(source.con_subtareas),
    rewrite_subtareas: source.rewrite_subtareas === undefined
      ? true
      : parseBoolean_gnral(source.rewrite_subtareas)
  };
}

function firstFile_gnral(req, fieldName) {
  if (!req) return null;
  if (req.file && (!fieldName || req.file.fieldname === fieldName)) return req.file;
  if (Array.isArray(req.files)) {
    return req.files.find(file => file && (!fieldName || file.fieldname === fieldName)) || null;
  }
  if (req.files && Array.isArray(req.files[fieldName])) return req.files[fieldName][0] || null;
  return null;
}

function rejectLegacyBase64_gnral(req) {
  const body = req && req.body;
  if (!body) return;
  for (const key of ['photo_file', 'adjunto_file', 'archivo']) {
    const value = body[key];
    if (!value) continue;
    if (typeof value === 'object' || String(value).includes('base64,')) {
      throw httpError(
        'La carga Base64 ya no está permitida. Actualiza la pantalla y vuelve a seleccionar el archivo.',
        400,
        'CFFAA_BASE64_UPLOAD_DISABLED'
      );
    }
  }
}

function extractTaskEvidence_gnral(req) {
  rejectLegacyBase64_gnral(req);
  const photo = firstFile_gnral(req, 'photo_file');
  const attachment = firstFile_gnral(req, 'adjunto_file');

  if (photo && attachment) {
    throw httpError(
      'Selecciona solo una imagen o un archivo directo.',
      400,
      'CFFAA_PENDIENTE_EVIDENCE_CONFLICT'
    );
  }
  if (!photo && !attachment) return null;

  if (photo) {
    filePolicy.validateFile_gnral(photo, { policyName: 'IMAGE' });
    return {
      file: photo,
      tipo_archivo: 'FOTO',
      policyName: 'IMAGE',
      subruta: 'evidencia-foto'
    };
  }

  filePolicy.validateFile_gnral(attachment, { policyName: 'DOCUMENT' });
  return {
    file: attachment,
    tipo_archivo: 'ADJUNTO',
    policyName: 'DOCUMENT',
    subruta: 'evidencia-adjunto'
  };
}

function extractCommentFile_gnral(req) {
  rejectLegacyBase64_gnral(req);
  const file = firstFile_gnral(req, 'archivo');
  if (!file) return null;
  filePolicy.validateFile_gnral(file, { policyName: 'GENERAL' });
  return file;
}

function isAzureReference_gnral(row) {
  return String(row && row.storage_provider || '').trim().toUpperCase() === AZURE_PROVIDER
    && Boolean(String(row && row.storage_blob_name || '').trim());
}

function sanitizePendienteForClient_gnral(row, options = {}) {
  const safe = { ...(row || {}) };
  const hasLegacy = Boolean(String(safe.photo_url || '').trim() || String(safe.adjunto_url || '').trim());
  delete safe.photo_url;
  delete safe.adjunto_url;
  safe.tiene_evidencia_directa = Number(options.directCount || 0) > 0 ? 1 : 0;
  safe.tiene_evidencia_legacy = hasLegacy ? 1 : 0;
  return safe;
}

function directAccessEndpoint_gnral(idPendiente, idArchivo) {
  return `/api/pendientes/${encodeURIComponent(idPendiente)}/archivos/${encodeURIComponent(idArchivo)}/acceso`;
}

function commentAccessEndpoint_gnral(idPendiente, idComentario, idAdjunto) {
  return `/api/pendientes/${encodeURIComponent(idPendiente)}/comentarios/${encodeURIComponent(idComentario)}/adjuntos/${encodeURIComponent(idAdjunto)}/acceso`;
}

function legacyAccessEndpoint_gnral(idPendiente, tipo) {
  return `/api/pendientes/${encodeURIComponent(idPendiente)}/evidencia-legacy/${encodeURIComponent(tipo)}/acceso`;
}

function toDirectClientFile_gnral(row) {
  return {
    id_archivo: row.id_archivo,
    id_pendiente: row.id_pendiente,
    tipo_archivo: row.tipo_archivo,
    nombre_original: row.nombre_original,
    mime_type: row.mime_type || null,
    tamano_bytes: row.tamano_bytes == null ? null : Number(row.tamano_bytes),
    storage_provider: row.storage_provider || null,
    origen_archivo: row.origen_archivo || 'NUEVO',
    subido_por: row.subido_por || null,
    created_at: row.created_at || null,
    activo: Number(row.activo) === 1 ? 1 : 0,
    access_endpoint: directAccessEndpoint_gnral(row.id_pendiente, row.id_archivo)
  };
}

function toCommentClientFile_gnral(row, idPendiente) {
  return {
    id_adjunto: row.id_adjunto,
    id_comentario: row.id_comentario,
    nombre_archivo: row.nombre_archivo,
    tipo_archivo: row.tipo_archivo || null,
    tamano_bytes: row.tamano_bytes == null ? null : Number(row.tamano_bytes),
    storage_provider: row.storage_provider || null,
    fecha: row.fecha || null,
    activo: row.activo == null ? 1 : (Number(row.activo) === 1 ? 1 : 0),
    access_endpoint: commentAccessEndpoint_gnral(
      row.id_pendiente || idPendiente,
      row.id_comentario,
      row.id_adjunto
    )
  };
}

function legacyFilesFromTask_gnral(row) {
  const idPendiente = row && row.id_pendiente;
  if (!idPendiente) return [];
  const files = [];
  if (String(row.photo_url || '').trim()) {
    files.push({
      tipo_archivo: 'FOTO',
      nombre_original: 'Foto histórica',
      origen_archivo: 'LEGACY',
      access_endpoint: legacyAccessEndpoint_gnral(idPendiente, 'FOTO')
    });
  }
  if (String(row.adjunto_url || '').trim()) {
    files.push({
      tipo_archivo: 'ADJUNTO',
      nombre_original: 'Archivo histórico',
      origen_archivo: 'LEGACY',
      access_endpoint: legacyAccessEndpoint_gnral(idPendiente, 'ADJUNTO')
    });
  }
  return files;
}

function groupDirectFilesByTask_gnral(rows) {
  const grouped = new Map();
  for (const row of rows || []) {
    const key = String(row.id_pendiente);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(toDirectClientFile_gnral(row));
  }
  return grouped;
}

function attachCommentFiles_gnral(comments, attachments, idPendiente) {
  const grouped = new Map();
  for (const row of attachments || []) {
    const key = String(row.id_comentario);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(toCommentClientFile_gnral(row, idPendiente));
  }
  return (comments || []).map(comment => ({
    ...comment,
    adjuntos: grouped.get(String(comment.id_comentario)) || []
  }));
}

function legacyAzureReference_gnral(value) {
  const text = String(value || '').trim();
  if (!text.toLowerCase().startsWith('azureblob:')) return null;
  const blob = text.slice('azureblob:'.length).replace(/^\/+/, '');
  if (!blob) return null;
  return {
    storage_provider: AZURE_PROVIDER,
    storage_container: process.env.AZURE_STORAGE_BLOB_CONTAINER_NAME || null,
    storage_blob_name: blob
  };
}

function legacyAzureReferences_gnral(row) {
  return [
    legacyAzureReference_gnral(row && row.photo_url),
    legacyAzureReference_gnral(row && row.adjunto_url)
  ].filter(Boolean);
}

function toAzureReference_gnral(row) {
  if (!isAzureReference_gnral(row)) return null;
  return {
    storage_provider: AZURE_PROVIDER,
    storage_container: row.storage_container || process.env.AZURE_STORAGE_BLOB_CONTAINER_NAME || null,
    storage_blob_name: row.storage_blob_name,
    nombre_original: row.nombre_original || row.nombre_archivo || null,
    mime_type: row.mime_type || row.tipo_archivo || null,
    tamano_bytes: row.tamano_bytes == null ? null : Number(row.tamano_bytes),
    activo: row.activo == null ? 1 : Number(row.activo)
  };
}

async function uploadDirectEvidence_gnral({ connection, conn, idPendiente, empresa, userId, evidence, input }) {
  const executor = connection || conn;
  const selected = evidence || input;
  if (!selected) return null;
  if (!executor) throw httpError('No se recibió la transacción de la tarea.', 500, 'CFFAA_TRANSACTION_REQUIRED');

  return storageContract.uploadAndPersist_gnral({
    upload: {
      file: selected.file,
      empresa,
      modulo: 'home',
      entidadTipo: 'pendiente',
      entidadId: idPendiente,
      subruta: selected.subruta,
      policyName: selected.policyName,
      metadata: {
        uploaded_by: userId,
        task_id: idPendiente,
        kind: String(selected.tipo_archivo || '').toLowerCase()
      }
    },
    persist: async uploaded => {
      const previousRows = await repository.listDirectFiles_gnral(executor, idPendiente, {
        forUpdate: true
      });
      const previous = previousRows.map(toAzureReference_gnral).filter(Boolean);
      await repository.deactivateActiveDirectFiles_gnral(
        executor,
        idPendiente,
        userId,
        'REEMPLAZO'
      );
      const meta = storageAdapters.forPendientesDirectos_gnral(
        uploaded,
        userId,
        selected.tipo_archivo
      );
      const idArchivo = await repository.insertDirectFile_gnral(executor, {
        id_pendiente: idPendiente,
        ...meta,
        origen_archivo: 'NUEVO'
      });
      return {
        id_archivo: idArchivo,
        nombre_original: meta.nombre_original,
        previous
      };
    },
    cleanupContext: {
      modulo: 'home',
      entidadTipo: 'pendiente',
      entidadId: idPendiente,
      solicitadoPor: userId,
      motivo: 'Compensación de evidencia directa no persistida.'
    }
  });
}

async function uploadCommentAttachment_gnral({ connection, conn, idPendiente, idComentario, empresa, userId, file }) {
  const executor = connection || conn;
  if (!file) return null;
  if (!executor) throw httpError('No se recibió la transacción del comentario.', 500, 'CFFAA_TRANSACTION_REQUIRED');

  return storageContract.uploadAndPersist_gnral({
    upload: {
      file,
      empresa,
      modulo: 'home',
      entidadTipo: 'pendiente',
      entidadId: idPendiente,
      subruta: `comentarios-${idComentario}`,
      policyName: 'GENERAL',
      metadata: {
        uploaded_by: userId,
        task_id: idPendiente,
        comment_id: idComentario,
        kind: 'comentario'
      }
    },
    persist: async uploaded => {
      const meta = storageAdapters.forPendientesComentarios_gnral(uploaded, userId);
      const idAdjunto = await repository.insertCommentAttachment_gnral(
        executor,
        idComentario,
        meta
      );
      return {
        id_adjunto: idAdjunto,
        nombre_archivo: meta.nombre_archivo
      };
    },
    cleanupContext: {
      modulo: 'home',
      entidadTipo: 'pendiente_comentario',
      entidadId: idComentario,
      solicitadoPor: userId,
      motivo: 'Compensación de adjunto de comentario no persistido.'
    }
  });
}

async function deleteReferencesAfterCommit_gnral(references, context = {}) {
  const seen = new Set();
  const result = { total: 0, eliminados: 0, en_cola: 0, omitidos: 0 };

  for (const reference of references || []) {
    const normalized = toAzureReference_gnral(reference);
    if (!normalized) {
      result.omitidos += 1;
      continue;
    }
    const key = `${normalized.storage_container || ''}|${normalized.storage_blob_name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.total += 1;

    try {
      const deleted = await azureStorage.deleteBlob_gnral(normalized.storage_blob_name, {
        containerName: normalized.storage_container || undefined,
        queueOnFailure: true,
        queueContext: {
          modulo: 'home',
          entidadTipo: context.entidad_tipo || context.entidadTipo || 'pendiente',
          entidadId: context.entidad_id || context.entidadId || null,
          solicitadoPor: context.solicitado_por || context.solicitadoPor || null,
          motivo: context.motivo || 'Limpieza de archivo de Home/Pendientes.'
        }
      });
      if (deleted && deleted.deleted) result.eliminados += 1;
    } catch (error) {
      if (error.queue_operation_id) result.en_cola += 1;
      else result.omitidos += 1;
    }
  }

  return result;
}

async function cleanupUploaded_gnral(uploaded, context = {}) {
  const values = Array.isArray(uploaded) ? uploaded : [uploaded];
  return deleteReferencesAfterCommit_gnral(values.filter(Boolean), context);
}

function requestUsers_gnral(req) {
  return {
    actorUser: req.actorUser || req.user,
    contextUser: req.contextUser || req.user
  };
}

async function createAccessForReference_gnral(req, reference, access, context) {
  pendienteAccess.assertAccess_gnral(access, {
    forbiddenMessage: 'No tienes acceso a los archivos de esta tarea.'
  });
  const users = requestUsers_gnral(req);
  return storageAccess.createReadAccess_gnral({
    ...users,
    reference,
    context,
    authorize: async () => ({
      allowed: true,
      metadata: { creator: access.creator, related: access.related }
    }),
    download: String(req.query && req.query.download || '').toLowerCase() === 'true'
  });
}

async function directFileAccess_gnral(req) {
  const idPendiente = Number.parseInt(req.params.id, 10);
  const idArchivo = Number.parseInt(req.params.idArchivo, 10);
  if (!idPendiente || !idArchivo) {
    throw httpError('Identificador de archivo no válido.', 400, 'CFFAA_FILE_ID_INVALID');
  }

  const access = await pendienteAccess.getPendienteAccessContext_gnral(
    db,
    idPendiente,
    req.contextUser || req.user
  );
  pendienteAccess.assertAccess_gnral(access, {
    forbiddenMessage: 'No tienes acceso a los archivos de esta tarea.'
  });
  const row = await repository.getDirectFileById_gnral(db, idPendiente, idArchivo);
  if (!row) throw httpError('El archivo no existe o ya fue eliminado.', 404, 'CFFAA_FILE_NOT_FOUND');
  return createAccessForReference_gnral(req, row, access, {
    modulo: 'home',
    entidadTipo: 'pendiente_evidencia',
    entidadId: idPendiente,
    archivoId: idArchivo
  });
}

async function commentAttachmentAccess_gnral(req) {
  const idPendiente = Number.parseInt(req.params.id, 10);
  const idComentario = Number.parseInt(req.params.idComentario, 10);
  const idAdjunto = Number.parseInt(req.params.idAdjunto, 10);
  if (!idPendiente || !idComentario || !idAdjunto) {
    throw httpError('Identificador de archivo no válido.', 400, 'CFFAA_FILE_ID_INVALID');
  }

  const access = await pendienteAccess.getPendienteAccessContext_gnral(
    db,
    idPendiente,
    req.contextUser || req.user
  );
  pendienteAccess.assertAccess_gnral(access, {
    forbiddenMessage: 'No tienes acceso a los archivos de esta tarea.'
  });
  const row = await repository.getCommentAttachmentById_gnral(
    db,
    idPendiente,
    idComentario,
    idAdjunto
  );
  if (!row) throw httpError('El archivo no existe o ya fue eliminado.', 404, 'CFFAA_FILE_NOT_FOUND');

  if (isAzureReference_gnral(row)) {
    return createAccessForReference_gnral(req, row, access, {
      modulo: 'home',
      entidadTipo: 'pendiente_comentario',
      entidadId: idPendiente,
      archivoId: idAdjunto
    });
  }

  pendienteAccess.assertAccess_gnral(access);
  return {
    storage_provider: row.storage_provider || 'LEGACY',
    nombre_original: row.nombre_archivo,
    mime_type: row.tipo_archivo || null,
    tamano_bytes: row.tamano_bytes == null ? null : Number(row.tamano_bytes),
    disposition: 'inline',
    access_url: row.archivo_url,
    expires_at: null,
    expires_in_minutes: null,
    legacy: true
  };
}

async function legacyEvidenceAccess_gnral(req) {
  const idPendiente = Number.parseInt(req.params.id, 10);
  const tipo = String(req.params.tipo || '').trim().toUpperCase();
  if (!idPendiente) throw httpError('Identificador de tarea no válido.', 400, 'PENDIENTE_ID_INVALID');
  if (!['FOTO', 'ADJUNTO'].includes(tipo)) {
    throw httpError('Tipo de evidencia no válido.', 400, 'CFFAA_LEGACY_TYPE_INVALID');
  }

  const access = await pendienteAccess.getPendienteAccessContext_gnral(
    db,
    idPendiente,
    req.contextUser || req.user
  );
  pendienteAccess.assertAccess_gnral(access);
  const value = String((tipo === 'FOTO' ? access.row.photo_url : access.row.adjunto_url) || '').trim();
  if (!value) throw httpError('La evidencia histórica no existe.', 404, 'CFFAA_FILE_NOT_FOUND');

  const azureReference = legacyAzureReference_gnral(value);
  if (azureReference) {
    return createAccessForReference_gnral(req, {
      ...azureReference,
      nombre_original: tipo === 'FOTO' ? 'foto-historica' : 'archivo-historico',
      mime_type: tipo === 'FOTO' ? 'image/jpeg' : 'application/octet-stream',
      activo: 1
    }, access, {
      modulo: 'home',
      entidadTipo: 'pendiente_evidencia_legacy',
      entidadId: idPendiente
    });
  }

  return {
    storage_provider: 'LEGACY',
    nombre_original: tipo === 'FOTO' ? 'Foto histórica' : 'Archivo histórico',
    mime_type: null,
    tamano_bytes: null,
    disposition: 'inline',
    access_url: value,
    expires_at: null,
    expires_in_minutes: null,
    legacy: true
  };
}

async function deleteDirectFile_gnral(idPendiente, idArchivo, user) {
  const conn = await db.getConnection();
  let reference = null;
  try {
    await conn.beginTransaction();
    const access = await pendienteAccess.getPendienteAccessContext_gnral(
      conn,
      idPendiente,
      user,
      { forUpdate: true }
    );
    pendienteAccess.assertCreator_gnral(access, {
      creatorMessage: 'Solo el creador puede eliminar la evidencia directa.'
    });

    const row = await repository.getDirectFileById_gnral(
      conn,
      idPendiente,
      idArchivo,
      { forUpdate: true }
    );
    if (!row) throw httpError('El archivo no existe o ya fue eliminado.', 404, 'CFFAA_FILE_NOT_FOUND');
    reference = toAzureReference_gnral(row);

    const result = await repository.deactivateDirectFileById_gnral(
      conn,
      idPendiente,
      idArchivo,
      access.user.id,
      'ELIMINACION_MANUAL'
    );
    if (!result.affectedRows) {
      throw httpError('El archivo no existe o ya fue eliminado.', 404, 'CFFAA_FILE_NOT_FOUND');
    }

    await conn.commit();
  } catch (error) {
    try { await conn.rollback(); } catch (_rollbackError) {}
    throw error;
  } finally {
    conn.release();
  }

  const cleanup = reference
    ? await deleteReferencesAfterCommit_gnral([reference], {
        entidad_tipo: 'pendiente_evidencia',
        entidad_id: idPendiente,
        solicitado_por: Number(user && (user.id_SB || user.id || user.user_id)) || null,
        motivo: 'Eliminación manual de evidencia directa.'
      })
    : null;

  return {
    id_pendiente: idPendiente,
    id_archivo: idArchivo,
    limpieza_storage: cleanup
  };
}

module.exports = {
  repository,
  normalizeTaskBody_gnral,
  extractTaskEvidence_gnral,
  extractCommentFile_gnral,
  sanitizePendienteForClient_gnral,
  groupDirectFilesByTask_gnral,
  legacyFilesFromTask_gnral,
  attachCommentFiles_gnral,
  toDirectClientFile_gnral,
  uploadDirectEvidence_gnral,
  uploadCommentAttachment_gnral,
  legacyAzureReferences_gnral,
  deleteReferencesAfterCommit_gnral,
  cleanupUploaded_gnral,
  directFileAccess_gnral,
  commentAttachmentAccess_gnral,
  legacyEvidenceAccess_gnral,
  deleteDirectFile_gnral,
  isAzureReference_gnral
};

'use strict';

const db = require('../../config/db');
const azureStorage = require('../../services/storage/azure-storage.service');
const storageContract = require('../../services/storage/storage-contract.service');
const storageAccess = require('../../services/storage/storage-access.service');
const storageAdapters = require('../../services/storage/storage-metadata.adapters');
const repository = require('./support-files.repository');

const MAX_INITIAL_FILES = 5;
const MAX_FILE_MB = Number(process.env.AZURE_STORAGE_MAX_FILE_MB || 25);
const MAX_REQUEST_MB = Number(process.env.CFFAA_STORAGE_MAX_REQUEST_MB || 50);

function createError(message, status = 400, code = 'CFFAA_SUPPORT_FILE_ERROR') {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.expose = true;
  return error;
}

function normalizeFiles_gnral(files) {
  if (!files) return [];
  if (Array.isArray(files)) return files.filter(Boolean);
  if (typeof files === 'object') return Object.values(files).flat().filter(Boolean);
  return [];
}

function resolveTicketCompany_gnral(ticket) {
  const company = String((ticket && (ticket.empresa || ticket.usuario_empresa)) || '').trim();
  if (!company) {
    throw createError(
      'La solicitud no tiene una empresa interna definida. Actualiza la empresa del propietario antes de adjuntar archivos.',
      409,
      'CFFAA_SUPPORT_COMPANY_REQUIRED'
    );
  }
  return company;
}

function assertTicketAccess_gnral(ticket, actor, canAdministrate) {
  if (!ticket) throw createError('Solicitud no encontrada.', 404, 'CFFAA_SUPPORT_TICKET_NOT_FOUND');
  const actorId = Number(actor && actor.id_SB || 0);
  const ownerId = Number(ticket.id_usuario || 0);
  if (!actorId) throw createError('Sesión requerida.', 401, 'CFFAA_SUPPORT_AUTH_REQUIRED');
  if (!canAdministrate && actorId !== ownerId) {
    throw createError('No tienes permiso para administrar archivos de esta solicitud.', 403, 'CFFAA_SUPPORT_FILE_FORBIDDEN');
  }
  return { actorId, ownerId };
}

function event_gnral(actor, action, extra = {}) {
  return {
    fecha: new Date().toISOString(),
    usuario_id: actor && actor.id_SB || null,
    usuario: actor && (actor.nombre || actor.correo) || 'Usuario',
    accion: action,
    ...extra
  };
}

function presentAttachment_gnral(file, ticketId) {
  return {
    id_adjunto: file.id_adjunto,
    id_ticket: Number(ticketId || file.id_ticket),
    tipo_adjunto: file.tipo_adjunto,
    origen_adjunto: file.origen_adjunto,
    subido_por: file.subido_por,
    subido_por_nombre: file.subido_por_nombre || null,
    nombre_original: file.nombre_original,
    extension_archivo: file.extension_archivo,
    mime_type: file.mime_type,
    peso_archivo: Number(file.peso_archivo || 0),
    activo: Number(file.activo ?? 1),
    fecha_creacion: file.fecha_creacion,
    fecha_actualizacion: file.fecha_actualizacion,
    es_azure: String(file.storage_provider || '').toUpperCase() === 'AZURE_BLOB' ? 1 : 0,
    access_endpoint: `/api/support/tickets/${encodeURIComponent(ticketId || file.id_ticket)}/adjuntos/${encodeURIComponent(file.id_adjunto)}/acceso`
  };
}

async function cleanupUploaded_gnral(uploaded, context) {
  for (const item of uploaded || []) {
    if (!item || !item.storage_blob_name) continue;
    try {
      await azureStorage.deleteBlob_gnral(item.storage_blob_name, {
        queueOnFailure: true,
        containerName: item.storage_container,
        queueContext: context
      });
    } catch (_error) {
      // deleteBlob_gnral ya intentó registrar el reintento cuando queueOnFailure=true.
    }
  }
}

async function uploadAndInsert_gnral({ connection, ticket, actor, file, origin }) {
  const company = resolveTicketCompany_gnral(ticket);
  return storageContract.uploadAndPersist_gnral({
    upload: {
      file,
      empresa: company,
      modulo: 'soporte',
      entidadTipo: 'solicitud',
      entidadId: ticket.id_ticket,
      subruta: 'adjuntos',
      policyName: 'GENERAL',
      metadata: {
        uploaded_by: actor.id_SB,
        ticket_id: ticket.id_ticket,
        owner_id: ticket.id_usuario,
        company
      }
    },
    persist: async storage => {
      const saved = storageAdapters.forSupAdjuntos_gnral(storage);
      const id = await repository.insertAttachment_gnral(connection, {
        id_ticket: ticket.id_ticket,
        tipo_adjunto: 'solicitud',
        origen_adjunto: origin,
        subido_por: actor.id_SB,
        ...saved
      });
      return { id_adjunto: id, saved };
    },
    cleanupContext: {
      modulo: 'soporte',
      entidad_tipo: 'solicitud',
      entidad_id: ticket.id_ticket,
      solicitado_por: actor.id_SB,
      motivo: 'Compensación por fallo al registrar adjunto de Soporte.'
    }
  });
}

async function createTicketWithAttachments_gnral({ ticket, actor, files, canAdministrate }) {
  const normalizedFiles = normalizeFiles_gnral(files);
  if (normalizedFiles.length > MAX_INITIAL_FILES) {
    throw createError(`Solo se permiten ${MAX_INITIAL_FILES} archivos por solicitud.`, 400, 'CFFAA_SUPPORT_TOO_MANY_FILES');
  }
  let company = String(ticket.empresa || actor.empresa || '').trim();
  if (!company) {
    const [owners] = await db.query('SELECT empresa FROM usuarios WHERE id_SB = ? LIMIT 1', [actor.id_SB]);
    company = String(owners[0] && owners[0].empresa || '').trim();
  }
  if (!company) {
    throw createError('Tu usuario no tiene una empresa interna definida.', 409, 'CFFAA_SUPPORT_COMPANY_REQUIRED');
  }

  const connection = await db.getConnection();
  const uploaded = [];
  try {
    await connection.beginTransaction();
    const ticketId = await repository.insertTicket_gnral(connection, {
      ...ticket,
      id_usuario: actor.id_SB,
      empresa: company
    });
    const persistedTicket = { ...ticket, id_ticket: ticketId, id_usuario: actor.id_SB, empresa: company };
    const origin = canAdministrate ? 'Soporte' : 'Usuario';
    const attachmentIds = [];

    for (const file of normalizedFiles) {
      const result = await uploadAndInsert_gnral({ connection, ticket: persistedTicket, actor, file, origin });
      uploaded.push(result.uploaded);
      attachmentIds.push(result.persisted.id_adjunto);
    }

    if (normalizedFiles.length) {
      await repository.appendHistory_gnral(connection, ticketId, event_gnral(actor, 'archivos_iniciales_adjuntados', {
        archivos: normalizedFiles.map(file => file.originalname),
        total_archivos: normalizedFiles.length
      }));
      await repository.touchTicket_gnral(connection, ticketId, origin);
    }

    await connection.commit();
    return { ticketId, attachmentIds, uploadedCount: normalizedFiles.length, company };
  } catch (error) {
    try { await connection.rollback(); } catch (_rollbackError) {}
    await cleanupUploaded_gnral(uploaded, {
      modulo: 'soporte', entidad_tipo: 'solicitud', entidad_id: null,
      solicitado_por: actor && actor.id_SB,
      motivo: 'Rollback de creación de solicitud de Soporte.'
    });
    throw error;
  } finally {
    connection.release();
  }
}

async function addAttachment_gnral({ ticketId, actor, file, canAdministrate }) {
  if (!file) throw createError('Selecciona un archivo.', 400, 'CFFAA_FILE_REQUIRED');
  const connection = await db.getConnection();
  let uploaded = null;
  try {
    await connection.beginTransaction();
    const ticket = await repository.getTicketById_gnral(connection, ticketId, { forUpdate: true });
    assertTicketAccess_gnral(ticket, actor, canAdministrate);
    resolveTicketCompany_gnral(ticket);
    const origin = canAdministrate ? 'Soporte' : 'Usuario';
    const result = await uploadAndInsert_gnral({ connection, ticket, actor, file, origin });
    uploaded = result.uploaded;
    await repository.appendHistory_gnral(connection, ticket.id_ticket, event_gnral(actor, 'archivo_adjuntado', {
      mensaje: `Archivo adjuntado: ${result.persisted.saved.nombre_original}`,
      id_adjunto: result.persisted.id_adjunto
    }));
    await repository.touchTicket_gnral(connection, ticket.id_ticket, origin);
    await connection.commit();
    return {
      ticket,
      id_adjunto: result.persisted.id_adjunto,
      nombre_original: result.persisted.saved.nombre_original
    };
  } catch (error) {
    try { await connection.rollback(); } catch (_rollbackError) {}
    if (uploaded) {
      await cleanupUploaded_gnral([uploaded], {
        modulo: 'soporte', entidad_tipo: 'solicitud', entidad_id: ticketId,
        solicitado_por: actor && actor.id_SB,
        motivo: 'Rollback de adjunto de Soporte.'
      });
    }
    throw error;
  } finally {
    connection.release();
  }
}

function normalizeLegacyUrl_gnral(value) {
  const url = String(value || '').trim();
  if (!url) return null;
  if (/^https:\/\//i.test(url) || /^\/uploads\//i.test(url) || /^uploads\//i.test(url)) return url;
  return null;
}

async function createAttachmentAccess_gnral({ ticketId, attachmentId, actor, canAdministrate, download }) {
  const ticket = await repository.getTicketById_gnral(db, ticketId);
  assertTicketAccess_gnral(ticket, actor, canAdministrate);
  const file = await repository.getAttachment_gnral(db, ticketId, attachmentId);
  if (!file) throw createError('Archivo no encontrado.', 404, 'CFFAA_SUPPORT_FILE_NOT_FOUND');

  if (String(file.storage_provider || '').toUpperCase() === 'AZURE_BLOB' && file.storage_blob_name) {
    const data = await storageAccess.createReadAccess_gnral({
      user: actor,
      reference: file,
      context: {
        modulo: 'soporte', entidadTipo: 'solicitud', entidadId: ticket.id_ticket, archivoId: file.id_adjunto
      },
      authorize: async () => ({ allowed: true, metadata: { owner_id: ticket.id_usuario } }),
      download: download === true
    });
    return { ...data, url: data.access_url, legacy: false };
  }

  const legacyUrl = normalizeLegacyUrl_gnral(file.ruta_archivo);
  if (!legacyUrl) throw createError('El archivo histórico no tiene una referencia segura disponible.', 404, 'CFFAA_SUPPORT_LEGACY_FILE_UNAVAILABLE');
  return {
    url: legacyUrl,
    access_url: legacyUrl,
    legacy: true,
    nombre_original: file.nombre_original,
    mime_type: file.mime_type,
    tamano_bytes: Number(file.peso_archivo || 0)
  };
}

async function deleteAttachment_gnral({ ticketId, attachmentId, actor, canAdministrate }) {
  const connection = await db.getConnection();
  let file = null;
  let ticket = null;
  try {
    await connection.beginTransaction();
    ticket = await repository.getTicketById_gnral(connection, ticketId, { forUpdate: true });
    assertTicketAccess_gnral(ticket, actor, canAdministrate);
    file = await repository.getAttachment_gnral(connection, ticketId, attachmentId, { forUpdate: true });
    if (!file) throw createError('Archivo no encontrado o ya eliminado.', 404, 'CFFAA_SUPPORT_FILE_NOT_FOUND');
    const changed = await repository.deactivateAttachment_gnral(connection, ticketId, attachmentId);
    if (!changed) throw createError('Archivo no encontrado o ya eliminado.', 404, 'CFFAA_SUPPORT_FILE_NOT_FOUND');
    await repository.appendHistory_gnral(connection, ticketId, event_gnral(actor, 'archivo_eliminado', {
      mensaje: `Archivo retirado: ${file.nombre_original}`,
      id_adjunto: file.id_adjunto
    }));
    await connection.commit();
  } catch (error) {
    try { await connection.rollback(); } catch (_rollbackError) {}
    throw error;
  } finally {
    connection.release();
  }

  let cleanup = { attempted: false, completed: false, queued_operation_id: null };
  if (String(file.storage_provider || '').toUpperCase() === 'AZURE_BLOB' && file.storage_blob_name) {
    cleanup.attempted = true;
    try {
      await azureStorage.deleteBlob_gnral(file.storage_blob_name, {
        queueOnFailure: true,
        containerName: file.storage_container,
        queueContext: {
          modulo: 'soporte', entidad_tipo: 'solicitud', entidad_id: ticketId,
          solicitado_por: actor.id_SB,
          motivo: 'Eliminación de adjunto de Soporte.'
        }
      });
      cleanup.completed = true;
    } catch (error) {
      cleanup.queued_operation_id = error.queue_operation_id || null;
      cleanup.error = error.message;
    }
  }

  return { file: presentAttachment_gnral(file, ticketId), cleanup };
}

module.exports = {
  MAX_INITIAL_FILES,
  MAX_FILE_MB,
  MAX_REQUEST_MB,
  normalizeFiles_gnral,
  resolveTicketCompany_gnral,
  assertTicketAccess_gnral,
  presentAttachment_gnral,
  createTicketWithAttachments_gnral,
  addAttachment_gnral,
  createAttachmentAccess_gnral,
  deleteAttachment_gnral
};

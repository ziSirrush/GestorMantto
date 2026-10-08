'use strict';

const db = require('../../config/db');
const azureStorage = require('../../services/storage/azure-storage.service');
const logger = require('../../shared/logger');
const {
  notifyProjectPhotoUploaded_gnral,
  notifyProjectPhotoDeleted_gnral
} = require('../../services/notifications/project-photo-notification.service');

const PROJECT_PHOTO_FIELDS_UNI = Object.freeze([
  'foto_1', 'foto_2', 'foto_3', 'foto_4', 'foto_5', 'foto_6', 'foto_7'
]);
const PROJECT_PHOTO_FIELDS_SET_UNI = new Set(PROJECT_PHOTO_FIELDS_UNI);
const MAX_PROJECT_PHOTOS_UNI = PROJECT_PHOTO_FIELDS_UNI.length;

function normalizeProject_uni(value) {
  return String(value || '').trim();
}

function actorId_uni(req) {
  const actor = req && (req.actorUser || req.user);
  return Number(actor && (actor.id_SB || actor.id || actor.user_id) || 0) || null;
}

function statusFromError_uni(error) {
  const status = Number(error && (error.status || error.statusCode));
  return Number.isInteger(status) && status >= 400 && status < 600 ? status : 500;
}

function azureBlobNameFromStableUrl_uni(value) {
  const raw = String(value || '').trim();
  if (!/^https:\/\//i.test(raw) || !/\.blob\.core\.windows\.net\//i.test(raw)) return null;

  try {
    const parsed = new URL(raw);
    const container = String(process.env.AZURE_STORAGE_BLOB_CONTAINER_NAME || '').trim();
    if (!container) return null;

    const prefix = '/' + container + '/';
    const decodedPath = decodeURIComponent(parsed.pathname || '');
    if (!decodedPath.startsWith(prefix)) return null;
    return decodedPath.slice(prefix.length);
  } catch (_error) {
    return null;
  }
}

async function presentProjectPhotoUrl_uni(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const blobName = azureBlobNameFromStableUrl_uni(raw);
  if (!blobName) return raw;

  try {
    const access = await azureStorage.createReadSas_gnral(blobName);
    return access.url;
  } catch (_error) {
    return raw;
  }
}

function emptyProjectPhotoRow_uni(project) {
  return {
    id_photo: null,
    proyecto: project,
    foto_1: null,
    foto_2: null,
    foto_3: null,
    foto_4: null,
    foto_5: null,
    foto_6: null,
    foto_7: null,
    foto_principal: null,
    activo: 1,
    created_by: null,
    updated_by: null,
    created_at: null,
    updated_at: null
  };
}

async function presentProjectPhotoRow_uni(row, fallbackProject) {
  const copy = { ...emptyProjectPhotoRow_uni(fallbackProject), ...(row || {}) };

  for (const field of PROJECT_PHOTO_FIELDS_UNI) {
    copy[field] = await presentProjectPhotoUrl_uni(copy[field]);
  }

  const selected = String(copy.foto_principal || '').trim();
  const selectedUrl = PROJECT_PHOTO_FIELDS_SET_UNI.has(selected)
    ? (copy[selected] || null)
    : null;
  const firstAvailable = PROJECT_PHOTO_FIELDS_UNI
    .map((field) => copy[field])
    .find((value) => String(value || '').trim()) || null;

  copy.foto_portada = selectedUrl || firstAvailable || null;
  copy.total_fotos = PROJECT_PHOTO_FIELDS_UNI
    .filter((field) => String(copy[field] || '').trim())
    .length;
  copy.max_fotos = MAX_PROJECT_PHOTOS_UNI;

  return copy;
}

async function getPortafolioProyectoFotografias_uni(req, res) {
  const project = normalizeProject_uni(req.params && req.params.proyecto);
  if (!project) {
    return res.status(400).json({ ok: false, message: 'Proyecto requerido.' });
  }

  try {
    const [rows] = await db.query(
      `SELECT
         id_photo,
         proyecto,
         foto_1, foto_2, foto_3, foto_4, foto_5, foto_6, foto_7,
         foto_principal,
         activo,
         created_by,
         updated_by,
         created_at,
         updated_at
       FROM portafolio_proyecto_fotos
       WHERE LOWER(TRIM(proyecto)) = LOWER(TRIM(?))
         AND activo = 1
       LIMIT 1`,
      [project]
    );

    const presented = await presentProjectPhotoRow_uni(rows[0] || null, project);
    return res.json({
      ok: true,
      source: 'aiven-portafolio',
      data: presented
    });
  } catch (error) {
    return res.status(statusFromError_uni(error)).json({
      ok: false,
      message: error.message || 'No fue posible consultar las fotografías del proyecto.'
    });
  }
}

async function uploadPortafolioProyectoFotografia_uni(req, res) {
  const requestedProject = normalizeProject_uni(req.params && req.params.proyecto);
  const uploadedBy = actorId_uni(req);
  const file = req.file;
  let uploaded = null;
  let conn = null;
  let transactionStarted = false;
  let committed = false;

  try {
    if (!requestedProject) {
      return res.status(400).json({ ok: false, message: 'Proyecto requerido.' });
    }
    if (!file) {
      return res.status(400).json({ ok: false, message: 'Selecciona una fotografía.' });
    }

    const extension = String(file.originalname || '').toLowerCase().match(/\.[a-z0-9]+$/)?.[0] || '';
    if (extension === '.heic' || extension === '.heif') {
      return res.status(415).json({
        ok: false,
        message: 'HEIC/HEIF no se admite en el carrusel. Usa JPG, PNG, WEBP, GIF o AVIF.'
      });
    }

    conn = await db.getConnection();
    await conn.beginTransaction();
    transactionStarted = true;

    const [projectRows] = await conn.query(
      `SELECT proyecto
       FROM portafolio
       WHERE LOWER(TRIM(COALESCE(proyecto, ''))) = LOWER(TRIM(?))
         AND estado_registro = 1
       LIMIT 1`,
      [requestedProject]
    );

    if (!projectRows.length) {
      await conn.rollback();
      transactionStarted = false;
      return res.status(404).json({ ok: false, message: 'Proyecto no encontrado en Portafolio.' });
    }

    const canonicalProject = normalizeProject_uni(projectRows[0].proyecto) || requestedProject;

    await conn.query(
      `INSERT INTO portafolio_proyecto_fotos
         (proyecto, activo, created_by, updated_by)
       VALUES (?, 1, ?, ?)
       ON DUPLICATE KEY UPDATE proyecto = VALUES(proyecto)`,
      [canonicalProject, uploadedBy, uploadedBy]
    );

    const [rows] = await conn.query(
      `SELECT
         id_photo,
         proyecto,
         foto_1, foto_2, foto_3, foto_4, foto_5, foto_6, foto_7,
         foto_principal
       FROM portafolio_proyecto_fotos
       WHERE LOWER(TRIM(proyecto)) = LOWER(TRIM(?))
       LIMIT 1
       FOR UPDATE`,
      [canonicalProject]
    );

    const row = rows[0];
    if (!row) {
      throw new Error('No fue posible preparar el registro fotográfico del proyecto.');
    }

    const freeField = PROJECT_PHOTO_FIELDS_UNI.find(
      (field) => !String(row[field] || '').trim()
    );
    if (!freeField) {
      await conn.rollback();
      transactionStarted = false;
      return res.status(409).json({
        ok: false,
        message: 'El proyecto ya tiene el máximo de 7 fotografías.'
      });
    }

    uploaded = await azureStorage.uploadPrivate_gnral({
      file,
      empresa: 'UNITED',
      modulo: 'portafolio',
      entidadTipo: 'proyecto',
      entidadId: canonicalProject,
      subruta: 'fotografias',
      policyName: 'IMAGE',
      metadata: {
        uploaded_by: uploadedBy,
        proyecto: canonicalProject,
        slot: freeField
      }
    });

    const access = await azureStorage.createReadSas_gnral(uploaded.storage_blob_name);
    const firstPhoto = !PROJECT_PHOTO_FIELDS_UNI.some(
      (field) => String(row[field] || '').trim()
    );
    const principal = firstPhoto
      ? freeField
      : (String(row.foto_principal || '').trim() || null);

    await conn.query(
      `UPDATE portafolio_proyecto_fotos
       SET ${freeField} = ?,
           foto_principal = ?,
           updated_by = ?,
           activo = 1
       WHERE id_photo = ?`,
      [uploaded.storage_url, principal, uploadedBy, row.id_photo]
    );

    await conn.commit();
    transactionStarted = false;
    committed = true;

    const used = PROJECT_PHOTO_FIELDS_UNI
      .filter((field) => String(row[field] || '').trim())
      .length + 1;
    const notificationResult = await notifyProjectPhotoUploaded_gnral({
      domain: 'UNITED',
      projectId: canonicalProject,
      photoRecordId: row.id_photo,
      slot: freeField,
      storageUrl: uploaded.storage_url,
      actionContext: req
    });

    return res.status(201).json({
      ok: true,
      data: {
        proyecto: canonicalProject,
        campo: freeField,
        url: access.url,
        storage_url: uploaded.storage_url,
        foto_principal: principal,
        total_fotos: used,
        max_fotos: MAX_PROJECT_PHOTOS_UNI,
        notificaciones_director_general: Number(notificationResult.created || 0)
      }
    });
  } catch (error) {
    if (transactionStarted && conn) {
      try { await conn.rollback(); } catch (_rollbackError) {}
    }

    if (!committed && uploaded && uploaded.storage_blob_name) {
      try {
        await azureStorage.deleteBlob_gnral(uploaded.storage_blob_name, {
          queueOnFailure: true,
          queueContext: {
            modulo: 'portafolio',
            entidadTipo: 'proyecto',
            entidadId: requestedProject,
            solicitadoPor: uploadedBy,
            motivo: 'Compensación: falló el guardado de la fotografía United en Aiven.'
          }
        });
      } catch (_deleteError) {}
    }

    return res.status(statusFromError_uni(error)).json({
      ok: false,
      message: error.message || 'No fue posible agregar la fotografía del proyecto.'
    });
  } finally {
    if (conn) conn.release();
  }
}

async function deletePortafolioProyectoFotografia_uni(req, res) {
  const requestedProject = normalizeProject_uni(req.params && req.params.proyecto);
  const field = String(req.params && req.params.campo || '').trim();
  const deletedBy = actorId_uni(req);
  let conn = null;
  let transactionStarted = false;

  if (!requestedProject) {
    return res.status(400).json({ ok: false, message: 'Proyecto requerido.' });
  }
  if (!PROJECT_PHOTO_FIELDS_SET_UNI.has(field)) {
    return res.status(400).json({ ok: false, message: 'La fotografía seleccionada no es válida.' });
  }

  try {
    conn = await db.getConnection();
    await conn.beginTransaction();
    transactionStarted = true;

    const [rows] = await conn.query(
      `SELECT
         id_photo,
         proyecto,
         foto_1, foto_2, foto_3, foto_4, foto_5, foto_6, foto_7,
         foto_principal
       FROM portafolio_proyecto_fotos
       WHERE LOWER(TRIM(proyecto)) = LOWER(TRIM(?))
         AND activo = 1
       LIMIT 1
       FOR UPDATE`,
      [requestedProject]
    );

    const row = rows[0] || null;
    if (!row) {
      await conn.rollback();
      transactionStarted = false;
      return res.status(404).json({
        ok: false,
        message: 'No se encontró el registro fotográfico del proyecto.'
      });
    }

    const removedUrl = String(row[field] || '').trim();
    if (!removedUrl) {
      await conn.rollback();
      transactionStarted = false;
      return res.status(404).json({ ok: false, message: 'La fotografía seleccionada ya no existe.' });
    }

    const remainingFields = PROJECT_PHOTO_FIELDS_UNI.filter(
      (item) => item !== field && String(row[item] || '').trim()
    );
    const currentPrincipal = String(row.foto_principal || '').trim();
    const principal = currentPrincipal === field || !PROJECT_PHOTO_FIELDS_SET_UNI.has(currentPrincipal)
      ? (remainingFields[0] || null)
      : currentPrincipal;

    await conn.query(
      `UPDATE portafolio_proyecto_fotos
       SET ${field} = NULL,
           foto_principal = ?,
           updated_by = ?
       WHERE id_photo = ?`,
      [principal, deletedBy, row.id_photo]
    );

    await conn.commit();
    transactionStarted = false;

    let storageCleanup = { deleted: false, queued: false, skipped: true };
    const blobName = azureBlobNameFromStableUrl_uni(removedUrl);
    if (blobName) {
      try {
        storageCleanup = await azureStorage.deleteBlob_gnral(blobName, {
          queueOnFailure: true,
          queueContext: {
            modulo: 'portafolio',
            entidadTipo: 'proyecto',
            entidadId: row.proyecto || requestedProject,
            solicitadoPor: deletedBy,
            motivo: 'Limpieza posterior a la eliminación de una fotografía United.'
          }
        });
      } catch (error) {
        storageCleanup = {
          deleted: false,
          queued: Boolean(error.queue_operation_id),
          skipped: false,
          error_code: error.code || null
        };
        logger.error('[PROJECT_PHOTO_STORAGE_DELETE_FAILED]', {
          dominio: 'UNITED',
          proyecto: row.proyecto || requestedProject,
          campo: field,
          queued_operation_id: error.queue_operation_id || null,
          error_code: error.code || null,
          error: error.message
        });
      }
    }

    const canonicalProject = normalizeProject_uni(row.proyecto) || requestedProject;
    const notificationResult = await notifyProjectPhotoDeleted_gnral({
      domain: 'UNITED',
      projectId: canonicalProject,
      photoRecordId: row.id_photo,
      slot: field,
      storageUrl: removedUrl,
      actionContext: req
    });
    const principalUrl = principal ? await presentProjectPhotoUrl_uni(row[principal]) : null;

    return res.json({
      ok: true,
      data: {
        proyecto: canonicalProject,
        campo: field,
        foto_principal: principal,
        foto_portada: principalUrl,
        total_fotos: remainingFields.length,
        max_fotos: MAX_PROJECT_PHOTOS_UNI,
        storage_cleanup: storageCleanup,
        notificaciones_director_general: Number(notificationResult.created || 0)
      }
    });
  } catch (error) {
    if (transactionStarted && conn) {
      try { await conn.rollback(); } catch (_rollbackError) {}
    }
    return res.status(statusFromError_uni(error)).json({
      ok: false,
      message: error.message || 'No fue posible eliminar la fotografía del proyecto.'
    });
  } finally {
    if (conn) conn.release();
  }
}

async function updatePortafolioProyectoFotoPrincipal_uni(req, res) {
  const project = normalizeProject_uni(req.params && req.params.proyecto);
  const field = String(req.body && req.body.campo || '').trim();
  const updatedBy = actorId_uni(req);

  if (!project) {
    return res.status(400).json({ ok: false, message: 'Proyecto requerido.' });
  }
  if (!PROJECT_PHOTO_FIELDS_SET_UNI.has(field)) {
    return res.status(400).json({
      ok: false,
      message: 'La fotografía seleccionada no es válida.'
    });
  }

  try {
    const [rows] = await db.query(
      `SELECT id_photo, proyecto, ${field} AS selected_url
       FROM portafolio_proyecto_fotos
       WHERE LOWER(TRIM(proyecto)) = LOWER(TRIM(?))
         AND activo = 1
       LIMIT 1`,
      [project]
    );

    if (!rows.length) {
      return res.status(404).json({
        ok: false,
        message: 'No se encontró el registro fotográfico del proyecto.'
      });
    }
    if (!rows[0].selected_url || !String(rows[0].selected_url).trim()) {
      return res.status(400).json({
        ok: false,
        message: 'La fotografía seleccionada está vacía.'
      });
    }

    await db.query(
      `UPDATE portafolio_proyecto_fotos
       SET foto_principal = ?,
           updated_by = ?
       WHERE id_photo = ?`,
      [field, updatedBy, rows[0].id_photo]
    );

    const portada = await presentProjectPhotoUrl_uni(rows[0].selected_url);
    return res.json({
      ok: true,
      data: {
        proyecto: rows[0].proyecto || project,
        foto_principal: field,
        foto_portada: portada
      }
    });
  } catch (error) {
    return res.status(statusFromError_uni(error)).json({
      ok: false,
      message: error.message || 'No fue posible actualizar la fotografía principal del proyecto.'
    });
  }
}

module.exports = {
  PROJECT_PHOTO_FIELDS_UNI,
  MAX_PROJECT_PHOTOS_UNI,
  getPortafolioProyectoFotografias_uni,
  uploadPortafolioProyectoFotografia_uni,
  deletePortafolioProyectoFotografia_uni,
  updatePortafolioProyectoFotoPrincipal_uni
};

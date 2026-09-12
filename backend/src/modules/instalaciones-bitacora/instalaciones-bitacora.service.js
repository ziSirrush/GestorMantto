// [Claude | 2026-09-11 | Bitácora de Obra | FASE_1_BACKEND_V001]
const repository = require('./instalaciones-bitacora.repository');
const driveService = require('../../services/google/drive.service');
const proyectoDriveService = require('../instalaciones-proyecto-drive/instalaciones-proyecto-drive.service');
const logger = require('../../shared/logger');

// Límites de seguridad para el recorrido recursivo de Drive: evitan que un
// árbol de carpetas anormalmente grande (o un ciclo por atajos/shortcuts)
// deje la sincronización corriendo indefinidamente.
const MAX_FOLDERS = 400;
const MAX_FILES = 5000;
const MAX_DEPTH = 12;
const PAGE_SIZE = 1000;

function createValidationError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode || 400;
  return error;
}

function cleanText(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function toDateTimeOrNull(isoValue) {
  if (!isoValue) return null;
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return null;
  // MySQL DATETIME: 'YYYY-MM-DD HH:MM:SS' en UTC (createdTime/modifiedTime de
  // Drive ya vienen en UTC/ISO-8601).
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Recorre recursivamente una carpeta de Drive (raíz + subcarpetas) y
 * devuelve la lista plana de archivos (no carpetas, no atajos) encontrados,
 * cada uno con su ruta relativa de subcarpeta dentro de la carpeta raíz.
 */
async function walkFolderRecursive(userId, rootFolderId) {
  const files = [];
  const queue = [{ folderId: rootFolderId, path: '', depth: 0 }];
  let foldersVisited = 0;
  let truncado = false;

  while (queue.length) {
    const { folderId, path, depth } = queue.shift();

    if (foldersVisited >= MAX_FOLDERS || depth > MAX_DEPTH) {
      truncado = true;
      continue;
    }
    foldersVisited += 1;

    let pageToken;
    do {
      const page = await driveService.listFiles(userId, {
        folderId,
        pageToken,
        pageSize: PAGE_SIZE
      });

      for (const item of page.files || []) {
        if (item.trashed) continue;

        if (item.is_folder) {
          queue.push({ folderId: item.id, path: path ? `${path}/${item.name}` : item.name, depth: depth + 1 });
          continue;
        }

        if (files.length >= MAX_FILES) {
          truncado = true;
          continue;
        }

        files.push({
          drive_file_id: item.id,
          drive_parent_folder_id: folderId,
          nombre_archivo: item.name,
          ruta_carpeta: path || null,
          mime_type: item.mime_type,
          web_view_link: item.web_view_link,
          fecha_creacion_drive: toDateTimeOrNull(item.created_time),
          fecha_modificacion_drive: toDateTimeOrNull(item.modified_time)
        });
      }

      pageToken = page.next_page_token || undefined;
    } while (pageToken && files.length < MAX_FILES);

    if (files.length >= MAX_FILES) {
      truncado = true;
      break;
    }
  }

  return { files, truncado };
}

async function getBitacora(idProyecto) {
  const normalizedProjectId = cleanText(idProyecto);
  if (!normalizedProjectId) throw createValidationError('El ID del proyecto es obligatorio.');

  const [documentos, syncEstado] = await Promise.all([
    repository.listDocumentos(normalizedProjectId),
    repository.getSyncEstado(normalizedProjectId)
  ]);

  return {
    ok: true,
    id_proyecto: normalizedProjectId,
    documentos,
    sincronizacion: syncEstado
      ? {
          ultima_sincronizacion: syncEstado.ultima_sincronizacion,
          ultimo_usuario: syncEstado.ultimo_usuario,
          total_activos: syncEstado.total_activos,
          total_eliminados: syncEstado.total_eliminados,
          truncado: Boolean(syncEstado.truncado)
        }
      : null
  };
}

async function syncBitacora(userId, idProyecto) {
  const normalizedProjectId = cleanText(idProyecto);
  if (!normalizedProjectId) throw createValidationError('El ID del proyecto es obligatorio.');
  if (!userId) throw createValidationError('Sesión sin usuario válido.', 401);

  const folderData = await proyectoDriveService.getProjectFolder(normalizedProjectId);
  const carpetaProyecto = folderData && folderData.carpeta_proyecto;

  if (!carpetaProyecto || !carpetaProyecto.carpeta_id) {
    throw createValidationError('Este proyecto no tiene carpeta de Drive asignada. No es posible generar la Bitácora de Obra.', 409);
  }

  const { files, truncado } = await walkFolderRecursive(userId, carpetaProyecto.carpeta_id);

  const connection = await repository.getConnection();
  try {
    await connection.beginTransaction();

    for (const file of files) {
      await repository.upsertDocumento(connection, normalizedProjectId, {
        ...file,
        carpeta_raiz_id: carpetaProyecto.carpeta_id,
        detectado_por_usuario: userId
      });
    }

    const presentIds = files.map((file) => file.drive_file_id);
    const bajas = await repository.marcarEliminados(connection, normalizedProjectId, presentIds);

    const existentes = await repository.findExistingFileIds(connection, normalizedProjectId);
    const totalActivos = existentes.filter((row) => row.estatus === 'activo').length;
    const totalEliminados = existentes.filter((row) => row.estatus === 'eliminado').length;

    await repository.upsertSyncEstado(connection, normalizedProjectId, {
      ultimo_usuario: userId,
      total_activos: totalActivos,
      total_eliminados: totalEliminados,
      truncado
    });

    await connection.commit();

    logger.info('Bitácora de Obra sincronizada.', {
      id_proyecto: normalizedProjectId,
      archivos_encontrados: files.length,
      marcados_eliminados_en_este_sync: bajas,
      total_activos: totalActivos,
      total_eliminados: totalEliminados,
      truncado
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  return getBitacora(normalizedProjectId);
}

module.exports = {
  getBitacora,
  syncBitacora
};

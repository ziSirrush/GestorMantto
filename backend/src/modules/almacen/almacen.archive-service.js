'use strict';

// [Aster | 2026-09-01 | ASTER-MG | FIX ALMACEN ARCHIVO BLOB + STAGING ACTIVO V001]
// Conserva el Excel original en Azure Blob privado y evita acumular snapshots
// normalizados historicos en Aiven. Solo el cierre activo mantiene filas operativas.

const crypto = require('crypto');
const https = require('https');
const path = require('path');
const db = require('../../config/db');
const azureStorage = require('../../services/storage/azure-storage.service');
const sourceEngine = require('./almacen.source-engine');
const service = require('./almacen.service');

const TABLE = sourceEngine.TABLE;
const ARCHIVE_TYPE = sourceEngine.RECORD_TYPES.ARCHIVE;
const ARCHIVE_KIND = sourceEngine.ARCHIVE_KIND;
const ARCHIVE_SHEET = '__ARCHIVO__';
const ARCHIVE_ROW = 0;

function archiveError(message, status = 400, code = 'ALMACEN_ARCHIVE_ERROR', details = null) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  if (details) error.details = details;
  return error;
}

function normalizeUserId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw archiveError('Usuario invalido para la operacion de cierre.', 401, 'ALMACEN_ARCHIVE_USER_INVALID');
  return id;
}

function normalizeLotId(value) {
  const lot = String(value || '').trim();
  if (!lot || lot.length > 36 || !/^[0-9a-f-]+$/i.test(lot)) {
    throw archiveError('Identificador de cierre invalido.', 400, 'ALMACEN_ARCHIVE_LOT_INVALID');
  }
  return lot;
}

function datasetSummary(validation) {
  return (validation.datasets || []).map(dataset => ({
    type: dataset.type,
    sheetName: dataset.sheetName || null,
    headerRow: dataset.headerRow || null,
    rows: Number(dataset.rows || 0),
    headers: Array.isArray(dataset.headers) ? dataset.headers : [],
    mapping: dataset.mapping && typeof dataset.mapping === 'object' ? dataset.mapping : {},
    quality: dataset.quality && typeof dataset.quality === 'object' ? dataset.quality : null
  }));
}

function archiveMetadata(validation, storageResult, lotId, userId, logicalImportedAt) {
  return {
    kind: ARCHIVE_KIND,
    version: 1,
    lote_importacion: lotId,
    nombre_original: storageResult.nombre_original,
    mime_type: storageResult.mime_type,
    tamano_bytes: Number(storageResult.tamano_bytes || 0),
    storage_provider: storageResult.storage_provider,
    storage_container: storageResult.storage_container,
    storage_blob_name: storageResult.storage_blob_name,
    storage_url: storageResult.storage_url,
    hash_archivo: validation.hash,
    fecha_corte: validation.cutoffDate || null,
    fecha_importacion: logicalImportedAt || new Date().toISOString(),
    profile: validation.profile || null,
    rows: Number(validation.rows || 0),
    inventoryRows: Number(validation.inventoryRows || 0),
    loanRows: Number(validation.loanRows || 0),
    guardRows: Number(validation.guardRows || 0),
    coverage: validation.coverage || {},
    warnings: Array.isArray(validation.warnings) ? validation.warnings : [],
    datasets: datasetSummary(validation),
    uploaded_by: Number(userId)
  };
}

async function uploadArchive(file, validation, lotId, userId) {
  return azureStorage.uploadPrivate_gnral({
    file,
    empresa: 'Corellian',
    modulo: 'almacen',
    entidadTipo: 'cierre-excel',
    entidadId: lotId,
    subruta: 'historico',
    policyName: 'DOCUMENT',
    forceDownload: true,
    metadata: {
      uploaded_by: userId,
      modulo: 'almacen',
      lote: lotId,
      fecha_corte: validation.cutoffDate || '',
      hash: validation.hash || ''
    }
  });
}

async function upsertArchiveRecord({ lotId, validation, storageResult, userId, active, logicalImportedAt }) {
  const metadata = archiveMetadata(validation, storageResult, lotId, userId, logicalImportedAt);
  const rawJson = JSON.stringify(metadata);
  const rowHash = crypto.createHash('sha256')
    .update(`${ARCHIVE_TYPE}|${lotId}|${validation.hash}|${storageResult.storage_blob_name}`)
    .digest('hex');

  await db.query(
    `INSERT INTO ${TABLE}
      (lote_importacion, archivo_origen, hoja_origen, fila_origen, fecha_corte,
       activo, hash_archivo, hash_fila, encabezados_json, mapeo_json,
       tipo_registro, raw_json, creado_por)
     VALUES (?,?,?,?,?,?,?,?,NULL,NULL,?,?,?)
     ON DUPLICATE KEY UPDATE
       archivo_origen=VALUES(archivo_origen),
       fecha_corte=VALUES(fecha_corte),
       activo=VALUES(activo),
       hash_archivo=VALUES(hash_archivo),
       hash_fila=VALUES(hash_fila),
       raw_json=VALUES(raw_json),
       creado_por=VALUES(creado_por),
       updated_at=CURRENT_TIMESTAMP(3)`,
    [
      lotId,
      storageResult.nombre_original,
      ARCHIVE_SHEET,
      ARCHIVE_ROW,
      validation.cutoffDate || null,
      active ? 1 : 0,
      validation.hash,
      rowHash,
      ARCHIVE_TYPE,
      rawJson,
      Number(userId)
    ]
  );
  return metadata;
}

async function deleteArchiveRecord(lotId) {
  const [result] = await db.query(
    `DELETE FROM ${TABLE} WHERE lote_importacion=? AND tipo_registro=?`,
    [lotId, ARCHIVE_TYPE]
  );
  return Number(result.affectedRows || 0);
}

async function deleteOperationalRows(lotId) {
  const lot = normalizeLotId(lotId);
  const [result] = await db.query(
    `DELETE FROM ${TABLE} WHERE lote_importacion=? AND tipo_registro<>?`,
    [lot, ARCHIVE_TYPE]
  );
  return Number(result.affectedRows || 0);
}

async function deleteOperationalRowsForArchivedLotsExcept(exceptLotId) {
  const except = exceptLotId ? normalizeLotId(exceptLotId) : '';
  // Una sola sentencia atomica: evita que una falla intermedia deje algunos
  // cierres compactados y otros no antes de que el flujo pueda restaurar.
  const params = [ARCHIVE_TYPE, ARCHIVE_TYPE];
  let exceptSql = '';
  if (except) {
    exceptSql = 'AND op.lote_importacion<>?';
    params.push(except);
  }
  const [result] = await db.query(
    `DELETE op
       FROM ${TABLE} op
       INNER JOIN ${TABLE} arc
               ON arc.lote_importacion=op.lote_importacion
              AND arc.tipo_registro=?
      WHERE op.tipo_registro<>?
        ${exceptSql}`,
    params
  );
  return Number(result.affectedRows || 0);
}

function downloadUrlBuffer(url, maxBytes) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, response => {
      const status = Number(response.statusCode || 0);
      if (status < 200 || status >= 300) {
        response.resume();
        reject(archiveError('No fue posible leer el Excel historico desde Azure Storage.', 502, 'ALMACEN_ARCHIVE_DOWNLOAD_FAILED', { status }));
        return;
      }
      const chunks = [];
      let total = 0;
      response.on('data', chunk => {
        total += chunk.length;
        if (total > maxBytes) {
          request.destroy(archiveError('El Excel historico excede el limite permitido para reactivacion.', 413, 'ALMACEN_ARCHIVE_DOWNLOAD_TOO_LARGE'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => resolve(Buffer.concat(chunks)));
    });
    request.setTimeout(120000, () => request.destroy(archiveError('Tiempo agotado al leer el Excel historico.', 504, 'ALMACEN_ARCHIVE_DOWNLOAD_TIMEOUT')));
    request.on('error', reject);
  });
}

async function downloadArchive(record) {
  if (!record?.metadata?.storage_blob_name) {
    throw archiveError('El cierre no tiene una referencia de archivo valida.', 409, 'ALMACEN_ARCHIVE_REFERENCE_MISSING');
  }
  const config = azureStorage.getConfig_gnral();
  const sas = await azureStorage.createReadSas_gnral(record.metadata.storage_blob_name, {
    containerName: record.metadata.storage_container,
    verifyExists: true,
    minutes: Math.min(10, config.sasMinutes),
    download: true,
    fileName: record.metadata.nombre_original || record.archivoOrigen
  });
  const buffer = await downloadUrlBuffer(sas.url, config.maxFileBytes);
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  const expected = String(record.hashArchivo || record.metadata.hash_archivo || '').trim();
  if (expected && hash !== expected) {
    throw archiveError('El Excel historico no coincide con el hash registrado. Se detuvo la reactivacion.', 409, 'ALMACEN_ARCHIVE_HASH_MISMATCH', {
      loteImportacion: record.loteImportacion
    });
  }
  return {
    fieldname: 'archivo',
    originalname: record.metadata.nombre_original || record.archivoOrigen || 'cierre.xlsx',
    encoding: '7bit',
    mimetype: record.metadata.mime_type || (path.extname(record.metadata.nombre_original || '').toLowerCase() === '.csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
    size: buffer.length,
    buffer
  };
}

async function requireCurrentArchived(current) {
  if (!current || !current.loaded) return;
  if (current.archived) return;
  throw archiveError(
    'El cierre activo actual aun es legacy y no tiene su Excel original archivado. Antes de cargar un cierre nuevo, selecciona el Excel activo actual y usa "Archivar cierre actual".',
    409,
    'ALMACEN_ACTIVE_SOURCE_NOT_ARCHIVED',
    { loteImportacion: current.loteImportacion, archivoOrigen: current.archivoOrigen }
  );
}

async function restorePreviousSource(previous, userId) {
  if (!previous?.archived || !previous?.loteImportacion) return { restored:false, reason:'previous_not_archived' };
  const record = await sourceEngine.archiveRecordByLot(previous.loteImportacion);
  if (!record) return { restored:false, reason:'archive_record_missing' };
  const file = await downloadArchive(record);
  await service.importSpreadsheet(file, previous.fechaCorte, userId, { lotId:previous.loteImportacion });
  return { restored:true, loteImportacion:previous.loteImportacion };
}

async function cleanupFailedArchive(lotId, storageResult, userId) {
  let metadataDeleted = false;
  try {
    metadataDeleted = (await deleteArchiveRecord(lotId)) > 0;
  } catch (_dbError) {
    return { metadataDeleted:false, blobDeleted:false, retainedForRecovery:true };
  }
  if (!metadataDeleted) return { metadataDeleted:false, blobDeleted:false, retainedForRecovery:true };
  try {
    const result = await azureStorage.deleteBlob_gnral(storageResult.storage_blob_name, {
      containerName: storageResult.storage_container,
      queueOnFailure: true,
      queueContext: {
        modulo:'almacen',
        entidadTipo:'cierre-excel',
        entidadId:lotId,
        solicitadoPor:userId,
        motivo:'Rollback de carga de Almacen no completada.'
      }
    });
    return { metadataDeleted:true, blobDeleted:Boolean(result.deleted), queued:Boolean(result.queued) };
  } catch (error) {
    return { metadataDeleted:true, blobDeleted:false, queued:Boolean(error.queue_operation_id), cleanupError:error.message };
  }
}

async function archiveActive(file, userId) {
  const normalizedUserId = normalizeUserId(userId);
  const current = await sourceEngine.activeSource();
  if (!current) throw archiveError('No existe un cierre activo para archivar.', 404, 'ALMACEN_ACTIVE_SOURCE_MISSING');

  const existing = await sourceEngine.archiveRecordByLot(current.loteImportacion);
  if (existing) {
    const exists = await azureStorage.blobExists_gnral(existing.metadata.storage_blob_name, {
      containerName: existing.metadata.storage_container
    });
    if (exists) return { ok:true, alreadyArchived:true, source:await sourceEngine.sourceByLot(current.loteImportacion, db, 'ACTIVO') };
  }

  const validation = await service.validateImport(file, current.fechaCorte);
  if (String(validation.hash || '') !== String(current.hashArchivo || '')) {
    throw archiveError(
      'El archivo seleccionado no es el mismo Excel que genero el cierre activo. No se archivara para evitar asociar un historico incorrecto.',
      409,
      'ALMACEN_ACTIVE_ARCHIVE_HASH_MISMATCH',
      { archivoActivo:current.archivoOrigen, hashEsperado:current.hashArchivo, hashRecibido:validation.hash }
    );
  }

  const storageResult = await uploadArchive(file, validation, current.loteImportacion, normalizedUserId);
  try {
    await upsertArchiveRecord({
      lotId:current.loteImportacion,
      validation,
      storageResult,
      userId:normalizedUserId,
      active:true,
      logicalImportedAt:current.fechaImportacion || null
    });
  } catch (error) {
    try {
      await azureStorage.deleteBlob_gnral(storageResult.storage_blob_name, {
        containerName:storageResult.storage_container,
        queueOnFailure:true,
        queueContext:{modulo:'almacen',entidadTipo:'cierre-excel',entidadId:current.loteImportacion,solicitadoPor:normalizedUserId,motivo:'Rollback de archivado de cierre activo.'}
      });
    } catch (_cleanupError) {}
    throw error;
  }

  return {
    ok:true,
    archived:true,
    loteImportacion:current.loteImportacion,
    archivoOrigen:current.archivoOrigen,
    hashArchivo:validation.hash,
    source:await sourceEngine.sourceByLot(current.loteImportacion, db, 'ACTIVO')
  };
}

async function findArchivedSameFile(hash, cutoffDate) {
  const [rows] = await db.query(
    `SELECT lote_importacion AS loteImportacion
       FROM ${TABLE}
      WHERE tipo_registro=?
        AND hash_archivo=?
        AND (fecha_corte <=> ?)
      ORDER BY fecha_importacion DESC
      LIMIT 1`,
    [ARCHIVE_TYPE, hash, cutoffDate || null]
  );
  return rows[0]?.loteImportacion || null;
}

async function importAndActivate(file, cutoffDate, userId) {
  const normalizedUserId = normalizeUserId(userId);
  const validation = await service.validateImport(file, cutoffDate);
  const current = await sourceEngine.activeSource();
  await requireCurrentArchived(current);

  const existingLot = await findArchivedSameFile(validation.hash, validation.cutoffDate);
  if (existingLot) {
    const activated = await activateArchived(existingLot, normalizedUserId);
    return { ...activated, reusedArchive:true };
  }

  const lotId = crypto.randomUUID();
  const storageResult = await uploadArchive(file, validation, lotId, normalizedUserId);
  try {
    await upsertArchiveRecord({ lotId, validation, storageResult, userId:normalizedUserId, active:false });
  } catch (error) {
    try {
      await azureStorage.deleteBlob_gnral(storageResult.storage_blob_name, {
        containerName:storageResult.storage_container,
        queueOnFailure:true,
        queueContext:{modulo:'almacen',entidadTipo:'cierre-excel',entidadId:lotId,solicitadoPor:normalizedUserId,motivo:'No se pudo registrar metadata del cierre de Almacen.'}
      });
    } catch (_cleanupError) {}
    throw error;
  }

  let stagingReleased = false;
  try {
    // Se libera primero el staging de cierres que ya tienen respaldo Blob.
    // Esto evita el pico de disco que provocaba el modo read_only de Aiven.
    await deleteOperationalRowsForArchivedLotsExcept(lotId);
    stagingReleased = true;
    const imported = await service.importSpreadsheet(file, validation.cutoffDate, normalizedUserId, { lotId });
    return {
      ...imported,
      archived:true,
      archiveProvider:'AZURE_BLOB',
      storageBytes:Number(storageResult.tamano_bytes || 0)
    };
  } catch (error) {
    let restore = stagingReleased ? null : { restored:false, notNeeded:true };
    try {
      if (stagingReleased && current?.archived && current.loteImportacion !== lotId) restore = await restorePreviousSource(current, normalizedUserId);
    } catch (restoreError) {
      restore = { restored:false, error:restoreError.message };
    }
    const cleanup = await cleanupFailedArchive(lotId, storageResult, normalizedUserId);
    const wrapped = archiveError(
      !stagingReleased
        ? 'La nueva carga fallo antes de liberar el staging anterior; el cierre activo previo no fue sustituido.'
        : restore?.restored
          ? 'La nueva carga fallo y el cierre anterior fue restaurado automaticamente.'
          : 'La nueva carga fallo. El Excel quedo protegido en Azure, pero no puedo confirmar que el staging anterior haya sido restaurado.',
      500,
      'ALMACEN_IMPORT_STAGING_FAILED',
      { originalCode:error.code || null, stagingReleased, restored:Boolean(restore?.restored), cleanup }
    );
    wrapped.cause = error;
    throw wrapped;
  }
}

async function activateArchived(lotId, userId) {
  const normalizedUserId = normalizeUserId(userId);
  const targetLot = normalizeLotId(lotId);
  const targetSource = await sourceEngine.sourceByLot(targetLot, db, 'SELECCIONADO');
  if (!targetSource) throw archiveError('El cierre solicitado no existe.', 404, 'ALMACEN_ARCHIVE_NOT_FOUND', { loteImportacion:targetLot });
  const targetRecord = await sourceEngine.archiveRecordByLot(targetLot);
  if (!targetRecord) {
    throw archiveError('El cierre solicitado es legacy y todavia no tiene Excel original archivado.', 409, 'ALMACEN_ARCHIVE_LEGACY_NOT_RELOADABLE', { loteImportacion:targetLot });
  }
  if (targetSource.activo && targetSource.loaded) {
    return { ok:true, alreadyActive:true, loteImportacion:targetLot, filas:targetSource.filas, source:targetSource };
  }

  const current = await sourceEngine.activeSource();
  await requireCurrentArchived(current);

  // Descarga y verifica hash antes de tocar el staging actual.
  const targetFile = await downloadArchive(targetRecord);
  let stagingReleased = false;
  try {
    await deleteOperationalRowsForArchivedLotsExcept(targetLot);
    // Desde este punto el cierre activo anterior ya pudo perder sus filas
    // operativas, por lo que cualquier error posterior exige restauracion.
    stagingReleased = true;
    await deleteOperationalRows(targetLot);
    const imported = await service.importSpreadsheet(targetFile, targetSource.fechaCorte, normalizedUserId, { lotId:targetLot });
    return {
      ...imported,
      reactivated:true,
      archived:true,
      archiveProvider:'AZURE_BLOB',
      source:await sourceEngine.sourceByLot(targetLot, db, 'ACTIVO')
    };
  } catch (error) {
    let restore = stagingReleased ? null : { restored:false, notNeeded:true };
    try {
      if (stagingReleased && current?.archived && current.loteImportacion !== targetLot) restore = await restorePreviousSource(current, normalizedUserId);
    } catch (restoreError) {
      restore = { restored:false, error:restoreError.message };
    }
    const wrapped = archiveError(
      !stagingReleased
        ? 'No fue posible liberar el staging anterior; el cierre activo previo no fue sustituido.'
        : restore?.restored
          ? 'No fue posible reactivar el cierre historico y se restauro el cierre anterior.'
          : 'No fue posible reactivar el cierre historico. No puedo confirmar la restauracion del staging anterior.',
      500,
      'ALMACEN_ARCHIVE_REACTIVATION_FAILED',
      { originalCode:error.code || null, stagingReleased, restored:Boolean(restore?.restored), loteImportacion:targetLot }
    );
    wrapped.cause = error;
    throw wrapped;
  }
}

module.exports = {
  archiveActive,
  importAndActivate,
  activateArchived,
  deleteOperationalRows,
  downloadArchive
};

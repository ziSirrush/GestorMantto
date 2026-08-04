const fs = require('fs');
const path = require('path');
const repository = require('./storage-reconciliation.repository');
const azureStorage = require('../../services/storage/azure-storage.service');
const metrics = require('../../services/storage/storage-metrics.service');

const DELETE_CONFIRMATION = 'ELIMINAR_HUERFANOS_AZURE';

function enabled_gnral(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function positiveInteger(value, fallback, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(maximum, Math.floor(parsed));
}

function config_gnral() {
  return {
    maxBlobs: positiveInteger(process.env.CFFAA_STORAGE_RECONCILIATION_MAX_BLOBS, 5000, 50000),
    maxDbChecks: positiveInteger(process.env.CFFAA_STORAGE_RECONCILIATION_MAX_DB_CHECKS, 1000, 10000),
    sampleLimit: positiveInteger(process.env.CFFAA_STORAGE_RECONCILIATION_SAMPLE_LIMIT, 200, 1000),
    orphanMinAgeHours: positiveInteger(process.env.CFFAA_STORAGE_ORPHAN_MIN_AGE_HOURS, 24, 8760),
    maxDelete: positiveInteger(process.env.CFFAA_STORAGE_ORPHAN_MAX_DELETE, 50, 500),
    deleteEnabled: enabled_gnral(process.env.CFFAA_STORAGE_ORPHAN_DELETE_ENABLED, false),
    metricsEnabled: metrics.enabled_gnral()
  };
}

function normalizeBlobName_gnral(value) {
  const clean = String(value || '').replace(/^\/+/, '');
  if (!clean || clean.includes('..') || clean.includes('\\')) {
    const error = new Error('Nombre de blob inválido.');
    error.status = 400;
    error.code = 'CFFAA_INVALID_BLOB_NAME';
    throw error;
  }
  return clean;
}

function storageKey(container, blobName, fallbackContainer) {
  return `${String(container || fallbackContainer || '').trim()}|${String(blobName || '').replace(/^\/+/, '')}`;
}

function ageHours_gnral(dateValue, now = Date.now()) {
  const timestamp = dateValue ? new Date(dateValue).getTime() : NaN;
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, (now - timestamp) / 3600000);
}

function classifyReconciliation_gnral({ references, aivenReferences, blobs, pendingDeletes, containerName, minAgeHours, now = Date.now() }) {
  const allBlobReferences = (references || []).filter(row => String(row.storage_blob_name || '').trim());
  const scopedAivenReferences = Array.isArray(aivenReferences) ? aivenReferences : allBlobReferences;
  const azureReferences = scopedAivenReferences.filter(row =>
    String(row.storage_provider || '').trim().toUpperCase() === 'AZURE_BLOB'
  );
  const referenceMap = new Map();
  for (const row of allBlobReferences) {
    const key = storageKey(row.storage_container, row.storage_blob_name, containerName);
    if (!referenceMap.has(key)) referenceMap.set(key, []);
    referenceMap.get(key).push(row);
  }
  const azureReferenceMap = new Map();
  for (const row of azureReferences) {
    const key = storageKey(row.storage_container, row.storage_blob_name, containerName);
    if (!azureReferenceMap.has(key)) azureReferenceMap.set(key, []);
    azureReferenceMap.get(key).push(row);
  }

  const blobMap = new Map();
  for (const blob of blobs || []) {
    blobMap.set(storageKey(blob.storage_container, blob.storage_blob_name, containerName), blob);
  }

  const pendingMap = new Map();
  for (const operation of pendingDeletes || []) {
    pendingMap.set(storageKey(operation.storage_container, operation.storage_blob_name, containerName), operation);
  }

  const aivenWithoutBlob = [];
  for (const [key, rows] of azureReferenceMap.entries()) {
    if (!blobMap.has(key)) aivenWithoutBlob.push(...rows);
  }

  const orphanCandidates = [];
  const pendingDelete = [];
  const recentUnregistered = [];
  for (const [key, blob] of blobMap.entries()) {
    if (referenceMap.has(key)) continue;
    if (pendingMap.has(key)) {
      pendingDelete.push({ ...blob, pending_operation: pendingMap.get(key) });
      continue;
    }
    const ageHours = ageHours_gnral(blob.created_on || blob.last_modified, now);
    const classified = { ...blob, age_hours: ageHours };
    if (ageHours === null || ageHours < minAgeHours) recentUnregistered.push(classified);
    else orphanCandidates.push(classified);
  }

  return {
    all_blob_references: allBlobReferences,
    azure_references: azureReferences,
    referenceMap,
    azureReferenceMap,
    blobMap,
    aiven_without_blob: aivenWithoutBlob,
    orphan_candidates: orphanCandidates,
    pending_delete: pendingDelete,
    recent_unregistered: recentUnregistered
  };
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length || 1) }, run));
  return results;
}

async function reconciliationReport_gnral(query = {}, actor = {}) {
  const cfg = config_gnral();
  const maxBlobs = positiveInteger(query.max_blobs, cfg.maxBlobs, 50000);
  const sampleLimit = positiveInteger(query.sample_limit, cfg.sampleLimit, 1000);
  const includeInactive = String(query.include_inactive || '0') === '1';
  const prefix = String(query.prefix || '').trim().replace(/^\/+/, '');
  const storageStatus = await azureStorage.getStatus_gnral();

  const [referenceResult, pendingDeletes, azureList] = await Promise.all([
    repository.listStorageReferences_gnral(),
    repository.pendingDeleteBlobs_gnral(),
    azureStorage.listBlobs_gnral({ maxBlobs, prefix })
  ]);

  let protectiveReferences = referenceResult.rows;
  let aivenScopeReferences = includeInactive
    ? referenceResult.rows
    : referenceResult.rows.filter(row => Number(row.activo) === 1);
  if (prefix) {
    protectiveReferences = protectiveReferences.filter(row =>
      String(row.storage_blob_name || '').replace(/^\/+/, '').startsWith(prefix)
    );
    aivenScopeReferences = aivenScopeReferences.filter(row =>
      String(row.storage_blob_name || '').replace(/^\/+/, '').startsWith(prefix)
    );
  }
  const classified = classifyReconciliation_gnral({
    references: protectiveReferences,
    aivenReferences: aivenScopeReferences,
    blobs: azureList.blobs,
    pendingDeletes,
    containerName: storageStatus.container_name,
    minAgeHours: cfg.orphanMinAgeHours
  });

  let aivenWithoutBlob = classified.aiven_without_blob;
  let dbChecksPerformed = 0;
  let dbReferencesNotVerified = [];

  if (!azureList.complete && aivenWithoutBlob.length) {
    const candidates = aivenWithoutBlob.slice(0, cfg.maxDbChecks);
    const verified = await mapWithConcurrency(candidates, 5, async row => ({
      row,
      exists: await azureStorage.blobExists_gnral(row.storage_blob_name, {
        containerName: row.storage_container || storageStatus.container_name
      })
    }));
    dbChecksPerformed = verified.length;
    aivenWithoutBlob = verified.filter(item => !item.exists).map(item => item.row);
    dbReferencesNotVerified = classified.aiven_without_blob.slice(cfg.maxDbChecks);
  }

  const allAzureRows = referenceResult.rows.filter(row =>
    String(row.storage_provider || '').trim().toUpperCase() === 'AZURE_BLOB'
  );
  const activeAzureRows = allAzureRows.filter(row => Number(row.activo) === 1);

  const response = {
    generated_at: new Date().toISOString(),
    scope: {
      provider: 'AZURE_BLOB',
      account_name: storageStatus.account_name,
      container_name: storageStatus.container_name,
      prefix: prefix || null,
      include_inactive: includeInactive,
      orphan_min_age_hours: cfg.orphanMinAgeHours
    },
    scan: {
      max_blobs: maxBlobs,
      azure_blobs_scanned: azureList.scanned,
      azure_scan_complete: azureList.complete,
      database_references_total: referenceResult.rows.length,
      database_azure_references_total: allAzureRows.length,
      database_azure_active_total: activeAzureRows.length,
      database_exists_checks_performed: dbChecksPerformed,
      database_references_not_verified: dbReferencesNotVerified.length
    },
    summary: {
      aiven_without_blob: aivenWithoutBlob.length,
      blob_without_aiven_candidates: classified.orphan_candidates.length,
      blobs_pending_delete: classified.pending_delete.length,
      recent_blobs_without_aiven: classified.recent_unregistered.length,
      database_references_not_verified: dbReferencesNotVerified.length
    },
    samples: {
      aiven_without_blob: aivenWithoutBlob.slice(0, sampleLimit),
      blob_without_aiven_candidates: classified.orphan_candidates.slice(0, sampleLimit),
      blobs_pending_delete: classified.pending_delete.slice(0, sampleLimit),
      recent_blobs_without_aiven: classified.recent_unregistered.slice(0, sampleLimit),
      database_references_not_verified: dbReferencesNotVerified.slice(0, sampleLimit)
    },
    sources: referenceResult.sources,
    safety: {
      cleanup_automatic: false,
      delete_enabled: cfg.deleteEnabled,
      delete_confirmation_required: DELETE_CONFIRMATION,
      historical_migration_automatic: false
    }
  };

  void metrics.recordEventSafe_gnral({
    tipo_evento: 'RECONCILIATION',
    storage_provider: 'AZURE_BLOB',
    storage_container: storageStatus.container_name,
    modulo: 'cffaa-06',
    entidad_tipo: 'reconciliation-report',
    usuario_id: actor && (actor.id_SB || actor.id),
    codigo: azureList.complete ? 'COMPLETE' : 'PARTIAL',
    detalle_json: response.summary
  });

  return response;
}

async function inventory_gnral() {
  const [providers, queue, storageStatus] = await Promise.all([
    repository.providerInventory_gnral(),
    repository.queueSummary_gnral(),
    azureStorage.getStatus_gnral()
  ]);
  return {
    generated_at: new Date().toISOString(),
    storage: {
      provider: storageStatus.provider,
      account_name: storageStatus.account_name,
      container_name: storageStatus.container_name,
      container_access: storageStatus.container_access
    },
    functional_tables: providers,
    cleanup_queue: queue,
    expected_providers: ['AZURE_BLOB', 'GLIDE', 'GLIDE_STORAGE', 'GOOGLE_DRIVE', 'LOCAL'],
    historical_migration: {
      automatic: false,
      requires_explicit_approval: true
    }
  };
}

function scanLocalUploads_gnral(options = {}) {
  const root = path.resolve(__dirname, '../../..', 'uploads');
  const sampleLimit = positiveInteger(options.sampleLimit, 50, 500);
  if (!fs.existsSync(root)) {
    return { path: root, exists: false, files: 0, total_bytes: 0, samples: [] };
  }

  let files = 0;
  let totalBytes = 0;
  const samples = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(absolute);
      else if (entry.isFile()) {
        const stat = fs.statSync(absolute);
        files += 1;
        totalBytes += stat.size;
        if (samples.length < sampleLimit) {
          samples.push({ path: path.relative(root, absolute).replace(/\\/g, '/'), size_bytes: stat.size });
        }
      }
    }
  }
  return { path: root, exists: true, files, total_bytes: totalBytes, samples };
}

async function legacyUploadsReport_gnral(query = {}) {
  const database = await repository.legacyUploadReferences_gnral({
    maxColumns: query.max_columns,
    sampleLimit: query.sample_limit
  });
  const local = scanLocalUploads_gnral({ sampleLimit: query.sample_limit });
  const enabled = process.env.CFFAA_LEGACY_UPLOADS_ENABLED === undefined
    ? true
    : enabled_gnral(process.env.CFFAA_LEGACY_UPLOADS_ENABLED, true);

  return {
    generated_at: new Date().toISOString(),
    static_route_enabled: enabled,
    database,
    local,
    safe_to_disable: database.total_references === 0 && local.files === 0,
    decision: database.total_references === 0 && local.files === 0
      ? 'La ruta /uploads puede deshabilitarse después de una prueba funcional completa.'
      : 'No deshabilitar /uploads: todavía existen referencias o archivos locales.'
  };
}

function validateCleanupRequest_gnral(body = {}, cfg = config_gnral()) {
  if (!cfg.deleteEnabled) {
    const error = new Error('La eliminación de huérfanos está deshabilitada. Activa CFFAA_STORAGE_ORPHAN_DELETE_ENABLED únicamente durante una limpieza controlada.');
    error.status = 403;
    error.code = 'CFFAA_ORPHAN_DELETE_DISABLED';
    throw error;
  }
  if (String(body.confirmacion || '') !== DELETE_CONFIRMATION) {
    const error = new Error(`Confirmación inválida. Escribe exactamente ${DELETE_CONFIRMATION}.`);
    error.status = 400;
    error.code = 'CFFAA_ORPHAN_DELETE_CONFIRMATION_REQUIRED';
    throw error;
  }
  if (!Array.isArray(body.blob_names) || !body.blob_names.length) {
    const error = new Error('blob_names debe contener al menos un nombre de blob.');
    error.status = 400;
    error.code = 'CFFAA_ORPHAN_DELETE_EMPTY';
    throw error;
  }
  const blobs = [...new Set(body.blob_names.map(normalizeBlobName_gnral))];
  if (blobs.length > cfg.maxDelete) {
    const error = new Error(`La limpieza permite máximo ${cfg.maxDelete} blobs por petición.`);
    error.status = 400;
    error.code = 'CFFAA_ORPHAN_DELETE_LIMIT';
    throw error;
  }
  return blobs;
}

async function deleteOrphans_gnral(body = {}, actor = {}) {
  const cfg = config_gnral();
  const blobNames = validateCleanupRequest_gnral(body, cfg);
  const storageStatus = await azureStorage.getStatus_gnral();
  const pendingRows = await repository.pendingDeleteBlobs_gnral();
  const pendingSet = new Set(pendingRows.map(row => storageKey(row.storage_container, row.storage_blob_name, storageStatus.container_name)));
  const results = [];

  for (const blobName of blobNames) {
    const references = await repository.isBlobReferenced_gnral(blobName, storageStatus.container_name);
    if (references.length) {
      results.push({ blob_name: blobName, status: 'SKIPPED_REFERENCED', references });
      continue;
    }

    if (pendingSet.has(storageKey(storageStatus.container_name, blobName, storageStatus.container_name))) {
      results.push({ blob_name: blobName, status: 'SKIPPED_PENDING_DELETE' });
      continue;
    }

    const properties = await azureStorage.getBlobProperties_gnral(blobName, {
      containerName: storageStatus.container_name
    });
    if (!properties.exists) {
      results.push({ blob_name: blobName, status: 'NOT_FOUND' });
      continue;
    }

    const ageHours = ageHours_gnral(properties.created_on || properties.last_modified);
    if (ageHours === null || ageHours < cfg.orphanMinAgeHours) {
      results.push({
        blob_name: blobName,
        status: 'SKIPPED_TOO_RECENT',
        age_hours: ageHours,
        minimum_age_hours: cfg.orphanMinAgeHours
      });
      continue;
    }

    const referencesBeforeDelete = await repository.isBlobReferenced_gnral(blobName, storageStatus.container_name);
    if (referencesBeforeDelete.length) {
      results.push({
        blob_name: blobName,
        status: 'SKIPPED_REFERENCED_RECHECK',
        references: referencesBeforeDelete
      });
      continue;
    }

    try {
      const deletion = await azureStorage.deleteBlob_gnral(blobName, {
        containerName: storageStatus.container_name,
        queueOnFailure: true,
        queueContext: {
          modulo: 'cffaa-06',
          entidadTipo: 'blob-huerfano',
          entidadId: blobName,
          solicitadoPor: actor && (actor.id_SB || actor.id),
          motivo: 'Limpieza controlada CFFAA-06 después de revalidar ausencia de referencias Aiven.'
        }
      });
      void metrics.recordEventSafe_gnral({
        tipo_evento: 'ORPHAN_DELETE',
        storage_provider: 'AZURE_BLOB',
        storage_container: storageStatus.container_name,
        storage_blob_name: blobName,
        modulo: 'cffaa-06',
        entidad_tipo: 'blob-huerfano',
        entidad_id: blobName,
        usuario_id: actor && (actor.id_SB || actor.id),
        codigo: deletion.deleted ? 'DELETED' : 'NOT_FOUND',
        tamano_bytes: properties.content_length
      });
      results.push({ blob_name: blobName, status: deletion.deleted ? 'DELETED' : 'NOT_FOUND', age_hours: ageHours });
    } catch (error) {
      results.push({
        blob_name: blobName,
        status: error.queue_operation_id ? 'QUEUED_AFTER_ERROR' : 'ERROR',
        code: error.code || null,
        message: error.message,
        queue_operation_id: error.queue_operation_id || null
      });
    }
  }

  return {
    generated_at: new Date().toISOString(),
    requested: blobNames.length,
    deleted: results.filter(item => item.status === 'DELETED').length,
    skipped: results.filter(item => item.status.startsWith('SKIPPED')).length,
    queued_after_error: results.filter(item => item.status === 'QUEUED_AFTER_ERROR').length,
    results
  };
}

async function metricsReport_gnral(query = {}) {
  return metrics.summary_gnral(positiveInteger(query.days, 30, 365));
}

module.exports = {
  DELETE_CONFIRMATION,
  enabled_gnral,
  config_gnral,
  normalizeBlobName_gnral,
  ageHours_gnral,
  classifyReconciliation_gnral,
  reconciliationReport_gnral,
  inventory_gnral,
  scanLocalUploads_gnral,
  legacyUploadsReport_gnral,
  validateCleanupRequest_gnral,
  deleteOrphans_gnral,
  metricsReport_gnral
};

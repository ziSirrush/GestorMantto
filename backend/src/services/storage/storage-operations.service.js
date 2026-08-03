const crypto = require('crypto');
const repository = require('./storage-operations.repository');

const OPERATION_DELETE_BLOB = 'ELIMINAR_BLOB';

function dedupKey_gnral({ tipo_operacion, storage_provider, storage_container, storage_blob_name }) {
  return crypto.createHash('sha256').update([
    tipo_operacion,
    storage_provider,
    storage_container || '',
    storage_blob_name
  ].join('|')).digest('hex');
}

async function enqueueDeleteBlob_gnral(payload) {
  const blobName = String(payload && payload.storage_blob_name || '').replace(/^\/+/, '');
  if (!blobName || blobName.includes('..')) {
    const error = new Error('No se puede programar la eliminación de un blob inválido.');
    error.status = 400;
    error.code = 'CFFAA_INVALID_BLOB_NAME';
    throw error;
  }

  const record = {
    tipo_operacion: OPERATION_DELETE_BLOB,
    storage_provider: String(payload.storage_provider || 'AZURE_BLOB'),
    storage_container: payload.storage_container || process.env.AZURE_STORAGE_BLOB_CONTAINER_NAME || null,
    storage_blob_name: blobName,
    modulo: payload.modulo || null,
    entidad_tipo: payload.entidad_tipo || null,
    entidad_id: payload.entidad_id ?? null,
    motivo: payload.motivo || 'Eliminación compensatoria pendiente.',
    solicitado_por: payload.solicitado_por || null,
    ultimo_error: payload.ultimo_error || null,
    max_intentos: Math.max(1, Number(payload.max_intentos || process.env.CFFAA_STORAGE_RETRY_MAX_ATTEMPTS || 10))
  };
  record.dedup_key = dedupKey_gnral(record);
  return repository.enqueue_gnral(record);
}

function nextAttemptAt_gnral(attempts) {
  const baseSeconds = Math.max(10, Number(process.env.CFFAA_STORAGE_RETRY_BASE_SECONDS || 60));
  const maxSeconds = Math.max(baseSeconds, Number(process.env.CFFAA_STORAGE_RETRY_MAX_SECONDS || 3600));
  const seconds = Math.min(maxSeconds, baseSeconds * (2 ** Math.max(0, Number(attempts || 1) - 1)));
  return new Date(Date.now() + seconds * 1000);
}

async function processOperation_gnral(operation) {
  if (operation.tipo_operacion !== OPERATION_DELETE_BLOB) {
    return repository.markRetry_gnral(
      operation,
      `Tipo de operación no soportado: ${operation.tipo_operacion}`,
      nextAttemptAt_gnral(operation.intentos)
    );
  }

  try {
    const azureStorage = require('./azure-storage.service');
    await azureStorage.deleteBlob_gnral(operation.storage_blob_name, {
      queueOnFailure: false,
      containerName: operation.storage_container
    });
    await repository.markCompleted_gnral(operation.id_operacion);
    return { completed: true };
  } catch (error) {
    const retry = await repository.markRetry_gnral(
      operation,
      error.message,
      nextAttemptAt_gnral(operation.intentos)
    );
    return { completed: false, exhausted: retry.exhausted, error };
  }
}

module.exports = {
  OPERATION_DELETE_BLOB,
  dedupKey_gnral,
  enqueueDeleteBlob_gnral,
  nextAttemptAt_gnral,
  processOperation_gnral
};

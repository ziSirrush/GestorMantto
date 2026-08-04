const path = require('path');
const azureStorage = require('./azure-storage.service');
const filePolicy = require('./storage-file-policy.service');
const {
  STORAGE_CODES,
  createStorageError_gnral
} = require('./storage-errors.service');

const AZURE_PROVIDER = 'AZURE_BLOB';

function firstValue_gnral(source, names) {
  for (const name of names) {
    if (source && source[name] !== undefined && source[name] !== null && source[name] !== '') {
      return source[name];
    }
  }
  return null;
}

function normalizeProvider_gnral(value) {
  const provider = String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (provider === 'AZURE' || provider === 'AZUREBLOB' || provider === 'BLOB') return AZURE_PROVIDER;
  return provider;
}

function normalizeActive_gnral(value) {
  if (value === undefined || value === null || value === '') return true;
  if (typeof value === 'boolean') return value;
  return !['0', 'false', 'no', 'off', 'inactivo'].includes(String(value).trim().toLowerCase());
}

function normalizeBlobName_gnral(value) {
  let blobName = String(value || '').trim();
  if (blobName.toLowerCase().startsWith('azureblob:')) blobName = blobName.slice('azureblob:'.length);
  blobName = blobName.replace(/^\/+/, '');

  if (
    !blobName ||
    blobName.length > 1024 ||
    blobName.includes('..') ||
    blobName.includes('\\') ||
    /^https?:\/\//i.test(blobName) ||
    /[\u0000-\u001f\u007f]/.test(blobName)
  ) {
    throw createStorageError_gnral('La referencia del blob no es válida.', {
      status: 400,
      code: STORAGE_CODES.REFERENCE_INVALID
    });
  }

  return blobName;
}

function normalizeSize_gnral(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null;
}

function normalizeAzureReference_gnral(reference, options = {}) {
  if (!reference || typeof reference !== 'object' || Array.isArray(reference)) {
    throw createStorageError_gnral('No se recibió una referencia de archivo válida.', {
      status: 400,
      code: STORAGE_CODES.REFERENCE_INVALID
    });
  }

  const rawBlobName = firstValue_gnral(reference, [
    'storage_blob_name',
    'blob_name',
    'blobName',
    'archivo_url',
    'ruta_archivo'
  ]);
  const blobName = normalizeBlobName_gnral(rawBlobName);

  let provider = normalizeProvider_gnral(firstValue_gnral(reference, [
    'storage_provider',
    'provider',
    'storageProvider'
  ]));
  if (!provider && String(rawBlobName || '').toLowerCase().startsWith('azureblob:')) provider = AZURE_PROVIDER;

  if (provider !== AZURE_PROVIDER) {
    throw createStorageError_gnral(`El proveedor ${provider || '(vacío)'} no admite acceso SAS de Azure.`, {
      status: 409,
      code: STORAGE_CODES.PROVIDER_NOT_SUPPORTED,
      details: { provider: provider || null }
    });
  }

  const config = azureStorage.getConfig_gnral();
  const containerName = String(firstValue_gnral(reference, [
    'storage_container',
    'container_name',
    'containerName'
  ]) || config.containerName).trim();

  if (containerName !== config.containerName) {
    throw createStorageError_gnral('La referencia apunta a un contenedor no autorizado.', {
      status: 400,
      code: STORAGE_CODES.REFERENCE_INVALID
    });
  }

  const active = normalizeActive_gnral(firstValue_gnral(reference, ['activo', 'active', 'is_active']));
  if (!active && options.allowInactive !== true) {
    throw createStorageError_gnral('El archivo no está disponible.', {
      status: 404,
      code: STORAGE_CODES.FILE_INACTIVE
    });
  }

  const originalName = filePolicy.sanitizeOriginalName_gnral(
    firstValue_gnral(reference, [
      'nombre_original',
      'nombre_archivo',
      'file_name',
      'fileName'
    ]) || path.basename(blobName)
  );

  return Object.freeze({
    storage_provider: AZURE_PROVIDER,
    storage_container: containerName,
    storage_blob_name: blobName,
    nombre_original: originalName,
    mime_type: String(firstValue_gnral(reference, ['mime_type', 'tipo_archivo', 'mimeType']) || '').trim().toLowerCase() || null,
    tamano_bytes: normalizeSize_gnral(firstValue_gnral(reference, ['tamano_bytes', 'tamanio_bytes', 'peso_archivo', 'size'])),
    activo: active,
    id_archivo: firstValue_gnral(reference, ['id_archivo', 'id_adjunto', 'id', 'file_id'])
  });
}

module.exports = {
  AZURE_PROVIDER,
  normalizeProvider_gnral,
  normalizeActive_gnral,
  normalizeBlobName_gnral,
  normalizeAzureReference_gnral
};

const crypto = require('crypto');
const path = require('path');
const filePolicy = require('./storage-file-policy.service');
const {
  STORAGE_CODES,
  createStorageError_gnral
} = require('./storage-errors.service');

let azureSdkCache = null;
let clientsCache = null;
let delegationKeyCache = null;

const PROVIDER = 'AZURE_BLOB';
const DEFAULT_SAS_MINUTES = 15;
const DEFAULT_MAX_FILE_MB = 25;
const DEFAULT_DELEGATION_KEY_MINUTES = 60;

function getAzureSdk_gnral() {
  if (azureSdkCache) return azureSdkCache;

  try {
    const { DefaultAzureCredential } = require('@azure/identity');
    const {
      BlobServiceClient,
      BlobSASPermissions,
      SASProtocol,
      generateBlobSASQueryParameters
    } = require('@azure/storage-blob');

    azureSdkCache = {
      DefaultAzureCredential,
      BlobServiceClient,
      BlobSASPermissions,
      SASProtocol,
      generateBlobSASQueryParameters
    };
    return azureSdkCache;
  } catch (cause) {
    throw createStorageError_gnral(
      'Azure Storage no está disponible porque faltan las dependencias @azure/identity y/o @azure/storage-blob. Ejecuta npm install dentro de backend.',
      {
        status: 503,
        code: 'AZURE_STORAGE_DEPENDENCIES_MISSING',
        cause
      }
    );
  }
}

function readNumber(value, fallback, minimum, maximum, variableName) {
  const parsed = Number(value === undefined || value === null || value === '' ? fallback : value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw createStorageError_gnral(`${variableName} debe estar entre ${minimum} y ${maximum}.`, {
      status: 503,
      code: STORAGE_CODES.STORAGE_UNAVAILABLE
    });
  }
  return parsed;
}

function getConfig_gnral() {
  const accountName = String(process.env.AZURE_STORAGE_ACCOUNT_NAME || '').trim();
  const containerName = String(process.env.AZURE_STORAGE_BLOB_CONTAINER_NAME || '').trim();
  const missing = [];
  if (!accountName) missing.push('AZURE_STORAGE_ACCOUNT_NAME');
  if (!containerName) missing.push('AZURE_STORAGE_BLOB_CONTAINER_NAME');

  if (missing.length) {
    throw createStorageError_gnral(`Faltan variables de Azure Storage: ${missing.join(', ')}`, {
      status: 503,
      code: STORAGE_CODES.STORAGE_UNAVAILABLE
    });
  }

  const sasMinutes = readNumber(
    process.env.AZURE_STORAGE_SAS_MINUTES,
    DEFAULT_SAS_MINUTES,
    1,
    1440,
    'AZURE_STORAGE_SAS_MINUTES'
  );
  const maxFileMb = readNumber(
    process.env.AZURE_STORAGE_MAX_FILE_MB,
    DEFAULT_MAX_FILE_MB,
    1,
    1024,
    'AZURE_STORAGE_MAX_FILE_MB'
  );
  const delegationKeyMinutes = readNumber(
    process.env.AZURE_STORAGE_DELEGATION_KEY_MINUTES,
    DEFAULT_DELEGATION_KEY_MINUTES,
    Math.min(15, sasMinutes),
    10080,
    'AZURE_STORAGE_DELEGATION_KEY_MINUTES'
  );

  if (delegationKeyMinutes < sasMinutes + 5) {
    throw createStorageError_gnral('AZURE_STORAGE_DELEGATION_KEY_MINUTES debe ser al menos 5 minutos mayor que AZURE_STORAGE_SAS_MINUTES.', {
      status: 503,
      code: STORAGE_CODES.STORAGE_UNAVAILABLE
    });
  }

  return {
    accountName,
    containerName,
    sasMinutes,
    maxFileMb,
    maxFileBytes: Math.floor(maxFileMb * 1024 * 1024),
    delegationKeyMinutes,
    serviceUrl: `https://${accountName}.blob.core.windows.net`
  };
}

function getClients_gnral() {
  const config = getConfig_gnral();
  if (clientsCache && clientsCache.accountName === config.accountName && clientsCache.containerName === config.containerName) {
    return { ...clientsCache, config };
  }

  const { DefaultAzureCredential, BlobServiceClient } = getAzureSdk_gnral();
  const credential = new DefaultAzureCredential();
  const blobServiceClient = new BlobServiceClient(config.serviceUrl, credential);
  const containerClient = blobServiceClient.getContainerClient(config.containerName);

  clientsCache = {
    accountName: config.accountName,
    containerName: config.containerName,
    credential,
    blobServiceClient,
    containerClient
  };
  delegationKeyCache = null;

  return { ...clientsCache, config };
}

function assertConfiguredContainer_gnral(containerName, config) {
  const requested = String(containerName || config.containerName).trim();
  if (requested !== config.containerName) {
    throw createStorageError_gnral('El contenedor solicitado no coincide con el contenedor privado configurado.', {
      status: 400,
      code: 'CFFAA_STORAGE_CONTAINER_NOT_ALLOWED'
    });
  }
  return requested;
}

function cleanSegment_gnral(value, fallback = 'sin-clasificar') {
  const clean = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
  return clean || fallback;
}

function normalizeCompany_gnral(value) {
  const company = String(value || '').toUpperCase();
  if (company.includes('CORELLIAN')) return 'corellian';
  if (company.includes('UNITED')) return 'united';
  return cleanSegment_gnral(value, 'general');
}

function buildBlobName_gnral({ empresa, modulo, entidadTipo, entidadId, subruta, originalName }) {
  const normalizedName = filePolicy.sanitizeOriginalName_gnral(originalName || 'archivo');
  const extension = path.extname(normalizedName).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 20);
  const safeBaseName = cleanSegment_gnral(path.basename(normalizedName, path.extname(normalizedName)), 'archivo');
  const unique = `${Date.now()}-${crypto.randomUUID()}`;
  const segments = [
    normalizeCompany_gnral(empresa),
    cleanSegment_gnral(modulo, 'general'),
    cleanSegment_gnral(entidadTipo, 'entidad'),
    cleanSegment_gnral(entidadId, 'sin-id')
  ];

  if (subruta) segments.push(cleanSegment_gnral(subruta, 'archivos'));
  segments.push(`${unique}-${safeBaseName}${extension}`);
  return segments.join('/');
}

function validateFile_gnral(file, options = {}) {
  return filePolicy.validateFile_gnral(file, options);
}

async function ensureContainer_gnral() {
  const { containerClient, config } = getClients_gnral();
  const exists = await containerClient.exists();
  if (!exists) {
    throw createStorageError_gnral(`El contenedor privado ${config.containerName} no existe o no es accesible.`, {
      status: 503,
      code: STORAGE_CODES.STORAGE_UNAVAILABLE
    });
  }
  return true;
}

async function uploadPrivate_gnral({
  file,
  empresa,
  modulo,
  entidadTipo,
  entidadId,
  subruta,
  metadata = {},
  policyName = 'GENERAL',
  forceDownload = false
}) {
  const checked = validateFile_gnral(file, { policyName });
  const { containerClient, config } = getClients_gnral();
  const normalizedFile = {
    ...file,
    originalname: checked.originalName,
    size: checked.size,
    mimetype: checked.mimeType
  };
  const blobName = buildBlobName_gnral({
    empresa,
    modulo,
    entidadTipo,
    entidadId,
    subruta,
    originalName: normalizedFile.originalname
  });
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);

  const blobMetadata = {};
  for (const [key, value] of Object.entries(metadata || {})) {
    if (value === undefined || value === null || value === '') continue;
    blobMetadata[cleanSegment_gnral(key, 'meta').replace(/-/g, '_')] = String(value).slice(0, 500);
  }

  await blockBlobClient.uploadData(normalizedFile.buffer, {
    blobHTTPHeaders: {
      blobContentType: checked.mimeType,
      blobContentDisposition: filePolicy.contentDisposition_gnral(
        normalizedFile.originalname,
        checked.mimeType,
        forceDownload
      )
    },
    metadata: blobMetadata,
    conditions: { ifNoneMatch: '*' }
  });

  return {
    storage_provider: PROVIDER,
    storage_container: config.containerName,
    storage_blob_name: blobName,
    storage_url: blockBlobClient.url,
    nombre_original: normalizedFile.originalname,
    nombre_archivo: path.basename(blobName),
    extension: checked.extensionWithoutDot,
    mime_type: checked.mimeType,
    tamano_bytes: checked.size,
    signature: checked.signature,
    policy: checked.policy
  };
}

async function getDelegationKey_gnral(requiredExpiresOn) {
  const { blobServiceClient, config } = getClients_gnral();
  const safetyMs = 60 * 1000;
  if (
    delegationKeyCache &&
    delegationKeyCache.accountName === config.accountName &&
    delegationKeyCache.expiresOn.getTime() > requiredExpiresOn.getTime() + safetyMs
  ) {
    return delegationKeyCache.key;
  }

  const now = new Date();
  const startsOn = new Date(now.getTime() - 5 * 60 * 1000);
  const keyExpiresOn = new Date(now.getTime() + config.delegationKeyMinutes * 60 * 1000);
  const key = await blobServiceClient.getUserDelegationKey(startsOn, keyExpiresOn);
  delegationKeyCache = {
    accountName: config.accountName,
    key,
    startsOn,
    expiresOn: keyExpiresOn
  };
  return key;
}

async function createReadSas_gnral(blobName, options = {}) {
  const { containerClient, config } = getClients_gnral();
  assertConfiguredContainer_gnral(options.containerName, config);
  const cleanBlobName = String(blobName || '').replace(/^\/+/, '');
  if (!cleanBlobName || cleanBlobName.includes('..')) {
    throw createStorageError_gnral('Nombre de blob inválido.', {
      status: 400,
      code: 'CFFAA_INVALID_BLOB_NAME'
    });
  }

  const blobClient = containerClient.getBlobClient(cleanBlobName);
  if (options.verifyExists === true && !(await blobClient.exists())) {
    throw createStorageError_gnral('El archivo no existe en Azure Storage.', {
      status: 404,
      code: 'CFFAA_BLOB_NOT_FOUND'
    });
  }

  const requestedMinutes = Number(options.minutes || config.sasMinutes);
  const minutes = Math.max(1, Math.min(
    Number.isFinite(requestedMinutes) ? requestedMinutes : config.sasMinutes,
    config.sasMinutes
  ));
  const now = new Date();
  const startsOn = new Date(now.getTime() - 5 * 60 * 1000);
  const expiresOn = new Date(now.getTime() + minutes * 60 * 1000);
  const delegationKey = await getDelegationKey_gnral(expiresOn);
  const { BlobSASPermissions, SASProtocol, generateBlobSASQueryParameters } = getAzureSdk_gnral();
  const sas = generateBlobSASQueryParameters({
    containerName: config.containerName,
    blobName: cleanBlobName,
    permissions: BlobSASPermissions.parse('r'),
    protocol: SASProtocol.Https,
    startsOn,
    expiresOn,
    contentDisposition: options.download === true
      ? filePolicy.contentDisposition_gnral(options.fileName || path.basename(cleanBlobName), null, true)
      : undefined
  }, delegationKey, config.accountName).toString();

  return {
    url: `${blobClient.url}?${sas}`,
    expires_at: expiresOn.toISOString(),
    expires_in_minutes: minutes
  };
}

async function enqueueFailedDelete_gnral(blobName, options, originalError) {
  if (options.queueOnFailure === false) return null;

  try {
    const operations = require('./storage-operations.service');
    const context = options.queueContext || {};
    return await operations.enqueueDeleteBlob_gnral({
      storage_provider: PROVIDER,
      storage_container: options.containerName || process.env.AZURE_STORAGE_BLOB_CONTAINER_NAME,
      storage_blob_name: blobName,
      modulo: context.modulo,
      entidad_tipo: context.entidadTipo || context.entidad_tipo,
      entidad_id: context.entidadId ?? context.entidad_id,
      motivo: context.motivo || 'Azure no pudo eliminar el blob en la operación original.',
      solicitado_por: context.solicitadoPor || context.solicitado_por,
      ultimo_error: originalError.message
    });
  } catch (queueError) {
    originalError.queue_error = queueError.message;
    return null;
  }
}

async function deleteBlob_gnral(blobName, options = {}) {
  const { containerClient, config } = getClients_gnral();
  assertConfiguredContainer_gnral(options.containerName, config);
  const cleanBlobName = String(blobName || '').replace(/^\/+/, '');
  if (!cleanBlobName || cleanBlobName.includes('..')) {
    throw createStorageError_gnral('Nombre de blob inválido.', {
      status: 400,
      code: 'CFFAA_INVALID_BLOB_NAME'
    });
  }

  try {
    const result = await containerClient.getBlockBlobClient(cleanBlobName).deleteIfExists({
      deleteSnapshots: options.deleteSnapshots || 'include'
    });
    return { deleted: Boolean(result.succeeded), queued: false };
  } catch (error) {
    const queued = await enqueueFailedDelete_gnral(cleanBlobName, options, error);
    if (queued) error.queue_operation_id = queued.id_operacion;
    throw error;
  }
}

function getCacheStatus_gnral() {
  return {
    clients_cached: Boolean(clientsCache),
    delegation_key_cached: Boolean(delegationKeyCache),
    delegation_key_expires_at: delegationKeyCache && delegationKeyCache.expiresOn
      ? delegationKeyCache.expiresOn.toISOString()
      : null
  };
}

async function getStatus_gnral() {
  const config = getConfig_gnral();
  await ensureContainer_gnral();
  return {
    configured: true,
    provider: PROVIDER,
    account_name: config.accountName,
    container_name: config.containerName,
    max_file_mb: config.maxFileMb,
    max_request_mb: filePolicy.getLimits_gnral().maxRequestMb,
    sas_minutes: config.sasMinutes,
    delegation_key_minutes: config.delegationKeyMinutes,
    signature_validation: String(process.env.CFFAA_FILE_SIGNATURE_VALIDATION || 'true').toLowerCase() !== 'false',
    authentication: 'MANAGED_IDENTITY_OR_DEFAULT_AZURE_CREDENTIAL',
    container_access: 'PRIVATE',
    cache: getCacheStatus_gnral()
  };
}

function resetCaches_gnral() {
  clientsCache = null;
  delegationKeyCache = null;
}

module.exports = {
  PROVIDER,
  getAzureSdk_gnral,
  getConfig_gnral,
  buildBlobName_gnral,
  validateFile_gnral,
  ensureContainer_gnral,
  uploadPrivate_gnral,
  createReadSas_gnral,
  deleteBlob_gnral,
  getStatus_gnral,
  getCacheStatus_gnral,
  resetCaches_gnral
};

const crypto = require('crypto');
const path = require('path');
const mime = require('mime-types');
let azureSdkCache = null;

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
    const error = new Error(
      'Azure Storage no está disponible porque faltan las dependencias @azure/identity y/o @azure/storage-blob. ' +
      'Ejecuta npm install dentro de backend antes de usar las rutas /api/azure-storage.'
    );
    error.code = 'AZURE_STORAGE_DEPENDENCIES_MISSING';
    error.status = 503;
    error.cause = cause;
    throw error;
  }
}

const PROVIDER = 'AZURE_BLOB';
const DEFAULT_SAS_MINUTES = 15;
const DEFAULT_MAX_FILE_MB = 25;

let clientsCache = null;

function getConfig_gnral() {
  const accountName = String(process.env.AZURE_STORAGE_ACCOUNT_NAME || '').trim();
  const containerName = String(process.env.AZURE_STORAGE_BLOB_CONTAINER_NAME || '').trim();
  const sasMinutes = Number(process.env.AZURE_STORAGE_SAS_MINUTES || DEFAULT_SAS_MINUTES);
  const maxFileMb = Number(process.env.AZURE_STORAGE_MAX_FILE_MB || DEFAULT_MAX_FILE_MB);

  const missing = [];
  if (!accountName) missing.push('AZURE_STORAGE_ACCOUNT_NAME');
  if (!containerName) missing.push('AZURE_STORAGE_BLOB_CONTAINER_NAME');
  if (missing.length) {
    const error = new Error(`Faltan variables de Azure Storage: ${missing.join(', ')}`);
    error.status = 503;
    throw error;
  }

  if (!Number.isFinite(sasMinutes) || sasMinutes < 1 || sasMinutes > 1440) {
    const error = new Error('AZURE_STORAGE_SAS_MINUTES debe estar entre 1 y 1440.');
    error.status = 503;
    throw error;
  }
  if (!Number.isFinite(maxFileMb) || maxFileMb < 1 || maxFileMb > 1024) {
    const error = new Error('AZURE_STORAGE_MAX_FILE_MB debe estar entre 1 y 1024.');
    error.status = 503;
    throw error;
  }

  return {
    accountName,
    containerName,
    sasMinutes,
    maxFileMb,
    maxFileBytes: Math.floor(maxFileMb * 1024 * 1024),
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

  return { ...clientsCache, config };
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
  const extension = path.extname(String(originalName || '')).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 20);
  const safeBaseName = cleanSegment_gnral(path.basename(String(originalName || 'archivo'), path.extname(String(originalName || ''))), 'archivo');
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

function validateFile_gnral(file) {
  const { maxFileBytes, maxFileMb } = getConfig_gnral();
  if (!file || !Buffer.isBuffer(file.buffer)) {
    const error = new Error('No se recibió un archivo válido.');
    error.status = 400;
    throw error;
  }
  if (!file.size || file.size <= 0) {
    const error = new Error('El archivo está vacío.');
    error.status = 400;
    throw error;
  }
  if (file.size > maxFileBytes) {
    const error = new Error(`El archivo excede el límite de ${maxFileMb} MB.`);
    error.status = 413;
    throw error;
  }

  const extension = path.extname(file.originalname || '').toLowerCase();
  const detectedMime = mime.lookup(extension) || null;
  const receivedMime = String(file.mimetype || '').toLowerCase();
  const blocked = new Set([
    '.exe', '.msi', '.bat', '.cmd', '.com', '.scr', '.ps1', '.sh', '.apk', '.ipa', '.jar'
  ]);
  if (blocked.has(extension)) {
    const error = new Error(`La extensión ${extension} no está permitida.`);
    error.status = 415;
    throw error;
  }

  return {
    extension: extension.replace('.', '').slice(0, 20),
    mimeType: receivedMime || detectedMime || 'application/octet-stream'
  };
}

async function ensureContainer_gnral() {
  const { containerClient, config } = getClients_gnral();
  const exists = await containerClient.exists();
  if (!exists) {
    const error = new Error(`El contenedor privado ${config.containerName} no existe o no es accesible.`);
    error.status = 503;
    throw error;
  }
  return true;
}

async function uploadPrivate_gnral({ file, empresa, modulo, entidadTipo, entidadId, subruta, metadata = {} }) {
  const checked = validateFile_gnral(file);
  const { containerClient, config } = getClients_gnral();
  const blobName = buildBlobName_gnral({ empresa, modulo, entidadTipo, entidadId, subruta, originalName: file.originalname });
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);

  const blobMetadata = {};
  for (const [key, value] of Object.entries(metadata || {})) {
    if (value === undefined || value === null || value === '') continue;
    blobMetadata[cleanSegment_gnral(key, 'meta').replace(/-/g, '_')] = String(value).slice(0, 500);
  }

  await blockBlobClient.uploadData(file.buffer, {
    blobHTTPHeaders: {
      blobContentType: checked.mimeType,
      blobContentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(file.originalname || 'archivo')}`
    },
    metadata: blobMetadata,
    conditions: { ifNoneMatch: '*' }
  });

  return {
    storage_provider: PROVIDER,
    storage_container: config.containerName,
    storage_blob_name: blobName,
    storage_url: blockBlobClient.url,
    nombre_original: file.originalname,
    nombre_archivo: path.basename(blobName),
    extension: checked.extension,
    mime_type: checked.mimeType,
    tamano_bytes: Number(file.size)
  };
}

async function createReadSas_gnral(blobName, options = {}) {
  const { blobServiceClient, containerClient, credential, config } = getClients_gnral();
  const cleanBlobName = String(blobName || '').replace(/^\/+/, '');
  if (!cleanBlobName || cleanBlobName.includes('..')) {
    const error = new Error('Nombre de blob inválido.');
    error.status = 400;
    throw error;
  }

  const blobClient = containerClient.getBlobClient(cleanBlobName);
  if (!(await blobClient.exists())) {
    const error = new Error('El archivo no existe en Azure Storage.');
    error.status = 404;
    throw error;
  }

  const now = new Date();
  const startsOn = new Date(now.getTime() - 5 * 60 * 1000);
  const minutes = Math.min(Number(options.minutes || config.sasMinutes), config.sasMinutes);
  const expiresOn = new Date(now.getTime() + minutes * 60 * 1000);
  const { BlobSASPermissions, SASProtocol, generateBlobSASQueryParameters } = getAzureSdk_gnral();
  const delegationKey = await blobServiceClient.getUserDelegationKey(startsOn, expiresOn);
  const sas = generateBlobSASQueryParameters({
    containerName: config.containerName,
    blobName: cleanBlobName,
    permissions: BlobSASPermissions.parse('r'),
    protocol: SASProtocol.Https,
    startsOn,
    expiresOn,
    contentDisposition: options.download === true
      ? `attachment; filename*=UTF-8''${encodeURIComponent(options.fileName || path.basename(cleanBlobName))}`
      : undefined
  }, delegationKey, config.accountName).toString();

  return {
    url: `${blobClient.url}?${sas}`,
    expires_at: expiresOn.toISOString(),
    expires_in_minutes: minutes
  };
}

async function deleteBlob_gnral(blobName, options = {}) {
  const { containerClient } = getClients_gnral();
  const cleanBlobName = String(blobName || '').replace(/^\/+/, '');
  if (!cleanBlobName || cleanBlobName.includes('..')) {
    const error = new Error('Nombre de blob inválido.');
    error.status = 400;
    throw error;
  }
  const result = await containerClient.getBlockBlobClient(cleanBlobName).deleteIfExists({
    deleteSnapshots: options.deleteSnapshots || 'include'
  });
  return { deleted: Boolean(result.succeeded) };
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
    sas_minutes: config.sasMinutes,
    authentication: 'MANAGED_IDENTITY',
    container_access: 'PRIVATE'
  };
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
  getStatus_gnral
};

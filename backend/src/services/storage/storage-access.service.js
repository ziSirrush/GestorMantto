const azureStorage = require('./azure-storage.service');
const filePolicy = require('./storage-file-policy.service');
const referenceService = require('./storage-reference.service');
const logger = require('../../shared/logger');
const {
  STORAGE_CODES,
  createStorageError_gnral
} = require('./storage-errors.service');

function isEnabled_gnral(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function assertUser_gnral(user) {
  const id = Number(user && (user.id_SB || user.id || user.user_id));
  if (!Number.isInteger(id) || id <= 0) {
    throw createStorageError_gnral('Sesión requerida para acceder al archivo.', {
      status: 401,
      code: 'CFFAA_STORAGE_AUTH_REQUIRED'
    });
  }
  return id;
}

function normalizeAuthorizationResult_gnral(result) {
  if (result === true) return { allowed: true };
  if (result && typeof result === 'object' && result.allowed === true) return result;

  const status = Number(result && result.status) || 403;
  throw createStorageError_gnral(
    (result && result.message) || 'No tienes permiso para abrir este archivo.',
    {
      status,
      code: (result && result.code) || STORAGE_CODES.ACCESS_FORBIDDEN,
      details: result && result.details
    }
  );
}

function safeAuditContext_gnral(context = {}) {
  return {
    modulo: context.modulo || null,
    entidad_tipo: context.entidadTipo || context.entidad_tipo || null,
    entidad_id: context.entidadId ?? context.entidad_id ?? null,
    archivo_id: context.archivoId ?? context.archivo_id ?? null
  };
}

async function createReadAccess_gnral(options = {}) {
  const actorUser = options.actorUser || options.user;
  const contextUser = options.contextUser || options.user;
  const actorId = assertUser_gnral(actorUser);
  assertUser_gnral(contextUser);

  if (typeof options.authorize !== 'function') {
    throw createStorageError_gnral('El módulo debe proporcionar una función de autorización para emitir una SAS.', {
      status: 500,
      code: STORAGE_CODES.ACCESS_AUTHORIZER_REQUIRED,
      expose: false
    });
  }

  const reference = referenceService.normalizeAzureReference_gnral(options.reference, {
    allowInactive: options.allowInactive === true
  });

  const authorization = normalizeAuthorizationResult_gnral(await options.authorize({
    actorUser,
    contextUser,
    reference,
    context: options.context || {}
  }));

  const requestedDownload = options.download === true;
  const forceDownload = requestedDownload || !filePolicy.shouldInline_gnral(reference.mime_type);
  const verifyExists = options.verifyExists !== undefined
    ? options.verifyExists === true
    : isEnabled_gnral(process.env.CFFAA_STORAGE_ACCESS_VERIFY_EXISTS, false);
  const sasFactory = options.sasFactory || azureStorage.createReadSas_gnral;

  const sas = await sasFactory(reference.storage_blob_name, {
    containerName: reference.storage_container,
    fileName: reference.nombre_original,
    mimeType: reference.mime_type,
    download: forceDownload,
    verifyExists,
    minutes: options.minutes
  });

  if (isEnabled_gnral(process.env.CFFAA_STORAGE_ACCESS_AUDIT_LOG, true)) {
    logger.info('CFFAA-01E: acceso temporal de lectura emitido.', {
      actor_user_id: actorId,
      context_user_id: Number(contextUser.id_SB || contextUser.id || contextUser.user_id),
      ...safeAuditContext_gnral(options.context),
      storage_provider: reference.storage_provider,
      storage_container: reference.storage_container,
      storage_blob_name: reference.storage_blob_name,
      disposition: forceDownload ? 'attachment' : 'inline',
      expires_at: sas.expires_at
    });
  }

  return {
    storage_provider: reference.storage_provider,
    nombre_original: reference.nombre_original,
    mime_type: reference.mime_type,
    tamano_bytes: reference.tamano_bytes,
    disposition: forceDownload ? 'attachment' : 'inline',
    access_url: sas.url,
    expires_at: sas.expires_at,
    expires_in_minutes: sas.expires_in_minutes,
    authorization: authorization.metadata || null
  };
}

module.exports = {
  createReadAccess_gnral,
  normalizeAuthorizationResult_gnral,
  safeAuditContext_gnral
};

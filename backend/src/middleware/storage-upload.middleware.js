const multer = require('multer');
const filePolicy = require('../services/storage/storage-file-policy.service');
const { normalizeUploadError_gnral } = require('../services/storage/storage-errors.service');
const metrics = require('../services/storage/storage-metrics.service');


function recordRejection_gnral(req, error) {
  const normalized = normalizeUploadError_gnral(error);
  void metrics.recordEventSafe_gnral({
    tipo_evento: 'REJECTED',
    storage_provider: 'AZURE_BLOB',
    modulo: 'http-upload',
    entidad_tipo: 'request',
    usuario_id: req && req.user && (req.user.id_SB || req.user.id),
    codigo: normalized.code || 'CFFAA_UPLOAD_REJECTED',
    http_method: req && req.method,
    request_path: req && (req.originalUrl || req.path),
    detalle_json: { message: normalized.message }
  });
  return normalized;
}

function uploadedFiles_gnral(req) {
  if (req.file) return [req.file];
  if (Array.isArray(req.files)) return req.files;
  if (req.files && typeof req.files === 'object') {
    return Object.values(req.files).flat().filter(Boolean);
  }
  return [];
}

function createParser(options, multerInstance) {
  const mode = String(options.mode || 'single').toLowerCase();
  if (mode === 'array') return multerInstance.array(options.fieldName, options.maxFiles);
  if (mode === 'fields') return multerInstance.fields(options.fields || []);
  if (mode === 'any') return multerInstance.any();
  return multerInstance.single(options.fieldName);
}

function positiveInteger(value, fallback, maximum = 1000) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(maximum, Math.floor(parsed));
}

function positiveNumber(value, fallback, maximum = 2048) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(maximum, parsed);
}

function createUploadMiddleware_gnral(options = {}) {
  const fieldName = String(options.fieldName || 'archivo');
  const maxFiles = positiveInteger(options.maxFiles, 1, 100);
  const limits = filePolicy.getLimits_gnral(options);
  const fieldSizeMb = positiveNumber(options.fieldSizeMb || process.env.CFFAA_STORAGE_FIELD_SIZE_MB, 2, 100);
  const maxFields = positiveInteger(options.maxFields, 50, 500);
  const maxParts = positiveInteger(options.maxParts, maxFiles + maxFields, 600);

  const uploader = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: limits.maxFileBytes,
      files: maxFiles,
      fields: maxFields,
      fieldSize: Math.floor(fieldSizeMb * filePolicy.MB),
      parts: maxParts
    },
    fileFilter(_req, file, callback) {
      try {
        filePolicy.validateMetadata_gnral(file, { policyName: options.policyName });
        callback(null, true);
      } catch (error) {
        callback(error);
      }
    }
  });

  const parser = createParser({ ...options, fieldName, maxFiles }, uploader);

  return function cffaaUploadMiddleware(req, res, next) {
    parser(req, res, (parseError) => {
      if (parseError) return next(recordRejection_gnral(req, parseError));

      try {
        const files = uploadedFiles_gnral(req);
        if (options.required === true && files.length === 0) {
          const error = new Error('Selecciona al menos un archivo.');
          error.status = 400;
          error.code = 'CFFAA_FILE_REQUIRED';
          error.expose = true;
          throw error;
        }

        req.cffaaFileValidation = filePolicy.validateFiles_gnral(files, {
          policyName: options.policyName,
          maxFiles,
          maxFileMb: options.maxFileMb,
          maxRequestMb: options.maxRequestMb
        });
        req.cffaaFiles = files;
        return next();
      } catch (error) {
        return next(recordRejection_gnral(req, error));
      }
    });
  };
}

module.exports = {
  createUploadMiddleware_gnral,
  uploadedFiles_gnral
};

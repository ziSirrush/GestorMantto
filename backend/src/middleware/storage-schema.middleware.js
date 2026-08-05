const storageSchema = require('../services/storage/storage-schema.service');

function sendSchemaError(res, error) {
  return res.status(error.status || 503).json({
    ok: false,
    code: error.code || 'CFFAA_STORAGE_SCHEMA_ERROR',
    message: error.message,
    details: error.details || undefined
  });
}

function requireStorageSchema(...tableNames) {
  return async function storageSchemaGuard(req, res, next) {
    try {
      await storageSchema.assertStorageSchema_gnral(tableNames);
      return next();
    } catch (error) {
      return sendSchemaError(res, error);
    }
  };
}

function requestFiles(req) {
  if (req.file) return [req.file];
  if (Array.isArray(req.files)) return req.files.filter(Boolean);
  if (req.files && typeof req.files === 'object') {
    return Object.values(req.files).flat().filter(Boolean);
  }
  return [];
}

function requireStorageSchemaWhenFiles(...tableNames) {
  return async function conditionalFileStorageSchemaGuard(req, res, next) {
    if (!requestFiles(req).length) return next();

    try {
      await storageSchema.assertStorageSchema_gnral(tableNames);
      return next();
    } catch (error) {
      return sendSchemaError(res, error);
    }
  };
}

function requireStorageSchemaWhenBodyHas(fieldName, ...tableNames) {
  return async function conditionalStorageSchemaGuard(req, res, next) {
    const value = req.body && req.body[fieldName];
    if (!value) return next();

    try {
      await storageSchema.assertStorageSchema_gnral(tableNames);
      return next();
    } catch (error) {
      return sendSchemaError(res, error);
    }
  };
}

module.exports = {
  requireStorageSchema,
  requireStorageSchemaWhenFiles,
  requireStorageSchemaWhenBodyHas
};

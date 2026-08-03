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
  requireStorageSchemaWhenBodyHas
};

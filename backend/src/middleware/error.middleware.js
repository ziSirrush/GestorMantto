const logger = require('../shared/logger');
const { normalizeUploadError_gnral } = require('../services/storage/storage-errors.service');

function notFoundHandler(req, res) {
  return res.status(404).json({
    ok: false,
    message: 'Ruta no encontrada',
    method: req.method,
    path: req.originalUrl
  });
}

function errorHandler(sourceError, req, res, next) {
  if (res.headersSent) {
    return next(sourceError);
  }

  const error = normalizeUploadError_gnral(sourceError);
  const statusCode = Number(error.statusCode || error.status || 500);
  logger.error(`${req.method} ${req.originalUrl}`, error);

  const exposeMessage = statusCode < 500 || error.expose === true;
  const payload = {
    ok: false,
    message: exposeMessage ? error.message : 'Error interno del servidor'
  };

  if (error.code) payload.code = error.code;
  if (error.details && exposeMessage) payload.details = error.details;

  if (process.env.NODE_ENV !== 'production') {
    payload.error = error.message;
    if (error.queue_operation_id) payload.queue_operation_id = error.queue_operation_id;
    if (error.queue_error) payload.queue_error = error.queue_error;
  }

  return res.status(statusCode).json(payload);
}

module.exports = { notFoundHandler, errorHandler };

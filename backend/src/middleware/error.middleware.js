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

  const exposeMessage = statusCode >= 400 && statusCode < 500;
  // Los 5xx se devuelven siempre con mensaje público, salvo 503 de capacidad
  // que ya utiliza Retry-After. Detalles completos siguen en logs privados.
  const payload = {
    ok: false,
    message: exposeMessage ? error.message : 'Error interno del servidor'
  };

  // [Aster | 2026-10-29 | ASTER-MG | AST-11 SAFE ERRORS V001]
  // No exponer codigos SQL, stack ni excepciones de proveedor a clientes.
  if (statusCode < 500 && typeof error.code === 'string' && /^[A-Z][A-Z0-9_]{2,80}$/.test(error.code)) {
    payload.code = error.code;
  } else if (statusCode >= 500) {
    payload.code = 'INTERNAL_ERROR';
  }
  if (error.details && exposeMessage) payload.details = error.details;



  // Indica una pausa segura al cliente; no filtra host, credenciales ni SQL.
  if (statusCode === 503 && Number.isFinite(Number(error.retryAfterSeconds)) &&
      Number(error.retryAfterSeconds) > 0) {
    res.set('Retry-After', String(Math.ceil(Number(error.retryAfterSeconds))));
  }

  return res.status(statusCode).json(payload);
}

module.exports = { notFoundHandler, errorHandler };

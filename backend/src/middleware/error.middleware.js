const logger = require('../shared/logger');

function notFoundHandler(req, res) {
  return res.status(404).json({
    ok: false,
    message: 'Ruta no encontrada',
    method: req.method,
    path: req.originalUrl
  });
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  const statusCode = Number(error.statusCode || error.status || 500);
  logger.error(`${req.method} ${req.originalUrl}`, error);

  const payload = {
    ok: false,
    message: statusCode >= 500 ? 'Error interno del servidor' : error.message
  };

  if (process.env.NODE_ENV !== 'production') {
    payload.error = error.message;
  }

  return res.status(statusCode).json(payload);
}

module.exports = { notFoundHandler, errorHandler };

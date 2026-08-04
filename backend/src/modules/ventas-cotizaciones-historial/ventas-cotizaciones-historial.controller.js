const service = require('./ventas-cotizaciones-historial.service');

function actionContext(req) {
  return {
    user: req.user,
    contextUser: req.contextUser || req.user,
    ip: req.ip || req.socket?.remoteAddress || null,
    userAgent: req.get('user-agent') || null
  };
}

function sendError(error, res, next) {
  if (error.statusCode) {
    return res.status(error.statusCode).json({ ok: false, message: error.message, detalles: error.detalles || undefined });
  }
  return next(error);
}

async function listByCotizacion(req, res, next) {
  try {
    return res.status(200).json(await service.listByCotizacion(req.params.id, req.query || {}, actionContext(req)));
  } catch (error) {
    return sendError(error, res, next);
  }
}

async function listGlobal(req, res, next) {
  try {
    return res.status(200).json(await service.listGlobal(req.query || {}, actionContext(req)));
  } catch (error) {
    return sendError(error, res, next);
  }
}

module.exports = { listByCotizacion, listGlobal };

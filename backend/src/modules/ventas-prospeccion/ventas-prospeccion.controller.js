const service = require('./ventas-prospeccion.service');

function sendKnownError(error, res, next) {
  if (error.statusCode) {
    return res.status(error.statusCode).json({
      ok: false,
      message: error.message,
      detalles: error.detalles || undefined
    });
  }
  return next(error);
}

async function syncProspections(req, res, next) {
  try {
    return res.status(200).json(await service.syncProspections(req.body || {}));
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

async function syncComments(req, res, next) {
  try {
    return res.status(200).json(await service.syncComments(req.body || {}));
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

module.exports = {
  syncProspections,
  syncComments
};

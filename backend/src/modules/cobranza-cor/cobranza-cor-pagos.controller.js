'use strict';

const service = require('./cobranza-cor-pagos.service');

function sendKnownError(error, res, next) {
  const status = Number(error.statusCode || error.status);
  if (status) {
    return res.status(status).json({
      ok: false,
      code: error.code || undefined,
      message: error.message,
      detalles: error.detalles || error.details || undefined
    });
  }
  return next(error);
}

async function cargarPagos_cor(req, res, next) {
  try {
    return res.status(200).json(await service.cargarPagos_cor(req.body || {}));
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

module.exports = {
  cargarPagos_cor
};

'use strict';

const service = require('./cobranza-cor.service');

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

async function cargarIndice_cor(req, res, next) {
  try {
    return res.status(200).json(await service.cargarIndice_cor(req.body || {}));
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

async function cargarFuente_cor(req, res, next) {
  try {
    return res.status(200).json(await service.cargarFuente_cor(req.body || {}));
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

async function cargarAditivas_cor(req, res, next) {
  try {
    return res.status(200).json(await service.cargarAditivas_cor(req.body || {}));
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

async function listarEstadosCuenta_cor(req, res, next) {
  try {
    return res.status(200).json(
      await service.listarEstadosCuenta_cor(req.query || {}, req.informationAccess)
    );
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

async function detalleEstadoCuenta_cor(req, res, next) {
  try {
    return res.status(200).json(
      await service.detalleEstadoCuenta_cor(req.params.idIndiceCor, req.informationAccess)
    );
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

async function aditivas_cor(req, res, next) {
  try {
    return res.status(200).json(
      await service.listarAditivas_cor(req.query || {}, req.informationAccess)
    );
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

async function detalleAditiva_cor(req, res, next) {
  try {
    return res.status(200).json(
      await service.detalleAditiva_cor(req.params.idAditivaCor, req.informationAccess)
    );
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

async function adeudosContractuales_cor(_req, res, next) {
  try {
    return res.json({
      ok: true,
      source: 'aiven',
      ...service.getAdeudosContractuales_cor()
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  cargarIndice_cor,
  cargarFuente_cor,
  cargarAditivas_cor,
  listarEstadosCuenta_cor,
  detalleEstadoCuenta_cor,
  aditivas_cor,
  detalleAditiva_cor,
  adeudosContractuales_cor
};

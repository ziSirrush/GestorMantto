'use strict';

const service = require('./cobranza-cor-pagos-modulo.service');

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

async function listarPagos_cor(req, res, next) {
  try {
    return res.status(200).json(
      await service.listarPagos_cor(req.query || {}, req.informationAccess)
    );
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

async function detallePago_cor(req, res, next) {
  try {
    return res.status(200).json(
      await service.detallePago_cor(req.params?.idPagoCor, req.informationAccess)
    );
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

async function listarProyectos_cor(req, res, next) {
  try {
    return res.status(200).json(
      await service.listarProyectos_cor(req.query || {}, req.informationAccess)
    );
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

async function asignarProyecto_cor(req, res, next) {
  try {
    return res.status(200).json(
      await service.asignarProyecto_cor(req.params?.idPagoCor, req.body || {}, req.informationAccess)
    );
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

async function quitarProyecto_cor(req, res, next) {
  try {
    return res.status(200).json(
      await service.quitarProyecto_cor(req.params?.idPagoCor, req.informationAccess)
    );
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

module.exports = {
  listarPagos_cor,
  detallePago_cor,
  listarProyectos_cor,
  asignarProyecto_cor,
  quitarProyecto_cor
};

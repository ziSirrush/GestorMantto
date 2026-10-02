'use strict';

// [Aster | 2026-10-02 | ASTER-MG | COBRANZA COR FASE 6 EDITAR ELIMINAR V001]

const service = require('./cobranza-cor-registros.service');

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

async function actualizarFactura_cor(req, res, next) {
  try {
    return res.status(200).json(await service.actualizarFactura_cor(
      req.params.ppns,
      req.params.idFacturaCor,
      req.body || {},
      req.informationAccess,
      req.actorUser && req.actorUser.id_SB
    ));
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

async function eliminarFactura_cor(req, res, next) {
  try {
    return res.status(200).json(await service.eliminarFactura_cor(
      req.params.ppns,
      req.params.idFacturaCor,
      req.informationAccess
    ));
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

async function actualizarPago_cor(req, res, next) {
  try {
    return res.status(200).json(await service.actualizarPago_cor(
      req.params.ppns,
      req.params.idPagoCor,
      req.body || {},
      req.informationAccess
    ));
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

async function eliminarPago_cor(req, res, next) {
  try {
    return res.status(200).json(await service.eliminarPago_cor(
      req.params.ppns,
      req.params.idPagoCor,
      req.informationAccess
    ));
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

module.exports = {
  actualizarFactura_cor,
  eliminarFactura_cor,
  actualizarPago_cor,
  eliminarPago_cor
};

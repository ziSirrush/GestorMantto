'use strict';

const service = require('./instalaciones-ajuste.service');

function sendKnownError_cor(error, res, next) {
  if (error && error.statusCode) {
    return res.status(error.statusCode).json({
      ok: false,
      code: error.code || 'INSTALACIONES_AJUSTE_ERROR',
      message: error.message,
      details: error.details || undefined
    });
  }
  return next(error);
}

async function bootstrap_cor(req, res, next) {
  try {
    const userId = Number(req.user && req.user.id_SB);
    const result = await service.getBootstrap_cor(userId);
    return res.json({ ok: true, source: 'aiven', ...result });
  } catch (error) {
    return sendKnownError_cor(error, res, next);
  }
}

async function behavior_cor(req, res, next) {
  try {
    const result = await service.getBehavior_cor(req.query || {});
    return res.json({ ok: true, source: 'aiven', ...result });
  } catch (error) {
    return sendKnownError_cor(error, res, next);
  }
}

async function detail_cor(req, res, next) {
  try {
    const result = await service.getDetail_cor(req.query || {});
    return res.json({ ok: true, source: 'aiven', ...result });
  } catch (error) {
    return sendKnownError_cor(error, res, next);
  }
}

module.exports = {
  bootstrap_cor,
  behavior_cor,
  detail_cor
};

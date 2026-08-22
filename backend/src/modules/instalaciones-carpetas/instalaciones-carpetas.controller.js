'use strict';

const service = require('./instalaciones-carpetas.service');

function sendKnownError_cor(error, res, next) {
  if (error && error.statusCode) {
    return res.status(error.statusCode).json({
      ok: false,
      code: error.code || 'INSTALACIONES_CARPETAS_ERROR',
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

async function createRelation_cor(req, res, next) {
  try {
    const userId = Number(req.user && req.user.id_SB);
    const result = await service.createRelation_cor(req, userId, req.body || {});
    return res.status(result.changed ? 201 : 200).json({
      ok: true,
      source: 'aiven',
      ...result
    });
  } catch (error) {
    return sendKnownError_cor(error, res, next);
  }
}

module.exports = {
  bootstrap_cor,
  createRelation_cor
};

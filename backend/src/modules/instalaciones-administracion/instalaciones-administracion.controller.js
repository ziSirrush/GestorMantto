'use strict';

const service = require('./instalaciones-administracion.service');

function sendKnownError_cor(error, res, next) {
  if (error && error.statusCode) {
    return res.status(error.statusCode).json({
      ok: false,
      code: error.code || 'INSTALACIONES_ADMINISTRACION_ERROR',
      message: error.message,
      details: error.details || undefined
    });
  }
  return next(error);
}

async function contract_cor(req, res, next) {
  try {
    const result = await service.getContract_cor(req);
    return res.json({ ok: true, source: 'backend', ...result });
  } catch (error) {
    return sendKnownError_cor(error, res, next);
  }
}

async function search_cor(req, res, next) {
  try {
    const result = await service.searchRecords_cor(req, req.query || {});
    return res.json({ ok: true, source: 'aiven', ...result });
  } catch (error) {
    return sendKnownError_cor(error, res, next);
  }
}

async function detail_cor(req, res, next) {
  try {
    const result = await service.getRecord_cor(req, req.params.id);
    return res.json({ ok: true, source: 'aiven', ...result });
  } catch (error) {
    return sendKnownError_cor(error, res, next);
  }
}

async function updateGroup_cor(req, res, next) {
  try {
    const result = await service.updateGroup_cor(
      req,
      req.params.id,
      String(req.params.grupo || '').trim(),
      req.body || {}
    );
    return res.json({ ok: true, source: 'aiven', ...result });
  } catch (error) {
    return sendKnownError_cor(error, res, next);
  }
}

module.exports = {
  contract_cor,
  search_cor,
  detail_cor,
  updateGroup_cor
};

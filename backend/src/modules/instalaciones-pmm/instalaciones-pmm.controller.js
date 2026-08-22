'use strict';

const service = require('./instalaciones-pmm.service');

function sendKnownError(res, error) {
  return res.status(error.statusCode).json({
    ok: false,
    code: error.code || 'INSTALACIONES_PMM_ERROR',
    message: error.message,
    details: error.details || undefined
  });
}

async function list03Pm(req, res, next) {
  try {
    const result = await service.getTable03Pm(req.query || {}, req.informationAccess);
    return res.json({ ok: true, source: 'aiven', ...result });
  } catch (error) {
    if (error && error.statusCode) return sendKnownError(res, error);
    return next(error);
  }
}

async function list04M(req, res, next) {
  try {
    const result = await service.getTable04M(req.query || {}, req.informationAccess);
    return res.json({ ok: true, source: 'aiven', ...result });
  } catch (error) {
    if (error && error.statusCode) return sendKnownError(res, error);
    return next(error);
  }
}

module.exports = {
  list03Pm,
  list04M
};

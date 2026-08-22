'use strict';

const service = require('./instalaciones-reporte.service');

async function list(req, res, next) {
  try {
    const result = await service.getReport(req.query || {}, req.informationAccess);
    return res.json({
      ok: true,
      source: 'aiven',
      ...result
    });
  } catch (error) {
    if (error && error.statusCode) {
      return res.status(error.statusCode).json({
        ok: false,
        code: error.code || 'INSTALACIONES_REPORTE_ERROR',
        message: error.message,
        details: error.details || undefined
      });
    }
    return next(error);
  }
}

module.exports = {
  list
};

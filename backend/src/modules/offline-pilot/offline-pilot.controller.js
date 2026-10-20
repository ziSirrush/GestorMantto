'use strict';

const service = require('./offline-pilot.service');

function getCapabilities(req, res, next) {
  try {
    return res.status(200).json({
      ok: true,
      source: 'aiven',
      generated_at: new Date().toISOString(),
      data: service.buildCapabilities(req)
    });
  } catch (error) {
    if (typeof next === 'function') return next(error);
    return res.status(error?.status || 500).json({
      ok: false,
      code: error?.code || 'OFFLINE_CAPABILITIES_ERROR',
      message: error?.message || 'No fue posible validar el piloto offline.'
    });
  }
}

module.exports = { getCapabilities };

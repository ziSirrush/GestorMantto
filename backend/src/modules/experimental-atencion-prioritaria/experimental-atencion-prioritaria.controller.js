'use strict';

const service = require('./experimental-atencion-prioritaria.service');

async function getAtencionPrioritaria_exp(req, res, next) {
  try {
    const payload = await service.getAtencionPrioritaria_exp(req);
    return res.json(payload);
  } catch (error) {
    if (typeof next === 'function') return next(error);
    return res.status(500).json({
      ok: false,
      message: 'No fue posible consultar Atención Prioritaria.',
      error: error.message
    });
  }
}

module.exports = {
  getAtencionPrioritaria_exp
};

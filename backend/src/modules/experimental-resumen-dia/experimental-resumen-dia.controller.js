'use strict';

const service = require('./experimental-resumen-dia.service');

async function getResumenDia_exp(req, res, next) {
  try {
    const payload = await service.getResumenDia_exp(req);
    return res.json(payload);
  } catch (error) {
    if (typeof next === 'function') return next(error);
    return res.status(500).json({
      ok: false,
      message: 'No fue posible consultar el Resumen del Día Experimental.',
      error: error.message
    });
  }
}

module.exports = {
  getResumenDia_exp
};

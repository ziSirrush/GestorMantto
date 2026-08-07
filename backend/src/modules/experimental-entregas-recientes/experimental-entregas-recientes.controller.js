'use strict';

const service = require('./experimental-entregas-recientes.service');

async function getEntregasRecientes_uni(req, res, next) {
  try {
    const payload = await service.getEntregasRecientes_uni(req);
    return res.json(payload);
  } catch (error) {
    if (typeof next === 'function') return next(error);
    return res.status(500).json({
      ok: false,
      message: 'No fue posible consultar Entregas Recientes Experimental.',
      error: error.message
    });
  }
}

module.exports = { getEntregasRecientes_uni };

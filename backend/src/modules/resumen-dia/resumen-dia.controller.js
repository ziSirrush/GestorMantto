'use strict';

const service = require('./resumen-dia.service');

async function getInitialData(req, res, next) {
  try {
    const payload = await service.getInitialData(req);
    return res.json(payload);
  } catch (error) {
    if (typeof next === 'function') return next(error);
    return res.status(500).json({
      ok: false,
      message: 'Error cargando Resumen del Dia.',
      error: error.message
    });
  }
}

module.exports = {
  getInitialData
};

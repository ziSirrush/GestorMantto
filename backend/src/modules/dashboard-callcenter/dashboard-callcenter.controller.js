'use strict';

const service = require('./dashboard-callcenter.service');

async function getInitialData(req, res, next) {
  try {
    return res.json(await service.getInitialData(req));
  } catch (error) {
    if (typeof next === 'function') return next(error);
    return res.status(500).json({
      ok: false,
      message: 'Error cargando Dashboard Call Center.',
      error: error.message
    });
  }
}

module.exports = {
  getInitialData
};

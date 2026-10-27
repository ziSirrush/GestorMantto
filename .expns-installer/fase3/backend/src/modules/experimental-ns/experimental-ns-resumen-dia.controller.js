'use strict';

const service = require('./experimental-ns-resumen-dia.service');

async function getInitialData(req, res, next) {
  try {
    return res.json(await service.getInitialData(req));
  } catch (error) {
    return next(error);
  }
}

module.exports = { getInitialData };

'use strict';

const service = require('./cobranza-cor.service');

async function aditivas_cor(_req, res, next) {
  try {
    return res.json({
      ok: true,
      source: 'pending',
      ...service.getAditivas_cor()
    });
  } catch (error) {
    return next(error);
  }
}

async function adeudosContractuales_cor(_req, res, next) {
  try {
    return res.json({
      ok: true,
      source: 'pending',
      ...service.getAdeudosContractuales_cor()
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  aditivas_cor,
  adeudosContractuales_cor
};

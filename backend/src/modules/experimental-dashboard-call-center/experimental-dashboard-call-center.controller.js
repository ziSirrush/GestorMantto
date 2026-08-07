'use strict';

const service = require('./experimental-dashboard-call-center.service');

async function getDashboard_uni(req, res, next) {
  try {
    return res.json(await service.getDashboard_uni(req));
  } catch (error) {
    return next(error);
  }
}

module.exports = { getDashboard_uni };

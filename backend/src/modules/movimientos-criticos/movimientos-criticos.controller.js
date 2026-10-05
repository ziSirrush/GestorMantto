'use strict';

const service = require('./movimientos-criticos.service');
const {
  latestDueSunday,
  runWeeklyClose
} = require('../../jobs/movimientosCriticosCierreSemanal.job');

async function listCuts(req, res, next) {
  return service.listCuts(req, res, next);
}

async function getMovements(req, res, next) {
  return service.getMovements(req, res, next);
}

async function getSnapshot(req, res, next) {
  return service.getCurrentSnapshot(req, res, next);
}

async function runManualCut(req, res, next) {
  try {
    const due = latestDueSunday(new Date());
    const userId = Number(req.user?.id_SB || req.user?.id) || null;
    const result = await runWeeklyClose(new Date(), userId, due);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listCuts,
  getMovements,
  getSnapshot,
  runManualCut
};

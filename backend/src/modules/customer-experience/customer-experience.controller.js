'use strict';

// [Aster | 2026-10-07 | ASTER-MG | FASE 2 CUSTOMER EXPERIENCE ENCUESTAS V001]
// [Aster | 2026-10-08 | ASTER-MG | FIX CX MANTENIMIENTO SYNC V001]
// [Aster | 2026-10-09 | ASTER-MG | FIX CX VI BACKEND SYNC V001]

const service = require('./customer-experience.service');
const syncService = require('./customer-experience-sync.service');
const viSyncService = require('./customer-experience-vi-sync.service');

function ok_cor(res, data, spread = false) {
  return res.json(spread ? {
    ok: true,
    source: 'aiven',
    generated_at: new Date().toISOString(),
    ...data
  } : {
    ok: true,
    source: 'aiven',
    generated_at: new Date().toISOString(),
    data
  });
}

async function options_cor(req, res, next) {
  try { return ok_cor(res, await service.options_cor()); }
  catch (error) { return next(error); }
}

async function dashboard_cor(req, res, next) {
  try { return ok_cor(res, await service.dashboard_cor(req.query || {}), true); }
  catch (error) { return next(error); }
}

async function listVentaInstalacion_cor(req, res, next) {
  try { return ok_cor(res, await service.listVentaInstalacion_cor(req.query || {}), true); }
  catch (error) { return next(error); }
}

async function listMantenimiento_cor(req, res, next) {
  try { return ok_cor(res, await service.listMantenimiento_cor(req.query || {}), true); }
  catch (error) { return next(error); }
}

async function closedQuestionsAnalysis_cor(req, res, next) {
  try { return ok_cor(res, await service.closedQuestionsAnalysis_cor(req.query || {}), true); }
  catch (error) { return next(error); }
}

async function closedQuestionDetail_cor(req, res, next) {
  try { return ok_cor(res, await service.closedQuestionDetail_cor(req.query || {}), true); }
  catch (error) { return next(error); }
}

async function themesAnalysis_cor(req, res, next) {
  try { return ok_cor(res, await service.themesAnalysis_cor(req.query || {}), true); }
  catch (error) { return next(error); }
}

async function themeDetail_cor(req, res, next) {
  try { return ok_cor(res, await service.themeDetail_cor(req.query || {}), true); }
  catch (error) { return next(error); }
}

async function syncMantenimiento_cor(req, res, next) {
  try {
    return res.json(await syncService.syncMantenimiento_cor(req.body || {}));
  } catch (error) {
    return next(error);
  }
}

async function validarVentaInstalacionSync_cor(req, res, next) {
  try { return res.json(viSyncService.validarVentaInstalacion_cor(req.body || {})); }
  catch (error) { return next(error); }
}

async function syncVentaInstalacion_cor(req, res, next) {
  try { return res.json(await viSyncService.syncVentaInstalacion_cor(req.body || {})); }
  catch (error) { return next(error); }
}

module.exports = Object.freeze({
  options_cor,
  dashboard_cor,
  listVentaInstalacion_cor,
  listMantenimiento_cor,
  closedQuestionsAnalysis_cor,
  closedQuestionDetail_cor,
  themesAnalysis_cor,
  themeDetail_cor,
  syncMantenimiento_cor,
  validarVentaInstalacionSync_cor,
  syncVentaInstalacion_cor
});

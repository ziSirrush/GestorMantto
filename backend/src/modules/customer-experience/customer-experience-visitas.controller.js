'use strict';

// [ChatGPT | 2026-10-15 | BLT NOW | CX VISITAS FASE 2 V001]
const service = require('./customer-experience-visitas.service');

function success_cor(res, data, status = 200) {
  return res.status(status).json({ ok: true, source: 'aiven', ...data });
}

async function list_cor(req, res, next) {
  try { return success_cor(res, await service.list_cor(req, req.query || {})); }
  catch (error) { return next(error); }
}

async function get_cor(req, res, next) {
  try { return success_cor(res, await service.get_cor(req, req.params.id)); }
  catch (error) { return next(error); }
}

async function history_cor(req, res, next) {
  try { return success_cor(res, await service.history_cor(req, req.params.id, req.query || {})); }
  catch (error) { return next(error); }
}

async function create_cor(req, res, next) {
  try { return success_cor(res, await service.create_cor(req, req.body), 201); }
  catch (error) { return next(error); }
}

async function edit_cor(req, res, next) {
  try { return success_cor(res, await service.edit_cor(req, req.params.id, req.body)); }
  catch (error) { return next(error); }
}

async function deactivate_cor(req, res, next) {
  try { return success_cor(res, await service.deactivate_cor(req, req.params.id)); }
  catch (error) { return next(error); }
}

module.exports = Object.freeze({ list_cor, get_cor, history_cor, create_cor, edit_cor, deactivate_cor });

'use strict';

const service = require('./almacen.service');

function effectiveUserId(req) {
  const user = req.contextUser || req.user || {};
  const id = Number(user.id_SB || user.id);
  if (!Number.isInteger(id) || id <= 0) {
    const error = new Error('Sesión sin usuario válido.');
    error.status = 401;
    throw error;
  }
  return id;
}

async function capabilities(req, res, next) {
  try {
    const userId = effectiveUserId(req);
    const [canImport, source] = await Promise.all([service.canImport(userId), service.activeSource()]);
    res.json({ ok:true, canImport, source });
  } catch (error) { next(error); }
}

async function validateImport(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ ok:false, message:'Selecciona un archivo .xlsx o .csv.' });
    res.json(await service.validateImport(req.file, req.body?.fechaCorte));
  } catch (error) {
    if (error.details) return res.status(Number(error.status || 422)).json({ ok:false, message:error.message, details:error.details });
    next(error);
  }
}

async function importSpreadsheet(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ ok:false, message:'Selecciona un archivo .xlsx o .csv.' });
    res.status(201).json(await service.importSpreadsheet(req.file, req.body?.fechaCorte, effectiveUserId(req)));
  } catch (error) {
    if (error.details) return res.status(Number(error.status || 422)).json({ ok:false, message:error.message, details:error.details });
    next(error);
  }
}

async function dashboard(_req,res,next){try{res.json(await service.getDashboard());}catch(error){next(error);}}
async function inventory(req,res,next){try{res.json(await service.getInventory(req.query||{}));}catch(error){next(error);}}
async function catalogs(_req,res,next){try{res.json(await service.getCatalogs());}catch(error){next(error);}}
async function company(req,res,next){try{res.json(await service.getCompany(req.query||{}));}catch(error){next(error);}}
async function warehouses(req,res,next){try{res.json(await service.getWarehouses(req.query||{}));}catch(error){next(error);}}
async function top(req,res,next){try{res.json(await service.getTop(req.query||{}));}catch(error){next(error);}}
async function stock(req,res,next){try{res.json(await service.getStock(req.query||{}));}catch(error){next(error);}}
async function loanCatalogs(_req,res,next){try{res.json(await service.getLoanCatalogs());}catch(error){next(error);}}
async function loanSummary(req,res,next){try{res.json(await service.getLoanSummary(req.query||{}));}catch(error){next(error);}}
async function loans(req,res,next){try{res.json(await service.getLoans(req.query||{}));}catch(error){next(error);}}
async function guardCatalogs(_req,res,next){try{res.json(await service.getGuardCatalogs());}catch(error){next(error);}}
async function guards(req,res,next){try{res.json(await service.getGuards(req.query||{}));}catch(error){next(error);}}
async function auditCatalogs(_req,res,next){try{res.json(await service.getAuditCatalogs());}catch(error){next(error);}}
async function auditSample(req,res,next){try{res.json(await service.getAuditSample(req.query||{}));}catch(error){next(error);}}

module.exports = {
  capabilities,
  validateImport,
  importSpreadsheet,
  dashboard,
  inventory,
  catalogs,
  company,
  warehouses,
  top,
  stock,
  loanCatalogs,
  loanSummary,
  loans,
  guardCatalogs,
  guards,
  auditCatalogs,
  auditSample
};

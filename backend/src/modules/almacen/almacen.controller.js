'use strict';

const service = require('./almacen.service');
const archiveService = require('./almacen.archive-service');

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
    if (error.details) return res.status(Number(error.status || 422)).json({ ok:false, message:error.message, code:error.code, details:error.details });
    next(error);
  }
}

async function importSpreadsheet(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ ok:false, message:'Selecciona un archivo .xlsx o .csv.' });
    res.status(201).json(await archiveService.importAndActivate(req.file, req.body?.fechaCorte, effectiveUserId(req)));
  } catch (error) {
    if (error.status) return res.status(Number(error.status)).json({ ok:false, message:error.message, code:error.code, details:error.details || undefined });
    next(error);
  }
}

async function archiveActive(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ ok:false, message:'Selecciona el Excel exacto que originó el cierre activo.' });
    res.json(await archiveService.archiveActive(req.file, effectiveUserId(req)));
  } catch (error) {
    if (error.status) return res.status(Number(error.status)).json({ ok:false, message:error.message, code:error.code, details:error.details || undefined });
    next(error);
  }
}

async function archiveSpreadsheet(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ ok:false, message:'Selecciona un archivo .xlsx o .csv.' });
    res.status(201).json(await archiveService.archiveSpreadsheet(req.file, req.body?.fechaCorte, effectiveUserId(req)));
  } catch (error) {
    if (error.status) return res.status(Number(error.status)).json({ ok:false, message:error.message, code:error.code, details:error.details || undefined });
    next(error);
  }
}

async function activateSource(req, res, next) {
  try {
    res.json(await archiveService.activateArchived(req.params.lote, effectiveUserId(req)));
  } catch (error) {
    if (error.status) return res.status(Number(error.status)).json({ ok:false, message:error.message, code:error.code, details:error.details || undefined });
    next(error);
  }
}

async function sources(req,res,next){try{res.json(await service.listSources(req.query||{}));}catch(error){next(error);}}

function knownError(error,res,next){
  if(error&&error.status){
    return res.status(Number(error.status)).json({ok:false,message:error.message,code:error.code,details:error.details||undefined});
  }
  return next(error);
}

async function listAudits(req,res,next){try{res.json(await service.listAudits(req.query||{}));}catch(error){knownError(error,res,next);}}
async function getAudit(req,res,next){try{res.json(await service.getAudit(req.params.folio));}catch(error){knownError(error,res,next);}}
async function createAudit(req,res,next){try{res.status(201).json(await service.createAudit(req.body||{},effectiveUserId(req)));}catch(error){knownError(error,res,next);}}
async function updateAuditItem(req,res,next){try{res.json(await service.updateAuditItem(req.params.folio,req.params.id,req.body||{},effectiveUserId(req)));}catch(error){knownError(error,res,next);}}
async function closeAudit(req,res,next){try{res.json(await service.closeAudit(req.params.folio,effectiveUserId(req)));}catch(error){knownError(error,res,next);}}

async function dashboard(req,res,next){try{res.json(await service.getDashboard(req.query||{}));}catch(error){next(error);}}

async function inventory(req,res,next){try{res.json(await service.getInventory(req.query||{}));}catch(error){next(error);}}
async function catalogs(req,res,next){try{res.json(await service.getCatalogs(req.query||{}));}catch(error){next(error);}}

async function company(req,res,next){try{res.json(await service.getCompany(req.query||{}));}catch(error){next(error);}}
async function warehouses(req,res,next){try{res.json(await service.getWarehouses(req.query||{}));}catch(error){next(error);}}
async function top(req,res,next){try{res.json(await service.getTop(req.query||{}));}catch(error){next(error);}}
async function stock(req,res,next){try{res.json(await service.getStock(req.query||{}));}catch(error){next(error);}}
async function loanCatalogs(req,res,next){try{res.json(await service.getLoanCatalogs(req.query||{}));}catch(error){next(error);}}

async function loanSummary(req,res,next){try{res.json(await service.getLoanSummary(req.query||{}));}catch(error){next(error);}}
async function loans(req,res,next){try{res.json(await service.getLoans(req.query||{}));}catch(error){next(error);}}
async function guardCatalogs(req,res,next){try{res.json(await service.getGuardCatalogs(req.query||{}));}catch(error){next(error);}}

async function guards(req,res,next){try{res.json(await service.getGuards(req.query||{}));}catch(error){next(error);}}
async function auditCatalogs(req,res,next){try{res.json(await service.getAuditCatalogs(req.query||{}));}catch(error){next(error);}}

async function auditSample(req,res,next){try{res.json(await service.getAuditSample(req.query||{}));}catch(error){next(error);}}

module.exports = {
  capabilities,
  validateImport,
  importSpreadsheet,
  archiveActive,
  archiveSpreadsheet,
  activateSource,
  sources,
  closeAudit,
  updateAuditItem,
  createAudit,
  getAudit,
  listAudits,
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

const service = require('./ventas-prospeccion.service');

function sendKnownError(error, res, next) {
  if (error.statusCode) {
    return res.status(error.statusCode).json({
      ok: false,
      message: error.message,
      detalles: error.detalles || undefined
    });
  }
  return next(error);
}


function buildActionContext(req) {
  return {
    user: req.user,
    contextUser: req.contextUser || req.user,
    ip: req.ip || req.socket?.remoteAddress || null,
    userAgent: req.get('user-agent') || null
  };
}

async function listProspections(req, res, next) {
  try { return res.status(200).json(await service.listProspections(req.query || {}, buildActionContext(req))); }
  catch (error) { return sendKnownError(error, res, next); }
}
async function getKpis(req, res, next) {
  try { return res.status(200).json(await service.getKpis(req.query || {}, buildActionContext(req))); }
  catch (error) { return sendKnownError(error, res, next); }
}
async function getCatalogs(req, res, next) {
  try { return res.status(200).json(await service.getCatalogs(buildActionContext(req))); }
  catch (error) { return sendKnownError(error, res, next); }
}
async function getMap(req, res, next) {
  try { return res.status(200).json(await service.getMap(req.query || {}, buildActionContext(req))); }
  catch (error) { return sendKnownError(error, res, next); }
}
async function getProspection(req, res, next) {
  try { return res.status(200).json(await service.getProspection(req.params.id, buildActionContext(req))); }
  catch (error) { return sendKnownError(error, res, next); }
}

async function syncProspections(req, res, next) {
  try {
    return res.status(200).json(await service.syncProspections(req.body || {}));
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

async function syncComments(req, res, next) {
  try {
    return res.status(200).json(await service.syncComments(req.body || {}));
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

async function searchSources(req,res,next){try{return res.status(200).json(await service.searchSources(req.query||{},buildActionContext(req)));}catch(error){return sendKnownError(error,res,next);}}
async function getCaptureCatalogs(req,res,next){try{return res.status(200).json(await service.getCaptureCatalogs(buildActionContext(req)));}catch(error){return sendKnownError(error,res,next);}}
async function getClientContacts(req,res,next){try{return res.status(200).json(await service.getClientContacts(req.query||{},buildActionContext(req)));}catch(error){return sendKnownError(error,res,next);}}
async function createVisit(req,res,next){try{return res.status(201).json(await service.createVisit(req.body||{},req.files||[],buildActionContext(req)));}catch(error){return sendKnownError(error,res,next);}}

async function getDetailCatalogs(req,res,next){try{return res.status(200).json(await service.getDetailCatalogs(buildActionContext(req)));}catch(error){return sendKnownError(error,res,next);}}
async function updateProspectionStatus(req,res,next){try{return res.status(200).json(await service.updateProspectionStatus(req.params.id,req.body||{},buildActionContext(req)));}catch(error){return sendKnownError(error,res,next);}}
async function createComment(req,res,next){try{return res.status(201).json(await service.createComment(req.params.id,req.body||{},req.files||[],buildActionContext(req)));}catch(error){return sendKnownError(error,res,next);}}

module.exports = {
  syncProspections,
  syncComments,
  listProspections,
  getKpis,
  getCatalogs,
  getMap,
  getProspection,
  searchSources,
  getCaptureCatalogs,
  getClientContacts,
  createVisit,
  getDetailCatalogs,
  updateProspectionStatus,
  createComment
};

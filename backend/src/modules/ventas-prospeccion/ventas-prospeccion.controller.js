const service = require('./ventas-prospeccion.service');
const commentNotifications = require('../../services/notifications/comment-notification.service');

function sendKnownError(error, res, next) {
  const statusCode = Number(error.statusCode || error.status || 0);
  if (statusCode) {
    return res.status(statusCode).json({
      ok: false,
      code: error.code || undefined,
      message: error.message,
      detalles: error.detalles || error.details || undefined
    });
  }
  return next(error);
}

function buildActionContext(req) {
  return {
    user: req.user,
    contextUser: req.contextUser || req.user,
    informationAccess: req.informationAccess || null,
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

async function getFileAccess(req,res,next){try{return res.status(200).json(await service.getFileAccess(req.params.id,req.params.idArchivo,req.query||{},buildActionContext(req)));}catch(error){return sendKnownError(error,res,next);}}
async function deleteFile(req,res,next){try{return res.status(200).json(await service.deleteFile(req.params.id,req.params.idArchivo,buildActionContext(req)));}catch(error){return sendKnownError(error,res,next);}}

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
async function createComment(req,res,next){
  try{
    const actionContext = buildActionContext(req);
    const result = await service.createComment(req.params.id,req.body||{},req.files||[],actionContext);
    const notificationResult = await commentNotifications.notifyProspeccionComment_gnral(req.params.id, actionContext);
    return res.status(201).json({ ...result, notificaciones: Number(notificationResult?.created || 0) });
  }catch(error){return sendKnownError(error,res,next);}
}

module.exports = {
  syncProspections,
  syncComments,
  listProspections,
  getKpis,
  getCatalogs,
  getMap,
  getProspection,
  getFileAccess,
  deleteFile,
  searchSources,
  getCaptureCatalogs,
  getClientContacts,
  createVisit,
  getDetailCatalogs,
  updateProspectionStatus,
  createComment
};

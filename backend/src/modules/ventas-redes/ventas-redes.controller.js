'use strict';

const service = require('./ventas-redes.service');
const syncService = require('./ventas-redes-sync.service');
const ventasNotifications = require('../../services/notifications/ventas-notification.service');

function sendKnownError(error, res, next) {
  const status = Number(error.statusCode || error.status || 0);
  if (status) {
    return res.status(status).json({
      ok: false,
      code: error.code || undefined,
      message: error.message,
      detalles: error.details || error.detalles || undefined
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

function evidenceFiles(req) {
  const files = req.files && typeof req.files === 'object' ? req.files : {};
  return [
    ...(files.imagen_1 || []).map((file) => ({ order: 1, file })),
    ...(files.imagen_2 || []).map((file) => ({ order: 2, file }))
  ];
}

async function syncRecords(req, res, next) {
  try {
    return res.status(200).json(await syncService.syncRecords(
      req.body || {},
      buildActionContext(req)
    ));
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

async function syncComments(req, res, next) {
  try {
    return res.status(200).json(await syncService.syncComments(
      req.body || {},
      buildActionContext(req)
    ));
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

async function list(req, res, next) {
  try { return res.status(200).json(await service.list(req.query || {}, buildActionContext(req))); }
  catch (error) { return sendKnownError(error, res, next); }
}

async function getById(req, res, next) {
  try { return res.status(200).json(await service.getById(req.params.id, buildActionContext(req))); }
  catch (error) { return sendKnownError(error, res, next); }
}

async function getCatalogs(req, res, next) {
  try { return res.status(200).json(await service.getCatalogs(buildActionContext(req))); }
  catch (error) { return sendKnownError(error, res, next); }
}

async function getAssignableUsers(req, res, next) {
  try { return res.status(200).json(await service.getAssignableUsers(req.query || {}, buildActionContext(req))); }
  catch (error) { return sendKnownError(error, res, next); }
}

async function getActiveQuotations(req, res, next) {
  try { return res.status(200).json(await service.getActiveQuotations(req.query || {}, buildActionContext(req))); }
  catch (error) { return sendKnownError(error, res, next); }
}

async function create(req, res, next) {
  try {
    return res.status(201).json(await service.create(
      req.body || {},
      evidenceFiles(req),
      buildActionContext(req)
    ));
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

async function update(req, res, next) {
  try {
    const payload = req.body || {};
    const actionContext = buildActionContext(req);
    const statusBefore = Object.prototype.hasOwnProperty.call(payload, 'id_estatus')
      ? await ventasNotifications.captureRedesStatus_gnral(req.params.id)
      : null;
    const result = await service.updateGeneral(req.params.id, payload, actionContext);
    const notificationResult = statusBefore && result?.estatus_actualizado === true
      ? await ventasNotifications.notifyRedesStatus_gnral(req.params.id, statusBefore, actionContext)
      : { created: 0 };
    return res.status(200).json({
      ...result,
      notificaciones_estatus: Number(notificationResult?.created || 0)
    });
  } catch (error) { return sendKnownError(error, res, next); }
}

async function updateStatus(req, res, next) {
  try {
    const actionContext = buildActionContext(req);
    const statusBefore = await ventasNotifications.captureRedesStatus_gnral(req.params.id);
    const result = await service.updateStatus(req.params.id, req.body || {}, actionContext);
    const notificationResult = result?.estatus_actualizado === true
      ? await ventasNotifications.notifyRedesStatus_gnral(req.params.id, statusBefore, actionContext)
      : { created: 0 };
    return res.status(200).json({
      ...result,
      notificaciones_estatus: Number(notificationResult?.created || 0)
    });
  } catch (error) { return sendKnownError(error, res, next); }
}

async function updateAssignment(req, res, next) {
  try { return res.status(200).json(await service.updateAssignment(req.params.id, req.body || {}, buildActionContext(req))); }
  catch (error) { return sendKnownError(error, res, next); }
}

async function updateQuotation(req, res, next) {
  try { return res.status(200).json(await service.updateQuotation(req.params.id, req.body || {}, buildActionContext(req))); }
  catch (error) { return sendKnownError(error, res, next); }
}

async function remove(req, res, next) {
  try { return res.status(200).json(await service.remove(req.params.id, buildActionContext(req))); }
  catch (error) { return sendKnownError(error, res, next); }
}

async function listEvidence(req, res, next) {
  try { return res.status(200).json(await service.listEvidence(req.params.id, buildActionContext(req))); }
  catch (error) { return sendKnownError(error, res, next); }
}

async function uploadEvidence(req, res, next) {
  try {
    return res.status(201).json(await service.uploadEvidence(
      req.params.id,
      evidenceFiles(req),
      buildActionContext(req)
    ));
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

async function getEvidenceAccess(req, res, next) {
  try {
    return res.status(200).json(await service.getEvidenceAccess(
      req.params.id,
      req.params.idArchivo,
      req.query || {},
      buildActionContext(req)
    ));
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

async function deleteEvidence(req, res, next) {
  try {
    return res.status(200).json(await service.deleteEvidence(
      req.params.id,
      req.params.idArchivo,
      buildActionContext(req)
    ));
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

async function listComments(req, res, next) {
  try {
    return res.status(200).json(await service.listComments(
      req.params.id,
      req.query || {},
      buildActionContext(req)
    ));
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

async function createComment(req, res, next) {
  try {
    const actionContext = buildActionContext(req);
    const result = await service.createComment(
      req.params.id,
      req.body || {},
      req.files || [],
      actionContext
    );
    const notificationResult = await ventasNotifications.notifyRedesComment_gnral(
      req.params.id,
      result?.comentario?.id_comentario,
      actionContext
    );
    return res.status(201).json({ ...result, notificaciones: Number(notificationResult?.created || 0) });
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

async function updateComment(req, res, next) {
  try {
    return res.status(200).json(await service.updateComment(
      req.params.id,
      req.params.idComentario,
      req.body || {},
      buildActionContext(req)
    ));
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

async function deleteComment(req, res, next) {
  try {
    return res.status(200).json(await service.deleteComment(
      req.params.id,
      req.params.idComentario,
      buildActionContext(req)
    ));
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

async function addCommentAttachments(req, res, next) {
  try {
    return res.status(201).json(await service.addCommentAttachments(
      req.params.id,
      req.params.idComentario,
      req.files || [],
      buildActionContext(req)
    ));
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

async function getAttachmentAccess(req, res, next) {
  try {
    return res.status(200).json(await service.getAttachmentAccess(
      req.params.id,
      req.params.idComentario,
      req.params.idAdjunto,
      req.query || {},
      buildActionContext(req)
    ));
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

async function deleteAttachment(req, res, next) {
  try {
    return res.status(200).json(await service.deleteAttachment(
      req.params.id,
      req.params.idComentario,
      req.params.idAdjunto,
      buildActionContext(req)
    ));
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

module.exports = {
  syncRecords,
  syncComments,
  list,
  getById,
  getCatalogs,
  getAssignableUsers,
  getActiveQuotations,
  create,
  update,
  updateStatus,
  updateAssignment,
  updateQuotation,
  remove,
  listEvidence,
  uploadEvidence,
  getEvidenceAccess,
  deleteEvidence,
  listComments,
  createComment,
  updateComment,
  deleteComment,
  addCommentAttachments,
  getAttachmentAccess,
  deleteAttachment
};

'use strict';

const service = require('./ventas-cotizaciones-interes.service');

function sendKnownError(error, res, next) {
  const status = Number(error.statusCode || error.status || 0);
  if (!status) return next(error);
  return res.status(status).json({
    ok: false,
    message: error.message
  });
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

async function getProjectInterest(req, res, next) {
  try {
    return res.status(200).json(await service.getProjectInterest(req.params.id, buildActionContext(req)));
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

async function setProjectInterest(req, res, next) {
  try {
    return res.status(200).json(await service.setProjectInterest(req.params.id, req.body || {}, buildActionContext(req)));
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

async function listProjectInterests(req, res, next) {
  try {
    return res.status(200).json(await service.listProjectInterests(req.query || {}, buildActionContext(req)));
  } catch (error) {
    return sendKnownError(error, res, next);
  }
}

module.exports = {
  getProjectInterest,
  setProjectInterest,
  listProjectInterests
};

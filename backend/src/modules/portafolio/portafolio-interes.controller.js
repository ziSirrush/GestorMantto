'use strict';

const service = require('./portafolio-interes.service');

function sendError(error, res, next) {
  const status = Number(error?.status || error?.statusCode || 0);
  if (!status) return next(error);
  return res.status(status).json({
    ok: false,
    code: error.code || null,
    message: error.message
  });
}

async function getProjectInterest(req, res, next) {
  try {
    return res.status(200).json(await service.getProjectInterest(req));
  } catch (error) {
    return sendError(error, res, next);
  }
}

async function setProjectInterest(req, res, next) {
  try {
    return res.status(200).json(await service.setProjectInterest(req));
  } catch (error) {
    return sendError(error, res, next);
  }
}

async function getEquipmentInterest(req, res, next) {
  try {
    return res.status(200).json(await service.getEquipmentInterest(req));
  } catch (error) {
    return sendError(error, res, next);
  }
}

async function setEquipmentInterest(req, res, next) {
  try {
    return res.status(200).json(await service.setEquipmentInterest(req));
  } catch (error) {
    return sendError(error, res, next);
  }
}

module.exports = {
  getProjectInterest,
  setProjectInterest,
  getEquipmentInterest,
  setEquipmentInterest
};

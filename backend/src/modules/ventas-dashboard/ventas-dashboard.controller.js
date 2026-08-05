'use strict';

const service = require('./ventas-dashboard.service');

async function listCommercialUsers(req, res, next) {
  try {
    return res.status(200).json(await service.listCommercialUsers());
  } catch (error) {
    return next(error);
  }
}

async function getCommercialKpis(req, res, next) {
  try {
    return res.status(200).json(await service.getCommercialKpis(req.query));
  } catch (error) {
    return next(error);
  }
}

async function getCommercialTables(req, res, next) {
  try {
    return res.status(200).json(await service.getCommercialTables(req.query));
  } catch (error) {
    return next(error);
  }
}



async function getOperationalTables(req, res, next) {
  try {
    return res.status(200).json(await service.getOperationalTables(req.query));
  } catch (error) {
    return next(error);
  }
}

module.exports = { listCommercialUsers, getCommercialKpis, getCommercialTables, getOperationalTables };

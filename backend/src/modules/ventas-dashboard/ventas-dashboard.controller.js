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


async function getPdfCapabilities(req, res, next) {
  try {
    const contextUser = req.contextUser || req.user;
    return res.status(200).json(await service.getPdfCapabilities({
      user_id: contextUser?.id_SB,
      can_general: req.dashboardPdfPermissions?.general === true,
      can_individual: req.dashboardPdfPermissions?.individual === true
    }));
  } catch (error) {
    return next(error);
  }
}

async function preparePdf(req, res, next) {
  try {
    const contextUser = req.contextUser || req.user;
    return res.status(200).json(await service.preparePdf(req.query, {
      user_id: contextUser?.id_SB,
      can_general: req.dashboardPdfPermissions?.general === true,
      can_individual: req.dashboardPdfPermissions?.individual === true
    }));
  } catch (error) {
    return next(error);
  }
}


async function getPdfData(req, res, next) {
  try {
    const contextUser = req.contextUser || req.user;
    return res.status(200).json(await service.getPdfData(req.query, {
      user_id: contextUser?.id_SB,
      can_general: req.dashboardPdfPermissions?.general === true,
      can_individual: req.dashboardPdfPermissions?.individual === true
    }));
  } catch (error) {
    return next(error);
  }
}

module.exports = { listCommercialUsers, getCommercialKpis, getCommercialTables, getOperationalTables, getPdfCapabilities, preparePdf, getPdfData };

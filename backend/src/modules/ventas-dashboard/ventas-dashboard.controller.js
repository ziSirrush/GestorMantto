'use strict';

const db = require('../../config/db');
const service = require('./ventas-dashboard.service');
const ventasVisibility = require('../ventas/ventas-visibility.service');

function buildActionContext(req) {
  return {
    user: req.user,
    contextUser: req.contextUser || req.user,
    informationAccess: req.informationAccess || null
  };
}

function targetUserId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    const error = new Error('usuario_id es requerido y debe ser un entero positivo.');
    error.status = 400;
    error.statusCode = 400;
    throw error;
  }
  return id;
}

function requestedTargetUserId(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw || raw === 'todos' || raw === 'all') return null;
  return targetUserId(raw);
}

function scopeAllowsUser(scope, userId) {
  if (!scope || scope.mode === 'ALL') return true;
  const ids = Array.isArray(scope.advisorIds) ? scope.advisorIds : [];
  return ids.some((id) => Number(id) === Number(userId));
}

async function resolveScope(req) {
  return ventasVisibility.resolveVisibilityScope(db, buildActionContext(req));
}

async function resolveDashboardTarget(req) {
  const userId = requestedTargetUserId(req.query?.usuario_id);
  const scope = await resolveScope(req);
  if (userId && !scopeAllowsUser(scope, userId)) {
    const error = new Error('El responsable seleccionado queda fuera de tu Alcance de Información de Ventas.');
    error.status = 403;
    error.statusCode = 403;
    throw error;
  }
  return { userId, scope };
}

async function requireTargetInScope(req) {
  const { userId, scope } = await resolveDashboardTarget(req);
  if (!userId) {
    const error = new Error('usuario_id es requerido para esta operación individual.');
    error.status = 400;
    error.statusCode = 400;
    throw error;
  }
  return { userId, scope };
}

async function listCommercialUsers(req, res, next) {
  try {
    return res.status(200).json(await service.listCommercialUsers(buildActionContext(req)));
  } catch (error) {
    return next(error);
  }
}

async function getCommercialKpis(req, res, next) {
  try {
    const target = await resolveDashboardTarget(req);
    return res.status(200).json(await service.getCommercialKpis(
      { ...req.query, usuario_id: target.userId || 'todos' },
      { scope: target.scope, actionContext: buildActionContext(req) }
    ));
  } catch (error) {
    return next(error);
  }
}

async function getCommercialTables(req, res, next) {
  try {
    const target = await resolveDashboardTarget(req);
    return res.status(200).json(await service.getCommercialTables(
      { ...req.query, usuario_id: target.userId || 'todos' },
      {
        scope: target.scope,
        actionContext: buildActionContext(req),
        allowedTableKeys: req.dashboardTablePermissions?.commercial || []
      }
    ));
  } catch (error) {
    return next(error);
  }
}

async function getOperationalTables(req, res, next) {
  try {
    const target = await resolveDashboardTarget(req);
    return res.status(200).json(await service.getOperationalTables(
      { ...req.query, usuario_id: target.userId || 'todos' },
      {
        scope: target.scope,
        actionContext: buildActionContext(req),
        allowedTableKeys: req.dashboardTablePermissions?.operational || []
      }
    ));
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
    const type = String(req.query?.tipo || '').trim().toLowerCase();
    if (type === 'individual') await requireTargetInScope(req);
    const contextUser = req.contextUser || req.user;
    return res.status(200).json(await service.preparePdf(req.query, {
      user_id: contextUser?.id_SB,
      can_general: req.dashboardPdfPermissions?.general === true,
      can_individual: req.dashboardPdfPermissions?.individual === true,
      actionContext: buildActionContext(req)
    }));
  } catch (error) {
    return next(error);
  }
}

async function getPdfData(req, res, next) {
  try {
    const type = String(req.query?.tipo || '').trim().toLowerCase();
    if (type === 'individual') await requireTargetInScope(req);
    const contextUser = req.contextUser || req.user;
    return res.status(200).json(await service.getPdfData(req.query, {
      user_id: contextUser?.id_SB,
      can_general: req.dashboardPdfPermissions?.general === true,
      can_individual: req.dashboardPdfPermissions?.individual === true,
      actionContext: buildActionContext(req)
    }));
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listCommercialUsers,
  getCommercialKpis,
  getCommercialTables,
  getOperationalTables,
  getPdfCapabilities,
  preparePdf,
  getPdfData
};

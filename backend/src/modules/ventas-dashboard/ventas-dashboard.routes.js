'use strict';

const express = require('express');
const controller = require('./ventas-dashboard.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { hasPermission } = require('../../middleware/ventas-cotizaciones-permissions.middleware');

const router = express.Router();
const DASHBOARD_VISUAL_PERMISSION = 'VENTAS_DASHBOARD_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';

async function requireDashboardAccess(req, res, next) {
  try {
    const contextUser = req.contextUser || req.user;
    const userId = Number(contextUser?.id_SB);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({ ok: false, message: 'Sesión sin usuario válido.' });
    }
    const allowed = await hasPermission(userId, DASHBOARD_VISUAL_PERMISSION);
    if (!allowed) {
      return res.status(403).json({ ok: false, message: 'No tienes permiso para consultar Dashboard Ventas.' });
    }
    return next();
  } catch (error) {
    return next(error);
  }
}

router.get('/dashboard/usuarios', requireAuth, requireDashboardAccess, controller.listCommercialUsers);
router.get('/dashboard/kpis', requireAuth, requireDashboardAccess, controller.getCommercialKpis);
router.get('/dashboard/tablas', requireAuth, requireDashboardAccess, controller.getCommercialTables);
router.get('/dashboard/operacion', requireAuth, requireDashboardAccess, controller.getOperationalTables);

module.exports = router;

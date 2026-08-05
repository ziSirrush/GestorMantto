'use strict';

const express = require('express');
const controller = require('./ventas-dashboard.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { hasPermission } = require('../../middleware/ventas-cotizaciones-permissions.middleware');

const router = express.Router();
const DASHBOARD_VISUAL_PERMISSION = 'VENTAS_DASHBOARD_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';
const PDF_GENERAL_PERMISSION = 'VENTAS_DASHBOARD_PDF_REPORTES.GENERAR_PDF_GENERAL';
const PDF_INDIVIDUAL_PERMISSION = 'VENTAS_DASHBOARD_PDF_REPORTES.GENERAR_PDF_INDIVIDUAL';

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


async function loadDashboardPdfPermissions(req, res, next) {
  try {
    const contextUser = req.contextUser || req.user;
    const userId = Number(contextUser?.id_SB);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({ ok: false, message: 'Sesión sin usuario válido.' });
    }
    const [general, individual] = await Promise.all([
      hasPermission(userId, PDF_GENERAL_PERMISSION),
      hasPermission(userId, PDF_INDIVIDUAL_PERMISSION)
    ]);
    req.dashboardPdfPermissions = { general, individual };
    return next();
  } catch (error) {
    return next(error);
  }
}

router.get('/dashboard/usuarios', requireAuth, requireDashboardAccess, controller.listCommercialUsers);
router.get('/dashboard/kpis', requireAuth, requireDashboardAccess, controller.getCommercialKpis);
router.get('/dashboard/tablas', requireAuth, requireDashboardAccess, controller.getCommercialTables);
router.get('/dashboard/operacion', requireAuth, requireDashboardAccess, controller.getOperationalTables);
router.get('/dashboard/pdf/capabilities', requireAuth, requireDashboardAccess, loadDashboardPdfPermissions, controller.getPdfCapabilities);
router.get('/dashboard/pdf/prepare', requireAuth, requireDashboardAccess, loadDashboardPdfPermissions, controller.preparePdf);
router.get('/dashboard/pdf/data', requireAuth, requireDashboardAccess, loadDashboardPdfPermissions, controller.getPdfData);

module.exports = router;

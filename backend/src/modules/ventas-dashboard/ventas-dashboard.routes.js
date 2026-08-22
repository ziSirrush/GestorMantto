// [Aster | 2026-08-19 | ASTER-MG | FASE 1 VENTAS: Guard General y permisos funcionales]
'use strict';

const express = require('express');
const controller = require('./ventas-dashboard.controller');
const { hasEffectivePermission } = require('../../services/permissions/effective-permission.service');
const {
  humanInformationGuard_gnral,
  dynamicHumanInformationGuard_gnral
} = require('../../middleware/information-access-gnral.middleware');

const router = express.Router();

const DASHBOARD_VISUAL_PERMISSION = 'VENTAS_DASHBOARD_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';
const DASHBOARD_SELECTOR_PERMISSION = 'VENTAS_DASHBOARD_SELECTOR_RESPONSABLE_COMERCIAL.VER';
const DASHBOARD_KPI_PERMISSION = 'VENTAS_DASHBOARD_KPI_COMERCIALES_INDICADORES.VER';
const PDF_GENERAL_PERMISSION = 'VENTAS_DASHBOARD_PDF_REPORTES.GENERAR_PDF_GENERAL';
const PDF_INDIVIDUAL_PERMISSION = 'VENTAS_DASHBOARD_PDF_REPORTES.GENERAR_PDF_INDIVIDUAL';

const DASHBOARD_COMMERCIAL_TABLE_PERMISSIONS = Object.freeze([
  'VENTAS_DASHBOARD_TABLAS_CONSULTA_CLIENTES.VER',
  'VENTAS_DASHBOARD_TABLAS_CONSULTA_COTIZACIONES.VER',
  'VENTAS_DASHBOARD_TABLAS_CONSULTA_VENDIDOS.VER',
  'VENTAS_DASHBOARD_TABLAS_CONSULTA_PERDIDOS.VER',
  'VENTAS_DASHBOARD_TABLAS_CONSULTA_PROSPECCION.VER',
  'VENTAS_DASHBOARD_TABLAS_CONSULTA_ASIGNACION_REDES.VER'
]);

const DASHBOARD_OPERATIONAL_TABLE_PERMISSIONS = Object.freeze([
  'VENTAS_DASHBOARD_TABLAS_CONSULTA_INSTALACIONES.VER',
  'VENTAS_DASHBOARD_TABLAS_CONSULTA_LOGISTICA.VER',
  'VENTAS_DASHBOARD_TABLAS_CONSULTA_TAREAS_ASIGNADAS.VER',
  'VENTAS_DASHBOARD_TABLAS_CONSULTA_TAREAS_CREADAS.VER'
]);

function dashboardGuard(permissionCodesAny) {
  return humanInformationGuard_gnral({
    permissionCodesAny: Array.isArray(permissionCodesAny) ? permissionCodesAny : [permissionCodesAny],
    domain: 'CORELLIAN',
    groupingCodesAny: ['VENTAS']
  });
}

function dashboardPdfGuard() {
  return dynamicHumanInformationGuard_gnral((req) => {
    const type = String(req.query?.tipo || '').trim().toLowerCase();
    const permissionCode = type === 'general'
      ? PDF_GENERAL_PERMISSION
      : type === 'individual'
        ? PDF_INDIVIDUAL_PERMISSION
        : DASHBOARD_VISUAL_PERMISSION;

    return {
      permissionCodesAny: [permissionCode],
      domain: 'CORELLIAN',
      groupingCodesAny: ['VENTAS']
    };
  });
}

async function loadDashboardPdfPermissions(req, res, next) {
  try {
    const contextUser = req.contextUser || req.user;
    const userId = Number(contextUser?.id_SB);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({ ok: false, message: 'Sesión sin usuario válido.' });
    }

    const [general, individual] = await Promise.all([
      hasEffectivePermission(userId, PDF_GENERAL_PERMISSION),
      hasEffectivePermission(userId, PDF_INDIVIDUAL_PERMISSION)
    ]);
    req.dashboardPdfPermissions = { general, individual };
    return next();
  } catch (error) {
    return next(error);
  }
}

router.get('/dashboard/usuarios', ...dashboardGuard(DASHBOARD_SELECTOR_PERMISSION), controller.listCommercialUsers);
router.get('/dashboard/kpis', ...dashboardGuard(DASHBOARD_KPI_PERMISSION), controller.getCommercialKpis);
router.get('/dashboard/tablas', ...dashboardGuard(DASHBOARD_COMMERCIAL_TABLE_PERMISSIONS), controller.getCommercialTables);
router.get('/dashboard/operacion', ...dashboardGuard(DASHBOARD_OPERATIONAL_TABLE_PERMISSIONS), controller.getOperationalTables);
router.get('/dashboard/pdf/capabilities', ...dashboardGuard(DASHBOARD_VISUAL_PERMISSION), loadDashboardPdfPermissions, controller.getPdfCapabilities);
router.get('/dashboard/pdf/prepare', ...dashboardPdfGuard(), loadDashboardPdfPermissions, controller.preparePdf);
router.get('/dashboard/pdf/data', ...dashboardPdfGuard(), loadDashboardPdfPermissions, controller.getPdfData);

module.exports = router;

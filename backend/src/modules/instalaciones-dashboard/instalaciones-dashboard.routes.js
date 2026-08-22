'use strict';

const express = require('express');
const controller = require('./instalaciones-dashboard.controller');
const service = require('./instalaciones-dashboard.service');
const { requireAuth } = require('../../middleware/auth.middleware');
const { hasEffectivePermission } = require('../../services/permissions/effective-permission.service');

const router = express.Router();

function requirePermission_cor(permissionCode, errorCode, message) {
  return async function permissionMiddleware_cor(req, res, next) {
    try {
      const effectiveUser = req.contextUser || req.user;
      const userId = Number(effectiveUser && effectiveUser.id_SB);
      const allowed = userId > 0 && await hasEffectivePermission(userId, permissionCode);
      if (!allowed) {
        return res.status(403).json({ ok: false, code: errorCode, message });
      }
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

const requireAccess_cor = requirePermission_cor(
  service.PERMISSIONS_COR.acceso_visual,
  'INSTALACIONES_DASHBOARD_FORBIDDEN',
  'No tienes permiso para consultar Instalaciones > Dashboard.'
);


const requireSupervisorView_cor = requirePermission_cor(
  service.PERMISSIONS_COR.selector_ver,
  'INSTALACIONES_DASHBOARD_SELECTOR_FORBIDDEN',
  'No tienes permiso para consultar el selector de supervisores.'
);

const requireSupervisorFilter_cor = requirePermission_cor(
  service.PERMISSIONS_COR.selector_filtrar,
  'INSTALACIONES_DASHBOARD_FILTER_FORBIDDEN',
  'No tienes permiso para filtrar el Dashboard por supervisor.'
);


const requireReportSelectorView_cor = requirePermission_cor(
  service.PERMISSIONS_COR.reporte_selector_ver,
  'INSTALACIONES_DASHBOARD_REPORT_SELECTOR_FORBIDDEN',
  'No tienes permiso para consultar el selector de seccion del reporte.'
);

const requireReportSelector_cor = requirePermission_cor(
  service.PERMISSIONS_COR.reporte_selector_filtrar,
  'INSTALACIONES_DASHBOARD_REPORT_FILTER_FORBIDDEN',
  'No tienes permiso para filtrar el reporte por sección.'
);

const requireReportList_cor = requirePermission_cor(
  service.PERMISSIONS_COR.reporte_listado_ver,
  'INSTALACIONES_DASHBOARD_REPORT_FORBIDDEN',
  'No tienes permiso para consultar el listado del reporte del Dashboard.'
);

const requireReportEdit_cor = requirePermission_cor(
  service.PERMISSIONS_COR.reporte_editar,
  'INSTALACIONES_DASHBOARD_EDIT_FORBIDDEN',
  'No tienes permiso para editar equipos desde Modo Junta.'
);

router.get(
  '/dashboard/bootstrap',
  requireAuth,
  requireAccess_cor,
  controller.bootstrap_cor
);

router.get(
  '/dashboard/resumen',
  requireAuth,
  requireAccess_cor,
  requireSupervisorView_cor,
  requireSupervisorFilter_cor,
  controller.summary_cor
);

router.get(
  '/dashboard/reporte',
  requireAuth,
  requireAccess_cor,
  requireSupervisorView_cor,
  requireSupervisorFilter_cor,
  requireReportSelectorView_cor,
  requireReportSelector_cor,
  requireReportList_cor,
  controller.report_cor
);


router.patch(
  '/dashboard/reporte/:id_ins_fl/celda',
  requireAuth,
  requireAccess_cor,
  requireReportList_cor,
  requireReportEdit_cor,
  controller.updateCell_cor
);

module.exports = router;

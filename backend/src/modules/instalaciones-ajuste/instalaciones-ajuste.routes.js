'use strict';

const express = require('express');
const controller = require('./instalaciones-ajuste.controller');
const service = require('./instalaciones-ajuste.service');
const { requireAuth } = require('../../middleware/auth.middleware');
const { hasEffectivePermission } = require('../../services/permissions/effective-permission.service');

const router = express.Router();

function requirePermission_cor(permissionCode, errorCode, message) {
  return async function permissionMiddleware_cor(req, res, next) {
    try {
      const userId = Number(req.user && req.user.id_SB);
      const allowed = userId > 0 && await hasEffectivePermission(userId, permissionCode);

      if (!allowed) {
        return res.status(403).json({
          ok: false,
          code: errorCode,
          message
        });
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
}

const requireAccess_cor = requirePermission_cor(
  service.PERMISSIONS_COR.acceso_visual,
  'INSTALACIONES_AJUSTE_FORBIDDEN',
  'No tienes permiso para consultar Instalaciones > Ajuste.'
);

const requireBehaviorSelector_cor = requirePermission_cor(
  service.PERMISSIONS_COR.comportamiento_selector_ver,
  'INSTALACIONES_AJUSTE_COMPORTAMIENTO_FORBIDDEN',
  'No tienes permiso para consultar el selector de tipo de equipo.'
);

const requireBehaviorFilter_cor = requirePermission_cor(
  service.PERMISSIONS_COR.comportamiento_filtrar,
  'INSTALACIONES_AJUSTE_COMPORTAMIENTO_FORBIDDEN',
  'No tienes permiso para filtrar el comportamiento por tipo de equipo.'
);

const requireBehaviorSummary_cor = requirePermission_cor(
  service.PERMISSIONS_COR.comportamiento_resumen_ver,
  'INSTALACIONES_AJUSTE_COMPORTAMIENTO_FORBIDDEN',
  'No tienes permiso para consultar el resumen por año.'
);

const requireDetail_cor = requirePermission_cor(
  service.PERMISSIONS_COR.detalle_ver,
  'INSTALACIONES_AJUSTE_DETALLE_FORBIDDEN',
  'No tienes permiso para consultar el detalle completo por año.'
);

router.get(
  '/ajuste/bootstrap',
  requireAuth,
  requireAccess_cor,
  controller.bootstrap_cor
);

router.get(
  '/ajuste/comportamiento',
  requireAuth,
  requireAccess_cor,
  requireBehaviorSelector_cor,
  requireBehaviorFilter_cor,
  requireBehaviorSummary_cor,
  controller.behavior_cor
);

router.get(
  '/ajuste/detalle',
  requireAuth,
  requireAccess_cor,
  requireDetail_cor,
  controller.detail_cor
);

module.exports = router;

'use strict';

const express = require('express');
const controller = require('./instalaciones-carpetas.controller');
const service = require('./instalaciones-carpetas.service');
const { requireAuth } = require('../../middleware/auth.middleware');
const { hasEffectivePermission } = require('../../services/permissions/effective-permission.service');

const router = express.Router();

function requirePermission_cor(permissionCode, errorCode, message) {
  return async function permissionMiddleware_cor(req, res, next) {
    try {
      const userId = Number(req.user && req.user.id_SB);
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
  'INSTALACIONES_CARPETAS_FORBIDDEN',
  'No tienes permiso para consultar Instalaciones > Carpetas.'
);

const requireRelationCreate_cor = requirePermission_cor(
  service.PERMISSIONS_COR.relacionador_crear,
  'INSTALACIONES_CARPETAS_RELATION_FORBIDDEN',
  'No tienes permiso para relacionar proyectos con carpetas.'
);

router.get(
  '/carpetas/bootstrap',
  requireAuth,
  requireAccess_cor,
  controller.bootstrap_cor
);

router.post(
  '/carpetas/relacion',
  requireAuth,
  requireAccess_cor,
  requireRelationCreate_cor,
  controller.createRelation_cor
);

module.exports = router;

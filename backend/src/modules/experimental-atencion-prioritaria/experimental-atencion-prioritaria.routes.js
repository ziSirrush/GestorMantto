'use strict';

const express = require('express');
const controller = require('./experimental-atencion-prioritaria.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { hasEffectivePermission } = require('../../services/permissions/effective-permission.service');

const router = express.Router();
const ACCESS_PERMISSION_EXP = 'ATENCION_PRIORITARIA_EXP_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';

async function requireAtencionPrioritariaAccess_exp(req, res, next) {
  try {
    const effectiveUser = req.contextUser || req.user || {};
    const userId = Number(effectiveUser.id_SB || effectiveUser.id || 0);
    const allowed = await hasEffectivePermission(userId, ACCESS_PERMISSION_EXP);
    if (!allowed) {
      return res.status(403).json({
        ok: false,
        message: 'No tienes permiso para consultar Atención Prioritaria.',
        permiso: ACCESS_PERMISSION_EXP
      });
    }
    return next();
  } catch (error) {
    return next(error);
  }
}

router.get(
  '/atencion-prioritaria',
  requireAuth,
  requireAtencionPrioritariaAccess_exp,
  controller.getAtencionPrioritaria_exp
);

module.exports = router;

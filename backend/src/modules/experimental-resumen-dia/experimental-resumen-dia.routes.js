'use strict';

const express = require('express');
const controller = require('./experimental-resumen-dia.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { hasEffectivePermission } = require('../../services/permissions/effective-permission.service');

const router = express.Router();
const ACCESS_PERMISSION_EXP = 'RESUMEN_DIA_EXP_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';

async function requireResumenDiaAccess_exp(req, res, next) {
  try {
    const effectiveUser = req.contextUser || req.user || {};
    const userId = Number(effectiveUser.id_SB || effectiveUser.id || 0);
    const allowed = await hasEffectivePermission(userId, ACCESS_PERMISSION_EXP);
    if (!allowed) {
      return res.status(403).json({
        ok: false,
        message: 'No tienes permiso para consultar el Resumen del Día Experimental.',
        permiso: ACCESS_PERMISSION_EXP
      });
    }
    return next();
  } catch (error) {
    return next(error);
  }
}

router.get(
  '/resumen-dia',
  requireAuth,
  requireResumenDiaAccess_exp,
  controller.getResumenDia_exp
);

module.exports = router;

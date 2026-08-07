'use strict';

const express = require('express');
const controller = require('./experimental-entregas-recientes.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { hasEffectivePermission } = require('../../services/permissions/effective-permission.service');

const router = express.Router();
const ACCESS_PERMISSION_EXP = 'ENTREGAS_RECIENTES_EXP_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';

async function requireEntregasRecientesAccess_uni(req, res, next) {
  try {
    const effectiveUser = req.contextUser || req.user || {};
    const userId = Number(effectiveUser.id_SB || effectiveUser.id || 0);
    const allowed = await hasEffectivePermission(userId, ACCESS_PERMISSION_EXP);
    if (!allowed) {
      return res.status(403).json({
        ok: false,
        message: 'No tienes permiso para consultar Entregas Recientes Experimental.',
        permiso: ACCESS_PERMISSION_EXP
      });
    }
    return next();
  } catch (error) {
    return next(error);
  }
}

router.get(
  '/entregas-recientes',
  requireAuth,
  requireEntregasRecientesAccess_uni,
  controller.getEntregasRecientes_uni
);

module.exports = router;

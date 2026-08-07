'use strict';

const express = require('express');
const controller = require('./experimental-equipos-criticos.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { hasEffectivePermission } = require('../../services/permissions/effective-permission.service');

const router = express.Router();
const ACCESS_PERMISSION_UNI = 'EQUIPOS_CRITICOS_EXP_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';

async function requireEquiposCriticosAccess_uni(req, res, next) {
  try {
    const effectiveUser = req.contextUser || req.user || {};
    const userId = Number(effectiveUser.id_SB || effectiveUser.id || 0);
    const allowed = await hasEffectivePermission(userId, ACCESS_PERMISSION_UNI);
    if (!allowed) {
      return res.status(403).json({
        ok: false,
        message: 'No tienes permiso para consultar Equipos Críticos Experimental.',
        permiso: ACCESS_PERMISSION_UNI
      });
    }
    return next();
  } catch (error) {
    return next(error);
  }
}

router.get(
  '/equipos-criticos',
  requireAuth,
  requireEquiposCriticosAccess_uni,
  controller.getEquiposCriticos_uni
);

router.get(
  '/equipos-criticos/:codigo/tickets',
  requireAuth,
  requireEquiposCriticosAccess_uni,
  controller.getEquipoCriticoTickets_uni
);

module.exports = router;

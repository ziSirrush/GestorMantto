'use strict';

const express = require('express');
const controller = require('./experimental-dashboard-call-center.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { hasEffectivePermission } = require('../../services/permissions/effective-permission.service');

const router = express.Router();
const ACCESS_PERMISSION_UNI = 'DASHBOARD_CALL_CENTER_EXP_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';

async function requireDashboardCallCenterAccess_uni(req, res, next) {
  try {
    const effectiveUser = req.contextUser || req.user || {};
    const userId = Number(effectiveUser.id_SB || effectiveUser.id || 0);
    const allowed = await hasEffectivePermission(userId, ACCESS_PERMISSION_UNI);
    if (!allowed) {
      return res.status(403).json({ ok:false, message:'No tienes permiso para consultar Dashboard Call Center Experimental.', permiso:ACCESS_PERMISSION_UNI });
    }
    return next();
  } catch (error) {
    return next(error);
  }
}

router.get('/dashboard-call-center', requireAuth, requireDashboardCallCenterAccess_uni, controller.getDashboard_uni);

module.exports = router;

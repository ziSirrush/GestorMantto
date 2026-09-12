// [Claude | 2026-09-11 | Bitácora de Obra | FASE_1_BACKEND_V001]
const express = require('express');
const controller = require('./instalaciones-bitacora.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { hasEffectivePermission } = require('../../services/permissions/effective-permission.service');

const router = express.Router();
const BITACORA_VIEW_PERMISSION = 'INSTALACIONES_PROYECTOS_DETALLE_PROYECTO_BITACORA.VER';

async function requireBitacoraView(req, res, next) {
  try {
    if (req.viewerContext && req.viewerContext.active && req.method !== 'GET') {
      return res.status(403).json({
        ok: false,
        code: 'VIEWER_READ_ONLY',
        message: 'El Visor de usuarios es de solo lectura.'
      });
    }

    const effectiveUser = req.contextUser || req.user || {};
    const userId = Number(effectiveUser.id_SB || effectiveUser.id || 0);
    const allowed = userId > 0 && await hasEffectivePermission(userId, BITACORA_VIEW_PERMISSION);

    if (!allowed) {
      return res.status(403).json({
        ok: false,
        code: 'INSTALACIONES_BITACORA_FORBIDDEN',
        message: 'No tienes permiso para consultar la Bitácora de Obra.'
      });
    }

    return next();
  } catch (error) {
    return next(error);
  }
}

router.get('/bitacora/:idProyecto', requireAuth, requireBitacoraView, controller.getBitacora);
router.post('/bitacora/:idProyecto/sync', requireAuth, requireBitacoraView, controller.syncBitacora);

module.exports = router;

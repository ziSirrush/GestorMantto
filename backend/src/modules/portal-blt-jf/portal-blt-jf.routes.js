'use strict';

const express = require('express');
const { requireAuth } = require('../../middleware/auth.middleware');
const { createRateLimit } = require('../../middleware/auth-rate-limit.middleware');
const { hasEffectivePermission } = require('../../services/permissions/effective-permission.service');
const service = require('./portal-blt-jf.service');

const router = express.Router();
const verifyRateLimit = createRateLimit({ name: 'portal-blt-verificar', windowMs: 60 * 1000, max: 60 });

function fail(res, error) {
  const status = Number(error && error.status) || 500;
  return res.status(status).json({
    ok: false,
    code: (error && error.code) || 'PORTAL_BLT_ERROR',
    message: status >= 500 ? 'No fue posible abrir la vista del Portal BLT.' : error.message
  });
}

router.post('/pase', requireAuth, async (req, res) => {
  try {
    if (req.viewerContext && req.viewerContext.active) {
      return res.status(403).json({ ok: false, code: 'PORTAL_BLT_VIEWER_DENIED', message: 'Sal del modo visor para abrir el Portal BLT.' });
    }
    const view = String((req.body && req.body.vista) || 'movimientos');
    const permission = service.permissionFor(view);
    const actor = req.actorUser || req.user;
    if (!await hasEffectivePermission(Number(actor && actor.id_SB), permission)) {
      return res.status(403).json({ ok: false, code: 'PORTAL_BLT_VISUAL_DENIED', message: 'No tienes acceso a esta vista del Portal BLT.' });
    }
    return res.json({ ok: true, data: service.issuePass(actor, view) });
  } catch (error) {
    return fail(res, error);
  }
});

// Lo llama el servidor del Portal BLT para validar el pase.
router.post('/verificar', verifyRateLimit, (req, res) => {
  try {
    return res.json({ ok: true, data: service.verifyPass(req.body && req.body.pase) });
  } catch (error) {
    return fail(res, error);
  }
});

module.exports = router;

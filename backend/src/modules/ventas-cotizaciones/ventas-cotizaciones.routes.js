const express = require('express');
const controller = require('./ventas-cotizaciones.controller');

const router = express.Router();

function requireSyncKey(req, res, next) {
  const configuredKey = process.env.VENTAS_SYNC_KEY;
  const suppliedKey = req.get('x-sync-key');

  if (!configuredKey) {
    return res.status(503).json({
      ok: false,
      message: 'VENTAS_SYNC_KEY no está configurada en el backend.'
    });
  }

  if (!suppliedKey || suppliedKey !== configuredKey) {
    return res.status(401).json({
      ok: false,
      message: 'Clave de sincronización inválida.'
    });
  }

  return next();
}

router.post('/cotizaciones/sync', requireSyncKey, controller.syncCotizaciones);

module.exports = router;

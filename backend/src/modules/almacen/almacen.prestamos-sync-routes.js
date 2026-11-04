'use strict';

const express = require('express');
const { requireIntegrationAuthFor } = require('../../middleware/integration-auth.middleware');
const { createPrestamosSyncService } = require('./almacen.prestamos-sync-service');

function createPrestamosSyncRouter(db) {
  const router = express.Router();
  const service = createPrestamosSyncService(db);
  // La carga manual usa el config de Ventas compartido por el usuario.
  // No hereda la identidad almacen-appscript del receptor NS por lotes.
  router.post('/prestamos/sync', requireIntegrationAuthFor('INTEGRATION_VENTAS_ID', {
    alwaysRequireAuth: true, algorithm: 'sha256'
  }), async (req, res, next) => {
    try {
      const result = await service.loadInitial(req.body);
      res.status(result.repetido ? 200 : 201).json(result);
    } catch (error) { next(error); }
  });
  return router;
}
module.exports = { createPrestamosSyncRouter };

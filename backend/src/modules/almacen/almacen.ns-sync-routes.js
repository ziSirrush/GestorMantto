'use strict';

// [Aster | 2026-10-19 | ASTER-MG | ALMACEN NS FASE 2 ENDPOINTS SINCRONIZACION V001]
// Autenticacion M2M HMAC obligatoria incluso si INTEGRATION_AUTH_ENABLED=false.
// Nunca exponer estos endpoints con un JWT humano ni con un guard de frontend.

const express = require('express');
const { requireIntegrationAuthFor } = require('../../middleware/integration-auth.middleware');
const service = require('./almacen.ns-sync-service');
const router = express.Router();

router.use(requireIntegrationAuthFor('INTEGRATION_ALMACEN_NS_ID', { alwaysRequireAuth: true, algorithm: 'sha256' }));

function respond(action, status = 200) {
  return async (req, res, next) => {
    try {
      const type = service.toType(req.params.fuente);
      const result = await action(type, req);
      return res.status(status).json(result);
    } catch (error) { return next(error); }
  };
}

router.get('/contrato', (_req,res) => res.json({
  ok:true, version:1, lotesPorFuente:service.TYPE_BY_ROUTE,
  tamanoMaximoPagina:service.MAX_PAGE_SIZE,
  algoritmoFirma:'HMAC-SHA256',
  paginaBase:1,
  nota:'El inventario se publica al finalizar la carga completa; no se exponen lotes RECIBIENDO.'
}));
router.post('/:fuente/lotes', respond((type,req) => service.beginLot(type,req.body || {}),201));
router.get('/:fuente/lotes/:id', respond((type,req) => service.statusLot(type,req.params.id)));
router.post('/:fuente/lotes/:id/paginas', respond((type,req) => service.uploadPage(type,req.params.id,req.body || {})));
router.post('/:fuente/lotes/:id/finalizar', respond((type,req) => service.finishLot(type,req.params.id)));
router.post('/:fuente/lotes/:id/rechazar', respond((type,req) => service.rejectLot(type,req.params.id,req.body || {})));

module.exports = router;

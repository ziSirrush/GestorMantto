'use strict';

// [Aster | 2026-10-19 | ASTER-MG | FIX ALMACEN 230 CONTRATO ID INVENTARIO V001]
// [Aster | 2026-10-19 | ASTER-MG | FIX ALMACEN ID M2M SECRET EXISTENTE V001]
// Autenticacion M2M HMAC obligatoria incluso si INTEGRATION_AUTH_ENABLED=false.
// Nunca exponer estos endpoints con un JWT humano ni con un guard de frontend.

const express = require('express');
const { requireIntegrationAuthFor } = require('../../middleware/integration-auth.middleware');
const service = require('./almacen.ns-sync-service');
const router = express.Router();

// Firma HMAC siempre obligatoria. Identidad publica estable, sin variable Azure de ID.
router.use(requireIntegrationAuthFor(null, {
  expectedIntegrationId: 'almacen-appscript',
  alwaysRequireAuth: true,
  algorithm: 'sha256'
}));

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
  ok:true, version:2, lotesPorFuente:service.TYPE_BY_ROUTE,
  inventario230:{llave:'idInventario',obligatoria:true,estrategia:'UPSERT_AL_FINALIZAR',ausentes:'CONSERVAR'},
  tamanoMaximoPagina:service.MAX_PAGE_SIZE,
  algoritmoFirma:'HMAC-SHA256',
  paginaBase:1,
  nota:'El inventario 230 recibe idInventario de SEND y aplica INSERT/UPDATE al finalizar el lote completo.'
}));
router.post('/:fuente/lotes', respond((type,req) => service.beginLot(type,req.body || {}),201));
router.get('/:fuente/lotes/:id', respond((type,req) => service.statusLot(type,req.params.id)));
router.post('/:fuente/lotes/:id/paginas', respond((type,req) => service.uploadPage(type,req.params.id,req.body || {})));
router.post('/:fuente/lotes/:id/finalizar', respond((type,req) => service.finishLot(type,req.params.id)));
router.post('/:fuente/lotes/:id/rechazar', respond((type,req) => service.rejectLot(type,req.params.id,req.body || {})));

module.exports = router;

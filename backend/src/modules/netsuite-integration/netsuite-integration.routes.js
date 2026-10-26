'use strict';

// NS Integration V001: receptor protegido, sin persistencia hasta aprobar dataset y tabla.
const express = require('express');
const { requireIntegrationAuthFor } = require('../../middleware/integration-auth.middleware');
const contract = require('./netsuite-integration.contract');

const router = express.Router();

// Siempre exigir HMAC, aun cuando INTEGRATION_AUTH_ENABLED=false.
// Nunca usar JWT humano ni accesos del frontend para estas rutas.
router.use(requireIntegrationAuthFor('INTEGRATION_NETSUITE_ID', {
  alwaysRequireAuth: true,
  algorithm: 'sha256'
}));

router.get('/estado', (_req, res) => res.json({
  ok: true,
  origen: 'NETSUITE',
  contrato: 1,
  autenticado: true,
  persistenciaHabilitada: false,
  estado: 'PENDIENTE_DESTINO_AIVEN'
}));

function pendingValidation(validator) {
  return (req, res, next) => {
    try {
      validator(req);
      // Prohibido responder ok:true hasta escribir de forma durable en Aiven.
      return res.status(503).json({
        ok: false,
        code: 'NS_DATASET_DESTINATION_PENDING',
        message: 'No se guardaron datos. Falta aprobar el destino Aiven y la persistencia del receptor.'
      });
    } catch (error) {
      return next(error);
    }
  };
}

router.post('/lotes', pendingValidation(req => contract.validateBegin(req.body)));
router.post('/lotes/:loteId/paginas', pendingValidation(req => contract.validatePage(req.params.loteId, req.body)));
router.post('/lotes/:loteId/finalizar', pendingValidation(req => contract.validateFinish(req.params.loteId, req.body)));

module.exports = router;

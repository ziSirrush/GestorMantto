// [Aster | 2026-08-13 | ASTER-MG | FASE: COBRANZA_UNI_GESTION_CREDITO_1A_V001]
const express = require('express');
const router = express.Router();
const cobranzaUniController = require('../controllers/cobranza-uni.controller');
const { requireAuth } = require('../middleware/auth.middleware');
const { requireIntegrationAuthFor } = require('../middleware/integration-auth.middleware');

const requireCobranzaUniIntegration = requireIntegrationAuthFor(
  'INTEGRATION_COBRANZA_UNI_ID'
);

router.get('/gestion-credito', requireAuth, cobranzaUniController.getGestionCredito);
router.get('/gestion-credito/:id/detalle', requireAuth, cobranzaUniController.getGestionCreditoDetalle);
router.get('/venta-adicional', requireAuth, cobranzaUniController.getVentaAdicional);
router.get('/venta-adicional/:id/detalle', requireAuth, cobranzaUniController.getVentaAdicionalDetalle);
router.post('/sync', requireCobranzaUniIntegration, cobranzaUniController.syncCobranzaUni);

module.exports = router;

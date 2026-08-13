// [Aster | 2026-08-12 | ASTER-MG | FASE: COBRANZA_UNI_BACKEND_V001]
const express = require('express');
const router = express.Router();
const cobranzaUniController = require('../controllers/cobranza-uni.controller');
const { requireIntegrationAuthFor } = require('../middleware/integration-auth.middleware');

const requireCobranzaUniIntegration = requireIntegrationAuthFor(
  'INTEGRATION_COBRANZA_UNI_ID'
);

router.post('/sync', requireCobranzaUniIntegration, cobranzaUniController.syncCobranzaUni);

module.exports = router;

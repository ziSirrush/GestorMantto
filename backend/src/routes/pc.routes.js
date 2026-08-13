// [Aster | 2026-08-12 | ASTER-MG | FASE: PC_BACKEND_V001]
const express = require('express');
const router = express.Router();
const pcController = require('../controllers/pc.controller');
const { requireIntegrationAuthFor } = require('../middleware/integration-auth.middleware');

const requireCobranzaUniIntegration = requireIntegrationAuthFor(
  'INTEGRATION_COBRANZA_UNI_ID'
);

router.post('/sync', requireCobranzaUniIntegration, pcController.syncPc);

module.exports = router;

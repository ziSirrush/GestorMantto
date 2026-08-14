// [Aster | 2026-08-12 | ASTER-MG | FASE: DETALLE_MP_2026_BACKEND_V001]
const express = require('express');
const router = express.Router();
const detalleMp2026Controller = require('../controllers/detalle-mp-2026.controller');
const { requireAuth } = require('../middleware/auth.middleware');
const { requireIntegrationAuthFor } = require('../middleware/integration-auth.middleware');

const requireCobranzaUniIntegration = requireIntegrationAuthFor(
  'INTEGRATION_COBRANZA_UNI_ID'
);

router.get('/', requireAuth, detalleMp2026Controller.getMainDetalleMp2026);
router.get('/:id', requireAuth, detalleMp2026Controller.getDetalleMp2026);

router.post('/sync', requireCobranzaUniIntegration, detalleMp2026Controller.syncDetalleMp2026);

module.exports = router;

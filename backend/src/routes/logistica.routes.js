// [Aster | 2026-08-12 | ASTER-MG | PATCH: FASE_2_BACKEND_M2M_GUARDS_V001]
const express = require('express');
const router = express.Router();
const logisticaController = require('../controllers/logistica.controller');
const { requireIntegrationAuthFor } = require('../middleware/integration-auth.middleware');

const requireLogisticaIntegration = requireIntegrationAuthFor('INTEGRATION_LOGISTICA_ID');

router.post('/sync', requireLogisticaIntegration, logisticaController.syncLogOps);
router.get('/', logisticaController.getLogOps);
router.get('/:id', logisticaController.getLogOpsById);

module.exports = router;

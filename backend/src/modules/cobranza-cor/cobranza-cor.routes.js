'use strict';

const express = require('express');
const controller = require('./cobranza-cor.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requireHistoricalSyncEnabled } = require('../../middleware/historical-sync.middleware');
const { requireIntegrationAuthFor } = require('../../middleware/integration-auth.middleware');

const router = express.Router();

// Cobranza COR reuses the same M2M credentials already approved for Ventas.
// No new integration id/secret is introduced in this phase.
const requireCobranzaCorIntegration = requireIntegrationAuthFor('INTEGRATION_VENTAS_ID', {
  whenDisabled: [requireAuth, requireHistoricalSyncEnabled]
});

router.post('/carga/indice', requireCobranzaCorIntegration, controller.cargarIndice_cor);
router.post('/carga/fuente', requireCobranzaCorIntegration, controller.cargarFuente_cor);
router.post('/carga/aditivas', requireCobranzaCorIntegration, controller.cargarAditivas_cor);

// Existing read routes remain reserved for the functional backend phase.
router.get('/aditivas', requireAuth, controller.aditivas_cor);
router.get('/adeudos-contractuales', requireAuth, controller.adeudosContractuales_cor);

module.exports = router;

'use strict';

const express = require('express');
const router = express.Router();
const detalleMp2026LegacyController = require('../controllers/detalle-mp-2026.controller');
// [Mantto Gestor | 2026-10-13 | FASE 2] Resumen y detalle de MP protegidos.
const relacionesProtegidasUni = require('../controllers/cobranza-uni-relaciones-protegidas.controller');
const { requireIntegrationAuthFor } = require('../middleware/integration-auth.middleware');
const { humanInformationGuard_gnral } = require('../middleware/information-access-gnral.middleware');

const requireCobranzaUniIntegration = requireIntegrationAuthFor('INTEGRATION_COBRANZA_UNI_ID');

const mantenimientoPreventivoGuard = humanInformationGuard_gnral({
  permissionCode: 'COBRANZA_UNI_MANTENIMIENTO_PREVENTIVO_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  domain: 'UNITED',
  groupingCode: 'COBRANZA_UNI'
});

router.get('/', ...mantenimientoPreventivoGuard, relacionesProtegidasUni.getMainDetalleMp2026);
router.get('/:id', ...mantenimientoPreventivoGuard, relacionesProtegidasUni.getDetalleMp2026);

// M2M: permanece fuera del alcance humano.
router.post('/sync', requireCobranzaUniIntegration, detalleMp2026LegacyController.syncDetalleMp2026);

module.exports = router;

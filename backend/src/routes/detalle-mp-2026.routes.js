'use strict';

const express = require('express');
const router = express.Router();
const detalleMp2026LegacyController = require('../controllers/detalle-mp-2026.controller');
const detalleMp2026CuartosController = require('../controllers/detalle-mp-2026-cuartos-v2.controller');
const { requireIntegrationAuthFor } = require('../middleware/integration-auth.middleware');
const { humanInformationGuard_gnral } = require('../middleware/information-access-gnral.middleware');

const requireCobranzaUniIntegration = requireIntegrationAuthFor('INTEGRATION_COBRANZA_UNI_ID');

const mantenimientoPreventivoGuard = humanInformationGuard_gnral({
  permissionCode: 'COBRANZA_UNI_MANTENIMIENTO_PREVENTIVO_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  domain: 'UNITED',
  groupingCode: 'COBRANZA_UNI'
});

router.get('/', ...mantenimientoPreventivoGuard, detalleMp2026CuartosController.getMainDetalleMp2026);
router.get('/:id', ...mantenimientoPreventivoGuard, detalleMp2026CuartosController.getDetalleMp2026);

// M2M: permanece fuera del alcance humano.
router.post('/sync', requireCobranzaUniIntegration, detalleMp2026LegacyController.syncDetalleMp2026);

module.exports = router;

'use strict';

const express = require('express');
const router = express.Router();
const cobranzaUniLegacyController = require('../controllers/cobranza-uni.controller');
const cobranzaUniCuartosController = require('../controllers/cobranza-uni-cuartos-v2.controller');
const { requireIntegrationAuthFor } = require('../middleware/integration-auth.middleware');
const { humanInformationGuard_gnral } = require('../middleware/information-access-gnral.middleware');

const requireCobranzaUniIntegration = requireIntegrationAuthFor('INTEGRATION_COBRANZA_UNI_ID');

function cobranzaUniGuard(permissionCode) {
  return humanInformationGuard_gnral({
    permissionCode,
    domain: 'UNITED',
    groupingCode: 'COBRANZA'
  });
}

const gestionCreditoGuard = cobranzaUniGuard('COBRANZA_UNI_ESTADOS_CUENTA_ACCESO_VISUAL_MODULO.ACCESO_VISUAL');
const ventaAdicionalGuard = cobranzaUniGuard('COBRANZA_UNI_ADITIVAS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL');

router.get('/gestion-credito', ...gestionCreditoGuard, cobranzaUniCuartosController.getGestionCredito);
router.get('/gestion-credito/:id/detalle', ...gestionCreditoGuard, cobranzaUniCuartosController.getGestionCreditoDetalle);
router.get('/venta-adicional', ...ventaAdicionalGuard, cobranzaUniCuartosController.getVentaAdicional);
router.get('/venta-adicional/:id/detalle', ...ventaAdicionalGuard, cobranzaUniCuartosController.getVentaAdicionalDetalle);

// M2M: no pasa por alcance humano.
router.post('/sync', requireCobranzaUniIntegration, cobranzaUniLegacyController.syncCobranzaUni);

module.exports = router;

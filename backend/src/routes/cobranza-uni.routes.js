'use strict';

const express = require('express');
const router = express.Router();
const cobranzaUniLegacyController = require('../controllers/cobranza-uni.controller');
const cobranzaUniCuartosController = require('../controllers/cobranza-uni-cuartos-v2.controller');
// [Mantto Gestor | 2026-10-13 | FASE 2] Lecturas cruzadas verificadas por identidad.
const relacionesProtegidasUni = require('../controllers/cobranza-uni-relaciones-protegidas.controller');
const { requireIntegrationAuthFor } = require('../middleware/integration-auth.middleware');
const { humanInformationGuard_gnral } = require('../middleware/information-access-gnral.middleware');

// [BLT NOW | 2026-10-23 | COBRANZA_UNI_ADMINISTRACION_FASE_2_V001]
const administracionUniRoutes = require('../modules/cobranza-uni-administracion/cobranza-uni-administracion.routes');

const requireCobranzaUniIntegration = requireIntegrationAuthFor('INTEGRATION_COBRANZA_UNI_ID');

function cobranzaUniGuard(permissionCode) {
  return humanInformationGuard_gnral({
    permissionCode,
    domain: 'UNITED',
    groupingCode: 'COBRANZA_UNI'
  });
}

const gestionCreditoGuard = cobranzaUniGuard('COBRANZA_UNI_ESTADOS_CUENTA_ACCESO_VISUAL_MODULO.ACCESO_VISUAL');
const ventaAdicionalGuard = cobranzaUniGuard('COBRANZA_UNI_ADITIVAS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL');

router.get('/gestion-credito', ...gestionCreditoGuard, cobranzaUniCuartosController.getGestionCredito);
router.get('/gestion-credito/:id/detalle', ...gestionCreditoGuard, relacionesProtegidasUni.getGestionCreditoDetalle);
router.get('/venta-adicional', ...ventaAdicionalGuard, cobranzaUniCuartosController.getVentaAdicional);
router.get('/venta-adicional/:id/detalle', ...ventaAdicionalGuard, relacionesProtegidasUni.getVentaAdicionalDetalle);

// M2M: no pasa por alcance humano.
router.post('/sync', requireCobranzaUniIntegration, cobranzaUniLegacyController.syncCobranzaUni);

// Rutas administrativas aisladas; el Guard valida permiso, puerta UNITED y alcance.
router.use('/administracion', administracionUniRoutes);

module.exports = router;

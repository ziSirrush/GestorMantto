'use strict';

const express = require('express');
const controller = require('./cobranza-cor.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requireHistoricalSyncEnabled } = require('../../middleware/historical-sync.middleware');
const { requireIntegrationAuthFor } = require('../../middleware/integration-auth.middleware');
const { humanInformationGuard_gnral } = require('../../middleware/information-access-gnral.middleware');

const router = express.Router();

// Cobranza COR reuses the same M2M credentials already approved for Ventas.
// No new integration id/secret is introduced by this FIX.
const requireCobranzaCorIntegration = requireIntegrationAuthFor('INTEGRATION_VENTAS_ID', {
  whenDisabled: [requireAuth, requireHistoricalSyncEnabled]
});

// CORELLIAN / COBRANZA keeps the existing central functional + information guard.
// Repository-level filtering now resolves each PPNS through ins_fl.id_proyecto and
// checks SUP/ASESOR against the centrally-resolved visible user set.
const requireEstadosCuentaCor = humanInformationGuard_gnral({
  permissionCode: 'COBRANZA_ESTADOS_CUENTA_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  domain: 'CORELLIAN',
  groupingCode: 'COBRANZA'
});

const requireAditivasCor = humanInformationGuard_gnral({
  permissionCode: 'COBRANZA_ADITIVAS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  domain: 'CORELLIAN',
  groupingCode: 'COBRANZA'
});

function rejectViewerMutation_cor(req, res, next) {
  if (req.viewerContext && req.viewerContext.active && req.viewerContext.readOnly) {
    return res.status(403).json({
      ok: false,
      code: 'VIEWER_READ_ONLY',
      message: 'El Visor de usuarios es de solo lectura. Sal del visor para realizar cambios en Cobranza.'
    });
  }
  return next();
}

router.post('/carga/fuente', requireCobranzaCorIntegration, controller.cargarFuente_cor);
router.post('/carga/aditivas', requireCobranzaCorIntegration, controller.cargarAditivas_cor);

router.get('/estados-cuenta', ...requireEstadosCuentaCor, controller.listarEstadosCuenta_cor);
router.get('/estados-cuenta/crear-nuevo/catalogo', ...requireEstadosCuentaCor, controller.catalogoCrearEstadoCuenta_cor);
router.post('/estados-cuenta', ...requireEstadosCuentaCor, rejectViewerMutation_cor, controller.crearEstadoCuenta_cor);
router.get('/estados-cuenta/:ppns/formulario', ...requireEstadosCuentaCor, controller.formularioEstadoCuenta_cor);
router.put('/estados-cuenta/:ppns', ...requireEstadosCuentaCor, rejectViewerMutation_cor, controller.actualizarEstadoCuenta_cor);
router.get('/estados-cuenta/:ppns', ...requireEstadosCuentaCor, controller.detalleEstadoCuenta_cor);

router.get('/aditivas', ...requireAditivasCor, controller.aditivas_cor);
router.post('/aditivas', ...requireAditivasCor, rejectViewerMutation_cor, controller.crearAditiva_cor);
router.get('/aditivas/:idAditivaCor', ...requireAditivasCor, controller.detalleAditiva_cor);
router.put('/aditivas/:idAditivaCor', ...requireAditivasCor, rejectViewerMutation_cor, controller.actualizarAditiva_cor);

router.get('/adeudos-contractuales', requireAuth, controller.adeudosContractuales_cor);

module.exports = router;

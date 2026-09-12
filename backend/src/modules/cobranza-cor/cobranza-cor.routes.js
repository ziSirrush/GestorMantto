'use strict';

const express = require('express');
const controller = require('./cobranza-cor.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requireHistoricalSyncEnabled } = require('../../middleware/historical-sync.middleware');
const { requireIntegrationAuthFor } = require('../../middleware/integration-auth.middleware');
const { humanInformationGuard_gnral } = require('../../middleware/information-access-gnral.middleware');

const router = express.Router();

// Cobranza COR reuses the same M2M credentials already approved for Ventas.
// No new integration id/secret is introduced in this phase.
const requireCobranzaCorIntegration = requireIntegrationAuthFor('INTEGRATION_VENTAS_ID', {
  whenDisabled: [requireAuth, requireHistoricalSyncEnabled]
});

// Estados de Cuenta pertenece a CORELLIAN / agrupacion COBRANZA.
// El Guard General resuelve sesion, permiso funcional, puerta de informacion
// y alcance de usuarios visible. El repositorio aplica ese alcance a ADM/SUP/VEND.
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
      message: 'El Visor de usuarios es de solo lectura. Sal del visor para crear o editar Aditivas.'
    });
  }
  return next();
}

router.post('/carga/indice', requireCobranzaCorIntegration, controller.cargarIndice_cor);
router.post('/carga/fuente', requireCobranzaCorIntegration, controller.cargarFuente_cor);
router.post('/carga/aditivas', requireCobranzaCorIntegration, controller.cargarAditivas_cor);

router.get('/estados-cuenta', ...requireEstadosCuentaCor, controller.listarEstadosCuenta_cor);
router.get('/estados-cuenta/:idIndiceCor', ...requireEstadosCuentaCor, controller.detalleEstadoCuenta_cor);

router.get('/aditivas', ...requireAditivasCor, controller.aditivas_cor);
router.post('/aditivas', ...requireAditivasCor, rejectViewerMutation_cor, controller.crearAditiva_cor);
router.get('/aditivas/:idAditivaCor', ...requireAditivasCor, controller.detalleAditiva_cor);
router.put('/aditivas/:idAditivaCor', ...requireAditivasCor, rejectViewerMutation_cor, controller.actualizarAditiva_cor);

// Existing read route remains reserved for the rest of the functional backend phase.
router.get('/adeudos-contractuales', requireAuth, controller.adeudosContractuales_cor);

module.exports = router;

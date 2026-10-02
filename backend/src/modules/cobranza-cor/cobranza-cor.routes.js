'use strict';

const express = require('express');
const controller = require('./cobranza-cor.controller');
const pagosController = require('./cobranza-cor-pagos.controller');
const pagosModuloController = require('./cobranza-cor-pagos-modulo.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requireHistoricalSyncEnabled } = require('../../middleware/historical-sync.middleware');
const { requireIntegrationAuthFor } = require('../../middleware/integration-auth.middleware');
const {
  humanInformationGuard_gnral,
  requireCompleteInformationDomain_gnral
} = require('../../middleware/information-access-gnral.middleware');

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

// FASE 2 / Modulo Pagos: mientras Pago -> PPNS no este resuelto, la lectura
// humana del universo crudo de pagos solo se permite con alcance completo de
// CORELLIAN. Esto evita exponer filas sin una llave de alcance resoluble.
const requirePagosCor = humanInformationGuard_gnral({
  permissionCode: 'COBRANZA_PAGOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  domain: 'CORELLIAN',
  groupingCode: 'COBRANZA'
});
const requirePagosCorCompleteDomain = requireCompleteInformationDomain_gnral('CORELLIAN');

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
router.post('/carga/facturas', requireCobranzaCorIntegration, controller.cargarFacturas_cor);

// Carga de Pagos desde Hoja SB: autentica la integracion y persiste por id_pago.
router.post('/carga/pagos', requireCobranzaCorIntegration, pagosController.cargarPagos_cor);

// Modulo Pagos: lectura general + relacion manual Pago -> Proyecto/PPNS.
// La bandeja general conserva alcance completo porque tambien contiene pagos aun sin proyecto.
router.get('/pagos', ...requirePagosCor, requirePagosCorCompleteDomain, pagosModuloController.listarPagos_cor);
router.get('/pagos/proyectos', ...requirePagosCor, requirePagosCorCompleteDomain, pagosModuloController.listarProyectos_cor);
router.get('/pagos/:idPagoCor', ...requirePagosCor, requirePagosCorCompleteDomain, pagosModuloController.detallePago_cor);
router.put('/pagos/:idPagoCor/proyecto', ...requirePagosCor, requirePagosCorCompleteDomain, rejectViewerMutation_cor, pagosModuloController.asignarProyecto_cor);
router.delete('/pagos/:idPagoCor/proyecto', ...requirePagosCor, requirePagosCorCompleteDomain, rejectViewerMutation_cor, pagosModuloController.quitarProyecto_cor);

router.get('/estados-cuenta', ...requireEstadosCuentaCor, controller.listarEstadosCuenta_cor);
router.get('/estados-cuenta/crear-nuevo/catalogo', ...requireEstadosCuentaCor, controller.catalogoCrearEstadoCuenta_cor);
router.post('/estados-cuenta', ...requireEstadosCuentaCor, rejectViewerMutation_cor, controller.crearEstadoCuenta_cor);
router.get('/estados-cuenta/:ppns/formulario', ...requireEstadosCuentaCor, controller.formularioEstadoCuenta_cor);
router.put('/estados-cuenta/:ppns', ...requireEstadosCuentaCor, rejectViewerMutation_cor, controller.actualizarEstadoCuenta_cor);
router.post('/estados-cuenta/:ppns/facturas', ...requireEstadosCuentaCor, rejectViewerMutation_cor, controller.crearFacturaEstadoCuenta_cor);
router.put('/estados-cuenta/:ppns/pagos/:idPagoCor/facturas/:idFacturaCor', ...requireEstadosCuentaCor, rejectViewerMutation_cor, controller.guardarRelacionPagoFacturaEstadoCuenta_cor);
router.delete('/estados-cuenta/:ppns/pagos/:idPagoCor/facturas/:idFacturaCor', ...requireEstadosCuentaCor, rejectViewerMutation_cor, controller.quitarRelacionPagoFacturaEstadoCuenta_cor);
router.get('/estados-cuenta/:ppns', ...requireEstadosCuentaCor, controller.detalleEstadoCuenta_cor);

router.get('/aditivas', ...requireAditivasCor, controller.aditivas_cor);
router.post('/aditivas', ...requireAditivasCor, rejectViewerMutation_cor, controller.crearAditiva_cor);
router.get('/aditivas/:idAditivaCor', ...requireAditivasCor, controller.detalleAditiva_cor);
router.put('/aditivas/:idAditivaCor', ...requireAditivasCor, rejectViewerMutation_cor, controller.actualizarAditiva_cor);

router.get('/adeudos-contractuales', requireAuth, controller.adeudosContractuales_cor);

module.exports = router;

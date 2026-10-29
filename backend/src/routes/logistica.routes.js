// [Aster | 2026-10-29 | ASTER-MG | P0 LOGISTICA AUTORIZACION CORELLIAN V001]
const express = require('express');
const router = express.Router();
const logisticaController = require('../controllers/logistica.controller');
const { requireIntegrationAuthFor } = require('../middleware/integration-auth.middleware');
const {
  humanInformationGuard_gnral,
  requireCompleteInformationDomain_gnral
} = require('../middleware/information-access-gnral.middleware');

const requireLogisticaIntegration = requireIntegrationAuthFor('INTEGRATION_LOGISTICA_ID');

// log_ops solo contiene asesor/supervisor como texto. Sin IDs verificables
// no es seguro aplicar alcance parcial CORELLIAN a los registros.
// La lectura sigue la misma politica fail-closed del Dashboard Logistica.
const listGuard_cor = humanInformationGuard_gnral({
  permissionCodesAny: [
    'LOGISTICA_DASHBOARD_PIPELINE_POR_ESTATUS_ETAPAS.VER',
    'LOGISTICA_REPORTE_DETALLE_POR_ESTATUS_TABLA.VER',
    'LOGISTICA_REPORTE_DETALLE_POR_ESTATUS_ACORDEONES.VER'
  ],
  domain: 'CORELLIAN',
  groupingCodesAny: ['LOGISTICA']
});
const detailGuard_cor = humanInformationGuard_gnral({
  permissionCodesAny: [
    'LOGISTICA_REPORTE_DETALLE_POR_ESTATUS_DETALLE.VER',
    'LOGISTICA_REPORTE_DETALLE_POR_ESTATUS_TABLA.ABRIR_DETALLE',
    'LOGISTICA_DASHBOARD_MOVIMIENTOS_SEMANALES_TABLA.ABRIR_DETALLE',
    'LOGISTICA_DASHBOARD_PROYECTOS_SIN_PP_NS_TABLA.ABRIR_DETALLE'
  ],
  domain: 'CORELLIAN',
  groupingCodesAny: ['LOGISTICA']
});
const requireFullLogisticaScope_cor = requireCompleteInformationDomain_gnral('CORELLIAN');

// La sincronizacion M2M permanece separada de los permisos humanos.
router.post('/sync', requireLogisticaIntegration, logisticaController.syncLogOps);
router.get('/', ...listGuard_cor, requireFullLogisticaScope_cor, logisticaController.getLogOps);
router.get('/:id', ...detailGuard_cor, requireFullLogisticaScope_cor, logisticaController.getLogOpsById);

module.exports = router;

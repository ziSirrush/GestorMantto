// [Aster | 2026-08-21 | ASTER-MG | FASE 9/11: Movimientos Portafolio por cuartos UNITED]
const express = require('express');
const router = express.Router();
const portafolioController = require('./portafolio.controller');
const { requireIntegrationAuthFor } = require('../../middleware/integration-auth.middleware');
const {
  humanInformationGuard_gnral,
  dynamicHumanInformationGuard_gnral
} = require('../../middleware/information-access-gnral.middleware');
const {
  requirePortafolioEquipmentScope_gnral,
  requirePortafolioProjectScope_gnral,
  filterPortafolioEquipmentBodyScope_gnral,
  requireContextualEquipmentScope_gnral
} = require('../../services/information-record-scope-gnral.service');

const requirePortafolioIntegration = requireIntegrationAuthFor('INTEGRATION_PORTAFOLIO_ID');
const { requireProgrammerRole } = require('../../middleware/historical-sync.middleware');

const PORTAFOLIO_READ_PERMISSIONS = Object.freeze([
  'PORTAFOLIO_DASHBOARD_PORTAFOLIO_TABLA_PROYECTOS_PORTAFOLIO_TABLA_PORTAFOLIO.VER',
  'PORTAFOLIO_PROYECTOS_DE_MANTENIMIENTO_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  'PORTAFOLIO_MOVIMIENTOS_PORTAFOLIO_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  'OPERACION_RESUMEN_DEL_DIA_TICKET_PERIODO_TICKETS_DEL_PERIODO.VER_EQUIPO',
  'OPERACION_RESUMEN_DEL_DIA_TICKET_PERIODO_TICKETS_DEL_PERIODO.VER_PROYECTO',
  'OPERACION_DASHBOARD_CALL_CENTER_TABLA_EQUIPOS_EQUIPOS_CON_MAS_LLAMADAS_DEL_PERIODO.VER_EQUIPO',
  'OPERACION_DASHBOARD_CALL_CENTER_TABLA_PROYECTOS_PROYECTOS_CON_MAS_LLAMADAS_DEL_PERIODO.VER_PROYECTO',
  'OPERACION_EQUIPOS_CRITICOS_EQUIPOS_CRITICOS_EQUIPOS_CRITICOS.VER_EQUIPO',
  'OPERACION_EQUIPOS_CRITICOS_PROYECTOS_CRITICOS_PROYECTOS_CRITICOS.VER_PROYECTO',
  'RESUMEN_DIA_EXP_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  'EQUIPOS_CRITICOS_EXP_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  'DASHBOARD_CALL_CENTER_EXP_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  'PROYECTOS_CRITICOS_EXP_ACCESO_VISUAL_MODULO.ACCESO_VISUAL'
]);

const PORTAFOLIO_DETAIL_PERMISSIONS = Object.freeze([
  'PORTAFOLIO_DASHBOARD_PORTAFOLIO_TABLA_PROYECTOS_PORTAFOLIO_TABLA_PORTAFOLIO.ABRIR_DETALLE',
  'PORTAFOLIO_DASHBOARD_PORTAFOLIO_TABLA_PROYECTOS_PORTAFOLIO_TABLA_PORTAFOLIO.VER_EQUIPO',
  'PORTAFOLIO_DASHBOARD_PORTAFOLIO_TABLA_PROYECTOS_PORTAFOLIO_TABLA_PORTAFOLIO.VER_PROYECTO',
  'PORTAFOLIO_PROYECTOS_DE_MANTENIMIENTO_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  'OPERACION_RESUMEN_DEL_DIA_TICKET_PERIODO_TICKETS_DEL_PERIODO.VER_EQUIPO',
  'OPERACION_RESUMEN_DEL_DIA_TICKET_PERIODO_TICKETS_DEL_PERIODO.VER_PROYECTO',
  'OPERACION_DASHBOARD_CALL_CENTER_TABLA_EQUIPOS_EQUIPOS_CON_MAS_LLAMADAS_DEL_PERIODO.VER_EQUIPO',
  'OPERACION_DASHBOARD_CALL_CENTER_TABLA_PROYECTOS_PROYECTOS_CON_MAS_LLAMADAS_DEL_PERIODO.VER_PROYECTO',
  'OPERACION_EQUIPOS_CRITICOS_EQUIPOS_CRITICOS_EQUIPOS_CRITICOS.VER_EQUIPO',
  'OPERACION_EQUIPOS_CRITICOS_PROYECTOS_CRITICOS_PROYECTOS_CRITICOS.VER_PROYECTO',
  'RESUMEN_DIA_EXP_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  'EQUIPOS_CRITICOS_EXP_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  'DASHBOARD_CALL_CENTER_EXP_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  'PROYECTOS_CRITICOS_EXP_ACCESO_VISUAL_MODULO.ACCESO_VISUAL'
]);

function unitedGroupingPermissionPairs(permissionCodes) {
  const pairs = [
    {
      groupingCode: 'PORTAFOLIO',
      permissionCodesAny: permissionCodes.filter((code) => code.startsWith('PORTAFOLIO_'))
    },
    {
      groupingCode: 'OPERACION',
      permissionCodesAny: permissionCodes.filter((code) => code.startsWith('OPERACION_'))
    },
    {
      groupingCode: 'EXPERIMENTAL',
      permissionCodesAny: permissionCodes.filter((code) => code.includes('_EXP_'))
    }
  ].filter((pair) => pair.permissionCodesAny.length);

  const pairedCodes = new Set(pairs.flatMap((pair) => pair.permissionCodesAny));
  const unpaired = permissionCodes.filter((code) => !pairedCodes.has(code));
  if (unpaired.length) {
    throw new Error(`Permisos UNITED sin agrupacion emparejada: ${unpaired.join(', ')}`);
  }
  return pairs;
}

const portafolioReadGuard = humanInformationGuard_gnral({
  domain: 'UNITED',
  groupingPermissionPairsAny: unitedGroupingPermissionPairs(PORTAFOLIO_READ_PERMISSIONS)
});

// FASE 7/11: la carga inicial de Dashboard Portafolio no puede abrirse por
// una puerta OPERACION/EXPERIMENTAL. Debe resolver especificamente PORTAFOLIO.
const dashboardPortafolioGuard = humanInformationGuard_gnral({
  permissionCodesAny: [
    'PORTAFOLIO_DASHBOARD_PORTAFOLIO_TABLA_PROYECTOS_PORTAFOLIO_TABLA_PORTAFOLIO.VER'
  ],
  domain: 'UNITED',
  groupingCode: 'PORTAFOLIO'
});

const portafolioDetailGuard = humanInformationGuard_gnral({
  domain: 'UNITED',
  groupingPermissionPairsAny: unitedGroupingPermissionPairs(PORTAFOLIO_DETAIL_PERMISSIONS)
});

// FASE 9/11: Movimientos tiene puerta funcional propia. No se hereda acceso
// desde Dashboard Portafolio, Operacion ni Experimental.
const movimientosGuard = humanInformationGuard_gnral({
  permissionCode: 'PORTAFOLIO_MOVIMIENTOS_PORTAFOLIO_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  domain: 'UNITED',
  groupingCode: 'PORTAFOLIO'
});

const contextualEquipmentGuard = dynamicHumanInformationGuard_gnral((req) => {
  const raw = String(req.params?.codigo || '').trim();
  if (raw.includes('|||')) {
    return {
      permissionCodesAny: [
        'INSTALACIONES_PROYECTOS_TABLA_ACTIVOS_REGISTROS.ABRIR_DETALLE',
        'INSTALACIONES_PROYECTOS_TABLA_ACTIVOS_REGISTROS.VER'
      ],
      domain: 'CORELLIAN',
      groupingCodesAny: ['INSTALACIONES']
    };
  }
  return {
    domain: 'UNITED',
    groupingPermissionPairsAny: unitedGroupingPermissionPairs(PORTAFOLIO_DETAIL_PERMISSIONS)
  };
});

router.get(
  '/portafolio/dashboard/inicial',
  ...dashboardPortafolioGuard,
  portafolioController.getPortafolioDashboardInicial
);
router.get(
  '/portafolio/dashboard/equipos',
  ...dashboardPortafolioGuard,
  portafolioController.getPortafolioEquipos
);
router.get('/portafolio/filtros', ...portafolioReadGuard, portafolioController.getPortafolioFiltros);
router.get('/portafolio/dashboard', ...portafolioReadGuard, portafolioController.getPortafolioDashboard);
router.get(
  '/portafolio/movimientos/inicial',
  ...movimientosGuard,
  portafolioController.getPortafolioMovimientosInicial
);
router.get('/portafolio/movimientos', ...movimientosGuard, portafolioController.getPortafolioMovimientos);

// FASE 9/11: los snapshots JSON semanales no tienen FK territorial propia.
// El handler filtra cada renglon por numero de equipo contra Portafolio actual
// ya limitado por usuario_zop y canoniza la zona con z_op. No se exige acceso
// a todos los cuartos y nunca se autoriza por el texto historico row.zona.
router.get(
  '/portafolio/movimientos-semanales/catalogo',
  ...movimientosGuard,
  portafolioController.getPortafolioSemanasDisponibles
);
router.get(
  '/portafolio/movimientos-semanales',
  ...movimientosGuard,
  portafolioController.getPortafolioMovimientosSemanales
);
router.post(
  '/portafolio/movimientos-semanales/corte',
  ...movimientosGuard,
  requireProgrammerRole,
  portafolioController.ejecutarCorteSemanalManual
);
router.get(
  '/portafolio/movimientos/:codigo/detalle',
  ...movimientosGuard,
  requirePortafolioEquipmentScope_gnral,
  portafolioController.getPortafolioMovimientoDetalle
);
router.post(
  '/portafolio/equipos/tickets-lote',
  ...portafolioDetailGuard,
  filterPortafolioEquipmentBodyScope_gnral,
  portafolioController.getPortafolioEquipoTicketsLote
);
router.get(
  '/portafolio/equipos/:codigo',
  ...contextualEquipmentGuard,
  requireContextualEquipmentScope_gnral,
  portafolioController.getPortafolioEquipoDetalle
);
router.get('/portafolio/equipos', ...portafolioReadGuard, portafolioController.getPortafolioEquipos);
router.get(
  '/portafolio/proyectos/detalle/:proyecto',
  ...portafolioDetailGuard,
  requirePortafolioProjectScope_gnral,
  portafolioController.getPortafolioProyectoDetalle
);
router.get('/portafolio', ...portafolioReadGuard, portafolioController.getPortafolio);
router.post('/portafolio/sync', requirePortafolioIntegration, portafolioController.syncPortafolio);
router.get('/equipos', ...portafolioReadGuard, portafolioController.getEquipos);

module.exports = router;

// [Fase 8/11 | Portafolio > Proyectos de Mantenimiento | Cuartos UNITED]
const express = require('express');
const proyectosController = require('./proyectos.controller');
const {
  humanInformationGuard_gnral
} = require('../../middleware/information-access-gnral.middleware');
const {
  requirePortafolioProjectScope_gnral
} = require('../../services/information-record-scope-gnral.service');

const router = express.Router();

const PROJECT_MAINTENANCE_PERMISSION =
  'PORTAFOLIO_PROYECTOS_DE_MANTENIMIENTO_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';

const projectMaintenanceGuard = humanInformationGuard_gnral({
  permissionCodesAny: [PROJECT_MAINTENANCE_PERMISSION],
  domain: 'UNITED',
  groupingCodesAny: ['PORTAFOLIO']
});

const PROJECT_READ_PERMISSIONS = Object.freeze([
  PROJECT_MAINTENANCE_PERMISSION,
  'PORTAFOLIO_DASHBOARD_PORTAFOLIO_TABLA_PROYECTOS_PORTAFOLIO_TABLA_PORTAFOLIO.VER_PROYECTO',
  'OPERACION_RESUMEN_DEL_DIA_TICKET_PERIODO_TICKETS_DEL_PERIODO.VER_PROYECTO',
  'OPERACION_DASHBOARD_CALL_CENTER_TABLA_PROYECTOS_PROYECTOS_CON_MAS_LLAMADAS_DEL_PERIODO.VER_PROYECTO',
  'OPERACION_EQUIPOS_CRITICOS_PROYECTOS_CRITICOS_PROYECTOS_CRITICOS.VER_PROYECTO',
  'RESUMEN_DIA_EXP_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  'PROYECTOS_CRITICOS_EXP_ACCESO_VISUAL_MODULO.ACCESO_VISUAL'
]);

function projectGroupingPermissionPairs() {
  return [
    {
      groupingCode: 'PORTAFOLIO',
      permissionCodesAny: PROJECT_READ_PERMISSIONS.filter((code) => code.startsWith('PORTAFOLIO_'))
    },
    {
      groupingCode: 'OPERACION',
      permissionCodesAny: PROJECT_READ_PERMISSIONS.filter((code) => code.startsWith('OPERACION_'))
    },
    {
      groupingCode: 'EXPERIMENTAL',
      permissionCodesAny: PROJECT_READ_PERMISSIONS.filter((code) => code.includes('_EXP_'))
    }
  ].filter((pair) => pair.permissionCodesAny.length);
}

const projectGuard = humanInformationGuard_gnral({
  domain: 'UNITED',
  groupingPermissionPairsAny: projectGroupingPermissionPairs()
});

// Primera llamada propia del modulo. No comparte puerta con Operacion/Experimental.
router.get('/proyectos/inicial', ...projectMaintenanceGuard, proyectosController.getProyectosInicial);

// Rutas compartidas: se conservan para navegacion contextual desde otros modulos.
router.get('/proyectos/filtros', ...projectGuard, proyectosController.getProyectosFiltros);
router.get('/proyectos/detalle', ...projectGuard, requirePortafolioProjectScope_gnral, proyectosController.getProyectoDetalle);
router.get('/proyectos/detalle/:proyecto', ...projectGuard, requirePortafolioProjectScope_gnral, proyectosController.getProyectoDetalle);
router.get('/proyectos/:proyecto', ...projectGuard, requirePortafolioProjectScope_gnral, proyectosController.getProyectoDetalle);
router.get('/proyectos', ...projectGuard, proyectosController.getProyectos);

module.exports = router;

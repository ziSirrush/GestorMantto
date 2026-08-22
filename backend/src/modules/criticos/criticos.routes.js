'use strict';

const express = require('express');
const criticosController = require('./criticos.controller');
const { humanInformationGuard_gnral } = require('../../middleware/information-access-gnral.middleware');
const {
  requirePortafolioEquipmentScope_gnral,
  requirePortafolioProjectScope_gnral
} = require('../../services/information-record-scope-gnral.service');

const router = express.Router();

function operationGuard_uni(permissionCodesAny) {
  return humanInformationGuard_gnral({
    permissionCodesAny,
    domain: 'UNITED',
    groupingCode: 'OPERACION'
  });
}

const criticalEquipmentView_uni = [
  'OPERACION_EQUIPOS_CRITICOS_EQUIPOS_CRITICOS_EQUIPOS_CRITICOS.VER'
];
const criticalEquipmentTickets_uni = [
  'OPERACION_EQUIPOS_CRITICOS_EQUIPOS_CRITICOS_EQUIPOS_CRITICOS.VER_TICKETS'
];
const criticalProjectView_uni = [
  'OPERACION_EQUIPOS_CRITICOS_PROYECTOS_CRITICOS_PROYECTOS_CRITICOS.VER'
];
const criticalProjectTickets_uni = [
  'OPERACION_EQUIPOS_CRITICOS_PROYECTOS_CRITICOS_PROYECTOS_CRITICOS.VER_TICKETS'
];

router.get(
  '/indicadores/mtbc/equipos',
  ...operationGuard_uni([
    ...criticalEquipmentView_uni,
    'OPERACION_DASHBOARD_CALL_CENTER_KPI_PROM_MTBC_ANO_ACTUAL.VER',
    'OPERACION_DASHBOARD_CALL_CENTER_KPI_PROM_MTBC_U365.VER'
  ]),
  criticosController.getMtbcEquipos
);
router.get(
  '/indicadores/mtbc/proyectos',
  ...operationGuard_uni([
    ...criticalProjectView_uni,
    'OPERACION_DASHBOARD_CALL_CENTER_KPI_PROM_MTBC_ANO_ACTUAL.VER',
    'OPERACION_DASHBOARD_CALL_CENTER_KPI_PROM_MTBC_U365.VER'
  ]),
  criticosController.getMtbcProyectos
);
router.get(
  '/callcenter/u365/proyectos',
  ...operationGuard_uni(['OPERACION_DASHBOARD_CALL_CENTER_U365D_LLAMADAS_U365D_PROYECTO.VER']),
  criticosController.getCallCenterU365Proyectos
);
router.get(
  '/callcenter/u365/equipos',
  ...operationGuard_uni(['OPERACION_DASHBOARD_CALL_CENTER_U365D_LLAMADAS_U365D_EQUIPO.VER']),
  criticosController.getCallCenterU365Equipos
);
router.get(
  '/criticidad-corporativa',
  ...operationGuard_uni([...criticalEquipmentView_uni, ...criticalProjectView_uni]),
  criticosController.getCriticidadCorporativa
);
router.get(
  '/equipos-criticos',
  ...operationGuard_uni(criticalEquipmentView_uni),
  criticosController.getEquiposCriticos
);
router.get(
  '/equipos-criticos/:codigo/tickets',
  ...operationGuard_uni(criticalEquipmentTickets_uni),
  requirePortafolioEquipmentScope_gnral,
  criticosController.getEquipoCriticoTickets
);
router.get(
  '/proyectos-criticos',
  ...operationGuard_uni(criticalProjectView_uni),
  criticosController.getProyectosCriticos
);
router.get(
  '/proyectos-criticos/:proyecto/tickets',
  ...operationGuard_uni(criticalProjectTickets_uni),
  requirePortafolioProjectScope_gnral,
  criticosController.getProyectoCriticoTickets
);

module.exports = router;

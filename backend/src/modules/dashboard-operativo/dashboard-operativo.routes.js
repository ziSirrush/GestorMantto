'use strict';

const express = require('express');
const dashboardOperativoController = require('./dashboard-operativo.controller');
const { humanInformationGuard_gnral } = require('../../middleware/information-access-gnral.middleware');

const router = express.Router();

const DASHBOARD_OPERATIVO_READ_PERMISSIONS = Object.freeze([
  'OPERACION_DASHBOARD_OPERATIVO_KPI_TOTAL_DE_EQUIPOS.VER',
  'OPERACION_DASHBOARD_OPERATIVO_KPI_CON_SERVICIO.VER',
  'OPERACION_DASHBOARD_OPERATIVO_KPI_PENDIENTES.VER',
  'OPERACION_DASHBOARD_OPERATIVO_KPI_TOTAL_DE_TICKETS.VER',
  'OPERACION_DASHBOARD_OPERATIVO_KPI_VALIDADOS.VER',
  'OPERACION_DASHBOARD_OPERATIVO_KPI_PEND_VALIDAR.VER',
  'OPERACION_DASHBOARD_OPERATIVO_GRAFICAS_SERVICIO_PREVENTIVO_POR_ZONA.VER',
  'OPERACION_DASHBOARD_OPERATIVO_GRAFICAS_SERVICIO_PREVENTIVO_POR_SUPERVISOR.VER',
  'OPERACION_DASHBOARD_OPERATIVO_GRAFICAS_VO_BO_VALIDADOS_POR_ZONA.VER',
  'OPERACION_DASHBOARD_OPERATIVO_GRAFICAS_VO_BO_VALIDADOS_POR_SUPERVISOR.VER'
]);

const dashboardOperativoInitialGuard_uni = humanInformationGuard_gnral({
  permissionCodesAny: DASHBOARD_OPERATIVO_READ_PERMISSIONS,
  domain: 'UNITED',
  groupingCodesAny: ['OPERACION']
});

const preventivosSupervisorGuard_uni = humanInformationGuard_gnral({
  permissionCode: 'OPERACION_DASHBOARD_OPERATIVO_GRAFICAS_SERVICIO_PREVENTIVO_POR_SUPERVISOR.VER',
  domain: 'UNITED',
  groupingCode: 'OPERACION'
});

router.get(
  '/operacion/dashboard-operativo/inicial',
  ...dashboardOperativoInitialGuard_uni,
  dashboardOperativoController.getInitialData
);

router.get(
  '/servicios-preventivos/resumen-supervisor',
  ...preventivosSupervisorGuard_uni,
  dashboardOperativoController.getPreventivosSupervisor
);

module.exports = router;

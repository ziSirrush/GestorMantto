'use strict';

const express = require('express');
const controller = require('./offline-pilot.controller');
const {humanInformationGuard_gnral} = require('../../middleware/information-access-gnral.middleware');
const {OFFLINE_PILOT_PERMISSION} = require('./offline-pilot.service');

const router = express.Router();
const offlinePilotGuard = humanInformationGuard_gnral({
  permissionCode: OFFLINE_PILOT_PERMISSION,
  domain: 'GENERAL',
  groupingCode: 'MODO_OFFLINE'
});

// MISMO conjunto de permisos de lectura de backend/src/routes/data/resumen-dia.routes.js.
// No es suficiente el permiso general offline: se exige tambien OPERACION + alcance UNITED.
const RESUMEN_DIA_READ_PERMISSIONS = Object.freeze([
  'OPERACION_RESUMEN_DEL_DIA_GRAFICAS_CAUSA_FALLA_BLT.VER',
  'OPERACION_RESUMEN_DEL_DIA_GRAFICAS_CAUSA_FALLA_CLIENTE.VER',
  'OPERACION_RESUMEN_DEL_DIA_GRAFICAS_ESTADO_TICKETS.VER',
  'OPERACION_RESUMEN_DEL_DIA_GRAFICAS_FALLAS_POR_ESTADO_DE_LA_REPUBLICA.VER',
  'OPERACION_RESUMEN_DEL_DIA_GRAFICAS_POR_TIPO_DE_EQUIPO.VER',
  'OPERACION_RESUMEN_DEL_DIA_GRAFICAS_RESPONSABILIDAD.VER',
  'OPERACION_RESUMEN_DEL_DIA_GRAFICAS_TICKETS_POR_ZONA_OPERATIVA.VER',
  'OPERACION_RESUMEN_DEL_DIA_KPI_ATRAPADOS.VER',
  'OPERACION_RESUMEN_DEL_DIA_KPI_CERRADOS.VER',
  'OPERACION_RESUMEN_DEL_DIA_KPI_EN_CRITICOS.VER',
  'OPERACION_RESUMEN_DEL_DIA_KPI_EN_CURSO.VER',
  'OPERACION_RESUMEN_DEL_DIA_KPI_FILTRACIONES.VER',
  'OPERACION_RESUMEN_DEL_DIA_KPI_FUERA_DE_SLA.VER',
  'OPERACION_RESUMEN_DEL_DIA_KPI_NO_FUNCIONANDO.VER',
  'OPERACION_RESUMEN_DEL_DIA_KPI_PROM_CIERRE.VER',
  'OPERACION_RESUMEN_DEL_DIA_KPI_PROM_LLEGADA.VER',
  'OPERACION_RESUMEN_DEL_DIA_KPI_RESP_BLT.VER',
  'OPERACION_RESUMEN_DEL_DIA_KPI_RESP_CLIENTE.VER',
  'OPERACION_RESUMEN_DEL_DIA_KPI_TICKETS.VER',
  'OPERACION_RESUMEN_DEL_DIA_KPI_VOLTAJE.VER',
  'OPERACION_RESUMEN_DEL_DIA_TICKET_PERIODO_TICKETS_DEL_PERIODO.VER'
]);
const resumenDiaGuard = humanInformationGuard_gnral({
  permissionCodesAny: RESUMEN_DIA_READ_PERMISSIONS,
  domain: 'UNITED',
  groupingCodesAny: ['OPERACION']
});

router.get('/capabilities', ...offlinePilotGuard, controller.getCapabilities);
const proyectosGuard = humanInformationGuard_gnral({
  permissionCodesAny: ['INSTALACIONES_PROYECTOS_TABLA_ACTIVOS_REGISTROS.VER'],
  domain:'CORELLIAN',groupingCodesAny:['INSTALACIONES']
});
function setOfflineDataset(name){return (req,_res,next)=>{req.offlineExportDataset=name;next();};}

router.get('/export/resumen-dia/manifest', ...offlinePilotGuard, ...resumenDiaGuard, setOfflineDataset('operacion-resumen-dia'), controller.exportResumenDiaManifest);
router.get('/export/resumen-dia/page', ...offlinePilotGuard, ...resumenDiaGuard, setOfflineDataset('operacion-resumen-dia'), controller.exportResumenDiaPage);

router.get('/export/instalaciones-proyectos/manifest',...offlinePilotGuard,...proyectosGuard,setOfflineDataset('instalaciones-proyectos'),controller.exportResumenDiaManifest);
router.get('/export/instalaciones-proyectos/page',...offlinePilotGuard,...proyectosGuard,setOfflineDataset('instalaciones-proyectos'),controller.exportResumenDiaPage);

// Fase 5: Guard GENERAL + Guard del modulo/dominio en CADA escritura.
// El servicio verifica ademas identidad, scope exacto y fila actual.
router.post('/actions/sync/united',...offlinePilotGuard,...resumenDiaGuard,
  (req,_res,next)=>{req.offlineSyncDomain='UNITED';next();},controller.syncOfflineAction);
router.post('/actions/sync/corellian',...offlinePilotGuard,...proyectosGuard,
  (req,_res,next)=>{req.offlineSyncDomain='CORELLIAN';next();},controller.syncOfflineAction);

module.exports = router;

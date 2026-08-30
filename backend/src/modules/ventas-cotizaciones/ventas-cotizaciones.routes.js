// [Aster | 2026-08-19 | ASTER-MG | FASE 1 VENTAS: Guard General y permisos funcionales]
// [Aster | 2026-08-30 | ASTER-MG | FASE 3 DASHBOARD VENTAS: Proyecto de interés personal]
// [Aster | 2026-08-30 | ASTER-MG | FASE 6 VENTAS: Sección personal Proyectos de interés]
'use strict';

const express = require('express');
const controller = require('./ventas-cotizaciones.controller');
const interestController = require('./ventas-cotizaciones-interes.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requireHistoricalSyncEnabled } = require('../../middleware/historical-sync.middleware');
const { requireIntegrationAuthFor } = require('../../middleware/integration-auth.middleware');
const { requireStorageSchema, requireStorageSchemaWhenFiles } = require('../../middleware/storage-schema.middleware');
const { createUploadMiddleware_gnral } = require('../../middleware/storage-upload.middleware');
const { humanInformationGuard_gnral } = require('../../middleware/information-access-gnral.middleware');

const router = express.Router();
const uploadInteractionFile = createUploadMiddleware_gnral({
  mode: 'single',
  fieldName: 'archivo',
  maxFiles: 1,
  policyName: 'GENERAL',
  maxFileMb: Number(process.env.AZURE_STORAGE_MAX_FILE_MB || 25),
  maxRequestMb: Number(process.env.CFFAA_STORAGE_MAX_REQUEST_MB || 50)
});

const requireVentasHistoricalIntegration = requireIntegrationAuthFor('INTEGRATION_VENTAS_ID', {
  whenDisabled: [requireAuth, requireHistoricalSyncEnabled]
});

function ventasGuard(permissionCodesAny) {
  return humanInformationGuard_gnral({
    permissionCodesAny: Array.isArray(permissionCodesAny) ? permissionCodesAny : [permissionCodesAny],
    domain: 'CORELLIAN',
    groupingCodesAny: ['VENTAS']
  });
}

const COTIZACIONES_VISUAL = 'VENTAS_COTIZACIONES_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';
const VENDIDOS_VISUAL = 'VENTAS_VENDIDOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';
const PERDIDOS_VISUAL = 'VENTAS_PERDIDOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';
const PROYECCION_VISUAL = 'VENTAS_PROYECCION_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';

const COTIZACIONES_DETAIL_ACCESS = Object.freeze([
  'VENTAS_COTIZACIONES_TABLA_COTIZACIONES_DETALLE_COTIZACION.VER',
  'VENTAS_COTIZACIONES_TABLA_COTIZACIONES_LISTADO_COTIZACIONES.ABRIR_DETALLE',
  'VENTAS_VENDIDOS_TABLA_COTIZACIONES_VENDIDAS_LISTADO.ABRIR_DETALLE',
  'VENTAS_PERDIDOS_TABLA_COTIZACIONES_PERDIDAS_LISTADO.ABRIR_DETALLE',
  'VENTAS_PROYECCION_TABLA_COTIZACIONES_POR_ESTATUS_LISTADO.ABRIR_DETALLE',
  'VENTAS_ASIGNACION_REDES_TABLA_REGISTROS_RELACION_COTIZACION.ABRIR_DETALLE',
  'VENTAS_DASHBOARD_TABLAS_CONSULTA_COTIZACIONES.ABRIR_DETALLE',
  'VENTAS_DASHBOARD_TABLAS_CONSULTA_VENDIDOS.ABRIR_DETALLE',
  'VENTAS_DASHBOARD_TABLAS_CONSULTA_PERDIDOS.ABRIR_DETALLE'
]);

router.post('/cotizaciones/sync', requireVentasHistoricalIntegration, controller.syncCotizaciones);
router.post('/cotizaciones/comentarios/sync', requireVentasHistoricalIntegration, controller.syncComentariosHistoricos);

router.get('/cotizaciones/catalogos', ...ventasGuard([
  COTIZACIONES_VISUAL,
  VENDIDOS_VISUAL,
  PERDIDOS_VISUAL,
  PROYECCION_VISUAL
]), controller.getCatalogos);

router.get('/cotizaciones/kpis', ...ventasGuard('VENTAS_COTIZACIONES_KPI_INDICADORES_COTIZACIONES.VER'), controller.getKpis);
router.get('/cotizaciones/embudo', ...ventasGuard([
  'VENTAS_COTIZACIONES_KPI_INDICADORES_COTIZACIONES.VER',
  'VENTAS_PROYECCION_BOTONES_KPI_ETAPAS.VER'
]), controller.getEmbudo);
router.get('/cotizaciones/vendidos', ...ventasGuard('VENTAS_VENDIDOS_TABLA_COTIZACIONES_VENDIDAS_LISTADO.VER'), controller.getVendidos);
router.get('/cotizaciones/perdidos', ...ventasGuard('VENTAS_PERDIDOS_TABLA_COTIZACIONES_PERDIDAS_LISTADO.VER'), controller.getPerdidos);
router.get('/cotizaciones/proyeccion', ...ventasGuard('VENTAS_PROYECCION_TABLA_COTIZACIONES_POR_ESTATUS_LISTADO.VER'), controller.getProyeccion);
router.get('/cotizaciones/proyectos-interes', ...ventasGuard('VENTAS_COTIZACIONES_TABLA_COTIZACIONES_LISTADO_COTIZACIONES.VER'), interestController.listProjectInterests);
router.get('/cotizaciones', ...ventasGuard('VENTAS_COTIZACIONES_TABLA_COTIZACIONES_LISTADO_COTIZACIONES.VER'), controller.listCotizaciones);

router.get(
  '/cotizaciones/:id/comentarios',
  ...ventasGuard(COTIZACIONES_DETAIL_ACCESS),
  requireStorageSchema('ventas_cotizaciones_archivos'),
  controller.listComentarios
);
router.post(
  '/cotizaciones/:id/comentarios',
  ...ventasGuard('VENTAS_COTIZACIONES_TABLA_COTIZACIONES_DETALLE_COTIZACION.AGREGAR_COMENTARIO'),
  uploadInteractionFile,
  requireStorageSchemaWhenFiles('ventas_cotizaciones_archivos'),
  controller.createComentario
);
router.patch(
  '/cotizaciones/:id/comentarios/:idComentario',
  ...ventasGuard('VENTAS_COTIZACIONES_TABLA_COTIZACIONES_EDITAR_COTIZACION.EDITAR'),
  controller.updateComentario
);
router.delete(
  '/cotizaciones/:id/comentarios/:idComentario',
  ...ventasGuard('VENTAS_COTIZACIONES_TABLA_COTIZACIONES_EDITAR_COTIZACION.EDITAR'),
  requireStorageSchema('ventas_cotizaciones_archivos'),
  controller.deleteComentario
);

router.get(
  '/cotizaciones/:id/archivos',
  ...ventasGuard(COTIZACIONES_DETAIL_ACCESS),
  requireStorageSchema('ventas_cotizaciones_archivos'),
  controller.listArchivos
);
router.post(
  '/cotizaciones/:id/archivos',
  ...ventasGuard('VENTAS_COTIZACIONES_TABLA_COTIZACIONES_DETALLE_COTIZACION.ADJUNTAR_ARCHIVO'),
  uploadInteractionFile,
  requireStorageSchemaWhenFiles('ventas_cotizaciones_archivos'),
  controller.createArchivo
);
router.get(
  '/cotizaciones/:id/archivos/:idArchivo/acceso',
  ...ventasGuard(COTIZACIONES_DETAIL_ACCESS),
  requireStorageSchema('ventas_cotizaciones_archivos'),
  controller.getArchivoAccess
);
router.get(
  '/cotizaciones/:id/archivos/:idArchivo',
  ...ventasGuard(COTIZACIONES_DETAIL_ACCESS),
  requireStorageSchema('ventas_cotizaciones_archivos'),
  controller.getArchivo
);
router.patch(
  '/cotizaciones/:id/archivos/:idArchivo',
  ...ventasGuard('VENTAS_COTIZACIONES_TABLA_COTIZACIONES_EDITAR_COTIZACION.EDITAR'),
  controller.updateArchivo
);
router.delete(
  '/cotizaciones/:id/archivos/:idArchivo',
  ...ventasGuard('VENTAS_COTIZACIONES_TABLA_COTIZACIONES_EDITAR_COTIZACION.EDITAR'),
  requireStorageSchema('ventas_cotizaciones_archivos'),
  controller.deleteArchivo
);

router.patch(
  '/cotizaciones/:id/estatus',
  ...ventasGuard('VENTAS_COTIZACIONES_TABLA_COTIZACIONES_DETALLE_COTIZACION.CAMBIAR_ESTADO'),
  controller.updateEstatus
);
router.patch(
  '/cotizaciones/:id/asignacion',
  ...ventasGuard('VENTAS_COTIZACIONES_TABLA_COTIZACIONES_EDITAR_COTIZACION.EDITAR'),
  controller.updateAsignacion
);
router.get(
  '/cotizaciones/:id/editar-bootstrap',
  ...ventasGuard('VENTAS_COTIZACIONES_TABLA_COTIZACIONES_EDITAR_COTIZACION.EDITAR'),
  controller.getEditBootstrap
);

// Estado personal del usuario autenticado. No modifica la cotización ni su estatus.
router.get('/cotizaciones/:id/interes', ...ventasGuard(COTIZACIONES_DETAIL_ACCESS), interestController.getProjectInterest);
router.put('/cotizaciones/:id/interes', ...ventasGuard(COTIZACIONES_DETAIL_ACCESS), interestController.setProjectInterest);

router.get('/cotizaciones/:id', ...ventasGuard(COTIZACIONES_DETAIL_ACCESS), controller.getCotizacion);
router.post('/cotizaciones', ...ventasGuard('VENTAS_COTIZACIONES_TABLA_COTIZACIONES_NUEVA_COTIZACION.CREAR'), controller.createCotizacion);
router.put('/cotizaciones/:id', ...ventasGuard('VENTAS_COTIZACIONES_TABLA_COTIZACIONES_EDITAR_COTIZACION.EDITAR'), controller.updateCotizacion);
router.delete('/cotizaciones/:id', ...ventasGuard('VENTAS_COTIZACIONES_OPERACION.ELIMINAR'), controller.deleteCotizacion);

module.exports = router;

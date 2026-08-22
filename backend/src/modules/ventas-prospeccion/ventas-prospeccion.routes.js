// [Aster | 2026-08-19 | ASTER-MG | FASE 1 VENTAS: Guard General y permisos funcionales]
const express = require('express');
const controller = require('./ventas-prospeccion.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requireHistoricalSyncEnabled } = require('../../middleware/historical-sync.middleware');
const { requireIntegrationAuthFor } = require('../../middleware/integration-auth.middleware');
const { requireStorageSchema, requireStorageSchemaWhenFiles } = require('../../middleware/storage-schema.middleware');
const { createUploadMiddleware_gnral } = require('../../middleware/storage-upload.middleware');
const { humanInformationGuard_gnral } = require('../../middleware/information-access-gnral.middleware');

const uploadVisitPhotos = createUploadMiddleware_gnral({
  mode: 'array',
  fieldName: 'fotos',
  maxFiles: 4,
  policyName: 'IMAGE',
  maxFileMb: Number(process.env.AZURE_STORAGE_MAX_FILE_MB || 25),
  maxRequestMb: Number(process.env.CFFAA_STORAGE_MAX_REQUEST_MB || 50)
});

const uploadCommentFiles = createUploadMiddleware_gnral({
  mode: 'array',
  fieldName: 'archivos',
  maxFiles: 4,
  policyName: 'GENERAL',
  maxFileMb: Number(process.env.AZURE_STORAGE_MAX_FILE_MB || 25),
  maxRequestMb: Number(process.env.CFFAA_STORAGE_MAX_REQUEST_MB || 50)
});

const router = express.Router();
const requireVentasHistoricalIntegration = requireIntegrationAuthFor('INTEGRATION_VENTAS_ID', {
  whenDisabled: [requireAuth, requireHistoricalSyncEnabled]
});

function prospeccionGuard(permissionCodesAny) {
  return humanInformationGuard_gnral({
    permissionCodesAny: Array.isArray(permissionCodesAny) ? permissionCodesAny : [permissionCodesAny],
    domain: 'CORELLIAN',
    groupingCodesAny: ['VENTAS']
  });
}

const PROSPECCION_VISUAL_PERMISSION = 'VENTAS_PROSPECCION_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';
const MAPA_VISUAL_PERMISSION = 'VENTAS_MAPA_PROSPECCION_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';
const MAPA_MARKERS_PERMISSION = 'VENTAS_MAPA_PROSPECCION_MAPA_VISITAS_MARCADORES.VER';
const MAPA_OPEN_DETAIL_PERMISSION = 'VENTAS_MAPA_PROSPECCION_MAPA_VISITAS_MARCADORES.ABRIR_DETALLE';

router.post('/prospeccion/sync', requireVentasHistoricalIntegration, controller.syncProspections);
router.post('/prospeccion/comentarios/sync', requireVentasHistoricalIntegration, controller.syncComments);

router.get('/prospeccion/catalogos-captura', ...prospeccionGuard(PROSPECCION_VISUAL_PERMISSION), controller.getCaptureCatalogs);
router.get('/prospeccion/fuentes', ...prospeccionGuard(PROSPECCION_VISUAL_PERMISSION), controller.searchSources);
router.get('/prospeccion/contactos', ...prospeccionGuard(PROSPECCION_VISUAL_PERMISSION), controller.getClientContacts);
router.post(
  '/prospeccion',
  ...prospeccionGuard('VENTAS_PROSPECCION_TABLA_VISITAS_NUEVA_VISITA.CREAR'),
  uploadVisitPhotos,
  requireStorageSchemaWhenFiles('ventas_prospeccion_archivos'),
  controller.createVisit
);

// Este catálogo también lo consume Mapa Prospección.
router.get('/prospeccion/catalogos', ...prospeccionGuard([
  PROSPECCION_VISUAL_PERMISSION,
  MAPA_VISUAL_PERMISSION
]), controller.getCatalogs);
router.get('/prospeccion/kpis', ...prospeccionGuard('VENTAS_PROSPECCION_KPI_INDICADORES.VER'), controller.getKpis);
router.get('/prospeccion/mapa', ...prospeccionGuard(MAPA_MARKERS_PERMISSION), controller.getMap);
router.get('/prospeccion', ...prospeccionGuard('VENTAS_PROSPECCION_TABLA_VISITAS_LISTADO.VER'), controller.listProspections);
router.get('/prospeccion/detalle/catalogos', ...prospeccionGuard([
  'VENTAS_PROSPECCION_TABLA_VISITAS_DETALLE_PROSPECCION.VER',
  MAPA_OPEN_DETAIL_PERMISSION
]), controller.getDetailCatalogs);
router.patch('/prospeccion/:id/estatus', ...prospeccionGuard('VENTAS_PROSPECCION_TABLA_VISITAS_DETALLE_PROSPECCION.CAMBIAR_ESTADO'), controller.updateProspectionStatus);
router.post(
  '/prospeccion/:id/comentarios',
  ...prospeccionGuard('VENTAS_PROSPECCION_TABLA_VISITAS_DETALLE_PROSPECCION.AGREGAR_COMENTARIO'),
  uploadCommentFiles,
  requireStorageSchemaWhenFiles('ventas_prospeccion_archivos'),
  controller.createComment
);
router.get(
  '/prospeccion/:id/archivos/:idArchivo/acceso',
  ...prospeccionGuard([
    'VENTAS_PROSPECCION_TABLA_VISITAS_DETALLE_PROSPECCION.VER',
    MAPA_OPEN_DETAIL_PERMISSION
  ]),
  requireStorageSchema('ventas_prospeccion_archivos'),
  controller.getFileAccess
);
router.delete(
  '/prospeccion/:id/archivos/:idArchivo',
  ...prospeccionGuard([
    'VENTAS_PROSPECCION_TABLA_VISITAS_DETALLE_PROSPECCION.ADJUNTAR_ARCHIVO',
    'VENTAS_PROSPECCION_TABLA_VISITAS_EDITAR_PROSPECCION.EDITAR'
  ]),
  requireStorageSchema('ventas_prospeccion_archivos'),
  controller.deleteFile
);
router.get('/prospeccion/:id', ...prospeccionGuard([
  'VENTAS_PROSPECCION_TABLA_VISITAS_DETALLE_PROSPECCION.VER',
  'VENTAS_PROSPECCION_TABLA_VISITAS_LISTADO.ABRIR_DETALLE',
  MAPA_OPEN_DETAIL_PERMISSION,
  'VENTAS_DASHBOARD_TABLAS_CONSULTA_PROSPECCION.ABRIR_DETALLE'
]), controller.getProspection);

module.exports = router;

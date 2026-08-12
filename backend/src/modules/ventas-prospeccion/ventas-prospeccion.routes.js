// [Aster | 2026-08-12 | ASTER-MG | PATCH: FASE_2_BACKEND_M2M_GUARDS_V001]
const express = require('express');
const controller = require('./ventas-prospeccion.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requireHistoricalSyncEnabled } = require('../../middleware/historical-sync.middleware');
const { requireIntegrationAuthFor } = require('../../middleware/integration-auth.middleware');
const { requireStorageSchema, requireStorageSchemaWhenFiles } = require('../../middleware/storage-schema.middleware');
const { createUploadMiddleware_gnral } = require('../../middleware/storage-upload.middleware');

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

// Mientras HMAC permanezca apagado se conserva el control legado de importación.
// Con HMAC activo, la identidad M2M de Ventas sustituye al JWT humano.
router.post('/prospeccion/sync', requireVentasHistoricalIntegration, controller.syncProspections);
router.post('/prospeccion/comentarios/sync', requireVentasHistoricalIntegration, controller.syncComments);

router.get('/prospeccion/catalogos-captura', requireAuth, controller.getCaptureCatalogs);
router.get('/prospeccion/fuentes', requireAuth, controller.searchSources);
router.get('/prospeccion/contactos', requireAuth, controller.getClientContacts);
router.post(
  '/prospeccion',
  requireAuth,
  uploadVisitPhotos,
  requireStorageSchemaWhenFiles('ventas_prospeccion_archivos'),
  controller.createVisit
);
router.get('/prospeccion/catalogos', requireAuth, controller.getCatalogs);
router.get('/prospeccion/kpis', requireAuth, controller.getKpis);
router.get('/prospeccion/mapa', requireAuth, controller.getMap);
router.get('/prospeccion', requireAuth, controller.listProspections);
router.get('/prospeccion/detalle/catalogos', requireAuth, controller.getDetailCatalogs);
router.patch('/prospeccion/:id/estatus', requireAuth, controller.updateProspectionStatus);
router.post(
  '/prospeccion/:id/comentarios',
  requireAuth,
  uploadCommentFiles,
  requireStorageSchemaWhenFiles('ventas_prospeccion_archivos'),
  controller.createComment
);
router.get(
  '/prospeccion/:id/archivos/:idArchivo/acceso',
  requireAuth,
  requireStorageSchema('ventas_prospeccion_archivos'),
  controller.getFileAccess
);
router.delete(
  '/prospeccion/:id/archivos/:idArchivo',
  requireAuth,
  requireStorageSchema('ventas_prospeccion_archivos'),
  controller.deleteFile
);
router.get('/prospeccion/:id', requireAuth, controller.getProspection);

module.exports = router;

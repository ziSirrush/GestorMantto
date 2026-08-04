const express = require('express');
const controller = require('./ventas-prospeccion.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requireHistoricalSyncEnabled } = require('../../middleware/historical-sync.middleware');
const { requireStorageSchema } = require('../../middleware/storage-schema.middleware');
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

// CFFAA-00/CFFAA-04: las importaciones historicas permanecen cerradas por
// defecto y nunca eliminan relaciones AZURE_BLOB existentes.
router.post('/prospeccion/sync', requireAuth, requireHistoricalSyncEnabled, controller.syncProspections);
router.post('/prospeccion/comentarios/sync', requireAuth, requireHistoricalSyncEnabled, controller.syncComments);

router.get('/prospeccion/catalogos-captura', requireAuth, controller.getCaptureCatalogs);
router.get('/prospeccion/fuentes', requireAuth, controller.searchSources);
router.get('/prospeccion/contactos', requireAuth, controller.getClientContacts);
router.post(
  '/prospeccion',
  requireAuth,
  requireStorageSchema('ventas_prospeccion_archivos'),
  uploadVisitPhotos,
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
  requireStorageSchema('ventas_prospeccion_archivos'),
  uploadCommentFiles,
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

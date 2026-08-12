// [Aster | 2026-08-12 | ASTER-MG | PATCH: FASE_2_BACKEND_M2M_GUARDS_V001]
'use strict';

const express = require('express');
const controller = require('./ventas-redes.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requireIntegrationAuthFor } = require('../../middleware/integration-auth.middleware');
const { requireStorageSchema, requireStorageSchemaWhenFiles } = require('../../middleware/storage-schema.middleware');
const { createUploadMiddleware_gnral } = require('../../middleware/storage-upload.middleware');

const router = express.Router();
const requireVentasIntegration = requireIntegrationAuthFor('INTEGRATION_VENTAS_ID');

const uploadEvidence = createUploadMiddleware_gnral({
  mode: 'fields',
  fields: [
    { name: 'imagen_1', maxCount: 1 },
    { name: 'imagen_2', maxCount: 1 }
  ],
  maxFiles: 2,
  policyName: 'IMAGE',
  maxFileMb: Number(process.env.AZURE_STORAGE_MAX_FILE_MB || 25),
  maxRequestMb: Number(process.env.CFFAA_STORAGE_MAX_REQUEST_MB || 50)
});

const uploadCommentAttachments = createUploadMiddleware_gnral({
  mode: 'array',
  fieldName: 'archivos',
  maxFiles: 4,
  policyName: 'GENERAL',
  maxFileMb: Number(process.env.AZURE_STORAGE_MAX_FILE_MB || 25),
  maxRequestMb: Number(process.env.CFFAA_STORAGE_MAX_REQUEST_MB || 50)
});

// Historical backup import from the controlled Google Sheets backup.
// With HMAC enabled, only the Ventas M2M identity can execute these routes.
router.post('/redes/importar-backup', requireVentasIntegration, controller.syncRecords);
router.post('/redes/comentarios/importar-backup', requireVentasIntegration, controller.syncComments);

router.get('/redes/catalogos', requireAuth, controller.getCatalogs);
router.get('/redes/usuarios-asignables', requireAuth, controller.getAssignableUsers);
router.get('/redes/cotizaciones-activas', requireAuth, controller.getActiveQuotations);

router.get('/redes', requireAuth, controller.list);
router.post(
  '/redes',
  requireAuth,
  uploadEvidence,
  requireStorageSchemaWhenFiles('ventas_redes_archivos'),
  controller.create
);

router.get(
  '/redes/:id/archivos',
  requireAuth,
  requireStorageSchema('ventas_redes_archivos'),
  controller.listEvidence
);
router.post(
  '/redes/:id/archivos',
  requireAuth,
  uploadEvidence,
  requireStorageSchemaWhenFiles('ventas_redes_archivos'),
  controller.uploadEvidence
);
router.get(
  '/redes/:id/archivos/:idArchivo/acceso',
  requireAuth,
  requireStorageSchema('ventas_redes_archivos'),
  controller.getEvidenceAccess
);
router.delete(
  '/redes/:id/archivos/:idArchivo',
  requireAuth,
  requireStorageSchema('ventas_redes_archivos'),
  controller.deleteEvidence
);

router.get(
  '/redes/:id/comentarios',
  requireAuth,
  requireStorageSchema('ventas_redes_comentarios_adjuntos'),
  controller.listComments
);
router.post(
  '/redes/:id/comentarios',
  requireAuth,
  uploadCommentAttachments,
  requireStorageSchemaWhenFiles('ventas_redes_comentarios_adjuntos'),
  controller.createComment
);
router.patch('/redes/:id/comentarios/:idComentario', requireAuth, controller.updateComment);
router.put('/redes/:id/comentarios/:idComentario', requireAuth, controller.updateComment);
router.delete(
  '/redes/:id/comentarios/:idComentario',
  requireAuth,
  requireStorageSchema('ventas_redes_comentarios_adjuntos'),
  controller.deleteComment
);
router.post(
  '/redes/:id/comentarios/:idComentario/adjuntos',
  requireAuth,
  uploadCommentAttachments,
  requireStorageSchemaWhenFiles('ventas_redes_comentarios_adjuntos'),
  controller.addCommentAttachments
);
router.get(
  '/redes/:id/comentarios/:idComentario/adjuntos/:idAdjunto/acceso',
  requireAuth,
  requireStorageSchema('ventas_redes_comentarios_adjuntos'),
  controller.getAttachmentAccess
);
router.delete(
  '/redes/:id/comentarios/:idComentario/adjuntos/:idAdjunto',
  requireAuth,
  requireStorageSchema('ventas_redes_comentarios_adjuntos'),
  controller.deleteAttachment
);

router.patch('/redes/:id/estatus', requireAuth, controller.updateStatus);
router.patch('/redes/:id/asignacion', requireAuth, controller.updateAssignment);
router.patch('/redes/:id/cotizacion', requireAuth, controller.updateQuotation);
router.get('/redes/:id', requireAuth, controller.getById);
router.put('/redes/:id', requireAuth, controller.update);
router.patch('/redes/:id', requireAuth, controller.update);
router.delete('/redes/:id', requireAuth, controller.remove);

module.exports = router;

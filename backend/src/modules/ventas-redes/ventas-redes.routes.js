'use strict';

const express = require('express');
const controller = require('./ventas-redes.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requireStorageSchema } = require('../../middleware/storage-schema.middleware');
const { createUploadMiddleware_gnral } = require('../../middleware/storage-upload.middleware');

const router = express.Router();

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

// One-time historical backup import from the controlled Google Sheets backup.
// These two routes are temporary and must be removed after the confirmed import.
router.post('/redes/importar-backup', controller.syncRecords);
router.post('/redes/comentarios/importar-backup', controller.syncComments);

router.get('/redes/catalogos', requireAuth, controller.getCatalogs);
router.get('/redes/usuarios-asignables', requireAuth, controller.getAssignableUsers);
router.get('/redes/cotizaciones-activas', requireAuth, controller.getActiveQuotations);

router.get('/redes', requireAuth, controller.list);
router.post(
  '/redes',
  requireAuth,
  requireStorageSchema('ventas_redes_archivos'),
  uploadEvidence,
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
  requireStorageSchema('ventas_redes_archivos'),
  uploadEvidence,
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
  requireStorageSchema('ventas_redes_comentarios_adjuntos'),
  uploadCommentAttachments,
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
  requireStorageSchema('ventas_redes_comentarios_adjuntos'),
  uploadCommentAttachments,
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

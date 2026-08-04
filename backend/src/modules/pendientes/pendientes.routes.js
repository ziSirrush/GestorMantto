const express = require('express');
const router = express.Router();
const pendientesController = require('./pendientes.controller');
const pendientesFilesController = require('./pendientes-files.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requireStorageSchema } = require('../../middleware/storage-schema.middleware');
const { createUploadMiddleware_gnral } = require('../../middleware/storage-upload.middleware');

const taskEvidenceUpload = createUploadMiddleware_gnral({
  mode: 'fields',
  fields: [
    { name: 'photo_file', maxCount: 1 },
    { name: 'adjunto_file', maxCount: 1 }
  ],
  maxFiles: 1,
  policyName: 'GENERAL',
  maxRequestMb: 25
});

const commentAttachmentUpload = createUploadMiddleware_gnral({
  fieldName: 'archivo',
  maxFiles: 1,
  policyName: 'GENERAL',
  maxRequestMb: 25
});

const requirePendientesStorage = requireStorageSchema(
  'pendientes',
  'pendientes_archivos',
  'pendientes_comentarios_adjuntos'
);

router.get('/pendientes/catalogos', requireAuth, pendientesController.getPendientesCatalogos);
router.get('/pendientes', requireAuth, requirePendientesStorage, pendientesController.getPendientes);
router.get(
  '/pendientes/:id/archivos/:idArchivo/acceso',
  requireAuth,
  requirePendientesStorage,
  pendientesFilesController.getDirectFileAccess
);
router.get(
  '/pendientes/:id/comentarios/:idComentario/adjuntos/:idAdjunto/acceso',
  requireAuth,
  requirePendientesStorage,
  pendientesFilesController.getCommentFileAccess
);
router.get(
  '/pendientes/:id/evidencia-legacy/:tipo/acceso',
  requireAuth,
  requirePendientesStorage,
  pendientesFilesController.getLegacyFileAccess
);
router.delete(
  '/pendientes/:id/archivos/:idArchivo',
  requireAuth,
  requirePendientesStorage,
  pendientesFilesController.deleteDirectFile
);
router.get('/pendientes/:id', requireAuth, requirePendientesStorage, pendientesController.getPendienteDetalle);
router.post(
  '/pendientes',
  requireAuth,
  requirePendientesStorage,
  taskEvidenceUpload,
  pendientesController.createPendiente
);
router.put(
  '/pendientes/:id',
  requireAuth,
  requirePendientesStorage,
  taskEvidenceUpload,
  pendientesController.updatePendiente
);
router.delete('/pendientes/:id', requireAuth, requirePendientesStorage, pendientesController.deletePendiente);
router.patch('/pendientes/:id/estatus', requireAuth, pendientesController.updatePendienteEstatus);
router.patch('/pendientes/:id/prioridad', requireAuth, pendientesController.updatePendientePrioridad);
router.post(
  '/pendientes/:id/comentarios',
  requireAuth,
  requirePendientesStorage,
  commentAttachmentUpload,
  pendientesController.createPendienteComentario
);
router.patch('/pendientes/:id/subtareas/:idSubtarea', requireAuth, pendientesController.updatePendienteSubtarea);

module.exports = router;

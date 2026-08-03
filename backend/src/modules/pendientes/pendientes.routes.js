const express = require('express');
const router = express.Router();
const pendientesController = require('./pendientes.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requireStorageSchemaWhenBodyHas } = require('../../middleware/storage-schema.middleware');

router.get('/pendientes/catalogos', requireAuth, pendientesController.getPendientesCatalogos);
router.get('/pendientes', requireAuth, pendientesController.getPendientes);
router.get('/pendientes/:id', requireAuth, pendientesController.getPendienteDetalle);
router.post('/pendientes', requireAuth, pendientesController.createPendiente);
router.put('/pendientes/:id', requireAuth, pendientesController.updatePendiente);
router.delete('/pendientes/:id', requireAuth, pendientesController.deletePendiente);
router.patch('/pendientes/:id/estatus', requireAuth, pendientesController.updatePendienteEstatus);
router.patch('/pendientes/:id/prioridad', requireAuth, pendientesController.updatePendientePrioridad);
router.post('/pendientes/:id/comentarios', requireAuth, requireStorageSchemaWhenBodyHas('adjunto_file', 'pendientes_comentarios_adjuntos'), pendientesController.createPendienteComentario);
router.patch('/pendientes/:id/subtareas/:idSubtarea', requireAuth, pendientesController.updatePendienteSubtarea);

module.exports = router;

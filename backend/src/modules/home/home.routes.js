const express = require('express');
const homeController = require('./home.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requireStorageSchema } = require('../../middleware/storage-schema.middleware');

const router = express.Router();

const requireHomeStorage = requireStorageSchema(
  'pendientes',
  'pendientes_archivos',
  'pendientes_comentarios_adjuntos'
);

router.get('/home/bootstrap', requireAuth, requireHomeStorage, homeController.getHomeBootstrap);
router.get('/actividad-reciente', requireAuth, homeController.getActividadReciente);

module.exports = router;

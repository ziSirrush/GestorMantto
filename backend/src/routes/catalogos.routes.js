const express = require('express');
const router = express.Router();
const catalogosController = require('../controllers/catalogos.controller');
const { requireAuth } = require('../middleware/auth.middleware');

router.get('/roles', requireAuth, catalogosController.roles);
router.get('/zonas', requireAuth, catalogosController.zonas);
router.get('/preguntas-seguridad', requireAuth, catalogosController.preguntasSeguridad);
router.get('/usuarios-superiores', requireAuth, catalogosController.superiores);

module.exports = router;

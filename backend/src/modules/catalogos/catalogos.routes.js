const express = require('express');
const catalogosController = require('./catalogos.controller');
const { requireAuth } = require('../../middleware/auth.middleware');

const router = express.Router();
router.use(requireAuth);

router.get('/estados-visuales', catalogosController.getEstadosVisuales);
router.get('/permisos', catalogosController.getPermisos);
router.get('/roles', catalogosController.getRoles);
router.get('/zonas', catalogosController.getZonas);
router.get('/usuario-zop', catalogosController.getUsuarioZop);

module.exports = router;

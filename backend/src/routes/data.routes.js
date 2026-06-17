const express = require('express');
const router = express.Router();

const dataController = require('../controllers/data.controller');

router.get('/tickets', dataController.getTickets);
router.post('/tickets/sync', dataController.syncTickets);

router.get('/portafolio', dataController.getPortafolio);
router.get('/equipos', dataController.getEquipos);
router.get('/proyectos', dataController.getProyectos);

router.get('/usuarios', dataController.getUsuarios);
router.get('/users', dataController.getUsuarios);

router.get('/permisos', dataController.getPermisos);
router.get('/roles', dataController.getRoles);
router.get('/zonas', dataController.getZonas);
router.get('/usuario-zop', dataController.getUsuarioZop);

module.exports = router;

const express = require('express');
const router = express.Router();

const dataController = require('../controllers/data.controller');

router.get('/tickets', dataController.getTickets);
<<<<<<< HEAD
router.post('/tickets/sync', dataController.syncTickets);
=======
>>>>>>> b99d62a5f077ac3c5abe3234a47b0f80370adc53

router.get('/portafolio', dataController.getPortafolio);
router.get('/equipos', dataController.getEquipos);
router.get('/proyectos', dataController.getProyectos);

router.get('/usuarios', dataController.getUsuarios);
router.get('/users', dataController.getUsuarios);

router.get('/permisos', dataController.getPermisos);
router.get('/roles', dataController.getRoles);
router.get('/zonas', dataController.getZonas);
router.get('/usuario-zop', dataController.getUsuarioZop);

<<<<<<< HEAD
module.exports = router;
=======
router.post('/tickets/sync',dataController.sybcTickets);

module.exports = router;
>>>>>>> b99d62a5f077ac3c5abe3234a47b0f80370adc53

const express = require('express');
const criticosController = require('./criticos.controller');
const { requireAuth } = require('../../middleware/auth.middleware');

const router = express.Router();
router.use(requireAuth);

router.get('/indicadores/mtbc/equipos', criticosController.getMtbcEquipos);
router.get('/indicadores/mtbc/proyectos', criticosController.getMtbcProyectos);
router.get('/callcenter/u365/proyectos', criticosController.getCallCenterU365Proyectos);
router.get('/callcenter/u365/equipos', criticosController.getCallCenterU365Equipos);
router.get('/criticidad-corporativa', criticosController.getCriticidadCorporativa);
router.get('/equipos-criticos', criticosController.getEquiposCriticos);
router.get('/equipos-criticos/:codigo/tickets', criticosController.getEquipoCriticoTickets);
router.get('/proyectos-criticos', criticosController.getProyectosCriticos);
router.get('/proyectos-criticos/:proyecto/tickets', criticosController.getProyectoCriticoTickets);

module.exports = router;

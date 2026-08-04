const express = require('express');
const criticosController = require('./criticos.controller');
const { optionalAuth } = require('../../middleware/auth.middleware');

const router = express.Router();

router.get('/indicadores/mtbc/equipos', criticosController.getMtbcEquipos);
router.get('/indicadores/mtbc/proyectos', criticosController.getMtbcProyectos);
router.get('/callcenter/u365/proyectos', optionalAuth, criticosController.getCallCenterU365Proyectos);
router.get('/callcenter/u365/equipos', optionalAuth, criticosController.getCallCenterU365Equipos);
router.get('/criticidad-corporativa', optionalAuth, criticosController.getCriticidadCorporativa);
router.get('/equipos-criticos', optionalAuth, criticosController.getEquiposCriticos);
router.get('/equipos-criticos/:codigo/tickets', optionalAuth, criticosController.getEquipoCriticoTickets);
router.get('/proyectos-criticos', optionalAuth, criticosController.getProyectosCriticos);
router.get('/proyectos-criticos/:proyecto/tickets', optionalAuth, criticosController.getProyectoCriticoTickets);

module.exports = router;

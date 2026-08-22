'use strict';

const express = require('express');
const controller = require('./experimental-proyectos-criticos.controller');
const { humanInformationGuard_gnral } = require('../../middleware/information-access-gnral.middleware');
const { requirePortafolioProjectScope_gnral } = require('../../services/information-record-scope-gnral.service');

const router = express.Router();
const guard_exp = humanInformationGuard_gnral({
  permissionCode: 'PROYECTOS_CRITICOS_EXP_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  domain: 'UNITED',
  groupingCode: 'EXPERIMENTAL'
});

router.get('/proyectos-criticos', ...guard_exp, controller.getProyectosCriticos_uni);
router.get('/proyectos-criticos/:proyecto/tickets', ...guard_exp, requirePortafolioProjectScope_gnral, controller.getProyectoCriticoTickets_uni);

module.exports = router;

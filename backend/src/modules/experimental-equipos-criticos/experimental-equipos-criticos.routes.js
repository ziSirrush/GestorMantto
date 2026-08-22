'use strict';

const express = require('express');
const controller = require('./experimental-equipos-criticos.controller');
const { humanInformationGuard_gnral } = require('../../middleware/information-access-gnral.middleware');
const { requirePortafolioEquipmentScope_gnral } = require('../../services/information-record-scope-gnral.service');

const router = express.Router();
const guard_exp = humanInformationGuard_gnral({
  permissionCode: 'EQUIPOS_CRITICOS_EXP_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  domain: 'UNITED',
  groupingCode: 'EXPERIMENTAL'
});

router.get('/equipos-criticos', ...guard_exp, controller.getEquiposCriticos_uni);
router.get('/equipos-criticos/:codigo/tickets', ...guard_exp, requirePortafolioEquipmentScope_gnral, controller.getEquipoCriticoTickets_uni);

module.exports = router;

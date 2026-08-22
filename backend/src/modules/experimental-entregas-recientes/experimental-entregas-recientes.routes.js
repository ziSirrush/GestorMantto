'use strict';

const express = require('express');
const controller = require('./experimental-entregas-recientes.controller');
const { humanInformationGuard_gnral } = require('../../middleware/information-access-gnral.middleware');

const router = express.Router();
const ACCESS_PERMISSION_EXP = 'ENTREGAS_RECIENTES_EXP_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';
const accessGuard_exp = humanInformationGuard_gnral({
  permissionCode: ACCESS_PERMISSION_EXP,
  domain: 'UNITED',
  groupingCode: 'EXPERIMENTAL'
});

router.get(
  '/entregas-recientes',
  ...accessGuard_exp,
  controller.getEntregasRecientes_uni
);

module.exports = router;

'use strict';

const express = require('express');
const controller = require('./experimental-atencion-prioritaria.controller');
const { humanInformationGuard_gnral } = require('../../middleware/information-access-gnral.middleware');

const router = express.Router();
const ACCESS_PERMISSION_EXP = 'ATENCION_PRIORITARIA_EXP_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';
const accessGuard_exp = humanInformationGuard_gnral({
  permissionCode: ACCESS_PERMISSION_EXP,
  domain: 'UNITED',
  groupingCode: 'EXPERIMENTAL'
});

router.get(
  '/atencion-prioritaria',
  ...accessGuard_exp,
  controller.getAtencionPrioritaria_exp
);

module.exports = router;

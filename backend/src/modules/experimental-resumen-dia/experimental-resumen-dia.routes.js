'use strict';

const express = require('express');
const controller = require('./experimental-resumen-dia.controller');
const { humanInformationGuard_gnral } = require('../../middleware/information-access-gnral.middleware');

const router = express.Router();

const resumenDiaGuard_exp = humanInformationGuard_gnral({
  permissionCode: 'RESUMEN_DIA_EXP_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  domain: 'UNITED',
  groupingCode: 'EXPERIMENTAL'
});

router.get('/resumen-dia', ...resumenDiaGuard_exp, controller.getResumenDia_exp);

module.exports = router;

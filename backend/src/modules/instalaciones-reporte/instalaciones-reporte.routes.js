'use strict';

const express = require('express');
const controller = require('./instalaciones-reporte.controller');
const { humanInformationGuard_gnral } = require('../../middleware/information-access-gnral.middleware');

const router = express.Router();
const REPORT_PERMISSION = 'INSTALACIONES_REPORTE_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';
const reportGuard = humanInformationGuard_gnral({
  permissionCode: REPORT_PERMISSION,
  domain: 'CORELLIAN',
  groupingCodesAny: ['INSTALACIONES']
});

router.get('/reporte', ...reportGuard, controller.list);

module.exports = router;

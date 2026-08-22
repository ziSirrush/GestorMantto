'use strict';

const express = require('express');
const controller = require('./experimental-dashboard-call-center.controller');
const { humanInformationGuard_gnral } = require('../../middleware/information-access-gnral.middleware');

const router = express.Router();

const dashboardCallCenterGuard_exp = humanInformationGuard_gnral({
  permissionCode: 'DASHBOARD_CALL_CENTER_EXP_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  domain: 'UNITED',
  groupingCode: 'EXPERIMENTAL'
});

router.get('/dashboard-call-center', ...dashboardCallCenterGuard_exp, controller.getDashboard_uni);

module.exports = router;

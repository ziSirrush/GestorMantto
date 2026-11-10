'use strict';

const express = require('express');
const { humanInformationGuard_gnral } = require('../../middleware/information-access-gnral.middleware');
const controller = require('./experimental-ns-equipos-parados.controller');
const { REQUIRED_PERMISSION } = require('./experimental-ns-equipos-parados.service');

const router = express.Router();
const [requireSession, requireSpecificPermission] = humanInformationGuard_gnral({
  domain:'UNITED', groupingCode:'EXPERIMENTAL_NS', permissionCode:REQUIRED_PERMISSION
});
router.get('/equipos-parados/inicial', requireSession, requireSpecificPermission, controller.initial);
module.exports = router;
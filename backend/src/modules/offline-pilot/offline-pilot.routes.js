'use strict';

const express = require('express');
const controller = require('./offline-pilot.controller');
const { humanInformationGuard_gnral } = require('../../middleware/information-access-gnral.middleware');
const { OFFLINE_PILOT_PERMISSION } = require('./offline-pilot.service');

const router = express.Router();

// Permiso independiente y sin herencia implicita desde otros modulos.
// GENERAL solo resuelve identidad; la puerta funcional sigue siendo obligatoria.
const offlinePilotGuard = humanInformationGuard_gnral({
  permissionCode: OFFLINE_PILOT_PERMISSION,
  domain: 'GENERAL',
  groupingCode: 'MODO_OFFLINE'
});

router.get('/capabilities', ...offlinePilotGuard, controller.getCapabilities);

module.exports = router;

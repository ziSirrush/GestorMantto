'use strict';

// [BLT NOW | 2026-10-26 | EXPERIMENTAL_NS_F2_ROUTES_V001]
const express = require('express');
const { humanInformationGuard_gnral } = require('../../middleware/information-access-gnral.middleware');
const controller = require('./experimental-ns.controller');
const { PERMISSION_CODES } = require('./experimental-ns.scope');

const router = express.Router();

// Sin restriccion por rol: humanInformationGuard_gnral valida sesion, permiso, puerta y alcance.

const [requireSession, requirePermissionAndScope] = humanInformationGuard_gnral({
  domain: 'UNITED',
  groupingCode: 'EXPERIMENTAL_NS',
  permissionCodesAny: PERMISSION_CODES
});

// La autenticacion humana, los permisos funcionales y la puerta UNITED se exigen
// incluso al consultar el estado tecnico. El visor respeta al usuario efectivo.
router.use(requireSession, requirePermissionAndScope);
router.get('/estado', controller.estado);
router.get('/portafolio', controller.portafolio);
router.get('/tickets', controller.tickets);

module.exports = router;

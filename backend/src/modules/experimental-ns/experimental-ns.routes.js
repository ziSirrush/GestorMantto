'use strict';

// [BLT NOW | 2026-10-26 | EXPERIMENTAL_NS_F2_ROUTES_V001]
const express = require('express');
const { humanInformationGuard_gnral } = require('../../middleware/information-access-gnral.middleware');
const controller = require('./experimental-ns.controller');
const { PERMISSION_CODES } = require('./experimental-ns.scope');

const router = express.Router();

function requireProgramador(req, res, next) {
  // Rol verificado EN BACKEND; esto no reemplaza permiso, puerta ni alcance.
  if (!req.actorUser || req.actorUser.is_programador !== true) {
    return res.status(403).json({ ok: false, code: 'EXPERIMENTAL_NS_PROGRAMMER_REQUIRED', message: 'Acceso restringido al rol Programador.' });
  }
  return next();
}

const [requireSession, requirePermissionAndScope] = humanInformationGuard_gnral({
  domain: 'UNITED',
  groupingCode: 'EXPERIMENTAL_NS',
  permissionCodesAny: PERMISSION_CODES
});

// La autenticacion humana, los permisos funcionales y la puerta UNITED se exigen
// incluso al consultar el estado tecnico. El visor respeta al usuario efectivo.
router.use(requireSession, requireProgramador, requirePermissionAndScope);
router.get('/estado', controller.estado);
router.get('/portafolio', controller.portafolio);
router.get('/tickets', controller.tickets);

module.exports = router;

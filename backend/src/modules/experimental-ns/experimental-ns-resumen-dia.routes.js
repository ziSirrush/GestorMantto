'use strict';

// BLT NOW | Experimental NS | F3 | Ruta independiente y permiso individual.
const express = require('express');
const { humanInformationGuard_gnral } = require('../../middleware/information-access-gnral.middleware');
const controller = require('./experimental-ns-resumen-dia.controller');
const { REQUIRED_PERMISSION } = require('./experimental-ns-resumen-dia.service');
const router = express.Router();

function requireProgramador(req, res, next) {
  if (!req.actorUser || req.actorUser.is_programador !== true) {
    return res.status(403).json({
      ok: false,
      code: 'EXPERIMENTAL_NS_PROGRAMMER_REQUIRED',
      message: 'Experimental NS esta restringido al rol Programador.'
    });
  }
  return next();
}

const [requireSession, requireSpecificPermission] = humanInformationGuard_gnral({
  domain: 'UNITED',
  groupingCode: 'EXPERIMENTAL_NS',
  permissionCode: REQUIRED_PERMISSION
});

router.get('/resumen-dia/inicial', requireSession, requireProgramador, requireSpecificPermission, controller.getInitialData);

module.exports = router;

'use strict';

// BLT NOW | Experimental NS | F3 | Ruta independiente y permiso individual.
const express = require('express');
const { humanInformationGuard_gnral } = require('../../middleware/information-access-gnral.middleware');
const controller = require('./experimental-ns-resumen-dia.controller');
const { REQUIRED_PERMISSION } = require('./experimental-ns-resumen-dia.service');
const router = express.Router();

// Sin restriccion por rol: humanInformationGuard_gnral valida sesion, permiso, puerta y alcance.

const [requireSession, requireSpecificPermission] = humanInformationGuard_gnral({
  domain: 'UNITED',
  groupingCode: 'EXPERIMENTAL_NS',
  permissionCode: REQUIRED_PERMISSION
});

router.get('/resumen-dia/inicial', requireSession, requireSpecificPermission, controller.getInitialData);

module.exports = router;

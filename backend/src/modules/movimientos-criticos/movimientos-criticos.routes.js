'use strict';

const express = require('express');
const controller = require('./movimientos-criticos.controller');
const { humanInformationGuard_gnral } = require('../../middleware/information-access-gnral.middleware');
const { requireProgrammerRole } = require('../../middleware/historical-sync.middleware');

const router = express.Router();

// FASE 2: puerta funcional propia del modulo. No hereda acceso desde
// Equipos Criticos, Portafolio ni otra agrupacion. El alcance territorial
// continua resolviendose por el motor UNITED central.
const movimientosCriticosGuard = humanInformationGuard_gnral({
  permissionCode: 'OPERACION_MOVIMIENTOS_CRITICOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  domain: 'UNITED',
  groupingCode: 'OPERACION'
});

router.get('/semanas', ...movimientosCriticosGuard, controller.listCuts);
router.get('/snapshot', ...movimientosCriticosGuard, controller.getSnapshot);
router.get('/', ...movimientosCriticosGuard, controller.getMovements);
router.post('/corte', ...movimientosCriticosGuard, requireProgrammerRole, controller.runManualCut);

module.exports = router;

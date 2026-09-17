'use strict';

// [Aster | 2026-09-17 | ASTER-MG | FASE 2 INFORMES MOTOR BACKEND V001]
const express = require('express');
const informesController = require('./informes.controller');
const { humanInformationGuard_gnral } = require('../../middleware/information-access-gnral.middleware');

const router = express.Router();

function operationGuard_uni(permissionCodesAny) {
  return humanInformationGuard_gnral({
    permissionCodesAny,
    domain: 'UNITED',
    groupingCode: 'OPERACION'
  });
}

// Se conserva fail-closed el permiso definido en Fase 1. Esta fase NO crea ni
// asigna permisos en Aiven.
const informesView_uni = ['OPERACION_INFORMES_INFORMES_INFORMES.VER'];

router.get('/informes/opciones', ...operationGuard_uni(informesView_uni), informesController.getOpciones);
router.get('/informes/generar', ...operationGuard_uni(informesView_uni), informesController.generarInforme);
router.get('/informes/mtbc', ...operationGuard_uni(informesView_uni), informesController.getMtbc);

module.exports = router;

'use strict';

// [Aster | 2026-09-23 | ASTER-MG | FASE 1 DASHBOARD LOGISTICA ANALITICA V001]

const express = require('express');
const controller = require('./logistica-dashboard.controller');
const {
  humanInformationGuard_gnral,
  requireCompleteInformationDomain_gnral
} = require('../../middleware/information-access-gnral.middleware');

const router = express.Router();

const analyticsGuard_cor = humanInformationGuard_gnral({
  permissionCodesAny: ['LOGISTICA_DASHBOARD_PIPELINE_POR_ESTATUS_ETAPAS.VER'],
  domain: 'CORELLIAN',
  groupingCodesAny: ['LOGISTICA']
});

// Los indicadores son agregados globales de log_ops. Mientras log_ops no tenga
// llaves estructuradas de asesor/supervisor para aplicar record-scope sin
// ambiguedad, se exige alcance completo CORELLIAN y se falla cerrado.
router.get(
  '/',
  ...analyticsGuard_cor,
  requireCompleteInformationDomain_gnral('CORELLIAN'),
  controller.analytics_cor
);

module.exports = router;

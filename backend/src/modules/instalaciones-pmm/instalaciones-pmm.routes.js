'use strict';

const express = require('express');
const controller = require('./instalaciones-pmm.controller');
const { humanInformationGuard_gnral } = require('../../middleware/information-access-gnral.middleware');

const router = express.Router();

const PERMISSIONS = Object.freeze({
  tabla03Pm: 'INSTALACIONES_PMM_TABLA_03_PM_LISTADO.VER',
  tabla04M: 'INSTALACIONES_PMM_TABLA_04_M_LISTADO.VER'
});

function pmmGuard(permissionCode) {
  return humanInformationGuard_gnral({
    permissionCode,
    domain: 'CORELLIAN',
    groupingCodesAny: ['INSTALACIONES']
  });
}

router.get('/pmm/03-pm', ...pmmGuard(PERMISSIONS.tabla03Pm), controller.list03Pm);
router.get('/pmm/04-m', ...pmmGuard(PERMISSIONS.tabla04M), controller.list04M);

module.exports = router;

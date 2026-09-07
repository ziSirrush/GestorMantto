'use strict';

const express = require('express');
const insFlReadController = require('../../controllers/ins-fl-read-cor.controller');
const fotosMapaController = require('./ventas-fotos-mapa.controller');
const { humanInformationGuard_gnral } = require('../../middleware/information-access-gnral.middleware');

const router = express.Router();

function fotosMapaGuard(permissionCodesAny) {
  return humanInformationGuard_gnral({
    permissionCodesAny: Array.isArray(permissionCodesAny) ? permissionCodesAny : [permissionCodesAny],
    domain: 'CORELLIAN',
    groupingCodesAny: ['VENTAS']
  });
}

const unitedPhotosGuard = humanInformationGuard_gnral({
  permissionCode: 'PORTAFOLIO_PROYECTOS_DE_MANTENIMIENTO_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  domain: 'UNITED',
  groupingCode: 'PORTAFOLIO'
});

router.get(
  '/fotos-mapa/proyectos',
  ...fotosMapaGuard('VENTAS_FOTOS_MAPA_GALERIA_PROYECTOS_LISTADO.VER'),
  insFlReadController.getInsFl_cor
);

router.get(
  '/fotos-mapa/proyectos/fotografias',
  ...fotosMapaGuard('VENTAS_FOTOS_MAPA_GALERIA_PROYECTOS_FOTOGRAFIA.VER'),
  insFlReadController.getInsFlProjectPhotos_cor
);

router.get(
  '/fotos-mapa/proyectos-united/fotografias',
  ...unitedPhotosGuard,
  fotosMapaController.getUnitedProjectPhotos
);

module.exports = router;

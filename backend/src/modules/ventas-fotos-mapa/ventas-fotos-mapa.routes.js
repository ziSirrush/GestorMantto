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

const generalPhotosGuard = humanInformationGuard_gnral({
  permissionCode: 'FOTOGRAFIAS_CATALOGO_GENERAL_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  groupingCode: 'FOTOGRAFIAS'
});

const generalCoreNavigationGuard = humanInformationGuard_gnral({
  permissionCode: 'FOTOGRAFIAS_CATALOGO_GENERAL_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  domain: 'CORELLIAN',
  groupingCode: 'VENTAS'
});

const generalUnitedNavigationGuard = humanInformationGuard_gnral({
  permissionCode: 'FOTOGRAFIAS_CATALOGO_GENERAL_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  domain: 'UNITED',
  groupingCode: 'PORTAFOLIO'
});

const unitedPhotosGuard = humanInformationGuard_gnral({
  permissionCode: 'PORTAFOLIO_PROYECTOS_DE_MANTENIMIENTO_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  domain: 'UNITED',
  groupingCode: 'PORTAFOLIO'
});

// Catálogo General: la puerta FOTOGRAFIAS_CATALOGO_GENERAL da acceso a las
// fotografías de ambos orígenes. Los alcances CORELLIAN/UNITED NO filtran
// esta lectura; se consultan por separado en frontend únicamente para decidir
// si se muestra el botón "Ir a proyecto" de cada origen.
router.get(
  '/fotos-mapa/catalogo-general/fotografias',
  ...generalPhotosGuard,
  fotosMapaController.getGeneralProjectPhotos
);

router.get(
  '/fotos-mapa/catalogo-general/navegacion-corellian',
  ...generalCoreNavigationGuard,
  insFlReadController.getInsFlProjectPhotos_cor
);

router.get(
  '/fotos-mapa/catalogo-general/navegacion-united',
  ...generalUnitedNavigationGuard,
  fotosMapaController.getUnitedProjectPhotos
);

// Endpoints históricos por origen. Se conservan con sus guards actuales y se
// reutilizan como alcance de navegación hacia el detalle del proyecto.
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

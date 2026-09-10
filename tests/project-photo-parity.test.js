'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function occurrences(text, token) {
  return text.split(token).length - 1;
}

test('el sidebar conserva un único Catálogo General bajo Fotografías y usa su puerta vigente', () => {
  const index = read('index.html');

  assert.equal(occurrences(index, 'data-group="fotografias"'), 1);
  assert.equal(occurrences(index, '<b>Catálogo General</b>'), 1);
  assert.equal(occurrences(index, '<b>Catálogo Corellian</b>'), 0);
  assert.equal(occurrences(index, '<b>Catálogo United</b>'), 0);
  assert.ok(index.includes('data-permission="fotografias_catalogo_general"'));
  assert.ok(index.includes('data-permission-code="FOTOGRAFIAS_CATALOGO_GENERAL_ACCESO_VISUAL_MODULO.ACCESO_VISUAL"'));
  assert.ok(index.includes('data-route="ventas-fotos-mapa"'));
});

test('Catálogo General mantiene fuentes separadas, equivalencias estructuradas y límites 7 + 7', () => {
  const frontend = read('modules/ventas-fotos-mapa/ventas-fotos-mapa.js');
  const controller = read('backend/src/modules/ventas-fotos-mapa/ventas-fotos-mapa.controller.js');
  const routes = read('backend/src/modules/ventas-fotos-mapa/ventas-fotos-mapa.routes.js');

  assert.ok(routes.includes("'/fotos-mapa/catalogo-general/fotografias'"));
  assert.ok(routes.includes('FOTOGRAFIAS_CATALOGO_GENERAL_ACCESO_VISUAL_MODULO.ACCESO_VISUAL'));
  assert.ok(controller.includes('FROM ins_proyecto_fotos p'));
  assert.ok(controller.includes('FROM portafolio_proyecto_fotos pf'));
  assert.ok(controller.includes('LEFT JOIN proyecto_equivalencias pe'));
  assert.ok(controller.includes('pe.activo = 1'));
  assert.ok(frontend.includes('const MAX_FOTOS_ORIGEN=7'));
  assert.ok(frontend.includes('const MAX_FOTOS_CARRUSEL=MAX_FOTOS_ORIGEN*2'));
  assert.ok(frontend.includes('function uniquePhotos('));
  assert.ok(frontend.includes('const related=norm(row&&row.proyecto_corellian)'));
  assert.ok(frontend.includes('Carretes unidos por equivalencia'));
  assert.ok(frontend.includes('navegacion-corellian'));
  assert.ok(frontend.includes('navegacion-united'));
});

test('sólo GESTOR_FOTOGRAFIAS habilita escritura fotográfica', () => {
  const {
    userCanManageProjectPhotos_gnral,
    requireProjectPhotoManager_gnral
  } = require('../backend/src/middleware/project-photo.middleware');

  assert.equal(userCanManageProjectPhotos_gnral({ roles: ['Director General'] }), false);
  assert.equal(userCanManageProjectPhotos_gnral({ roles: ['Programador'] }), false);
  assert.equal(userCanManageProjectPhotos_gnral({ roles: ['Gestor de Fotografías'] }), true);
  assert.equal(userCanManageProjectPhotos_gnral({ roles_detalle: [{ codigo: 'GESTOR_FOTOGRAFIAS' }] }), true);

  let status = null;
  let payload = null;
  const response = {
    status(value) { status = value; return this; },
    json(value) { payload = value; return value; }
  };
  let continued = false;
  requireProjectPhotoManager_gnral({ user: { roles: ['Programador'] } }, response, () => { continued = true; });
  assert.equal(continued, false);
  assert.equal(status, 403);
  assert.equal(payload.code, 'PROJECT_PHOTO_MANAGEMENT_DENIED');
});

test('el frontend conserva un solo motor visual para CORELLIAN y UNITED', () => {
  const frontend = read('core/details.js');

  assert.ok(frontend.includes("const PROJECT_PHOTO_DOMAIN_COR = 'CORELLIAN';"));
  assert.ok(frontend.includes("const PROJECT_PHOTO_DOMAIN_UNI = 'UNITED';"));
  assert.ok(frontend.includes('function openProjectPhotoLightbox('));
  assert.ok(frontend.includes('function renderProjectPhotoLightbox('));
  assert.ok(frontend.includes('function bindProjectPhotoCover('));
  assert.ok(occurrences(frontend, 'bindProjectPhotoCover(detailRoot') >= 2);
  assert.ok(frontend.includes("upload:'/api/ins-fl/proyectos/fotografias/'+id"));
  assert.ok(frontend.includes("upload:'/api/portafolio/proyectos/'+id+'/fotografias'"));
  assert.ok(frontend.includes("principal:'/api/portafolio/proyectos/'+id+'/fotografias/principal'"));
  assert.ok(frontend.includes("addBtn.style.display=canManage&&projectPhotoState.allowAdd?'inline-block':'none'"));
  assert.ok(frontend.includes("btn.style.display=allowed?'inline-block':'none'"));
});

test('POST y PATCH de ambos dominios exigen alcance y rol de gestor', () => {
  const corRoutes = read('backend/src/routes/ins-fl.routes.js');
  const uniRoutes = read('backend/src/modules/portafolio/portafolio.routes.js');

  assert.ok(occurrences(corRoutes, 'requireCorellianProjectPhotoScope_gnral') >= 3);
  assert.ok(occurrences(corRoutes, 'requireProjectPhotoManager_gnral') >= 3);
  assert.ok(occurrences(uniRoutes, 'requirePortafolioProjectScope_gnral') >= 4);
  assert.ok(occurrences(uniRoutes, 'requireProjectPhotoManager_gnral') >= 3);
  assert.ok(corRoutes.indexOf('requireCorellianProjectPhotoScope_gnral') < corRoutes.lastIndexOf('requireProjectPhotoManager_gnral'));
  assert.ok(uniRoutes.includes("'/portafolio/proyectos/:proyecto/fotografias'"));
  assert.ok(uniRoutes.includes("'/portafolio/proyectos/:proyecto/fotografias/principal'"));
});

test('United usa portafolio_proyecto_fotos, siete slots y primera foto principal', () => {
  const uniPhotos = read('backend/src/modules/portafolio/portafolio-proyecto-fotos_uni.js');

  for (let index = 1; index <= 7; index += 1) {
    assert.ok(uniPhotos.includes(`'foto_${index}'`), `Falta foto_${index}`);
  }
  assert.ok(uniPhotos.includes('MAX_PROJECT_PHOTOS_UNI = PROJECT_PHOTO_FIELDS_UNI.length'));
  assert.ok(uniPhotos.includes('FROM portafolio_proyecto_fotos'));
  assert.ok(uniPhotos.includes('UPDATE portafolio_proyecto_fotos'));
  assert.ok(uniPhotos.includes('const principal = firstPhoto'));
  assert.ok(uniPhotos.includes("empresa: 'UNITED'"));
  assert.ok(uniPhotos.includes("modulo: 'portafolio'"));
  assert.ok(uniPhotos.includes("subruta: 'fotografias'"));
  assert.ok(uniPhotos.includes("policyName: 'IMAGE'"));
  assert.ok(uniPhotos.includes('[uploaded.storage_url, principal'));
});

test('no se agrega DELETE, tabla nueva ni id de rol hardcodeado', () => {
  const files = [
    read('core/details.js'),
    read('backend/src/middleware/project-photo.middleware.js'),
    read('backend/src/routes/ins-fl.routes.js'),
    read('backend/src/modules/portafolio/portafolio.routes.js'),
    read('backend/src/modules/portafolio/portafolio-proyecto-fotos_uni.js')
  ];
  const combined = files.join('\n');

  assert.ok(!combined.includes('id_rol = 63'));
  assert.ok(!combined.includes("router.delete('/proyectos/fotografias"));
  assert.ok(!combined.includes("router.delete('/portafolio/proyectos"));
  assert.ok(!/CREATE\s+TABLE/i.test(combined));
});

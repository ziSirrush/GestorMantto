'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const ROOT = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

function loadScopedController({scope, rows, queryError} = {}) {
  const filename = path.join(ROOT, 'backend/src/controllers/ins-fl-read-cor.controller.js');
  const required = {
    '../config/db': {
      async query(sql, params) {
        required.calls.push({sql, params});
        if (queryError) throw queryError;
        return [rows || []];
      }
    },
    '../services/storage/azure-storage.service': {},
    '../modules/ventas/ventas-visibility.service': {},
    '../services/information-record-scope-gnral.service': {
      buildInsFlScopeSql_gnral(req, alias) {
        required.scopeCall = {req, alias};
        if (scope instanceof Error) throw scope;
        return scope || {sql:'f.id_asesor = ?', params:[14]};
      }
    },
    calls: [],
    scopeCall: null
  };
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod.require = (name) => {
    assert.ok(Object.hasOwn(required, name), 'Unexpected module dependency: '+name);
    return required[name];
  };
  mod._compile(fs.readFileSync(filename, 'utf8'), filename);
  return {handler:mod.exports.getInsFlProjectPhotoManagementScope_cor, required};
}

function response() {
  const res = {
    statusCode:200,
    body:null,
    status(status) {this.statusCode=status;return this;},
    json(body) {this.body=body;return this;}
  };
  return res;
}

test('INT-10 separa navegacion de escritura fotografica CORELLIAN', () => {
  const source = read('modules/ventas-fotos-mapa/ventas-fotos-mapa.js');
  assert.ok(source.includes('int10AccesosGestionCore=createAccessSets(coreGestion,[])'));
  assert.ok(source.includes("leerNavegacionInt10('/api/ins-fl/proyectos/fotografias-gestion')"));
  assert.ok(source.includes('canOpenCorellian:puedeNavegarCorellian(id,name,access)'));
  assert.ok(source.includes('canManageCorellian:puedeNavegarCorellian(id,name,gestion)'));
  assert.ok(source.includes('allowAdd:p.coreManaged!==false&&p.canManageCorellian===true'));
  assert.ok(source.includes('allowSetPrincipal:p.coreManaged!==false&&p.canManageCorellian===true'));
  assert.ok(source.includes("'CORELLIAN',p.canManageCorellian===true"));
  assert.ok(!source.includes('allowAdd:p.coreManaged!==false&&p.canOpenCorellian===true'));
});

test('INT-10 mantiene rol + guard + alcance en la consulta y en las mutaciones', () => {
  const routes = read('backend/src/routes/ins-fl.routes.js');
  const controller = read('backend/src/controllers/ins-fl-read-cor.controller.js');
  assert.match(routes, /\/proyectos\/fotografias-gestion'[\s\S]*instalacionesGuard\(PROJECT_DETAIL_PHOTO_ACCESS\)[\s\S]*requireProjectPhotoManager_gnral[\s\S]*getInsFlProjectPhotoManagementScope_cor/);
  assert.ok(routes.indexOf("'/proyectos/fotografias-gestion'") < routes.indexOf("router.get('/:id'"));
  for (const method of ['router.post(', 'router.delete(', 'router.patch(']) {
    const section = routes.slice(routes.indexOf(method, routes.indexOf("const PROJECT_DETAIL_PHOTO_ACCESS")));
    assert.match(section, /instalacionesGuard\(PROJECT_DETAIL_PHOTO_ACCESS\)/);
    assert.match(section, /requireCorellianProjectPhotoScope_gnral/);
    assert.match(section, /requireProjectPhotoManager_gnral/);
  }
  assert.ok(controller.includes("buildInsFlScopeSql_gnral(req, 'f')"));
  assert.ok(controller.includes('SELECT DISTINCT TRIM(f.id_proyecto) AS id_ppns'));
});

test('INT-10 devuelve exclusivamente identificadores dentro de alcance y respeta paginacion', async () => {
  const {handler, required} = loadScopedController({rows:[{id_ppns:'ABC-12'},{id_ppns:'ABC-13'}]});
  const req = {query:{limit:'2',offset:'4'}};
  const res = response();
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body,{ok:true,data:[{id_ppns:'ABC-12'},{id_ppns:'ABC-13'}],limit:2,offset:4});
  assert.equal(required.scopeCall.alias,'f');
  assert.equal(required.scopeCall.req,req);
  assert.equal(required.calls.length,1);
  assert.match(required.calls[0].sql,/AND f\.id_asesor = \?/);
  assert.match(required.calls[0].sql,/LIMIT \? OFFSET \?/);
  assert.deepEqual(required.calls[0].params,[14,2,4]);
  assert.doesNotMatch(required.calls[0].sql,/foto_blt_\d|JOIN portafolio/i);
});

test('INT-10 no devuelve datos gestionables si falla el calculo de alcance', async () => {
  const {handler, required} = loadScopedController({scope:new Error('INFORMATION_RECORD_SCOPE_CONFIGURATION_ERROR')});
  const res = response();
  await handler({query:{}},res);
  assert.equal(res.statusCode,500);
  assert.equal(res.body.ok,false);
  assert.equal(required.calls.length,0);
});

test('INT-10 conserva UNITED como lectura historica separada y 7+7 fotografias', () => {
  const source = read('modules/ventas-fotos-mapa/ventas-fotos-mapa.js');
  assert.ok(source.includes('const MAX_FOTOS_ORIGEN=7'));
  assert.ok(source.includes('const MAX_FOTOS_CARRUSEL=MAX_FOTOS_ORIGEN*2'));
  assert.ok(source.includes('proyecto_equivalencias') || source.includes('row.proyecto_corellian'));
  assert.ok(source.includes("'UNITED',false"));
  assert.ok(source.includes("photoDomain:'CORELLIAN'"));
  assert.ok(source.includes('canOpenUnited:access.unitedNames.has(unitedKey)'));
  const corRoutes = read('backend/src/routes/ins-fl.routes.js');
  assert.ok(corRoutes.includes('requireProjectPhotoManager_gnral'));
});

test('INT-10: el navegador pide la nueva version del JS y del module-loader', () => {
  const loader=read('core/module-loader.js');
  const index=read('index.html');
  const suffix='20261017-int10-gestor-fotos-v001';
  assert.ok(loader.includes('ventas-fotos-mapa.js?v='+suffix));
  assert.ok(index.includes('core/module-loader.js?v='+suffix));
});

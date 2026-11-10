'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=(rel)=>fs.readFileSync(path.join(root,rel),'utf8');

const html=read('index.html');
const router=read('core/router.js');
const shell=read('modules/experimental-ns/experimental-ns.js');
const front=read('modules/experimental-ns/equipos-parados/equipos-parados-ns.js');
const repo=read('backend/src/modules/experimental-ns/experimental-ns-equipos-parados.repository.js');
const service=read('backend/src/modules/experimental-ns/experimental-ns-equipos-parados.service.js');
const routes=read('backend/src/modules/experimental-ns/experimental-ns-equipos-parados.routes.js');
const scope=read('backend/src/modules/experimental-ns/experimental-ns.scope.js');
const routeIndex=read('backend/src/routes/index.js');

const ROUTE='experimental-ns-equipos-parados';
const PERMISSION='EXPERIMENTAL_NS_EQUIPOS_PARADOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';

test('Equipos Parados NS queda registrado en sidebar, vista y router',()=>{
  assert.match(html,new RegExp('data-route="'+ROUTE+'"'));
  assert.match(html,new RegExp('id="view-'+ROUTE+'"'));
  assert.ok(router.includes("'"+ROUTE+"'"));
  assert.ok(shell.includes("'"+ROUTE+"'"));
  assert.ok(html.includes(PERMISSION));
});

test('Equipos Parados NS usa permiso individual y guard central',()=>{
  assert.ok(scope.includes(PERMISSION));
  assert.ok(service.includes(PERMISSION));
  assert.match(routes,/humanInformationGuard_gnral/);
  assert.match(routes,/groupingCode:'EXPERIMENTAL_NS'/);
  assert.match(routes,/domain:'UNITED'/);
});

test('Repositorio EP consulta solo clones NS y falla cerrado',()=>{
  assert.match(repo,/FROM ns_tickets_pruebas t/);
  assert.match(repo,/JOIN ns_portafolio_pruebas p/);
  assert.doesNotMatch(repo,/\bFROM\s+`?(tickets|portafolio)`?\b/i);
  assert.doesNotMatch(repo,/\bJOIN\s+`?(tickets|portafolio)`?\b/i);
  assert.match(repo,/MAX_ROWS = 10000/);
  assert.match(repo,/EXPERIMENTAL_NS_STOPPED_SCHEMA_INCOMPLETE/);
});

test('Frontend EP no conserva lectura directa de NetSuite ni datos.json',()=>{
  assert.match(front,/\/api\/experimental-ns\/equipos-parados\/inicial/);
  assert.doesNotMatch(front,/\/api\/ns\/equipos-parados/);
  assert.doesNotMatch(front,/datos\.json/);
  assert.match(front,/Fail-closed/);
  assert.match(front,/Imprimir \/ PDF/);
});

test('Backend monta ruta EP dentro de Experimental NS',()=>{
  assert.match(routeIndex,/experimentalNsEquiposParadosRoutes/);
  assert.match(routeIndex,/router\.use\('\/experimental-ns', experimentalNsEquiposParadosRoutes\)/);
});
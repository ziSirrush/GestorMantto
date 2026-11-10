'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../src/modules/experimental-ns');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const repo=read('experimental-ns-equipos-parados.repository.js');
const service=read('experimental-ns-equipos-parados.service.js');
const routes=read('experimental-ns-equipos-parados.routes.js');
const scope=read('experimental-ns.scope.js');
const index=fs.readFileSync(path.join(__dirname,'../src/routes/index.js'),'utf8');
const permission='EXPERIMENTAL_NS_EQUIPOS_PARADOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';

test('Equipos Parados API usa permiso individual y guard UNITED',()=>{
  assert.ok(scope.includes(permission));
  assert.ok(service.includes(permission));
  assert.match(routes,/humanInformationGuard_gnral/);
  assert.match(routes,/groupingCode:'EXPERIMENTAL_NS'/);
  assert.match(routes,/domain:'UNITED'/);
});

test('Equipos Parados API consulta solo tablas NS de prueba',()=>{
  assert.match(repo,/FROM ns_tickets_pruebas t/);
  assert.match(repo,/JOIN ns_portafolio_pruebas p/);
  assert.doesNotMatch(repo,/\bFROM\s+`?(tickets|portafolio)`?\b/i);
  assert.doesNotMatch(repo,/\bJOIN\s+`?(tickets|portafolio)`?\b/i);
  assert.match(repo,/EXPERIMENTAL_NS_STOPPED_SCHEMA_INCOMPLETE/);
  assert.match(repo,/MAX_ROWS = 10000/);
});

test('Equipos Parados API queda montada solo en Experimental NS',()=>{
  assert.match(index,/experimentalNsEquiposParadosRoutes/);
  assert.match(index,/router\.use\('\/experimental-ns', experimentalNsEquiposParadosRoutes\)/);
  assert.match(routes,/router\.get\('\/equipos-parados\/inicial'/);
  assert.doesNotMatch(routes,/\.post\(|\.put\(|\.patch\(|\.delete\(/);
});

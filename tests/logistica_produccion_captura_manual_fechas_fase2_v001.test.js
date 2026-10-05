'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const js=fs.readFileSync(path.join(root,'modules/logistica-produccion/logistica-produccion.js'),'utf8');
const service=fs.readFileSync(path.join(root,'backend/src/modules/logistica-produccion/logistica-produccion.service.js'),'utf8');
const repo=fs.readFileSync(path.join(root,'backend/src/modules/logistica-produccion/logistica-produccion.repository.js'),'utf8');
const loader=fs.readFileSync(path.join(root,'core/module-loader.js'),'utf8');

test('Listado usa fechas capturadas de logistica_produccion como autoridad',()=>{
  assert.match(service,/const fechaPvo=row\.fecha_pvo\|\|null/);
  assert.match(service,/const fechaVisita=row\.fecha_pvo_fl\|\|null/);
  assert.match(service,/const fechaCubos=row\.fecha_cubos\|\|null/);
  assert.doesNotMatch(service,/const fechaPvo=sourceBound\?/);
  assert.match(repo,/const pvoExpr=`p\.fecha_pvo`/);
  assert.match(repo,/COALESCE\(p\.fecha_pvo_fl,''\)/);
  assert.match(repo,/COALESCE\(p\.fecha_cubos,''\)/);
});

test('Fuentes log_ops e ins_fl permanecen separadas para Detalle',()=>{
  assert.match(service,/const fechaPvoFuente=sourceBound\?\(row\.fecha_pvo_logistica\|\|null\):null/);
  assert.match(service,/const fechaVisitaFuenteRaw=sourceBound\?\(row\.fechas_pvo_fl_fuente\|\|row\.fechas_visita\|\|''\):''/);
  assert.match(service,/const fechaCubosFuenteRaw=sourceBound\?\(row\.fechas_cubos_fuente\|\|''\):''/);
  assert.match(service,/fecha_pvo_fuente:fechaPvoFuente/);
  assert.match(service,/fecha_visita_fuente:fechaVisitaFuente/);
  assert.match(service,/fecha_cubos_fuente:fechaCubosFuente/);
  assert.match(service,/fecha_pvo:decorated\.fecha_pvo_fuente/);
  assert.match(service,/fecha_visita:decorated\.fecha_visita_fuente/);
  assert.match(service,/fecha_entrega_cubos:decorated\.fecha_cubos_fuente/);
});

test('Edicion Manual permite modificar PVO Visita y Cubos con calendario',()=>{
  assert.match(js,/id="lp-edit-pvo-date" type="date"/);
  assert.match(js,/id="lp-edit-visit-date" type="date"/);
  assert.match(js,/id="lp-edit-cubes-date" type="date"/);
  assert.match(js,/payload\.fecha_pvo=pvoDate/);
  assert.match(js,/payload\.fecha_pvo_fl=visitDate/);
  assert.match(js,/payload\.fecha_cubos=cubesDate/);
});

test('Backend restringe las tres fechas editables a registros Manuales y las valida',()=>{
  assert.match(service,/const manualAllowed=\[\.\.\.commonAllowed,'id_log_ops','id_asesor','id_supervisor','fecha_pvo','fecha_pvo_fl','fecha_cubos'\]/);
  assert.match(service,/Object\.hasOwn\(input,'fecha_pvo'\)\)next\.fecha_pvo=optionalDate\(input\.fecha_pvo,'fecha_pvo'\)/);
  assert.match(service,/Object\.hasOwn\(input,'fecha_pvo_fl'\)\)next\.fecha_pvo_fl=optionalDate\(input\.fecha_pvo_fl,'fecha_pvo_fl'\)/);
  assert.match(service,/Object\.hasOwn\(input,'fecha_cubos'\)\)next\.fecha_cubos=optionalDate\(input\.fecha_cubos,'fecha_cubos'\)/);
});

test('Seleccionar proyecto no copia fechas operativas a la captura',()=>{
  assert.match(js,/function syncManualProjectFields\(fallback=null\).*lp-manual-log-status/);
  assert.doesNotMatch(js,/setManualSourceField\('lp-manual-pvo'/);
  assert.doesNotMatch(js,/setManualSourceField\('lp-manual-visita'/);
  assert.doesNotMatch(js,/setManualSourceField\('lp-manual-cubos'/);
});

test('Cierre Fase 4 conserva separacion de fuentes y comparacion solo en Detalle',()=>{
  assert.match(js,/comparisonLabel\('fecha_pvo'\)/);
  assert.match(js,/comparisonLabel\('fecha_visita'\)/);
  assert.match(js,/comparisonLabel\('fecha_cubos'\)/);
  const matches=loader.match(/20261005-pvo-cierre-fase4-v001/g)||[];
  assert.equal(matches.length,10);
});

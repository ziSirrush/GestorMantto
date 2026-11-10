'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const front=fs.readFileSync(path.resolve(__dirname,'../modules/ventas-dashboard/ventas-dashboard.js'),'utf8');

test('Carga normal de Ventas usa un snapshot contextual',()=>{
  assert.match(front,/\/api\/ventas\/dashboard\/inicial\?/);
  assert.match(front,/snapshotQuery\.set\('anio_perdido'/);
  assert.match(front,/snapshotQuery\.set\('partes'/);
  assert.match(front,/snapshot\.jobs/);
});
test('Carga normal ya no arma Promise.all de kpis tablas y operacion',()=>{
  const start=front.indexOf('async function loadData');
  const end=front.indexOf('async function loadSectionYear',start);
  const block=front.slice(start,end);
  assert.doesNotMatch(block,/dashboard\/kpis/);
  assert.doesNotMatch(block,/dashboard\/tablas/);
  assert.doesNotMatch(block,/dashboard\/operacion/);
  assert.doesNotMatch(block,/Promise\.allSettled\(jobs/);
});
test('Cambio explícito de año conserva consulta de nueva ventana',()=>{
  const start=front.indexOf('async function loadSectionYear');
  const end=front.indexOf('function noteMutation',start);
  const block=front.slice(start,end);
  assert.match(block,/dashboard\/tablas/);
  assert.match(block,/dashboard\/kpis/);
});

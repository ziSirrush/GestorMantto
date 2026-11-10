'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const front=fs.readFileSync(path.resolve(__dirname,'../modules/instalaciones-dashboard/instalaciones-dashboard_cor.js'),'utf8');

test('Instalaciones usa snapshot combinado en apertura y refresh',()=>{
  assert.match(front,/\/api\/instalaciones\/dashboard\/inicial/);
  assert.match(front,/response\.bootstrap/);
  assert.match(front,/response\.summary/);
  assert.match(front,/response\.report/);
  const start=front.indexOf('async function refresh_cor');
  const end=front.indexOf('function resetOpenState_cor',start);
  const block=front.slice(start,end);
  assert.doesNotMatch(block,/\/dashboard\/bootstrap/);
  assert.doesNotMatch(block,/Promise\.all\(\[\s*loadSummary_cor/);
});

test('Cambios de contexto conservan resumen y reporte lazy',()=>{
  assert.match(front,/async function loadSummary_cor/);
  assert.match(front,/async function loadReport_cor/);
  assert.match(front,/reloadUniverse_cor/);
  assert.match(front,/idb-cor-section-select/);
});

test('Edición de celda permanece mutación separada',()=>{
  assert.match(front,/\/api\/instalaciones\/dashboard\/reporte\/.*\/celda/);
  assert.match(front,/mutateJson_cor/);
});

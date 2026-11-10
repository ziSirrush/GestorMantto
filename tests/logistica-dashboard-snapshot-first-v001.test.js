'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const front=fs.readFileSync(path.resolve(__dirname,'../modules/dashboard-logistica/dashboard-logistica.js'),'utf8');

test('Logistica usa un snapshot en la apertura normal',()=>{
  assert.match(front,/fetchInitialSnapshot/);
  assert.match(front,/\/api\/logistica\/dashboard\/inicial/);
  const start=front.indexOf('async function load()');
  const block=front.slice(start);
  assert.doesNotMatch(block,/Promise\.all\(\[\s*fetchRows/);
  assert.match(block,/state\.rows=snapshot\.rows/);
  assert.match(block,/state\.analytics=snapshot\.analytics/);
});
test('Cambio de periodo conserva consulta analitica de nueva ventana',()=>{
  assert.match(front,/state\.analytics=await fetchAnalytics\(period\)/);
});
test('Corte historico y simulador permanecen lazy',()=>{
  assert.match(front,/fetchCutByWeek\(anio,semana\)/);
  assert.match(front,/\/api\/logistica\/dashboard\/simulacion/);
});

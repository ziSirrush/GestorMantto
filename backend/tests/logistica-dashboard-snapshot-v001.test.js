'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../src/modules/logistica-dashboard');
const routes=fs.readFileSync(path.join(root,'logistica-dashboard.routes.js'),'utf8');
const service=fs.readFileSync(path.join(root,'logistica-dashboard.service.js'),'utf8');
const controller=fs.readFileSync(path.join(root,'logistica-dashboard.controller.js'),'utf8');
const repo=fs.readFileSync(path.join(root,'logistica-dashboard.repository.js'),'utf8');

test('Dashboard Logistica expone snapshot inicial completo',()=>{
  assert.match(routes,/\/inicial/);
  assert.match(controller,/LOGISTICA_DASHBOARD_SNAPSHOT_V001/);
  assert.match(service,/Promise\.all/);
  assert.match(service,/dashboardRows_cor/);
  assert.match(service,/latestClosedCut_cor/);
  assert.match(service,/closedCutsCatalog_cor/);
  assert.match(service,/analytics_cor/);
});

test('Snapshot limita filas y mantiene cortes cerrados',()=>{
  assert.match(repo,/Math\.min\(5000/);
  assert.match(repo,/WHERE estado='CERRADO'/);
  assert.match(repo,/LIMIT 100/);
});

test('Simulador y corte historico no se absorben en el snapshot',()=>{
  const start=service.indexOf('async function initial_cor');
  const end=service.indexOf('async function freightSimulation_cor',start);
  const block=service.slice(start,end);
  assert.doesNotMatch(block,/freightSimulation_cor/);
  assert.match(routes,/\/simulacion/);
});

'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../src/modules/dashboard-operativo');
const repo=fs.readFileSync(path.join(root,'dashboard-operativo.repository.js'),'utf8');
const service=fs.readFileSync(path.join(root,'dashboard-operativo.service.js'),'utf8');
const controller=fs.readFileSync(path.join(root,'dashboard-operativo.controller.js'),'utf8');

test('Dashboard Operativo snapshot incluye 12 meses preventivos y criticidad',()=>{
  assert.match(repo,/getPreventivosPorMeses/);
  assert.match(repo,/getCriticosCodigos/);
  assert.match(service,/monthsWindow\(mes, 12\)/);
  assert.match(service,/preventivos_por_mes/);
  assert.match(service,/criticos_codigos/);
  assert.match(controller,/DASHBOARD_OPERATIVO_SNAPSHOT_V001/);
});

test('Criticidad operativa conserva alcance UNITED y limite fail-closed',()=>{
  assert.match(repo,/buildPortafolioScopeSql_gnral/);
  assert.match(repo,/LIMIT 10001/);
  assert.match(repo,/DASHBOARD_OPERATIVO_SNAPSHOT_LIMIT/);
});

test('Endpoint preventivos individual se conserva por compatibilidad',()=>{
  assert.match(controller,/getPreventivosSupervisor/);
});
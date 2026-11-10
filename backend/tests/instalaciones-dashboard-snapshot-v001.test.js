'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../src/modules/instalaciones-dashboard');
const routes=fs.readFileSync(path.join(root,'instalaciones-dashboard.routes.js'),'utf8');
const controller=fs.readFileSync(path.join(root,'instalaciones-dashboard.controller.js'),'utf8');

test('Instalaciones expone snapshot inicial con acceso visual',()=>{
  assert.match(routes,/\/dashboard\/inicial/);
  assert.match(routes,/controller\.initial_cor/);
  assert.match(controller,/INSTALACIONES_DASHBOARD_SNAPSHOT_V001/);
  assert.match(controller,/SNAPSHOT_LAZY_DETAIL/);
});

test('Snapshot respeta permisos internos de resumen y reporte',()=>{
  assert.match(controller,/permissions\.selector_ver === true/);
  assert.match(controller,/permissions\.selector_filtrar === true/);
  assert.match(controller,/permissions\.reporte_selector_ver === true/);
  assert.match(controller,/permissions\.reporte_listado_ver === true/);
  assert.match(controller,/validateDashboardQueryScope_cor/);
});

test('Edicion rápida permanece transaccional fuera del snapshot',()=>{
  assert.match(routes,/router\.patch/);
  assert.match(routes,/\/dashboard\/reporte\/\:id_ins_fl\/celda/);
  assert.match(controller,/quick_edit: 'TRANSACTIONAL'/);
});

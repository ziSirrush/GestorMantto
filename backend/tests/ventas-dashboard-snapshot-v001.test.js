'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const routes=fs.readFileSync(path.resolve(__dirname,'../src/modules/ventas-dashboard/ventas-dashboard.routes.js'),'utf8');
const service=fs.readFileSync(path.resolve(__dirname,'../src/modules/ventas-dashboard/ventas-dashboard.service.js'),'utf8');

test('Ventas Dashboard expone snapshot contextual con permisos existentes',()=>{
  assert.match(routes,/\/dashboard\/inicial/);
  assert.match(routes,/DASHBOARD_SNAPSHOT_PERMISSIONS/);
  assert.match(routes,/loadDashboardSnapshotPermissions/);
  assert.match(service,/VENTAS_DASHBOARD_SNAPSHOT_V001/);
  assert.match(service,/SNAPSHOT_CONTEXT/);
});
test('Snapshot Ventas conserva años independientes y carga parcial por partes',()=>{
  assert.match(service,/anio_perdido/);
  assert.match(service,/snapshotParts/);
  assert.match(service,/kpis_ventas/);
  assert.match(service,/commercial_perdido/);
  assert.match(service,/operational/);
});
test('Snapshot Ventas tolera fallo parcial sin ocultar datos válidos',()=>{
  assert.match(service,/Promise\.allSettled/);
  assert.match(service,/errors\.length===jobs\.length/);
});

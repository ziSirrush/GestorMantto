'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../src/modules/dashboard-callcenter');
const repo=fs.readFileSync(path.join(root,'dashboard-callcenter.repository.js'),'utf8');
const service=fs.readFileSync(path.join(root,'dashboard-callcenter.service.js'),'utf8');

test('Call Center snapshot agrega MTBC y criticidad en la carga inicial',()=>{
  assert.match(repo,/getSnapshotAnalytics/);
  assert.match(repo,/fallas_blt_periodo_critico/);
  assert.match(repo,/LIMIT 10001/);
  assert.match(service,/CALLCENTER_SNAPSHOT_V001/);
  assert.match(service,/mtbc_equipos/);
  assert.match(service,/mtbc_proyectos/);
  assert.match(service,/criticos_codigos/);
});

test('Call Center conserva U365 fuera del snapshot inicial',()=>{
  assert.doesNotMatch(service,/u365_equipos/);
  assert.doesNotMatch(service,/u365_proyectos/);
});

test('Call Center snapshot conserva alcance UNITED por Portafolio',()=>{
  assert.match(repo,/buildPortafolioScopeSql_gnral/);
  assert.match(repo,/INNER JOIN z_op z_cc/);
  assert.match(repo,/p\.estado_registro = 1/);
});

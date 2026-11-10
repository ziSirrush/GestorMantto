'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const front=fs.readFileSync(path.join(root,'modules/callcenter/callcenter.js'),'utf8');

test('Call Center consume MTBC y criticidad desde el snapshot inicial',()=>{
  assert.match(front,/initialData\.mtbc_equipos/);
  assert.match(front,/initialData\.mtbc_proyectos/);
  assert.match(front,/initialData\.criticos_codigos/);
  assert.match(front,/initialData\.criticidad/);
});

test('Call Center ya no consulta MTBC ni críticos por endpoints separados durante la apertura',()=>{
  assert.doesNotMatch(front,/fetchCriticidadUsuario/);
  assert.doesNotMatch(front,/\/api\/indicadores\/mtbc\/equipos/);
  assert.doesNotMatch(front,/\/api\/indicadores\/mtbc\/proyectos/);
  assert.doesNotMatch(front,/\/api\/equipos-criticos\?/);
});

test('Call Center conserva U365 como detalle lazy',()=>{
  assert.match(front,/\/api\/operacion\/dashboard-call-center\/u365\/proyectos/);
  assert.match(front,/\/api\/operacion\/dashboard-call-center\/u365\/equipos/);
  assert.match(front,/fetchU365Pages/);
  assert.doesNotMatch(front,/fetchMtbcPages/);
});

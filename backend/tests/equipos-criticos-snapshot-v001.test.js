'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.resolve(__dirname,'../src/modules/criticos/criticos-cuartos-operacion.service.js'),'utf8');

test('Proyectos críticos devuelve MTBC dentro de su snapshot paginado',()=>{
  assert.match(src,/getProjectMtbcRows/);
  assert.match(src,/EQUIPOS_CRITICOS_PROYECTOS_V001/);
  assert.match(src,/mtbc_anio/);
  assert.match(src,/mtbc_365/);
});

test('Criticidad corporativa U365 expone MTBC sin endpoint MTBC adicional',()=>{
  const start=src.indexOf('async function getCriticidadCorporativa');
  const block=src.slice(start);
  assert.match(block,/fallas_blt_anio/);
  assert.match(block,/mtbc_365/);
  assert.match(block,/mtbc_anio/);
});

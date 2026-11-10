'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const repo=fs.readFileSync(path.resolve(__dirname,'../src/modules/resumen-dia/resumen-dia.repository.js'),'utf8');
const service=fs.readFileSync(path.resolve(__dirname,'../src/modules/resumen-dia/resumen-dia.service.js'),'utf8');

test('Resumen Día incluye criticidad ligera en snapshot inicial',()=>{
  assert.match(repo,/getCriticosCodigos/);
  assert.match(repo,/fallas_blt_periodo/);
  assert.match(repo,/LIMIT 10001/);
  assert.match(service,/RESUMEN_DIA_SNAPSHOT_V001/);
  assert.match(service,/criticos_codigos/);
});
test('Criticidad de Resumen conserva alcance Portafolio UNITED',()=>{
  assert.match(repo,/buildPortafolioScopeSql_gnral\(req, 'p'\)/);
  assert.match(repo,/RESUMEN_DIA_CRITICOS_LIMIT/);
});

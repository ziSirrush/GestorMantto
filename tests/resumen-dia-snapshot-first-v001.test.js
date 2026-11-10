'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const front=fs.readFileSync(path.resolve(__dirname,'../modules/resumen-dia/resumen-dia.js'),'utf8');

test('Resumen Día consume criticidad desde snapshot inicial',()=>{
  assert.match(front,/data\.criticos_codigos/);
  assert.match(front,/data\.criticidad/);
  assert.match(front,/criticos_periodo/);
  assert.match(front,/min_fallas/);
});
test('Resumen Día ya no consulta preferencias ni equipos críticos por separado',()=>{
  assert.doesNotMatch(front,/\/api\/usuarios\/me\/criticos-preferencias/);
  assert.doesNotMatch(front,/\/api\/equipos-criticos\?page=1&page_size=5000/);
  assert.doesNotMatch(front,/fetchCriticidadUsuario/);
});
test('Cambio de preferencia crítica renueva snapshot',()=>{
  assert.match(front,/mantto:criticos-preferencias-updated/);
  assert.match(front,/onCriticalPreferencesUpdated/);
});

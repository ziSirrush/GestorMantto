'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const front=fs.readFileSync(path.join(root,'modules/dashboard-operativo/dashboard-operativo.js'),'utf8');

test('Operativo consume preventivos y criticidad desde snapshot inicial',()=>{
  assert.match(front,/initialData\.preventivos_por_mes/);
  assert.match(front,/initialData\.criticos_codigos/);
  assert.match(front,/initialData\.criticidad/);
  assert.match(front,/state\.preventivosPorMes\[mes\]/);
});

test('Operativo no consulta enriquecimientos separados en la UI',()=>{
  assert.doesNotMatch(front,/\/api\/servicios-preventivos\/resumen-supervisor/);
  assert.doesNotMatch(front,/\/api\/usuarios\/me\/criticos-preferencias/);
  assert.doesNotMatch(front,/\/api\/equipos-criticos\?/);
});

test('Cambio de mes reutiliza memoria y preferencia crítica recarga snapshot',()=>{
  assert.match(front,/function render\(\)/);
  assert.match(front,/refreshCriticidadUsuario/);
  assert.match(front,/await loadData\(\)/);
});

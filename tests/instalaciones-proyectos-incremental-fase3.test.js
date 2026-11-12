'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'..');

test('F3 incremental: ruta usa el mismo permiso humano que la lectura completa',()=>{
  const src=fs.readFileSync(path.join(ROOT,'backend/src/routes/ins-fl.routes.js'),'utf8');
  assert.match(src,/\/changes/);
  assert.match(src,/getInsFlChanges_cor/);
  assert.match(src,/INSTALACIONES_PROYECTOS_TABLA_ACTIVOS_REGISTROS\.VER/);
});

test('F3 incremental: cursor compuesto ordena por updated_at e id sin quitar fallback',()=>{
  const src=fs.readFileSync(path.join(ROOT,'backend/src/controllers/ins-fl-read-cor.controller.js'),'utf8');
  assert.match(src,/f\.updated_at > FROM_UNIXTIME/);
  assert.match(src,/f\.updated_at = FROM_UNIXTIME/);
  assert.match(src,/ORDER BY f\.updated_at ASC, f\.id_ins_fl ASC/);
  assert.match(src,/sync_cursor/);
});

test('F3 incremental: frontend usa solapamiento, merge por PK y carga completa de respaldo',()=>{
  const src=fs.readFileSync(path.join(ROOT,'modules/instalaciones-proyectos/instalaciones-proyectos.js'),'utf8');
  assert.match(src,/pyOverlapCursor/);
  assert.match(src,/pyMergeRawRows/);
  assert.match(src,/\/api\/ins-fl\/changes/);
  assert.match(src,/Delta no disponible; se usa carga completa/);
  assert.match(src,/pyCargarDesdeAiven/);
});

'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'..');

test('F2 cache instalaciones: endpoint revalida alcance antes de usar cache',()=>{
  const routes=fs.readFileSync(path.join(ROOT,'backend/src/routes/ins-fl.routes.js'),'utf8');
  assert.match(routes,/\/cache-state/);
  assert.match(routes,/INSTALACIONES_PROYECTOS_TABLA_ACTIVOS_REGISTROS\.VER/);
});

test('F2 cache instalaciones: cache queda aislada por actor efectivo dominio dataset y firma',()=>{
  const src=fs.readFileSync(path.join(ROOT,'modules/instalaciones-proyectos/instalaciones-proyectos.js'),'utf8');
  assert.match(src,/PY_CACHE_DATASET='INSTALACIONES-PROYECTOS-LIVE'/);
  assert.match(src,/scope_signature/);
  assert.match(src,/ManttoOfflineStorage/);
  assert.match(src,/pyLoadWarmCache/);
  assert.match(src,/pySaveWarmCache/);
});

test('F2 cache instalaciones: almacenamiento central conserva firma de alcance',()=>{
  const src=fs.readFileSync(path.join(ROOT,'core/offline-storage.js'),'utf8');
  assert.match(src,/scope_signature:typeof metadata\?\.scope_signature/);
});

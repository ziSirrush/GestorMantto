'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'..');

test('F4: actualizador global ejecuta protectores antes de limpiar caches o recargar',()=>{
  const src=fs.readFileSync(path.join(ROOT,'core/app-update.js'),'utf8');
  assert.match(src,/registerBeforeReload/);
  assert.match(src,/flushBeforeReload/);
  const start=src.indexOf('async function applyUpdate()');
  const end=src.indexOf('function mountProfile()',start);
  assert.ok(start>=0&&end>start);
  const applyBlock=src.slice(start,end);
  assert.ok(applyBlock.indexOf('await flushBeforeReload()')<applyBlock.indexOf('updateServiceWorker()'));
  assert.match(src,/window\.location\.replace/);
});

test('F4: altas de instalaciones registra persistencia inmediata antes de recarga',()=>{
  const src=fs.readFileSync(path.join(ROOT,'modules/instalaciones-administracion/instalaciones-administracion-altas-captura_cor.js'),'utf8');
  assert.match(src,/persistDraftImmediately/);
  assert.match(src,/reason:'before-reload'/);
  assert.match(src,/registerBeforeReload/);
});

test('F4: delta entre pestañas usa Web Locks y reaprovecha cache adelantada',()=>{
  const src=fs.readFileSync(path.join(ROOT,'modules/instalaciones-proyectos/instalaciones-proyectos.js'),'utf8');
  assert.match(src,/navigator\.locks\?\.request/);
  assert.match(src,/bltnow-instalaciones-proyectos-delta/);
  assert.match(src,/pyCursorCompare/);
  assert.match(src,/shared:true/);
  assert.match(src,/pyIncrementalCoordinated\(warm\)/);
});

'use strict';
// BLT NOW | 2026-10-20 | FIX_BOTON_ALTAS_ADMIN_V001 | solo lectura.
// Ejecutar desde el checkout: node --test tests/instalaciones-administracion-fix-boton-altas.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const text = name => fs.readFileSync(path.join(ROOT, name), 'utf8');
const count = (s, v) => s.split(v).length - 1;

const RES = 'modules/instalaciones-administracion/';
const F = Object.freeze({
  css: `./${RES}instalaciones-administracion-altas-captura_cor.css?v=20261020-fix-altas-admin-v001`,
  formula: `./${RES}instalaciones-administracion-altas-formulas_cor.js?v=20261020-fix-altas-admin-v001`,
  capture: `./${RES}instalaciones-administracion-altas-captura_cor.js?v=20261020-fix-altas-admin-v001`,
  loader: './core/module-loader.js?v=20261020-fix-altas-admin-v001'
});

test('se registran exactamente una vez CSS y los dos JS de altas', () => {
  const loader = text('core/module-loader.js');
  for (const resource of [F.css,F.formula,F.capture])
    assert.equal(count(loader,resource),1,resource);
});

test('orden correcto: motor formulas antes de captura; modulo original no eliminado', () => {
  const loader = text('core/module-loader.js');
  const entry = loader.split('\n').find(x => x.includes("'instalaciones-administracion':"));
  assert.ok(entry,'No existe la entrada de Administracion.');
  const mainJs = "./modules/instalaciones-administracion/instalaciones-administracion_cor.js?v=20261013-integral-fix-v001";
  const ghostJs = "./modules/instalaciones-administracion/instalaciones-administracion-ghost_cor.js?v=20261013-integral-fix-v001";
  assert.ok(entry.includes(mainJs));
  assert.ok(entry.includes(ghostJs));
  assert.ok(entry.indexOf(ghostJs) < entry.indexOf(mainJs));
  assert.ok(entry.indexOf(mainJs) < entry.indexOf(F.formula));
  assert.ok(entry.indexOf(F.formula) < entry.indexOf(F.capture));
});

test('Service Worker renovado con cache independiente de la version anterior', () => {
  const sw=text('service-worker.js');
  assert.match(sw,/const SERVICE_WORKER_VERSION = '20261020-fix-altas-admin-v001'/);
  assert.match(sw,/blt-now-shell-/);
  assert.match(sw,/cache\.add\(asset\)/);
  assert.match(sw,/caches\.delete\(key\)/);
  assert.match(sw,/request\.method !== 'GET'/);
});

test('Index carga nueva version del module-loader, sin alteracion de navegacion', () => {
  const index=text('index.html');
  assert.equal(count(index,F.loader),1);
  assert.match(index,/core\/app-update\.js/);
  assert.match(index,/core\/auth\.js/);
});

test('recursos previamente incluidos por Fases 2-4 existen y ofrecen el boton', () => {
  for(const p of ['instalaciones-administracion-altas-captura_cor.js',
    'instalaciones-administracion-altas-captura_cor.css',
    'instalaciones-administracion-altas-formulas_cor.js']) {
    assert.ok(fs.statSync(path.join(ROOT,RES,p)).isFile(),p);
  }
  const cap=text(RES+'instalaciones-administracion-altas-captura_cor.js');
  const formulas=text(RES+'instalaciones-administracion-altas-formulas_cor.js');
  assert.match(cap,/\+ Agregar nuevo/);
  assert.match(cap,/refreshAuthorization/);
  assert.match(cap,/ManttoInstalacionesAltasCaptura_cor/);
  assert.match(formulas,/ManttoInstalacionesAltasFormulas_cor/);
});

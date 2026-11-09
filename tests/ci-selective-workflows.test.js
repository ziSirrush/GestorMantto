'use strict';
// Regresion de rutas CI/CD: no ejecutar ni publicar el otro componente.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { references, testTargets } = require('../tools/ci-run-tests');

const ROOT = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');

test('solo frontend no selecciona pruebas exclusivas de backend/tests', () => {
  const front = testTargets('frontend');
  const back = testTargets('backend');
  assert.ok(front.includes('tests/pwa-app-update.test.js'));
  assert.ok(back.includes('backend/tests/security-p1-roles-aster.test.js'));
  assert.ok(!front.some(name => name.startsWith('backend/tests/')));
  assert.ok(!back.includes('tests/pwa-app-update.test.js'));
});

test('contratos compartidos y sin referencias conocidas se prueban en ambos dominios', () => {
  assert.deepEqual(references("require('../core/router.js')"), { frontend:true, backend:false });
  assert.deepEqual(references("require('../backend/src/app.js')"), { frontend:false, backend:true });
  assert.deepEqual(references("const f=require('../core/router.js');const b=require('../backend/src/app.js');"),
    {frontend:true,backend:true});
  const front = testTargets('frontend');
  const back = testTargets('backend');
  assert.ok(front.includes('tests/lumbre-fix-sidebar-permissions.test.js'));
  assert.ok(back.includes('tests/lumbre-fix-sidebar-permissions.test.js'));
});

test('Azure solo escucha backend y Pages solo escucha artefactos web', () => {
  const azure = read('.github/workflows/main_mantto-gestor-api.yml');
  const pages = read('.github/workflows/pages.yml');
  assert.match(azure, /paths:[\s\S]*?backend\/\*\*/);
  assert.doesNotMatch(azure, /- 'core\/\*\*'/);
  assert.match(pages, /- 'core\/\*\*'/);
  assert.doesNotMatch(pages, /- 'backend\/\*\*'/);
  assert.match(azure, /node \.\.\/tools\/ci-run-tests\.js backend/);
  assert.match(pages, /node tools\/ci-run-tests\.js frontend/);
});

test('el deploy depende de pruebas, evita solapamientos y verifica la publicacion', () => {
  const azure = read('.github/workflows/main_mantto-gestor-api.yml');
  const pages = read('.github/workflows/pages.yml');
  assert.match(azure, /needs: build/);
  assert.match(azure, /group: blt-now-azure-production[\s\S]*?cancel-in-progress: false/);
  assert.match(azure, /\/api\/health/);
  assert.match(pages, /needs: frontend_tests/);
  assert.match(pages, /build-info\.generated\.js/);
  assert.match(pages, /cancel-in-progress: true/);
});

test('el respaldo exacto de ambos YAML esta dentro del repositorio', () => {
  for (const filename of ['main_mantto-gestor-api.yml', 'pages.yml']) {
    assert.ok(read('docs/ci-backups/2026-11-09/' + filename + '.bak').includes('workflow_dispatch:'));
  }
});

// [Lumbre | 2026-10-29 | LUMBRE-MG | L04_CI_SUMINISTRO_SEGURO_PRUEBAS_V001]
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

function actionReferences(source) {
  return [...source.matchAll(/^\s*uses:\s*([^\s#]+)/gm)].map(match => match[1]);
}

test('L-04: todas las acciones externas están fijadas a commits inmutables', () => {
  for (const workflow of [
    read('.github/workflows/main_mantto-gestor-api.yml'),
    read('.github/workflows/pages.yml')
  ]) {
    const references = actionReferences(workflow);
    assert.ok(references.length > 0);
    for (const reference of references) {
      assert.match(reference, /^[\w.-]+\/[\w.-]+@[a-f0-9]{40}$/);
    }
    assert.match(workflow, /persist-credentials:\s*false/);
    assert.match(workflow, /timeout-minutes:\s*\d+/);
  }
});

test('L-04: backend usa lockfile, auditoría, pruebas y artefacto de producción', () => {
  const workflow = read('.github/workflows/main_mantto-gestor-api.yml');
  assert.match(workflow, /npm ci --no-audit --no-fund/);
  assert.match(workflow, /npm audit --audit-level=moderate/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npm prune --omit=dev/);
  assert.match(workflow, /if-no-files-found:\s*error/);
  assert.match(workflow, /retention-days:\s*1/);
  assert.match(workflow, /path:\s*\.\/release/);
  assert.match(workflow, /package:\s*\.\/release/);
  assert.doesNotMatch(workflow, /npm install/);
});

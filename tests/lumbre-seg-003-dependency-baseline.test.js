// [Lumbre | 2026-10-29 | LUMBRE-MG | L03_DEPENDENCIAS_SEGURAS_PRUEBAS_V001]
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'backend', 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'backend', 'package-lock.json'), 'utf8'));

function versionAt(packagePath) {
  return lock.packages[packagePath] && lock.packages[packagePath].version;
}

test('L-03: dependencias directas permanecen en las líneas corregidas', () => {
  assert.equal(manifest.dependencies['@azure/identity'], '4.13.0');
  assert.equal(manifest.dependencies.express, '^5.3.0');
  assert.equal(manifest.dependencies.multer, '^2.5.0');
  assert.equal(manifest.dependencies.mysql2, '^3.24.6');
  assert.equal(manifest.overrides['@azure/msal-node'].uuid, '11.1.1');
});

test('L-03: lockfile contiene las versiones transitivas corregidas', () => {
  assert.equal(versionAt('node_modules/proxy-addr'), '2.0.8');
  assert.equal(versionAt('node_modules/body-parser'), '2.4.0');
  assert.equal(versionAt('node_modules/qs'), '6.17.1');
  assert.equal(versionAt('node_modules/uuid'), '11.1.1');
  assert.equal(versionAt('node_modules/glob/node_modules/brace-expansion'), '2.1.7');
  assert.equal(versionAt('node_modules/brace-expansion'), '5.0.12');
});

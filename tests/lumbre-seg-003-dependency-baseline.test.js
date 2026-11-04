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
  // La cadena gaxios 7.1.3 -> rimraf -> glob fue retirada; no exigir
  // instalar una dependencia vulnerable para conservar una ruta historica.
  assert.equal(versionAt('node_modules/glob'), undefined);
  assert.equal(versionAt('node_modules/rimraf'), undefined);
  assert.equal(versionAt('node_modules/minimatch'), '11.0.4');
  assert.equal(versionAt('node_modules/brace-expansion'), '5.0.12');
});

const backendRequire = require('node:module').createRequire(path.join(root, 'backend', 'package.json'));

test('Google Drive conserva solicitudes HTTP con la dependencia gaxios corregida', async () => {
  const http = require('node:http');
  const { google } = backendRequire('googleapis');
  const server = http.createServer((_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ files: [{ id: 'compat-test', name: 'test.txt' }] }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const drive = google.drive({ version: 'v3' });
    const response = await drive.files.list({ pageSize: 1 }, {
      rootUrl: `http://127.0.0.1:${server.address().port}/`, retry: false,
      timeout: 5000
    });
    assert.deepEqual(response.data.files, [{ id: 'compat-test', name: 'test.txt' }]);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('Nodemon conserva globstar, filtro de extension y exclusiones con minimatch corregido', () => {
  const match = backendRequire('nodemon/lib/monitor/match');
  const folder = path.join(root, 'compat-patterns');
  const files = ['src/index.js', 'src/nested/test.js', 'src/readme.md', 'node_modules/test.js']
    .map(name => path.join(folder, name));
  const rules = [path.join(folder, '**', '*.js'), '!' + path.join(folder, 'node_modules', '**')];
  assert.deepEqual(match(files, rules, 'js').result.sort(), files.slice(0, 2).sort());
});

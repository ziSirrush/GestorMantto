// [Lumbre | 2026-10-29 | LUMBRE-MG | L02_RETIRO_UPLOADS_PUBLICO_PRUEBAS_V001]
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('L-02: el backend no registra una ruta pública para archivos legacy', () => {
  const appSource = read('backend/src/app.js');
  assert.doesNotMatch(appSource, /app\.use\(['"]\/uploads/);
  assert.doesNotMatch(appSource, /express\.static/);
  assert.doesNotMatch(appSource, /CFFAA_LEGACY_UPLOADS_ENABLED/);
});

test('L-02: diagnóstico y conciliación declaran retirada la exposición pública', () => {
  const diagnostics = read('backend/src/services/storage/storage-diagnostics.service.js');
  const reconciliation = read('backend/src/modules/storage-reconciliation/storage-reconciliation.service.js');
  assert.match(diagnostics, /legacy_uploads_enabled:\s*false/);
  assert.match(diagnostics, /legacy_uploads_public_route_removed:\s*true/);
  assert.match(reconciliation, /static_route_enabled:\s*false/);
  assert.match(reconciliation, /public_exposure_removed:\s*true/);
  assert.match(reconciliation, /migration_complete:\s*migrationComplete/);
});

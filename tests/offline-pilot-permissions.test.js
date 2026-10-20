'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const permission = 'GENERAL_MODO_OFFLINE_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';

test('el catalogo SQL crea un permiso individual sin asignarlo automaticamente', () => {
  const sql = read('sql/20261020_MODO_OFFLINE_PILOTO_PERMISO_V001.sql');
  assert.match(sql, /'MODO_OFFLINE', 'Modo Offline', 'GENERAL'/);
  assert.match(sql, /'GENERAL_MODO_OFFLINE'.*'offline-configuracion'/);
  assert.match(sql, new RegExp(permission.replace('.', '\\.')));
  assert.doesNotMatch(sql, /INSERT\s+INTO\s+rol_permisos/i);
  assert.doesNotMatch(sql, /INSERT\s+INTO\s+usuario_permisos/i);
});

test('el endpoint usa el mismo permiso y el Guard General del backend', () => {
  const routes = read('backend/src/modules/offline-pilot/offline-pilot.routes.js');
  const routeIndex = read('backend/src/routes/index.js');
  assert.match(routes, /humanInformationGuard_gnral/);
  assert.match(routes, /domain:\s*'GENERAL'/);
  assert.match(routes, /groupingCode:\s*'MODO_OFFLINE'/);
  assert.match(routes, /router\.get\('\/capabilities',\s*\.\.\.offlinePilotGuard/);
  assert.match(routeIndex, /router\.use\('\/offline',\s*offlinePilotRoutes\)/);
});

test('las capacidades del piloto no habilitan datos operativos ni horario exacto cerrado', () => {
  const service = require('../backend/src/modules/offline-pilot/offline-pilot.service');
  const result = service.buildCapabilities({
    user: {id_SB: 99},
    contextUser: {id_SB: 17},
    viewerContext: {active: true}
  });
  assert.equal(service.OFFLINE_PILOT_PERMISSION, permission);
  assert.equal(result.effective_user_id, 17);
  assert.equal(result.viewer_read_only, true);
  assert.equal(result.operational_data_enabled, false);
  assert.equal(result.wifi_confirmation_required, true);
  assert.equal(result.scheduling.exact_background_execution, false);
  assert.equal(result.scheduling.next_opportunity_fallback, true);
  assert.equal(result.storage_test.writes_operational_data, false);
});

test('el frontend falla cerrado y expone el modulo solo con el permiso exacto', () => {
  const index = read('index.html');
  const loader = read('core/module-loader.js');
  const router = read('core/router.js');
  const pilot = read('modules/offline-pilot/offline-pilot.js');
  assert.match(index, new RegExp(`data-permission-code="${permission.replace('.', '\\.')}"`));
  assert.match(index, /data-route="offline-configuracion"/);
  assert.match(index, /id="view-offline-configuracion"/);
  assert.match(loader, /'offline-configuracion'.*offline-pilot\.js/);
  assert.match(router, /ManttoOfflinePilot\?\.init/);
  assert.match(pilot, /current\?\.exists===true&&current\?\.efectivo===true/);
  assert.match(pilot, /apiGet\('\/api\/offline\/capabilities'\)/);
});

test('runtime: sin permiso efectivo no se consulta el endpoint protegido', async () => {
  const view = {innerHTML: ''};
  let apiCalls = 0;
  const sandbox = {
    window: {
      ManttoPermissions: {
        state: () => ({exists: true, efectivo: false})
      },
      ManttoAuth: {
        apiGet: async () => { apiCalls += 1; return {ok: true}; }
      }
    },
    document: {
      getElementById: id => id === 'view-offline-configuracion' ? view : null
    },
    console
  };
  vm.runInNewContext(read('modules/offline-pilot/offline-pilot.js'), sandbox);
  const allowed = await sandbox.window.ManttoOfflinePilot.init();
  assert.equal(allowed, false);
  assert.equal(apiCalls, 0);
  assert.match(view.innerHTML, /Modo Offline no habilitado/);
});

test('la prueba exige confirmacion Wi-Fi y solo escribe un registro tecnico temporal', () => {
  const pilot = read('modules/offline-pilot/offline-pilot.js');
  assert.match(pilot, /off-wifi-confirm/);
  assert.match(pilot, /Confirma primero que estás conectado a Wi‑Fi/);
  assert.match(pilot, /store\.put\(\{key:'health-check'/);
  assert.match(pilot, /store\.delete\('health-check'\)/);
  assert.match(pilot, /No descarga tickets, clientes, inventario, fotografías/);
});

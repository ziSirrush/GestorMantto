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

test('las capacidades habilitan solo el primer dataset autorizado y no prometen horario cerrado', () => {
  const service = require('../backend/src/modules/offline-pilot/offline-pilot.service');
  const result = service.buildCapabilities({
    user: {id_SB: 99},
    contextUser: {id_SB: 17},
    viewerContext: {active: true}
  });
  assert.equal(service.OFFLINE_PILOT_PERMISSION, permission);
  assert.equal(result.effective_user_id, 17);
  assert.equal(result.viewer_read_only, true);
  assert.equal(result.phase, 2);
  assert.equal(result.operational_data_enabled, true);
  assert.equal(result.datasets.length, 1);
  assert.equal(result.datasets[0].key, 'operacion-resumen-dia');
  assert.equal(result.datasets[0].endpoint, '/api/operacion/resumen-dia/inicial');
  assert.equal(result.datasets[0].mode, 'READ_ONLY');
  assert.equal(result.wifi_confirmation_required, true);
  assert.equal(result.scheduling.exact_background_execution, false);
  assert.equal(result.scheduling.next_opportunity_fallback, true);
  assert.equal(result.synchronization.enabled, false);
  assert.equal(result.synchronization.outbox_foundation, true);
  assert.equal(result.storage_test.writes_operational_data, false);
});

test('el frontend falla cerrado y expone el modulo solo con el permiso exacto', () => {
  const index = read('index.html');
  const loader = read('core/module-loader.js');
  const router = read('core/router.js');
  const pilot = read('modules/offline-pilot/offline-pilot.js');
  const storage = read('core/offline-storage.js');
  assert.match(index, new RegExp(`data-permission-code="${permission.replace('.', '\\.')}"`));
  assert.match(index, /data-route="offline-configuracion"/);
  assert.match(index, /id="view-offline-configuracion"/);
  assert.match(loader, /'offline-configuracion'.*offline-pilot\.js/);
  assert.match(router, /ManttoOfflinePilot\?\.init/);
  assert.match(pilot, /current\?\.exists===true/);
  assert.match(pilot, /current\?\.efectivo===true\?'granted':'denied'/);
  assert.match(pilot, /apiGet\('\/api\/offline\/capabilities'\)/);
  assert.match(index, /core\/offline-storage\.js/);
  assert.match(index, /core\/offline-scheduler\.js/);
  assert.match(storage, /actor_user_id/);
  assert.match(storage, /effective_user_id/);
  assert.match(storage, /partition_key/);
  assert.match(read('core/user-viewer.js'), /hasCachedOfflineAccess/);
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
        apiGet: async () => { apiCalls += 1; return {ok: true}; },
        getActorUser: () => ({id_SB: 10}),
        getUser: () => ({id_SB: 10})
      },
      ManttoOfflineStorage: {}
    },
    navigator: {onLine: true},
    localStorage: {getItem: () => null, setItem() {}},
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

test('la descarga exige confirmacion Wi-Fi y reutiliza el endpoint protegido de Resumen del Dia', () => {
  const pilot = read('modules/offline-pilot/offline-pilot.js');
  assert.match(pilot, /off-wifi-confirm/);
  assert.match(pilot, /Confirma primero que estás conectado a Wi‑Fi/);
  assert.match(pilot, /ManttoAuth\.api\(dataset\.endpoint,\{method:'GET',cache:'no-store'\}\)/);
  assert.match(pilot, /ManttoOfflineStorage\.saveSnapshot/);
  assert.match(pilot, /ManttoOfflineStorage\.getSnapshot/);
  assert.match(pilot, /confirmación de Wi‑Fi se restableció/);
});

test('la cola local existe pero no expone escritura ni sincronizacion hacia Aiven', () => {
  const storage = read('core/offline-storage.js');
  assert.match(storage, /OUTBOX_STORE='outbox'/);
  assert.match(storage, /enabled:false/);
  assert.doesNotMatch(storage, /enqueue|syncOutbox|fetch\(/);
});

test('la autorizacion offline en cache queda ligada a actor, efectivo y vigencia', () => {
  const values = new Map();
  const localStorage = {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    key: index => [...values.keys()][index] || null,
    get length() { return values.size; }
  };
  const sandbox = {
    window: {indexedDB: null},
    document: {addEventListener() {}},
    localStorage,
    Date,
    console
  };
  vm.runInNewContext(read('core/offline-storage.js'), sandbox);
  values.set('mantto:offline-access:10:20', JSON.stringify({
    saved_at: new Date().toISOString(),
    data: {permission_code: permission, effective_user_id: 20}
  }));
  assert.equal(sandbox.window.ManttoOfflineStorage.hasCachedAccess(10, 20), true);
  assert.equal(sandbox.window.ManttoOfflineStorage.hasCachedAccess(10, 21), false);
  assert.equal(sandbox.window.ManttoOfflineStorage.hasCachedAccess(11, 20), false);
});

test('el shell offline excluye cualquier respuesta API de Cache Storage', () => {
  const worker = read('service-worker.js');
  assert.match(worker, /blt-now-shell-/);
  assert.match(worker, /url\.pathname\.includes\('\/api\/'\)/);
  assert.match(worker, /event\.respondWith\(fetch\(request\)\)/);
  assert.match(worker, /caches\.match\('\.\/index\.html'/);
  assert.match(worker, /assets\\\/img\\\/icons/);
  assert.doesNotMatch(worker, /\|jpg\|jpeg/);

  const self = {
    location: {origin:'https://app.example.test', href:'https://app.example.test/'},
    clients: {},
    registration: {},
    addEventListener() {}
  };
  const sandbox = {
    self,
    clients: self.clients,
    URL,
    URLSearchParams,
    Promise,
    Date,
    setTimeout() { return 0; },
    clearTimeout() {},
    MessageChannel: function MessageChannel() {}
  };
  vm.runInNewContext(worker, sandbox);
  assert.equal(sandbox.isStaticShellRequest({method:'GET',url:'https://app.example.test/core/auth.js'}), true);
  assert.equal(sandbox.isStaticShellRequest({method:'GET',url:'https://app.example.test/modules/offline-pilot/offline-pilot.css'}), true);
  assert.equal(sandbox.isStaticShellRequest({method:'GET',url:'https://app.example.test/uploads/ticket-photo.jpg'}), false);
  assert.equal(sandbox.isStaticShellRequest({method:'GET',url:'https://app.example.test/api/tickets'}), false);
});

test('el programador marca vencido solo despues del horario y nunca descarga por si mismo', () => {
  const listeners = {};
  const sandbox = {
    window: {
      addEventListener(type, handler) { listeners[type] = handler; },
      setTimeout() { return 0; },
      clearTimeout() {},
      ManttoAuth: {},
      ManttoPermissions: {}
    },
    document: {
      hidden: false,
      addEventListener(type, handler) { listeners[type] = handler; },
      getElementById() { return null; },
      createElement() { return {setAttribute(){},style:{},remove(){}}; },
      body: {appendChild() {}},
      dispatchEvent() {}
    },
    localStorage: {getItem: () => null, setItem() {}, removeItem() {}},
    CustomEvent: function CustomEvent() {},
    Date,
    console
  };
  vm.runInNewContext(read('core/offline-scheduler.js'), sandbox);
  const scheduler = sandbox.window.ManttoOfflineScheduler;
  const before = scheduler.dueState({
    daily_enabled: true,
    preferred_time: '18:00',
    schedule_started_at: '2026-10-20T09:00:00'
  }, new Date('2026-10-20T17:59:00'));
  const after = scheduler.dueState({
    daily_enabled: true,
    preferred_time: '18:00',
    schedule_started_at: '2026-10-20T09:00:00'
  }, new Date('2026-10-20T18:01:00'));
  assert.equal(before.due, false);
  assert.equal(after.due, true);
  assert.equal(typeof scheduler.download, 'undefined');
});

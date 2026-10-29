'use strict';
// [Lumbre | 2026-10-29 | LUMBRE-MG | PRUEBA_SIDEBAR_PERMISOS_FAIL_CLOSED_V001]

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'core', 'user-viewer.js'), 'utf8');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

function catalogRow({ id, moduleCode, route, permissionCode }) {
  return {
    agrupacion_codigo: 'INSTALACIONES',
    agrupacion_nombre: 'Instalaciones',
    agrupacion_empresa: 'CORELLIAN',
    agrupacion_activo: 1,
    modulo_codigo: moduleCode,
    modulo_nombre: moduleCode,
    modulo_ruta_frontend: route,
    modulo_activo: 1,
    modulo_interno_visual: 0,
    id_subelemento_accion: id,
    codigo_permiso: permissionCode
  };
}

function harness() {
  const listeners = new Map();
  const requests = [];
  const admin = {
    hidden: false,
    disabled: false,
    dataset: {
      permission: 'instalaciones_administracion',
      permissionCode: 'INSTALACIONES_ADMINISTRACION_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
      route: 'instalaciones-administracion'
    },
    matches(selector) { return selector === '.side-item[data-permission]'; },
    closest(selector) { return selector === '.side-group' ? group : null; },
    setAttribute() {}
  };
  const dashboard = {
    hidden: false,
    dataset: { permission: 'instalaciones_dashboard', route: 'instalaciones-dashboard' },
    matches(selector) { return selector === '.side-item[data-permission]'; },
    closest(selector) { return selector === '.side-group' ? group : null; },
    setAttribute() {}
  };
  const internalAction = {
    hidden: false,
    disabled: false,
    dataset: { permissionCode: 'LEGACY_CONTROL.NO_CATALOGADO' },
    matches() { return false; },
    setAttribute() {}
  };
  const group = {
    hidden: false,
    dataset: { group: 'instalaciones', company: 'CORELLIAN' },
    querySelectorAll(selector) { return selector === '.side-item' ? [admin, dashboard] : []; }
  };
  const document = {
    body: { classList: { toggle() {} } },
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll(selector) {
      if (selector === '[data-permission]') return [admin, dashboard];
      if (selector === '.side-group') return [group];
      if (selector === '[data-permission-code]') return [admin, internalAction];
      return [];
    },
    addEventListener(name, listener) {
      listeners.set(name, [...(listeners.get(name) || []), listener]);
    },
    dispatchEvent() {}
  };
  const window = {
    ManttoAuth: {
      getActorUser: () => ({ id_SB: 7 }),
      getUser: () => ({ id_SB: 7 }),
      isViewingAs: () => false,
      apiGet() {
        const request = deferred();
        requests.push(request);
        return request.promise;
      }
    },
    ManttoRouter: { getCurrent: () => ({ route: 'home' }), reset() {} },
    setTimeout() { return 1; },
    addEventListener() {}
  };
  const sandbox = {
    window,
    document,
    console,
    CSS: { escape: value => String(value) },
    Element: class Element {},
    MutationObserver: class MutationObserver { observe() {} },
    CustomEvent: class CustomEvent {}
  };
  vm.runInNewContext(source, sandbox, { filename: 'core/user-viewer.js' });
  const emit = name => Promise.all((listeners.get(name) || []).map(listener => listener()));
  return { window, admin, dashboard, internalAction, group, requests, emit };
}

const ADMIN_ROW = catalogRow({
  id: 101,
  moduleCode: 'INSTALACIONES_ADMINISTRACION',
  route: 'instalaciones-administracion',
  permissionCode: 'INSTALACIONES_ADMINISTRACION_ACCESO_VISUAL_MODULO.ACCESO_VISUAL'
});
const DASHBOARD_ROW = catalogRow({
  id: 102,
  moduleCode: 'INSTALACIONES_DASHBOARD',
  route: 'instalaciones-dashboard',
  permissionCode: 'INSTALACIONES_DASHBOARD_ACCESO_VISUAL_MODULO.ACCESO_VISUAL'
});

test('el sidebar queda oculto mientras los permisos de sesión están pendientes', async () => {
  const h = harness();
  const init = h.emit('mantto:auth-ready');

  assert.equal(h.admin.hidden, true);
  assert.equal(h.dashboard.hidden, true);
  assert.equal(h.group.hidden, true);

  h.requests[0].resolve({ data: { catalogo: [ADMIN_ROW, DASHBOARD_ROW], permisos: [] } });
  await init;
});

test('un permiso ausente o no configurado no reaparece por applyActionPermissions', async () => {
  const h = harness();
  const init = h.emit('mantto:auth-ready');
  h.requests[0].resolve({ data: {
    catalogo: [ADMIN_ROW, DASHBOARD_ROW],
    permisos: [{ id_subelemento_accion: 102, efectivo: false, configurado: true }]
  } });
  await init;

  assert.equal(h.admin.hidden, true);
  assert.equal(h.dashboard.hidden, true);
  assert.equal(h.group.hidden, true);
  assert.equal(h.internalAction.hidden, false);
});

test('solo el permiso efectivo vuelve visible Administración de Instalaciones', async () => {
  const h = harness();
  const init = h.emit('mantto:auth-ready');
  h.requests[0].resolve({ data: {
    catalogo: [ADMIN_ROW, DASHBOARD_ROW],
    permisos: [{ id_subelemento_accion: 101, efectivo: true, configurado: true }]
  } });
  await init;

  assert.equal(h.admin.hidden, false);
  assert.equal(h.dashboard.hidden, true);
  assert.equal(h.group.hidden, false);
});

test('cambiar de usuario oculta el menú anterior antes de pedir los permisos nuevos', async () => {
  const h = harness();
  const init = h.emit('mantto:auth-ready');
  h.requests[0].resolve({ data: {
    catalogo: [ADMIN_ROW],
    permisos: [{ id_subelemento_accion: 101, efectivo: true, configurado: true }]
  } });
  await init;
  assert.equal(h.admin.hidden, false);

  const changed = h.emit('mantto:view-user-changed');
  assert.equal(h.admin.hidden, true);
  assert.equal(h.group.hidden, true);
  h.requests[1].resolve({ data: { catalogo: [ADMIN_ROW], permisos: [] } });
  await changed;
  assert.equal(h.admin.hidden, true);
});

test('un error al cargar permisos conserva la navegación protegida oculta', async () => {
  const h = harness();
  const init = h.emit('mantto:auth-ready');
  h.requests[0].reject(new Error('API no disponible'));
  await init;

  assert.equal(h.admin.hidden, true);
  assert.equal(h.dashboard.hidden, true);
  assert.equal(h.group.hidden, true);
});

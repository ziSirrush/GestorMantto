'use strict';
// BLT NOW | 2026-11-09 | Panel de Control para Director General (principal o secundario).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const auth = read('core/auth.js');
const viewer = read('core/user-viewer.js');

function runHeader(user, viewingAs = false) {
  const panel = { dataset: { route: 'panel-control' }, style: { display: 'none' } };
  const experimental = { dataset: { group: 'experimental-ns' }, style: { display: 'none' } };
  const services = { dataset: { route: 'services' }, style: { display: 'none' } };
  const start = auth.indexOf('  function applyUserToHeader(){');
  const end = auth.indexOf('  function hideBootstrap()', start);
  assert.ok(start > 0 && end > start);
  vm.runInNewContext(auth.slice(start, end) + '\napplyUserToHeader();', {
    getUser: () => user,
    isViewingAs: () => viewingAs,
    $: () => null,
    document: {
      querySelectorAll: selector => selector === '.programmer'
        ? [panel, experimental, services] : []
    }
  });
  return { panel: panel.style.display, experimental: experimental.style.display, services: services.style.display };
}

async function runSidebar(user, viewingAs = false, failingSession = false) {
  const panel = {
    dataset: { permission: 'panel_control', route: 'panel-control' },
    hidden: false,
    closest() { return null; },
    matches(selector) { return selector === '.side-item[data-permission]'; },
    setAttribute() {}
  };
  const listeners = new Map();
  const document = {
    body: { classList: { toggle() {} } },
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll(selector) {
      if (selector === '.side-item[data-permission]' || selector === '[data-permission]') return [panel];
      return [];
    },
    addEventListener(name, callback) { listeners.set(name, callback); }
  };
  const window = {
    ManttoAuth: {
      getUser: () => user,
      getActorUser: () => user,
      isViewingAs: () => viewingAs,
      async apiGet() {
        if (failingSession) throw new Error('Sesion no disponible');
        return { data: {
          usuario_id: user.id_SB,
          catalogo: [], permisos: [], puede_usar_visor: false
        } };
      }
    },
    ManttoRouter: { getCurrent: () => ({ route: 'home' }), reset() {} },
    setTimeout() {},
    addEventListener() {}
  };
  vm.runInNewContext(viewer, {
    window, document, console: { error() {}, warn() {} },
    CSS: { escape: v => String(v) },
    Element: class Element {},
    MutationObserver: class MutationObserver { observe() {} },
    CustomEvent: class CustomEvent {}
  }, { filename: 'core/user-viewer.js' });

  const initialization = window.ManttoUserViewer.init();
  const hiddenBeforeVerification = panel.hidden;
  await initialization;
  return { hiddenBeforeVerification, hiddenAfterVerification: panel.hidden };
}

const roles = [
  { description: 'Director General principal', user: { id_SB: 1, rol: 'Director General', roles: ['Director General'] }, allowed: true },
  { description: 'Director General secundario', user: { id_SB: 2, rol: 'Director Mantenimiento', roles: ['Director Mantenimiento', 'Director General'] }, allowed: true },
  { description: 'Programador maestro secundario', user: { id_SB: 3, rol: 'Director Finanzas', roles: ['Director Finanzas', 'Programador'] }, allowed: true },
  { description: 'Programador United sin rol maestro', user: { id_SB: 4, rol: 'Programador United', roles: ['Programador United'] }, allowed: false },
  { description: 'Programador Corellian sin rol maestro', user: { id_SB: 5, rol: 'Programador Corellian', roles: ['Programador Corellian'] }, allowed: false },
  { description: 'Rol ajeno', user: { id_SB: 6, rol: 'Director Ventas', roles: ['Director Ventas'] }, allowed: false }
];

for (const scenario of roles) {
  test('Panel de Control por rol: ' + scenario.description, async () => {
    const header = runHeader(scenario.user);
    assert.equal(header.panel === '', scenario.allowed);
    const sidebar = await runSidebar(scenario.user);
    assert.equal(sidebar.hiddenBeforeVerification, true);
    assert.equal(sidebar.hiddenAfterVerification, !scenario.allowed);
  });
}

test('Director General no desbloquea las otras superficies reservadas a Programador', () => {
  const director = runHeader({ id_SB: 9, rol: 'Director General', roles: ['Director General'] });
  assert.equal(director.panel, '');
  assert.equal(director.experimental, 'none');
  assert.equal(director.services, 'none');
});

test('Programador United mantiene visibilidad de superficies legacy pero no de Panel de Control', () => {
  const united = runHeader({ id_SB: 8, rol: 'Programador United', roles: ['Programador United'] });
  assert.equal(united.panel, 'none');
  assert.equal(united.experimental, '');
});

test('Modo visor no muestra el acceso administrativo', async () => {
  const director = { id_SB: 10, rol: 'Director General', roles: ['Director General'] };
  assert.equal(runHeader(director, true).panel, 'none');
  const sidebar = await runSidebar(director, true);
  assert.equal(sidebar.hiddenAfterVerification, true);
});

test('Fallo de permisos de sesion conserva Panel de Control oculto', async () => {
  const director = { id_SB: 11, rol: 'Director General', roles: ['Director General'] };
  const sidebar = await runSidebar(director, false, true);
  assert.equal(sidebar.hiddenBeforeVerification, true);
  assert.equal(sidebar.hiddenAfterVerification, true);
});

test('Backend ya autoriza a Director General; no necesita redeploy de Azure', () => {
  const controller = read('backend/src/controllers/panel-control.controller.js');
  assert.match(controller, /function actorCanManage\(req\)/);
  assert.match(controller, /roles\.has\('Director General'\)/);
  assert.match(read('index.html'), /class="side-item side-standalone programmer" data-permission="panel_control"/);
});

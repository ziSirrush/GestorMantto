const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const routerSource = fs.readFileSync(path.join(__dirname, '..', 'core', 'router.js'), 'utf8');

function createHarness(shared = {}) {
  const storage = shared.storage || new Map();
  const browser = shared.browser || {entries: [{state: null, hash: ''}], index: 0};
  const listeners = new Map();
  const view = () => ({
    classList: {add() {}, remove() {}, toggle() {}},
    style: {}, scrollTop: 0, innerHTML: '',
    setAttribute() {}, removeAttribute() {}, querySelectorAll() { return []; }
  });
  const elements = {
    'view-home': view(), 'view-placeholder': view(),
    'app-back-btn': {hidden: true, disabled: true, title: ''},
    'app-back-label': {textContent: ''}
  };
  const on = (name, listener) => listeners.set(name, [...(listeners.get(name) || []), listener]);
  const emit = (name, event = {}) => (listeners.get(name) || []).forEach(listener => listener(event));
  const document = {
    body: {classList: {toggle() {}}},
    querySelectorAll() { return []; }, querySelector() { return null; },
    getElementById(id) { return elements[id] || null; },
    addEventListener: on, dispatchEvent() {}
  };
  const window = {
    location: {hash: browser.entries[browser.index].hash},
    scrollY: 0, pageYOffset: 0,
    setTimeout, clearTimeout, scrollTo() {}, addEventListener: on,
    sessionStorage: {
      getItem(key) { return storage.get(key) || null; },
      setItem(key, value) { storage.set(key, value); }
    }
  };
  const navigate = (index) => {
    browser.index = index;
    window.location.hash = browser.entries[index].hash;
    emit('popstate', {state: browser.entries[index].state});
  };
  window.history = {
    get state() { return browser.entries[browser.index].state; },
    pushState(state, _title, hash) {
      browser.entries.splice(browser.index + 1);
      browser.entries.push({state, hash});
      browser.index += 1;
      window.location.hash = hash;
    },
    replaceState(state, _title, hash) {
      browser.entries[browser.index] = {state, hash};
      window.location.hash = hash;
    },
    back() { if(browser.index > 0) navigate(browser.index - 1); },
    forward() { if(browser.index < browser.entries.length - 1) navigate(browser.index + 1); }
  };
  vm.runInNewContext(routerSource, {
    window, document, console,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } }
  });
  return {window, document, browser, storage, elements, emit};
}

const settle = () => new Promise(resolve => setImmediate(resolve));
const route = harness => harness.window.ManttoRouter.getCurrent().route;
const stack = harness => Array.from(harness.window.ManttoRouter.getHistory(), entry => entry.route);

test('Back del navegador y Back de la app comparten la misma pila', async () => {
  const h = createHarness();
  await h.window.ManttoRouter.go('resumen');
  await h.window.ManttoRouter.go('tickets');
  h.window.history.back();
  await settle();
  assert.equal(route(h), 'resumen');
  assert.deepEqual(stack(h), ['home']);
  await h.window.ManttoRouter.back();
  assert.equal(route(h), 'home');
  assert.equal(h.browser.index, 0);
});

test('navegar dos veces a la misma ruta no crea una entrada fantasma', async () => {
  const h = createHarness();
  await h.window.ManttoRouter.go('resumen');
  await h.window.ManttoRouter.go('resumen');
  assert.equal(h.browser.entries.length, 2);
  await h.window.ManttoRouter.back();
  assert.equal(route(h), 'home');
});

test('Inicio conserva Back cuando se llegó desde un módulo', async () => {
  const h = createHarness();
  await h.window.ManttoRouter.go('resumen');
  await h.window.ManttoRouter.go('home');
  assert.equal(h.elements['app-back-btn'].hidden, false);
  assert.equal(h.elements['app-back-label'].textContent, 'Resumen del día');
  await h.window.ManttoRouter.back();
  assert.equal(route(h), 'resumen');
});

test('la recarga restaura el historial desde history.state', async () => {
  const first = createHarness();
  await first.window.ManttoRouter.go('resumen');
  await first.window.ManttoRouter.go('tickets');
  const reloaded = createHarness({browser: first.browser, storage: first.storage});
  reloaded.emit('mantto:auth-ready');
  await settle();
  assert.equal(route(reloaded), 'tickets');
  assert.deepEqual(stack(reloaded), ['home', 'resumen']);
  await reloaded.window.ManttoRouter.back();
  assert.equal(route(reloaded), 'resumen');
});

test('Back y Forward del navegador reconstruyen la pila correcta', async () => {
  const h = createHarness();
  await h.window.ManttoRouter.go('resumen');
  await h.window.ManttoRouter.go('tickets');
  h.window.history.back();
  await settle();
  h.window.history.forward();
  await settle();
  assert.equal(route(h), 'tickets');
  assert.deepEqual(stack(h), ['home', 'resumen']);
  await h.window.ManttoRouter.back();
  assert.equal(route(h), 'resumen');
});

test('Back puede entregar datos al módulo previo sin crear un duplicado', async () => {
  const h = createHarness();
  await h.window.ManttoRouter.go('ventas-clientes');
  await h.window.ManttoRouter.go('ventas-clientes-nuevo');
  await h.window.ManttoRouter.back({payload: {createdClientId: 42}});
  assert.equal(route(h), 'ventas-clientes');
  assert.equal(h.window.ManttoRouter.getCurrent().payload.createdClientId, 42);
  assert.deepEqual(stack(h), ['home']);
  await h.window.ManttoRouter.back();
  assert.equal(route(h), 'home');
});

test('reemplazar un formulario terminado deja Back en el módulo previo', async () => {
  const h = createHarness();
  await h.window.ManttoRouter.go('ventas-asignacion-redes');
  await h.window.ManttoRouter.go('ventas-asignacion-redes-formulario', {mode: 'create'});
  await h.window.ManttoRouter.go('ventas-asignacion-redes-detalle', {id: 42}, {replace: true});
  await h.window.ManttoRouter.back();
  assert.equal(route(h), 'ventas-asignacion-redes');
});

test('Back global de una ruta directa usa su módulo padre cuando no existe historial', async () => {
  const h = createHarness();
  await h.window.ManttoRouter.go('ventas-prospeccion-nueva', null, {replace:true, skipHistory:true});
  assert.equal(h.elements['app-back-label'].textContent, 'Prospección');
  await h.window.ManttoRouter.back();
  assert.equal(route(h), 'ventas-prospeccion');
  assert.deepEqual(stack(h), []);
  assert.equal(h.browser.entries.length, 1);
});

test('Back directo de edición de cotización vuelve al detalle correcto', async () => {
  const h = createHarness();
  await h.window.ManttoRouter.go('ventas-cotizaciones-editar', {id: 77}, {replace:true, skipHistory:true});
  await h.window.ManttoRouter.back();
  assert.equal(route(h), 'ventas-cotizaciones-detalle');
  assert.equal(h.window.ManttoRouter.getCurrent().payload.id, 77);
});

test('una recarga sin history.state restaura la pila de sesión', async () => {
  const first = createHarness();
  await first.window.ManttoRouter.go('resumen');
  await first.window.ManttoRouter.go('tickets');
  first.browser.entries[first.browser.index].state = null;
  const reloaded = createHarness({browser: first.browser, storage: first.storage});
  reloaded.emit('mantto:auth-ready');
  await settle();
  assert.equal(route(reloaded), 'tickets');
  assert.deepEqual(stack(reloaded), ['home', 'resumen']);
  await reloaded.window.ManttoRouter.back();
  assert.equal(route(reloaded), 'resumen');
});

test('un hash de detalle editado manualmente prevalece sobre un history.state anterior', async () => {
  const first = createHarness();
  await first.window.ManttoRouter.go('detalle', {type: 'ticket', id: '101'});
  first.browser.entries[first.browser.index].hash = '#/detalle/ticket/202';
  const reloaded = createHarness({browser: first.browser, storage: first.storage});
  reloaded.emit('mantto:auth-ready');
  await settle();
  assert.equal(route(reloaded), 'detalle');
  assert.equal(reloaded.window.ManttoRouter.getCurrent().payload.id, '202');
  assert.deepEqual(stack(reloaded), []);
});

test('reset de permisos impide volver a una entrada de la época anterior', async () => {
  const h = createHarness();
  await h.window.ManttoRouter.go('resumen');
  await h.window.ManttoRouter.go('tickets');
  await h.window.ManttoRouter.reset();
  h.window.history.back();
  await settle();
  assert.equal(route(h), 'home');
  assert.deepEqual(stack(h), []);
});

test('cerrar sesión limpia el recorrido y bloquea entradas de la sesión anterior', async () => {
  const h = createHarness();
  await h.window.ManttoRouter.go('resumen');
  await h.window.ManttoRouter.go('tickets');
  h.emit('mantto:logout');
  await settle();
  assert.equal(route(h), 'home');
  assert.deepEqual(stack(h), []);
  h.window.history.back();
  await settle();
  assert.equal(route(h), 'home');
});

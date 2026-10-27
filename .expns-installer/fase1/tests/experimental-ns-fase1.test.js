'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('index.html');
const router = read('core/router.js');
const nsModule = read('modules/experimental-ns/experimental-ns.js');
const routes = [
  'experimental-ns-resumen-dia',
  'experimental-ns-equipos-criticos',
  'experimental-ns-proyectos-mantenimiento'
];

test('F1: agrupacion nueva, separada y restringida a Programador', () => {
  assert.match(html, /class="side-group programmer" data-group="experimental-ns" style="display:none"/);
  assert.match(html, /data-group="experimental"/);
  assert.match(router, /nsAuthorized/);
  assert.match(router, /Programador United/);
  assert.match(router, /Programador Corellian/);
  assert.match(router, /Acceso restringido/);
});

test('F1: tres rutas y vistas aisladas sin colisiones', () => {
  for (const route of routes) {
    assert.match(html, new RegExp('data-route="' + route + '"'));
    assert.match(html, new RegExp('id="view-' + route + '"'));
    assert.match(html, new RegExp('data-view="' + route + '"'));
    assert.ok(router.includes("'" + route + "'"));
    assert.ok(nsModule.includes("'" + route + "'"));
  }
  assert.equal((html.match(/data-group="experimental-ns"/g) || []).length, 1);
});

test('F1: el modulo nuevo no utiliza endpoints, tokens, ni tablas de produccion', () => {
  assert.doesNotMatch(nsModule, /\bfetch\s*\(|XMLHttpRequest|\.apiGet\s*\(|\.apiPost\s*\(|\/api\//);
  assert.doesNotMatch(nsModule, /\b(?:FROM|JOIN|UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+(?:tickets|portafolio)\b/i);
  assert.ok(nsModule.includes('ns_tickets_pruebas'));
  assert.ok(nsModule.includes('ns_portafolio_pruebas'));
});

test('F1: inicializacion de cada cascaron sin red ni efectos globales no deseados', () => {
  for (const route of routes) {
    const view = { innerHTML: '' };
    const context = {
      window: {},
      document: { getElementById(id) { return id === 'view-' + route ? view : null; } }
    };
    vm.runInNewContext(nsModule, context, { filename: 'experimental-ns.js' });
    assert.equal(context.window.ManttoExperimentalNsF1.init(route), true);
    assert.match(view.innerHTML, /En construcción/);
    assert.match(view.innerHTML, /ns_(?:portafolio|tickets)_pruebas/);
    assert.equal(context.window.ManttoExperimentalNsF1.init('portafolio'), false);
  }
});

test('F1: carga explicita de recursos una sola vez', () => {
  assert.equal((html.match(/modules\/experimental-ns\/experimental-ns\.js\?v=/g)||[]).length,1);
  assert.equal((html.match(/modules\/experimental-ns\/experimental-ns\.css\?v=/g)||[]).length,1);
  assert.equal((router.match(/nsAuthorized = /g)||[]).length,1);
});

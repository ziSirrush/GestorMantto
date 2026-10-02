'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

function createHarness() {
  const handlers = {};
  const requests = [];
  const navigations = [];
  const nodes = new Map();
  const makeNode = (id) => {
    if (!nodes.has(id)) nodes.set(id, { id, textContent: '', innerHTML: '', disabled: false, value: '' });
    return nodes.get(id);
  };
  const view = {
    nodeType: 1,
    innerHTML: '',
    addEventListener(type, handler) { handlers[type] = handler; },
    querySelector(selector) {
      if (selector.startsWith('#')) return makeNode(selector.slice(1));
      if (selector === '[data-ccor-pg-prev]') return makeNode('prev');
      if (selector === '[data-ccor-pg-next]') return makeNode('next');
      return null;
    },
    querySelectorAll() { return [makeNode('refresh'), makeNode('prev'), makeNode('next')]; }
  };

  let current = { route: 'cobranza-pagos', payload: null };
  const listResponse = {
    ok: true,
    source: 'aiven',
    paginacion: { pagina: 1, tamano: 50, total_registros: 2, total_paginas: 1 },
    data: [
      { id_pago_cor: 101, no_factura: 'CFV-100', cliente: 'Cliente Uno', proyecto: 'Proyecto Uno', complemento_pago: 'CP-1', fecha_complemento_pago: '2026-10-01', importe_complemento_pago: -1500.5, estado: 'Pagado', zona_adm: 'CENTRO' },
      { id_pago_cor: 102, no_factura: 'CFV-200', cliente: 'Cliente Dos', proyecto: 'Proyecto Dos', complemento_pago: 'CP-2', fecha_complemento_pago: '2026-10-02', importe_complemento_pago: -500, estado: 'Pendiente', zona_adm: 'NORTE' }
    ]
  };
  const detailResponse = {
    ok: true,
    pago: {
      id_pago_cor: 101, no_factura: 'CFV-100', cliente: 'Cliente Uno', proyecto: 'Proyecto Uno',
      complemento_pago: 'CP-1', fecha_complemento_pago: '2026-10-01', importe_complemento_pago: -1500.5,
      estado: 'Pagado', zona_adm: 'CENTRO', subsidiaria: 'Corellian', clase: 'SUMINISTRO', creado_desde: 'OV-1',
      limite_credito: 100000, facturado: 50000, pagado: 48500, saldo: 1500, dias_retraso: 3, terminos: '30 Dias',
      fecha_servicio: '2026-09-01', fecha_emision: '2026-09-02', fecha_vencimiento: '2026-10-02', fecha_creacion_ov: '2026-09-01 10:20:30'
    }
  };

  const documentHandlers = {};
  const document = {
    getElementById(id) { return id === 'view-placeholder' ? view : null; },
    addEventListener(type, handler) { documentHandlers[type] = handler; }
  };
  const window = {
    ManttoRouter: {
      getCurrent: () => current,
      go(route, payload, options) { navigations.push({ route, payload, options }); current = { route, payload }; }
    },
    ManttoHttp: {
      async get(requestPath) {
        requests.push(requestPath);
        return /\/pagos\/101$/.test(requestPath) ? detailResponse : listResponse;
      }
    },
    ManttoHumanTime: { formatMexicoCityDateTime: () => '02/10/2026 - 13:00' },
    clearTimeout() {},
    setTimeout(fn) { fn(); return 1; }
  };

  const context = { window, document, URLSearchParams, Intl, Number, String, Array, Object, Math, Promise, encodeURIComponent, console };
  vm.runInNewContext(read('modules/cobranza-cor/cobranza-cor-pagos.js'), context);
  return { window, document, view, nodes, handlers, documentHandlers, requests, navigations, setCurrent(value) { current = value; } };
}

test('module-loader registra la ruta cobranza-pagos con JS y CSS de Fase 3', () => {
  const loader = read('core/module-loader.js');
  assert.match(loader, /'cobranza-pagos':\{css:\['\.\/modules\/cobranza-cor\/cobranza-cor-pagos\.css\?v=20261002-cobranza-pagos-modulo-f3-v001'\],js:\['\.\/modules\/cobranza-cor\/cobranza-cor-pagos\.js\?v=20261002-cobranza-pagos-modulo-f3-v001'\]\}/);
});

test('frontend consulta el listado con paginacion y renderiza datos reales', async () => {
  const h = createHarness();
  await h.window.ManttoCobranzaCorPagos.init(h.view);
  assert.equal(h.requests.length, 1);
  assert.match(h.requests[0], /^\/api\/cobranza-cor\/pagos\?/);
  assert.match(h.requests[0], /page=1/);
  assert.match(h.requests[0], /page_size=50/);
  assert.match(h.view.innerHTML, /Listado de Pagos/);
  assert.match(h.nodes.get('ccor-pg-tbody').innerHTML, /CFV-100/);
  assert.match(h.nodes.get('ccor-pg-tbody').innerHTML, /Proyecto Uno/);
  assert.equal(h.nodes.get('ccor-pg-total').textContent, '2');
});

test('filtros se envian al backend y reinician pagina', async () => {
  const h = createHarness();
  await h.window.ManttoCobranzaCorPagos.init(h.view);
  h.handlers.change({ target: { id: 'ccor-pg-filter-estado', value: 'Pagado' } });
  await new Promise(setImmediate);
  assert.equal(h.requests.length, 2);
  assert.match(h.requests[1], /estado=Pagado/);
  assert.match(h.requests[1], /page=1/);
});

test('abrir un Pago usa la misma ruta sin modal y el detalle usa GET', async () => {
  const h = createHarness();
  await h.window.ManttoCobranzaCorPagos.init(h.view);
  h.window.ManttoCobranzaCorPagos.openDetail(101);
  assert.equal(h.navigations.length, 1);
  assert.equal(Number(h.navigations[0].payload.id), 101);
  h.setCurrent({ route: 'cobranza-pagos', payload: { id: 101 } });
  await h.window.ManttoCobranzaCorPagos.init(h.view);
  assert.match(h.requests.at(-1), /\/api\/cobranza-cor\/pagos\/101$/);
  assert.match(h.view.innerHTML, /Detalle del Pago/);
  assert.match(h.view.innerHTML, /Relación con proyecto/);
});

test('Fase 3 permanece de solo lectura', () => {
  const source = read('modules/cobranza-cor/cobranza-cor-pagos.js');
  assert.doesNotMatch(source, /ManttoHttp\.request/);
  assert.doesNotMatch(source, /method\s*:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/i);
  assert.doesNotMatch(source, /cobranza_rel_pagos/);
});

test('estilos incluyen comportamiento responsive para movil', () => {
  const css = read('modules/cobranza-cor/cobranza-cor-pagos.css');
  assert.match(css, /@media \(max-width:760px\)/);
  assert.match(css, /\.ccor-pg-table thead\{display:none\}/);
});

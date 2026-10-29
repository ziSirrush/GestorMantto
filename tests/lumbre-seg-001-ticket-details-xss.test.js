// [Lumbre | 2026-10-29 | LUMBRE-MG | L01_XSS_DETALLE_TICKETS_PRUEBAS_V001]
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'core', 'details.js'), 'utf8');

function createHarness(ticket) {
  const body = { innerHTML: '', querySelectorAll: () => [] };
  const title = { textContent: '' };
  const subtitle = { textContent: '' };
  const view = { querySelector: () => ({}) };
  const elements = new Map([
    ['view-detalle', view],
    ['mg-detail-styles', {}],
    ['mg-photo-lightbox', {}],
    ['mg-detail-title', title],
    ['mg-detail-sub', subtitle],
    ['mg-detail-body', body]
  ]);
  const document = {
    hidden: false,
    getElementById: id => elements.get(id) || null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {}
  };
  const window = {
    MANTTO_API_BASE: 'https://api.example.test',
    ManttoRouter: {
      getCurrent: () => ({ route: 'detalle', payload: { type: 'ticket', id: 'T-1' } }),
      go: () => { throw new Error('La prueba no debe navegar fuera del detalle.'); }
    },
    ManttoAuth: {
      getUser: () => ({ id_SB: 7 }),
      authHeaders: () => ({ Authorization: 'Bearer test' }),
      isViewingAs: () => false
    },
    ManttoHttp: {
      get: async requestPath => requestPath.endsWith('/interacciones')
        ? { data: { comentarios: [], validaciones: [], permisos: {} } }
        : { data: ticket }
    },
    setTimeout: () => 1,
    clearTimeout: () => {},
    addEventListener: () => {}
  };
  const context = vm.createContext({
    window,
    document,
    console,
    Intl,
    Date,
    Map,
    Set,
    Symbol,
    Object,
    Promise,
    URL,
    encodeURIComponent,
    fetch: async () => { throw new Error('La prueba debe usar ManttoHttp.'); }
  });
  vm.runInContext(source, context, { filename: 'core/details.js' });
  return { window, body };
}

test('L-01: el detalle conserva enlaces internos y escapa HTML de Tickets', async () => {
  const malicious = '<button autofocus onfocus="globalThis.__xss=1">Ejecutar</button>';
  const { window, body } = createHarness({
    ticket: 'T-1',
    proyecto: 'P-1',
    codigo_equipo: 'E-1',
    descripcion: malicious,
    causa: '<img src=x onerror="globalThis.__xss=2">',
    accion_en_cierre: '<script>globalThis.__xss=3</script>'
  });

  await window.ManttoDetails.openTicket('T-1');

  assert.match(body.innerHTML, /<button type="button" class="mg-link" data-proyecto="P-1">P-1<\/button>/);
  assert.match(body.innerHTML, /<button type="button" class="mg-link" data-equipo="E-1">E-1<\/button>/);
  assert.ok(body.innerHTML.includes('&lt;button autofocus onfocus=&quot;globalThis.__xss=1&quot;&gt;'));
  assert.ok(body.innerHTML.includes('&lt;img src=x onerror=&quot;globalThis.__xss=2&quot;&gt;'));
  assert.ok(body.innerHTML.includes('&lt;script&gt;globalThis.__xss=3&lt;/script&gt;'));
  assert.doesNotMatch(body.innerHTML, /<button[^>]+onfocus=/i);
  assert.doesNotMatch(body.innerHTML, /<img[^>]+onerror=/i);
  assert.doesNotMatch(body.innerHTML, /<script>/i);
});

test('L-01: los identificadores no pueden romper atributos de los enlaces internos', async () => {
  const { window, body } = createHarness({
    ticket: 'T-1',
    proyecto: 'P-1" autofocus onfocus="globalThis.__xss=4',
    codigo_equipo: 'E-1" onclick="globalThis.__xss=5'
  });

  await window.ManttoDetails.openTicket('T-1');

  assert.ok(body.innerHTML.includes('data-proyecto="P-1&quot; autofocus onfocus=&quot;globalThis.__xss=4"'));
  assert.ok(body.innerHTML.includes('data-equipo="E-1&quot; onclick=&quot;globalThis.__xss=5"'));
  assert.doesNotMatch(body.innerHTML, /data-proyecto="P-1" autofocus/i);
  assert.doesNotMatch(body.innerHTML, /data-equipo="E-1" onclick/i);
});

test('L-01: no queda una reinterpretación global de botones escapados', () => {
  assert.doesNotMatch(source, /innerHTML\s*=\s*[^;]*replace\(\/&lt;button/);
  assert.doesNotMatch(source, /replace\(\/&lt;\\\/button&gt;\/g/);
});

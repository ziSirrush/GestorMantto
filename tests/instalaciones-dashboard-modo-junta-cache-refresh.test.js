'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const frontend = read('modules/instalaciones-dashboard/instalaciones-dashboard_cor.js');
const loader = read('core/module-loader.js');
const index = read('index.html');
const sw = read('service-worker.js');
const REV = '20261109-detail-navigation-v002';

test('La version del Dashboard, cargador y service worker invalida la revision anterior', () => {
  assert.ok(loader.includes('instalaciones-dashboard_cor.js?v=' + REV));
  assert.ok(index.includes('core/module-loader.js?v=20261110-snapshot-first-v001'));
  assert.ok(sw.includes(REV));
  assert.match(sw, /needsFreshMeetingAsset_cor\(url\)/);
  assert.match(sw, /fetch\(request, \{ cache:'no-store' \}\)/);
});

test('Modo Junta renderiza Asesor, Ciudad, Supervisor y CPVP como celdas editables', () => {
  const blockStart = frontend.indexOf('const QUICK_EDIT_FIELDS_COR =');
  const blockEnd = frontend.indexOf('const PERMISSIONS_COR =', blockStart);
  const editStart = frontend.indexOf('function quickEditConfig_cor(');
  const editEnd = frontend.indexOf('function dateInputValue_cor(', editStart);
  const renderStart = frontend.indexOf('function resolveColumnValue_cor(');
  const renderEnd = frontend.indexOf('async function loadSummary_cor(', renderStart);
  assert.ok(blockStart >= 0 && blockEnd > blockStart);
  assert.ok(editStart >= 0 && editEnd > editStart);
  assert.ok(renderStart >= 0 && renderEnd > renderStart);
  const node = { innerHTML: '' };
  const context = {
    state: { meetingMode: true, report: null },
    raw: value => String(value == null ? '' : value).trim(),
    esc: value => String(value == null ? '' : value),
    closeCellEditor_cor: () => {},
    hasPermission_cor: () => true,
    formatDate_cor: value => String(value),
    formatPct_cor: value => String(value),
    formatInteger_cor: value => String(value),
    emptyRow_cor: () => '<tr><td>Sin equipos</td></tr>',
    bindResultRows_cor: () => {},
    $: id => id === 'idb-cor-report-result' ? node : null
  };
  const source = frontend.slice(blockStart, blockEnd) + '\n' +
    frontend.slice(editStart, editEnd) + '\n' +
    frontend.slice(renderStart, renderEnd) + '\nthis.paint = renderReport_cor;';
  vm.runInNewContext(source, context);
  context.paint({
    section: { codigo: '02-OC', nombre: 'En Obra Civil',
      columnas: [['CPVP','fecha_cpvp','fecha'],['COMENTARIO','comentarios_fl','comentario']] },
    total: 1,
    rows: [{
      id_ins_fl: 42, proyecto: 'Prueba', referencia_sitio: 'EQ-42',
      ciudad: 'Toluca', supervisor_fl: 'AB', vendedor: 'CD',
      estatus: '02-OC', fecha_cpvp: '2026-11-06', comentarios_fl: '',
      notificaciones: []
    }]
  });
  for (const field of ['ciudad','supervisor_fl','vendedor','fecha_cpvp','estatus']) {
    assert.match(node.innerHTML, new RegExp('data-field="' + field + '"'),
      'Falta la celda editable para ' + field);
  }
  assert.match(node.innerHTML, /data-idb-cor-cell-edit/);
  assert.match(node.innerHTML, /aria-label="Editar Asesor/);
});

test('El service worker consulta Dashboard JS online antes de devolver cache antiguo', async () => {
  const listeners = {};
  const operations = [];
  const networkResponse = { ok:true, clone:() => ({ok:true}) };
  const cache = { put: async () => { operations.push('put'); } };
  const context = {
    URL,
    self: {
      location: new URL('https://zisirrush.github.io/GestorMantto/service-worker.js'),
      addEventListener: (name, handler) => { listeners[name] = handler; }
    },
    caches: {
      open: async () => { operations.push('open'); return cache; },
      match: async () => { operations.push('cache-match'); return {ok:true}; }
    },
    fetch: async () => { operations.push('network-first'); return networkResponse; },
    Response: {error:() => ({ok:false})}
  };
  vm.runInNewContext(sw, context);
  let responseTask;
  listeners.fetch({
    request: {
      url:'https://zisirrush.github.io/GestorMantto/modules/instalaciones-dashboard/instalaciones-dashboard_cor.js?v=' + REV,
      method:'GET', mode:'cors'
    },
    respondWith: task => { responseTask = task; }
  });
  assert.ok(responseTask);
  const result = await responseTask;
  assert.equal(result, networkResponse);
  assert.deepEqual(operations, ['network-first','open','put']);
});

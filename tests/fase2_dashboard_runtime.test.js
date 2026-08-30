'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
let source = fs.readFileSync(path.join(root, 'modules/ventas-dashboard/ventas-dashboard.js'), 'utf8');

source = source.replace(
  '  window.ManttoVentasDashboard = {',
  `  window.__VD_TEST__ = {\n    selected,\n    renderYearOptions,\n    visibleHeaders,\n    defs,\n    logisticsCanonicalStatus,\n    renderLogisticsTables,\n    LOGISTICS_PIPELINE_ORDER,\n    LOGISTICS_COLUMNS_BY_STATUS,\n    resetDashboardDefaults\n  };\n\n  window.ManttoVentasDashboard = {`
);

function makeSelect(initialValue, initialOptions) {
  let html = '';
  const select = {
    value: initialValue,
    disabled: false,
    options: initialOptions.map((value) => ({ value: String(value), disabled: false, hidden: false })),
    selectedOptions: [],
    get innerHTML() { return html; },
    set innerHTML(value) {
      html = String(value);
      this.options = [...html.matchAll(/<option value="([^"]+)"/g)].map((match) => ({
        value: match[1], disabled: false, hidden: false
      }));
    }
  };
  return select;
}

const currentYear = new Date().getFullYear();
const elements = {
  'vd-user-select': makeSelect('42', ['todos', '42']),
  'vd-section-select': makeSelect('clientes', ['todos','prospeccion','redes','cotizaciones','clientes','ventas','perdido','logistica','activos','tareas_asignadas','tareas_creadas']),
  'vd-year-select': makeSelect(String(currentYear - 1), [currentYear, currentYear - 1]),
  'vd-stage': { innerHTML: '' },
  'vd-message': { textContent: '', className: '' }
};

const document = {
  getElementById(id) { return elements[id] || null; },
  querySelectorAll() { return []; },
  addEventListener() {}
};

const context = {
  window: {},
  document,
  sessionStorage: { removeItem() {} },
  fetch: async () => ({ ok: true, text: async () => '' }),
  console,
  URLSearchParams,
  setTimeout,
  clearTimeout,
  CustomEvent: function CustomEvent() {},
  HTMLInputElement: function HTMLInputElement() {}
};
context.window.window = context.window;
context.window.document = document;
vm.createContext(context);
vm.runInContext(source, context, { filename: 'ventas-dashboard.js' });

const t = context.window.__VD_TEST__;
if (!t) throw new Error('No fue posible exponer contrato interno de prueba.');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// Vista completa por default.
t.resetDashboardDefaults({ clearData: true });
assert(elements['vd-user-select'].value === 'todos', 'reset debe llevar Responsable a Todos.');
assert(elements['vd-section-select'].value === 'todos', 'reset debe llevar Sección a Todas.');
assert(t.selected().length === 10, `Todas debe resolver 10 secciones, obtuvo ${t.selected().length}.`);
assert(elements['vd-stage'].innerHTML.includes('Cargando Dashboard'), 'reset debe evitar mostrar datos viejos.');

// Lista individual sin consulta adicional.
elements['vd-section-select'].value = 'clientes';
const one = t.selected();
assert(one.length === 1 && one[0] === 'clientes', 'Selector individual debe devolver solo Clientes.');

// Año actual al abrir aunque existiera selección anterior.
elements['vd-year-select'].value = String(currentYear - 1);
t.renderYearOptions([currentYear - 2, currentYear - 1], true);
assert(Number(elements['vd-year-select'].value) === currentYear, 'Año debe volver al actual al abrir.');

// Todos conserva columna responsable; individual la elimina donde corresponde.
elements['vd-user-select'].value = 'todos';
assert(t.visibleHeaders(t.defs.cotizaciones).includes('Asesor'), 'Todos debe mostrar Asesor en Cotizaciones.');
elements['vd-user-select'].value = '42';
assert(!t.visibleHeaders(t.defs.cotizaciones).includes('Asesor'), 'Usuario individual debe ocultar Asesor redundante en Cotizaciones.');
assert(t.LOGISTICS_COLUMNS_BY_STATUS['EN PRODUCCION'].includes('Supervisor(a)'), 'Logística debe conservar Supervisor(a).');
assert(t.LOGISTICS_COLUMNS_BY_STATUS['EN PRODUCCION'].includes('Asesor'), 'Logística debe conservar Asesor aun en modo individual.');

// Logística conserva 12 secciones y paginación independiente 30.
assert(t.LOGISTICS_PIPELINE_ORDER.length === 12, 'Logística perdió sus 12 secciones.');
const logisticsRows = Array.from({ length: 31 }, (_, index) => ({
  estatus: 'ENTREGADO',
  ph_ns: `PH-${index + 1}`,
  cantidad: 1,
  proyecto: `Proyecto ${index + 1}`
}));
const logisticsHtml = t.renderLogisticsTables(logisticsRows);
assert((logisticsHtml.match(/vd-logistics-subsection/g) || []).length === 12, 'Render debe emitir 12 subsecciones Logística.');
assert(logisticsHtml.includes('Página 1 de 2 · 31 registros'), 'ENTREGADO debe paginar 31 registros a 30 por página.');
assert(t.logisticsCanonicalStatus('EN TRANSITO') === 'EN TRANSITO', 'Normalización Logística alterada.');

console.log('OK FASE 2 - runtime contractual Dashboard Ventas');

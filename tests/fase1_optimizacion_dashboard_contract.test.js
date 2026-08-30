'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'modules/ventas-dashboard/ventas-dashboard.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'modules/ventas-dashboard/ventas-dashboard.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'modules/ventas-dashboard/ventas-dashboard.css'), 'utf8');
const loader = fs.readFileSync(path.join(root, 'core/module-loader.js'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const expectedSections = [
  ['prospeccion', '1. Prospección'],
  ['redes', '2. Redes'],
  ['cotizaciones', '3. Cotizaciones'],
  ['clientes', '4. Clientes'],
  ['ventas', '5. Ventas'],
  ['perdido', '6. Perdidos'],
  ['logistica', '7. Logística'],
  ['activos', '8. Activos'],
  ['tareas_asignadas', '9. Pendientes asignados'],
  ['tareas_creadas', '10. Pendientes creados']
];

assert(html.includes('<select id="vd-user-select">'), 'Falta selector de responsable.');
assert(html.includes('<option value="todos">Todos</option>'), 'Todos debe ser la primera opcion del responsable.');
assert(html.includes('<select id="vd-section-select">'), 'Falta lista de secciones.');
assert(html.includes('<option value="todos">Todas las secciones</option>'), 'Todas las secciones debe existir como default.');
assert(!html.includes('vd-check-grid'), 'No debe permanecer la parrilla de pills/checks.');

let lastIndex = -1;
for (const [value, label] of expectedSections) {
  const marker = `<option value="${value}">${label}</option>`;
  const index = html.indexOf(marker);
  assert(index > lastIndex, `Orden incorrecto o falta seccion: ${label}`);
  lastIndex = index;
}

assert(js.includes("select.value = ALL_USERS_VALUE;"), 'El responsable debe reiniciarse en Todos.');
assert(js.includes("document.getElementById('vd-section-select')"), 'JS debe operar sobre la lista de secciones.');
assert(js.includes("if (select) select.value = ALL_USERS_VALUE;"), 'La seccion debe reiniciarse en Todas.');
assert(js.includes('sessionStorage.removeItem(STORAGE_KEY)'), 'Debe eliminarse el filtro parcial persistido previo.');
assert(!js.includes("document.getElementById('vd-check-grid')"), 'JS no debe depender del control viejo.');
assert(js.includes('const TABLE_PAGE_SIZE = 30;'), 'Debe conservarse paginacion 30x30.');
assert(js.includes('return available.includes(section) ? [section] : available;'), 'La lista debe filtrar solo una seccion o todas las disponibles.');

const defOrder = ['prospeccion:', 'redes:', 'cotizaciones:', 'clientes:', 'ventas:', 'perdido:', 'logistica:', 'instalaciones:', 'tareas_asignadas:', 'tareas_creadas:'];
lastIndex = -1;
for (const marker of defOrder) {
  const index = js.indexOf(marker);
  assert(index > lastIndex, `Orden defs incorrecto: ${marker}`);
  lastIndex = index;
}

assert(css.includes('#view-ventas-dashboard'), 'Debe existir estilo de vista completa.');
assert(css.includes('max-width:none;'), 'Dashboard no debe quedar limitado a 1600px.');
assert(css.includes('width:100%;'), 'Dashboard debe ocupar todo el ancho disponible.');
assert(css.includes('grid-template-columns:minmax(250px,1.15fr)'), 'Filtros deben usar barra horizontal de escritorio.');
assert(css.includes('@media(max-width:1180px)'), 'Debe existir respuesta para resoluciones intermedias.');
assert(css.includes('@media(max-width:820px)'), 'Debe existir respuesta movil/tablet.');

assert(loader.includes("ventas-dashboard.css?v=20260830-fase1-optimizacion-info-v001"), 'Falta cache-bust CSS Fase 1.');
assert(loader.includes("ventas-dashboard.js?v=20260830-fase1-optimizacion-info-v001"), 'Falta cache-bust JS Fase 1.');

console.log('OK FASE 1 - optimizacion Dashboard Ventas');

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

const version = '20260830-fase2-cierre-optimizacion-v001';
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

assert(html.includes(`data-vd-template-version="${version}"`), 'Template Fase 2 sin version correcta.');
assert(html.includes('<option value="todos">Todos</option>'), 'Responsable debe iniciar con Todos.');
assert(html.includes('<option value="todos">Todas las secciones</option>'), 'Secciones debe iniciar con Todas.');
assert(!html.includes('vd-check-grid'), 'No debe regresar la parrilla de pills.');

let last = -1;
for (const [value, label] of expectedSections) {
  const marker = `<option value="${value}">${label}</option>`;
  const pos = html.indexOf(marker);
  assert(pos > last, `Orden oficial incorrecto: ${label}`);
  last = pos;
}

assert(js.includes('const TABLE_PAGE_SIZE = 30;'), 'Se perdió 30x30.');
assert(js.includes('renderYearOptions([], true);'), 'La reapertura debe forzar año actual.');
assert(js.includes('resetDashboardDefaults({ clearData: true });'), 'La entrada debe limpiar datos visuales viejos.');
assert(js.includes('sessionStorage.removeItem(STORAGE_KEY)'), 'No debe persistirse selección parcial.');
assert(!js.includes('sessionStorage.setItem(STORAGE_KEY'), 'No debe guardarse selección parcial en Fase 2.');
assert(js.includes('select.value = ALL_USERS_VALUE;'), 'Debe reiniciar Responsable en Todos.');
assert(js.includes('sectionSelect.value = ALL_USERS_VALUE;'), 'Debe reiniciar Sección en Todas.');
assert(js.includes('finally {\n      select.disabled = false;'), 'Selector de usuario debe rehabilitarse incluso ante error.');
assert(js.includes('vd-logistics-body'), 'Logística debe usar contenedor de cierre responsive.');
assert(js.includes('vd-logistics-subsection'), 'Logística debe eliminar márgenes inline de subsecciones.');
assert(!js.includes('style="margin:14px"'), 'Subsecciones Logística no deben desbordar por width+margin.');

const logisticsOrderMatch = js.match(/const LOGISTICS_PIPELINE_ORDER = Object\.freeze\(\[([\s\S]*?)\]\);/);
assert(logisticsOrderMatch, 'No se encontró orden de Logística.');
const logisticsEntries = [...logisticsOrderMatch[1].matchAll(/^\s*'[^']+',?$/gm)].length;
assert(logisticsEntries === 12, `Logística debe conservar 12 subsecciones, detectadas ${logisticsEntries}.`);

assert(css.includes('max-width:none!important;'), 'Vista Dashboard debe eliminar límite de ancho.');
assert(css.includes('#view-ventas-dashboard *::before'), 'Falta box-sizing defensivo full-width.');
assert(css.includes('.vd-logistics-body{'), 'Falta layout Logística responsive.');
assert(css.includes('.vd-logistics-subsection{width:100%;min-width:0;margin:0;'), 'Subsecciones Logística deben ser full-width sin margen.');
assert(css.includes('@media(max-width:1180px)'), 'Falta responsive intermedio.');
assert(css.includes('@media(max-width:820px)'), 'Falta responsive tablet/móvil.');

assert(loader.includes(`ventas-dashboard.css?v=${version}`), 'Falta cache-bust CSS Fase 2.');
assert(loader.includes(`ventas-dashboard.js?v=${version}`), 'Falta cache-bust JS Fase 2.');
assert(loader.includes("'ventas-proyectos-interes':"), 'Fase 2 no debe romper Proyectos de interés.');
assert(loader.includes('20260830-fase6-v001'), 'Debe preservarse versión de Proyectos de interés.');

console.log('OK FASE 2 - contrato cierre optimizacion Dashboard Ventas');

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'modules/dashboard-logistica/dashboard-logistica.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'modules/dashboard-logistica/dashboard-logistica.css'), 'utf8');
const loader = fs.readFileSync(path.join(root, 'core/module-loader.js'), 'utf8');

assert(js.includes('id="dl-chart-sin-produccion"'), 'Fase 3: debe conservar grafica Sin Produccion de Fase 2');
assert(js.includes('id="dl-chart-produccion"'), 'Fase 3: debe conservar grafica Produccion de Fase 2');
assert(js.includes('id="dl-chart-logistica"'), 'Fase 3: debe conservar grafica Logistica de Fase 2');
assert(js.includes('id="dl-chart-entregados"'), 'Fase 3: debe conservar Entregados por anio de Fase 2');
assert(js.includes('.sort((a,b)=>a.anio-b.anio)'), 'Fase 3: debe conservar orden ascendente de Entregados');
assert(js.includes('id="dl-departure-body"'), 'Fase 3: falta tabla Promedio de salida por puerto');
assert(js.includes('id="dl-containers-ring"'), 'Fase 3: falta ring de contenedores');
assert(js.includes('id="dl-transit-body"'), 'Fase 3: falta tabla Promedio de transito segun modo');
assert(js.includes('tables.salida_por_puerto'), 'Fase 3: falta consumir salida_por_puerto');
assert(js.includes('tables.llegada_por_modo_puerto'), 'Fase 3: falta consumir llegada_por_modo_puerto');
assert(js.includes('analytics.contenedores'), 'Fase 3: falta consumir contenedores');
assert(js.includes('row.promedio_dias_salida'), 'Fase 3: falta mostrar promedio_dias_salida');
assert(js.includes('row.promedio_dias_llegada'), 'Fase 3: falta mostrar promedio_dias_llegada');
assert(js.includes('contenedores_20_dc'), 'Fase 3: falta conteo 20 DC');
assert(js.includes('contenedores_40_hq'), 'Fase 3: falta conteo 40 HQ');
assert(js.includes("text('dl-containers-year',year?'ETD '+year:'Año actual')"), 'Fase 3: el ring debe declarar el anio por ETD');
assert(js.includes('Conteo físico, no TEU equivalente.'), 'Fase 3: falta declarar conteo fisico');
assert(js.includes('renderAnalytics();'), 'Fase 3: falta renderizar analitica');

assert(css.includes('.dl-column-chart'), 'Fase 3: debe conservar graficas de columnas de Fase 2');
assert(css.includes('.dl-column-fill'), 'Fase 3: debe conservar barras verticales de Fase 2');
assert(css.includes('.dl-analytics-top'), 'Fase 3: falta layout analitico superior');
assert(css.includes('.dl-ring'), 'Fase 3: falta estilo del ring');
assert(css.includes('conic-gradient('), 'Fase 3: ring no usa distribucion circular');
assert(css.includes('.dl-analytics-table'), 'Fase 3: faltan estilos de tablas analiticas');
assert(css.includes('@media(max-width:1080px)'), 'Fase 3: falta responsive del bloque analitico');

assert(loader.includes('dashboard-logistica.css?v=20260923-dashboard-f3-v001'), 'Fase 3: falta cache-bust CSS');
assert(loader.includes('dashboard-logistica.js?v=20260923-dashboard-f3-v001'), 'Fase 3: falta cache-bust JS');

console.log('OK - FASE_3_DASHBOARD_LOGISTICA_ANALITICA_VISUAL_V001');
console.log('  Tabla de salida por puerto');
console.log('  Ring de contenedores 20 DC vs 40 HQ del anio actual');
console.log('  Tabla de transito por puerto destino + modo ICT');
console.log('  Responsive conserva tablas con scroll local y ring adaptable');

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'modules/dashboard-logistica/dashboard-logistica.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'modules/dashboard-logistica/dashboard-logistica.css'), 'utf8');
const loader = fs.readFileSync(path.join(root, 'core/module-loader.js'), 'utf8');

assert(js.includes("fetchJson(api()+'/api/logistica/dashboard'"), 'Fase 2: falta consumir /api/logistica/dashboard');
assert(js.includes('id="dl-chart-sin-produccion"'), 'Fase 2: falta grafica Sin Produccion');
assert(js.includes('id="dl-chart-produccion"'), 'Fase 2: falta grafica Produccion');
assert(js.includes('id="dl-chart-logistica"'), 'Fase 2: falta grafica Logistica');
assert(js.includes('id="dl-chart-entregados"'), 'Fase 2: falta grafica Entregados por anio');
assert(!js.includes('Pipeline por estatus'), 'Fase 2: el titulo Pipeline por estatus no debe permanecer');
assert(!js.includes("const PIPELINE="), 'Fase 2: no debe permanecer el pipeline local legacy');
assert(js.includes("window.ManttoRouter.go('logistica-reporte',{estatus:element.dataset.status,source:'logistica-dashboard'})"), 'Fase 2: las columnas de estatus deben conservar navegacion al reporte');
assert(js.includes(".sort((a,b)=>a.anio-b.anio)"), 'Fase 2: Entregados debe ordenar del anio mas antiguo al mas reciente');
assert(js.includes('fecha_entrega_real_obra'), 'Fase 2: debe declararse la fuente de Entregados por anio');

assert(css.includes('grid-template-columns:repeat(2,minmax(0,1fr));'), 'Fase 2: falta acomodo 2x2 desktop');
assert(css.includes('.dl-column-chart'), 'Fase 2: falta estilo de grafica de columnas');
assert(css.includes('.dl-column-fill'), 'Fase 2: falta columna vertical');
assert(css.includes('overflow-x:auto;'), 'Fase 2: falta scroll horizontal local para conservar columnas en PWA');
assert(css.includes('@media(max-width:980px)'), 'Fase 2: falta regla responsive de cards');

assert(loader.includes("dashboard-logistica.css?v=20260923-dashboard-f2-v001"), 'Fase 2: falta cache-bust CSS');
assert(loader.includes("dashboard-logistica.js?v=20260923-dashboard-f2-v001"), 'Fase 2: falta cache-bust JS');

console.log('OK - FASE_2_DASHBOARD_LOGISTICA_GRAFICAS_V001');
console.log('  4 graficas de columnas independientes');
console.log('  Entregados por anio usa el payload de Fase 1 y orden ascendente');
console.log('  Estatus mantiene navegacion al Reporte de Logistica');
console.log('  Responsive conserva columnas y usa scroll local cuando hace falta');

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const frontend = fs.readFileSync(path.join(root, 'modules/dashboard-logistica/dashboard-logistica.js'), 'utf8');
const loader = fs.readFileSync(path.join(root, 'core/module-loader.js'), 'utf8');

const movTitle = frontend.indexOf('<h2>Movimientos semanales</h2>');
const ppnsTitle = frontend.indexOf('<h2>Proyectos sin PP NS</h2>');
const modal = frontend.indexOf('<section id="dl-modal"');

assert(movTitle !== -1, 'Debe conservar Movimientos semanales.');
assert(ppnsTitle !== -1, 'Debe conservar Proyectos sin PP NS.');
assert(modal !== -1, 'Debe conservar el modal de detalle.');
assert(ppnsTitle > movTitle, 'Proyectos sin PP NS debe quedar después de Movimientos semanales.');
assert(ppnsTitle < modal, 'Proyectos sin PP NS debe ser la última sección visible antes del modal oculto.');
assert(frontend.includes('class="dl-card dl-section dl-ppns-final"'), 'PPNS debe quedar en una sección propia de ancho completo.');
assert(!frontend.includes('<section class="dl-grid dl-two">\n    <article class="dl-card dl-section">\n      <div class="dl-section-head"><div><h2>Proyectos sin PP NS</h2>'), 'No debe conservar PPNS en el grid de dos columnas anterior.');
assert(frontend.includes('id="dl-cut-select"'), 'Debe conservar selector de cortes históricos.');
assert(frontend.includes('id="dl-average-year-select"'), 'Debe conservar selector estándar de periodo de promedios.');
assert(frontend.includes('id="dl-containers-months-first"') && frontend.includes('id="dl-containers-months-second"'), 'Debe conservar desglose mensual de contenedores.');
assert(loader.includes('20260923-dashboard-ppns-final-v001'), 'Debe actualizar cache-bust del Dashboard Logística.');

console.log('OK - FIX_DASHBOARD_LOGISTICA_ORDEN_PPNS_FINAL_V001');
console.log('  Movimientos semanales permanece antes de PPNS');
console.log('  Proyectos sin PP NS es la ultima seccion visible');
console.log('  Filtros, cortes y ring permanecen');

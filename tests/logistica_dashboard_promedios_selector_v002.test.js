'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const frontendPath = path.join(root, 'modules/dashboard-logistica/dashboard-logistica.js');
const cssPath = path.join(root, 'modules/dashboard-logistica/dashboard-logistica.css');
const loaderPath = path.join(root, 'core/module-loader.js');

const frontend = fs.readFileSync(frontendPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');
const loader = fs.readFileSync(loaderPath, 'utf8');

assert(frontend.includes('id="dl-average-year-select"'), 'Debe usar select estándar para el periodo.');
assert(frontend.includes('class="dl-average-year-select"'), 'El select debe tener clase localizada del Dashboard Logística.');
assert(!frontend.includes('id="dl-average-year-search"'), 'No debe conservar el input search anterior.');
assert(!frontend.includes('<datalist id="dl-average-year-options"'), 'No debe usar datalist nativo del navegador.');
assert(frontend.includes('<option value="all">Todos los años</option>'), 'Debe conservar Todos los años.');
assert(frontend.includes("info.years.map(year=>"), 'Debe cargar los años registrados dinámicamente.');
assert(frontend.includes('parseAveragePeriodSelection'), 'Debe validar el valor seleccionado.');
assert(frontend.includes("anio_promedios="), 'Debe conservar el filtro backend por año.');
assert(frontend.includes('id="dl-average-year-apply"'), 'Debe conservar el botón Buscar.');
assert(frontend.includes('id="dl-cut-select"'), 'Debe conservar el selector de cortes históricos.');
assert(frontend.includes('id="dl-containers-months-first"') && frontend.includes('id="dl-containers-months-second"'), 'Debe conservar las tablas mensuales del ring.');

assert(css.includes('.dl-average-year-select'), 'Debe incluir estilos del select estándar.');
assert(css.includes('height:40px;'), 'El select debe conservar la altura estándar de filtros del Gestor.');
assert(css.includes('border:1px solid #cfdbea;'), 'El select debe usar el borde estándar de filtros del Gestor.');
assert(css.includes('border-radius:9px;'), 'El select debe usar radio estándar de filtros del Gestor.');
assert(css.includes('color-scheme:light;'), 'Debe evitar el popup oscuro del datalist anterior cuando el navegador lo soporte.');
assert(css.includes('.dl-average-year-select option'), 'Las opciones deben declarar fondo claro y texto del Gestor.');

assert(loader.includes('20260923-dashboard-promedios-selector-v002'), 'Debe actualizar cache-bust JS/CSS.');
assert(!loader.includes('20260923-dashboard-promedios-anio-v001'), 'No debe conservar cache-bust anterior en Logística Dashboard.');

console.log('OK - FIX_DASHBOARD_LOGISTICA_PROMEDIOS_SELECTOR_ESTANDAR_V002');
console.log('  Datalist eliminado');
console.log('  Select estándar: Todos los años + años registrados');
console.log('  Botón Buscar y filtro backend se conservan');

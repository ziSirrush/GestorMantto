'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

Object.assign(process.env, {
  DB_HOST: '127.0.0.1',
  DB_PORT: '3306',
  DB_USER: 'unit',
  DB_PASSWORD: 'unit',
  DB_NAME: 'unit',
  DB_SSL: 'false'
});

const root = path.resolve(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'modules/dashboard-logistica/dashboard-logistica.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'modules/dashboard-logistica/dashboard-logistica.css'), 'utf8');
const loader = fs.readFileSync(path.join(root, 'core/module-loader.js'), 'utf8');
const repo = fs.readFileSync(path.join(root, 'backend/src/modules/logistica-dashboard/logistica-dashboard.repository.js'), 'utf8');
const service = require('../backend/src/modules/logistica-dashboard/logistica-dashboard.service');

assert(js.includes('id="dl-containers-months-first"'), 'Falta tabla enero-junio');
assert(js.includes('id="dl-containers-months-second"'), 'Falta tabla julio-diciembre');
assert.equal(js.split("<th>Mes</th><th>20' DC</th><th>40' HQ</th>").length - 1, 2, 'Deben existir dos tablas 7x3 con los mismos encabezados');
assert(js.includes('rows.slice(0,6)'), 'La tabla izquierda debe usar enero-junio');
assert(js.includes('rows.slice(6,12)'), 'La tabla derecha debe usar julio-diciembre');
assert(css.includes('.dl-container-months-grid'), 'Falta grid de dos tablas');
assert(css.includes('grid-template-columns:repeat(2,minmax(0,1fr))'), 'Las tablas deben ir lado a lado en escritorio');
assert(repo.includes('BETWEEN 1 AND 12'), 'El backend debe consultar enero-diciembre');
assert(loader.includes('dashboard-logistica.css?v=20260923-dashboard-ring-meses-v002'), 'Falta cache-bust CSS V002');
assert(loader.includes('dashboard-logistica.js?v=20260923-dashboard-ring-meses-v002'), 'Falta cache-bust JS V002');

const normalized = service.normalizeContainerMonths_cor([
  { mes: 1, contenedores_20_dc: 1, contenedores_40_hq: 5 },
  { mes: 6, contenedores_20_dc: 5, contenedores_40_hq: 2 },
  { mes: 7, contenedores_20_dc: 3, contenedores_40_hq: 8 },
  { mes: 12, contenedores_20_dc: 4, contenedores_40_hq: 6 }
]);
assert.equal(normalized.length, 12, 'Debe devolver exactamente 12 meses');
assert.deepEqual(normalized[0], { mes: 1, mes_nombre: 'Enero', contenedores_20_dc: 1, contenedores_40_hq: 5 });
assert.deepEqual(normalized[5], { mes: 6, mes_nombre: 'Junio', contenedores_20_dc: 5, contenedores_40_hq: 2 });
assert.deepEqual(normalized[6], { mes: 7, mes_nombre: 'Julio', contenedores_20_dc: 3, contenedores_40_hq: 8 });
assert.deepEqual(normalized[11], { mes: 12, mes_nombre: 'Diciembre', contenedores_20_dc: 4, contenedores_40_hq: 6 });

console.log('OK - FIX_DASHBOARD_LOGISTICA_RING_MESES_V002');
console.log('  Dos tablas 7x3 dentro de la tarjeta del ring');
console.log('  Izquierda enero-junio | derecha julio-diciembre');

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MTBC_SOURCES = [
  'backend/src/controllers/data.controller.legacy.js',
  'backend/src/modules/criticos/callcenter-cuartos-operacion.service.js',
  'backend/src/modules/criticos/criticos-cuartos-operacion.service.js',
  'backend/src/modules/criticos/criticos.service.js',
  'backend/src/modules/portafolio/portafolio-consultas_uni.js',
  'backend/src/modules/proyectos/proyectos-cuartos_uni.service.js',
  'backend/src/modules/proyectos/proyectos.service.js',
  'modules/callcenter/callcenter.js',
  'modules/equipos-criticos/equipos-criticos.js'
];

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

function mtbcEquipo(periodDays, failures) {
  return failures > 0 ? round3(periodDays / failures) : null;
}

function mtbcProyecto(periodDays, activeEquipmentWithFailures, failures) {
  return failures > 0 ? round3(periodDays * activeEquipmentWithFailures / failures) : null;
}

test('las cuatro formulas oficiales producen los resultados esperados', () => {
  assert.equal(mtbcEquipo(286, 4), 71.5);
  assert.equal(mtbcEquipo(365, 8), 45.625);
  assert.equal(mtbcProyecto(286, 2, 4), 143);
  assert.equal(mtbcProyecto(365, 3, 8), 136.875);
  assert.equal(mtbcEquipo(365, 0), null);
  assert.equal(mtbcProyecto(365, 0, 0), null);
});

test('no quedan formulas MTBC anteriores ni una ventana U365 de 366 fechas', () => {
  const source = MTBC_SOURCES.map(relativePath => `\n/* ${relativePath} */\n${read(relativePath)}`).join('');

  assert.doesNotMatch(source, /INTERVAL\s+365\s+DAY/i);
  assert.doesNotMatch(source, /DATEDIFF\s*\(\s*MAX\s*\(/i);
  assert.doesNotMatch(source, /NULLIF\s*\(\s*COUNT\s*\([^)]*\)\s*-\s*1/i);
  assert.doesNotMatch(source, /AVG\s*\([^)]*mtbc/i);
  assert.doesNotMatch(source, /\bmtbc_(?:sum|count)\b/i);
  assert.doesNotMatch(source, /mtbc_tendencia_mensual/i);
});

test('el MTBC de equipo usa dias de ventana entre fallas BLT', () => {
  const source = read('backend/src/modules/criticos/callcenter-cuartos-operacion.service.js');

  assert.match(source, /DATEDIFF\([^\n]+MAKEDATE\([^\n]+\)\s*\+\s*1\)\s*\/\s*NULLIF/);
  assert.match(source, /ROUND\(365\s*\/\s*NULLIF/);
  assert.match(source, /INTERVAL\s+364\s+DAY/);
  assert.match(source, /LIKE\s+'%BLT%'/);
});

test('el MTBC de proyecto cuenta solo equipos activos con falla BLT', () => {
  const critical = read('backend/src/modules/criticos/callcenter-cuartos-operacion.service.js');
  const portfolio = read('backend/src/modules/portafolio/portafolio-consultas_uni.js');

  assert.match(critical, /equipos_con_falla_blt_anio/);
  assert.match(critical, /equipos_con_falla_blt_365/);
  assert.match(critical, /365\s*\*\s*SUM\(CASE WHEN COALESCE\(ta\.fallas_blt_365,0\)\s*>\s*0 THEN 1 ELSE 0 END\)/);
  assert.match(portfolio, /activeWithFaultsYear/);
  assert.match(portfolio, /activeWithFaults365/);
});

test('el detalle de proyecto presenta los KPI MTBC en una fila 3-4-3-2', () => {
  const detail = read('core/details.js');

  assert.match(detail, /\.mg-project-kpis\.cols-2\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}/);
  assert.match(detail, /kpi\('MTBC Año Actual',fmtMtbc\(p\.mtbc_anio\)/);
  assert.match(detail, /kpi\('MTBC U365',fmtMtbc\(p\.mtbc_365\)/);
  assert.match(detail, /equipmentKpis\+callKpis\+debtKpis\+mtbcKpis\+rings/);
});

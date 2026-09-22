'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const servicePath = path.join(
  __dirname,
  '..',
  'backend',
  'src',
  'modules',
  'proyectos',
  'proyectos-cuartos_uni.service.js'
);

function readSource() {
  return fs.readFileSync(servicePath, 'utf8');
}

function annualMetricsBlock(source) {
  const totalIndex = source.indexOf('COUNT(*) AS llamadas_total_anio');
  assert.notEqual(totalIndex, -1, 'Debe existir llamadas_total_anio con COUNT(*)');

  const joinStart = source.lastIndexOf('LEFT JOIN (', totalIndex);
  const joinEnd = source.indexOf(') resp_anio', totalIndex);
  assert.notEqual(joinStart, -1, 'Debe existir el LEFT JOIN de resp_anio');
  assert.notEqual(joinEnd, -1, 'Debe existir el cierre de resp_anio');

  return source.slice(joinStart, joinEnd + ') resp_anio'.length);
}

test('Proyectos UNI: Llamadas Totales cuenta todo el año actual sin filtrar responsabilidad', () => {
  const block = annualMetricsBlock(readSource());

  assert.match(block, /COUNT\(\*\)\s+AS\s+llamadas_total_anio/);
  assert.match(block, /MAX\(fecha_reporte\)\s+AS\s+ultima_llamada/);

  const fromIndex = block.indexOf('FROM tickets');
  const groupIndex = block.indexOf('GROUP BY TRIM(codigo_equipo)', fromIndex);
  assert.notEqual(fromIndex, -1, 'Debe consultar tickets');
  assert.notEqual(groupIndex, -1, 'Debe agrupar por codigo_equipo');

  const universeWhere = block.slice(fromIndex, groupIndex);
  assert.doesNotMatch(
    universeWhere,
    /responsabilidad/i,
    'El universo de Llamadas Totales no puede filtrar por responsabilidad'
  );

  assert.match(
    universeWhere,
    /fecha_reporte\s*>=\s*MAKEDATE\(YEAR\(\$\{sqlMexicoCityToday\(\)\}\),1\)/,
    'Debe iniciar el 1 de enero del año actual CDMX'
  );
  assert.match(
    universeWhere,
    /fecha_reporte\s*<\s*DATE_ADD\(\$\{sqlMexicoCityToday\(\)\},\s*INTERVAL\s+1\s+DAY\)/,
    'Debe terminar hoy inclusive en CDMX'
  );
});

test('Proyectos UNI: BLT y CLIENTE son subconjuntos del mismo universo anual', () => {
  const block = annualMetricsBlock(readSource());

  assert.match(
    block,
    /SUM\(CASE WHEN UPPER\(TRIM\(COALESCE\(responsabilidad,''\)\)\)='BLT' THEN 1 ELSE 0 END\)\s+AS\s+llamadas_blt_anio/
  );
  assert.match(
    block,
    /MAX\(CASE WHEN UPPER\(TRIM\(COALESCE\(responsabilidad,''\)\)\)='BLT' THEN fecha_reporte END\)\s+AS\s+ultima_llamada_blt/
  );
  assert.match(
    block,
    /SUM\(CASE WHEN UPPER\(TRIM\(COALESCE\(responsabilidad,''\)\)\)='CLIENTE' THEN 1 ELSE 0 END\)\s+AS\s+llamadas_cliente_anio/
  );
  assert.match(
    block,
    /MAX\(CASE WHEN UPPER\(TRIM\(COALESCE\(responsabilidad,''\)\)\)='CLIENTE' THEN fecha_reporte END\)\s+AS\s+ultima_llamada_cliente/
  );
});

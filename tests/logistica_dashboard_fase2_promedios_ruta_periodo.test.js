'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dir = path.resolve(__dirname, '..');
const repositoryText = fs.readFileSync(path.join(dir, 'backend/src/modules/logistica-dashboard/logistica-dashboard.repository.js'), 'utf8');
const serviceText = fs.readFileSync(path.join(dir, 'backend/src/modules/logistica-dashboard/logistica-dashboard.service.js'), 'utf8');

function loadSource(source, mocks) {
  const module = { exports: {} };
  const localRequire = id => {
    if (!Object.hasOwn(mocks, id)) throw new Error('Unexpected module: ' + id);
    return mocks[id];
  };
  new Function('require', 'module', 'exports', source)(localRequire, module, module.exports);
  return module.exports;
}

function loadRepo() {
  const calls = [];
  const db = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      return [[{ contenedores_20_dc: 0, contenedores_40_hq: 0, operaciones_con_dato: 0 }]];
    }
  };
  return { calls, repository: loadSource(repositoryText, { '../../config/db': db }) };
}

const demoRoute = {
  puerto_origen: 'Shanghai', puerto_destino: 'Manzanillo', modo: 'MARÍTIMO',
  operaciones: '4', operaciones_salida: '3', promedio_dias_salida: '13.5',
  operaciones_transito: '2', promedio_dias_llegada: '21.0',
  operaciones_completas: '1', promedio_dias_total: '41.0'
};

function loadService(calls = []) {
  const repo = {
    async statusCounts_cor() { return [{ estatus: 'EN PRODUCCION', total: 1 }]; },
    async deliveredByYear_cor() { return [{ anio: 2024, total: 4 }]; },
    async averageYears_cor() { return [{ anio: 2026 }]; },
    async analysisYears_cor() { return [{ anio: 2024 }, { anio: 2026 }, { anio: 2025 }, { anio: 2025 }]; },
    async currentYearContainers_cor(year) { calls.push(['legacyContenedores', year]); return { contenedores_20_dc: 2, contenedores_40_hq: 3, operaciones_con_dato: 2 }; },
    async currentYearContainersByMonth_cor(year) { calls.push(['legacyMeses', year]); return []; },
    async averageDepartureByPort_cor(year) { calls.push(['salida', year]); return [{ puerto: 'Shanghai', operaciones: 2, promedio_dias_salida: 13.5 }]; },
    async averageTransitByPortMode_cor(year) { calls.push(['transito', year]); return [{ puerto_destino: 'Manzanillo', modo: 'MARÍTIMO', operaciones: 2, promedio_dias_llegada: 21 }]; },
    async averageByRoute_cor(year) { calls.push(['rutas', year]); return [demoRoute]; },
    async periodContainers_cor(year) { calls.push(['contenedoresPeriodo', year]); return { contenedores_20_dc: 7, contenedores_40_hq: 9, operaciones_con_dato: 8 }; },
    async periodContainerMonths_cor(year) { calls.push(['mesesPeriodo', year]); return [{ mes: 1, contenedores_20_dc: 1, contenedores_40_hq: 2 }]; }
  };
  return loadSource(serviceText, {
    './logistica-dashboard.repository': repo,
    '../../utils/temporal': { mexicoCityYear: () => 2026 }
  });
}

test('Aiven log_ops es la unica fuente: lectura sin nuevas tablas ni cambios DDL/DML', () => {
  const { repository } = loadRepo();
  for (const name of ['averageByRoute_cor', 'analysisYears_cor', 'periodContainers_cor', 'periodContainerMonths_cor']) {
    assert.equal(typeof repository[name], 'function');
  }
  assert.match(repositoryText, /FROM log_ops/g);
  assert.doesNotMatch(repositoryText, /\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\s+(?:INTO\s+|TABLE\s+)?log_ops\b/i);
});

test('SQL ruta agrupa origen + destino + modo, filtra el anio por salida real parametrizada', async () => {
  const { calls, repository } = loadRepo();
  await repository.averageByRoute_cor(2025);
  const { sql, params } = calls.at(-1);
  assert.match(sql, /GROUP BY UPPER\(TRIM\(puerto_origen\)\), UPPER\(TRIM\(puerto_destino\)\), UPPER\(TRIM\(ict\)\)/);
  assert.match(sql, /CAST\(LEFT\(TRIM\(fecha_salida_real\), 4\) AS UNSIGNED\) = \?/);
  assert.deepEqual(params, ['^[0-9]{4}-[0-9]{2}-[0-9]{2}', 2025]);
  assert.match(sql, /HAVING operaciones_salida > 0 OR operaciones_transito > 0/);
  assert.match(sql, /TRIM\(COALESCE\(puerto_origen, ''\)\) <> ''/);
  assert.match(sql, /TRIM\(COALESCE\(puerto_destino, ''\)\) <> ''/);
  assert.match(sql, /TRIM\(COALESCE\(ict, ''\)\) <> ''/);
});

test('SQL ruta all omite filtro anual pero conserva fechas reales validas', async () => {
  const { calls, repository } = loadRepo();
  await repository.averageByRoute_cor(null);
  const { sql, params } = calls.at(-1);
  assert.deepEqual(params, ['^[0-9]{4}-[0-9]{2}-[0-9]{2}']);
  assert.doesNotMatch(sql, /fecha_salida_real\), 4\) AS UNSIGNED\) = \?/);
  assert.match(sql, /TRIM\(COALESCE\(fecha_salida_real, ''\)\) REGEXP \?/);
});

test('SQL promedio total se calcula solo con las mismas operaciones completas', async () => {
  const { calls, repository } = loadRepo();
  await repository.averageByRoute_cor(2026);
  const { sql } = calls.at(-1);
  const columns = /COUNT\(CASE WHEN ([\s\S]*?) THEN 1 END\) AS operaciones_completas,\s*ROUND\(AVG\(CASE WHEN ([\s\S]*?) THEN DATEDIFF\(/.exec(sql);
  assert.ok(columns, 'conteo de operaciones completas y media de extremo a extremo');
  assert.match(columns[1], /fecha_exw/);
  assert.match(columns[1], /fecha_llegada_real/);
  assert.match(columns[1], /\sAND\s/);
  assert.match(columns[2], /fecha_exw/);
  assert.match(columns[2], /fecha_llegada_real/);
  assert.match(sql, /THEN DATEDIFF\(STR_TO_DATE\(LEFT\(TRIM\(fecha_llegada_real\)/);
  assert.doesNotMatch(sql, /promedio_dias_salida\s*\+\s*promedio_dias_llegada/i);
});

test('catalogo de periodos incluye anios de zarpe real o ETD (aunque sean exclusivos)', async () => {
  const { calls, repository } = loadRepo();
  await repository.analysisYears_cor();
  const { sql, params } = calls.at(-1);
  assert.match(sql, /fecha_salida_real/);
  assert.match(sql, /fecha_salida_estimada/);
  assert.match(sql, /UNION ALL/);
  assert.match(sql, /SELECT DISTINCT anio/);
  assert.match(sql, /BETWEEN 1900 AND 2200/);
  assert.equal(params.length, 2);
});

test('contenedores por periodo anual filtran por ETD con parametro, no por zarpe', async () => {
  const { calls, repository } = loadRepo();
  await repository.periodContainers_cor(2025);
  const total = calls.at(-1);
  await repository.periodContainerMonths_cor(2025);
  const meses = calls.at(-1);
  for (const q of [total, meses]) {
    assert.match(q.sql, /fecha_salida_estimada/);
    assert.match(q.sql, /CAST\(LEFT\(TRIM\(fecha_salida_estimada\), 4\) AS UNSIGNED\) = \?/);
    assert.match(q.sql, /BETWEEN 1 AND 12/);
    assert.deepEqual(q.params, ['^[0-9]{4}-[0-9]{2}-[0-9]{2}', 2025]);
  }
  assert.match(total.sql, /SUM\(contenedores_20_dc\)/);
  assert.match(total.sql, /SUM\(contenedores_40_hq\)/);
  assert.match(meses.sql, /GROUP BY CAST\(SUBSTRING\(TRIM\(fecha_salida_estimada\), 6, 2\) AS UNSIGNED\)/);
});

test('contenedores all consolidan anos sin filtrar ETD por ano y mantienen 12 meses', async () => {
  const { calls, repository } = loadRepo();
  await repository.periodContainers_cor(null);
  const total = calls.at(-1);
  await repository.periodContainerMonths_cor(null);
  const months = calls.at(-1);
  assert.deepEqual(total.params, ['^[0-9]{4}-[0-9]{2}-[0-9]{2}']);
  assert.deepEqual(months.params, ['^[0-9]{4}-[0-9]{2}-[0-9]{2}']);
  assert.doesNotMatch(months.sql, /fecha_salida_estimada\), 4\) AS UNSIGNED\) = \?/);
});

test('salida, transito y total conservan muestras independientes y nulos sin datos', () => {
  const service = loadService();
  const list = service.normalizeRouteTable_cor([
    demoRoute,
    { puerto_origen: 'Ningbo', puerto_destino: 'Veracruz', modo: 'MARÍTIMO', operaciones: 1, operaciones_salida: 1, promedio_dias_salida: 0, operaciones_transito: 0, promedio_dias_llegada: null, operaciones_completas: 0, promedio_dias_total: null },
    { puerto_origen: '', puerto_destino: 'Veracruz', modo: 'MARÍTIMO', operaciones: 5 }
  ]);
  assert.equal(list.length, 2);
  assert.equal(list[0].promedio_dias_salida, 13.5);
  assert.equal(list[0].promedio_dias_llegada, 21);
  assert.equal(list[0].promedio_dias_total, 41); // NO suma 13.5 + 21
  assert.equal(list[0].operaciones_completas, 1);
  assert.equal(list[1].promedio_dias_salida, 0); // cero dias es una media valida
  assert.equal(list[1].promedio_dias_llegada, null);
  assert.equal(list[1].promedio_dias_total, null);
});

test('filtro por defecto usa 2026 simultaneamente en ambos promedios, ruta y ETD', async () => {
  const calls = [];
  const result = await loadService(calls).analytics_cor();
  for (const field of ['salida','transito','rutas','contenedoresPeriodo','mesesPeriodo']) {
    assert.deepEqual(calls.find(x => x[0] === field), [field, 2026]);
  }
  assert.equal(result.promedios.periodo, 2026);
  assert.deepEqual(Array.from(result.promedios.anios_disponibles), [2026, 2025, 2024]);
  assert.deepEqual(Array.from(result.promedios.anios_con_salida_real), [2026]);
  assert.equal(result.tablas.promedios_por_ruta[0].promedio_dias_total, 41);
  assert.equal(result.contenedores_periodo.anio, 2026);
  assert.equal(result.contenedores_periodo.total, 16);
  assert.equal(result.contenedores_periodo.meses.length, 12);
  assert.equal(result.contenedores_periodo.meses[0].contenedores_20_dc, 1);
  assert.equal(result.contenedores.anio, 2026); // contrato legacy existente
  assert.equal(result.contenedores.total, 5);
  assert.equal(result.tablas.salida_por_puerto[0].puerto, 'Shanghai');
  assert.equal(result.tablas.llegada_por_modo_puerto[0].puerto_destino, 'Manzanillo');
});

test('2025 consulta promedios y contenedores del mismo periodo sin tocar legacy', async () => {
  const calls = [];
  const result = await loadService(calls).analytics_cor('2025');
  for (const field of ['salida','transito','rutas','contenedoresPeriodo','mesesPeriodo']) {
    assert.deepEqual(calls.find(x => x[0] === field), [field, 2025]);
  }
  assert.equal(result.contenedores_periodo.periodo, 2025);
  assert.equal(result.contenedores_periodo.criterio_anio, 'fecha_salida_estimada (ETD)');
  assert.equal(result.contenedores.anio, 2026); // UI existente permanece estable hasta F3
  assert.deepEqual(calls.find(x => x[0] === 'legacyContenedores'), ['legacyContenedores', 2026]);
});

test('all consulta ambas rutas y contenedores sin filtros anuales y describe mensual consolidado', async () => {
  const calls = [];
  const result = await loadService(calls).analytics_cor('all');
  for (const field of ['salida','transito','rutas','contenedoresPeriodo','mesesPeriodo']) {
    assert.deepEqual(calls.find(x => x[0] === field), [field, null]);
  }
  assert.equal(result.promedios.periodo, 'all');
  assert.equal(result.contenedores_periodo.periodo, 'all');
  assert.equal(result.contenedores_periodo.etiqueta, 'Todos los años (ETD)');
  assert.match(result.reglas_calculo.contenedores_periodo, /consolida los meses/);
});

test('ano o filtro invalido falla cerrado con status 400 antes de tocar BD', async () => {
  const calls = [];
  const service = loadService(calls);
  for (const value of ['2025 OR 1=1','1899','2201','20.5','2025; DROP TABLE log_ops']) {
    await assert.rejects(service.analytics_cor(value), e => e.status === 400);
  }
  assert.equal(calls.length, 0);
});

test('no se altera el esquema ni los permisos: controller y routes fuera del FIX', () => {
  assert.equal(typeof loadService().analytics_cor, 'function');
  assert.doesNotMatch(serviceText, /\b(?:INSERT|UPDATE|DELETE|CREATE TABLE|ALTER TABLE)\b/i);
  assert.match(serviceText, /promedios_por_ruta/);
  assert.match(serviceText, /contenedores_periodo/);
});

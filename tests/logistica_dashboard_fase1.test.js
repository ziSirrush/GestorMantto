'use strict';

const test = require('node:test');
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

const service = require('../backend/src/modules/logistica-dashboard/logistica-dashboard.service');

test('agrupa los estatus del dashboard sin depender de acentos', () => {
  const data = service.buildStatusCharts_cor([
    { estatus: 'EN PRODUCCION', total: 12 },
    { estatus: 'EN TRANSITO', total: 8 },
    { estatus: 'SIN PRODUCCIÓN / Documentación Pendiente', total: 4 },
    { estatus: 'PROGRAMADO', total: 2 }
  ]);

  assert.equal(data.produccion.find(row => row.etiqueta === 'En Producción').total, 12);
  assert.equal(data.logistica.find(row => row.etiqueta === 'En Tránsito').total, 8);
  assert.equal(data.sin_produccion[0].total, 4);
  assert.equal(data.produccion.find(row => row.etiqueta === 'Programado').total, 2);
});

test('entregados se ordenan del año mas antiguo al mas reciente', () => {
  const rows = service.normalizeDeliveredYears_cor([
    { anio: '2026', total: '5' },
    { anio: '2023', total: '2' },
    { anio: '2025', total: '4' }
  ]);
  assert.deepEqual(rows, [
    { anio: 2023, total: 2 },
    { anio: 2025, total: 4 },
    { anio: 2026, total: 5 }
  ]);
});

test('ring de contenedores conserva conteo fisico 20 DC vs 40 HQ', () => {
  const value = service.normalizeContainers_cor({
    contenedores_20_dc: 25,
    contenedores_40_hq: 75,
    operaciones_con_dato: 18
  }, 2026);

  assert.equal(value.total, 100);
  assert.equal(value.porcentaje_20_dc, 25);
  assert.equal(value.porcentaje_40_hq, 75);
  assert.equal(value.criterio_anio, 'fecha_salida_estimada (ETD)');
});

test('la migracion reutiliza log_ops y no crea una tabla nueva', () => {
  const sql = fs.readFileSync(
    path.join(__dirname, '../sql/20260923_FASE_1_DASHBOARD_LOGISTICA_ANALITICA_V001.sql'),
    'utf8'
  );
  assert.match(sql, /ALTER TABLE log_ops/i);
  assert.match(sql, /contenedores_20_dc/i);
  assert.match(sql, /contenedores_40_hq/i);
  assert.doesNotMatch(sql, /CREATE\s+TABLE/i);
});

test('el backend de sync acepta los dos campos canonicos y los encabezados de origen', () => {
  const controller = fs.readFileSync(
    path.join(__dirname, '../backend/src/controllers/logistica.controller.js'),
    'utf8'
  );
  assert.match(controller, /'contenedores_20_dc'/);
  assert.match(controller, /'contenedores_40_hq'/);
  assert.match(controller, /row\["20' DC"\]/);
  assert.match(controller, /row\["40' HQ"\]/);
});

test('el endpoint analitico usa Guard General y falla cerrado para alcance parcial', () => {
  const routes = fs.readFileSync(
    path.join(__dirname, '../backend/src/modules/logistica-dashboard/logistica-dashboard.routes.js'),
    'utf8'
  );
  assert.match(routes, /humanInformationGuard_gnral/);
  assert.match(routes, /LOGISTICA_DASHBOARD_PIPELINE_POR_ESTATUS_ETAPAS\.VER/);
  assert.match(routes, /groupingCodesAny:\s*\['LOGISTICA'\]/);
  assert.match(routes, /requireCompleteInformationDomain_gnral\('CORELLIAN'\)/);
});

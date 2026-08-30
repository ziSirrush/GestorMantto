'use strict';

const assert = require('assert');
const Module = require('module');
const path = require('path');

const due = {
  year: 2026,
  month: 8,
  day: 30,
  date: '2026-08-30',
  anio_iso: 2026,
  semana_iso: 35
};
let invocation = null;
let weeklyApiMode = false;

const dbMock = {
  async query(sql) {
    if (!weeklyApiMode) return [[], []];
    const compact = String(sql).replace(/\s+/g, ' ').trim();
    if (compact.includes('FROM portafolio_cortes_semanales')) {
      return [[{
        id_corte: 42,
        anio_iso: 2026,
        semana_iso: 35,
        total_portafolio: 1,
        total_movimientos: 1,
        total_salidas: 0,
        total_regresos: 0,
        total_cambios: 0,
        total_ingresos: 1,
        estado: 'CERRADO',
        snapshot_json: JSON.stringify([{ equipo: 'EQ-NUEVO', zona_id: 4 }]),
        movimientos_json: JSON.stringify([{
          tipo: 'NUEVO_INGRESO', equipo: 'EQ-NUEVO', zona_id: 4,
          estatus_anterior: '', estatus_actual: 'En servicio'
        }])
      }], []];
    }
    if (compact.includes('FROM portafolio p')) {
      return [[{ numero_equipo: 'EQ-NUEVO', zona_id: 4, zona_oficial: 'Centro' }], []];
    }
    if (compact.includes('FROM z_op')) {
      return [[{ id_zona: 4, zona: 'Centro' }], []];
    }
    throw new Error(`Consulta semanal no contemplada: ${compact}`);
  }
};

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === '../../config/db') return dbMock;
  if (request === '../../jobs/portafolioCierreSemanal.job') {
    return {
      latestDueSunday() { return due; },
      async runWeeklyClose(date, generatedBy, target) {
        invocation = { date, generatedBy, target };
        return {
          ok: true,
          anio_iso: 2026,
          semana_iso: 35,
          total_portafolio: 2687,
          total: 0,
          salidas: 0,
          regresos: 0,
          cambios: 0
        };
      }
    };
  }
  if (request === '../../services/information-record-scope-gnral.service') {
    return {
      hasUnrestrictedUnitedScope_gnral: () => true,
      buildPortafolioScopeSql_gnral: () => ({ sql: '1 = 1', params: [] }),
      zoneIds_gnral: () => []
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const modulePath = path.resolve(
  __dirname,
  '../backend/src/modules/portafolio/portafolio-movimientos_uni.js'
);
const movimientos = require(modulePath);
Module._load = originalLoad;

(async () => {
  let statusCode = 200;
  let body = null;
  const res = {
    status(code) { statusCode = code; return this; },
    json(payload) { body = payload; return payload; }
  };

  await movimientos.ejecutarCorteSemanalManual_uni({
    actorUser: { id_SB: 77, rol: 'Programador' },
    user: { id_SB: 88 }
  }, res);

  assert.strictEqual(statusCode, 200);
  assert.strictEqual(body.ok, true);
  assert.strictEqual(body.created, true);
  assert.strictEqual(body.corte.semana_iso, 35);
  assert(invocation?.date instanceof Date);
  assert.strictEqual(invocation.generatedBy, 77, 'Debe auditar al actor real que ejecutó el corte.');
  assert.strictEqual(invocation.target, due, 'El corte manual debe usar el último domingo exigible.');

  weeklyApiMode = true;
  statusCode = 200;
  body = null;
  await movimientos.getPortafolioMovimientosSemanales_uni({
    query: { anio: '2026', semana: '35', tipo: 'NUEVO_INGRESO' },
    user: { id_SB: 77 }
  }, res);

  assert.strictEqual(statusCode, 200);
  assert.strictEqual(body.ok, true);
  assert.strictEqual(body.corte.total_ingresos, 1);
  assert.strictEqual(body.corte.total_cambios, 0);
  assert.strictEqual(body.total_filtrado, 1);
  assert.strictEqual(body.data[0].tipo, 'NUEVO_INGRESO');

  console.log('OK - endpoint manual y consulta semanal conservan NUEVO_INGRESO');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

'use strict';

const assert = require('assert');
const Module = require('module');
const path = require('path');

let snapshotRows = [{ equipo: ' eq-consumido ' }];
let monthlySql = '';

const candidates = [
  {
    numero_equipo: 'EQ-CONSUMIDO', tipo_movimiento: 'NUEVO_INGRESO',
    estatus_anterior: '', estatus_actual: 'En servicio', zona: 'Centro',
    proyecto: 'P-001', fecha_corte: null
  },
  {
    numero_equipo: 'EQ-PENDIENTE', tipo_movimiento: 'NUEVO_INGRESO',
    estatus_anterior: '', estatus_actual: 'En servicio', zona: 'Centro',
    proyecto: 'P-002', fecha_corte: null
  },
  {
    numero_equipo: 'EQ-DEGRADADO', tipo_movimiento: 'DEGRADADO',
    estatus_anterior: 'En servicio', estatus_actual: 'No en servicio', zona: 'Centro',
    proyecto: 'P-003', fecha_corte: '2026-08-01'
  }
];

const dbMock = {
  async query(sql) {
    const compact = String(sql).replace(/\s+/g, ' ').trim();
    if (compact.includes('FROM z_op')) {
      return [[{ id_zona: 4, zona: 'Centro' }], []];
    }
    if (compact.includes('FROM INFORMATION_SCHEMA.COLUMNS')) {
      return [[{ COLUMN_NAME: 'estatus_ul_mes' }, { COLUMN_NAME: 'estatus_ul_mes_fecha' }], []];
    }
    if (compact.includes('AS tipo_movimiento') && compact.includes('FROM portafolio p')) {
      monthlySql = compact;
      return [candidates, []];
    }
    if (compact.startsWith('SELECT id_corte FROM portafolio_cortes_semanales')) {
      return [[{ id_corte: 42 }], []];
    }
    if (compact.startsWith('SELECT snapshot_json FROM portafolio_cortes_semanales')) {
      return [[{ snapshot_json: JSON.stringify(snapshotRows) }], []];
    }
    throw new Error(`Consulta mensual no contemplada: ${compact}`);
  }
};

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === '../../config/db') return dbMock;
  if (request === '../../jobs/portafolioCierreSemanal.job') {
    return { latestDueSunday() {}, async runWeeklyClose() {} };
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

async function requestMonthly() {
  let statusCode = 200;
  let body = null;
  const res = {
    status(code) { statusCode = code; return this; },
    json(payload) { body = payload; return payload; }
  };
  await movimientos.getPortafolioMovimientosInicial_uni({ query: {}, user: { id_SB: 77 } }, res);
  assert.strictEqual(statusCode, 200);
  assert.strictEqual(body.ok, true);
  return body;
}

(async () => {
  const beforeCut = await requestMonthly();
  assert(monthlySql.includes("THEN 'NUEVO_INGRESO'"));
  assert.strictEqual(beforeCut.kpis.total, 2);
  assert.strictEqual(beforeCut.kpis.ingresos, 1);
  assert.strictEqual(beforeCut.kpis.degradados, 1);
  assert.deepStrictEqual(
    beforeCut.data.map(row => row.numero_equipo).sort(),
    ['EQ-DEGRADADO', 'EQ-PENDIENTE']
  );

  snapshotRows = [{ equipo: 'EQ-CONSUMIDO' }, { equipo: ' eq-pendiente ' }];
  const afterCut = await requestMonthly();
  assert.strictEqual(afterCut.kpis.total, 1);
  assert.strictEqual(afterCut.kpis.ingresos, 0);
  assert.strictEqual(afterCut.data[0].numero_equipo, 'EQ-DEGRADADO');

  console.log('OK - mensual muestra el ingreso pendiente y lo resetea con el snapshot semanal');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

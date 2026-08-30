'use strict';

const assert = require('assert');
const Module = require('module');
const path = require('path');

const previousSnapshot = [{
  equipo: 'EQ-001',
  estatus: 'En servicio',
  proyecto_codigo: 'P-001',
  proyecto: 'Proyecto uno',
  zona_id: 4,
  zona: 'Centro',
  zona_legacy: 'Centro',
  supervisor: 'Supervisor'
}];

const currentRows = [{
  numero_equipo: 'EQ-001',
  estatus: 'En servicio',
  proyecto_codigo: 'P-001',
  proyecto: 'Proyecto uno',
  zona_id: 4,
  zona: 'Centro',
  zona_legacy: 'Centro',
  supervisor: 'Supervisor',
  estatus_ul_mes: 'En servicio'
}];

const calls = [];
const inserts = [];
const dbMock = {
  async query(sql, params = []) {
    const compact = String(sql).replace(/\s+/g, ' ').trim();
    calls.push({ sql: compact, params });

    if (compact.startsWith('SELECT id_corte, estado')) return [[], []];
    if (compact.includes('FROM portafolio p')) return [currentRows, []];
    if (compact.includes('FORCE INDEX (uq_portafolio_semana)')) {
      assert(!compact.includes('snapshot_json'), 'La consulta ordenada no debe cargar el JSON del snapshot.');
      return [[{ id_corte: 41, anio_iso: 2026, semana_iso: 34 }], []];
    }
    if (compact.startsWith('SELECT snapshot_json')) {
      assert.deepStrictEqual(params, [41]);
      return [[{ snapshot_json: JSON.stringify(previousSnapshot) }], []];
    }
    if (compact.startsWith('INSERT INTO portafolio_cortes_semanales')) {
      inserts.push(params);
      return [{ affectedRows: 1, insertId: 42 }, []];
    }

    throw new Error(`Consulta no contemplada por la prueba: ${compact}`);
  }
};

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === '../config/db') return dbMock;
  return originalLoad.call(this, request, parent, isMain);
};

const jobPath = path.resolve(__dirname, '../backend/src/jobs/portafolioCierreSemanal.job.js');
const job = require(jobPath);
Module._load = originalLoad;

(async () => {
  const result = await job.runWeeklyClose(
    new Date('2026-08-30T18:05:00.000Z'),
    77,
    { year: 2026, month: 8, day: 30, date: '2026-08-30' }
  );

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.anio_iso, 2026);
  assert.strictEqual(result.semana_iso, 35);
  assert.strictEqual(result.total_portafolio, 1);
  assert.strictEqual(result.total, 0, 'Una semana sin cambios debe guardar cero movimientos.');
  const firstInsert = inserts[0];
  assert(firstInsert, 'El corte semanal debe persistirse aunque no existan movimientos.');
  assert.strictEqual(firstInsert[7], 0, 'total_movimientos debe persistirse en cero.');
  assert.strictEqual(firstInsert[8], 0, 'total_salidas debe persistirse en cero.');
  assert.strictEqual(firstInsert[9], 0, 'total_regresos debe persistirse en cero.');
  assert.strictEqual(firstInsert[10], 0, 'total_cambios debe persistirse en cero.');
  assert.strictEqual(firstInsert[11], 0, 'total_ingresos debe persistirse en cero.');
  assert.strictEqual(firstInsert[13], '[]', 'movimientos_json debe persistirse como arreglo vacío.');
  assert.strictEqual(firstInsert[16], 77, 'El disparo manual debe conservar el usuario generador.');
  assert(calls.some(call => call.sql.startsWith('SELECT snapshot_json')),
    'El snapshot anterior debe recuperarse por id en una segunda consulta.');

  // La identidad se compara normalizada y solo el registro ausente, sin corte
  // mensual y actualmente en servicio se clasifica como nuevo ingreso.
  currentRows[0].numero_equipo = ' eq-001 ';
  currentRows.push(
    {
      numero_equipo: 'EQ-NUEVO', estatus: 'En servicio', estatus_ul_mes: '',
      proyecto_codigo: 'P-002', proyecto: 'Proyecto dos', zona_id: 4,
      zona: 'Centro', zona_legacy: 'Centro', supervisor: 'Supervisor'
    },
    {
      numero_equipo: 'EQ-CON-CORTE', estatus: 'En servicio', estatus_ul_mes: 'No en servicio',
      proyecto_codigo: 'P-003', proyecto: 'Proyecto tres', zona_id: 4,
      zona: 'Centro', zona_legacy: 'Centro', supervisor: 'Supervisor'
    },
    {
      numero_equipo: 'EQ-NO-SERVICIO', estatus: 'No en servicio', estatus_ul_mes: '',
      proyecto_codigo: 'P-004', proyecto: 'Proyecto cuatro', zona_id: 4,
      zona: 'Centro', zona_legacy: 'Centro', supervisor: 'Supervisor'
    }
  );

  const ingresoResult = await job.runWeeklyClose(
    new Date('2026-09-06T18:05:00.000Z'),
    null,
    { year: 2026, month: 9, day: 6, date: '2026-09-06' }
  );
  const ingresoInsert = inserts[1];
  const ingresoMovements = JSON.parse(ingresoInsert[13]);

  assert.strictEqual(ingresoResult.total_portafolio, 4);
  assert.strictEqual(ingresoResult.total, 1);
  assert.strictEqual(ingresoResult.ingresos, 1);
  assert.strictEqual(ingresoResult.cambios, 0);
  assert.strictEqual(ingresoInsert[11], 1, 'El contador separado debe persistir el nuevo ingreso.');
  assert.strictEqual(ingresoMovements.length, 1);
  assert.strictEqual(ingresoMovements[0].tipo, 'NUEVO_INGRESO');
  assert.strictEqual(ingresoMovements[0].equipo, 'EQ-NUEVO');

  previousSnapshot.splice(0, previousSnapshot.length, ...currentRows.map(row => ({
    equipo: row.numero_equipo,
    estatus: row.estatus,
    estatus_ul_mes: row.estatus_ul_mes,
    proyecto_codigo: row.proyecto_codigo,
    proyecto: row.proyecto,
    zona_id: row.zona_id,
    zona: row.zona,
    zona_legacy: row.zona_legacy,
    supervisor: row.supervisor
  })));

  const resetResult = await job.runWeeklyClose(
    new Date('2026-09-13T18:05:00.000Z'),
    null,
    { year: 2026, month: 9, day: 13, date: '2026-09-13' }
  );
  const resetInsert = inserts[2];

  assert.strictEqual(resetResult.total, 0, 'El ingreso no debe repetirse en el siguiente snapshot semanal.');
  assert.strictEqual(resetResult.ingresos, 0);
  assert.strictEqual(resetInsert[11], 0);
  assert.strictEqual(resetInsert[13], '[]');

  console.log('OK - corte semanal persiste ceros y clasifica nuevos ingresos por snapshot');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

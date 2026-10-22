'use strict';

// Pruebas aisladas: simula respuestas MySQL; no requiere acceso a Aiven.
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const validatorModule = require('../backend/src/services/cobranza-uni/fk-validator.service');

test('intervalos invalidos o fuera del rango de Node nunca programan un tick de 1 ms', () => {
  const inspect = (overrides) => JSON.parse(execFileSync(process.execPath, [
    '-e',
    "const job = require('./backend/src/jobs/cobranzaUniFkValidator.job'); process.stdout.write(JSON.stringify({ first: job.FIRST_RUN_DELAY_MS, tick: job.TICK_INTERVAL_MS }));"
  ], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, ...overrides },
    encoding: 'utf8'
  }));

  assert.deepEqual(inspect({
    COBRANZA_UNI_FK_FIRST_RUN_DELAY_MS: 'invalid',
    COBRANZA_UNI_FK_TICK_INTERVAL_MS: 'Infinity'
  }), { first: 60000, tick: 900000 });
  assert.deepEqual(inspect({
    COBRANZA_UNI_FK_FIRST_RUN_DELAY_MS: '99999999999999',
    COBRANZA_UNI_FK_TICK_INTERVAL_MS: '99999999999999'
  }), { first: 2147483647, tick: 2147483647 });
});

function createHarness({ pendientes = 0, lock = 1, safeUpdates = 1, schemaOk = true, failUpdate = false, sinId = 0 } = {}) {
  const calls = [];
  const logs = [];
  const connection = {
    released: false,
    began: 0,
    committed: 0,
    rolledBack: 0,
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (/SELECT GET_LOCK\(/.test(sql)) return [[{ adquirido: lock }]];
      if (/INFORMATION_SCHEMA\.COLUMNS/.test(sql)) return [schemaOk ? [{ DATA_TYPE: 'bigint', COLUMN_TYPE: 'bigint unsigned' }] : [{ DATA_TYPE: 'tinyint', COLUMN_TYPE: 'tinyint(1)' }]];
      if (/SELECT @@SESSION.SQL_SAFE_UPDATES/.test(sql)) return [[{ valor: safeUpdates }]];
      if (/SELECT COUNT\(\*\) AS pendientes/.test(sql)) return [[{ pendientes }]];
      if (/registros_revisados/.test(sql)) return [[{
        registros_revisados: 10, sin_id: sinId, id_sin_catalogo: 0, nombre_distinto: 0
      }]];
      if (/AS id_registro/.test(sql)) return [[{ id_registro: 53, id_anterior: 625, id_nuevo: 80 }]];
      if (/^UPDATE\s+(gestion_credito|detalle_mp_2026|pc)/.test(sql)) {
        if (failUpdate) throw new Error('error SQL simulado');
        return [{ affectedRows: pendientes }];
      }
      if (/RELEASE_LOCK\(/.test(sql)) return [[{ liberado: 1 }]];
      return [[]];
    },
    async beginTransaction() { calls.push({ sql: 'BEGIN', params: [] }); this.began++; },
    async commit() { calls.push({ sql: 'COMMIT', params: [] }); this.committed++; },
    async rollback() { calls.push({ sql: 'ROLLBACK', params: [] }); this.rolledBack++; },
    release() { this.released = true; }
  };
  const logger = {
    info: (...a) => logs.push(['info', ...a]),
    warn: (...a) => logs.push(['warn', ...a]),
    error: (...a) => logs.push(['error', ...a])
  };
  return {
    calls,
    logs,
    connection,
    service: validatorModule.crearValidadorUni({ obtenerConexion: async () => connection, logger })
  };
}

test('identifica y corrige un FK desplazado; solo cambia la FK y deja auditoria', async () => {
  const h = createHarness({ pendientes: 2 });
  const report = await h.service.reconciliar({ tabla: 'detalle_mp_2026', ids: ['53', '54'], origen: 'post_sync' });
  assert.equal(report.detectados, 2);
  assert.equal(report.corregidos, 2);
  assert.equal(report.muestra[0].id_anterior, 625);
  assert.equal(h.connection.began, 1);
  assert.equal(h.connection.committed, 1);
  assert.equal(h.connection.rolledBack, 0);
  assert.equal(h.connection.released, true);
  const update = h.calls.find(x => /^UPDATE\s+detalle_mp_2026/.test(x.sql));
  assert.ok(update);
  assert.match(update.sql, /SET src\.id_proyecto_cobranza = pm\.cobranza/);
  assert.match(update.sql, /src\.id_dmp IN \(\?, \?\)/);
  assert.match(update.sql, /utf8mb4_0900_as_ci/);
  assert.match(update.sql, /utf8mb4_0900_bin/);
  assert.match(update.sql, /HAVING COUNT\(\*\) = 1/);
  assert.deepEqual(update.params, ['53', '54']);
  assert.ok(!/SET\s+src\.(proyecto|adeudo|pendiente|monto_anual|venta_total)\b/.test(update.sql));
  assert.ok(h.calls.some(x => /RELEASE_LOCK/.test(x.sql)));
  assert.ok(h.calls.some(x => /SET SESSION SQL_SAFE_UPDATES = 1/.test(x.sql)));
  assert.ok(h.logs.some(l => l[0] === 'info' && /Reconciliacion/.test(l[1])));
});

test('evita el COUNT previo y usa affectedRows como autoridad de correccion', async () => {
  const h = createHarness({ pendientes: 0, safeUpdates: 0 });
  const report = await h.service.reconciliar({ tabla: 'gestion_credito' });
  assert.equal(report.corregidos, 0);
  assert.equal(h.calls.filter(x => /SELECT COUNT\(\*\) AS pendientes/.test(x.sql)).length, 0);
  assert.equal(h.calls.filter(x => /^UPDATE\s+gestion_credito/.test(x.sql)).length, 1);
  assert.equal(h.connection.committed, 1);
});



test('ciclo programado puede omitir auditoria residual y muestra para evitar barridos duplicados', async () => {
  const h = createHarness({ pendientes: 2, safeUpdates: 0 });
  const report = await h.service.reconciliar({
    tabla: 'detalle_mp_2026',
    origen: 'programado',
    auditarResiduales: false,
    capturarMuestra: false
  });
  assert.equal(report.corregidos, 2);
  assert.equal(report.pendientes, null);
  assert.equal(report.auditoria_residual, 'omitida');
  assert.equal(h.calls.filter(x => /registros_revisados/.test(x.sql)).length, 0);
  assert.equal(h.calls.filter(x => /AS id_registro/.test(x.sql)).length, 0);
  assert.equal(h.calls.filter(x => /SELECT COUNT\(\*\) AS pendientes/.test(x.sql)).length, 0);
});

test('cachea la validacion INFORMATION_SCHEMA del puente durante una hora por proceso', async () => {
  let now = 1000;
  const h = createHarness({ pendientes: 0, safeUpdates: 0 });
  const service = validatorModule.crearValidadorUni({
    obtenerConexion: async () => h.connection,
    logger: { info(){}, warn(){}, error(){} },
    now: () => now,
    bridgeSchemaCacheTtlMs: 3600000
  });
  await service.reconciliar({ tabla: 'gestion_credito', ids: ['1'], auditarResiduales: false, capturarMuestra: false });
  now += 1000;
  await service.reconciliar({ tabla: 'gestion_credito', ids: ['2'], auditarResiduales: false, capturarMuestra: false });
  assert.equal(h.calls.filter(x => /INFORMATION_SCHEMA\.COLUMNS/.test(x.sql)).length, 1);
});

test('evita ejecuciones superpuestas entre instancias', async () => {
  const h = createHarness({ pendientes: 2, lock: 0 });
  const report = await h.service.reconciliar({ tabla: 'pc' });
  assert.equal(report.omitido, 'ocupado');
  assert.equal(h.connection.began, 0);
  assert.equal(h.connection.released, true);
});

test('bloquea escrituras si la columna cobranza no es BIGINT UNSIGNED', async () => {
  const h = createHarness({ schemaOk: false });
  await assert.rejects(h.service.reconciliar({ tabla: 'pc' }), /BIGINT UNSIGNED/);
  assert.equal(h.connection.began, 0);
  assert.ok(!h.calls.some(x => /^UPDATE/.test(x.sql)));
  assert.ok(h.calls.some(x => /RELEASE_LOCK/.test(x.sql)));
});

test('hace rollback de un intento que falla y restaura el modo de sesion', async () => {
  const h = createHarness({ pendientes: 2, failUpdate: true });
  await assert.rejects(h.service.reconciliar({ tabla: 'pc' }), /error SQL simulado/);
  assert.equal(h.connection.rolledBack, 1);
  assert.equal(h.connection.committed, 0);
  assert.ok(h.calls.some(x => /SET SESSION SQL_SAFE_UPDATES = 1/.test(x.sql)));
  assert.ok(h.calls.some(x => /RELEASE_LOCK/.test(x.sql)));
});

test('rechaza tablas no autorizadas y IDs no validos sin consultas', async () => {
  const h = createHarness({ pendientes: 1 });
  await assert.rejects(h.service.reconciliar({ tabla: 'portafolio' }), /fuera de la lista/);
  const result = await h.service.reconciliar({ tabla: 'pc', ids: [null, '-1', '0', '1 OR 1=1'] });
  assert.equal(result.omitido, 'sin_ids_validos');
  assert.equal(h.calls.length, 0);
});

test('post-sync no analiza filas rechazadas y no altera una conexion prestada', async () => {
  const h = createHarness({ pendientes: 1 });
  const report = await h.service.validarDespuesSync({
    tabla: 'pc',
    rows: [{ id_pc: '10' }, { id_pc: '20' }, { id_pc: '30' }],
    summary: { errors: [{ index: 1 }] },
    connection: h.connection
  });
  assert.equal(report.corregidos, 1);
  assert.equal(h.connection.released, false);
  const find = h.calls.find(x => /^UPDATE\s+pc/.test(x.sql));
  assert.deepEqual(find.params, ['10', '30']);
});

test('post-sync no transforma un COMMIT previo exitoso en fallo si la validacion da error', async () => {
  const h = createHarness({ pendientes: 1, failUpdate: true });
  const response = await h.service.validarDespuesSync({
    tabla: 'gestion_credito', rows: [{ id_gc: '5' }], summary: { errors: [] }, connection: h.connection
  });
  assert.equal(response.omitido, 'error');
  assert.equal(h.connection.rolledBack, 1);
  assert.equal(h.connection.released, false);
});

test('acepta IDs enteros grandes mediante cadenas sin perdida de precision', async () => {
  const h = createHarness({ pendientes: 0 });
  await h.service.reconciliar({ tabla: 'gestion_credito', ids: ['00053', '9007199254740993'] });
  const update = h.calls.find(x => /^UPDATE\s+gestion_credito/.test(x.sql));
  assert.deepEqual(update.params, ['53', '9007199254740993']);
});


test('reporta IDs sin asignar que no puede resolver sin inventar el proyecto', async () => {
  const h = createHarness({ pendientes: 0, sinId: 3 });
  const report = await h.service.reconciliar({ tabla: 'pc', origen: 'programado' });
  assert.equal(report.corregidos, 0);
  assert.equal(report.pendientes.sin_id, 3);
  assert.ok(h.logs.some(l => l[0] === 'warn' && /excepciones/.test(l[1])));
});

test('el job periodico aisla un fallo de MP y continua con GC y PC', async () => {
  const job = require('../backend/src/jobs/cobranzaUniFkValidator.job');
  const original = validatorModule.reconciliar;
  const used = [];
  try {
    validatorModule.reconciliar = async ({ tabla }) => {
      used.push(tabla);
      if (tabla === 'detalle_mp_2026') throw new Error('simulado MP');
      return { tabla, corregidos: 0 };
    };
    const report = await job.runCobranzaUniFkValidatorJob();
    assert.deepEqual(used, ['gestion_credito', 'detalle_mp_2026', 'pc']);
    assert.equal(report.resultados.length, 3);
    assert.equal(report.resultados[1].error, 'simulado MP');
  } finally {
    validatorModule.reconciliar = original;
  }
});


test('tick automatico rota una sola tabla y no dispara las tres juntas', async () => {
  const job = require('../backend/src/jobs/cobranzaUniFkValidator.job');
  const original = validatorModule.reconciliar;
  const used = [];
  try {
    job.stopCobranzaUniFkValidatorJob();
    validatorModule.reconciliar = async (options) => {
      used.push(options);
      return { tabla: options.tabla, corregidos: 0 };
    };
    const first = await job.runCobranzaUniFkValidatorTick(1000);
    const second = await job.runCobranzaUniFkValidatorTick(1000);
    const third = await job.runCobranzaUniFkValidatorTick(1000);
    assert.deepEqual(used.map(item => item.tabla), ['gestion_credito', 'detalle_mp_2026', 'pc']);
    assert.ok(used.every(item => item.capturarMuestra === false));
    assert.equal(first.tabla, 'gestion_credito');
    assert.equal(second.tabla, 'detalle_mp_2026');
    assert.equal(third.tabla, 'pc');
  } finally {
    validatorModule.reconciliar = original;
    job.stopCobranzaUniFkValidatorJob();
  }
});

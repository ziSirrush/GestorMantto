'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const Module = require('node:module');

// El ZIP de fase contiene solo archivos modificados, por norma del Gestor.
// Para poder ejecutar este test aislado sin copiar backend/src/config/db.js,
// se sustituye unicamente esa dependencia durante el require inicial.
const originalLoad = Module._load;
Module._load = function phase3TestLoad(request, parent, isMain) {
  if (
    request === '../../config/db' &&
    parent &&
    /cobranza-cor-pagos\.repository\.js$/.test(parent.filename)
  ) {
    return {
      getConnection() {
        throw new Error('DB real no disponible en prueba unitaria aislada.');
      }
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const repository = require('../backend/src/modules/cobranza-cor/cobranza-cor-pagos.repository');
const service = require('../backend/src/modules/cobranza-cor/cobranza-cor-pagos.service');
Module._load = originalLoad;

function record(overrides = {}) {
  return {
    id_pago: 101,
    no_factura: 'CFV-1001',
    cliente: 'CLIENTE DEMO',
    limite_credito: 250000.50,
    proyecto: 'P14302',
    fecha_servicio: '2026-09-30',
    estado: 'Pagado por completo',
    facturado: 100000,
    pagado: 90000,
    saldo: 10000,
    dias_retraso: 4,
    fecha_emision: '2026-09-01',
    fecha_vencimiento: '2026-09-30',
    terminos: '30 Dias',
    zona_adm: 'CENTRO',
    subsidiaria: 'Corellian S.A de C.V',
    clase: 'MANTENIMIENTO',
    creado_desde: 'OV12345',
    fecha_creacion_ov: '2026-08-30 11:22:33',
    complemento_pago: 'Pago #CP9001',
    fecha_complemento_pago: '2026-10-01',
    importe_complemento_pago: -10000,
    ...overrides
  };
}

function payload(records = [record()], overrides = {}) {
  const count = records.length;
  return {
    source: 'google_sheets_bg_pagos',
    version: 'COBRANZA_PAGOS_AIVEN_V002',
    sync_mode: 'upsert',
    key_fields: ['id_pago'],
    snapshot_id: 'a'.repeat(64),
    batch: {
      index: 1,
      total: 1,
      offset: 0,
      count,
      total_records: count,
      is_last: true
    },
    registros: records,
    ...overrides
  };
}

function expect400(fn, code) {
  assert.throws(fn, (error) => {
    assert.equal(error.statusCode, 400);
    if (code) assert.equal(error.code, code);
    return true;
  });
}

function replaceRepository(stubs) {
  const originals = {};
  for (const [name, value] of Object.entries(stubs)) {
    originals[name] = repository[name];
    repository[name] = value;
  }
  return function restore() {
    for (const [name, value] of Object.entries(originals)) {
      repository[name] = value;
    }
  };
}

test('Fase 3 conserva 21 campos de negocio y agrega id_pago como identidad tecnica', () => {
  assert.equal(service.RECORD_FIELDS_PAGOS_COR.length, 21);
  assert.equal(service.ID_FIELD_PAGOS_COR, 'id_pago');
  assert.equal(service.INPUT_FIELDS_PAGOS_COR.length, 22);
  assert.equal(service.INPUT_FIELDS_PAGOS_COR[0], 'id_pago');
  assert.equal(service.RECORD_FIELDS_PAGOS_COR.includes('id_pp'), false);
  assert.equal(repository.TABLE_PAGOS_COR, 'cobranza_pagos_cor');
});

test('normaliza id_pago positivo y los 21 campos canonicos', () => {
  const normalized = service.normalizarRegistroPago_cor(record({ id_pago: '42' }), 0);
  assert.equal(normalized.id_pago, 42);
  assert.equal(Object.keys(normalized).length, 22);
  assert.equal(normalized.no_factura, 'CFV-1001');
  assert.equal(normalized.fecha_creacion_ov, '2026-08-30 11:22:33');
  assert.equal(Object.hasOwn(normalized, 'id_pago_cor'), false);
  assert.equal(Object.hasOwn(normalized, 'id_pp'), false);
});

test('rechaza id_pago ausente, cero, negativo, decimal o fuera de entero seguro', () => {
  const missing = record();
  delete missing.id_pago;
  expect400(
    () => service.normalizarRegistroPago_cor(missing, 0),
    'COBRANZA_PAGOS_CAMPOS_INVALIDOS'
  );

  for (const invalid of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, 'ABC']) {
    expect400(
      () => service.normalizarRegistroPago_cor(record({ id_pago: invalid }), 0),
      'COBRANZA_PAGOS_ID_INVALIDO'
    );
  }
});

test('rechaza id_pago_cor e id_pp enviados desde la integracion', () => {
  expect400(
    () => service.normalizarRegistroPago_cor(record({ id_pago_cor: 9 }), 0),
    'COBRANZA_PAGOS_CAMPO_TECNICO_PROHIBIDO'
  );
  expect400(
    () => service.normalizarRegistroPago_cor(record({ id_pp: 'PP-77' }), 0),
    'COBRANZA_PAGOS_CAMPO_TECNICO_PROHIBIDO'
  );
});

test('key_fields debe ser exclusivamente id_pago', () => {
  expect400(
    () => service.validarContratoCargaPagos_cor(payload([record()], {
      key_fields: ['no_factura', 'proyecto']
    })),
    'COBRANZA_PAGOS_LLAVE_INVALIDA'
  );

  const contract = service.validarContratoCargaPagos_cor(payload());
  assert.deepEqual(contract.key_fields, ['id_pago']);
});

test('rechaza dos registros con el mismo id_pago dentro del lote', () => {
  expect400(
    () => service.validateAndNormalizeRecords_cor([
      record({ id_pago: 500, importe_complemento_pago: -100 }),
      record({ id_pago: 500, importe_complemento_pago: -0.01 })
    ]),
    'COBRANZA_PAGOS_ID_DUPLICADO_LOTE'
  );
});

test('permite misma factura y mismo complemento si tienen id_pago diferentes', () => {
  const normalized = service.validateAndNormalizeRecords_cor([
    record({ id_pago: 501, complemento_pago: 'Pago #CP13577', importe_complemento_pago: -40000 }),
    record({ id_pago: 502, complemento_pago: 'Pago #CP13577', importe_complemento_pago: -0.71 })
  ]);
  assert.equal(normalized.length, 2);
  assert.equal(normalized[0].no_factura, normalized[1].no_factura);
  assert.equal(normalized[0].complemento_pago, normalized[1].complemento_pago);
  assert.notEqual(normalized[0].id_pago, normalized[1].id_pago);
});

test('sigue validando DECIMAL, DATE y DATETIME de Fase 2', () => {
  const normalized = service.normalizarRegistroPago_cor(record({
    saldo: '123.45',
    fecha_emision: '2026-02-28T00:00:00.000Z',
    fecha_creacion_ov: '2026-02-28T09:08:07.123'
  }), 0);
  assert.equal(normalized.saldo, 123.45);
  assert.equal(normalized.fecha_emision, '2026-02-28');
  assert.equal(normalized.fecha_creacion_ov, '2026-02-28 09:08:07');

  expect400(
    () => service.normalizarRegistroPago_cor(record({ saldo: '123.456' }), 0),
    'COBRANZA_PAGOS_DECIMAL_INVALIDO'
  );
  expect400(
    () => service.normalizarRegistroPago_cor(record({ fecha_emision: '2026-02-30' }), 0),
    'COBRANZA_PAGOS_FECHA_INVALIDA'
  );
});

test('persistencia clasifica INSERT, UPDATE y UNCHANGED por id_pago y hace COMMIT', async () => {
  const calls = [];
  const connection = {
    async beginTransaction() { calls.push('begin'); },
    async commit() { calls.push('commit'); },
    async rollback() { calls.push('rollback'); },
    release() { calls.push('release'); }
  };

  const restore = replaceRepository({
    getConnection_cor: async () => connection,
    lockExistingPagosByIds_cor: async (_connection, ids) => {
      calls.push(['lock', [...ids]]);
      return new Set([202, 203]);
    },
    insertPago_cor: async (_connection, id, data) => {
      calls.push(['insert', id, data.no_factura]);
      return { affectedRows: 1 };
    },
    updatePagoIfChanged_cor: async (_connection, id, data) => {
      calls.push(['update', id, data.importe_complemento_pago]);
      return { affectedRows: id === 202 ? 1 : 0 };
    }
  });

  try {
    const response = await service.cargarPagos_cor(payload([
      record({ id_pago: 201, no_factura: 'CFV-201', importe_complemento_pago: -10 }),
      record({ id_pago: 202, no_factura: 'CFV-202', importe_complemento_pago: -20 }),
      record({ id_pago: 203, no_factura: 'CFV-203', importe_complemento_pago: -30 })
    ]));

    assert.equal(response.ok, true);
    assert.equal(response.fase, 3);
    assert.equal(response.modo, 'upsert_por_id_pago');
    assert.equal(response.identidad_upsert, 'id_pago -> id_pago_cor');
    assert.equal(response.insertados, 1);
    assert.equal(response.actualizados, 1);
    assert.equal(response.sin_cambios, 1);
    assert.equal(response.escribe_cobranza_pagos_cor, true);
    assert.equal(response.escribe_cobranza_rel_pagos, false);
    assert.equal(response.elimina_ausentes, false);
    assert.equal(calls.includes('commit'), true);
    assert.equal(calls.includes('rollback'), false);
    assert.equal(calls[calls.length - 1], 'release');
  } finally {
    restore();
  }
});

test('un fallo de persistencia revierte el lote y responde error 500 controlado', async () => {
  const calls = [];
  const connection = {
    async beginTransaction() { calls.push('begin'); },
    async commit() { calls.push('commit'); },
    async rollback() { calls.push('rollback'); },
    release() { calls.push('release'); }
  };

  const restore = replaceRepository({
    getConnection_cor: async () => connection,
    lockExistingPagosByIds_cor: async () => new Set(),
    insertPago_cor: async () => {
      const error = new Error('simulated db failure');
      error.code = 'ER_SIMULATED';
      throw error;
    }
  });

  try {
    await assert.rejects(
      service.cargarPagos_cor(payload([record({ id_pago: 901 })])),
      (error) => {
        assert.equal(error.statusCode, 500);
        assert.equal(error.code, 'COBRANZA_PAGOS_PERSISTENCIA_ERROR');
        assert.equal(error.detalles.db_code, 'ER_SIMULATED');
        return true;
      }
    );
    assert.deepEqual(calls, ['begin', 'rollback', 'release']);
  } finally {
    restore();
  }
});

test('repository inserta id_pago directamente en id_pago_cor y no toca id_pp', async () => {
  const queries = [];
  const connection = {
    async query(sql, params) {
      queries.push({ sql, params });
      return [{ affectedRows: 1 }];
    }
  };

  await repository.insertPago_cor(connection, 77, record({ id_pago: 77 }));
  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /INSERT INTO cobranza_pagos_cor \(id_pago_cor,/);
  assert.doesNotMatch(queries[0].sql, /id_pp/);
  assert.equal(queries[0].params[0], 77);
});

test('repository UPDATE solo afecta fila si algun campo canonico cambio', async () => {
  const queries = [];
  const connection = {
    async query(sql, params) {
      queries.push({ sql, params });
      return [{ affectedRows: 0 }];
    }
  };

  const data = { ...record({ id_pago: 88 }) };
  delete data.id_pago;
  await repository.updatePagoIfChanged_cor(connection, 88, data);

  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /WHERE id_pago_cor = \?/);
  assert.match(queries[0].sql, /NOT \(no_factura <=> \?\)/);
  assert.doesNotMatch(queries[0].sql, /id_pp/);
  assert.equal(queries[0].params[repository.PAGO_COLUMNS_COR.length], 88);
});

'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const service = require('../backend/src/modules/cobranza-cor/cobranza-cor-pagos.service');

const FIELDS = service.RECORD_FIELDS_PAGOS_COR;

function record(overrides = {}) {
  return {
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
    version: 'COBRANZA_PAGOS_AIVEN_V001',
    sync_mode: 'upsert',
    key_fields: ['no_factura', 'proyecto'],
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

test('Fase 2 V002 fija exactamente los 21 campos canonicos de Hoja SB', () => {
  assert.equal(FIELDS.length, 21);
  assert.deepEqual(FIELDS, [
    'no_factura', 'cliente', 'limite_credito', 'proyecto',
    'fecha_servicio', 'estado', 'facturado', 'pagado', 'saldo',
    'dias_retraso', 'fecha_emision', 'fecha_vencimiento', 'terminos',
    'zona_adm', 'subsidiaria', 'clase', 'creado_desde', 'fecha_creacion_ov',
    'complemento_pago', 'fecha_complemento_pago', 'importe_complemento_pago'
  ]);
  assert.equal(FIELDS.includes('id_pp'), false);
});

test('normaliza un registro canonico de 21 campos sin inventar campos tecnicos', () => {
  const normalized = service.normalizarRegistroPago_cor(record(), 0);
  assert.equal(Object.keys(normalized).length, 21);
  assert.equal(normalized.no_factura, 'CFV-1001');
  assert.equal(normalized.limite_credito, 250000.50);
  assert.equal(normalized.fecha_servicio, '2026-09-30');
  assert.equal(normalized.fecha_creacion_ov, '2026-08-30 11:22:33');
  assert.equal(Object.hasOwn(normalized, 'id_pp'), false);
  assert.equal(Object.hasOwn(normalized, 'id_pago_cor'), false);
  assert.equal(Object.hasOwn(normalized, 'created_at'), false);
  assert.equal(Object.hasOwn(normalized, 'updated_at'), false);
});

test('convierte vacios opcionales a null y conserva no_factura como obligatorio', () => {
  const optional = record({
    cliente: null,
    limite_credito: '',
    fecha_servicio: null,
    fecha_creacion_ov: ''
  });
  const normalized = service.normalizarRegistroPago_cor(optional, 0);
  assert.equal(normalized.cliente, null);
  assert.equal(normalized.limite_credito, null);
  assert.equal(normalized.fecha_servicio, null);
  assert.equal(normalized.fecha_creacion_ov, null);

  expect400(
    () => service.normalizarRegistroPago_cor(record({ no_factura: '   ' }), 0),
    'COBRANZA_PAGOS_CONTRATO_INVALIDO'
  );
});

test('rechaza campos faltantes, desconocidos, tecnicos y el id_pp retirado del contrato canonico', () => {
  const missing = record();
  delete missing.clase;
  expect400(
    () => service.normalizarRegistroPago_cor(missing, 0),
    'COBRANZA_PAGOS_CAMPOS_INVALIDOS'
  );

  expect400(
    () => service.normalizarRegistroPago_cor(record({ campo_inventado: 'x' }), 0),
    'COBRANZA_PAGOS_CAMPOS_INVALIDOS'
  );

  expect400(
    () => service.normalizarRegistroPago_cor(record({ id_pp: 'PP-77' }), 0),
    'COBRANZA_PAGOS_CAMPOS_INVALIDOS'
  );

  expect400(
    () => service.normalizarRegistroPago_cor(record({ id_pago_cor: 9 }), 0),
    'COBRANZA_PAGOS_CAMPO_TECNICO_PROHIBIDO'
  );
});

test('respeta longitudes reales de la tabla y no trunca texto silenciosamente', () => {
  expect400(
    () => service.normalizarRegistroPago_cor(record({ no_factura: 'X'.repeat(151) }), 0),
    'COBRANZA_PAGOS_LONGITUD_INVALIDA'
  );

  expect400(
    () => service.normalizarRegistroPago_cor(record({ clase: 'X'.repeat(151) }), 0),
    'COBRANZA_PAGOS_LONGITUD_INVALIDA'
  );
});

test('valida DECIMAL(18,2) sin redondear precision adicional silenciosamente', () => {
  const normalized = service.normalizarRegistroPago_cor(
    record({ saldo: '123.45', facturado: -10.25 }),
    0
  );
  assert.equal(normalized.saldo, 123.45);
  assert.equal(normalized.facturado, -10.25);

  expect400(
    () => service.normalizarRegistroPago_cor(record({ saldo: '123.456' }), 0),
    'COBRANZA_PAGOS_DECIMAL_INVALIDO'
  );

  expect400(
    () => service.normalizarRegistroPago_cor(record({ saldo: 123.456 }), 0),
    'COBRANZA_PAGOS_DECIMAL_ESCALA_INVALIDA'
  );
});

test('valida INT para dias_retraso incluyendo valores negativos permitidos por el esquema', () => {
  assert.equal(service.normalizarRegistroPago_cor(record({ dias_retraso: -5 }), 0).dias_retraso, -5);
  expect400(
    () => service.normalizarRegistroPago_cor(record({ dias_retraso: 1.5 }), 0),
    'COBRANZA_PAGOS_ENTERO_INVALIDO'
  );
});

test('valida fechas y datetime canonicos sin reinterpretar zonas horarias', () => {
  const normalized = service.normalizarRegistroPago_cor(record({
    fecha_emision: '2026-02-28T00:00:00.000Z',
    fecha_creacion_ov: '2026-02-28T09:08:07.123'
  }), 0);
  assert.equal(normalized.fecha_emision, '2026-02-28');
  assert.equal(normalized.fecha_creacion_ov, '2026-02-28 09:08:07');

  expect400(
    () => service.normalizarRegistroPago_cor(record({ fecha_emision: '2026-02-30' }), 0),
    'COBRANZA_PAGOS_FECHA_INVALIDA'
  );

  expect400(
    () => service.normalizarRegistroPago_cor(record({ fecha_creacion_ov: '2026-02-28T09:08:07Z' }), 0),
    'COBRANZA_PAGOS_DATETIME_INVALIDO'
  );
});

test('backend no trata no_factura + proyecto como llave unica', () => {
  const first = record({ complemento_pago: 'Pago #CP1', importe_complemento_pago: -1000 });
  const second = record({ complemento_pago: 'Pago #CP2', importe_complemento_pago: -500 });
  const normalized = service.validateAndNormalizeRecords_cor([first, second]);
  assert.equal(normalized.length, 2);
  assert.equal(normalized[0].no_factura, normalized[1].no_factura);
  assert.equal(normalized[0].proyecto, normalized[1].proyecto);
});

test('backend permite misma factura + mismo complemento cuando las filas no son identicas', () => {
  const first = record({ complemento_pago: 'Pago #CP13577', importe_complemento_pago: -40000.00 });
  const second = record({ complemento_pago: 'Pago #CP13577', importe_complemento_pago: -0.71 });
  const normalized = service.validateAndNormalizeRecords_cor([first, second]);
  assert.equal(normalized.length, 2);
  assert.equal(normalized[0].no_factura, normalized[1].no_factura);
  assert.equal(normalized[0].complemento_pago, normalized[1].complemento_pago);
  assert.notEqual(normalized[0].importe_complemento_pago, normalized[1].importe_complemento_pago);
});

test('contrato completo queda validado y normalizado pero continua fail-closed con 501', async () => {
  const contract = service.validarContratoCargaPagos_cor(payload());
  assert.equal(contract.record_count, 1);
  assert.equal(contract.records.length, 1);
  assert.equal(contract.records[0].no_factura, 'CFV-1001');

  await assert.rejects(
    service.cargarPagos_cor(payload()),
    (error) => {
      assert.equal(error.statusCode, 501);
      assert.equal(error.code, 'COBRANZA_PAGOS_PERSISTENCIA_PENDIENTE');
      assert.equal(error.detalles.fase, 2);
      assert.equal(error.detalles.normalizacion_valida, true);
      assert.equal(error.detalles.registros_normalizados, 1);
      assert.equal(error.detalles.campos_normalizados, 21);
      assert.equal(error.detalles.key_fields_usados_para_upsert, false);
      assert.equal(error.detalles.identidad_upsert, 'PENDIENTE_DEFINICION');
      assert.equal(error.detalles.escribe_cobranza_pagos_cor, false);
      assert.equal(error.detalles.escribe_cobranza_rel_pagos, false);
      return true;
    }
  );
});

'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

// Evita cargar la configuracion real de Aiven durante las pruebas locales.
const dbPath = require.resolve('../backend/src/config/db');
require.cache[dbPath] = {
  id: dbPath, filename: dbPath, loaded: true,
  exports: { getConnection() { throw new Error('La prueba no debe conectar a la base de datos.'); } }
};

const repository = require('../backend/src/modules/cobranza-cor/cobranza-cor.repository');
const pagosRepository = require('../backend/src/modules/cobranza-cor/cobranza-cor-pagos.repository');
const service = require('../backend/src/modules/cobranza-cor/cobranza-cor.service');
const controller = require('../backend/src/modules/cobranza-cor/cobranza-cor.controller');
const { requireIntegrationAuthFor } = require('../backend/src/middleware/integration-auth.middleware');

function withRepositoryStub(stubs, run, target = repository) {
  const originals = new Map();
  for (const [name, implementation] of Object.entries(stubs)) {
    originals.set(name, target[name]);
    target[name] = implementation;
  }
  return Promise.resolve().then(run).finally(() => {
    for (const [name, implementation] of originals) target[name] = implementation;
  });
}

function fakeConnection() {
  const events = [];
  return {
    events,
    async beginTransaction() { events.push('BEGIN'); },
    async commit() { events.push('COMMIT'); },
    async rollback() { events.push('ROLLBACK'); },
    async query(sql) { events.push(sql); return [[]]; },
    release() { events.push('RELEASE'); }
  };
}

const facturaBase = {
  ppns: 'P14302', porcentaje: 1, condicion: 'Llegada a puerto', moneda: 'USD',
  subtotal: 20549, iva: 3287.84, total: 23836.84, factura: 'CFV-8496',
  estatus_factura_origen: 'EN COBRANZA', tipo_concepto: 'HITO',
  origen_registro: 'LEGACY_HITO', activo: 1
};

test('Fuente M2M recibe FACTURA, ESTATUS DE FACTURA y FECHA DE PAGO sin cambiar la carga actual', async () => {
  const connection = fakeConnection();
  const records = [];
  await withRepositoryStub({
    getConnection_cor: async () => connection,
    insertRecord_cor: async (_connection, table, record) => records.push({ table, record })
  }, async () => {
    const response = await service.cargarFuente_cor({ registros: [{
      proyecto: 'Proyecto', id_proyecto_origen: 'P14302', porcentaje: 1,
      condicion: 'Llegada a puerto', moneda: 'USD', subtotal: 20549,
      iva: 3287.84, total: 23836.84, pago_total: 0,
      'FACTURA': 'CFV-8496',
      'ESTATUS DE FACTURA': 'PAGADA',
      'FECHA DE PAGO': '2026-10-01',
      FECHA_DE_VENCIMIENTO_HITO: '2026-10-10', CONDICIONES: 30,
      estimado_pago: 'Octubre', estatus_vencimiento: 'Pendiente', DIAS_DE_VENCIDO: 2
    }] });
    assert.equal(response.insertados, 1);
  });
  assert.equal(records[0].table, repository.TABLES_COR.fuente);
  assert.equal(records[0].record.condiciones_pago_dias, 30);
  assert.equal(records[0].record.fecha_vencimiento, '2026-10-10');
  assert.equal(records[0].record.dias_vencimiento, 2);
  assert.equal(records[0].record.factura, 'CFV-8496');
  assert.equal(records[0].record.estatus_factura, 'PAGADA');
  assert.equal(records[0].record.fecha_pago, '2026-10-01');
  assert.equal(connection.events.at(-1), 'RELEASE');
});

test('Crear y editar Estado de Cuenta guardan condiciones de pago y rechazan valores negativos', async () => {
  const connection = fakeConnection();
  const inserted = [];
  const updated = [];
  const access = { dominio: 'CORELLIAN', requiere_filtro_usuario: false };
  const payload = {
    ppns: 'P14302', proyecto: 'Proyecto',
    hitos: [{ porcentaje: 1, condicion: 'Llegada a puerto', moneda: 'USD', condiciones_pago_dias: 30 }]
  };
  await withRepositoryStub({
    getConnection_cor: async () => connection,
    canAccessPpns_cor: async () => true,
    lockCrearEstadoCuentaPpns_cor: async () => [{}],
    existeFuentePpns_cor: async () => false,
    listCrearEstadoCuentaProyectos_cor: async () => [{}],
    getEstadoCuentaByPpns_cor: async () => ({}),
    lockFuenteEstadoCuentaPpns_cor: async () => [{ id_fuente_cor: 11 }],
    lockEquiposEstadoCuentaPpns_cor: async () => [],
    insertRecord_cor: async (_connection, table, record) => inserted.push({ table, record }),
    updateFuenteEstadoCuenta_cor: async (_connection, id, ppns, record) => updated.push({ id, ppns, record })
  }, async () => {
    const created = await service.crearEstadoCuenta_cor(payload, access, 1);
    assert.equal(created.hitos_creados, 1);
    const edited = await service.actualizarEstadoCuenta_cor('P14302', {
      ...payload, hitos: [{ ...payload.hitos[0], id_fuente_cor: 11, condiciones_pago_dias: 0 }]
    }, access, 1);
    assert.equal(edited.hitos_actualizados, 1);
    await assert.rejects(service.crearEstadoCuenta_cor({
      ...payload, hitos: [{ ...payload.hitos[0], condiciones_pago_dias: -1 }]
    }, access, 1), /mayor o igual a 0/);
  });
  assert.equal(inserted[0].table, repository.TABLES_COR.fuente);
  assert.equal(inserted[0].record.condiciones_pago_dias, 30);
  assert.equal(updated[0].record.condiciones_pago_dias, 0);
});

test('Factura M2M vincula por Hito, conserva duplicados y rechaza solo faltantes o ambiguos', async () => {
  const connection = fakeConnection();
  const inserted = [];
  const hits = {
    'Llegada a puerto': [{ id_fuente_cor: 11, moneda: 'USD', subtotal: '20549.00', iva: '3287.84', total: '23836.84' }],
    'Segunda etapa': [{ id_fuente_cor: 12, moneda: 'USD', subtotal: '20549.00', iva: '3287.84', total: '23836.84' }],
    Ambiguo: [{ id_fuente_cor: 13 }, { id_fuente_cor: 14 }]
  };
  await withRepositoryStub({
    getConnection_cor: async () => connection,
    findHitosFacturaCarga_cor: async (_connection, record) => hits[record.condicion] || [],
    findFacturaDuplicada_cor: async () => assert.fail('M2M no debe buscar duplicados.'),
    insertRecord_cor: async (_connection, table, record) => {
      assert.equal(table, repository.TABLES_COR.facturas);
      inserted.push(record);
    }
  }, async () => {
    const response = await service.cargarFacturas_cor({ registros: [
      facturaBase,
      { ...facturaBase, factura: 'CFV-OTRA', estatus_factura_origen: 'PAGADO' },
      { ...facturaBase, condicion: 'No existe' },
      { ...facturaBase, condicion: 'Ambiguo' },
      facturaBase,
      { ...facturaBase, condicion: 'Segunda etapa' }
    ] });
    assert.equal(response.total_recibidos, 6);
    assert.equal(response.insertados, 4);
    assert.equal(response.rechazados, 2);
    assert.equal(response.vinculados_hito, 4);
    assert.equal(response.sin_vinculo_hito, 1);
    assert.equal(response.vinculo_hito_ambiguo, 1);
    assert.equal(response.bloques_procesados, 1);
    assert.equal(response.tamano_bloque, 300);
    assert.deepEqual(response.errores.map((item) => item.code), [
      'COBRANZA_FACTURA_HITO_NO_ENCONTRADO',
      'COBRANZA_FACTURA_HITO_AMBIGUO'
    ]);
    assert.deepEqual(response.errores[1].detalles.id_fuente_cor_candidatos, [13, 14]);
    assert.equal(response.errores[0].fila, 4);
  });
  assert.equal(inserted[0].id_fuente_cor, 11);
  assert.equal(inserted[0].estatus_cobranza, 'En Cobranza');
  assert.equal(inserted[0].estatus_factura, 'No pagado');
  assert.equal(inserted[0].id_aditiva_cor, null);
  assert.equal(inserted[0].origen_registro, 'LEGACY_HITO');
  assert.equal(inserted[1].estatus_factura, 'No pagado');
  assert.equal(inserted[1].estatus_cobranza, null);
  assert.equal(inserted[2].id_fuente_cor, 11);
  assert.equal(inserted[2].factura, inserted[0].factura);
  assert.equal(inserted[3].id_fuente_cor, 12);
  assert.equal(inserted[3].factura, inserted[0].factura);
  assert.equal(connection.events.filter((event) => event.startsWith('ROLLBACK TO SAVEPOINT')).length, 2);
  assert.equal(connection.events.at(-1), 'RELEASE');
});

test('Factura M2M recibe PAGADO sin cambiar la logica actual de estatus', async () => {
  const inserted = [];
  await withRepositoryStub({
    getConnection_cor: async () => fakeConnection(),
    findHitosFacturaCarga_cor: async () => [{
      id_fuente_cor: 11, moneda: 'USD', subtotal: 20549, iva: 3287.84, total: 23836.84
    }],
    insertRecord_cor: async (_connection, _table, record) => inserted.push(record)
  }, async () => {
    const response = await service.cargarFacturas_cor({ registros: [{
      ...facturaBase, PAGADO: '$1.234,56', estatus_factura_origen: 'EN COBRANZA'
    }] });
    assert.equal(response.insertados, 1);
    assert.equal(response.rechazados, 0);
  });
  assert.equal(inserted[0].pagado, 1234.56);
  assert.equal(inserted[0].estatus_factura, 'No pagado');
  assert.equal(inserted[0].estatus_cobranza, 'En Cobranza');
});

test('Un Hito admite tres Facturas con folios distintos', async () => {
  const inserted = [];
  await withRepositoryStub({
    getConnection_cor: async () => fakeConnection(),
    findHitosFacturaCarga_cor: async () => [{ id_fuente_cor: 11, moneda: 'USD', subtotal: 20549, iva: 3287.84, total: 23836.84 }],
    findFacturaDuplicada_cor: async () => assert.fail('M2M no debe buscar duplicados.'),
    insertRecord_cor: async (_connection, _table, record) => inserted.push(record)
  }, async () => {
    const response = await service.cargarFacturas_cor({ registros: ['CFV-100', 'CFV-101', 'CFV-102']
      .map((factura) => ({ ...facturaBase, factura })) });
    assert.equal(response.insertados, 3);
    assert.equal(response.rechazados, 0);
  });
  assert.deepEqual(inserted.map((row) => row.factura), ['CFV-100', 'CFV-101', 'CFV-102']);
  assert.ok(inserted.every((row) => row.id_fuente_cor === 11));
});

test('Dos filas historicas identicas insertan dos Facturas del mismo Hito', async () => {
  const inserted = [];
  const row = { ...facturaBase, ppns: 'P10583', factura: 'CFV-6925' };
  await withRepositoryStub({
    getConnection_cor: async () => fakeConnection(),
    findHitosFacturaCarga_cor: async () => [{ id_fuente_cor: 11, moneda: 'USD', subtotal: 20549, iva: 3287.84, total: 23836.84 }],
    findFacturaDuplicada_cor: async () => assert.fail('M2M no debe buscar duplicados.'),
    insertRecord_cor: async (_connection, _table, record) => inserted.push(record)
  }, async () => {
    const payload = { registros: [row] };
    const first = await service.cargarFacturas_cor(payload);
    const second = await service.cargarFacturas_cor(payload);
    assert.equal(first.insertados, 1);
    assert.equal(second.insertados, 1);
    assert.equal(first.rechazados + second.rechazados, 0);
  });
  assert.deepEqual(inserted.map((item) => [item.ppns, item.id_fuente_cor, item.factura]), [
    ['P10583', 11, 'CFV-6925'], ['P10583', 11, 'CFV-6925']
  ]);
});


test('Carga historica M2M de Ventas conserva los siete estatus de origen sin cambiar el estatus operativo', async () => {
  const keys = ['COBRANZA_COR_CARGA_INICIAL_PAGADAS_ENABLED', 'INTEGRATION_VENTAS_ID'];
  const old = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const inserted = [];
  try {
    process.env.COBRANZA_COR_CARGA_INICIAL_PAGADAS_ENABLED = 'false';
    process.env.INTEGRATION_VENTAS_ID = 'ventas-appscript';
    await withRepositoryStub({
      getConnection_cor: async () => fakeConnection(),
      findHitosFacturaCarga_cor: async (_conn, input) => [{
        id_fuente_cor: input.condicion === 'Parcial anticipo 1' ? 12 : 11,
        moneda: 'USD', subtotal: input.subtotal, iva: input.iva, total: input.total
      }],
      insertRecord_cor: async (_connection, _table, record) => inserted.push(record)
    }, async () => {
      const payload = { registros: [
        { ...facturaBase, factura: 'CFV-1', estatus_factura_origen: 'PAGADA' },
        { ...facturaBase, factura: 'CFV-2', estatus_factura_origen: 'PAGADO' },
        { ...facturaBase, factura: 'CFV-3', estatus_factura_origen: 'COBRADA' },
        { ...facturaBase, factura: 'CFV-4', estatus_factura_origen: 'EN COBRANZA' },
        { ...facturaBase, factura: 'CFV-5', estatus_factura_origen: 'PENDIENTE' },
        { ...facturaBase, factura: 'CFV-6', condicion: 'Parcial anticipo 1',
          subtotal: 0, iva: 0, total: 0, estatus_factura_origen: 'PAGADA' },
        { ...facturaBase, factura: 'CFV-7', estatus_factura_origen: 'PARCIAL' },
        { ...facturaBase, factura: 'CFV-8', estatus_factura_origen: 'VALIDAR' }
      ] };
      const m2m = await service.cargarFacturas_cor(payload, { integrationId: 'ventas-appscript' });
      assert.equal(m2m.insertados, 8);
      assert.equal(m2m.rechazados, 0);
      assert.equal(m2m.pagadas_historicas, 4);
      assert.deepEqual(inserted.map((row) => row.estatus_factura), [
        'Pagado', 'Pagado', 'Pagado', 'No pagado', 'No pagado', 'Pagado', 'No pagado', 'No pagado'
      ]);
      assert.deepEqual(inserted.map((row) => row.estatus_factura_origen), [
        'PAGADA', 'PAGADO', 'COBRADA', 'EN COBRANZA', 'PENDIENTE', 'PAGADA', 'PARCIAL', 'VALIDAR'
      ]);
      assert.deepEqual(inserted.map((row) => row.estatus_cobranza), [
        null, null, null, 'En Cobranza', 'Pendiente', null, null, null
      ]);
      assert.ok(inserted.every((row) => row.origen_registro === 'LEGACY_HITO'));
      assert.equal(inserted[5].total, 0);

      const manual = await service.cargarFacturas_cor({ registros: [
        { ...facturaBase, factura: 'CFV-9', estatus_factura_origen: 'COBRADA' }
      ] });
      const idIncorrecto = await service.cargarFacturas_cor({ registros: [
        { ...facturaBase, factura: 'CFV-10', estatus_factura_origen: 'PAGADA' }
      ] }, { integrationId: 'otro-appscript' });
      assert.equal(manual.pagadas_historicas, 0);
      assert.equal(idIncorrecto.pagadas_historicas, 0);
      assert.deepEqual(inserted.slice(-2).map((row) => row.estatus_factura), ['No pagado', 'No pagado']);
      assert.deepEqual(inserted.slice(-2).map((row) => row.estatus_factura_origen), ['COBRADA', 'PAGADA']);
    });
  } finally {
    for (const key of keys) {
      if (old[key] === undefined) delete process.env[key];
      else process.env[key] = old[key];
    }
  }
});

test('Carga inicial Sheets: 925 coincidencias duplicadas y 2 totales historicos inconsistentes se importan sin rechazo', async () => {
  const oldId = process.env.INTEGRATION_VENTAS_ID;
  const inserted = [];
  try {
    process.env.INTEGRATION_VENTAS_ID = 'ventas-appscript';
    const registros = [
      ...Array.from({ length: 925 }, (_, i) => ({
        ...facturaBase, factura: 'CFV-' + (90000 + i),
        estatus_factura_origen: ['PAGADA', 'PAGADO', 'COBRADA', 'EN COBRANZA', 'PENDIENTE'][i % 5]
      })),
      { ...facturaBase, ppns: 'P13575', factura: 'CFV-7777', total: 23837.84, estatus_factura_origen: 'PAGADA' },
      { ...facturaBase, ppns: 'P13177', factura: 'CFV-8833', total: 23840.84, estatus_factura_origen: 'PENDIENTE' }
    ];
    await withRepositoryStub({
      getConnection_cor: async () => fakeConnection(),
      findHitosFacturaCarga_cor: async (_connection, record) => {
        const source = {
          moneda: record.moneda, subtotal: record.subtotal,
          iva: record.iva, total: record.total
        };
        return record.ppns === 'P14302'
          ? [{id_fuente_cor: 1, ...source}, {id_fuente_cor: 1508, ...source}]
          : [{id_fuente_cor: record.ppns === 'P13575' ? 31 : 32, ...source}];
      },
      insertRecord_cor: async (_connection, table, record) => {
        assert.equal(table, repository.TABLES_COR.facturas);
        inserted.push(record);
      }
    }, async () => {
      const response = await service.cargarFacturas_cor({ registros }, { integrationId: 'ventas-appscript' });
      assert.equal(response.total_recibidos, 927);
      assert.equal(response.insertados, 927);
      assert.equal(response.rechazados, 0);
      assert.equal(response.vinculo_hito_ambiguo, 0);
      assert.ok(inserted.slice(0, 925).every(row => row.id_fuente_cor === 1));
      assert.deepEqual(inserted.slice(0, 5).map(row => [row.estatus_factura, row.estatus_cobranza]), [
        ['Pagado', null], ['Pagado', null], ['Pagado', null],
        ['No pagado', 'En Cobranza'], ['No pagado', 'Pendiente']
      ]);
      assert.deepEqual(inserted.slice(-2).map(row => [row.ppns, row.total, row.estatus_factura]), [
        ['P13575', 23837.84, 'Pagado'], ['P13177', 23840.84, 'No pagado']
      ]);
    });
    assert.equal(inserted.length, 927);
  } finally {
    if (oldId === undefined) delete process.env.INTEGRATION_VENTAS_ID;
    else process.env.INTEGRATION_VENTAS_ID = oldId;
  }
});

test('Validacion estricta de subtotal mas IVA permanece para cargas sin identidad M2M', async () => {
  const response = await withRepositoryStub({
    getConnection_cor: async () => fakeConnection()
  }, () => service.cargarFacturas_cor({ registros: [
    { ...facturaBase, total: 23837.84 }
  ] }));
  assert.equal(response.insertados, 0);
  assert.equal(response.rechazados, 1);
  assert.equal(response.errores[0].code, 'COBRANZA_FACTURA_REGISTRO_INVALIDO');
});

test('Detalle y KPIs reconocen saldo historico LEGACY_HITO aun despues de desactivar la bandera', async () => {
  const access = { dominio: 'CORELLIAN', requiere_filtro_usuario: false };
  const sources = [
    { id_fuente_cor: 11, id_proyecto_origen: 'P14302', moneda: 'USD', total: 100, subtotal: 100, iva: 0 },
    { id_fuente_cor: 12, id_proyecto_origen: 'P14302', moneda: 'USD', total: 0, subtotal: 0, iva: 0 },
    { id_fuente_cor: 13, id_proyecto_origen: 'P14302', moneda: 'USD', total: 50, subtotal: 50, iva: 0 }
  ];
  const invoices = [
    { id_factura_cor: 501, id_fuente_cor: 11, ppns: 'P14302', tipo_concepto: 'HITO', total: 100,
      factura: 'CFV-1', estatus_factura: 'Pagado', origen_registro: 'LEGACY_HITO' },
    { id_factura_cor: 502, id_fuente_cor: 12, ppns: 'P14302', tipo_concepto: 'HITO', total: 0,
      factura: 'CFV-2', estatus_factura: 'Pagado', origen_registro: 'LEGACY_HITO' },
    { id_factura_cor: 503, id_fuente_cor: 13, ppns: 'P14302', tipo_concepto: 'HITO', total: 50,
      factura: 'CFV-3', estatus_factura: 'Pagado', origen_registro: 'MANUAL' }
  ];
  let relations = [];
  await withRepositoryStub({
    getConnection_cor: async () => fakeConnection(),
    getEstadoCuentaByPpns_cor: async () => ({ ppns: 'P14302', registros_estado_cuenta: 3 }),
    listFuenteEstadoCuenta_cor: async () => sources,
    listFacturasEstadoCuenta_cor: async () => invoices,
    listAditivasEstadoCuenta_cor: async () => [],
    listCrearEstadoCuentaEquipos_cor: async () => [],
    listCrearEstadoCuentaLogOps_cor: async () => [],
    listEquiposEstadoCuenta_cor: async () => [],
    listPartidasEstadoCuenta_cor: async () => []
  }, () => withRepositoryStub({
    listPagosEstadoCuenta_cor: async () => [],
    listRelacionesEstadoCuenta_cor: async () => relations
  }, async () => {
    const detail = await service.detalleEstadoCuenta_cor('P14302', access);
    assert.deepEqual(detail.facturas.map((row) => row.estatus_factura), ['Pagado', 'Pagado', 'No pagado']);
    assert.equal(detail.facturas[0].importe_pagado, 100);
    assert.equal(detail.facturas[1].importe_pagado, 0);
    assert.equal(detail.facturas[1].saldo, 0);
    assert.deepEqual(detail.estado_cuenta.map((row) => row.es_pagado), [true, true, false]);
    assert.equal(detail.resumen.monedas[0].cobrado, 100);
    assert.equal(detail.resumen.monedas[0].pendiente, 50);
    const form = await service.formularioEstadoCuenta_cor('P14302', access);
    assert.equal(form.hitos[0].estatus_factura, 'Pagado');
    assert.equal(form.hitos[1].estatus_factura, 'Pagado');

    relations = [{ id_factura_cor: 501, id_pago_cor: 91, importe_aplicado: 25 }];
    const partial = await service.detalleEstadoCuenta_cor('P14302', access);
    assert.equal(partial.facturas[0].estatus_factura, 'No pagado');
    assert.equal(partial.facturas[0].importe_pagado, 25);
    assert.equal(partial.resumen.monedas[0].cobrado, 25);
    assert.equal(partial.resumen.monedas[0].pendiente, 125);
  }, pagosRepository));
});

test('Controller solo transmite identidad validada M2M a la carga de facturas', async () => {
  const original = service.cargarFacturas_cor;
  const passed = [];
  const response = {
    status() { return this; },
    json(value) { return value; }
  };
  try {
    service.cargarFacturas_cor = async (_body, auth) => {
      passed.push(auth);
      return { ok: true };
    };
    await controller.cargarFacturas_cor({ body: { registros: [] },
      integrationAuth: { integrationId: 'ventas-appscript' } }, response, assert.fail);
    await controller.cargarFacturas_cor({ body: { registros: [] } }, response, assert.fail);
    assert.deepEqual(passed, [{ integrationId: 'ventas-appscript' }, null]);
  } finally {
    service.cargarFacturas_cor = original;
  }
});

test('Factura manual rechaza Pagado y guarda No pagado aunque el campo venga vacio', async () => {
  const access = { dominio: 'CORELLIAN', requiere_filtro_usuario: false };
  await assert.rejects(service.crearFacturaEstadoCuenta_cor('P14302', {
    tipo_concepto: 'HITO', id_concepto: 11, factura: 'CFV-100', total: 100,
    estatus_factura: 'Pagado'
  }, access, 1), (error) => error.statusCode === 400 && /Pagos aplicados/.test(error.message));

  const connection = fakeConnection();
  let inserted;
  let duplicate = false;
  await withRepositoryStub({
    getConnection_cor: async () => connection,
    getEstadoCuentaByPpns_cor: async () => ({}),
    getHitoFacturable_cor: async () => ({ id_fuente_cor: 11, moneda: 'USD' }),
    findFacturaDuplicada_cor: async () => duplicate ? { id_factura_cor: 501 } : null,
    insertRecord_cor: async (_connection, _table, record) => {
      inserted = record;
      return { insertId: 501 };
    },
    getFacturaEstadoCuentaById_cor: async () => ({
      id_factura_cor: 501, ppns: 'P14302', tipo_concepto: 'HITO',
      id_fuente_cor: 11, factura: 'CFV-100', total: 100, estatus_factura: 'Pagado'
    })
  }, async () => {
    const response = await service.crearFacturaEstadoCuenta_cor('P14302', {
      tipo_concepto: 'HITO', id_concepto: 11, factura: 'CFV-100', total: 100
    }, access, 1);
    assert.equal(response.factura.estatus_factura, 'No pagado');
    duplicate = true;
    await assert.rejects(service.crearFacturaEstadoCuenta_cor('P14302', {
      tipo_concepto: 'HITO', id_concepto: 11, factura: 'CFV-100', total: 100
    }, access, 1), (error) => error.statusCode === 409);
  });
  assert.equal(inserted.estatus_factura, 'No pagado');
});

test('Detalle deriva pago parcial/completo y revierte al quitar Pago; conserva folios repetidos', async () => {
  const connection = fakeConnection();
  const access = { dominio: 'CORELLIAN', requiere_filtro_usuario: false };
  const sourceRows = [{
    id_fuente_cor: 11, id_proyecto_origen: 'P14302', moneda: 'USD',
    subtotal: 100, iva: 0, total: 100, pago_total: 999,
    estatus_factura: 'Pagado', fecha_pago: '2026-10-01'
  }];
  const facturaRows = [
    { id_factura_cor: 501, ppns: 'P14302', tipo_concepto: 'HITO', id_fuente_cor: 11,
      factura: 'CFV-6925', moneda: 'USD', total: 100, estatus_factura: 'Pagado' },
    { id_factura_cor: 502, ppns: 'P14302', tipo_concepto: 'HITO', id_fuente_cor: 11,
      factura: 'CFV-6925', moneda: 'USD', total: null, estatus_factura: 'Pagado' }
  ];
  let relations = [{ id_factura_cor: 501, id_pago_cor: 1001, importe_aplicado: 40 }];
  const statusUpdates = [];
  await withRepositoryStub({
    getConnection_cor: async () => connection,
    getEstadoCuentaByPpns_cor: async () => ({ ppns: 'P14302', registros_estado_cuenta: 1 }),
    listFuenteEstadoCuenta_cor: async () => sourceRows,
    listFacturasEstadoCuenta_cor: async () => facturaRows,
    listAditivasEstadoCuenta_cor: async () => [],
    updateFacturaEstatus_cor: async (_connection, id, ppns, status) => statusUpdates.push({ id, ppns, status })
  }, () => withRepositoryStub({
    listPagosEstadoCuenta_cor: async () => [],
    listRelacionesEstadoCuenta_cor: async () => relations,
    lockPagoEstadoCuenta_cor: async () => ({ id_pago_cor: 1001 }),
    lockFacturaEstadoCuenta_cor: async () => ({ id_factura_cor: 501, total: 100 }),
    listRelacionesFacturaForUpdate_cor: async () => relations,
    quitarRelacionPagoFactura_cor: async () => {
      relations = [];
      return 1;
    }
  }, async () => {
    const partial = await service.detalleEstadoCuenta_cor('P14302', access);
    assert.equal(partial.facturas.length, 2);
    assert.equal(partial.facturas[0].importe_pagado, 40);
    assert.equal(partial.facturas[0].saldo, 60);
    assert.equal(partial.facturas[0].estatus_factura, 'No pagado');
    assert.equal(partial.facturas[1].saldo, null);
    assert.equal(partial.facturas[1].estatus_factura, 'No pagado');
    assert.equal(partial.estado_cuenta[0].factura, 'CFV-6925, CFV-6925');
    assert.equal(partial.estado_cuenta[0].pago_total, 40);
    assert.equal(partial.estado_cuenta[0].pago_contabilizado, 40);
    assert.equal(partial.estado_cuenta[0].pendiente_calculado, 60);
    assert.equal(partial.estado_cuenta[0].es_pagado, false);
    assert.equal(partial.resumen.monedas[0].cobrado, 40);
    assert.equal(partial.resumen.monedas[0].pendiente, 60);

    relations = [{ id_factura_cor: 501, id_pago_cor: 1001, importe_aplicado: 100 }];
    const complete = await service.detalleEstadoCuenta_cor('P14302', access);
    assert.equal(complete.facturas[0].importe_pagado, 100);
    assert.equal(complete.facturas[0].saldo, 0);
    assert.equal(complete.facturas[0].estatus_factura, 'Pagado');
    assert.equal(complete.estado_cuenta[0].pago_total, 100);
    assert.equal(complete.estado_cuenta[0].pendiente_calculado, 0);
    assert.equal(complete.estado_cuenta[0].es_pagado, true);
    assert.equal(complete.estado_cuenta[0].estatus_factura, 'Pagado');
    assert.equal(complete.resumen.monedas[0].porcentaje_cobrado_calculado, 1);

    await service.quitarRelacionPagoFacturaEstadoCuenta_cor('P14302', 1001, 501, access);
    const withoutPayment = await service.detalleEstadoCuenta_cor('P14302', access);
    assert.equal(withoutPayment.facturas[0].importe_pagado, 0);
    assert.equal(withoutPayment.facturas[0].saldo, 100);
    assert.equal(withoutPayment.facturas[0].estatus_factura, 'No pagado');
    assert.equal(withoutPayment.estado_cuenta[0].pago_total, 0);
    assert.equal(withoutPayment.estado_cuenta[0].pendiente_calculado, 100);
    assert.equal(withoutPayment.estado_cuenta[0].es_pagado, false);
    assert.deepEqual(statusUpdates, [{ id: 501, ppns: 'P14302', status: 'No pagado' }]);
  }, pagosRepository));
});

test('Formulario de Estado de Cuenta tambien usa importes aplicados para sus Hitos', async () => {
  const access = { dominio: 'CORELLIAN', requiere_filtro_usuario: false };
  await withRepositoryStub({
    getConnection_cor: async () => fakeConnection(),
    getEstadoCuentaByPpns_cor: async () => ({ ppns: 'P14302', registros_estado_cuenta: 1 }),
    listFuenteEstadoCuenta_cor: async () => [{
      id_fuente_cor: 11, id_proyecto_origen: 'P14302', total: 100,
      pago_total: 100, estatus_factura: 'Pagado'
    }],
    listCrearEstadoCuentaEquipos_cor: async () => [],
    listCrearEstadoCuentaLogOps_cor: async () => [],
    listEquiposEstadoCuenta_cor: async () => [],
    listPartidasEstadoCuenta_cor: async () => [],
    listFacturasEstadoCuenta_cor: async () => [{
      id_factura_cor: 501, tipo_concepto: 'HITO', id_fuente_cor: 11, factura: 'CFV-100', total: 100
    }]
  }, () => withRepositoryStub({
    listRelacionesEstadoCuenta_cor: async () => [{ id_factura_cor: 501, importe_aplicado: 40 }]
  }, async () => {
    const form = await service.formularioEstadoCuenta_cor('P14302', access);
    assert.equal(form.hitos[0].pago_total, 40);
    assert.equal(form.hitos[0].pendiente_calculado, 60);
    assert.equal(form.hitos[0].estatus_factura, 'No pagado');
  }, pagosRepository));
});

test('Validaciones de carga rechazan filas sin abrir transaccion y payload estructural excedido', async () => {
  const connection = fakeConnection();
  await withRepositoryStub({ getConnection_cor: async () => connection }, async () => {
    const response = await service.cargarFacturas_cor({ registros: [
      { ...facturaBase, factura: '' },
      { ...facturaBase, subtotal: -1 },
      { ...facturaBase, tipo_concepto: 'ADITIVA' },
      { ...facturaBase, activo: 0 }
    ] });
    assert.equal(response.rechazados, 4);
    assert.equal(response.bloques_procesados, 0);
    assert.equal(connection.events.at(-1), 'RELEASE');
  });
  await assert.rejects(service.cargarFacturas_cor({ registros: Array(5001).fill(facturaBase) }),
    (error) => error.statusCode === 400);
});

test('Carga de 301 filas procesa dos bloques y una falla SQL solo revierte su fila', async () => {
  const connection = fakeConnection();
  let successfulInserts = 0;
  const registros = Array.from({ length: 301 }, (_, index) => ({
    ...facturaBase, factura: index === 10 ? 'FALLA' : `CFV-${index}`
  }));
  await withRepositoryStub({
    getConnection_cor: async () => connection,
    findHitosFacturaCarga_cor: async () => [{
      id_fuente_cor: 11, moneda: 'USD', subtotal: 20549, iva: 3287.84, total: 23836.84
    }],
    findFacturaDuplicada_cor: async () => null,
    insertRecord_cor: async (_connection, _table, record) => {
      if (record.factura === 'FALLA') throw new Error('Falla SQL simulada');
      successfulInserts += 1;
    }
  }, async () => {
    const response = await service.cargarFacturas_cor({ registros });
    assert.equal(response.insertados, 300);
    assert.equal(response.rechazados, 1);
    assert.equal(response.bloques_procesados, 2);
    assert.equal(response.errores[0].code, 'COBRANZA_FACTURA_INSERCION_FALLIDA');
    assert.equal(response.errores[0].fila, 12);
  });
  assert.equal(successfulInserts, 300);
  assert.equal(connection.events.filter((event) => event === 'COMMIT').length, 2);
  assert.equal(connection.events.filter((event) => event.startsWith('ROLLBACK TO SAVEPOINT')).length, 1);
  assert.equal(connection.events.at(-1), 'RELEASE');
});

test('Busqueda SQL exige las siete claves, tolerancias exactas, NULL y Hito activo', async () => {
  let sql;
  let params;
  await repository.findHitosFacturaCarga_cor({
    async query(query, values) { sql = query; params = values; return [[], []]; }
  }, facturaBase);
  assert.match(sql, /f\.activo = 1/);
  for (const field of ['id_proyecto_origen', 'porcentaje', 'condicion', 'moneda', 'subtotal', 'iva', 'total']) {
    assert.match(sql, new RegExp(`f\\.${field}`));
  }
  assert.match(sql, /0\.000001/);
  assert.equal((sql.match(/0\.005/g) || []).length, 3);
  assert.match(sql, /IS NULL AND \? IS NULL/);
  assert.match(sql, /NULLIF\(UPPER\(TRIM\(f\.condicion\)\), ''\) <=>/);
  assert.equal(params.length, 15);
});

test('Sincronizacion SQL de estatus queda acotada por id de Factura y PPNS', async () => {
  let sql;
  let params;
  await repository.updateFacturaEstatus_cor({
    async query(query, values) { sql = query; params = values; return [{ affectedRows: 1 }]; }
  }, 501, 'P14302', 'Pagado');
  assert.match(sql, /UPDATE cobranza_facturas_cor/);
  assert.match(sql, /WHERE id_factura_cor = \?/);
  assert.match(sql, /UPPER\(TRIM\(COALESCE\(ppns, ''\)\)\) = UPPER\(TRIM\(COALESCE\(\?, ''\)\)\)/);
  assert.deepEqual(params, ['Pagado', 501, 'P14302']);
});

test('Ruta nueva comparte HMAC y firma invalida responde 401', async () => {
  const routes = fs.readFileSync(path.join(__dirname, '../backend/src/modules/cobranza-cor/cobranza-cor.routes.js'), 'utf8');
  assert.match(routes, /router\.post\('\/carga\/facturas', requireCobranzaCorIntegration, controller\.cargarFacturas_cor\)/);
  const previous = {
    enabled: process.env.INTEGRATION_AUTH_ENABLED,
    id: process.env.INTEGRATION_VENTAS_ID,
    secret: process.env.INTEGRATION_VENTAS_SECRET
  };
  process.env.INTEGRATION_AUTH_ENABLED = 'true';
  process.env.INTEGRATION_VENTAS_ID = 'test-ventas';
  process.env.INTEGRATION_VENTAS_SECRET = 'test-secret';
  try {
    const rawBody = Buffer.from('{"registros":[]}');
    const timestamp = String(Math.floor(Date.now() / 1000));
    const url = '/api/cobranza-cor/carga/facturas';
    const validSignature = crypto.createHmac('sha256', 'test-secret')
      .update(`${timestamp}\nPOST\n${url}\n`).update(rawBody).digest('hex');
    const middleware = requireIntegrationAuthFor('INTEGRATION_VENTAS_ID');
    const request = (signature) => ({
      method: 'POST', originalUrl: url, rawBody,
      get(name) {
        return { 'x-integration-id': 'test-ventas', 'x-integration-timestamp': timestamp,
          'x-integration-signature': signature }[name.toLowerCase()];
      }
    });
    let status;
    let body;
    const response = {
      status(code) { status = code; return this; },
      json(value) { body = value; return this; }
    };
    middleware(request('bad-signature'), response, () => assert.fail('La firma invalida paso el middleware.'));
    assert.equal(status, 401);
    assert.equal(body.code, 'INTEGRATION_AUTH_INVALID_SIGNATURE');
    let passed = false;
    middleware(request(validSignature), response, (error) => {
      assert.ifError(error);
      passed = true;
    });
    assert.equal(passed, true);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      const envName = { enabled: 'INTEGRATION_AUTH_ENABLED', id: 'INTEGRATION_VENTAS_ID', secret: 'INTEGRATION_VENTAS_SECRET' }[key];
      if (value === undefined) delete process.env[envName];
      else process.env[envName] = value;
    }
  }
});

test('Controller responde 200 para filas rechazadas y 400 para payload estructural', async () => {
  const original = service.cargarFacturas_cor;
  const response = {
    statusCode: null, body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
  try {
    service.cargarFacturas_cor = async () => ({ ok: true, rechazados: 1 });
    await controller.cargarFacturas_cor({ body: { registros: [{}] } }, response, assert.fail);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.rechazados, 1);
    service.cargarFacturas_cor = async () => {
      const error = new Error('Payload invalido');
      error.statusCode = 400;
      throw error;
    };
    await controller.cargarFacturas_cor({ body: {} }, response, assert.fail);
    assert.equal(response.statusCode, 400);
    assert.equal(response.body.ok, false);
  } finally {
    service.cargarFacturas_cor = original;
  }
});

test('Backdoor validar_pagados: solo UPDATE de Facturas existentes, nunca INSERT', async () => {
  const connection = fakeConnection();
  const updates = [];
  const estado = new Map([['CFV-1', 'No pagado'], ['CFV-2', 'Pagado']]);
  const anterior = process.env.INTEGRATION_VENTAS_ID;
  try {
    process.env.INTEGRATION_VENTAS_ID = 'ventas-appscript';
    await withRepositoryStub({
      getConnection_cor: async () => connection,
      findHitosFacturaCarga_cor: async () => [{ id_fuente_cor: 589 }],
      findFacturasHistoricasParaValidar_cor: async (_connection, _ppns, idHito, folio) => {
        assert.equal(idHito, 589);
        return estado.has(folio) ? [{ id_factura_cor: folio === 'CFV-1' ? 41 : 42, estatus_factura: estado.get(folio) }] : [];
      },
      marcarFacturaHistoricaPagada_cor: async (_connection, idFactura, ppns) => {
        updates.push({ idFactura, ppns });
        estado.set('CFV-1', 'Pagado');
        return 1;
      },
      insertRecord_cor: async () => assert.fail('La backdoor no puede insertar registros')
    }, async () => {
      const pagada = { ...facturaBase, ppns: 'P11417', factura: 'CFV-1', estatus_factura_origen: 'PAGADA' };
      const yaPagada = { ...pagada, factura: 'CFV-2', estatus_factura_origen: 'COBRADA' };
      const pendiente = { ...pagada, factura: 'CFV-3', estatus_factura_origen: 'PENDIENTE' };
      const noExiste = { ...pagada, factura: 'CFV-4' };
      const payload = { modo: 'validar_pagados', registros: [pagada, yaPagada, pendiente, noExiste] };
      const result = await service.cargarFacturas_cor(payload, { integrationId: 'ventas-appscript' });
      assert.equal(result.actualizados, 1);
      assert.equal(result.ya_pagados, 1);
      assert.equal(result.omitidos_no_pagados, 1);
      assert.equal(result.rechazados, 1);
      assert.equal(result.insertados, 0);
      assert.equal(result.errores[0].code, 'COBRANZA_VALIDACION_FACTURA_NO_ENCONTRADA');
      assert.deepEqual(updates, [{ idFactura: 41, ppns: 'P11417' }]);

      const repeat = await service.cargarFacturas_cor({ modo: 'validar_pagados', registros: [pagada] },
        { integrationId: 'ventas-appscript' });
      assert.equal(repeat.actualizados, 0);
      assert.equal(repeat.ya_pagados, 1);
      assert.equal(updates.length, 1);
    });
  } finally {
    if (anterior === undefined) delete process.env.INTEGRATION_VENTAS_ID;
    else process.env.INTEGRATION_VENTAS_ID = anterior;
  }
});

test('Backdoor validar_pagados exige M2M de Ventas y falla cerrado ante ambiguedad', async () => {
  const anterior = process.env.INTEGRATION_VENTAS_ID;
  try {
    process.env.INTEGRATION_VENTAS_ID = 'ventas-appscript';
    await assert.rejects(
      service.cargarFacturas_cor({ modo: 'validar_pagados', registros: [facturaBase] }, null),
      (error) => error.statusCode === 403 && error.code === 'COBRANZA_VALIDACION_PAGADOS_NO_AUTORIZADA'
    );
    let writes = 0;
    await withRepositoryStub({
      getConnection_cor: async () => fakeConnection(),
      findHitosFacturaCarga_cor: async () => [{ id_fuente_cor: 11 }, { id_fuente_cor: 1518 }],
      findFacturasHistoricasParaValidar_cor: async () => assert.fail('No consultar Facturas con Hitos ambiguos'),
      marcarFacturaHistoricaPagada_cor: async () => { writes += 1; return 1; },
      insertRecord_cor: async () => assert.fail('La backdoor no puede insertar')
    }, async () => {
      const result = await service.cargarFacturas_cor({ modo: 'validar_pagados', registros: [
        { ...facturaBase, estatus_factura_origen: 'PAGADO' }
      ] }, { integrationId: 'ventas-appscript' });
      assert.equal(result.actualizados, 0);
      assert.equal(result.rechazados, 1);
      assert.equal(result.errores[0].code, 'COBRANZA_VALIDACION_HITO_AMBIGUO');
      assert.equal(writes, 0);
    });
  } finally {
    if (anterior === undefined) delete process.env.INTEGRATION_VENTAS_ID;
    else process.env.INTEGRATION_VENTAS_ID = anterior;
  }
});

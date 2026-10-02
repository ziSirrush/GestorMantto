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
const service = require('../backend/src/modules/cobranza-cor/cobranza-cor.service');
const controller = require('../backend/src/modules/cobranza-cor/cobranza-cor.controller');
const { requireIntegrationAuthFor } = require('../backend/src/middleware/integration-auth.middleware');

function withRepositoryStub(stubs, run) {
  const originals = new Map();
  for (const [name, implementation] of Object.entries(stubs)) {
    originals.set(name, repository[name]);
    repository[name] = implementation;
  }
  return Promise.resolve().then(run).finally(() => {
    for (const [name, implementation] of originals) repository[name] = implementation;
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

test('Fuente nueva inserta condiciones y no toma datos de Factura/Pago', async () => {
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
      FECHA_DE_VENCIMIENTO_HITO: '2026-10-10', CONDICIONES: 30,
      estimado_pago: 'Octubre', estatus_vencimiento: 'Pendiente', DIAS_DE_VENCIDO: 2,
      factura: 'IGNORAR', estatus_factura: 'PAGADO', fecha_pago: '2026-10-01'
    }] });
    assert.equal(response.insertados, 1);
  });
  assert.equal(records[0].table, repository.TABLES_COR.fuente);
  assert.equal(records[0].record.condiciones_pago_dias, 30);
  assert.equal(records[0].record.fecha_vencimiento, '2026-10-10');
  assert.equal(records[0].record.dias_vencimiento, 2);
  for (const field of ['factura', 'estatus_factura', 'fecha_pago']) {
    assert.equal(Object.hasOwn(records[0].record, field), false);
  }
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

test('Factura M2M vincula por Hito, rechaza faltantes/ambiguos/duplicados y permite mismo folio en otro Hito', async () => {
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
    findFacturaDuplicada_cor: async (_connection, _ppns, _tipo, id, factura) =>
      inserted.find((row) => row.id_fuente_cor === id && row.factura === factura)
        ? { id_factura_cor: 99 } : null,
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
    assert.equal(response.insertados, 3);
    assert.equal(response.rechazados, 3);
    assert.equal(response.vinculados_hito, 3);
    assert.equal(response.sin_vinculo_hito, 1);
    assert.equal(response.vinculo_hito_ambiguo, 1);
    assert.equal(response.bloques_procesados, 1);
    assert.equal(response.tamano_bloque, 300);
    assert.deepEqual(response.errores.map((item) => item.code), [
      'COBRANZA_FACTURA_HITO_NO_ENCONTRADO',
      'COBRANZA_FACTURA_HITO_AMBIGUO',
      'COBRANZA_FACTURA_DUPLICADA'
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
  assert.equal(inserted[2].id_fuente_cor, 12);
  assert.equal(inserted[2].factura, inserted[0].factura);
  assert.equal(connection.events.filter((event) => event.startsWith('ROLLBACK TO SAVEPOINT')).length, 3);
  assert.equal(connection.events.at(-1), 'RELEASE');
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

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('un Pago acepta varias Facturas, impide reutilizarlas y limita la suma aplicada', async () => {
  const relations = [];
  const calls = [];
  const connection = {
    beginTransaction: async () => calls.push('begin'),
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
    release() {}
  };
  const repository = {
    getConnection_cor: async () => connection,
    getEstadoCuentaByPpns_cor: async () => ({ ppns: 'FUENTE-123', registros_estado_cuenta: 1 })
  };
  const pagosRepository = {
    lockPagoEstadoCuenta_cor: async (_connection, id, ppns) => {
      assert.equal(ppns, 'FUENTE-123');
      return [1001, 1002].includes(id) ? { id_pago_cor: id, importe_complemento_pago: -100 } : null;
    },
    lockFacturaEstadoCuenta_cor: async (_connection, id, ppns) => {
      assert.equal(ppns, 'FUENTE-123');
      return [1, 2, 3].includes(id) ? { id_factura_cor: id } : null;
    },
    listRelacionesPagoForUpdate_cor: async (_connection, id) => relations.filter((row) => row.id_pago_cor === id),
    listRelacionesFacturaForUpdate_cor: async (_connection, id) => relations.filter((row) => row.id_factura_cor === id),
    guardarRelacionPagoFactura_cor: async (_connection, idPago, idFactura, amount, exists) => {
      if (exists) relations.find((row) => row.id_factura_cor === idFactura).importe_aplicado = amount;
      else relations.push({ id_pago_cor: idPago, id_factura_cor: idFactura, importe_aplicado: amount, ppns: 'FUENTE-123' });
    },
    quitarRelacionPagoFactura_cor: async (_connection, idPago, idFactura) => {
      const index = relations.findIndex((row) => row.id_pago_cor === idPago && row.id_factura_cor === idFactura);
      if (index >= 0) relations.splice(index, 1);
      return index >= 0 ? 1 : 0;
    }
  };
  const module = { exports: {} };
  vm.runInNewContext(read('backend/src/modules/cobranza-cor/cobranza-cor.service.js'), {
    module,
    require: (name) => name.endsWith('cobranza-cor-pagos.repository') ? pagosRepository : repository
  });
  const service = module.exports;
  const scope = { dominio: 'CORELLIAN' };

  await service.guardarRelacionPagoFacturaEstadoCuenta_cor(' fuente-123 ', 1001, 1, { importe_aplicado: 40 }, scope);
  await service.guardarRelacionPagoFacturaEstadoCuenta_cor('FUENTE-123', 1001, 2, { importe_aplicado: 60 }, scope);
  assert.equal(relations.length, 2);
  await assert.rejects(
    service.guardarRelacionPagoFacturaEstadoCuenta_cor('FUENTE-123', 1002, 1, { importe_aplicado: 10 }, scope),
    (error) => error.statusCode === 409
  );
  await assert.rejects(
    service.guardarRelacionPagoFacturaEstadoCuenta_cor('FUENTE-123', 1001, 3, { importe_aplicado: 1 }, scope),
    (error) => error.statusCode === 400
  );
  assert.equal(relations.length, 2);
  await service.quitarRelacionPagoFacturaEstadoCuenta_cor('FUENTE-123', 1001, 1, scope);
  await service.guardarRelacionPagoFacturaEstadoCuenta_cor('FUENTE-123', 1002, 1, { importe_aplicado: 10 }, scope);
  assert.equal(relations.find((row) => row.id_factura_cor === 1).id_pago_cor, 1002);
  assert.equal(calls.filter((call) => call === 'commit').length, 4);
  assert.equal(calls.filter((call) => call === 'rollback').length, 2);
});

test('la tabla de Pagos muestra el diseño pedido y omite Facturas ya asignadas del selector', async () => {
  const handlers = {};
  const requests = [];
  const view = { dataset: {}, innerHTML: '', addEventListener(type, handler) { handlers[type] = handler; } };
  const detail = {
    proyecto: { ppns: 'FUENTE-123', proyecto: 'Proyecto' },
    resumen: { monedas: [] }, estado_cuenta: [], aditivas: [], facturacion_catalogo: {},
    facturas: [
      { id_factura_cor: 1, factura: 'CFV-2392', tipo_concepto: 'HITO', concepto: 'Hito 1' },
      { id_factura_cor: 2, factura: 'CFV-2393', tipo_concepto: 'ADITIVA', concepto: 'Aditiva 1' }
    ],
    relaciones_pagos: [{ id_factura_cor: 1, id_pago_cor: 1001, importe_aplicado: 50 }],
    pagos: [
      { id_pago_cor: 1001, complemento_pago: 'Pago #CP24897', fecha_pago: '2026-11-01', importe_complemento_pago: -50, facturas: [{ id_factura_cor: 1, importe_aplicado: 50 }] },
      { id_pago_cor: 1002, complemento_pago: 'Pago #CP13577', fecha_pago: '2026-10-15', importe_complemento_pago: -40, facturas: [] }
    ]
  };
  const window = {
    ManttoRouter: { getCurrent: () => ({ route: 'cobranza-estados-cuenta', payload: { ppns: 'FUENTE-123' } }) },
    ManttoHttp: {
      get: async () => detail,
      request: async (requestPath, options) => { requests.push({ requestPath, options }); return { ok: true }; },
      invalidate() {}
    },
    scrollTo() {}
  };
  const document = {
    getElementById: (id) => id === 'view-placeholder' ? view : null,
    createElement: () => ({}), head: { appendChild() {} }
  };
  vm.runInNewContext(read('modules/cobranza-cor/cobranza-cor-estados-cuenta.js'), { window, document });
  await window.ManttoCobranzaCorEstadosCuenta.init();

  const section = view.innerHTML.split('class="ccor-ec-card ccor-ec-pagos-section"')[1];
  assert.ok(section);
  for (const header of ['ID Pago', 'Complemento Pago', 'Fecha Pago', 'Importe', 'Factura', 'Estado']) {
    assert.match(section, new RegExp(`<th>${header}</th>`));
  }
  assert.match(section, /Pago #CP24897/);
  assert.match(section, /01\/11\/2026/);
  assert.match(section, /50\.00/);
  assert.match(section, /Alineado/);
  assert.match(section, /Pendiente/);
  const selector = section.match(/<select data-pago-factura[^>]*>(.*?)<\/select>/s)?.[1] || '';
  assert.doesNotMatch(selector, /value="1"/);
  assert.match(selector, /value="2"/);

  const row = {
    dataset: { pagoId: '1002' },
    querySelector: (query) => query === '[data-pago-factura]' ? { value: '2' } : { value: '25.50' }
  };
  const button = { closest: (query) => query === '[data-pago-id]' ? row : null };
  handlers.click({ target: { closest: (query) => query === '[data-pago-agregar]' ? button : null } });
  await new Promise(setImmediate);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].requestPath, '/api/cobranza-cor/estados-cuenta/FUENTE-123/pagos/1002/facturas/2');
  assert.equal(requests[0].options.method, 'PUT');
  assert.equal(JSON.parse(requests[0].options.body).importe_aplicado, 25.5);
});

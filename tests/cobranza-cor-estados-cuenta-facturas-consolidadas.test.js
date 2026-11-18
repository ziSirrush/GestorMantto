'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

test('consolida Facturas duplicadas sin duplicar Pagado y aplica Parciales al Anticipo principal', async () => {
  const connection = { release() {} };
  const repository = {
    getConnection_cor: async () => connection,
    getEstadoCuentaByPpns_cor: async () => ({
      ppns: 'P-1', proyecto: 'Proyecto', cliente: 'Cliente',
      registros_estado_cuenta: 3
    }),
    listFuenteEstadoCuenta_cor: async () => [
      {
        id_fuente_cor: 1, id_proyecto_origen: 'P-1', condicion: 'Anticipo',
        moneda: 'USD', subtotal: 56823, iva: 9091.68, total: 65914.68,
        porcentaje: 0.5, orden_hito: 1
      },
      {
        id_fuente_cor: 2, id_proyecto_origen: 'P-1', condicion: 'Parcial Anticipo 1',
        moneda: 'USD', subtotal: 0, iva: 0, total: 0, orden_hito: 2
      },
      {
        id_fuente_cor: 3, id_proyecto_origen: 'P-1', condicion: 'Parcial Anticipo 2',
        moneda: 'USD', subtotal: 0, iva: 0, total: 0, orden_hito: 3
      }
    ],
    listFacturasEstadoCuenta_cor: async () => [
      {
        id_factura_cor: 101, ppns: 'P-1', tipo_concepto: 'HITO',
        id_fuente_cor: 1, factura: 'CFV-9131', moneda: 'USD',
        subtotal: 56823, iva: 9091.68, total: 65914.68, pagado: 1163.46,
        orden_hito: 1, hito_condicion: 'Anticipo'
      },
      {
        id_factura_cor: 102, ppns: 'P-1', tipo_concepto: 'HITO',
        id_fuente_cor: 1, factura: 'cfv-9131', moneda: 'USD',
        subtotal: 56823, iva: 9091.68, total: 65914.68, pagado: 1163.46,
        orden_hito: 1, hito_condicion: 'Anticipo'
      },
      {
        id_factura_cor: 201, ppns: 'P-1', tipo_concepto: 'HITO',
        id_fuente_cor: 2, factura: 'CFV-9242', moneda: 'USD',
        subtotal: 0, iva: 0, total: 0, pagado: 30590.72,
        orden_hito: 2, hito_condicion: 'Parcial Anticipo 1'
      },
      {
        id_factura_cor: 202, ppns: 'P-1', tipo_concepto: 'HITO',
        id_fuente_cor: 2, factura: 'CFV-9242', moneda: 'USD',
        subtotal: 0, iva: 0, total: 0, pagado: 30590.72,
        orden_hito: 2, hito_condicion: 'Parcial Anticipo 1'
      }
    ],
    listAditivasEstadoCuenta_cor: async () => [],
    listPagosEstadoCuenta_cor: async () => [],
    listRelacionesEstadoCuenta_cor: async () => []
  };

  const serviceModule = { exports: {} };
  vm.runInNewContext(read('backend/src/modules/cobranza-cor/cobranza-cor.service.js'), {
    module: serviceModule,
    require: () => repository
  });
  const detail = await serviceModule.exports.detalleEstadoCuenta_cor(
    'P-1',
    { dominio: 'CORELLIAN' }
  );

  assert.equal(detail.facturas.length, 2);
  const anticipoFactura = detail.facturas.find((row) => row.factura === 'CFV-9131');
  const parcialFactura = detail.facturas.find((row) => row.factura === 'CFV-9242');
  assert.deepEqual(Array.from(anticipoFactura.ids_factura_cor), [101, 102]);
  assert.equal(anticipoFactura.importe_pagado, 1163.46);
  assert.equal(anticipoFactura.saldo, 64751.22);
  assert.equal(anticipoFactura.estatus_factura, 'Parcial');
  assert.equal(parcialFactura.importe_pagado, 30590.72);
  assert.equal(parcialFactura.saldo, null);
  assert.equal(parcialFactura.estatus_factura, 'Aplicado a Anticipo');

  const anticipo = detail.estado_cuenta.find((row) => row.condicion === 'Anticipo');
  const parcial = detail.estado_cuenta.find((row) => row.condicion === 'Parcial Anticipo 1');
  assert.equal(anticipo.factura, 'CFV-9131');
  assert.equal(anticipo.pago_contabilizado, 31754.18);
  assert.equal(anticipo.pendiente_calculado, 34160.5);
  assert.equal(parcial.factura, 'CFV-9242');
  assert.equal(parcial.pago_contabilizado, 0);
  assert.equal(parcial.pago_aplicado_a_principal, 30590.72);
  assert.equal(parcial.pendiente_calculado, 0);
  assert.equal(parcial.aplicado_a_condicion, 'Anticipo');

  const usd = detail.resumen.monedas.find((row) => row.moneda === 'USD');
  assert.equal(usd.cobrado, 31754.18);
  assert.equal(usd.pendiente, 34160.5);
});

test('la tabla Facturas muestra Total interactivo, Pagado, Diferencia y Estatus real', async () => {
  const handlers = {};
  const view = {
    dataset: {},
    innerHTML: '',
    addEventListener(type, handler) { handlers[type] = handler; },
    querySelectorAll() { return []; }
  };
  const detail = {
    proyecto: { ppns: 'P-1', proyecto: 'Proyecto' },
    resumen: { monedas: [] },
    estado_cuenta: [],
    aditivas: [],
    pagos: [],
    relaciones_pagos: [],
    facturacion_catalogo: {},
    facturas: [{
      id_factura_cor: 101,
      ids_factura_cor: [101, 102],
      factura: 'CFV-9131',
      tipo_concepto: 'HITO',
      concepto: 'Hito 1 · Anticipo',
      moneda: 'USD',
      subtotal: 56823,
      iva: 9091.68,
      total: 65914.68,
      importe_pagado: 1163.46,
      saldo: 64751.22,
      estatus_factura: 'Parcial'
    }]
  };
  const window = {
    ManttoRouter: { getCurrent: () => ({ route: 'cobranza-estados-cuenta', payload: { ppns: 'P-1' } }) },
    ManttoHttp: { get: async () => detail },
    scrollTo() {},
    innerWidth: 1024,
    innerHeight: 768
  };
  const document = {
    getElementById: (id) => id === 'view-placeholder' ? view : null,
    createElement: () => ({}),
    head: { appendChild() {} },
    documentElement: { clientWidth: 1024, clientHeight: 768 }
  };
  vm.runInNewContext(read('modules/cobranza-cor/cobranza-cor-estados-cuenta.js'), {
    window,
    document
  });
  await window.ManttoCobranzaCorEstadosCuenta.init();

  const section = view.innerHTML.split('class="ccor-ec-card ccor-ec-facturas-section"')[1];
  assert.ok(section);
  for (const heading of ['Factura', 'Tipo', 'Concepto', 'Fecha', 'Mon', 'Total', 'Pagado', 'Diferencia', 'Estatus', 'Vencimiento']) {
    assert.match(section, new RegExp(`<th>${heading}</th>`));
  }
  assert.doesNotMatch(section, /<th>Subtotal<\/th>|<th>IVA<\/th>|<th>Estatus cobranza<\/th>/);
  assert.match(section, /data-factura-total-toggle/);
  assert.match(section, /data-subtotal="56823"/);
  assert.match(section, /data-iva="9091.68"/);
  assert.match(section, />1,163\.46<\/b>/);
  assert.match(section, /64,751\.22/);
  assert.match(section, />Parcial<\/span>/);
  assert.equal((section.match(/CFV-9131/g) || []).length, 1);
  assert.ok(handlers.click);
  assert.ok(handlers.keydown);
});

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('Aditivas del detalle se consultan en su tabla con el PPNS del registro FUENTE', async () => {
  const repositoryModule = { exports: {} };
  vm.runInNewContext(read('backend/src/modules/cobranza-cor/cobranza-cor.repository.js'), {
    module: repositoryModule,
    require: () => ({})
  });
  const repository = repositoryModule.exports;
  const queries = [];
  const connection = {
    query: async (sql, params) => {
      queries.push({ sql, params });
      return [[{
        id_aditiva_cor: 7, no_cot: 'COT-7', fecha_cot: '2026-09-30',
        departamento: 'Operaciones', equipo: 'Equipo A', descripcion: 'Trabajo adicional',
        estatus_trabajos: 'En proceso', moneda: 'mxn', monto_total: '1200.00',
        monto_pagado: '300.00', pendiente_pago: '900.00'
      }]];
    },
    release() {}
  };

  repository.getConnection_cor = async () => connection;
  repository.getEstadoCuentaByPpns_cor = async () => ({ ppns: 'FUENTE-123', proyecto: 'Proyecto', registros_estado_cuenta: 1 });
  repository.listFuenteEstadoCuenta_cor = async () => [];
  repository.listFacturasEstadoCuenta_cor = async () => [];
  repository.listPagosEstadoCuenta_cor = async () => [];
  repository.listRelacionesEstadoCuenta_cor = async () => [];

  const serviceModule = { exports: {} };
  vm.runInNewContext(read('backend/src/modules/cobranza-cor/cobranza-cor.service.js'), {
    module: serviceModule,
    require: () => repository
  });

  const detail = await serviceModule.exports.detalleEstadoCuenta_cor(' fuente-123 ', { dominio: 'CORELLIAN' });
  assert.equal(detail.proyecto.ppns, 'FUENTE-123');
  assert.equal(detail.aditivas.length, 1);
  assert.equal(detail.aditivas[0].no_cot, 'COT-7');
  assert.equal(detail.aditivas[0].moneda, 'MXN');
  assert.equal(detail.aditivas[0].monto_total, 1200);
  assert.equal(detail.aditivas[0].monto_pagado, 300);
  assert.equal(detail.aditivas[0].pendiente_pago, 900);
  assert.equal(detail.facturacion_catalogo.aditivas[0].id_concepto, 7);
  assert.equal(queries.length, 1);
  assert.deepEqual(Array.from(queries[0].params), ['FUENTE-123']);
  assert.match(queries[0].sql, /FROM cobranza_aditivas_cor a/);
  assert.match(queries[0].sql, /a\.activo = 1/);
  assert.match(queries[0].sql, /UPPER\(TRIM\(COALESCE\(a\.pp_ns, ''\)\)\) = UPPER\(TRIM\(COALESCE\(\?, ''\)\)\)/);
  for (const column of ['fecha_cot', 'departamento', 'equipo', 'estatus_trabajos', 'monto_total', 'monto_pagado', 'pendiente_pago']) {
    assert.match(queries[0].sql, new RegExp(column));
  }
});

test('El detalle muestra las diez columnas desde aditivas y escapa su contenido', async () => {
  const rootElement = { dataset: {}, innerHTML: '', addEventListener() {} };
  const detail = {
    proyecto: { ppns: 'FUENTE-123', proyecto: 'Proyecto' },
    resumen: { monedas: [] },
    estado_cuenta: [],
    facturas: [],
    facturacion_catalogo: { aditivas: [{ no_cot: 'OTRA-COT' }] },
    aditivas: [{
      no_cot: 'COT-1', fecha_cot: '2026-09-30', departamento: 'Ventas', equipo: 'Equipo A',
      descripcion: '<pieza>', estatus_trabajos: 'En proceso', moneda: 'MXN',
      monto_total: 1200, monto_pagado: 300, pendiente_pago: 900
    }]
  };
  const window = {
    ManttoRouter: { getCurrent: () => ({ route: 'cobranza-estados-cuenta', payload: { ppns: 'FUENTE-123' } }) },
    ManttoHttp: { get: async () => detail },
    scrollTo() {}
  };
  const document = {
    getElementById: (id) => id === 'view-placeholder' ? rootElement : null,
    createElement: () => ({}),
    head: { appendChild() {} }
  };
  vm.runInNewContext(read('modules/cobranza-cor/cobranza-cor-estados-cuenta.js'), { window, document });
  await window.ManttoCobranzaCorEstadosCuenta.init();

  const aditivasHtml = rootElement.innerHTML.split('class="ccor-ec-account-section is-aditivas"')[1];
  assert.ok(aditivasHtml);
  const headings = ['Cotización', 'Fecha Cot', 'Departamento', 'Equipo', 'Descripción', 'Estatus trabajos', 'Moneda', 'Total', 'Pagado', 'Pendiente'];
  let previous = -1;
  for (const heading of headings) {
    const position = aditivasHtml.indexOf(`<th>${heading}</th>`);
    assert.ok(position > previous, `${heading} debe aparecer en el orden solicitado`);
    previous = position;
  }
  assert.match(aditivasHtml, /COT-1/);
  assert.match(aditivasHtml, /&lt;pieza&gt;/);
  assert.doesNotMatch(aditivasHtml, /OTRA-COT|<pieza>/);
});

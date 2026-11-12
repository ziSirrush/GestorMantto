'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname,'..');
const read = (rel) => fs.readFileSync(path.join(ROOT,rel),'utf8');

test('Fuente expone datos crudos y Facturas expone pagado para calculos de frontend', () => {
  const service = read('backend/src/modules/cobranza-cor/cobranza-cor.service.js');
  const repository = read('backend/src/modules/cobranza-cor/cobranza-cor.repository.js');

  assert.match(service,/factura_fuente:\s*cleanText_cor\(row\?\.factura\)/);
  assert.match(service,/pago_total_fuente:\s*numberOrNull_cor\(row\?\.pago_total\)/);
  assert.match(service,/estatus_factura_fuente:\s*cleanText_cor\(row\?\.estatus_factura\)/);
  assert.match(service,/pagado:\s*numberOrNull_cor\(row\?\.pagado\)/);
  assert.match(repository,/cf\.pagado/);
});

test('Frontend suma PARCIAL por FACTURA y calcula estimado vencimiento y por cobrar', () => {
  const source = read('modules/cobranza-cor/cobranza-cor-estados-cuenta.js');
  const start = source.indexOf('  const DAY_MS_COR =');
  const end = source.indexOf('  function renderSummaryMini_cor',start);
  assert.ok(start >= 0 && end > start);

  const block = source.slice(start,end);
  const numberCor = (value) => {
    if(value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const factory = new Function(
    'number_cor',
    block + '\nreturn { applyFuenteRules_cor, buildFrontendSummary_cor };'
  );
  const { applyFuenteRules_cor, buildFrontendSummary_cor } = factory(numberCor);

  const detail = {
    facturas:[
      { factura:'CFV-7535', pagado:17384.92 },
      { factura:'cfv-7535', pagado:17384.92 },
      { factura:'OTRA-1', pagado:99999 }
    ],
    estado_cuenta:[
      {
        factura_fuente:'CFV-7535',
        factura:'CFV-7535',
        estatus_factura_fuente:'PARCIAL',
        pago_total_fuente:17384.92,
        total:34769.84,
        subtotal:29974,
        iva:4795.84,
        moneda:'USD',
        fecha_vencimiento:'2026-06-01',
        condiciones_pago_dias:15
      }
    ]
  };

  const rows = applyFuenteRules_cor(
    detail,
    new Date(2026,10,12,12,0,0)
  );

  assert.equal(rows.length,1);
  assert.equal(rows[0].pago_contabilizado,34769.84);
  assert.equal(rows[0].pendiente_calculado,0);
  assert.equal(rows[0].estimado_pago,'2026-06-16');
  assert.equal(rows[0].dias_vencimiento,149);
  assert.equal(rows[0].estatus_vencimiento,'VENCIDO');

  const summary = buildFrontendSummary_cor(rows);
  assert.equal(summary[0].cobrado,34769.84);
  assert.equal(summary[0].pendiente,0);
});

test('Frontend conserva negativos y marca CORRIENTE cuando DIAS DE VENCIDO es menor a 31', () => {
  const source = read('modules/cobranza-cor/cobranza-cor-estados-cuenta.js');
  const start = source.indexOf('  const DAY_MS_COR =');
  const end = source.indexOf('  function renderSummaryMini_cor',start);
  const block = source.slice(start,end);
  const numberCor = (value) => {
    if(value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const factory = new Function('number_cor',block + '\nreturn { applyFuenteRules_cor };');
  const { applyFuenteRules_cor } = factory(numberCor);

  const rows = applyFuenteRules_cor({
    facturas:[],
    estado_cuenta:[{
      factura_fuente:'CFV-1',
      estatus_factura_fuente:'PENDIENTE',
      pago_total_fuente:100,
      total:500,
      moneda:'MXN',
      fecha_vencimiento:'2026-11-20',
      condiciones_pago_dias:0
    }]
  },new Date(2026,10,12,12,0,0));

  assert.equal(rows[0].dias_vencimiento,-8);
  assert.equal(rows[0].estatus_vencimiento,'CORRIENTE');
  assert.equal(rows[0].pendiente_calculado,400);
});

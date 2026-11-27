'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const serviceSource = read('backend/src/modules/cobranza-cor/cobranza-cor.service.js');
const integrationSource = read('backend/src/modules/cobranza-cor/cobranza-cor-pagos-manuales.integration.js');
const frontSource = read('modules/cobranza-cor/cobranza-cor-estados-cuenta.js');
const cssSource = read('modules/cobranza-cor/cobranza-cor-estados-cuenta.css');
const loaderSource = read('core/module-loader.js');

const scope = { dominio: 'CORELLIAN' };
const invoices = [
  { id_factura_cor: 1, id_fuente_cor: 1, factura: 'QA-F-001', moneda: 'USD', total: '1000.00', hito_condicion: 'Anticipo' },
  { id_factura_cor: 2, id_fuente_cor: 2, factura: 'QA-F-002', moneda: 'USD', total: '1000.00', hito_condicion: 'Termino de fabricacion' },
  { id_factura_cor: 3, id_fuente_cor: 3, factura: 'QA-F-003', moneda: 'MXN', total: '2500.50', hito_condicion: 'Llegada a puerto' }
].map(f => ({ ...f, ppns: 'QA-PROY', tipo_concepto: 'HITO', pagado: '0.00', estatus_factura: 'No pagado', origen_registro: 'LEGACY_HITO', activo: 1, subtotal: f.total, iva: '0.00' }));
const sourceRows = [...invoices.map(f => ({
  id_fuente_cor: f.id_fuente_cor, id_proyecto_origen: f.ppns, condicion: f.hito_condicion,
  moneda: f.moneda, total: f.total, subtotal: f.total, iva: 0, fecha_pago: null, pago_total: 0
})), { id_fuente_cor: 4, id_proyecto_origen: 'QA-PROY', condicion: 'Finiquito', moneda: 'MXN', total: '2500.50', subtotal: '2500.50', iva: 0, fecha_pago: null, pago_total: 0 }];
const movements = invoices.map((f, n) => ({
  id_rel_pago: 101+n, id_factura_cor: f.id_factura_cor, importe_aplicado: f.total, estatus_pago: 'Pagado',
  origen_registro: 'LEGACY_SALDO', moneda: f.moneda, fecha_pago: ['2026-01-15','2026-02-15','2026-03-15'][n],
  factura: f.factura, id_rel_pago_origen: null
}));

function fixture({ facts = invoices, source = sourceRows, moves = movements, manual = true, oldrels = [] } = {}) {
  const calls = { ledger: 0, ns: 0 };
  const connection = {
    async query(sql) {
      if (sql.includes('FROM cobranza_rel_pagos r')) { calls.ledger++; return [moves]; }
      if (/^(SET TRANSACTION|START TRANSACTION)/.test(sql)) return [];
      throw new Error('SQL no esperado: ' + sql);
    },
    async commit() {}, async rollback() {}, release() {}
  };
  const repository = {
    getConnection_cor: async () => connection,
    pagosManualesSchemaReady_cor: async () => manual,
    getEstadoCuentaByPpns_cor: async () => ({ ppns:'QA-PROY', proyecto:'QA', registros_estado_cuenta:source.length }),
    listFuenteEstadoCuenta_cor: async () => source,
    listFacturasEstadoCuenta_cor: async () => facts,
    listAditivasEstadoCuenta_cor: async () => [],
    listCrearEstadoCuentaEquipos_cor: async () => [],
    listCrearEstadoCuentaLogOps_cor: async () => [],
    listEquiposEstadoCuenta_cor: async () => [],
    listPartidasEstadoCuenta_cor: async () => []
  };
  const ns = {
    listPagosEstadoCuenta_cor: async () => { calls.ns++; return []; },
    listRelacionesEstadoCuenta_cor: async () => { calls.ns++; return oldrels; }
  };
  const integration = { exports:{} };
  vm.runInNewContext(integrationSource, {
    module: integration, process: { env:{} },
    require: name => name.endsWith('manuales.service') ? { FLAG:'FLAG', createService_cor:()=>({}) }
      : name.endsWith('repository') ? repository : { hasEffectivePermission:async()=>false }
  });
  const service = { exports:{} };
  vm.runInNewContext(serviceSource, {
    module: service, process: { env:{} },
    require: name => name.endsWith('pagos.repository') ? ns
      : name.endsWith('manuales.integration') ? integration.exports : repository
  });
  return { api:service.exports, calls };
}
const detail = f => f.api.detalleEstadoCuenta_cor('QA-PROY',scope);
const invoice = (d,id) => d.facturas.find(f=>f.id_factura_cor===id);
const summary = (d,mon) => d.resumen.monedas.find(r=>r.moneda===mon);

test('REL Pagos recuperados alimentan Facturas, Hitos y resumen aunque Facturas.pagado este en cero', async () => {
  const f=fixture(), d=await detail(f);
  assert.equal(d.pagos_manuales.movimientos.length,3);
  assert.equal(summary(d,'USD').cobrado,2000);
  assert.equal(summary(d,'USD').pendiente,0);
  assert.equal(summary(d,'MXN').cobrado,2500.50);
  assert.equal(summary(d,'MXN').pendiente,2500.50);
  assert.equal(summary(d,'USD').porcentaje_cobrado_calculado,1);
  assert.equal(summary(d,'MXN').porcentaje_cobrado_calculado,0.5);
  assert.ok(d.facturas.every(f=>f.estatus_factura==='Pagado'&&f.saldo===0));
  assert.equal(d.estado_cuenta[0].fecha_pago,'2026-01-15');
  assert.equal(f.calls.ledger,1);
  assert.equal(f.calls.ns,0);
});
test('cancelaciones y devoluciones compensan el neto y no reusan fechas de Fuente', async () => {
  for(const status of ['Cancelado','Devuelto']){
    const reverse={...movements[0],id_rel_pago:200,id_rel_pago_origen:101,importe_aplicado:'-1000.00',estatus_pago:status,fecha_pago:'2026-11-27'};
    const d=await detail(fixture({
      source:sourceRows.map(r=>({...r,fecha_pago:'2026-01-01'})),
      moves:[...movements,reverse]
    }));
    assert.equal(invoice(d,1).importe_pagado,0);
    assert.equal(invoice(d,1).saldo,1000);
    assert.equal(invoice(d,1).estatus_factura,'No pagado');
    assert.equal(d.estado_cuenta[0].fecha_pago,null);
    assert.equal(d.estado_cuenta[0].fechas_pago.length,0);
    assert.equal(d.estado_cuenta[1].fecha_pago,'2026-02-15');
    assert.equal(d.estado_cuenta[3].fecha_pago,null);
    assert.equal(summary(d,'USD').cobrado,1000);
  }
});
test('dos pagos parciales suman sus importes, no sus acumulados historicos', async () => {
  const partial={...movements[0],importe_aplicado:'100.00',estatus_pago:'Parcial'};
  const d=await detail(fixture({moves:[partial,...movements.slice(1),{...partial,id_rel_pago:202,importe_aplicado:'50.00'}]}));
  assert.equal(invoice(d,1).importe_pagado,150);
  assert.equal(invoice(d,1).saldo,850);
  assert.equal(invoice(d,1).estatus_factura,'Parcial');
});
test('consolida duplicados de factura sin duplicar ni perder movimientos', async () => {
  const d=await detail(fixture({facts:[...invoices,{...invoices[0],id_factura_cor:9,pagado:'1000.00'}],
    moves:[{...movements[0],id_factura_cor:9},...movements.slice(1)]}));
  assert.equal(d.facturas.length,3);
  assert.equal(invoice(d,1).importe_pagado,1000);
  assert.equal(summary(d,'USD').cobrado,2000);
});
test('REL Pagos determina excedentes y saldo a favor', async () => {
  const d=await detail(fixture({moves:[{...movements[0],importe_aplicado:'1100.25'},...movements.slice(1)]}));
  assert.equal(invoice(d,1).saldo_a_favor,100.25);
  assert.equal(invoice(d,1).saldo,0);
});
test('sin movimientos despues de migrar no se contabilizan importes historicos obsoletos', async () => {
  const d=await detail(fixture({facts:invoices.map(f=>({...f,pagado:'999.00',estatus_factura:'Pagado'})),moves:[]}));
  assert.ok(d.facturas.every(f=>f.importe_pagado===0));
  assert.equal(summary(d,'USD').cobrado,0);
});
test('antes de migrar se conserva el fallback original y la consulta NS', async () => {
  const f=fixture({manual:false,facts:invoices.map(f=>({...f,pagado:'123.00'})),moves:[]});
  const d=await detail(f);
  assert.ok(d.facturas.every(f=>f.importe_pagado===123));
  assert.equal(f.calls.ns,2);
  assert.equal(f.calls.ledger,0);
});
test('formulario de Estado de Cuenta usa el mismo neto de REL Pagos', async () => {
  const f=fixture(), form=await f.api.formularioEstadoCuenta_cor('QA-PROY',scope);
  assert.equal(form.hitos[0].pago_contabilizado,1000);
  assert.equal(form.hitos[2].pago_contabilizado,2500.50);
  assert.equal(f.calls.ledger,1);
  assert.equal(f.calls.ns,0);
});
test('se mantiene la consolidacion de Parcial Anticipo con total cero por moneda', async () => {
  const d=await detail(fixture({
    facts:[...invoices,{...invoices[0],id_factura_cor:5,id_fuente_cor:5,factura:'QA-F-004',hito_condicion:'Parcial Anticipo 1',total:0,subtotal:0}],
    source:[...sourceRows,{id_fuente_cor:5,condicion:'Parcial Anticipo 1',moneda:'USD',total:0,subtotal:0,iva:0}],
    moves:[{...movements[0],importe_aplicado:'100.00'},...movements.slice(1),{...movements[0],id_rel_pago:300,id_factura_cor:5,importe_aplicado:'200.00'}]
  }));
  assert.equal(d.estado_cuenta[0].pago_consolidado_anticipo,300);
  assert.equal(d.estado_cuenta[0].pendiente_calculado,700);
  assert.equal(summary(d,'USD').cobrado,1300);
  assert.equal(invoice(d,5).estatus_factura,'Aplicado a Anticipo');
});
test('frontend distingue No pagado, Pagado y Parcial', () => {
  const start=frontSource.indexOf('  function statusClass_cor(');
  const end=frontSource.indexOf('\n  }',start);
  assert.ok(start>=0&&end>start);
  const classify=new Function(frontSource.slice(start,end+4)+'\nreturn statusClass_cor;')();
  assert.equal(classify('No pagado'),'is-danger');
  assert.equal(classify('Pagado'),'is-ok');
  assert.equal(classify('Parcial'),'is-warn');
});
test('encabezados numericos coinciden con celdas y se actualiza cache de ambos recursos', () => {
  const facturas = frontSource.match(/<thead><tr><th>Factura<\/th><th>Tipo<\/th><th>Concepto<\/th><th>Fecha<\/th><th>Mon<\/th><th>Total<\/th><th>Pagado<\/th><th>Diferencia<\/th><th>Estatus<\/th><th>Vencimiento<\/th><\/tr><\/thead>/);
  const pagos=frontSource.match(/<thead><tr><th>Factura<\/th><th>Valor<\/th><th>Mon<\/th><th>Fecha de Pago<\/th><th>Estatus<\/th><th>TDC<\/th>/);
  assert.ok(facturas&&pagos);
  for(const column of [6,7,8]) assert.ok(cssSource.includes('.ccor-ec-facturas-table thead th:nth-child('+column+')'));
  assert.match(cssSource,/\.ccor-ec-pagos-manuales-table thead th:nth-child\(2\)\{text-align:right\}/);
  assert.match(loaderSource,/cobranza-cor-estados-cuenta\.css\?v=20261001-cobranza-pagos-detalle-v001-manuales-v002/);
  assert.match(loaderSource,/cobranza-cor-estados-cuenta\.js\?v=20261118-ds-f1-v001-manuales-v004/);
});

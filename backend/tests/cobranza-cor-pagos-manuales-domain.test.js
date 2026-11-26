'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizarPago_cor, contramovimiento_cor, saldoFactura_cor, fechaOperativa_cor } = require('../src/modules/cobranza-cor/cobranza-cor-pagos-manuales.domain');
const parcial = { importe_aplicado: '10000.00', fecha_pago: '2026-11-26', estatus_pago: 'Parcial' };
const pago = (value, estatus = 'Parcial') => normalizarPago_cor({ ...parcial, importe_aplicado: value, estatus_pago: estatus }, 'MXN');
const original = { ...pago('10000', 'Pagado'), id_rel_pago: 11, id_factura_cor: 22 };
const now = new Date('2026-11-27T02:00:00Z');

test('varios pagos y acumulacion exacta en la moneda de la factura', () => {
  assert.deepEqual(saldoFactura_cor('10000', [pago('4000'), pago('3000.25')]), {
    pagado: '7000.25', saldo_pendiente: '2999.75', saldo_a_favor: '0.00', estatus_factura: 'Parcial'
  });
  assert.equal(saldoFactura_cor('0.30', [pago('0.10'), pago('0.20')]).pagado, '0.30');
});

test('excedente conserva el valor y muestra saldo a favor', () => {
  assert.deepEqual(saldoFactura_cor('10000', [pago('11000', 'Pagado')]), {
    pagado: '11000.00', saldo_pendiente: '0.00', saldo_a_favor: '1000.00', estatus_factura: 'Pagado'
  });
});

test('cancelacion y devolucion completas mantienen original y reabren saldo', () => {
  for (const estatus of ['Cancelado', 'Devuelto']) {
    const reverse = contramovimiento_cor(original, estatus, 31, { now });
    assert.equal(reverse.importe_aplicado, '-10000.00');
    assert.equal(reverse.fecha_pago, '2026-11-26');
    assert.equal(reverse.estatus_pago, estatus);
    assert.equal(reverse.id_rel_pago_origen, 11);
    assert.equal(reverse.id_factura_cor, 22);
    assert.equal(reverse.created_by, 31);
    assert.equal(original.importe_aplicado, '10000.00');
    assert.deepEqual(saldoFactura_cor('10000', [original, reverse]), {
      pagado: '0.00', saldo_pendiente: '10000.00', saldo_a_favor: '0.00', estatus_factura: 'No pagado'
    });
    assert.throws(() => contramovimiento_cor(original, estatus, 31, { yaRevertido: true }), /nuevamente/);
    assert.throws(() => contramovimiento_cor(reverse, estatus, 31), /nuevamente/);
  }
});

test('USD con TDC conserva moneda, valor y equivalente al revertir', () => {
  const usd = normalizarPago_cor({ ...parcial, importe_aplicado: '123.45', tipo_cambio: '20.123456' }, 'USD');
  assert.equal(usd.importe_aplicado, '123.45');
  assert.equal(usd.importe_mxn, '2484.24');
  const reverse = contramovimiento_cor({ ...usd, id_rel_pago: 12, id_factura_cor: 23 }, 'Devuelto', 31, { now });
  assert.equal(reverse.importe_aplicado, '-123.45');
  assert.equal(reverse.importe_mxn, '-2484.24');
  assert.equal(reverse.tipo_cambio, usd.tipo_cambio);
  assert.equal(normalizarPago_cor(parcial, 'USD').importe_mxn, null);
});

test('estatus manual no se sustituye por el estatus calculado de la factura', () => {
  assert.equal(pago('10000', 'Parcial').estatus_pago, 'Parcial');
  assert.equal(saldoFactura_cor('10000', [pago('10000', 'Parcial')]).estatus_factura, 'Pagado');
});

test('rechaza captura negativa, estados de reversion, TDC y fecha invalidos', () => {
  for (const value of ['0', '-1', '1.001', '1e3', '10000000000000000']) assert.throws(() => pago(value));
  for (const status of ['Cancelado', 'Devuelto', 'Otro']) assert.throws(() => pago('1', status));
  assert.throws(() => normalizarPago_cor({ ...parcial, tipo_cambio: '20' }, 'MXN'));
  assert.throws(() => normalizarPago_cor({ ...parcial, tipo_cambio: '0' }, 'USD'));
  assert.throws(() => normalizarPago_cor({ ...parcial, fecha_pago: '2026-02-30' }, 'USD'));
  assert.throws(() => normalizarPago_cor(parcial, null));
  assert.throws(() => contramovimiento_cor(original, 'Cancelado', null));
  assert.throws(() => saldoFactura_cor('10000', [{ importe_aplicado: '-10', estatus_pago: 'Cancelado' }]));
  assert.throws(() => saldoFactura_cor('10000', [{ importe_aplicado: '10', estatus_pago: 'Devuelto' }]));
  assert.equal(fechaOperativa_cor(now), '2026-11-26');
});

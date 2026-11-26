'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createService_cor } = require('../src/modules/cobranza-cor/cobranza-cor-pagos-manuales.service');
const input = { ppns: 'P1', facturaId: 4, actor: 8, informationAccess: { dominio: 'CORELLIAN', actor_user_id: 8, requiere_filtro_usuario: true, usuarios_visibles: [8] }, payload: { importe_aplicado: '4000.00', fecha_pago: '2026-11-26', estatus_pago: 'Parcial' } };
function fixture({ enabled = true, allowed = true, total = '10000.00', moneda = 'MXN', pagado = '0.00', rows = [], duplicate = false, scoped = true, failUpdate = false } = {}) {
  const events = [];
  const fact = { id_factura_cor: 4, ppns: 'P1', tipo_concepto: 'HITO', id_fuente_cor: 2, factura: 'F123', moneda, total, pagado, estatus_factura: 'No pagado' };
  let movements = structuredClone(rows);
  let pending;
  let nextId = 100;
  const connection = {
    async beginTransaction() { events.push('begin'); pending = { fact: { ...fact }, rows: structuredClone(movements) }; },
    async commit() { events.push('commit'); pending = null; },
    async rollback() { events.push('rollback'); Object.assign(fact, pending.fact); movements = pending.rows; pending = null; },
    release() { events.push('release'); },
    async query(sql, args) {
      if (sql.startsWith('SELECT id_factura_cor')) { assert.equal(args[0], 'P1'); assert.match(sql, /FOR UPDATE/); events.push('lock-facturas'); return [duplicate ? [fact, { ...fact, id_factura_cor: 5, factura: 'f123 MXN' }] : [fact]]; }
      if (sql.startsWith('SELECT id_rel_pago')) { assert.equal(args[0], 4); assert.match(sql, /FOR UPDATE/); events.push('lock-pagos'); return [structuredClone(movements)]; }
      if (sql.startsWith('INSERT INTO cobranza_rel_pagos')) {
        assert.match(sql, /VALUES \(NULL,/); events.push('insert');
        const names = sql.match(/\(id_pago_cor, (.*?)\) VALUES/)[1].split(', ');
        const row = Object.fromEntries(names.map((name, index) => [name, args[index]]));
        row.id_rel_pago = nextId++; movements.push(row); return [{ insertId: row.id_rel_pago }];
      }
      if (sql.startsWith('UPDATE cobranza_rel_pagos')) {
        events.push('edit'); const row = movements.find(r => r.id_rel_pago === args[6]);
        Object.assign(row, Object.fromEntries(['importe_aplicado','fecha_pago','estatus_pago','tipo_cambio','importe_mxn','updated_by'].map((name,index) => [name,args[index]]))); return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('UPDATE cobranza_facturas_cor')) {
        events.push('update-factura'); if (failUpdate) throw new Error('DB error');
        fact.pagado = args[0]; fact.estatus_factura = args[1]; assert.equal(args[2], 8); return [{ affectedRows: 1 }];
      }
      throw new Error('SQL inesperado: ' + sql);
    }
  };
  const repository = { async getConnection_cor() { events.push('connection'); return connection; }, async getEstadoCuentaByPpns_cor(_c, ppns, visible) { assert.equal(ppns, 'P1'); assert.deepEqual(visible, [8]); return scoped ? { ppns: 'P1' } : null; } };
  const service = createService_cor({ repository, enabled: () => enabled, authorizeMutation: async () => allowed });
  return { service, events, fact, movements: () => movements };
}

test('deshabilitado o sin permiso no abre conexion', async () => {
  for (const options of [{ enabled: false }, { allowed: false }]) {
    const f = fixture(options); await assert.rejects(f.service.crear(input)); assert.deepEqual(f.events, []);
  }
  const f = fixture(); await assert.rejects(f.service.crear({ ...input, actor: 9 }), /Actor/); assert.deepEqual(f.events, []);
});
test('crea varios pagos y conserva estatus manual, excedente y acumulado', async () => {
  const f = fixture(); const first = await f.service.crear(input);
  assert.equal(first.pagado, '4000.00'); assert.equal(first.saldo_pendiente, '6000.00');
  const second = await f.service.crear({ ...input, payload: { ...input.payload, importe_aplicado: '7000.00' } });
  assert.equal(second.pagado, '11000.00'); assert.equal(second.saldo_a_favor, '1000.00'); assert.equal(f.fact.estatus_factura, 'Pagado');
  assert.equal(f.movements()[1].estatus_pago, 'Parcial'); assert.equal(f.movements()[1].origen_registro, 'MANUAL');
  await assert.rejects(f.service.crear(input), /liquidada/); assert.equal(f.movements().length, 2);
});
test('editar y revertir son atomicos; bloquea original y contramovimiento', async () => {
  const f = fixture(); const created = await f.service.crear(input);
  await f.service.editar({ ...input, pagoId: created.id_rel_pago, payload: { ...input.payload, importe_aplicado: '10000.00', estatus_pago: 'Pagado' } });
  const reverse = await f.service.revertir({ ...input, pagoId: created.id_rel_pago, payload: { estatus_pago: 'Devuelto' } });
  assert.equal(reverse.saldo_pendiente, '10000.00'); assert.equal(f.fact.pagado, '0.00');
  assert.deepEqual(f.movements().map(row => row.importe_aplicado), ['10000.00', '-10000.00']);
  assert.equal(f.movements()[1].id_rel_pago_origen, created.id_rel_pago); assert.equal(f.movements()[1].created_by, 8);
  for (const pagoId of [created.id_rel_pago, reverse.id_rel_pago]) {
    await assert.rejects(f.service.editar({ ...input, pagoId }), /bloqueada/);
    await assert.rejects(f.service.revertir({ ...input, pagoId, payload: { estatus_pago: 'Cancelado' } }), /bloqueada/);
  }
});
test('TDC se registra y revierte en la moneda original', async () => {
  const f = fixture({ moneda: 'USD' });
  const created = await f.service.crear({ ...input, payload: { ...input.payload, importe_aplicado: '100.00', tipo_cambio: '20.000000' } });
  assert.equal(f.movements()[0].importe_mxn, '2000.00');
  await f.service.revertir({ ...input, pagoId: created.id_rel_pago, payload: { estatus_pago: 'Cancelado' } });
  assert.equal(f.movements()[1].importe_mxn, '-2000.00'); assert.equal(f.fact.pagado, '0.00');
});
test('historico sin conciliar, duplicados y alcance ajeno fallan cerrado', async () => {
  for (const options of [{ pagado: '4000.00' }, { duplicate: true }, { scoped: false }]) {
    const f = fixture(options); await assert.rejects(f.service.crear(input));
    assert.ok(f.events.includes('rollback')); assert.ok(!f.events.includes('insert')); assert.equal(f.events.at(-1), 'release');
  }
});
test('si falla actualizar Facturas se revierte la insercion del pago', async () => {
  const f = fixture({ failUpdate: true }); await assert.rejects(f.service.crear(input), /DB error/);
  assert.equal(f.movements().length, 0); assert.equal(f.fact.pagado, '0.00');
  assert.deepEqual(f.events, ['connection','begin','lock-facturas','lock-pagos','insert','update-factura','rollback','release']);
});

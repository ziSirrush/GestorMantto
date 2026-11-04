'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const { createPrestamosSyncService, normalizePayload } = require('../src/modules/almacen/almacen.prestamos-sync-service');
const { createPrestamosSyncRouter } = require('../src/modules/almacen/almacen.prestamos-sync-routes');
const idLote = 'dbb3c0da-21da-4a66-8888-123456789abc';
const row = () => ({ id_articulo_ns: '123', nombre_articulo: 'Articulo', cantidad: '2', costo_unitario: '10.5', correo_seguimiento: 'seguimiento@example.test', sitio: 'AD 1' });
const payload = filas => ({ idLote, filas: filas || [row()] });
function fakeDb({ seed = [], busy = false, failInsert = 0 } = {}) {
  let records = [...seed], pending = [], calls = [], inserts = 0;
  const conn = {
    async query(sql, values) {
      calls.push(sql);
      if (sql.includes('GET_LOCK')) return [[{ acquired: busy ? 0 : 1 }]];
      if (sql.includes('RELEASE_LOCK')) return [[{ released: 1 }]];
      if (sql.includes('COUNT(*)')) return [[{ total: records.length }]];
      if (sql.startsWith('SELECT hash_fila')) return [records.filter(r => r.ultimo_lote_id === values[0])];
      if (sql.startsWith('INSERT')) {
        if (++inserts === failInsert) throw new Error('simulated insert failure');
        const columns = sql.slice(sql.indexOf('(') + 1, sql.indexOf(')')).split(',').map(x => x.replace(/`/g, ''));
        for (let i = 0; i < values.length; i += columns.length) pending.push(Object.fromEntries(columns.map((key, j) => [key, values[i + j]])));
        return [{ affectedRows: pending.length }];
      }
      throw new Error('Unexpected query: ' + sql);
    },
    async beginTransaction() { calls.push('begin'); pending = []; },
    async commit() { calls.push('commit'); records.push(...pending); pending = []; },
    async rollback() { calls.push('rollback'); pending = []; },
    release() { calls.push('release'); }, destroy() { calls.push('destroy'); }
  };
  return { async getConnection() { calls.push('acquire'); return conn; }, calls, records: () => records };
}
test('initial insert preserves supplied values, optional valor is null, identical replay is idempotent', async () => {
  const db = fakeDb(), service = createPrestamosSyncService(db);
  const result = await service.loadInitial(payload());
  assert.equal(result.insertados, 1);
  assert.equal(db.records()[0].costo_unitario, '10.500000');
  assert.equal(db.records()[0].valor, null);
  assert.equal(db.records()[0].correo_seguimiento, 'seguimiento@example.test');
  assert.equal(db.records()[0].sitio, 'AD 1');
  assert.equal((await service.loadInitial(payload())).repetido, true);
  assert.equal(db.records().length, 1);
});
test('valor from frontend is preserved without recalculation', async () => {
  const db = fakeDb();
  await createPrestamosSyncService(db).loadInitial(payload([{ ...row(), valor: '99.1234' }]));
  assert.equal(db.records()[0].valor, '99.1234');
});
test('rejects invalid data before acquiring a connection', async () => {
  const invalid = [{ ...row(), id_articulo_ns: null }, { ...row(), id_articulo_ns: 9007199254740992 },
    { ...row(), fecha_evento: '2026-02-30' }, { ...row(), costo_unitario: '1.0000001' },
    { ...row(), cantidad: true }, { ...row(), valor: '1,234' }, { ...row(), nombre_articulo: ' ' },
    { ...row(), correo_seguimiento: 'x'.repeat(256) }, { ...row(), id_prestamo: 1 }];
  for (const item of invalid) {
    const db = fakeDb();
    await assert.rejects(createPrestamosSyncService(db).loadInitial(payload([item])), { statusCode: 422 });
    assert.deepEqual(db.calls, []);
  }
  assert.throws(() => normalizePayload(payload([])), { statusCode: 422 });
  assert.throws(() => normalizePayload(payload(Array(5001).fill(row()))), { statusCode: 422 });
  assert.equal(normalizePayload(payload([{ ...row(), id_articulo_ns: '18446744073709551615' }])).rows[0].id_articulo_ns, '18446744073709551615');
});
test('existing table or changed retry is rejected without writes', async () => {
  const db = fakeDb(), service = createPrestamosSyncService(db);
  await service.loadInitial(payload());
  await assert.rejects(service.loadInitial(payload([{ ...row(), cantidad: '3' }])), { statusCode: 409 });
  await assert.rejects(service.loadInitial({ ...payload(), idLote: 'ebc3c0da-21da-4a66-8888-123456789abc' }), { statusCode: 409 });
  assert.equal(db.records().length, 1);
});
test('rolls back every chunk after a late insert error and releases the lock', async () => {
  const db = fakeDb({ failInsert: 2 });
  await assert.rejects(createPrestamosSyncService(db).loadInitial(payload(Array.from({length: 101}, row))), /simulated insert failure/);
  assert.equal(db.records().length, 0);
  assert.ok(db.calls.includes('rollback'));
  assert.ok(db.calls.some(sql => sql.includes('RELEASE_LOCK')));
  assert.equal(db.calls.at(-1), 'release');
});
test('busy load does not start a transaction', async () => {
  const db = fakeDb({ busy: true });
  await assert.rejects(createPrestamosSyncService(db).loadInitial(payload()), { statusCode: 409 });
  assert.ok(!db.calls.includes('begin'));
  assert.equal(db.calls.at(-1), 'release');
});
test('real HTTP router requires valid Ventas HMAC even when integration flag is off', async t => {
  const old = { ...process.env };
  Object.assign(process.env, { INTEGRATION_VENTAS_ID: 'ventas-appscript', INTEGRATION_VENTAS_SECRET: 'test-ventas', INTEGRATION_ALMACEN_SECRET: 'test-almacen', INTEGRATION_AUTH_ENABLED: 'false' });
  t.after(() => { for (const key of ['INTEGRATION_VENTAS_ID','INTEGRATION_VENTAS_SECRET','INTEGRATION_ALMACEN_SECRET','INTEGRATION_AUTH_ENABLED']) { if (old[key] === undefined) delete process.env[key]; else process.env[key] = old[key]; } });
  const db = fakeDb();
  const app = express();
  app.use(express.json({ verify(req, _res, buffer) { req.rawBody = buffer; } }));
  app.use('/api/almacen', createPrestamosSyncRouter(db));
  app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({code: error.code}));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const path = '/api/almacen/prestamos/sync', url = `http://127.0.0.1:${server.address().port}${path}`;
  const body = JSON.stringify(payload()), timestamp = String(Math.floor(Date.now() / 1000));
  function headers(id, secret, signedPath = path) {
    return { 'Content-Type': 'application/json', 'X-Integration-Id': id, 'X-Integration-Timestamp': timestamp,
      'X-Integration-Signature': crypto.createHmac('sha256', secret).update(`${timestamp}\nPOST\n${signedPath}\n${body}`).digest('hex') };
  }
  assert.equal((await fetch(url, {method: 'POST', headers: {'Content-Type':'application/json'}, body})).status, 401);
  assert.equal((await fetch(url, {method: 'POST', headers: headers('almacen-appscript', 'test-almacen'), body})).status, 401);
  assert.equal((await fetch(url, {method: 'POST', headers: headers('ventas-appscript', 'test-ventas', '/wrong'), body})).status, 401);
  assert.equal(db.records().length, 0);
  assert.equal((await fetch(url, {method: 'POST', headers: headers('ventas-appscript', 'test-ventas'), body})).status, 201);
  const replay = await fetch(url, {method: 'POST', headers: headers('ventas-appscript', 'test-ventas'), body});
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).repetido, true);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'portal-blt-test-secret-0123456789';
const service = require('../src/modules/portal-blt-jf/portal-blt-jf.service');

const user = { id_SB: 7, nombre: 'Prueba', correo: 'prueba@blt.mx' };

test('el pase se valida y devuelve vista y usuario', () => {
  const { pase, url, expires_in } = service.issuePass(user, 'movimientos');
  assert.equal(expires_in, 120);
  assert.match(url, /^https:\/\/bltmexico\.duckdns\.org\/embed\/movimientos\/#pase=/);
  const data = service.verifyPass(pase);
  assert.equal(data.vista, 'movimientos');
  assert.deepEqual(data.usuario, { id: 7, nombre: 'Prueba', correo: 'prueba@blt.mx' });
});

test('el pase no sirve como sesión de BLT NOW', () => {
  const { pase } = service.issuePass(user, 'movimientos');
  assert.throws(() => jwt.verify(pase, process.env.JWT_SECRET, { audience: 'blt-now-access' }));
});

test('se rechazan vistas desconocidas, pases vencidos y otros tokens', () => {
  assert.throws(() => service.issuePass(user, 'otra'), { status: 400 });
  const vencido = jwt.sign({ token_use: 'portal_blt_embed', vista: 'movimientos', usuario: { id: 7 } }, process.env.JWT_SECRET,
    { audience: 'portal-blt-embed', issuer: 'blt-now-api', expiresIn: -10 });
  assert.throws(() => service.verifyPass(vencido), { status: 401 });
  const acceso = jwt.sign({ id_SB: 7, token_use: 'access' }, process.env.JWT_SECRET,
    { audience: 'blt-now-access', issuer: 'blt-now-api', expiresIn: 60 });
  assert.throws(() => service.verifyPass(acceso), { status: 401 });
  assert.throws(() => service.verifyPass(''), { status: 401 });
});

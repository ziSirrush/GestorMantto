'use strict';
// [Aster | 2026-10-29 | ASTER-MG | QA AST-03 TLS AIVEN V001]
const test = require('node:test');
const assert = require('node:assert/strict');
const tls = require('node:tls');
const { buildAivenTlsOptions } = require('../src/config/aiven-tls');

test('Aiven TLS siempre verifica identidad y CA', () => {
  assert.deepEqual(buildAivenTlsOptions({ DB_SSL:'true' }), { rejectUnauthorized:true });
  assert.deepEqual(buildAivenTlsOptions({}), { rejectUnauthorized:true });
  assert.throws(() => buildAivenTlsOptions({ DB_SSL:'false' }), /DB_SSL debe estar habilitado/);
  assert.throws(() => buildAivenTlsOptions({ DB_SSL:'0' }), /DB_SSL debe estar habilitado/);
});

test('CA PEM y Base64 de Azure se validan sin desactivar SSL', () => {
  const cert = tls.rootCertificates[0];
  const raw = buildAivenTlsOptions({ DB_SSL_CA_PEM:cert });
  assert.equal(raw.ca,cert);
  assert.equal(raw.rejectUnauthorized,true);
  const encoded = buildAivenTlsOptions({ DB_SSL_CA_BASE64:Buffer.from(cert).toString('base64') });
  assert.equal(encoded.ca,cert);
  assert.equal(encoded.rejectUnauthorized,true);
  assert.throws(() => buildAivenTlsOptions({ DB_SSL_CA_BASE64:'abcd' }), /certificado PEM/);
  assert.throws(() => buildAivenTlsOptions({ DB_SSL_CA_PEM:'abc' }), /certificado PEM/);
  assert.throws(() => buildAivenTlsOptions({ DB_SSL_CA_PEM:cert, DB_SSL_CA_FILE:'ca.pem' }), /solo una fuente/);
});

test('CA desde archivo local: se lee y se valida', () => {
  const cert = tls.rootCertificates[0];
  const got = buildAivenTlsOptions({ DB_SSL_CA_FILE:'/tmp/aiven-ca.pem' }, (path,encoding)=>{
    assert.equal(path,'/tmp/aiven-ca.pem');
    assert.equal(encoding,'utf8');
    return cert;
  });
  assert.equal(got.ca,cert);
});

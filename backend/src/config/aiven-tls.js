'use strict';
// [Aster | 2026-10-29 | ASTER-MG | AST-03 AIVEN TLS VERIFICADO V001]
const fs = require('node:fs');
const tls = require('node:tls');

function buildAivenTlsOptions(env = process.env, readFile = fs.readFileSync) {
  const tlsMode = String(env.DB_SSL ?? 'true').trim().toLowerCase();
  if (!['true', '1', 'yes', 'on'].includes(tlsMode)) {
    throw new Error('DB_SSL debe estar habilitado: Aiven requiere TLS con certificado validado.');
  }

  const sources = [
    ['DB_SSL_CA_PEM', String(env.DB_SSL_CA_PEM || '').trim()],
    ['DB_SSL_CA_BASE64', String(env.DB_SSL_CA_BASE64 || '').trim()],
    ['DB_SSL_CA_FILE', String(env.DB_SSL_CA_FILE || '').trim()]
  ].filter(([, value]) => Boolean(value));
  if (sources.length > 1) {
    throw new Error('Configura solo una fuente CA: DB_SSL_CA_PEM, DB_SSL_CA_BASE64 o DB_SSL_CA_FILE.');
  }

  let ca = '';
  if (sources.length) {
    const [name, value] = sources[0];
    if (name === 'DB_SSL_CA_PEM') ca = value.replace(/\\n/g, '\n');
    if (name === 'DB_SSL_CA_BASE64') {
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) {
        throw new Error('DB_SSL_CA_BASE64 no contiene un certificado Base64 valido.');
      }
      ca = Buffer.from(value, 'base64').toString('utf8');
    }
    if (name === 'DB_SSL_CA_FILE') ca = String(readFile(value, 'utf8'));
    if (!ca.includes('-----BEGIN CERTIFICATE-----')) {
      throw new Error('La CA configurada no contiene un certificado PEM valido.');
    }
    // Verifica la estructura de la CA antes de abrir conexiones a MySQL.
    tls.createSecureContext({ ca });
  }

  return ca
    ? { rejectUnauthorized: true, ca }
    : { rejectUnauthorized: true };
}

module.exports = { buildAivenTlsOptions };

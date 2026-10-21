'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'backend', 'src', 'config', 'db.js'),
  'utf8'
);

test('cada instancia limita por defecto su ocupación de conexiones Aiven', () => {
  assert.match(source, /DB_CONNECTION_LIMIT_CAP,\s*2/);
  assert.match(source, /Math\.min\(requestedConnectionLimit, connectionLimitCap\)/);
  assert.match(source, /connectionLimit,/);
});

test('el pool libera conexiones ociosas después de la ráfaga', () => {
  assert.match(source, /maxIdle:\s*maxIdleConnections/);
  assert.match(source, /DB_MAX_IDLE_CONNECTIONS,\s*1/);
  assert.match(source, /DB_IDLE_TIMEOUT_MS,\s*30000/);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  isConnectionCapacityError,
  createConnectionPressureGuard
} = require('../backend/src/config/db-capacity-guard');

const ROOT = path.resolve(__dirname, '..');

test('reconoce exclusivamente la saturación de conexiones MySQL', () => {
  assert.equal(isConnectionCapacityError({ code:'ER_CON_COUNT_ERROR', errno:1040 }), true);
  assert.equal(isConnectionCapacityError({ errno:1040 }), true);
  assert.equal(isConnectionCapacityError({ code:'ER_NO_SUCH_TABLE', errno:1146 }), false);
});

test('abre un cortacircuito temporal y conserva una respuesta HTTP recuperable', () => {
  let timestamp = 10000;
  const guard = createConnectionPressureGuard({ now:()=>timestamp, backoffMs:5000 });
  const mysqlError = new Error('Too many connections');
  mysqlError.code = 'ER_CON_COUNT_ERROR';
  mysqlError.errno = 1040;

  assert.equal(guard.record(mysqlError), true);
  assert.equal(mysqlError.dbErrorCode, 'ER_CON_COUNT_ERROR');
  assert.equal(mysqlError.code, 'DB_CONNECTION_CAPACITY');
  assert.equal(mysqlError.statusCode, 503);
  assert.equal(mysqlError.retryAfterSeconds, 5);
  assert.throws(() => guard.assertAvailable(), error =>
    error.code === 'DB_CONNECTION_CAPACITY' && error.statusCode === 503 && error.retryAfterSeconds === 5);

  timestamp += 5001;
  assert.doesNotThrow(() => guard.assertAvailable());
});

test('el pool limita conexiones ociosas y protege nuevas adquisiciones', () => {
  const source = fs.readFileSync(path.join(ROOT, 'backend/src/config/db.js'), 'utf8');
  const errorMiddleware = fs.readFileSync(path.join(ROOT, 'backend/src/middleware/error.middleware.js'), 'utf8');
  assert.match(source, /maxIdle:\s*maxIdleConnections/);
  assert.match(source, /DB_CONNECTION_PRESSURE_BACKOFF_MS/);
  assert.match(source, /connectionPressureGuard\.assertAvailable\(\)/);
  assert.match(errorMiddleware, /Retry-After/);
});

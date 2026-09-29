'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const runner = require(path.join(__dirname, '..', 'scripts', 'load-test', 'mantto-load-test-runner.service.js'));

test('runner identidad: backoff normal 30s, 60s, 120s y 300s', () => {
  assert.equal(runner.identityRetryDelay({}, 1), 30000);
  assert.equal(runner.identityRetryDelay({}, 2), 60000);
  assert.equal(runner.identityRetryDelay({}, 3), 120000);
  assert.equal(runner.identityRetryDelay({}, 4), 300000);
  assert.equal(runner.identityRetryDelay({}, 20), 300000);
});

test('runner identidad: HTTP 429 respeta Retry-After', () => {
  assert.equal(runner.identityRetryDelay({ status: 429, retryAfterMs: 90000 }, 1), 90000);
});

test('runner identidad: HTTP 429 sin Retry-After espera 5 minutos', () => {
  assert.equal(runner.identityRetryDelay({ status: 429 }, 1), 300000);
});

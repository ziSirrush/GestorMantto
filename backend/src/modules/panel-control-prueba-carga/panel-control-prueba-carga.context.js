'use strict';

const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();

function runWithLoadTestContext(context, callback) {
  const sessionId = String(context?.sessionId || '').trim();
  if (!sessionId || typeof callback !== 'function') return callback();
  return storage.run(Object.freeze({ sessionId }), callback);
}

function getLoadTestContext() {
  return storage.getStore() || null;
}

function getCurrentLoadTestSessionId() {
  return getLoadTestContext()?.sessionId || null;
}

module.exports = {
  runWithLoadTestContext,
  getLoadTestContext,
  getCurrentLoadTestSessionId
};

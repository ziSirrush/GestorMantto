'use strict';

const DEFAULT_BACKOFF_MS = 5000;

function isConnectionCapacityError(error) {
  return String(error?.code || error?.dbErrorCode || '').toUpperCase() === 'ER_CON_COUNT_ERROR' ||
    Number(error?.errno) === 1040;
}

function capacityError(retryAfterMs) {
  const error = new Error('La base de datos está temporalmente saturada. Reintenta en unos segundos.');
  error.code = 'DB_CONNECTION_CAPACITY';
  error.status = 503;
  error.statusCode = 503;
  error.expose = true;
  error.retryAfterSeconds = Math.max(1, Math.ceil(Number(retryAfterMs || 0) / 1000));
  return error;
}

function createConnectionPressureGuard(options = {}) {
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const configuredBackoff = Number(options.backoffMs);
  const backoffMs = Number.isFinite(configuredBackoff) && configuredBackoff >= 1000
    ? configuredBackoff : DEFAULT_BACKOFF_MS;
  let blockedUntil = 0;

  function remainingMs() {
    return Math.max(0, blockedUntil - now());
  }

  function assertAvailable() {
    const remaining = remainingMs();
    if (remaining > 0) throw capacityError(remaining);
  }

  function record(error) {
    if (!isConnectionCapacityError(error)) return false;
    blockedUntil = Math.max(blockedUntil, now() + backoffMs);
    error.dbErrorCode = error.dbErrorCode || error.code || 'ER_CON_COUNT_ERROR';
    error.code = 'DB_CONNECTION_CAPACITY';
    error.status = 503;
    error.statusCode = 503;
    error.expose = true;
    error.retryAfterSeconds = Math.max(1, Math.ceil(remainingMs() / 1000));
    error.message = 'La base de datos está temporalmente saturada. Reintenta en unos segundos.';
    return true;
  }

  return Object.freeze({ assertAvailable, record, remainingMs });
}

module.exports = {
  DEFAULT_BACKOFF_MS,
  isConnectionCapacityError,
  createConnectionPressureGuard
};

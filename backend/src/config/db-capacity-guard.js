'use strict';

// BLT NOW | 2026-10-20 | FIX_API_AIVEN_PRESION_CONEXIONES_V001
// Cortacircuito LOCAL por proceso: no modifica Aiven, ni reemplaza la
// investigacion de conexiones ajenas o sesiones retenidas (PROCESSLIST).

const DEFAULT_BACKOFF_MS = 5000;
const DEFAULT_MAX_BACKOFF_MS = 30000;

function isConnectionCapacityError(error) {
  const code = String(error?.dbErrorCode || error?.code || '').toUpperCase();
  return code === 'ER_CON_COUNT_ERROR' || code === 'ER_TOO_MANY_USER_CONNECTIONS' ||
    Number(error?.errno) === 1040 || Number(error?.errno) === 1203;
}

function isPoolQueueError(error) {
  return error?.code === 'DB_POOL_QUEUE_FULL' ||
    /^queue limit reached\.?$/i.test(String(error?.message || '').trim());
}

function retryable(error, code, message, retrySeconds) {
  error.code = code;
  error.status = 503;
  error.statusCode = 503;
  error.expose = true;
  error.retryAfterSeconds = Math.max(1, Math.ceil(retrySeconds));
  error.message = message;
  return error;
}

function createConnectionPressureGuard(options = {}) {
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const candidateBackoff = Number(options.backoffMs);
  const backoffMs = Number.isFinite(candidateBackoff) && candidateBackoff >= 1000
    ? candidateBackoff : DEFAULT_BACKOFF_MS;
  const candidateMax = Number(options.maxBackoffMs);
  const maxBackoffMs = Number.isFinite(candidateMax) && candidateMax >= backoffMs
    ? candidateMax : Math.max(backoffMs, DEFAULT_MAX_BACKOFF_MS);
  let blockedUntil = 0;
  let failures = 0;

  function remainingMs() {
    return Math.max(0, blockedUntil - now());
  }

  function assertAvailable() {
    if (remainingMs() === 0) return;
    const error = new Error('La base de datos está temporalmente saturada. Reintenta en unos segundos.');
    throw retryable(error, 'DB_CONNECTION_CAPACITY', error.message, remainingMs() / 1000);
  }

  function record(error) {
    if (!isConnectionCapacityError(error)) return false;
    const wasBlocked = remainingMs() > 0;
    if (!wasBlocked) {
      failures = Math.min(16, failures + 1);
      const delay = Math.min(maxBackoffMs, backoffMs * (2 ** Math.min(failures - 1, 8)));
      blockedUntil = now() + delay;
      console.warn('[DB_CONNECTION_PRESSURE]', JSON.stringify({
        cause:'mysql_connections_limit',
        backoff_seconds:Math.ceil(delay / 1000),
        repeated_after_cooldown:failures > 1
      }));
    }
    error.dbErrorCode = error.dbErrorCode || error.code || 'ER_CON_COUNT_ERROR';
    retryable(error, 'DB_CONNECTION_CAPACITY',
      'La base de datos está temporalmente saturada. Reintenta en unos segundos.', remainingMs() / 1000);
    return true;
  }

  function recordQueue(error) {
    if (!isPoolQueueError(error)) return false;
    retryable(error, 'DB_POOL_QUEUE_FULL',
      'El servidor está atendiendo demasiadas solicitudes simultáneas. Reintenta en unos segundos.', 2);
    return true;
  }

  function recordSuccess() {
    failures = 0;
    blockedUntil = 0;
  }

  return Object.freeze({ remainingMs, assertAvailable, record, recordQueue, recordSuccess });
}

module.exports = {
  DEFAULT_BACKOFF_MS,
  DEFAULT_MAX_BACKOFF_MS,
  isConnectionCapacityError,
  isPoolQueueError,
  createConnectionPressureGuard
};

'use strict';

const crypto = require('crypto');
const { getLoadTestTelemetrySettings } = require('./panel-control-prueba-carga.constants');

let heartbeat = null;

function error(message, status, code) {
  const result = new Error(message);
  result.status = status;
  result.code = code;
  return result;
}

function authenticate(req) {
  // req.protocol honours X-Forwarded-Proto only when Express trusts the proxy.
  const trustedProxyHttps = process.env.LOAD_TEST_TRUST_PROXY_HTTPS === 'true'
    && req.get('X-Forwarded-Proto') === 'https';
  if (req.protocol !== 'https' && !trustedProxyHttps) throw error('El canal del runner requiere HTTPS.', 403, 'LOAD_TEST_RUNNER_HTTPS_REQUIRED');
  const expected = String(process.env.LOAD_TEST_RUNNER_SERVICE_TOKEN_SHA256 || '').trim().toLowerCase();
  const token = String(req.get('X-Mantto-Runner-Service-Token') || '').trim();
  if (!/^[a-f0-9]{64}$/.test(expected) || !/^(?:[a-f0-9]{64}|[A-Za-z0-9_-]{43,})$/i.test(token)) {
    throw error('Credencial de servicio inválida.', 401, 'LOAD_TEST_RUNNER_SERVICE_UNAUTHORIZED');
  }
  const actual = crypto.createHash('sha256').update(token).digest();
  if (!crypto.timingSafeEqual(Buffer.from(expected, 'hex'), actual)) {
    throw error('Credencial de servicio inválida.', 401, 'LOAD_TEST_RUNNER_SERVICE_UNAUTHORIZED');
  }
}

function recordHeartbeat(payload = {}) {
  const runnerId = String(payload.runner_id || '').trim();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(runnerId)) throw error('Identificador de runner inválido.', 400, 'LOAD_TEST_RUNNER_ID_INVALID');
  heartbeat = {
    runner_id: runnerId,
    last_seen_at: Date.now(),
    k6_ready: payload.k6_ready === true,
    k6_version: String(payload.k6_version || '').slice(0, 80),
    test_identity_ready: payload.test_identity_ready === true,
    active_job_id: payload.active_job_id == null ? null : String(payload.active_job_id).slice(0, 80)
  };
  return snapshot();
}

function snapshot() {
  const ttl = getLoadTestTelemetrySettings().runner_heartbeat_ttl_seconds * 1000;
  const alive = Boolean(heartbeat && Date.now() - heartbeat.last_seen_at < ttl);
  return {
    available: Boolean(alive && heartbeat.k6_ready && heartbeat.test_identity_ready && !heartbeat.active_job_id),
    alive,
    runner_id: alive ? heartbeat.runner_id : null,
    k6_ready: Boolean(alive && heartbeat.k6_ready),
    k6_version: alive ? heartbeat.k6_version : null,
    test_identity_ready: Boolean(alive && heartbeat.test_identity_ready),
    active_job_id: alive ? heartbeat.active_job_id : null,
    last_seen_at: heartbeat ? new Date(heartbeat.last_seen_at).toISOString() : null
  };
}

module.exports = { authenticate, recordHeartbeat, snapshot };

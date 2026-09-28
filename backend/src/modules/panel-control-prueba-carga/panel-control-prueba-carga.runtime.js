'use strict';

const crypto = require('crypto');
const cluster = require('cluster');

const PROCESS_INSTANCE_ID = `PCLT-${process.pid}-${crypto.randomBytes(6).toString('hex')}`;

function enabled(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function normalizeOrigin(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  let parsed;
  try {
    parsed = new URL(raw);
  } catch (_error) {
    return null;
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) return null;
  if (parsed.username || parsed.password) return null;
  if (parsed.pathname && parsed.pathname !== '/') return null;
  if (parsed.search || parsed.hash) return null;

  return parsed.origin;
}

function runtimeSingleProcessGuard() {
  const clusterWorker = Boolean(cluster.isWorker || process.env.NODE_UNIQUE_ID);
  const deploymentConfirmed = enabled(process.env.LOAD_TEST_SINGLE_INSTANCE, false);

  return {
    required: true,
    deployment_confirmed: deploymentConfirmed,
    cluster_worker_detected: clusterWorker,
    ready: deploymentConfirmed && !clusterWorker,
    verification_mode: 'DEPLOYMENT_CONFIRMATION_PLUS_NODE_CLUSTER_GUARD'
  };
}

function getLoadTestRunnerRuntime() {
  const singleInstance = runtimeSingleProcessGuard();
  const allowedOrigin = normalizeOrigin(process.env.LOAD_TEST_ALLOWED_ORIGIN);
  const targetConfigured = Boolean(allowedOrigin);

  return Object.freeze({
    process_instance_id: PROCESS_INSTANCE_ID,
    single_instance: singleInstance,
    target_origin: allowedOrigin,
    target_configured: targetConfigured,
    redirects_allowed: false,
    ready: Boolean(singleInstance.ready && targetConfigured)
  });
}

function runtimeError(message, code) {
  const error = new Error(message);
  error.status = 503;
  error.code = code;
  return error;
}

function assertLoadTestRunnerRuntimeReady() {
  const runtime = getLoadTestRunnerRuntime();
  if (!runtime.single_instance.ready) {
    throw runtimeError(
      'Prueba de Carga V001 requiere confirmar un solo proceso/replica backend mediante LOAD_TEST_SINGLE_INSTANCE=true y no admite workers de cluster.',
      'LOAD_TEST_SINGLE_INSTANCE_REQUIRED'
    );
  }
  if (!runtime.target_configured) {
    throw runtimeError(
      'Prueba de Carga no tiene un origen autorizado valido. Configura LOAD_TEST_ALLOWED_ORIGIN con el origen exacto de Mantto Gestor.',
      'LOAD_TEST_ALLOWED_ORIGIN_REQUIRED'
    );
  }
  return runtime;
}

module.exports = {
  PROCESS_INSTANCE_ID,
  normalizeOrigin,
  getLoadTestRunnerRuntime,
  assertLoadTestRunnerRuntimeReady
};

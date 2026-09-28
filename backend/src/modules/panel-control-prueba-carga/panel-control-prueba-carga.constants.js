'use strict';

const { publicScenarios } = require('./panel-control-prueba-carga.scenarios');

const PERMISSIONS = Object.freeze({
  ACCESS: 'PANEL_CONTROL_PRUEBA_CARGA_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  EXECUTE: 'PANEL_CONTROL_PRUEBA_CARGA_EJECUCION.EJECUTAR',
  STOP: 'PANEL_CONTROL_PRUEBA_CARGA_EJECUCION.DETENER'
});

const SCENARIOS = Object.freeze(publicScenarios().map(item => Object.freeze(item)));

function positiveInteger(value, fallback, minimum = 1, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum) return fallback;
  return Math.min(parsed, maximum);
}

function positiveNumber(value, fallback, minimum = 1, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum) return fallback;
  return Math.min(parsed, maximum);
}

function getLoadTestLimits() {
  const minVus = positiveInteger(process.env.LOAD_TEST_MIN_VUS, 10, 1);
  const stepVus = positiveInteger(process.env.LOAD_TEST_VUS_STEP, 10, 1);
  const configuredMax = Math.max(
    minVus,
    positiveInteger(process.env.LOAD_TEST_MAX_VUS, 200, minVus)
  );

  return Object.freeze({
    min_vus: minVus,
    max_vus_configured: configuredMax,
    step_vus: stepVus,
    hard_max_vus: null,
    duration_min_seconds: 30,
    duration_default_seconds: 120,
    duration_max_seconds: 300
  });
}

function getLoadTestTelemetrySettings() {
  return Object.freeze({
    ready_ttl_seconds: positiveInteger(process.env.LOAD_TEST_READY_TTL_SECONDS, 900, 60, 86400),
    result_ttl_seconds: positiveInteger(process.env.LOAD_TEST_RESULT_TTL_SECONDS, 900, 60, 86400),
    active_grace_seconds: positiveInteger(process.env.LOAD_TEST_ACTIVE_GRACE_SECONDS, 120, 30, 3600),
    runner_control_poll_ms: positiveInteger(process.env.LOAD_TEST_RUNNER_CONTROL_POLL_MS, 1000, 250, 10000),
    finalization_timeout_seconds: positiveInteger(process.env.LOAD_TEST_FINALIZATION_TIMEOUT_SECONDS, 20, 5, 300),
    summary_timeout_seconds: positiveInteger(process.env.LOAD_TEST_SUMMARY_TIMEOUT_SECONDS, 15, 5, 120),
    drain_timeout_seconds: positiveInteger(process.env.LOAD_TEST_DRAIN_TIMEOUT_SECONDS, 5, 1, 60),
    protection_min_requests: positiveInteger(process.env.LOAD_TEST_PROTECTION_MIN_REQUESTS, 30, 10, 100000),
    protection_5xx_percent: positiveNumber(process.env.LOAD_TEST_PROTECTION_5XX_PERCENT, 10, 1, 100),
    protection_p95_ms: positiveNumber(process.env.LOAD_TEST_PROTECTION_P95_MS, 5000, 250, 600000),
    live_window_seconds: positiveInteger(process.env.LOAD_TEST_LIVE_WINDOW_SECONDS, 10, 2, 60),
    sample_interval_ms: positiveInteger(process.env.LOAD_TEST_TELEMETRY_SAMPLE_MS, 1000, 250, 10000),
    slow_query_ms: positiveNumber(process.env.LOAD_TEST_SLOW_QUERY_MS || process.env.DB_SLOW_QUERY_MS, 750, 1, 600000),
    max_system_samples: positiveInteger(process.env.LOAD_TEST_MAX_SYSTEM_SAMPLES, 600, 30, 3600),
    max_endpoints: positiveInteger(process.env.LOAD_TEST_MAX_ENDPOINTS, 100, 10, 1000),
    max_fingerprints: positiveInteger(process.env.LOAD_TEST_MAX_FINGERPRINTS, 100, 10, 1000),
    max_latency_samples: positiveInteger(process.env.LOAD_TEST_MAX_LATENCY_SAMPLES, 4096, 256, 50000),
    max_endpoint_latency_samples: positiveInteger(process.env.LOAD_TEST_MAX_ENDPOINT_LATENCY_SAMPLES, 512, 64, 10000)
  });
}

module.exports = {
  PERMISSIONS,
  SCENARIOS,
  getLoadTestLimits,
  getLoadTestTelemetrySettings
};

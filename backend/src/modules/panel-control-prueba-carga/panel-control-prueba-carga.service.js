'use strict';

const registry = require('./panel-control-prueba-carga.registry');
const { hasEffectivePermission } = require('../../services/permissions/effective-permission.service');
const {
  PERMISSIONS,
  SCENARIOS,
  getLoadTestLimits,
  getLoadTestTelemetrySettings
} = require('./panel-control-prueba-carga.constants');
const {
  CATALOG_VERSION,
  runnerScenario,
  scenarioExists
} = require('./panel-control-prueba-carga.scenarios');
const {
  getLoadTestRunnerRuntime,
  assertLoadTestRunnerRuntimeReady
} = require('./panel-control-prueba-carga.runtime');

function validUserId(user) {
  const id = Number(user?.id_SB || user?.id || user?.user_id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function loadTestError(message, status, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function assertUser(user) {
  const userId = validUserId(user);
  if (!userId) throw loadTestError('Sesión sin usuario válido.', 401, 'LOAD_TEST_SESSION_INVALID');
  return userId;
}

function assertOwner(session, userId) {
  if (Number(session?.actor_user_id) !== Number(userId)) {
    throw loadTestError('La sesión temporal pertenece a otro operador.', 403, 'LOAD_TEST_SESSION_OWNER_REQUIRED');
  }
}

function normalizedSessionConfig(payload = {}) {
  const limits = getLoadTestLimits();
  const vus = Number(payload.vus);
  const durationSeconds = Number(payload.duration_seconds ?? payload.durationSeconds);
  const scenario = String(payload.scenario || '').trim().toUpperCase();

  if ('target' in payload || 'url' in payload || 'base_url' in payload || 'baseUrl' in payload || 'host' in payload) {
    throw loadTestError(
      'El target no puede ser definido por el usuario. Prueba de Carga solo opera contra Mantto Gestor.',
      400,
      'LOAD_TEST_TARGET_NOT_ALLOWED'
    );
  }

  if (!Number.isInteger(vus) || vus < limits.min_vus || vus > limits.max_vus_configured) {
    throw loadTestError(
      `Los VUs deben estar entre ${limits.min_vus} y ${limits.max_vus_configured}.`,
      400,
      'LOAD_TEST_VUS_OUT_OF_RANGE'
    );
  }

  if ((vus - limits.min_vus) % limits.step_vus !== 0) {
    throw loadTestError(
      `Los VUs deben avanzar en pasos de ${limits.step_vus} desde ${limits.min_vus}.`,
      400,
      'LOAD_TEST_VUS_STEP_INVALID'
    );
  }

  if (!Number.isInteger(durationSeconds)
      || durationSeconds < limits.duration_min_seconds
      || durationSeconds > limits.duration_max_seconds) {
    throw loadTestError(
      `La duración debe estar entre ${limits.duration_min_seconds} y ${limits.duration_max_seconds} segundos.`,
      400,
      'LOAD_TEST_DURATION_INVALID'
    );
  }

  if (!scenarioExists(scenario)) {
    throw loadTestError('El escenario solicitado no está autorizado.', 400, 'LOAD_TEST_SCENARIO_INVALID');
  }

  return { vus, durationSeconds, scenario };
}


function finiteNonNegative(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function integerNonNegative(value, fallback = 0) {
  return Math.max(0, Math.trunc(finiteNonNegative(value, fallback)));
}

function normalizeRunnerSummary(payload, session) {
  const source = payload && typeof payload === 'object' ? payload : {};
  if (String(source.session_id || '') !== String(session?.id || '')) {
    throw loadTestError('El resumen final no pertenece a esta sesion.', 400, 'LOAD_TEST_RUNNER_SUMMARY_SESSION_MISMATCH');
  }

  const vusConfigured = integerNonNegative(source.vus_configured, 0);
  const vusMax = integerNonNegative(source.vus_max, 0);
  if (vusConfigured !== Number(session.vus)) {
    throw loadTestError('Los VUs del resumen final no coinciden con la sesion.', 400, 'LOAD_TEST_RUNNER_SUMMARY_VUS_MISMATCH');
  }
  if (vusMax > Number(session.vus) || vusMax < 0) {
    throw loadTestError('El maximo de VUs reportado por k6 no es valido.', 400, 'LOAD_TEST_RUNNER_SUMMARY_VUS_MAX_INVALID');
  }

  const latencySource = source.latency && typeof source.latency === 'object' ? source.latency : {};
  const httpSource = source.http && typeof source.http === 'object' ? source.http : {};
  const normalized = {
    session_id: String(session.id),
    vus_configured: vusConfigured,
    vus_max: vusMax,
    duration_ms: source.duration_ms == null ? null : finiteNonNegative(source.duration_ms, 0),
    requests: integerNonNegative(source.requests, 0),
    failed: integerNonNegative(source.failed, 0),
    rps: finiteNonNegative(source.rps, 0),
    latency: {
      min: finiteNonNegative(latencySource.min, 0),
      avg: finiteNonNegative(latencySource.avg, 0),
      p50: finiteNonNegative(latencySource.p50, 0),
      p90: finiteNonNegative(latencySource.p90, 0),
      p95: finiteNonNegative(latencySource.p95, 0),
      p99: finiteNonNegative(latencySource.p99, 0),
      max: finiteNonNegative(latencySource.max, 0)
    },
    http: {
      '2xx': integerNonNegative(httpSource['2xx'], 0),
      '3xx': integerNonNegative(httpSource['3xx'], 0),
      '4xx': integerNonNegative(httpSource['4xx'], 0),
      '5xx': integerNonNegative(httpSource['5xx'], 0)
    },
    timeouts: integerNonNegative(source.timeouts, 0),
    network_errors: integerNonNegative(source.network_errors, 0),
    iterations_completed: integerNonNegative(source.iterations_completed, 0),
    iterations_interrupted: source.iterations_interrupted == null ? null : integerNonNegative(source.iterations_interrupted, 0)
  };

  if (normalized.failed > normalized.requests) {
    throw loadTestError('El resumen final reporta mas fallos que requests.', 400, 'LOAD_TEST_RUNNER_SUMMARY_FAILED_INVALID');
  }
  const statusTotal = Object.values(normalized.http).reduce((sum, value) => sum + Number(value || 0), 0);
  if (statusTotal > normalized.requests) {
    throw loadTestError('El resumen final contiene conteos HTTP incompatibles con requests.', 400, 'LOAD_TEST_RUNNER_SUMMARY_HTTP_INVALID');
  }
  return normalized;
}

async function permissionSnapshot(userId) {
  const [access, execute, stop] = await Promise.all([
    hasEffectivePermission(userId, PERMISSIONS.ACCESS),
    hasEffectivePermission(userId, PERMISSIONS.EXECUTE),
    hasEffectivePermission(userId, PERMISSIONS.STOP)
  ]);
  return { access, execute, stop };
}

function publicRunnerRuntime(runtime) {
  return {
    ready: Boolean(runtime?.ready),
    single_instance_required: true,
    single_instance_confirmed: Boolean(runtime?.single_instance?.ready),
    single_instance_verification: runtime?.single_instance?.verification_mode || null,
    target_configured: Boolean(runtime?.target_configured),
    redirects_allowed: false,
    process_instance_id: runtime?.process_instance_id || null
  };
}

async function getCapabilities(user) {
  const userId = assertUser(user);
  const permissions = await permissionSnapshot(userId);

  if (!permissions.access) {
    throw loadTestError('No tienes permiso para abrir Prueba de Carga.', 403, 'LOAD_TEST_ACCESS_DENIED');
  }

  const runtime = getLoadTestRunnerRuntime();
  const active = registry.getActivePublicSession();
  const ownActive = active && Number(active.actor_user_id) === userId;

  return {
    module: 'panel-control-prueba-carga',
    version: 'V001',
    phase: 5,
    execution_available: Boolean(runtime.ready),
    telemetry_available: true,
    session_api_available: true,
    runner_required: true,
    runner_claim_available: true,
    stop_control_available: true,
    live_runner_metrics_available: true,
    runner_summary_available: true,
    text_report_available: true,
    persistence: 'NONE',
    target_policy: 'MANTTO_GESTOR_ONLY',
    permissions,
    limits: getLoadTestLimits(),
    telemetry: getLoadTestTelemetrySettings(),
    runner_runtime: publicRunnerRuntime(runtime),
    scenario_catalog_version: CATALOG_VERSION,
    scenarios: SCENARIOS,
    active_session: active
      ? (ownActive ? active : { state: 'BUSY', owned_by_current_user: false })
      : null
  };
}

async function requirePermission(user, permissionCode, deniedCode) {
  const userId = assertUser(user);
  const allowed = await hasEffectivePermission(userId, permissionCode);
  if (!allowed) {
    throw loadTestError('No tienes permiso para realizar esta acción de Prueba de Carga.', 403, deniedCode || 'LOAD_TEST_PERMISSION_DENIED');
  }
  return userId;
}

async function createSession(user, payload) {
  const userId = await requirePermission(user, PERMISSIONS.EXECUTE, 'LOAD_TEST_EXECUTE_DENIED');
  assertLoadTestRunnerRuntimeReady();
  const config = normalizedSessionConfig(payload);
  return registry.createSession({ actorUserId: userId, ...config });
}

async function getSession(user, id) {
  const userId = await requirePermission(user, PERMISSIONS.ACCESS, 'LOAD_TEST_ACCESS_DENIED');
  const session = registry.getPublicSession(id);
  assertOwner(session, userId);
  return session;
}

async function claimRunner(user, id) {
  const userId = await requirePermission(user, PERMISSIONS.EXECUTE, 'LOAD_TEST_EXECUTE_DENIED');
  const runtime = assertLoadTestRunnerRuntimeReady();
  const session = registry.getPublicSession(id);
  assertOwner(session, userId);

  const claim = registry.claimRunner(id, { actorUserId: userId });
  const scenario = runnerScenario(claim.session.scenario);
  if (!scenario) {
    throw loadTestError('El escenario de la sesión ya no existe en el catálogo técnico.', 409, 'LOAD_TEST_SCENARIO_CATALOG_MISMATCH');
  }

  return {
    session_id: claim.session.id,
    runner_token: claim.runner_token,
    process_instance_id: runtime.process_instance_id,
    target_origin: runtime.target_origin,
    redirects_allowed: false,
    scenario_catalog_version: CATALOG_VERSION,
    scenario,
    vus: claim.session.vus,
    duration_seconds: claim.session.duration_seconds,
    limits: getLoadTestLimits(),
    control: {
      poll_ms: getLoadTestTelemetrySettings().runner_control_poll_ms
    }
  };
}

async function startSession(user, id) {
  const userId = await requirePermission(user, PERMISSIONS.EXECUTE, 'LOAD_TEST_EXECUTE_DENIED');
  assertLoadTestRunnerRuntimeReady();
  const session = registry.getPublicSession(id);
  assertOwner(session, userId);
  return registry.startSession(id);
}

async function stopSession(user, id, reason = 'MANUAL') {
  const userId = await requirePermission(user, PERMISSIONS.STOP, 'LOAD_TEST_STOP_DENIED');
  const session = registry.getPublicSession(id);
  assertOwner(session, userId);
  return registry.requestStop(id, { actorUserId: userId, reason, source: 'MANUAL' });
}


function validateRunnerAccess(id, token, { allowTerminal = true } = {}) {
  const session = registry.validateRunnerToken(id, token, { requireRunning: false });
  const allowed = allowTerminal
    ? ['EJECUTANDO', 'FINALIZANDO', 'FINALIZADA', 'ABORTADA_MANUAL', 'ABORTADA_AUTOMATICA', 'ABORTADA_RUNNER', 'ABORTADA_SIN_CONFIRMACION']
    : ['EJECUTANDO', 'FINALIZANDO'];
  if (!allowed.includes(session.state)) {
    throw loadTestError('La sesión no está disponible para el canal del runner.', 409, 'LOAD_TEST_RUNNER_CHANNEL_NOT_ACTIVE');
  }
  return session;
}

function runnerControl(id, token) {
  const session = validateRunnerAccess(id, token);
  return {
    session_id: session.id,
    state: session.state,
    command: session.state === 'FINALIZANDO' ? 'ABORT' : 'CONTINUE',
    reason: session.cancelReason || null,
    source: session.cancelSource || null,
    poll_after_ms: session.settings.runner_control_poll_ms
  };
}

function runnerSample(id, token, payload) {
  validateRunnerAccess(id, token, { allowTerminal: false });
  const session = registry.recordRunnerSample(id, token, payload || {});
  const control = runnerControl(id, token);
  return {
    session_id: session.id,
    state: session.state,
    target_vus: session.vus,
    runner: session.telemetry?.runner || null,
    control
  };
}

function runnerAcknowledgeStop(id, token) {
  validateRunnerAccess(id, token, { allowTerminal: false });
  const session = registry.acknowledgeStop(id, token);
  return { session_id: session.id, state: session.state, acknowledged: true };
}

function runnerSignalAbort(id, token, reason) {
  validateRunnerAccess(id, token, { allowTerminal: false });
  return registry.signalRunnerAbort(id, token, reason);
}

async function waitForDrain(id) {
  const initial = registry.getSessionInternal(id);
  if (!initial) return;
  const deadline = Date.now() + initial.settings.drain_timeout_seconds * 1000;
  while (Date.now() < deadline) {
    const session = registry.getSessionInternal(id);
    if (!session) return;
    const httpActive = Number(session.telemetry?.http?.active || 0);
    const sqlActive = Number(session.telemetry?.sql?.active || 0);
    const poolWaits = Number(session.telemetry?.sql?.pool?.active_waits || 0);
    if (httpActive === 0 && sqlActive === 0 && poolWaits === 0) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

async function runnerFinish(id, token, reason = 'RUNNER_TEARDOWN') {
  validateRunnerAccess(id, token);
  await waitForDrain(id);
  return registry.finishRunner(id, token, { reason });
}


function runnerSummary(id, token, payload) {
  const session = registry.validateRunnerToken(id, token, { requireRunning: false });
  const normalized = normalizeRunnerSummary(payload, session);
  return registry.acceptRunnerSummary(id, token, normalized);
}

async function getReport(user, id) {
  const userId = await requirePermission(user, PERMISSIONS.ACCESS, 'LOAD_TEST_ACCESS_DENIED');
  const session = registry.getPublicSession(id);
  assertOwner(session, userId);
  return {
    session_id: session.id,
    state: session.state,
    completion_integrity: session.completion_integrity,
    report: registry.getReportText(id)
  };
}

async function deleteSession(user, id) {
  const userId = await requirePermission(user, PERMISSIONS.EXECUTE, 'LOAD_TEST_EXECUTE_DENIED');
  const session = registry.getPublicSession(id);
  assertOwner(session, userId);
  registry.deleteSession(id);
  return { deleted: true, id: String(id) };
}

module.exports = {
  getCapabilities,
  createSession,
  getSession,
  claimRunner,
  startSession,
  stopSession,
  runnerControl,
  runnerSample,
  runnerAcknowledgeStop,
  runnerSignalAbort,
  runnerFinish,
  runnerSummary,
  getReport,
  deleteSession,
  requirePermission,
  normalizedSessionConfig,
  normalizeRunnerSummary,
  _publicRunnerRuntime: publicRunnerRuntime
};

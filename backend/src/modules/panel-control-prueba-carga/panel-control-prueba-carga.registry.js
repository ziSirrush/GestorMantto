'use strict';

const crypto = require('crypto');
const { EventEmitter } = require('events');
const { getLoadTestTelemetrySettings } = require('./panel-control-prueba-carga.constants');
const { buildLoadTestReport } = require('./panel-control-prueba-carga.report');

function asIso(value) {
  return value ? new Date(value).toISOString() : null;
}

function nowMs() {
  return Date.now();
}

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function createLatencyAccumulator(limit) {
  return {
    count: 0,
    sum: 0,
    min: null,
    max: null,
    values: [],
    cursor: 0,
    limit: Math.max(1, Number(limit) || 1)
  };
}

function addLatency(accumulator, value) {
  const latency = safeNumber(value, NaN);
  if (!Number.isFinite(latency) || latency < 0) return;

  accumulator.count += 1;
  accumulator.sum += latency;
  accumulator.min = accumulator.min === null ? latency : Math.min(accumulator.min, latency);
  accumulator.max = accumulator.max === null ? latency : Math.max(accumulator.max, latency);

  if (accumulator.values.length < accumulator.limit) {
    accumulator.values.push(latency);
    return;
  }

  accumulator.values[accumulator.cursor] = latency;
  accumulator.cursor = (accumulator.cursor + 1) % accumulator.limit;
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const rank = Math.max(0, Math.ceil((Number(p) / 100) * sorted.length) - 1);
  return Number(sorted[Math.min(rank, sorted.length - 1)].toFixed(2));
}

function latencySnapshot(accumulator) {
  const count = Number(accumulator.count || 0);
  return {
    count,
    min_ms: accumulator.min === null ? null : Number(accumulator.min.toFixed(2)),
    avg_ms: count ? Number((accumulator.sum / count).toFixed(2)) : null,
    p50_ms: percentile(accumulator.values, 50),
    p90_ms: percentile(accumulator.values, 90),
    p95_ms: percentile(accumulator.values, 95),
    p99_ms: percentile(accumulator.values, 99),
    max_ms: accumulator.max === null ? null : Number(accumulator.max.toFixed(2))
  };
}

function addTimedLatency(accumulator, at, value) {
  const duration = safeNumber(value, NaN);
  if (!Number.isFinite(duration) || duration < 0) return;
  const entry = { at, duration };
  if (accumulator.values.length < accumulator.limit) {
    accumulator.values.push(entry);
  } else {
    accumulator.values[accumulator.cursor] = entry;
    accumulator.cursor = (accumulator.cursor + 1) % accumulator.limit;
  }
}

function recentHttpSnapshot(session, at, { includeLatency = true } = {}) {
  const http = session.telemetry.http;
  const windowMs = session.settings.live_window_seconds * 1000;
  const cutoff = at - windowMs;
  let completed = 0;
  let fiveXx = 0;
  let latencyCount = 0;
  let slowLatency = 0;
  for (const [bucketAt, bucket] of http.recent_buckets) {
    if (bucketAt + 1000 <= cutoff) continue;
    completed += bucket.completed;
    fiveXx += bucket.five_xx;
    latencyCount += bucket.latency_count;
    slowLatency += bucket.slow_latency;
  }
  let latency = null;
  if (includeLatency) {
    const recent = { count: 0, sum: 0, min: null, max: null, values: [] };
    for (const entry of http.recent_latency.values) {
      if (entry.at < cutoff) continue;
      recent.count += 1;
      recent.sum += entry.duration;
      recent.min = recent.min === null ? entry.duration : Math.min(recent.min, entry.duration);
      recent.max = recent.max === null ? entry.duration : Math.max(recent.max, entry.duration);
      recent.values.push(entry.duration);
    }
    latency = latencySnapshot(recent);
  }
  const elapsedSeconds = session.startedAt != null ? (at - session.startedAt) / 1000 : 0;
  const divisor = Math.max(1, Math.min(session.settings.live_window_seconds, elapsedSeconds));
  return {
    completed,
    five_xx: fiveXx,
    latency_count: latencyCount,
    slow_latency: slowLatency,
    rps_backend: Number((completed / divisor).toFixed(2)),
    latency
  };
}


function redactSqlShape(value) {
  return String(value || '[sql no disponible]')
    .replace(/\b-?\d+(?:\.\d+)?\b/g, '?')
    .slice(0, 1200);
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest();
}

function safeTokenEquals(expectedHash, candidate) {
  if (!expectedHash || !candidate) return false;
  const candidateHash = hashToken(candidate);
  return expectedHash.length === candidateHash.length && crypto.timingSafeEqual(expectedHash, candidateHash);
}

function createTelemetry(settings) {
  return {
    http: {
      started: 0,
      completed: 0,
      active: 0,
      max_active: 0,
      errors: 0,
      closed_early: 0,
      status: {},
      latency: createLatencyAccumulator(settings.max_latency_samples),
      recent_buckets: new Map(),
      recent_latency: { values: [], cursor: 0, limit: settings.max_latency_samples },
      endpoints: new Map()
    },
    sql: {
      started: 0,
      completed: 0,
      active: 0,
      max_active: 0,
      errors: 0,
      slow_queries: 0,
      latency: createLatencyAccumulator(settings.max_latency_samples),
      fingerprints: new Map(),
      pool: {
        acquisitions_started: 0,
        acquisitions_completed: 0,
        active_waits: 0,
        max_active_waits: 0,
        errors: 0,
        wait_latency: createLatencyAccumulator(settings.max_latency_samples)
      }
    },
    system_samples: [],
    runner: {
      samples: [],
      latest: null,
      max_vus_active: 0,
      last_seen_at: null,
      control_ack_at: null,
      finished_at: null
    }
  };
}

function summarizeSystemSamples(samples) {
  if (!Array.isArray(samples) || !samples.length) {
    return {
      count: 0,
      latest: null,
      maxima: null
    };
  }

  const max = (path) => {
    const values = samples
      .map((sample) => path.split('.').reduce((value, key) => value?.[key], sample))
      .map(Number)
      .filter(Number.isFinite);
    return values.length ? Math.max(...values) : null;
  };

  return {
    count: samples.length,
    latest: samples[samples.length - 1],
    maxima: {
      node_cpu_percent: max('node.cpu_percent'),
      node_rss_bytes: max('node.rss_bytes'),
      node_heap_used_bytes: max('node.heap_used_bytes'),
      event_loop_delay_p95_ms: max('node.event_loop_delay_p95_ms'),
      host_cpu_percent: max('host.cpu_percent'),
      host_ram_used_bytes: max('host.ram_used_bytes'),
      host_ram_used_percent: max('host.ram_used_percent'),
      mysql_threads_connected: max('mysql.Threads_connected'),
      mysql_threads_running: max('mysql.Threads_running')
    }
  };
}

function endpointSnapshot(endpoint) {
  return {
    route: endpoint.route,
    method: endpoint.method,
    requests: endpoint.requests,
    errors: endpoint.errors,
    status: { ...endpoint.status },
    latency: latencySnapshot(endpoint.latency)
  };
}

function fingerprintSnapshot(item) {
  return {
    fingerprint: item.fingerprint,
    operation: item.operation,
    sql_shape: item.sql_shape,
    count: item.count,
    errors: item.errors,
    slow_queries: item.slow_queries,
    latency: latencySnapshot(item.latency)
  };
}

class LoadTestRegistry extends EventEmitter {
  constructor(options = {}) {
    super();
    this.sessions = new Map();
    this.now = typeof options.now === 'function' ? options.now : nowMs;
    this.randomBytes = typeof options.randomBytes === 'function' ? options.randomBytes : crypto.randomBytes;
    this.cleanupIntervalMs = Math.max(1000, Number(options.cleanupIntervalMs || 30000));

    if (options.autoCleanup !== false) {
      this.cleanupTimer = setInterval(() => this.cleanupExpired(), this.cleanupIntervalMs);
      this.cleanupTimer.unref?.();
    } else {
      this.cleanupTimer = null;
    }
  }

  createSession({ actorUserId, vus, durationSeconds, scenario }) {
    this.cleanupExpired();
    const active = this.getActiveSessionInternal();
    if (active) {
      const error = new Error('Ya existe una prueba de carga preparada o en ejecución en este servidor.');
      error.status = 409;
      error.code = 'LOAD_TEST_ALREADY_RUNNING';
      throw error;
    }

    const settings = getLoadTestTelemetrySettings();
    const createdAt = this.now();
    const id = `LOAD-${createdAt.toString(36).toUpperCase()}-${this.randomBytes(4).toString('hex').toUpperCase()}`;

    const session = {
      id,
      actorUserId: Number(actorUserId),
      vus: Number(vus),
      durationSeconds: Number(durationSeconds),
      scenario: String(scenario),
      state: 'LISTA',
      createdAt,
      startedAt: null,
      stoppedAt: null,
      stoppedBy: null,
      stopReason: null,
      readyExpiresAt: createdAt + settings.ready_ttl_seconds * 1000,
      executionDeadlineAt: null,
      retentionExpiresAt: null,
      runnerTokenHash: null,
      runnerClaimedAt: null,
      runnerClaimedBy: null,
      runnerClaimCount: 0,
      cancelRequestedAt: null,
      cancelRequestedBy: null,
      cancelReason: null,
      cancelSource: null,
      finalizationDeadlineAt: null,
      completionIntegrity: null,
      summaryDeadlineAt: null,
      runnerSummary: null,
      summaryReceivedAt: null,
      reportText: null,
      reportGeneratedAt: null,
      reportIncompleteReason: null,
      settings,
      telemetry: createTelemetry(settings)
    };

    this.sessions.set(id, session);
    this.emit('sessionCreated', session);

    return {
      session: this.publicSession(session)
    };
  }

  claimRunner(id, { actorUserId } = {}) {
    const session = this.requireSession(id);
    if (session.state !== 'LISTA') {
      const error = new Error('El runner solo puede reclamar una sesión preparada y todavía no iniciada.');
      error.status = 409;
      error.code = 'LOAD_TEST_RUNNER_CLAIM_NOT_READY';
      throw error;
    }
    if (session.runnerClaimedAt || session.runnerTokenHash || session.runnerClaimCount > 0) {
      const error = new Error('El claim del runner ya fue consumido. Prepara una nueva sesión para obtener otro token.');
      error.status = 409;
      error.code = 'LOAD_TEST_RUNNER_ALREADY_CLAIMED';
      throw error;
    }

    const token = this.randomBytes(32).toString('base64url');
    session.runnerTokenHash = hashToken(token);
    session.runnerClaimedAt = this.now();
    session.runnerClaimedBy = Number.isInteger(Number(actorUserId)) ? Number(actorUserId) : null;
    session.runnerClaimCount = 1;
    this.emit('runnerClaimed', session);

    return {
      session: this.publicSession(session),
      runner_token: token
    };
  }

  getSessionInternal(id) {
    this.cleanupExpired();
    return this.sessions.get(String(id || '').trim()) || null;
  }

  requireSession(id) {
    const session = this.getSessionInternal(id);
    if (!session) {
      const error = new Error('La sesión temporal de prueba no existe o ya expiró.');
      error.status = 404;
      error.code = 'LOAD_TEST_SESSION_NOT_FOUND';
      throw error;
    }
    return session;
  }

  getActiveSessionInternal() {
    for (const session of this.sessions.values()) {
      if (session.state === 'LISTA' || session.state === 'EJECUTANDO' || session.state === 'FINALIZANDO') return session;
    }
    return null;
  }

  getActivePublicSession() {
    this.cleanupExpired();
    const session = this.getActiveSessionInternal();
    return session ? this.publicSession(session) : null;
  }

  getPublicSession(id) {
    return this.publicSession(this.requireSession(id));
  }

  startSession(id) {
    const session = this.requireSession(id);
    if (session.state === 'EJECUTANDO') return this.publicSession(session);
    if (session.state !== 'LISTA') {
      const error = new Error('La sesión ya no está disponible para iniciar telemetría.');
      error.status = 409;
      error.code = 'LOAD_TEST_SESSION_NOT_READY';
      throw error;
    }

    if (!session.runnerTokenHash || !session.runnerClaimedAt) {
      const error = new Error('El runner debe reclamar la sesión antes de iniciar la ejecución.');
      error.status = 409;
      error.code = 'LOAD_TEST_RUNNER_CLAIM_REQUIRED';
      throw error;
    }

    const startedAt = this.now();
    session.state = 'EJECUTANDO';
    session.startedAt = startedAt;
    session.readyExpiresAt = null;
    session.executionDeadlineAt = startedAt + (session.durationSeconds + session.settings.active_grace_seconds) * 1000;
    this.emit('sessionStarted', session);
    return this.publicSession(session);
  }

  requestStop(id, { actorUserId = null, reason = 'MANUAL', source = 'MANUAL' } = {}) {
    const session = this.requireSession(id);
    if (session.state === 'FINALIZANDO') return this.publicSession(session);
    if (session.state === 'LISTA') {
      return this.stopSession(id, { actorUserId, reason, finalState: 'DETENIDA' });
    }
    if (session.state !== 'EJECUTANDO') return this.publicSession(session);

    const requestedAt = this.now();
    session.state = 'FINALIZANDO';
    session.stoppedBy = Number.isInteger(Number(actorUserId)) ? Number(actorUserId) : null;
    session.cancelRequestedAt = requestedAt;
    session.cancelRequestedBy = session.stoppedBy;
    session.cancelReason = String(reason || 'MANUAL').slice(0, 120);
    session.cancelSource = String(source || 'MANUAL').toUpperCase();
    session.stopReason = session.cancelReason;
    session.executionDeadlineAt = null;
    session.finalizationDeadlineAt = requestedAt + session.settings.finalization_timeout_seconds * 1000;
    this.emit('sessionFinalizing', session);
    return this.publicSession(session);
  }

  acknowledgeStop(id, token) {
    const session = this.validateRunnerToken(id, token, { requireRunning: false });
    if (session.state !== 'FINALIZANDO') return this.publicSession(session);
    session.telemetry.runner.control_ack_at = this.now();
    this.emit('runnerStopAcknowledged', session);
    return this.publicSession(session);
  }

  recordRunnerSample(id, token, sample = {}) {
    const session = this.validateRunnerToken(id, token, { requireRunning: false });
    if (session.state !== 'EJECUTANDO' && session.state !== 'FINALIZANDO') {
      const error = new Error('La sesión ya no acepta métricas en vivo del runner.');
      error.status = 409;
      error.code = 'LOAD_TEST_RUNNER_SAMPLE_NOT_ACTIVE';
      throw error;
    }

    const normalized = {
      at: new Date(this.now()).toISOString(),
      vus_active: Math.max(0, Math.trunc(safeNumber(sample.vus_active, 0))),
      vus_initialized: Math.max(0, Math.trunc(safeNumber(sample.vus_initialized, 0))),
      iterations_completed: Math.max(0, Math.trunc(safeNumber(sample.iterations_completed, 0))),
      iterations_interrupted: Math.max(0, Math.trunc(safeNumber(sample.iterations_interrupted, 0))),
      test_run_duration_ms: Math.max(0, safeNumber(sample.test_run_duration_ms, 0)),
      progress: Math.max(0, Math.min(1, safeNumber(sample.progress, 0)))
    };

    const runner = session.telemetry.runner;
    runner.latest = normalized;
    runner.last_seen_at = this.now();
    runner.max_vus_active = Math.max(runner.max_vus_active, normalized.vus_active);
    if (runner.samples.length >= session.settings.max_system_samples) runner.samples.shift();
    runner.samples.push(normalized);
    return this.publicSession(session);
  }

  signalRunnerAbort(id, token, reason = 'RUNNER_ABORT') {
    const session = this.validateRunnerToken(id, token, { requireRunning: false });
    if (session.state === 'EJECUTANDO') {
      return this.requestStop(id, { reason: String(reason || 'RUNNER_ABORT').slice(0, 120), source: 'RUNNER' });
    }
    return this.publicSession(session);
  }

  finalizeSession(id, { actorUserId = null, reason = null, finalState = null, integrity = null } = {}) {
    const session = this.requireSession(id);
    const stoppedAt = this.now();
    let nextState = finalState;
    if (!nextState) {
      if (session.cancelSource === 'MANUAL') nextState = 'ABORTADA_MANUAL';
      else if (session.cancelSource === 'AUTOMATIC') nextState = 'ABORTADA_AUTOMATICA';
      else if (session.cancelSource === 'RUNNER') nextState = 'ABORTADA_RUNNER';
      else nextState = 'FINALIZADA';
    }

    session.state = String(nextState);
    session.stoppedAt = stoppedAt;
    if (Number.isInteger(Number(actorUserId))) session.stoppedBy = Number(actorUserId);
    session.stopReason = String(reason || session.cancelReason || session.stopReason || 'RUNNER_FINISH').slice(0, 120);
    session.readyExpiresAt = null;
    session.executionDeadlineAt = null;
    session.finalizationDeadlineAt = null;
    session.retentionExpiresAt = stoppedAt + session.settings.result_ttl_seconds * 1000;
    session.completionIntegrity = integrity || (nextState === 'ABORTADA_SIN_CONFIRMACION' ? 'INCOMPLETO' : 'PENDIENTE_RESUMEN');
    session.summaryDeadlineAt = session.completionIntegrity === 'PENDIENTE_RESUMEN'
      ? stoppedAt + session.settings.summary_timeout_seconds * 1000
      : null;
    if (session.completionIntegrity === 'INCOMPLETO' && !session.reportText) {
      session.reportIncompleteReason = session.reportIncompleteReason || session.stopReason || 'RUNNER_SUMMARY_UNAVAILABLE';
      session.reportGeneratedAt = stoppedAt;
      session.telemetrySnapshot = this.telemetrySnapshot(session);
      session.reportText = buildLoadTestReport(session);
      delete session.telemetrySnapshot;
    }
    session.telemetry.runner.finished_at = stoppedAt;
    session.telemetry.http.active = 0;
    session.telemetry.sql.active = 0;
    session.telemetry.sql.pool.active_waits = 0;
    this.emit('sessionStopped', session);
    return this.publicSession(session);
  }

  finishRunner(id, token, { reason = 'RUNNER_TEARDOWN' } = {}) {
    const session = this.validateRunnerToken(id, token, { requireRunning: false });
    if (['FINALIZADA', 'DETENIDA', 'ABORTADA_MANUAL', 'ABORTADA_AUTOMATICA', 'ABORTADA_RUNNER', 'ABORTADA_SIN_CONFIRMACION'].includes(session.state)) {
      return this.publicSession(session);
    }
    return this.finalizeSession(id, { reason });
  }

  acceptRunnerSummary(id, token, summary) {
    let session = this.validateRunnerToken(id, token, { requireRunning: false });
    if (session.summaryReceivedAt || session.runnerSummary) {
      const error = new Error('El resumen final del runner ya fue recibido para esta sesion.');
      error.status = 409;
      error.code = 'LOAD_TEST_RUNNER_SUMMARY_ALREADY_RECEIVED';
      throw error;
    }

    if (session.state === 'EJECUTANDO' || session.state === 'FINALIZANDO' || session.state === 'LISTA') {
      this.finalizeSession(id, { reason: session.stopReason || 'RUNNER_SUMMARY_RECEIVED' });
      session = this.requireSession(id);
    }

    const terminalStates = ['FINALIZADA', 'DETENIDA', 'ABORTADA_MANUAL', 'ABORTADA_AUTOMATICA', 'ABORTADA_RUNNER', 'ABORTADA_SIN_CONFIRMACION'];
    if (!terminalStates.includes(session.state)) {
      const error = new Error('La sesion no esta disponible para recibir el resumen final.');
      error.status = 409;
      error.code = 'LOAD_TEST_RUNNER_SUMMARY_NOT_READY';
      throw error;
    }

    const receivedAt = this.now();
    session.runnerSummary = summary;
    session.summaryReceivedAt = receivedAt;
    session.summaryDeadlineAt = null;
    session.completionIntegrity = 'COMPLETO';
    session.reportIncompleteReason = null;
    session.reportGeneratedAt = receivedAt;
    session.telemetrySnapshot = this.telemetrySnapshot(session);
    session.reportText = buildLoadTestReport(session);
    delete session.telemetrySnapshot;
    this.emit('runnerSummaryReceived', session);
    return this.publicSession(session);
  }

  markSummaryIncomplete(id, reason = 'RUNNER_SUMMARY_TIMEOUT') {
    const session = this.sessions.get(String(id || '').trim());
    if (!session) {
      const error = new Error('La sesion temporal de prueba no existe o ya expiro.');
      error.status = 404;
      error.code = 'LOAD_TEST_SESSION_NOT_FOUND';
      throw error;
    }
    if (session.summaryReceivedAt || session.runnerSummary) return this.publicSession(session);
    if (session.completionIntegrity !== 'PENDIENTE_RESUMEN' && session.completionIntegrity !== 'INCOMPLETO') {
      return this.publicSession(session);
    }
    const at = this.now();
    session.completionIntegrity = 'INCOMPLETO';
    session.summaryDeadlineAt = null;
    session.reportIncompleteReason = String(reason || 'RUNNER_SUMMARY_UNAVAILABLE').slice(0, 120);
    if (!session.reportText) {
      session.reportGeneratedAt = at;
      session.telemetrySnapshot = this.telemetrySnapshot(session);
      session.reportText = buildLoadTestReport(session);
      delete session.telemetrySnapshot;
    }
    this.emit('runnerSummaryMissing', session);
    return this.publicSession(session);
  }

  getReportText(id) {
    const session = this.requireSession(id);
    if (session.completionIntegrity === 'PENDIENTE_RESUMEN') {
      const error = new Error('El reporte final aun espera el resumen de k6.');
      error.status = 409;
      error.code = 'LOAD_TEST_REPORT_PENDING_SUMMARY';
      throw error;
    }
    if (!session.reportText) {
      const error = new Error('El reporte final todavia no esta disponible.');
      error.status = 409;
      error.code = 'LOAD_TEST_REPORT_NOT_READY';
      throw error;
    }
    return session.reportText;
  }

  stopSession(id, { actorUserId = null, reason = 'MANUAL', finalState = 'DETENIDA' } = {}) {
    const session = this.requireSession(id);
    if (!['EJECUTANDO', 'LISTA', 'FINALIZANDO'].includes(session.state)) return this.publicSession(session);
    return this.finalizeSession(id, { actorUserId, reason, finalState });
  }

  deleteSession(id) {
    const session = this.requireSession(id);
    if (session.state === 'EJECUTANDO' || session.state === 'FINALIZANDO') {
      const error = new Error('Detén y finaliza la prueba antes de limpiar la sesión.');
      error.status = 409;
      error.code = 'LOAD_TEST_STOP_REQUIRED';
      throw error;
    }
    this.sessions.delete(session.id);
    this.emit('sessionDeleted', session);
    return true;
  }

  validateRunnerToken(id, token, { requireRunning = true } = {}) {
    const session = this.requireSession(id);
    if (!session.runnerTokenHash || !safeTokenEquals(session.runnerTokenHash, token)) {
      const error = new Error('Token efímero de prueba inválido.');
      error.status = 401;
      error.code = 'LOAD_TEST_TOKEN_INVALID';
      throw error;
    }
    if (requireRunning && session.state !== 'EJECUTANDO') {
      const error = new Error('La sesión de prueba no está ejecutándose.');
      error.status = 409;
      error.code = 'LOAD_TEST_SESSION_NOT_RUNNING';
      throw error;
    }
    return session;
  }

  beginHttp(id) {
    const session = this.sessions.get(String(id || '').trim());
    if (!session || session.state !== 'EJECUTANDO') return false;
    const http = session.telemetry.http;
    http.started += 1;
    http.active += 1;
    http.max_active = Math.max(http.max_active, http.active);
    return true;
  }

  finishHttp(id, { method, route, statusCode, durationMs, closedEarly = false } = {}) {
    const session = this.sessions.get(String(id || '').trim());
    if (!session || (session.state !== 'EJECUTANDO' && session.state !== 'FINALIZANDO')) return false;
    const http = session.telemetry.http;
    http.active = Math.max(0, http.active - 1);
    http.completed += 1;
    if (closedEarly) http.closed_early += 1;
    const status = Number(statusCode) || 0;
    const statusKey = status ? String(status) : 'NO_STATUS';
    http.status[statusKey] = Number(http.status[statusKey] || 0) + 1;
    if (closedEarly || status >= 500 || status === 0) http.errors += 1;
    addLatency(http.latency, durationMs);
    const at = this.now();
    const bucketAt = Math.floor(at / 1000) * 1000;
    const bucket = http.recent_buckets.get(bucketAt) || { completed: 0, five_xx: 0, latency_count: 0, slow_latency: 0 };
    bucket.completed += 1;
    if (status >= 500 && status <= 599) bucket.five_xx += 1;
    const latency = safeNumber(durationMs, NaN);
    if (Number.isFinite(latency) && latency >= 0) {
      bucket.latency_count += 1;
      if (latency >= session.settings.protection_p95_ms) bucket.slow_latency += 1;
    }
    http.recent_buckets.set(bucketAt, bucket);
    const cutoff = at - session.settings.live_window_seconds * 1000;
    for (const recordedAt of http.recent_buckets.keys()) {
      if (recordedAt + 1000 <= cutoff) http.recent_buckets.delete(recordedAt);
    }
    addTimedLatency(http.recent_latency, at, durationMs);

    const key = `${String(method || 'GET').toUpperCase()} ${String(route || 'UNKNOWN')}`;
    let endpoint = http.endpoints.get(key);
    if (!endpoint) {
      if (http.endpoints.size >= session.settings.max_endpoints) {
        endpoint = http.endpoints.get('__OTHER__');
        if (!endpoint) {
          endpoint = {
            route: '__OTHER__', method: 'MIXED', requests: 0, errors: 0, status: {},
            latency: createLatencyAccumulator(session.settings.max_endpoint_latency_samples)
          };
          http.endpoints.set('__OTHER__', endpoint);
        }
      } else {
        endpoint = {
          route: String(route || 'UNKNOWN'),
          method: String(method || 'GET').toUpperCase(),
          requests: 0,
          errors: 0,
          status: {},
          latency: createLatencyAccumulator(session.settings.max_endpoint_latency_samples)
        };
        http.endpoints.set(key, endpoint);
      }
    }

    endpoint.requests += 1;
    endpoint.status[statusKey] = Number(endpoint.status[statusKey] || 0) + 1;
    if (closedEarly || status >= 500 || status === 0) endpoint.errors += 1;
    addLatency(endpoint.latency, durationMs);
    this.evaluateProtection(session);
    return true;
  }

  evaluateProtection(session) {
    if (!session || session.state !== 'EJECUTANDO') return null;
    const recent = recentHttpSnapshot(session, this.now(), { includeLatency: false });
    if (recent.completed < session.settings.protection_min_requests) return null;

    const rate = (recent.five_xx / recent.completed) * 100;
    if (rate >= session.settings.protection_5xx_percent) {
      return this.requestStop(session.id, { reason: 'PROTECTION_HTTP_5XX', source: 'AUTOMATIC' });
    }
    const p95Reached = recent.latency_count > 0
      && recent.slow_latency > recent.latency_count - Math.ceil(recent.latency_count * 0.95);
    if (p95Reached) {
      return this.requestStop(session.id, { reason: 'PROTECTION_P95_BACKEND', source: 'AUTOMATIC' });
    }
    return null;
  }

  beginSql(id) {
    const session = this.sessions.get(String(id || '').trim());
    if (!session || (session.state !== 'EJECUTANDO' && session.state !== 'FINALIZANDO')) return false;
    const sql = session.telemetry.sql;
    sql.started += 1;
    sql.active += 1;
    sql.max_active = Math.max(sql.max_active, sql.active);
    return true;
  }

  finishSql(id, telemetry = {}) {
    const session = this.sessions.get(String(id || '').trim());
    if (!session || (session.state !== 'EJECUTANDO' && session.state !== 'FINALIZANDO')) return false;
    const sql = session.telemetry.sql;
    sql.active = Math.max(0, sql.active - 1);
    sql.completed += 1;
    const duration = safeNumber(telemetry.duration_ms, 0);
    addLatency(sql.latency, duration);
    if (telemetry.error_code || telemetry.error_errno) sql.errors += 1;
    const slow = duration >= session.settings.slow_query_ms;
    if (slow) sql.slow_queries += 1;

    const fingerprint = String(telemetry.fingerprint || 'unknown');
    let item = sql.fingerprints.get(fingerprint);
    if (!item) {
      if (sql.fingerprints.size >= session.settings.max_fingerprints) {
        item = sql.fingerprints.get('__OTHER__');
        if (!item) {
          item = {
            fingerprint: '__OTHER__', operation: 'MIXED', sql_shape: '[otros fingerprints]',
            count: 0, errors: 0, slow_queries: 0,
            latency: createLatencyAccumulator(session.settings.max_endpoint_latency_samples)
          };
          sql.fingerprints.set('__OTHER__', item);
        }
      } else {
        item = {
          fingerprint,
          operation: String(telemetry.operation || 'SQL'),
          sql_shape: redactSqlShape(telemetry.sql_shape),
          count: 0,
          errors: 0,
          slow_queries: 0,
          latency: createLatencyAccumulator(session.settings.max_endpoint_latency_samples)
        };
        sql.fingerprints.set(fingerprint, item);
      }
    }

    item.count += 1;
    if (telemetry.error_code || telemetry.error_errno) item.errors += 1;
    if (slow) item.slow_queries += 1;
    addLatency(item.latency, duration);
    return true;
  }

  beginPoolAcquire(id) {
    const session = this.sessions.get(String(id || '').trim());
    if (!session || (session.state !== 'EJECUTANDO' && session.state !== 'FINALIZANDO')) return false;
    const pool = session.telemetry.sql.pool;
    pool.acquisitions_started += 1;
    pool.active_waits += 1;
    pool.max_active_waits = Math.max(pool.max_active_waits, pool.active_waits);
    return true;
  }

  finishPoolAcquire(id, waitMs, error = null) {
    const session = this.sessions.get(String(id || '').trim());
    if (!session || (session.state !== 'EJECUTANDO' && session.state !== 'FINALIZANDO')) return false;
    const pool = session.telemetry.sql.pool;
    pool.active_waits = Math.max(0, pool.active_waits - 1);
    pool.acquisitions_completed += 1;
    if (error) pool.errors += 1;
    addLatency(pool.wait_latency, waitMs);
    return true;
  }

  recordSystemSample(id, sample) {
    const session = this.sessions.get(String(id || '').trim());
    if (!session || (session.state !== 'EJECUTANDO' && session.state !== 'FINALIZANDO')) return false;
    const samples = session.telemetry.system_samples;
    if (samples.length >= session.settings.max_system_samples) samples.shift();
    samples.push(sample);
    return true;
  }

  telemetrySnapshot(session) {
    const http = session.telemetry.http;
    const sql = session.telemetry.sql;
    const runner = session.telemetry.runner;
    const endAt = session.stoppedAt || this.now();
    const elapsedSeconds = session.startedAt != null ? Math.max(0.001, (endAt - session.startedAt) / 1000) : 0;
    const recent = recentHttpSnapshot(session, endAt);
    return {
      runner: {
        target_vus: session.vus,
        latest: runner.latest ? { ...runner.latest } : null,
        max_vus_active: runner.max_vus_active,
        last_seen_at: asIso(runner.last_seen_at),
        control_ack_at: asIso(runner.control_ack_at),
        finished_at: asIso(runner.finished_at)
      },
      http: {
        started: http.started,
        completed: http.completed,
        rps_backend: recent.rps_backend,
        rps_backend_avg: elapsedSeconds > 0 ? Number((http.completed / elapsedSeconds).toFixed(2)) : 0,
        active: http.active,
        max_active: http.max_active,
        errors: http.errors,
        closed_early: http.closed_early,
        status: { ...http.status },
        latency: latencySnapshot(http.latency),
        latency_recent: recent.latency,
        endpoints: [...http.endpoints.values()]
          .map(endpointSnapshot)
          .sort((a, b) => (b.latency.p95_ms || 0) - (a.latency.p95_ms || 0))
      },
      sql: {
        started: sql.started,
        completed: sql.completed,
        active: sql.active,
        max_active: sql.max_active,
        errors: sql.errors,
        slow_queries: sql.slow_queries,
        latency: latencySnapshot(sql.latency),
        pool: {
          acquisitions_started: sql.pool.acquisitions_started,
          acquisitions_completed: sql.pool.acquisitions_completed,
          active_waits: sql.pool.active_waits,
          max_active_waits: sql.pool.max_active_waits,
          errors: sql.pool.errors,
          wait_latency: latencySnapshot(sql.pool.wait_latency)
        },
        fingerprints: [...sql.fingerprints.values()]
          .map(fingerprintSnapshot)
          .sort((a, b) => (b.latency.p95_ms || 0) - (a.latency.p95_ms || 0))
      },
      system: summarizeSystemSamples(session.telemetry.system_samples)
    };
  }

  publicSession(session) {
    if (!session) return null;
    const expiresAt = session.state === 'LISTA'
      ? session.readyExpiresAt
      : session.state === 'EJECUTANDO'
        ? session.executionDeadlineAt
        : session.state === 'FINALIZANDO'
          ? session.finalizationDeadlineAt
          : session.retentionExpiresAt;

    return {
      id: session.id,
      actor_user_id: session.actorUserId,
      vus: session.vus,
      duration_seconds: session.durationSeconds,
      scenario: session.scenario,
      state: session.state,
      created_at: asIso(session.createdAt),
      started_at: asIso(session.startedAt),
      stopped_at: asIso(session.stoppedAt),
      stopped_by: session.stoppedBy,
      stop_reason: session.stopReason,
      cancel_requested_at: asIso(session.cancelRequestedAt),
      cancel_reason: session.cancelReason,
      cancel_source: session.cancelSource,
      completion_integrity: session.completionIntegrity,
      summary_deadline_at: asIso(session.summaryDeadlineAt),
      summary_received_at: asIso(session.summaryReceivedAt),
      report_available: Boolean(session.reportText),
      report_generated_at: asIso(session.reportGeneratedAt),
      report_incomplete_reason: session.reportIncompleteReason,
      runner_claimed: Boolean(session.runnerClaimedAt),
      runner_claimed_at: asIso(session.runnerClaimedAt),
      expires_at: asIso(expiresAt),
      telemetry: this.telemetrySnapshot(session)
    };
  }

  cleanupExpired() {
    const current = this.now();
    for (const session of [...this.sessions.values()]) {
      if (session.state === 'LISTA' && session.readyExpiresAt && current >= session.readyExpiresAt) {
        this.sessions.delete(session.id);
        this.emit('sessionExpired', session);
        continue;
      }

      if (session.state === 'EJECUTANDO' && session.executionDeadlineAt && current >= session.executionDeadlineAt) {
        session.state = 'FINALIZANDO';
        session.cancelRequestedAt = current;
        session.cancelReason = 'EXECUTION_TTL';
        session.cancelSource = 'AUTOMATIC';
        session.stopReason = 'EXECUTION_TTL';
        session.executionDeadlineAt = null;
        session.finalizationDeadlineAt = current + session.settings.finalization_timeout_seconds * 1000;
        this.emit('sessionFinalizing', session);
        continue;
      }

      if (session.state === 'FINALIZANDO' && session.finalizationDeadlineAt && current >= session.finalizationDeadlineAt) {
        session.state = 'ABORTADA_SIN_CONFIRMACION';
        session.stoppedAt = current;
        session.stopReason = session.cancelReason || 'RUNNER_CONTROL_TIMEOUT';
        session.finalizationDeadlineAt = null;
        session.retentionExpiresAt = current + session.settings.result_ttl_seconds * 1000;
        session.completionIntegrity = 'INCOMPLETO';
        session.summaryDeadlineAt = null;
        session.reportIncompleteReason = session.stopReason || 'RUNNER_CONTROL_TIMEOUT';
        session.reportGeneratedAt = current;
        session.telemetry.runner.finished_at = current;
        session.telemetry.http.active = 0;
        session.telemetry.sql.active = 0;
        session.telemetry.sql.pool.active_waits = 0;
        session.telemetrySnapshot = this.telemetrySnapshot(session);
        session.reportText = buildLoadTestReport(session);
        delete session.telemetrySnapshot;
        this.emit('sessionStopped', session);
        continue;
      }

      if (session.completionIntegrity === 'PENDIENTE_RESUMEN'
          && session.summaryDeadlineAt && current >= session.summaryDeadlineAt) {
        this.markSummaryIncomplete(session.id, 'RUNNER_SUMMARY_TIMEOUT');
      }

      if (['FINALIZADA', 'DETENIDA', 'ABORTADA_MANUAL', 'ABORTADA_AUTOMATICA', 'ABORTADA_RUNNER', 'ABORTADA_SIN_CONFIRMACION'].includes(session.state)
          && session.retentionExpiresAt && current >= session.retentionExpiresAt) {
        this.sessions.delete(session.id);
        this.emit('sessionExpired', session);
      }
    }
  }

  close() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.cleanupTimer = null;
    this.removeAllListeners();
    this.sessions.clear();
  }
}

const registry = new LoadTestRegistry();

module.exports = registry;
module.exports.LoadTestRegistry = LoadTestRegistry;
module.exports._latencySnapshot = latencySnapshot;

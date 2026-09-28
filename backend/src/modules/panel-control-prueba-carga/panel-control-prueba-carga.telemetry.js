'use strict';

const os = require('os');
const { monitorEventLoopDelay } = require('perf_hooks');
const registry = require('./panel-control-prueba-carga.registry');
const { runWithLoadTestContext } = require('./panel-control-prueba-carga.context');
const { collectMySqlMetrics } = require('./panel-control-prueba-carga.mysql-metrics');
const { PROCESS_INSTANCE_ID } = require('./panel-control-prueba-carga.runtime');

const samplers = new Map();

function hrDurationMs(startedAt) {
  return Number(process.hrtime.bigint() - startedAt) / 1e6;
}

function normalizeRoutePath(req) {
  const routePath = req.route?.path;
  if (routePath) {
    const base = String(req.baseUrl || '').replace(/\/$/, '');
    const route = String(routePath || '').replace(/^\//, '');
    return `${base}/${route}`.replace(/\/+/g, '/');
  }

  const raw = String(req.originalUrl || req.url || '').split('?')[0] || '/';
  return raw
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id')
    .replace(/\/(\d+)(?=\/|$)/g, '/:id')
    .replace(/\/[A-Za-z0-9_-]{24,}(?=\/|$)/g, '/:id');
}

function loadTestTelemetryMiddleware(req, res, next) {
  const sessionId = String(req.get('X-Mantto-Load-Test') || '').trim();
  if (!sessionId) return next();

  if (typeof res.setHeader === 'function') {
    res.setHeader('X-Mantto-Load-Test-Instance', PROCESS_INSTANCE_ID);
  }

  const expectedInstance = String(req.get('X-Mantto-Load-Test-Instance') || '').trim();
  if (!expectedInstance || expectedInstance !== PROCESS_INSTANCE_ID) {
    return res.status(421).json({
      ok: false,
      code: 'LOAD_TEST_INSTANCE_MISMATCH',
      message: 'La solicitud de prueba no corresponde al proceso backend que reclamó la sesión.'
    });
  }

  const runnerToken = String(req.get('X-Mantto-Load-Test-Token') || '').trim();
  if (!runnerToken) {
    return res.status(401).json({
      ok: false,
      code: 'LOAD_TEST_TOKEN_REQUIRED',
      message: 'La solicitud de prueba no incluye el token efímero requerido.'
    });
  }

  try {
    registry.validateRunnerToken(sessionId, runnerToken, { requireRunning: true });
  } catch (error) {
    if (error.code === 'LOAD_TEST_SESSION_NOT_RUNNING' && typeof res.setHeader === 'function') {
      res.setHeader('X-Mantto-Load-Test-Stop', '1');
    }
    return res.status(error.status || 401).json({
      ok: false,
      code: error.code || 'LOAD_TEST_CONTEXT_INVALID',
      message: error.message || 'Contexto de prueba inválido.'
    });
  }

  const method = String(req.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    return res.status(405).json({
      ok: false,
      code: 'LOAD_TEST_READ_ONLY',
      message: 'Las solicitudes marcadas como Prueba de Carga son únicamente de lectura (GET/HEAD).'
    });
  }

  const startedAt = process.hrtime.bigint();
  registry.beginHttp(sessionId);
  let finished = false;

  const finish = (closedEarly) => {
    if (finished) return;
    finished = true;
    registry.finishHttp(sessionId, {
      method: req.method,
      route: normalizeRoutePath(req),
      statusCode: res.statusCode,
      durationMs: hrDurationMs(startedAt),
      closedEarly
    });
  };

  res.once('finish', () => finish(false));
  res.once('close', () => finish(!res.writableEnded));
  req.loadTestSessionId = sessionId;

  return runWithLoadTestContext({ sessionId }, next);
}

function cpuTimes() {
  return os.cpus().reduce((acc, cpu) => {
    const times = cpu.times || {};
    const total = Number(times.user || 0) + Number(times.nice || 0) + Number(times.sys || 0) + Number(times.idle || 0) + Number(times.irq || 0);
    acc.total += total;
    acc.idle += Number(times.idle || 0);
    return acc;
  }, { total: 0, idle: 0 });
}

function cpuHostPercent(previous, current) {
  if (!previous || !current) return null;
  const total = current.total - previous.total;
  const idle = current.idle - previous.idle;
  if (total <= 0) return null;
  return Number((((total - idle) / total) * 100).toFixed(2));
}

function processCpuPercent(state, nowHr) {
  const usage = process.cpuUsage(state.previousProcessCpu);
  const elapsedUs = Number(nowHr - state.previousProcessHr) / 1000;
  state.previousProcessCpu = process.cpuUsage();
  state.previousProcessHr = nowHr;
  if (elapsedUs <= 0) return null;
  return Number((((usage.user + usage.system) / elapsedUs) * 100).toFixed(2));
}

async function collectSample(sessionId, state) {
  if (state.collecting) return;
  state.collecting = true;
  try {
    const nowHr = process.hrtime.bigint();
    const memory = process.memoryUsage();
    const currentCpuTimes = cpuTimes();
    const hostTotal = os.totalmem();
    const hostFree = os.freemem();
    const hostUsed = Math.max(0, hostTotal - hostFree);
    const mysql = await collectMySqlMetrics();
    const eventLoopMean = Number.isFinite(state.eventLoop.mean) ? Number(state.eventLoop.mean / 1e6) : null;
    const eventLoopP95 = Number.isFinite(state.eventLoop.percentile(95)) ? Number(state.eventLoop.percentile(95) / 1e6) : null;

    const sample = {
      at: new Date().toISOString(),
      node: {
        cpu_percent: processCpuPercent(state, nowHr),
        rss_bytes: memory.rss,
        heap_used_bytes: memory.heapUsed,
        heap_total_bytes: memory.heapTotal,
        external_bytes: memory.external,
        event_loop_delay_mean_ms: eventLoopMean === null ? 'N/D' : Number(eventLoopMean.toFixed(2)),
        event_loop_delay_p95_ms: eventLoopP95 === null ? 'N/D' : Number(eventLoopP95.toFixed(2)),
        uptime_seconds: Number(process.uptime().toFixed(2))
      },
      host: {
        cpu_percent: cpuHostPercent(state.previousHostCpu, currentCpuTimes) ?? 'N/D',
        ram_total_bytes: hostTotal,
        ram_used_bytes: hostUsed,
        ram_used_percent: hostTotal > 0 ? Number(((hostUsed / hostTotal) * 100).toFixed(2)) : 'N/D',
        load_average: process.platform === 'win32' ? 'N/D' : os.loadavg().map((value) => Number(value.toFixed(2)))
      },
      mysql
    };

    state.previousHostCpu = currentCpuTimes;
    state.eventLoop.reset();
    registry.recordSystemSample(sessionId, sample);
  } finally {
    state.collecting = false;
  }
}

function startTelemetrySession(session) {
  const sessionId = typeof session === 'string' ? session : session?.id;
  if (!sessionId || samplers.has(sessionId)) return false;
  const current = registry.getSessionInternal(sessionId);
  if (!current || current.state !== 'EJECUTANDO') return false;

  const eventLoop = monitorEventLoopDelay({ resolution: 20 });
  eventLoop.enable();
  const state = {
    eventLoop,
    previousHostCpu: cpuTimes(),
    previousProcessCpu: process.cpuUsage(),
    previousProcessHr: process.hrtime.bigint(),
    collecting: false,
    timer: null
  };

  const sample = () => collectSample(sessionId, state).catch(() => null);
  state.timer = setInterval(sample, current.settings.sample_interval_ms);
  state.timer.unref?.();
  samplers.set(sessionId, state);
  sample();
  return true;
}

function stopTelemetrySession(session) {
  const sessionId = typeof session === 'string' ? session : session?.id;
  const state = samplers.get(sessionId);
  if (!state) return false;
  clearInterval(state.timer);
  state.eventLoop.disable();
  samplers.delete(sessionId);
  return true;
}

registry.on('sessionStarted', startTelemetrySession);
registry.on('sessionStopped', stopTelemetrySession);
registry.on('sessionDeleted', stopTelemetrySession);
registry.on('sessionExpired', stopTelemetrySession);

module.exports = {
  loadTestTelemetryMiddleware,
  startTelemetrySession,
  stopTelemetrySession,
  _normalizeRoutePath: normalizeRoutePath
};

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..');
process.env.DB_HOST ||= '127.0.0.1';
process.env.DB_PORT ||= '3306';
process.env.DB_USER ||= 'test';
process.env.DB_PASSWORD ||= 'test';
process.env.DB_NAME ||= 'test';
const { LoadTestRegistry } = require(path.join(repoRoot, 'backend', 'src', 'modules', 'panel-control-prueba-carga', 'panel-control-prueba-carga.registry.js'));
const service = require(path.join(repoRoot, 'backend', 'src', 'modules', 'panel-control-prueba-carga', 'panel-control-prueba-carga.service.js'));

function withEnv(values, callback) {
  const previous = {};
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = String(value);
  }
  return Promise.resolve().then(callback).finally(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

function runningSession(registry, actorUserId = 1) {
  const created = registry.createSession({ actorUserId, vus: 10, durationSeconds: 30, scenario: 'SALUD' });
  const claim = registry.claimRunner(created.session.id, { actorUserId });
  registry.startSession(created.session.id);
  return { id: created.session.id, token: claim.runner_token };
}

function validSummary(id, overrides = {}) {
  return {
    session_id: id,
    vus_configured: 10,
    vus_max: 10,
    duration_ms: 30000,
    requests: 100,
    failed: 2,
    rps: 3.33,
    latency: { min: 12, avg: 40, p50: 30, p90: 70, p95: 90, p99: 120, max: 180 },
    http: { '2xx': 98, '3xx': 0, '4xx': 1, '5xx': 1 },
    timeouts: 0,
    network_errors: 0,
    iterations_completed: 100,
    iterations_interrupted: 0,
    ...overrides
  };
}

test('Fase 5: acepta summary una sola vez y construye reporte temporal completo', () => {
  const registry = new LoadTestRegistry({ autoCleanup: false });
  const run = runningSession(registry, 5);
  registry.finishHttp(run.id, { method: 'GET', route: '/api/health', statusCode: 200, durationMs: 25 });
  const finished = registry.finishRunner(run.id, run.token, { reason: 'RUNNER_TEARDOWN_PHASE5' });
  assert.equal(finished.completion_integrity, 'PENDIENTE_RESUMEN');

  const accepted = registry.acceptRunnerSummary(run.id, run.token, validSummary(run.id));
  assert.equal(accepted.completion_integrity, 'COMPLETO');
  assert.equal(accepted.report_available, true);
  assert.ok(accepted.summary_received_at);

  const report = registry.getReportText(run.id);
  assert.match(report, /MANTTO GESTOR - PRUEBA DE CARGA/);
  assert.match(report, /Integridad del reporte: COMPLETO/);
  assert.match(report, /Requests totales k6: 100/);
  assert.match(report, /p95: 90\.00 ms/);
  assert.doesNotMatch(report, /runner_token|Authorization|Bearer/i);

  assert.throws(
    () => registry.acceptRunnerSummary(run.id, run.token, validSummary(run.id)),
    error => error?.code === 'LOAD_TEST_RUNNER_SUMMARY_ALREADY_RECEIVED' && error?.status === 409
  );
  registry.close();
});

test('Fase 5: QUERIES LENTAS excluye fingerprints sin consultas lentas', () => {
  const registry = new LoadTestRegistry({ autoCleanup: false });
  const run = runningSession(registry, 8);
  const session = registry.sessions.get(run.id);
  session.telemetrySnapshot = {
    sql: {
      fingerprints: [
        { fingerprint: 'FAST_ONLY', sql_shape: 'SELECT fast_only', count: 3, slow_queries: 0, latency: { max_ms: 8 } },
        { fingerprint: 'ACTUALLY_SLOW', sql_shape: 'SELECT actually_slow', count: 2, slow_queries: 1, latency: { max_ms: 500 } }
      ]
    }
  };
  const { buildLoadTestReport } = require(path.join(repoRoot, 'backend', 'src', 'modules', 'panel-control-prueba-carga', 'panel-control-prueba-carga.report.js'));
  const report = buildLoadTestReport(session);
  const slowSection = report.split('QUERIES LENTAS\n')[1].split('\nPROTECCION')[0];
  assert.match(slowSection, /ACTUALLY_SLOW/);
  assert.doesNotMatch(slowSection, /FAST_ONLY/);
  registry.close();
});

test('Fase 5: timeout sin summary produce reporte INCOMPLETO sin inventar metricas k6', async () => {
  await withEnv({ LOAD_TEST_SUMMARY_TIMEOUT_SECONDS: '5' }, async () => {
    let now = 1000000;
    const registry = new LoadTestRegistry({ autoCleanup: false, now: () => now });
    const run = runningSession(registry, 6);
    const finished = registry.finishRunner(run.id, run.token, { reason: 'RUNNER_TEARDOWN_PHASE5' });
    assert.equal(finished.completion_integrity, 'PENDIENTE_RESUMEN');

    now += 6000;
    registry.cleanupExpired();
    const current = registry.getPublicSession(run.id);
    assert.equal(current.completion_integrity, 'INCOMPLETO');
    assert.equal(current.report_incomplete_reason, 'RUNNER_SUMMARY_TIMEOUT');
    assert.equal(current.report_available, true);

    const report = registry.getReportText(run.id);
    assert.match(report, /Integridad del reporte: INCOMPLETO/);
    assert.match(report, /Requests totales k6: N\/D/);
    assert.match(report, /Resumen k6 recibido: NO/);
    registry.close();
  });
});

test('Fase 5: summary puede cerrar una sesion FINALIZANDO y conserva estado de aborto manual', () => {
  const registry = new LoadTestRegistry({ autoCleanup: false });
  const run = runningSession(registry, 7);
  registry.requestStop(run.id, { actorUserId: 7, reason: 'UI_MANUAL_STOP', source: 'MANUAL' });
  const result = registry.acceptRunnerSummary(run.id, run.token, validSummary(run.id, { requests: 20, failed: 0, http: { '2xx': 20, '3xx': 0, '4xx': 0, '5xx': 0 } }));
  assert.equal(result.state, 'ABORTADA_MANUAL');
  assert.equal(result.completion_integrity, 'COMPLETO');
  assert.match(registry.getReportText(run.id), /Estado tecnico original: ABORTADA_MANUAL/);
  registry.close();
});

test('Fase 5: normalizador rechaza summary de otra sesion o VUs incompatibles', () => {
  const session = { id: 'LOAD-ABC', vus: 10 };
  assert.throws(
    () => service.normalizeRunnerSummary(validSummary('LOAD-OTRA'), session),
    error => error?.code === 'LOAD_TEST_RUNNER_SUMMARY_SESSION_MISMATCH'
  );
  assert.throws(
    () => service.normalizeRunnerSummary(validSummary('LOAD-ABC', { vus_configured: 20 }), session),
    error => error?.code === 'LOAD_TEST_RUNNER_SUMMARY_VUS_MISMATCH'
  );
});

test('Fase 5: runner usa handleSummary con setupData, token efimero y no escribe archivos', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'scripts', 'load-test', 'mantto-gestor-load-test.k6.js'), 'utf8');
  assert.match(source, /export function handleSummary\s*\(data,\s*setupData\)/);
  assert.match(source, /setupData\?\.runnerToken/);
  assert.match(source, /runner-summary/);
  assert.match(source, /X-Mantto-Load-Test-Token/);
  assert.match(source, /return \{\};/);
  assert.doesNotMatch(source, /summary\.json|summary-export|writeFile|open\([^)]*summary/i);
});

test('Fase 5: frontend presenta reporte, Copiar reporte, Limpiar y polling mientras espera summary', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'modules', 'panel-control-prueba-carga', 'panel-control-prueba-carga.js'), 'utf8');
  assert.match(source, /FASE 5 · REPORTE FINAL EFÍMERO/);
  assert.match(source, /Copiar reporte/);
  assert.match(source, /pclt-report/);
  assert.match(source, /PENDIENTE_RESUMEN/);
  assert.match(source, /needsPolling/);
  assert.match(source, /navigator\.clipboard/);
  assert.match(source, /Limpiar sesión/);
});

test('Fase 5: maximo de VUs sigue dependiendo de LOAD_TEST_MAX_VUS y no de 200 fijo', async () => {
  await withEnv({ LOAD_TEST_MAX_VUS: '1000' }, async () => {
    const normalized = service.normalizedSessionConfig({ vus: 1000, duration_seconds: 30, scenario: 'SALUD' });
    assert.equal(normalized.vus, 1000);
    assert.throws(
      () => service.normalizedSessionConfig({ vus: 1010, duration_seconds: 30, scenario: 'SALUD' }),
      error => error?.code === 'LOAD_TEST_VUS_OUT_OF_RANGE'
    );
  });
});

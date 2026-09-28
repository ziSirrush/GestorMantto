'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..');
const registryPath = path.join(repoRoot, 'backend', 'src', 'modules', 'panel-control-prueba-carga', 'panel-control-prueba-carga.registry.js');
const { LoadTestRegistry } = require(registryPath);

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

test('Fase 4: detener pasa a FINALIZANDO, publica ABORT y k6 puede confirmar ABORTADA_MANUAL', () => {
  const registry = new LoadTestRegistry({ autoCleanup: false });
  const run = runningSession(registry, 10);

  const finalizing = registry.requestStop(run.id, { actorUserId: 10, reason: 'UI_MANUAL_STOP', source: 'MANUAL' });
  assert.equal(finalizing.state, 'FINALIZANDO');
  assert.equal(finalizing.cancel_source, 'MANUAL');
  assert.equal(finalizing.telemetry.http.active, 0);

  const internal = registry.validateRunnerToken(run.id, run.token, { requireRunning: false });
  assert.equal(internal.state, 'FINALIZANDO');
  registry.acknowledgeStop(run.id, run.token);
  const finished = registry.finishRunner(run.id, run.token, { reason: 'RUNNER_TEARDOWN_PHASE4' });
  assert.equal(finished.state, 'ABORTADA_MANUAL');
  assert.equal(finished.completion_integrity, 'PENDIENTE_RESUMEN');
  assert.ok(finished.telemetry.runner.control_ack_at);
  registry.close();
});

test('Fase 4: FINALIZANDO sigue bloqueando una segunda prueba hasta cierre confirmado', () => {
  const registry = new LoadTestRegistry({ autoCleanup: false });
  const run = runningSession(registry, 20);
  registry.requestStop(run.id, { actorUserId: 20, reason: 'MANUAL', source: 'MANUAL' });

  assert.throws(
    () => registry.createSession({ actorUserId: 21, vus: 10, durationSeconds: 30, scenario: 'SALUD' }),
    error => error?.code === 'LOAD_TEST_ALREADY_RUNNING' && error?.status === 409
  );

  registry.finishRunner(run.id, run.token, { reason: 'RUNNER_TEARDOWN_PHASE4' });
  const next = registry.createSession({ actorUserId: 21, vus: 10, durationSeconds: 30, scenario: 'SALUD' });
  assert.equal(next.session.state, 'LISTA');
  registry.close();
});

test('Fase 4: timeout sin confirmación cierra como incompleto y libera el servidor', async () => {
  await withEnv({ LOAD_TEST_FINALIZATION_TIMEOUT_SECONDS: '5' }, async () => {
    let now = 100000;
    const registry = new LoadTestRegistry({ autoCleanup: false, now: () => now });
    const run = runningSession(registry, 30);
    registry.requestStop(run.id, { actorUserId: 30, reason: 'UI_MANUAL_STOP', source: 'MANUAL' });
    now += 6000;
    registry.cleanupExpired();

    const session = registry.getPublicSession(run.id);
    assert.equal(session.state, 'ABORTADA_SIN_CONFIRMACION');
    assert.equal(session.completion_integrity, 'INCOMPLETO');

    const next = registry.createSession({ actorUserId: 31, vus: 10, durationSeconds: 30, scenario: 'SALUD' });
    assert.equal(next.session.state, 'LISTA');
    registry.close();
  });
});

test('Fase 4: métricas del runner distinguen VUs objetivo/activos de requests activos backend', () => {
  const registry = new LoadTestRegistry({ autoCleanup: false });
  const run = runningSession(registry, 40);
  registry.beginHttp(run.id);
  registry.beginHttp(run.id);
  registry.recordRunnerSample(run.id, run.token, {
    vus_active: 9,
    vus_initialized: 10,
    iterations_completed: 45,
    iterations_interrupted: 0,
    test_run_duration_ms: 4200,
    progress: 0.14
  });

  const session = registry.getPublicSession(run.id);
  assert.equal(session.vus, 10);
  assert.equal(session.telemetry.runner.target_vus, 10);
  assert.equal(session.telemetry.runner.latest.vus_active, 9);
  assert.equal(session.telemetry.runner.max_vus_active, 9);
  assert.equal(session.telemetry.http.active, 2, 'requests HTTP activos no deben convertirse en VUs');

  registry.stopSession(run.id, { actorUserId: 40, reason: 'TEST' });
  registry.close();
});

test('Fase 4: protección 5xx sostenida cambia a FINALIZANDO automático', async () => {
  await withEnv({
    LOAD_TEST_PROTECTION_MIN_REQUESTS: '10',
    LOAD_TEST_PROTECTION_5XX_PERCENT: '10',
    LOAD_TEST_PROTECTION_P95_MS: '600000'
  }, async () => {
    const registry = new LoadTestRegistry({ autoCleanup: false });
    const run = runningSession(registry, 50);
    for (let index = 0; index < 10; index += 1) {
      registry.beginHttp(run.id);
      registry.finishHttp(run.id, {
        method: 'GET', route: '/api/health', statusCode: index === 9 ? 500 : 200, durationMs: 100
      });
    }
    const session = registry.getPublicSession(run.id);
    assert.equal(session.state, 'FINALIZANDO');
    assert.equal(session.cancel_source, 'AUTOMATIC');
    assert.equal(session.cancel_reason, 'PROTECTION_HTTP_5XX');
    registry.stopSession(run.id, { actorUserId: 50, reason: 'TEST' });
    registry.close();
  });
});

test('Fase 4: protección p95 backend sostenida solicita aborto automático', async () => {
  await withEnv({
    LOAD_TEST_PROTECTION_MIN_REQUESTS: '10',
    LOAD_TEST_PROTECTION_5XX_PERCENT: '100',
    LOAD_TEST_PROTECTION_P95_MS: '5000'
  }, async () => {
    const registry = new LoadTestRegistry({ autoCleanup: false });
    const run = runningSession(registry, 60);
    for (let index = 0; index < 10; index += 1) {
      registry.beginHttp(run.id);
      registry.finishHttp(run.id, {
        method: 'GET', route: '/api/health', statusCode: 200, durationMs: 6000
      });
    }
    const session = registry.getPublicSession(run.id);
    assert.equal(session.state, 'FINALIZANDO');
    assert.equal(session.cancel_source, 'AUTOMATIC');
    assert.equal(session.cancel_reason, 'PROTECTION_P95_BACKEND');
    registry.stopSession(run.id, { actorUserId: 60, reason: 'TEST' });
    registry.close();
  });
});

test('Fase 4: el umbral p95 usa la cola reciente sin ordenar latencias por request', async () => {
  await withEnv({
    LOAD_TEST_PROTECTION_MIN_REQUESTS: '100',
    LOAD_TEST_PROTECTION_5XX_PERCENT: '100',
    LOAD_TEST_PROTECTION_P95_MS: '5000'
  }, async () => {
    const registry = new LoadTestRegistry({ autoCleanup: false });
    const run = runningSession(registry, 64);
    for (let index = 0; index < 100; index += 1) {
      registry.beginHttp(run.id);
      registry.finishHttp(run.id, {
        method: 'GET', route: '/api/health', statusCode: 200, durationMs: index < 5 ? 6000 : 100
      });
    }
    assert.equal(registry.getPublicSession(run.id).state, 'EJECUTANDO');
    registry.beginHttp(run.id);
    registry.finishHttp(run.id, { method: 'GET', route: '/api/health', statusCode: 200, durationMs: 6000 });
    assert.equal(registry.getPublicSession(run.id).cancel_reason, 'PROTECTION_P95_BACKEND');
    registry.close();
  });
});

test('Fase 4: RPS y p95 recientes caen al quedar inactiva la ventana sin perder el acumulado', async () => {
  await withEnv({ LOAD_TEST_LIVE_WINDOW_SECONDS: '10' }, async () => {
    let now = 100000;
    const registry = new LoadTestRegistry({ autoCleanup: false, now: () => now });
    const run = runningSession(registry, 61);
    for (let index = 0; index < 20; index += 1) {
      registry.beginHttp(run.id);
      registry.finishHttp(run.id, { method: 'GET', route: '/api/health', statusCode: 200, durationMs: 100 });
    }
    const active = registry.getPublicSession(run.id).telemetry.http;
    assert.equal(active.completed, 20);
    assert.ok(active.rps_backend > 0);
    assert.equal(active.latency_recent.p95_ms, 100);

    now += 11000;
    const idle = registry.getPublicSession(run.id).telemetry.http;
    assert.equal(idle.completed, 20);
    assert.equal(idle.rps_backend, 0);
    assert.equal(idle.latency_recent.p95_ms, null);
    assert.equal(idle.latency.p95_ms, 100, 'el reporte acumulado debe conservar su p95');
    registry.close();
  });
});

test('Fase 4: una caída tardía 5xx activa protección aunque el promedio histórico sea sano', async () => {
  await withEnv({
    LOAD_TEST_LIVE_WINDOW_SECONDS: '10',
    LOAD_TEST_PROTECTION_MIN_REQUESTS: '10',
    LOAD_TEST_PROTECTION_5XX_PERCENT: '50',
    LOAD_TEST_PROTECTION_P95_MS: '600000'
  }, async () => {
    let now = 100000;
    const registry = new LoadTestRegistry({ autoCleanup: false, now: () => now });
    const run = runningSession(registry, 62);
    for (let index = 0; index < 100; index += 1) {
      registry.beginHttp(run.id);
      registry.finishHttp(run.id, { method: 'GET', route: '/api/health', statusCode: 200, durationMs: 100 });
      now += 1000;
    }
    for (let index = 0; index < 10 && registry.getPublicSession(run.id).state === 'EJECUTANDO'; index += 1) {
      registry.beginHttp(run.id);
      registry.finishHttp(run.id, { method: 'GET', route: '/api/health', statusCode: 500, durationMs: 100 });
      now += 100;
    }
    const result = registry.getPublicSession(run.id);
    assert.equal(result.state, 'FINALIZANDO');
    assert.equal(result.cancel_reason, 'PROTECTION_HTTP_5XX');
    assert.ok(Number(result.telemetry.http.status['500'] || 0) < 100,
      'la protección no debe esperar a que falle la mitad de toda la ejecución');
    registry.close();
  });
});

test('Fase 4: el backend señala detención a cada VU y el runner acota la espera HTTP', () => {
  process.env.DB_HOST ||= '127.0.0.1';
  process.env.DB_PORT ||= '3306';
  process.env.DB_USER ||= 'test';
  process.env.DB_PASSWORD ||= 'test';
  process.env.DB_NAME ||= 'test';
  const singleton = require(registryPath);
  const existing = singleton.getActivePublicSession();
  if (existing) {
    singleton.stopSession(existing.id, { reason: 'TEST_CLEANUP' });
    singleton.deleteSession(existing.id);
  }
  const run = runningSession(singleton, 63);
  singleton.requestStop(run.id, { actorUserId: 63, source: 'MANUAL', reason: 'UI_MANUAL_STOP' });
  const { loadTestTelemetryMiddleware } = require(path.join(repoRoot, 'backend', 'src', 'modules', 'panel-control-prueba-carga', 'panel-control-prueba-carga.telemetry.js'));
  const { PROCESS_INSTANCE_ID } = require(path.join(repoRoot, 'backend', 'src', 'modules', 'panel-control-prueba-carga', 'panel-control-prueba-carga.runtime.js'));
  const headers = {};
  const req = { method: 'GET', originalUrl: '/api/health', get(name) {
    return ({
      'x-mantto-load-test': run.id,
      'x-mantto-load-test-token': run.token,
      'x-mantto-load-test-instance': PROCESS_INSTANCE_ID
    })[String(name).toLowerCase()] || '';
  } };
  const res = {
    statusCode: 200,
    setHeader(name, value) { headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return value; }
  };
  let enteredBusiness = false;
  loadTestTelemetryMiddleware(req, res, () => { enteredBusiness = true; });
  assert.equal(res.statusCode, 409);
  assert.equal(headers['X-Mantto-Load-Test-Stop'], '1');
  assert.equal(enteredBusiness, false);
  const runner = fs.readFileSync(path.join(repoRoot, 'scripts', 'load-test', 'mantto-gestor-load-test.k6.js'), 'utf8');
  assert.match(runner, /responseHeader\(response, 'X-Mantto-Load-Test-Stop'\) === '1'/);
  assert.match(runner, /timeout: '10s'/);
  assert.match(runner, /function runnerParams[\s\S]*?timeout: '5s'/);
  singleton.stopSession(run.id, { reason: 'TEST_CLEANUP' });
  singleton.deleteSession(run.id);
});

test('Fase 4: runner conserva polling, VUs activos y aborto real tras incorporar handleSummary en Fase 5', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'scripts', 'load-test', 'mantto-gestor-load-test.k6.js'), 'utf8');
  assert.match(source, /exec\.test\.abort\(/);
  assert.match(source, /exec\.instance\.vusActive/);
  assert.match(source, /exec\.instance\.vusInitialized/);
  assert.match(source, /runner-sample/);
  assert.match(source, /runner-stop-ack/);
  assert.match(source, /runner-abort/);
  assert.match(source, /runner-finish/);
  assert.match(source, /maxRedirects:\s*0/);
  assert.match(source, /redirects:\s*0/);
  assert.match(source, /handleSummary\s*\(/, 'Fase 5 debe coexistir con el control real de Fase 4');
});

test('Fase 4: interfaz etiqueta por separado VUs k6, RPS/p95 backend y ofrece Detener prueba', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'modules', 'panel-control-prueba-carga', 'panel-control-prueba-carga.js'), 'utf8');
  assert.match(source, /VUs objetivo/);
  assert.match(source, /VUs activos k6/);
  assert.match(source, /Requests activos backend/);
  assert.match(source, /RPS backend/);
  assert.match(source, /p95 backend/);
  assert.match(source, /DETENER PRUEBA/);
  assert.match(source, /FINALIZANDO/);
  assert.match(source, /LIVE_REFRESH_MS=2000/);
});

test('Fase 4: rutas administrativas conservan requireAuth y canal runner usa token efímero propio', () => {
  const routeSource = fs.readFileSync(path.join(repoRoot, 'backend', 'src', 'modules', 'panel-control-prueba-carga', 'panel-control-prueba-carga.routes.js'), 'utf8');
  const parentSource = fs.readFileSync(path.join(repoRoot, 'backend', 'src', 'routes', 'panel-control.routes.js'), 'utf8');
  assert.match(parentSource, /router\.use\('\/prueba-carga',\s*loadTestRoutes\)/);
  for (const route of ['capabilities', "'/session'", 'runner-claim', "'/session/:id/start'", "'/session/:id/stop'"]) {
    assert.match(routeSource, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "[^\\n]*requireAuth|requireAuth[^\\n]*" + route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(routeSource, /runner-control',\s*controller\.getRunnerControl/);
  assert.match(routeSource, /runner-sample',\s*controller\.postRunnerSample/);
  const controllerSource = fs.readFileSync(path.join(repoRoot, 'backend', 'src', 'modules', 'panel-control-prueba-carga', 'panel-control-prueba-carga.controller.js'), 'utf8');
  assert.match(controllerSource, /X-Mantto-Load-Test-Token/);
});

test('Fase 4: 200 continúa como configuración inicial y no como hard limit', () => {
  const constantsSource = fs.readFileSync(path.join(repoRoot, 'backend', 'src', 'modules', 'panel-control-prueba-carga', 'panel-control-prueba-carga.constants.js'), 'utf8');
  assert.match(constantsSource, /LOAD_TEST_MAX_VUS/);
  assert.match(constantsSource, /hard_max_vus:\s*null/);
  assert.doesNotMatch(constantsSource, /Math\.min\([^\n]*200/);
});

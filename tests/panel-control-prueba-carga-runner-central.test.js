'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');

process.env.DB_HOST ||= '127.0.0.1';
process.env.DB_PORT ||= '3306';
process.env.DB_USER ||= 'test';
process.env.DB_PASSWORD ||= 'test';
process.env.DB_NAME ||= 'test';
process.env.DB_SSL ||= 'false';

const root = path.join(__dirname, '..');
const moduleRoot = path.join(root, 'backend/src/modules/panel-control-prueba-carga');
const registry = require(path.join(moduleRoot, 'panel-control-prueba-carga.registry.js'));
const { LoadTestRegistry } = registry;
const runnerService = require(path.join(moduleRoot, 'panel-control-prueba-carga.runner-service.js'));
const { isClearlyMobile, desktopOnly } = require(path.join(moduleRoot, 'panel-control-prueba-carga.desktop.js'));
const service = require(path.join(moduleRoot, 'panel-control-prueba-carga.service.js'));

const ORIGIN = 'https://mantto-gestor-api-a4hwfpgvbeb4gmgj.mexicocentral-01.azurewebsites.net';

function withEnv(values, fn) {
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) value === undefined ? delete process.env[key] : process.env[key] = String(value);
  try { return fn(); }
  finally { for (const [key, value] of Object.entries(previous)) value === undefined ? delete process.env[key] : process.env[key] = value; }
}

test('runner: lease es único, no guarda token plano y mantiene una sola sesión activa', () => {
  const r = new LoadTestRegistry({ autoCleanup: false });
  const id = r.createSession({ actorUserId: 1, vus: 10, durationSeconds: 30, scenario: 'SALUD' }).session.id;
  assert.equal(r.leaseNext('runner-01'), null);
  r.dispatchSession(id);
  const first = r.leaseNext('runner-01');
  assert.equal(first.session.id, id);
  assert.equal(r.leaseNext('runner-02'), null);
  assert.ok(Buffer.isBuffer(r.getSessionInternal(id).runnerTokenHash));
  assert.equal(Object.values(r.getSessionInternal(id)).includes(first.runner_token), false);
  assert.throws(() => r.createSession({ actorUserId: 2, vus: 10, durationSeconds: 30, scenario: 'SALUD' }), { code: 'LOAD_TEST_ALREADY_RUNNING' });
  r.close();
});

test('runner: timeout antes de start cierra INCOMPLETO y libera el slot', () => withEnv({ LOAD_TEST_RUNNER_DISPATCH_TIMEOUT_SECONDS: '5' }, () => {
  let now = 100000;
  const r = new LoadTestRegistry({ autoCleanup: false, now: () => now });
  const id = r.createSession({ actorUserId: 1, vus: 10, durationSeconds: 30, scenario: 'SALUD' }).session.id;
  r.dispatchSession(id);
  r.leaseNext('runner-01');
  now += 6000;
  r.cleanupExpired();
  const ended = r.getPublicSession(id);
  assert.equal(ended.state, 'ABORTADA_SIN_CONFIRMACION');
  assert.equal(ended.completion_integrity, 'INCOMPLETO');
  assert.equal(ended.report_incomplete_reason, 'RUNNER_NO_INICIO');
  assert.equal(r.createSession({ actorUserId: 2, vus: 10, durationSeconds: 30, scenario: 'SALUD' }).session.state, 'LISTA');
  r.close();
}));

test('runner: heartbeat vencido o identidad no lista bloquean disponibilidad', () => withEnv({ LOAD_TEST_RUNNER_HEARTBEAT_TTL_SECONDS: '5' }, () => {
  const oldNow = Date.now;
  let now = oldNow();
  Date.now = () => now;
  try {
    runnerService.recordHeartbeat({ runner_id: 'runner-01', k6_ready: true, test_identity_ready: false });
    assert.equal(runnerService.snapshot().available, false);
    runnerService.recordHeartbeat({ runner_id: 'runner-01', k6_ready: true, test_identity_ready: true, k6_version: 'k6 v1' });
    assert.equal(runnerService.snapshot().available, true);
    now += 6000;
    assert.equal(runnerService.snapshot().available, false);
  } finally { Date.now = oldNow; }
}));

test('runner: identidad no lista o heartbeat vencido impiden lease del servicio', () => withEnv({ LOAD_TEST_SINGLE_INSTANCE: 'true', LOAD_TEST_ALLOWED_ORIGIN: ORIGIN }, () => {
  runnerService.recordHeartbeat({ runner_id: 'runner-01', k6_ready: true, test_identity_ready: false });
  assert.throws(() => service.runnerLease('runner-01'), { code: 'LOAD_TEST_RUNNER_UNAVAILABLE' });
  runnerService.recordHeartbeat({ runner_id: 'runner-01', k6_ready: true, test_identity_ready: true });
  assert.equal(service.runnerLease('runner-01'), null);
  const oldNow = Date.now;
  Date.now = () => oldNow() + 200000;
  try { assert.throws(() => service.runnerLease('runner-01'), { code: 'LOAD_TEST_RUNNER_UNAVAILABLE' }); }
  finally { Date.now = oldNow; }
}));

test('capabilities refleja heartbeat listo y vencido sin exponer secretos', async () => {
  const permissionPath = require.resolve('../backend/src/services/permissions/effective-permission.service');
  const servicePath = require.resolve('../backend/src/modules/panel-control-prueba-carga/panel-control-prueba-carga.service.js');
  const previousPermission = require.cache[permissionPath];
  const previousService = require.cache[servicePath];
  require.cache[permissionPath] = { id: permissionPath, filename: permissionPath, loaded: true,
    exports: { hasEffectivePermission: async () => true } };
  delete require.cache[servicePath];
  const isolated = require(servicePath);
  const oldNow = Date.now;
  const oldSingle = process.env.LOAD_TEST_SINGLE_INSTANCE;
  const oldOrigin = process.env.LOAD_TEST_ALLOWED_ORIGIN;
  const oldTtl = process.env.LOAD_TEST_RUNNER_HEARTBEAT_TTL_SECONDS;
  process.env.LOAD_TEST_SINGLE_INSTANCE = 'true';
  process.env.LOAD_TEST_ALLOWED_ORIGIN = ORIGIN;
  process.env.LOAD_TEST_RUNNER_HEARTBEAT_TTL_SECONDS = '5';
  let now = oldNow();
  Date.now = () => now;
  try {
    runnerService.recordHeartbeat({ runner_id: 'runner-01', k6_ready: true, test_identity_ready: true });
    const ready = await isolated.getCapabilities({ id_SB: 501 });
    assert.equal(ready.execution_available, true);
    assert.equal(ready.runner_service.available, true);
    assert.equal(JSON.stringify(ready).includes('MANTTO_RUNNER_SERVICE_TOKEN'), false);
    now += 6000;
    const stale = await isolated.getCapabilities({ id_SB: 501 });
    assert.equal(stale.execution_available, false);
  } finally {
    Date.now = oldNow;
    for (const [key, value] of [['LOAD_TEST_SINGLE_INSTANCE', oldSingle], ['LOAD_TEST_ALLOWED_ORIGIN', oldOrigin], ['LOAD_TEST_RUNNER_HEARTBEAT_TTL_SECONDS', oldTtl]]) value === undefined ? delete process.env[key] : process.env[key] = value;
    delete require.cache[servicePath];
    if (previousService) require.cache[servicePath] = previousService;
    if (previousPermission) require.cache[permissionPath] = previousPermission; else delete require.cache[permissionPath];
  }
});

test('runner: servicio exige HTTPS y secreto de 256 bits con hash correcto', () => {
  const token = 'a'.repeat(64);
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  withEnv({ LOAD_TEST_RUNNER_SERVICE_TOKEN_SHA256: hash }, () => {
    const req = (protocol, value) => ({ protocol, get: () => value });
    assert.throws(() => runnerService.authenticate(req('http', token)), { code: 'LOAD_TEST_RUNNER_HTTPS_REQUIRED' });
    assert.throws(() => runnerService.authenticate(req('https', 'b'.repeat(64))), { code: 'LOAD_TEST_RUNNER_SERVICE_UNAUTHORIZED' });
    assert.doesNotThrow(() => runnerService.authenticate(req('https', token)));
  });
});

test('runner-start requiere token, contrato correcto y lease despachado', () => withEnv({ LOAD_TEST_SINGLE_INSTANCE: 'true', LOAD_TEST_ALLOWED_ORIGIN: ORIGIN }, () => {
  const id = registry.createSession({ actorUserId: 7, vus: 10, durationSeconds: 30, scenario: 'SALUD' }).session.id;
  registry.dispatchSession(id);
  const claim = registry.leaseNext('runner-01');
  const runtime = require(path.join(moduleRoot, 'panel-control-prueba-carga.runtime.js')).getLoadTestRunnerRuntime();
  const payload = { process_instance_id: runtime.process_instance_id, target_origin: ORIGIN, scenario_catalog_version: '20260928-v001', scenario: 'SALUD', vus: 10, duration_seconds: 30 };
  try {
    assert.throws(() => service.runnerStart(id, 'wrong', payload), { code: 'LOAD_TEST_TOKEN_INVALID' });
    assert.throws(() => service.runnerStart(id, claim.runner_token, { ...payload, target_origin: 'https://example.com' }), { code: 'LOAD_TEST_RUNNER_CONTRACT_MISMATCH' });
    const started = service.runnerStart(id, claim.runner_token, payload);
    assert.equal(started.state, 'EJECUTANDO');
    assert.equal(started.scenario.code, 'SALUD');
  } finally {
    registry.stopSession(id, { reason: 'TEST' });
    registry.deleteSession(id);
  }
}));

test('runner externo pasa secretos al proceso hijo por env y nunca por argumentos', async () => {
  const external = require(path.join(root, 'scripts/load-test/mantto-load-test-runner.service.js'));
  const job = { session_id: 'LOAD-TEST', runner_token: 'runner-secret', vus: 10, duration_seconds: 30,
    scenario: { code: 'SALUD' }, limits: { min_vus: 10, max_vus_configured: 200, step_vus: 10 }, process_instance_id: 'PCLT-TEST' };
  let observed;
  const spawnFake = (binary, args, options) => {
    observed = { binary, args, env: { ...options.env }, shell: options.shell, stdio: options.stdio };
    const child = new EventEmitter();
    queueMicrotask(() => child.emit('close', 0));
    return child;
  };
  await external.runK6(job, 'test-jwt', spawnFake);
  assert.deepEqual(observed.args[0], 'run');
  assert.equal(observed.shell, false);
  assert.equal(observed.stdio, 'ignore');
  assert.equal(observed.env.MANTTO_LOAD_TEST_RUNNER_TOKEN, 'runner-secret');
  assert.equal(observed.env.MANTTO_TEST_JWT, 'test-jwt');
  assert.equal(observed.args.join(' ').includes('runner-secret'), false);
  assert.equal(observed.args.join(' ').includes('test-jwt'), false);
  assert.equal(observed.env.MANTTO_OPERATOR_JWT, undefined);
});

test('desktop only: PCs pasan y móviles/tablets reciben 403; canal runner no usa guard', () => {
  const desktop = ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/125', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Safari/605'];
  const mobile = ['Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile', 'Mozilla/5.0 (Linux; Android 14; SM-X700) Tablet', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)', 'Mozilla/5.0 (iPad; CPU OS 17_0)'];
  for (const ua of desktop) assert.equal(isClearlyMobile({ 'user-agent': ua }), false);
  for (const ua of mobile) assert.equal(isClearlyMobile({ 'user-agent': ua }), true);
  assert.equal(isClearlyMobile({ 'sec-ch-ua-mobile': '?1' }), true);
  assert.equal(isClearlyMobile({ 'sec-ch-ua-platform': '"iPadOS"' }), true);
  const res = { status(code) { this.code = code; return this; }, json(data) { this.data = data; } };
  desktopOnly({ headers: { 'user-agent': mobile[0] } }, res, () => assert.fail('mobile reached route'));
  assert.equal(res.code, 403);
  assert.equal(res.data.code, 'LOAD_TEST_DESKTOP_ONLY');
  const routes = fs.readFileSync(path.join(moduleRoot, 'panel-control-prueba-carga.routes.js'), 'utf8');
  assert.match(routes, /router\.post\('\/runner\/heartbeat', controller\.runnerHeartbeat\)/);
  assert.match(routes, /router\.post\('\/runner\/lease', controller\.runnerLease\)/);
  assert.doesNotMatch(routes, /runner\/heartbeat', desktopOnly/);
});

test('frontend detecta iPadOS Mac y puntero coarse; no consulta en móvil', async () => {
  let panel = fs.readFileSync(path.join(root, 'modules/panel-control/panel-control.js'), 'utf8');
  panel = panel.replace(/window\.ManttoPanelControl=\{init\};\s*consumeSaveMessage\(\);\s*\}\)\(\);\s*$/, 'window.__test={loadLoadTestCapabilities};window.ManttoPanelControl={init};consumeSaveMessage();})();');
  const make = (nav, media = {}) => {
    let calls = 0;
    const window = { navigator: nav, matchMedia: q => ({ matches: Boolean(media[q]) }), setTimeout, clearTimeout,
      ManttoAuth: { api: () => { calls++; return Promise.resolve({ data: {} }); } } };
    const context = { window, document: {}, sessionStorage: { getItem: () => null }, setTimeout, clearTimeout, Date, AbortController, console };
    vm.runInNewContext(panel, context);
    return { window, calls: () => calls };
  };
  const ipad = make({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', maxTouchPoints: 5 });
  assert.equal(ipad.window.ManttoLoadTestDesktopEligible(), false);
  await ipad.window.__test.loadLoadTestCapabilities();
  assert.equal(ipad.calls(), 0);
  const coarse = make({ userAgent: 'Custom' }, { '(pointer: coarse)': true, '(pointer: fine)': false, '(hover: none)': true });
  assert.equal(coarse.window.ManttoLoadTestDesktopEligible(), false);
  assert.equal(make({ userAgent: 'Windows Chrome', maxTouchPoints: 0 }).window.ManttoLoadTestDesktopEligible(), true);
});

test('submódulo abierto directamente en móvil no inicia polling ni llamadas', () => {
  const source = fs.readFileSync(path.join(root, 'modules/panel-control-prueba-carga/panel-control-prueba-carga.js'), 'utf8');
  let timers = 0;
  let calls = 0;
  const window = { navigator: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)' },
    setTimeout: () => { timers++; return 1; }, clearTimeout() {},
    ManttoAuth: { api: () => { calls++; return Promise.resolve({}); } } };
  const context = { window, document: {}, console, Date, Intl };
  vm.runInNewContext(source, context);
  const box = { innerHTML: '' };
  assert.equal(window.ManttoPanelControlPruebaCarga.render(box, {}), false);
  assert.match(box.innerHTML, /únicamente desde una PC/);
  assert.equal(timers, 0);
  assert.equal(calls, 0);
});

test('modo Visor bloquea dispatch antes de invocar el servicio', async () => {
  const controller = require(path.join(moduleRoot, 'panel-control-prueba-carga.controller.js'));
  const req = { viewerContext: { active: true }, user: { id_SB: 1 }, params: { id: 'LOAD-TEST' } };
  const res = { status(code) { this.code = code; return this; }, json(payload) { this.payload = payload; return payload; } };
  await controller.dispatchSession(req, res, error => { throw error; });
  assert.equal(res.code, 403);
  assert.equal(res.payload.code, 'VIEWER_READ_ONLY');
});

test('k6 handleSummary(data) usa token del entorno y no lo expone', () => {
  const source = fs.readFileSync(path.join(root, 'scripts/load-test/mantto-gestor-load-test.k6.js'), 'utf8')
    .replace(/^import .*;\r?\n/gm, '')
    .replace(/export const options/, 'const options')
    .replace(/export default function\(data\)/, 'function defaultRun(data)')
    .replace(/export function /g, 'function ');
  function invoke(token) {
    const calls = [];
    const errors = [];
    const context = { __ENV: { MANTTO_LOAD_TEST_SESSION: 'LOAD-TEST', MANTTO_LOAD_TEST_RUNNER_TOKEN: token,
      MANTTO_TEST_JWT: 'test-jwt', MANTTO_VUS: '10', MANTTO_DURATION_SECONDS: '30', MANTTO_MIN_VUS: '10', MANTTO_MAX_VUS: '200', MANTTO_VUS_STEP: '10', MANTTO_SCENARIO: 'SALUD' },
      TRUSTED_ORIGIN: ORIGIN, CATALOG_VERSION: '20260928-v001', SCENARIOS: { SALUD: { requests: [{ method: 'GET', path: '/api/health', think_seconds: 1 }] } },
      Counter: class { add() {} }, Trend: class { add() {} }, http: { post: (...args) => { calls.push(args); return { status: 200 }; } },
      check() {}, sleep() {}, exec: {}, console: { error: value => errors.push(value) }, Date, Number, Math, JSON, String, Object, encodeURIComponent };
    vm.runInNewContext(`${source}\nglobalThis.__summary=handleSummary;`, context);
    const result = context.__summary({ metrics: {} });
    return { calls, errors, result };
  }
  const withToken = invoke('secret-ephemeral');
  assert.equal(withToken.calls.length, 1);
  assert.match(withToken.calls[0][0], /runner-summary$/);
  assert.equal(withToken.calls[0][2].headers['X-Mantto-Load-Test-Token'], 'secret-ephemeral');
  assert.equal(JSON.stringify(withToken.calls[0][1]).includes('secret-ephemeral'), false);
  assert.equal(JSON.stringify(withToken.result), '{}');
  assert.equal(withToken.errors.join(' ').includes('secret-ephemeral'), false);
  const withoutToken = invoke('');
  assert.equal(withoutToken.calls.length, 0);
  assert.equal(withoutToken.errors.length, 1);
  assert.equal(withoutToken.errors.join(' ').includes('secret-ephemeral'), false);
});

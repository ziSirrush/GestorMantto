'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const loadTestRoot = path.join(repoRoot, 'backend', 'src', 'modules', 'panel-control-prueba-carga');
const registryModule = require(path.join(loadTestRoot, 'panel-control-prueba-carga.registry.js'));
const { LoadTestRegistry } = registryModule;
const runtime = require(path.join(loadTestRoot, 'panel-control-prueba-carga.runtime.js'));
const scenarios = require(path.join(loadTestRoot, 'panel-control-prueba-carga.scenarios.js'));

const PROD_ORIGIN = 'https://mantto-gestor-api-a4hwfpgvbeb4gmgj.mexicocentral-01.azurewebsites.net';

function withEnv(values, callback) {
  const previous = {};
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = String(value);
  }
  return Promise.resolve()
    .then(callback)
    .finally(() => {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });
}

function cleanupSingletonRegistry() {
  const active = registryModule.getActivePublicSession();
  if (!active) return;
  try { registryModule.stopSession(active.id, { actorUserId: active.actor_user_id, reason: 'TEST_CLEANUP' }); } catch (_error) {}
  try { registryModule.deleteSession(active.id); } catch (_error) {}
}

function withPermissionStub(permissionFn, callback) {
  const permissionPath = require.resolve('../backend/src/services/permissions/effective-permission.service');
  const servicePath = require.resolve('../backend/src/modules/panel-control-prueba-carga/panel-control-prueba-carga.service');
  const previousPermission = require.cache[permissionPath];
  const previousService = require.cache[servicePath];

  require.cache[permissionPath] = {
    id: permissionPath,
    filename: permissionPath,
    loaded: true,
    exports: { hasEffectivePermission: permissionFn }
  };
  delete require.cache[servicePath];
  const service = require(servicePath);

  return Promise.resolve()
    .then(() => callback(service))
    .finally(() => {
      cleanupSingletonRegistry();
      delete require.cache[servicePath];
      if (previousService) require.cache[servicePath] = previousService;
      if (previousPermission) require.cache[permissionPath] = previousPermission;
      else delete require.cache[permissionPath];
    });
}

test('Fase 3: crear sesión ya no entrega token al navegador y start exige runner-claim', () => {
  const registry = new LoadTestRegistry({ autoCleanup: false });
  const created = registry.createSession({ actorUserId: 10, vus: 10, durationSeconds: 30, scenario: 'SALUD' });
  assert.deepEqual(Object.keys(created), ['session']);
  assert.equal(created.session.runner_claimed, false);
  assert.equal('runner_token' in created, false);
  assert.throws(
    () => registry.startSession(created.session.id),
    error => error?.code === 'LOAD_TEST_RUNNER_CLAIM_REQUIRED' && error?.status === 409
  );
  registry.close();
});

test('Fase 3: runner-claim es de un solo uso, devuelve token una vez y conserva solo hash', () => {
  const registry = new LoadTestRegistry({ autoCleanup: false });
  const created = registry.createSession({ actorUserId: 20, vus: 20, durationSeconds: 60, scenario: 'HOME' });
  const claim = registry.claimRunner(created.session.id, { actorUserId: 20 });
  assert.match(claim.runner_token, /^[A-Za-z0-9_-]+$/);
  assert.equal(claim.session.runner_claimed, true);

  const internal = registry.getSessionInternal(created.session.id);
  assert.ok(Buffer.isBuffer(internal.runnerTokenHash));
  assert.equal(internal.runnerTokenHash.length, 32);
  assert.equal(Object.values(internal).includes(claim.runner_token), false, 'el token plano no queda almacenado en la sesión');
  assert.equal(internal.runnerClaimCount, 1);

  assert.throws(
    () => registry.claimRunner(created.session.id, { actorUserId: 20 }),
    error => error?.code === 'LOAD_TEST_RUNNER_ALREADY_CLAIMED' && error?.status === 409
  );

  registry.startSession(created.session.id);
  assert.doesNotThrow(() => registry.validateRunnerToken(created.session.id, claim.runner_token, { requireRunning: true }));
  registry.stopSession(created.session.id, { actorUserId: 20, reason: 'TEST' });
  registry.deleteSession(created.session.id);
  registry.close();
});

test('Fase 3: backend falla cerrado si no se confirma una sola instancia o falta target autorizado', async () => {
  await withPermissionStub(async () => true, async service => {
    await withEnv({ LOAD_TEST_SINGLE_INSTANCE: 'false', LOAD_TEST_ALLOWED_ORIGIN: PROD_ORIGIN }, async () => {
      const caps = await service.getCapabilities({ id_SB: 30 });
      assert.equal(caps.execution_available, false);
      assert.equal(caps.runner_runtime.single_instance_confirmed, false);
      await assert.rejects(
        () => service.createSession({ id_SB: 30 }, { scenario: 'SALUD', vus: 10, duration_seconds: 30 }),
        error => error?.code === 'LOAD_TEST_SINGLE_INSTANCE_REQUIRED' && error?.status === 503
      );
    });

    await withEnv({ LOAD_TEST_SINGLE_INSTANCE: 'true', LOAD_TEST_ALLOWED_ORIGIN: '' }, async () => {
      const caps = await service.getCapabilities({ id_SB: 30 });
      assert.equal(caps.execution_available, false);
      assert.equal(caps.runner_runtime.target_configured, false);
      await assert.rejects(
        () => service.createSession({ id_SB: 30 }, { scenario: 'SALUD', vus: 10, duration_seconds: 30 }),
        error => error?.code === 'LOAD_TEST_ALLOWED_ORIGIN_REQUIRED' && error?.status === 503
      );
    });
  });
});

test('Fase 3: claim valida actor propietario y devuelve únicamente catálogo/target confiables', async () => {
  await withEnv({
    LOAD_TEST_SINGLE_INSTANCE: 'true',
    LOAD_TEST_ALLOWED_ORIGIN: PROD_ORIGIN,
    LOAD_TEST_MAX_VUS: '1000'
  }, async () => withPermissionStub(async () => true, async service => {
    const owner = { id_SB: 41 };
    const other = { id_SB: 42 };
    const created = await service.createSession(owner, { scenario: 'MIXTO_LECTURA', vus: 1000, duration_seconds: 30 });
    assert.equal(created.runner_token, undefined);

    await assert.rejects(
      () => service.claimRunner(other, created.session.id),
      error => error?.code === 'LOAD_TEST_SESSION_OWNER_REQUIRED' && error?.status === 403
    );

    const claim = await service.claimRunner(owner, created.session.id);
    assert.equal(claim.target_origin, PROD_ORIGIN);
    assert.equal(claim.redirects_allowed, false);
    assert.equal(claim.scenario_catalog_version, scenarios.CATALOG_VERSION);
    assert.equal(claim.scenario.code, 'MIXTO_LECTURA');
    assert.equal(claim.vus, 1000, '200 no es un tope duro');
    assert.ok(claim.scenario.requests.every(item => item.method === 'GET'));
    assert.ok(claim.scenario.requests.every(item => item.path.startsWith('/api/')));
    assert.match(claim.runner_token, /^[A-Za-z0-9_-]+$/);

    await assert.rejects(
      () => service.claimRunner(owner, created.session.id),
      error => error?.code === 'LOAD_TEST_RUNNER_ALREADY_CLAIMED'
    );

    await service.startSession(owner, created.session.id);
    const finalizing = await service.stopSession(owner, created.session.id, 'TEST');
    assert.equal(finalizing.state, 'FINALIZANDO');
    await service.runnerFinish(created.session.id, claim.runner_token, 'TEST_TEARDOWN');
    await service.deleteSession(owner, created.session.id);
  }));
});

test('Fase 3: target de sesión sigue cerrado y origen exige solo http(s) sin ruta/query/credenciales', async () => {
  assert.equal(runtime.normalizeOrigin(PROD_ORIGIN + '/'), PROD_ORIGIN);
  assert.equal(runtime.normalizeOrigin(PROD_ORIGIN + '/api'), null);
  assert.equal(runtime.normalizeOrigin(PROD_ORIGIN + '?x=1'), null);
  assert.equal(runtime.normalizeOrigin('ftp://example.com'), null);
  assert.equal(runtime.normalizeOrigin('https://user:pass@example.com'), null);

  await withEnv({ LOAD_TEST_SINGLE_INSTANCE: 'true', LOAD_TEST_ALLOWED_ORIGIN: PROD_ORIGIN }, async () => {
    await withPermissionStub(async () => true, async service => {
      await assert.rejects(
        () => service.createSession({ id_SB: 50 }, {
          scenario: 'SALUD', vus: 10, duration_seconds: 30, target: 'https://example.com'
        }),
        error => error?.code === 'LOAD_TEST_TARGET_NOT_ALLOWED'
      );
    });
  });
});

test('Fase 3: catálogo backend contiene únicamente rutas fijas GET/HEAD y coincide con endpoints confirmados', () => {
  const allowed = new Set([
    '/api/health',
    '/api/home/bootstrap',
    '/api/home/snapshot',
    '/api/operacion/dashboard-call-center/inicial'
  ]);
  for (const item of Object.values(scenarios.SCENARIO_CATALOG)) {
    assert.ok(item.requests.length > 0);
    for (const request of item.requests) {
      assert.ok(['GET', 'HEAD'].includes(request.method));
      assert.ok(allowed.has(request.path), `${request.path} debe estar en el catálogo confirmado`);
      assert.equal(/^https?:\/\//i.test(request.path), false);
    }
  }
});

test('Fase 3: tráfico marcado exige el process-instance reclamado antes de entrar a negocio', () => {
  process.env.DB_HOST ||= '127.0.0.1';
  process.env.DB_PORT ||= '3306';
  process.env.DB_USER ||= 'test';
  process.env.DB_PASSWORD ||= 'test';
  process.env.DB_NAME ||= 'test';
  process.env.DB_SSL = 'false';

  cleanupSingletonRegistry();
  const created = registryModule.createSession({ actorUserId: 60, vus: 10, durationSeconds: 30, scenario: 'SALUD' });
  const claim = registryModule.claimRunner(created.session.id, { actorUserId: 60 });
  registryModule.startSession(created.session.id);

  const { loadTestTelemetryMiddleware } = require('../backend/src/modules/panel-control-prueba-carga/panel-control-prueba-carga.telemetry');
  let reachedBusiness = 0;
  const req = {
    method: 'GET',
    originalUrl: '/api/health',
    get(name) {
      const key = String(name).toLowerCase();
      if (key === 'x-mantto-load-test') return created.session.id;
      if (key === 'x-mantto-load-test-token') return claim.runner_token;
      if (key === 'x-mantto-load-test-instance') return 'OTRO-PROCESO';
      return '';
    }
  };
  const headers = {};
  const res = {
    statusCode: 200,
    body: null,
    setHeader(name, value) { headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return value; }
  };

  loadTestTelemetryMiddleware(req, res, () => { reachedBusiness += 1; });
  assert.equal(res.statusCode, 421);
  assert.equal(res.body?.code, 'LOAD_TEST_INSTANCE_MISMATCH');
  assert.equal(reachedBusiness, 0);
  assert.equal(headers['X-Mantto-Load-Test-Instance'], runtime.PROCESS_INSTANCE_ID);

  registryModule.stopSession(created.session.id, { actorUserId: 60, reason: 'TEST' });
  registryModule.deleteSession(created.session.id);
});

test('Fase 3: runner k6 está cerrado a origen fijo, sin redirects y sin secretos impresos', () => {
  const runner = fs.readFileSync(path.join(repoRoot, 'scripts', 'load-test', 'mantto-gestor-load-test.k6.js'), 'utf8');
  const config = fs.readFileSync(path.join(repoRoot, 'scripts', 'load-test', 'mantto-gestor-load-test.config.js'), 'utf8');
  const coreConfig = fs.readFileSync(path.join(repoRoot, 'core', 'config.js'), 'utf8');

  assert.match(config, new RegExp(PROD_ORIGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(coreConfig, new RegExp(PROD_ORIGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(runner, /TARGET_URL fue rechazado/);
  assert.match(runner, /maxRedirects:\s*0/);
  assert.ok((runner.match(/redirects:\s*0/g) || []).length >= 2);
  assert.doesNotMatch(runner, /MANTTO_OPERATOR_JWT/);
  assert.match(runner, /MANTTO_TEST_JWT/);
  assert.match(runner, /MANTTO_LOAD_TEST_RUNNER_TOKEN/);
  assert.match(runner, /runner-start/);
  assert.match(runner, /X-Mantto-Load-Test-Instance/);
  assert.doesNotMatch(runner, /console\.log\([^\n]*(JWT|runnerToken|runner_token|TEST_JWT|OPERATOR_JWT)/i);
  assert.match(runner, /handleSummary\s*\(/, 'Fase 5 agrega el resumen final sin debilitar los controles de Fase 3');
});

test('FIX Fase 5: launcher técnico solo recibe SessionId y usa el servicio externo', () => {
  const launcher = fs.readFileSync(path.join(repoRoot, 'scripts', 'load-test', 'iniciar-mantto-load-test.ps1'), 'utf8');
  assert.match(launcher, /mantto-load-test-runner\.service\.js/);
  assert.match(launcher, /--session-id \$SessionId/);
  assert.doesNotMatch(launcher, /Read-Host|MANTTO_OPERATOR_JWT/);
  const cliParamBlock = launcher.split('$ErrorActionPreference')[0];
  assert.doesNotMatch(cliParamBlock, /OperatorJwt|TestJwt|BearerToken/i, 'los secretos no son argumentos de línea de comandos');
  assert.doesNotMatch(launcher, /Set-Content|Out-File|Add-Content/, 'los secretos no se escriben a archivos');
});

test('Fase 3/4: pantalla no recibe ni conserva runner_token y Fase 4 añade detención real', () => {
  const frontend = fs.readFileSync(path.join(repoRoot, 'modules', 'panel-control-prueba-carga', 'panel-control-prueba-carga.js'), 'utf8');
  assert.doesNotMatch(frontend, /state\.runnerToken/);
  assert.doesNotMatch(frontend, /response\.data\?\.runner_token/);
  assert.doesNotMatch(frontend, /runner_token\s*:/);
  assert.match(frontend, /claim de un solo uso/i);
  assert.match(frontend, /Fase 5/);
  assert.match(frontend, /id="pclt-stop"/, 'Fase 4 añade el botón conectado al canal real de cancelación');
});

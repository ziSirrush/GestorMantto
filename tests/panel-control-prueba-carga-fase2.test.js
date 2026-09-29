'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { LoadTestRegistry } = require('../backend/src/modules/panel-control-prueba-carga/panel-control-prueba-carga.registry');
const {
  runWithLoadTestContext,
  getCurrentLoadTestSessionId
} = require('../backend/src/modules/panel-control-prueba-carga/panel-control-prueba-carga.context');
const { getLoadTestLimits } = require('../backend/src/modules/panel-control-prueba-carga/panel-control-prueba-carga.constants');

test('Fase 2 crea una sola sesión efímera y nunca expone el hash/token almacenado', () => {
  let clock = 1_000_000;
  const registry = new LoadTestRegistry({ now: () => clock, autoCleanup: false });
  const first = registry.createSession({ actorUserId: 7, vus: 10, durationSeconds: 60, scenario: 'SALUD' });

  assert.equal(first.runner_token, undefined);
  assert.equal(first.session.state, 'LISTA');
  assert.equal('runnerTokenHash' in first.session, false);
  assert.equal('runner_token' in first.session, false);
  assert.throws(
    () => registry.createSession({ actorUserId: 8, vus: 20, durationSeconds: 60, scenario: 'HOME' }),
    error => error && error.code === 'LOAD_TEST_ALREADY_RUNNING' && error.status === 409
  );
  registry.close();
});

test('Fase 2 asocia HTTP, SQL, pool y sistema únicamente a una sesión EJECUTANDO', () => {
  const registry = new LoadTestRegistry({ autoCleanup: false });
  const prepared = registry.createSession({ actorUserId: 9, vus: 20, durationSeconds: 60, scenario: 'HOME' });
  const id = prepared.session.id;
  const claim = registry.claimRunner(id, { actorUserId: 9 });

  assert.throws(
    () => registry.validateRunnerToken(id, claim.runner_token, { requireRunning: true }),
    error => error && error.code === 'LOAD_TEST_SESSION_NOT_RUNNING'
  );

  registry.startSession(id);
  assert.doesNotThrow(() => registry.validateRunnerToken(id, claim.runner_token, { requireRunning: true }));
  assert.throws(
    () => registry.validateRunnerToken(id, 'token-invalido', { requireRunning: true }),
    error => error && error.code === 'LOAD_TEST_TOKEN_INVALID'
  );

  registry.beginHttp(id);
  registry.finishHttp(id, { method: 'GET', route: '/api/health', statusCode: 200, durationMs: 42 });
  registry.beginSql(id);
  registry.finishSql(id, {
    duration_ms: 900,
    operation: 'SELECT',
    fingerprint: 'abc123',
    sql_shape: 'SELECT * FROM tabla WHERE id = 12345'
  });
  registry.beginPoolAcquire(id);
  registry.finishPoolAcquire(id, 12.5, null);
  registry.recordSystemSample(id, {
    at: new Date().toISOString(),
    node: { cpu_percent: 20, rss_bytes: 1000, heap_used_bytes: 500, event_loop_delay_p95_ms: 2 },
    host: { cpu_percent: 40, ram_used_bytes: 2000, ram_used_percent: 50 },
    mysql: { Threads_connected: 8, Threads_running: 2 }
  });

  const snapshot = registry.getPublicSession(id);
  assert.equal(snapshot.telemetry.http.completed, 1);
  assert.equal(snapshot.telemetry.http.status['200'], 1);
  assert.equal(snapshot.telemetry.http.latency.p95_ms, 42);
  assert.equal(snapshot.telemetry.sql.completed, 1);
  assert.equal(snapshot.telemetry.sql.slow_queries, 1);
  assert.equal(snapshot.telemetry.sql.fingerprints[0].fingerprint, 'abc123');
  assert.equal(snapshot.telemetry.sql.fingerprints[0].sql_shape.includes('12345'), false);
  assert.equal(snapshot.telemetry.sql.pool.acquisitions_completed, 1);
  assert.equal(snapshot.telemetry.system.count, 1);
  assert.equal(snapshot.telemetry.system.maxima.mysql_threads_running, 2);

  assert.throws(
    () => registry.deleteSession(id),
    error => error && error.code === 'LOAD_TEST_STOP_REQUIRED'
  );
  registry.stopSession(id, { actorUserId: 9, reason: 'TEST' });
  assert.equal(registry.getPublicSession(id).state, 'DETENIDA');
  assert.equal(registry.deleteSession(id), true);
  assert.throws(() => registry.getPublicSession(id), error => error && error.code === 'LOAD_TEST_SESSION_NOT_FOUND');
  registry.close();
});

test('Fase 2 elimina sesiones LISTA al vencer TTL y conserva finalizadas sólo durante TTL de resultados', () => {
  const previousReady = process.env.LOAD_TEST_READY_TTL_SECONDS;
  const previousResult = process.env.LOAD_TEST_RESULT_TTL_SECONDS;
  process.env.LOAD_TEST_READY_TTL_SECONDS = '60';
  process.env.LOAD_TEST_RESULT_TTL_SECONDS = '60';

  let clock = 10_000;
  const registry = new LoadTestRegistry({ now: () => clock, autoCleanup: false });
  const prepared = registry.createSession({ actorUserId: 10, vus: 10, durationSeconds: 30, scenario: 'SALUD' });
  clock += 61_000;
  registry.cleanupExpired();
  assert.throws(() => registry.getPublicSession(prepared.session.id), error => error && error.code === 'LOAD_TEST_SESSION_NOT_FOUND');

  const second = registry.createSession({ actorUserId: 10, vus: 10, durationSeconds: 30, scenario: 'SALUD' });
  registry.claimRunner(second.session.id, { actorUserId: 10 });
  registry.startSession(second.session.id);
  registry.stopSession(second.session.id, { actorUserId: 10, reason: 'TEST', finalState: 'FINALIZADA' });
  assert.equal(registry.getPublicSession(second.session.id).state, 'FINALIZADA');
  clock += 61_000;
  registry.cleanupExpired();
  assert.throws(() => registry.getPublicSession(second.session.id), error => error && error.code === 'LOAD_TEST_SESSION_NOT_FOUND');

  registry.close();
  if (previousReady === undefined) delete process.env.LOAD_TEST_READY_TTL_SECONDS; else process.env.LOAD_TEST_READY_TTL_SECONDS = previousReady;
  if (previousResult === undefined) delete process.env.LOAD_TEST_RESULT_TTL_SECONDS; else process.env.LOAD_TEST_RESULT_TTL_SECONDS = previousResult;
});

test('AsyncLocalStorage conserva session-id a través de trabajo asíncrono', async () => {
  const observed = await runWithLoadTestContext({ sessionId: 'LOAD-TEST' }, async () => {
    await Promise.resolve();
    return getCurrentLoadTestSessionId();
  });
  assert.equal(observed, 'LOAD-TEST');
  assert.equal(getCurrentLoadTestSessionId(), null);
});

test('LOAD_TEST_MAX_VUS sigue siendo configurable y sin límite duro fijo', () => {
  const previous = process.env.LOAD_TEST_MAX_VUS;
  process.env.LOAD_TEST_MAX_VUS = '1000';
  const limits = getLoadTestLimits();
  assert.equal(limits.max_vus_configured, 1000);
  assert.equal(limits.hard_max_vus, null);
  if (previous === undefined) delete process.env.LOAD_TEST_MAX_VUS; else process.env.LOAD_TEST_MAX_VUS = previous;
});

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function capabilityData(overrides = {}) {
  return {
    permissions: { access: true, execute: true, stop: true },
    limits: {
      min_vus: 10,
      max_vus_configured: 200,
      step_vus: 10,
      hard_max_vus: null,
      duration_default_seconds: 120,
      duration_max_seconds: 300
    },
    telemetry: { result_ttl_seconds: 900 },
    execution_available: true,
    runner_runtime: { ready: true, single_instance_confirmed: true, target_configured: true },
    scenarios: [{ code: 'SALUD', label: 'Salud' }],
    active_session: null,
    ...overrides
  };
}

function auditRecord(id = 'MG-TEST') {
  return {
    schema_version: 1,
    change_id: id,
    title: 'Cambio de prueba',
    module: 'Panel de Control',
    company: 'GENERAL',
    type: 'correction',
    layer: ['FRONTEND'],
    final_summary: 'Resultado vigente',
    reason: 'Prueba',
    user_impact: 'Sin bloqueo',
    status: 'published',
    finalized_at: '2026-09-28T09:00:00-06:00',
    responsible: 'Programador',
    validation: 'Automática',
    references: { commit: 'a'.repeat(40), issue: null, pull_request: null }
  };
}

function panelControlHarness(apiFn, { timeoutMs = 25 } = {}) {
  const file = path.join(__dirname, '..', 'modules', 'panel-control', 'panel-control.js');
  let source = fs.readFileSync(file, 'utf8');
  source = source.replace('const LOAD_TEST_CAPABILITY_TIMEOUT_MS=5000;', `const LOAD_TEST_CAPABILITY_TIMEOUT_MS=${timeoutMs};`);
  source = source.replace(
    /window\.ManttoPanelControl=\{init\};\s*consumeSaveMessage\(\);\s*\}\)\(\);\s*$/,
    "window.__pcLoadTest={loadLoadTestCapabilities,loadBootstrap,renderMain,state,loadTestHasAccess,shell};window.ManttoPanelControl={init};consumeSaveMessage();})();"
  );

  const box = { innerHTML: '', querySelector: () => null };
  const windowObject = {
    ManttoAuth: {
      api: apiFn,
      getUser: () => ({ rol: 'Programador', roles: ['Programador'] })
    },
    MANTTO_BUILD_INFO: { provider: 'LOCAL', commit: 'a'.repeat(40) },
    MANTTO_CHANGE_AUDIT: {
      schemaVersion: 1,
      generatedAt: '2026-09-28T15:00:00.000Z',
      buildCommit: 'a'.repeat(40),
      changes: [auditRecord()]
    },
    setTimeout,
    clearTimeout
  };
  const documentObject = {
    getElementById(id) { return id === 'pc-content' ? box : null; },
    querySelector: () => null,
    head: { appendChild() {} }
  };
  const context = {
    window: windowObject,
    document: documentObject,
    sessionStorage: { getItem: () => null, removeItem() {}, setItem() {} },
    localStorage: { getItem: () => null, removeItem() {}, setItem() {} },
    Intl,
    Date,
    URL,
    AbortController,
    setTimeout,
    clearTimeout,
    confirm: () => true,
    console
  };
  vm.runInNewContext(source, context);
  return { api: context.window.__pcLoadTest, box, context };
}

function deferredCapability({ rejectOnAbort = false } = {}) {
  let resolvePromise;
  let rejectPromise;
  const promise = new Promise((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  const api = (_path, options = {}) => {
    if (rejectOnAbort && options.signal) {
      options.signal.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        rejectPromise(error);
      }, { once: true });
    }
    return promise;
  };
  return { api, resolve: resolvePromise, reject: rejectPromise };
}

test('Hallazgo 1: capacidades son independientes del bootstrap y Auditoría abre con respuesta lenta', async () => {
  const pending = deferredCapability();
  const harness = panelControlHarness(pending.api);
  harness.api.state.error = 'ERROR_GLOBAL_PREEXISTENTE';
  harness.api.state.bootLoading = true;
  harness.api.state.tab = 'audit';

  const capabilityPromise = harness.api.loadLoadTestCapabilities();
  harness.api.renderMain();
  assert.match(harness.box.innerHTML, /Auditoría de cambios/);
  assert.equal(harness.api.state.error, 'ERROR_GLOBAL_PREEXISTENTE');

  pending.resolve({ ok: true, data: capabilityData() });
  await capabilityPromise;
  assert.equal(harness.api.loadTestHasAccess(), true);

  const source = fs.readFileSync(path.join(__dirname, '..', 'modules', 'panel-control', 'panel-control.js'), 'utf8');
  const bootstrapBlock = source.slice(source.indexOf('async function loadBootstrap()'), source.indexOf('async function loadRolePermissions'));
  assert.match(bootstrapBlock, /void loadLoadTestCapabilities\(\{renderAfter:true\}\)/);
  assert.doesNotMatch(bootstrapBlock, /await\s+loadLoadTestCapabilities/);
  const auditBranch = source.indexOf("if(state.tab==='audit')");
  assert.ok(auditBranch >= 0 && auditBranch < source.indexOf('if(state.bootLoading)', auditBranch));
  assert.ok(auditBranch < source.indexOf('if(state.error)', auditBranch));
});

test('Hallazgo 1: 403, red y timeout ocultan solo Prueba de Carga y Auditoría sigue disponible; el reintento autoriza', async () => {
  for (const mode of ['403', 'network', 'timeout']) {
    const pending = deferredCapability({ rejectOnAbort: mode === 'timeout' });
    const harness = panelControlHarness(pending.api, { timeoutMs: 20 });
    harness.api.state.error = 'PANEL_OK';
    harness.api.state.bootLoading = true;
    harness.api.state.tab = 'audit';

    const requestPromise = harness.api.loadLoadTestCapabilities();
    harness.api.renderMain();
    assert.match(harness.box.innerHTML, /Auditoría de cambios/, `Auditoría debe abrir durante ${mode}`);

    if (mode === '403') {
      const error = new Error('denegado');
      error.status = 403;
      pending.reject(error);
    } else if (mode === 'network') {
      pending.reject(new TypeError('network down'));
    }

    await requestPromise;
    assert.equal(harness.api.state.loadTestCapabilities, null, `capabilities ocultas en ${mode}`);
    assert.equal(harness.api.state.error, 'PANEL_OK', `error global intacto en ${mode}`);
    assert.equal(harness.api.state.tab, 'audit', `Auditoría permanece activa en ${mode}`);

    const authorized = capabilityData();
    harness.context.window.ManttoAuth.api = async () => ({ ok: true, data: authorized });
    await harness.api.loadLoadTestCapabilities();
    assert.equal(harness.api.loadTestHasAccess(), true, `reintento autorizado en ${mode}`);
  }
});

test('Hallazgo 1: Recargar datos conserva el reintento de capacidades y el timeout oficial es 5 s', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'modules', 'panel-control', 'panel-control.js'), 'utf8');
  assert.match(source, /const LOAD_TEST_CAPABILITY_TIMEOUT_MS=5000;/);
  assert.match(source, /id='pc-reload'|id="pc-reload"/);
  assert.match(source, /await loadLoadTestCapabilities\(\{renderAfter:true\}\)/);
  assert.match(source, /await loadBootstrap\(\)/);
});

test('Hallazgo 1: timeout termina aunque la API quede esperando una renovación de sesión', async () => {
  const pending = deferredCapability(); // Ignora AbortController, como una renovación JWT pendiente.
  const harness = panelControlHarness(pending.api, { timeoutMs: 20 });
  harness.api.state.loadTestCapabilities = capabilityData();
  const startedAt = Date.now();
  await harness.api.loadLoadTestCapabilities();
  assert.ok(Date.now() - startedAt < 500, 'el timeout debe resolver sin esperar la API subyacente');
  assert.equal(harness.api.loadTestHasAccess(), false);
  assert.equal(harness.api.state.loadTestCapabilityLoading, false);
  pending.resolve({ ok: true, data: capabilityData() });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(harness.api.loadTestHasAccess(), false, 'la respuesta tardía no reabre la pestaña');
});


test('Hallazgo 1: loadBootstrap finaliza aunque capabilities siga pendiente', async () => {
  let resolveCapabilities;
  const capabilitiesPending = new Promise(resolve => { resolveCapabilities = resolve; });
  const apiFn = pathName => {
    if (String(pathName).includes('/prueba-carga/capabilities')) return capabilitiesPending;
    if (String(pathName).includes('/panel-control/bootstrap')) {
      return Promise.resolve({ ok: true, data: { roles: [], usuarios: [], catalogo: [], totales: {} } });
    }
    throw new Error(`Ruta inesperada: ${pathName}`);
  };
  const harness = panelControlHarness(apiFn, { timeoutMs: 1000 });
  let bootstrapDone = false;
  const bootstrapPromise = harness.api.loadBootstrap().then(() => { bootstrapDone = true; });
  await Promise.race([bootstrapPromise, new Promise(resolve => setTimeout(resolve, 30))]);
  assert.equal(bootstrapDone, true, 'bootstrap general no debe esperar capabilities');
  assert.equal(harness.api.state.loadTestCapabilityLoading, true, 'capabilities continúa independiente');
  resolveCapabilities({ ok: true, data: capabilityData() });
  await new Promise(resolve => setTimeout(resolve, 0));
});

test('Hallazgo 1: autorización muestra Prueba de Carga y un fallo de capabilities no rompe las demás pestañas', async () => {
  const harness = panelControlHarness(async () => ({ ok: true, data: capabilityData() }));
  harness.api.state.loadTestCapabilities = capabilityData();
  assert.match(harness.api.shell(), /Prueba de Carga/);

  harness.context.window.ManttoPanelControlPruebaCarga = {
    render(target) { target.innerHTML = 'LOAD_TEST_OK'; }
  };
  harness.api.state.bootLoading = false;
  harness.api.state.error = '';
  harness.api.state.tab = 'load-test';
  harness.api.renderMain();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(harness.box.innerHTML, 'LOAD_TEST_OK');

  const networkError = new TypeError('capabilities offline');
  harness.context.window.ManttoAuth.api = async () => { throw networkError; };
  harness.api.state.tab = 'users';
  await harness.api.loadLoadTestCapabilities();
  harness.api.renderMain();
  assert.equal(harness.api.state.error, '', 'el fallo aislado no crea error global');
  assert.match(harness.box.innerHTML, /pc-workspace/, 'Permisos por usuario sigue renderizando');
  assert.doesNotMatch(harness.api.shell(), /Prueba de Carga/, 'solo se oculta la pestaña de carga');
});

function mockResponse() {
  return {
    statusCode: 200,
    writableEnded: false,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; this.writableEnded = true; return value; },
    once() { return this; }
  };
}

test('Hallazgo 2: tráfico marcado sólo permite GET/HEAD; POST/PUT/PATCH/DELETE nunca llegan a negocio', () => {
  process.env.DB_HOST ||= '127.0.0.1';
  process.env.DB_PORT ||= '3306';
  process.env.DB_USER ||= 'test';
  process.env.DB_PASSWORD ||= 'test';
  process.env.DB_NAME ||= 'test';
  process.env.DB_SSL = 'false';

  const registry = require('../backend/src/modules/panel-control-prueba-carga/panel-control-prueba-carga.registry');
  const active = registry.getActivePublicSession();
  if (active) {
    try { registry.stopSession(active.id, { actorUserId: active.actor_user_id, reason: 'TEST_CLEANUP' }); } catch (_error) {}
    try { registry.deleteSession(active.id); } catch (_error) {}
  }
  const prepared = registry.createSession({ actorUserId: 77, vus: 10, durationSeconds: 30, scenario: 'SALUD' });
  const claim = registry.claimRunner(prepared.session.id, { actorUserId: 77 });
  registry.startSession(prepared.session.id);
  const { loadTestTelemetryMiddleware } = require('../backend/src/modules/panel-control-prueba-carga/panel-control-prueba-carga.telemetry');

  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    let businessMutations = 0;
    const req = {
      method,
      originalUrl: '/api/negocio/registro/1',
      get(name) {
        if (String(name).toLowerCase() === 'x-mantto-load-test') return prepared.session.id;
        if (String(name).toLowerCase() === 'x-mantto-load-test-token') return claim.runner_token;
        if (String(name).toLowerCase() === 'x-mantto-load-test-instance') return require('../backend/src/modules/panel-control-prueba-carga/panel-control-prueba-carga.runtime').PROCESS_INSTANCE_ID;
        return '';
      }
    };
    const res = mockResponse();
    loadTestTelemetryMiddleware(req, res, () => { businessMutations += 1; });
    assert.equal(res.statusCode, 405, `${method} debe rechazarse`);
    assert.equal(res.body?.code, 'LOAD_TEST_READ_ONLY');
    assert.equal(businessMutations, 0, `${method} no debe llegar a la ruta de negocio`);
  }

  for (const method of ['GET', 'HEAD']) {
    let reads = 0;
    const req = {
      method,
      originalUrl: '/api/health',
      get(name) {
        if (String(name).toLowerCase() === 'x-mantto-load-test') return prepared.session.id;
        if (String(name).toLowerCase() === 'x-mantto-load-test-token') return claim.runner_token;
        if (String(name).toLowerCase() === 'x-mantto-load-test-instance') return require('../backend/src/modules/panel-control-prueba-carga/panel-control-prueba-carga.runtime').PROCESS_INSTANCE_ID;
        return '';
      }
    };
    const res = mockResponse();
    loadTestTelemetryMiddleware(req, res, () => { reads += 1; });
    assert.equal(reads, 1, `${method} debe continuar`);
  }

  let normalMutation = 0;
  loadTestTelemetryMiddleware({ method: 'POST', get: () => '', originalUrl: '/api/negocio' }, mockResponse(), () => { normalMutation += 1; });
  assert.equal(normalMutation, 1, 'una solicitud normal sin cabecera no cambia de comportamiento');

  registry.stopSession(prepared.session.id, { actorUserId: 77, reason: 'TEST' });
  registry.deleteSession(prepared.session.id);
});

function withPermissionStub(permissionFn, callback) {
  const previousSingleInstance = process.env.LOAD_TEST_SINGLE_INSTANCE;
  const previousAllowedOrigin = process.env.LOAD_TEST_ALLOWED_ORIGIN;
  process.env.LOAD_TEST_SINGLE_INSTANCE = 'true';
  process.env.LOAD_TEST_ALLOWED_ORIGIN = 'https://mantto-gestor-api-a4hwfpgvbeb4gmgj.mexicocentral-01.azurewebsites.net';
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
      delete require.cache[servicePath];
      if (previousService) require.cache[servicePath] = previousService;
      if (previousPermission) require.cache[permissionPath] = previousPermission;
      else delete require.cache[permissionPath];
      if (previousSingleInstance === undefined) delete process.env.LOAD_TEST_SINGLE_INSTANCE; else process.env.LOAD_TEST_SINGLE_INSTANCE = previousSingleInstance;
      if (previousAllowedOrigin === undefined) delete process.env.LOAD_TEST_ALLOWED_ORIGIN; else process.env.LOAD_TEST_ALLOWED_ORIGIN = previousAllowedOrigin;
    });
}

test('Hallazgo 3: permisos dependen del actor y no existe acceso por nombre de Programador United/Corellian', async () => {
  await withPermissionStub(async (userId) => Number(userId) === 501, async service => {
    const general = { id_SB: 501, rol: 'Programador' };
    const united = { id_SB: 502, rol: 'Programador United' };
    const corellian = { id_SB: 503, rol: 'Programador Corellian' };

    const caps = await service.getCapabilities(general);
    assert.equal(caps.permissions.access, true);
    await assert.rejects(() => service.getCapabilities(united), error => error?.status === 403 && error?.code === 'LOAD_TEST_ACCESS_DENIED');
    await assert.rejects(() => service.getCapabilities(corellian), error => error?.status === 403 && error?.code === 'LOAD_TEST_ACCESS_DENIED');
  });
});

test('Hallazgo 3: propiedad de sesión se comprueba también al detener', async () => {
  await withPermissionStub(async () => true, async service => {
    const owner = { id_SB: 601, rol: 'Programador' };
    const other = { id_SB: 602, rol: 'Programador' };
    const created = await service.createSession(owner, { scenario: 'SALUD', vus: 10, duration_seconds: 30 });
    await assert.rejects(
      () => service.stopSession(other, created.session.id, 'TEST'),
      error => error?.status === 403 && error?.code === 'LOAD_TEST_SESSION_OWNER_REQUIRED'
    );
    await service.stopSession(owner, created.session.id, 'TEST');
    await service.deleteSession(owner, created.session.id);
  });
});

test('Hallazgo 3: controller usa req.user como actor aunque exista contextUser y bloquea operaciones en Visor', async () => {
  const servicePath = require.resolve('../backend/src/modules/panel-control-prueba-carga/panel-control-prueba-carga.service');
  const controllerPath = require.resolve('../backend/src/modules/panel-control-prueba-carga/panel-control-prueba-carga.controller');
  const service = require(servicePath);
  const originalGet = service.getCapabilities;
  const originalCreate = service.createSession;
  let seenUser = null;
  let createCalls = 0;
  service.getCapabilities = async user => { seenUser = user; return capabilityData(); };
  service.createSession = async () => { createCalls += 1; return {}; };
  delete require.cache[controllerPath];
  const controller = require(controllerPath);

  const res = mockResponse();
  await controller.getCapabilities({ user: { id_SB: 701 }, contextUser: { id_SB: 999 } }, res, error => { throw error; });
  assert.equal(seenUser.id_SB, 701);

  const viewerRes = mockResponse();
  await controller.createSession(
    { user: { id_SB: 701 }, contextUser: { id_SB: 999 }, viewerContext: { active: true }, body: {} },
    viewerRes,
    error => { throw error; }
  );
  assert.equal(viewerRes.statusCode, 403);
  assert.equal(viewerRes.body?.code, 'VIEWER_READ_ONLY');
  assert.equal(createCalls, 0);

  service.getCapabilities = originalGet;
  service.createSession = originalCreate;
  delete require.cache[controllerPath];

  const authSource = fs.readFileSync(path.join(__dirname, '..', 'backend', 'src', 'middleware', 'auth.middleware.js'), 'utf8');
  assert.match(authSource, /path\.startsWith\('\/api\/panel-control\/prueba-carga'\)/);
});

function loadTestFrontendHarness(apiFn) {
  const file = path.join(__dirname, '..', 'modules', 'panel-control-prueba-carga', 'panel-control-prueba-carga.js');
  let source = fs.readFileSync(file, 'utf8');
  source = source.replace(
    /window\.ManttoPanelControlPruebaCarga=\{[\s\S]*?\n  \};\n\}\)\(\);\s*$/,
    `window.ManttoPanelControlPruebaCarga={render,version:MODULE_VERSION,getPreparedSession(){return state.session?{session:{...state.session}}:null;}};window.__pcltTest={state,refresh,clear,render,reloadCapabilities,recoverExpiredSession};})();`
  );
  const context = {
    window: { ManttoAuth: { api: apiFn } },
    document: { getElementById: () => null },
    Date,
    Intl,
    setTimeout,
    clearTimeout,
    console
  };
  vm.runInNewContext(source, context);
  const api = context.window.__pcltTest;
  api.state.capabilities = capabilityData();
  return { api, container: { innerHTML: '' }, context };
}

function seedFrontendSession(state) {
  state.session = {
    id: 'LOAD-EXPIRED',
    scenario: 'SALUD',
    vus: 10,
    duration_seconds: 30,
    state: 'LISTA',
    created_at: '2026-09-28T15:00:00Z',
    expires_at: '2026-09-28T15:01:00Z',
    telemetry: {}
  };
  state.capabilities = capabilityData({ active_session: { ...state.session } });
}

test('Hallazgo 4: Actualizar con 404 limpia sesión, refresca capacidades y permite preparar otra', async () => {
  const calls = [];
  const harness = loadTestFrontendHarness(async pathValue => {
    calls.push(pathValue);
    if (pathValue.includes('/session/')) {
      const error = new Error('expirada');
      error.status = 404;
      throw error;
    }
    return { ok: true, data: capabilityData({ active_session: null }) };
  });
  seedFrontendSession(harness.api.state);
  await harness.api.refresh(harness.container);
  assert.equal(harness.api.state.session, null);
  assert.equal(harness.api.state.error, '');
  assert.equal(harness.api.state.capabilities.active_session, null);
  assert.ok(calls.some(item => item.includes('/capabilities')));
  assert.match(harness.container.innerHTML, /PREPARAR Y EJECUTAR/);
  assert.doesNotMatch(harness.container.innerHTML, /LOAD-EXPIRED/);
});

test('Hallazgo 4: Limpiar una sesión ya vencida (404) cuenta como completado', async () => {
  const calls = [];
  const harness = loadTestFrontendHarness(async (pathValue, options = {}) => {
    calls.push([pathValue, options.method]);
    if (options.method === 'DELETE') {
      const error = new Error('ya venció');
      error.status = 404;
      throw error;
    }
    return { ok: true, data: capabilityData({ active_session: null }) };
  });
  seedFrontendSession(harness.api.state);
  await harness.api.clear(harness.container);
  assert.equal(harness.api.state.session, null);
  assert.equal(harness.api.state.error, '');
  assert.ok(calls.some(([item]) => item.includes('/capabilities')));
  assert.match(harness.container.innerHTML, /PREPARAR Y EJECUTAR/);
});

test('Hallazgo 4: errores de red distintos de 404 conservan la sesión local', async () => {
  for (const action of ['refresh', 'clear']) {
    const harness = loadTestFrontendHarness(async () => { throw new TypeError('red caída'); });
    seedFrontendSession(harness.api.state);
    await harness.api[action](harness.container);
    assert.equal(harness.api.state.session?.id, 'LOAD-EXPIRED', `${action} conserva sesión`);
    assert.match(harness.api.state.error, /red caída/);
  }
});

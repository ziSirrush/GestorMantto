'use strict';

// Ejecutar únicamente en un host externo dedicado. Nunca en el App Service medido.
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');

const execFileAsync = promisify(execFile);
const ORIGIN = 'https://mantto-gestor-api-a4hwfpgvbeb4gmgj.mexicocentral-01.azurewebsites.net';
const RUNNER_ID = process.env.MANTTO_RUNNER_ID || 'runner-01';
const K6_PATH = process.env.MANTTO_K6_PATH || 'k6';
const SCRIPT = path.join(__dirname, 'mantto-gestor-load-test.k6.js');
const SERVICE_TOKEN = process.env.MANTTO_RUNNER_SERVICE_TOKEN || '';
const TEST_EMAIL = process.env.MANTTO_TEST_EMAIL || '';
const TEST_PASSWORD = process.env.MANTTO_TEST_PASSWORD || '';

const IDENTITY_RETRY_DELAYS_MS = Object.freeze([30000, 60000, 120000, 300000]);
const IDENTITY_429_FALLBACK_MS = 300000;
const IDENTITY_REVALIDATE_MS = 30000;

function provisioned() {
  return /^(?:[a-f0-9]{64}|[A-Za-z0-9_-]{43,})$/i.test(SERVICE_TOKEN)
    && /^[A-Za-z0-9_-]{1,64}$/.test(RUNNER_ID);
}

function httpError(message, response) {
  const result = new Error(message);
  result.status = Number(response?.status || 0) || null;
  const retryAfter = String(response?.headers?.get?.('retry-after') || '').trim();
  if (/^\d+$/.test(retryAfter)) result.retryAfterMs = Number(retryAfter) * 1000;
  else if (retryAfter) {
    const retryAt = Date.parse(retryAfter);
    if (Number.isFinite(retryAt)) result.retryAfterMs = Math.max(0, retryAt - Date.now());
  }
  return result;
}

function identityRetryDelay(error, failureCount) {
  if (Number(error?.status) === 429) {
    const fromHeader = Number(error?.retryAfterMs);
    return Number.isFinite(fromHeader) && fromHeader > 0 ? fromHeader : IDENTITY_429_FALLBACK_MS;
  }
  const index = Math.max(0, Math.min(IDENTITY_RETRY_DELAYS_MS.length - 1, Number(failureCount || 1) - 1));
  return IDENTITY_RETRY_DELAYS_MS[index];
}

async function request(route, { method = 'GET', body, token, runnerToken, service = false } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (service) headers['X-Mantto-Runner-Service-Token'] = SERVICE_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  if (runnerToken) headers['X-Mantto-Load-Test-Token'] = runnerToken;
  const response = await fetch(`${ORIGIN}${route}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual', signal: AbortSignal.timeout(10000)
  });
  if (response.status === 204) return null;
  if (!response.ok || response.status >= 300) throw httpError(`Contrato HTTP ${response.status} en ${route}.`, response);
  const payload = await response.json();
  if (!payload.ok) throw new Error(`Contrato no disponible en ${route}.`);
  return payload.data;
}

async function k6Version() {
  const { stdout } = await execFileAsync(K6_PATH, ['version'], { shell: false, timeout: 5000, windowsHide: true });
  return String(stdout || '').trim().slice(0, 80);
}

async function loginAndValidate() {
  const response = await fetch(`${ORIGIN}/api/auth/login`, {
    method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ correo: TEST_EMAIL, pass: TEST_PASSWORD }),
    redirect: 'manual', signal: AbortSignal.timeout(10000)
  });
  if (response.status !== 200) throw httpError('La identidad funcional no pudo iniciar sesión.', response);
  const login = await response.json();
  if (!login.ok || !login.token || login.must_change_password) throw new Error('La identidad funcional no está lista.');
  const identity = await request('/api/panel-control/prueba-carga/runner/test-identity', { token: login.token });
  if (!identity.ready || Number(identity.user_id) !== Number(login.user?.id_SB)) throw new Error('Identidad funcional no validada como solo lectura.');
  return login.token;
}

function runK6(job, jwt, spawnProcess = spawn) {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      MANTTO_LOAD_TEST_SESSION: job.session_id,
      MANTTO_LOAD_TEST_RUNNER_TOKEN: job.runner_token,
      MANTTO_TEST_JWT: jwt,
      MANTTO_VUS: String(job.vus),
      MANTTO_DURATION_SECONDS: String(job.duration_seconds),
      MANTTO_SCENARIO: job.scenario.code,
      MANTTO_MIN_VUS: String(job.limits.min_vus),
      MANTTO_MAX_VUS: String(job.limits.max_vus_configured),
      MANTTO_VUS_STEP: String(job.limits.step_vus),
      MANTTO_PROCESS_INSTANCE_ID: job.process_instance_id
    };
    delete env.MANTTO_OPERATOR_JWT;
    delete env.MANTTO_RUNNER_SERVICE_TOKEN;
    delete env.MANTTO_TEST_EMAIL;
    delete env.MANTTO_TEST_PASSWORD;
    const child = spawnProcess(K6_PATH, ['run', SCRIPT], { shell: false, env, stdio: 'ignore', windowsHide: true });
    delete env.MANTTO_LOAD_TEST_RUNNER_TOKEN;
    delete env.MANTTO_TEST_JWT;
    child.once('error', reject);
    child.once('close', code => resolve(code == null ? 1 : code));
  });
}

function logIdentityBackoff(error, delayMs) {
  const status = Number(error?.status || 0);
  const label = status ? `HTTP ${status}` : 'ERROR';
  console.warn(`[ManttoLoadTestRunner] Identidad no lista (${label}). Reintento en ${Math.ceil(delayMs / 1000)} s.`);
}

async function main() {
  const onlySession = process.argv[2] === '--session-id' ? String(process.argv[3] || '') : null;
  if (onlySession && !/^LOAD-[A-Z0-9-]+$/.test(onlySession)) throw new Error('SessionId inválido.');
  if (!provisioned()) throw new Error('Este equipo no está provisionado como runner de Prueba de Carga.');

  let jwt = null;
  let identityValidatedAt = 0;
  let identityFailureCount = 0;
  let nextIdentityAttemptAt = 0;
  let job = null;

  while (true) {
    let version = '';
    try { version = await k6Version(); } catch (_error) { /* fail closed */ }

    const now = Date.now();
    const identityConfigured = Boolean(TEST_EMAIL && TEST_PASSWORD);

    if (version && identityConfigured && !jwt && now >= nextIdentityAttemptAt) {
      try {
        jwt = await loginAndValidate();
        identityValidatedAt = Date.now();
        identityFailureCount = 0;
        nextIdentityAttemptAt = 0;
      } catch (error) {
        jwt = null;
        identityValidatedAt = 0;
        identityFailureCount += 1;
        const delay = identityRetryDelay(error, identityFailureCount);
        nextIdentityAttemptAt = Date.now() + delay;
        logIdentityBackoff(error, delay);
      }
    }

    if (version && jwt && Date.now() - identityValidatedAt > IDENTITY_REVALIDATE_MS) {
      try {
        const identity = await request('/api/panel-control/prueba-carga/runner/test-identity', { token: jwt });
        if (!identity.ready) throw new Error('Identidad no disponible.');
        identityValidatedAt = Date.now();
      } catch (error) {
        jwt = null;
        identityValidatedAt = 0;
        identityFailureCount += 1;
        const delay = identityRetryDelay(error, identityFailureCount);
        nextIdentityAttemptAt = Date.now() + delay;
        logIdentityBackoff(error, delay);
      }
    }

    try {
      await request('/api/panel-control/prueba-carga/runner/heartbeat', {
        method: 'POST', service: true,
        body: { runner_id: RUNNER_ID, k6_ready: Boolean(version), k6_version: version,
          test_identity_ready: Boolean(jwt), active_job_id: job?.session_id || null }
      });
      if (version && jwt && !job) {
        job = await request('/api/panel-control/prueba-carga/runner/lease', {
          method: 'POST', service: true, body: { runner_id: RUNNER_ID, session_id: onlySession }
        });
        if (onlySession && !job) throw new Error('La sesión no está despachada o ya fue reclamada.');
      }
      if (job) {
        if (job.target_origin !== ORIGIN || job.redirects_allowed !== false) throw new Error('Origen o redirecciones incompatibles.');
        const activeJobId = job.session_id;
        const heartbeatTimer = setInterval(() => {
          void request('/api/panel-control/prueba-carga/runner/heartbeat', {
            method: 'POST', service: true,
            body: { runner_id: RUNNER_ID, k6_ready: true, k6_version: version,
              test_identity_ready: true, active_job_id: activeJobId }
          }).catch(() => {});
        }, 5000);
        let exitCode;
        try { exitCode = await runK6(job, jwt); }
        finally { clearInterval(heartbeatTimer); }
        if (exitCode !== 0) {
          try {
            await request(`/api/panel-control/prueba-carga/session/${encodeURIComponent(job.session_id)}/runner-abort`, {
              method: 'POST', body: { reason: 'K6_EXIT_NONZERO' }, runnerToken: job.runner_token
            });
            await request(`/api/panel-control/prueba-carga/session/${encodeURIComponent(job.session_id)}/runner-finish`, {
              method: 'POST', body: { reason: 'K6_EXIT_NONZERO' }, runnerToken: job.runner_token
            });
          } catch (_error) { /* timeout del backend cierra si no hubo start */ }
        }
        job = null;
        jwt = null;
        identityValidatedAt = 0;
        identityFailureCount = 0;
        nextIdentityAttemptAt = 0;
        if (onlySession) return;
      }
    } catch (_error) {
      job = null;
      if (onlySession) throw _error;
    }
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { provisioned, request, runK6, loginAndValidate, identityRetryDelay, main };

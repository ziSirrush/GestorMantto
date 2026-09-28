import http from 'k6/http';
import { check, sleep } from 'k6';
import exec from 'k6/execution';
import { Counter, Trend } from 'k6/metrics';
import { TRUSTED_ORIGIN, CATALOG_VERSION, SCENARIOS } from './mantto-gestor-load-test.config.js';

function clean(value) {
  return String(value || '').trim();
}

function normalizeOrigin(value) {
  const raw = clean(value).replace(/\/+$/, '');
  const match = raw.match(/^(https?):\/\/([A-Za-z0-9.-]+)(:\d+)?$/);
  if (!match) return null;
  return `${match[1].toLowerCase()}://${match[2].toLowerCase()}${match[3] || ''}`;
}

function positiveInteger(name) {
  const value = Number(__ENV[name]);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} no es un entero positivo valido.`);
  return value;
}

const trustedOrigin = normalizeOrigin(TRUSTED_ORIGIN);
const targetOverride = clean(__ENV.TARGET_URL);
if (!trustedOrigin) throw new Error('TRUSTED_ORIGIN del runner no es valido.');
if (targetOverride && normalizeOrigin(targetOverride) !== trustedOrigin) {
  throw new Error('TARGET_URL fue rechazado: el runner solo puede operar contra el origen versionado de Mantto Gestor.');
}

const SESSION_ID = clean(__ENV.MANTTO_LOAD_TEST_SESSION);
const OPERATOR_JWT = clean(__ENV.MANTTO_OPERATOR_JWT);
const TEST_JWT = clean(__ENV.MANTTO_TEST_JWT);
const VUS = positiveInteger('MANTTO_VUS');
const DURATION_SECONDS = positiveInteger('MANTTO_DURATION_SECONDS');
const MIN_VUS = positiveInteger('MANTTO_MIN_VUS');
const MAX_VUS = positiveInteger('MANTTO_MAX_VUS');
const VUS_STEP = positiveInteger('MANTTO_VUS_STEP');
const SCENARIO = clean(__ENV.MANTTO_SCENARIO).toUpperCase();

if (!/^LOAD-[A-Z0-9-]+$/.test(SESSION_ID)) throw new Error('MANTTO_LOAD_TEST_SESSION no tiene formato valido.');
if (!OPERATOR_JWT) throw new Error('Falta la autenticacion del Programador general.');
if (!TEST_JWT) throw new Error('Falta la identidad de prueba de solo lectura.');
if (OPERATOR_JWT === TEST_JWT) throw new Error('La identidad operadora y la identidad funcional de prueba deben ser distintas.');
if (!SCENARIOS[SCENARIO]) throw new Error('El escenario recibido no existe en el catalogo versionado del runner.');
if (VUS < MIN_VUS || VUS > MAX_VUS || ((VUS - MIN_VUS) % VUS_STEP) !== 0) {
  throw new Error(`VUs fuera del rango configurado ${MIN_VUS}-${MAX_VUS} o fuera del paso ${VUS_STEP}.`);
}

export const options = {
  vus: VUS,
  duration: `${DURATION_SECONDS}s`,
  discardResponseBodies: true,
  maxRedirects: 0,
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  handleSummaryTimeout: '30s'
};

const loadRequests = new Counter('mantto_load_requests');
const loadFailed = new Counter('mantto_load_failed');
const loadDuration = new Trend('mantto_load_duration', true);
const http2xx = new Counter('mantto_http_2xx');
const http3xx = new Counter('mantto_http_3xx');
const http4xx = new Counter('mantto_http_4xx');
const http5xx = new Counter('mantto_http_5xx');
const networkErrors = new Counter('mantto_network_errors');
const timeouts = new Counter('mantto_timeouts');

let nextRunnerHeartbeatAt = 0;
let runnerControlFailures = 0;
let consecutiveNetworkFailures = 0;

function adminParams(responseType = 'text', extraHeaders = {}) {
  return {
    redirects: 0,
    responseType,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${OPERATOR_JWT}`,
      ...extraHeaders
    },
    tags: { traffic: 'load-test-control' }
  };
}

function runnerParams(token, responseType = 'text', extraHeaders = {}) {
  return {
    redirects: 0,
    responseType,
    timeout: '5s',
    headers: {
      Accept: 'application/json',
      'X-Mantto-Load-Test-Token': token,
      ...extraHeaders
    },
    tags: { traffic: 'load-test-control' }
  };
}

function responseHeader(response, name) {
  const target = clean(name).toLowerCase();
  const headers = response && response.headers ? response.headers : {};
  for (const [key, value] of Object.entries(headers)) {
    if (String(key || '').toLowerCase() === target) return clean(value);
  }
  return '';
}

function abortIfRedirect(response, context) {
  if (response && response.status >= 300 && response.status < 400) {
    exec.test.abort(`Redireccion rechazada durante ${context}. El runner no sigue redirecciones.`);
  }
}

function parseJsonResponse(response, context) {
  abortIfRedirect(response, context);
  if (!response || response.status < 200 || response.status >= 300) {
    exec.test.abort(`${context} fallo con HTTP ${response ? response.status : 'N/D'}.`);
  }
  try {
    return response.json();
  } catch (_error) {
    exec.test.abort(`${context} devolvio una respuesta no JSON.`);
  }
  return null;
}

function assertClaim(claim) {
  if (!claim || claim.ok !== true || !claim.data) exec.test.abort('runner-claim no devolvio un contrato valido.');
  const data = claim.data;
  if (data.session_id !== SESSION_ID) exec.test.abort('runner-claim devolvio otra sesion.');
  if (normalizeOrigin(data.target_origin) !== trustedOrigin) exec.test.abort('El origen autorizado por backend no coincide con el origen versionado del runner.');
  if (data.redirects_allowed !== false) exec.test.abort('El backend no confirmo la politica de redirecciones desactivadas.');
  if (data.scenario_catalog_version !== CATALOG_VERSION) exec.test.abort('Version de catalogo runner/backend incompatible.');
  if (String(data.scenario?.code || '').toUpperCase() !== SCENARIO) exec.test.abort('El escenario reclamado no coincide con la sesion preparada.');
  if (Number(data.vus) !== VUS || Number(data.duration_seconds) !== DURATION_SECONDS) exec.test.abort('La configuracion del runner no coincide con la sesion preparada.');
  if (!clean(data.runner_token) || !clean(data.process_instance_id)) exec.test.abort('runner-claim no entrego token/instancia validos.');

  const localRequests = SCENARIOS[SCENARIO].requests;
  const remoteRequests = Array.isArray(data.scenario?.requests) ? data.scenario.requests : [];
  if (JSON.stringify(remoteRequests) !== JSON.stringify(localRequests)) {
    exec.test.abort('El catalogo de endpoints del backend no coincide con el runner versionado.');
  }

  return data;
}

function signalRunnerAbort(data, reason) {
  if (!data?.runnerToken) return;
  try {
    http.post(
      `${trustedOrigin}/api/panel-control/prueba-carga/session/${encodeURIComponent(SESSION_ID)}/runner-abort`,
      JSON.stringify({ reason: clean(reason).slice(0, 120) || 'RUNNER_ABORT' }),
      runnerParams(data.runnerToken, 'none', { 'Content-Type': 'application/json' })
    );
  } catch (_error) {
    // Si el backend ya no responde, el aborto local sigue siendo prioritario.
  }
}

function abortRun(data, reason, message) {
  signalRunnerAbort(data, reason);
  exec.test.abort(message || reason || 'Prueba abortada por proteccion del runner.');
}

function runnerHeartbeat(data, { force = false } = {}) {
  if (exec.vu.idInTest !== 1 || !data?.runnerToken) return;
  const now = Date.now();
  if (!force && now < nextRunnerHeartbeatAt) return;

  const sample = {
    vus_active: exec.instance.vusActive,
    vus_initialized: exec.instance.vusInitialized,
    iterations_completed: exec.instance.iterationsCompleted,
    iterations_interrupted: exec.instance.iterationsInterrupted,
    test_run_duration_ms: exec.instance.currentTestRunDuration,
    progress: exec.scenario.progress
  };

  let response;
  try {
    response = http.post(
      `${trustedOrigin}/api/panel-control/prueba-carga/session/${encodeURIComponent(SESSION_ID)}/runner-sample`,
      JSON.stringify(sample),
      runnerParams(data.runnerToken, 'text', { 'Content-Type': 'application/json' })
    );
  } catch (_error) {
    runnerControlFailures += 1;
    if (runnerControlFailures >= 3) exec.test.abort('Se perdio repetidamente el canal de control con Mantto Gestor.');
    return;
  }

  if (!response || response.status < 200 || response.status >= 300) {
    runnerControlFailures += 1;
    if (runnerControlFailures >= 3) exec.test.abort(`Canal de control fallo repetidamente con HTTP ${response ? response.status : 'N/D'}.`);
    return;
  }

  runnerControlFailures = 0;
  let payload;
  try { payload = response.json(); } catch (_error) { payload = null; }
  const control = payload?.data?.control || null;
  const pollMs = Math.max(250, Number(control?.poll_after_ms || data.controlPollMs || 1000));
  nextRunnerHeartbeatAt = now + pollMs;

  if (control?.command === 'ABORT') {
    try {
      http.post(
        `${trustedOrigin}/api/panel-control/prueba-carga/session/${encodeURIComponent(SESSION_ID)}/runner-stop-ack`,
        null,
        runnerParams(data.runnerToken, 'none')
      );
    } catch (_error) {
      // El aborto local no depende del ACK.
    }
    exec.test.abort(`Cancelacion recibida del backend: ${clean(control.reason) || 'sin motivo'}.`);
  }
}

function controlledSleep(seconds, data) {
  let remaining = Math.max(0, Number(seconds || 0));
  if (exec.vu.idInTest !== 1) {
    sleep(remaining);
    return;
  }
  while (remaining > 0) {
    const chunk = Math.min(0.5, remaining);
    sleep(chunk);
    remaining -= chunk;
    runnerHeartbeat(data);
  }
}

export function setup() {
  const claimResponse = http.post(
    `${trustedOrigin}/api/panel-control/prueba-carga/session/${encodeURIComponent(SESSION_ID)}/runner-claim`,
    null,
    adminParams('text')
  );
  const claim = assertClaim(parseJsonResponse(claimResponse, 'runner-claim'));

  const startResponse = http.post(
    `${trustedOrigin}/api/panel-control/prueba-carga/session/${encodeURIComponent(SESSION_ID)}/start`,
    null,
    adminParams('text')
  );
  const started = parseJsonResponse(startResponse, 'inicio de sesion');
  if (!started || started.ok !== true || started.data?.state !== 'EJECUTANDO') {
    exec.test.abort('El backend no confirmo el inicio de la sesion de carga.');
  }

  return {
    runnerToken: claim.runner_token,
    processInstanceId: claim.process_instance_id,
    controlPollMs: Math.max(250, Number(claim.control?.poll_ms || 1000))
  };
}


function metricValue(data, metricName, valueName, fallback = 0) {
  const value = Number(data?.metrics?.[metricName]?.values?.[valueName]);
  return Number.isFinite(value) ? value : fallback;
}

function metricCount(data, metricName) {
  return Math.max(0, Math.trunc(metricValue(data, metricName, 'count', 0)));
}

function summaryPayload(data) {
  const duration = data?.state?.testRunDurationMs ?? data?.state?.test_run_duration_ms ?? null;
  return {
    session_id: SESSION_ID,
    vus_configured: VUS,
    vus_max: Math.max(0, Math.trunc(metricValue(data, 'vus_max', 'max', VUS))),
    duration_ms: duration == null ? null : Math.max(0, Number(duration) || 0),
    requests: metricCount(data, 'mantto_load_requests'),
    failed: metricCount(data, 'mantto_load_failed'),
    rps: Math.max(0, metricValue(data, 'mantto_load_requests', 'rate', 0)),
    latency: {
      min: metricValue(data, 'mantto_load_duration', 'min', 0),
      avg: metricValue(data, 'mantto_load_duration', 'avg', 0),
      p50: metricValue(data, 'mantto_load_duration', 'med', 0),
      p90: metricValue(data, 'mantto_load_duration', 'p(90)', 0),
      p95: metricValue(data, 'mantto_load_duration', 'p(95)', 0),
      p99: metricValue(data, 'mantto_load_duration', 'p(99)', 0),
      max: metricValue(data, 'mantto_load_duration', 'max', 0)
    },
    http: {
      '2xx': metricCount(data, 'mantto_http_2xx'),
      '3xx': metricCount(data, 'mantto_http_3xx'),
      '4xx': metricCount(data, 'mantto_http_4xx'),
      '5xx': metricCount(data, 'mantto_http_5xx')
    },
    timeouts: metricCount(data, 'mantto_timeouts'),
    network_errors: metricCount(data, 'mantto_network_errors'),
    iterations_completed: Math.max(0, Math.trunc(metricValue(data, 'iterations', 'count', 0))),
    // k6 no expone en el resumen final un contador equivalente a exec.instance.iterationsInterrupted.
    // dropped_iterations tiene otra semantica; no se presenta como si fueran iteraciones interrumpidas.
    iterations_interrupted: null
  };
}

export default function(data) {
  runnerHeartbeat(data);

  const requests = SCENARIOS[SCENARIO].requests;
  const index = exec.scenario.iterationInInstance % requests.length;
  const request = requests[index];

  if (!request || !['GET', 'HEAD'].includes(request.method)) {
    abortRun(data, 'RUNNER_CATALOG_METHOD_INVALID', 'El catalogo local contiene un metodo no permitido para carga funcional.');
  }

  const response = http.request(
    request.method,
    `${trustedOrigin}${request.path}`,
    null,
    {
      redirects: 0,
      responseType: 'none',
      timeout: '10s',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${TEST_JWT}`,
        'X-Mantto-Load-Test': SESSION_ID,
        'X-Mantto-Load-Test-Token': data.runnerToken,
        'X-Mantto-Load-Test-Instance': data.processInstanceId,
        'User-Agent': 'Mantto-Gestor-Load-Test-V001'
      },
      tags: {
        traffic: 'load-test-readonly',
        scenario: SCENARIO,
        endpoint: request.path
      }
    }
  );

  // Cada VU puede confirmar la detencion aunque el VU 1 este esperando una
  // respuesta lenta y no pueda consultar el canal de control a tiempo.
  if (responseHeader(response, 'X-Mantto-Load-Test-Stop') === '1') {
    exec.test.abort('La sesion fue detenida por Mantto Gestor.');
  }

  loadRequests.add(1);
  loadDuration.add(Math.max(0, Number(response?.timings?.duration || 0)));
  const status = Number(response?.status || 0);
  if (status >= 200 && status < 300) http2xx.add(1);
  else if (status >= 300 && status < 400) http3xx.add(1);
  else if (status >= 400 && status < 500) http4xx.add(1);
  else if (status >= 500 && status < 600) http5xx.add(1);
  if (status < 200 || status >= 300) loadFailed.add(1);
  if (!response || status === 0) networkErrors.add(1);
  const responseError = clean(response?.error).toLowerCase();
  if (responseError.includes('timeout') || Number(response?.error_code) === 1050) timeouts.add(1);

  if (response && response.status >= 300 && response.status < 400) {
    abortRun(data, 'RUNNER_REDIRECT_REJECTED', `Redireccion rechazada en ${request.path}.`);
  }

  if (!response || response.status === 0) {
    consecutiveNetworkFailures += 1;
    if (consecutiveNetworkFailures >= 3) {
      abortRun(data, 'RUNNER_NETWORK_FAILURES', 'Se detectaron fallos de red consecutivos; se aborta para proteger Produccion.');
    }
  } else {
    consecutiveNetworkFailures = 0;
  }

  const returnedInstance = responseHeader(response, 'X-Mantto-Load-Test-Instance');
  if (returnedInstance && returnedInstance !== data.processInstanceId) {
    abortRun(data, 'RUNNER_INSTANCE_MISMATCH', 'La solicitud llego a otro proceso backend. V001 exige una sola instancia/proceso.');
  }

  check(response, {
    'HTTP 2xx': r => r.status >= 200 && r.status < 300,
    'misma instancia backend': r => responseHeader(r, 'X-Mantto-Load-Test-Instance') === data.processInstanceId
  });

  runnerHeartbeat(data);
  controlledSleep(Number(request.think_seconds || 1), data);
}

export function teardown(data) {
  if (!data?.runnerToken) return;
  try {
    http.post(
      `${trustedOrigin}/api/panel-control/prueba-carga/session/${encodeURIComponent(SESSION_ID)}/runner-finish`,
      JSON.stringify({ reason: 'RUNNER_TEARDOWN_PHASE5' }),
      runnerParams(data.runnerToken, 'none', { 'Content-Type': 'application/json' })
    );
  } catch (_error) {
    // Si no puede confirmar cierre, el backend agotara su timeout y marcara la ejecucion como incompleta.
  }
}


export function handleSummary(data, setupData) {
  const token = clean(setupData?.runnerToken);
  if (!token) {
    console.error('No se pudo enviar el resumen final: falta el token efimero del runner en setupData.');
    return {};
  }

  const payload = summaryPayload(data);
  try {
    const response = http.post(
      `${trustedOrigin}/api/panel-control/prueba-carga/session/${encodeURIComponent(SESSION_ID)}/runner-summary`,
      JSON.stringify(payload),
      { ...runnerParams(token, 'text', { 'Content-Type': 'application/json' }), timeout: '10s' }
    );
    abortIfRedirect(response, 'runner-summary');
    if (!response || response.status < 200 || response.status >= 300) {
      console.error(`No se pudo enviar el resumen final a Mantto Gestor. HTTP ${response ? response.status : 'N/D'}.`);
    }
  } catch (error) {
    console.error(`No se pudo enviar el resumen final a Mantto Gestor: ${String(error || 'error desconocido')}`);
  }

  // No se escribe archivo local, no se imprime el resumen y no se expone ningun secreto.
  return {};
}

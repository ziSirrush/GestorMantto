// [Aster | 2026-08-12 | ASTER-MG | PATCH: FASE_3_BACKEND_M2M_ACTIVACION_V001]

const crypto = require('crypto');

const BASE_URL = String(
  process.env.M2M_BASE_URL ||
    'https://mantto-gestor-api-a4hwfpgvbeb4gmgj.mexicocentral-01.azurewebsites.net'
).replace(/\/$/, '');

const HEADER_ID = process.env.INTEGRATION_HEADER_ID || 'X-Integration-Id';
const HEADER_TIMESTAMP = process.env.INTEGRATION_HEADER_TIMESTAMP || 'X-Integration-Timestamp';
const HEADER_SIGNATURE = process.env.INTEGRATION_HEADER_SIGNATURE || 'X-Integration-Signature';
const ALGORITHM = String(process.env.INTEGRATION_HMAC_ALGORITHM || 'sha256').toLowerCase();

const integrations = [
  {
    name: 'FL',
    path: '/api/ins-fl/sync',
    idEnv: 'INTEGRATION_INS_FL_ID',
    secretEnv: 'INTEGRATION_INS_FL_SECRET'
  },
  {
    name: 'Tickets',
    path: '/api/tickets/sync',
    idEnv: 'INTEGRATION_TICKETS_ID',
    secretEnv: 'INTEGRATION_TICKETS_SECRET'
  },
  {
    name: 'Portafolio',
    path: '/api/portafolio/sync',
    idEnv: 'INTEGRATION_PORTAFOLIO_ID',
    secretEnv: 'INTEGRATION_PORTAFOLIO_SECRET'
  },
  {
    name: 'Logistica',
    path: '/api/logistica/sync',
    idEnv: 'INTEGRATION_LOGISTICA_ID',
    secretEnv: 'INTEGRATION_LOGISTICA_SECRET'
  },
  {
    name: 'Instalaciones Drive',
    path: '/api/instalaciones/drive/carpetas/sync',
    idEnv: 'INTEGRATION_INSTALACIONES_DRIVE_ID',
    secretEnv: 'INTEGRATION_INSTALACIONES_DRIVE_SECRET'
  },
  {
    name: 'Ventas',
    path: '/api/ventas/clientes/sync',
    idEnv: 'INTEGRATION_VENTAS_ID',
    secretEnv: 'INTEGRATION_VENTAS_SECRET'
  }
];

const SAFE_BODY = JSON.stringify({ registros: [] });

function sign(timestamp, path, body, secret) {
  const canonical = `${timestamp}\nPOST\n${path}\n${body}`;
  return crypto.createHmac(ALGORITHM, secret).update(canonical, 'utf8').digest('hex');
}

async function post(path, headers = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...headers
    },
    body: SAFE_BODY
  });

  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (_) {
    // El cuerpo puede no ser JSON si el controlador rechaza el payload vacio.
  }

  return {
    status: response.status,
    code: json && json.code ? json.code : null,
    body: text
  };
}

function result(ok, label, result, note = '') {
  const mark = ok ? 'OK' : 'FAIL';
  const code = result && result.code ? ` | ${result.code}` : '';
  const status = result ? `HTTP ${result.status}${code}` : '';
  console.log(`${mark.padEnd(4)} ${label.padEnd(42)} ${status} ${note}`.trim());
  return ok;
}

async function validateIntegration(integration) {
  const integrationId = String(process.env[integration.idEnv] || '').trim();
  const secret = String(process.env[integration.secretEnv] || '').trim();

  console.log(`\n=== ${integration.name} ===`);
  console.log(`${integration.path}`);

  let allOk = true;

  const missing = await post(integration.path);
  allOk = result(
    missing.status === 401 && missing.code === 'INTEGRATION_AUTH_HEADERS_MISSING',
    'Sin headers debe bloquear',
    missing
  ) && allOk;

  const unknown = await post(integration.path, {
    [HEADER_ID]: '__integration_invalida__',
    [HEADER_TIMESTAMP]: String(Math.floor(Date.now() / 1000)),
    [HEADER_SIGNATURE]: '0'.repeat(64)
  });
  allOk = result(
    unknown.status === 401 && unknown.code === 'INTEGRATION_AUTH_UNKNOWN_ID',
    'Integration ID desconocido debe bloquear',
    unknown
  ) && allOk;

  if (!integrationId) {
    result(false, `Falta ${integration.idEnv}`, { status: 0, code: null }, 'Pruebas restantes omitidas.');
    return false;
  }

  const staleTimestamp = String(Math.floor(Date.now() / 1000) - 3600);
  const stale = await post(integration.path, {
    [HEADER_ID]: integrationId,
    [HEADER_TIMESTAMP]: staleTimestamp,
    [HEADER_SIGNATURE]: '0'.repeat(64)
  });
  allOk = result(
    stale.status === 401 && stale.code === 'INTEGRATION_AUTH_EXPIRED_TIMESTAMP',
    'Timestamp vencido debe bloquear',
    stale
  ) && allOk;

  const invalidTimestamp = String(Math.floor(Date.now() / 1000));
  const invalidSignature = await post(integration.path, {
    [HEADER_ID]: integrationId,
    [HEADER_TIMESTAMP]: invalidTimestamp,
    [HEADER_SIGNATURE]: '0'.repeat(64)
  });
  allOk = result(
    invalidSignature.status === 401 && invalidSignature.code === 'INTEGRATION_AUTH_INVALID_SIGNATURE',
    'Firma incorrecta debe bloquear',
    invalidSignature
  ) && allOk;

  if (!secret) {
    console.log(`SKIP Firma valida: falta ${integration.secretEnv} en el entorno local.`);
    return allOk;
  }

  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = sign(timestamp, integration.path, SAFE_BODY, secret);
  const valid = await post(integration.path, {
    [HEADER_ID]: integrationId,
    [HEADER_TIMESTAMP]: timestamp,
    [HEADER_SIGNATURE]: signature
  });

  /*
   * El payload deliberadamente esta vacio para evitar mutaciones.
   * Cualquier respuesta distinta de 401/403/404 confirma que el guard HMAC
   * permitio pasar la solicitud hacia el controlador.
   */
  const authAccepted = ![401, 403, 404].includes(valid.status);
  allOk = result(
    authAccepted,
    'Firma valida debe superar el guard',
    valid,
    authAccepted ? '(el controlador puede responder 2xx/4xx por payload vacio)' : ''
  ) && allOk;

  return allOk;
}

async function main() {
  console.log('Mantto Gestor - Validacion M2M/HMAC Fase 3');
  console.log(`Backend: ${BASE_URL}`);
  console.log(`Algoritmo: ${ALGORITHM}`);
  console.log('IMPORTANTE: ejecutar solo despues de activar INTEGRATION_AUTH_ENABLED=true y reiniciar Azure.');

  let allOk = true;

  for (const integration of integrations) {
    try {
      const ok = await validateIntegration(integration);
      allOk = ok && allOk;
    } catch (error) {
      allOk = false;
      console.error(`FAIL ${integration.name}: ${error.message}`);
    }
  }

  console.log('\n=== RESULTADO GLOBAL ===');
  console.log(allOk ? 'OK - Controles M2M verificados.' : 'FAIL - Revisar resultados anteriores.');
  process.exitCode = allOk ? 0 : 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

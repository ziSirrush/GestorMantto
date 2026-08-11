// [Aster | 2026-08-11 | ASTER-MG | PATCH: FIX_INTEGRATION_AUTH_V001]
const crypto = require('crypto');

function isEnabled(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function env(name, fallback = '') {
  const value = process.env[name];
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).trim();
}

function getHeaderName(envName, fallback) {
  return env(envName, fallback);
}

function readHeader(req, headerName) {
  if (!headerName) return '';
  return String(req.get(headerName) || '').trim();
}

function integrationMap() {
  return [
    {
      key: 'tickets',
      id: env('INTEGRATION_TICKETS_ID'),
      secret: env('INTEGRATION_TICKETS_SECRET')
    },
    {
      key: 'portafolio',
      id: env('INTEGRATION_PORTAFOLIO_ID'),
      secret: env('INTEGRATION_PORTAFOLIO_SECRET')
    },
    {
      key: 'ins_fl',
      id: env('INTEGRATION_INS_FL_ID'),
      secret: env('INTEGRATION_INS_FL_SECRET')
    },
    {
      key: 'logistica',
      id: env('INTEGRATION_LOGISTICA_ID'),
      secret: env('INTEGRATION_LOGISTICA_SECRET')
    },
    {
      key: 'instalaciones_drive',
      id: env('INTEGRATION_INSTALACIONES_DRIVE_ID'),
      secret: env('INTEGRATION_INSTALACIONES_DRIVE_SECRET')
    },
    {
      key: 'ventas',
      id: env('INTEGRATION_VENTAS_ID'),
      secret: env('INTEGRATION_VENTAS_SECRET')
    }
  ].filter(item => item.id);
}

function safeEqualHex(left, right) {
  const a = Buffer.from(String(left || '').toLowerCase(), 'utf8');
  const b = Buffer.from(String(right || '').toLowerCase(), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function normalizeTimestamp(value) {
  const raw = String(value || '').trim();
  if (!/^\d{10,13}$/.test(raw)) return null;

  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return null;

  return raw.length === 13 ? Math.floor(numeric / 1000) : numeric;
}

function buildSignedPayload(req, timestamp) {
  const method = String(req.method || '').toUpperCase();
  const originalUrl = String(req.originalUrl || req.url || '');
  const rawBody = Buffer.isBuffer(req.rawBody)
    ? req.rawBody
    : Buffer.from(req.rawBody || '', 'utf8');

  const prefix = Buffer.from(`${timestamp}\n${method}\n${originalUrl}\n`, 'utf8');
  return Buffer.concat([prefix, rawBody]);
}

function calculateSignature(req, timestamp, secret) {
  const algorithm = env('INTEGRATION_HMAC_ALGORITHM', 'sha256').toLowerCase();
  const supported = new Set(['sha256', 'sha384', 'sha512']);

  if (!supported.has(algorithm)) {
    const error = new Error(`Algoritmo HMAC no soportado: ${algorithm}`);
    error.code = 'INTEGRATION_HMAC_ALGORITHM_INVALID';
    throw error;
  }

  return crypto
    .createHmac(algorithm, secret)
    .update(buildSignedPayload(req, timestamp))
    .digest('hex');
}

function reject(res, status, code, message) {
  return res.status(status).json({
    ok: false,
    code,
    message
  });
}

function requireIntegrationAuth(req, res, next) {
  const authEnabled = isEnabled(process.env.INTEGRATION_AUTH_ENABLED, false);

  if (!authEnabled) {
    req.integrationAuth = {
      enabled: false,
      authenticated: false,
      bypassed: true
    };
    return next();
  }

  const headerId = getHeaderName('INTEGRATION_HEADER_ID', 'X-Integration-Id');
  const headerTimestamp = getHeaderName('INTEGRATION_HEADER_TIMESTAMP', 'X-Integration-Timestamp');
  const headerSignature = getHeaderName('INTEGRATION_HEADER_SIGNATURE', 'X-Integration-Signature');

  const integrationId = readHeader(req, headerId);
  const timestampRaw = readHeader(req, headerTimestamp);
  const signature = readHeader(req, headerSignature);

  if (!integrationId || !timestampRaw || !signature) {
    return reject(
      res,
      401,
      'INTEGRATION_AUTH_MISSING_HEADERS',
      'Faltan encabezados de autenticacion de integracion.'
    );
  }

  const integration = integrationMap().find(item => item.id === integrationId);
  if (!integration || !integration.secret) {
    return reject(
      res,
      401,
      'INTEGRATION_AUTH_INVALID_ID',
      'Integracion no reconocida o sin secreto configurado.'
    );
  }

  const timestamp = normalizeTimestamp(timestampRaw);
  if (!timestamp) {
    return reject(
      res,
      401,
      'INTEGRATION_AUTH_INVALID_TIMESTAMP',
      'Timestamp de integracion invalido.'
    );
  }

  const toleranceSeconds = Math.max(
    0,
    Number.parseInt(env('INTEGRATION_TIMESTAMP_TOLERANCE_SECONDS', '300'), 10) || 300
  );
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) {
    return reject(
      res,
      401,
      'INTEGRATION_AUTH_TIMESTAMP_EXPIRED',
      'Timestamp fuera de la ventana permitida.'
    );
  }

  let expectedSignature;
  try {
    expectedSignature = calculateSignature(req, timestampRaw, integration.secret);
  } catch (error) {
    return reject(
      res,
      500,
      error.code || 'INTEGRATION_AUTH_CONFIGURATION_ERROR',
      'Configuracion de autenticacion de integracion invalida.'
    );
  }

  if (!safeEqualHex(signature, expectedSignature)) {
    return reject(
      res,
      401,
      'INTEGRATION_AUTH_INVALID_SIGNATURE',
      'Firma de integracion invalida.'
    );
  }

  req.integrationAuth = {
    enabled: true,
    authenticated: true,
    bypassed: false,
    integrationKey: integration.key,
    integrationId,
    timestamp
  };

  return next();
}

module.exports = {
  requireIntegrationAuth,
  calculateSignature,
  buildSignedPayload
};

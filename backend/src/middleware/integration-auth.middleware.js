// [Aster | 2026-08-12 | ASTER-MG | PATCH: FASE_2_BACKEND_M2M_GUARDS_V001]
// [Aster | 2026-08-12 | ASTER-MG | FASE: COBRANZA_UNI_BACKEND_V001]

const crypto = require('crypto');

const SUPPORTED_ALGORITHMS = new Set(['sha256', 'sha384', 'sha512']);

function enabled(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function getHeaderName(envName, fallback) {
  return String(process.env[envName] || fallback).trim();
}

function getHeader(req, headerName) {
  const value = req.get(headerName);
  return value === undefined || value === null ? '' : String(value).trim();
}

function getIntegrationSecrets() {
  return new Map([
    [process.env.INTEGRATION_TICKETS_ID, process.env.INTEGRATION_TICKETS_SECRET],
    [process.env.INTEGRATION_PORTAFOLIO_ID, process.env.INTEGRATION_PORTAFOLIO_SECRET],
    [process.env.INTEGRATION_INS_FL_ID, process.env.INTEGRATION_INS_FL_SECRET],
    [process.env.INTEGRATION_LOGISTICA_ID, process.env.INTEGRATION_LOGISTICA_SECRET],
    [process.env.INTEGRATION_INSTALACIONES_DRIVE_ID, process.env.INTEGRATION_INSTALACIONES_DRIVE_SECRET],
    [process.env.INTEGRATION_VENTAS_ID, process.env.INTEGRATION_VENTAS_SECRET],
    [process.env.INTEGRATION_COBRANZA_UNI_ID, process.env.INTEGRATION_COBRANZA_UNI_SECRET]
  ].filter(([integrationId, secret]) => integrationId && secret));
}

function parseTimestamp(value) {
  if (!/^\d{10}(?:\d{3})?$/.test(value)) return null;

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;

  return value.length === 13
    ? Math.floor(numeric / 1000)
    : numeric;
}

function safeHexEqual(receivedHex, expectedHex) {
  if (!/^[a-fA-F0-9]+$/.test(receivedHex || '')) return false;
  if (receivedHex.length !== expectedHex.length) return false;

  const received = Buffer.from(receivedHex, 'hex');
  const expected = Buffer.from(expectedHex, 'hex');

  if (received.length !== expected.length) return false;
  return crypto.timingSafeEqual(received, expected);
}

function authError(res, message, code) {
  return res.status(401).json({
    ok: false,
    message,
    code
  });
}

function isIntegrationAuthEnabled() {
  return enabled(process.env.INTEGRATION_AUTH_ENABLED, false);
}

function runMiddlewareChain(middlewares, req, res, next, index = 0) {
  if (!Array.isArray(middlewares) || index >= middlewares.length) {
    return next();
  }

  const middleware = middlewares[index];
  if (typeof middleware !== 'function') {
    return runMiddlewareChain(middlewares, req, res, next, index + 1);
  }

  return middleware(req, res, (error) => {
    if (error) return next(error);
    return runMiddlewareChain(middlewares, req, res, next, index + 1);
  });
}

/**
 * Middleware de autenticacion para integraciones maquina-a-maquina.
 *
 * Canonico firmado:
 * timestamp + "\\n" + METHOD + "\\n" + originalUrl + "\\n" + rawBody
 *
 * FASE 1:
 * - El middleware se incorpora al backend, pero aun NO se monta en rutas.
 * - INTEGRATION_AUTH_ENABLED=false mantiene bypass para el despliegue inicial.
 * - La proteccion persistente contra replay queda fuera de esta fase; por ahora
 *   se valida la ventana temporal configurada.
 */
function requireIntegrationAuth(req, res, next) {
  if (!isIntegrationAuthEnabled()) {
    return next();
  }

  const idHeader = getHeaderName('INTEGRATION_HEADER_ID', 'X-Integration-Id');
  const timestampHeader = getHeaderName('INTEGRATION_HEADER_TIMESTAMP', 'X-Integration-Timestamp');
  const signatureHeader = getHeaderName('INTEGRATION_HEADER_SIGNATURE', 'X-Integration-Signature');

  const integrationId = getHeader(req, idHeader);
  const timestampRaw = getHeader(req, timestampHeader);
  const signature = getHeader(req, signatureHeader);

  if (!integrationId || !timestampRaw || !signature) {
    return authError(res, 'Faltan encabezados de autenticacion de integracion.', 'INTEGRATION_AUTH_HEADERS_MISSING');
  }

  const secrets = getIntegrationSecrets();
  const secret = secrets.get(integrationId);

  if (!secret) {
    return authError(res, 'Integracion no autorizada.', 'INTEGRATION_AUTH_UNKNOWN_ID');
  }

  const timestampSeconds = parseTimestamp(timestampRaw);
  if (timestampSeconds === null) {
    return authError(res, 'Timestamp de integracion invalido.', 'INTEGRATION_AUTH_INVALID_TIMESTAMP');
  }

  const toleranceSeconds = Math.max(
    1,
    Number(process.env.INTEGRATION_TIMESTAMP_TOLERANCE_SECONDS || 300) || 300
  );
  const nowSeconds = Math.floor(Date.now() / 1000);

  if (Math.abs(nowSeconds - timestampSeconds) > toleranceSeconds) {
    return authError(res, 'Timestamp de integracion fuera de la ventana permitida.', 'INTEGRATION_AUTH_EXPIRED_TIMESTAMP');
  }

  const algorithm = String(process.env.INTEGRATION_HMAC_ALGORITHM || 'sha256').trim().toLowerCase();
  if (!SUPPORTED_ALGORITHMS.has(algorithm)) {
    const error = new Error(`Algoritmo HMAC no soportado: ${algorithm}`);
    error.statusCode = 500;
    error.expose = false;
    return next(error);
  }

  const rawBody = Buffer.isBuffer(req.rawBody)
    ? req.rawBody
    : Buffer.alloc(0);

  const maxBodyBytes = Number(process.env.INTEGRATION_MAX_BODY_BYTES || 12582912);
  if (Number.isFinite(maxBodyBytes) && maxBodyBytes > 0 && rawBody.length > maxBodyBytes) {
    return res.status(413).json({
      ok: false,
      message: 'El cuerpo de la integracion excede el limite permitido.',
      code: 'INTEGRATION_AUTH_BODY_TOO_LARGE'
    });
  }

  const canonicalPrefix = Buffer.from(
    `${timestampRaw}\n${String(req.method || '').toUpperCase()}\n${req.originalUrl}\n`,
    'utf8'
  );
  const canonical = Buffer.concat([canonicalPrefix, rawBody]);

  const expectedSignature = crypto
    .createHmac(algorithm, secret)
    .update(canonical)
    .digest('hex');

  if (!safeHexEqual(signature, expectedSignature)) {
    return authError(res, 'Firma de integracion invalida.', 'INTEGRATION_AUTH_INVALID_SIGNATURE');
  }

  req.integrationAuth = Object.freeze({
    integrationId,
    timestamp: timestampSeconds,
    algorithm
  });

  return next();
}

/**
 * Protege una ruta para una identidad M2M concreta.
 *
 * whenDisabled permite conservar exactamente el comportamiento previo de una
 * ruta durante el despliegue de Fase 2 con INTEGRATION_AUTH_ENABLED=false.
 * Ejemplo: imports historicos de Ventas conservan requireAuth +
 * requireHistoricalSyncEnabled hasta que Fase 3 active HMAC.
 */
function requireIntegrationAuthFor(expectedIntegrationIdEnvName, options = {}) {
  const disabledMiddlewares = Array.isArray(options.whenDisabled)
    ? options.whenDisabled.filter((middleware) => typeof middleware === 'function')
    : [];

  return function integrationAuthForRoute(req, res, next) {
    if (!isIntegrationAuthEnabled()) {
      return runMiddlewareChain(disabledMiddlewares, req, res, next);
    }

    return requireIntegrationAuth(req, res, (error) => {
      if (error) return next(error);

      const expectedIntegrationId = String(
        process.env[expectedIntegrationIdEnvName] || ''
      ).trim();

      if (!expectedIntegrationId) {
        const configError = new Error(
          `Falta configurar ${expectedIntegrationIdEnvName} para la ruta M2M.`
        );
        configError.statusCode = 500;
        configError.expose = false;
        return next(configError);
      }

      if (req.integrationAuth?.integrationId !== expectedIntegrationId) {
        return authError(
          res,
          'La identidad de integracion no esta autorizada para esta ruta.',
          'INTEGRATION_AUTH_WRONG_ROUTE_ID'
        );
      }

      return next();
    });
  };
}

module.exports = {
  requireIntegrationAuth,
  requireIntegrationAuthFor,
  isIntegrationAuthEnabled
};

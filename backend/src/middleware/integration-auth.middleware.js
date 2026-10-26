'use strict';

// [Aster | 2026-10-19 | ASTER-MG | ALMACEN NS FASE 2 M2M HMAC V001]
// [Aster | 2026-10-19 | ASTER-MG | FIX ALMACEN ID M2M SECRET EXISTENTE V001]
// Se conserva el contrato M2M existente y se agrega autenticacion forzosa
// por ruta: la sincronizacion de Almacen NUNCA hereda un bypass global.
// El comportamiento de las rutas M2M anteriores no cambia por defecto.

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
    [process.env.INTEGRATION_COBRANZA_UNI_ID, process.env.INTEGRATION_COBRANZA_UNI_SECRET],
    // Credencial independiente: NetSuite no utiliza secretos de GAS.
    [process.env.INTEGRATION_NETSUITE_ID, process.env.INTEGRATION_NETSUITE_SECRET],
    // Solo la identidad configurada para Almacen puede escribir en sus lotes.
    // Almacen usa el secreto YA existente en Azure. El ID no es una variable secreta.
    ['almacen-appscript', process.env.INTEGRATION_ALMACEN_SECRET]
  ].filter(([integrationId, secret]) => integrationId && secret));
}

function parseTimestamp(value) {
  if (!/^\d{10}(?:\d{3})?$/.test(value)) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return value.length === 13 ? Math.floor(numeric / 1000) : numeric;
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
  return res.status(401).json({ ok: false, message, code });
}

function isIntegrationAuthEnabled() {
  return enabled(process.env.INTEGRATION_AUTH_ENABLED, false);
}

function runMiddlewareChain(middlewares, req, res, next, index = 0) {
  if (!Array.isArray(middlewares) || index >= middlewares.length) return next();
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
 * Canonico: timestamp + '\n' + METHOD + '\n' + originalUrl + '\n' + rawBody
 * El flag global historico mantiene su semantica salvo forceEnabled=true.
 * La proteccion contra replay depende de la ventana temporal; el servicio
 * de Almacen agrega idempotencia durable por lote/pagina/hash.
 */
function requireIntegrationAuth(req, res, next, options = {}) {
  if (!isIntegrationAuthEnabled() && options.forceEnabled !== true) return next();

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
  if (!secret) return authError(res, 'Integracion no autorizada.', 'INTEGRATION_AUTH_UNKNOWN_ID');
  const timestampSeconds = parseTimestamp(timestampRaw);
  if (timestampSeconds === null) return authError(res, 'Timestamp de integracion invalido.', 'INTEGRATION_AUTH_INVALID_TIMESTAMP');
  const toleranceSeconds = Math.max(1, Number(process.env.INTEGRATION_TIMESTAMP_TOLERANCE_SECONDS || 300) || 300);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestampSeconds) > toleranceSeconds) {
    return authError(res, 'Timestamp de integracion fuera de la ventana permitida.', 'INTEGRATION_AUTH_EXPIRED_TIMESTAMP');
  }

  const algorithm = String(options.algorithm || process.env.INTEGRATION_HMAC_ALGORITHM || 'sha256').trim().toLowerCase();
  if (!SUPPORTED_ALGORITHMS.has(algorithm)) {
    const error = new Error(`Algoritmo HMAC no soportado: ${algorithm}`);
    error.statusCode = 500;
    error.expose = false;
    return next(error);
  }
  const rawBody = Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.alloc(0);
  const maxBodyBytes = Number(process.env.INTEGRATION_MAX_BODY_BYTES || 12582912);
  if (Number.isFinite(maxBodyBytes) && maxBodyBytes > 0 && rawBody.length > maxBodyBytes) {
    return res.status(413).json({ok:false,message:'El cuerpo de la integracion excede el limite permitido.',code:'INTEGRATION_AUTH_BODY_TOO_LARGE'});
  }
  const canonicalPrefix = Buffer.from(`${timestampRaw}\n${String(req.method || '').toUpperCase()}\n${req.originalUrl}\n`, 'utf8');
  const canonical = Buffer.concat([canonicalPrefix, rawBody]);
  const expectedSignature = crypto.createHmac(algorithm, secret).update(canonical).digest('hex');
  if (!safeHexEqual(signature, expectedSignature)) {
    return authError(res, 'Firma de integracion invalida.', 'INTEGRATION_AUTH_INVALID_SIGNATURE');
  }
  req.integrationAuth = Object.freeze({ integrationId, timestamp: timestampSeconds, algorithm });
  return next();
}

function requireIntegrationAuthFor(expectedIntegrationIdEnvName, options = {}) {
  const disabledMiddlewares = Array.isArray(options.whenDisabled)
    ? options.whenDisabled.filter(middleware => typeof middleware === 'function') : [];
  const alwaysRequireAuth = options.alwaysRequireAuth === true;

  return function integrationAuthForRoute(req, res, next) {
    if (!isIntegrationAuthEnabled() && !alwaysRequireAuth) {
      return runMiddlewareChain(disabledMiddlewares, req, res, next);
    }
    return requireIntegrationAuth(req, res, (error) => {
      if (error) return next(error);
      // Identidad fija exclusiva para Almacen; las otras integraciones siguen usando su variable de ID.
      const configuredId = options.expectedIntegrationId !== undefined
        ? options.expectedIntegrationId
        : (expectedIntegrationIdEnvName ? process.env[expectedIntegrationIdEnvName] : '');
      const expectedIntegrationId = String(configuredId || '').trim();
      if (!expectedIntegrationId) {
        const name = expectedIntegrationIdEnvName || 'identidad M2M';
        const configError = new Error(`Falta configurar ${name} para la ruta M2M.`);
        configError.statusCode = 500;
        configError.expose = false;
        return next(configError);
      }
      if (req.integrationAuth?.integrationId !== expectedIntegrationId) {
        return authError(res, 'La identidad de integracion no esta autorizada para esta ruta.', 'INTEGRATION_AUTH_WRONG_ROUTE_ID');
      }
      return next();
    }, { forceEnabled: alwaysRequireAuth, algorithm: options.algorithm });
  };
}

module.exports = { requireIntegrationAuth, requireIntegrationAuthFor, isIntegrationAuthEnabled };

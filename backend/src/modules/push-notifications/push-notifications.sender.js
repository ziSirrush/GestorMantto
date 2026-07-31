const crypto = require('crypto');

function base64UrlToBuffer(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(normalized + padding, 'base64');
}

function bufferToBase64Url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function getVapidConfig() {
  return {
    enabled: String(process.env.WEB_PUSH_ENABLED || '').toLowerCase() === 'true',
    publicKey: String(process.env.WEB_PUSH_VAPID_PUBLIC_KEY || '').trim(),
    privateKey: String(process.env.WEB_PUSH_VAPID_PRIVATE_KEY || '').trim(),
    subject: String(process.env.WEB_PUSH_SUBJECT || '').trim()
  };
}

function validateVapidConfig(config = getVapidConfig()) {
  if (!config.enabled) return { ok: false, reason: 'WEB_PUSH_ENABLED no esta activo.' };
  if (!config.publicKey || !config.privateKey || !config.subject) {
    return { ok: false, reason: 'Faltan WEB_PUSH_VAPID_PUBLIC_KEY, WEB_PUSH_VAPID_PRIVATE_KEY o WEB_PUSH_SUBJECT.' };
  }

  const publicKey = base64UrlToBuffer(config.publicKey);
  const privateKey = base64UrlToBuffer(config.privateKey);
  if (publicKey.length !== 65 || publicKey[0] !== 4 || privateKey.length !== 32) {
    return { ok: false, reason: 'Las claves VAPID no tienen el formato P-256 esperado.' };
  }

  return { ok: true };
}

function createVapidJwt(endpoint, config = getVapidConfig()) {
  const endpointUrl = new URL(endpoint);
  const audience = `${endpointUrl.protocol}//${endpointUrl.host}`;
  const publicKey = base64UrlToBuffer(config.publicKey);
  const privateKey = base64UrlToBuffer(config.privateKey);

  const x = publicKey.subarray(1, 33);
  const y = publicKey.subarray(33, 65);
  const privateJwk = {
    kty: 'EC',
    crv: 'P-256',
    x: bufferToBase64Url(x),
    y: bufferToBase64Url(y),
    d: bufferToBase64Url(privateKey)
  };

  const header = bufferToBase64Url(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = bufferToBase64Url(Buffer.from(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + (12 * 60 * 60),
    sub: config.subject
  })));
  const unsignedToken = `${header}.${payload}`;
  const key = crypto.createPrivateKey({ key: privateJwk, format: 'jwk' });
  const signature = crypto.sign('sha256', Buffer.from(unsignedToken), {
    key,
    dsaEncoding: 'ieee-p1363'
  });

  return `${unsignedToken}.${bufferToBase64Url(signature)}`;
}

async function sendEmptyPush(endpoint, options = {}) {
  const config = getVapidConfig();
  const validation = validateVapidConfig(config);
  if (!validation.ok) {
    const error = new Error(validation.reason);
    error.code = 'WEB_PUSH_DISABLED';
    throw error;
  }

  const token = createVapidJwt(endpoint, config);
  const ttl = Math.max(0, Math.min(86400, Number(options.ttl || 120)));
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      TTL: String(ttl),
      Urgency: options.urgency || 'high',
      Authorization: `vapid t=${token}, k=${config.publicKey}`,
      'Content-Length': '0'
    },
    body: null,
    signal: AbortSignal.timeout(Number(process.env.WEB_PUSH_REQUEST_TIMEOUT_MS || 12000))
  });

  if (!response.ok) {
    const error = new Error(`El proveedor push respondio HTTP ${response.status}.`);
    error.statusCode = response.status;
    error.responseBody = await response.text().catch(() => '');
    throw error;
  }

  return { ok: true, statusCode: response.status };
}

module.exports = {
  getVapidConfig,
  validateVapidConfig,
  sendEmptyPush,
  base64UrlToBuffer,
  bufferToBase64Url
};

const crypto = require('crypto');

function base64UrlToBuffer(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(normalized + padding, 'base64');
}

function bufferToBase64Url(value) {
  return Buffer.from(value).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function getVapidConfig() {
  return {
    publicKey: String(process.env.WEB_PUSH_VAPID_PUBLIC_KEY || '').trim(),
    privateKey: String(process.env.WEB_PUSH_VAPID_PRIVATE_KEY || '').trim(),
    subject: String(process.env.WEB_PUSH_SUBJECT || '').trim()
  };
}

function validateVapidConfig(config = getVapidConfig()) {
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

function hkdfExtract(salt, ikm) {
  return crypto.createHmac('sha256', salt).update(ikm).digest();
}

function hkdfExpand(prk, info, length) {
  let output = Buffer.alloc(0);
  let previous = Buffer.alloc(0);
  let counter = 1;
  while (output.length < length) {
    previous = crypto.createHmac('sha256', prk)
      .update(Buffer.concat([previous, info, Buffer.from([counter])]))
      .digest();
    output = Buffer.concat([output, previous]);
    counter += 1;
  }
  return output.subarray(0, length);
}

function createVapidJwt(endpoint, config = getVapidConfig()) {
  const endpointUrl = new URL(endpoint);
  const audience = `${endpointUrl.protocol}//${endpointUrl.host}`;
  const publicKey = base64UrlToBuffer(config.publicKey);
  const privateKey = base64UrlToBuffer(config.privateKey);
  const privateJwk = {
    kty: 'EC', crv: 'P-256',
    x: bufferToBase64Url(publicKey.subarray(1, 33)),
    y: bufferToBase64Url(publicKey.subarray(33, 65)),
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
  const signature = crypto.sign('sha256', Buffer.from(unsignedToken), { key, dsaEncoding: 'ieee-p1363' });
  return `${unsignedToken}.${bufferToBase64Url(signature)}`;
}

function encryptPayload(subscription, payload) {
  const receiverPublicKey = base64UrlToBuffer(subscription.p256dh);
  const authSecret = base64UrlToBuffer(subscription.auth);
  if (receiverPublicKey.length !== 65 || receiverPublicKey[0] !== 4) throw new Error('p256dh no tiene formato P-256 valido.');
  if (authSecret.length < 16) throw new Error('auth no tiene longitud valida.');

  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const senderPublicKey = ecdh.getPublicKey();
  const sharedSecret = ecdh.computeSecret(receiverPublicKey);
  const authPrk = hkdfExtract(authSecret, sharedSecret);
  const keyInfo = Buffer.concat([
    Buffer.from('WebPush: info\0', 'utf8'),
    receiverPublicKey,
    senderPublicKey
  ]);
  const ikm = hkdfExpand(authPrk, keyInfo, 32);
  const salt = crypto.randomBytes(16);
  const prk = hkdfExtract(salt, ikm);
  const cek = hkdfExpand(prk, Buffer.from('Content-Encoding: aes128gcm\0', 'utf8'), 16);
  const nonce = hkdfExpand(prk, Buffer.from('Content-Encoding: nonce\0', 'utf8'), 12);
  const plaintext = Buffer.concat([Buffer.from(JSON.stringify(payload), 'utf8'), Buffer.from([2])]);
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  const recordSize = Buffer.alloc(4);
  recordSize.writeUInt32BE(4096, 0);
  return Buffer.concat([salt, recordSize, Buffer.from([senderPublicKey.length]), senderPublicKey, encrypted]);
}

async function sendPush(subscription, payload, options = {}) {
  const config = getVapidConfig();
  const validation = validateVapidConfig(config);
  if (!validation.ok) {
    const error = new Error(validation.reason);
    error.code = 'WEB_PUSH_DISABLED';
    throw error;
  }
  const body = encryptPayload(subscription, payload);
  const token = createVapidJwt(subscription.endpoint, config);
  const ttl = Math.max(0, Math.min(86400, Number(options.ttl || 120)));
  const response = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      TTL: String(ttl),
      Urgency: options.urgency || 'high',
      Authorization: `vapid t=${token}, k=${config.publicKey}`,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(body.length)
    },
    body,
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
  sendPush,
  base64UrlToBuffer,
  bufferToBase64Url
};

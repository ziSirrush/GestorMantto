'use strict';
// [Aster | 2026-10-29 | ASTER-MG | AST-04 WEB PUSH SSRF GUARD V001]
const net = require('node:net');

const PROVIDER_HOST_SUFFIXES = Object.freeze([
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'push.services.mozilla.com',
  'web.push.apple.com',
  'notify.windows.com'
]);

function isAllowedHost(hostname, suffixes = PROVIDER_HOST_SUFFIXES) {
  const host = String(hostname || '').toLowerCase();
  if (net.isIP(host)) return false;
  if (!/^[a-z0-9.-]+$/.test(host) || host.endsWith('.') || host.includes('..')) return false;
  const custom = String(process.env.WEB_PUSH_ALLOWED_HOSTS || '').split(',')
    .map(value => value.trim().toLowerCase()).filter(Boolean);
  // Los destinos personalizados requieren enumeracion EXACTA, sin comodines.
  return suffixes.some(suffix => host === suffix || host.endsWith('.' + suffix))
    || custom.includes(host);
}

function validatePushEndpoint(endpoint) {
  let url;
  try { url = new URL(String(endpoint || '')); }
  catch (_) { url = null; }
  if (!url || url.protocol !== 'https:' || url.username || url.password
      || url.port || url.hash || !isAllowedHost(url.hostname)) {
    const error = new Error('Destino de notificacion push no autorizado.');
    error.status = 400;
    error.code = 'PUSH_ENDPOINT_NOT_ALLOWED';
    throw error;
  }
  return url;
}

module.exports = { isAllowedHost, validatePushEndpoint };

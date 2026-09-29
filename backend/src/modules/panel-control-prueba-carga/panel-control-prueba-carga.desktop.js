'use strict';

function isClearlyMobile(headers = {}) {
  const read = name => String(headers[name] || headers[name.toLowerCase()] || '');
  const platform = read('sec-ch-ua-platform').replace(/"/g, '').toLowerCase();
  const ua = read('user-agent');
  return read('sec-ch-ua-mobile').trim() === '?1'
    || /^(android|ios|ipados)$/.test(platform)
    || /Android|iPhone|iPad|iPod|Mobile|Tablet|Silk|Kindle|PlayBook|IEMobile|Opera Mini/i.test(ua)
    || (/Macintosh/i.test(ua) && /Mobile/i.test(ua));
}

function desktopOnly(req, res, next) {
  if (isClearlyMobile(req.headers)) {
    return res.status(403).json({ ok: false, code: 'LOAD_TEST_DESKTOP_ONLY', message: 'Prueba de Carga está disponible únicamente desde una PC de escritorio o laptop.' });
  }
  return next();
}

module.exports = { isClearlyMobile, desktopOnly };

'use strict';

const buckets = new Map();

function normalizeEmail(req) {
  return String(req.body && req.body.correo || '').trim().toLowerCase().slice(0, 254);
}

function clientKey(req) {
  const ip = String(req.ip || req.socket?.remoteAddress || 'unknown').slice(0, 96);
  const email = normalizeEmail(req) || 'no-email';
  return `${ip}|${email}`;
}

function pruneExpired(now) {
  if (buckets.size < 2000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }

  // Mantener el consumo de memoria acotado aun ante claves distribuidas.
  while (buckets.size >= 5000) {
    const oldestKey = buckets.keys().next().value;
    if (oldestKey === undefined) break;
    buckets.delete(oldestKey);
  }
}

function createRateLimit({ name, windowMs, max }) {
  return function rateLimit(req, res, next) {
    const now = Date.now();
    pruneExpired(now);

    const key = `${name}|${clientKey(req)}`;
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    if (bucket.count <= max) return next();

    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    res.set('Retry-After', String(retryAfterSeconds));
    return res.status(429).json({
      ok: false,
      code: 'AUTH_RATE_LIMITED',
      message: 'Demasiados intentos. Espera unos minutos antes de volver a intentarlo.',
      retry_after_seconds: retryAfterSeconds
    });
  };
}

const loginRateLimit = createRateLimit({
  name: 'login',
  windowMs: 15 * 60 * 1000,
  max: 10
});

const recoveryRateLimit = createRateLimit({
  name: 'recovery',
  windowMs: 15 * 60 * 1000,
  max: 5
});

module.exports = {
  createRateLimit,
  loginRateLimit,
  recoveryRateLimit
};

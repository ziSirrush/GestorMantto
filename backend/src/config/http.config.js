function parseAllowedOrigins() {
  const raw = process.env.CORS_ORIGINS || '*';

  if (raw.trim() === '*') {
    return '*';
  }

  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function isPrivateIpv4(hostname) {
  const parts = String(hostname || '')
    .split('.')
    .map(Number);

  if (
    parts.length !== 4 ||
    parts.some((part) =>
      !Number.isInteger(part) ||
      part < 0 ||
      part > 255
    )
  ) {
    return false;
  }

  return (
    parts[0] === 10 ||
    (parts[0] === 172 &&
      parts[1] >= 16 &&
      parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168)
  );
}

function isDevelopmentOrigin(origin) {
  if (process.env.NODE_ENV === 'production') {
    return false;
  }

  try {
    const parsed = new URL(origin);
    const hostname = parsed.hostname;

    return (
      parsed.protocol === 'http:' &&
      (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '::1' ||
        isPrivateIpv4(hostname)
      )
    );
  } catch (error) {
    return false;
  }
}

function getCorsOptions() {
  const allowedOrigins = parseAllowedOrigins();

  if (allowedOrigins === '*') {
    return { origin: true, credentials: false };
  }

  return {
    credentials: true,
    origin(origin, callback) {
      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        isDevelopmentOrigin(origin)
      ) {
        return callback(null, true);
      }

      const error = new Error(
        `Origen no permitido por CORS: ${origin}`
      );
      error.statusCode = 403;
      return callback(error);
    }
  };
}

module.exports = { getCorsOptions };

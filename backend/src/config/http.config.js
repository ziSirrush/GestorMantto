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

function getCorsOptions() {
  const allowedOrigins = parseAllowedOrigins();

  if (allowedOrigins === '*') {
    return { origin: true, credentials: false };
  }

  return {
    credentials: true,
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      const error = new Error(`Origen no permitido por CORS: ${origin}`);
      error.statusCode = 403;
      return callback(error);
    }
  };
}

module.exports = { getCorsOptions };

// [Aster | 2026-10-29 | ASTER-MG | AST-07 CORS ALLOWLIST V001]
function parseAllowedOrigins() {
  const raw=String(process.env.CORS_ORIGINS || '').trim();
  if(!raw || raw==='*')return [];
  return [...new Set(raw.split(',').map(s=>s.trim()).filter(Boolean))].filter(value=>{
    try {
      const url=new URL(value);
      return url.origin===value && !url.username && !url.password && (url.protocol==='https:' || process.env.NODE_ENV!=='production');
    } catch (_) { return false; }
  });
}

function isAllowedOrigin(origin) {
  return Boolean(origin && (
    parseAllowedOrigins().includes(origin) || isDevelopmentOrigin(origin)
  ));
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
  return {
    credentials: true,
    origin(origin, callback) {
      // La ausencia de Origin permite clientes M2M sin navegador,
      // pero no supone permiso funcional ni elude HMAC.
      if (!origin || isAllowedOrigin(origin)) return callback(null, true);
      const error=new Error('Origen CORS no autorizado.');
      error.statusCode=403;
      return callback(error);
    }
  };
}

module.exports = { getCorsOptions, isAllowedOrigin, parseAllowedOrigins };

// [Aster | 2026-08-12 | ASTER-MG | PATCH: FASE_1_BACKEND_M2M_INFRA_V001]

/**
 * Conserva una copia exacta del cuerpo recibido antes de que Express lo
 * transforme a objeto JavaScript. La autenticacion M2M/HMAC utiliza estos
 * bytes para reconstruir la firma del emisor sin reserializar el JSON.
 */
function captureRawBody(req, res, buffer) {
  if (!buffer || buffer.length === 0) {
    req.rawBody = Buffer.alloc(0);
    return;
  }

  req.rawBody = Buffer.from(buffer);
}

module.exports = { captureRawBody };

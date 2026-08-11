// [Aster | 2026-08-11 | ASTER-MG | PATCH: FIX_INTEGRATION_AUTH_V001]
function captureRawBody(req, res, buffer) {
  if (!buffer || !buffer.length) {
    req.rawBody = Buffer.alloc(0);
    return;
  }

  req.rawBody = Buffer.from(buffer);
}

module.exports = {
  captureRawBody
};

// [Claude | 2026-09-11 | Bitácora de Obra | FASE_1_BACKEND_V001]
const service = require('./instalaciones-bitacora.service');

function currentUserId(req) {
  const user = req.user || {};
  return Number(user.id_SB || user.id || 0) || null;
}

async function getBitacora(req, res, next) {
  try {
    const resultado = await service.getBitacora(req.params.idProyecto);
    return res.status(200).json(resultado);
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ ok: false, message: error.message });
    return next(error);
  }
}

async function syncBitacora(req, res, next) {
  try {
    const userId = currentUserId(req);
    const resultado = await service.syncBitacora(userId, req.params.idProyecto);
    return res.status(200).json(resultado);
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ ok: false, message: error.message });
    return next(error);
  }
}

module.exports = {
  getBitacora,
  syncBitacora
};

const service = require('./instalaciones-drive.service');

async function syncCarpetas(req, res, next) {
  try {
    const resultado = await service.syncCarpetas(req.body || {});
    return res.status(200).json(resultado);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        ok: false,
        message: error.message,
        detalles: error.detalles || undefined
      });
    }

    return next(error);
  }
}

module.exports = {
  syncCarpetas
};

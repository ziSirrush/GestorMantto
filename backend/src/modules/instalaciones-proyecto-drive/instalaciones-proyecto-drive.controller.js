const service = require('./instalaciones-proyecto-drive.service');

async function syncProyectoDrive(req, res, next) {
  try {
    const resultado = await service.sync(req.body || {});
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
  syncProyectoDrive
};

const service = require('./ventas-cotizaciones.service');

async function syncCotizaciones(req, res, next) {
  try {
    const result = await service.sync(req.body || {});
    return res.status(200).json(result);
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

module.exports = { syncCotizaciones };

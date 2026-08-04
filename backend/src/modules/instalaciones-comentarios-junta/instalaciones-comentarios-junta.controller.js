const service = require('./instalaciones-comentarios-junta.service');
function action(handler) {
  return async (req, res, next) => {
    try { return await handler(req, res); }
    catch (error) {
      if (typeof next === 'function') return next(error);
      return res.status(500).json({ ok: false, message: 'Error procesando comentarios de junta.', error: error.message });
    }
  };
}
module.exports = { list: action(service.list), create: action(service.create) };

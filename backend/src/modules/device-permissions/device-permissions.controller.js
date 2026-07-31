const service = require('./device-permissions.service');

function sendError(res, error, fallback) {
  const status = Number(error.status || 500);
  return res.status(status).json({
    ok: false,
    message: status >= 500 ? fallback : error.message,
    error: error.message
  });
}

async function status(req, res) {
  try {
    return res.json({ ok: true, data: await service.status(req) });
  } catch (error) {
    return sendError(res, error, 'No fue posible consultar los permisos del dispositivo.');
  }
}

async function sync(req, res) {
  try {
    return res.json({ ok: true, data: await service.sync(req) });
  } catch (error) {
    return sendError(res, error, 'No fue posible actualizar los permisos del dispositivo.');
  }
}

module.exports = { status, sync };

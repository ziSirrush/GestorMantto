const service = require('./device-permissions.service');

function logError(operation, req, error) {
  console.error(`[DevicePermissions][${operation}]`, {
    userId: req.user?.id_SB || null,
    code: error.code || null,
    errno: error.errno || null,
    sqlState: error.sqlState || null,
    sqlMessage: error.sqlMessage || null,
    message: error.message
  });
}

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
    logError('status', req, error);
    return sendError(res, error, 'No fue posible consultar los permisos del dispositivo.');
  }
}

async function sync(req, res) {
  try {
    return res.json({ ok: true, data: await service.sync(req) });
  } catch (error) {
    logError('sync', req, error);
    return sendError(res, error, 'No fue posible actualizar los permisos del dispositivo.');
  }
}

module.exports = { status, sync };

const service = require('./push-notifications.service');

function sendError(res, error, fallback) {
  const status = Number(error.status || 500);
  return res.status(status).json({
    ok: false,
    message: status >= 500 ? fallback : error.message,
    error: error.message
  });
}

function getConfig(req, res) {
  return res.json({ ok: true, data: service.getConfig() });
}

async function subscribe(req, res) {
  try {
    const data = await service.subscribe(req);
    return res.status(201).json({ ok: true, data });
  } catch (error) {
    return sendError(res, error, 'No fue posible registrar las notificaciones push.');
  }
}

async function unsubscribe(req, res) {
  try {
    const data = await service.unsubscribe(req);
    return res.json({ ok: true, data });
  } catch (error) {
    return sendError(res, error, 'No fue posible desactivar las notificaciones push.');
  }
}

async function status(req, res) {
  try {
    const data = await service.status(req);
    return res.json({ ok: true, data });
  } catch (error) {
    return sendError(res, error, 'No fue posible consultar el estado push.');
  }
}

module.exports = { getConfig, subscribe, unsubscribe, status };

const notificacionesService = require('./notificaciones.service');

async function getNotificaciones(req, res) {
  try {
    const data = await notificacionesService.getNotificaciones(req);
    return res.json({ ok: true, source: 'aiven', data });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error consultando notificaciones.',
      error: error.message
    });
  }
}

async function getEstadoNotificaciones(req, res) {
  try {
    const data = await notificacionesService.getEstadoNotificaciones(req);
    return res.json({ ok: true, source: 'aiven', data });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error consultando estado de notificaciones.',
      error: error.message
    });
  }
}

async function abrirNotificacion(req, res) {
  try {
    const result = await notificacionesService.abrirNotificacion(req);
    return res.status(result.status).json(result.body);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error abriendo notificacion.',
      error: error.message
    });
  }
}

async function marcarNotificacionNueva(req, res) {
  try {
    const result = await notificacionesService.marcarNotificacionNueva(req);
    return res.status(result.status).json(result.body);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error marcando notificacion como nueva.',
      error: error.message
    });
  }
}


async function getPreferencias(req, res) {
  try {
    const data = await notificacionesService.getPreferencias(req);
    return res.json({ ok: true, source: 'aiven', data });
  } catch (error) {
    return res.status(error.status || 500).json({
      ok: false,
      message: error.message || 'Error consultando preferencias de notificaciones.'
    });
  }
}

async function guardarPreferencias(req, res) {
  try {
    const data = await notificacionesService.guardarPreferencias(req);
    return res.json({
      ok: true,
      source: 'aiven',
      message: 'Preferencias de notificaciones actualizadas.',
      data
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      ok: false,
      message: error.message || 'Error guardando preferencias de notificaciones.'
    });
  }
}

module.exports = {
  getNotificaciones,
  getEstadoNotificaciones,
  abrirNotificacion,
  marcarNotificacionNueva,
  getPreferencias,
  guardarPreferencias
};

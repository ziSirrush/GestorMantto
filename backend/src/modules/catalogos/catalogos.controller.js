const catalogosService = require('./catalogos.service');

async function getEstadosVisuales(req, res) {
  try {
    const rows = await catalogosService.obtenerEstadosVisuales(req.query);

    return res.json({
      ok: true,
      data: rows,
      total: rows.length
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'No fue posible cargar los estados visuales.',
      error: error.message
    });
  }
}

async function getPermisos(req, res) {
  try {
    const rows = await catalogosService.obtenerPermisos();
    return res.json({ ok: true, source: 'permisos', data: rows });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error consultando permisos.',
      error: error.message
    });
  }
}

async function getRoles(req, res) {
  try {
    const rows = await catalogosService.obtenerRoles();
    return res.json({ ok: true, source: 'roles', data: rows });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error consultando roles.',
      error: error.message
    });
  }
}

async function getZonas(req, res) {
  try {
    const rows = await catalogosService.obtenerZonas();
    return res.json({ ok: true, source: 'z_op', data: rows });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error consultando zonas operativas.',
      error: error.message
    });
  }
}

async function getUsuarioZop(req, res) {
  try {
    const rows = await catalogosService.obtenerUsuarioZop();
    return res.json({ ok: true, source: 'usuario_zop', data: rows });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error consultando relación usuario-zona.',
      error: error.message
    });
  }
}

module.exports = {
  getEstadosVisuales,
  getPermisos,
  getRoles,
  getZonas,
  getUsuarioZop
};

const homeService = require('./home.service');

async function getHomeSnapshot(req, res) {
  try {
    const result = await homeService.getHomeSnapshot(req);
    return res.status(result.status).json(result.body);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error consultando snapshot operativo de Home.',
      error: error.message
    });
  }
}

async function getHomeBootstrap(req, res) {
  try {
    const result = await homeService.getHomeBootstrap(req);
    return res.status(result.status).json(result.body);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error consultando bootstrap de Home.',
      error: error.message
    });
  }
}

async function getActividadReciente(req, res) {
  try {
    const result = await homeService.getActividadReciente(req);
    return res.status(result.status).json(result.body);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error consultando actividad reciente.',
      error: error.message
    });
  }
}

module.exports = {
  getHomeSnapshot,
  getHomeBootstrap,
  getActividadReciente
};

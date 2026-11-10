'use strict';

const service = require('./dashboard-callcenter.service');

async function getInitialData(req, res, next) {
  try {
    return res.json(await service.getInitialData(req));
  } catch (error) {
    if (typeof next === 'function') return next(error);
    return res.status(500).json({
      ok: false,
      message: 'Error cargando Dashboard Call Center.',
      error: error.message
    });
  }
}

async function getU365Equipos(req, res, next) {
  try {
    return res.json(await service.getCallCenterU365Equipos(req));
  } catch (error) {
    if (typeof next === 'function') return next(error);
    return res.status(500).json({ ok: false, message: 'Error cargando U365D por equipo.', error: error.message });
  }
}

async function getU365Proyectos(req, res, next) {
  try {
    return res.json(await service.getCallCenterU365Proyectos(req));
  } catch (error) {
    if (typeof next === 'function') return next(error);
    return res.status(500).json({ ok: false, message: 'Error cargando U365D por proyecto.', error: error.message });
  }
}

module.exports = {
  getInitialData,
  getU365Equipos,
  getU365Proyectos
};

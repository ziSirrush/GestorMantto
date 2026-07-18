const portafolioService = require('./portafolio.service');

function createAction(handlerName) {
  return async function portafolioAction(req, res, next) {
    try {
      return await portafolioService.execute(handlerName, req, res);
    } catch (error) {
      if (typeof next === 'function') return next(error);
      return res.status(500).json({
        ok: false,
        message: 'Error ejecutando la operacion de portafolio.',
        error: error.message
      });
    }
  };
}

module.exports = {
  getPortafolioFiltros: createAction('getPortafolioFiltros'),
  getPortafolioDashboard: createAction('getPortafolioDashboard'),
  getPortafolioMovimientos: createAction('getPortafolioMovimientos'),
  getPortafolioSemanasDisponibles: createAction('getPortafolioSemanasDisponibles'),
  getPortafolioMovimientosSemanales: createAction('getPortafolioMovimientosSemanales'),
  getPortafolioMovimientoDetalle: createAction('getPortafolioMovimientoDetalle'),
  getPortafolioEquipoTicketsLote: createAction('getPortafolioEquipoTicketsLote'),
  getPortafolioEquipoDetalle: createAction('getPortafolioEquipoDetalle'),
  getPortafolioEquipos: createAction('getPortafolioEquipos'),
  getPortafolioProyectoDetalle: createAction('getPortafolioProyectoDetalle'),
  getPortafolio: createAction('getPortafolio'),
  syncPortafolio: createAction('syncPortafolio'),
  getEquipos: createAction('getEquipos')
};

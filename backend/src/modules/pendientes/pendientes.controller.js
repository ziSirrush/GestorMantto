const pendientesService = require('./pendientes.service');

function createAction(handlerName) {
  return async function pendientesAction(req, res, next) {
    try {
      return await pendientesService.execute(handlerName, req, res);
    } catch (error) {
      if (typeof next === 'function') return next(error);
      return res.status(500).json({
        ok: false,
        message: 'Error ejecutando la operacion de pendientes.',
        error: error.message
      });
    }
  };
}

module.exports = {
  getPendientesCatalogos: createAction('getPendientesCatalogos'),
  getPendientes: createAction('getPendientes'),
  getPendienteDetalle: createAction('getPendienteDetalle'),
  createPendiente: createAction('createPendiente'),
  updatePendiente: createAction('updatePendiente'),
  deletePendiente: createAction('deletePendiente'),
  updatePendienteEstatus: createAction('updatePendienteEstatus'),
  updatePendientePrioridad: createAction('updatePendientePrioridad'),
  createPendienteComentario: createAction('createPendienteComentario'),
  updatePendienteSubtarea: createAction('updatePendienteSubtarea')
};

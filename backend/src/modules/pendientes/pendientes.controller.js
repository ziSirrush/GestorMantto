const pendientesService = require('./pendientes.service');

function sendError(res, fallbackMessage, error) {
  const status = Number(error && error.status) || 500;
  const payload = {
    ok: false,
    message: status < 500 && error && error.expose !== false
      ? error.message
      : fallbackMessage
  };
  if (status >= 500) payload.error = error && error.message;
  if (error && error.code) payload.code = error.code;
  return res.status(status).json(payload);
}

function action(serviceMethod, fallbackMessage) {
  return async function pendientesAction(req, res) {
    try {
      const output = await serviceMethod(req);
      return res.status(output.status || 200).json(output.body);
    } catch (error) {
      return sendError(res, fallbackMessage, error);
    }
  };
}

module.exports = {
  getPendientesCatalogos: action(
    pendientesService.getPendientesCatalogos,
    'Error consultando catalogos de pendientes.'
  ),
  getPendientes: action(
    pendientesService.getPendientes,
    'Error consultando pendientes.'
  ),
  getPendienteDetalle: action(
    pendientesService.getPendienteDetalle,
    'Error consultando detalle de pendiente.'
  ),
  createPendiente: action(
    pendientesService.createPendiente,
    'Error creando pendiente.'
  ),
  updatePendiente: action(
    pendientesService.updatePendiente,
    'Error actualizando pendiente.'
  ),
  deletePendiente: action(
    pendientesService.deletePendiente,
    'Error eliminando tarea.'
  ),
  updatePendienteEstatus: action(
    pendientesService.updatePendienteEstatus,
    'Error actualizando estatus.'
  ),
  updatePendientePrioridad: action(
    pendientesService.updatePendientePrioridad,
    'Error actualizando prioridad.'
  ),
  createPendienteComentario: action(
    pendientesService.createPendienteComentario,
    'Error agregando interacción.'
  ),
  updatePendienteSubtarea: action(
    pendientesService.updatePendienteSubtarea,
    'Error actualizando subtarea.'
  )
};

/**
 * Repositorio transicional del modulo Pendientes.
 *
 * Mantiene como fuente de verdad los handlers legacy ya validados en
 * controllers/data.controller.js, que ahora es una fachada acotada hacia
 * controllers/data.controller.legacy.js. Esto conserva el comportamiento
 * validado mientras cada dominio completa la extraccion real de su SQL y reglas.
 */
const legacyController = require('../../controllers/data.controller');

const handlers = Object.freeze({
  getPendientesCatalogos: legacyController.getPendientesCatalogos,
  getPendientes: legacyController.getPendientes,
  getPendienteDetalle: legacyController.getPendienteDetalle,
  createPendiente: legacyController.createPendiente,
  updatePendiente: legacyController.updatePendiente,
  deletePendiente: legacyController.deletePendiente,
  updatePendienteEstatus: legacyController.updatePendienteEstatus,
  updatePendientePrioridad: legacyController.updatePendientePrioridad,
  createPendienteComentario: legacyController.createPendienteComentario,
  updatePendienteSubtarea: legacyController.updatePendienteSubtarea
});

function getHandler(name) {
  const handler = handlers[name];
  if (typeof handler !== 'function') {
    throw new Error(`Handler de pendientes no disponible: ${name}`);
  }
  return handler;
}

module.exports = {
  getHandler
};

/**
 * Repositorio transicional del modulo Tickets.
 *
 * Mantiene como fuente de verdad los handlers ya validados durante la
 * migracion incremental. La logica principal de Tickets permanece
 * detras de la fachada controllers/data.controller.js. La dependencia legacy
 * queda explicitamente aislada y no debe extenderse a nuevos endpoints.
 */
const legacyController = require('../../controllers/data.controller');

const handlers = Object.freeze({
  getTickets: legacyController.getTickets,
  getTicketInteracciones: legacyController.getTicketInteracciones,
  createTicketComentario: legacyController.createTicketComentario,
  saveTicketValidacion: legacyController.saveTicketValidacion,
  getTicketDetalle: legacyController.getTicketDetalle,
  saveTicketVobo: legacyController.saveTicketVobo,
  syncTickets: legacyController.syncTickets
});

function getHandler(name) {
  const handler = handlers[name];
  if (typeof handler !== 'function') {
    throw new Error(`Handler de tickets no disponible: ${name}`);
  }
  return handler;
}

module.exports = {
  getHandler
};

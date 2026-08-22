/**
 * Repositorio transicional del modulo Tickets.
 *
 * FASE 3 mueve las lecturas humanas base de Tickets al motor territorial
 * UNITED. Las interacciones y escrituras permanecen en el handler legacy,
 * protegidas por requireTicketRecordScope_gnral en las rutas existentes.
 * Los endpoints M2M siguen separados del alcance humano.
 */
const legacyController = require('../../controllers/data.controller');
const ticketsConsultasUni = require('./tickets-consultas_uni');

const handlers = Object.freeze({
  getTickets: ticketsConsultasUni.getTickets_uni,
  getTicketInteracciones: legacyController.getTicketInteracciones,
  createTicketComentario: legacyController.createTicketComentario,
  saveTicketValidacion: legacyController.saveTicketValidacion,
  getTicketDetalle: ticketsConsultasUni.getTicketDetalle_uni,
  saveTicketVobo: legacyController.saveTicketVobo,
  syncTickets: legacyController.syncTickets,
  syncTicketDatesCdmx: legacyController.syncTicketDatesCdmx
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

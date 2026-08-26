/**
 * Repositorio transicional del modulo Tickets.
 *
 * FASE 3 mueve las lecturas humanas base de Tickets al motor territorial
 * UNITED. FASE 2 de Notificaciones extrae comentario + Vo.Bo. del handler
 * legacy para que esas mutaciones emitan exclusivamente los codigos oficiales
 * y lo hagan despues de confirmar la accion de negocio.
 */
const legacyController = require('../../controllers/data.controller');
const ticketsConsultasUni = require('./tickets-consultas_uni');
const ticketNotificationWrites = require('./tickets-notification-writes.service');

const handlers = Object.freeze({
  getTickets: ticketsConsultasUni.getTickets_uni,
  getTicketInteracciones: legacyController.getTicketInteracciones,
  createTicketComentario: ticketNotificationWrites.createTicketComentario,
  saveTicketValidacion: ticketNotificationWrites.saveTicketValidacion,
  getTicketDetalle: ticketsConsultasUni.getTicketDetalle_uni,
  saveTicketVobo: ticketNotificationWrites.saveTicketVobo,
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

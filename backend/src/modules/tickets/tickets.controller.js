const ticketsService = require('./tickets.service');

function createAction(handlerName) {
  return async function ticketsAction(req, res, next) {
    try {
      return await ticketsService.execute(handlerName, req, res);
    } catch (error) {
      if (typeof next === 'function') return next(error);
      return res.status(500).json({
        ok: false,
        message: 'Error ejecutando la operacion de tickets.',
        error: error.message
      });
    }
  };
}

module.exports = {
  getTickets: createAction('getTickets'),
  getTicketInteracciones: createAction('getTicketInteracciones'),
  createTicketComentario: createAction('createTicketComentario'),
  saveTicketValidacion: createAction('saveTicketValidacion'),
  getTicketDetalle: createAction('getTicketDetalle'),
  saveTicketVobo: createAction('saveTicketVobo'),
  syncTickets: createAction('syncTickets')
};

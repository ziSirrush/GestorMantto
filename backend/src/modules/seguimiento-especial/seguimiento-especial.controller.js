'use strict';

const service = require('./seguimiento-especial.service');

function handler(method) {
  return async function seguimientoEspecialHandler(req, res, next) {
    try {
      const result = await service[method](req);
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = {
  listTickets: handler('listTickets'),
  getTicket: handler('getTicket'),
  setTicket: handler('setTicket')
};

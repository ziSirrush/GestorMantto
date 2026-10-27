'use strict';

const service = require('./experimental-ns.service');

function handler(action) {
  return async function experimentalNsRead(req, res, next) {
    try {
      const result = await action(req);
      return res.status(result.listas === false ? 503 : 200).json(result);
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = {
  estado: handler(req => service.status(req)),
  portafolio: handler(req => service.list(req, 'portafolio')),
  tickets: handler(req => service.list(req, 'tickets'))
};

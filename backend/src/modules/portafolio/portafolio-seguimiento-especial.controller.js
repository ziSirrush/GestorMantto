'use strict';

const service = require('./portafolio-seguimiento-especial.service');

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
  list: handler('list'),
  getProject: handler('getProject'),
  setProject: handler('setProject'),
  getEquipment: handler('getEquipment'),
  setEquipment: handler('setEquipment')
};

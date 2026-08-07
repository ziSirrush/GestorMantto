'use strict';

const service = require('./experimental-equipos-criticos.service');

async function getEquiposCriticos_uni(req, res) {
  return service.getEquiposCriticos_uni(req, res);
}

async function getEquipoCriticoTickets_uni(req, res) {
  return service.getEquipoCriticoTickets_uni(req, res);
}

module.exports = {
  getEquiposCriticos_uni,
  getEquipoCriticoTickets_uni
};

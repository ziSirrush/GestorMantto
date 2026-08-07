'use strict';

const service = require('./experimental-proyectos-criticos.service');

async function getProyectosCriticos_uni(req, res) {
  return service.getProyectosCriticos_uni(req, res);
}

async function getProyectoCriticoTickets_uni(req, res) {
  return service.getProyectoCriticoTickets_uni(req, res);
}

module.exports = {
  getProyectosCriticos_uni,
  getProyectoCriticoTickets_uni
};

const criticosService = require('./criticos.service');

async function getEquiposCriticos(req, res) {
  return criticosService.getEquiposCriticos(req, res);
}

async function getEquipoCriticoTickets(req, res) {
  return criticosService.getEquipoCriticoTickets(req, res);
}

async function getProyectosCriticos(req, res) {
  return criticosService.getProyectosCriticos(req, res);
}

async function getProyectoCriticoTickets(req, res) {
  return criticosService.getProyectoCriticoTickets(req, res);
}

async function getCriticidadCorporativa(req, res) {
  return criticosService.getCriticidadCorporativa(req, res);
}

async function getMtbcEquipos(req, res) {
  return criticosService.getMtbcEquipos(req, res);
}

async function getMtbcProyectos(req, res) {
  return criticosService.getMtbcProyectos(req, res);
}

async function getCallCenterU365Equipos(req, res) {
  return criticosService.getCallCenterU365Equipos(req, res);
}

async function getCallCenterU365Proyectos(req, res) {
  return criticosService.getCallCenterU365Proyectos(req, res);
}

module.exports = {
  getEquiposCriticos,
  getEquipoCriticoTickets,
  getProyectosCriticos,
  getProyectoCriticoTickets,
  getCriticidadCorporativa,
  getMtbcEquipos,
  getMtbcProyectos,
  getCallCenterU365Equipos,
  getCallCenterU365Proyectos
};

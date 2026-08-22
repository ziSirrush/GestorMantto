const criticosCuartosOperacionService = require('./criticos-cuartos-operacion.service');
const callcenterCuartosOperacionService = require('./callcenter-cuartos-operacion.service');

async function getEquiposCriticos(req, res) {
  return criticosCuartosOperacionService.getEquiposCriticos(req, res);
}

async function getEquipoCriticoTickets(req, res) {
  return criticosCuartosOperacionService.getEquipoCriticoTickets(req, res);
}

async function getProyectosCriticos(req, res) {
  return criticosCuartosOperacionService.getProyectosCriticos(req, res);
}

async function getProyectoCriticoTickets(req, res) {
  return criticosCuartosOperacionService.getProyectoCriticoTickets(req, res);
}

async function getCriticidadCorporativa(req, res) {
  return criticosCuartosOperacionService.getCriticidadCorporativa(req, res);
}

async function getMtbcEquipos(req, res) {
  return callcenterCuartosOperacionService.getMtbcEquipos(req, res);
}

async function getMtbcProyectos(req, res) {
  return callcenterCuartosOperacionService.getMtbcProyectos(req, res);
}

async function getCallCenterU365Equipos(req, res) {
  return callcenterCuartosOperacionService.getCallCenterU365Equipos(req, res);
}

async function getCallCenterU365Proyectos(req, res) {
  return callcenterCuartosOperacionService.getCallCenterU365Proyectos(req, res);
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

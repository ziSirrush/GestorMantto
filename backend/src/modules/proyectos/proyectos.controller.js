const proyectosService = require('./proyectos.service');

async function getProyectosFiltros(req, res) {
  return proyectosService.getProyectosFiltros(req, res);
}

async function getProyectos(req, res) {
  return proyectosService.getProyectos(req, res);
}

async function getProyectoDetalle(req, res) {
  return proyectosService.getProyectoDetalle(req, res);
}

async function getPortafolioProyectoDetalle(req, res) {
  return proyectosService.getPortafolioProyectoDetalle(req, res);
}

module.exports = {
  getProyectosFiltros,
  getProyectos,
  getProyectoDetalle,
  getPortafolioProyectoDetalle
};

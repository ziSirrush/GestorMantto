'use strict';

const proyectosService = require('./proyectos.service');
const proyectosCuartosUni = require('./proyectos-cuartos_uni.service');

async function getProyectosInicial(req, res) {
  return proyectosCuartosUni.getProyectosInicial_uni(req, res);
}

async function getProyectosFiltros(req, res) {
  return proyectosCuartosUni.getProyectosFiltros_uni(req, res);
}

async function getProyectos(req, res) {
  return proyectosCuartosUni.getProyectos_uni(req, res);
}

async function getProyectoDetalle(req, res) {
  return proyectosCuartosUni.getProyectoDetalle_uni(req, res);
}

// La ruta especifica de Portafolio conserva su contrato previo de FASE 2.
async function getPortafolioProyectoDetalle(req, res) {
  return proyectosService.getPortafolioProyectoDetalle(req, res);
}

module.exports = {
  getProyectosInicial,
  getProyectosFiltros,
  getProyectos,
  getProyectoDetalle,
  getPortafolioProyectoDetalle
};

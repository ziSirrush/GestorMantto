'use strict';

const proyectosService = require('./proyectos.service');
const proyectosCuartosUni = require('./proyectos-cuartos_uni.service');
const adeudosSeguros = require('../../services/cobranza-uni/adeudos-proyecto-portafolio.service');

async function getProyectosInicial(req, res) {
  return proyectosCuartosUni.getProyectosInicial_uni(req, res);
}

async function getProyectosFiltros(req, res) {
  return proyectosCuartosUni.getProyectosFiltros_uni(req, res);
}

async function getProyectos(req, res) {
  // La modalidad ?detalle=1 consume el mismo handler de proyecto.
  // Debe pasar por la misma defensa para no conservar una ruta alternativa
  // que exponga montos calculados con ID OR nombre.
  if (String(req.query?.detalle || '').trim() === '1' && String(req.query?.proyecto || '').trim()) {
    return adeudosSeguros.envolverDetalleUni(req, res, proyectosCuartosUni.getProyectoDetalle_uni);
  }
  return proyectosCuartosUni.getProyectos_uni(req, res);
}

async function getProyectoDetalle(req, res) {
  return adeudosSeguros.envolverDetalleUni(req, res, proyectosCuartosUni.getProyectoDetalle_uni);
}

// La ruta especifica de Portafolio conserva su contrato previo de FASE 2.
async function getPortafolioProyectoDetalle(req, res) {
  return adeudosSeguros.envolverDetalleUni(req, res, proyectosService.getPortafolioProyectoDetalle);
}

module.exports = {
  getProyectosInicial,
  getProyectosFiltros,
  getProyectos,
  getProyectoDetalle,
  getPortafolioProyectoDetalle
};

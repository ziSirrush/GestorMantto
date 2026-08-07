'use strict';

// Fase 7.1: Proyectos Críticos Experimental conserva la lógica United:
// proyecto crítico = N o más fallas con responsabilidad BLT en D días.
// Mantto Gestor ya tiene esta lógica validada en el servicio general de críticos,
// por lo que este adaptador _uni la reutiliza y no duplica SQL ni consulta Instalaciones.
const criticosService = require('../criticos/criticos.service');

async function getProyectosCriticos_uni(req, res) {
  return criticosService.getProyectosCriticos(req, res);
}

async function getProyectoCriticoTickets_uni(req, res) {
  return criticosService.getProyectoCriticoTickets(req, res);
}

module.exports = {
  getProyectosCriticos_uni,
  getProyectoCriticoTickets_uni
};

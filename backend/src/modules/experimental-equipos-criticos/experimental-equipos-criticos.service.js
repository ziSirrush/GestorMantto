'use strict';

// Fase 5.1: el módulo Experimental conserva la lógica United de
// "equipo crítico = N o más fallas con responsabilidad BLT en D días",
// pero reutiliza el servicio general ya validado por Mantto Gestor.
// No duplica consultas SQL ni consulta Instalaciones.
const criticosService = require('../criticos/criticos.service');

async function getEquiposCriticos_uni(req, res) {
  return criticosService.getEquiposCriticos(req, res);
}

async function getEquipoCriticoTickets_uni(req, res) {
  return criticosService.getEquipoCriticoTickets(req, res);
}

module.exports = {
  getEquiposCriticos_uni,
  getEquipoCriticoTickets_uni
};

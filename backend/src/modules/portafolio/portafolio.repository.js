/**
 * Repositorio transicional del modulo Portafolio.
 *
 * Mantiene como fuente de verdad los handlers ya validados durante la
 * migracion incremental. La logica principal de Portafolio permanece
 * detras de la fachada controllers/data.controller.js, mientras que el detalle
 * de proyecto reutiliza el modulo Proyectos ya migrado. La dependencia legacy
 * queda explicitamente aislada y no debe extenderse a nuevos endpoints.
 */
const legacyController = require('../../controllers/data.controller');
const proyectosController = require('../proyectos/proyectos.controller');

const handlers = Object.freeze({
  getPortafolioFiltros: legacyController.getPortafolioFiltros,
  getPortafolioDashboard: legacyController.getPortafolioDashboard,
  getPortafolioMovimientos: legacyController.getPortafolioMovimientos,
  getPortafolioSemanasDisponibles: legacyController.getPortafolioSemanasDisponibles,
  getPortafolioMovimientosSemanales: legacyController.getPortafolioMovimientosSemanales,
  getPortafolioMovimientoDetalle: legacyController.getPortafolioMovimientoDetalle,
  getPortafolioEquipoTicketsLote: legacyController.getPortafolioEquipoTicketsLote,
  getPortafolioEquipoDetalle: legacyController.getPortafolioEquipoDetalle,
  getPortafolioEquipos: legacyController.getPortafolioEquipos,
  getPortafolioProyectoDetalle: proyectosController.getPortafolioProyectoDetalle,
  getPortafolio: legacyController.getPortafolio,
  syncPortafolio: legacyController.syncPortafolio,
  getEquipos: legacyController.getEquipos
});

function getHandler(name) {
  const handler = handlers[name];
  if (typeof handler !== 'function') {
    throw new Error(`Handler de portafolio no disponible: ${name}`);
  }
  return handler;
}

module.exports = {
  getHandler
};

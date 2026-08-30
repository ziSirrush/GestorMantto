/**
 * Repositorio transicional del modulo Portafolio.
 *
 * FASE 2 UNITED Puertas/Cuartos:
 * las consultas humanas de Portafolio que listan, agregan o construyen filtros
 * dejan de depender del controlador legacy y consumen handlers _uni que aplican
 * req.informationAccess -> usuario_zop -> portafolio.zona_id.
 *
 * FASE 7/11:
 * Dashboard Portafolio agrega una carga inicial dedicada y conserva la cadena
 * routes -> controller -> service -> repository -> handler _uni.
 *
 * FASE 9/11:
 * Movimientos de Portafolio sale de handlers legacy para mensual, semanal y
 * detalle. Todos resuelven cuartos por Portafolio.zona_id y z_op.
 *
 * Los handlers no relacionados con el filtro territorial se conservan sin
 * cambios para minimizar riesgo durante la migracion incremental.
 */
const legacyController = require('../../controllers/data.controller');
const portafolioComercialUni = require('./portafolio-comercial_uni');
const portafolioConsultasUni = require('./portafolio-consultas_uni');
const portafolioMovimientosUni = require('./portafolio-movimientos_uni');

const handlers = Object.freeze({
  getPortafolioFiltros: portafolioConsultasUni.getPortafolioFiltros_uni,
  getPortafolioDashboardInicial: portafolioComercialUni.getPortafolioDashboardInicial_uni,
  getPortafolioDashboard: portafolioComercialUni.getPortafolioDashboard_uni,
  getPortafolioMovimientosInicial: portafolioMovimientosUni.getPortafolioMovimientosInicial_uni,
  getPortafolioMovimientos: portafolioMovimientosUni.getPortafolioMovimientos_uni,
  getPortafolioSemanasDisponibles: portafolioMovimientosUni.getPortafolioSemanasDisponibles_uni,
  getPortafolioMovimientosSemanales: portafolioMovimientosUni.getPortafolioMovimientosSemanales_uni,
  ejecutarCorteSemanalManual: portafolioMovimientosUni.ejecutarCorteSemanalManual_uni,
  getPortafolioMovimientoDetalle: portafolioMovimientosUni.getPortafolioMovimientoDetalle_uni,
  getPortafolioEquipoTicketsLote: legacyController.getPortafolioEquipoTicketsLote,
  getPortafolioEquipoDetalle: portafolioConsultasUni.getPortafolioEquipoDetalle_uni,
  getPortafolioEquipos: portafolioComercialUni.getPortafolioEquipos_uni,
  getPortafolioProyectoDetalle: portafolioConsultasUni.getPortafolioProyectoDetalle_uni,
  getPortafolio: portafolioConsultasUni.getPortafolio_uni,
  syncPortafolio: legacyController.syncPortafolio,
  getEquipos: portafolioConsultasUni.getEquipos_uni
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

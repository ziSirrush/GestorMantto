/**
 * Fachada de compatibilidad para dominios pendientes de extracción completa.
 *
 * La lógica histórica fue aislada en ./data.controller.legacy.js para
 * evitar que nuevas rutas o módulos dependan del controlador monolítico.
 * Esta fachada expone únicamente los handlers que todavía son consumidos por
 * los módulos transicionales validados.
 */
const legacy = require('./data.controller.legacy');

const requiredHandlers = [
  // Tickets
  'getTickets',
  'getTicketDetalle',
  'saveTicketVobo',
  'getTicketInteracciones',
  'createTicketComentario',
  'saveTicketValidacion',
  'syncTickets',

  // Portafolio
  'getPortafolio',
  'getPortafolioFiltros',
  'getPortafolioMovimientos',
  'getPortafolioSemanasDisponibles',
  'getPortafolioMovimientosSemanales',
  'getPortafolioMovimientoDetalle',
  'getPortafolioDashboard',
  'getPortafolioEquipos',
  'getPortafolioEquipoDetalle',
  'getPortafolioEquipoTicketsLote',
  'getEquipos',
  'syncPortafolio',

  // Pendientes
  'getPendientesCatalogos',
  'getPendientes',
  'getPendienteDetalle',
  'createPendiente',
  'updatePendiente',
  'deletePendiente',
  'updatePendienteEstatus',
  'updatePendientePrioridad',
  'createPendienteComentario',
  'updatePendienteSubtarea',

  // Compatibilidad temporal de usuarios
  'getUsuarios'
];

const exportedHandlers = {};

for (const name of requiredHandlers) {
  if (typeof legacy[name] !== 'function') {
    throw new Error(`Handler legacy requerido no disponible: ${name}`);
  }
  exportedHandlers[name] = legacy[name];
}

module.exports = Object.freeze(exportedHandlers);

/**
 * Fachada de compatibilidad para dominios pendientes de extracción completa.
 *
 * La lógica histórica fue aislada en ./data.controller.legacy.js para
 * evitar que nuevas rutas o módulos dependan del controlador monolítico.
 * Esta fachada expone únicamente los handlers que todavía son consumidos por
 * los módulos transicionales validados.
 */
const legacy = require('./data.controller.legacy');
const criticalTicketNotifications = require('../services/notifications/ticket-critical-notifications_uni.service');

const requiredHandlers = [
  // Tickets
  'getTickets',
  'getTicketDetalle',
  'saveTicketVobo',
  'getTicketInteracciones',
  'createTicketComentario',
  'saveTicketValidacion',
  'syncTickets',
  'syncTicketDatesCdmx',

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

/**
 * Wrapper incremental para las tres interacciones criticas de Tickets.
 *
 * El sync legacy sigue siendo la unica funcion que modifica tickets. Este
 * wrapper solo observa el estado antes/despues y, si el sync termino bien,
 * genera las notificaciones correspondientes. Un fallo del motor de
 * notificaciones nunca revierte ni bloquea la sincronizacion operativa.
 */
async function syncTicketsWithCriticalNotifications_uni(req, res) {
  let beforeContext = null;
  let notificationError = null;

  try {
    beforeContext = await criticalTicketNotifications.captureBeforeSync_uni(req.body || {});
  } catch (error) {
    notificationError = `No fue posible preparar las notificaciones criticas: ${error.message}`;
    console.error('[tickets/sync][notificaciones-criticas] Preparacion omitida:', error.message);
  }

  const originalJson = res.json.bind(res);
  let capturedPayload = null;

  res.json = function captureLegacyJson(payload) {
    capturedPayload = payload;
    return res;
  };

  try {
    await legacy.syncTickets(req, res);
  } finally {
    res.json = originalJson;
  }

  if (!capturedPayload) {
    return originalJson({
      ok: false,
      message: 'El sincronizador de Tickets no devolvio una respuesta valida.',
      notificaciones_criticas_error: notificationError
    });
  }

  if (capturedPayload.ok !== true || Number(res.statusCode || 200) >= 400) {
    return originalJson(capturedPayload);
  }

  let notificationSummary = {
    inserted_tickets: 0,
    falla_equipo_critico: 0,
    persona_atrapada: 0,
    nuevo_equipo_critico: 0,
    eventos: []
  };

  if (beforeContext) {
    try {
      notificationSummary = await criticalTicketNotifications.processAfterSync_uni(
        beforeContext,
        req.contextUser || req.user || null
      );
    } catch (error) {
      notificationError = error.message;
      console.error(
        '[tickets/sync][notificaciones-criticas] Los tickets se conservaron; fallo solo la generacion de notificaciones:',
        error.message
      );
    }
  }

  return originalJson({
    ...capturedPayload,
    notificaciones_criticas: notificationSummary,
    notificaciones_criticas_error: notificationError
  });
}

exportedHandlers.syncTickets = syncTicketsWithCriticalNotifications_uni;

module.exports = Object.freeze(exportedHandlers);

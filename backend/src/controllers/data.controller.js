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
const portafolioNativeNotifications = require('../services/notifications/portafolio-native-notifications_uni.service');

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
 * Wrapper incremental para los eventos criticos y sus combinaciones de Tickets.
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
    affected_tickets: 0,
    inserted_tickets: 0,
    updated_tickets: 0,
    persona_atrapada_equipo_critico: 0,
    persona_atrapada_nuevo_equipo_critico: 0,
    falla_equipo_critico: 0,
    persona_atrapada: 0,
    nuevo_equipo_critico: 0,
    ticket_creado: 0,
    ticket_estatus_cambiado: 0,
    ticket_prioridad_cambiada: 0,
    ticket_asignacion_cambiada: 0,
    ticket_responsabilidad_cambiada: 0,
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

async function syncPortafolioWithNotifications_uni(req, res) {
  let beforeContext = null;
  let notificationError = null;

  try {
    beforeContext = await portafolioNativeNotifications.captureBeforeSync_uni(req.body || {});
  } catch (error) {
    notificationError = `No fue posible capturar el contexto previo de Portafolio: ${error.message}`;
    console.error('[portafolio/sync][notificaciones] Preparacion omitida:', error.message);
  }

  const originalJson = res.json.bind(res);
  let capturedPayload = null;
  res.json = function captureLegacyJson(payload) {
    capturedPayload = payload;
    return res;
  };

  try {
    await legacy.syncPortafolio(req, res);
  } finally {
    res.json = originalJson;
  }

  if (!capturedPayload) {
    return originalJson({
      ok: false,
      message: 'El sincronizador de Portafolio no devolvio una respuesta valida.',
      notificaciones_portafolio_error: notificationError
    });
  }

  if (capturedPayload.ok !== true || Number(res.statusCode || 200) >= 400) {
    return originalJson(capturedPayload);
  }

  let notificationSummary = { created: 0, skipped: 0, events: [] };
  if (beforeContext) {
    try {
      notificationSummary = await portafolioNativeNotifications.processAfterSync_uni(
        beforeContext,
        req.body || {},
        req.contextUser || req.user || null
      );
    } catch (error) {
      notificationError = error.message;
      console.error(
        '[portafolio/sync][notificaciones] El Portafolio se conservo; fallo solo la generacion de notificaciones:',
        error.message
      );
    }
  }

  return originalJson({
    ...capturedPayload,
    notificaciones_portafolio: notificationSummary,
    notificaciones_portafolio_error: notificationError
  });
}

exportedHandlers.syncPortafolio = syncPortafolioWithNotifications_uni;

module.exports = Object.freeze(exportedHandlers);

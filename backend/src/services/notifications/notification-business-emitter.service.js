'use strict';

const crypto = require('crypto');
const notificationService = require('./notification.service');
const logger = require('../../shared/logger');

function actionIdentity_gnral(input) {
  return String(
    input && (
      input.eventInstanceKey ??
      input.event_instance_key ??
      input.dedupKey ??
      input.dedup_key ??
      input.claveDeduplicacion ??
      input.clave_deduplicacion
    ) || ''
  ).trim();
}

function emptyFailure_gnral(input, reason, error = null, traceId = null) {
  return {
    ok: false,
    created: 0,
    skipped: Array.isArray(input && input.destinatarios) ? input.destinatarios.length : 0,
    recipients: [],
    bell_recipients: [],
    push_recipients: [],
    decisions: [],
    reason,
    trace_id: traceId || null,
    error_code: error && error.code ? String(error.code) : null,
    error: error ? String(error.message || error) : null
  };
}

/**
 * Emite una notificacion DESPUES de confirmar la accion de negocio.
 *
 * Regla de estabilidad:
 * - nunca propaga un error de Notificaciones al flujo de negocio;
 * - exige identidad de accion para deduplicacion;
 * - conserva trace_id aun cuando falle la emision.
 */
async function emitBusinessEventSafe_gnral(eventInput, context = {}) {
  const input = eventInput && typeof eventInput === 'object' ? { ...eventInput } : {};
  const codigoEvento = String(input.codigoEvento || input.codigo_evento || '').trim();
  const actionIdentity = actionIdentity_gnral(input);
  const traceId = String(input.traceId || input.trace_id || '').trim() || crypto.randomUUID();
  const label = String(context.label || codigoEvento || 'notification-business-event').trim();

  if (!codigoEvento) {
    const result = emptyFailure_gnral(input, 'CODIGO_EVENTO_NO_DECLARADO', null, traceId);
    logger.error('[NOTIFICATION_BUSINESS_EMIT_REJECTED]', {
      trace_id: traceId,
      label,
      reason: result.reason
    });
    return result;
  }

  if (!actionIdentity) {
    const result = emptyFailure_gnral(input, 'IDENTIDAD_EVENTO_NO_DECLARADA', null, traceId);
    logger.error('[NOTIFICATION_BUSINESS_EMIT_REJECTED]', {
      trace_id: traceId,
      codigo_evento: codigoEvento,
      label,
      reason: result.reason
    });
    return result;
  }

  try {
    const result = await notificationService.emit({
      ...input,
      traceId
    });
    return {
      ok: true,
      ...result,
      trace_id: result && result.trace_id ? result.trace_id : traceId
    };
  } catch (error) {
    logger.error('[NOTIFICATION_BUSINESS_EMIT_FAILED]', {
      trace_id: traceId,
      codigo_evento: codigoEvento,
      label,
      id_referencia: input.idReferencia || input.id_referencia || null,
      error_code: error && error.code ? error.code : null,
      error: error && error.message ? error.message : String(error)
    });
    return emptyFailure_gnral(input, 'ERROR_EMISION_NOTIFICACION', error, traceId);
  }
}

module.exports = {
  emitBusinessEventSafe_gnral
};

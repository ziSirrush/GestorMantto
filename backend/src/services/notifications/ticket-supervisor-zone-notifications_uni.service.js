'use strict';

const crypto = require('crypto');
const db = require('../../config/db');
const logger = require('../../shared/logger');
const {
  emitBusinessEventSafe_gnral
} = require('./notification-business-emitter.service');
const {
  siteLabel_gnral
} = require('./notification-site-label.service');
const {
  isClosedTicketStatus_uni,
  resolveTicketZoneId_uni
} = require('./ticket-critical-notifications_uni.service');

const EVENT_TICKET_INSERTADO_UNI = 'TICKET_INSERTADO';
const EVENT_TICKET_CERRADO_UNI = 'TICKET_CERRADO';

function uniquePositiveIds_uni(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(Number)
    .filter((value) => Number.isInteger(value) && value > 0))]
    .sort((a, b) => a - b);
}

function ticketStatus_uni(row) {
  return String(row?.estado_ticket || row?.estado || '').trim();
}

function equipmentFinalStatus_uni(row) {
  return String(row?.estatus_equipo_final || '').trim() || 'Sin estatus final';
}

async function loadReceivedRows_uni(beforeContext) {
  const candidateIds = uniquePositiveIds_uni(
    beforeContext?.receivedCandidateIds || beforeContext?.candidateIds || []
  );
  if (!candidateIds.length) return [];

  const placeholders = candidateIds.map(() => '?').join(', ');
  const [rows] = await db.query(`
    SELECT *
    FROM tickets
    WHERE id IN (${placeholders})
  `, candidateIds);

  const order = beforeContext?.candidateOrder || new Map();
  return rows.sort((a, b) =>
    Number(order.get(Number(a.id)) ?? Number.MAX_SAFE_INTEGER) -
    Number(order.get(Number(b.id)) ?? Number.MAX_SAFE_INTEGER)
  );
}

/**
 * Audiencia cerrada por dos fronteras simultaneas:
 * - rol activo de Supervisor Mantenimiento Zona;
 * - asignacion directa y activa en usuario_zop para la zona oficial.
 *
 * DOMINIO_COMPLETO, Seguimiento Especial y los textos del Ticket no amplian
 * esta lista de candidatos.
 */
async function listZoneSupervisorUserIds_uni(executor, zoneId) {
  const normalizedZoneId = Number(zoneId);
  if (!Number.isInteger(normalizedZoneId) || normalizedZoneId <= 0) return [];

  const [rows] = await executor.query(`
    SELECT DISTINCT u.id_SB
    FROM usuarios u
    INNER JOIN usuario_roles ur
      ON ur.id_usuario = u.id_SB
     AND ur.activo = 1
    INNER JOIN roles r
      ON r.id_rol = ur.id_rol
     AND r.estado = 1
     AND UPPER(TRIM(r.rol)) LIKE 'SUPERVISOR MANTENIMIENTO ZONA%'
    INNER JOIN usuario_zop uz
      ON uz.usuario_id = u.id_SB
     AND uz.estado = 1
     AND uz.zona_id = ?
    INNER JOIN z_op z
      ON z.id_zona = uz.zona_id
     AND z.estado = 1
    WHERE u.estado = 1
    ORDER BY u.id_SB ASC
  `, [normalizedZoneId]);

  return uniquePositiveIds_uni(rows.map((row) => row.id_SB));
}

function closeInstanceKey_uni(beforeRow, afterRow) {
  const payload = {
    ticket_id: Number(afterRow?.id || beforeRow?.id || 0),
    estado_antes: ticketStatus_uni(beforeRow),
    estado_despues: ticketStatus_uni(afterRow),
    fecha_cierre: String(afterRow?.fecha_cierre || '').trim(),
    hora_solucion: String(afterRow?.h_solucion || '').trim(),
    estatus_equipo_final: equipmentFinalStatus_uni(afterRow)
  };
  const digest = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  return `ticket-supervisor:${EVENT_TICKET_CERRADO_UNI}:${digest}`;
}

function primaryReason_uni(result) {
  if (result?.reason) return result.reason;
  const reasons = [...new Set((Array.isArray(result?.decisions) ? result.decisions : [])
    .map((decision) => String(decision?.reason || '').trim())
    .filter(Boolean))];
  return reasons.length === 1 ? reasons[0] : null;
}

async function emitSupervisorZoneEvent_uni({
  eventCode,
  ticketRow,
  beforeRow,
  actorUserId,
  title,
  message,
  icon,
  eventInstanceKey
}) {
  const zoneId = await resolveTicketZoneId_uni(db, ticketRow);
  if (!zoneId) {
    logger.warn('[NOTIFICATION_TICKET_SUPERVISOR_ZONE_SKIPPED]', {
      codigo_evento: eventCode,
      ticket_id: Number(ticketRow?.id) || null,
      ticket: ticketRow?.ticket || null,
      reason: 'ZONA_OPERATIVA_NO_RESUELTA'
    });
    return {
      ok: true,
      created: 0,
      skipped: 0,
      recipients: [],
      decisions: [],
      reason: 'ZONA_OPERATIVA_NO_RESUELTA',
      zona_id: null,
      event_instance_key: eventInstanceKey
    };
  }

  const supervisorIds = await listZoneSupervisorUserIds_uni(db, zoneId);
  if (!supervisorIds.length) {
    logger.warn('[NOTIFICATION_TICKET_SUPERVISOR_ZONE_SKIPPED]', {
      codigo_evento: eventCode,
      ticket_id: Number(ticketRow?.id) || null,
      ticket: ticketRow?.ticket || null,
      zona_id: zoneId,
      reason: 'SIN_SUPERVISORES_ACTIVOS_EN_ZONA'
    });
    return {
      ok: true,
      created: 0,
      skipped: 0,
      recipients: [],
      decisions: [],
      reason: 'SIN_SUPERVISORES_ACTIVOS_EN_ZONA',
      zona_id: zoneId,
      event_instance_key: eventInstanceKey
    };
  }

  const ticketId = Number(ticketRow?.id) || null;
  const ticketRef = String(ticketRow?.ticket || ticketId || '').trim();
  const result = await emitBusinessEventSafe_gnral({
    codigoEvento: eventCode,
    destinatarios: supervisorIds,
    actorUserId: Number(actorUserId) || null,
    excludeActor: false,
    zonaOperativaId: zoneId,
    requireRoleMatrix: true,
    allowMissingEvent: true,
    titulo: title,
    mensaje: message,
    icono: icon,
    accion: 'ABRIR_TICKET',
    idReferencia: ticketId,
    ruta: ticketRef ? `detalle:ticket:${ticketRef}` : null,
    eventInstanceKey
  }, {
    label: `ticket-supervisor-zone:${eventCode}`
  });

  return {
    ...result,
    reason: primaryReason_uni(result),
    zona_id: zoneId,
    event_instance_key: eventInstanceKey,
    candidate_supervisor_ids: supervisorIds,
    estado_anterior: beforeRow ? ticketStatus_uni(beforeRow) : null,
    estado_actual: ticketStatus_uni(ticketRow) || null
  };
}

function emptySummary_uni() {
  return {
    affected_tickets: 0,
    ticket_insertado: 0,
    ticket_cerrado: 0,
    eventos: []
  };
}

function appendResult_uni(summary, eventCode, row, result) {
  const counter = eventCode === EVENT_TICKET_INSERTADO_UNI
    ? 'ticket_insertado'
    : 'ticket_cerrado';
  summary[counter] += Number(result?.created || 0);
  summary.eventos.push({
    codigo_evento: eventCode,
    ticket_id: Number(row?.id) || null,
    ticket: row?.ticket || null,
    created: Number(result?.created || 0),
    skipped: Number(result?.skipped || 0),
    reason: result?.reason || null,
    trace_id: result?.trace_id || null,
    zona_id: result?.zona_id || null,
    event_instance_key: result?.event_instance_key || null
  });
}

async function processAfterSync_uni(beforeContext, actorUser) {
  const rows = await loadReceivedRows_uni(beforeContext);
  const summary = emptySummary_uni();
  const beforeTickets = beforeContext?.beforeTickets || new Map();
  const actorUserId = Number(actorUser?.id_SB || actorUser?.id || 0) || null;
  summary.affected_tickets = rows.length;

  for (const row of rows) {
    const ticketId = Number(row?.id);
    const beforeRow = beforeTickets.get(ticketId) || null;
    const ticket = String(row?.ticket || ticketId || '').trim();
    const site = siteLabel_gnral(row);
    let event = null;

    if (!beforeRow) {
      event = {
        eventCode: EVENT_TICKET_INSERTADO_UNI,
        title: 'Nuevo ticket',
        message: `Se generó el ticket ${ticket} · ${site}.`,
        icon: '🎫',
        eventInstanceKey: `ticket-supervisor:${EVENT_TICKET_INSERTADO_UNI}:ticket-id:${ticketId}`
      };
    } else if (
      !isClosedTicketStatus_uni(ticketStatus_uni(beforeRow)) &&
      isClosedTicketStatus_uni(ticketStatus_uni(row))
    ) {
      event = {
        eventCode: EVENT_TICKET_CERRADO_UNI,
        title: 'Ticket cerrado',
        message: `Se cerró el ticket ${ticket} · ${site}. Estatus Final del Equipo: ${equipmentFinalStatus_uni(row)}.`,
        icon: '✅',
        eventInstanceKey: closeInstanceKey_uni(beforeRow, row)
      };
    }

    if (!event) continue;

    const result = await emitSupervisorZoneEvent_uni({
      ...event,
      ticketRow: row,
      beforeRow,
      actorUserId
    });
    appendResult_uni(summary, event.eventCode, row, result);
  }

  return summary;
}

module.exports = {
  EVENT_TICKET_INSERTADO_UNI,
  EVENT_TICKET_CERRADO_UNI,
  listZoneSupervisorUserIds_uni,
  closeInstanceKey_uni,
  emitSupervisorZoneEvent_uni,
  processAfterSync_uni
};

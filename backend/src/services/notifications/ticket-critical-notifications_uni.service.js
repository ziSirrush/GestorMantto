'use strict';

// [Aster | 2026-08-25 | ASTER-MG | FIX_NOTIFICACIONES_FASE_4_CRITICOS_V001]
// Fase 4: los tres eventos criticos de Tickets se emiten exclusivamente por el
// motor central. La sincronizacion de negocio permanece independiente.

const db = require('../../config/db');
const logger = require('../../shared/logger');
const {
  emitBusinessEventSafe_gnral
} = require('./notification-business-emitter.service');

const EVENT_FALLA_EQUIPO_CRITICO_UNI = 'FALLA_EQUIPO_CRITICO';
const EVENT_PERSONA_ATRAPADA_UNI = 'PERSONA_ATRAPADA';
const EVENT_NUEVO_EQUIPO_CRITICO_UNI = 'NUEVO_EQUIPO_CRITICO';
const EVENT_PERSONA_ATRAPADA_EQUIPO_CRITICO_UNI = 'PERSONA_ATRAPADA_EQUIPO_CRITICO';
const EVENT_PERSONA_ATRAPADA_NUEVO_EQUIPO_CRITICO_UNI = 'PERSONA_ATRAPADA_NUEVO_EQUIPO_CRITICO';
const CRITICOS_DIAS_UNI = 35;
const CRITICOS_MIN_FALLAS_BLT_UNI = 3;
const PERSONA_ATRAPADA_KEYWORDS_UNI = Object.freeze([
  'atrapado',
  'atrapada',
  'encerrado',
  'encerrada',
  'persona atrapada',
  'personas atrapadas',
  'rescate'
]);

function normalizeText_uni(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function uniquePositiveIds_uni(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(Number)
    .filter((value) => Number.isInteger(value) && value > 0))]
    .sort((a, b) => a - b);
}

function candidateRows_uni(body) {
  const inserts = Array.isArray(body?.inserts) ? body.inserts : [];
  const updates = Array.isArray(body?.updates) ? body.updates : [];
  return [...inserts, ...updates]
    .filter((row) => row && Number.isInteger(Number(row.id)) && Number(row.id) > 0)
    .map((row, index) => ({
      ...row,
      id: Number(row.id),
      __sync_order: index
    }));
}

function isBlt_uni(ticketRow) {
  return normalizeText_uni(ticketRow?.responsabilidad).includes('blt');
}

function isPersonaAtrapada_uni(ticketRow) {
  const blob = normalizeText_uni([
    ticketRow?.descripcion,
    ticketRow?.causa,
    ticketRow?.accion_en_cierre
  ].filter(Boolean).join(' '));
  return PERSONA_ATRAPADA_KEYWORDS_UNI.some((keyword) => blob.includes(keyword));
}

function dateKey_uni(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const text = String(value).trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : text;
}

function requiresPostSyncEvaluation_uni(candidate, beforeRow) {
  if (!beforeRow) return true;

  return (
    normalizeText_uni(candidate?.responsabilidad) !== normalizeText_uni(beforeRow.responsabilidad) ||
    normalizeText_uni(candidate?.codigo_equipo) !== normalizeText_uni(beforeRow.codigo_equipo) ||
    dateKey_uni(candidate?.fecha_reporte) !== dateKey_uni(beforeRow.fecha_reporte) ||
    isPersonaAtrapada_uni(candidate) !== isPersonaAtrapada_uni(beforeRow)
  );
}

async function listCriticalState_uni(executor, equipmentCodes) {
  const codes = [...new Set((equipmentCodes || [])
    .map((value) => String(value || '').trim())
    .filter(Boolean))];

  if (!codes.length) return new Map();

  const placeholders = codes.map(() => '?').join(', ');
  const [rows] = await executor.query(`
    SELECT
      p.numero_equipo,
      COUNT(DISTINCT t.id) AS fallas_blt_periodo
    FROM portafolio p
    LEFT JOIN tickets t
      ON t.codigo_equipo = p.numero_equipo
     AND t.fecha_reporte IS NOT NULL
     AND t.fecha_reporte >= DATE_SUB(CURDATE(), INTERVAL ${CRITICOS_DIAS_UNI} DAY)
     AND t.fecha_reporte < DATE_ADD(CURDATE(), INTERVAL 1 DAY)
     AND UPPER(COALESCE(t.responsabilidad, '')) LIKE '%BLT%'
    WHERE p.numero_equipo IN (${placeholders})
      AND p.estado_registro = 1
      AND (p.inactivo IS NULL OR UPPER(TRIM(CAST(p.inactivo AS CHAR))) NOT IN ('SI','SÍ','1','TRUE','INACTIVO'))
      AND UPPER(TRIM(COALESCE(p.estatus_servicio, ''))) NOT LIKE '%NO EN SERVICIO%'
    GROUP BY p.numero_equipo
  `, codes);

  return new Map(rows.map((row) => [String(row.numero_equipo || '').trim(), {
    fallas: Number(row.fallas_blt_periodo || 0)
  }]));
}

async function captureBeforeSync_uni(body) {
  const candidates = candidateRows_uni(body);
  const candidateIds = uniquePositiveIds_uni(candidates.map((row) => row.id));

  if (!candidateIds.length) {
    return {
      candidateIds: [],
      receivedCandidateIds: [],
      candidateOrder: new Map(),
      existingIds: new Set(),
      beforeTickets: new Map(),
      criticalBefore: new Map()
    };
  }

  const idPlaceholders = candidateIds.map(() => '?').join(', ');
  const [existingRows] = await db.query(
    `SELECT
       id,
       ticket,
       codigo_equipo,
       responsabilidad,
       fecha_reporte,
       descripcion,
       causa,
       accion_en_cierre,
       CASE
         WHEN fecha_reporte IS NOT NULL
          AND fecha_reporte >= DATE_SUB(CURDATE(), INTERVAL ${CRITICOS_DIAS_UNI} DAY)
          AND fecha_reporte < DATE_ADD(CURDATE(), INTERVAL 1 DAY)
          AND UPPER(COALESCE(responsabilidad, '')) LIKE '%BLT%'
         THEN 1 ELSE 0
       END AS calificaba_blt_periodo
     FROM tickets
     WHERE id IN (${idPlaceholders})`,
    candidateIds
  );

  const beforeTickets = new Map(existingRows.map((row) => [Number(row.id), row]));
  const evaluationCandidates = candidates.filter((row) =>
    requiresPostSyncEvaluation_uni(row, beforeTickets.get(Number(row.id)) || null)
  );
  const evaluationIds = uniquePositiveIds_uni(evaluationCandidates.map((row) => row.id));
  const evaluationEquipmentCodes = new Set([
    ...evaluationCandidates.map((row) => String(row.codigo_equipo || '').trim()),
    ...evaluationIds.map((id) => String(beforeTickets.get(id)?.codigo_equipo || '').trim())
  ].filter(Boolean));

  return {
    candidateIds: evaluationIds,
    receivedCandidateIds: candidateIds,
    candidateOrder: new Map(candidates.map((row, index) => [Number(row.id), index])),
    existingIds: new Set(existingRows.map((row) => Number(row.id))),
    beforeTickets,
    criticalBefore: await listCriticalState_uni(
      db,
      [...evaluationEquipmentCodes]
    )
  };
}

/**
 * Resuelve la zona con la misma frontera estructural del alcance UNITED:
 * - si existe codigo_equipo, solo Portafolio por numero_equipo puede resolverla;
 * - sin codigo_equipo, proyecto/proyecto_padre deben resolver de forma no
 *   ambigua a una unica zona_id;
 * - tickets.zona nunca concede alcance por si solo.
 */
async function resolveTicketZoneId_uni(executor, ticketRow) {
  const equipment = String(ticketRow?.codigo_equipo || '').trim();

  if (equipment) {
    const [rows] = await executor.query(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN p.zona_id IS NULL THEN 1 ELSE 0 END) AS zonas_nulas,
        COUNT(DISTINCT p.zona_id) AS zonas_distintas,
        MIN(p.zona_id) AS zona_id
      FROM portafolio p
      WHERE p.estado_registro = 1
        AND TRIM(COALESCE(p.numero_equipo, '')) = TRIM(?)
    `, [equipment]);

    const row = rows[0] || {};
    if (
      Number(row.total || 0) > 0 &&
      Number(row.zonas_nulas || 0) === 0 &&
      Number(row.zonas_distintas || 0) === 1
    ) {
      const zoneId = Number(row.zona_id);
      return Number.isInteger(zoneId) && zoneId > 0 ? zoneId : null;
    }
    return null;
  }

  const projectRefs = [...new Set([
    String(ticketRow?.proyecto || '').trim(),
    String(ticketRow?.proyecto_padre || '').trim()
  ].filter(Boolean))];

  if (!projectRefs.length) return null;

  const clauses = projectRefs.map(() => "LOWER(TRIM(COALESCE(p.proyecto, ''))) = LOWER(TRIM(?))");
  const [rows] = await executor.query(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN p.zona_id IS NULL THEN 1 ELSE 0 END) AS zonas_nulas,
      COUNT(DISTINCT p.zona_id) AS zonas_distintas,
      MIN(p.zona_id) AS zona_id
    FROM portafolio p
    WHERE p.estado_registro = 1
      AND (${clauses.join(' OR ')})
  `, projectRefs);

  const row = rows[0] || {};
  if (
    Number(row.total || 0) > 0 &&
    Number(row.zonas_nulas || 0) === 0 &&
    Number(row.zonas_distintas || 0) === 1
  ) {
    const zoneId = Number(row.zona_id);
    return Number.isInteger(zoneId) && zoneId > 0 ? zoneId : null;
  }

  return null;
}

async function listActiveUserIds_uni(executor) {
  const [rows] = await executor.query(`
    SELECT u.id_SB
    FROM usuarios u
    WHERE u.estado = 1
    ORDER BY u.id_SB ASC
  `);
  return uniquePositiveIds_uni(rows.map((row) => row.id_SB));
}

async function listCurrentPeriodBltCandidateIds_uni(executor, candidateRows) {
  const ids = uniquePositiveIds_uni((candidateRows || []).map((row) => row.id));
  if (!ids.length) return new Set();

  const placeholders = ids.map(() => '?').join(', ');
  const [rows] = await executor.query(`
    SELECT t.id
    FROM tickets t
    WHERE t.id IN (${placeholders})
      AND t.fecha_reporte IS NOT NULL
      AND t.fecha_reporte >= DATE_SUB(CURDATE(), INTERVAL ${CRITICOS_DIAS_UNI} DAY)
      AND t.fecha_reporte < DATE_ADD(CURDATE(), INTERVAL 1 DAY)
      AND UPPER(COALESCE(t.responsabilidad, '')) LIKE '%BLT%'
  `, ids);

  return new Set(rows.map((row) => Number(row.id)));
}

function evaluateCandidateTransitions_uni(candidateRows, beforeContext, currentPeriodBltIds) {
  const criticalBefore = beforeContext?.criticalBefore || new Map();
  const beforeTickets = beforeContext?.beforeTickets || new Map();
  const runningByEquipment = new Map(
    [...criticalBefore.entries()].map(([equipment, value]) => [
      equipment,
      Number(value?.fallas || 0)
    ])
  );

  return (candidateRows || []).map((row) => {
    const ticketId = Number(row?.id);
    const beforeRow = beforeTickets.get(ticketId) || null;
    const beforeEquipment = String(beforeRow?.codigo_equipo || '').trim();
    const equipment = String(row?.codigo_equipo || '').trim();
    const qualifiedBefore = Boolean(beforeRow && Number(beforeRow.calificaba_blt_periodo) === 1);
    const qualifiedAfter = Boolean(
      equipment && currentPeriodBltIds.has(ticketId) && isBlt_uni(row)
    );
    const trappedBefore = Boolean(beforeRow && isPersonaAtrapada_uni(beforeRow));
    const trappedAfter = isPersonaAtrapada_uni(row);
    const eligibleEquipment = Boolean(equipment && criticalBefore.has(equipment));

    // El conteo inicial representa el estado previo completo. Si el Ticket
    // deja de calificar o cambia de equipo, primero se retira de su conjunto
    // anterior para mantener la secuencia real dentro del lote.
    if (
      qualifiedBefore &&
      beforeEquipment &&
      (!qualifiedAfter || beforeEquipment !== equipment)
    ) {
      const previousCount = Number(runningByEquipment.get(beforeEquipment) || 0);
      runningByEquipment.set(beforeEquipment, Math.max(0, previousCount - 1));
    }

    const beforeCount = equipment
      ? Number(runningByEquipment.get(equipment) || 0)
      : 0;
    let afterCount = beforeCount;

    if (
      qualifiedAfter &&
      !(qualifiedBefore && beforeEquipment === equipment)
    ) {
      afterCount = beforeCount + 1;
      runningByEquipment.set(equipment, afterCount);
    }

    const enteredBltSet = !qualifiedBefore && qualifiedAfter;

    return {
      row,
      beforeRow,
      operation: beforeRow ? 'UPDATE' : 'INSERT',
      equipment,
      qualifiedBefore,
      qualifiedAfter,
      trappedBefore,
      trappedAfter,
      trappedTransition: !trappedBefore && trappedAfter,
      enteredBltSet,
      eligibleEquipment,
      beforeCount,
      afterCount,
      wasCritical: Boolean(eligibleEquipment && beforeCount >= CRITICOS_MIN_FALLAS_BLT_UNI),
      becameCritical: Boolean(
        eligibleEquipment &&
        enteredBltSet &&
        beforeCount < CRITICOS_MIN_FALLAS_BLT_UNI &&
        afterCount >= CRITICOS_MIN_FALLAS_BLT_UNI
      ),
      criticalFailure: Boolean(
        eligibleEquipment &&
        enteredBltSet &&
        beforeCount >= CRITICOS_MIN_FALLAS_BLT_UNI
      )
    };
  });
}

function primaryReason_uni(result) {
  if (result?.reason) return result.reason;
  const skippedReasons = result?.skipped_reasons || {};
  const keys = Object.keys(skippedReasons).filter((key) => Number(skippedReasons[key] || 0) > 0);
  if (keys.length === 1) return keys[0];

  const reasons = [...new Set((Array.isArray(result?.decisions) ? result.decisions : [])
    .map((decision) => String(decision?.reason || '').trim())
    .filter(Boolean))];
  return reasons.length === 1 ? reasons[0] : null;
}

async function emitTicketEvent_uni({
  eventCode,
  ticketRow,
  actorUserId,
  title,
  message,
  icon,
  activeUserIds
}) {
  const zoneId = await resolveTicketZoneId_uni(db, ticketRow);
  if (!zoneId) {
    logger.warn('[NOTIFICATION_CRITICAL_TICKET_SKIPPED]', {
      codigo_evento: eventCode,
      ticket_id: Number(ticketRow?.id) || null,
      ticket: ticketRow?.ticket || null,
      reason: 'ZONA_OPERATIVA_NO_RESUELTA'
    });
    return {
      ok: true,
      created: 0,
      skipped: (activeUserIds || []).length,
      recipients: [],
      bell_recipients: [],
      push_recipients: [],
      decisions: [],
      reason: 'ZONA_OPERATIVA_NO_RESUELTA',
      zona_id: null
    };
  }

  const ticketId = Number(ticketRow?.id) || null;
  const ticketRef = String(ticketRow?.ticket || ticketId || '').trim();
  const eventInstanceKey = `ticket-critical:${eventCode}:ticket-id:${ticketId}`;

  const result = await emitBusinessEventSafe_gnral({
    codigoEvento: eventCode,
    destinatarios: activeUserIds || [],
    actorUserId: Number(actorUserId) || null,
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
    label: `tickets-critical:${eventCode}`
  });

  return {
    ...result,
    reason: primaryReason_uni(result),
    zona_id: zoneId,
    event_instance_key: eventInstanceKey
  };
}

async function loadAffectedRows_uni(beforeContext) {
  const candidateIds = uniquePositiveIds_uni(beforeContext?.candidateIds || []);
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

function emptySummary_uni() {
  return {
    affected_tickets: 0,
    inserted_tickets: 0,
    updated_tickets: 0,
    persona_atrapada_equipo_critico: 0,
    persona_atrapada_nuevo_equipo_critico: 0,
    falla_equipo_critico: 0,
    persona_atrapada: 0,
    nuevo_equipo_critico: 0,
    eventos: []
  };
}

function transitionMetadata_uni(evaluation) {
  return {
    operacion: evaluation.operation,
    responsabilidad_antes: evaluation.beforeRow?.responsabilidad || null,
    responsabilidad_despues: evaluation.row?.responsabilidad || null,
    calificaba_blt_antes: evaluation.qualifiedBefore,
    califica_blt_despues: evaluation.qualifiedAfter,
    fallas_blt_35d_antes: evaluation.beforeCount,
    fallas_blt_35d_despues: evaluation.afterCount,
    // Alias conservados para consumidores y validaciones de la Fase 4.
    fallas_blt_antes_del_ticket: evaluation.beforeCount,
    fallas_blt_despues_del_ticket: evaluation.afterCount,
    fallas_blt_antes: evaluation.beforeCount
  };
}

function reasonWithoutEvent_uni(evaluation) {
  if (!evaluation.qualifiedAfter) return 'NO_ERA_BLT';
  if (evaluation.qualifiedBefore) return 'NO_ENTRO_EN_TRANSICION';
  if (!evaluation.eligibleEquipment) return 'EQUIPO_NO_ELEGIBLE';
  if (evaluation.afterCount < CRITICOS_MIN_FALLAS_BLT_UNI) return 'NO_ALCANZO_3';
  return 'NINGUNO';
}

function traceEvaluation_uni(evaluation, eventCode, result, fallbackReason) {
  const created = Number(result?.created || 0);
  logger.info('[NOTIFICATION_CRITICAL_TICKET_EVALUATED]', {
    ticket_id: Number(evaluation.row?.id) || null,
    numero_ticket: evaluation.row?.ticket || null,
    codigo_equipo: evaluation.equipment || null,
    ...transitionMetadata_uni(evaluation),
    evento_resultante: eventCode || 'NINGUNO',
    motivo: created > 0
      ? 'NOTIFICACION_CREADA'
      : (result?.reason || fallbackReason || 'NINGUNO'),
    trace_id: result?.trace_id || null
  });
}

function appendEventResult_uni(summary, eventCode, row, result, counterField, extra = {}) {
  summary[counterField] += Number(result?.created || 0);
  summary.eventos.push({
    codigo_evento: eventCode,
    ticket_id: Number(row?.id) || null,
    ticket: row?.ticket || null,
    created: Number(result?.created || 0),
    skipped: Number(result?.skipped || 0),
    reason: result?.reason || null,
    trace_id: result?.trace_id || null,
    zona_id: result?.zona_id || null,
    event_instance_key: result?.event_instance_key || null,
    ...extra
  });
}

async function processAfterSync_uni(beforeContext, actorUser) {
  const affectedRows = await loadAffectedRows_uni(beforeContext);
  const summary = emptySummary_uni();
  const beforeTickets = beforeContext?.beforeTickets || new Map();
  summary.affected_tickets = affectedRows.length;
  summary.inserted_tickets = affectedRows.filter((row) => !beforeTickets.has(Number(row.id))).length;
  summary.updated_tickets = affectedRows.length - summary.inserted_tickets;

  if (!affectedRows.length) return summary;

  // Se listan todos los usuarios activos. El motor central es la unica capa que
  // decide Evento + Rol, politica obligatoria/opcional, actor, alcance UNITED,
  // preferencias, campana, push y deduplicacion.
  const activeUserIds = await listActiveUserIds_uni(db);
  const actorId = Number(actorUser?.id_SB || actorUser?.id || 0) || null;
  const currentPeriodBltIds = await listCurrentPeriodBltCandidateIds_uni(db, affectedRows);
  const evaluations = evaluateCandidateTransitions_uni(
    affectedRows,
    beforeContext,
    currentPeriodBltIds
  );

  for (const evaluation of evaluations) {
    const row = evaluation.row;
    const equipment = evaluation.equipment;
    let event = null;

    // La clasificacion es mutuamente excluyente y conserva la precedencia
    // operativa acordada para evitar dos Push por el mismo Ticket:
    // 1) atrapada + critico existente; 2) atrapada + nuevo critico;
    // 3) atrapada; 4) falla en critico; 5) nuevo critico.
    if (
      evaluation.trappedAfter &&
      (evaluation.trappedTransition || evaluation.enteredBltSet) &&
      evaluation.wasCritical
    ) {
      event = {
        eventCode: EVENT_PERSONA_ATRAPADA_EQUIPO_CRITICO_UNI,
        title: 'Persona atrapada en equipo crítico',
        message: `Se generó el ticket ${row.ticket} por una persona atrapada en el equipo crítico ${equipment}.`,
        icon: '🚨🆘',
        counterField: 'persona_atrapada_equipo_critico',
        extra: { numero_equipo: equipment }
      };
    } else if (evaluation.trappedAfter && evaluation.becameCritical) {
      event = {
        eventCode: EVENT_PERSONA_ATRAPADA_NUEVO_EQUIPO_CRITICO_UNI,
        title: 'Persona atrapada en un nuevo equipo crítico',
        message: `Se generó el ticket ${row.ticket} por una persona atrapada y el equipo ${equipment} pasó a condición crítica.`,
        icon: '🚨💥',
        counterField: 'persona_atrapada_nuevo_equipo_critico',
        extra: { numero_equipo: equipment }
      };
    } else if (evaluation.trappedTransition) {
      event = {
        eventCode: EVENT_PERSONA_ATRAPADA_UNI,
        title: 'Ticket de persona atrapada',
        message: `Se genero el ticket ${row.ticket} relacionado con una persona atrapada.`,
        icon: '🚨',
        counterField: 'persona_atrapada',
        extra: {}
      };
    } else if (evaluation.criticalFailure) {
      event = {
        eventCode: EVENT_FALLA_EQUIPO_CRITICO_UNI,
        title: 'Falla en equipo crítico',
        message: `Se generó el ticket ${row.ticket} con responsabilidad BLT sobre el equipo crítico ${equipment}.`,
        icon: '🆘',
        counterField: 'falla_equipo_critico',
        extra: { numero_equipo: equipment }
      };
    } else if (evaluation.becameCritical) {
      event = {
        eventCode: EVENT_NUEVO_EQUIPO_CRITICO_UNI,
        title: 'Nuevo equipo crítico',
        message: `El equipo ${equipment} pasó a condición crítica al alcanzar ${evaluation.afterCount} fallas BLT en los últimos ${CRITICOS_DIAS_UNI} días.`,
        icon: '💥',
        counterField: 'nuevo_equipo_critico',
        extra: { numero_equipo: equipment }
      };
    }

    if (!event) {
      traceEvaluation_uni(evaluation, null, null, reasonWithoutEvent_uni(evaluation));
      continue;
    }

    let result;
    try {
      result = await emitTicketEvent_uni({
        eventCode: event.eventCode,
        ticketRow: row,
        actorUserId: actorId,
        title: event.title,
        message: event.message,
        icon: event.icon,
        activeUserIds
      });
    } catch (error) {
      logger.error('[NOTIFICATION_CRITICAL_TICKET_EMIT_FAILED]', {
        ticket_id: Number(row?.id) || null,
        ticket: row?.ticket || null,
        codigo_equipo: equipment || null,
        codigo_evento: event.eventCode,
        error: error.message
      });
      result = {
        created: 0,
        skipped: activeUserIds.length,
        reason: 'ERROR_EMISION',
        trace_id: null
      };
    }

    appendEventResult_uni(
      summary,
      event.eventCode,
      row,
      result,
      event.counterField,
      { ...event.extra, ...transitionMetadata_uni(evaluation) }
    );
    traceEvaluation_uni(evaluation, event.eventCode, result, 'ERROR_EMISION');
  }

  return summary;
}

module.exports = {
  captureBeforeSync_uni,
  processAfterSync_uni
};

'use strict';

// [Aster | 2026-09-29 | ASTER-MG | FASE_1_SALIDA_EQUIPO_CRITICO_NOTIFICACIONES_V001]
// Detecta salida de condicion critica causada por cambios sincronizados de Tickets.
// El vencimiento automatico por transcurso de U35 queda reservado para Fase 2.
// [Aster | 2026-09-07 | ASTER-MG | FASE_1_NOTIFICACIONES_CRITICOS_PERSONA_ATRAPADA_V001]
// Persona atrapada en equipo ya critico se evalua por la transicion de persona atrapada,
// independiente de la responsabilidad del Ticket. BLT solo conserva la regla de criticidad 3/35.
// [Aster | 2026-08-25 | ASTER-MG | FIX_NOTIFICACIONES_FASE_4_CRITICOS_V001]
// Fase 4: los tres eventos criticos de Tickets se emiten exclusivamente por el
// motor central. La sincronizacion de negocio permanece independiente.

const crypto = require('crypto');
const db = require('../../config/db');
const { sqlMexicoCityToday } = require('../../utils/temporal');
const logger = require('../../shared/logger');
const {
  emitBusinessEventSafe_gnral
} = require('./notification-business-emitter.service');
const {
  siteLabel_gnral
} = require('./notification-site-label.service');

const EVENT_FALLA_EQUIPO_CRITICO_UNI = 'FALLA_EQUIPO_CRITICO';
const EVENT_PERSONA_ATRAPADA_UNI = 'PERSONA_ATRAPADA';
const EVENT_NUEVO_EQUIPO_CRITICO_UNI = 'NUEVO_EQUIPO_CRITICO';
const EVENT_EQUIPO_SALE_DE_CRITICO_UNI = 'EQUIPO_SALE_DE_CRITICO';
const EVENT_PERSONA_ATRAPADA_EQUIPO_CRITICO_UNI = 'PERSONA_ATRAPADA_EQUIPO_CRITICO';
const EVENT_PERSONA_ATRAPADA_NUEVO_EQUIPO_CRITICO_UNI = 'PERSONA_ATRAPADA_NUEVO_EQUIPO_CRITICO';
const EVENT_TICKET_CREADO_UNI = 'TICKET_CREADO';
const EVENT_TICKET_ESTATUS_CAMBIADO_UNI = 'TICKET_ESTATUS_CAMBIADO';
const EVENT_TICKET_PRIORIDAD_CAMBIADA_UNI = 'TICKET_PRIORIDAD_CAMBIADA';
const EVENT_TICKET_ASIGNACION_CAMBIADA_UNI = 'TICKET_ASIGNACION_CAMBIADA';
const EVENT_TICKET_RESPONSABILIDAD_CAMBIADA_UNI = 'TICKET_RESPONSABILIDAD_CAMBIADA';
const EVENT_TICKET_ACTUALIZADO_UNI = 'TICKET_ACTUALIZADO';
const FOLLOW_ONLY_TICKET_EVENTS_UNI = new Set([
  EVENT_TICKET_CREADO_UNI,
  EVENT_TICKET_ESTATUS_CAMBIADO_UNI,
  EVENT_TICKET_PRIORIDAD_CAMBIADA_UNI,
  EVENT_TICKET_ASIGNACION_CAMBIADA_UNI,
  EVENT_TICKET_RESPONSABILIDAD_CAMBIADA_UNI,
  EVENT_TICKET_ACTUALIZADO_UNI
]);
// Campos que el sync de Tickets persiste. Un lote puede cambiar varios a la
// vez; el motor emite un solo evento por Ticket, con precedencia para los
// eventos criticos y los cambios de estatus, prioridad o asignacion.
const TICKET_SYNC_FIELDS_UNI = Object.freeze([
  'ticket', 'id_interno', 'folio', 'estado_ticket', 'estado', 'ciudad',
  'proyecto', 'codigo_equipo', 'referencia_en_zona_operativa', 'zona',
  'descripcion', 'fecha_reporte', 'h_reporte', 'estatus_equipo_ir',
  'fecha_llegada', 'h_llegada', 'persona_que_atiende', 'fecha_cierre',
  'h_solucion', 'tecnico', 'estatus_equipo_final', 'causa',
  'accion_en_cierre', 'responsabilidad', 'causa_falla', 'tiempo_llegada',
  'tiempo_solucion', 'tipo_equipo', 'prioridad', 'ejecutivo_call',
  'tiempo_llegada_ii', 'tiempo_solucion_ii', 'blt_empleado',
  'ticket_excede', 'zona_administrativa', 'zona_de_falla',
  'mes_reporte', 'proyecto_padre'
]);
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
     AND t.fecha_reporte >= DATE_SUB(${sqlMexicoCityToday()}, INTERVAL ${CRITICOS_DIAS_UNI} DAY)
     AND t.fecha_reporte < DATE_ADD(${sqlMexicoCityToday()}, INTERVAL 1 DAY)
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
      notificationBatchId: crypto.randomUUID(),
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
       t.*,
       CASE
         WHEN t.fecha_reporte IS NOT NULL
          AND t.fecha_reporte >= DATE_SUB(${sqlMexicoCityToday()}, INTERVAL ${CRITICOS_DIAS_UNI} DAY)
          AND t.fecha_reporte < DATE_ADD(${sqlMexicoCityToday()}, INTERVAL 1 DAY)
          AND UPPER(COALESCE(t.responsabilidad, '')) LIKE '%BLT%'
         THEN 1 ELSE 0
       END AS calificaba_blt_periodo
     FROM tickets t
     WHERE t.id IN (${idPlaceholders})`,
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
    notificationBatchId: crypto.randomUUID(),
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
      AND t.fecha_reporte >= DATE_SUB(${sqlMexicoCityToday()}, INTERVAL ${CRITICOS_DIAS_UNI} DAY)
      AND t.fecha_reporte < DATE_ADD(${sqlMexicoCityToday()}, INTERVAL 1 DAY)
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
        !beforeRow &&
        eligibleEquipment &&
        beforeCount >= CRITICOS_MIN_FALLAS_BLT_UNI
      )
    };
  });
}


function detectCriticalExitTransitions_uni(beforeState, afterState) {
  const before = beforeState instanceof Map ? beforeState : new Map();
  const after = afterState instanceof Map ? afterState : new Map();
  const transitions = [];

  for (const [equipmentRaw, stateBefore] of before.entries()) {
    const equipment = String(equipmentRaw || '').trim();
    if (!equipment) continue;
    const beforeCount = Number(stateBefore?.fallas || 0);
    const afterCount = Number(after.get(equipment)?.fallas || 0);
    if (
      beforeCount >= CRITICOS_MIN_FALLAS_BLT_UNI &&
      afterCount < CRITICOS_MIN_FALLAS_BLT_UNI
    ) {
      transitions.push({
        equipment,
        beforeCount,
        afterCount,
        transition: 'CRITICO_A_NO_CRITICO'
      });
    }
  }

  return transitions.sort((a, b) => a.equipment.localeCompare(b.equipment, 'es-MX'));
}

function criticalExitTrigger_uni(transition, affectedRows, beforeTickets, currentPeriodBltIds) {
  const equipment = String(transition?.equipment || '').trim();
  if (!equipment) return null;
  const beforeMap = beforeTickets instanceof Map ? beforeTickets : new Map();
  const afterBltIds = currentPeriodBltIds instanceof Set ? currentPeriodBltIds : new Set();

  for (const row of Array.isArray(affectedRows) ? affectedRows : []) {
    const ticketId = Number(row?.id || 0);
    const beforeRow = beforeMap.get(ticketId) || null;
    if (!beforeRow) continue;

    const beforeEquipment = String(beforeRow.codigo_equipo || '').trim();
    const afterEquipment = String(row?.codigo_equipo || '').trim();
    const qualifiedBefore = beforeEquipment === equipment && Number(beforeRow.calificaba_blt_periodo) === 1;
    const qualifiedAfterSameEquipment = afterEquipment === equipment && afterBltIds.has(ticketId) && isBlt_uni(row);

    if (qualifiedBefore && !qualifiedAfterSameEquipment) {
      return { row, beforeRow };
    }
  }

  return null;
}

async function emitCriticalExitEvent_uni({
  transition,
  trigger,
  actorUserId,
  activeUserIds
}) {
  const equipment = String(transition?.equipment || '').trim();
  const row = trigger?.row || null;
  const beforeRow = trigger?.beforeRow || null;
  const ticketId = Number(row?.id || beforeRow?.id || 0) || null;
  const ticketRef = String(row?.ticket || beforeRow?.ticket || ticketId || '').trim();

  if (!equipment || !ticketId) {
    return {
      ok: true,
      created: 0,
      skipped: Array.isArray(activeUserIds) ? activeUserIds.length : 0,
      recipients: [],
      bell_recipients: [],
      push_recipients: [],
      decisions: [],
      reason: 'DISPARADOR_SALIDA_CRITICO_NO_RESUELTO',
      zona_id: null,
      event_instance_key: null
    };
  }

  // La zona corresponde al equipo que DEJO de ser critico, incluso si el
  // Ticket disparador fue movido a otro equipo durante el mismo sync.
  const zoneId = await resolveTicketZoneId_uni(db, { codigo_equipo: equipment });
  if (!zoneId) {
    logger.warn('[NOTIFICATION_CRITICAL_EXIT_SKIPPED]', {
      codigo_evento: EVENT_EQUIPO_SALE_DE_CRITICO_UNI,
      ticket_id: ticketId,
      ticket: ticketRef || null,
      codigo_equipo: equipment,
      reason: 'ZONA_OPERATIVA_NO_RESUELTA'
    });
    return {
      ok: true,
      created: 0,
      skipped: Array.isArray(activeUserIds) ? activeUserIds.length : 0,
      recipients: [],
      bell_recipients: [],
      push_recipients: [],
      decisions: [],
      reason: 'ZONA_OPERATIVA_NO_RESUELTA',
      zona_id: null,
      event_instance_key: null
    };
  }

  const siteSource = beforeRow || row || {};
  const site = siteLabel_gnral(siteSource);
  const beforeCount = Number(transition?.beforeCount || 0);
  const afterCount = Number(transition?.afterCount || 0);
  const eventInstanceKey = [
    'critical-exit',
    equipment,
    `ticket-id:${ticketId}`,
    `from:${beforeCount}`,
    `to:${afterCount}`,
    `before-resp:${normalizeText_uni(beforeRow?.responsabilidad)}`,
    `after-resp:${normalizeText_uni(row?.responsabilidad)}`,
    `before-date:${dateKey_uni(beforeRow?.fecha_reporte)}`,
    `after-date:${dateKey_uni(row?.fecha_reporte)}`
  ].join(':');

  const result = await emitBusinessEventSafe_gnral({
    codigoEvento: EVENT_EQUIPO_SALE_DE_CRITICO_UNI,
    destinatarios: activeUserIds || [],
    actorUserId: Number(actorUserId) || null,
    zonaOperativaId: zoneId,
    requireRoleMatrix: true,
    allowMissingEvent: true,
    titulo: 'Equipo dejó de ser crítico',
    mensaje: `Se generó salida de condición crítica · ${site}. Actualmente registra ${afterCount} fallas BLT en los últimos ${CRITICOS_DIAS_UNI} días.`,
    icono: '✅',
    accion: 'ABRIR_TICKET',
    idReferencia: ticketId,
    ruta: ticketRef ? `detalle:ticket:${ticketRef}` : null,
    eventInstanceKey,
    contextoSeguimiento: {
      dominio: 'UNITED',
      tipo: 'TICKET',
      id_ticket: ticketId,
      ticket: ticketRef || null,
      numero_equipo: equipment,
      proyecto: beforeRow?.proyecto || beforeRow?.proyecto_padre || row?.proyecto || row?.proyecto_padre || null,
      zona_id: zoneId,
      identificador_operacion: eventInstanceKey
    }
  }, {
    label: `tickets-critical:${EVENT_EQUIPO_SALE_DE_CRITICO_UNI}`
  });

  return {
    ...result,
    reason: primaryReason_uni(result),
    zona_id: zoneId,
    event_instance_key: eventInstanceKey
  };
}

function comparableText_uni(value) {
  return String(value == null ? '' : value).trim();
}

function storedValue_uni(value) {
  if (value instanceof Date) return value.getTime();
  if (value == null) return null;
  return String(value);
}

function anyChanged_uni(before, after, fields) {
  return fields.some((field) => comparableText_uni(before?.[field]) !== comparableText_uni(after?.[field]));
}

function ticketStatus_uni(row) {
  return comparableText_uni(row?.estado_ticket || row?.estado) || 'Sin estatus';
}

function equipmentFinalStatus_uni(row) {
  return comparableText_uni(row?.estatus_equipo_final) || 'Sin estatus final';
}

function isClosedTicketStatus_uni(value) {
  const normalized = normalizeText_uni(value).replace(/\s+/g, ' ');
  return /\bcerrad[oa]\b/.test(normalized);
}

function nativeTicketTransition_uni(before, after) {
  if (!after) return null;
  if (!before) return {
    eventCode: EVENT_TICKET_CREADO_UNI,
    kind: 'CREACION',
    fields: ['ticket']
  };
  if (anyChanged_uni(before, after, ['estado_ticket', 'estado', 'estatus_equipo_final', 'fecha_cierre'])) {
    return {
      eventCode: EVENT_TICKET_ESTATUS_CAMBIADO_UNI,
      kind: 'ESTATUS',
      fields: ['estado_ticket', 'estado', 'estatus_equipo_final', 'fecha_cierre']
    };
  }
  if (anyChanged_uni(before, after, ['prioridad'])) {
    return {
      eventCode: EVENT_TICKET_PRIORIDAD_CAMBIADA_UNI,
      kind: 'PRIORIDAD',
      fields: ['prioridad']
    };
  }
  if (anyChanged_uni(before, after, ['responsabilidad'])) {
    return {
      eventCode: EVENT_TICKET_RESPONSABILIDAD_CAMBIADA_UNI,
      kind: 'RESPONSABILIDAD',
      fields: ['responsabilidad']
    };
  }
  if (anyChanged_uni(before, after, ['tecnico', 'supervisor', 'persona_que_atiende', 'blt_empleado', 'ejecutivo_call'])) {
    return {
      eventCode: EVENT_TICKET_ASIGNACION_CAMBIADA_UNI,
      kind: 'ASIGNACION',
      fields: ['tecnico', 'supervisor', 'persona_que_atiende', 'blt_empleado', 'ejecutivo_call']
    };
  }
  const changedFields = TICKET_SYNC_FIELDS_UNI.filter((field) =>
    storedValue_uni(before?.[field]) !== storedValue_uni(after?.[field])
  );
  if (changedFields.length) {
    return {
      eventCode: EVENT_TICKET_ACTUALIZADO_UNI,
      kind: 'ACTUALIZACION',
      fields: changedFields
    };
  }
  return null;
}

function ticketTransitionIdentity_uni(before, after, transition) {
  const selected = {};
  for (const field of transition.fields) {
    selected[field] = {
      before: comparableText_uni(before?.[field]),
      after: comparableText_uni(after?.[field])
    };
  }
  return crypto.createHash('sha256').update(JSON.stringify({
    id: Number(after?.id || before?.id || 0),
    event: transition.eventCode,
    selected
  })).digest('hex');
}

function ticketTransitionPresentation_uni(transition, before, after) {
  const ticket = String(after?.ticket || before?.ticket || after?.id || '').trim();
  const site = siteLabel_gnral(after || before || {});
  if (transition.kind === 'CREACION') {
    return {
      title: 'Ticket generado',
      message: `Se generó ticket ${ticket} · ${site}.`,
      icon: '🎫'
    };
  }
  if (transition.kind === 'ESTATUS') {
    const previousTicketStatus = ticketStatus_uni(before);
    const currentTicketStatus = ticketStatus_uni(after);
    const previousFinalStatus = equipmentFinalStatus_uni(before);
    const currentFinalStatus = equipmentFinalStatus_uni(after);
    const closedTransition = !isClosedTicketStatus_uni(previousTicketStatus) &&
      isClosedTicketStatus_uni(currentTicketStatus);

    // Norma Seguimiento Especial: el cierre se reconoce solo en la transicion
    // hacia Cerrado. Updates posteriores de un Ticket ya cerrado no vuelven a
    // anunciar "Ticket cerrado". El cierre siempre expone Estatus Final Equipo.
    if (closedTransition) {
      return {
        title: 'Ticket cerrado',
        message: `Se generó cierre del ticket ${ticket} · ${site}. Estatus Final del Equipo: ${currentFinalStatus}.`,
        icon: '✅'
      };
    }

    if (previousTicketStatus !== currentTicketStatus) {
      return {
        title: 'Estatus de Ticket actualizado',
        message: `Se generó cambio de estatus del ticket ${ticket} de ${previousTicketStatus} a ${currentTicketStatus} · ${site}.`,
        icon: '🔄'
      };
    }

    if (previousFinalStatus !== currentFinalStatus) {
      return {
        title: 'Estatus Final del Equipo actualizado',
        message: `Se generó cambio de Estatus Final del Equipo del ticket ${ticket} de ${previousFinalStatus} a ${currentFinalStatus} · ${site}.`,
        icon: '🔄'
      };
    }

    return {
      title: 'Actualización de cierre',
      message: `Se generó actualización de cierre del ticket ${ticket} · ${site}. Estatus Final del Equipo: ${currentFinalStatus}.`,
      icon: '🔄'
    };
  }
  if (transition.kind === 'PRIORIDAD') {
    return {
      title: 'Prioridad de Ticket actualizada',
      message: `Se generó cambio de prioridad del ticket ${ticket} de ${before?.prioridad || 'Sin prioridad'} a ${after?.prioridad || 'Sin prioridad'} · ${site}.`,
      icon: '⚠️'
    };
  }
  if (transition.kind === 'RESPONSABILIDAD') {
    return {
      title: 'Responsabilidad de Ticket actualizada',
      message: `Se generó cambio de responsabilidad del ticket ${ticket} de ${before?.responsabilidad || 'Sin definir'} a ${after?.responsabilidad || 'Sin definir'} · ${site}.`,
      icon: '🔁'
    };
  }
  if (transition.kind === 'ACTUALIZACION') {
    return {
      title: 'Ticket actualizado',
      message: `Se actualizó la información del ticket ${ticket} · ${site}.`,
      icon: '🔄'
    };
  }
  return {
    title: 'Asignación de Ticket actualizada',
    message: `Se generó actualización de asignación del ticket ${ticket} · ${site}.`,
    icon: '👤'
  };
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

function isFollowOnlyTicketEvent_uni(eventCode) {
  return FOLLOW_ONLY_TICKET_EVENTS_UNI.has(String(eventCode || '').trim());
}

async function emitTicketEvent_uni({
  eventCode,
  ticketRow,
  actorUserId,
  title,
  message,
  icon,
  activeUserIds,
  eventInstanceKey: providedEventInstanceKey = null
}) {
  const followOnly = isFollowOnlyTicketEvent_uni(eventCode);
  const producerRecipients = followOnly ? [] : (activeUserIds || []);
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
      skipped: producerRecipients.length,
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
  const eventInstanceKey = providedEventInstanceKey || `ticket-critical:${eventCode}:ticket-id:${ticketId}`;

  const result = await emitBusinessEventSafe_gnral({
    codigoEvento: eventCode,
    destinatarios: producerRecipients,
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
    eventInstanceKey,
    contextoSeguimiento: {
      dominio: 'UNITED',
      tipo: 'TICKET',
      id_ticket: ticketId,
      ticket: ticketRow?.ticket || null,
      numero_equipo: ticketRow?.codigo_equipo || ticketRow?.equipo || null,
      proyecto: ticketRow?.proyecto || ticketRow?.proyecto_padre || null,
      zona_id: zoneId,
      identificador_operacion: eventInstanceKey
    }
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
    equipo_sale_de_critico: 0,
    ticket_creado: 0,
    ticket_estatus_cambiado: 0,
    ticket_prioridad_cambiada: 0,
    ticket_asignacion_cambiada: 0,
    ticket_responsabilidad_cambiada: 0,
    ticket_actualizado: 0,
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
  const receivedRows = await loadReceivedRows_uni(beforeContext);
  const summary = emptySummary_uni();
  const beforeTickets = beforeContext?.beforeTickets || new Map();
  summary.affected_tickets = receivedRows.length;
  summary.inserted_tickets = receivedRows.filter((row) => !beforeTickets.has(Number(row.id))).length;
  summary.updated_tickets = receivedRows.length - summary.inserted_tickets;

  if (!receivedRows.length) return summary;

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
  const criticalBefore = beforeContext?.criticalBefore instanceof Map
    ? beforeContext.criticalBefore
    : new Map();
  const criticalAfter = await listCriticalState_uni(db, [...criticalBefore.keys()]);
  const criticalExitTransitions = detectCriticalExitTransitions_uni(criticalBefore, criticalAfter);
  const nativeWinnerTicketIds = new Set();
  // La identidad de una actualización general corresponde a este sync y al
  // Ticket, no a cada campo. Así un cambio posterior con los mismos valores
  // sigue siendo una actividad nueva para quien lo sigue.
  const updateBatchId = beforeContext?.notificationBatchId || crypto.randomUUID();

  for (const evaluation of evaluations) {
    const row = evaluation.row;
    const equipment = evaluation.equipment;
    const site = siteLabel_gnral(row);
    let event = null;

    // La clasificacion es mutuamente excluyente y conserva la precedencia
    // operativa acordada para evitar dos Push por el mismo Ticket:
    // 1) atrapada + critico existente; 2) atrapada + nuevo critico;
    // 3) atrapada; 4) falla en critico; 5) nuevo critico.
    if (
      evaluation.trappedAfter &&
      evaluation.trappedTransition &&
      evaluation.wasCritical
    ) {
      event = {
        eventCode: EVENT_PERSONA_ATRAPADA_EQUIPO_CRITICO_UNI,
        title: 'Ticket de Persona Atrapada en Equipo Crítico',
        message: `Se generó ticket ${row.ticket} por persona atrapada · ${site}.`,
        icon: '🚨🆘',
        counterField: 'persona_atrapada_equipo_critico',
        extra: { numero_equipo: equipment }
      };
    } else if (evaluation.trappedAfter && evaluation.becameCritical) {
      event = {
        eventCode: EVENT_PERSONA_ATRAPADA_NUEVO_EQUIPO_CRITICO_UNI,
        title: 'Ticket de Persona Atrapada en Nuevo Equipo Crítico',
        message: `Se generó ticket ${row.ticket} por persona atrapada · ${site}. El equipo pasó a condición crítica.`,
        icon: '🚨💥',
        counterField: 'persona_atrapada_nuevo_equipo_critico',
        extra: { numero_equipo: equipment }
      };
    } else if (evaluation.trappedTransition) {
      event = {
        eventCode: EVENT_PERSONA_ATRAPADA_UNI,
        title: 'Ticket de Persona Atrapada',
        message: `Se generó ticket ${row.ticket} por persona atrapada · ${site}.`,
        icon: '🚨',
        counterField: 'persona_atrapada',
        extra: {}
      };
    } else if (evaluation.criticalFailure) {
      event = {
        eventCode: EVENT_FALLA_EQUIPO_CRITICO_UNI,
        title: 'Falla en Equipo Crítico',
        message: `Se generó ticket ${row.ticket} · ${site}.`,
        icon: '🆘',
        counterField: 'falla_equipo_critico',
        extra: { numero_equipo: equipment }
      };
    } else if (evaluation.becameCritical) {
      event = {
        eventCode: EVENT_NUEVO_EQUIPO_CRITICO_UNI,
        title: 'Nuevo Equipo Crítico',
        message: `Se generó condición de equipo crítico por ticket ${row.ticket} · ${site}. Se alcanzaron ${evaluation.afterCount} fallas BLT en los últimos ${CRITICOS_DIAS_UNI} días.`,
        icon: '💥',
        counterField: 'nuevo_equipo_critico',
        extra: { numero_equipo: equipment }
      };
    }

    if (!event) {
      traceEvaluation_uni(evaluation, null, null, reasonWithoutEvent_uni(evaluation));
      continue;
    }

    // La seleccion del ganador, y no el resultado del canal, bloquea cualquier
    // evento nativo de menor precedencia para el mismo Ticket.
    nativeWinnerTicketIds.add(Number(row.id));

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

  for (const transition of criticalExitTransitions) {
    const trigger = criticalExitTrigger_uni(
      transition,
      affectedRows,
      beforeTickets,
      currentPeriodBltIds
    );

    if (!trigger) {
      logger.warn('[NOTIFICATION_CRITICAL_EXIT_SKIPPED]', {
        codigo_evento: EVENT_EQUIPO_SALE_DE_CRITICO_UNI,
        codigo_equipo: transition.equipment,
        fallas_blt_35d_antes: transition.beforeCount,
        fallas_blt_35d_despues: transition.afterCount,
        reason: 'DISPARADOR_SALIDA_CRITICO_NO_RESUELTO'
      });
      continue;
    }

    const triggerTicketId = Number(trigger.row?.id || trigger.beforeRow?.id || 0) || null;
    if (triggerTicketId) nativeWinnerTicketIds.add(triggerTicketId);

    let result;
    try {
      result = await emitCriticalExitEvent_uni({
        transition,
        trigger,
        actorUserId: actorId,
        activeUserIds
      });
    } catch (error) {
      logger.error('[NOTIFICATION_CRITICAL_EXIT_EMIT_FAILED]', {
        ticket_id: triggerTicketId,
        ticket: trigger.row?.ticket || trigger.beforeRow?.ticket || null,
        codigo_equipo: transition.equipment,
        codigo_evento: EVENT_EQUIPO_SALE_DE_CRITICO_UNI,
        error: error.message
      });
      result = {
        created: 0,
        skipped: activeUserIds.length,
        reason: 'ERROR_EMISION',
        trace_id: null,
        event_instance_key: null,
        zona_id: null
      };
    }

    appendEventResult_uni(
      summary,
      EVENT_EQUIPO_SALE_DE_CRITICO_UNI,
      trigger.row || trigger.beforeRow,
      result,
      'equipo_sale_de_critico',
      {
        numero_equipo: transition.equipment,
        transicion: transition.transition,
        fallas_blt_35d_antes: transition.beforeCount,
        fallas_blt_35d_despues: transition.afterCount
      }
    );

    logger.info('[NOTIFICATION_CRITICAL_EXIT_EVALUATED]', {
      ticket_id: triggerTicketId,
      numero_ticket: trigger.row?.ticket || trigger.beforeRow?.ticket || null,
      codigo_equipo: transition.equipment,
      fallas_blt_35d_antes: transition.beforeCount,
      fallas_blt_35d_despues: transition.afterCount,
      evento_resultante: EVENT_EQUIPO_SALE_DE_CRITICO_UNI,
      motivo: Number(result?.created || 0) > 0
        ? 'NOTIFICACION_CREADA'
        : (result?.reason || 'NINGUNO'),
      trace_id: result?.trace_id || null
    });
  }

  for (const row of receivedRows) {
    const ticketId = Number(row.id);
    if (nativeWinnerTicketIds.has(ticketId)) continue;

    const beforeRow = beforeTickets.get(ticketId) || null;
    const transition = nativeTicketTransition_uni(beforeRow, row);
    if (!transition) continue;

    const presentation = ticketTransitionPresentation_uni(transition, beforeRow, row);
    const eventInstanceKey = transition.eventCode === EVENT_TICKET_ACTUALIZADO_UNI
      ? `ticket-native:${transition.eventCode}:ticket-id:${ticketId}:sync:${updateBatchId}`
      : `ticket-native:${transition.eventCode}:${ticketTransitionIdentity_uni(beforeRow, row, transition)}`;
    const counterFieldByEvent = {
      [EVENT_TICKET_CREADO_UNI]: 'ticket_creado',
      [EVENT_TICKET_ESTATUS_CAMBIADO_UNI]: 'ticket_estatus_cambiado',
      [EVENT_TICKET_PRIORIDAD_CAMBIADA_UNI]: 'ticket_prioridad_cambiada',
      [EVENT_TICKET_ASIGNACION_CAMBIADA_UNI]: 'ticket_asignacion_cambiada',
      [EVENT_TICKET_RESPONSABILIDAD_CAMBIADA_UNI]: 'ticket_responsabilidad_cambiada',
      [EVENT_TICKET_ACTUALIZADO_UNI]: 'ticket_actualizado'
    };

    let result;
    try {
      result = await emitTicketEvent_uni({
        eventCode: transition.eventCode,
        ticketRow: row,
        actorUserId: actorId,
        title: presentation.title,
        message: presentation.message,
        icon: presentation.icon,
        activeUserIds,
        eventInstanceKey
      });
    } catch (error) {
      logger.error('[NOTIFICATION_NATIVE_TICKET_EMIT_FAILED]', {
        ticket_id: ticketId,
        ticket: row?.ticket || null,
        codigo_evento: transition.eventCode,
        error: error.message
      });
      result = {
        created: 0,
        skipped: activeUserIds.length,
        reason: 'ERROR_EMISION',
        trace_id: null,
        event_instance_key: eventInstanceKey
      };
    }

    appendEventResult_uni(
      summary,
      transition.eventCode,
      row,
      result,
      counterFieldByEvent[transition.eventCode],
      { transicion: transition.kind }
    );
  }

  return summary;
}

module.exports = {
  captureBeforeSync_uni,
  processAfterSync_uni,
  nativeTicketTransition_uni,
  ticketTransitionIdentity_uni,
  ticketTransitionPresentation_uni,
  ticketStatus_uni,
  equipmentFinalStatus_uni,
  isClosedTicketStatus_uni,
  resolveTicketZoneId_uni,
  isFollowOnlyTicketEvent_uni,
  emitTicketEvent_uni,
  emitCriticalExitEvent_uni,
  detectCriticalExitTransitions_uni,
  criticalExitTrigger_uni,
  EVENT_EQUIPO_SALE_DE_CRITICO_UNI,
  FOLLOW_ONLY_TICKET_EVENTS_UNI
};

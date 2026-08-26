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
  const equipmentCodes = [...new Set(candidates
    .map((row) => String(row.codigo_equipo || '').trim())
    .filter(Boolean))];

  if (!candidateIds.length) {
    return {
      candidateIds: [],
      candidateOrder: new Map(),
      existingIds: new Set(),
      criticalBefore: new Map()
    };
  }

  const idPlaceholders = candidateIds.map(() => '?').join(', ');
  const [existingRows] = await db.query(
    `SELECT id FROM tickets WHERE id IN (${idPlaceholders})`,
    candidateIds
  );

  return {
    candidateIds,
    candidateOrder: new Map(candidates.map((row, index) => [Number(row.id), index])),
    existingIds: new Set(existingRows.map((row) => Number(row.id))),
    criticalBefore: await listCriticalState_uni(db, equipmentCodes)
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

async function listCurrentPeriodBltInsertedIds_uni(executor, insertedRows) {
  const ids = uniquePositiveIds_uni((insertedRows || []).map((row) => row.id));
  if (!ids.length) return new Set();

  const placeholders = ids.map(() => '?').join(', ');
  const [rows] = await executor.query(`
    SELECT t.id
    FROM tickets t
    WHERE t.id IN (${placeholders})
      AND t.fecha_reporte IS NOT NULL
      AND t.fecha_reporte >= DATE_SUB(CURDATE(), INTERVAL ${CRITICOS_DIAS_UNI} DAY)
      AND UPPER(COALESCE(t.responsabilidad, '')) LIKE '%BLT%'
  `, ids);

  return new Set(rows.map((row) => Number(row.id)));
}

function findNewCriticalTriggers_uni(insertedRows, beforeContext, currentPeriodBltIds) {
  const runningByEquipment = new Map();
  const triggerByEquipment = new Map();

  for (const row of insertedRows || []) {
    const equipment = String(row?.codigo_equipo || '').trim();
    if (!equipment || !currentPeriodBltIds.has(Number(row.id)) || !isBlt_uni(row)) continue;

    const before = beforeContext?.criticalBefore?.get(equipment);
    if (!before) continue;

    const running = runningByEquipment.has(equipment)
      ? Number(runningByEquipment.get(equipment) || 0)
      : Number(before.fallas || 0);
    const afterThisTicket = running + 1;

    if (
      running < CRITICOS_MIN_FALLAS_BLT_UNI &&
      afterThisTicket >= CRITICOS_MIN_FALLAS_BLT_UNI &&
      !triggerByEquipment.has(equipment)
    ) {
      triggerByEquipment.set(equipment, {
        row,
        beforeCount: running,
        afterCount: afterThisTicket
      });
    }

    runningByEquipment.set(equipment, afterThisTicket);
  }

  return triggerByEquipment;
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

async function loadInsertedRows_uni(beforeContext) {
  const newCandidateIds = (beforeContext?.candidateIds || [])
    .filter((id) => !beforeContext.existingIds.has(Number(id)));

  if (!newCandidateIds.length) return [];

  const placeholders = newCandidateIds.map(() => '?').join(', ');
  const [rows] = await db.query(`
    SELECT *
    FROM tickets
    WHERE id IN (${placeholders})
  `, newCandidateIds);

  const order = beforeContext?.candidateOrder || new Map();
  return rows.sort((a, b) =>
    Number(order.get(Number(a.id)) ?? Number.MAX_SAFE_INTEGER) -
    Number(order.get(Number(b.id)) ?? Number.MAX_SAFE_INTEGER)
  );
}

function emptySummary_uni() {
  return {
    inserted_tickets: 0,
    falla_equipo_critico: 0,
    persona_atrapada: 0,
    nuevo_equipo_critico: 0,
    eventos: []
  };
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
  const insertedRows = await loadInsertedRows_uni(beforeContext);
  const summary = emptySummary_uni();
  summary.inserted_tickets = insertedRows.length;

  if (!insertedRows.length) return summary;

  // Se listan todos los usuarios activos. El motor central es la unica capa que
  // decide Evento + Rol, politica obligatoria/opcional, actor, alcance UNITED,
  // preferencias, campana, push y deduplicacion.
  const activeUserIds = await listActiveUserIds_uni(db);
  const actorId = Number(actorUser?.id_SB || actorUser?.id || 0) || null;
  const currentPeriodBltIds = await listCurrentPeriodBltInsertedIds_uni(db, insertedRows);
  const newCriticalTriggers = findNewCriticalTriggers_uni(
    insertedRows,
    beforeContext,
    currentPeriodBltIds
  );

  for (const row of insertedRows) {
    if (isPersonaAtrapada_uni(row)) {
      const result = await emitTicketEvent_uni({
        eventCode: EVENT_PERSONA_ATRAPADA_UNI,
        ticketRow: row,
        actorUserId: actorId,
        title: 'Ticket de persona atrapada',
        message: `Se genero el ticket ${row.ticket} relacionado con una persona atrapada.`,
        icon: '🚨',
        activeUserIds
      });
      appendEventResult_uni(
        summary,
        EVENT_PERSONA_ATRAPADA_UNI,
        row,
        result,
        'persona_atrapada'
      );
    }

    const equipment = String(row.codigo_equipo || '').trim();
    const before = beforeContext?.criticalBefore?.get(equipment);
    if (
      equipment &&
      before &&
      Number(before.fallas || 0) >= CRITICOS_MIN_FALLAS_BLT_UNI &&
      isBlt_uni(row)
    ) {
      const result = await emitTicketEvent_uni({
        eventCode: EVENT_FALLA_EQUIPO_CRITICO_UNI,
        ticketRow: row,
        actorUserId: actorId,
        title: 'Nueva falla en equipo critico',
        message: `Se genero el ticket ${row.ticket} con responsabilidad BLT sobre el equipo critico ${equipment}.`,
        icon: '💥',
        activeUserIds
      });
      appendEventResult_uni(
        summary,
        EVENT_FALLA_EQUIPO_CRITICO_UNI,
        row,
        result,
        'falla_equipo_critico',
        { fallas_blt_antes: Number(before.fallas || 0) }
      );
    }
  }

  for (const [equipment, trigger] of newCriticalTriggers.entries()) {
    const row = trigger.row;
    const result = await emitTicketEvent_uni({
      eventCode: EVENT_NUEVO_EQUIPO_CRITICO_UNI,
      ticketRow: row,
      actorUserId: actorId,
      title: 'Nuevo equipo critico',
      message: `El equipo ${equipment} paso a condicion critica al alcanzar ${trigger.afterCount} fallas BLT en los ultimos ${CRITICOS_DIAS_UNI} dias.`,
      icon: '💥',
      activeUserIds
    });
    appendEventResult_uni(
      summary,
      EVENT_NUEVO_EQUIPO_CRITICO_UNI,
      row,
      result,
      'nuevo_equipo_critico',
      {
        numero_equipo: equipment,
        fallas_blt_antes_del_ticket: trigger.beforeCount,
        fallas_blt_despues_del_ticket: trigger.afterCount
      }
    );
  }

  return summary;
}

module.exports = {
  captureBeforeSync_uni,
  processAfterSync_uni
};

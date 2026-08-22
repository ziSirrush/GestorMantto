'use strict';

const db = require('../../config/db');

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
    .filter(value => Number.isInteger(value) && value > 0))];
}

function candidateRows_uni(body) {
  const inserts = Array.isArray(body?.inserts) ? body.inserts : [];
  const updates = Array.isArray(body?.updates) ? body.updates : [];
  return [...inserts, ...updates]
    .filter(row => row && Number.isInteger(Number(row.id)) && Number(row.id) > 0)
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
  return PERSONA_ATRAPADA_KEYWORDS_UNI.some(keyword => blob.includes(keyword));
}

async function listCriticalState_uni(executor, equipmentCodes) {
  const codes = [...new Set((equipmentCodes || [])
    .map(value => String(value || '').trim())
    .filter(Boolean))];

  if (!codes.length) return new Map();

  const placeholders = codes.map(() => '?').join(', ');
  const [rows] = await executor.query(`
    SELECT
      p.numero_equipo,
      MAX(p.zona_operativa) AS zona_operativa,
      MAX(p.proyecto) AS proyecto,
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

  return new Map(rows.map(row => [String(row.numero_equipo || '').trim(), {
    fallas: Number(row.fallas_blt_periodo || 0),
    zona_operativa: row.zona_operativa || null,
    proyecto: row.proyecto || null
  }]));
}

async function captureBeforeSync_uni(body) {
  const candidates = candidateRows_uni(body);
  const candidateIds = uniquePositiveIds_uni(candidates.map(row => row.id));
  const equipmentCodes = [...new Set(candidates
    .map(row => String(row.codigo_equipo || '').trim())
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
    existingIds: new Set(existingRows.map(row => Number(row.id))),
    criticalBefore: await listCriticalState_uni(db, equipmentCodes)
  };
}

async function findZoneId_uni(executor, zoneValue) {
  const raw = String(zoneValue || '').trim();
  if (!raw) return null;

  const normalized = raw.toUpperCase().replace(/[-\s]/g, '');
  const [rows] = await executor.query(`
    SELECT id_zona
    FROM z_op
    WHERE estado = 1
      AND (
        UPPER(TRIM(zona)) = UPPER(TRIM(?))
        OR UPPER(REPLACE(REPLACE(TRIM(zona), '-', ''), ' ', '')) = ?
      )
    ORDER BY id_zona ASC
    LIMIT 1
  `, [raw, normalized]);

  return rows[0] ? Number(rows[0].id_zona) || null : null;
}

async function resolveTicketZoneId_uni(executor, ticketRow) {
  const candidates = [];
  const directZone = String(ticketRow?.zona || '').trim();
  if (directZone) candidates.push(directZone);

  const equipment = String(ticketRow?.codigo_equipo || '').trim();
  const project = String(ticketRow?.proyecto || ticketRow?.proyecto_padre || '').trim();

  if (equipment || project) {
    const clauses = [];
    const params = [];

    if (equipment) {
      clauses.push("TRIM(COALESCE(numero_equipo, '')) = TRIM(?)");
      params.push(equipment);
    }
    if (project) {
      clauses.push("TRIM(COALESCE(proyecto, '')) = TRIM(?)");
      params.push(project);
    }

    const [rows] = await executor.query(`
      SELECT zona_operativa
      FROM portafolio
      WHERE estado_registro = 1
        AND (${clauses.join(' OR ')})
        AND zona_operativa IS NOT NULL
        AND TRIM(zona_operativa) <> ''
      ORDER BY CASE WHEN TRIM(COALESCE(numero_equipo, '')) = TRIM(?) THEN 0 ELSE 1 END,
               id_portafolio DESC
      LIMIT 5
    `, [...params, equipment || '']);

    rows.forEach(row => {
      const value = String(row.zona_operativa || '').trim();
      if (value && !candidates.includes(value)) candidates.push(value);
    });
  }

  for (const candidate of candidates) {
    const zoneId = await findZoneId_uni(executor, candidate);
    if (zoneId) return zoneId;
  }

  return null;
}

async function loadEvent_uni(executor, eventCode) {
  const [rows] = await executor.query(`
    SELECT
      codigo_evento,
      nombre_evento,
      titulo_default,
      mensaje_default,
      icono_default,
      campana_default,
      push_default,
      accion_destino,
      ruta_default
    FROM notificacion_eventos
    WHERE codigo_evento = ?
      AND activo = 1
    LIMIT 1
  `, [eventCode]);
  return rows[0] || null;
}

async function matrixConfigured_uni(executor, eventCode) {
  const [rows] = await executor.query(`
    SELECT COUNT(*) AS total
    FROM notificacion_evento_roles
    WHERE codigo_evento = ?
      AND activo = 1
  `, [eventCode]);
  return Number(rows[0]?.total || 0) > 0;
}

async function listMatrixRecipients_uni(executor, event, zoneId, actorUserId) {
  const params = [event.codigo_evento, zoneId];
  let actorClause = '';

  if (Number.isInteger(Number(actorUserId)) && Number(actorUserId) > 0) {
    actorClause = 'AND u.id_SB <> ?';
    params.push(Number(actorUserId));
  }

  const [rows] = await executor.query(`
    SELECT DISTINCT
      u.id_SB AS id_usuario,
      ner.politica,
      COALESCE(np.campana, ?, 1) AS campana,
      COALESCE(np.push, ?, 0) AS push,
      COALESCE(np.silenciada, 0) AS silenciada
    FROM usuarios u
    INNER JOIN usuario_roles ur
      ON ur.id_usuario = u.id_SB
     AND ur.activo = 1
     AND ur.principal = 1
    INNER JOIN roles r
      ON r.id_rol = ur.id_rol
     AND r.estado = 1
    INNER JOIN notificacion_evento_roles ner
      ON ner.codigo_evento = ?
     AND ner.id_rol = ur.id_rol
     AND ner.activo = 1
    INNER JOIN usuario_zop uz
      ON uz.usuario_id = u.id_SB
     AND uz.zona_id = ?
     AND uz.estado = 1
    LEFT JOIN notificacion_preferencias np
      ON np.id_usuario = u.id_SB
     AND np.codigo_evento = ner.codigo_evento
    WHERE u.estado = 1
      AND (
        SELECT COUNT(*)
        FROM usuario_roles ur_count
        INNER JOIN roles r_count
          ON r_count.id_rol = ur_count.id_rol
         AND r_count.estado = 1
        WHERE ur_count.id_usuario = u.id_SB
          AND ur_count.activo = 1
          AND ur_count.principal = 1
      ) = 1
      ${actorClause}
  `, [
    Number(event.campana_default ?? 1),
    Number(event.push_default ?? 0),
    ...params
  ]);

  return rows.map(row => {
    const policy = String(row.politica || '').trim().toUpperCase();
    if (policy === 'OBLIGATORIA') {
      return {
        id_usuario: Number(row.id_usuario),
        politica: policy,
        campana: true,
        push: true
      };
    }

    const silenced = Number(row.silenciada || 0) === 1;
    return {
      id_usuario: Number(row.id_usuario),
      politica: policy,
      campana: !silenced && Number(row.campana || 0) === 1,
      push: !silenced && Number(row.push || 0) === 1
    };
  }).filter(row => row.id_usuario > 0 && (row.campana || row.push));
}

async function insertNotification_uni(executor, payload) {
  const [result] = await executor.query(`
    INSERT INTO sup_notificaciones (
      id_usuario,
      tipo_notificacion,
      titulo_notificacion,
      mensaje_notificacion,
      icono_notificacion,
      accion_notificacion,
      id_referencia,
      ruta_destino,
      leido,
      activo
    )
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, 0, 1
    FROM DUAL
    WHERE NOT EXISTS (
      SELECT 1
      FROM sup_notificaciones existing
      WHERE existing.id_usuario = ?
        AND existing.tipo_notificacion = ?
        AND existing.id_referencia = ?
        AND existing.activo = 1
    )
  `, [
    payload.id_usuario,
    payload.codigo_evento,
    payload.titulo,
    payload.mensaje,
    payload.icono,
    'ABRIR_TICKET',
    payload.id_referencia,
    payload.ruta_destino,
    payload.id_usuario,
    payload.codigo_evento,
    payload.id_referencia
  ]);

  return Number(result.affectedRows || 0);
}

async function emitTicketEvent_uni(executor, {
  eventCode,
  ticketRow,
  actorUserId,
  title,
  message,
  icon
}) {
  const event = await loadEvent_uni(executor, eventCode);
  if (!event) {
    return { created: 0, reason: 'EVENTO_NO_REGISTRADO', recipients: [] };
  }

  if (!(await matrixConfigured_uni(executor, eventCode))) {
    return { created: 0, reason: 'MATRIZ_ROLES_NO_CONFIGURADA', recipients: [] };
  }

  const zoneId = await resolveTicketZoneId_uni(executor, ticketRow);
  if (!zoneId) {
    return { created: 0, reason: 'ZONA_OPERATIVA_NO_RESUELTA', recipients: [] };
  }

  const recipients = await listMatrixRecipients_uni(executor, event, zoneId, actorUserId);
  if (!recipients.length) {
    return { created: 0, reason: 'SIN_DESTINATARIOS_ELEGIBLES', recipients: [], zona_id: zoneId };
  }

  let created = 0;
  const createdRecipients = [];

  for (const recipient of recipients) {
    const inserted = await insertNotification_uni(executor, {
      id_usuario: recipient.id_usuario,
      codigo_evento: eventCode,
      titulo: String(title || event.titulo_default || event.nombre_evento).slice(0, 255),
      mensaje: String(message || event.mensaje_default || event.nombre_evento).slice(0, 2000),
      icono: icon || event.icono_default || null,
      id_referencia: Number(ticketRow?.id) || null,
      ruta_destino: ticketRow?.ticket ? `detalle:ticket:${ticketRow.ticket}` : event.ruta_default || null
    });

    if (inserted) {
      created += inserted;
      createdRecipients.push({
        id_usuario: recipient.id_usuario,
        politica: recipient.politica,
        campana: recipient.campana,
        push: recipient.push
      });
    }
  }

  return {
    created,
    reason: created ? null : 'YA_EXISTENTE',
    recipients: createdRecipients,
    zona_id: zoneId
  };
}

async function loadInsertedRows_uni(beforeContext) {
  const newCandidateIds = (beforeContext?.candidateIds || [])
    .filter(id => !beforeContext.existingIds.has(Number(id)));

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

async function processAfterSync_uni(beforeContext, actorUser) {
  const insertedRows = await loadInsertedRows_uni(beforeContext);
  const summary = {
    inserted_tickets: insertedRows.length,
    falla_equipo_critico: 0,
    persona_atrapada: 0,
    nuevo_equipo_critico: 0,
    eventos: []
  };

  if (!insertedRows.length) return summary;

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const equipmentCodes = insertedRows
      .map(row => String(row.codigo_equipo || '').trim())
      .filter(Boolean);
    const criticalAfter = await listCriticalState_uni(connection, equipmentCodes);
    const actorId = Number(actorUser?.id_SB || actorUser?.id || 0) || null;

    for (const row of insertedRows) {
      if (isPersonaAtrapada_uni(row)) {
        const result = await emitTicketEvent_uni(connection, {
          eventCode: EVENT_PERSONA_ATRAPADA_UNI,
          ticketRow: row,
          actorUserId: actorId,
          title: 'Ticket de persona atrapada',
          message: `Se genero el ticket ${row.ticket} relacionado con una persona atrapada.`,
          icon: '🚨'
        });
        summary.persona_atrapada += Number(result.created || 0);
        summary.eventos.push({
          codigo_evento: EVENT_PERSONA_ATRAPADA_UNI,
          ticket: row.ticket,
          created: Number(result.created || 0),
          reason: result.reason || null
        });
      }

      const equipment = String(row.codigo_equipo || '').trim();
      const before = beforeContext.criticalBefore.get(equipment);
      if (
        equipment &&
        before &&
        Number(before.fallas || 0) >= CRITICOS_MIN_FALLAS_BLT_UNI &&
        isBlt_uni(row)
      ) {
        const result = await emitTicketEvent_uni(connection, {
          eventCode: EVENT_FALLA_EQUIPO_CRITICO_UNI,
          ticketRow: row,
          actorUserId: actorId,
          title: 'Nueva falla en equipo critico',
          message: `Se genero el ticket ${row.ticket} con responsabilidad BLT sobre el equipo critico ${equipment}.`,
          icon: '💥'
        });
        summary.falla_equipo_critico += Number(result.created || 0);
        summary.eventos.push({
          codigo_evento: EVENT_FALLA_EQUIPO_CRITICO_UNI,
          ticket: row.ticket,
          created: Number(result.created || 0),
          reason: result.reason || null
        });
      }
    }

    const firstNewBltByEquipment = new Map();
    insertedRows.filter(isBlt_uni).forEach(row => {
      const equipment = String(row.codigo_equipo || '').trim();
      if (equipment && !firstNewBltByEquipment.has(equipment)) {
        firstNewBltByEquipment.set(equipment, row);
      }
    });

    for (const [equipment, triggerRow] of firstNewBltByEquipment.entries()) {
      const before = beforeContext.criticalBefore.get(equipment);
      const after = criticalAfter.get(equipment);
      const beforeCount = Number(before?.fallas || 0);
      const afterCount = Number(after?.fallas || 0);

      if (
        beforeCount >= CRITICOS_MIN_FALLAS_BLT_UNI ||
        afterCount < CRITICOS_MIN_FALLAS_BLT_UNI
      ) {
        continue;
      }

      const result = await emitTicketEvent_uni(connection, {
        eventCode: EVENT_NUEVO_EQUIPO_CRITICO_UNI,
        ticketRow: triggerRow,
        actorUserId: actorId,
        title: 'Nuevo equipo critico',
        message: `El equipo ${equipment} paso a condicion critica al alcanzar ${afterCount} fallas BLT en los ultimos ${CRITICOS_DIAS_UNI} dias.`,
        icon: '💥'
      });
      summary.nuevo_equipo_critico += Number(result.created || 0);
      summary.eventos.push({
        codigo_evento: EVENT_NUEVO_EQUIPO_CRITICO_UNI,
        ticket: triggerRow.ticket,
        created: Number(result.created || 0),
        reason: result.reason || null
      });
    }

    await connection.commit();
    return summary;
  } catch (error) {
    try { await connection.rollback(); } catch (_rollbackError) {}
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  captureBeforeSync_uni,
  processAfterSync_uni
};

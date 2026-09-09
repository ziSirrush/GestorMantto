'use strict';

const crypto = require('crypto');
const db = require('../../config/db');
const logger = require('../../shared/logger');
const {
  emitBusinessEventSafe_gnral
} = require('./notification-business-emitter.service');
const {
  resolveSeguimientoRecipients_uni
} = require('./portafolio-seguimiento-especial-notifications_uni.service');

const EVENTS = Object.freeze({
  ENTRY: 'PORTAFOLIO_EQUIPO_INGRESO',
  EXIT: 'PORTAFOLIO_EQUIPO_SALIDA',
  CHANGE: 'PORTAFOLIO_EQUIPO_CAMBIO'
});

const RELEVANT_FIELDS = Object.freeze([
  'proyecto',
  'zona_id',
  'estado_registro',
  'inactivo',
  'estatus_servicio',
  'categoria',
  'prioridad',
  'supervisor_zona',
  'superintendente'
]);

function text(value) {
  return String(value == null ? '' : value).trim();
}

function active(row) {
  if (!row || Number(row.estado_registro ?? 1) !== 1) return false;
  return !['SI', 'SÍ', '1', 'TRUE', 'INACTIVO'].includes(text(row.inactivo).toUpperCase());
}

function stableValue(value) {
  if (value == null) return null;
  if (typeof value === 'string') return value.trim();
  return value;
}

function changedFields(before, after) {
  if (!before || !after) return RELEVANT_FIELDS.slice();
  return RELEVANT_FIELDS.filter((field) =>
    JSON.stringify(stableValue(before[field])) !== JSON.stringify(stableValue(after[field]))
  );
}

function classifyTransition(before, after) {
  if (!after) return null;
  if (!before || (!active(before) && active(after))) return 'ENTRY';
  if (active(before) && !active(after)) return 'EXIT';
  return changedFields(before, after).length ? 'CHANGE' : null;
}

function transitionIdentity(before, after, transition) {
  const payload = {
    transition,
    id_portafolio: after?.id_portafolio ?? before?.id_portafolio ?? null,
    numero_equipo: after?.numero_equipo ?? before?.numero_equipo ?? null,
    before: Object.fromEntries(RELEVANT_FIELDS.map((field) => [field, stableValue(before?.[field])])),
    after: Object.fromEntries(RELEVANT_FIELDS.map((field) => [field, stableValue(after?.[field])]))
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function contextFromRow(row, snapshot = null, followers = []) {
  return {
    dominio: 'UNITED',
    tipo: 'PORTAFOLIO',
    id_portafolio: Number(row?.id_portafolio || snapshot?.id_portafolio || 0) || null,
    numero_equipo: row?.numero_equipo || snapshot?.numero_equipo || null,
    proyecto: row?.proyecto || snapshot?.proyecto || null,
    zona_id: Number(row?.zona_id || snapshot?.zona_id || 0) || null,
    snapshot_pre_mutacion: snapshot || null,
    followers_snapshot: followers
  };
}

async function captureBeforeSync_uni(body, executor = db) {
  const inputRows = Array.isArray(body?.rows) ? body.rows : [];
  const equipmentCodes = [...new Set(inputRows
    .map((row) => text(row?.numero_equipo))
    .filter(Boolean))];
  const operationId = crypto.randomUUID();
  if (!equipmentCodes.length) return { operationId, beforeByEquipment: new Map() };

  const [rows] = await executor.query(`
    SELECT *
    FROM portafolio
    WHERE numero_equipo IN (?)
  `, [equipmentCodes]);
  const beforeByEquipment = new Map();

  for (const row of rows) {
    const key = text(row.numero_equipo).toUpperCase();
    const resolved = await resolveSeguimientoRecipients_uni({
      executor,
      contextoNegocio: contextFromRow(row, row),
      actorUserId: null,
      codigoEventoNativo: 'PORTAFOLIO_SYNC_PRE_MUTACION'
    });
    beforeByEquipment.set(key, {
      row,
      followers: Array.isArray(resolved?.followers) ? resolved.followers : []
    });
  }

  return { operationId, beforeByEquipment };
}

async function loadAfterRows_uni(beforeContext, body, executor = db) {
  const inputRows = Array.isArray(body?.rows) ? body.rows : [];
  const equipmentCodes = [...new Set(inputRows
    .map((row) => text(row?.numero_equipo))
    .filter(Boolean))];
  if (!equipmentCodes.length) return [];
  const [rows] = await executor.query(`
    SELECT *
    FROM portafolio
    WHERE numero_equipo IN (?)
  `, [equipmentCodes]);
  return rows;
}

function eventPresentation(transition, row, fields) {
  const equipment = text(row?.numero_equipo) || 'Equipo';
  const project = text(row?.proyecto);
  if (transition === 'ENTRY') {
    return {
      eventCode: EVENTS.ENTRY,
      title: `Ingreso a Portafolio · ${equipment}`,
      message: project
        ? `El equipo ${equipment} ingresó al Portafolio del proyecto ${project}.`
        : `El equipo ${equipment} ingresó al Portafolio.`
    };
  }
  if (transition === 'EXIT') {
    return {
      eventCode: EVENTS.EXIT,
      title: `Salida de Portafolio · ${equipment}`,
      message: project
        ? `El equipo ${equipment} salió del Portafolio del proyecto ${project}.`
        : `El equipo ${equipment} salió del Portafolio.`
    };
  }
  return {
    eventCode: EVENTS.CHANGE,
    title: `Actualización de Portafolio · ${equipment}`,
    message: `Se actualizaron ${fields.join(', ')} del equipo ${equipment}${project ? ` en el proyecto ${project}` : ''}.`
  };
}

async function processAfterSync_uni(beforeContext, body, actorUser, executor = db) {
  const afterRows = await loadAfterRows_uni(beforeContext, body, executor);
  const beforeByEquipment = beforeContext?.beforeByEquipment || new Map();
  const actorId = Number(actorUser?.id_SB || actorUser?.id || 0) || null;
  const summary = { created: 0, skipped: 0, events: [] };

  for (const after of afterRows) {
    const key = text(after.numero_equipo).toUpperCase();
    const snapshot = beforeByEquipment.get(key) || null;
    const before = snapshot?.row || null;
    const transition = classifyTransition(before, after);
    if (!transition) continue;

    const fields = changedFields(before, after);
    const presentation = eventPresentation(transition, transition === 'EXIT' ? before : after, fields);
    const eventInstanceKey = `portafolio:${presentation.eventCode}:${transitionIdentity(before, after, transition)}`;
    const useSnapshot = transition === 'EXIT';
    const contextRow = useSnapshot ? before : after;
    let followerSnapshot = useSnapshot ? snapshot?.followers || [] : [];
    if (transition === 'CHANGE' && fields.some((field) => ['proyecto', 'zona_id'].includes(field))) {
      const current = await resolveSeguimientoRecipients_uni({
        executor,
        contextoNegocio: contextFromRow(after, before),
        actorUserId: actorId,
        codigoEventoNativo: presentation.eventCode
      });
      const byUser = new Map([
        ...(snapshot?.followers || []),
        ...(current?.followers || [])
      ].map((item) => [Number(item.id_usuario), item]));
      followerSnapshot = [...byUser.values()].filter((item) => Number(item.id_usuario) > 0);
    }
    const context = contextFromRow(
      contextRow,
      before,
      followerSnapshot
    );
    context.identificador_operacion = eventInstanceKey;

    const result = await emitBusinessEventSafe_gnral({
      codigoEvento: presentation.eventCode,
      destinatarios: [],
      actorUserId: actorId,
      allowMissingEvent: true,
      titulo: presentation.title,
      mensaje: presentation.message,
      accion: 'ABRIR_EQUIPO',
      idReferencia: Number(context.id_portafolio) || null,
      ruta: context.numero_equipo ? `detalle:equipo:${context.numero_equipo}` : 'portafolio',
      eventInstanceKey,
      contextoSeguimiento: context
    }, {
      label: `portafolio-sync:${presentation.eventCode}`
    });

    summary.created += Number(result?.created || 0);
    summary.skipped += Number(result?.skipped || 0);
    summary.events.push({
      codigo_evento: presentation.eventCode,
      id_portafolio: context.id_portafolio,
      numero_equipo: context.numero_equipo,
      proyecto: context.proyecto,
      zona_id: context.zona_id,
      snapshot_pre_mutacion: useSnapshot,
      event_instance_key: eventInstanceKey,
      created: Number(result?.created || 0),
      skipped: Number(result?.skipped || 0),
      reason: result?.reason || null,
      trace_id: result?.trace_id || null
    });
  }

  logger.info('[PORTAFOLIO_NATIVE_NOTIFICATIONS_SYNC]', {
    operation_id: beforeContext?.operationId || null,
    created: summary.created,
    skipped: summary.skipped,
    event_count: summary.events.length
  });
  return summary;
}

module.exports = {
  EVENTS,
  RELEVANT_FIELDS,
  active,
  changedFields,
  classifyTransition,
  transitionIdentity,
  captureBeforeSync_uni,
  processAfterSync_uni
};

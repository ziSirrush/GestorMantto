'use strict';

const db = require('../../config/db');

const ORIGIN_UNITED = 'UNITED';
const ENTITY_TICKET = 'TICKET';

function executorOrDb(executor) {
  return executor && typeof executor.query === 'function' ? executor : db;
}

function scopeParts(scope) {
  const safe = scope && typeof scope.sql === 'string' ? scope : { sql: '1 = 0', params: [] };
  return {
    sql: safe.sql || '1 = 0',
    params: Array.isArray(safe.params) ? safe.params : []
  };
}

async function findTicketScoped(executor, reference, scope) {
  const conn = executorOrDb(executor);
  const scoped = scopeParts(scope);
  const ref = String(reference || '').trim();

  const [rows] = await conn.query(
    `SELECT
       t.id AS id_ticket,
       t.ticket,
       t.id_interno,
       t.folio,
       t.estado_ticket,
       t.estado,
       t.ciudad,
       t.proyecto,
       t.proyecto_padre,
       t.equipo,
       t.codigo_equipo,
       t.referencia_en_zona_operativa,
       t.prioridad,
       t.responsabilidad,
       t.fecha_reporte,
       t.fecha_cierre,
       t.estatus_equipo_final,
       t.actualizado_en
     FROM tickets t
     WHERE (
       TRIM(COALESCE(t.ticket, '')) = ?
       OR CAST(t.id AS CHAR) = ?
       OR TRIM(COALESCE(t.folio, '')) = ?
       OR TRIM(COALESCE(t.id_interno, '')) = ?
     )
       AND ${scoped.sql}
     ORDER BY t.id DESC
     LIMIT 1`,
    [ref, ref, ref, ref, ...scoped.params]
  );

  return rows[0] || null;
}

async function getSubscription(executor, { userId, origin, entityType, entityId }) {
  const conn = executorOrDb(executor);
  const [rows] = await conn.query(
    `SELECT
       id_seguimiento,
       id_usuario,
       origen,
       entidad_tipo,
       entidad_id,
       entidad_clave,
       activo,
       created_at,
       updated_at
     FROM seguimiento_especial
     WHERE id_usuario = ?
       AND origen = ?
       AND entidad_tipo = ?
       AND entidad_id = ?
     LIMIT 1`,
    [Number(userId), String(origin), String(entityType), Number(entityId)]
  );

  return rows[0] || null;
}

async function upsertSubscription(executor, {
  userId,
  origin,
  entityType,
  entityId,
  entityKey,
  active
}) {
  const conn = executorOrDb(executor);
  const [result] = await conn.query(
    `INSERT INTO seguimiento_especial
       (id_usuario, origen, entidad_tipo, entidad_id, entidad_clave, activo)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       entidad_clave = VALUES(entidad_clave),
       activo = VALUES(activo),
       updated_at = CURRENT_TIMESTAMP`,
    [
      Number(userId),
      String(origin),
      String(entityType),
      Number(entityId),
      entityKey == null ? null : String(entityKey),
      active ? 1 : 0
    ]
  );

  return result;
}

async function listActiveTicketSubscriptions(executor, { userId, scope }) {
  const conn = executorOrDb(executor);
  const scoped = scopeParts(scope);

  const [rows] = await conn.query(
    `SELECT
       se.id_seguimiento,
       se.id_usuario,
       se.origen,
       se.entidad_tipo,
       se.entidad_id,
       se.entidad_clave,
       se.activo,
       se.created_at AS seguimiento_created_at,
       se.updated_at AS seguimiento_updated_at,
       t.id AS id_ticket,
       t.ticket,
       t.id_interno,
       t.folio,
       t.estado_ticket,
       t.estado,
       t.ciudad,
       t.proyecto,
       t.proyecto_padre,
       t.equipo,
       t.codigo_equipo,
       t.referencia_en_zona_operativa,
       t.prioridad,
       t.responsabilidad,
       t.fecha_reporte,
       t.fecha_cierre,
       t.estatus_equipo_final,
       t.actualizado_en
     FROM seguimiento_especial se
     INNER JOIN tickets t
             ON t.id = se.entidad_id
     WHERE se.id_usuario = ?
       AND se.origen = ?
       AND se.entidad_tipo = ?
       AND se.activo = 1
       AND ${scoped.sql}
     ORDER BY se.updated_at DESC, t.id DESC`,
    [Number(userId), ORIGIN_UNITED, ENTITY_TICKET, ...scoped.params]
  );

  return rows;
}

module.exports = {
  ORIGIN_UNITED,
  ENTITY_TICKET,
  findTicketScoped,
  getSubscription,
  upsertSubscription,
  listActiveTicketSubscriptions
};

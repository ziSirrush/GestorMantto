'use strict';

const db = require('../config/db');

const SUPPORT_ROLE_NAMES = new Set([
  'Soporte',
  'Programador',
  'Programador United',
  'Programador Corellian'
]);

function getRoleNames(user) {
  return new Set([
    user && user.rol,
    ...((user && Array.isArray(user.roles)) ? user.roles : [])
  ].filter(Boolean));
}

function canAdministrateSupport(user) {
  const roles = getRoleNames(user);
  return Array.from(SUPPORT_ROLE_NAMES).some(role => roles.has(role));
}

async function getTableColumns(tableName) {
  const [rows] = await db.query(
    `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?`,
    [tableName]
  );

  return new Set(rows.map(row => row.COLUMN_NAME));
}

function firstColumn(columns, candidates, fallbackSql = 'NULL') {
  const found = candidates.find(candidate => columns.has(candidate));
  return found ? `t.\`${found}\`` : fallbackSql;
}

function normalizeLimit(value, fallback = 500, max = 1000) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

async function listSolicitudes(filters = {}) {
  const columns = await getTableColumns('sup_tickets');
  if (!columns.size) {
    const error = new Error('La tabla sup_tickets no existe o no está disponible.');
    error.status = 500;
    throw error;
  }

  const idSql = firstColumn(columns, ['id_ticket', 'id_sup_ticket', 'id']);
  const folioSql = firstColumn(columns, ['folio', 'numero_solicitud'], `CONCAT('SUP-', ${idSql})`);
  const asuntoSql = firstColumn(columns, ['asunto_ticket', 'asunto', 'titulo']);
  const moduloSql = firstColumn(columns, ['modulo_ticket', 'modulo', 'modulo_afectado']);
  const estadoSql = firstColumn(columns, ['estado_ticket', 'estado', 'status']);
  const usuarioSql = firstColumn(columns, ['id_usuario', 'usuario_id', 'created_by', 'creado_por']);
  const incidenteSql = firstColumn(columns, ['fecha_incidente', 'fecha_creacion', 'created_at']);
  const ultimoMensajeSql = firstColumn(
    columns,
    ['fecha_ultimo_mensaje', 'fecha_ultima_respuesta', 'fecha_actualizacion', 'updated_at', 'fecha_creacion', 'created_at']
  );
  const activoSql = firstColumn(columns, ['activo'], '1');

  const where = [`COALESCE(${activoSql}, 1) = 1`];
  const params = [];

  if (filters.q) {
    const search = `%${String(filters.q).trim()}%`;
    where.push(`(${folioSql} LIKE ? OR ${asuntoSql} LIKE ? OR ${moduloSql} LIKE ? OR ${estadoSql} LIKE ?)`);
    params.push(search, search, search, search);
  }

  if (filters.estado) {
    where.push(`${estadoSql} = ?`);
    params.push(String(filters.estado).trim());
  }

  if (filters.modulo) {
    where.push(`${moduloSql} = ?`);
    params.push(String(filters.modulo).trim());
  }

  if (filters.userId) {
    where.push(`${usuarioSql} = ?`);
    params.push(Number(filters.userId));
  }

  const limit = normalizeLimit(filters.limit);

  const [rows] = await db.query(
    `SELECT
       ${idSql} AS id_solicitud,
       ${folioSql} AS numero_solicitud,
       ${asuntoSql} AS asunto,
       ${moduloSql} AS modulo,
       ${estadoSql} AS estado,
       ${incidenteSql} AS fecha_incidente,
       ${ultimoMensajeSql} AS fecha_ultimo_mensaje,
       ${usuarioSql} AS id_usuario,
       u.nombre AS usuario_nombre,
       u.correo AS usuario_correo
     FROM sup_tickets t
     LEFT JOIN usuarios u
       ON u.id_SB = ${usuarioSql}
     WHERE ${where.join(' AND ')}
     ORDER BY ${ultimoMensajeSql} DESC, ${idSql} DESC
     LIMIT ${limit}`,
    params
  );

  return rows;
}

async function getSolicitudById(id) {
  const columns = await getTableColumns('sup_tickets');
  if (!columns.size) {
    const error = new Error('La tabla sup_tickets no existe o no está disponible.');
    error.status = 500;
    throw error;
  }

  const idColumn = ['id_ticket', 'id_sup_ticket', 'id'].find(candidate => columns.has(candidate));
  if (!idColumn) {
    const error = new Error('No se encontró la columna identificadora de sup_tickets.');
    error.status = 500;
    throw error;
  }

  const [rows] = await db.query(
    `SELECT
       t.*,
       u.nombre AS usuario_nombre,
       u.correo AS usuario_correo,
       u.empresa AS usuario_empresa,
       s.nombre AS soporte_nombre,
       s.correo AS soporte_correo,
       c.nombre_categoria
     FROM sup_tickets t
     LEFT JOIN usuarios u ON u.id_SB = t.id_usuario
     LEFT JOIN usuarios s ON s.id_SB = t.id_soporte
     LEFT JOIN sup_ticket_categorias c ON c.id_ticket_categoria = t.id_ticket_categoria
     WHERE t.\`${idColumn}\` = ?
     LIMIT 1`,
    [id]
  );

  if (!rows[0]) return null;
  const ticket = rows[0];
  try { ticket.historial = ticket.historial ? JSON.parse(ticket.historial) : []; } catch (error) { ticket.historial = []; }
  const [adjuntos] = await db.query(
    `SELECT a.*, u.nombre AS subido_por_nombre
       FROM sup_adjuntos a
       LEFT JOIN usuarios u ON u.id_SB = a.subido_por
      WHERE a.id_ticket = ? AND COALESCE(a.activo, 1) = 1
      ORDER BY a.fecha_creacion ASC, a.id_adjunto ASC`,
    [ticket[idColumn]]
  );
  ticket.adjuntos = adjuntos;
  return ticket;
}

async function listSupportUsers() {
  const [rows] = await db.query(
    `SELECT DISTINCT u.id_SB AS id_usuario, u.nombre, u.correo
       FROM usuarios u
       INNER JOIN usuario_roles ur ON ur.id_usuario = u.id_SB AND ur.activo = 1
       INNER JOIN roles r ON r.id_rol = ur.id_rol AND r.estado = 1
      WHERE u.estado = 1 AND r.rol = 'Soporte'
      ORDER BY u.nombre ASC`
  );
  return rows;
}

async function autoAssignIfEmpty(ticketId, userId) {
  if (!ticketId || !userId) return false;
  const [result] = await db.query(
    `UPDATE sup_tickets
        SET id_soporte = ?, estado_ticket = CASE WHEN estado_ticket = 'Abierto' THEN 'Asignado' ELSE estado_ticket END,
            fecha_actualizacion = NOW()
      WHERE id_ticket = ? AND id_soporte IS NULL`,
    [userId, ticketId]
  );
  return Number(result.affectedRows || 0) > 0;
}



function uniqueRecipientIds(values, excludeId) {
  const excluded = Number(excludeId || 0);
  return Array.from(new Set((values || [])
    .map(value => Number(value || 0))
    .filter(value => value > 0 && value !== excluded)));
}

async function listSupportUserIds() {
  const users = await listSupportUsers();
  return users.map(user => Number(user.id_usuario || 0)).filter(Boolean);
}

async function createTicketNotifications({
  recipientIds,
  actorId,
  ticketId,
  folio,
  type,
  title,
  message,
  icon = '🔔'
}) {
  const recipients = uniqueRecipientIds(recipientIds, actorId);
  if (!ticketId || !recipients.length) return 0;

  let inserted = 0;
  for (const recipientId of recipients) {
    const [result] = await db.query(
      `INSERT INTO sup_notificaciones
       (id_usuario, tipo_notificacion, titulo_notificacion, mensaje_notificacion,
        icono_notificacion, accion_notificacion, id_referencia, ruta_destino,
        leido, activo, fecha_creacion, fecha_actualizacion)
       VALUES (?, ?, ?, ?, ?, 'ABRIR_SOLICITUD', ?, ?, 0, 1, NOW(), NOW())`,
      [
        recipientId,
        type,
        title,
        message,
        icon,
        ticketId,
        'soporte-solicitudes'
      ]
    );
    inserted += Number(result.affectedRows || 0);
  }
  return inserted;
}

async function notifyTicketInteraction({ ticket, actor, kind, fileName }) {
  if (!ticket) return 0;
  const actorId = Number(actor && actor.id_SB || 0);
  const ownerId = Number(ticket.id_usuario || 0);
  const assignedId = Number(ticket.id_soporte || 0);
  const actorIsOwner = actorId > 0 && actorId === ownerId;
  const actorIsSupport = canAdministrateSupport(actor || {});
  let recipientIds = [];

  if (actorIsOwner) {
    recipientIds = assignedId ? [assignedId] : await listSupportUserIds();
  } else if (actorIsSupport) {
    recipientIds = [ownerId];
    if (assignedId && assignedId !== actorId) recipientIds.push(assignedId);
  } else {
    recipientIds = assignedId ? [assignedId] : await listSupportUserIds();
  }

  const folio = ticket.folio || `SUP-${ticket.id_ticket}`;
  const actorName = (actor && (actor.nombre || actor.correo)) || 'Usuario';
  const isFile = kind === 'archivo';
  return createTicketNotifications({
    recipientIds,
    actorId,
    ticketId: ticket.id_ticket,
    folio,
    type: isFile ? 'SOPORTE_ARCHIVO' : 'SOPORTE_COMENTARIO',
    title: isFile ? 'Nuevo archivo en solicitud' : 'Nuevo comentario en solicitud',
    message: isFile
      ? `${actorName} adjuntó ${fileName || 'un archivo'} en ${folio}`
      : `${actorName} comentó en ${folio}`,
    icon: isFile ? '📎' : '💬'
  });
}

async function notifyTicketChanges({ before, after, actor }) {
  if (!before || !after) return 0;
  const actorId = Number(actor && actor.id_SB || 0);
  const ownerId = Number(after.id_usuario || before.id_usuario || 0);
  const oldAssignedId = Number(before.id_soporte || 0);
  const newAssignedId = Number(after.id_soporte || 0);
  const folio = after.folio || before.folio || `SUP-${after.id_ticket || before.id_ticket}`;
  let inserted = 0;

  if (String(before.estado_ticket || '') !== String(after.estado_ticket || '')) {
    inserted += await createTicketNotifications({
      recipientIds: [ownerId],
      actorId,
      ticketId: after.id_ticket,
      type: 'SOPORTE_ESTADO',
      title: 'Estado de solicitud actualizado',
      message: `${folio} cambió a: ${after.estado_ticket || 'Sin estado'}`,
      icon: '🔄'
    });
  }

  if (String(before.prioridad_ticket || '') !== String(after.prioridad_ticket || '')) {
    inserted += await createTicketNotifications({
      recipientIds: [newAssignedId],
      actorId,
      ticketId: after.id_ticket,
      type: 'SOPORTE_PRIORIDAD',
      title: 'Prioridad de solicitud actualizada',
      message: `${folio}: ${before.prioridad_ticket || 'Sin prioridad'} → ${after.prioridad_ticket || 'Sin prioridad'}`,
      icon: '⚠️'
    });
  }

  if (oldAssignedId !== newAssignedId) {
    if (newAssignedId) {
      inserted += await createTicketNotifications({
        recipientIds: [newAssignedId],
        actorId,
        ticketId: after.id_ticket,
        type: 'SOPORTE_ASIGNACION',
        title: 'Solicitud asignada',
        message: `Se te asignó la solicitud ${folio}`,
        icon: '👤'
      });
    }
    if (oldAssignedId) {
      inserted += await createTicketNotifications({
        recipientIds: [oldAssignedId],
        actorId,
        ticketId: after.id_ticket,
        type: 'SOPORTE_REASIGNACION',
        title: 'Solicitud reasignada',
        message: `${folio} fue reasignada a otro responsable`,
        icon: '↪️'
      });
    }
  }

  return inserted;
}


async function notifyRequesterUpdate({ ticket, actor, changedFields }) {
  if (!ticket) return 0;
  const actorId = Number(actor && actor.id_SB || 0);
  const assignedId = Number(ticket.id_soporte || 0);
  const recipientIds = assignedId ? [assignedId] : await listSupportUserIds();
  const folio = ticket.folio || `SUP-${ticket.id_ticket}`;
  const actorName = (actor && (actor.nombre || actor.correo)) || 'El solicitante';
  const fieldList = Array.isArray(changedFields) && changedFields.length
    ? ` Campos: ${changedFields.join(', ')}.`
    : '';

  return createTicketNotifications({
    recipientIds,
    actorId,
    ticketId: ticket.id_ticket,
    folio,
    type: 'SOPORTE_SOLICITUD_ACTUALIZADA',
    title: 'Solicitud actualizada por el solicitante',
    message: `${actorName} actualizó la solicitud ${folio}.${fieldList}`,
    icon: '✏️'
  });
}

async function notifySupportUsers({ ticketId, folio, asunto }) {
  if (!ticketId) return 0;

  const [result] = await db.query(
    `INSERT INTO sup_notificaciones
       (id_usuario, tipo_notificacion, titulo_notificacion, mensaje_notificacion,
        icono_notificacion, accion_notificacion, id_referencia, ruta_destino,
        leido, activo, fecha_creacion, fecha_actualizacion)
     SELECT DISTINCT
       u.id_SB,
       'SOLICITUD_SOPORTE',
       'Nueva solicitud de soporte',
       CONCAT(?, ' - ', ?),
       '🎫',
       'ABRIR_SOLICITUD',
       ?,
       'soporte-solicitudes',
       0,
       1,
       NOW(),
       NOW()
     FROM usuarios u
     INNER JOIN usuario_roles ur
       ON ur.id_usuario = u.id_SB
      AND ur.activo = 1
     INNER JOIN roles r
       ON r.id_rol = ur.id_rol
      AND r.estado = 1
     WHERE u.estado = 1
       AND r.rol = 'Soporte'`,
    [folio || `SUP-${ticketId}`, asunto || 'Solicitud de soporte', ticketId]
  );

  return Number(result.affectedRows || 0);
}

module.exports = {
  canAdministrateSupport,
  listSolicitudes,
  getSolicitudById,
  notifySupportUsers,
  listSupportUsers,
  autoAssignIfEmpty,
  notifyTicketInteraction,
  notifyTicketChanges,
  notifyRequesterUpdate
};

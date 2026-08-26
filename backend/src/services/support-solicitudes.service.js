'use strict';

const db = require('../config/db');
const supportFilesService = require('../modules/support/support-files.service');
const {
  emitBusinessEventSafe_gnral
} = require('./notifications/notification-business-emitter.service');

const EVENT_SUPPORT_UPDATED = 'soporte.solicitud.actualizada';

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
  ticket.empresa = ticket.empresa || ticket.usuario_empresa || null;
  try { ticket.historial = ticket.historial ? JSON.parse(ticket.historial) : []; } catch (error) { ticket.historial = []; }
  const [adjuntos] = await db.query(
    `SELECT a.*, u.nombre AS subido_por_nombre
       FROM sup_adjuntos a
       LEFT JOIN usuarios u ON u.id_SB = a.subido_por
      WHERE a.id_ticket = ? AND COALESCE(a.activo, 1) = 1
      ORDER BY a.fecha_creacion ASC, a.id_adjunto ASC`,
    [ticket[idColumn]]
  );
  ticket.adjuntos = adjuntos.map(file => supportFilesService.presentAttachment_gnral(file, ticket[idColumn]));
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

function parseHistory_gnral(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

async function latestSupportActionIdentity_gnral(ticketId, fallbackAction) {
  const [rows] = await db.query(
    `SELECT historial, fecha_actualizacion
       FROM sup_tickets
      WHERE id_ticket = ?
      LIMIT 1`,
    [ticketId]
  );
  const row = rows[0] || {};
  const history = parseHistory_gnral(row.historial);
  const last = history.length ? history[history.length - 1] : null;
  const action = String(last && last.accion || fallbackAction || 'actualizacion').trim();
  const date = String(last && last.fecha || row.fecha_actualizacion || '').trim();
  const attachment = Number(last && last.id_adjunto || 0) || null;

  if (date) {
    return `soporte:${ticketId}:${action}:${date}${attachment ? `:${attachment}` : ''}`;
  }

  // Creaciones antiguas sin historial/fecha mantienen una identidad estable por ticket.
  return `soporte:${ticketId}:${action}`;
}

async function emitSupportEvent_gnral({
  recipientIds,
  actorId,
  ticketId,
  title,
  message,
  icon,
  eventInstanceKey
}) {
  const recipients = uniqueRecipientIds(recipientIds, actorId);
  if (!ticketId || !recipients.length) return { created: 0, recipients: [] };

  return emitBusinessEventSafe_gnral({
    codigoEvento: EVENT_SUPPORT_UPDATED,
    destinatarios: recipients,
    actorUserId: Number(actorId || 0) || null,
    zonaOperativaNoAplica: true,
    requireRoleMatrix: true,
    titulo: title,
    mensaje: message,
    icono: icon,
    accion: 'ABRIR_SOLICITUD',
    idReferencia: ticketId,
    ruta: 'soporte-solicitudes',
    eventInstanceKey
  }, {
    label: `${EVENT_SUPPORT_UPDATED}:${ticketId}`
  });
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
  const actionKey = await latestSupportActionIdentity_gnral(
    ticket.id_ticket,
    isFile ? 'archivo_adjuntado' : 'comentario'
  );
  const notificationResult = await emitSupportEvent_gnral({
    recipientIds,
    actorId,
    ticketId: ticket.id_ticket,
    title: isFile ? 'Nuevo archivo en solicitud' : 'Nuevo comentario en solicitud',
    message: isFile
      ? `${actorName} adjuntó ${fileName || 'un archivo'} en ${folio}`
      : `${actorName} comentó en ${folio}`,
    icon: isFile ? '📎' : '💬',
    eventInstanceKey: actionKey
  });

  return Number(notificationResult.created || 0);
}

async function notifyTicketChanges({ before, after, actor }) {
  if (!before || !after) return 0;
  const actorId = Number(actor && actor.id_SB || 0);
  const ownerId = Number(after.id_usuario || before.id_usuario || 0);
  const oldAssignedId = Number(before.id_soporte || 0);
  const newAssignedId = Number(after.id_soporte || 0);
  const folio = after.folio || before.folio || `SUP-${after.id_ticket || before.id_ticket}`;
  const recipients = new Set();
  const changes = [];

  if (String(before.estado_ticket || '') !== String(after.estado_ticket || '')) {
    if (ownerId) recipients.add(ownerId);
    changes.push(`Estado: ${before.estado_ticket || 'Sin estado'} → ${after.estado_ticket || 'Sin estado'}`);
  }

  if (String(before.prioridad_ticket || '') !== String(after.prioridad_ticket || '')) {
    if (newAssignedId) recipients.add(newAssignedId);
    changes.push(`Prioridad: ${before.prioridad_ticket || 'Sin prioridad'} → ${after.prioridad_ticket || 'Sin prioridad'}`);
  }

  if (oldAssignedId !== newAssignedId) {
    if (newAssignedId) recipients.add(newAssignedId);
    if (oldAssignedId) recipients.add(oldAssignedId);
    changes.push('Responsable de soporte actualizado');
  }

  if (!changes.length || !recipients.size) return 0;

  const actionKey = await latestSupportActionIdentity_gnral(after.id_ticket, 'ticket_actualizado');
  const notificationResult = await emitSupportEvent_gnral({
    recipientIds: [...recipients],
    actorId,
    ticketId: after.id_ticket,
    title: 'Solicitud de soporte actualizada',
    message: `${folio}. ${changes.join('. ')}.`,
    icon: '🔄',
    eventInstanceKey: actionKey
  });

  return Number(notificationResult.created || 0);
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
  const actionKey = await latestSupportActionIdentity_gnral(ticket.id_ticket, 'solicitud_actualizada');

  const notificationResult = await emitSupportEvent_gnral({
    recipientIds,
    actorId,
    ticketId: ticket.id_ticket,
    title: 'Solicitud actualizada por el solicitante',
    message: `${actorName} actualizó la solicitud ${folio}.${fieldList}`,
    icon: '✏️',
    eventInstanceKey: actionKey
  });

  return Number(notificationResult.created || 0);
}

async function notifySupportUsers({ ticketId, folio, asunto }) {
  if (!ticketId) return 0;

  const ticket = await getSolicitudById(ticketId);
  const ownerId = Number(ticket && ticket.id_usuario || 0) || null;
  const recipientIds = await listSupportUserIds();
  const notificationResult = await emitSupportEvent_gnral({
    recipientIds,
    actorId: ownerId,
    ticketId,
    title: 'Nueva solicitud de soporte',
    message: `${folio || `SUP-${ticketId}`} - ${asunto || 'Solicitud de soporte'}`,
    icon: '🎫',
    eventInstanceKey: `soporte-solicitud-creada:${ticketId}`
  });

  return Number(notificationResult.created || 0);
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
  notifyRequesterUpdate,
  // Exportado para pruebas de Fase 2.
  latestSupportActionIdentity_gnral
};

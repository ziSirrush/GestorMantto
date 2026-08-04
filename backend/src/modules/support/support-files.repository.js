'use strict';

async function getTicketById_gnral(executor, ticketId, options = {}) {
  const lock = options.forUpdate === true ? ' FOR UPDATE' : '';
  const [rows] = await executor.query(
    `SELECT
       t.*,
       u.nombre AS usuario_nombre,
       u.correo AS usuario_correo,
       u.empresa AS usuario_empresa,
       s.nombre AS soporte_nombre,
       s.correo AS soporte_correo
     FROM sup_tickets t
     LEFT JOIN usuarios u ON u.id_SB = t.id_usuario
     LEFT JOIN usuarios s ON s.id_SB = t.id_soporte
     WHERE t.id_ticket = ?
     LIMIT 1${lock}`,
    [ticketId]
  );
  return rows[0] || null;
}

async function insertTicket_gnral(executor, ticket) {
  const [result] = await executor.query(
    `INSERT INTO sup_tickets
     (folio, id_usuario, empresa, id_ticket_categoria, tipo_ticket, estado_ticket,
      prioridad_ticket, origen_ticket, modulo_ticket, asunto_ticket, descripcion_ticket,
      fecha_incidente, historial, fecha_creacion, fecha_actualizacion)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      ticket.folio,
      ticket.id_usuario,
      ticket.empresa,
      ticket.id_ticket_categoria,
      ticket.tipo_ticket,
      ticket.estado_ticket,
      ticket.prioridad_ticket,
      ticket.origen_ticket,
      ticket.modulo_ticket,
      ticket.asunto_ticket,
      ticket.descripcion_ticket,
      ticket.fecha_incidente,
      JSON.stringify(ticket.historial || [])
    ]
  );
  return result.insertId;
}

async function insertAttachment_gnral(executor, attachment) {
  const [result] = await executor.query(
    `INSERT INTO sup_adjuntos
     (id_ticket, tipo_adjunto, origen_adjunto, subido_por, nombre_original,
      nombre_servidor, ruta_archivo, extension_archivo, mime_type, peso_archivo,
      storage_provider, storage_container, storage_blob_name,
      activo, fecha_creacion, fecha_actualizacion)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
    [
      attachment.id_ticket,
      attachment.tipo_adjunto,
      attachment.origen_adjunto,
      attachment.subido_por,
      attachment.nombre_original,
      attachment.nombre_servidor,
      attachment.ruta_archivo,
      attachment.extension_archivo,
      attachment.mime_type,
      attachment.peso_archivo,
      attachment.storage_provider,
      attachment.storage_container,
      attachment.storage_blob_name
    ]
  );
  return result.insertId;
}

async function getAttachment_gnral(executor, ticketId, attachmentId, options = {}) {
  const active = options.activeOnly === false ? '' : ' AND COALESCE(a.activo, 1) = 1';
  const lock = options.forUpdate === true ? ' FOR UPDATE' : '';
  const [rows] = await executor.query(
    `SELECT a.*
       FROM sup_adjuntos a
      WHERE a.id_ticket = ?
        AND a.id_adjunto = ?${active}
      LIMIT 1${lock}`,
    [ticketId, attachmentId]
  );
  return rows[0] || null;
}

async function appendHistory_gnral(executor, ticketId, event) {
  const [rows] = await executor.query(
    'SELECT historial FROM sup_tickets WHERE id_ticket = ? LIMIT 1 FOR UPDATE',
    [ticketId]
  );
  if (!rows[0]) return false;
  let history = [];
  try {
    history = rows[0].historial ? JSON.parse(rows[0].historial) : [];
    if (!Array.isArray(history)) history = [];
  } catch (_error) {
    history = [];
  }
  history.push(event);
  await executor.query(
    'UPDATE sup_tickets SET historial = ?, fecha_actualizacion = NOW() WHERE id_ticket = ?',
    [JSON.stringify(history), ticketId]
  );
  return true;
}

async function touchTicket_gnral(executor, ticketId, lastReplyBy) {
  const params = [];
  let lastReplySql = '';
  if (lastReplyBy) {
    lastReplySql = ', ultima_respuesta_por = ?';
    params.push(lastReplyBy);
  }
  params.push(ticketId);
  await executor.query(
    `UPDATE sup_tickets
        SET fecha_ultima_respuesta = NOW(), fecha_actualizacion = NOW()${lastReplySql}
      WHERE id_ticket = ?`,
    params
  );
}

async function deactivateAttachment_gnral(executor, ticketId, attachmentId) {
  const [result] = await executor.query(
    `UPDATE sup_adjuntos
        SET activo = 0, fecha_actualizacion = NOW()
      WHERE id_ticket = ? AND id_adjunto = ? AND COALESCE(activo, 1) = 1`,
    [ticketId, attachmentId]
  );
  return Number(result.affectedRows || 0) > 0;
}

module.exports = {
  getTicketById_gnral,
  insertTicket_gnral,
  insertAttachment_gnral,
  getAttachment_gnral,
  appendHistory_gnral,
  touchTicket_gnral,
  deactivateAttachment_gnral
};

'use strict';

const db = require('../../config/db');
const {
  emitBusinessEventSafe_gnral
} = require('../../services/notifications/notification-business-emitter.service');

const EVENT_TICKET_COMMENT = 'tickets.comentario.creado';
const EVENT_TICKET_VOBO = 'tickets.vobo.actualizado';

function currentUserRef_gnral(req) {
  const user = req && (req.contextUser || req.user) || {};
  return {
    id: Number(user.id_SB || user.id || 0) || null,
    correo: user.correo || user.email || null,
    iniciales: user.iniciales || null,
    nombre: user.nombre || null
  };
}

function ticketRoleNames_gnral(req) {
  const user = req && (req.contextUser || req.user) || {};
  const values = [];
  if (Array.isArray(user.roles)) values.push(...user.roles);
  values.push(user.rol, user.role, user.puesto);
  return Array.from(new Set(
    values
      .map(value => String(value || '').trim().toLowerCase())
      .filter(Boolean)
  ));
}

function ticketCanRevert_gnral(req) {
  const user = req && (req.contextUser || req.user) || {};
  return Boolean(
    user.is_programador ||
    ticketRoleNames_gnral(req).some(role => role.includes('programador'))
  );
}

function ticketCanValidateRole_gnral(req) {
  return ticketRoleNames_gnral(req).some(role =>
    role.includes('supervisor') ||
    role.includes('superintendente') ||
    role.includes('director general') ||
    role.includes('programador')
  );
}

async function findTicketRow_gnral(ticketRef, executor = db) {
  const ref = String(ticketRef || '').trim();
  if (!ref) return null;

  const [rows] = await executor.query(`
    SELECT *
    FROM tickets
    WHERE TRIM(COALESCE(ticket, '')) = ?
       OR CAST(id AS CHAR) = ?
       OR TRIM(COALESCE(folio, '')) = ?
       OR TRIM(COALESCE(id_interno, '')) = ?
    ORDER BY
      CASE
        WHEN TRIM(COALESCE(ticket, '')) = ? THEN 0
        WHEN CAST(id AS CHAR) = ? THEN 1
        WHEN TRIM(COALESCE(folio, '')) = ? THEN 2
        ELSE 3
      END,
      id DESC
    LIMIT 1
  `, [ref, ref, ref, ref, ref, ref, ref]);

  return rows[0] || null;
}

function splitTicketResponsibleValue_gnral(value) {
  return String(value || '')
    .split(/[;,|/]+/)
    .map(item => item.trim())
    .filter(Boolean);
}

async function ticketResponsibleNames_gnral(ticketRow, executor = db) {
  if (!ticketRow) return [];

  const names = [
    ...splitTicketResponsibleValue_gnral(ticketRow.supervisor),
    ...splitTicketResponsibleValue_gnral(ticketRow.tecnico),
    ...splitTicketResponsibleValue_gnral(ticketRow.persona_que_atiende),
    ...splitTicketResponsibleValue_gnral(ticketRow.blt_empleado)
  ];

  const codigoEquipo = String(ticketRow.codigo_equipo || ticketRow.equipo || '').trim();
  const proyecto = String(ticketRow.proyecto || ticketRow.proyecto_padre || '').trim();

  if (codigoEquipo || proyecto) {
    const clauses = [];
    const params = [];

    if (codigoEquipo) {
      clauses.push("TRIM(COALESCE(numero_equipo, '')) = ?");
      params.push(codigoEquipo);
    }
    if (proyecto) {
      clauses.push("TRIM(COALESCE(proyecto, '')) = ?");
      params.push(proyecto);
    }

    try {
      const [rows] = await executor.query(`
        SELECT supervisor_zona, superintendente
        FROM portafolio
        WHERE ${clauses.join(' OR ')}
        ORDER BY id_portafolio DESC
        LIMIT 20
      `, params);

      for (const row of rows) {
        names.push(...splitTicketResponsibleValue_gnral(row.supervisor_zona));
        names.push(...splitTicketResponsibleValue_gnral(row.superintendente));
      }
    } catch (error) {
      console.warn('[tickets][fase2-notificaciones] No se pudieron complementar responsables desde portafolio:', error.message);
    }
  }

  return Array.from(new Set(names.map(value => value.trim()).filter(Boolean)));
}

async function listActiveUserIds_gnral(executor = db) {
  const [rows] = await executor.query(`
    SELECT id_SB
    FROM usuarios
    WHERE estado = 1
    ORDER BY id_SB ASC
  `);
  return rows
    .map(row => Number(row.id_SB || 0))
    .filter(id => Number.isInteger(id) && id > 0);
}

/**
 * Resuelve la zona estructurada del Ticket con la misma precedencia cerrada
 * usada por el alcance UNITED: equipo primero; proyecto/proyecto_padre solo
 * cuando no existe codigo_equipo. tickets.zona no concede alcance.
 */
async function resolveTicketZoneId_gnral(executor, ticketRow) {
  const code = String(ticketRow && ticketRow.codigo_equipo || '').trim();
  if (code) {
    const [rows] = await executor.query(`
      SELECT zona_id
      FROM portafolio
      WHERE estado_registro = 1
        AND TRIM(COALESCE(numero_equipo, '')) = TRIM(?)
    `, [code]);

    if (!rows.length || rows.some(row => !Number(row.zona_id))) return null;
    const ids = [...new Set(rows.map(row => Number(row.zona_id)).filter(Boolean))];
    return ids.length === 1 ? ids[0] : null;
  }

  const project = String(ticketRow && ticketRow.proyecto || '').trim();
  const parent = String(ticketRow && ticketRow.proyecto_padre || '').trim();
  if (!project && !parent) return null;

  const clauses = [];
  const params = [];
  if (project) {
    clauses.push("LOWER(TRIM(COALESCE(proyecto, ''))) = LOWER(TRIM(?))");
    params.push(project);
  }
  if (parent) {
    clauses.push("LOWER(TRIM(COALESCE(proyecto, ''))) = LOWER(TRIM(?))");
    params.push(parent);
  }

  const [rows] = await executor.query(`
    SELECT zona_id
    FROM portafolio
    WHERE estado_registro = 1
      AND (${clauses.join(' OR ')})
  `, params);

  if (!rows.length || rows.some(row => !Number(row.zona_id))) return null;
  const ids = [...new Set(rows.map(row => Number(row.zona_id)).filter(Boolean))];
  return ids.length === 1 ? ids[0] : null;
}

async function emitTicketEvent_gnral({
  eventCode,
  ticketRow,
  actor,
  title,
  message,
  icon,
  eventInstanceKey
}) {
  try {
    const [candidateIds, zoneId] = await Promise.all([
      listActiveUserIds_gnral(db),
      resolveTicketZoneId_gnral(db, ticketRow)
    ]);

    return await emitBusinessEventSafe_gnral({
      codigoEvento: eventCode,
      destinatarios: candidateIds,
      actorUserId: actor && actor.id,
      ...(zoneId ? { zonaOperativaId: zoneId } : {}),
      requireRoleMatrix: true,
      titulo: title,
      mensaje: String(message || '').slice(0, 2000),
      icono: icon,
      accion: 'ABRIR_TICKET',
      idReferencia: Number(ticketRow && ticketRow.id) || null,
      ruta: ticketRow && ticketRow.ticket ? `detalle:ticket:${ticketRow.ticket}` : null,
      eventInstanceKey
    }, {
      label: `${eventCode}:${ticketRow && ticketRow.ticket || 'sin-ticket'}`
    });
  } catch (error) {
    console.error('[tickets][fase2-notificaciones] La accion de negocio ya fue confirmada; fallo la preparacion de la notificacion:', error.message);
    return {
      ok: false,
      created: 0,
      recipients: [],
      reason: 'ERROR_PREPARACION_NOTIFICACION',
      error: error.message
    };
  }
}

async function createTicketComentario(req, res) {
  const ticket = String(req.params.ticket || '').trim();
  const comentario = String(req.body && req.body.comentario || '').trim().slice(0, 2000);
  const user = currentUserRef_gnral(req);

  if (!comentario) {
    return res.status(400).json({ ok: false, message: 'El comentario es obligatorio.' });
  }
  if (!user.id) {
    return res.status(401).json({ ok: false, message: 'Sesión sin usuario válido.' });
  }

  const conn = await db.getConnection();
  let row = null;
  let commentId = null;

  try {
    await conn.beginTransaction();
    row = await findTicketRow_gnral(ticket, conn);
    if (!row) {
      await conn.rollback();
      return res.status(404).json({ ok: false, message: 'Ticket no encontrado.' });
    }

    const [result] = await conn.query(
      'INSERT INTO ticket_comentarios (id_ticket,id_usuario,comentario) VALUES (?,?,?)',
      [row.id, user.id, comentario]
    );
    commentId = Number(result.insertId || 0) || null;
    await conn.commit();
  } catch (error) {
    try { await conn.rollback(); } catch (_rollbackError) {}
    return res.status(500).json({
      ok: false,
      message: 'Error agregando comentario.',
      error: error.message
    });
  } finally {
    conn.release();
  }

  const notificationResult = await emitTicketEvent_gnral({
    eventCode: EVENT_TICKET_COMMENT,
    ticketRow: row,
    actor: user,
    title: 'Nuevo comentario en Ticket',
    message: `${user.iniciales || user.correo || 'Usuario'} comentó el ticket ${row.ticket}.`,
    icon: '💬',
    eventInstanceKey: `ticket-comentario:${row.id}:${commentId}`
  });

  return res.status(201).json({
    ok: true,
    message: 'Comentario agregado.',
    data: {
      id_comentario: commentId,
      notificaciones_creadas: Number(notificationResult.created || 0),
      destinatarios_notificacion: notificationResult.recipients || [],
      notificacion_trace_id: notificationResult.trace_id || null,
      notificacion_error: notificationResult.ok === false ? notificationResult.reason : null
    }
  });
}

async function saveTicketValidacion(req, res) {
  const ticket = String(req.params.ticket || '').trim();
  const estado = String(req.body && req.body.vobo_estado || 'Pendiente').trim();
  const comentario = String(req.body && req.body.vobo_comentario || '').trim().slice(0, 2000);
  const user = currentUserRef_gnral(req);

  if (!['Pendiente', 'Validado', 'Rechazado'].includes(estado)) {
    return res.status(400).json({ ok: false, message: 'Estado de validación no válido.' });
  }
  if (!user.id) {
    return res.status(401).json({ ok: false, message: 'Sesión sin usuario válido.' });
  }

  const conn = await db.getConnection();
  let row = null;
  let previous = 'Pendiente';
  let validationId = null;

  try {
    await conn.beginTransaction();
    row = await findTicketRow_gnral(ticket, conn);
    if (!row) {
      await conn.rollback();
      return res.status(404).json({ ok: false, message: 'Ticket no encontrado.' });
    }

    previous = String(row.vobo_estado || 'Pendiente');
    const reverting = previous !== 'Pendiente' && estado === 'Pendiente';
    if (reverting && !ticketCanRevert_gnral(req)) {
      await conn.rollback();
      return res.status(403).json({ ok: false, message: 'Solo Programador puede revertir una validación.' });
    }

    const names = (await ticketResponsibleNames_gnral(row, conn)).map(value => value.toLowerCase());
    const requestUser = req.contextUser || req.user || {};
    const identity = [requestUser.nombre, requestUser.iniciales, requestUser.correo]
      .filter(Boolean)
      .map(value => String(value).toLowerCase());
    const elevated = ticketRoleNames_gnral(req)
      .some(role => role.includes('director general') || role.includes('programador'));

    if (!reverting && (
      !ticketCanValidateRole_gnral(req) ||
      (!elevated && !identity.some(value => names.includes(value)))
    )) {
      await conn.rollback();
      return res.status(403).json({
        ok: false,
        message: 'Solo el Supervisor o Superintendente responsable puede validar este ticket.'
      });
    }

    await conn.query(`
      UPDATE tickets
      SET vobo_estado = ?,
          vobo_comentario = ?,
          vobo_por_id = ?,
          vobo_por_nombre = ?,
          vobo_en = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      estado,
      comentario,
      user.id,
      requestUser.nombre || user.iniciales || user.correo,
      row.id
    ]);

    const [validationResult] = await conn.query(`
      INSERT INTO ticket_validaciones (
        id_ticket, id_usuario, estado_anterior, estado_nuevo, comentario, ip_origen
      ) VALUES (?, ?, ?, ?, ?, ?)
    `, [row.id, user.id, previous, estado, comentario, req.ip || null]);
    validationId = Number(validationResult.insertId || 0) || null;

    await conn.commit();
  } catch (error) {
    try { await conn.rollback(); } catch (_rollbackError) {}
    return res.status(500).json({
      ok: false,
      message: 'Error guardando validación.',
      error: error.message
    });
  } finally {
    conn.release();
  }

  const notificationResult = await emitTicketEvent_gnral({
    eventCode: EVENT_TICKET_VOBO,
    ticketRow: row,
    actor: user,
    title: 'Vo.Bo. de Ticket actualizado',
    message: `${user.iniciales || user.correo || 'Usuario'} cambió la validación del ticket ${row.ticket}: ${previous} → ${estado}.`,
    icon: '✅',
    eventInstanceKey: `ticket-vobo:${row.id}:${validationId}`
  });

  return res.json({
    ok: true,
    message: 'Validación guardada.',
    data: {
      ticket: row.ticket,
      vobo_estado: estado,
      vobo_comentario: comentario,
      notificaciones_creadas: Number(notificationResult.created || 0),
      destinatarios_notificacion: notificationResult.recipients || [],
      notificacion_trace_id: notificationResult.trace_id || null,
      notificacion_error: notificationResult.ok === false ? notificationResult.reason : null
    }
  });
}

async function saveTicketVobo(req, res) {
  return saveTicketValidacion(req, res);
}

module.exports = {
  createTicketComentario,
  saveTicketValidacion,
  saveTicketVobo,
  // Exportados para pruebas de Fase 2.
  resolveTicketZoneId_gnral,
  findTicketRow_gnral,
  ticketResponsibleNames_gnral
};

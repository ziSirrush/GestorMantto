const db = require('../config/db');
const supportSolicitudesService = require('../services/support-solicitudes.service');
const supportFilesService = require('../modules/support/support-files.service');

function hasExactSupportRole(user) {
  const roles = [user && user.rol, ...((user && Array.isArray(user.roles)) ? user.roles : [])].filter(Boolean);
  return roles.includes('Soporte');
}

/* ==========================================
   Helpers
========================================== */

async function getTableColumns(tableName) {
  const [rows] = await db.query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?`,
    [tableName]
  );

  return rows.map(row => row.COLUMN_NAME);
}

function pickColumn(columns, candidates) {
  return candidates.find(col => columns.includes(col)) || null;
}

function pickValue(body, candidates, fallback = null) {
  for (const key of candidates) {
    if (body[key] !== undefined && body[key] !== null && body[key] !== '') return body[key];
  }
  return fallback;
}

function safeJson(value) {
  try {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    return JSON.parse(value);
  } catch (error) {
    return [];
  }
}

function supportEvent(req, accion, extra) {
  const user = req.user || {};
  return Object.assign({
    fecha: new Date().toISOString(),
    usuario_id: user.id_SB || null,
    usuario: user.nombre || user.correo || 'Invitado',
    accion
  }, extra || {});
}

async function appendTicketHistory(tableName, ticketIdColumn, ticketId, event) {
  const columns = await getTableColumns(tableName);
  const historyColumn = pickColumn(columns, ['historial', 'history', 'bitacora']);
  if (!historyColumn) return;

  const [rows] = await db.query(
    `SELECT \`${historyColumn}\` AS historial FROM \`${tableName}\` WHERE \`${ticketIdColumn}\` = ? LIMIT 1`,
    [ticketId]
  );

  const current = rows.length ? safeJson(rows[0].historial) : [];
  current.push(event);

  await db.query(
    `UPDATE \`${tableName}\` SET \`${historyColumn}\` = ? WHERE \`${ticketIdColumn}\` = ?`,
    [JSON.stringify(current), ticketId]
  );
}

function canAdministrateSupport(req) {
  return supportSolicitudesService.canAdministrateSupport(req.user || {});
}

/* ==========================================
   CENTRO DE AYUDA / NORI
========================================== */

async function getMenu(req, res) {
  try {
    const [nodos] = await db.query(`
      SELECT *
      FROM sup_nodos
      WHERE id_nodo = 1
        AND activo = 1
      LIMIT 1
    `);

    if (!nodos.length) {
      return res.status(404).json({
        ok: false,
        message: 'No se encontró el menú principal.'
      });
    }

    const [opciones] = await db.query(`
      SELECT *
      FROM sup_opciones
      WHERE id_nodo = 1
        AND activo = 1
      ORDER BY orden_visualizacion ASC, id_opcion ASC
    `);

    return res.json({
      ok: true,
      source: 'support_menu',
      mode: req.user ? 'user' : 'guest',
      data: {
        nodo: nodos[0],
        opciones
      }
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error consultando el menú del Centro de Ayuda.',
      error: error.message
    });
  }
}

async function getNode(req, res) {
  const idNodo = req.params.id_nodo || req.query.id_nodo || 1;

  try {
    const [nodos] = await db.query(
      `SELECT * FROM sup_nodos WHERE id_nodo = ? AND activo = 1 LIMIT 1`,
      [idNodo]
    );

    if (!nodos.length) {
      return res.status(404).json({ ok: false, message: 'Nodo no encontrado.' });
    }

    const [opciones] = await db.query(
      `SELECT *
       FROM sup_opciones
       WHERE id_nodo = ?
         AND activo = 1
       ORDER BY orden_visualizacion ASC, id_opcion ASC`,
      [idNodo]
    );

    return res.json({
      ok: true,
      source: 'support_node',
      mode: req.user ? 'user' : 'guest',
      data: {
        nodo: nodos[0],
        opciones
      }
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Error consultando nodo.', error: error.message });
  }
}

async function getFaq(req, res) {
  try {
    let sql = `
      SELECT
        f.*,
        c.nombre_categoria,
        c.descripcion_categoria,
        c.icono_categoria
      FROM sup_faq f
      LEFT JOIN sup_faq_categorias c
        ON c.id_faq_categoria = f.id_faq_categoria
      WHERE COALESCE(f.activo, 1) = 1
    `;

    const params = [];
    if (req.query.q) {
      const q = `%${req.query.q}%`;
      sql += ` AND (f.pregunta_faq LIKE ? OR f.respuesta_faq LIKE ? OR f.palabras_clave LIKE ?)`;
      params.push(q, q, q);
    }

    sql += ` ORDER BY COALESCE(f.orden_visualizacion, 999), f.id_faq ASC`;

    const [rows] = await db.query(sql, params);

    return res.json({
      ok: true,
      source: 'support_faq',
      data: rows
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Error consultando FAQ.', error: error.message });
  }
}

async function getAvisos(req, res) {
  try {
    const [rows] = await db.query(`
      SELECT *
      FROM sup_avisos
      WHERE COALESCE(activo, 1) = 1
      ORDER BY COALESCE(fecha_inicio, fecha_creacion, NOW()) DESC
      LIMIT 50
    `);

    return res.json({ ok: true, source: 'support_avisos', data: rows });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Error consultando avisos.', error: error.message });
  }
}

/* ==========================================
   SOLICITUDES / TICKETS DE SOPORTE
========================================== */


async function getMyTickets(req, res) {
  try {
    const rows = await supportSolicitudesService.listSolicitudes({
      q: req.query.q,
      estado: req.query.estado,
      modulo: req.query.modulo,
      limit: req.query.limit,
      userId: req.user.id_SB
    });

    return res.json({
      ok: true,
      source: 'support_my_tickets',
      scope: 'mine',
      data: rows
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      ok: false,
      message: 'Error consultando tus solicitudes.',
      error: error.message
    });
  }
}

async function getMyTicketById(req, res) {
  try {
    const ticket = await supportSolicitudesService.getSolicitudById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ ok: false, message: 'Solicitud no encontrada.' });
    }

    if (Number(ticket.id_usuario || 0) !== Number(req.user.id_SB)) {
      return res.status(403).json({
        ok: false,
        message: 'No tienes permiso para consultar esta solicitud.'
      });
    }

    return res.json({
      ok: true,
      source: 'support_my_ticket_detail',
      mode: 'requester',
      permissions: {
        edit_support_fields: false,
        comment: true,
        attach: true,
        delete_attachment: true
      },
      data: ticket
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      ok: false,
      message: 'Error consultando el detalle de tu solicitud.',
      error: error.message
    });
  }
}

async function createMyTicket(req, res) {
  try {
    const [cats] = await db.query(`
      SELECT id_ticket_categoria
      FROM sup_ticket_categorias
      WHERE COALESCE(activo, 1) = 1
      ORDER BY orden_visualizacion ASC, id_ticket_categoria ASC
      LIMIT 1
    `);

    const categoriaId = req.body.id_ticket_categoria || (cats[0] && cats[0].id_ticket_categoria) || 1;
    const folio = 'SUP-' + Date.now();
    const asunto = String(req.body.asunto || req.body.titulo || req.body.subject || '').trim().slice(0, 255);
    const descripcion = String(req.body.descripcion || req.body.detalle || req.body.description || '').trim();
    const modulo = String(req.body.modulo || req.body.modulo_ticket || '').trim().slice(0, 150) || null;
    const fechaIncidente = req.body.fecha_incidente ? new Date(req.body.fecha_incidente) : null;
    const fechaIncidenteSql = fechaIncidente && !Number.isNaN(fechaIncidente.getTime()) ? fechaIncidente : null;

    if (!asunto) return res.status(400).json({ ok: false, message: 'El asunto es obligatorio.' });
    if (!descripcion) return res.status(400).json({ ok: false, message: 'La descripción es obligatoria.' });
    if (req.body.fecha_incidente && !fechaIncidenteSql) {
      return res.status(400).json({ ok: false, message: 'La fecha del incidente no es válida.' });
    }

    const historial = [supportEvent(req, 'ticket_creado', {
      asunto,
      modulo,
      mensaje: 'Solicitud creada desde Centro de Ayuda.'
    })];

    const created = await supportFilesService.createTicketWithAttachments_gnral({
      actor: req.user,
      canAdministrate: false,
      files: req.files,
      ticket: {
        folio,
        empresa: req.user.empresa || null,
        id_ticket_categoria: Number(categoriaId),
        tipo_ticket: 'Soporte',
        estado_ticket: 'Abierto',
        prioridad_ticket: 'Media',
        origen_ticket: 'Centro de Ayuda',
        modulo_ticket: modulo,
        asunto_ticket: asunto,
        descripcion_ticket: descripcion,
        fecha_incidente: fechaIncidenteSql,
        historial
      }
    });

    let notificacionesSoporte = 0;
    try {
      notificacionesSoporte = await supportSolicitudesService.notifySupportUsers({
        ticketId: created.ticketId,
        folio,
        asunto
      });
    } catch (notificationError) {
      console.error('[SOPORTE] Solicitud creada, pero falló la notificación al rol Soporte:', notificationError.message);
    }

    return res.status(201).json({
      ok: true,
      message: 'Solicitud creada correctamente.',
      id: created.ticketId,
      folio,
      estado: 'Abierto',
      prioridad_asignada_por_sistema: 'Media',
      archivos_adjuntos: created.uploadedCount,
      ids_adjuntos: created.attachmentIds,
      notificaciones_soporte: notificacionesSoporte
    });
  } catch (error) {
    const requestId = `SUP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    console.error('[SOPORTE] Error creando solicitud:', {
      request_id: requestId,
      user_id: req.user && req.user.id_SB,
      code: error.code || null,
      message: error.message,
      sql_code: error.code && String(error.code).startsWith('ER_') ? error.code : null,
      sql_state: error.sqlState || null,
      sql_message: error.sqlMessage || null
    });
    return res.status(error.status || 500).json({
      ok: false,
      code: error.code || 'SUPPORT_CREATE_ERROR',
      request_id: requestId,
      message: error.expose || error.status < 500 ? error.message : 'Error creando tu solicitud.'
    });
  }
}

async function updateMyTicket(req, res) {
  try {
    const beforeTicket = await supportSolicitudesService.getSolicitudById(req.params.id);
    if (!beforeTicket) {
      return res.status(404).json({ ok: false, message: 'Solicitud no encontrada.' });
    }

    if (Number(beforeTicket.id_usuario || 0) !== Number(req.user.id_SB)) {
      return res.status(403).json({
        ok: false,
        message: 'No tienes permiso para editar esta solicitud.'
      });
    }

    const allowed = {
      id_ticket_categoria: req.body.id_ticket_categoria,
      modulo_ticket: req.body.modulo !== undefined ? req.body.modulo : req.body.modulo_ticket,
      asunto_ticket: req.body.asunto !== undefined ? req.body.asunto : req.body.asunto_ticket,
      descripcion_ticket: req.body.descripcion !== undefined ? req.body.descripcion : req.body.descripcion_ticket,
      fecha_incidente: req.body.fecha_incidente
    };

    const changes = {};
    const changedFields = [];
    const compare = (column, label, oldValue, nextValue, maxLength = null) => {
      if (nextValue === undefined) return;
      let normalized = typeof nextValue === 'string' ? nextValue.trim() : nextValue;
      if (maxLength && typeof normalized === 'string') normalized = normalized.slice(0, maxLength);
      if (column === 'id_ticket_categoria' && normalized !== '' && normalized !== null) normalized = Number(normalized);
      if (column !== 'id_ticket_categoria' && !normalized) {
        const error = new Error(`${label} es obligatorio.`);
        error.status = 400;
        throw error;
      }
      if (String(oldValue ?? '') !== String(normalized ?? '')) {
        changes[column] = normalized;
        changedFields.push(label);
      }
    };

    compare('id_ticket_categoria', 'Categoría', beforeTicket.id_ticket_categoria, allowed.id_ticket_categoria);
    compare('modulo_ticket', 'Módulo', beforeTicket.modulo_ticket, allowed.modulo_ticket, 150);
    compare('asunto_ticket', 'Asunto', beforeTicket.asunto_ticket, allowed.asunto_ticket, 255);
    compare('descripcion_ticket', 'Descripción', beforeTicket.descripcion_ticket, allowed.descripcion_ticket);
    if (allowed.fecha_incidente !== undefined) {
      const parsedIncident = allowed.fecha_incidente ? new Date(allowed.fecha_incidente) : null;
      if (allowed.fecha_incidente && Number.isNaN(parsedIncident.getTime())) {
        const error = new Error('La fecha del incidente no es válida.');
        error.status = 400;
        throw error;
      }
      const normalizedIncident = parsedIncident || null;
      const oldIncident = beforeTicket.fecha_incidente ? new Date(beforeTicket.fecha_incidente).getTime() : null;
      const newIncident = normalizedIncident ? normalizedIncident.getTime() : null;
      if (oldIncident !== newIncident) {
        changes.fecha_incidente = normalizedIncident;
        changedFields.push('Fecha del incidente');
      }
    }

    if (!changedFields.length) {
      return res.json({ ok: true, message: 'No se detectaron cambios.', cambios: [] });
    }

    const setSql = Object.keys(changes).map(column => `\`${column}\` = ?`);
    setSql.push('fecha_actualizacion = NOW()');
    await db.query(
      `UPDATE sup_tickets SET ${setSql.join(', ')} WHERE id_ticket = ? AND id_usuario = ?`,
      [...Object.values(changes), beforeTicket.id_ticket, req.user.id_SB]
    );

    await appendTicketHistory('sup_tickets', 'id_ticket', beforeTicket.id_ticket, supportEvent(req, 'solicitud_actualizada', {
      mensaje: 'El solicitante actualizó la información de la solicitud.',
      campos_actualizados: changedFields
    }));

    const afterTicket = await supportSolicitudesService.getSolicitudById(beforeTicket.id_ticket);
    let notificaciones = 0;
    try {
      notificaciones = await supportSolicitudesService.notifyRequesterUpdate({
        ticket: afterTicket,
        actor: req.user || {},
        changedFields
      });
    } catch (notificationError) {
      console.error('[SOPORTE] Solicitud actualizada, pero falló la notificación:', notificationError.message);
    }

    return res.json({
      ok: true,
      message: 'Solicitud actualizada correctamente.',
      cambios: changedFields,
      notificaciones,
      data: afterTicket
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      ok: false,
      message: error.status === 400 ? error.message : 'Error actualizando tu solicitud.',
      error: error.message
    });
  }
}

async function getTickets(req, res) {
  try {
    const admin = canAdministrateSupport(req);
    const rows = await supportSolicitudesService.listSolicitudes({
      q: req.query.q,
      estado: req.query.estado,
      modulo: req.query.modulo,
      limit: req.query.limit,
      userId: admin ? null : req.user.id_SB
    });

    return res.json({
      ok: true,
      source: 'support_tickets',
      scope: admin ? 'all' : 'mine',
      data: rows
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      ok: false,
      message: 'Error consultando solicitudes.',
      error: error.message
    });
  }
}

async function getTicketById(req, res) {
  try {
    const ticket = await supportSolicitudesService.getSolicitudById(req.params.id);

    if (!ticket) {
      return res.status(404).json({ ok: false, message: 'Solicitud no encontrada.' });
    }

    const ownerId = Number(ticket.id_usuario || ticket.usuario_id || ticket.created_by || ticket.creado_por || 0);
    const isOwner = ownerId > 0 && ownerId === Number(req.user.id_SB);

    if (!canAdministrateSupport(req) && !isOwner) {
      return res.status(403).json({
        ok: false,
        message: 'No tienes permiso para consultar esta solicitud.'
      });
    }

    if (hasExactSupportRole(req.user || {}) && !ticket.id_soporte) {
      const assigned = await supportSolicitudesService.autoAssignIfEmpty(ticket.id_ticket, req.user.id_SB);
      if (assigned) {
        await appendTicketHistory('sup_tickets', 'id_ticket', ticket.id_ticket, supportEvent(req, 'asignacion_automatica', {
          mensaje: `Solicitud asignada automáticamente a ${req.user.nombre || req.user.correo || 'Soporte'}`
        }));
        return res.json({
          ok: true,
          source: 'support_ticket_detail',
          auto_asignada: true,
          permissions: { edit_support_fields: true, comment: true, attach: true, delete_attachment: true },
          data: await supportSolicitudesService.getSolicitudById(ticket.id_ticket)
        });
      }
    }

    return res.json({
      ok: true,
      source: 'support_ticket_detail',
      permissions: {
        edit_support_fields: canAdministrateSupport(req),
        comment: true,
        attach: true,
        delete_attachment: true
      },
      data: ticket
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      ok: false,
      message: 'Error consultando el detalle de la solicitud.',
      error: error.message
    });
  }
}

async function updateTicket(req, res) {
  try {
    if (!canAdministrateSupport(req)) {
      return res.status(403).json({
        ok: false,
        message: 'No tienes permisos para actualizar solicitudes de soporte.'
      });
    }

    const tableName = 'sup_tickets';
    const beforeTicket = await supportSolicitudesService.getSolicitudById(req.params.id);
    if (!beforeTicket) {
      return res.status(404).json({ ok: false, message: 'Solicitud no encontrada.' });
    }
    const columns = await getTableColumns(tableName);
    const idColumn = pickColumn(columns, ['id_ticket', 'id_sup_ticket', 'id']);

    if (!idColumn) {
      return res.status(500).json({ ok: false, message: 'No se encontró columna ID para sup_tickets.' });
    }

    const updates = {};
    const add = (columnCandidates, value) => {
      const column = pickColumn(columns, columnCandidates);
      if (column && value !== undefined && value !== null && value !== '') updates[column] = value;
    };

    add(['estado_ticket', 'estado', 'status'], pickValue(req.body, ['estado_ticket', 'estado', 'status']));
    add(['prioridad_ticket', 'prioridad', 'priority'], pickValue(req.body, ['prioridad_ticket', 'prioridad', 'priority']));
    const assignedValue = pickValue(req.body, ['id_soporte', 'asignado_a', 'id_asignado'], undefined);
    const assignedColumn = pickColumn(columns, ['id_soporte', 'soporte_id', 'asignado_a', 'id_asignado']);
    if (assignedColumn && assignedValue !== undefined) updates[assignedColumn] = assignedValue === '' ? null : assignedValue;
    add(['updated_at', 'fecha_actualizacion'], new Date());

    const updateColumns = Object.keys(updates);

    if (updateColumns.length) {
      const sql = `
        UPDATE \`${tableName}\`
        SET ${updateColumns.map(col => `\`${col}\` = ?`).join(', ')}
        WHERE \`${idColumn}\` = ?
      `;
      await db.query(sql, [...updateColumns.map(col => updates[col]), req.params.id]);
    }

    await appendTicketHistory(tableName, idColumn, req.params.id, supportEvent(req, 'ticket_actualizado', { cambios: req.body }));

    let notificaciones = 0;
    try {
      const afterTicket = await supportSolicitudesService.getSolicitudById(req.params.id);
      notificaciones = await supportSolicitudesService.notifyTicketChanges({
        before: beforeTicket,
        after: afterTicket,
        actor: req.user || {}
      });
    } catch (notificationError) {
      console.error('[SOPORTE] Solicitud actualizada, pero falló la notificación de cambios:', notificationError.message);
    }

    return res.json({ ok: true, message: 'Solicitud actualizada correctamente.', notificaciones });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Error actualizando solicitud.', error: error.message });
  }
}

async function createTicket(req, res) {
  try {
    const [cats] = await db.query(`
      SELECT id_ticket_categoria
      FROM sup_ticket_categorias
      WHERE COALESCE(activo, 1) = 1
      ORDER BY orden_visualizacion ASC, id_ticket_categoria ASC
      LIMIT 1
    `);

    const categoriaId = req.body.id_ticket_categoria || (cats[0] && cats[0].id_ticket_categoria) || 1;
    const folio = 'SUP-' + Date.now();
    const asunto = String(req.body.asunto || req.body.titulo || req.body.subject || 'Solicitud de soporte').trim().slice(0, 255);
    const descripcion = String(req.body.descripcion || req.body.detalle || req.body.description || 'Sin descripción').trim();
    const modulo = String(req.body.modulo || req.body.modulo_ticket || '').trim().slice(0, 150) || null;
    const fechaIncidente = req.body.fecha_incidente ? new Date(req.body.fecha_incidente) : null;
    if (req.body.fecha_incidente && Number.isNaN(fechaIncidente.getTime())) {
      return res.status(400).json({ ok: false, message: 'La fecha del incidente no es válida.' });
    }
    const historial = [supportEvent(req, 'ticket_creado', { asunto, modulo })];

    const created = await supportFilesService.createTicketWithAttachments_gnral({
      actor: req.user,
      canAdministrate: canAdministrateSupport(req),
      files: req.files,
      ticket: {
        folio,
        empresa: req.user.empresa || null,
        id_ticket_categoria: Number(categoriaId),
        tipo_ticket: req.body.tipo_ticket || 'Soporte',
        estado_ticket: req.body.estado_ticket || 'Abierto',
        prioridad_ticket: req.body.prioridad_ticket || req.body.prioridad || 'Media',
        origen_ticket: req.body.origen_ticket || 'Portal',
        modulo_ticket: modulo,
        asunto_ticket: asunto,
        descripcion_ticket: descripcion,
        fecha_incidente: fechaIncidente || null,
        historial
      }
    });

    let notificacionesSoporte = 0;
    try {
      notificacionesSoporte = await supportSolicitudesService.notifySupportUsers({
        ticketId: created.ticketId,
        folio,
        asunto
      });
    } catch (notificationError) {
      console.error('[SOPORTE] Solicitud creada, pero falló la notificación al rol Soporte:', notificationError.message);
    }

    return res.status(201).json({
      ok: true,
      message: 'Solicitud creada correctamente.',
      id: created.ticketId,
      folio,
      archivos_adjuntos: created.uploadedCount,
      ids_adjuntos: created.attachmentIds,
      notificaciones_soporte: notificacionesSoporte
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      ok: false,
      code: error.code || undefined,
      message: error.expose || error.status < 500 ? error.message : 'Error creando solicitud.'
    });
  }
}


async function getTicketCatalogs(req, res) {
  try {
    if (!canAdministrateSupport(req)) {
      return res.status(403).json({ ok: false, message: 'No tienes permisos para administrar solicitudes.' });
    }
    return res.json({ ok: true, data: { usuarios_soporte: await supportSolicitudesService.listSupportUsers() } });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Error consultando catálogos de soporte.', error: error.message });
  }
}

async function addTicketComment(req, res) {
  try {
    const ticket = await supportSolicitudesService.getSolicitudById(req.params.id);
    if (!ticket) return res.status(404).json({ ok: false, message: 'Solicitud no encontrada.' });
    const ownerId = Number(ticket.id_usuario || 0);
    if (!canAdministrateSupport(req) && ownerId !== Number(req.user.id_SB)) {
      return res.status(403).json({ ok: false, message: 'No tienes permiso para comentar esta solicitud.' });
    }
    const comentario = String(req.body.comentario || req.body.mensaje || '').trim().slice(0, 2000);
    if (!comentario) return res.status(400).json({ ok: false, message: 'El comentario es obligatorio.' });
    await appendTicketHistory('sup_tickets', 'id_ticket', ticket.id_ticket, supportEvent(req, 'comentario', { mensaje: comentario }));
    await db.query(
      `UPDATE sup_tickets
          SET fecha_ultima_respuesta = NOW(), fecha_actualizacion = NOW(), ultima_respuesta_por = ?
        WHERE id_ticket = ?`,
      [hasExactSupportRole(req.user || {}) ? 'Soporte' : 'Usuario', ticket.id_ticket]
    );
    let notificaciones = 0;
    try {
      notificaciones = await supportSolicitudesService.notifyTicketInteraction({
        ticket,
        actor: req.user || {},
        kind: 'comentario'
      });
    } catch (notificationError) {
      console.error('[SOPORTE] Comentario guardado, pero falló la notificación:', notificationError.message);
    }
    return res.status(201).json({ ok: true, message: 'Comentario agregado correctamente.', notificaciones });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Error agregando comentario.', error: error.message });
  }
}

async function addTicketAttachment(req, res) {
  try {
    const result = await supportFilesService.addAttachment_gnral({
      ticketId: req.params.id,
      actor: req.user,
      file: req.file,
      canAdministrate: canAdministrateSupport(req)
    });

    let notificaciones = 0;
    try {
      notificaciones = await supportSolicitudesService.notifyTicketInteraction({
        ticket: result.ticket,
        actor: req.user || {},
        kind: 'archivo',
        fileName: result.nombre_original
      });
    } catch (notificationError) {
      console.error('[SOPORTE] Archivo guardado, pero falló la notificación:', notificationError.message);
    }

    return res.status(201).json({
      ok: true,
      message: 'Archivo adjuntado correctamente.',
      id_adjunto: result.id_adjunto,
      notificaciones
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      ok: false,
      code: error.code || undefined,
      message: error.expose || error.status < 500 ? error.message : 'Error adjuntando archivo.'
    });
  }
}

async function getTicketAttachmentAccess(req, res) {
  try {
    const data = await supportFilesService.createAttachmentAccess_gnral({
      ticketId: req.params.id,
      attachmentId: req.params.idAdjunto,
      actor: req.user,
      canAdministrate: canAdministrateSupport(req),
      download: ['1', 'true', 'yes'].includes(String(req.query.download || '').toLowerCase())
    });
    return res.json({ ok: true, message: 'Acceso temporal generado.', data });
  } catch (error) {
    return res.status(error.status || 500).json({
      ok: false,
      code: error.code || undefined,
      message: error.expose || error.status < 500 ? error.message : 'No fue posible abrir el archivo.'
    });
  }
}

async function deleteTicketAttachment(req, res) {
  try {
    const result = await supportFilesService.deleteAttachment_gnral({
      ticketId: req.params.id,
      attachmentId: req.params.idAdjunto,
      actor: req.user,
      canAdministrate: canAdministrateSupport(req)
    });
    return res.json({
      ok: true,
      message: result.cleanup.attempted && !result.cleanup.completed
        ? 'Archivo retirado. La eliminación física quedó programada para reintento.'
        : 'Archivo eliminado correctamente.',
      data: result
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      ok: false,
      code: error.code || undefined,
      message: error.expose || error.status < 500 ? error.message : 'No fue posible eliminar el archivo.'
    });
  }
}

async function getNotificaciones(req, res) {
  try {
    const [rows] = await db.query(
      `SELECT *
       FROM sup_notificaciones
       WHERE id_usuario = ?
       ORDER BY COALESCE(fecha_creacion, fecha_actualizacion, NOW()) DESC
       LIMIT 100`,
      [req.user.id_SB]
    );

    return res.json({ ok: true, source: 'support_notificaciones', data: rows });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Error consultando notificaciones.', error: error.message });
  }
}

module.exports = {
  getMenu,
  getNode,
  getFaq,
  getAvisos,
  createTicket,
  getMyTickets,
  getMyTicketById,
  createMyTicket,
  updateMyTicket,
  getTickets,
  getTicketById,
  updateTicket,
  getTicketCatalogs,
  addTicketComment,
  addTicketAttachment,
  getTicketAttachmentAccess,
  deleteTicketAttachment,
  getNotificaciones
};

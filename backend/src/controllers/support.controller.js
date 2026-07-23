const db = require('../config/db');
const soporteSolicitudesService = require('../services/support-solicitudes.service');

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

function isProgramador(req) {
  const roles = (req.user && req.user.roles) || [];
  return roles.includes('Programador') || (req.user && req.user.rol === 'Programador');
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

async function createTicket(req, res) {
  try {
    const tableName = 'sup_tickets';
    const columns = await getTableColumns(tableName);

    if (!columns.length) {
      return res.status(500).json({ ok: false, message: 'La tabla sup_tickets no existe o no tiene columnas.' });
    }

    const payload = {};
    const add = (columnCandidates, value) => {
      const column = pickColumn(columns, columnCandidates);
      if (column && value !== undefined && value !== null && value !== '') payload[column] = value;
    };

    const event = supportEvent(req, 'ticket_creado', {
      asunto: pickValue(req.body, ['asunto', 'titulo', 'subject']),
      modulo: pickValue(req.body, ['modulo', 'modulo_afectado', 'categoria'])
    });

    add(['id_usuario', 'usuario_id', 'created_by', 'creado_por'], req.user.id_SB);
    add(['modulo', 'modulo_afectado', 'categoria', 'categoria_ticket'], pickValue(req.body, ['modulo', 'modulo_afectado', 'categoria']));
    add(['asunto', 'titulo', 'subject'], pickValue(req.body, ['asunto', 'titulo', 'subject']));
    add(['descripcion', 'detalle', 'description'], pickValue(req.body, ['descripcion', 'detalle', 'description']));
    add(['estado_ticket', 'estado', 'status'], pickValue(req.body, ['estado_ticket', 'estado'], 'Abierto'));
    add(['prioridad_ticket', 'prioridad', 'priority'], pickValue(req.body, ['prioridad_ticket', 'prioridad'], 'Media'));
    add(['historial', 'history', 'bitacora'], JSON.stringify([event]));
    add(['created_at', 'fecha_creacion'], new Date());
    add(['updated_at', 'fecha_actualizacion'], new Date());

    const insertColumns = Object.keys(payload);
    if (!insertColumns.length) {
      return res.status(400).json({ ok: false, message: 'No hay campos compatibles para crear la solicitud.' });
    }

    const sql = `
      INSERT INTO \`${tableName}\` (${insertColumns.map(col => `\`${col}\``).join(', ')})
      VALUES (${insertColumns.map(() => '?').join(', ')})
    `;

    const [result] = await db.query(sql, insertColumns.map(col => payload[col]));

    return res.status(201).json({
      ok: true,
      message: 'Solicitud creada correctamente.',
      id: result.insertId
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Error creando solicitud.', error: error.message });
  }
}

async function getTickets(req, res) {
  try {
    const tableName = 'sup_tickets';
    const columns = await getTableColumns(tableName);
    const idColumn = pickColumn(columns, ['id_ticket', 'id_sup_ticket', 'id']);
    const userColumn = pickColumn(columns, ['id_usuario', 'usuario_id', 'created_by', 'creado_por']);

    let sql = `SELECT * FROM \`${tableName}\``;
    const params = [];

    if (!isProgramador(req) && userColumn) {
      sql += ` WHERE \`${userColumn}\` = ?`;
      params.push(req.user.id_SB);
    }

    sql += ` ORDER BY COALESCE(updated_at, created_at, NOW()) DESC`;
    if (idColumn) sql += `, \`${idColumn}\` DESC`;
    sql += ' LIMIT 500';

    const [rows] = await db.query(sql, params);

    return res.json({
      ok: true,
      source: 'support_tickets',
      scope: isProgramador(req) ? 'all' : 'mine',
      data: rows
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Error consultando solicitudes.', error: error.message });
  }
}

async function updateTicket(req, res) {
  try {
    const tableName = 'sup_tickets';
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
    add(['id_soporte', 'soporte_id', 'asignado_a', 'id_asignado'], pickValue(req.body, ['id_soporte', 'asignado_a', 'id_asignado']));
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

    return res.json({ ok: true, message: 'Solicitud actualizada correctamente.' });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Error actualizando solicitud.', error: error.message });
  }
}


async function createTicketV1(req, res) {
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
    const historial = [supportEvent(req, 'ticket_creado', {
      asunto: req.body.asunto || req.body.titulo || req.body.subject,
      modulo: req.body.modulo || req.body.modulo_ticket || req.body.categoria
    })];

    const [result] = await db.query(
      `INSERT INTO sup_tickets
       (folio, id_usuario, id_ticket_categoria, tipo_ticket, estado_ticket, prioridad_ticket, origen_ticket, modulo_ticket, asunto_ticket, descripcion_ticket, historial, fecha_creacion, fecha_actualizacion)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        folio,
        req.user.id_SB,
        categoriaId,
        req.body.tipo_ticket || 'Soporte',
        req.body.estado_ticket || 'Abierto',
        req.body.prioridad_ticket || req.body.prioridad || 'Media',
        req.body.origen_ticket || 'Portal',
        req.body.modulo || req.body.modulo_ticket || null,
        req.body.asunto || req.body.titulo || req.body.subject || 'Solicitud de soporte',
        req.body.descripcion || req.body.detalle || req.body.description || 'Sin descripción',
        JSON.stringify(historial)
      ]
    );

    const notificacionesSoporte = await soporteSolicitudesService.notifySupportUsers({
      ticketId: result.insertId,
      folio,
      asunto: req.body.asunto || req.body.titulo || req.body.subject || 'Solicitud de soporte'
    });

    return res.status(201).json({
      ok: true,
      message: 'Solicitud creada correctamente.',
      id: result.insertId,
      folio,
      notificaciones_soporte: notificacionesSoporte
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Error creando solicitud.', error: error.message });
  }
}

async function getSolicitudesAdministracion(req, res) {
  try {
    if (!soporteSolicitudesService.canAdministrateSupport(req.user)) {
      return res.status(403).json({
        ok: false,
        message: 'El módulo Solicitudes requiere el rol Soporte o Programador.'
      });
    }

    const rows = await soporteSolicitudesService.listSolicitudes({
      q: req.query.q,
      estado: req.query.estado,
      modulo: req.query.modulo,
      limit: req.query.limit
    });

    return res.json({
      ok: true,
      source: 'support_solicitudes_admin',
      scope: 'all',
      total: rows.length,
      data: rows
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      ok: false,
      message: 'Error consultando las solicitudes de soporte.',
      error: error.message
    });
  }
}

async function getSolicitudAdministracion(req, res) {
  try {
    if (!soporteSolicitudesService.canAdministrateSupport(req.user)) {
      return res.status(403).json({
        ok: false,
        message: 'El detalle de solicitudes requiere el rol Soporte o Programador.'
      });
    }

    const row = await soporteSolicitudesService.getSolicitudById(req.params.id);
    if (!row) {
      return res.status(404).json({ ok: false, message: 'Solicitud no encontrada.' });
    }

    return res.json({
      ok: true,
      source: 'support_solicitud_detail',
      data: row
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      ok: false,
      message: 'Error consultando el detalle de la solicitud.',
      error: error.message
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
  createTicket: createTicketV1,
  getTickets,
  updateTicket,
  getNotificaciones,
  getSolicitudesAdministracion,
  getSolicitudAdministracion
};

'use strict';

const db = require('../../config/db');
const {
  buildTicketScopeSql_gnral,
  zoneIds_gnral,
  zoneCodes_gnral
} = require('../../services/information-record-scope-gnral.service');

function normalizeText_uni(value) {
  return String(value == null ? '' : value).trim();
}

function normalizeOfficialTicketRow_uni(row) {
  const officialZone = normalizeText_uni(row?.zona_oficial);
  const officialZoneId = Number(row?.zona_id_oficial);

  return {
    ...(row || {}),
    zona: officialZone || null,
    zona_oficial: officialZone || null,
    zona_id_oficial: Number.isInteger(officialZoneId) && officialZoneId > 0
      ? officialZoneId
      : null
  };
}

function buildProjectZoneIdSql_uni(alias = 't') {
  const a = String(alias || 't').trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(a)) {
    const error = new Error(`Alias SQL invalido para Tickets UNITED: ${a || '(vacio)'}.`);
    error.status = 500;
    error.code = 'TICKETS_UNITED_CONFIGURATION_ERROR';
    throw error;
  }

  return `(
    SELECT CASE
      WHEN COUNT(*) > 0
        AND SUM(CASE WHEN p_ticket_project.zona_id IS NULL THEN 1 ELSE 0 END) = 0
        AND COUNT(DISTINCT p_ticket_project.zona_id) = 1
      THEN MAX(p_ticket_project.zona_id)
      ELSE NULL
    END
    FROM portafolio p_ticket_project
    WHERE p_ticket_project.estado_registro = 1
      AND (
        (
          NULLIF(TRIM(COALESCE(${a}.proyecto, '')), '') IS NOT NULL
          AND LOWER(TRIM(COALESCE(p_ticket_project.proyecto, ''))) = LOWER(TRIM(COALESCE(${a}.proyecto, '')))
        )
        OR
        (
          NULLIF(TRIM(COALESCE(${a}.proyecto_padre, '')), '') IS NOT NULL
          AND LOWER(TRIM(COALESCE(p_ticket_project.proyecto, ''))) = LOWER(TRIM(COALESCE(${a}.proyecto_padre, '')))
        )
      )
  )`;
}

async function getTickets_uni(req, res) {
  const scope = buildTicketScopeSql_gnral(req, 't');
  const projectZoneIdSql = buildProjectZoneIdSql_uni('t');

  try {
    const [rows] = await db.query(`
      SELECT
        scoped_ticket.*,
        z_ticket_official.zona AS zona_oficial
      FROM (
        SELECT
          t.*,
          CASE
            WHEN NULLIF(TRIM(COALESCE(t.codigo_equipo, '')), '') IS NOT NULL
              THEN p_ticket_code.zona_id
            ELSE ${projectZoneIdSql}
          END AS zona_id_oficial
        FROM tickets t
        LEFT JOIN portafolio p_ticket_code
          ON p_ticket_code.estado_registro = 1
         AND NULLIF(TRIM(COALESCE(t.codigo_equipo, '')), '') IS NOT NULL
         AND TRIM(COALESCE(p_ticket_code.numero_equipo, '')) = TRIM(COALESCE(t.codigo_equipo, ''))
        WHERE ${scope.sql}
        ORDER BY t.id DESC
        LIMIT 50000
      ) scoped_ticket
      LEFT JOIN z_op z_ticket_official
        ON z_ticket_official.id_zona = scoped_ticket.zona_id_oficial
       AND z_ticket_official.estado = 1
      ORDER BY scoped_ticket.id DESC
    `, scope.params);

    const data = (Array.isArray(rows) ? rows : []).map(normalizeOfficialTicketRow_uni);

    return res.json({
      ok: true,
      source: 'tickets',
      data,
      alcance: {
        zona_ids: zoneIds_gnral(req),
        zonas: zoneCodes_gnral(req)
      },
      total: data.length
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error consultando tickets.',
      error: error.message
    });
  }
}

async function getTicketDetalle_uni(req, res) {
  const ticket = String(req.params?.ticket || '').trim();
  if (!ticket) {
    return res.status(400).json({ ok: false, message: 'Ticket requerido.' });
  }

  const scope = buildTicketScopeSql_gnral(req, 't');
  const projectZoneIdSql = buildProjectZoneIdSql_uni('t');

  try {
    const [rows] = await db.query(`
      SELECT
        scoped_ticket.*,
        z_ticket_official.zona AS zona_oficial
      FROM (
        SELECT
          t.*,
          CASE
            WHEN NULLIF(TRIM(COALESCE(t.codigo_equipo, '')), '') IS NOT NULL
              THEN p_ticket_code.zona_id
            ELSE ${projectZoneIdSql}
          END AS zona_id_oficial
        FROM tickets t
        LEFT JOIN portafolio p_ticket_code
          ON p_ticket_code.estado_registro = 1
         AND NULLIF(TRIM(COALESCE(t.codigo_equipo, '')), '') IS NOT NULL
         AND TRIM(COALESCE(p_ticket_code.numero_equipo, '')) = TRIM(COALESCE(t.codigo_equipo, ''))
        WHERE (
          TRIM(COALESCE(t.ticket, '')) = ?
          OR CAST(t.id AS CHAR) = ?
          OR TRIM(COALESCE(t.folio, '')) = ?
          OR TRIM(COALESCE(t.id_interno, '')) = ?
        )
          AND ${scope.sql}
        ORDER BY t.id DESC
        LIMIT 1
      ) scoped_ticket
      LEFT JOIN z_op z_ticket_official
        ON z_ticket_official.id_zona = scoped_ticket.zona_id_oficial
       AND z_ticket_official.estado = 1
      LIMIT 1
    `, [ticket, ticket, ticket, ticket, ...scope.params]);

    if (!rows.length) {
      return res.status(404).json({ ok: false, message: 'Ticket no encontrado.' });
    }

    const data = normalizeOfficialTicketRow_uni(rows[0]);

    return res.json({
      ok: true,
      source: 'tickets',
      data,
      alcance: {
        zona_ids: zoneIds_gnral(req),
        zonas: zoneCodes_gnral(req)
      }
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error consultando detalle de ticket.',
      error: error.message
    });
  }
}

module.exports = {
  getTickets_uni,
  getTicketDetalle_uni
};

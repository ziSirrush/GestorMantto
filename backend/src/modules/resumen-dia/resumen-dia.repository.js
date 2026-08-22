'use strict';

const db = require('../../config/db');
const {
  buildPortafolioScopeSql_gnral,
  buildTicketScopeSql_gnral
} = require('../../services/information-record-scope-gnral.service');

function officialProjectZoneSql(ticketAlias) {
  const a = String(ticketAlias || 't');
  return `(
    SELECT MAX(z_scope_rd.zona)
    FROM portafolio p_scope_rd
    INNER JOIN z_op z_scope_rd
      ON z_scope_rd.id_zona = p_scope_rd.zona_id
     AND z_scope_rd.estado = 1
    WHERE p_scope_rd.estado_registro = 1
      AND (
        (NULLIF(TRIM(COALESCE(${a}.proyecto, '')), '') IS NOT NULL
          AND LOWER(TRIM(COALESCE(p_scope_rd.proyecto, ''))) = LOWER(TRIM(COALESCE(${a}.proyecto, ''))))
        OR
        (NULLIF(TRIM(COALESCE(${a}.proyecto_padre, '')), '') IS NOT NULL
          AND LOWER(TRIM(COALESCE(p_scope_rd.proyecto, ''))) = LOWER(TRIM(COALESCE(${a}.proyecto_padre, ''))))
      )
  )`;
}

function officialProjectZoneIdSql(ticketAlias) {
  const a = String(ticketAlias || 't');
  return `(
    SELECT MAX(p_scope_rd_id.zona_id)
    FROM portafolio p_scope_rd_id
    WHERE p_scope_rd_id.estado_registro = 1
      AND (
        (NULLIF(TRIM(COALESCE(${a}.proyecto, '')), '') IS NOT NULL
          AND LOWER(TRIM(COALESCE(p_scope_rd_id.proyecto, ''))) = LOWER(TRIM(COALESCE(${a}.proyecto, ''))))
        OR
        (NULLIF(TRIM(COALESCE(${a}.proyecto_padre, '')), '') IS NOT NULL
          AND LOWER(TRIM(COALESCE(p_scope_rd_id.proyecto, ''))) = LOWER(TRIM(COALESCE(${a}.proyecto_padre, ''))))
      )
  )`;
}

async function getInitialData(req) {
  const portafolioScope = buildPortafolioScopeSql_gnral(req, 'p');
  const ticketScope = buildTicketScopeSql_gnral(req, 't');

  const [portafolioResult, ticketsResult] = await Promise.all([
    db.query(`
      SELECT
        p.*,
        z_rd.zona AS zona_oficial,
        z_rd.nombre AS zona_nombre_oficial
      FROM portafolio p
      INNER JOIN z_op z_rd
        ON z_rd.id_zona = p.zona_id
       AND z_rd.estado = 1
      WHERE ${portafolioScope.sql}
      LIMIT 50000
    `, portafolioScope.params || []),

    db.query(`
      SELECT
        t.*,
        CASE
          WHEN NULLIF(TRIM(COALESCE(t.codigo_equipo, '')), '') IS NOT NULL
            THEN z_equipo_rd.zona
          ELSE ${officialProjectZoneSql('t')}
        END AS zona_oficial,
        CASE
          WHEN NULLIF(TRIM(COALESCE(t.codigo_equipo, '')), '') IS NOT NULL
            THEN p_equipo_rd.zona_id
          ELSE ${officialProjectZoneIdSql('t')}
        END AS zona_id_oficial
      FROM tickets t
      LEFT JOIN portafolio p_equipo_rd
        ON p_equipo_rd.estado_registro = 1
       AND TRIM(COALESCE(p_equipo_rd.numero_equipo, '')) = TRIM(COALESCE(t.codigo_equipo, ''))
      LEFT JOIN z_op z_equipo_rd
        ON z_equipo_rd.id_zona = p_equipo_rd.zona_id
       AND z_equipo_rd.estado = 1
      WHERE ${ticketScope.sql}
      ORDER BY t.id DESC
      LIMIT 50000
    `, ticketScope.params || [])
  ]);

  const portafolioRows = Array.isArray(portafolioResult?.[0]) ? portafolioResult[0] : [];
  const ticketRows = Array.isArray(ticketsResult?.[0]) ? ticketsResult[0] : [];

  // No solo se filtra el universo: tambien se canoniza la zona que viaja al
  // frontend. Los campos historicos zona_operativa/tickets.zona no deben
  // reintroducir etiquetas de otros cuartos dentro de una respuesta autorizada.
  const portafolio = portafolioRows.map((row) => ({
    ...row,
    zona: row.zona_oficial || null,
    zona_operativa: row.zona_oficial || null
  }));
  const tickets = ticketRows.map((row) => ({
    ...row,
    zona: row.zona_oficial || null
  }));

  return { portafolio, tickets };
}

module.exports = {
  getInitialData,
  officialProjectZoneSql,
  officialProjectZoneIdSql
};

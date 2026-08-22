'use strict';

const db = require('../../config/db');
const {
  buildPortafolioScopeSql_gnral,
  buildPortafolioScopeSqlInline_gnral,
  buildTicketScopeSql_gnral
} = require('../../services/information-record-scope-gnral.service');

function officialEquipmentZoneSql(ticketAlias, valueSql) {
  const a = String(ticketAlias || 't');
  const scope = buildPortafolioScopeSqlInline_gnral(valueSql, 'p_scope_cc_eq');
  return `(
    SELECT MAX(z_scope_cc_eq.zona)
    FROM portafolio p_scope_cc_eq
    INNER JOIN z_op z_scope_cc_eq
      ON z_scope_cc_eq.id_zona = p_scope_cc_eq.zona_id
     AND z_scope_cc_eq.estado = 1
    WHERE p_scope_cc_eq.estado_registro = 1
      AND ${scope.sql}
      AND TRIM(COALESCE(p_scope_cc_eq.numero_equipo, '')) = TRIM(COALESCE(${a}.codigo_equipo, ''))
  )`;
}

function officialEquipmentZoneIdSql(ticketAlias, valueSql) {
  const a = String(ticketAlias || 't');
  const scope = buildPortafolioScopeSqlInline_gnral(valueSql, 'p_scope_cc_eq_id');
  return `(
    SELECT MAX(p_scope_cc_eq_id.zona_id)
    FROM portafolio p_scope_cc_eq_id
    WHERE p_scope_cc_eq_id.estado_registro = 1
      AND ${scope.sql}
      AND TRIM(COALESCE(p_scope_cc_eq_id.numero_equipo, '')) = TRIM(COALESCE(${a}.codigo_equipo, ''))
  )`;
}

function officialProjectZoneSql(ticketAlias, valueSql) {
  const a = String(ticketAlias || 't');
  const scope = buildPortafolioScopeSqlInline_gnral(valueSql, 'p_scope_cc_project');
  return `(
    SELECT MAX(z_scope_cc_project.zona)
    FROM portafolio p_scope_cc_project
    INNER JOIN z_op z_scope_cc_project
      ON z_scope_cc_project.id_zona = p_scope_cc_project.zona_id
     AND z_scope_cc_project.estado = 1
    WHERE p_scope_cc_project.estado_registro = 1
      AND ${scope.sql}
      AND (
        (NULLIF(TRIM(COALESCE(${a}.proyecto, '')), '') IS NOT NULL
          AND LOWER(TRIM(COALESCE(p_scope_cc_project.proyecto, ''))) = LOWER(TRIM(COALESCE(${a}.proyecto, ''))))
        OR
        (NULLIF(TRIM(COALESCE(${a}.proyecto_padre, '')), '') IS NOT NULL
          AND LOWER(TRIM(COALESCE(p_scope_cc_project.proyecto, ''))) = LOWER(TRIM(COALESCE(${a}.proyecto_padre, ''))))
      )
  )`;
}

function officialProjectZoneIdSql(ticketAlias, valueSql) {
  const a = String(ticketAlias || 't');
  const scope = buildPortafolioScopeSqlInline_gnral(valueSql, 'p_scope_cc_project_id');
  return `(
    SELECT MAX(p_scope_cc_project_id.zona_id)
    FROM portafolio p_scope_cc_project_id
    WHERE p_scope_cc_project_id.estado_registro = 1
      AND ${scope.sql}
      AND (
        (NULLIF(TRIM(COALESCE(${a}.proyecto, '')), '') IS NOT NULL
          AND LOWER(TRIM(COALESCE(p_scope_cc_project_id.proyecto, ''))) = LOWER(TRIM(COALESCE(${a}.proyecto, ''))))
        OR
        (NULLIF(TRIM(COALESCE(${a}.proyecto_padre, '')), '') IS NOT NULL
          AND LOWER(TRIM(COALESCE(p_scope_cc_project_id.proyecto, ''))) = LOWER(TRIM(COALESCE(${a}.proyecto_padre, ''))))
      )
  )`;
}

async function getInitialData(req) {
  const portafolioScope = buildPortafolioScopeSql_gnral(req, 'p');
  const ticketScope = buildTicketScopeSql_gnral(req, 't');

  const equipmentZone = officialEquipmentZoneSql('t', req);
  const equipmentZoneId = officialEquipmentZoneIdSql('t', req);
  const projectZone = officialProjectZoneSql('t', req);
  const projectZoneId = officialProjectZoneIdSql('t', req);

  const [portafolioResult, ticketsResult] = await Promise.all([
    db.query(`
      SELECT
        p.*,
        z_cc.zona AS zona_oficial,
        z_cc.nombre AS zona_nombre_oficial
      FROM portafolio p
      INNER JOIN z_op z_cc
        ON z_cc.id_zona = p.zona_id
       AND z_cc.estado = 1
      WHERE p.estado_registro = 1
        AND (p.inactivo IS NULL OR UPPER(TRIM(CAST(p.inactivo AS CHAR))) NOT IN ('SI','\u0053\u00CD','1','TRUE','INACTIVO'))
        AND ${portafolioScope.sql}
      LIMIT 50000
    `, portafolioScope.params || []),

    db.query(`
      SELECT
        t.*,
        CASE
          WHEN NULLIF(TRIM(COALESCE(t.codigo_equipo, '')), '') IS NOT NULL
            THEN ${equipmentZone}
          ELSE ${projectZone}
        END AS zona_oficial,
        CASE
          WHEN NULLIF(TRIM(COALESCE(t.codigo_equipo, '')), '') IS NOT NULL
            THEN ${equipmentZoneId}
          ELSE ${projectZoneId}
        END AS zona_id_oficial
      FROM tickets t
      WHERE ${ticketScope.sql}
      ORDER BY t.id DESC
      LIMIT 50000
    `, ticketScope.params || [])
  ]);

  const portafolioRows = Array.isArray(portafolioResult?.[0]) ? portafolioResult[0] : [];
  const ticketRows = Array.isArray(ticketsResult?.[0]) ? ticketsResult[0] : [];

  return {
    portafolio: portafolioRows.map((row) => ({
      ...row,
      zona: row.zona_oficial || null,
      zona_operativa: row.zona_oficial || null
    })),
    tickets: ticketRows.map((row) => ({
      ...row,
      zona: row.zona_oficial || null
    }))
  };
}

module.exports = {
  getInitialData,
  officialEquipmentZoneSql,
  officialEquipmentZoneIdSql,
  officialProjectZoneSql,
  officialProjectZoneIdSql
};

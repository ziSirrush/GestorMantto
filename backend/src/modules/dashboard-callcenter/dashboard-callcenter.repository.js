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


function ymdParam(value) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function initialPeriodFilter(req, alias = 't') {
  const from = ymdParam(req?.query?.from || req?.query?.desde);
  const to = ymdParam(req?.query?.to || req?.query?.hasta);
  const clauses = [];
  const params = [];
  if (from) {
    clauses.push(`${alias}.fecha_reporte >= ?`);
    params.push(`${from} 00:00:00`);
  }
  if (to) {
    clauses.push(`${alias}.fecha_reporte < DATE_ADD(?, INTERVAL 1 DAY)`);
    params.push(`${to} 00:00:00`);
  }
  return {
    sql: clauses.length ? ` AND ${clauses.join(' AND ')}` : '',
    params,
    from,
    to
  };
}

async function getInitialData(req) {
  const portafolioScope = buildPortafolioScopeSql_gnral(req, 'p');
  const ticketScope = buildTicketScopeSql_gnral(req, 't');
  const period = initialPeriodFilter(req, 't');

  const equipmentZone = officialEquipmentZoneSql('t', req);
  const equipmentZoneId = officialEquipmentZoneIdSql('t', req);
  const projectZone = officialProjectZoneSql('t', req);
  const projectZoneId = officialProjectZoneIdSql('t', req);

  const [portafolioResult, ticketsResult] = await Promise.all([
    db.query(`
      SELECT
        p.id_portafolio,
        p.proyecto,
        p.ciudad,
        p.estado,
        p.numero_equipo,
        p.identificacion_sitio,
        p.inactivo,
        p.estatus_servicio,
        p.zona_id,
        p.supervisor_zona,
        p.superintendente,
        z_cc.zona AS zona_oficial,
        z_cc.nombre AS zona_nombre_oficial
      FROM portafolio p
      INNER JOIN z_op z_cc
        ON z_cc.id_zona = p.zona_id
       AND z_cc.estado = 1
      WHERE p.estado_registro = 1
        AND (p.inactivo IS NULL OR UPPER(TRIM(CAST(p.inactivo AS CHAR))) NOT IN ('SI','SÍ','1','TRUE','INACTIVO'))
        AND ${portafolioScope.sql}
    `, portafolioScope.params || []),

    db.query(`
      SELECT
        t.id,
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
        t.descripcion,
        t.fecha_reporte,
        t.h_reporte,
        t.estatus_equipo_ir,
        t.fecha_llegada,
        t.h_llegada,
        t.persona_que_atiende,
        t.fecha_cierre,
        t.h_solucion,
        t.tecnico,
        t.supervisor,
        t.estatus_equipo_final,
        t.causa,
        t.accion_en_cierre,
        t.responsabilidad,
        t.causa_falla,
        t.tiempo_llegada,
        t.tiempo_solucion,
        t.tiempo_llegada_ii,
        t.tiempo_solucion_ii,
        t.tipo_equipo,
        t.prioridad,
        t.ejecutivo_call,
        t.blt_empleado,
        t.ticket_excede,
        t.zona_administrativa,
        t.zona_de_falla,
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
        ${period.sql}
      ORDER BY t.id DESC
      LIMIT 50000
    `, [...(ticketScope.params || []), ...period.params])
  ]);

  const portafolioRows = Array.isArray(portafolioResult?.[0]) ? portafolioResult[0] : [];
  const ticketRows = Array.isArray(ticketsResult?.[0]) ? ticketsResult[0] : [];

  return {
    period: { from: period.from, to: period.to },
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

'use strict';

const db = require('../../config/db');
const { sqlMexicoCityToday } = require('../../utils/temporal');
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

function positiveInt(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function getCriticidadCriteria(req) {
  const userFallas = Number(req && req.user && req.user.criticos_fallas) || 3;
  const userPeriodo = Number(req && req.user && req.user.criticos_periodo) || 35;
  return {
    dias: positiveInt(req && req.query && (req.query.dias || req.query.criticos_periodo), userPeriodo, 1, 3650),
    minFallas: positiveInt(req && req.query && (req.query.min_fallas || req.query.criticos_fallas), userFallas, 1, 9999)
  };
}


function pagination(req) {
  const page = positiveInt(req?.query?.page, 1, 1, 100000);
  const pageSize = positiveInt(req?.query?.page_size || req?.query?.pageSize, 100, 5, 100);
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function likeParam(value) {
  const text = String(value || '').trim();
  return text ? '%' + text + '%' : null;
}

function getCallCenterU365TicketAggregate(diasCriticos) {
  const today = sqlMexicoCityToday();
  return {
    sql: [
      'SELECT',
      't.codigo_equipo,',
      'SUM(CASE WHEN t.fecha_reporte >= DATE_SUB(' + today + ', INTERVAL 364 DAY) AND t.fecha_reporte < DATE_ADD(' + today + ', INTERVAL 1 DAY) THEN 1 ELSE 0 END) AS llamadas_365,',
      "SUM(CASE WHEN t.fecha_reporte >= DATE_SUB(" + today + ", INTERVAL 364 DAY) AND t.fecha_reporte < DATE_ADD(" + today + ", INTERVAL 1 DAY) AND UPPER(COALESCE(t.responsabilidad,'')) LIKE '%CLIENTE%' THEN 1 ELSE 0 END) AS resp_cliente_365,",
      "SUM(CASE WHEN t.fecha_reporte >= DATE_SUB(" + today + ", INTERVAL 364 DAY) AND t.fecha_reporte < DATE_ADD(" + today + ", INTERVAL 1 DAY) AND UPPER(COALESCE(t.responsabilidad,'')) LIKE '%BLT%' THEN 1 ELSE 0 END) AS fallas_blt_365,",
      "SUM(CASE WHEN t.fecha_reporte >= DATE_SUB(" + today + ", INTERVAL 364 DAY) AND t.fecha_reporte < DATE_ADD(" + today + ", INTERVAL 1 DAY) AND TRIM(COALESCE(t.responsabilidad,'')) = '' THEN 1 ELSE 0 END) AS sin_responsabilidad_365,",
      "SUM(CASE WHEN t.fecha_reporte >= MAKEDATE(YEAR(" + today + "),1) AND t.fecha_reporte < DATE_ADD(" + today + ", INTERVAL 1 DAY) AND UPPER(COALESCE(t.responsabilidad,'')) LIKE '%BLT%' THEN 1 ELSE 0 END) AS fallas_blt_anio,",
      "SUM(CASE WHEN t.fecha_reporte >= DATE_SUB(" + today + ", INTERVAL ? DAY) AND t.fecha_reporte < DATE_ADD(" + today + ", INTERVAL 1 DAY) AND UPPER(COALESCE(t.responsabilidad,'')) LIKE '%BLT%' THEN 1 ELSE 0 END) AS fallas_blt_periodo_critico,",
      'MAX(CASE WHEN t.fecha_reporte >= DATE_SUB(' + today + ', INTERVAL 364 DAY) AND t.fecha_reporte < DATE_ADD(' + today + ', INTERVAL 1 DAY) THEN t.fecha_reporte ELSE NULL END) AS ultima_llamada_365,',
      "MAX(CASE WHEN t.fecha_reporte >= DATE_SUB(" + today + ", INTERVAL 364 DAY) AND t.fecha_reporte < DATE_ADD(" + today + ", INTERVAL 1 DAY) AND UPPER(COALESCE(t.responsabilidad,'')) LIKE '%BLT%' THEN t.fecha_reporte ELSE NULL END) AS ultima_falla_blt_365",
      'FROM tickets t',
      "WHERE t.codigo_equipo IS NOT NULL AND TRIM(t.codigo_equipo) <> ''",
      'AND t.fecha_reporte IS NOT NULL',
      'AND t.fecha_reporte >= LEAST(DATE_SUB(' + today + ', INTERVAL 364 DAY), MAKEDATE(YEAR(' + today + '),1), DATE_SUB(' + today + ', INTERVAL ? DAY))',
      'AND t.fecha_reporte < DATE_ADD(' + today + ', INTERVAL 1 DAY)',
      'GROUP BY t.codigo_equipo'
    ].join(' '),
    params: [diasCriticos, diasCriticos]
  };
}

function getCallCenterActivePortfolio(req) {
  const scope = buildPortafolioScopeSql_gnral(req, 'p');
  return {
    sql: [
      'SELECT',
      'p.numero_equipo,',
      'MAX(p.proyecto) AS proyecto,',
      'MAX(z_cc_u365.zona) AS zona,',
      'MAX(p.identificacion_sitio) AS referencia_en_sitio,',
      'MAX(p.supervisor_zona) AS supervisor,',
      'MAX(p.superintendente) AS superintendente',
      'FROM portafolio p',
      'INNER JOIN z_op z_cc_u365 ON z_cc_u365.id_zona = p.zona_id AND z_cc_u365.estado = 1',
      'WHERE p.estado_registro = 1',
      "AND (p.inactivo IS NULL OR UPPER(TRIM(CAST(p.inactivo AS CHAR))) NOT IN ('SI','SÍ','1','TRUE','INACTIVO'))",
      "AND UPPER(TRIM(COALESCE(p.estatus_servicio,''))) NOT LIKE '%NO EN SERVICIO%'",
      'AND (' + scope.sql + ')',
      "AND p.numero_equipo IS NOT NULL AND TRIM(p.numero_equipo) <> ''",
      "AND p.proyecto IS NOT NULL AND TRIM(p.proyecto) <> ''",
      'GROUP BY p.numero_equipo'
    ].join(' '),
    params: scope.params || []
  };
}

async function getCallCenterU365Equipos(req) {
  const { page, pageSize, offset } = pagination(req);
  const criteria = getCriticidadCriteria(req);
  const zona = likeParam(req?.query?.zona);
  const proyecto = likeParam(req?.query?.proyecto);
  const search = likeParam(req?.query?.search || req?.query?.buscar);
  const clauses = [];
  const filterParams = [];

  if (zona) {
    clauses.push('ap.zona LIKE ?');
    filterParams.push(zona);
  }
  if (proyecto) {
    clauses.push('ap.proyecto LIKE ?');
    filterParams.push(proyecto);
  }
  if (search) {
    clauses.push('(ap.proyecto LIKE ? OR ap.numero_equipo LIKE ? OR ap.referencia_en_sitio LIKE ? OR ap.zona LIKE ?)');
    filterParams.push(search, search, search, search);
  }

  const filterSql = clauses.length ? ' AND ' + clauses.join(' AND ') : '';
  const activePortfolio = getCallCenterActivePortfolio(req);
  const ticketAggregate = getCallCenterU365TicketAggregate(criteria.dias);
  const today = sqlMexicoCityToday();
  const baseSql = [
    'SELECT',
    'ap.numero_equipo,',
    'ap.numero_equipo AS codigo_equipo,',
    'ap.proyecto,',
    'ap.zona,',
    'ap.referencia_en_sitio,',
    'ap.supervisor,',
    'ap.superintendente,',
    'COALESCE(ta.llamadas_365,0) AS llamadas_365,',
    'COALESCE(ta.resp_cliente_365,0) AS resp_cliente_365,',
    'COALESCE(ta.fallas_blt_365,0) AS fallas_blt_365,',
    'COALESCE(ta.sin_responsabilidad_365,0) AS sin_responsabilidad_365,',
    'COALESCE(ta.fallas_blt_anio,0) AS fallas_blt_anio,',
    'CASE WHEN COALESCE(ta.fallas_blt_anio,0)=0 THEN NULL ELSE ROUND((DATEDIFF(' + today + ', MAKEDATE(YEAR(' + today + '),1))+1)/NULLIF(ta.fallas_blt_anio,0),3) END AS mtbc_anio,',
    'CASE WHEN COALESCE(ta.fallas_blt_365,0)=0 THEN NULL ELSE ROUND(365/NULLIF(ta.fallas_blt_365,0),3) END AS mtbc_365,',
    'CASE WHEN COALESCE(ta.fallas_blt_periodo_critico,0) >= ? THEN 1 ELSE 0 END AS es_critico,',
    'ta.ultima_llamada_365,',
    'ta.ultima_falla_blt_365',
    'FROM (' + activePortfolio.sql + ') ap',
    'INNER JOIN (' + ticketAggregate.sql + ') ta ON ta.codigo_equipo = ap.numero_equipo',
    'WHERE COALESCE(ta.llamadas_365,0) > 0',
    filterSql
  ].join(' ');

  const baseParams = [criteria.minFallas, ...(activePortfolio.params || []), ...ticketAggregate.params, ...filterParams];
  const [countRows] = await db.query('SELECT COUNT(*) AS total FROM (' + baseSql + ') q', baseParams);
  const [rows] = await db.query(
    'SELECT * FROM (' + baseSql + ') q ORDER BY q.llamadas_365 DESC, q.fallas_blt_365 DESC, q.ultima_llamada_365 DESC, q.numero_equipo ASC LIMIT ? OFFSET ?',
    [...baseParams, pageSize, offset]
  );

  return {
    criteria,
    pagination: { page, page_size: pageSize, total: Number(countRows?.[0]?.total || 0) },
    rows: Array.isArray(rows) ? rows : []
  };
}

async function getCallCenterU365Proyectos(req) {
  const { page, pageSize, offset } = pagination(req);
  const criteria = getCriticidadCriteria(req);
  const zona = likeParam(req?.query?.zona);
  const proyecto = likeParam(req?.query?.proyecto || req?.query?.search || req?.query?.buscar);
  const clauses = [];
  const filterParams = [];

  if (zona) {
    clauses.push('ap.zona LIKE ?');
    filterParams.push(zona);
  }
  if (proyecto) {
    clauses.push('ap.proyecto LIKE ?');
    filterParams.push(proyecto);
  }

  const filterSql = clauses.length ? ' AND ' + clauses.join(' AND ') : '';
  const activePortfolio = getCallCenterActivePortfolio(req);
  const ticketAggregate = getCallCenterU365TicketAggregate(criteria.dias);
  const today = sqlMexicoCityToday();
  const baseSql = [
    'SELECT',
    'ap.proyecto,',
    'MAX(ap.zona) AS zona,',
    'COUNT(*) AS equipos_activos,',
    'SUM(CASE WHEN COALESCE(ta.llamadas_365,0) > 0 THEN 1 ELSE 0 END) AS equipos_con_llamadas_365,',
    'SUM(COALESCE(ta.llamadas_365,0)) AS llamadas_365,',
    'SUM(COALESCE(ta.resp_cliente_365,0)) AS resp_cliente_365,',
    'SUM(COALESCE(ta.fallas_blt_365,0)) AS fallas_blt_365,',
    'SUM(COALESCE(ta.sin_responsabilidad_365,0)) AS sin_responsabilidad_365,',
    'SUM(COALESCE(ta.fallas_blt_anio,0)) AS fallas_blt_anio,',
    'ROUND(SUM(COALESCE(ta.llamadas_365,0))/NULLIF(COUNT(*),0),3) AS promedio_llamadas_por_equipo,',
    'CASE WHEN SUM(COALESCE(ta.fallas_blt_anio,0))=0 THEN NULL ELSE ROUND(((DATEDIFF(' + today + ', MAKEDATE(YEAR(' + today + '),1))+1)*COUNT(*))/NULLIF(SUM(COALESCE(ta.fallas_blt_anio,0)),0),3) END AS mtbc_anio,',
    'CASE WHEN SUM(COALESCE(ta.fallas_blt_365,0))=0 THEN NULL ELSE ROUND((365*COUNT(*))/NULLIF(SUM(COALESCE(ta.fallas_blt_365,0)),0),3) END AS mtbc_365,',
    'SUM(CASE WHEN COALESCE(ta.fallas_blt_periodo_critico,0) >= ? THEN 1 ELSE 0 END) AS equipos_criticos,',
    'MAX(ta.ultima_llamada_365) AS ultima_llamada_365,',
    'MAX(ta.ultima_falla_blt_365) AS ultima_falla_blt_365',
    'FROM (' + activePortfolio.sql + ') ap',
    'LEFT JOIN (' + ticketAggregate.sql + ') ta ON ta.codigo_equipo = ap.numero_equipo',
    'WHERE 1=1',
    filterSql,
    'GROUP BY ap.proyecto',
    'HAVING SUM(COALESCE(ta.llamadas_365,0)) > 0'
  ].join(' ');

  const baseParams = [criteria.minFallas, ...(activePortfolio.params || []), ...ticketAggregate.params, ...filterParams];
  const [countRows] = await db.query('SELECT COUNT(*) AS total FROM (' + baseSql + ') q', baseParams);
  const [rows] = await db.query(
    'SELECT * FROM (' + baseSql + ') q ORDER BY q.llamadas_365 DESC, q.fallas_blt_365 DESC, q.ultima_llamada_365 DESC, q.proyecto ASC LIMIT ? OFFSET ?',
    [...baseParams, pageSize, offset]
  );

  return {
    criteria,
    pagination: { page, page_size: pageSize, total: Number(countRows?.[0]?.total || 0) },
    rows: Array.isArray(rows) ? rows : []
  };
}

async function getSnapshotAnalytics(req, portafolioScope) {
  const criteria = getCriticidadCriteria(req);
  const scope = portafolioScope || buildPortafolioScopeSql_gnral(req, 'p');
  const today = sqlMexicoCityToday();
  const sql = [
    'SELECT',
    'p.numero_equipo AS codigo_equipo,',
    'MAX(p.proyecto) AS proyecto,',
    'MAX(z_cc.zona) AS zona,',
    'MAX(p.zona_id) AS zona_id_oficial,',
    "SUM(CASE WHEN t.fecha_reporte >= MAKEDATE(YEAR(" + today + "),1) AND t.fecha_reporte < DATE_ADD(" + today + ", INTERVAL 1 DAY) AND UPPER(COALESCE(t.responsabilidad,'')) LIKE '%BLT%' THEN 1 ELSE 0 END) AS fallas_blt_anio,",
    "SUM(CASE WHEN t.fecha_reporte >= DATE_SUB(" + today + ", INTERVAL 364 DAY) AND t.fecha_reporte < DATE_ADD(" + today + ", INTERVAL 1 DAY) AND UPPER(COALESCE(t.responsabilidad,'')) LIKE '%BLT%' THEN 1 ELSE 0 END) AS fallas_blt_365,",
    "SUM(CASE WHEN t.fecha_reporte >= DATE_SUB(" + today + ", INTERVAL ? DAY) AND t.fecha_reporte < DATE_ADD(" + today + ", INTERVAL 1 DAY) AND UPPER(COALESCE(t.responsabilidad,'')) LIKE '%BLT%' THEN 1 ELSE 0 END) AS fallas_blt_periodo_critico,",
    "MAX(CASE WHEN UPPER(COALESCE(t.responsabilidad,'')) LIKE '%BLT%' THEN t.fecha_reporte ELSE NULL END) AS ultimo_blt",
    'FROM portafolio p',
    'INNER JOIN z_op z_cc ON z_cc.id_zona = p.zona_id AND z_cc.estado = 1',
    'LEFT JOIN tickets t ON t.codigo_equipo = p.numero_equipo',
    'AND t.fecha_reporte >= LEAST(MAKEDATE(YEAR(' + today + '),1), DATE_SUB(' + today + ', INTERVAL 364 DAY), DATE_SUB(' + today + ', INTERVAL ? DAY))',
    'AND t.fecha_reporte < DATE_ADD(' + today + ', INTERVAL 1 DAY)',
    'WHERE p.estado_registro = 1',
    "AND (p.inactivo IS NULL OR UPPER(TRIM(CAST(p.inactivo AS CHAR))) NOT IN ('SI','SÍ','1','TRUE','INACTIVO'))",
    "AND UPPER(TRIM(COALESCE(p.estatus_servicio,''))) NOT LIKE '%NO EN SERVICIO%'",
    'AND (' + scope.sql + ')',
    "AND p.numero_equipo IS NOT NULL AND p.numero_equipo <> ''",
    'GROUP BY p.numero_equipo',
    'HAVING fallas_blt_anio > 0 OR fallas_blt_365 > 0 OR fallas_blt_periodo_critico > 0',
    'ORDER BY p.numero_equipo ASC',
    'LIMIT 10001'
  ].join(' ');

  const [rows] = await db.query(sql, [criteria.dias, criteria.dias, ...(scope.params || [])]);
  const data = Array.isArray(rows) ? rows : [];
  if (data.length > 10000) {
    const error = new Error('El snapshot analítico de Call Center supera 10,000 equipos.');
    error.code = 'CALLCENTER_SNAPSHOT_LIMIT';
    error.statusCode = 503;
    throw error;
  }
  return { criteria, rows: data };
}

async function getInitialData(req) {
  const portafolioScope = buildPortafolioScopeSql_gnral(req, 'p');
  const ticketScope = buildTicketScopeSql_gnral(req, 't');
  const period = initialPeriodFilter(req, 't');

  const equipmentZone = officialEquipmentZoneSql('t', req);
  const equipmentZoneId = officialEquipmentZoneIdSql('t', req);
  const projectZone = officialProjectZoneSql('t', req);
  const projectZoneId = officialProjectZoneIdSql('t', req);

  const [portafolioResult, ticketsResult, analytics] = await Promise.all([
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
    `, [...(ticketScope.params || []), ...period.params]),

    getSnapshotAnalytics(req, portafolioScope)
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
    })),
    analytics
  };
}

module.exports = {
  getInitialData,
  officialEquipmentZoneSql,
  officialEquipmentZoneIdSql,
  officialProjectZoneSql,
  officialProjectZoneIdSql,
  getCriticidadCriteria,
  getSnapshotAnalytics,
  getCallCenterU365Equipos,
  getCallCenterU365Proyectos
};

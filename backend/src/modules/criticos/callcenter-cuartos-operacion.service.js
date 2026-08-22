'use strict';

const db = require('./criticos.repository');
const informationRecordScope = require('../../services/information-record-scope-gnral.service');

function positiveInt(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function getUserCriticidadCriteria(req) {
  const userFallas = Number(req.user && req.user.criticos_fallas) || 3;
  const userPeriodo = Number(req.user && req.user.criticos_periodo) || 35;
  return {
    dias: positiveInt(req.query.dias || req.query.periodo || req.query.criticos_periodo, userPeriodo, 1, 3650),
    minFallas: positiveInt(req.query.min_fallas || req.query.minFallas || req.query.fallas || req.query.criticos_fallas, userFallas, 1, 9999)
  };
}

function pagination(req) {
  const page = positiveInt(req.query.page, 1, 1, 100000);
  const pageSize = positiveInt(req.query.page_size || req.query.pageSize, 25, 5, 100);
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function likeParam(value) {
  const s = String(value || '').trim();
  return s ? `%${s}%` : null;
}

function responsabilidadBlt(alias) {
  return `UPPER(COALESCE(${alias}.responsabilidad,'')) LIKE '%BLT%'`;
}

function zoneJoin(portAlias, zoneAlias) {
  return `INNER JOIN z_op ${zoneAlias} ON ${zoneAlias}.id_zona = ${portAlias}.zona_id AND ${zoneAlias}.estado = 1`;
}

function portafolioOperativo(alias, source) {
  const scope = informationRecordScope.buildPortafolioScopeSqlInline_gnral(source, alias);
  return `${alias}.estado_registro = 1
    AND (${alias}.inactivo IS NULL OR UPPER(TRIM(CAST(${alias}.inactivo AS CHAR))) NOT IN ('SI','\u0053\u00CD','1','TRUE'))
    AND UPPER(TRIM(COALESCE(${alias}.estatus_servicio,''))) NOT LIKE '%NO EN SERVICIO%'
    AND ${scope.sql}`;
}

function alcanceMeta(req) {
  return {
    zona_ids: informationRecordScope.zoneIds_gnral(req),
    zonas: informationRecordScope.zoneCodes_gnral(req)
  };
}

function buildEquipmentFilters(req, ticketAlias, portAlias, zoneAlias) {
  const clauses = [];
  const params = [];
  const zona = likeParam(req.query.zona);
  const proyecto = likeParam(req.query.proyecto);
  const supervisor = likeParam(req.query.supervisor);
  const superintendente = likeParam(req.query.superintendente);
  const search = likeParam(req.query.search || req.query.buscar);

  if (zona) { clauses.push(`${zoneAlias}.zona LIKE ?`); params.push(zona); }
  if (proyecto) { clauses.push(`COALESCE(${ticketAlias}.proyecto, ${portAlias}.proyecto) LIKE ?`); params.push(proyecto); }
  if (supervisor) { clauses.push(`COALESCE(${ticketAlias}.supervisor, ${portAlias}.supervisor_zona) LIKE ?`); params.push(supervisor); }
  if (superintendente) { clauses.push(`${portAlias}.superintendente LIKE ?`); params.push(superintendente); }
  if (search) {
    clauses.push(`(
      ${ticketAlias}.codigo_equipo LIKE ?
      OR ${ticketAlias}.ticket LIKE ?
      OR ${ticketAlias}.proyecto LIKE ?
      OR ${ticketAlias}.referencia_en_zona_operativa LIKE ?
      OR ${portAlias}.identificacion_sitio LIKE ?
      OR ${zoneAlias}.zona LIKE ?
    )`);
    params.push(search, search, search, search, search, search);
  }

  return { sql: clauses.length ? ` AND ${clauses.join(' AND ')}` : '', params };
}

async function getMtbcEquipos(req, res) {
  const { page, pageSize, offset } = pagination(req);
  const filters = buildEquipmentFilters(req, 't', 'p', 'z_cc');

  try {
    const [countRows] = await db.query(`
      SELECT COUNT(DISTINCT t.codigo_equipo) AS total
      FROM tickets t
      INNER JOIN portafolio p ON p.numero_equipo = t.codigo_equipo
      ${zoneJoin('p', 'z_cc')}
      WHERE ${portafolioOperativo('p', req)}
        AND t.codigo_equipo IS NOT NULL
        AND t.codigo_equipo <> ''
        AND t.fecha_reporte >= DATE_SUB(CURDATE(), INTERVAL 365 DAY)
        AND t.fecha_reporte < DATE_ADD(CURDATE(), INTERVAL 1 DAY)
        AND ${responsabilidadBlt('t')}
        ${filters.sql}
    `, filters.params);

    const [rows] = await db.query(`
      SELECT
        t.codigo_equipo,
        MAX(COALESCE(t.proyecto, p.proyecto)) AS proyecto,
        MAX(z_cc.zona) AS zona,
        MAX(z_cc.zona) AS zona_oficial,
        MAX(p.zona_id) AS zona_id_oficial,
        MAX(COALESCE(t.referencia_en_zona_operativa, p.identificacion_sitio)) AS referencia_en_sitio,
        MAX(COALESCE(t.supervisor, p.supervisor_zona)) AS supervisor,
        SUM(CASE WHEN t.fecha_reporte >= MAKEDATE(YEAR(CURDATE()),1) AND t.fecha_reporte < DATE_ADD(CURDATE(), INTERVAL 1 DAY) THEN 1 ELSE 0 END) AS fallas_blt_anio,
        COUNT(*) AS fallas_blt_365,
        CASE
          WHEN SUM(CASE WHEN t.fecha_reporte >= MAKEDATE(YEAR(CURDATE()),1) AND t.fecha_reporte < DATE_ADD(CURDATE(), INTERVAL 1 DAY) THEN 1 ELSE 0 END) = 0 THEN NULL
          ELSE ROUND((DATEDIFF(CURDATE(), MAKEDATE(YEAR(CURDATE()),1)) + 1) / NULLIF(SUM(CASE WHEN t.fecha_reporte >= MAKEDATE(YEAR(CURDATE()),1) THEN 1 ELSE 0 END),0),1)
        END AS mtbc_anio,
        CASE WHEN COUNT(*) = 0 THEN NULL ELSE ROUND(365 / NULLIF(COUNT(*),0),1) END AS mtbc_365,
        MAX(t.fecha_reporte) AS ultimo_blt
      FROM tickets t
      INNER JOIN portafolio p ON p.numero_equipo = t.codigo_equipo
      ${zoneJoin('p', 'z_cc')}
      WHERE ${portafolioOperativo('p', req)}
        AND t.codigo_equipo IS NOT NULL
        AND t.codigo_equipo <> ''
        AND t.fecha_reporte >= DATE_SUB(CURDATE(), INTERVAL 365 DAY)
        AND t.fecha_reporte < DATE_ADD(CURDATE(), INTERVAL 1 DAY)
        AND ${responsabilidadBlt('t')}
        ${filters.sql}
      GROUP BY t.codigo_equipo
      ORDER BY fallas_blt_anio DESC, fallas_blt_365 DESC, ultimo_blt DESC, t.codigo_equipo ASC
      LIMIT ? OFFSET ?
    `, [...filters.params, pageSize, offset]);

    return res.json({
      ok: true,
      source: 'aiven',
      rule: {
        responsabilidad: 'BLT',
        mtbc: '(dias transcurridos x cantidad de equipos) / numero de fallas BLT',
        anio_en_curso: '01 de enero hasta hoy',
        ultimos_365_dias: 'ventana movil desde hoy - 365 dias hasta hoy'
      },
      alcance: alcanceMeta(req),
      pagination: { page, page_size: pageSize, total: Number(countRows[0]?.total || 0) },
      data: rows
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Error consultando MTBC por equipo.', error: error.message });
  }
}

async function getMtbcProyectos(req, res) {
  const { page, pageSize, offset } = pagination(req);
  const zona = likeParam(req.query.zona);
  const proyecto = likeParam(req.query.proyecto || req.query.search || req.query.buscar);
  const clauses = [];
  const params = [];

  if (zona) { clauses.push('z_cc.zona LIKE ?'); params.push(zona); }
  if (proyecto) { clauses.push('p.proyecto LIKE ?'); params.push(proyecto); }
  const filterSql = clauses.length ? ` AND ${clauses.join(' AND ')}` : '';

  const baseSql = `
    SELECT
      p.proyecto,
      MAX(z_cc.zona) AS zona,
      COUNT(DISTINCT p.numero_equipo) AS equipos_activos,
      COUNT(DISTINCT CASE WHEN t.fecha_reporte >= DATE_SUB(CURDATE(), INTERVAL 365 DAY) THEN t.codigo_equipo END) AS equipos_con_falla_blt_365,
      COUNT(DISTINCT CASE WHEN t.fecha_reporte >= MAKEDATE(YEAR(CURDATE()),1) THEN t.codigo_equipo END) AS equipos_con_falla_blt_anio,
      SUM(CASE WHEN t.fecha_reporte >= MAKEDATE(YEAR(CURDATE()),1) THEN 1 ELSE 0 END) AS fallas_blt_anio,
      SUM(CASE WHEN t.fecha_reporte >= DATE_SUB(CURDATE(), INTERVAL 365 DAY) THEN 1 ELSE 0 END) AS fallas_blt_365,
      CASE WHEN SUM(CASE WHEN t.fecha_reporte >= MAKEDATE(YEAR(CURDATE()),1) THEN 1 ELSE 0 END) = 0 THEN NULL
        ELSE ROUND(((DATEDIFF(CURDATE(),MAKEDATE(YEAR(CURDATE()),1))+1) * COUNT(DISTINCT p.numero_equipo)) / NULLIF(SUM(CASE WHEN t.fecha_reporte >= MAKEDATE(YEAR(CURDATE()),1) THEN 1 ELSE 0 END),0),1)
      END AS mtbc_anio,
      CASE WHEN SUM(CASE WHEN t.fecha_reporte >= DATE_SUB(CURDATE(), INTERVAL 365 DAY) THEN 1 ELSE 0 END) = 0 THEN NULL
        ELSE ROUND((365 * COUNT(DISTINCT p.numero_equipo)) / NULLIF(SUM(CASE WHEN t.fecha_reporte >= DATE_SUB(CURDATE(), INTERVAL 365 DAY) THEN 1 ELSE 0 END),0),1)
      END AS mtbc_365,
      MAX(t.fecha_reporte) AS ultimo_blt
    FROM portafolio p
    ${zoneJoin('p', 'z_cc')}
    LEFT JOIN tickets t
      ON t.codigo_equipo = p.numero_equipo
     AND t.fecha_reporte >= DATE_SUB(CURDATE(), INTERVAL 365 DAY)
     AND t.fecha_reporte < DATE_ADD(CURDATE(), INTERVAL 1 DAY)
     AND ${responsabilidadBlt('t')}
    WHERE ${portafolioOperativo('p', req)}
      AND p.proyecto IS NOT NULL
      AND p.proyecto <> ''
      AND p.numero_equipo IS NOT NULL
      AND p.numero_equipo <> ''
      ${filterSql}
    GROUP BY p.proyecto
    HAVING fallas_blt_365 > 0
  `;

  try {
    const [countRows] = await db.query(`SELECT COUNT(*) AS total FROM (${baseSql}) q`, params);
    const [rows] = await db.query(`
      SELECT * FROM (${baseSql}) q
      ORDER BY q.fallas_blt_anio DESC, q.fallas_blt_365 DESC, q.ultimo_blt DESC, q.proyecto ASC
      LIMIT ? OFFSET ?
    `, [...params, pageSize, offset]);

    return res.json({
      ok: true,
      source: 'aiven',
      rule: {
        responsabilidad: 'BLT',
        aggregation: 'fallas BLT de equipos activos y en servicio del proyecto',
        mtbc: '(dias transcurridos x cantidad de equipos activos) / numero de fallas BLT',
        anio_en_curso: '01 de enero hasta hoy',
        ultimos_365_dias: 'ventana movil desde hoy - 365 dias hasta hoy'
      },
      alcance: alcanceMeta(req),
      pagination: { page, page_size: pageSize, total: Number(countRows[0]?.total || 0) },
      data: rows
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Error consultando MTBC por proyecto.', error: error.message });
  }
}

function buildCallCenterU365TicketAggregate(diasCriticos, source) {
  const ticketScope = informationRecordScope.buildTicketScopeSqlInline_gnral(source, 't');
  return {
    sql: `
      SELECT
        t.codigo_equipo,
        SUM(CASE WHEN t.fecha_reporte >= DATE_SUB(CURDATE(),INTERVAL 365 DAY) AND t.fecha_reporte < DATE_ADD(CURDATE(),INTERVAL 1 DAY) THEN 1 ELSE 0 END) AS llamadas_365,
        SUM(CASE WHEN t.fecha_reporte >= DATE_SUB(CURDATE(),INTERVAL 365 DAY) AND t.fecha_reporte < DATE_ADD(CURDATE(),INTERVAL 1 DAY) AND UPPER(COALESCE(t.responsabilidad,'')) LIKE '%CLIENTE%' THEN 1 ELSE 0 END) AS resp_cliente_365,
        SUM(CASE WHEN t.fecha_reporte >= DATE_SUB(CURDATE(),INTERVAL 365 DAY) AND t.fecha_reporte < DATE_ADD(CURDATE(),INTERVAL 1 DAY) AND ${responsabilidadBlt('t')} THEN 1 ELSE 0 END) AS fallas_blt_365,
        SUM(CASE WHEN t.fecha_reporte >= DATE_SUB(CURDATE(),INTERVAL 365 DAY) AND t.fecha_reporte < DATE_ADD(CURDATE(),INTERVAL 1 DAY) AND TRIM(COALESCE(t.responsabilidad,'')) = '' THEN 1 ELSE 0 END) AS sin_responsabilidad_365,
        SUM(CASE WHEN t.fecha_reporte >= MAKEDATE(YEAR(CURDATE()),1) AND t.fecha_reporte < DATE_ADD(CURDATE(),INTERVAL 1 DAY) AND ${responsabilidadBlt('t')} THEN 1 ELSE 0 END) AS fallas_blt_anio,
        SUM(CASE WHEN t.fecha_reporte >= DATE_SUB(CURDATE(),INTERVAL ? DAY) AND t.fecha_reporte < DATE_ADD(CURDATE(),INTERVAL 1 DAY) AND ${responsabilidadBlt('t')} THEN 1 ELSE 0 END) AS fallas_blt_periodo_critico,
        MAX(CASE WHEN t.fecha_reporte >= DATE_SUB(CURDATE(),INTERVAL 365 DAY) AND t.fecha_reporte < DATE_ADD(CURDATE(),INTERVAL 1 DAY) THEN t.fecha_reporte ELSE NULL END) AS ultima_llamada_365,
        MAX(CASE WHEN t.fecha_reporte >= DATE_SUB(CURDATE(),INTERVAL 365 DAY) AND t.fecha_reporte < DATE_ADD(CURDATE(),INTERVAL 1 DAY) AND ${responsabilidadBlt('t')} THEN t.fecha_reporte ELSE NULL END) AS ultima_falla_blt_365
      FROM tickets t
      WHERE t.codigo_equipo IS NOT NULL
        AND t.codigo_equipo <> ''
        AND t.fecha_reporte IS NOT NULL
        AND t.fecha_reporte >= LEAST(DATE_SUB(CURDATE(),INTERVAL 365 DAY), MAKEDATE(YEAR(CURDATE()),1), DATE_SUB(CURDATE(),INTERVAL ? DAY))
        AND t.fecha_reporte < DATE_ADD(CURDATE(),INTERVAL 1 DAY)
        AND ${ticketScope.sql}
      GROUP BY t.codigo_equipo
    `,
    params: [diasCriticos, diasCriticos]
  };
}

function callCenterActivePortfolioSql(source) {
  return `
    SELECT
      p.numero_equipo,
      MAX(p.proyecto) AS proyecto,
      MAX(z_cc.zona) AS zona,
      MAX(p.zona_id) AS zona_id_oficial,
      MAX(p.identificacion_sitio) AS referencia_en_sitio,
      MAX(p.supervisor_zona) AS supervisor,
      MAX(p.superintendente) AS superintendente
    FROM portafolio p
    ${zoneJoin('p', 'z_cc')}
    WHERE ${portafolioOperativo('p', source)}
      AND p.numero_equipo IS NOT NULL
      AND p.numero_equipo <> ''
      AND p.proyecto IS NOT NULL
      AND p.proyecto <> ''
    GROUP BY p.numero_equipo
  `;
}

async function getCallCenterU365Equipos(req, res) {
  const { page, pageSize, offset } = pagination(req);
  const { dias, minFallas } = getUserCriticidadCriteria(req);
  const zona = likeParam(req.query.zona);
  const proyecto = likeParam(req.query.proyecto);
  const search = likeParam(req.query.search || req.query.buscar);
  const clauses = [];
  const filterParams = [];

  if (zona) { clauses.push('ap.zona LIKE ?'); filterParams.push(zona); }
  if (proyecto) { clauses.push('ap.proyecto LIKE ?'); filterParams.push(proyecto); }
  if (search) {
    clauses.push('(ap.proyecto LIKE ? OR ap.numero_equipo LIKE ? OR ap.referencia_en_sitio LIKE ? OR ap.zona LIKE ?)');
    filterParams.push(search, search, search, search);
  }
  const filterSql = clauses.length ? ` AND ${clauses.join(' AND ')}` : '';
  const ticketAggregate = buildCallCenterU365TicketAggregate(dias, req);
  const activePortfolio = callCenterActivePortfolioSql(req);
  const baseSql = `
    SELECT
      ap.numero_equipo,
      ap.numero_equipo AS codigo_equipo,
      ap.proyecto,
      ap.zona,
      ap.zona AS zona_oficial,
      ap.zona_id_oficial,
      ap.referencia_en_sitio,
      ap.supervisor,
      ap.superintendente,
      COALESCE(ta.llamadas_365,0) AS llamadas_365,
      COALESCE(ta.resp_cliente_365,0) AS resp_cliente_365,
      COALESCE(ta.fallas_blt_365,0) AS fallas_blt_365,
      COALESCE(ta.sin_responsabilidad_365,0) AS sin_responsabilidad_365,
      COALESCE(ta.fallas_blt_anio,0) AS fallas_blt_anio,
      CASE WHEN COALESCE(ta.fallas_blt_anio,0) = 0 THEN NULL ELSE ROUND((DATEDIFF(CURDATE(),MAKEDATE(YEAR(CURDATE()),1))+1) / NULLIF(ta.fallas_blt_anio,0),1) END AS mtbc_anio,
      CASE WHEN COALESCE(ta.fallas_blt_365,0) = 0 THEN NULL ELSE ROUND(365 / NULLIF(ta.fallas_blt_365,0),1) END AS mtbc_365,
      CASE WHEN COALESCE(ta.fallas_blt_periodo_critico,0) >= ? THEN 1 ELSE 0 END AS es_critico,
      ta.ultima_llamada_365,
      ta.ultima_falla_blt_365
    FROM (${activePortfolio}) ap
    INNER JOIN (${ticketAggregate.sql}) ta ON ta.codigo_equipo = ap.numero_equipo
    WHERE COALESCE(ta.llamadas_365,0) > 0
      ${filterSql}
  `;

  try {
    const baseParams = [minFallas, ...ticketAggregate.params, ...filterParams];
    const [countRows] = await db.query(`SELECT COUNT(*) AS total FROM (${baseSql}) q`, baseParams);
    const [rows] = await db.query(`
      SELECT * FROM (${baseSql}) q
      ORDER BY q.llamadas_365 DESC, q.fallas_blt_365 DESC, q.ultima_llamada_365 DESC, q.numero_equipo ASC
      LIMIT ? OFFSET ?
    `, [...baseParams, pageSize, offset]);

    return res.json({
      ok: true,
      source: 'aiven',
      view: 'Detalle Llamadas U365D - Equipos',
      rule: {
        universo: 'equipos activos y en servicio del portafolio con al menos una llamada en los ultimos 365 dias',
        responsabilidad_mtbc: 'BLT',
        mtbc_equipo: 'dias del periodo / numero de fallas BLT del equipo',
        criticidad: `${minFallas} o mas fallas BLT en ${dias} dias`
      },
      criteria: { dias_criticidad: dias, min_fallas_blt: minFallas },
      alcance: alcanceMeta(req),
      pagination: { page, page_size: pageSize, total: Number(countRows[0]?.total || 0) },
      data: rows
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Error consultando detalle U365D por equipo.', error: error.message });
  }
}

async function getCallCenterU365Proyectos(req, res) {
  const { page, pageSize, offset } = pagination(req);
  const { dias, minFallas } = getUserCriticidadCriteria(req);
  const zona = likeParam(req.query.zona);
  const proyecto = likeParam(req.query.proyecto || req.query.search || req.query.buscar);
  const clauses = [];
  const filterParams = [];

  if (zona) { clauses.push('ap.zona LIKE ?'); filterParams.push(zona); }
  if (proyecto) { clauses.push('ap.proyecto LIKE ?'); filterParams.push(proyecto); }
  const filterSql = clauses.length ? ` AND ${clauses.join(' AND ')}` : '';
  const ticketAggregate = buildCallCenterU365TicketAggregate(dias, req);
  const activePortfolio = callCenterActivePortfolioSql(req);
  const baseSql = `
    SELECT
      ap.proyecto,
      MAX(ap.zona) AS zona,
      COUNT(*) AS equipos_activos,
      SUM(CASE WHEN COALESCE(ta.llamadas_365,0) > 0 THEN 1 ELSE 0 END) AS equipos_con_llamadas_365,
      SUM(COALESCE(ta.llamadas_365,0)) AS llamadas_365,
      SUM(COALESCE(ta.resp_cliente_365,0)) AS resp_cliente_365,
      SUM(COALESCE(ta.fallas_blt_365,0)) AS fallas_blt_365,
      SUM(COALESCE(ta.sin_responsabilidad_365,0)) AS sin_responsabilidad_365,
      SUM(COALESCE(ta.fallas_blt_anio,0)) AS fallas_blt_anio,
      ROUND(SUM(COALESCE(ta.llamadas_365,0)) / NULLIF(COUNT(*),0),1) AS promedio_llamadas_por_equipo,
      CASE WHEN SUM(COALESCE(ta.fallas_blt_anio,0)) = 0 THEN NULL ELSE ROUND(((DATEDIFF(CURDATE(),MAKEDATE(YEAR(CURDATE()),1))+1) * COUNT(*)) / NULLIF(SUM(COALESCE(ta.fallas_blt_anio,0)),0),1) END AS mtbc_anio,
      CASE WHEN SUM(COALESCE(ta.fallas_blt_365,0)) = 0 THEN NULL ELSE ROUND((365 * COUNT(*)) / NULLIF(SUM(COALESCE(ta.fallas_blt_365,0)),0),1) END AS mtbc_365,
      SUM(CASE WHEN COALESCE(ta.fallas_blt_periodo_critico,0) >= ? THEN 1 ELSE 0 END) AS equipos_criticos,
      MAX(ta.ultima_llamada_365) AS ultima_llamada_365,
      MAX(ta.ultima_falla_blt_365) AS ultima_falla_blt_365
    FROM (${activePortfolio}) ap
    LEFT JOIN (${ticketAggregate.sql}) ta ON ta.codigo_equipo = ap.numero_equipo
    WHERE 1 = 1
      ${filterSql}
    GROUP BY ap.proyecto
    HAVING SUM(COALESCE(ta.llamadas_365,0)) > 0
  `;

  try {
    const baseParams = [minFallas, ...ticketAggregate.params, ...filterParams];
    const [countRows] = await db.query(`SELECT COUNT(*) AS total FROM (${baseSql}) q`, baseParams);
    const [rows] = await db.query(`
      SELECT * FROM (${baseSql}) q
      ORDER BY q.llamadas_365 DESC, q.fallas_blt_365 DESC, q.ultima_llamada_365 DESC, q.proyecto ASC
      LIMIT ? OFFSET ?
    `, [...baseParams, pageSize, offset]);

    return res.json({
      ok: true,
      source: 'aiven',
      view: 'Detalle Llamadas U365D - Proyectos',
      rule: {
        universo: 'equipos activos y en servicio del portafolio, agrupados por proyecto',
        llamadas: 'todas las llamadas de los ultimos 365 dias',
        responsabilidad_mtbc: 'BLT',
        mtbc_proyecto: '(dias del periodo x equipos activos) / numero de fallas BLT',
        criticidad: `${minFallas} o mas fallas BLT por equipo en ${dias} dias`
      },
      criteria: { dias_criticidad: dias, min_fallas_blt: minFallas },
      alcance: alcanceMeta(req),
      pagination: { page, page_size: pageSize, total: Number(countRows[0]?.total || 0) },
      data: rows
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Error consultando detalle U365D por proyecto.', error: error.message });
  }
}

module.exports = {
  getMtbcEquipos,
  getMtbcProyectos,
  getCallCenterU365Equipos,
  getCallCenterU365Proyectos
};

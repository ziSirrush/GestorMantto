'use strict';

const db = require('../../config/db');
const {
  buildPortafolioScopeSql_gnral,
  zoneIds_gnral,
  zoneCodes_gnral
} = require('../../services/information-record-scope-gnral.service');

function positiveInt_uni(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function likeParam_uni(value) {
  const text = String(value || '').trim();
  return text ? `%${text}%` : null;
}

/**
 * Regla comercial oficial del Dashboard Portafolio (FIX 01.1):
 * - No en Servicio tiene prioridad y se determina con estatus_servicio.
 * - En Cobranza se determina exclusivamente con estatus_cobranza = En Cobranza.
 * - Gratuito/Garantia se determina exclusivamente con estatus_cobranza = Gratuito.
 * - estatus_cobranza NULL, vacio o con cualquier otro valor no se clasifica
 *   en los KPI comerciales, salvo que estatus_servicio sea No en Servicio.
 */
function commercialClassificationSql_uni(alias = 'p') {
  return `CASE
    WHEN UPPER(TRIM(COALESCE(${alias}.estatus_servicio,''))) LIKE '%NO EN SERVICIO%' THEN 'No en Servicio'
    WHEN UPPER(TRIM(COALESCE(${alias}.estatus_cobranza,''))) = 'EN COBRANZA' THEN 'En Cobranza'
    WHEN UPPER(TRIM(COALESCE(${alias}.estatus_cobranza,''))) = 'GRATUITO' THEN 'Gratuito/Garantía'
    ELSE NULL
  END`;
}

const latestTicketJoin_uni = `
  LEFT JOIN (
    SELECT *
    FROM (
      SELECT
        t.*,
        ROW_NUMBER() OVER (PARTITION BY t.codigo_equipo ORDER BY t.fecha_reporte DESC, t.id DESC) AS rn
      FROM tickets t
      WHERE t.codigo_equipo IS NOT NULL AND t.codigo_equipo <> ''
    ) ranked
    WHERE ranked.rn = 1
  ) lt ON lt.codigo_equipo = p.numero_equipo
`;

function zoneJoin_uni(alias = 'p', zoneAlias = 'z_pf') {
  return `INNER JOIN z_op ${zoneAlias}
    ON ${zoneAlias}.id_zona = ${alias}.zona_id
   AND ${zoneAlias}.estado = 1`;
}

function portafolioFilters_uni(req, alias = 'p', zoneAlias = 'z_pf') {
  const accessScope = buildPortafolioScopeSql_gnral(req, alias);
  const clauses = [
    `${alias}.estado_registro = 1`,
    `(${alias}.inactivo IS NULL OR UPPER(${alias}.inactivo) NOT IN ('SI','SÍ','1','TRUE','INACTIVO'))`,
    accessScope.sql
  ];
  const params = [...(accessScope.params || [])];

  const zona = likeParam_uni(req.query.zona);
  const tipo = likeParam_uni(req.query.tipo);
  const supervisor = likeParam_uni(req.query.supervisor);
  const search = likeParam_uni(req.query.search || req.query.buscar);
  const operativo = String(req.query.operativo || '').trim().toLowerCase();
  const contrato = String(req.query.contrato || '').trim().toLowerCase();

  // FASE 7/11: la zona de autorizacion, filtro y presentacion es z_op.zona.
  // portafolio.zona_operativa se conserva solo como dato legacy.
  if (zona) {
    clauses.push(`${zoneAlias}.zona LIKE ?`);
    params.push(zona);
  }

  if (supervisor) {
    clauses.push(`${alias}.supervisor_zona LIKE ?`);
    params.push(supervisor);
  }

  if (tipo) {
    clauses.push(`COALESCE(lt.tipo_equipo, ${alias}.id_equipo_ns, 'Sin tipo') LIKE ?`);
    params.push(tipo);
  }

  if (search) {
    clauses.push(`(
      ${alias}.numero_equipo LIKE ?
      OR ${alias}.proyecto LIKE ?
      OR ${alias}.proyecto_cc_x_port LIKE ?
      OR ${alias}.ciudad LIKE ?
      OR ${alias}.estado LIKE ?
      OR ${alias}.identificacion_sitio LIKE ?
      OR ${alias}.supervisor_zona LIKE ?
      OR ${zoneAlias}.zona LIKE ?
    )`);
    params.push(search, search, search, search, search, search, search, search);
  }

  if (operativo === 'parado') {
    clauses.push(`UPPER(COALESCE(lt.estatus_equipo_final,'')) LIKE '%NO FUNC%'`);
  } else if (operativo === 'funcionando') {
    clauses.push(`(lt.ticket IS NULL OR UPPER(COALESCE(lt.estatus_equipo_final,'')) NOT LIKE '%NO FUNC%')`);
  }

  if (contrato === 'no_servicio') {
    clauses.push(`${commercialClassificationSql_uni(alias)} = 'No en Servicio'`);
  } else if (contrato === 'gratuito') {
    clauses.push(`${commercialClassificationSql_uni(alias)} = 'Gratuito/Garantía'`);
  } else if (contrato === 'cobranza') {
    clauses.push(`${commercialClassificationSql_uni(alias)} = 'En Cobranza'`);
  }

  return { where: clauses.join(' AND '), params };
}

function portafolioBaseSelect_uni(zoneAlias = 'z_pf') {
  return `
    p.id_portafolio,
    p.proyecto,
    p.proyecto AS proyecto_codigo,
    COALESCE(NULLIF(TRIM(p.proyecto_cc_x_port), ''), p.proyecto) AS proyecto_nombre,
    p.ciudad,
    p.estado,
    p.numero_equipo,
    p.id_equipo_ns,
    p.identificacion_sitio,
    p.inactivo,
    p.estatus_servicio,
    p.causa_no_servicio,
    p.detalle_no_servicio,
    p.zona_id,
    ${zoneAlias}.zona AS zona,
    ${zoneAlias}.zona AS zona_oficial,
    p.zona_operativa AS zona_operativa_legacy,
    p.direccion,
    p.motivo_inactivo,
    p.suspension_temporal,
    p.causa_suspension_temporal,
    p.fecha_instalacion,
    p.fecha_entrega,
    p.termino_garantia,
    p.fecha_recepcion_mantenimiento,
    p.mes_inicio_gratuitos,
    p.mes_termino_gratuitos,
    p.mes_objetivo_inicio_cobranza,
    p.fecha_ingreso_portafolio,
    p.superintendente,
    p.supervisor_zona AS supervisor,
    p.proyecto_cc_x_port,
    COALESCE(lt.tipo_equipo, p.id_equipo_ns, 'Sin tipo') AS tipo_equipo,
    lt.ticket AS ultimo_ticket,
    lt.fecha_reporte AS ultimo_fecha_reporte,
    lt.fecha_reporte AS fecha_inicio_paro,
    lt.estado_ticket AS ultimo_estado_ticket,
    lt.estatus_equipo_final AS ultimo_estatus_equipo_final,
    lt.responsabilidad AS ultima_responsabilidad,
    ${commercialClassificationSql_uni('p')} AS contrato,
    CASE
      WHEN UPPER(COALESCE(lt.estatus_equipo_final,'')) LIKE '%NO FUNC%' THEN 'Parado'
      ELSE 'Funcionando'
    END AS estado_operativo,
    CASE
      WHEN UPPER(COALESCE(lt.estatus_equipo_final,'')) LIKE '%NO FUNC%' AND lt.fecha_reporte IS NOT NULL
        THEN DATEDIFF(CURDATE(), DATE(lt.fecha_reporte))
      ELSE NULL
    END AS dias_parado
  `;
}

async function queryDashboardData_uni(req) {
  const filters = portafolioFilters_uni(req, 'p', 'z_pf');
  const contratoExpr = commercialClassificationSql_uni('p');
  const operativoExpr = `CASE
    WHEN UPPER(COALESCE(lt.estatus_equipo_final,'')) LIKE '%NO FUNC%' THEN 'Parado'
    ELSE 'Funcionando'
  END`;
  const joins = `${zoneJoin_uni('p', 'z_pf')}\n${latestTicketJoin_uni}`;

  const [kpiRows] = await db.query(`
    SELECT
      COUNT(*) AS total_activos,
      SUM(CASE WHEN contrato = 'En Cobranza' THEN 1 ELSE 0 END) AS en_cobranza,
      SUM(CASE WHEN contrato = 'Gratuito/Garantía' THEN 1 ELSE 0 END) AS gratuito,
      SUM(CASE WHEN contrato = 'Gratuito/Garantía' THEN 1 ELSE 0 END) AS gratuito_garantia,
      SUM(CASE WHEN contrato = 'No en Servicio' THEN 1 ELSE 0 END) AS no_en_servicio,
      SUM(CASE WHEN estado_operativo = 'Funcionando' THEN 1 ELSE 0 END) AS funcionando,
      SUM(CASE WHEN estado_operativo = 'Parado' THEN 1 ELSE 0 END) AS parado
    FROM (
      SELECT
        ${contratoExpr} AS contrato,
        ${operativoExpr} AS estado_operativo
      FROM portafolio p
      ${joins}
      WHERE ${filters.where}
    ) base
  `, filters.params);

  const [projectRows] = await db.query(`
    SELECT
      COUNT(DISTINCT proyecto) AS total_proyectos,
      COUNT(DISTINCT CASE WHEN contrato = 'En Cobranza' THEN proyecto END) AS en_cobranza,
      COUNT(DISTINCT CASE WHEN contrato = 'Gratuito/Garantía' THEN proyecto END) AS gratuito,
      COUNT(DISTINCT CASE WHEN contrato = 'No en Servicio' THEN proyecto END) AS no_en_servicio
    FROM (
      SELECT
        NULLIF(TRIM(p.proyecto), '') AS proyecto,
        ${contratoExpr} AS contrato
      FROM portafolio p
      ${joins}
      WHERE ${filters.where}
        AND p.proyecto IS NOT NULL
        AND TRIM(p.proyecto) <> ''
    ) proyectos_clasificados
  `, filters.params);

  async function distBy_uni(expr) {
    const [rows] = await db.query(`
      SELECT ${expr} AS label, COUNT(*) AS total
      FROM portafolio p
      ${joins}
      WHERE ${filters.where}
      GROUP BY ${expr}
      ORDER BY total DESC, label ASC
      LIMIT 12
    `, filters.params);
    return rows.map(row => ({
      label: row.label || 'Sin dato',
      total: Number(row.total || 0)
    }));
  }

  return {
    kpis: kpiRows[0] || {},
    kpis_proyectos: projectRows[0] || {},
    distribuciones: {
      contrato: await distBy_uni(contratoExpr),
      operativo: await distBy_uni(operativoExpr),
      tipo: await distBy_uni(`COALESCE(lt.tipo_equipo, p.id_equipo_ns, 'Sin tipo')`),
      zona: await distBy_uni(`COALESCE(z_pf.zona, 'Sin zona')`)
    }
  };
}

async function queryDashboardFilters_uni(req) {
  const accessScope = buildPortafolioScopeSql_gnral(req, 'p');
  const baseWhere = `
    p.estado_registro = 1
    AND (p.inactivo IS NULL OR UPPER(p.inactivo) NOT IN ('SI','SÍ','1','TRUE','INACTIVO'))
    AND ${accessScope.sql}
  `;

  const [zonas] = await db.query(`
    SELECT DISTINCT z_pf.zona AS value
    FROM portafolio p
    ${zoneJoin_uni('p', 'z_pf')}
    WHERE ${baseWhere}
    ORDER BY z_pf.zona ASC
  `, accessScope.params || []);

  const [supervisores] = await db.query(`
    SELECT DISTINCT p.supervisor_zona AS value
    FROM portafolio p
    ${zoneJoin_uni('p', 'z_pf')}
    WHERE ${baseWhere}
      AND p.supervisor_zona IS NOT NULL
      AND TRIM(p.supervisor_zona) <> ''
    ORDER BY p.supervisor_zona ASC
  `, accessScope.params || []);

  const [tipos] = await db.query(`
    SELECT DISTINCT COALESCE(lt.tipo_equipo, p.id_equipo_ns, 'Sin tipo') AS value
    FROM portafolio p
    ${zoneJoin_uni('p', 'z_pf')}
    ${latestTicketJoin_uni}
    WHERE ${baseWhere}
      AND COALESCE(lt.tipo_equipo, p.id_equipo_ns, 'Sin tipo') IS NOT NULL
      AND TRIM(COALESCE(lt.tipo_equipo, p.id_equipo_ns, 'Sin tipo')) <> ''
    ORDER BY value ASC
  `, accessScope.params || []);

  return {
    zonas: zonas.map(row => row.value).filter(Boolean),
    supervisores: supervisores.map(row => row.value).filter(Boolean),
    tipos: tipos.map(row => row.value).filter(Boolean)
  };
}

async function queryEquiposData_uni(req) {
  const page = positiveInt_uni(req.query.page, 1, 1, 100000);
  const pageSize = positiveInt_uni(req.query.page_size || req.query.pageSize, 30, 5, 100);
  const offset = (page - 1) * pageSize;
  const filters = portafolioFilters_uni(req, 'p', 'z_pf');

  const sortMap = {
    numero_equipo: 'p.numero_equipo',
    proyecto: 'p.proyecto',
    ciudad: 'p.ciudad',
    zona: 'z_pf.zona',
    tipo_equipo: "COALESCE(lt.tipo_equipo, p.id_equipo_ns, 'Sin tipo')",
    supervisor: 'p.supervisor_zona',
    dias_parado: "CASE WHEN UPPER(COALESCE(lt.estatus_equipo_final,'')) LIKE '%NO FUNC%' AND lt.fecha_reporte IS NOT NULL THEN DATEDIFF(CURDATE(), DATE(lt.fecha_reporte)) ELSE NULL END"
  };

  const sortKey = String(req.query.sort || 'proyecto').trim();
  const sortExpr = sortMap[sortKey] || sortMap.proyecto;
  const sortDirection = String(req.query.direction || '').trim().toLowerCase() === 'desc' ? 'DESC' : 'ASC';
  const joins = `${zoneJoin_uni('p', 'z_pf')}\n${latestTicketJoin_uni}`;

  const [countRows] = await db.query(`
    SELECT COUNT(*) AS total
    FROM portafolio p
    ${joins}
    WHERE ${filters.where}
  `, filters.params);

  const [rows] = await db.query(`
    SELECT ${portafolioBaseSelect_uni('z_pf')}
    FROM portafolio p
    ${joins}
    WHERE ${filters.where}
    ORDER BY ${sortExpr} ${sortDirection}, p.proyecto ASC, p.numero_equipo ASC
    LIMIT ? OFFSET ?
  `, [...filters.params, pageSize, offset]);

  return {
    pagination: {
      page,
      page_size: pageSize,
      total: Number(countRows[0]?.total || 0)
    },
    data: rows
  };
}

async function getPortafolioDashboardInicial_uni(req, res) {
  try {
    const [dashboard, filters, equipos] = await Promise.all([
      queryDashboardData_uni(req),
      queryDashboardFilters_uni(req),
      queryEquiposData_uni(req)
    ]);

    return res.json({
      ok: true,
      source: 'aiven',
      view: 'Dashboard Portafolio',
      alcance: {
        zona_ids: zoneIds_gnral(req),
        zonas: zoneCodes_gnral(req)
      },
      filters,
      dashboard,
      equipos
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error consultando carga inicial del Dashboard Portafolio.',
      error: error.message
    });
  }
}

async function getPortafolioDashboard_uni(req, res) {
  try {
    const dashboard = await queryDashboardData_uni(req);
    return res.json({ ok: true, source: 'aiven', ...dashboard });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error consultando dashboard de portafolio.',
      error: error.message
    });
  }
}

async function getPortafolioEquipos_uni(req, res) {
  try {
    const equipos = await queryEquiposData_uni(req);
    return res.json({ ok: true, source: 'aiven', ...equipos });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error consultando equipos de portafolio.',
      error: error.message
    });
  }
}

module.exports = {
  commercialClassificationSql_uni,
  portafolioFilters_uni,
  getPortafolioDashboardInicial_uni,
  getPortafolioDashboard_uni,
  getPortafolioEquipos_uni
};

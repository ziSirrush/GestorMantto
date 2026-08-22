'use strict';

const repository = require('./proyectos.repository');
const informationRecordScope = require('../../services/information-record-scope-gnral.service');
const portafolioConsultasUni = require('../portafolio/portafolio-consultas_uni');
const db = { query: (...args) => repository.query(...args) };

const latestTicketJoin = `
  LEFT JOIN (
    SELECT *
    FROM (
      SELECT
        t.*,
        ROW_NUMBER() OVER (
          PARTITION BY TRIM(COALESCE(t.codigo_equipo, ''))
          ORDER BY t.fecha_reporte DESC, t.id DESC
        ) AS rn
      FROM tickets t
      WHERE NULLIF(TRIM(COALESCE(t.codigo_equipo, '')), '') IS NOT NULL
    ) ranked
    WHERE ranked.rn = 1
  ) lt ON TRIM(COALESCE(lt.codigo_equipo, '')) = TRIM(COALESCE(p.numero_equipo, ''))
`;

function likeParam(value) {
  const s = String(value || '').trim();
  return s ? '%' + s + '%' : null;
}

function formatProyectoNombre(value) {
  const raw = String(value || '').trim();
  const m = raw.match(/^(\d+)-(\d{2})-(\d{2})(?:T.*)?$/);
  if (!m) return raw;
  const numero = String(Number(m[1]) || m[1].replace(/^0+/, '') || m[1]);
  const meses = {
    '01':'Enero','02':'Febrero','03':'Marzo','04':'Abril','05':'Mayo','06':'Junio',
    '07':'Julio','08':'Agosto','09':'Septiembre','10':'Octubre','11':'Noviembre','12':'Diciembre'
  };
  return `${String(Number(m[3]) || m[3])} de ${meses[m[2]] || m[2]} #${numero}`;
}

function decorateProyectoRow(row) {
  if (!row) return row;
  const codigo = row.proyecto_codigo || row.proyecto;
  const rawNombre = row.nombre_publico || row.proyecto_nombre || row.proyecto_cc_x_port || codigo;
  return {
    ...row,
    proyecto_codigo: codigo,
    proyecto_nombre: row.nombre_publico || formatProyectoNombre(rawNombre || codigo)
  };
}

function proyectosFilters(req, alias = 'p', zoneAlias = 'z_pm') {
  const scope = informationRecordScope.buildPortafolioScopeSql_gnral(req, alias);
  const clauses = [
    scope.sql,
    `${alias}.estado_registro = 1`,
    `(${alias}.inactivo IS NULL OR UPPER(${alias}.inactivo) NOT IN ('SI','S\u00cd','1','TRUE','INACTIVO'))`,
    `${alias}.proyecto IS NOT NULL`,
    `TRIM(${alias}.proyecto) <> ''`,
    `${zoneAlias}.estado = 1`
  ];
  const params = [...(scope.params || [])];
  const zona = likeParam(req.query.zona);
  const estado = likeParam(req.query.estado);
  const supervisor = likeParam(req.query.supervisor);
  const search = likeParam(req.query.search || req.query.buscar);

  if (zona) {
    clauses.push(`${zoneAlias}.zona LIKE ?`);
    params.push(zona);
  }
  if (estado) {
    clauses.push(`${alias}.estado LIKE ?`);
    params.push(estado);
  }
  if (supervisor) {
    clauses.push(`${alias}.supervisor_zona LIKE ?`);
    params.push(supervisor);
  }
  if (search) {
    clauses.push(`(
      ${alias}.proyecto LIKE ?
      OR ${alias}.ciudad LIKE ?
      OR ${alias}.estado LIKE ?
      OR ${zoneAlias}.zona LIKE ?
      OR ${alias}.supervisor_zona LIKE ?
      OR ${alias}.numero_equipo LIKE ?
    )`);
    params.push(search, search, search, search, search, search);
  }

  return { where: clauses.join(' AND '), params };
}

async function queryFiltros_uni(req) {
  const scope = informationRecordScope.buildPortafolioScopeSql_gnral(req, 'p');
  const baseWhere = `
    p.estado_registro = 1
    AND ${scope.sql}
    AND z_pm.estado = 1
  `;
  const baseParams = scope.params || [];

  const [zonas] = await db.query(`
    SELECT DISTINCT z_pm.zona AS value
    FROM portafolio p
    INNER JOIN z_op z_pm ON z_pm.id_zona = p.zona_id
    WHERE ${baseWhere}
      AND NULLIF(TRIM(COALESCE(z_pm.zona, '')), '') IS NOT NULL
    ORDER BY z_pm.zona ASC
  `, baseParams);

  const [estados] = await db.query(`
    SELECT DISTINCT p.estado AS value
    FROM portafolio p
    INNER JOIN z_op z_pm ON z_pm.id_zona = p.zona_id
    WHERE ${baseWhere}
      AND NULLIF(TRIM(COALESCE(p.estado, '')), '') IS NOT NULL
    ORDER BY p.estado ASC
  `, baseParams);

  const [supervisores] = await db.query(`
    SELECT DISTINCT p.supervisor_zona AS value
    FROM portafolio p
    INNER JOIN z_op z_pm ON z_pm.id_zona = p.zona_id
    WHERE ${baseWhere}
      AND NULLIF(TRIM(COALESCE(p.supervisor_zona, '')), '') IS NOT NULL
    ORDER BY p.supervisor_zona ASC
  `, baseParams);

  return {
    zonas: zonas.map(row => row.value).filter(Boolean),
    estados: estados.map(row => row.value).filter(Boolean),
    supervisores: supervisores.map(row => row.value).filter(Boolean)
  };
}

async function queryProyectos_uni(req) {
  const filters = proyectosFilters(req, 'p', 'z_pm');
  const [rows] = await db.query(`
    SELECT
      p.proyecto,
      MAX(pe.nombre_publico) AS nombre_publico,
      MAX(p.ciudad) AS ciudad,
      MAX(p.estado) AS estado,
      GROUP_CONCAT(DISTINCT z_pm.zona ORDER BY z_pm.zona SEPARATOR ' / ') AS zona,
      GROUP_CONCAT(DISTINCT z_pm.zona ORDER BY z_pm.zona SEPARATOR ' / ') AS zona_oficial,
      GROUP_CONCAT(DISTINCT p.zona_id ORDER BY p.zona_id SEPARATOR ',') AS zona_ids_oficiales,
      GROUP_CONCAT(DISTINCT NULLIF(TRIM(p.supervisor_zona), '') ORDER BY p.supervisor_zona SEPARATOR ' / ') AS supervisor,
      COUNT(*) AS equipos,
      SUM(CASE WHEN UPPER(COALESCE(lt.estatus_equipo_final,'')) LIKE '%NO FUNC%' THEN 1 ELSE 0 END) AS parados,
      SUM(COALESCE(t35.tickets_35d, 0)) AS tickets_35d,
      SUM(COALESCE(blt.blt_365d, 0)) AS fallas_blt_365d,
      SUM(COALESCE(resp_anio.llamadas_blt_anio, 0)) AS llamadas_blt_anio,
      MAX(resp_anio.ultima_llamada_blt) AS ultima_llamada_blt,
      SUM(COALESCE(resp_anio.llamadas_cliente_anio, 0)) AS llamadas_cliente_anio,
      MAX(resp_anio.ultima_llamada_cliente) AS ultima_llamada_cliente,
      CASE
        WHEN COUNT(*) > 0 THEN ROUND(
          AVG(CASE WHEN COALESCE(blt.blt_365d,0)=0 THEN 365 ELSE 365/COALESCE(blt.blt_365d,1) END),
          0
        )
        ELSE NULL
      END AS mtbc_365
    FROM portafolio p
    INNER JOIN z_op z_pm
      ON z_pm.id_zona = p.zona_id
     AND z_pm.estado = 1
    LEFT JOIN proyecto_equivalencias pe
      ON pe.activo = 1
     AND UPPER(TRIM(pe.proyecto_united)) = UPPER(TRIM(p.proyecto))
    ${latestTicketJoin}
    LEFT JOIN (
      SELECT TRIM(codigo_equipo) AS codigo_equipo, COUNT(*) AS tickets_35d
      FROM tickets
      WHERE fecha_reporte >= DATE_SUB(CURDATE(), INTERVAL 35 DAY)
        AND NULLIF(TRIM(COALESCE(codigo_equipo, '')), '') IS NOT NULL
      GROUP BY TRIM(codigo_equipo)
    ) t35 ON t35.codigo_equipo = TRIM(p.numero_equipo)
    LEFT JOIN (
      SELECT TRIM(codigo_equipo) AS codigo_equipo, COUNT(*) AS blt_365d
      FROM tickets
      WHERE fecha_reporte >= DATE_SUB(CURDATE(), INTERVAL 365 DAY)
        AND NULLIF(TRIM(COALESCE(codigo_equipo, '')), '') IS NOT NULL
        AND UPPER(TRIM(COALESCE(responsabilidad,''))) = 'BLT'
      GROUP BY TRIM(codigo_equipo)
    ) blt ON blt.codigo_equipo = TRIM(p.numero_equipo)
    LEFT JOIN (
      SELECT
        TRIM(codigo_equipo) AS codigo_equipo,
        SUM(CASE WHEN UPPER(TRIM(COALESCE(responsabilidad,'')))='BLT' THEN 1 ELSE 0 END) AS llamadas_blt_anio,
        MAX(CASE WHEN UPPER(TRIM(COALESCE(responsabilidad,'')))='BLT' THEN fecha_reporte END) AS ultima_llamada_blt,
        SUM(CASE WHEN UPPER(TRIM(COALESCE(responsabilidad,'')))='CLIENTE' THEN 1 ELSE 0 END) AS llamadas_cliente_anio,
        MAX(CASE WHEN UPPER(TRIM(COALESCE(responsabilidad,'')))='CLIENTE' THEN fecha_reporte END) AS ultima_llamada_cliente
      FROM tickets
      WHERE fecha_reporte >= MAKEDATE(YEAR(CURDATE()),1)
        AND fecha_reporte < MAKEDATE(YEAR(CURDATE())+1,1)
        AND NULLIF(TRIM(COALESCE(codigo_equipo, '')), '') IS NOT NULL
      GROUP BY TRIM(codigo_equipo)
    ) resp_anio ON resp_anio.codigo_equipo = TRIM(p.numero_equipo)
    WHERE ${filters.where}
    GROUP BY p.proyecto
    ORDER BY parados DESC, tickets_35d DESC, p.proyecto ASC
  `, filters.params);

  const summary = rows.reduce((acc, row) => {
    acc.proyectos += 1;
    acc.equipos += Number(row.equipos || 0);
    acc.parados += Number(row.parados || 0);
    if (row.mtbc_365 !== null && row.mtbc_365 !== undefined) {
      acc.mtbc_sum += Number(row.mtbc_365 || 0);
      acc.mtbc_count += 1;
    }
    return acc;
  }, { proyectos:0, equipos:0, parados:0, mtbc_sum:0, mtbc_count:0 });

  summary.mtbc_promedio = summary.mtbc_count
    ? Math.round(summary.mtbc_sum / summary.mtbc_count)
    : null;
  delete summary.mtbc_sum;
  delete summary.mtbc_count;

  return { summary, data: rows.map(decorateProyectoRow) };
}

async function getProyectosFiltros_uni(req, res) {
  try {
    const filters = await queryFiltros_uni(req);
    return res.json({ ok:true, source:'aiven', filters });
  } catch (error) {
    return res.status(500).json({ ok:false, message:'Error consultando filtros de proyectos.', error:error.message });
  }
}

async function getProyectos_uni(req, res) {
  if (String(req.query.detalle || '').trim() === '1' && String(req.query.proyecto || '').trim()) {
    return getProyectoDetalle_uni(req, res);
  }
  try {
    const result = await queryProyectos_uni(req);
    return res.json({ ok:true, source:'aiven', ...result });
  } catch (error) {
    return res.status(500).json({ ok:false, message:'Error consultando proyectos desde Aiven.', error:error.message });
  }
}

async function getProyectosInicial_uni(req, res) {
  try {
    const [filters, result] = await Promise.all([
      queryFiltros_uni(req),
      queryProyectos_uni(req)
    ]);
    return res.json({
      ok: true,
      source: 'aiven',
      module: 'PORTAFOLIO_PROYECTOS_DE_MANTENIMIENTO',
      alcance: {
        zona_ids: informationRecordScope.zoneIds_gnral(req),
        zonas: informationRecordScope.zoneCodes_gnral(req)
      },
      filters,
      summary: result.summary,
      data: result.data
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error consultando carga inicial de Proyectos de Mantenimiento.',
      error: error.message
    });
  }
}

function captureResponse() {
  const state = { statusCode: 200, payload: null };
  const response = {
    status(code) {
      state.statusCode = Number(code) || 500;
      return response;
    },
    json(payload) {
      state.payload = payload;
      return payload;
    }
  };
  return { state, response };
}

async function canonicalProjectZones_uni(req, project) {
  const scope = informationRecordScope.buildPortafolioScopeSql_gnral(req, 'p');
  const [rows] = await db.query(`
    SELECT
      GROUP_CONCAT(DISTINCT z_pm.zona ORDER BY z_pm.zona SEPARATOR ' / ') AS zona,
      GROUP_CONCAT(DISTINCT p.zona_id ORDER BY p.zona_id SEPARATOR ',') AS zona_ids
    FROM portafolio p
    INNER JOIN z_op z_pm
      ON z_pm.id_zona = p.zona_id
     AND z_pm.estado = 1
    WHERE p.estado_registro = 1
      AND ${scope.sql}
      AND UPPER(TRIM(COALESCE(p.proyecto, ''))) = UPPER(TRIM(?))
  `, [...(scope.params || []), project]);
  return rows[0] || { zona: null, zona_ids: null };
}

async function canonicalEquipmentZones_uni(req, codes) {
  const normalized = [...new Set((Array.isArray(codes) ? codes : [])
    .map(value => String(value || '').trim())
    .filter(Boolean))];
  if (!normalized.length) return new Map();

  const scope = informationRecordScope.buildPortafolioScopeSql_gnral(req, 'p');
  const [rows] = await db.query(`
    SELECT
      TRIM(p.numero_equipo) AS numero_equipo,
      p.zona_id,
      z_pm.zona
    FROM portafolio p
    INNER JOIN z_op z_pm
      ON z_pm.id_zona = p.zona_id
     AND z_pm.estado = 1
    WHERE p.estado_registro = 1
      AND ${scope.sql}
      AND TRIM(COALESCE(p.numero_equipo, '')) IN (?)
  `, [...(scope.params || []), normalized]);

  return new Map(rows.map(row => [String(row.numero_equipo || '').trim(), row]));
}

async function getProyectoDetalle_uni(req, res) {
  const requested = String(req.params?.proyecto || req.query?.proyecto || '').trim();
  const capture = captureResponse();

  try {
    await portafolioConsultasUni.getPortafolioProyectoDetalle_uni(req, capture.response);
    const statusCode = capture.state.statusCode;
    const payload = capture.state.payload;

    if (statusCode >= 400 || !payload || payload.ok === false) {
      return res.status(statusCode).json(payload || {
        ok: false,
        message: 'No fue posible consultar el detalle del proyecto.'
      });
    }

    const data = payload.data || payload;
    const project = data.proyecto || {};
    const projectCode = String(
      project.proyecto_codigo || project.proyecto_busqueda || project.proyecto || requested
    ).trim();

    if (projectCode) {
      const canonical = await canonicalProjectZones_uni(req, projectCode);
      if (canonical.zona) {
        project.zona = canonical.zona;
        project.zona_operativa = canonical.zona;
        project.zona_oficial = canonical.zona;
        project.zona_ids_oficiales = canonical.zona_ids;
      }
    }

    const equipment = Array.isArray(data.equipos) ? data.equipos : [];
    const zoneMap = await canonicalEquipmentZones_uni(req, equipment.map(row => row.numero_equipo));
    equipment.forEach(row => {
      const canonical = zoneMap.get(String(row.numero_equipo || '').trim());
      if (!canonical) return;
      row.zona = canonical.zona;
      row.zona_operativa = canonical.zona;
      row.zona_oficial = canonical.zona;
      row.zona_id_oficial = Number(canonical.zona_id);
    });

    return res.status(statusCode).json(payload);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error consultando detalle de proyecto con zona canonica.',
      error: error.message
    });
  }
}

module.exports = {
  getProyectosFiltros_uni,
  getProyectos_uni,
  getProyectosInicial_uni,
  getProyectoDetalle_uni
};

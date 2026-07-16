const db = require('../config/db');

function positiveInt(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function getUserCriticidadCriteria(req) {
  const userFallas = Number(req.user && req.user.criticos_fallas) || 3;
  const userPeriodo = Number(req.user && req.user.criticos_periodo) || 35;

  const dias = positiveInt(
    req.query.dias || req.query.periodo || req.query.criticos_periodo,
    userPeriodo,
    1,
    3650
  );

  const minFallas = positiveInt(
    req.query.min_fallas || req.query.minFallas || req.query.fallas || req.query.criticos_fallas,
    userFallas,
    1,
    9999
  );

  return { dias, minFallas };
}

function likeParam(value) {
  const s = String(value || '').trim();
  return s ? '%' + s + '%' : null;
}

function pagination(req) {
  const page = positiveInt(req.query.page, 1, 1, 100000);
  const pageSize = positiveInt(req.query.page_size || req.query.pageSize, 25, 5, 100);
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function dateCondition(alias) {
  return `${alias}.fecha_reporte IS NOT NULL AND ${alias}.fecha_reporte >= DATE_SUB(CURDATE(), INTERVAL ? DAY)`;
}

function responsabilidadBlt(alias) {
  return `UPPER(COALESCE(${alias}.responsabilidad,'')) LIKE '%BLT%'`;
}

function buildOptionalFilters(req, alias, portAlias) {
  const clauses = [];
  const params = [];

  const zona = likeParam(req.query.zona);
  const proyecto = likeParam(req.query.proyecto);
  const supervisor = likeParam(req.query.supervisor);
  const superintendente = likeParam(req.query.superintendente);
  const search = likeParam(req.query.search || req.query.buscar);

  if (zona) {
    clauses.push(`(COALESCE(${alias}.zona, ${portAlias}.zona_operativa) LIKE ?)`);
    params.push(zona);
  }
  if (proyecto) {
    clauses.push(`(COALESCE(${alias}.proyecto, ${portAlias}.proyecto) LIKE ?)`);
    params.push(proyecto);
  }
  if (supervisor) {
    clauses.push(`(COALESCE(${alias}.supervisor, ${portAlias}.supervisor_zona) LIKE ?)`);
    params.push(supervisor);
  }
  if (superintendente) {
    clauses.push(`(${portAlias}.superintendente LIKE ?)`);
    params.push(superintendente);
  }
  if (search) {
    clauses.push(`(
      ${alias}.codigo_equipo LIKE ?
      OR ${alias}.ticket LIKE ?
      OR ${alias}.proyecto LIKE ?
      OR ${alias}.referencia_en_zona_operativa LIKE ?
      OR ${portAlias}.identificacion_sitio LIKE ?
    )`);
    params.push(search, search, search, search, search);
  }

  return { sql: clauses.length ? ' AND ' + clauses.join(' AND ') : '', params };
}

async function getEquiposCriticos(req, res) {
  const { dias, minFallas } = getUserCriticidadCriteria(req);
  const { page, pageSize, offset } = pagination(req);
  const filters = buildOptionalFilters(req, 't', 'p');

  try {
    const paramsBase = [dias, ...filters.params];

    const [countRows] = await db.query(`
      SELECT COUNT(*) AS total
      FROM (
        SELECT t.codigo_equipo
        FROM tickets t
        LEFT JOIN portafolio p ON p.numero_equipo = t.codigo_equipo
        WHERE ${dateCondition('t')}
          AND t.codigo_equipo IS NOT NULL
          AND t.codigo_equipo <> ''
          AND ${responsabilidadBlt('t')}
          ${filters.sql}
        GROUP BY t.codigo_equipo
        HAVING COUNT(*) >= ?
      ) x
    `, [...paramsBase, minFallas]);

    const [rows] = await db.query(`
      SELECT
        base.codigo_equipo,
        MAX(COALESCE(base.zona, p.zona_operativa)) AS zona,
        MAX(COALESCE(base.proyecto, p.proyecto)) AS proyecto,
        MAX(COALESCE(base.ciudad, p.ciudad)) AS ciudad,
        MAX(COALESCE(base.referencia_en_zona_operativa, p.identificacion_sitio)) AS referencia_en_sitio,
        MAX(COALESCE(base.supervisor, p.supervisor_zona)) AS supervisor,
        MAX(p.superintendente) AS superintendente,
        MAX(COALESCE(p.estatus_servicio, base.estatus_equipo_final)) AS estatus_servicio,
        COUNT(*) AS fallas_blt_periodo,
        (
          SELECT COUNT(*)
          FROM tickets tay
          WHERE tay.codigo_equipo = base.codigo_equipo
            AND tay.fecha_reporte >= MAKEDATE(YEAR(CURDATE()), 1)
            AND tay.fecha_reporte < DATE_ADD(CURDATE(), INTERVAL 1 DAY)
            AND UPPER(COALESCE(tay.responsabilidad,'')) LIKE '%BLT%'
        ) AS fallas_blt_anio,
        (
          SELECT COUNT(*)
          FROM tickets t365
          WHERE t365.codigo_equipo = base.codigo_equipo
            AND t365.fecha_reporte >= DATE_SUB(CURDATE(), INTERVAL 365 DAY)
            AND t365.fecha_reporte < DATE_ADD(CURDATE(), INTERVAL 1 DAY)
            AND UPPER(COALESCE(t365.responsabilidad,'')) LIKE '%BLT%'
        ) AS fallas_blt_365,
        (
          SELECT COUNT(*)
          FROM tickets ty
          WHERE ty.codigo_equipo = base.codigo_equipo
            AND ty.fecha_reporte IS NOT NULL
            AND YEAR(ty.fecha_reporte) = YEAR(CURDATE())
        ) AS calls_anio,
        (
          SELECT COUNT(*)
          FROM tickets tc
          WHERE tc.codigo_equipo = base.codigo_equipo
            AND tc.fecha_reporte IS NOT NULL
            AND tc.fecha_reporte >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
            AND UPPER(COALESCE(tc.responsabilidad,'')) LIKE '%CLIENTE%'
        ) AS resp_cliente_periodo,
        MAX(base.fecha_reporte) AS ultimo_blt,
        (
          SELECT MAX(tcli.fecha_reporte)
          FROM tickets tcli
          WHERE tcli.codigo_equipo = base.codigo_equipo
            AND UPPER(COALESCE(tcli.responsabilidad,'')) LIKE '%CLIENTE%'
        ) AS ultimo_cliente,
        CASE
          WHEN COUNT(*) <= 1 THEN NULL
          ELSE ROUND(DATEDIFF(MAX(base.fecha_reporte), MIN(base.fecha_reporte)) / NULLIF(COUNT(*) - 1, 0), 1)
        END AS mtbc_dias,
        (
          SELECT CASE
            WHEN COUNT(*) <= 1 THEN NULL
            ELSE ROUND(DATEDIFF(MAX(tay.fecha_reporte), MIN(tay.fecha_reporte)) / NULLIF(COUNT(*) - 1, 0), 1)
          END
          FROM tickets tay
          WHERE tay.codigo_equipo = base.codigo_equipo
            AND tay.fecha_reporte >= MAKEDATE(YEAR(CURDATE()), 1)
            AND tay.fecha_reporte < DATE_ADD(CURDATE(), INTERVAL 1 DAY)
            AND UPPER(COALESCE(tay.responsabilidad,'')) LIKE '%BLT%'
        ) AS mtbc_anio,
        (
          SELECT CASE
            WHEN COUNT(*) <= 1 THEN NULL
            ELSE ROUND(DATEDIFF(MAX(t365.fecha_reporte), MIN(t365.fecha_reporte)) / NULLIF(COUNT(*) - 1, 0), 1)
          END
          FROM tickets t365
          WHERE t365.codigo_equipo = base.codigo_equipo
            AND t365.fecha_reporte >= DATE_SUB(CURDATE(), INTERVAL 365 DAY)
            AND t365.fecha_reporte < DATE_ADD(CURDATE(), INTERVAL 1 DAY)
            AND UPPER(COALESCE(t365.responsabilidad,'')) LIKE '%BLT%'
        ) AS mtbc_365
      FROM (
        SELECT t.*
        FROM tickets t
        LEFT JOIN portafolio p ON p.numero_equipo = t.codigo_equipo
        WHERE ${dateCondition('t')}
          AND t.codigo_equipo IS NOT NULL
          AND t.codigo_equipo <> ''
          AND ${responsabilidadBlt('t')}
          ${filters.sql}
      ) base
      LEFT JOIN portafolio p ON p.numero_equipo = base.codigo_equipo
      GROUP BY base.codigo_equipo
      HAVING COUNT(*) >= ?
      ORDER BY fallas_blt_periodo DESC, ultimo_blt DESC, base.codigo_equipo ASC
      LIMIT ? OFFSET ?
    `, [dias, ...paramsBase, minFallas, pageSize, offset]);

    return res.json({
      ok: true,
      source: 'aiven',
      criteria: { dias, min_fallas_blt: minFallas, responsabilidad: 'BLT' },
      pagination: { page, page_size: pageSize, total: Number(countRows[0]?.total || 0) },
      data: rows
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Error consultando equipos criticos.', error: error.message });
  }
}

async function getEquipoCriticoTickets(req, res) {
  const codigo = String(req.params.codigo || '').trim();
  const { dias } = getUserCriticidadCriteria(req);
  const responsabilidad = String(req.query.responsabilidad || 'BLT').toUpperCase();
  if (!codigo) return res.status(400).json({ ok: false, message: 'No se recibio codigo de equipo.' });

  const respSql = responsabilidad === 'ALL' ? '' : `AND ${responsabilidadBlt('t')}`;
  try {
    const [rows] = await db.query(`
      SELECT
        t.ticket,
        t.folio,
        t.estado_ticket,
        t.estado,
        t.proyecto,
        t.codigo_equipo,
        t.referencia_en_zona_operativa,
        t.zona,
        t.descripcion,
        t.fecha_reporte,
        t.fecha_cierre,
        t.supervisor,
        t.estatus_equipo_final,
        t.causa,
        t.accion_en_cierre,
        t.responsabilidad,
        t.causa_falla,
        t.tiempo_llegada,
        t.tiempo_solucion,
        t.tipo_equipo,
        t.prioridad,
        t.ticket_excede,
        t.vobo_estado
      FROM tickets t
      WHERE t.codigo_equipo = ?
        AND ${dateCondition('t')}
        ${respSql}
      ORDER BY t.fecha_reporte DESC, t.id DESC
      LIMIT 1000
    `, [codigo, dias]);
    return res.json({ ok: true, source: 'aiven', criteria: { codigo_equipo: codigo, dias, responsabilidad }, data: rows });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Error consultando historial de equipo critico.', error: error.message });
  }
}

async function getProyectosCriticos(req, res) {
  const userCriteria = getUserCriticidadCriteria(req);
  const dias = userCriteria.dias;
  const minFallas = positiveInt(req.query.min_fallas || req.query.minFallas, 5, 1, 9999);
  const minFallasEquipo = positiveInt(
    req.query.min_fallas_equipo || req.query.minFallasEquipo,
    userCriteria.minFallas,
    1,
    9999
  );
  const { page, pageSize, offset } = pagination(req);

  const zona = likeParam(req.query.zona);
  const proyecto = likeParam(req.query.proyecto);

  const filters = [];
  const params = [dias];

  if (zona) {
    filters.push('p.zona_operativa LIKE ?');
    params.push(zona);
  }
  if (proyecto) {
    filters.push('p.proyecto LIKE ?');
    params.push(proyecto);
  }

  const filterSql = filters.length ? ' AND ' + filters.join(' AND ') : '';

  const activePortafolioWhere = `
    p.estado_registro = 1
    AND p.proyecto IS NOT NULL
    AND p.proyecto <> ''
    AND p.numero_equipo IS NOT NULL
    AND p.numero_equipo <> ''
    AND (p.inactivo IS NULL OR UPPER(p.inactivo) NOT IN ('SI','SÍ','1','TRUE'))
  `;

  const equiposConFallaSql = `
    SELECT
      p.proyecto,
      p.numero_equipo,
      MAX(p.zona_operativa) AS zona,
      MAX(p.ciudad) AS ciudad,
      MAX(p.supervisor_zona) AS supervisor,
      COUNT(t.id) AS fallas_equipo,
      MAX(t.fecha_reporte) AS ultimo_blt
    FROM portafolio p
    INNER JOIN tickets t
      ON t.codigo_equipo = p.numero_equipo
      AND t.fecha_reporte IS NOT NULL
      AND t.fecha_reporte >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      AND ${responsabilidadBlt('t')}
    WHERE ${activePortafolioWhere}
      ${filterSql}
    GROUP BY p.proyecto, p.numero_equipo
  `;

  const proyectosSql = `
    SELECT
      eq.proyecto,
      MAX(eq.zona) AS zona,
      MAX(eq.ciudad) AS ciudad,
      MAX(eq.supervisor) AS supervisor,
      COALESCE(act.equipos_activos, 0) AS equipos_activos,
      SUM(eq.fallas_equipo) AS fallas_blt_periodo,
      COUNT(*) AS equipos_con_falla,
      SUM(CASE WHEN eq.fallas_equipo >= ${minFallasEquipo} THEN 1 ELSE 0 END) AS equipos_criticos,
      MAX(eq.ultimo_blt) AS ultimo_blt
    FROM (${equiposConFallaSql}) eq
    LEFT JOIN (
      SELECT proyecto, COUNT(*) AS equipos_activos
      FROM portafolio p
      WHERE ${activePortafolioWhere}
      GROUP BY proyecto
    ) act ON act.proyecto = eq.proyecto
    GROUP BY eq.proyecto, act.equipos_activos
    HAVING SUM(eq.fallas_equipo) >= ${minFallas}
  `;

  try {
    const [countRows] = await db.query(`
      SELECT COUNT(*) AS total
      FROM (${proyectosSql}) q
    `, params);

    const [rows] = await db.query(`
      SELECT *
      FROM (${proyectosSql}) q
      ORDER BY q.fallas_blt_periodo DESC, q.equipos_criticos DESC, q.ultimo_blt DESC, q.proyecto ASC
      LIMIT ? OFFSET ?
    `, [...params, pageSize, offset]);

    return res.json({
      ok: true,
      source: 'aiven',
      criteria: { dias, min_fallas_blt: minFallas, min_fallas_equipo_blt: minFallasEquipo, responsabilidad: 'BLT' },
      pagination: { page, page_size: pageSize, total: Number(countRows[0]?.total || 0) },
      data: rows
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error consultando proyectos criticos.',
      error: error.message
    });
  }
}

async function getProyectoCriticoTickets(req, res) {
  const proyecto = String(req.params.proyecto || '').trim();
  const { dias } = getUserCriticidadCriteria(req);
  if (!proyecto) return res.status(400).json({ ok: false, message: 'No se recibio proyecto.' });

  try {
    const [rows] = await db.query(`
      SELECT
        t.ticket,
        t.folio,
        t.estado_ticket,
        t.estado,
        t.proyecto,
        t.codigo_equipo,
        t.referencia_en_zona_operativa,
        t.zona,
        t.descripcion,
        t.fecha_reporte,
        t.fecha_cierre,
        t.supervisor,
        t.estatus_equipo_final,
        t.causa,
        t.accion_en_cierre,
        t.responsabilidad,
        t.causa_falla,
        t.tiempo_llegada,
        t.tiempo_solucion,
        t.tipo_equipo,
        t.prioridad,
        t.ticket_excede,
        t.vobo_estado
      FROM tickets t
      LEFT JOIN portafolio p ON p.numero_equipo = t.codigo_equipo
      WHERE COALESCE(t.proyecto, p.proyecto) = ?
        AND ${dateCondition('t')}
        AND ${responsabilidadBlt('t')}
      ORDER BY t.fecha_reporte DESC, t.id DESC
      LIMIT 2000
    `, [proyecto, dias]);
    return res.json({ ok: true, source: 'aiven', criteria: { proyecto, dias, responsabilidad: 'BLT' }, data: rows });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Error consultando historial de proyecto critico.', error: error.message });
  }
}


async function getMtbcEquipos(req, res) {
  const { page, pageSize, offset } = pagination(req);
  const filters = buildOptionalFilters(req, 't', 'p');

  try {
    const [countRows] = await db.query(`
      SELECT COUNT(DISTINCT t.codigo_equipo) AS total
      FROM tickets t
      LEFT JOIN portafolio p ON p.numero_equipo = t.codigo_equipo
      WHERE t.codigo_equipo IS NOT NULL
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
        MAX(COALESCE(t.zona, p.zona_operativa)) AS zona,
        MAX(COALESCE(t.referencia_en_zona_operativa, p.identificacion_sitio)) AS referencia_en_sitio,
        MAX(COALESCE(t.supervisor, p.supervisor_zona)) AS supervisor,
        SUM(CASE
          WHEN t.fecha_reporte >= MAKEDATE(YEAR(CURDATE()), 1)
           AND t.fecha_reporte < DATE_ADD(CURDATE(), INTERVAL 1 DAY)
          THEN 1 ELSE 0 END) AS fallas_blt_anio,
        COUNT(*) AS fallas_blt_365,
        CASE
          WHEN SUM(CASE
            WHEN t.fecha_reporte >= MAKEDATE(YEAR(CURDATE()), 1)
             AND t.fecha_reporte < DATE_ADD(CURDATE(), INTERVAL 1 DAY)
            THEN 1 ELSE 0 END) <= 1
          THEN NULL
          ELSE ROUND(
            DATEDIFF(
              MAX(CASE WHEN t.fecha_reporte >= MAKEDATE(YEAR(CURDATE()), 1) THEN t.fecha_reporte END),
              MIN(CASE WHEN t.fecha_reporte >= MAKEDATE(YEAR(CURDATE()), 1) THEN t.fecha_reporte END)
            ) /
            NULLIF(SUM(CASE WHEN t.fecha_reporte >= MAKEDATE(YEAR(CURDATE()), 1) THEN 1 ELSE 0 END) - 1, 0),
            1
          )
        END AS mtbc_anio,
        CASE
          WHEN COUNT(*) <= 1 THEN NULL
          ELSE ROUND(DATEDIFF(MAX(t.fecha_reporte), MIN(t.fecha_reporte)) / NULLIF(COUNT(*) - 1, 0), 1)
        END AS mtbc_365,
        MAX(t.fecha_reporte) AS ultimo_blt
      FROM tickets t
      LEFT JOIN portafolio p ON p.numero_equipo = t.codigo_equipo
      WHERE t.codigo_equipo IS NOT NULL
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
        mtbc: '(ultima fecha de falla - primera fecha de falla) / (numero de fallas - 1)',
        anio_en_curso: '01 de enero hasta hoy',
        ultimos_365_dias: 'ventana movil desde hoy - 365 dias hasta hoy'
      },
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

  if (zona) {
    clauses.push('COALESCE(t.zona, p.zona_operativa) LIKE ?');
    params.push(zona);
  }
  if (proyecto) {
    clauses.push('COALESCE(t.proyecto, p.proyecto) LIKE ?');
    params.push(proyecto);
  }
  const filterSql = clauses.length ? ' AND ' + clauses.join(' AND ') : '';

  try {
    const [countRows] = await db.query(`
      SELECT COUNT(DISTINCT COALESCE(t.proyecto, p.proyecto)) AS total
      FROM tickets t
      LEFT JOIN portafolio p ON p.numero_equipo = t.codigo_equipo
      WHERE COALESCE(t.proyecto, p.proyecto) IS NOT NULL
        AND COALESCE(t.proyecto, p.proyecto) <> ''
        AND t.fecha_reporte >= DATE_SUB(CURDATE(), INTERVAL 365 DAY)
        AND t.fecha_reporte < DATE_ADD(CURDATE(), INTERVAL 1 DAY)
        AND ${responsabilidadBlt('t')}
        ${filterSql}
    `, params);

    const [rows] = await db.query(`
      SELECT
        COALESCE(t.proyecto, p.proyecto) AS proyecto,
        MAX(COALESCE(t.zona, p.zona_operativa)) AS zona,
        COUNT(DISTINCT t.codigo_equipo) AS equipos_con_falla_blt_365,
        COUNT(DISTINCT CASE
          WHEN t.fecha_reporte >= MAKEDATE(YEAR(CURDATE()), 1) THEN t.codigo_equipo
          ELSE NULL END) AS equipos_con_falla_blt_anio,
        SUM(CASE
          WHEN t.fecha_reporte >= MAKEDATE(YEAR(CURDATE()), 1)
           AND t.fecha_reporte < DATE_ADD(CURDATE(), INTERVAL 1 DAY)
          THEN 1 ELSE 0 END) AS fallas_blt_anio,
        COUNT(*) AS fallas_blt_365,
        CASE
          WHEN SUM(CASE
            WHEN t.fecha_reporte >= MAKEDATE(YEAR(CURDATE()), 1)
             AND t.fecha_reporte < DATE_ADD(CURDATE(), INTERVAL 1 DAY)
            THEN 1 ELSE 0 END) <= 1
          THEN NULL
          ELSE ROUND(
            DATEDIFF(
              MAX(CASE WHEN t.fecha_reporte >= MAKEDATE(YEAR(CURDATE()), 1) THEN t.fecha_reporte END),
              MIN(CASE WHEN t.fecha_reporte >= MAKEDATE(YEAR(CURDATE()), 1) THEN t.fecha_reporte END)
            ) /
            NULLIF(SUM(CASE WHEN t.fecha_reporte >= MAKEDATE(YEAR(CURDATE()), 1) THEN 1 ELSE 0 END) - 1, 0),
            1
          )
        END AS mtbc_anio,
        CASE
          WHEN COUNT(*) <= 1 THEN NULL
          ELSE ROUND(DATEDIFF(MAX(t.fecha_reporte), MIN(t.fecha_reporte)) / NULLIF(COUNT(*) - 1, 0), 1)
        END AS mtbc_365,
        MAX(t.fecha_reporte) AS ultimo_blt
      FROM tickets t
      LEFT JOIN portafolio p ON p.numero_equipo = t.codigo_equipo
      WHERE COALESCE(t.proyecto, p.proyecto) IS NOT NULL
        AND COALESCE(t.proyecto, p.proyecto) <> ''
        AND t.fecha_reporte >= DATE_SUB(CURDATE(), INTERVAL 365 DAY)
        AND t.fecha_reporte < DATE_ADD(CURDATE(), INTERVAL 1 DAY)
        AND ${responsabilidadBlt('t')}
        ${filterSql}
      GROUP BY COALESCE(t.proyecto, p.proyecto)
      ORDER BY fallas_blt_anio DESC, fallas_blt_365 DESC, ultimo_blt DESC, proyecto ASC
      LIMIT ? OFFSET ?
    `, [...params, pageSize, offset]);

    return res.json({
      ok: true,
      source: 'aiven',
      rule: {
        responsabilidad: 'BLT',
        aggregation: 'todas las fallas RESP BLT de los equipos pertenecientes al proyecto',
        mtbc: '(ultima fecha de falla - primera fecha de falla) / (numero de fallas - 1)',
        anio_en_curso: '01 de enero hasta hoy',
        ultimos_365_dias: 'ventana movil desde hoy - 365 dias hasta hoy'
      },
      pagination: { page, page_size: pageSize, total: Number(countRows[0]?.total || 0) },
      data: rows
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Error consultando MTBC por proyecto.', error: error.message });
  }
}

async function getCriticidadCorporativa(req, res) {
  const { dias, minFallas } = getUserCriticidadCriteria(req);

  try {
    const [periodoRows] = await db.query(`
      SELECT
        t.codigo_equipo,
        MAX(COALESCE(t.proyecto, p.proyecto)) AS proyecto,
        MAX(COALESCE(t.zona, p.zona_operativa)) AS zona,
        MAX(COALESCE(t.referencia_en_zona_operativa, p.identificacion_sitio)) AS referencia_en_sitio,
        MAX(COALESCE(p.estatus_servicio, t.estatus_equipo_final)) AS estatus_servicio,
        COUNT(*) AS fallas_blt,
        MAX(t.fecha_reporte) AS ultimo_blt,
        1 AS es_critico
      FROM tickets t
      LEFT JOIN portafolio p ON p.numero_equipo = t.codigo_equipo
      WHERE t.codigo_equipo IS NOT NULL
        AND t.codigo_equipo <> ''
        AND t.fecha_reporte >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        AND t.fecha_reporte < DATE_ADD(CURDATE(), INTERVAL 1 DAY)
        AND ${responsabilidadBlt('t')}
      GROUP BY t.codigo_equipo
      HAVING COUNT(*) >= ?
      ORDER BY fallas_blt DESC, ultimo_blt DESC, t.codigo_equipo ASC
    `, [dias, minFallas]);

    const [u365Rows] = await db.query(`
      SELECT
        t.codigo_equipo,
        MAX(COALESCE(t.proyecto, p.proyecto)) AS proyecto,
        MAX(COALESCE(t.zona, p.zona_operativa)) AS zona,
        MAX(COALESCE(t.referencia_en_zona_operativa, p.identificacion_sitio)) AS referencia_en_sitio,
        MAX(COALESCE(p.estatus_servicio, t.estatus_equipo_final)) AS estatus_servicio,
        COUNT(*) AS fallas_blt_365,
        (
          SELECT COUNT(*)
          FROM tickets tx
          WHERE tx.codigo_equipo = t.codigo_equipo
            AND tx.fecha_reporte >= DATE_SUB(CURDATE(), INTERVAL 365 DAY)
            AND tx.fecha_reporte < DATE_ADD(CURDATE(), INTERVAL 1 DAY)
        ) AS llamadas_365,
        MAX(t.fecha_reporte) AS ultimo_blt
      FROM tickets t
      LEFT JOIN portafolio p ON p.numero_equipo = t.codigo_equipo
      WHERE t.codigo_equipo IS NOT NULL
        AND t.codigo_equipo <> ''
        AND t.fecha_reporte >= DATE_SUB(CURDATE(), INTERVAL 365 DAY)
        AND t.fecha_reporte < DATE_ADD(CURDATE(), INTERVAL 1 DAY)
        AND ${responsabilidadBlt('t')}
      GROUP BY t.codigo_equipo
      HAVING COUNT(*) >= ?
      ORDER BY fallas_blt_365 DESC, ultimo_blt DESC, t.codigo_equipo ASC
    `, [minFallas]);

    const criteria = {
      dias,
      min_fallas_blt: minFallas,
      responsabilidad: 'BLT',
      source: req.user ? 'usuario' : 'default'
    };

    return res.json({
      ok: true,
      source: 'aiven',
      criteria,
      periodo_activo: {
        desde: `hoy - ${dias} dias`,
        hasta: 'hoy',
        data: periodoRows
      },
      // Alias temporal para consumidores anteriores. Ahora contiene el periodo activo del usuario.
      anio_en_curso: {
        desde: `hoy - ${dias} dias`,
        hasta: 'hoy',
        data: periodoRows
      },
      ultimos_365_dias: {
        desde: 'hoy - 365 dias',
        hasta: 'hoy',
        data: u365Rows
      }
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error consultando criticidad parametrica.',
      error: error.message
    });
  }
}

module.exports = {
  getEquiposCriticos,
  getEquipoCriticoTickets,
  getProyectosCriticos,
  getProyectoCriticoTickets,
  getCriticidadCorporativa,
  getMtbcEquipos,
  getMtbcProyectos
};

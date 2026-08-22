'use strict';

/**
 * FASE 5/11 - Operacion > Equipos Criticos
 *
 * Alcance territorial UNITED para las lecturas propias del modulo Equipos
 * Criticos. La autoridad territorial es exclusivamente:
 *
 *   usuario_zop -> z_op.id_zona -> portafolio.zona_id
 *
 * `tickets.zona` y `portafolio.zona_operativa` no autorizan ni nombran la zona
 * visible. La zona expuesta al frontend se canoniza desde `z_op.zona`.
 *
 * Este servicio no modifica reglas de criticidad, Vo.Bo., notificaciones ni
 * endpoints Call Center. Reutiliza el alcance ya resuelto por el Guard.
 */

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

function pagination(req) {
  const page = positiveInt(req.query.page, 1, 1, 100000);
  const pageSize = positiveInt(req.query.page_size || req.query.pageSize, 25, 5, 100);
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function likeParam(value) {
  const s = String(value || '').trim();
  return s ? `%${s}%` : null;
}

function dateCondition(alias) {
  return `${alias}.fecha_reporte IS NOT NULL AND ${alias}.fecha_reporte >= DATE_SUB(CURDATE(), INTERVAL ? DAY)`;
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
    AND (${alias}.inactivo IS NULL OR UPPER(TRIM(CAST(${alias}.inactivo AS CHAR))) NOT IN ('SI','SÍ','1','TRUE'))
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

  // La zona de filtro tambien usa el catalogo estructurado, nunca texto legado.
  if (zona) {
    clauses.push(`${zoneAlias}.zona LIKE ?`);
    params.push(zona);
  }
  if (proyecto) {
    clauses.push(`COALESCE(${ticketAlias}.proyecto, ${portAlias}.proyecto) LIKE ?`);
    params.push(proyecto);
  }
  if (supervisor) {
    clauses.push(`COALESCE(${ticketAlias}.supervisor, ${portAlias}.supervisor_zona) LIKE ?`);
    params.push(supervisor);
  }
  if (superintendente) {
    clauses.push(`${portAlias}.superintendente LIKE ?`);
    params.push(superintendente);
  }
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

  return {
    sql: clauses.length ? ` AND ${clauses.join(' AND ')}` : '',
    params
  };
}

function buildProjectFilters(req, portAlias, zoneAlias) {
  const clauses = [];
  const params = [];
  const zona = likeParam(req.query.zona);
  const proyecto = likeParam(req.query.proyecto || req.query.search || req.query.buscar);

  if (zona) {
    clauses.push(`${zoneAlias}.zona LIKE ?`);
    params.push(zona);
  }
  if (proyecto) {
    clauses.push(`${portAlias}.proyecto LIKE ?`);
    params.push(proyecto);
  }

  return {
    sql: clauses.length ? ` AND ${clauses.join(' AND ')}` : '',
    params
  };
}

async function getEquiposCriticos(req, res) {
  const { dias, minFallas } = getUserCriticidadCriteria(req);
  const { page, pageSize, offset } = pagination(req);
  const filters = buildEquipmentFilters(req, 't', 'p', 'z');

  try {
    const [countRows] = await db.query(`
      SELECT COUNT(*) AS total
      FROM (
        SELECT t.codigo_equipo
        FROM tickets t
        INNER JOIN portafolio p ON p.numero_equipo = t.codigo_equipo
        ${zoneJoin('p', 'z')}
        WHERE ${portafolioOperativo('p', req)}
          AND ${dateCondition('t')}
          AND t.codigo_equipo IS NOT NULL
          AND t.codigo_equipo <> ''
          AND ${responsabilidadBlt('t')}
          ${filters.sql}
        GROUP BY t.codigo_equipo
        HAVING COUNT(*) >= ?
      ) x
    `, [dias, ...filters.params, minFallas]);

    const [rows] = await db.query(`
      SELECT
        t.codigo_equipo,
        MAX(z.zona) AS zona,
        MAX(z.zona) AS zona_oficial,
        MAX(p.zona_id) AS zona_id_oficial,
        MAX(COALESCE(t.proyecto, p.proyecto)) AS proyecto,
        MAX(COALESCE(t.ciudad, p.ciudad)) AS ciudad,
        MAX(COALESCE(t.referencia_en_zona_operativa, p.identificacion_sitio)) AS referencia_en_sitio,
        MAX(COALESCE(t.supervisor, p.supervisor_zona)) AS supervisor,
        MAX(p.superintendente) AS superintendente,
        MAX(COALESCE(p.estatus_servicio, t.estatus_equipo_final)) AS estatus_servicio,
        COUNT(*) AS fallas_blt_periodo,
        (SELECT COUNT(*) FROM tickets tay
          WHERE tay.codigo_equipo = t.codigo_equipo
            AND tay.fecha_reporte >= MAKEDATE(YEAR(CURDATE()), 1)
            AND tay.fecha_reporte < DATE_ADD(CURDATE(), INTERVAL 1 DAY)
            AND UPPER(COALESCE(tay.responsabilidad,'')) LIKE '%BLT%') AS fallas_blt_anio,
        (SELECT COUNT(*) FROM tickets t365
          WHERE t365.codigo_equipo = t.codigo_equipo
            AND t365.fecha_reporte >= DATE_SUB(CURDATE(), INTERVAL 365 DAY)
            AND t365.fecha_reporte < DATE_ADD(CURDATE(), INTERVAL 1 DAY)
            AND UPPER(COALESCE(t365.responsabilidad,'')) LIKE '%BLT%') AS fallas_blt_365,
        (SELECT COUNT(*) FROM tickets ty
          WHERE ty.codigo_equipo = t.codigo_equipo
            AND ty.fecha_reporte IS NOT NULL
            AND YEAR(ty.fecha_reporte) = YEAR(CURDATE())) AS calls_anio,
        (SELECT COUNT(*) FROM tickets tc
          WHERE tc.codigo_equipo = t.codigo_equipo
            AND tc.fecha_reporte IS NOT NULL
            AND tc.fecha_reporte >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
            AND UPPER(COALESCE(tc.responsabilidad,'')) LIKE '%CLIENTE%') AS resp_cliente_periodo,
        (SELECT COUNT(*) FROM tickets tbf
          WHERE tbf.codigo_equipo = t.codigo_equipo
            AND tbf.fecha_reporte >= MAKEDATE(YEAR(CURDATE()), 1)
            AND tbf.fecha_reporte < DATE_SUB(CURDATE(), INTERVAL ? DAY)
            AND UPPER(COALESCE(tbf.responsabilidad,'')) LIKE '%BLT%') AS fallas_blt_fuera_periodo,
        (SELECT COUNT(*) FROM tickets tcf
          WHERE tcf.codigo_equipo = t.codigo_equipo
            AND tcf.fecha_reporte >= MAKEDATE(YEAR(CURDATE()), 1)
            AND tcf.fecha_reporte < DATE_SUB(CURDATE(), INTERVAL ? DAY)
            AND UPPER(COALESCE(tcf.responsabilidad,'')) LIKE '%CLIENTE%') AS resp_cliente_fuera_periodo,
        MAX(t.fecha_reporte) AS ultimo_blt,
        (SELECT MAX(tcli.fecha_reporte) FROM tickets tcli
          WHERE tcli.codigo_equipo = t.codigo_equipo
            AND UPPER(COALESCE(tcli.responsabilidad,'')) LIKE '%CLIENTE%') AS ultimo_cliente,
        CASE WHEN COUNT(*) = 0 THEN NULL ELSE ROUND(? / NULLIF(COUNT(*), 0), 1) END AS mtbc_dias,
        (SELECT CASE WHEN COUNT(*) = 0 THEN NULL
          ELSE ROUND((DATEDIFF(CURDATE(), MAKEDATE(YEAR(CURDATE()), 1)) + 1) / NULLIF(COUNT(*), 0), 1) END
          FROM tickets tay
          WHERE tay.codigo_equipo = t.codigo_equipo
            AND tay.fecha_reporte >= MAKEDATE(YEAR(CURDATE()), 1)
            AND tay.fecha_reporte < DATE_ADD(CURDATE(), INTERVAL 1 DAY)
            AND UPPER(COALESCE(tay.responsabilidad,'')) LIKE '%BLT%') AS mtbc_anio,
        (SELECT CASE WHEN COUNT(*) = 0 THEN NULL
          ELSE ROUND(365 / NULLIF(COUNT(*), 0), 1) END
          FROM tickets t365
          WHERE t365.codigo_equipo = t.codigo_equipo
            AND t365.fecha_reporte >= DATE_SUB(CURDATE(), INTERVAL 365 DAY)
            AND t365.fecha_reporte < DATE_ADD(CURDATE(), INTERVAL 1 DAY)
            AND UPPER(COALESCE(t365.responsabilidad,'')) LIKE '%BLT%') AS mtbc_365
      FROM tickets t
      INNER JOIN portafolio p ON p.numero_equipo = t.codigo_equipo
      ${zoneJoin('p', 'z')}
      WHERE ${portafolioOperativo('p', req)}
        AND ${dateCondition('t')}
        AND t.codigo_equipo IS NOT NULL
        AND t.codigo_equipo <> ''
        AND ${responsabilidadBlt('t')}
        ${filters.sql}
      GROUP BY t.codigo_equipo
      HAVING COUNT(*) >= ?
      ORDER BY fallas_blt_periodo DESC, ultimo_blt DESC, t.codigo_equipo ASC
      LIMIT ? OFFSET ?
    `, [
      dias,
      dias,
      dias,
      dias,
      dias,
      ...filters.params,
      minFallas,
      pageSize,
      offset
    ]);

    return res.json({
      ok: true,
      source: 'aiven',
      criteria: { dias, min_fallas_blt: minFallas, responsabilidad: 'BLT' },
      alcance: alcanceMeta(req),
      pagination: { page, page_size: pageSize, total: Number(countRows[0]?.total || 0) },
      data: rows
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error consultando equipos criticos.',
      error: error.message
    });
  }
}

async function getEquipoCriticoTickets(req, res) {
  const codigo = String(req.params.codigo || '').trim();
  const { dias } = getUserCriticidadCriteria(req);
  const responsabilidad = String(req.query.responsabilidad || 'BLT').toUpperCase();
  if (!codigo) {
    return res.status(400).json({ ok: false, message: 'No se recibio codigo de equipo.' });
  }

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
        z.zona AS zona,
        z.zona AS zona_oficial,
        p.zona_id AS zona_id_oficial,
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
      INNER JOIN portafolio p ON p.numero_equipo = t.codigo_equipo
      ${zoneJoin('p', 'z')}
      WHERE ${portafolioOperativo('p', req)}
        AND t.codigo_equipo = ?
        AND ${dateCondition('t')}
        ${respSql}
      ORDER BY t.fecha_reporte DESC, t.id DESC
      LIMIT 1000
    `, [codigo, dias]);

    return res.json({
      ok: true,
      source: 'aiven',
      criteria: { codigo_equipo: codigo, dias, responsabilidad },
      alcance: alcanceMeta(req),
      data: rows
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error consultando historial de equipo critico.',
      error: error.message
    });
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
  const filters = buildProjectFilters(req, 'p', 'z');

  const activeWhere = `
    ${portafolioOperativo('p', req)}
    AND p.proyecto IS NOT NULL
    AND p.proyecto <> ''
    AND p.numero_equipo IS NOT NULL
    AND p.numero_equipo <> ''
  `;

  const equiposConFallaSql = `
    SELECT
      p.proyecto,
      p.numero_equipo,
      z.zona AS zona,
      p.zona_id AS zona_id_oficial,
      MAX(p.ciudad) AS ciudad,
      MAX(p.supervisor_zona) AS supervisor,
      COUNT(t.id) AS fallas_equipo,
      MAX(t.fecha_reporte) AS ultimo_blt
    FROM portafolio p
    ${zoneJoin('p', 'z')}
    INNER JOIN tickets t
      ON t.codigo_equipo = p.numero_equipo
      AND t.fecha_reporte IS NOT NULL
      AND t.fecha_reporte >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      AND ${responsabilidadBlt('t')}
    WHERE ${activeWhere}
      ${filters.sql}
    GROUP BY p.proyecto, p.numero_equipo, p.zona_id, z.zona
  `;

  const activosSql = `
    SELECT p.proyecto, COUNT(*) AS equipos_activos
    FROM portafolio p
    ${zoneJoin('p', 'z')}
    WHERE ${activeWhere}
      ${filters.sql}
    GROUP BY p.proyecto
  `;

  const proyectosSql = `
    SELECT
      eq.proyecto,
      GROUP_CONCAT(DISTINCT eq.zona ORDER BY eq.zona SEPARATOR ', ') AS zona,
      GROUP_CONCAT(DISTINCT eq.zona ORDER BY eq.zona SEPARATOR ', ') AS zona_oficial,
      MAX(eq.ciudad) AS ciudad,
      MAX(eq.supervisor) AS supervisor,
      COALESCE(act.equipos_activos, 0) AS equipos_activos,
      SUM(eq.fallas_equipo) AS fallas_blt_periodo,
      COUNT(*) AS equipos_con_falla,
      SUM(CASE WHEN eq.fallas_equipo >= ${minFallasEquipo} THEN 1 ELSE 0 END) AS equipos_criticos,
      MAX(eq.ultimo_blt) AS ultimo_blt
    FROM (${equiposConFallaSql}) eq
    LEFT JOIN (${activosSql}) act ON act.proyecto = eq.proyecto
    GROUP BY eq.proyecto, act.equipos_activos
    HAVING SUM(eq.fallas_equipo) >= ${minFallas}
  `;

  const paramsBase = [dias, ...filters.params, ...filters.params];

  try {
    const [countRows] = await db.query(`SELECT COUNT(*) AS total FROM (${proyectosSql}) q`, paramsBase);
    const [rows] = await db.query(`
      SELECT *
      FROM (${proyectosSql}) q
      ORDER BY q.fallas_blt_periodo DESC, q.equipos_criticos DESC, q.ultimo_blt DESC, q.proyecto ASC
      LIMIT ? OFFSET ?
    `, [...paramsBase, pageSize, offset]);

    return res.json({
      ok: true,
      source: 'aiven',
      criteria: {
        dias,
        min_fallas_blt: minFallas,
        min_fallas_equipo_blt: minFallasEquipo,
        responsabilidad: 'BLT'
      },
      alcance: alcanceMeta(req),
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
  if (!proyecto) {
    return res.status(400).json({ ok: false, message: 'No se recibio proyecto.' });
  }

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
        z.zona AS zona,
        z.zona AS zona_oficial,
        p.zona_id AS zona_id_oficial,
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
      INNER JOIN portafolio p ON p.numero_equipo = t.codigo_equipo
      ${zoneJoin('p', 'z')}
      WHERE ${portafolioOperativo('p', req)}
        AND p.proyecto = ?
        AND ${dateCondition('t')}
        AND ${responsabilidadBlt('t')}
      ORDER BY t.fecha_reporte DESC, t.id DESC
      LIMIT 2000
    `, [proyecto, dias]);

    return res.json({
      ok: true,
      source: 'aiven',
      criteria: { proyecto, dias, responsabilidad: 'BLT' },
      alcance: alcanceMeta(req),
      data: rows
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error consultando historial de proyecto critico.',
      error: error.message
    });
  }
}

async function getCriticidadCorporativa(req, res) {
  const { dias, minFallas } = getUserCriticidadCriteria(req);

  try {
    const [periodoRows] = await db.query(`
      SELECT
        t.codigo_equipo,
        MAX(COALESCE(t.proyecto, p.proyecto)) AS proyecto,
        MAX(z.zona) AS zona,
        MAX(z.zona) AS zona_oficial,
        MAX(p.zona_id) AS zona_id_oficial,
        MAX(COALESCE(t.referencia_en_zona_operativa, p.identificacion_sitio)) AS referencia_en_sitio,
        MAX(COALESCE(p.estatus_servicio, t.estatus_equipo_final)) AS estatus_servicio,
        COUNT(*) AS fallas_blt,
        MAX(t.fecha_reporte) AS ultimo_blt,
        1 AS es_critico
      FROM tickets t
      INNER JOIN portafolio p ON p.numero_equipo = t.codigo_equipo
      ${zoneJoin('p', 'z')}
      WHERE ${portafolioOperativo('p', req)}
        AND t.codigo_equipo IS NOT NULL
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
        MAX(z.zona) AS zona,
        MAX(z.zona) AS zona_oficial,
        MAX(p.zona_id) AS zona_id_oficial,
        MAX(COALESCE(t.referencia_en_zona_operativa, p.identificacion_sitio)) AS referencia_en_sitio,
        MAX(COALESCE(p.estatus_servicio, t.estatus_equipo_final)) AS estatus_servicio,
        COUNT(*) AS fallas_blt_365,
        (SELECT COUNT(*)
          FROM tickets tx
          WHERE tx.codigo_equipo = t.codigo_equipo
            AND tx.fecha_reporte >= DATE_SUB(CURDATE(), INTERVAL 365 DAY)
            AND tx.fecha_reporte < DATE_ADD(CURDATE(), INTERVAL 1 DAY)) AS llamadas_365,
        MAX(t.fecha_reporte) AS ultimo_blt
      FROM tickets t
      INNER JOIN portafolio p ON p.numero_equipo = t.codigo_equipo
      ${zoneJoin('p', 'z')}
      WHERE ${portafolioOperativo('p', req)}
        AND t.codigo_equipo IS NOT NULL
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
      alcance: alcanceMeta(req),
      periodo_activo: { desde: `hoy - ${dias} dias`, hasta: 'hoy', data: periodoRows },
      anio_en_curso: { desde: `hoy - ${dias} dias`, hasta: 'hoy', data: periodoRows },
      ultimos_365_dias: { desde: 'hoy - 365 dias', hasta: 'hoy', data: u365Rows }
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
  getCriticidadCorporativa
};

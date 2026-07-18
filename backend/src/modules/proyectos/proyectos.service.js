// Módulo Proyectos extraído de data.controller.js sin alterar contratos HTTP.
// En esta etapa transicional conserva los handlers completos para minimizar riesgo.
const proyectosRepository = require('./proyectos.repository');
const db = { query: (...args) => proyectosRepository.query(...args) };

const latestTicketJoin = `
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

const portafolioBaseSelect = `
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
  p.zona_operativa AS zona,
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
  CASE
    WHEN UPPER(COALESCE(p.estatus_servicio,'')) LIKE '%NO EN SERVICIO%' THEN 'No en Servicio'
    WHEN (p.mes_termino_gratuitos IS NOT NULL AND TRIM(p.mes_termino_gratuitos) <> '') OR (p.termino_garantia IS NOT NULL AND TRIM(p.termino_garantia) <> '') THEN 'Gratuito/Garantía'
    ELSE 'En Cobranza'
  END AS contrato,
  CASE
    WHEN UPPER(COALESCE(lt.estatus_equipo_final,'')) LIKE '%NO FUNC%' THEN 'Parado'
    ELSE 'Funcionando'
  END AS estado_operativo,
  CASE
    WHEN UPPER(COALESCE(lt.estatus_equipo_final,'')) LIKE '%NO FUNC%' AND lt.fecha_reporte IS NOT NULL THEN DATEDIFF(CURDATE(), DATE(lt.fecha_reporte))
    ELSE NULL
  END AS dias_parado
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
    '01': 'Enero', '02': 'Febrero', '03': 'Marzo', '04': 'Abril',
    '05': 'Mayo', '06': 'Junio', '07': 'Julio', '08': 'Agosto',
    '09': 'Septiembre', '10': 'Octubre', '11': 'Noviembre', '12': 'Diciembre'
  };
  const mes = meses[m[2]] || m[2];
  const dia = String(Number(m[3]) || m[3]);
  return `${dia} de ${mes} #${numero}`;
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

async function resolveProyectoEquivalencia(proyecto) {
  const value = String(proyecto || '').trim();
  if (!value) {
    return { proyecto_busqueda: value, nombre_publico: value, equivalencia: null };
  }

  const [rows] = await db.query(`
    SELECT
      proyecto_corellian,
      proyecto_united,
      nombre_publico
    FROM proyecto_equivalencias
    WHERE activo = 1
      AND (
        UPPER(TRIM(proyecto_corellian)) = UPPER(TRIM(?))
        OR UPPER(TRIM(proyecto_united)) = UPPER(TRIM(?))
        OR UPPER(TRIM(nombre_publico)) = UPPER(TRIM(?))
      )
    LIMIT 1
  `, [value, value, value]);

  const equivalencia = rows[0] || null;
  return {
    proyecto_busqueda: equivalencia?.proyecto_united || value,
    nombre_publico: equivalencia?.nombre_publico || value,
    equivalencia
  };
}

function proyectosFilters(req, alias) {
  const a = alias || 'p';
  const clauses = [
    `${a}.estado_registro = 1`,
    `(${a}.inactivo IS NULL OR UPPER(${a}.inactivo) NOT IN ('SI','SÍ','1','TRUE','INACTIVO'))`,
    `${a}.proyecto IS NOT NULL`,
    `TRIM(${a}.proyecto) <> ''`
  ];
  const params = [];
  const zona = likeParam(req.query.zona);
  const estado = likeParam(req.query.estado);
  const supervisor = likeParam(req.query.supervisor);
  const search = likeParam(req.query.search || req.query.buscar);

  if (zona) { clauses.push(`${a}.zona_operativa LIKE ?`); params.push(zona); }
  if (estado) { clauses.push(`${a}.estado LIKE ?`); params.push(estado); }
  if (supervisor) { clauses.push(`${a}.supervisor_zona LIKE ?`); params.push(supervisor); }
  if (search) {
    clauses.push(`(
      ${a}.proyecto LIKE ?
      OR ${a}.ciudad LIKE ?
      OR ${a}.estado LIKE ?
      OR ${a}.zona_operativa LIKE ?
      OR ${a}.supervisor_zona LIKE ?
    )`);
    params.push(search, search, search, search, search);
  }

  return { where: clauses.join(' AND '), params };
}

async function getProyectosFiltros(req, res) {
  try {
    const [zonas] = await db.query(`
      SELECT DISTINCT zona_operativa AS value
      FROM portafolio
      WHERE estado_registro = 1 AND zona_operativa IS NOT NULL AND zona_operativa <> ''
      ORDER BY zona_operativa ASC
    `);
    const [estados] = await db.query(`
      SELECT DISTINCT estado AS value
      FROM portafolio
      WHERE estado_registro = 1 AND estado IS NOT NULL AND estado <> ''
      ORDER BY estado ASC
    `);
    const [supervisores] = await db.query(`
      SELECT DISTINCT supervisor_zona AS value
      FROM portafolio
      WHERE estado_registro = 1 AND supervisor_zona IS NOT NULL AND supervisor_zona <> ''
      ORDER BY supervisor_zona ASC
    `);

    return res.json({
      ok: true,
      source: 'aiven',
      filters: {
        zonas: zonas.map(r => r.value).filter(Boolean),
        estados: estados.map(r => r.value).filter(Boolean),
        supervisores: supervisores.map(r => r.value).filter(Boolean)
      }
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Error consultando filtros de proyectos.', error: error.message });
  }
}

async function getProyectos(req, res) {
  // Compatibilidad: el frontend usa esta ruta base porque /api/proyectos ya esta validada.
  // Si se pide detalle=1, resolvemos el detalle del proyecto desde el mismo handler.
  if (String(req.query.detalle || '').trim() === '1' && String(req.query.proyecto || '').trim()) {
    return getProyectoDetalle(req, res);
  }

  const filters = proyectosFilters(req, 'p');
  try {
    const [rows] = await db.query(`
      SELECT
        p.proyecto,
        MAX(pe.nombre_publico) AS nombre_publico,
        MAX(p.ciudad) AS ciudad,
        MAX(p.estado) AS estado,
        MAX(p.zona_operativa) AS zona,
        MAX(p.supervisor_zona) AS supervisor,
        COUNT(*) AS equipos,
        SUM(CASE WHEN UPPER(COALESCE(lt.estatus_equipo_final,'')) LIKE '%NO FUNC%' THEN 1 ELSE 0 END) AS parados,
        SUM(COALESCE(t35.tickets_35d, 0)) AS tickets_35d,
        SUM(COALESCE(blt.blt_365d, 0)) AS fallas_blt_365d,
        SUM(COALESCE(resp_anio.llamadas_blt_anio, 0)) AS llamadas_blt_anio,
        MAX(resp_anio.ultima_llamada_blt) AS ultima_llamada_blt,
        SUM(COALESCE(resp_anio.llamadas_cliente_anio, 0)) AS llamadas_cliente_anio,
        MAX(resp_anio.ultima_llamada_cliente) AS ultima_llamada_cliente,
        CASE
          WHEN COUNT(*) > 0 THEN ROUND(AVG(
            CASE
              WHEN COALESCE(blt.blt_365d, 0) = 0 THEN 365
              ELSE 365 / COALESCE(blt.blt_365d, 1)
            END
          ), 0)
          ELSE NULL
        END AS mtbc_365
      FROM portafolio p
      LEFT JOIN proyecto_equivalencias pe
        ON pe.activo = 1
       AND UPPER(TRIM(pe.proyecto_united)) = UPPER(TRIM(p.proyecto))
      ${latestTicketJoin}
      LEFT JOIN (
        SELECT codigo_equipo, COUNT(*) AS tickets_35d
        FROM tickets
        WHERE fecha_reporte >= DATE_SUB(CURDATE(), INTERVAL 35 DAY)
          AND codigo_equipo IS NOT NULL AND codigo_equipo <> ''
        GROUP BY codigo_equipo
      ) t35 ON t35.codigo_equipo = p.numero_equipo
      LEFT JOIN (
        SELECT codigo_equipo, COUNT(*) AS blt_365d
        FROM tickets
        WHERE fecha_reporte >= DATE_SUB(CURDATE(), INTERVAL 365 DAY)
          AND codigo_equipo IS NOT NULL AND codigo_equipo <> ''
          AND UPPER(COALESCE(responsabilidad,'')) = 'BLT'
        GROUP BY codigo_equipo
      ) blt ON blt.codigo_equipo = p.numero_equipo
      LEFT JOIN (
        SELECT
          codigo_equipo,
          SUM(CASE WHEN UPPER(TRIM(COALESCE(responsabilidad,''))) = 'BLT' THEN 1 ELSE 0 END) AS llamadas_blt_anio,
          MAX(CASE WHEN UPPER(TRIM(COALESCE(responsabilidad,''))) = 'BLT' THEN fecha_reporte END) AS ultima_llamada_blt,
          SUM(CASE WHEN UPPER(TRIM(COALESCE(responsabilidad,''))) = 'CLIENTE' THEN 1 ELSE 0 END) AS llamadas_cliente_anio,
          MAX(CASE WHEN UPPER(TRIM(COALESCE(responsabilidad,''))) = 'CLIENTE' THEN fecha_reporte END) AS ultima_llamada_cliente
        FROM tickets
        WHERE fecha_reporte >= MAKEDATE(YEAR(CURDATE()), 1)
          AND fecha_reporte < MAKEDATE(YEAR(CURDATE()) + 1, 1)
          AND codigo_equipo IS NOT NULL
          AND TRIM(codigo_equipo) <> ''
        GROUP BY codigo_equipo
      ) resp_anio ON resp_anio.codigo_equipo = p.numero_equipo
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
    }, { proyectos: 0, equipos: 0, parados: 0, mtbc_sum: 0, mtbc_count: 0 });
    summary.mtbc_promedio = summary.mtbc_count ? Math.round(summary.mtbc_sum / summary.mtbc_count) : null;
    delete summary.mtbc_sum;
    delete summary.mtbc_count;

    return res.json({ ok: true, source: 'aiven', summary, data: rows.map(decorateProyectoRow) });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Error consultando proyectos desde Aiven.', error: error.message });
  }
}

async function getProyectoInstalacionDetalle(proyecto) {
  const [rows] = await db.query(`
    SELECT
      f.*,
      COALESCE(us.nombre, f.supervisor_fl) AS supervisor_nombre,
      COALESCE(ua.nombre, f.vendedor) AS asesor_nombre,
      uad.nombre AS administrativo_nombre
    FROM ins_fl f
    LEFT JOIN usuarios us ON us.id_SB = f.id_sup
    LEFT JOIN usuarios ua ON ua.id_SB = f.id_asesor
    LEFT JOIN usuarios uad ON uad.id_SB = f.id_admin
    WHERE (
      TRIM(COALESCE(f.id_proyecto, '')) = TRIM(?)
      OR TRIM(COALESCE(f.proyecto, '')) = TRIM(?)
    )
    ORDER BY f.referencia_sitio ASC, f.id_ins_fl ASC
  `, [proyecto, proyecto]);

  if (!rows.length) return null;

  const first = rows[0];
  const proyectoId = first.id_proyecto || proyecto;
  const proyectoNombre = first.proyecto || proyectoId;
  const estatusNormalizados = rows.map(r => String(r.estatus || '').trim().toUpperCase());
  const terminados = estatusNormalizados.filter(estatus => estatus === '08-T').length;
  const esCerrado = rows.length > 0 && terminados === rows.length;
  const esActivo = !esCerrado && rows.some((r, index) => {
    const estatus = estatusNormalizados[index];
    return Number(r.activo) === 1 || (estatus && estatus !== '08-T');
  });
  const clasificacion = esCerrado ? 'CERRADO' : (esActivo ? 'ACTIVO' : 'SIN_CLASIFICAR');

  const [tickets] = await db.query(`
    SELECT
      t.ticket, t.codigo_equipo, t.equipo, t.folio, t.estado_ticket, t.estado,
      t.fecha_reporte, t.fecha_cierre, t.responsabilidad, t.causa_falla,
      t.causa, t.tiempo_llegada, t.tiempo_solucion, t.estatus_equipo_final
    FROM tickets t
    WHERE t.proyecto IN (?, ?)
       OR t.codigo_equipo IN (
         SELECT referencia_sitio
         FROM ins_fl
         WHERE (
           TRIM(COALESCE(id_proyecto, '')) = TRIM(?)
           OR TRIM(COALESCE(proyecto, '')) = TRIM(?)
         )
       )
    ORDER BY t.fecha_reporte DESC, t.id DESC
    LIMIT 300
  `, [proyectoId, proyectoNombre, proyectoId, proyectoNombre]);

  const equipos = rows.map(r => ({
    numero_equipo: r.referencia_sitio || r.id_ins_fl,
    identificacion_sitio: r.referencia_sitio,
    tipo_equipo: r.numero_pisos ? `Instalación · ${r.numero_pisos} pisos` : 'Instalación',
    contrato: r.subcontratista || null,
    estado_operativo: String(r.estatus || '').trim().toUpperCase() === '08-T' ? 'Terminado' : (r.estatus || 'En proceso'),
    estatus_servicio: r.estatus,
    dias_parado: null,
    ultimo_ticket: null,
    ciudad: r.ciudad,
    estado: r.estado,
    zona: null,
    supervisor: r.supervisor_nombre || r.supervisor_fl,
    proyecto: proyectoId,
    proyecto_nombre: proyectoNombre,
    id_ins_fl: r.id_ins_fl,
    avance_oc: r.avance_oc,
    avance_mo: r.avance_mo,
    avance_aj: r.avance_aj,
    fecha_inicio_montaje: r.fecha_inicio_montaje,
    fecha_fin_montaje_real: r.fecha_fin_montaje_real,
    fecha_inicio_ajuste: r.fecha_inicio_ajuste,
    fecha_fin_ajuste_real: r.fecha_fin_ajuste_real,
    fecha_entrega_cliente: r.fecha_entrega_cliente
  }));

  const monthlyCurrent = [];
  const monthlyPrevious = [];
  const responsabilidadMap = new Map();
  for (const ticket of tickets) {
    const key = String(ticket.responsabilidad || '').trim() || 'Sin dato';
    responsabilidadMap.set(key, (responsabilidadMap.get(key) || 0) + 1);
  }

  return {
    ok: true,
    source: 'aiven-ins_fl',
    proyecto: {
      proyecto: proyectoId,
      proyecto_codigo: proyectoId,
      proyecto_nombre: proyectoNombre,
      ciudad: first.ciudad,
      estado: first.estado,
      zona: null,
      supervisor: first.supervisor_nombre || first.supervisor_fl,
      asesor: first.asesor_nombre || first.vendedor,
      administrativo: first.administrativo_nombre,
      cliente: first.cliente,
      equipos: rows.length,
      equipos_terminados: terminados,
      parados: 0,
      tickets_35d: tickets.filter(t => {
        if (!t.fecha_reporte) return false;
        const d = new Date(t.fecha_reporte);
        return !Number.isNaN(d.getTime()) && d >= new Date(Date.now() - 35 * 86400000);
      }).length,
      fallas_blt_365d: tickets.filter(t => String(t.responsabilidad || '').trim().toUpperCase() === 'BLT').length,
      mtbc_365: null,
      origen: 'instalaciones',
      clasificacion,
      activo: clasificacion === 'ACTIVO' ? 1 : 0
    },
    clasificacion,
    equipos,
    tickets,
    monthly_current: monthlyCurrent,
    monthly_previous: monthlyPrevious,
    responsabilidad: Array.from(responsabilidadMap, ([responsabilidad, total]) => ({ responsabilidad, total }))
  };
}

async function getProyectoDetalle(req, res) {
  const proyectoSolicitado = String(req.params.proyecto || req.query.proyecto || '').trim();
  const soloPortafolio = String(req.query.origen || '').trim().toLowerCase() === 'portafolio';
  if (!proyectoSolicitado) return res.status(400).json({ ok: false, message: 'Proyecto requerido.' });

  try {
    const equivalencia = await resolveProyectoEquivalencia(proyectoSolicitado);
    const proyecto = equivalencia.proyecto_busqueda;
    const nombrePublico = equivalencia.nombre_publico;
    const anioTicketsRaw = Number.parseInt(req.query.anio_tickets, 10);
    const anioTickets = Number.isInteger(anioTicketsRaw) && anioTicketsRaw >= 2000 && anioTicketsRaw <= 2100 ? anioTicketsRaw : null;
    const filtroVisible = soloPortafolio
      ? 'p.estado_registro = 1'
      : "p.estado_registro = 1 AND (p.inactivo IS NULL OR UPPER(p.inactivo) NOT IN ('SI','SÍ','1','TRUE','INACTIVO'))";
    const filtroVisibleSubquery = soloPortafolio
      ? 'estado_registro = 1'
      : "estado_registro = 1 AND (inactivo IS NULL OR UPPER(inactivo) NOT IN ('SI','SÍ','1','TRUE','INACTIVO'))";

    const [proyectos] = await db.query(`
      SELECT
        p.proyecto,
        MAX(p.proyecto_cc_x_port) AS proyecto_cc_x_port,
        MAX(p.ciudad) AS ciudad,
        MAX(p.estado) AS estado,
        GROUP_CONCAT(DISTINCT NULLIF(TRIM(p.estatus_servicio), '') ORDER BY p.estatus_servicio SEPARATOR ' / ') AS estatus_servicio,
        MAX(p.zona_operativa) AS zona,
        MAX(p.zona_operativa) AS zona_operativa,
        MAX(p.direccion) AS direccion,
        MIN(p.fecha_instalacion) AS fecha_instalacion,
        MIN(p.fecha_entrega) AS fecha_entrega,
        MAX(p.termino_garantia) AS termino_garantia,
        MIN(p.fecha_recepcion_mantenimiento) AS fecha_recepcion_mantenimiento,
        MAX(p.mes_inicio_gratuitos) AS mes_inicio_gratuitos,
        MAX(p.mes_termino_gratuitos) AS mes_termino_gratuitos,
        MAX(p.mes_objetivo_inicio_cobranza) AS mes_objetivo_inicio_cobranza,
        MIN(p.fecha_ingreso_portafolio) AS fecha_ingreso_portafolio,
        MAX(p.superintendente) AS superintendente,
        MAX(p.supervisor_zona) AS supervisor,
        MAX(p.supervisor_zona) AS supervisor_zona,
        COUNT(*) AS equipos,
        SUM(CASE WHEN UPPER(COALESCE(lt.estatus_equipo_final,'')) LIKE '%NO FUNC%' THEN 1 ELSE 0 END) AS parados,
        SUM(COALESCE(t35.tickets_35d, 0)) AS tickets_35d,
        SUM(COALESCE(blt.blt_365d, 0)) AS fallas_blt_365d,
        CASE
          WHEN COUNT(*) > 0 THEN ROUND(AVG(
            CASE
              WHEN COALESCE(blt.blt_365d, 0) = 0 THEN 365
              ELSE 365 / COALESCE(blt.blt_365d, 1)
            END
          ), 0)
          ELSE NULL
        END AS mtbc_365
      FROM portafolio p
      ${latestTicketJoin}
      LEFT JOIN (
        SELECT codigo_equipo, COUNT(*) AS tickets_35d
        FROM tickets
        WHERE fecha_reporte >= DATE_SUB(CURDATE(), INTERVAL 35 DAY)
          AND codigo_equipo IS NOT NULL AND codigo_equipo <> ''
        GROUP BY codigo_equipo
      ) t35 ON t35.codigo_equipo = p.numero_equipo
      LEFT JOIN (
        SELECT codigo_equipo, COUNT(*) AS blt_365d
        FROM tickets
        WHERE fecha_reporte >= DATE_SUB(CURDATE(), INTERVAL 365 DAY)
          AND codigo_equipo IS NOT NULL AND codigo_equipo <> ''
          AND UPPER(COALESCE(responsabilidad,'')) = 'BLT'
        GROUP BY codigo_equipo
      ) blt ON blt.codigo_equipo = p.numero_equipo
      WHERE ${filtroVisible}
        AND UPPER(TRIM(p.proyecto)) = UPPER(TRIM(?))
      GROUP BY p.proyecto
    `, [proyecto]);

    if (!proyectos.length) {
      if (soloPortafolio) {
        return res.status(404).json({
          ok: false,
          source: 'aiven-portafolio',
          message: 'Proyecto no encontrado en Portafolio.'
        });
      }

      const instalacion = await getProyectoInstalacionDetalle(proyectoSolicitado);
      if (instalacion) return res.json(instalacion);
      return res.status(404).json({ ok: false, message: 'Proyecto no encontrado en Portafolio ni en Instalaciones.' });
    }

    const [equipos] = await db.query(`
      SELECT ${portafolioBaseSelect},
        (SELECT COUNT(*) FROM tickets tay WHERE tay.codigo_equipo = p.numero_equipo AND tay.fecha_reporte >= MAKEDATE(YEAR(CURDATE()), 1) AND tay.fecha_reporte < DATE_ADD(CURDATE(), INTERVAL 1 DAY) AND UPPER(COALESCE(tay.responsabilidad,'')) LIKE '%BLT%') AS fallas_blt_anio,
        (SELECT MAX(tay.fecha_reporte) FROM tickets tay WHERE tay.codigo_equipo = p.numero_equipo AND tay.fecha_reporte >= MAKEDATE(YEAR(CURDATE()), 1) AND tay.fecha_reporte < DATE_ADD(CURDATE(), INTERVAL 1 DAY) AND UPPER(COALESCE(tay.responsabilidad,'')) LIKE '%BLT%') AS ultimo_blt,
        (SELECT COUNT(*) FROM tickets tcli WHERE tcli.codigo_equipo = p.numero_equipo AND tcli.fecha_reporte >= MAKEDATE(YEAR(CURDATE()), 1) AND tcli.fecha_reporte < DATE_ADD(CURDATE(), INTERVAL 1 DAY) AND UPPER(COALESCE(tcli.responsabilidad,'')) LIKE '%CLIENTE%') AS resp_cliente_anio,
        (SELECT MAX(tcli.fecha_reporte) FROM tickets tcli WHERE tcli.codigo_equipo = p.numero_equipo AND UPPER(COALESCE(tcli.responsabilidad,'')) LIKE '%CLIENTE%') AS ultimo_cliente,
        (SELECT CASE WHEN COUNT(*) = 0 THEN NULL WHEN COUNT(*) = 1 THEN DATEDIFF(CURDATE(), MAKEDATE(YEAR(CURDATE()), 1)) + 1 ELSE ROUND(DATEDIFF(MAX(tay.fecha_reporte), MIN(tay.fecha_reporte)) / NULLIF(COUNT(*) - 1, 0), 1) END FROM tickets tay WHERE tay.codigo_equipo = p.numero_equipo AND tay.fecha_reporte >= MAKEDATE(YEAR(CURDATE()), 1) AND tay.fecha_reporte < DATE_ADD(CURDATE(), INTERVAL 1 DAY) AND UPPER(COALESCE(tay.responsabilidad,'')) LIKE '%BLT%') AS mtbc_anio,
        (SELECT CASE WHEN COUNT(*) = 0 THEN NULL WHEN COUNT(*) = 1 THEN 365 ELSE ROUND(DATEDIFF(MAX(t365.fecha_reporte), MIN(t365.fecha_reporte)) / NULLIF(COUNT(*) - 1, 0), 1) END FROM tickets t365 WHERE t365.codigo_equipo = p.numero_equipo AND t365.fecha_reporte >= DATE_SUB(CURDATE(), INTERVAL 365 DAY) AND t365.fecha_reporte < DATE_ADD(CURDATE(), INTERVAL 1 DAY) AND UPPER(COALESCE(t365.responsabilidad,'')) LIKE '%BLT%') AS mtbc_365
      FROM portafolio p
      ${latestTicketJoin}
      WHERE ${filtroVisible}
        AND UPPER(TRIM(p.proyecto)) = UPPER(TRIM(?))
      ORDER BY p.numero_equipo ASC
    `, [proyecto]);

    const ticketParams = [proyecto, proyecto, proyecto];
    const ticketYearSql = anioTickets ? ' AND YEAR(t.fecha_reporte) = ?' : '';
    if (anioTickets) ticketParams.push(anioTickets);
    const [tickets] = await db.query(`
      SELECT
        t.ticket, t.codigo_equipo, t.equipo, t.folio, t.estado_ticket, t.estado,
        t.descripcion, t.fecha_reporte, t.h_reporte, t.estatus_equipo_ir,
        t.fecha_llegada, t.h_llegada, t.tiempo_llegada,
        t.fecha_cierre, t.h_solucion, t.tiempo_solucion,
        t.estatus_equipo_final, t.causa, t.causa_falla, t.accion_en_cierre, t.responsabilidad,
        eq.identificacion_sitio
      FROM tickets t
      LEFT JOIN (
        SELECT
          numero_equipo,
          MAX(NULLIF(TRIM(identificacion_sitio), '')) AS identificacion_sitio
        FROM portafolio
        WHERE ${filtroVisibleSubquery}
          AND UPPER(TRIM(proyecto)) = UPPER(TRIM(?))
        GROUP BY numero_equipo
      ) eq ON eq.numero_equipo = t.codigo_equipo
      WHERE (UPPER(TRIM(t.proyecto)) = UPPER(TRIM(?))
         OR t.codigo_equipo IN (
          SELECT numero_equipo
          FROM portafolio
          WHERE ${filtroVisibleSubquery}
            AND UPPER(TRIM(proyecto)) = UPPER(TRIM(?))
        ))
        ${ticketYearSql}
      ORDER BY t.codigo_equipo ASC, t.fecha_reporte DESC, t.id DESC
      LIMIT 3000
    `, ticketParams);

    const [ticketYears] = await db.query(`
      SELECT DISTINCT YEAR(t.fecha_reporte) AS anio
      FROM tickets t
      WHERE t.fecha_reporte IS NOT NULL
        AND (UPPER(TRIM(t.proyecto)) = UPPER(TRIM(?)) OR t.codigo_equipo IN (
          SELECT numero_equipo FROM portafolio WHERE ${filtroVisibleSubquery} AND UPPER(TRIM(proyecto)) = UPPER(TRIM(?))
        ))
      ORDER BY anio DESC
    `, [proyecto, proyecto]);

    const [monthlyCurrent] = await db.query(`
      SELECT DATE_FORMAT(t.fecha_reporte, '%Y-%m') AS mes, COUNT(*) AS total
      FROM tickets t
      WHERE YEAR(t.fecha_reporte) = YEAR(CURDATE())
        AND (UPPER(TRIM(t.proyecto)) = UPPER(TRIM(?)) OR t.codigo_equipo IN (
          SELECT numero_equipo FROM portafolio WHERE ${filtroVisibleSubquery} AND UPPER(TRIM(proyecto)) = UPPER(TRIM(?))
        ))
      GROUP BY DATE_FORMAT(t.fecha_reporte, '%Y-%m')
      ORDER BY mes ASC
    `, [proyecto, proyecto]);

    const [monthlyPrevious] = await db.query(`
      SELECT DATE_FORMAT(t.fecha_reporte, '%Y-%m') AS mes, COUNT(*) AS total
      FROM tickets t
      WHERE YEAR(t.fecha_reporte) = YEAR(CURDATE()) - 1
        AND (UPPER(TRIM(t.proyecto)) = UPPER(TRIM(?)) OR t.codigo_equipo IN (
          SELECT numero_equipo FROM portafolio WHERE ${filtroVisibleSubquery} AND UPPER(TRIM(proyecto)) = UPPER(TRIM(?))
        ))
      GROUP BY DATE_FORMAT(t.fecha_reporte, '%Y-%m')
      ORDER BY mes ASC
    `, [proyecto, proyecto]);

    const [responsabilidad] = await db.query(`
      SELECT COALESCE(NULLIF(TRIM(t.responsabilidad),''),'Sin dato') AS responsabilidad, COUNT(*) AS total
      FROM tickets t
      WHERE t.fecha_reporte >= DATE_SUB(CURDATE(), INTERVAL 365 DAY)
        AND (UPPER(TRIM(t.proyecto)) = UPPER(TRIM(?)) OR t.codigo_equipo IN (
          SELECT numero_equipo FROM portafolio WHERE ${filtroVisibleSubquery} AND UPPER(TRIM(proyecto)) = UPPER(TRIM(?))
        ))
      GROUP BY COALESCE(NULLIF(TRIM(t.responsabilidad),''),'Sin dato')
      ORDER BY total DESC
    `, [proyecto, proyecto]);

    const projectMetrics = {
      equipos_activos: equipos.length,
      equipos_detenidos: equipos.filter(row => {
        const value = String(row.estado_operativo || row.estatus_equipo_final || '').trim().toUpperCase();
        return value.includes('NO FUNC') || value.includes('PARAD');
      }).length,
      equipos_criticos_anio: 0,
      llamadas_total_anio: 0,
      llamadas_blt_anio: 0,
      llamadas_cliente_anio: 0,
      llamadas_sin_responsable_anio: 0
    };

    const [callMetricsRows] = await db.query(`
      SELECT
        COUNT(*) AS llamadas_total_anio,
        SUM(CASE WHEN UPPER(TRIM(COALESCE(t.responsabilidad,''))) = 'BLT' THEN 1 ELSE 0 END) AS llamadas_blt_anio,
        SUM(CASE WHEN UPPER(TRIM(COALESCE(t.responsabilidad,''))) = 'CLIENTE' THEN 1 ELSE 0 END) AS llamadas_cliente_anio,
        SUM(CASE WHEN TRIM(COALESCE(t.responsabilidad,'')) = '' OR UPPER(TRIM(t.responsabilidad)) NOT IN ('BLT','CLIENTE') THEN 1 ELSE 0 END) AS llamadas_sin_responsable_anio
      FROM tickets t
      WHERE t.fecha_reporte >= MAKEDATE(YEAR(CURDATE()), 1)
        AND t.fecha_reporte < MAKEDATE(YEAR(CURDATE()) + 1, 1)
        AND (UPPER(TRIM(t.proyecto)) = UPPER(TRIM(?)) OR t.codigo_equipo IN (
          SELECT numero_equipo FROM portafolio WHERE ${filtroVisibleSubquery} AND UPPER(TRIM(proyecto)) = UPPER(TRIM(?))
        ))
    `, [proyecto, proyecto]);
    Object.assign(projectMetrics, callMetricsRows[0] || {});

    const [criticalRows] = await db.query(`
      SELECT COUNT(*) AS equipos_criticos_anio
      FROM (
        SELECT t.codigo_equipo
        FROM tickets t
        WHERE t.fecha_reporte >= MAKEDATE(YEAR(CURDATE()), 1)
          AND t.fecha_reporte < MAKEDATE(YEAR(CURDATE()) + 1, 1)
          AND UPPER(TRIM(COALESCE(t.responsabilidad,''))) = 'BLT'
          AND t.codigo_equipo IN (
            SELECT numero_equipo FROM portafolio WHERE ${filtroVisibleSubquery} AND UPPER(TRIM(proyecto)) = UPPER(TRIM(?))
          )
        GROUP BY t.codigo_equipo
        HAVING COUNT(*) >= 3
      ) critical
    `, [proyecto]);
    projectMetrics.equipos_criticos_anio = Number(criticalRows[0]?.equipos_criticos_anio || 0);

    const [responsibilityDistribution] = await db.query(`
      SELECT
        CASE
          WHEN UPPER(TRIM(COALESCE(t.responsabilidad,''))) = 'BLT' THEN 'Resp. BLT'
          WHEN UPPER(TRIM(COALESCE(t.responsabilidad,''))) = 'CLIENTE' THEN 'Resp. Cliente'
          ELSE 'Sin Responsable'
        END AS label,
        COUNT(*) AS total
      FROM tickets t
      WHERE t.fecha_reporte >= MAKEDATE(YEAR(CURDATE()), 1)
        AND t.fecha_reporte < MAKEDATE(YEAR(CURDATE()) + 1, 1)
        AND (UPPER(TRIM(t.proyecto)) = UPPER(TRIM(?)) OR t.codigo_equipo IN (
          SELECT numero_equipo FROM portafolio WHERE ${filtroVisibleSubquery} AND UPPER(TRIM(proyecto)) = UPPER(TRIM(?))
        ))
      GROUP BY label
      ORDER BY total DESC
    `, [proyecto, proyecto]);

    const [equipmentResponsibilityDistribution] = await db.query(`
      SELECT
        COALESCE(NULLIF(TRIM(eq.identificacion_sitio), ''), t.codigo_equipo) AS label,
        t.codigo_equipo,
        UPPER(TRIM(t.responsabilidad)) AS responsabilidad,
        COUNT(*) AS total
      FROM tickets t
      LEFT JOIN (
        SELECT
          numero_equipo,
          MAX(NULLIF(TRIM(identificacion_sitio), '')) AS identificacion_sitio
        FROM portafolio
        WHERE ${filtroVisibleSubquery}
          AND UPPER(TRIM(proyecto)) = UPPER(TRIM(?))
        GROUP BY numero_equipo
      ) eq ON eq.numero_equipo = t.codigo_equipo
      WHERE t.fecha_reporte >= MAKEDATE(YEAR(CURDATE()), 1)
        AND t.fecha_reporte < MAKEDATE(YEAR(CURDATE()) + 1, 1)
        AND UPPER(TRIM(COALESCE(t.responsabilidad,''))) IN ('BLT','CLIENTE')
        AND t.codigo_equipo IN (
          SELECT numero_equipo FROM portafolio WHERE ${filtroVisibleSubquery} AND UPPER(TRIM(proyecto)) = UPPER(TRIM(?))
        )
      GROUP BY t.codigo_equipo, eq.identificacion_sitio, UPPER(TRIM(t.responsabilidad))
      ORDER BY total DESC, label ASC
    `, [proyecto, proyecto]);

    const proyectoDecorado = decorateProyectoRow({
      ...proyectos[0],
      nombre_publico: nombrePublico,
      proyecto_busqueda: proyecto
    });
    proyectoDecorado.nombre_publico = nombrePublico;
    proyectoDecorado.proyecto_nombre = nombrePublico || proyectoDecorado.proyecto_nombre;
    proyectoDecorado.proyecto_busqueda = proyecto;

    const equiposDecorados = equipos.map(row => ({
      ...decorateProyectoRow(row),
      nombre_publico: nombrePublico,
      proyecto_nombre: nombrePublico || row.proyecto_nombre,
      proyecto_busqueda: proyecto
    }));

    return res.json({
      ok: true,
      source: 'aiven-portafolio',
      origen: 'PORTAFOLIO',
      equivalencia: equivalencia.equivalencia ? {
        proyecto_corellian: equivalencia.equivalencia.proyecto_corellian,
        proyecto_united: equivalencia.equivalencia.proyecto_united
      } : null,
      proyecto: proyectoDecorado,
      equipos: equiposDecorados,
      tickets,
      ticket_years: ticketYears.map(row => Number(row.anio)).filter(Boolean),
      ticket_year_selected: anioTickets,
      monthly_current: monthlyCurrent,
      monthly_previous: monthlyPrevious,
      responsabilidad,
      project_metrics: projectMetrics,
      project_distributions: {
        total_responsabilidad: responsibilityDistribution,
        blt_por_equipo: equipmentResponsibilityDistribution.filter(row => row.responsabilidad === 'BLT'),
        cliente_por_equipo: equipmentResponsibilityDistribution.filter(row => row.responsabilidad === 'CLIENTE')
      }
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Error consultando detalle de proyecto.', error: error.message });
  }
}

async function getPortafolioProyectoDetalle(req, res) {
  req.query = Object.assign({}, req.query, { origen: 'portafolio' });
  return getProyectoDetalle(req, res);
}

module.exports = {
  getProyectosFiltros,
  getProyectos,
  getProyectoDetalle,
  getPortafolioProyectoDetalle
};

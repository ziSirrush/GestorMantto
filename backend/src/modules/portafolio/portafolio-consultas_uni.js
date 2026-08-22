'use strict';

const db = require('../../config/db');
const {
  buildPortafolioScopeSql_gnral
} = require('../../services/information-record-scope-gnral.service');

function likeParam_uni(value) {
  const text = String(value || '').trim();
  return text ? `%${text}%` : null;
}

function normalizeText_uni(value) {
  return String(value == null ? '' : value).trim();
}

function normalizeUpper_uni(value) {
  return normalizeText_uni(value).toUpperCase();
}

function dateValue_uni(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function yearOf_uni(value) {
  const date = dateValue_uni(value);
  return date ? date.getFullYear() : null;
}

function monthKey_uni(value) {
  const date = dateValue_uni(value);
  if (!date) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function round1_uni(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function uniqueText_uni(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(normalizeText_uni)
    .filter(Boolean))];
}

function formatProyectoNombre_uni(value) {
  const raw = normalizeText_uni(value);
  const match = raw.match(/^(\d+)-(\d{2})-(\d{2})(?:T.*)?$/);
  if (!match) return raw;
  const numero = String(Number(match[1]) || match[1].replace(/^0+/, '') || match[1]);
  const meses = {
    '01': 'Enero', '02': 'Febrero', '03': 'Marzo', '04': 'Abril',
    '05': 'Mayo', '06': 'Junio', '07': 'Julio', '08': 'Agosto',
    '09': 'Septiembre', '10': 'Octubre', '11': 'Noviembre', '12': 'Diciembre'
  };
  const mes = meses[match[2]] || match[2];
  const dia = String(Number(match[3]) || match[3]);
  return `${dia} de ${mes} #${numero}`;
}

function decorateProyectoRow_uni(row) {
  if (!row) return row;
  const codigo = row.proyecto_codigo || row.proyecto;
  const rawNombre = row.nombre_publico || row.proyecto_nombre || row.proyecto_cc_x_port || codigo;
  return {
    ...row,
    proyecto_codigo: codigo,
    proyecto_nombre: row.nombre_publico || formatProyectoNombre_uni(rawNombre || codigo)
  };
}

async function resolveProyectoEquivalencia_uni(proyecto) {
  const value = normalizeText_uni(proyecto);
  if (!value) return { proyecto_busqueda: value, nombre_publico: value, equivalencia: null };

  const [rows] = await db.query(`
    SELECT proyecto_corellian, proyecto_united, nombre_publico
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

function getCriticidadCriteria_uni(req) {
  const userFallas = Number(req.user && req.user.criticos_fallas) || 3;
  const userPeriodo = Number(req.user && req.user.criticos_periodo) || 35;
  const positive = (value, fallback, min, max) => {
    const n = Number.parseInt(value, 10);
    if (Number.isNaN(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  };
  return {
    dias: positive(req.query.dias || req.query.periodo || req.query.criticos_periodo, userPeriodo, 1, 3650),
    minFallas: positive(req.query.min_fallas || req.query.minFallas || req.query.fallas || req.query.criticos_fallas, userFallas, 1, 9999)
  };
}


function filtroProyectoCobranza_uni(alias, idProyectoCobranza, proyecto) {
  const clauses = [];
  const params = [];
  const id = Number(idProyectoCobranza);

  if (id > 0) {
    clauses.push(`${alias}.id_proyecto_cobranza = ?`);
    params.push(id);
  }

  const raw = String(proyecto || '').trim();
  if (raw) {
    clauses.push(`LOWER(TRIM(COALESCE(${alias}.proyecto, ''))) = LOWER(TRIM(?))`);
    params.push(raw);

    const normalized = raw
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/,/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const monthNames = {
      enero: 1, ene: 1, january: 1, jan: 1,
      febrero: 2, feb: 2, february: 2,
      marzo: 3, mar: 3, march: 3,
      abril: 4, abr: 4, april: 4, apr: 4,
      mayo: 5, may: 5,
      junio: 6, jun: 6, june: 6,
      julio: 7, jul: 7, july: 7,
      agosto: 8, ago: 8, august: 8, aug: 8,
      septiembre: 9, setiembre: 9, sep: 9, sept: 9, september: 9,
      octubre: 10, oct: 10, october: 10,
      noviembre: 11, nov: 11, november: 11,
      diciembre: 12, dic: 12, dec: 12, december: 12
    };

    const validParts = (numero, mes, dia) => {
      const project = Number(numero);
      const month = Number(mes);
      const day = Number(dia);
      if (!Number.isInteger(project) || project < 0) return false;
      if (!Number.isInteger(month) || month < 1 || month > 12) return false;
      if (!Number.isInteger(day) || day < 1 || day > 31) return false;
      const daysByMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      return day <= daysByMonth[month - 1];
    };

    let parts = null;
    let match = normalized.match(/^(\d{1,6})\s*([\/.-])\s*(\d{1,2})\s*\2\s*(\d{1,6})(?:[t\s].*)?$/);
    if (match) {
      const a = Number(match[1]);
      const b = Number(match[3]);
      const c = Number(match[4]);
      if (validParts(a, b, c)) parts = { numero: a, mes: b, dia: c };
      else if (validParts(c, b, a)) parts = { numero: c, mes: b, dia: a };
      else if (validParts(c, a, b)) parts = { numero: c, mes: a, dia: b };
    }

    if (!parts) {
      match = normalized.match(/^(\d{1,2})\s+(?:de\s+)?([a-z]+)\s+(?:de\s+)?#?(\d{1,6})$/);
      if (match) {
        const month = monthNames[match[2]];
        if (month && validParts(match[3], month, match[1])) {
          parts = { numero: Number(match[3]), mes: month, dia: Number(match[1]) };
        }
      }
    }

    if (!parts) {
      match = normalized.match(/^([a-z]+)\s+(\d{1,2})\s+#?(\d{1,6})$/);
      if (match) {
        const month = monthNames[match[1]];
        if (month && validParts(match[3], month, match[2])) {
          parts = { numero: Number(match[3]), mes: month, dia: Number(match[2]) };
        }
      }
    }

    if (parts) {
      const numero = String(Number(parts.numero));
      const numero4 = numero.padStart(4, '0');
      const mes = String(Number(parts.mes)).padStart(2, '0');
      const dia = String(Number(parts.dia)).padStart(2, '0');
      const prefixes = Array.from(new Set([
        `${numero}-${mes}-${dia}`,
        `${numero4}-${mes}-${dia}`
      ]));

      prefixes.forEach(prefix => {
        clauses.push(`LOWER(TRIM(COALESCE(${alias}.proyecto, ''))) LIKE LOWER(?)`);
        params.push(prefix + '%');
      });
    }
  }

  return {
    sql: clauses.length ? `(${clauses.join(' OR ')})` : '1 = 0',
    params
  };
}

function scope_uni(req, alias = 'p') {
  return buildPortafolioScopeSql_gnral(req, alias);
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

const portafolioBaseSelect_uni = `
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

function activePortfolioClauses_uni(req, alias = 'p', { includeInactive = false } = {}) {
  const access = scope_uni(req, alias);
  const clauses = [`${alias}.estado_registro = 1`, access.sql];
  if (!includeInactive) {
    clauses.push(`(${alias}.inactivo IS NULL OR UPPER(${alias}.inactivo) NOT IN ('SI','SÍ','1','TRUE','INACTIVO'))`);
  }
  return { clauses, params: [...(access.params || [])] };
}

async function getPortafolioFiltros_uni(req, res) {
  try {
    const base = activePortfolioClauses_uni(req, 'p', { includeInactive: true });
    const where = base.clauses.join(' AND ');
    const [zonas] = await db.query(`
      SELECT DISTINCT p.zona_operativa AS value
      FROM portafolio p
      WHERE ${where}
        AND p.zona_operativa IS NOT NULL
        AND p.zona_operativa <> ''
      ORDER BY p.zona_operativa ASC
    `, base.params);
    const [supervisores] = await db.query(`
      SELECT DISTINCT p.supervisor_zona AS value
      FROM portafolio p
      WHERE ${where}
        AND p.supervisor_zona IS NOT NULL
        AND p.supervisor_zona <> ''
      ORDER BY p.supervisor_zona ASC
    `, base.params);
    const [tipos] = await db.query(`
      SELECT DISTINCT COALESCE(lt.tipo_equipo, p.id_equipo_ns, 'Sin tipo') AS value
      FROM portafolio p
      ${latestTicketJoin_uni}
      WHERE ${where}
        AND COALESCE(lt.tipo_equipo, p.id_equipo_ns, 'Sin tipo') IS NOT NULL
        AND COALESCE(lt.tipo_equipo, p.id_equipo_ns, 'Sin tipo') <> ''
      ORDER BY value ASC
    `, base.params);

    return res.json({
      ok: true,
      source: 'aiven',
      filters: {
        zonas: zonas.map(row => row.value).filter(Boolean),
        supervisores: supervisores.map(row => row.value).filter(Boolean),
        tipos: tipos.map(row => row.value).filter(Boolean)
      }
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Error consultando filtros de portafolio.', error: error.message });
  }
}

async function getPortafolioMovimientos_uni(req, res) {
  try {
    const [cols] = await db.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'portafolio'
        AND COLUMN_NAME IN ('estatus_ul_mes','estatus_ul_mes_fecha')
    `);
    const available = new Set(cols.map(row => row.COLUMN_NAME));
    if (!available.has('estatus_ul_mes')) {
      return res.json({
        ok: true,
        source: 'aiven',
        warning: 'Movimientos pendiente: la tabla portafolio no tiene estatus_ul_mes para comparar contra el corte mensual.',
        kpis: { total: 0, degradados: 0, recuperados: 0, cambios: 0 },
        corte: null,
        filters: { zonas: [] },
        data: []
      });
    }

    const access = scope_uni(req, 'p');
    const params = [...(access.params || [])];
    const clauses = [
      'p.estado_registro = 1',
      `(p.inactivo IS NULL OR UPPER(p.inactivo) NOT IN ('SI','SÍ','1','TRUE','INACTIVO'))`,
      access.sql,
      'p.estatus_ul_mes IS NOT NULL',
      "TRIM(p.estatus_ul_mes) <> ''",
      'p.estatus_servicio IS NOT NULL',
      "TRIM(p.estatus_servicio) <> ''",
      'LOWER(TRIM(p.estatus_ul_mes)) <> LOWER(TRIM(p.estatus_servicio))'
    ];

    const zona = likeParam_uni(req.query.zona);
    const search = likeParam_uni(req.query.search || req.query.buscar);
    const tipo = normalizeUpper_uni(req.query.tipo);
    if (zona) { clauses.push('p.zona_operativa LIKE ?'); params.push(zona); }
    if (search) {
      clauses.push(`(
        p.numero_equipo LIKE ?
        OR p.proyecto LIKE ?
        OR p.proyecto_cc_x_port LIKE ?
        OR p.ciudad LIKE ?
        OR p.estado LIKE ?
        OR p.identificacion_sitio LIKE ?
        OR p.supervisor_zona LIKE ?
      )`);
      params.push(search, search, search, search, search, search, search);
    }

    const tipoExpr = `CASE
      WHEN LOWER(TRIM(p.estatus_ul_mes)) IN ('en servicio','servicio')
        AND LOWER(TRIM(p.estatus_servicio)) NOT IN ('en servicio','servicio') THEN 'DEGRADADO'
      WHEN LOWER(TRIM(p.estatus_ul_mes)) NOT IN ('en servicio','servicio')
        AND LOWER(TRIM(p.estatus_servicio)) IN ('en servicio','servicio') THEN 'RECUPERADO'
      ELSE 'CAMBIO'
    END`;
    if (['DEGRADADO', 'RECUPERADO', 'CAMBIO'].includes(tipo)) {
      clauses.push(`${tipoExpr} = ?`);
      params.push(tipo);
    }

    const fechaCorteExpr = available.has('estatus_ul_mes_fecha') ? 'p.estatus_ul_mes_fecha' : 'NULL';
    const where = clauses.join(' AND ');
    const [rows] = await db.query(`
      SELECT
        p.id_portafolio,
        p.numero_equipo,
        p.proyecto,
        p.proyecto AS proyecto_codigo,
        COALESCE(NULLIF(TRIM(p.proyecto_cc_x_port), ''), p.proyecto) AS proyecto_nombre,
        p.ciudad,
        p.estado,
        p.identificacion_sitio,
        p.zona_id,
        p.zona_operativa AS zona,
        p.supervisor_zona AS supervisor,
        p.superintendente,
        p.estatus_ul_mes AS estatus_anterior,
        p.estatus_servicio AS estatus_actual,
        ${fechaCorteExpr} AS fecha_corte,
        ${tipoExpr} AS tipo_movimiento
      FROM portafolio p
      WHERE ${where}
      ORDER BY tipo_movimiento ASC, p.zona_operativa ASC, p.proyecto ASC, p.numero_equipo ASC
      LIMIT 1000
    `, params);

    const zoneScope = scope_uni(req, 'p');
    const [zonas] = await db.query(`
      SELECT DISTINCT p.zona_operativa AS value
      FROM portafolio p
      WHERE p.estado_registro = 1
        AND ${zoneScope.sql}
        AND p.zona_operativa IS NOT NULL
        AND p.zona_operativa <> ''
      ORDER BY p.zona_operativa ASC
    `, zoneScope.params || []);

    const kpis = rows.reduce((acc, row) => {
      acc.total += 1;
      if (row.tipo_movimiento === 'DEGRADADO') acc.degradados += 1;
      else if (row.tipo_movimiento === 'RECUPERADO') acc.recuperados += 1;
      else acc.cambios += 1;
      return acc;
    }, { total: 0, degradados: 0, recuperados: 0, cambios: 0 });

    const corte = rows.map(row => row.fecha_corte).filter(Boolean).sort().pop() || null;
    return res.json({
      ok: true,
      source: 'aiven',
      kpis,
      corte,
      filters: { zonas: zonas.map(row => row.value).filter(Boolean) },
      data: rows.map(decorateProyectoRow_uni)
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error consultando movimientos de portafolio.',
      error: error.message
    });
  }
}

async function getPortafolioMovimientoDetalle_uni(req, res) {
  const codigo = normalizeText_uni(req.params.codigo);
  if (!codigo) return res.status(400).json({ ok: false, message: 'No se recibio numero de equipo.' });

  try {
    const access = scope_uni(req, 'p');
    const [equipos] = await db.query(`
      SELECT
        ${portafolioBaseSelect_uni},
        p.estatus_ul_mes,
        p.estatus_ul_mes_fecha,
        CASE
          WHEN LOWER(TRIM(COALESCE(p.estatus_ul_mes,''))) IN ('en servicio','servicio')
            AND LOWER(TRIM(COALESCE(p.estatus_servicio,''))) NOT IN ('en servicio','servicio') THEN 'DEGRADADO'
          WHEN LOWER(TRIM(COALESCE(p.estatus_ul_mes,''))) NOT IN ('en servicio','servicio')
            AND LOWER(TRIM(COALESCE(p.estatus_servicio,''))) IN ('en servicio','servicio') THEN 'RECUPERADO'
          ELSE 'CAMBIO'
        END AS tipo_movimiento
      FROM portafolio p
      ${latestTicketJoin_uni}
      WHERE p.numero_equipo = ?
        AND ${access.sql}
      LIMIT 1
    `, [codigo, ...(access.params || [])]);

    if (!equipos.length) return res.status(404).json({ ok: false, message: 'Equipo no encontrado en portafolio.' });
    const equipo = decorateProyectoRow_uni(equipos[0]);

    let proyecto = null;
    if (equipo.proyecto) {
      const projectScope = scope_uni(req, 'p');
      const [proyectos] = await db.query(`
        SELECT
          p.proyecto,
          p.proyecto AS proyecto_codigo,
          COALESCE(NULLIF(MAX(TRIM(p.proyecto_cc_x_port)), ''), p.proyecto) AS proyecto_nombre,
          MAX(p.ciudad) AS ciudad,
          MAX(p.estado) AS estado,
          GROUP_CONCAT(DISTINCT NULLIF(TRIM(p.zona_operativa), '') ORDER BY p.zona_operativa SEPARATOR ' / ') AS zona,
          GROUP_CONCAT(DISTINCT NULLIF(TRIM(p.supervisor_zona), '') ORDER BY p.supervisor_zona SEPARATOR ' / ') AS supervisor,
          GROUP_CONCAT(DISTINCT NULLIF(TRIM(p.superintendente), '') ORDER BY p.superintendente SEPARATOR ' / ') AS superintendente,
          COUNT(*) AS equipos,
          SUM(CASE WHEN UPPER(COALESCE(p.estatus_servicio,'')) LIKE '%NO EN SERVICIO%' THEN 1 ELSE 0 END) AS no_en_servicio,
          SUM(CASE WHEN LOWER(TRIM(COALESCE(p.estatus_servicio,''))) IN ('en servicio','servicio') THEN 1 ELSE 0 END) AS en_servicio
        FROM portafolio p
        WHERE p.estado_registro = 1
          AND (p.inactivo IS NULL OR UPPER(p.inactivo) NOT IN ('SI','SÍ','1','TRUE','INACTIVO'))
          AND ${projectScope.sql}
          AND p.proyecto = ?
        GROUP BY p.proyecto
        LIMIT 1
      `, [...(projectScope.params || []), equipo.proyecto]);
      proyecto = proyectos[0] ? decorateProyectoRow_uni(proyectos[0]) : null;
    }

    // Tickets de este detalle pertenecen al equipo previamente validado por cuarto.
    // La autorizacion funcional propia de Tickets se revisa en la fase dedicada a Tickets.
    const [tickets] = await db.query(`
      SELECT
        t.ticket,
        t.codigo_equipo,
        t.equipo,
        t.folio,
        t.estado_ticket,
        t.estado,
        t.proyecto,
        t.descripcion,
        t.fecha_reporte,
        t.fecha_cierre,
        t.responsabilidad,
        t.causa_falla,
        t.causa,
        t.tiempo_llegada,
        t.tiempo_solucion,
        t.estatus_equipo_final
      FROM tickets t
      WHERE t.codigo_equipo = ?
      ORDER BY t.fecha_reporte DESC, t.id DESC
      LIMIT 300
    `, [codigo]);

    return res.json({
      ok: true,
      source: 'aiven',
      data: { equipo, proyecto, tickets: tickets.map(decorateProyectoRow_uni) }
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Error consultando detalle de movimiento de portafolio.', error: error.message });
  }
}

function durationHours_uni(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = String(value).trim();
  const numeric = Number(text.replace(',', '.'));
  if (Number.isFinite(numeric)) return numeric;
  const match = text.match(/^(\d+):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  return Number(match[1]) + Number(match[2]) / 60 + Number(match[3] || 0) / 3600;
}

function average_uni(values) {
  const nums = values.filter(value => value !== null && Number.isFinite(value));
  return nums.length ? round1_uni(nums.reduce((sum, value) => sum + value, 0) / nums.length) : null;
}

function localDateKey_uni(date) {
  const value = new Date(date);
  return value.getFullYear() + '-' + String(value.getMonth() + 1).padStart(2, '0') + '-' + String(value.getDate()).padStart(2, '0');
}

async function getPortafolioEquipoDetalle_uni(req, res) {
  const rawCodigo = normalizeText_uni(req.params.codigo);
  if (!rawCodigo) {
    return res.status(400).json({ ok: false, message: 'No se recibio numero de equipo o referencia en sitio.' });
  }

  // La llave compuesta proyecto|||referencia_sitio pertenece al detalle
  // CORELLIAN. Se conserva el handler existente y su motor propio.
  if (rawCodigo.includes('|||')) {
    const legacyController = require('../../controllers/data.controller');
    return legacyController.getPortafolioEquipoDetalle(req, res);
  }

  try {
    const access = scope_uni(req, 'p');
    const [rows] = await db.query(`
      SELECT ${portafolioBaseSelect_uni}
      FROM portafolio p
      ${latestTicketJoin_uni}
      WHERE TRIM(COALESCE(p.numero_equipo, '')) = TRIM(?)
        AND ${access.sql}
      ORDER BY p.id_portafolio DESC
      LIMIT 1
    `, [rawCodigo, ...(access.params || [])]);

    const mantenimiento = rows[0] || null;
    if (!mantenimiento) {
      return res.status(404).json({ ok: false, message: 'Equipo no encontrado en Portafolio dentro de los cuartos autorizados.' });
    }

    const anioRaw = Number.parseInt(req.query.anio_tickets, 10);
    const anio = Number.isInteger(anioRaw) && anioRaw >= 2000 && anioRaw <= 2100
      ? anioRaw
      : new Date().getFullYear();

    // Tickets se limitan al equipo que ya paso el filtro territorial UNITED.
    // La fase dedicada a Tickets agregara su validacion funcional propia.
    const [allTickets] = await db.query(`
      SELECT *
      FROM tickets
      WHERE TRIM(COALESCE(codigo_equipo, '')) = TRIM(?)
      ORDER BY fecha_reporte DESC, id DESC
    `, [mantenimiento.numero_equipo]);

    const tickets = allTickets.filter(ticket => yearOf_uni(ticket.fecha_reporte) === anio);
    const ticketYears = [...new Set(allTickets.map(ticket => yearOf_uni(ticket.fecha_reporte)).filter(Boolean))].sort((a, b) => b - a);

    const normalizeBlob = ticket => normalizeUpper_uni([
      ticket.descripcion,
      ticket.asunto,
      ticket.causa,
      ticket.causa_falla,
      ticket.accion_en_cierre
    ].filter(Boolean).join(' '));
    const status = ticket => normalizeUpper_uni(ticket.estado_ticket || ticket.estado);
    const isClosed = ticket => status(ticket).includes('CERR');
    const isOpen = ticket => status(ticket).includes('ABIER');
    const isInProgress = ticket => !isClosed(ticket) && !isOpen(ticket);
    const hasAny = (ticket, words) => words.some(word => normalizeBlob(ticket).includes(word));
    const isBlt = ticket => normalizeUpper_uni(ticket.responsabilidad).includes('BLT');
    const isClient = ticket => normalizeUpper_uni(ticket.responsabilidad).includes('CLIENTE');

    const now = new Date();
    const currentYear = now.getFullYear();
    const yearStart = new Date(currentYear, 0, 1);
    const nextYear = new Date(currentYear + 1, 0, 1);
    const elapsedYearDays = Math.max(1, Math.floor((now - yearStart) / 86400000) + 1);
    const u365Start = new Date(now);
    u365Start.setDate(u365Start.getDate() - 365);

    const currentYearTickets = allTickets.filter(ticket => {
      const date = dateValue_uni(ticket.fecha_reporte);
      return date && date >= yearStart && date < nextYear;
    });
    const currentYearBlt = currentYearTickets.filter(isBlt);
    const u365Blt = allTickets.filter(ticket => {
      const date = dateValue_uni(ticket.fecha_reporte);
      return date && date >= u365Start && date <= now && isBlt(ticket);
    });

    const metrics = {
      cerrados: currentYearTickets.filter(isClosed).length,
      en_curso: currentYearTickets.filter(isInProgress).length,
      abiertos: currentYearTickets.filter(isOpen).length,
      filtracion: currentYearTickets.filter(ticket => hasAny(ticket, ['FILTRACION', 'FILTRACIÓN', 'AGUA', 'INUNDACION', 'INUNDACIÓN', 'GOTERA'])).length,
      atrapados: currentYearTickets.filter(ticket => hasAny(ticket, ['ATRAPADO', 'ATRAPADA', 'ENCERRADO', 'ENCERRADA', 'RESCATE'])).length,
      voltaje: currentYearTickets.filter(ticket => hasAny(ticket, ['VOLTAJE', 'FALLA ELECTRICA', 'FALLA ELÉCTRICA', 'SIN ENERGIA', 'SIN ENERGÍA', 'APAGON', 'APAGÓN'])).length,
      en_sla: currentYearTickets.filter(ticket => {
        const llegada = durationHours_uni(ticket.tiempo_llegada);
        const solucion = durationHours_uni(ticket.tiempo_solucion);
        return llegada !== null && solucion !== null && llegada <= 4 && solucion <= 24;
      }).length,
      promedio_llegada: average_uni(currentYearTickets.map(ticket => durationHours_uni(ticket.tiempo_llegada))),
      promedio_solucion: average_uni(currentYearTickets.map(ticket => durationHours_uni(ticket.tiempo_solucion))),
      tickets_anio: currentYearTickets.length,
      resp_blt_anio: currentYearBlt.length,
      resp_cliente_anio: currentYearTickets.filter(isClient).length,
      sin_responsabilidad_anio: currentYearTickets.filter(ticket => !isBlt(ticket) && !isClient(ticket)).length,
      mtbc_anio: mtbcFromTickets_uni(currentYearBlt, elapsedYearDays),
      mtbc_u365: mtbcFromTickets_uni(u365Blt, 365)
    };

    const monthlyCurrent = new Map(
      Array.from({ length: 12 }, (_, index) => [`${currentYear}-${String(index + 1).padStart(2, '0')}`, 0])
    );
    const monthlyU365 = new Map();
    for (const ticket of currentYearBlt) {
      const month = monthKey_uni(ticket.fecha_reporte);
      if (month) monthlyCurrent.set(month, (monthlyCurrent.get(month) || 0) + 1);
    }
    for (const ticket of u365Blt) {
      const month = monthKey_uni(ticket.fecha_reporte);
      if (month) monthlyU365.set(month, (monthlyU365.get(month) || 0) + 1);
    }

    return res.json({
      ok: true,
      source: 'aiven-portafolio',
      data: mantenimiento,
      mantenimiento,
      instalaciones: [],
      tickets,
      ticket_years: ticketYears,
      ticket_year_selected: anio,
      u365_desde: localDateKey_uni(u365Start),
      u365_hasta: localDateKey_uni(now),
      metrics,
      fallas_blt_mes_anio: [...monthlyCurrent.entries()].map(([mes, total]) => ({ mes, total })).sort((a, b) => a.mes.localeCompare(b.mes)),
      fallas_blt_mes_u365: [...monthlyU365.entries()].map(([mes, total]) => ({ mes, total })).sort((a, b) => a.mes.localeCompare(b.mes))
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Error consultando detalle de equipo.', error: error.message });
  }
}

async function getPortafolio_uni(req, res) {
  try {
    const access = scope_uni(req, 'p');
    const [rows] = await db.query(`
      SELECT p.*
      FROM portafolio p
      WHERE ${access.sql}
      LIMIT 50000
    `, access.params || []);
    return res.json({ ok: true, source: 'portafolio', data: rows });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Error consultando portafolio.', error: error.message });
  }
}

async function getEquipos_uni(req, res) {
  return getPortafolio_uni(req, res);
}

function mtbcFromTickets_uni(tickets, periodDays) {
  const dates = (Array.isArray(tickets) ? tickets : [])
    .map(ticket => dateValue_uni(ticket.fecha_reporte))
    .filter(Boolean)
    .sort((left, right) => left - right);
  if (!dates.length) return null;
  if (dates.length === 1) return periodDays;
  return round1_uni((dates[dates.length - 1] - dates[0]) / 86400000 / (dates.length - 1));
}

function projectTicketMetrics_uni(allTickets, equipmentRows, criteria) {
  const now = new Date();
  const year = now.getFullYear();
  const yearStart = new Date(year, 0, 1);
  const nextYear = new Date(year + 1, 0, 1);
  const u365Start = new Date(now);
  u365Start.setDate(u365Start.getDate() - 365);
  const criticalStart = new Date(now);
  criticalStart.setDate(criticalStart.getDate() - criteria.dias);
  const elapsedYearDays = Math.max(1, Math.floor((now - yearStart) / 86400000) + 1);

  const byEquipment = new Map();
  for (const row of equipmentRows) {
    const code = normalizeText_uni(row.numero_equipo);
    if (code) byEquipment.set(code, []);
  }
  for (const ticket of allTickets) {
    const code = normalizeText_uni(ticket.codigo_equipo);
    if (byEquipment.has(code)) byEquipment.get(code).push(ticket);
  }

  const criticalCodes = new Set();
  for (const row of equipmentRows) {
    const code = normalizeText_uni(row.numero_equipo);
    const tickets = byEquipment.get(code) || [];
    const yearTickets = tickets.filter(ticket => {
      const date = dateValue_uni(ticket.fecha_reporte);
      return date && date >= yearStart && date < nextYear;
    });
    const bltYear = yearTickets.filter(ticket => normalizeUpper_uni(ticket.responsabilidad).includes('BLT'));
    const clientYear = yearTickets.filter(ticket => normalizeUpper_uni(ticket.responsabilidad).includes('CLIENTE'));
    const blt365 = tickets.filter(ticket => {
      const date = dateValue_uni(ticket.fecha_reporte);
      return date && date >= u365Start && date <= now && normalizeUpper_uni(ticket.responsabilidad).includes('BLT');
    });
    const criticalEligible = !['SI', 'SÍ', '1', 'TRUE', 'INACTIVO'].includes(normalizeUpper_uni(row.inactivo))
      && !normalizeUpper_uni(row.estatus_servicio).includes('NO EN SERVICIO');
    const bltCritical = criticalEligible ? tickets.filter(ticket => {
      const date = dateValue_uni(ticket.fecha_reporte);
      return date && date >= criticalStart && date <= now && normalizeUpper_uni(ticket.responsabilidad).includes('BLT');
    }) : [];
    if (bltCritical.length >= criteria.minFallas) criticalCodes.add(code);

    row.fallas_blt_anio = bltYear.length;
    row.ultimo_blt = bltYear.map(ticket => ticket.fecha_reporte).filter(Boolean).sort().pop() || null;
    row.resp_cliente_anio = clientYear.length;
    row.ultimo_cliente = tickets
      .filter(ticket => normalizeUpper_uni(ticket.responsabilidad).includes('CLIENTE'))
      .map(ticket => ticket.fecha_reporte)
      .filter(Boolean)
      .sort()
      .pop() || null;
    row.mtbc_anio = mtbcFromTickets_uni(bltYear, elapsedYearDays);
    row.mtbc_365 = mtbcFromTickets_uni(blt365, 365);
    row.es_critico_periodo = criticalCodes.has(code) ? 1 : 0;
  }

  return { byEquipment, criticalCodes, year, yearStart, nextYear, u365Start, now };
}

function groupedCounts_uni(rows, selector) {
  const map = new Map();
  for (const row of rows) {
    const key = selector(row);
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()].map(([key, total]) => ({ key, total }));
}

function projectHeaderFromEquipment_uni(project, equipmentRows, publicName, projectCode) {
  const zones = uniqueText_uni(equipmentRows.map(row => row.zona || row.zona_operativa));
  const supervisors = uniqueText_uni(equipmentRows.map(row => row.supervisor || row.supervisor_zona));
  const supers = uniqueText_uni(equipmentRows.map(row => row.superintendente));
  const statuses = uniqueText_uni(equipmentRows.map(row => row.estatus_servicio));
  const dates = field => equipmentRows.map(row => dateValue_uni(row[field])).filter(Boolean).sort((a, b) => a - b);
  const firstDate = field => dates(field)[0] || null;
  const lastDate = field => {
    const values = dates(field);
    return values.length ? values[values.length - 1] : null;
  };
  const parados = equipmentRows.filter(row => {
    const value = normalizeUpper_uni(row.estado_operativo || row.ultimo_estatus_equipo_final);
    return value.includes('PARAD') || value.includes('NO FUNC');
  }).length;
  const mtbcValues = equipmentRows.map(row => Number(row.mtbc_365)).filter(Number.isFinite);

  const decorated = decorateProyectoRow_uni({
    ...project,
    proyecto: projectCode,
    proyecto_codigo: projectCode,
    nombre_publico: publicName,
    proyecto_nombre: publicName || project?.proyecto_nombre || projectCode,
    ciudad: uniqueText_uni(equipmentRows.map(row => row.ciudad))[0] || project?.ciudad || null,
    estado: uniqueText_uni(equipmentRows.map(row => row.estado))[0] || project?.estado || null,
    estatus_servicio: statuses.join(' / ') || null,
    zona: zones.join(' / ') || null,
    zona_operativa: zones.join(' / ') || null,
    direccion: uniqueText_uni(equipmentRows.map(row => row.direccion))[0] || project?.direccion || null,
    fecha_instalacion: firstDate('fecha_instalacion'),
    fecha_entrega: firstDate('fecha_entrega'),
    termino_garantia: lastDate('termino_garantia'),
    fecha_recepcion_mantenimiento: firstDate('fecha_recepcion_mantenimiento'),
    fecha_ingreso_portafolio: firstDate('fecha_ingreso_portafolio'),
    mes_inicio_gratuitos: uniqueText_uni(equipmentRows.map(row => row.mes_inicio_gratuitos)).sort().pop() || null,
    mes_termino_gratuitos: uniqueText_uni(equipmentRows.map(row => row.mes_termino_gratuitos)).sort().pop() || null,
    mes_objetivo_inicio_cobranza: uniqueText_uni(equipmentRows.map(row => row.mes_objetivo_inicio_cobranza)).sort().pop() || null,
    superintendente: supers.join(' / ') || null,
    supervisor: supervisors.join(' / ') || null,
    supervisor_zona: supervisors.join(' / ') || null,
    equipos: equipmentRows.length,
    parados,
    mtbc_365: mtbcValues.length ? Math.round(mtbcValues.reduce((sum, value) => sum + value, 0) / mtbcValues.length) : null
  });
  decorated.nombre_publico = publicName;
  decorated.proyecto_nombre = publicName || decorated.proyecto_nombre;
  decorated.proyecto_busqueda = projectCode;
  return decorated;
}

async function loadCobranzaSummary_uni(idProyectoCobranza, proyecto) {
  const gc = filtroProyectoCobranza_uni('gc', idProyectoCobranza, proyecto);
  const mp = filtroProyectoCobranza_uni('mp', idProyectoCobranza, proyecto);
  const va = filtroProyectoCobranza_uni('va', idProyectoCobranza, proyecto);
  const [rows] = await db.query(`
    SELECT
      (SELECT MIN(gc.id_gc) FROM gestion_credito gc WHERE ${gc.sql}) AS gestion_credito_id,
      (SELECT COALESCE(SUM(COALESCE(mp.pendiente_corriente, 0) + COALESCE(mp.pendiente_vencido, 0)), 0)
         FROM detalle_mp_2026 mp WHERE ${mp.sql}) AS adeudo_mp,
      (SELECT COALESCE(SUM(COALESCE(va.adeudo, 0)), 0)
         FROM pc va WHERE ${va.sql}) AS adeudo_va
  `, [...gc.params, ...mp.params, ...va.params]);
  return rows[0] || {};
}

async function getPortafolioProyectoDetalle_uni(req, res) {
  const solicitado = normalizeText_uni(req.params.proyecto || req.query.proyecto);
  if (!solicitado) return res.status(400).json({ ok: false, message: 'Proyecto requerido.' });

  try {
    const equivalencia = await resolveProyectoEquivalencia_uni(solicitado);
    const proyecto = equivalencia.proyecto_busqueda;
    const nombrePublico = equivalencia.nombre_publico;
    const criteria = getCriticidadCriteria_uni(req);
    const access = scope_uni(req, 'p');

    // La cabecera y los equipos nacen ya filtrados por usuario_zop.
    const [projectRows] = await db.query(`
      SELECT
        p.proyecto,
        MAX(p.id_proyecto_cobranza) AS id_proyecto_cobranza,
        MAX(p.proyecto_cc_x_port) AS proyecto_cc_x_port,
        MAX(p.ciudad) AS ciudad,
        MAX(p.estado) AS estado,
        MAX(p.direccion) AS direccion
      FROM portafolio p
      WHERE p.estado_registro = 1
        AND ${access.sql}
        AND UPPER(TRIM(p.proyecto)) = UPPER(TRIM(?))
      GROUP BY p.proyecto
    `, [...(access.params || []), proyecto]);

    if (!projectRows.length) {
      return res.status(404).json({
        ok: false,
        source: 'aiven-portafolio',
        message: 'Proyecto no encontrado en Portafolio dentro de los cuartos autorizados.'
      });
    }

    const equipmentScope = scope_uni(req, 'p');
    const [equipmentRows] = await db.query(`
      SELECT ${portafolioBaseSelect_uni}
      FROM portafolio p
      ${latestTicketJoin_uni}
      WHERE p.estado_registro = 1
        AND ${equipmentScope.sql}
        AND UPPER(TRIM(p.proyecto)) = UPPER(TRIM(?))
      ORDER BY p.numero_equipo ASC
    `, [...(equipmentScope.params || []), proyecto]);

    const codes = uniqueText_uni(equipmentRows.map(row => row.numero_equipo));
    if (!codes.length) {
      return res.status(404).json({
        ok: false,
        source: 'aiven-portafolio',
        message: 'Proyecto sin equipos visibles dentro de los cuartos autorizados.'
      });
    }

    const [allTickets] = await db.query(`
      SELECT
        t.ticket,
        t.codigo_equipo,
        t.equipo,
        t.folio,
        t.estado_ticket,
        t.estado,
        t.descripcion,
        t.fecha_reporte,
        t.h_reporte,
        t.estatus_equipo_ir,
        t.fecha_llegada,
        t.h_llegada,
        t.tiempo_llegada,
        t.fecha_cierre,
        t.h_solucion,
        t.tiempo_solucion,
        t.estatus_equipo_final,
        t.causa,
        t.causa_falla,
        t.accion_en_cierre,
        t.responsabilidad
      FROM tickets t
      WHERE TRIM(COALESCE(t.codigo_equipo, '')) IN (?)
      ORDER BY t.codigo_equipo ASC, t.fecha_reporte DESC, t.id DESC
    `, [codes]);

    const metricsContext = projectTicketMetrics_uni(allTickets, equipmentRows, criteria);
    const now = metricsContext.now;
    const currentYear = metricsContext.year;
    const anioTicketsRaw = Number.parseInt(req.query.anio_tickets, 10);
    const selectedYear = Number.isInteger(anioTicketsRaw) && anioTicketsRaw >= 2000 && anioTicketsRaw <= 2100
      ? anioTicketsRaw
      : null;

    const ticketsResponse = allTickets
      .filter(ticket => !selectedYear || yearOf_uni(ticket.fecha_reporte) === selectedYear)
      .slice(0, 3000)
      .map(ticket => ({
        ...ticket,
        identificacion_sitio: equipmentRows.find(row => normalizeText_uni(row.numero_equipo) === normalizeText_uni(ticket.codigo_equipo))?.identificacion_sitio || null
      }));

    const ticketYears = [...new Set(allTickets.map(ticket => yearOf_uni(ticket.fecha_reporte)).filter(Boolean))].sort((a, b) => b - a);
    const monthlyForYear = year => groupedCounts_uni(
      allTickets.filter(ticket => yearOf_uni(ticket.fecha_reporte) === year),
      ticket => monthKey_uni(ticket.fecha_reporte)
    ).map(item => ({ mes: item.key, total: item.total })).sort((a, b) => a.mes.localeCompare(b.mes));

    const last365 = allTickets.filter(ticket => {
      const date = dateValue_uni(ticket.fecha_reporte);
      return date && date >= metricsContext.u365Start && date <= now;
    });
    const responsibilityMap = new Map();
    for (const ticket of last365) {
      const key = normalizeText_uni(ticket.responsabilidad) || 'Sin dato';
      responsibilityMap.set(key, (responsibilityMap.get(key) || 0) + 1);
    }
    const responsabilidad = [...responsibilityMap.entries()]
      .map(([responsabilidadValue, total]) => ({ responsabilidad: responsabilidadValue, total }))
      .sort((a, b) => b.total - a.total);

    const currentYearTickets = allTickets.filter(ticket => yearOf_uni(ticket.fecha_reporte) === currentYear);
    const countResp = value => currentYearTickets.filter(ticket => normalizeUpper_uni(ticket.responsabilidad) === value).length;
    const projectMetrics = {
      equipos_activos: equipmentRows.length,
      equipos_detenidos: equipmentRows.filter(row => {
        const value = normalizeUpper_uni(row.estado_operativo || row.ultimo_estatus_equipo_final);
        return value.includes('NO FUNC') || value.includes('PARAD');
      }).length,
      equipos_criticos_periodo: metricsContext.criticalCodes.size,
      criticos_periodo_dias: criteria.dias,
      criticos_min_fallas: criteria.minFallas,
      llamadas_total_anio: currentYearTickets.length,
      llamadas_blt_anio: countResp('BLT'),
      llamadas_cliente_anio: countResp('CLIENTE'),
      llamadas_sin_responsable_anio: currentYearTickets.filter(ticket => {
        const value = normalizeUpper_uni(ticket.responsabilidad);
        return value !== 'BLT' && value !== 'CLIENTE';
      }).length
    };

    const cobranza = await loadCobranzaSummary_uni(projectRows[0].id_proyecto_cobranza, proyecto);
    projectMetrics.gestion_credito_id = Number(cobranza.gestion_credito_id || 0) || null;
    projectMetrics.adeudo_mp = Number(cobranza.adeudo_mp || 0);
    projectMetrics.adeudo_va = Number(cobranza.adeudo_va || 0);
    projectMetrics.adeudo_total = projectMetrics.adeudo_mp + projectMetrics.adeudo_va;

    const responsibilityCurrent = new Map();
    const bltEquipment = new Map();
    const clientEquipment = new Map();
    for (const ticket of currentYearTickets) {
      const raw = normalizeUpper_uni(ticket.responsabilidad);
      const label = raw === 'BLT' ? 'Resp. BLT' : raw === 'CLIENTE' ? 'Resp. Cliente' : 'Sin Responsable';
      responsibilityCurrent.set(label, (responsibilityCurrent.get(label) || 0) + 1);
      const code = normalizeText_uni(ticket.codigo_equipo);
      const equipment = equipmentRows.find(row => normalizeText_uni(row.numero_equipo) === code);
      const equipmentLabel = normalizeText_uni(equipment?.identificacion_sitio) || code;
      if (raw === 'BLT') {
        const current = bltEquipment.get(code) || { label: equipmentLabel, codigo_equipo: code, responsabilidad: 'BLT', total: 0 };
        current.total += 1;
        bltEquipment.set(code, current);
      }
      if (raw === 'CLIENTE') {
        const current = clientEquipment.get(code) || { label: equipmentLabel, codigo_equipo: code, responsabilidad: 'CLIENTE', total: 0 };
        current.total += 1;
        clientEquipment.set(code, current);
      }
    }

    const header = projectHeaderFromEquipment_uni(projectRows[0], equipmentRows, nombrePublico, proyecto);
    header.tickets_35d = allTickets.filter(ticket => {
      const date = dateValue_uni(ticket.fecha_reporte);
      return date && date >= new Date(now.getTime() - 35 * 86400000) && date <= now;
    }).length;
    header.fallas_blt_365d = last365.filter(ticket => normalizeUpper_uni(ticket.responsabilidad).includes('BLT')).length;

    const equiposDecorados = equipmentRows.map(row => ({
      ...decorateProyectoRow_uni(row),
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
      proyecto: header,
      equipos: equiposDecorados,
      tickets: ticketsResponse,
      ticket_years: ticketYears,
      ticket_year_selected: selectedYear,
      monthly_current: monthlyForYear(currentYear),
      monthly_previous: monthlyForYear(currentYear - 1),
      responsabilidad,
      project_metrics: projectMetrics,
      project_distributions: {
        total_responsabilidad: [...responsibilityCurrent.entries()].map(([label, total]) => ({ label, total })).sort((a, b) => b.total - a.total),
        blt_por_equipo: [...bltEquipment.values()].sort((a, b) => b.total - a.total || a.label.localeCompare(b.label)),
        cliente_por_equipo: [...clientEquipment.values()].sort((a, b) => b.total - a.total || a.label.localeCompare(b.label))
      }
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Error consultando detalle de proyecto.', error: error.message });
  }
}

module.exports = {
  getPortafolioFiltros_uni,
  getPortafolioMovimientos_uni,
  getPortafolioMovimientoDetalle_uni,
  getPortafolioEquipoDetalle_uni,
  getPortafolioProyectoDetalle_uni,
  getPortafolio_uni,
  getEquipos_uni
};

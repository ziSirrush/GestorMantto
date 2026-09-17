'use strict';

// [Aster | 2026-09-17 | ASTER-MG | FASE 3 INFORMES FRONTEND FUNCIONAL V001]
// Base funcional: Fase 2 Informes Motor Backend V001.
// Corrige la separacion entre:
//   1) alcance permitido de Portafolio,
//   2) actividad de Tickets del periodo,
//   3) fotografia actual,
//   4) MTBC Año actual / U365D.
//
// No crea tablas, columnas ni fuentes nuevas. Mantiene el motor central de
// alcance de informacion y la regla de criticidad ya usada por Equipos Criticos.

const db = require('./informes.repository');
const {
  mexicoCityDate,
  sqlMexicoCityToday
} = require('../../utils/temporal');
const informationRecordScope = require('../../services/information-record-scope-gnral.service');

function positiveInt(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function responsabilidadBlt(alias) {
  return `UPPER(COALESCE(${alias}.responsabilidad,'')) LIKE '%BLT%'`;
}

function responsabilidadCliente(alias) {
  return `UPPER(COALESCE(${alias}.responsabilidad,'')) LIKE '%CLIENTE%'`;
}

function basePortafolioScope(alias, req) {
  const scope = informationRecordScope.buildPortafolioScopeSqlInline_gnral(req, alias);
  return {
    sql: `${alias}.estado_registro = 1
      AND (${alias}.inactivo IS NULL OR UPPER(TRIM(CAST(${alias}.inactivo AS CHAR))) NOT IN ('SI','SÍ','1','TRUE','INACTIVO'))
      AND ${scope.sql}`,
    params: scope.params || []
  };
}

// Universo permitido del informe. NO excluye equipos por estatus de servicio.
// Esto evita perder equipos detenidos y Tickets historicos de esos equipos.
function portafolioAlcance(alias, req) {
  return basePortafolioScope(alias, req);
}

// Misma regla operacional usada por Equipos Criticos: registro activo, no
// inactivo y no marcado como "No en Servicio".
function portafolioCriticos(alias, req) {
  const base = basePortafolioScope(alias, req);
  return {
    sql: `${base.sql}
      AND UPPER(TRIM(COALESCE(${alias}.estatus_servicio,''))) NOT LIKE '%NO EN SERVICIO%'`,
    params: base.params
  };
}

// Denominador MTBC: solo equipos que HOY estan expresamente "En Servicio".
function portafolioEnServicio(alias, req) {
  const base = basePortafolioScope(alias, req);
  return {
    sql: `${base.sql}
      AND UPPER(TRIM(COALESCE(${alias}.estatus_servicio,''))) = 'EN SERVICIO'`,
    params: base.params
  };
}

function multiParam(raw) {
  if (raw === undefined || raw === null) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  return [...new Set(arr
    .flatMap((value) => String(value || '').split(','))
    .map((value) => value.trim())
    .filter(Boolean))];
}

function inClause(column, values) {
  if (!values.length) return null;
  return {
    sql: `${column} IN (${values.map(() => '?').join(', ')})`,
    params: values
  };
}

function buildScopeFilters(req, alias) {
  const filtros = {
    superintendente: multiParam(req.query.superintendente),
    supervisor: multiParam(req.query.supervisor),
    estado: multiParam(req.query.estado),
    zona: multiParam(req.query.zona),
    proyecto: multiParam(req.query.proyecto),
    equipo: multiParam(req.query.equipo)
  };

  const map = [
    [filtros.superintendente, `${alias}.superintendente`],
    [filtros.supervisor, `${alias}.supervisor_zona`],
    [filtros.estado, `${alias}.estado`],
    [filtros.zona, `${alias}.zona_operativa`],
    [filtros.proyecto, `${alias}.proyecto`],
    [filtros.equipo, `${alias}.numero_equipo`]
  ];

  const clauses = [];
  const params = [];
  for (const [values, column] of map) {
    const clause = inClause(column, values);
    if (!clause) continue;
    clauses.push(clause.sql);
    params.push(...clause.params);
  }

  return {
    sql: clauses.length ? ` AND ${clauses.join(' AND ')}` : '',
    params,
    filtros
  };
}

function civilDateParts(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null;
  return { year, month, day, date };
}

function formatCivilDate(date) {
  return [
    String(date.getUTCFullYear()).padStart(4, '0'),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0')
  ].join('-');
}

function addCivilDays(value, days) {
  const parts = civilDateParts(value);
  if (!parts) throw new Error('Fecha civil invalida.');
  const date = new Date(parts.date.getTime());
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return formatCivilDate(date);
}

function shiftCivilMonths(value, months) {
  const parts = civilDateParts(value);
  if (!parts) throw new Error('Fecha civil invalida.');
  const target = new Date(Date.UTC(parts.year, parts.month - 1, 1));
  target.setUTCMonth(target.getUTCMonth() + Number(months || 0));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(parts.day, lastDay));
  return formatCivilDate(target);
}

function compareCivilDates(a, b) {
  return String(a).localeCompare(String(b));
}

function validationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function parseFecha(value, fallback, fieldName) {
  const text = String(value || '').trim();
  if (!text) return fallback;
  if (!civilDateParts(text)) {
    throw validationError(`${fieldName || 'fecha'} debe tener formato YYYY-MM-DD y ser una fecha valida.`);
  }
  return text;
}

function periodo(req) {
  const hoy = mexicoCityDate() || new Date().toISOString().substring(0, 10);
  const defaultInicio = shiftCivilMonths(hoy, -6);
  const fechaInicio = parseFecha(req.query.fecha_inicio, defaultInicio, 'fecha_inicio');
  const fechaFin = parseFecha(req.query.fecha_fin, hoy, 'fecha_fin');
  if (compareCivilDates(fechaInicio, fechaFin) > 0) {
    throw validationError('fecha_inicio no puede ser posterior a fecha_fin.');
  }
  return { fecha_inicio: fechaInicio, fecha_fin: fechaFin };
}

function mtbcVentana(req) {
  const value = String(req.query.mtbc_ventana || 'anio').trim().toLowerCase();
  return ['365', 'u365', 'u365d'].includes(value) ? '365' : 'anio';
}

function inhabilCaseSql(alias) {
  return `(
    DAYOFWEEK(${alias}.fecha_reporte) IN (1,7)
    OR HOUR(STR_TO_DATE(NULLIF(TRIM(${alias}.h_reporte), ''), '%h:%i %p')) >= 20
    OR HOUR(STR_TO_DATE(NULLIF(TRIM(${alias}.h_reporte), ''), '%h:%i %p')) < 8
  )`;
}

function ticketPeriodCondition(alias) {
  return `(
    (${alias}.fecha_reporte IS NOT NULL AND ${alias}.fecha_reporte >= ? AND ${alias}.fecha_reporte < DATE_ADD(?, INTERVAL 1 DAY))
    OR
    (${alias}.fecha_cierre IS NOT NULL AND ${alias}.fecha_cierre >= ? AND ${alias}.fecha_cierre < DATE_ADD(?, INTERVAL 1 DAY))
  )`;
}

function ticketPeriodParams(fechaInicio, fechaFin) {
  return [fechaInicio, fechaFin, fechaInicio, fechaFin];
}

function scopedEquipmentSubquery(scopeWhere) {
  return `(
    SELECT p.numero_equipo
    FROM portafolio p
    WHERE ${scopeWhere}
      AND NULLIF(TRIM(p.numero_equipo), '') IS NOT NULL
    GROUP BY p.numero_equipo
  ) alcance`;
}

function trappedConditionSql(alias) {
  // Equivalente SQL de la deteccion central: descripcion + causa + accion_en_cierre
  // con los stems atrapad/encerrad y la palabra rescate.
  return `UPPER(CONCAT_WS(' ', ${alias}.descripcion, ${alias}.causa, ${alias}.accion_en_cierre))
    REGEXP 'ATRAPAD|ENCERRAD|RESCATE'`;
}

function withPercentages(rows) {
  const normalized = (rows || []).map((row) => ({
    ...row,
    total: Number(row.total || 0)
  }));
  const total = normalized.reduce((sum, row) => sum + row.total, 0);
  return normalized.map((row) => ({
    ...row,
    porcentaje: total > 0 ? Math.round((row.total * 1000) / total) / 10 : 0
  }));
}

function differenceInCivilDays(start, end) {
  const a = civilDateParts(start);
  const b = civilDateParts(end);
  if (!a || !b) return 0;
  return Math.floor((b.date.getTime() - a.date.getTime()) / 86400000);
}

function mtbcWindow(ventana) {
  const hoy = mexicoCityDate() || new Date().toISOString().substring(0, 10);
  const year = civilDateParts(hoy).year;
  const inicio = ventana === '365' ? addCivilDays(hoy, -364) : `${year}-01-01`;
  return {
    inicio,
    fin: hoy,
    dias: differenceInCivilDays(inicio, hoy) + 1
  };
}

function monthKey(value) {
  return String(value).slice(0, 7);
}

function monthStart(value) {
  const parts = civilDateParts(value);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-01`;
}

function monthEnd(value) {
  const parts = civilDateParts(value);
  const date = new Date(Date.UTC(parts.year, parts.month, 0));
  return formatCivilDate(date);
}

function nextMonth(value) {
  const parts = civilDateParts(value);
  const date = new Date(Date.UTC(parts.year, parts.month, 1));
  return formatCivilDate(date);
}

function mtbcMonthBuckets(windowInfo) {
  const buckets = [];
  let cursor = monthStart(windowInfo.inicio);
  const lastMonth = monthStart(windowInfo.fin);
  while (compareCivilDates(cursor, lastMonth) <= 0) {
    const rawEnd = monthEnd(cursor);
    const inicio = compareCivilDates(cursor, windowInfo.inicio) < 0 ? windowInfo.inicio : cursor;
    const fin = compareCivilDates(rawEnd, windowInfo.fin) > 0 ? windowInfo.fin : rawEnd;
    buckets.push({
      mes: monthKey(cursor),
      inicio,
      fin,
      dias: differenceInCivilDays(inicio, fin) + 1
    });
    cursor = nextMonth(cursor);
  }
  return buckets;
}

async function getOpciones(req) {
  const port = portafolioAlcance('p', req);
  const [rows] = await db.query(`
    SELECT DISTINCT
      p.superintendente,
      p.supervisor_zona,
      p.estado,
      p.zona_operativa,
      p.proyecto,
      p.numero_equipo
    FROM portafolio p
    WHERE ${port.sql}
  `, port.params);

  const uniqueSorted = (key) => [...new Set((rows || [])
    .map((row) => row[key])
    .filter((value) => value !== null && value !== undefined && String(value).trim())
    .map((value) => String(value).trim()))]
    .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));

  return {
    ok: true,
    opciones: {
      superintendentes: uniqueSorted('superintendente'),
      supervisores: uniqueSorted('supervisor_zona'),
      estados: uniqueSorted('estado'),
      zonas: uniqueSorted('zona_operativa'),
      proyectos: uniqueSorted('proyecto'),
      equipos: uniqueSorted('numero_equipo')
    }
  };
}

async function getMtbcData(req, filtroPort) {
  const ventana = mtbcVentana(req);
  const windowInfo = mtbcWindow(ventana);
  const port = portafolioEnServicio('p', req);
  const scopeWhere = `${port.sql}${filtroPort.sql}`;
  const scopeParams = [...port.params, ...filtroPort.params];

  const [[equiposRow]] = await db.query(`
    SELECT COUNT(DISTINCT p.numero_equipo) AS equipos_activos
    FROM portafolio p
    WHERE ${scopeWhere}
      AND NULLIF(TRIM(p.numero_equipo), '') IS NOT NULL
  `, scopeParams);

  const equiposActivos = Number(equiposRow && equiposRow.equipos_activos || 0);
  const [fallasRows] = await db.query(`
    SELECT
      DATE_FORMAT(t.fecha_reporte, '%Y-%m') AS mes,
      COUNT(DISTINCT t.id) AS fallas_blt
    FROM tickets t
    INNER JOIN ${scopedEquipmentSubquery(scopeWhere)} ON alcance.numero_equipo = t.codigo_equipo
    WHERE t.fecha_reporte IS NOT NULL
      AND t.fecha_reporte >= ?
      AND t.fecha_reporte < DATE_ADD(?, INTERVAL 1 DAY)
      AND ${responsabilidadBlt('t')}
    GROUP BY DATE_FORMAT(t.fecha_reporte, '%Y-%m')
    ORDER BY mes ASC
  `, [...scopeParams, windowInfo.inicio, windowInfo.fin]);

  const fallasPorMes = new Map((fallasRows || []).map((row) => [
    String(row.mes || ''),
    Number(row.fallas_blt || 0)
  ]));
  const fallasTotal = [...fallasPorMes.values()].reduce((sum, value) => sum + value, 0);
  const mtbcGeneral = fallasTotal > 0
    ? Math.round((windowInfo.dias * equiposActivos / fallasTotal) * 10) / 10
    : null;

  const tendencia = mtbcMonthBuckets(windowInfo).map((bucket) => {
    const fallas = Number(fallasPorMes.get(bucket.mes) || 0);
    return {
      mes: bucket.mes,
      dias: bucket.dias,
      fallas_blt: fallas,
      equipos_activos: equiposActivos,
      mtbc: fallas > 0
        ? Math.round((bucket.dias * equiposActivos / fallas) * 10) / 10
        : null
    };
  });

  const [proyectosRows] = await db.query(`
    SELECT
      alcance.proyecto,
      COUNT(DISTINCT alcance.numero_equipo) AS equipos_activos,
      COUNT(DISTINCT t.id) AS fallas_blt
    FROM (
      SELECT p.proyecto, p.numero_equipo
      FROM portafolio p
      WHERE ${scopeWhere}
        AND NULLIF(TRIM(p.proyecto), '') IS NOT NULL
        AND NULLIF(TRIM(p.numero_equipo), '') IS NOT NULL
      GROUP BY p.proyecto, p.numero_equipo
    ) alcance
    LEFT JOIN tickets t
      ON t.codigo_equipo = alcance.numero_equipo
     AND t.fecha_reporte IS NOT NULL
     AND t.fecha_reporte >= ?
     AND t.fecha_reporte < DATE_ADD(?, INTERVAL 1 DAY)
     AND ${responsabilidadBlt('t')}
    GROUP BY alcance.proyecto
    HAVING COUNT(DISTINCT t.id) > 0
  `, [...scopeParams, windowInfo.inicio, windowInfo.fin]);

  const proyectosCriticos = (proyectosRows || [])
    .map((row) => {
      const equipos = Number(row.equipos_activos || 0);
      const fallas = Number(row.fallas_blt || 0);
      return {
        proyecto: row.proyecto,
        equipos_activos: equipos,
        fallas_blt: fallas,
        mtbc: fallas > 0
          ? Math.round((windowInfo.dias * equipos / fallas) * 10) / 10
          : null
      };
    })
    .filter((row) => row.mtbc !== null && row.mtbc < 100)
    .sort((a, b) => a.mtbc - b.mtbc || String(a.proyecto || '').localeCompare(String(b.proyecto || ''), 'es'));

  return {
    ventana,
    fecha_inicio: windowInfo.inicio,
    fecha_fin: windowInfo.fin,
    dias_ventana: windowInfo.dias,
    equipos_activos: equiposActivos,
    fallas_blt: fallasTotal,
    mtbc_general: mtbcGeneral,
    mtbc_tendencia_mensual: tendencia,
    proyectos_criticos: proyectosCriticos
  };
}

async function getMtbc(req) {
  const filtroPort = buildScopeFilters(req, 'p');
  const data = await getMtbcData(req, filtroPort);
  return {
    ok: true,
    criterio: {
      mtbc_ventana: data.ventana,
      filtros: filtroPort.filtros
    },
    estado_actual: {
      mtbc_fecha_inicio: data.fecha_inicio,
      mtbc_fecha_fin: data.fecha_fin,
      mtbc_dias_ventana: data.dias_ventana,
      mtbc_equipos_activos: data.equipos_activos,
      mtbc_fallas_blt: data.fallas_blt,
      mtbc_general: data.mtbc_general,
      mtbc_tendencia_mensual: data.mtbc_tendencia_mensual,
      proyectos_criticos: data.proyectos_criticos
    }
  };
}

function distinctTextAggregate(column) {
  return `GROUP_CONCAT(DISTINCT NULLIF(TRIM(${column}), '') ORDER BY NULLIF(TRIM(${column}), '') SEPARATOR ' / ')`;
}

async function getScopeDetail(req, filtroPort, scopeWhere, scopeParams) {
  const equipos = filtroPort && filtroPort.filtros ? filtroPort.filtros.equipo || [] : [];
  const proyectos = filtroPort && filtroPort.filtros ? filtroPort.filtros.proyecto || [] : [];

  // Un equipo concreto tiene prioridad sobre el detalle de proyecto porque es
  // el nivel mas especifico del resumen dinamico.
  if (equipos.length === 1) {
    const [rows] = await db.query(`
      SELECT
        p.numero_equipo AS equipo,
        p.identificacion_sitio AS referencia_en_sitio,
        p.proyecto,
        p.ciudad,
        p.estado,
        p.zona_operativa AS zona,
        p.superintendente,
        p.supervisor_zona AS supervisor,
        p.direccion,
        p.estatus_servicio,
        p.fecha_instalacion,
        p.fecha_entrega,
        p.termino_garantia,
        p.fecha_recepcion_mantenimiento,
        p.mes_inicio_gratuitos,
        p.mes_termino_gratuitos
      FROM portafolio p
      WHERE ${scopeWhere}
      LIMIT 1
    `, scopeParams);

    return {
      tipo: 'equipo',
      data: rows && rows[0] ? rows[0] : null,
      cobranza_pendiente_fuente: true
    };
  }

  // El detalle de proyecto se muestra solo cuando hay un unico proyecto
  // seleccionado y no se bajo ya al nivel de un equipo individual.
  if (proyectos.length === 1) {
    const [rows] = await db.query(`
      SELECT
        MAX(p.proyecto) AS proyecto,
        ${distinctTextAggregate('p.ciudad')} AS ciudad,
        ${distinctTextAggregate('p.estado')} AS estado,
        ${distinctTextAggregate('p.zona_operativa')} AS zona,
        ${distinctTextAggregate('p.superintendente')} AS superintendente,
        ${distinctTextAggregate('p.supervisor_zona')} AS supervisor,
        ${distinctTextAggregate('p.direccion')} AS direccion,
        ${distinctTextAggregate('p.estatus_servicio')} AS estatus_servicio,
        COUNT(DISTINCT p.numero_equipo) AS equipos
      FROM portafolio p
      WHERE ${scopeWhere}
    `, scopeParams);

    const row = rows && rows[0] && rows[0].proyecto ? rows[0] : null;
    if (row) row.equipos = Number(row.equipos || 0);
    return {
      tipo: 'proyecto',
      data: row,
      cobranza_pendiente_fuente: true
    };
  }

  return { tipo: 'resumen', data: null, cobranza_pendiente_fuente: true };
}

async function generarInforme(req) {
  const { fecha_inicio: fechaInicio, fecha_fin: fechaFin } = periodo(req);
  const filtroPort = buildScopeFilters(req, 'p');
  const port = portafolioAlcance('p', req);
  const scopeWhere = `${port.sql}${filtroPort.sql}`;
  const scopeParams = [...port.params, ...filtroPort.params];

  const [[alcanceRow]] = await db.query(`
    SELECT
      COUNT(DISTINCT p.numero_equipo) AS equipos,
      COUNT(DISTINCT p.proyecto) AS n_proyectos,
      COUNT(DISTINCT p.supervisor_zona) AS n_supervisores,
      COUNT(DISTINCT p.zona_operativa) AS n_zonas,
      COUNT(DISTINCT p.estado) AS n_estados
    FROM portafolio p
    WHERE ${scopeWhere}
  `, scopeParams);

  const detalleAlcance = await getScopeDetail(req, filtroPort, scopeWhere, scopeParams);

  // Un Ticket pertenece a la actividad del periodo si fue reportado O cerrado
  // dentro del rango. El rango nunca modifica el universo de Portafolio.
  const ticketBase = `
    FROM tickets t
    INNER JOIN ${scopedEquipmentSubquery(scopeWhere)} ON alcance.numero_equipo = t.codigo_equipo
    WHERE ${ticketPeriodCondition('t')}
  `;
  const ticketParams = [
    ...scopeParams,
    ...ticketPeriodParams(fechaInicio, fechaFin)
  ];

  const [[estadoRow]] = await db.query(`
    SELECT
      COUNT(DISTINCT t.id) AS total,
      COUNT(DISTINCT CASE WHEN UPPER(COALESCE(t.estado_ticket,'')) LIKE '%ABIER%' THEN t.id END) AS abiertos,
      COUNT(DISTINCT CASE WHEN UPPER(COALESCE(t.estado_ticket,'')) LIKE '%CERR%' THEN t.id END) AS cerrados,
      COUNT(DISTINCT CASE WHEN ${responsabilidadBlt('t')} THEN t.id END) AS blt,
      COUNT(DISTINCT CASE WHEN ${responsabilidadCliente('t')} THEN t.id END) AS cliente,
      AVG(t.tiempo_llegada) AS prom_llegada,
      AVG(CASE WHEN UPPER(COALESCE(t.estado_ticket,'')) LIKE '%CERR%' THEN t.tiempo_solucion ELSE NULL END) AS prom_solucion,
      AVG(CASE WHEN NOT ${inhabilCaseSql('t')} THEN t.tiempo_llegada ELSE NULL END) AS prom_llegada_habil,
      AVG(CASE WHEN ${inhabilCaseSql('t')} THEN t.tiempo_llegada ELSE NULL END) AS prom_llegada_inhabil
    ${ticketBase}
  `, ticketParams);

  const [prioridadesRows] = await db.query(`
    SELECT
      COALESCE(NULLIF(TRIM(t.prioridad), ''), 'Sin prioridad') AS prioridad,
      COUNT(DISTINCT t.id) AS total
    ${ticketBase}
    GROUP BY COALESCE(NULLIF(TRIM(t.prioridad), ''), 'Sin prioridad')
    ORDER BY total DESC, prioridad ASC
  `, ticketParams);

  const [causasBltRows] = await db.query(`
    SELECT t.causa_falla AS causa, COUNT(DISTINCT t.id) AS total
    ${ticketBase}
      AND ${responsabilidadBlt('t')}
      AND NULLIF(TRIM(t.causa_falla), '') IS NOT NULL
    GROUP BY t.causa_falla
    ORDER BY total DESC, causa ASC
  `, ticketParams);

  const [causasClienteRows] = await db.query(`
    SELECT t.causa_falla AS causa, COUNT(DISTINCT t.id) AS total
    ${ticketBase}
      AND ${responsabilidadCliente('t')}
      AND NULLIF(TRIM(t.causa_falla), '') IS NOT NULL
    GROUP BY t.causa_falla
    ORDER BY total DESC, causa ASC
  `, ticketParams);

  const [tipoEquipoRows] = await db.query(`
    SELECT t.tipo_equipo AS tipo, COUNT(DISTINCT t.id) AS total
    ${ticketBase}
      AND NULLIF(TRIM(t.tipo_equipo), '') IS NOT NULL
    GROUP BY t.tipo_equipo
    ORDER BY total DESC, tipo ASC
  `, ticketParams);

  // -------------------------- Fotografia actual ---------------------------
  const [paradosRows] = await db.query(`
    SELECT
      p.numero_equipo AS equipo,
      MAX(p.proyecto) AS proyecto,
      MAX(p.zona_operativa) AS zona,
      MAX(p.supervisor_zona) AS supervisor,
      MAX(p.superintendente) AS superintendente,
      MAX(p.estatus_servicio) AS estatus_servicio
    FROM portafolio p
    WHERE ${scopeWhere}
      AND NULLIF(TRIM(p.numero_equipo), '') IS NOT NULL
      AND UPPER(TRIM(COALESCE(p.estatus_servicio,''))) <> 'EN SERVICIO'
    GROUP BY p.numero_equipo
    ORDER BY proyecto ASC, equipo ASC
  `, scopeParams);

  const userFallas = Number(req.user && req.user.criticos_fallas) || 3;
  const userPeriodo = Number(req.user && req.user.criticos_periodo) || 35;
  const diasCritico = positiveInt(req.query.dias_criticos, userPeriodo, 1, 3650);
  const minFallas = positiveInt(req.query.min_fallas_criticos, userFallas, 1, 9999);
  const criticalPort = portafolioCriticos('p', req);
  const criticalWhere = `${criticalPort.sql}${filtroPort.sql}`;
  const criticalParams = [...criticalPort.params, ...filtroPort.params];

  const [equiposCriticos] = await db.query(`
    SELECT
      t.codigo_equipo AS equipo,
      MAX(alcance.proyecto) AS proyecto,
      MAX(alcance.zona) AS zona,
      MAX(alcance.supervisor) AS supervisor,
      MAX(alcance.superintendente) AS superintendente,
      COUNT(DISTINCT t.id) AS fallas_blt
    FROM tickets t
    INNER JOIN (
      SELECT
        p.numero_equipo,
        MAX(p.proyecto) AS proyecto,
        MAX(p.zona_operativa) AS zona,
        MAX(p.supervisor_zona) AS supervisor,
        MAX(p.superintendente) AS superintendente
      FROM portafolio p
      WHERE ${criticalWhere}
        AND NULLIF(TRIM(p.numero_equipo), '') IS NOT NULL
      GROUP BY p.numero_equipo
    ) alcance ON alcance.numero_equipo = t.codigo_equipo
    WHERE t.fecha_reporte IS NOT NULL
      AND t.fecha_reporte >= DATE_SUB(${sqlMexicoCityToday()}, INTERVAL ? DAY)
      AND t.fecha_reporte < DATE_ADD(${sqlMexicoCityToday()}, INTERVAL 1 DAY)
      AND ${responsabilidadBlt('t')}
    GROUP BY t.codigo_equipo
    HAVING COUNT(DISTINCT t.id) >= ?
    ORDER BY fallas_blt DESC, equipo ASC
  `, [...criticalParams, diasCritico, minFallas]);

  // Persona atrapada es independiente del rango elegido del informe. Se usa
  // la misma frontera textual del motor central y se devuelven los campos que
  // el modulo necesita mostrar.
  const [atrapadosRows] = await db.query(`
    SELECT DISTINCT
      t.id,
      t.ticket,
      t.codigo_equipo AS equipo,
      t.proyecto,
      t.fecha_reporte,
      t.descripcion,
      t.causa,
      t.accion_en_cierre
    FROM tickets t
    INNER JOIN ${scopedEquipmentSubquery(scopeWhere)} ON alcance.numero_equipo = t.codigo_equipo
    WHERE ${trappedConditionSql('t')}
    ORDER BY t.fecha_reporte DESC, t.id DESC
  `, scopeParams);

  const mtbcData = await getMtbcData(req, filtroPort);

  const total = Number(estadoRow && estadoRow.total || 0);
  const abiertos = Number(estadoRow && estadoRow.abiertos || 0);
  const cerrados = Number(estadoRow && estadoRow.cerrados || 0);

  return {
    ok: true,
    criterio: {
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      mtbc_ventana: mtbcData.ventana,
      dias_criticos: diasCritico,
      min_fallas_criticos: minFallas,
      filtros: filtroPort.filtros
    },
    detalle_alcance: detalleAlcance,
    resumen_alcance: {
      equipos: Number(alcanceRow && alcanceRow.equipos || 0),
      // Alias temporal para no romper el frontend V001 antes de Fase 3.
      equipos_activos: Number(alcanceRow && alcanceRow.equipos || 0),
      n_proyectos: Number(alcanceRow && alcanceRow.n_proyectos || 0),
      n_supervisores: Number(alcanceRow && alcanceRow.n_supervisores || 0),
      n_zonas: Number(alcanceRow && alcanceRow.n_zonas || 0),
      n_estados: Number(alcanceRow && alcanceRow.n_estados || 0)
    },
    tickets: {
      total,
      abiertos,
      cerrados,
      en_curso: Math.max(0, total - abiertos - cerrados),
      prioridades: (prioridadesRows || []).map((row) => ({
        prioridad: row.prioridad,
        total: Number(row.total || 0)
      })),
      responsabilidad_blt: Number(estadoRow && estadoRow.blt || 0),
      responsabilidad_cliente: Number(estadoRow && estadoRow.cliente || 0),
      causas_blt: withPercentages(causasBltRows),
      causas_cliente: withPercentages(causasClienteRows),
      tipo_equipo: (tipoEquipoRows || []).map((row) => ({
        tipo: row.tipo,
        total: Number(row.total || 0)
      })),
      tiempo_promedio_llegada: estadoRow ? estadoRow.prom_llegada : null,
      tiempo_promedio_llegada_habil: estadoRow ? estadoRow.prom_llegada_habil : null,
      tiempo_promedio_llegada_inhabil: estadoRow ? estadoRow.prom_llegada_inhabil : null,
      tiempo_promedio_solucion: estadoRow ? estadoRow.prom_solucion : null,
      // Compatibilidad con el frontend V001. Ya NO depende del periodo.
      eventos_atrapados: (atrapadosRows || []).length
    },
    estado_actual: {
      equipos_parados: (paradosRows || []).length,
      equipos_parados_detalle: paradosRows || [],
      equipos_criticos: equiposCriticos || [],
      eventos_atrapados: {
        total: (atrapadosRows || []).length,
        data: atrapadosRows || []
      },
      mtbc_fecha_inicio: mtbcData.fecha_inicio,
      mtbc_fecha_fin: mtbcData.fecha_fin,
      mtbc_dias_ventana: mtbcData.dias_ventana,
      mtbc_equipos_activos: mtbcData.equipos_activos,
      mtbc_fallas_blt: mtbcData.fallas_blt,
      mtbc_general: mtbcData.mtbc_general,
      mtbc_tendencia_mensual: mtbcData.mtbc_tendencia_mensual,
      proyectos_criticos: mtbcData.proyectos_criticos
    }
  };
}

module.exports = {
  getOpciones,
  getMtbc,
  generarInforme
};

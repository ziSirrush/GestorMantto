'use strict';

const repository = require('./experimental-entregas-recientes.repository');

const TIME_ZONE_EXP = 'America/Mexico_City';
const DEFAULT_RECEPCION_MONTHS_EXP = 12;
const MAX_RECEPCION_MONTHS_EXP = 120;
const MAX_ARRIVAL_HOURS_EXP = 24;
const MAX_CLOSE_HOURS_EXP = 24 * 30;

const ATRAPADOS_KEYWORDS_EXP = Object.freeze([
  'atrapado', 'atrapada', 'encerrado', 'encerrada',
  'persona atrapada', 'personas atrapadas', 'rescate'
]);
const AGUA_KEYWORDS_EXP = Object.freeze([
  'agua', 'inundacion', 'inundación', 'filtracion', 'filtración',
  'gotera', 'humedad', 'anegado'
]);
const VOLTAJE_KEYWORDS_EXP = Object.freeze([
  'voltaje', 'variacion de voltaje', 'variación de voltaje', 'sobre voltaje',
  'bajo voltaje', 'pico de voltaje', 'falla electrica', 'falla eléctrica',
  'corte de luz', 'falla de energia', 'falla de energía', 'sin energia',
  'sin energía', 'apagon', 'apagón'
]);

function positiveInt_exp(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeFilter_exp(value) {
  return String(value || '').trim().slice(0, 150);
}

function normalizeText_exp(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function normalizeTicketStatus_exp(value) {
  const normalized = normalizeText_exp(value);
  if (normalized.includes('cerr')) return 'Cerrado';
  if (normalized.includes('curso') || normalized.includes('proceso')) return 'En curso';
  if (normalized.includes('abier') || normalized.includes('pend')) return 'Abierto';
  return String(value || '').trim() || 'Abierto';
}

function normalizeResponsibility_exp(value) {
  const normalized = normalizeText_exp(value);
  if (normalized.includes('blt')) return 'BLT';
  if (normalized.includes('client')) return 'CLIENTE';
  return String(value || '').trim().toUpperCase();
}

function dateKeyInTimeZone_exp(value) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE_EXP,
    year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const parts = formatter.formatToParts(value || new Date());
  const result = {};
  for (const part of parts) if (part.type !== 'literal') result[part.type] = part.value;
  return `${result.year}-${result.month}-${result.day}`;
}

function validDateKey_exp(value) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function textBlob_exp(row) {
  return [row.descripcion, row.causa, row.accion_en_cierre]
    .filter(Boolean).join(' ').toLowerCase();
}

function containsAny_exp(row, keywords) {
  const blob = textBlob_exp(row);
  return keywords.some((keyword) => blob.includes(keyword));
}

function finiteNumber_exp(value, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > max) return null;
  return parsed;
}

function dateTimeEpoch_exp(dateValue, timeValue) {
  const date = String(dateValue || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  let time = String(timeValue || '').trim();
  if (!time || time.toLowerCase() === 'null') time = '00:00:00';
  time = time.replace(/^1899-12-3[01]T/i, '').replace(/\.\d+Z?$/i, '').trim();
  const ampm = time.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i);
  let h; let m; let s;
  if (ampm) {
    h = Number(ampm[1]); m = Number(ampm[2]); s = Number(ampm[3] || 0);
    if (ampm[4].toUpperCase() === 'PM' && h < 12) h += 12;
    if (ampm[4].toUpperCase() === 'AM' && h === 12) h = 0;
  } else {
    const military = time.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!military) return null;
    h = Number(military[1]); m = Number(military[2]); s = Number(military[3] || 0);
  }
  const p = date.split('-').map(Number);
  return Date.UTC(p[0], p[1] - 1, p[2], h, m, s);
}

function closeMinutes_exp(row) {
  const start = dateTimeEpoch_exp(row.fecha_llegada_fecha, row.h_llegada);
  const end = dateTimeEpoch_exp(row.fecha_cierre_fecha, row.h_solucion);
  if (start !== null && end !== null) {
    const hours = (end - start) / 3600000;
    if (hours > 0 && hours <= MAX_CLOSE_HOURS_EXP) return Math.round(hours * 60);
  }
  const fallback = finiteNumber_exp(row.tiempo_solucion, MAX_CLOSE_HOURS_EXP);
  return fallback === null ? null : Math.round(fallback * 60);
}

function isWorkingFinal_exp(value) {
  const normalized = normalizeText_exp(value);
  return normalized.includes('funcio') || normalized.includes('operati');
}

function isNotWorkingFinal_exp(value) {
  return normalizeText_exp(value) === 'no funcionando';
}

function hasSlaExceeded_exp(row) {
  const ticketExcede = normalizeText_exp(row.ticket_excede);
  if (ticketExcede && ticketExcede !== 'null') return true;
  const llegadaII = String(row.tiempo_llegada_ii == null ? '' : row.tiempo_llegada_ii).trim().toLowerCase();
  return Boolean(llegadaII && llegadaII !== 'null');
}

function mapTicket_exp(row) {
  return {
    id: row.id,
    ticket: String(row.ticket || row.folio || row.id || '').trim(),
    folio: String(row.folio || '').trim() || null,
    estado_ticket: normalizeTicketStatus_exp(row.estado_ticket),
    estado: String(row.estado || '').trim(),
    ciudad: String(row.ciudad || '').trim(),
    proyecto: String(row.proyecto || '').trim(),
    proyecto_padre: String(row.proyecto_padre || '').trim(),
    codigo_equipo: String(row.codigo_equipo || '').trim(),
    referencia_en_zona_operativa: String(row.referencia_en_zona_operativa || '').trim(),
    zona: String(row.zona || '').trim(),
    zona_administrativa: String(row.zona_administrativa || '').trim(),
    zona_de_falla: String(row.zona_de_falla || '').trim(),
    descripcion: String(row.descripcion || '').trim(),
    fecha_reporte: row.fecha_reporte_fecha || null,
    hora_reporte: String(row.h_reporte || '').trim() || null,
    estatus_equipo_ir: String(row.estatus_equipo_ir || '').trim(),
    fecha_llegada: row.fecha_llegada_fecha || null,
    hora_llegada: String(row.h_llegada || '').trim() || null,
    persona_que_atiende: String(row.persona_que_atiende || '').trim(),
    fecha_cierre: row.fecha_cierre_fecha || null,
    hora_solucion: String(row.h_solucion || '').trim() || null,
    tecnico: String(row.tecnico || '').trim(),
    estatus_equipo_final: String(row.estatus_equipo_final || '').trim(),
    causa: String(row.causa || '').trim(),
    accion_en_cierre: String(row.accion_en_cierre || '').trim(),
    responsabilidad: normalizeResponsibility_exp(row.responsabilidad),
    causa_falla: String(row.causa_falla || '').trim(),
    tiempo_llegada: row.tiempo_llegada == null ? null : Number(row.tiempo_llegada),
    tiempo_solucion: row.tiempo_solucion == null ? null : Number(row.tiempo_solucion),
    tipo_equipo: String(row.tipo_equipo || '').trim(),
    prioridad: String(row.prioridad || '').trim(),
    ejecutivo_call: String(row.ejecutivo_call || '').trim(),
    blt_empleado: String(row.blt_empleado || '').trim(),
    tiempo_llegada_ii: row.tiempo_llegada_ii == null ? null : Number(row.tiempo_llegada_ii),
    tiempo_solucion_ii: row.tiempo_solucion_ii == null ? null : Number(row.tiempo_solucion_ii),
    ticket_excede: String(row.ticket_excede || '').trim() || null,
    fecha_recepcion_mantenimiento: row.fecha_recepcion_mantenimiento_normalizada || null
  };
}

function buildSummary_exp(rows, criticalCodes) {
  const tickets = Array.isArray(rows) ? rows : [];
  const total = tickets.length;
  const closed = tickets.filter((row) => normalizeTicketStatus_exp(row.estado_ticket) === 'Cerrado');
  const cerrados = closed.length;
  const enCurso = tickets.filter((row) => normalizeTicketStatus_exp(row.estado_ticket) === 'En curso').length;
  const abiertos = tickets.filter((row) => normalizeTicketStatus_exp(row.estado_ticket) === 'Abierto').length;
  const blt = closed.filter((row) => normalizeResponsibility_exp(row.responsabilidad) === 'BLT').length;
  const cliente = closed.filter((row) => normalizeResponsibility_exp(row.responsabilidad) === 'CLIENTE').length;
  const atrapados = tickets.filter((row) => containsAny_exp(row, ATRAPADOS_KEYWORDS_EXP)).length;
  const agua = tickets.filter((row) => containsAny_exp(row, AGUA_KEYWORDS_EXP)).length;
  const voltaje = tickets.filter((row) => containsAny_exp(row, VOLTAJE_KEYWORDS_EXP)).length;
  const criticos = tickets.filter((row) => criticalCodes.has(String(row.codigo_equipo || '').trim())).length;
  const noFuncionando = tickets.filter((row) => isNotWorkingFinal_exp(row.estatus_equipo_final)).length;
  const sla = tickets.filter(hasSlaExceeded_exp).length;
  const arrivals = closed
    .map((row) => finiteNumber_exp(row.tiempo_llegada, MAX_ARRIVAL_HOURS_EXP))
    .filter((value) => value !== null);
  const closes = closed
    .filter((row) => isWorkingFinal_exp(row.estatus_equipo_final))
    .map(closeMinutes_exp)
    .filter((value) => value !== null);
  const pct = (value, denominator) => denominator > 0 ? Math.round((value / denominator) * 100) : 0;

  return {
    total,
    estado_tickets: {
      cerrados, en_curso: enCurso, abiertos,
      porcentajes: { cerrados: pct(cerrados, total), en_curso: pct(enCurso, total), abiertos: pct(abiertos, total) }
    },
    alertas: { atrapados, agua, voltaje, equipos_criticos: criticos, no_funcionando: noFuncionando, sla_excedido: sla },
    responsabilidad_cerrados: {
      blt, cliente, sin_dato: Math.max(0, cerrados - blt - cliente),
      porcentajes: { blt: pct(blt, cerrados), cliente: pct(cliente, cerrados) }
    },
    promedio_llegada_minutos: arrivals.length
      ? Math.round((arrivals.reduce((sum, value) => sum + value, 0) / arrivals.length) * 60)
      : null,
    promedio_cierre_minutos: closes.length
      ? Math.round(closes.reduce((sum, value) => sum + value, 0) / closes.length)
      : null
  };
}

function countBy_exp(rows, field, transform) {
  const counts = new Map();
  for (const row of rows) {
    let value = row[field];
    if (typeof transform === 'function') value = transform(value);
    value = String(value || '').trim() || 'SIN DATO';
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, 'es'));
}

function receptionDateSql_exp(alias) {
  const a = alias || 'p';
  return `COALESCE(
    STR_TO_DATE(NULLIF(TRIM(${a}.fecha_recepcion_mantenimiento), ''), '%Y-%m-%d'),
    STR_TO_DATE(NULLIF(TRIM(${a}.fecha_recepcion_mantenimiento), ''), '%d/%m/%Y'),
    STR_TO_DATE(NULLIF(TRIM(${a}.fecha_recepcion_mantenimiento), ''), '%d-%m-%Y')
  )`;
}

async function getEntregasRecientes_exp(req) {
  const months = positiveInt_exp(
    req.query && (req.query.meses || req.query.meses_recepcion),
    DEFAULT_RECEPCION_MONTHS_EXP, 1, MAX_RECEPCION_MONTHS_EXP
  );
  const criticDays = positiveInt_exp(req.query && (req.query.dias_criticos || req.query.criticos_periodo), Number(req.user && req.user.criticos_periodo) || 35, 1, 3650);
  const criticFailures = positiveInt_exp(req.query && (req.query.min_fallas || req.query.criticos_fallas), Number(req.user && req.user.criticos_fallas) || 3, 1, 9999);
  const estado = normalizeFilter_exp(req.query && req.query.estado);
  const zona = normalizeFilter_exp(req.query && req.query.zona);
  const requestedDate = validDateKey_exp(req.query && (req.query.fecha || req.query.date));
  const receptionDate = receptionDateSql_exp('p');

  const equipmentClauses = [
    'p.estado_registro = 1',
    `${receptionDate} IS NOT NULL`,
    `${receptionDate} >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)`
  ];
  const equipmentParams = [months];
  if (estado) { equipmentClauses.push("TRIM(COALESCE(p.estado, '')) = ?"); equipmentParams.push(estado); }
  if (zona) { equipmentClauses.push("TRIM(COALESCE(p.zona_operativa, '')) = ?"); equipmentParams.push(zona); }

  const eligibleEquipmentSql = `
    SELECT
      p.numero_equipo AS codigo_equipo,
      DATE_FORMAT(${receptionDate}, '%Y-%m-%d') AS fecha_recepcion_mantenimiento_normalizada
    FROM portafolio p
    WHERE ${equipmentClauses.join(' AND ')}
  `;

  const catalogSql = `
    SELECT catalogo.tipo, catalogo.valor
    FROM (
      SELECT 'ESTADO' AS tipo, TRIM(p.estado) AS valor
      FROM portafolio p
      WHERE p.estado_registro = 1
        AND ${receptionDate} IS NOT NULL
        AND ${receptionDate} >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
        AND p.estado IS NOT NULL AND TRIM(p.estado) <> ''
      GROUP BY TRIM(p.estado)
      UNION ALL
      SELECT 'ZONA' AS tipo, TRIM(p.zona_operativa) AS valor
      FROM portafolio p
      WHERE p.estado_registro = 1
        AND ${receptionDate} IS NOT NULL
        AND ${receptionDate} >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
        AND p.zona_operativa IS NOT NULL AND TRIM(p.zona_operativa) <> ''
      GROUP BY TRIM(p.zona_operativa)
    ) catalogo
    ORDER BY catalogo.tipo, catalogo.valor
  `;

  const [equipmentResult, catalogResult] = await Promise.all([
    repository.query(eligibleEquipmentSql, equipmentParams),
    repository.query(catalogSql, [months, months])
  ]);
  const equipmentRows = equipmentResult[0] || [];
  const catalogRows = catalogResult[0] || [];
  const codes = equipmentRows.map((row) => String(row.codigo_equipo || '').trim()).filter(Boolean);

  if (!codes.length) {
    return {
      ok: true, source: 'aiven', timezone: TIME_ZONE_EXP,
      criteria: { meses_recepcion: months, dias_criticos: criticDays, min_fallas_criticas: criticFailures },
      selected_filters: { estado, zona, fecha: requestedDate || null },
      filters: {
        estados: catalogRows.filter((r) => r.tipo === 'ESTADO').map((r) => r.valor),
        zonas: catalogRows.filter((r) => r.tipo === 'ZONA').map((r) => r.valor)
      },
      available_dates: [], selected_date: null, eligible_equipment_count: 0,
      summary: buildSummary_exp([], new Set()), charts: { zonas: [], tipos_equipo: [], estados: [], causa_falla_blt: [], causa_falla_cliente: [] }, tickets: []
    };
  }

  const placeholders = codes.map(() => '?').join(',');
  const availableDatesSql = `
    SELECT DATE_FORMAT(DATE(t.fecha_reporte), '%Y-%m-%d') AS fecha
    FROM tickets t
    WHERE t.codigo_equipo IN (${placeholders}) AND t.fecha_reporte IS NOT NULL
    GROUP BY DATE_FORMAT(DATE(t.fecha_reporte), '%Y-%m-%d')
    ORDER BY DATE_FORMAT(DATE(t.fecha_reporte), '%Y-%m-%d') DESC
  `;
  const [datesResult] = await repository.query(availableDatesSql, codes);
  const availableDates = (datesResult || []).map((row) => String(row.fecha || '')).filter(Boolean);
  const selectedDate = requestedDate && availableDates.includes(requestedDate)
    ? requestedDate
    : (availableDates[0] || null);

  if (!selectedDate) {
    return {
      ok: true, source: 'aiven', timezone: TIME_ZONE_EXP,
      criteria: { meses_recepcion: months, dias_criticos: criticDays, min_fallas_criticas: criticFailures },
      selected_filters: { estado, zona, fecha: requestedDate || null },
      filters: {
        estados: catalogRows.filter((r) => r.tipo === 'ESTADO').map((r) => r.valor),
        zonas: catalogRows.filter((r) => r.tipo === 'ZONA').map((r) => r.valor)
      },
      available_dates: availableDates, selected_date: null, eligible_equipment_count: codes.length,
      summary: buildSummary_exp([], new Set()), charts: { zonas: [], tipos_equipo: [], estados: [], causa_falla_blt: [], causa_falla_cliente: [] }, tickets: []
    };
  }

  const receptionByCode = new Map(equipmentRows.map((row) => [String(row.codigo_equipo || '').trim(), row.fecha_recepcion_mantenimiento_normalizada]));
  const ticketSql = `
    SELECT
      t.id, t.ticket, t.folio, t.estado_ticket, t.estado, t.ciudad, t.proyecto,
      t.proyecto_padre, t.codigo_equipo, t.referencia_en_zona_operativa, t.zona,
      t.zona_administrativa, t.zona_de_falla, t.descripcion,
      DATE_FORMAT(t.fecha_reporte, '%Y-%m-%d') AS fecha_reporte_fecha, t.h_reporte,
      t.estatus_equipo_ir, DATE_FORMAT(t.fecha_llegada, '%Y-%m-%d') AS fecha_llegada_fecha,
      t.h_llegada, t.persona_que_atiende,
      DATE_FORMAT(t.fecha_cierre, '%Y-%m-%d') AS fecha_cierre_fecha, t.h_solucion,
      t.tecnico, t.estatus_equipo_final, t.causa, t.accion_en_cierre, t.responsabilidad,
      t.causa_falla, t.tiempo_llegada, t.tiempo_solucion, t.tipo_equipo, t.prioridad,
      t.ejecutivo_call, t.blt_empleado, t.tiempo_llegada_ii, t.tiempo_solucion_ii, t.ticket_excede
    FROM tickets t
    WHERE t.codigo_equipo IN (${placeholders}) AND DATE(t.fecha_reporte) = ?
    ORDER BY t.fecha_reporte DESC, t.id DESC
  `;
  const criticalSql = `
    SELECT t.codigo_equipo, COUNT(*) AS fallas_blt
    FROM tickets t
    WHERE t.codigo_equipo IN (${placeholders})
      AND t.fecha_reporte IS NOT NULL
      AND DATE(t.fecha_reporte) >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      AND UPPER(COALESCE(t.responsabilidad, '')) LIKE '%BLT%'
    GROUP BY t.codigo_equipo
    HAVING COUNT(*) >= ?
  `;

  const [ticketResult, criticalResult] = await Promise.all([
    repository.query(ticketSql, [...codes, selectedDate]),
    repository.query(criticalSql, [...codes, criticDays, criticFailures])
  ]);
  const rawTickets = ticketResult[0] || [];
  for (const row of rawTickets) row.fecha_recepcion_mantenimiento_normalizada = receptionByCode.get(String(row.codigo_equipo || '').trim()) || null;
  const criticalCodes = new Set((criticalResult[0] || []).map((row) => String(row.codigo_equipo || '').trim()));
  const mappedTickets = rawTickets.map(mapTicket_exp);
  const bltRows = rawTickets.filter((row) => normalizeResponsibility_exp(row.responsabilidad) === 'BLT');
  const clientRows = rawTickets.filter((row) => normalizeResponsibility_exp(row.responsabilidad) === 'CLIENTE');

  return {
    ok: true,
    source: 'aiven',
    timezone: TIME_ZONE_EXP,
    generated_date: dateKeyInTimeZone_exp(new Date()),
    criteria: { meses_recepcion: months, dias_criticos: criticDays, min_fallas_criticas: criticFailures },
    selected_filters: { estado, zona, fecha: selectedDate },
    filters: {
      estados: catalogRows.filter((r) => r.tipo === 'ESTADO').map((r) => String(r.valor || '').trim()).filter(Boolean),
      zonas: catalogRows.filter((r) => r.tipo === 'ZONA').map((r) => String(r.valor || '').trim()).filter(Boolean)
    },
    available_dates: availableDates,
    selected_date: selectedDate,
    eligible_equipment_count: codes.length,
    summary: buildSummary_exp(rawTickets, criticalCodes),
    charts: {
      zonas: countBy_exp(rawTickets, 'zona'),
      tipos_equipo: countBy_exp(rawTickets, 'tipo_equipo'),
      estados: countBy_exp(rawTickets, 'estado'),
      causa_falla_blt: countBy_exp(bltRows, 'causa_falla', (value) => String(value || '').replace(/^\d+\s*-\s*/, '').trim()),
      causa_falla_cliente: countBy_exp(clientRows, 'causa_falla', (value) => String(value || '').replace(/^\d+\s*-\s*/, '').trim())
    },
    critical_equipment_codes: Array.from(criticalCodes),
    tickets: mappedTickets
  };
}

module.exports = {
  getEntregasRecientes_exp,
  getEntregasRecientes_uni: getEntregasRecientes_exp,
  normalizeTicketStatus_exp,
  normalizeResponsibility_exp,
  buildSummary_exp
};

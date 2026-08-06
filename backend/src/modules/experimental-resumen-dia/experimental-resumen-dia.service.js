'use strict';

const repository = require('./experimental-resumen-dia.repository');

const TIME_ZONE_EXP = 'America/Mexico_City';
const MAX_ARRIVAL_HOURS_EXP = 744;

function normalizeFilter_exp(value) {
  return String(value || '').trim().slice(0, 150);
}

function dateKeyInTimeZone_exp(value) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE_EXP,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(value || new Date());
  const result = {};
  for (const part of parts) {
    if (part.type !== 'literal') result[part.type] = part.value;
  }
  return `${result.year}-${result.month}-${result.day}`;
}

function shiftDateKey_exp(dateKey, days) {
  const match = String(dateKey || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error('Fecha operativa inválida.');
  const shifted = new Date(Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]) + Number(days || 0)
  ));
  return shifted.toISOString().slice(0, 10);
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
  if (normalized.includes('cerr')) return 'cerrado';
  if (normalized.includes('curso') || normalized.includes('proceso')) return 'en_curso';
  if (normalized.includes('abier') || normalized.includes('pend')) return 'abierto';
  return 'otro';
}

function normalizeResponsibility_exp(value) {
  const normalized = normalizeText_exp(value);
  if (normalized.includes('blt')) return 'blt';
  if (normalized.includes('client')) return 'cliente';
  return 'otro';
}

function normalizeFinalEquipmentStatus_exp(value) {
  const normalized = normalizeText_exp(value);
  if (!normalized) return 'sin_dato';
  if (normalized.includes('no func')) return 'no_funcionando';
  if (normalized.includes('func')) return 'funcionando';
  return 'otro';
}

function percentage_exp(value, total) {
  const numerator = Number(value || 0);
  const denominator = Number(total || 0);
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : 0;
}

function finiteArrival_exp(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed >= MAX_ARRIVAL_HOURS_EXP) return null;
  return parsed;
}

function buildSummary_exp(rows) {
  const tickets = Array.isArray(rows) ? rows : [];
  const total = tickets.length;
  let abiertos = 0;
  let cerrados = 0;
  let enCurso = 0;
  let blt = 0;
  let cliente = 0;
  let funcionando = 0;
  let noFuncionando = 0;
  const arrivalHours = [];
  const equiposParados = new Set();

  for (const row of tickets) {
    const status = normalizeTicketStatus_exp(row.estado_ticket);
    if (status === 'abierto') abiertos += 1;
    if (status === 'cerrado') cerrados += 1;
    if (status === 'en_curso') enCurso += 1;

    const responsibility = normalizeResponsibility_exp(row.responsabilidad);
    if (responsibility === 'blt') blt += 1;
    if (responsibility === 'cliente') cliente += 1;

    const arrival = finiteArrival_exp(row.tiempo_llegada);
    if (arrival !== null) arrivalHours.push(arrival);

    if (status !== 'cerrado') {
      const equipmentCode = String(row.codigo_equipo || '').trim();
      if (equipmentCode) equiposParados.add(equipmentCode);
    }

    if (status === 'cerrado') {
      const finalStatus = normalizeFinalEquipmentStatus_exp(row.estatus_equipo_final);
      if (finalStatus === 'funcionando') funcionando += 1;
      if (finalStatus === 'no_funcionando') noFuncionando += 1;
    }
  }

  const pctAbiertos = percentage_exp(abiertos, total);
  const pctCerrados = percentage_exp(cerrados, total);
  const pctEnCurso = total > 0 ? Math.max(0, 100 - pctAbiertos - pctCerrados) : 0;
  const totalCierre = funcionando + noFuncionando;
  const averageArrival = arrivalHours.length
    ? arrivalHours.reduce((sum, value) => sum + value, 0) / arrivalHours.length
    : null;

  return {
    total,
    estado_tickets: {
      abiertos,
      cerrados,
      en_curso: enCurso,
      porcentajes: {
        abiertos: pctAbiertos,
        cerrados: pctCerrados,
        en_curso: pctEnCurso
      }
    },
    promedio_llegada_horas: averageArrival === null ? null : Number(averageArrival.toFixed(2)),
    cierre_dia: {
      funcionando,
      no_funcionando: noFuncionando,
      total: totalCierre,
      porcentaje_funcionando: percentage_exp(funcionando, totalCierre)
    },
    responsabilidad: {
      blt,
      cliente,
      porcentajes: {
        blt: percentage_exp(blt, total),
        cliente: percentage_exp(cliente, total)
      }
    },
    equipos_parados: equiposParados.size
  };
}

function buildFilters_exp(req, startDateTime, endDateTime) {
  const clauses = [
    't.fecha_reporte >= ?',
    't.fecha_reporte < ?'
  ];
  const params = [startDateTime, endDateTime];
  const estado = normalizeFilter_exp(req.query && req.query.estado);
  const zona = normalizeFilter_exp(req.query && req.query.zona);

  if (estado) {
    clauses.push("TRIM(COALESCE(t.estado, '')) = ?");
    params.push(estado);
  }
  if (zona) {
    clauses.push("TRIM(COALESCE(t.zona, '')) = ?");
    params.push(zona);
  }

  return {
    where: clauses.join(' AND '),
    params,
    selected: { estado, zona }
  };
}

async function getResumenDia_exp(req) {
  const today = dateKeyInTimeZone_exp(new Date());
  const yesterday = shiftDateKey_exp(today, -1);
  const tomorrow = shiftDateKey_exp(today, 1);
  const filters = buildFilters_exp(
    req,
    `${yesterday} 00:00:00`,
    `${tomorrow} 00:00:00`
  );

  const ticketsSql = `
    SELECT
      t.id,
      t.ticket,
      t.folio,
      t.estado_ticket,
      t.estado,
      t.zona,
      t.codigo_equipo,
      t.estatus_equipo_final,
      t.responsabilidad,
      t.tiempo_llegada,
      DATE_FORMAT(t.fecha_reporte, '%Y-%m-%d') AS fecha_reporte_fecha
    FROM tickets t
    WHERE ${filters.where}
    ORDER BY t.fecha_reporte DESC, t.id DESC
  `;

  const filterCatalogSql = `
    SELECT catalogo.tipo, catalogo.valor
    FROM (
      SELECT 'ESTADO' AS tipo, TRIM(estado) AS valor
      FROM tickets
      WHERE estado IS NOT NULL AND TRIM(estado) <> ''
      GROUP BY TRIM(estado)
      UNION ALL
      SELECT 'ZONA' AS tipo, TRIM(zona) AS valor
      FROM tickets
      WHERE zona IS NOT NULL AND TRIM(zona) <> ''
      GROUP BY TRIM(zona)
    ) catalogo
    ORDER BY catalogo.tipo ASC, catalogo.valor ASC
  `;

  const [ticketsResult, catalogResult] = await Promise.all([
    repository.query(ticketsSql, filters.params),
    repository.query(filterCatalogSql, [])
  ]);

  const rows = ticketsResult[0] || [];
  const catalogRows = catalogResult[0] || [];
  const todayRows = rows.filter((row) => String(row.fecha_reporte_fecha || '') === today);
  const yesterdayRows = rows.filter((row) => String(row.fecha_reporte_fecha || '') === yesterday);
  const todaySummary = buildSummary_exp(todayRows);
  const yesterdaySummary = buildSummary_exp(yesterdayRows);

  const estados = catalogRows
    .filter((row) => row.tipo === 'ESTADO')
    .map((row) => String(row.valor || '').trim())
    .filter(Boolean);
  const zonas = catalogRows
    .filter((row) => row.tipo === 'ZONA')
    .map((row) => String(row.valor || '').trim())
    .filter(Boolean);

  return {
    ok: true,
    source: 'aiven',
    timezone: TIME_ZONE_EXP,
    period: {
      today,
      yesterday
    },
    selected_filters: filters.selected,
    filters: {
      estados,
      zonas
    },
    today: todaySummary,
    yesterday: yesterdaySummary,
    comparisons: {
      tickets: todaySummary.total - yesterdaySummary.total,
      equipos_parados: todaySummary.equipos_parados - yesterdaySummary.equipos_parados,
      no_funcionando: todaySummary.cierre_dia.no_funcionando - yesterdaySummary.cierre_dia.no_funcionando
    },
    generated_at: new Date().toISOString()
  };
}

module.exports = {
  getResumenDia_exp,
  _test: {
    buildSummary_exp,
    dateKeyInTimeZone_exp,
    shiftDateKey_exp
  }
};

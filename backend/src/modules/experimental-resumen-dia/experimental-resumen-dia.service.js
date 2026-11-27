'use strict';

const repository = require('./experimental-resumen-dia.repository');
const informationRecordScope = require('../../services/information-record-scope-gnral.service');
const canonicalZoneUni = require('../../services/alcance/united-canonical-zone.service');

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
  const pctEnCurso = percentage_exp(enCurso, total);
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

// El supervisor corresponde al equipo y a su zona canónica actual. Un ticket sin
// equipo identificable conserva supervisor vacío; no se infiere por proyecto.
function supervisorJoin_exp(zoneAlias) {
  return `LEFT JOIN portafolio p_sup_exp
    ON p_sup_exp.estado_registro = 1
   AND NULLIF(TRIM(t.codigo_equipo), '') IS NOT NULL
   AND p_sup_exp.numero_equipo = TRIM(t.codigo_equipo)
   AND p_sup_exp.zona_id = ${zoneAlias}.id_zona`;
}

function buildSelection_exp(req, zoneAlias) {
  const clauses = [];
  const params = [];
  const estado = normalizeFilter_exp(req.query && req.query.estado);
  const zona = normalizeFilter_exp(req.query && req.query.zona);
  const supervisor = normalizeFilter_exp(req.query && req.query.supervisor);
  if (estado) {
    clauses.push("TRIM(COALESCE(t.estado, '')) = ?");
    params.push(estado);
  }
  if (zona) {
    clauses.push(canonicalZoneUni.zoneColumnFilterSql_uni(zoneAlias));
    params.push(zona);
  }
  if (supervisor) {
    clauses.push("TRIM(COALESCE(p_sup_exp.supervisor_zona, '')) = ?");
    params.push(supervisor);
  }
  return { sql: clauses.join(' AND ') || '1 = 1', params, selected: { estado, zona, supervisor } };
}

function buildFilters_exp(req, startDateTime, endDateTime) {
  const ticketScope = informationRecordScope.buildTicketScopeSql_gnral(req, 't');
  return {
    where: ['t.fecha_reporte >= ?', 't.fecha_reporte < ?', ticketScope.sql].join(' AND '),
    params: [startDateTime, endDateTime, ...ticketScope.params]
  };
}

function averagePeriods_exp(today, row) {
  const yearStart = today.slice(0, 4) + '-01-01';
  const monthStart = today.slice(0, 7) + '-01';
  const days = start => Math.round((Date.parse(today + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) / 86400000);
  const period = (start, count) => {
    const dias = days(start);
    const tickets = Number(count || 0);
    return { desde:start, hasta:shiftDateKey_exp(today, -1), dias, tickets,
      promedio: dias > 0 ? Number((tickets / dias).toFixed(2)) : null };
  };
  return { mes: period(monthStart, row.month_total), anio: period(yearStart, row.year_total) };
}

function filterOptions_exp(catalogRows, dayRows, previousRows) {
  const fields = { estados:'estado', zonas:'zona', supervisores:'supervisor' };
  const catalog = {};
  const disponibilidad = {};
  for (const [key, field] of Object.entries(fields)) {
    const values = new Map();
    const counts = new Map();
    for (const row of [...catalogRows, ...dayRows, ...previousRows]) {
      const value = String(row[field] || '').trim();
      const normalized = normalizeText_exp(value);
      if (normalized && !values.has(normalized)) values.set(normalized, value);
    }
    for (const row of dayRows) {
      const normalized = normalizeText_exp(row[field]);
      if (normalized) counts.set(normalized, (counts.get(normalized) || 0) + 1);
    }
    catalog[key] = [...values.values()].sort((a,b) => a.localeCompare(b,'es',{sensitivity:'base'}));
    disponibilidad[key] = catalog[key].filter(value => counts.has(normalizeText_exp(value)));
  }
  return { ...catalog, disponibilidad };
}

function mapTicket_exp(row) {
  const text = value => String(value == null ? '' : value).trim();
  return {
    id: row.id,
    ticket: text(row.ticket || row.folio || row.id),
    estado_ticket: text(row.estado_ticket),
    estado_ticket_normalizado: normalizeTicketStatus_exp(row.estado_ticket),
    estado: text(row.estado),
    proyecto: text(row.proyecto),
    zona: text(row.zona),
    zona_legacy: text(row.zona_legacy) || null,
    zona_id_oficial: row.zona_id_oficial == null ? null : Number(row.zona_id_oficial),
    codigo_equipo: text(row.codigo_equipo),
    supervisor: text(row.supervisor),
    descripcion: text(row.descripcion),
    estatus_equipo_ir: text(row.estatus_equipo_ir),
    fecha_reporte: row.fecha_reporte_fecha || null,
    h_reporte: text(row.h_reporte),
    fecha_llegada: row.fecha_llegada_fecha || null,
    h_llegada: text(row.h_llegada),
    tiempo_llegada: row.tiempo_llegada == null ? null : Number(row.tiempo_llegada),
    llegada_valida: finiteArrival_exp(row.tiempo_llegada) !== null,
    fecha_cierre: row.fecha_cierre_fecha || null,
    h_solucion: text(row.h_solucion),
    estatus_equipo_final: text(row.estatus_equipo_final),
    estatus_final_normalizado: normalizeFinalEquipmentStatus_exp(row.estatus_equipo_final),
    causa: text(row.causa),
    accion_en_cierre: text(row.accion_en_cierre),
    responsabilidad: text(row.responsabilidad),
    responsabilidad_normalizada: normalizeResponsibility_exp(row.responsabilidad),
    causa_falla: text(row.causa_falla),
    ticket_excede: text(row.ticket_excede)
  };
}

async function getResumenDia_exp(req, now = new Date()) {
  const today = dateKeyInTimeZone_exp(now);
  const yesterday = shiftDateKey_exp(today, -1);
  const tomorrow = shiftDateKey_exp(today, 1);
  const yearStart = today.slice(0,4) + '-01-01';
  const monthStart = today.slice(0,7) + '-01';
  const zoneAlias = 'z_exp_ticket';
  const selection = buildSelection_exp(req, zoneAlias);
  const filters = buildFilters_exp(req, yesterday + ' 00:00:00', tomorrow + ' 00:00:00');
  const historic = buildFilters_exp(req, yearStart + ' 00:00:00', today + ' 00:00:00');
  const zoneJoinSql = canonicalZoneUni.ticketZoneJoinSql_uni('t', zoneAlias);
  const supervisorJoin = supervisorJoin_exp(zoneAlias);
  const portafolioScope = informationRecordScope.buildPortafolioScopeSql_gnral(req, 'p');
  const zoneScope = informationRecordScope.buildZoneIdScopeSql_gnral(req, 'z.id_zona');

  // Sólo dos días de filas, dentro del alcance autorizado. La selección se
  // calcula con SQL para usar la misma colación que los agregados históricos.
  const ticketsSql = `
    SELECT t.id,t.ticket,t.folio,t.estado_ticket,t.estado,t.proyecto,
      t.zona AS zona_legacy,${zoneAlias}.zona AS zona,
      ${zoneAlias}.id_zona AS zona_id_oficial,t.codigo_equipo,
      TRIM(p_sup_exp.supervisor_zona) AS supervisor,
      t.descripcion,t.estatus_equipo_ir,t.estatus_equipo_final,t.responsabilidad,
      t.tiempo_llegada,t.h_reporte,t.h_llegada,t.h_solucion,t.causa,
      t.accion_en_cierre,t.causa_falla,t.ticket_excede,
      DATE_FORMAT(t.fecha_reporte, '%Y-%m-%d') AS fecha_reporte_fecha,
      DATE_FORMAT(t.fecha_llegada, '%Y-%m-%d') AS fecha_llegada_fecha,
      DATE_FORMAT(t.fecha_cierre, '%Y-%m-%d') AS fecha_cierre_fecha,
      CASE WHEN ${selection.sql} THEN 1 ELSE 0 END AS selected_filter
    FROM tickets t
    ${zoneJoinSql}
    ${supervisorJoin}
    WHERE ${filters.where}
    ORDER BY t.fecha_reporte DESC, t.id DESC
  `;

  // El histórico no viaja al cliente: se devuelven únicamente dos conteos.
  // El día en curso queda excluido del numerador y del denominador.
  const averagesSql = `
    SELECT COUNT(*) AS year_total,
      COALESCE(SUM(CASE WHEN t.fecha_reporte >= ? THEN 1 ELSE 0 END), 0) AS month_total
    FROM tickets t
    ${zoneJoinSql}
    ${selection.selected.supervisor ? supervisorJoin : ''}
    WHERE ${historic.where} AND (${selection.sql})
  `;

  // Catálogo completo de registros vigentes del alcance y de zonas activas,
  // sin consultar todo el histórico de tickets por cada cambio de filtro.
  const filterCatalogSql = `
    SELECT DISTINCT TRIM(p.estado) AS estado, TRIM(z.zona) AS zona,
      TRIM(p.supervisor_zona) AS supervisor
    FROM portafolio p
    INNER JOIN z_op z ON z.id_zona = p.zona_id AND z.estado = 1
    WHERE p.estado_registro = 1 AND (${portafolioScope.sql})
    UNION ALL
    SELECT NULL AS estado, TRIM(z.zona) AS zona, NULL AS supervisor
    FROM z_op z WHERE z.estado = 1 AND (${zoneScope.sql})
  `;
  const [ticketsResult, catalogResult, averagesResult] = await Promise.all([
    repository.query(ticketsSql, [...selection.params, ...filters.params]),
    repository.query(filterCatalogSql, [...portafolioScope.params, ...zoneScope.params]),
    repository.query(averagesSql, [monthStart + ' 00:00:00', ...historic.params, ...selection.params])
  ]);

  const rows = ticketsResult[0] || [];
  const allToday = rows.filter(row => row.fecha_reporte_fecha === today);
  const allYesterday = rows.filter(row => row.fecha_reporte_fecha === yesterday);
  const todayRows = allToday.filter(row => Number(row.selected_filter) === 1);
  const yesterdayRows = allYesterday.filter(row => Number(row.selected_filter) === 1);
  const todaySummary = buildSummary_exp(todayRows);
  const yesterdaySummary = buildSummary_exp(yesterdayRows);
  const zonas = informationRecordScope.zoneCodes_gnral(req);

  return {
    ok: true,
    source: 'aiven',
    timezone: TIME_ZONE_EXP,
    period: { today, yesterday },
    selected_filters: selection.selected,
    alcance: { zona_ids: informationRecordScope.zoneIds_gnral(req), zonas },
    filters: filterOptions_exp(catalogResult[0] || [], allToday, allYesterday),
    today: todaySummary,
    yesterday: yesterdaySummary,
    tickets: todayRows.map(mapTicket_exp),
    promedios: averagePeriods_exp(today, (averagesResult[0] || [])[0] || {}),
    comparisons: {
      tickets: todaySummary.total - yesterdaySummary.total,
      equipos_parados: todaySummary.equipos_parados - yesterdaySummary.equipos_parados,
      no_funcionando: todaySummary.cierre_dia.no_funcionando - yesterdaySummary.cierre_dia.no_funcionando
    },
    generated_at: now.toISOString()
  };
}

module.exports = {
  getResumenDia_exp,
  _test: {
    buildSummary_exp,
    dateKeyInTimeZone_exp,
    shiftDateKey_exp,
    averagePeriods_exp,
    filterOptions_exp
  }
};

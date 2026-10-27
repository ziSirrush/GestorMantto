'use strict';

// BLT NOW | EXPERIMENTAL_NS_F4 | Calculo puro de criticidad; solo entradas NS.
// La pertenencia al proyecto SIEMPRE proviene del equipo vinculado por codigo,
// nunca del nombre de proyecto libre incluido en el ticket.
const TIME_ZONE = 'America/Mexico_City';
const U365_MIN_BLTS = 3;

function todayInMexico(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now);
  const get = type => parts.find(part => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
function offsetDay(key, offset) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key));
  if (!match) throw new Error('Fecha operativa invalida para Experimental NS.');
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + offset));
  return date.toISOString().slice(0, 10);
}
function asText(value) { return value == null ? '' : String(value).trim(); }
function codeKey(value) { return asText(value).toUpperCase(); }
function includes(value, token) { return asText(value).toUpperCase().includes(token); }
function isInactive(value) { return ['SI','SÍ','1','TRUE','INACTIVO'].includes(codeKey(value)); }
function isActiveEquipment(p) {
  return Number(p.estado_registro) === 1 && !isInactive(p.inactivo) &&
    !includes(p.estatus_servicio, 'NO EN SERVICIO') && Boolean(codeKey(p.numero_equipo));
}
function projectKey(p) {
  const project = codeKey(p.proyecto);
  if (!project) return '';
  const id = Number(p.id_proyecto_cobranza);
  if (Number.isSafeInteger(id) && id > 0) return `ID:${id}`;
  // Sin FK unica, no unir proyectos homonimos de zonas diferentes.
  const zone = Number.isSafeInteger(Number(p.zona_id)) && Number(p.zona_id) > 0
    ? String(Number(p.zona_id)) : 'SIN_ZONA';
  return `Z:${zone}:${project}`;
}
function dateKey(row) {
  const raw = asText(row.fecha_dia || row.fecha_reporte);
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(raw);
  return match ? match[1] : '';
}
function roundMetric(value) { return Math.round(value * 1000) / 1000; }
function mtbc(days, count) { return count > 0 ? roundMetric(days / count) : null; }
function asNonEmpty(value, fallback = '') { return asText(value) || fallback; }
function includesMatch(value, search) { return !search || asText(value).toLocaleLowerCase('es-MX').includes(search.toLocaleLowerCase('es-MX')); }
function applyFilters(row, criteria, projectOnly = false) {
  if (criteria.zona && !includesMatch(row.zona, criteria.zona)) return false;
  if (criteria.proyecto && !includesMatch(row.proyecto, criteria.proyecto)) return false;
  if (!projectOnly && criteria.search && ![
    row.codigo_equipo, row.proyecto, row.referencia_en_sitio,
    row.supervisor, row.tickets_busqueda
  ].some(value => includesMatch(value, criteria.search))) return false;
  return true;
}
function byCritical(a, b) {
  return b.fallas_blt_periodo - a.fallas_blt_periodo ||
    String(b.ultimo_blt || '').localeCompare(String(a.ultimo_blt || '')) ||
    String(a.codigo_equipo || a.proyecto).localeCompare(String(b.codigo_equipo || b.proyecto), 'es-MX');
}
function paginate(rows, page, pageSize) {
  return { total: rows.length, page, page_size: pageSize,
    data: rows.slice((page - 1) * pageSize, page * pageSize) };
}
function evaluate(portafolio, tickets, criteria, today = todayInMexico()) {
  const startEquipo = offsetDay(today, -criteria.equipos.dias);
  const startProyecto = offsetDay(today, -criteria.proyectos.dias);
  const startU365 = offsetDay(today, -364);
  const janFirst = today.slice(0, 4) + '-01-01';
  const elapsedYear = 1 + Math.round((Date.parse(today + 'T00:00:00Z') - Date.parse(janFirst + 'T00:00:00Z')) / 86400000);
  const portfolioByCode = new Map();
  for (const p of portafolio) {
    if (!isActiveEquipment(p)) continue;
    const key = codeKey(p.numero_equipo);
    if (portfolioByCode.has(key)) {
      const error = new Error('Codigo de equipo duplicado en Portafolio NS; no es posible calcular criticidad con seguridad.');
      error.statusCode = 503;
      error.code = 'EXPERIMENTAL_NS_DUPLICATE_EQUIPMENT';
      throw error;
    }
    portfolioByCode.set(key, p);
  }

  const byEquipo = new Map();
  for (const code of portfolioByCode.keys()) byEquipo.set(code, []);
  let ticketsSinEquipo = 0;
  let discrepancies = 0;
  for (const t of tickets) {
    const key = codeKey(t.codigo_equipo);
    const p = portfolioByCode.get(key);
    if (!p) { ticketsSinEquipo++; continue; }
    const date = dateKey(t);
    if (!date || date > today) continue;
    if (asText(t.proyecto) && asText(p.proyecto) && codeKey(t.proyecto) !== codeKey(p.proyecto)) discrepancies++;
    byEquipo.get(key).push({ ...t, fecha_dia: date, codigo_equipo: asText(p.numero_equipo),
      proyecto_oficial: asText(p.proyecto), zona_oficial: asText(p.zona_operativa) });
  }
  const equipos = [];
  const u365 = [];
  const projects = new Map();
  const allEquipment = new Map();

  for (const [code, p] of portfolioByCode) {
    const all = byEquipo.get(code);
    const period = all.filter(t => t.fecha_dia >= startEquipo);
    const periodBlts = period.filter(t => includes(t.responsabilidad, 'BLT'));
    const periodClients = period.filter(t => includes(t.responsabilidad, 'CLIENTE'));
    const projectPeriodBlts = all.filter(t => t.fecha_dia >= startProyecto && includes(t.responsabilidad, 'BLT'));
    const yearRows = all.filter(t => t.fecha_dia >= janFirst);
    const yearBlts = yearRows.filter(t => includes(t.responsabilidad, 'BLT'));
    const last365Rows = all.filter(t => t.fecha_dia >= startU365);
    const u365Blts = last365Rows.filter(t => includes(t.responsabilidad, 'BLT'));
    const outside = yearRows.filter(t => t.fecha_dia < startEquipo);
    const lastBLT = periodBlts.reduce((acc, t) => t.fecha_dia > acc ? t.fecha_dia : acc, '');
    const lastClient = all.filter(t => includes(t.responsabilidad, 'CLIENTE'))
      .reduce((acc, t) => t.fecha_dia > acc ? t.fecha_dia : acc, '');
    const lastU365 = u365Blts.reduce((acc, t) => t.fecha_dia > acc ? t.fecha_dia : acc, '');
    const row = {
      codigo_equipo: asText(p.numero_equipo), proyecto: asText(p.proyecto),
      proyecto_clave: projectKey(p), zona: asText(p.zona_operativa), ciudad: asText(p.ciudad),
      referencia_en_sitio: asText(p.identificacion_sitio),
      supervisor: asText(p.supervisor_zona), superintendente: asText(p.superintendente),
      estatus_servicio: asText(p.estatus_servicio),
      calls_anio: yearRows.length, fallas_blt_periodo: periodBlts.length,
      resp_cliente_periodo: periodClients.length,
      fallas_blt_fuera_periodo: outside.filter(t => includes(t.responsabilidad, 'BLT')).length,
      resp_cliente_fuera_periodo: outside.filter(t => includes(t.responsabilidad, 'CLIENTE')).length,
      fallas_blt_anio: yearBlts.length, fallas_blt_365: u365Blts.length,
      llamadas_365: last365Rows.length,
      ultimo_blt: lastBLT, ultimo_cliente: lastClient, ultima_falla_blt_365: lastU365,
      mtbc_dias: mtbc(criteria.equipos.dias, periodBlts.length),
      mtbc_anio: mtbc(elapsedYear, yearBlts.length),
      mtbc_365: mtbc(365, u365Blts.length),
      tickets_busqueda: all.filter(t => t.fecha_dia >= startEquipo).map(t => asText(t.ticket)).join(' ')
    };
    allEquipment.set(code, row);
    if (periodBlts.length >= criteria.equipos.min_fallas && applyFilters(row, criteria.equipos)) equipos.push(row);
    if (u365Blts.length >= U365_MIN_BLTS && applyFilters(row, criteria.equipos)) u365.push(row);

    const pKey = projectKey(p);
    if (!pKey) continue;
    if (!projects.has(pKey)) projects.set(pKey, {
      proyecto_clave: pKey, proyecto: asText(p.proyecto), zona: asText(p.zona_operativa),
      ciudad: asText(p.ciudad), supervisor: asText(p.supervisor_zona),
      equipos_activos: 0, fallas_blt_periodo: 0, equipos_con_falla: 0,
      equipos_criticos: 0, fallas_blt_anio: 0, fallas_blt_365: 0,
      equipos_con_falla_blt_anio: 0, equipos_con_falla_blt_365: 0,
      ultimo_blt: '', equipos_con_codigo: [],
    });
    const proj = projects.get(pKey);
    proj.equipos_activos++;
    proj.equipos_con_codigo.push(code);
    proj.fallas_blt_periodo += projectPeriodBlts.length;
    if (projectPeriodBlts.length > 0) proj.equipos_con_falla++;
    if (projectPeriodBlts.length >= criteria.proyectos.min_fallas_equipo) proj.equipos_criticos++;
    proj.fallas_blt_anio += yearBlts.length;
    proj.fallas_blt_365 += u365Blts.length;
    if (yearBlts.length) proj.equipos_con_falla_blt_anio++;
    if (u365Blts.length) proj.equipos_con_falla_blt_365++;
    const ultimoProyecto = projectPeriodBlts.reduce((acc, t) => t.fecha_dia > acc ? t.fecha_dia : acc, '');
    if (ultimoProyecto > proj.ultimo_blt) proj.ultimo_blt = ultimoProyecto;
  }

  const proyectos = [...projects.values()]
    .filter(row => row.fallas_blt_periodo >= criteria.proyectos.min_fallas && applyFilters(row, criteria.proyectos, true))
    .map(row => ({ ...row,
      mtbc_anio: row.fallas_blt_anio ? mtbc(elapsedYear * row.equipos_con_falla_blt_anio, row.fallas_blt_anio) : null,
      mtbc_365: row.fallas_blt_365 ? mtbc(365 * row.equipos_con_falla_blt_365, row.fallas_blt_365) : null,
      equipos_con_codigo: undefined
    }));
  equipos.sort(byCritical);
  proyectos.sort(byCritical);
  u365.sort((a,b) => b.llamadas_365 - a.llamadas_365 || b.fallas_blt_365 - a.fallas_blt_365 || a.codigo_equipo.localeCompare(b.codigo_equipo));

  const details = {
    equipo(code, dias) {
      const key = codeKey(code);
      if (!portfolioByCode.has(key)) return [];
      const start = offsetDay(today, -dias);
      return byEquipo.get(key).filter(t => t.fecha_dia >= start && includes(t.responsabilidad, 'BLT'))
        .sort((a,b) => b.fecha_dia.localeCompare(a.fecha_dia) || Number(b.id || 0) - Number(a.id || 0));
    },
    proyecto(key, dias) {
      const k = asText(key);
      const project = projects.get(k);
      if (!project) return [];
      const start = offsetDay(today, -dias);
      return project.equipos_con_codigo.flatMap(code => byEquipo.get(code).filter(t =>
        t.fecha_dia >= start && includes(t.responsabilidad, 'BLT')))
        .sort((a,b) => b.fecha_dia.localeCompare(a.fecha_dia) || Number(b.id || 0) - Number(a.id || 0));
    }
  };

  return {
    hoy: today, calendario: { periodo_equipos_desde: startEquipo, periodo_proyectos_desde: startProyecto, u365_desde: startU365 },
    equipos: paginate(equipos, criteria.equipos.page, criteria.equipos.page_size),
    proyectos: paginate(proyectos, criteria.proyectos.page, criteria.proyectos.page_size),
    u365: { total: u365.length, data: u365.slice(0, 1000), limitado: u365.length > 1000 },
    calidad: { equipos_visibles: portfolioByCode.size, tickets_sin_equipo_activo: ticketsSinEquipo, tickets_proyecto_discrepante: discrepancies },
    details
  };
}
module.exports = { evaluate, todayInMexico, offsetDay, projectKey, U365_MIN_BLTS };

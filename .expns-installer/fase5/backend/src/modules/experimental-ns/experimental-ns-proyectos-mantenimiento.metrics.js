'use strict';

// BLT NOW | EXPERIMENTAL_NS_F5 | Metricas puras: NUNCA cruzar Tickets por nombre.
// El proyecto de cada ticket es el que indica ns_portafolio_pruebas.numero_equipo.
const { todayInMexico, offsetDay, projectKey } = require('./experimental-ns-equipos-criticos.metrics');
const STATUS_STOP = /(NO\s+FUNC|PARAD|NO\s+OPER)/;
const STATUS_INACTIVE = new Set(['SI','SÍ','1','TRUE','INACTIVO']);

function text(value) { return value == null ? '' : String(value).trim(); }
function norm(value) { return text(value).toLocaleUpperCase('es-MX'); }
function contains(value, token) { return norm(value).includes(token); }
function dateKey(value) { const match = /^(\d{4}-\d{2}-\d{2})/.exec(text(value)); return match ? match[1] : ''; }
function number(value) { const n=Number(value); return Number.isFinite(n)?n:0; }
function pct(part,total) { return total > 0 ? Math.round(part / total * 100):0; }
function round3(n) { return Math.round(n * 1000)/1000; }
function daysBetween(start,end) {return Math.max(0,Math.round((Date.parse(end+'T00:00:00Z')-Date.parse(start+'T00:00:00Z')) / 86400000));}
function isActive(row) {
  return Number(row.estado_registro) === 1 && !STATUS_INACTIVE.has(norm(row.inactivo)) &&
    !contains(row.estatus_servicio,'NO EN SERVICIO') && Boolean(norm(row.numero_equipo));
}
function boundedNumber(raw, fallback, min, max, label) {
  if (raw === undefined || raw === null || raw === '') return fallback;
  if (typeof raw !== 'string' && typeof raw !== 'number') throw invalid(`Parametro ${label} invalido.`);
  if (!/^\d+$/.test(String(raw)) || !Number.isSafeInteger(Number(raw))) throw invalid(`Parametro ${label} debe ser entero.`);
  const n = Number(raw);
  if (n < min || n > max) throw invalid(`Parametro ${label} fuera de rango.`);
  return n;
}
function boundedText(raw, max, label) {
  if (raw === undefined || raw === null || raw === '') return '';
  if (typeof raw !== 'string' || raw.length > max || /[\x00-\x1f\x7f]/.test(raw)) throw invalid(`Parametro ${label} invalido.`);
  return raw.trim();
}
function invalid(message) { const e = new Error(message); e.statusCode = 400; e.code = 'EXPERIMENTAL_NS_PROJECT_FILTER_INVALID'; return e; }
function unavailable(message, code) { const e = new Error(message); e.statusCode = 503; e.code = code; return e; }
function parseCriteria(query = {}) {
  return {
    zona:boundedText(query.zona,120,'zona'),
    estado:boundedText(query.estado,150,'estado'),
    supervisor:boundedText(query.supervisor,150,'supervisor'),
    search:boundedText(query.search,180,'search'),
    page:boundedNumber(query.page,1,1,100000,'page'),
    page_size:boundedNumber(query.page_size,30,5,100,'page_size'),
    dias_criticos:boundedNumber(query.dias_criticos,35,1,3650,'dias_criticos'),
    min_fallas:boundedNumber(query.min_fallas,3,1,9999,'min_fallas')
  };
}
function groupKey(p) {
  const key=projectKey(p);
  // No construir identidades basadas en texto cuando falta zona e ID canonico.
  if (key.startsWith('Z:SIN_ZONA:')) return '';
  return key;
}
function isoToday(today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(today)) || Number.isNaN(Date.parse(today+'T00:00:00Z')))
    throw new Error('Calendario de referencia invalido.');
  return today;
}
function sortTickets(a,b) {
  return text(b.fecha_reporte).localeCompare(text(a.fecha_reporte)) || number(b.id)-number(a.id);
}
function defaultMonthCounts(year) {
  return Array.from({length:12},(_,i)=>({mes:`${year}-${String(i+1).padStart(2,'0')}`,total:0}));
}
function monthCounts(tickets, year) {
  const months=defaultMonthCounts(year);
  for (const t of tickets) {
    const d=dateKey(t.fecha_reporte);
    if (!d.startsWith(String(year)+'-')) continue;
    const m=Number(d.slice(5,7));
    if (m>=1 && m<=12) months[m-1].total++;
  }
  return months;
}
function calc(portafolio, tickets, criteria, now = todayInMexico()) {
  const today=isoToday(now);
  const last35=offsetDay(today,-35);
  const last365=offsetDay(today,-364);
  const yearStart=today.slice(0,4)+'-01-01';
  const elapsedYear=1+daysBetween(yearStart,today);
  const prevYear=Number(today.slice(0,4))-1;
  const zoneList=new Set(), statesList=new Set(), supervisorsList=new Set();
  const byCode=new Map(), byProject=new Map();
  const quality={tickets_sin_equipo_activo:0,tickets_proyecto_discrepante:0,
    equipos_sin_proyecto_verificable:0,proyectos_identidad_provisional:0,
    tickets_sin_fecha_valida:0,tickets_fecha_futura:0};

  // Solo equipos activos/canonicos y con proyecto que puede acotarse a una zona.
  for (const p of portafolio || []) {
    if (!isActive(p)) continue;
    const code=norm(p.numero_equipo);
    if (byCode.has(code)) throw unavailable(
      'Hay equipos con codigo duplicado en Portafolio NS: se cancela para no mezclar proyectos.',
      'EXPERIMENTAL_NS_PROJECT_DUPLICATE_EQUIPMENT');
    const key=groupKey(p);
    if (!key) { quality.equipos_sin_proyecto_verificable++; continue; }
    byCode.set(code,{...p,projectKey:key});
    if (!byProject.has(key)) {
      const provisional=key.startsWith('Z:');
      byProject.set(key,{
        proyecto_clave:key,proyecto:text(p.proyecto),proyecto_codigo:text(p.proyecto),
        proyecto_nombre:text(p.proyecto_cc_x_port)||text(p.proyecto),
        zona:text(p.zona_operativa),ciudad:text(p.ciudad),estado:text(p.estado),
        supervisor:text(p.supervisor_zona),zona_id:p.zona_id,
        identidad:provisional?'ZONA_NOMBRE_NO_VERIFICADO':'ID_PROYECTO',
        _equipos:[],_tickets:[]
      });
      if (provisional) quality.proyectos_identidad_provisional++;
    } else if (key.startsWith('ID:') && norm(byProject.get(key).proyecto)!==norm(p.proyecto)) {
      // Mismo ID con etiquetas distintas: no suponer que son un unico proyecto.
      throw unavailable('Conflicto entre ID de proyecto y nombres de equipos en NetSuite.',
        'EXPERIMENTAL_NS_PROJECT_ID_CONFLICT');
    }
    byProject.get(key)._equipos.push(p);
  }

  const ticketsByCode=new Map([...byCode.keys()].map(code=>[code,[]]));
  const seenTicketId=new Set();
  for (const t of tickets || []) {
    const id=text(t.id);
    if (id && seenTicketId.has(id)) throw unavailable('Ticket duplicado dentro de la muestra NS.',
      'EXPERIMENTAL_NS_PROJECT_DUPLICATE_TICKET');
    if (id) seenTicketId.add(id);
    const code=norm(t.codigo_equipo), p=byCode.get(code);
    if (!p) {quality.tickets_sin_equipo_activo++;continue;}
    const day=dateKey(t.fecha_reporte);
    if (!day || Number.isNaN(Date.parse(day+'T00:00:00Z'))) {quality.tickets_sin_fecha_valida++;continue;}
    if (day>today) {quality.tickets_fecha_futura++;continue;}
    if (text(t.proyecto) && norm(t.proyecto)!==norm(p.proyecto)) quality.tickets_proyecto_discrepante++;
    const normalized={...t,fecha_dia:day,proyecto_oficial:text(p.proyecto),
      zona_oficial:text(p.zona_operativa),codigo_equipo:text(p.numero_equipo)};
    ticketsByCode.get(code).push(normalized);
    byProject.get(p.projectKey)._tickets.push(normalized);
  }

  const projects=[];
  for (const project of byProject.values()) {
    const equipments=[];
    let faults365=0, equipmentsWithFault365=0, stops=0, critical=0;
    let faultsYear=0, equipmentsWithFaultYear=0;
    for (const p of project._equipos) {
      const equipmentTickets=(ticketsByCode.get(norm(p.numero_equipo))||[]).sort(sortTickets);
      const yearRows=equipmentTickets.filter(t=>t.fecha_dia>=yearStart);
      const u365=equipmentTickets.filter(t=>t.fecha_dia>=last365 && contains(t.responsabilidad,'BLT'));
      const yearBlt=yearRows.filter(t=>contains(t.responsabilidad,'BLT'));
      const recentBlt=equipmentTickets.filter(t=>t.fecha_dia>=offsetDay(today,-criteria.dias_criticos) && contains(t.responsabilidad,'BLT'));
      if (recentBlt.length>=criteria.min_fallas) critical++;
      faults365+=u365.length;
      faultsYear+=yearBlt.length;
      if (u365.length) equipmentsWithFault365++;
      if (yearBlt.length) equipmentsWithFaultYear++;
      const latest=equipmentTickets[0]||null;
      const latestState=norm(latest?.estatus_equipo_final);
      const stopped=latest && STATUS_STOP.test(latestState);
      if (stopped) stops++;
      equipments.push({
        numero_equipo:text(p.numero_equipo),identificacion_sitio:text(p.identificacion_sitio),
        tipo_equipo:text(p.producto), contrato:text(p.tipo_poliza)||text(p.categoria),
        estado_operativo:latest ? (stopped?'Parado':contains(latestState,'FUNC')?'Funcionando':'Sin dato'):'Sin dato',
        dias_parado:stopped?daysBetween(latest.fecha_dia,today):null,
        ultimo_ticket:latest?.ticket||null,ultima_llamada:latest?.fecha_reporte||null,
        fallas_blt_anio:yearBlt.length,fallas_blt_365:u365.length,
        mtbc_anio:yearBlt.length?round3(elapsedYear/yearBlt.length):null,
        mtbc_365:u365.length?round3(365/u365.length):null
      });
    }
    const ts=project._tickets.sort(sortTickets);
    const yearTickets=ts.filter(t=>t.fecha_dia>=yearStart);
    const bltYear=yearTickets.filter(t=>contains(t.responsabilidad,'BLT'));
    const clientYear=yearTickets.filter(t=>contains(t.responsabilidad,'CLIENTE'));
    const bltAll=ts.filter(t=>contains(t.responsabilidad,'BLT'));
    const clientAll=ts.filter(t=>contains(t.responsabilidad,'CLIENTE'));
    const lastClient=clientAll[0]?.fecha_reporte||null;
    const lastBlt=bltAll[0]?.fecha_reporte||null;
    projects.push({
      proyecto_clave:project.proyecto_clave,proyecto:project.proyecto,proyecto_codigo:project.proyecto_codigo,
      proyecto_nombre:project.proyecto_nombre,ciudad:project.ciudad,estado:project.estado,
      zona:project.zona,zona_oficial:project.zona,supervisor:project.supervisor,
      identidad:project.identidad,equipos:equipments.length,parados:stops,
      llamadas_total_anio:yearTickets.length,ultima_llamada:ts[0]?.fecha_reporte||null,
      llamadas_blt_anio:bltYear.length,ultima_llamada_blt:lastBlt,
      llamadas_cliente_anio:clientYear.length,ultima_llamada_cliente:lastClient,
      tickets_35d:ts.filter(t=>t.fecha_dia>=last35).length,
      fallas_blt_365d:faults365,equipos_con_falla_blt_365:equipmentsWithFault365,
      fallas_blt_anio:faultsYear,equipos_con_falla_blt_anio:equipmentsWithFaultYear,
      equipos_criticos:critical,mtbc_anio:faultsYear?round3(elapsedYear*equipmentsWithFaultYear/faultsYear):null,
      mtbc_365:faults365?round3(365*equipmentsWithFault365/faults365):null,
      _equipos:equipments,_tickets:ts,
      _all:project
    });
    if (project.zona) zoneList.add(project.zona);
    if (project.estado) statesList.add(project.estado);
    if (project.supervisor) supervisorsList.add(project.supervisor);
  }
  projects.sort((a,b)=>a.proyecto_nombre.localeCompare(b.proyecto_nombre,'es-MX')||a.proyecto_clave.localeCompare(b.proyecto_clave));
  const filters={
    zonas:[...zoneList].sort((a,b)=>a.localeCompare(b,'es-MX')),
    estados:[...statesList].sort((a,b)=>a.localeCompare(b,'es-MX')),
    supervisores:[...supervisorsList].sort((a,b)=>a.localeCompare(b,'es-MX'))
  };
  const filtered=projects.filter(p=>(!criteria.zona||norm(p.zona)===norm(criteria.zona))&&
    (!criteria.estado||norm(p.estado)===norm(criteria.estado))&&
    (!criteria.supervisor||norm(p.supervisor)===norm(criteria.supervisor))&&
    (!criteria.search||[
      p.proyecto,p.proyecto_nombre,p.ciudad,p.estado,p.zona,p.supervisor,p.proyecto_clave,
      ...p._equipos.map(e=>e.numero_equipo)
    ].some(s=>norm(s).includes(norm(criteria.search)))));
  const summary=filtered.reduce((acc,p)=>{
    acc.proyectos++;acc.equipos+=p.equipos;acc.parados+=p.parados;
    acc.fallas_blt_365d+=p.fallas_blt_365d;acc.equipos_con_falla_blt_365+=p.equipos_con_falla_blt_365;
    return acc;
  },{proyectos:0,equipos:0,parados:0,fallas_blt_365d:0,equipos_con_falla_blt_365:0});
  summary.mtbc_365=summary.fallas_blt_365d
    ?round3(365*summary.equipos_con_falla_blt_365/summary.fallas_blt_365d):null;
  const start=(criteria.page-1)*criteria.page_size;
  const publicRow=p=>{const { _equipos,_tickets,_all,...safe }=p;return safe;};

  function detail(key) {
    const p=filtered.find(row=>row.proyecto_clave===key);
    if (!p) return null;
    const totalTickets=p._tickets.length, totalEquipos=p._equipos.length;
    const ticketsList=p._tickets.slice(0,1000).map(t=>({
      id:t.id,ticket:t.ticket,codigo_equipo:t.codigo_equipo,estado_ticket:t.estado_ticket,
      fecha_reporte:t.fecha_reporte,fecha_cierre:t.fecha_cierre,responsabilidad:t.responsabilidad,
      causa:t.causa,causa_falla:t.causa_falla,custeventblt_mot_det:t.custeventblt_mot_det
    }));
    const counts=new Map();
    for(const t of p._tickets){const label=text(t.responsabilidad)||'Sin dato';counts.set(label,(counts.get(label)||0)+1);}
    const responsabilidad=[...counts.entries()].map(([responsabilidad,total])=>({responsabilidad,total}))
      .sort((a,b)=>b.total-a.total||a.responsabilidad.localeCompare(b.responsabilidad,'es-MX'));
    return {
      proyecto:publicRow(p),equipos:p._equipos.slice(0,500),tickets:ticketsList,
      mensual_actual:monthCounts(p._tickets,Number(today.slice(0,4))),
      mensual_anterior:monthCounts(p._tickets,prevYear),responsabilidad,
      total:{equipos:totalEquipos,tickets:totalTickets},
      limitado:{equipos:totalEquipos>500,tickets:totalTickets>1000}
    };
  }
  return {
    hoy:today,criteria,filters,summary,quality,
    total:filtered.length,rows:filtered.slice(start,start+criteria.page_size).map(publicRow),
    detalle:detail
  };
}

module.exports = {calc,parseCriteria,groupKey,dateKey,isActive,pct};

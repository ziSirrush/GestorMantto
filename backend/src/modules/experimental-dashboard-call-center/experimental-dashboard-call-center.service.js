'use strict';

const repository = require('./experimental-dashboard-call-center.repository');

function clean_uni(value, max = 180) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function date_uni(value) {
  const s = clean_uni(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

function normalize_uni(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

function status_uni(value) {
  const s = normalize_uni(value);
  if (s.includes('cerr')) return 'cerrado';
  if (s.includes('curso') || s.includes('proceso')) return 'en_curso';
  if (s.includes('abier') || s.includes('pend')) return 'abierto';
  return 'otro';
}

function responsibility_uni(value) {
  const s = normalize_uni(value);
  if (s.includes('blt') || s.includes('correctivo')) return 'blt';
  if (s.includes('client')) return 'cliente';
  return 'otro';
}

function isSlaExceeded_uni(row) {
  const marker = normalize_uni(row.ticket_excede);
  if (marker && marker !== 'null' && marker !== 'no' && marker !== '0') return true;
  const ii = Number(row.tiempo_llegada_ii);
  return Number.isFinite(ii) && ii > 0;
}

function isNoFuncionando_uni(value) {
  return normalize_uni(value).includes('no func');
}

function buildWhere_uni(req) {
  const from = date_uni(req.query && req.query.desde);
  const to = date_uni(req.query && req.query.hasta);
  const zona = clean_uni(req.query && req.query.zona);
  const clauses = ['t.fecha_reporte IS NOT NULL'];
  const params = [];
  if (from) { clauses.push('t.fecha_reporte >= ?'); params.push(`${from} 00:00:00`); }
  if (to) { clauses.push('t.fecha_reporte < DATE_ADD(?, INTERVAL 1 DAY)'); params.push(`${to} 00:00:00`); }
  if (zona) { clauses.push("TRIM(COALESCE(t.zona,'')) = ?"); params.push(zona); }
  return { sql: clauses.join(' AND '), params, selected: { desde: from, hasta: to, zona } };
}

function countBy_uni(rows, getter) {
  const map = new Map();
  for (const row of rows) {
    const key = clean_uni(getter(row)) || 'Sin dato';
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()].map(([label, value]) => ({ label, value })).sort((a,b) => b.value-a.value || a.label.localeCompare(b.label));
}

function summarize_uni(rows) {
  const tickets = Array.isArray(rows) ? rows : [];
  const states = { abiertos:0, en_curso:0, cerrados:0, otros:0 };
  const resp = { blt:0, cliente:0, otros:0 };
  const vobo = { validado:0, pendiente:0, rechazado:0, requiere_informacion:0, escalado:0, otros:0 };
  const equipos = new Set();
  const critical = new Map();
  let sla = 0;
  let noFuncionando = 0;

  for (const row of tickets) {
    const st = status_uni(row.estado_ticket);
    if (st === 'abierto') states.abiertos++; else if (st === 'en_curso') states.en_curso++; else if (st === 'cerrado') states.cerrados++; else states.otros++;
    const rs = responsibility_uni(row.responsabilidad);
    if (rs === 'blt') resp.blt++; else if (rs === 'cliente') resp.cliente++; else resp.otros++;
    const vb = normalize_uni(row.vobo_estado);
    if (!vb || vb === 'pendiente') vobo.pendiente++;
    else if (vb === 'validado') vobo.validado++;
    else if (vb.includes('rechaz')) vobo.rechazado++;
    else if (vb.includes('requiere')) vobo.requiere_informacion++;
    else if (vb.includes('escal')) vobo.escalado++;
    else vobo.otros++;
    if (isSlaExceeded_uni(row)) sla++;
    if (isNoFuncionando_uni(row.estatus_equipo_final)) noFuncionando++;
    const code = clean_uni(row.codigo_equipo);
    if (code) {
      equipos.add(code);
      if (rs === 'blt') {
        const item = critical.get(code) || { codigo_equipo:code, proyecto:row.proyecto||'', ciudad:row.ciudad||'', zona:row.zona||'', fallas_blt:0, total_tickets:0, ultimo_ticket:null };
        item.fallas_blt++;
        item.total_tickets++;
        if (!item.ultimo_ticket || String(row.fecha_reporte) > String(item.ultimo_ticket)) item.ultimo_ticket = row.fecha_reporte;
        critical.set(code, item);
      }
    }
  }

  const criticos = [...critical.values()].filter(x => x.fallas_blt >= 3).sort((a,b) => b.fallas_blt-a.fallas_blt).slice(0,50);
  return {
    total: tickets.length,
    estados: states,
    responsabilidad: resp,
    vobo,
    fuera_sla: sla,
    equipos_unicos: equipos.size,
    equipos_criticos: criticos.length,
    no_funcionando: noFuncionando,
    criticos,
    distribuciones: {
      zona: countBy_uni(tickets, r => r.zona),
      tipo_equipo: countBy_uni(tickets, r => r.tipo_equipo),
      estado_republica: countBy_uni(tickets, r => r.estado),
      causa_falla_blt: countBy_uni(tickets.filter(r => responsibility_uni(r.responsabilidad)==='blt'), r => r.causa_falla),
      causa_falla_cliente: countBy_uni(tickets.filter(r => responsibility_uni(r.responsabilidad)==='cliente'), r => r.causa_falla)
    }
  };
}

async function getDashboard_uni(req) {
  const filter = buildWhere_uni(req);
  const sql = `
    SELECT
      t.id, t.ticket, t.folio, t.estado_ticket, t.estado, t.ciudad, t.proyecto,
      t.codigo_equipo, t.referencia_en_zona_operativa, t.zona, t.descripcion,
      t.fecha_reporte, t.estatus_equipo_ir, t.fecha_llegada, t.fecha_cierre,
      t.estatus_equipo_final, t.causa, t.accion_en_cierre, t.responsabilidad,
      t.causa_falla, t.tiempo_llegada, t.tiempo_solucion, t.tipo_equipo,
      t.prioridad, t.ejecutivo_call, t.tiempo_llegada_ii, t.tiempo_solucion_ii,
      t.ticket_excede, t.zona_administrativa, t.zona_de_falla, t.proyecto_padre,
      t.vobo_estado
    FROM tickets t
    WHERE ${filter.sql}
    ORDER BY t.fecha_reporte DESC, t.id DESC
    LIMIT 10000
  `;
  const catalogSql = `SELECT TRIM(zona) AS zona FROM tickets WHERE zona IS NOT NULL AND TRIM(zona)<>'' GROUP BY TRIM(zona) ORDER BY zona`;
  const [ticketsResult, zonesResult] = await Promise.all([
    repository.query(sql, filter.params), repository.query(catalogSql, [])
  ]);
  const rows = ticketsResult[0] || [];
  return {
    ok:true,
    source:'aiven',
    selected_filters:filter.selected,
    filters:{ zonas:(zonesResult[0]||[]).map(r=>r.zona) },
    summary:summarize_uni(rows),
    tickets:rows,
    generated_at:new Date().toISOString()
  };
}

module.exports = { getDashboard_uni, _test:{ summarize_uni, status_uni, responsibility_uni, isSlaExceeded_uni } };

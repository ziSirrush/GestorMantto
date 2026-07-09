(function(){
  const MODULE_VERSION = '20260706-v014';
  const state = { loaded:false, filtersLoaded:false, rows:[], summary:null, currentProject:null };

  const INLINE_HTML = '<div class="proy-page"><section class="proy-card proy-head"><div><p class="proy-eyebrow">Aiven · Proyectos</p><h1>Proyectos</h1><p>Vista agregada desde Portafolio y Tickets.</p></div><div class="proy-head-actions"><span class="proy-status loading" id="proy-status"><span class="proy-dot"></span><span>Cargando Aiven...</span></span><button type="button" class="proy-btn proy-btn-primary" data-proy-action="refresh">↻ Actualizar</button></div></section><section class="proy-card proy-filters"><label>Zona<select id="proy-filter-zona"><option value="">Todas</option></select></label><label>Estado<select id="proy-filter-estado"><option value="">Todos</option></select></label><label>Supervisor<select id="proy-filter-supervisor"><option value="">Todos</option></select></label><label>Buscar<input id="proy-filter-search" type="search" placeholder="Proyecto, código, ciudad, supervisor..."></label><button type="button" class="proy-btn" data-proy-action="clear">Limpiar</button><button type="button" class="proy-btn proy-btn-primary" data-proy-action="apply">Aplicar</button></section><section class="proy-grid proy-kpis"><article class="proy-kpi proy-kpi-blue"><span>🏢</span><strong id="proy-kpi-proyectos">—</strong><b>Proyectos</b><small>con equipos activos</small></article><article class="proy-kpi proy-kpi-indigo"><span>🛠️</span><strong id="proy-kpi-equipos">—</strong><b>Equipos</b><small>portafolio activo</small></article><article class="proy-kpi proy-kpi-red"><span>⛔</span><strong id="proy-kpi-parados">—</strong><b>Parados</b><small>último ticket no funcionando</small></article><article class="proy-kpi proy-kpi-green"><span>⏱️</span><strong id="proy-kpi-mtbc">—</strong><b>MTBC prom.</b><small>estimado 365 días</small></article></section><section class="proy-card"><div class="proy-section-head"><div><h2>Listado de proyectos</h2><p id="proy-count">—</p></div></div><div class="proy-table-wrap"><table class="proy-table"><thead><tr><th>Proyecto</th><th>Ciudad</th><th>Estado</th><th>Zona</th><th>Supervisor</th><th>Equipos</th><th>Parados</th><th>Tickets 35d</th><th>BLT 365d</th><th>MTBC</th><th></th></tr></thead><tbody id="proy-body"><tr><td colspan="11" class="proy-empty">Cargando...</td></tr></tbody></table></div></section><section id="proy-detail-modal" class="proy-detail" hidden><div class="proy-detail-panel"><div class="proy-detail-head"><button type="button" id="proy-detail-close">×</button><div><h2 id="proy-detail-title">Detalle de proyecto</h2><p id="proy-detail-sub">Aiven</p></div></div><div class="proy-detail-body" id="proy-detail-body"></div></div></section></div>';

  function API(){ return (window.MANTTO_API_BASE || '').replace(/\/$/, ''); }
  function $(id){ return document.getElementById(id); }
  function esc(v){ return String(v == null || v === '' ? '—' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function int(v){ const n = Number(v || 0); return Number.isFinite(n) ? n.toLocaleString('es-MX') : '0'; }
  function num(v){ const n = Number(v || 0); return Number.isFinite(n) ? n : 0; }
  function val(id){ const el=$(id); return el ? el.value.trim() : ''; }
  function qs(params){ const u = new URLSearchParams(); Object.entries(params || {}).forEach(([k,v])=>{ if(v !== undefined && v !== null && String(v).trim() !== '') u.set(k, v); }); return u.toString(); }
  function pct(part,total){ total=num(total); return total ? Math.round((num(part)/total)*100) : 0; }
  function date(v){ if(!v) return '—'; const d=new Date(v); return Number.isNaN(d.getTime()) ? esc(String(v).slice(0,10)) : d.toLocaleDateString('es-MX'); }
  function proyectoCodigo(row){ return row && (row.proyecto_codigo || row.proyecto || row.codigo || row.id_proyecto || ''); }
  function formatProyectoName(value){
    const raw=String(value || '').trim();
    const m=raw.match(/^(\d+)-(\d{2})-(\d{2})$/);
    if(!m) return raw || '—';
    const meses={'01':'Enero','02':'Febrero','03':'Marzo','04':'Abril','05':'Mayo','06':'Junio','07':'Julio','08':'Agosto','09':'Septiembre','10':'Octubre','11':'Noviembre','12':'Diciembre'};
    const numero=String(Number(m[1]) || m[1].replace(/^0+/, '') || m[1]);
    const dia=String(Number(m[3]) || m[3]);
    return dia + ' de ' + (meses[m[2]] || m[2]) + ' #' + numero;
  }
  function proyectoNombre(rowOrValue){
    if(rowOrValue && typeof rowOrValue === 'object') return rowOrValue.proyecto_nombre || formatProyectoName(proyectoCodigo(rowOrValue));
    return formatProyectoName(rowOrValue);
  }

  async function fetchJson(path){
    const r = await fetch(API() + path, { headers:{ 'Accept':'application/json' }, cache:'no-store' });
    const text = await r.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; }
    catch(e) { throw new Error('Respuesta no JSON del backend (' + r.status + '). Revisa que la ruta exista: ' + path); }
    if(!r.ok || !data.ok) throw new Error(data.message || data.error || 'Error consultando backend');
    return data;
  }

  function setStatus(type, text){
    const el=$('proy-status'); if(!el) return;
    el.className='proy-status ' + (type || 'loading');
    el.innerHTML='<span class="proy-dot"></span><span>' + esc(text || 'Cargando...') + '</span>';
  }

  async function loadHtml(){
    const view=$('view-proyectos');
    if(!view || state.loaded) return;
    let html=INLINE_HTML;
    try{
      const r=await fetch('./modules/proyectos/proyectos.html?v=' + MODULE_VERSION, { cache:'no-store' });
      if(r.ok){ const t=await r.text(); if(t && t.trim()) html=t; }
    }catch(e){}
    view.innerHTML=html;
    bind();
    state.loaded=true;
  }

  function bind(){
    document.querySelectorAll('[data-proy-action]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const a=btn.dataset.proyAction;
        if(a==='refresh' || a==='apply') refresh();
        if(a==='clear') clearFilters();
      });
    });
    ['proy-filter-zona','proy-filter-estado','proy-filter-supervisor'].forEach(id=>{ const el=$(id); if(el) el.addEventListener('change', refresh); });
    const search=$('proy-filter-search'); if(search) search.addEventListener('keydown', ev=>{ if(ev.key==='Enter'){ ev.preventDefault(); refresh(); } });
    const close=$('proy-detail-close'); if(close) close.addEventListener('click', closeDetail);
  }

  function currentParams(){ return { zona:val('proy-filter-zona'), estado:val('proy-filter-estado'), supervisor:val('proy-filter-supervisor'), search:val('proy-filter-search') }; }
  function clearFilters(){ ['proy-filter-zona','proy-filter-estado','proy-filter-supervisor','proy-filter-search'].forEach(id=>{ const el=$(id); if(el) el.value=''; }); refresh(); }

  async function loadFilters(){
    if(state.filtersLoaded) return;
    const data=await fetchJson('/api/proyectos/filtros');
    fillSelect('proy-filter-zona', data.filters?.zonas || []);
    fillSelect('proy-filter-estado', data.filters?.estados || []);
    fillSelect('proy-filter-supervisor', data.filters?.supervisores || []);
    state.filtersLoaded=true;
  }
  function fillSelect(id, values){
    const el=$(id); if(!el) return;
    const first=el.querySelector('option') ? el.querySelector('option').outerHTML : '<option value="">Todos</option>';
    el.innerHTML=first + (values || []).filter(Boolean).map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join('');
  }

  async function refresh(){
    await loadFilters().catch(e=>setStatus('error', e.message));
    setStatus('loading','Consultando Proyectos...');
    const body=$('proy-body'); if(body) body.innerHTML='<tr><td colspan="11" class="proy-empty">Cargando proyectos...</td></tr>';
    try{
      const data=await fetchJson('/api/proyectos?' + qs(currentParams()));
      state.rows=data.data || data.rows || data.proyectos || [];
      state.summary=data.summary || data.resumen || data.kpis || buildSummaryFromRows(state.rows);
      renderSummary();
      renderTable();
      setStatus('ok','Proyectos actualizados');
    }catch(e){
      setStatus('error', e.message);
      if(body) body.innerHTML='<tr><td colspan="11" class="proy-empty">'+esc(e.message)+'</td></tr>';
    }
  }

  function buildSummaryFromRows(rows){
    rows=rows || [];
    const acc=rows.reduce((a,r)=>{
      a.proyectos += 1;
      a.equipos += num(r.equipos || r.total || r.total_equipos);
      a.parados += num(r.parados || r.equipos_parados);
      const m = r.mtbc_365 ?? r.mtbcProm ?? r.mtbc_promedio;
      if(m !== null && m !== undefined && m !== '' && !Number.isNaN(Number(m))){ a.mtbc_sum += Number(m); a.mtbc_count += 1; }
      return a;
    }, { proyectos:0, equipos:0, parados:0, mtbc_sum:0, mtbc_count:0 });
    acc.mtbc_promedio = acc.mtbc_count ? Math.round(acc.mtbc_sum / acc.mtbc_count) : null;
    delete acc.mtbc_sum; delete acc.mtbc_count;
    return acc;
  }

  function renderSummary(){
    const s=(state.summary && Object.keys(state.summary).length) ? state.summary : buildSummaryFromRows(state.rows);
    setText('proy-kpi-proyectos', int(s.proyectos ?? s.total_proyectos));
    setText('proy-kpi-equipos', int(s.equipos ?? s.total_equipos));
    setText('proy-kpi-parados', int(s.parados ?? s.total_parados));
    const mtbc = s.mtbc_promedio ?? s.mtbc ?? null;
    setText('proy-kpi-mtbc', mtbc ? int(mtbc) + ' d' : '—');
  }
  function setText(id, value){ const el=$(id); if(el) el.textContent=value; }

  function renderTable(){
    const body=$('proy-body'); if(!body) return;
    const rows=state.rows || [];
    setText('proy-count', rows.length + ' proyectos');
    if(!rows.length){ body.innerHTML='<tr><td colspan="11" class="proy-empty">Sin proyectos para los filtros seleccionados</td></tr>'; return; }
    body.innerHTML=rows.map(r=>{
      const parados=num(r.parados);
      const badge=parados>0 ? '<span class="proy-badge proy-badge-bad">'+int(parados)+'</span>' : '<span class="proy-badge proy-badge-ok">0</span>';
      return '<tr>'+
        '<td class="proy-name">'+esc(proyectoNombre(r))+'<small class="proy-code">'+esc(proyectoCodigo(r))+'</small></td>'+
        '<td>'+esc(r.ciudad)+'</td>'+
        '<td>'+esc(r.estado)+'</td>'+
        '<td>'+esc(r.zona)+'</td>'+
        '<td>'+esc(r.supervisor)+'</td>'+
        '<td class="num">'+int(r.equipos)+'</td>'+
        '<td class="num">'+badge+'</td>'+
        '<td class="num">'+int(r.tickets_35d)+'</td>'+
        '<td class="num">'+int(r.fallas_blt_365d)+'</td>'+
        '<td class="num">'+(r.mtbc_365 ? int(r.mtbc_365)+' d' : '—')+'</td>'+
        '<td><button type="button" class="proy-btn" data-proy-open="'+esc(proyectoCodigo(r))+'">Ver</button></td>'+
      '</tr>';
    }).join('');
    body.querySelectorAll('[data-proy-open]').forEach(btn=>btn.addEventListener('click',()=>openDetail(btn.dataset.proyOpen)));
  }

  async function openDetail(project){
    if(!project) return;
    state.currentProject=project;
    const modal=$('proy-detail-modal'), body=$('proy-detail-body');
    if(modal) modal.hidden=false;
    const meta=(state.rows||[]).find(r=>proyectoCodigo(r)===project || r.proyecto===project);
    setText('proy-detail-title', meta ? proyectoNombre(meta) : proyectoNombre(project));
    setText('proy-detail-sub', 'Consultando detalle desde Aiven...');
    if(body) body.innerHTML='<div class="proy-card proy-empty">Cargando detalle...</div>';
    try{
      const candidates = [
        '/api/proyectos/detalle?' + qs({ proyecto: project }),
        '/api/proyectos?' + qs({ detalle: 1, proyecto: project }),
        '/api/proyectos/' + encodeURIComponent(project)
      ];
      let data = null;
      let lastError = null;
      for (const path of candidates) {
        try {
          const attempt = await fetchJson(path);
          if (hasProyectoDetalle(attempt)) {
            data = attempt;
            break;
          }
          lastError = new Error('La ruta respondio JSON, pero no trajo detalle de proyecto: ' + path);
        } catch(err) {
          lastError = err;
        }
      }
      if (!data) throw lastError || new Error('No se pudo consultar el detalle del proyecto.');
      setText('proy-detail-sub', 'Equipos, tickets y KPIs del proyecto');
      renderDetail(data);
    }catch(e){
      if(body) body.innerHTML='<div class="proy-card proy-empty">'+esc(e.message)+'</div>';
    }
  }
  function closeDetail(){ const modal=$('proy-detail-modal'); if(modal) modal.hidden=true; }

  function normalizeDetalle(data){
    if(!data) return {};
    if(data.proyecto || data.equipos || data.tickets) return data;
    if(data.data && !Array.isArray(data.data)) return normalizeDetalle(data.data);
    if(data.detalle && !Array.isArray(data.detalle)) return normalizeDetalle(data.detalle);
    if(data.payload && !Array.isArray(data.payload)) return normalizeDetalle(data.payload);
    return data;
  }
  function hasProyectoDetalle(data){
    const d=normalizeDetalle(data);
    return !!(d && (d.proyecto || Array.isArray(d.equipos) || Array.isArray(d.tickets)));
  }

  function info(label, value){ return '<div class="proy-info"><label>'+esc(label)+'</label><span>'+esc(value)+'</span></div>'; }
  function kpi(label, value, sub, cls){ return '<article class="proy-kpi '+(cls||'proy-kpi-indigo')+'"><strong>'+esc(value)+'</strong><b>'+esc(label)+'</b><small>'+esc(sub||'')+'</small></article>'; }

  function renderDetail(data){
    const body=$('proy-detail-body'); if(!body) return;
    const d=normalizeDetalle(data);
    const p=d.proyecto || d.resumen || d.kpis || {};
    const equipos=d.equipos || [];
    const tickets=d.tickets || [];
    const months=d.monthly_current || d.fallas_mes_actual || d.meses_actual || [];
    const prev=d.monthly_previous || d.fallas_mes_anterior || d.meses_anterior || [];
    const resp=d.responsabilidad || d.responsabilidades || [];
    const totalTickets=tickets.length;
    body.innerHTML =
      '<section class="proy-card" style="padding:16px"><div class="proy-info-grid">'+
        info('Proyecto', proyectoNombre(p))+info('Código proyecto', proyectoCodigo(p))+info('Ciudad', p.ciudad)+info('Estado', p.estado)+info('Zona', p.zona)+info('Supervisor', p.supervisor)+info('Equipos', int(p.equipos))+
      '</div></section>'+
      '<section class="proy-grid proy-kpis">'+
        kpi('Equipos', int(p.equipos), 'Portafolio activo', 'proy-kpi-indigo')+
        kpi('Parados', int(p.parados), 'Último ticket no funcionando', 'proy-kpi-red')+
        kpi('Tickets 35d', int(p.tickets_35d), 'Actividad reciente', 'proy-kpi-blue')+
        kpi('MTBC 365d', p.mtbc_365 ? int(p.mtbc_365)+' d' : '—', 'estimado', 'proy-kpi-green')+
      '</section>'+
      '<section class="proy-charts">'+
        chartCard('Fallas por mes — año actual', months)+chartCard('Fallas por mes — año anterior', prev)+
      '</section>'+
      '<section class="proy-card" style="padding:16px"><div class="proy-section-head" style="padding:0 0 12px;border:0"><div><h2>Responsabilidad</h2><p>'+int(totalTickets)+' tickets en detalle</p></div></div>'+renderResp(resp)+'</section>'+
      '<section class="proy-card"><div class="proy-section-head"><div><h2>Equipos del proyecto</h2><p>'+int(equipos.length)+' equipos</p></div></div><div class="proy-table-wrap"><table class="proy-table"><thead><tr><th>Código</th><th>Referencia</th><th>Tipo</th><th>Contrato</th><th>Operativo</th><th>Días parado</th><th>Último ticket</th></tr></thead><tbody>'+renderEquipos(equipos)+'</tbody></table></div></section>'+
      '<section class="proy-card"><div class="proy-section-head"><div><h2>Tickets recientes</h2><p>'+int(tickets.length)+' últimos registros</p></div></div><div class="proy-table-wrap"><table class="proy-table"><thead><tr><th>Ticket</th><th>Equipo</th><th>Estado</th><th>Reporte</th><th>Cierre</th><th>Responsabilidad</th><th>Causa</th></tr></thead><tbody>'+renderTickets(tickets)+'</tbody></table></div></section>';
  }

  function chartCard(title, rows){ return '<div class="proy-card" style="padding:16px"><div class="proy-section-head" style="padding:0 0 12px;border:0"><div><h2>'+esc(title)+'</h2><p>Tickets por mes</p></div></div>'+bars(rows, 'mes', 'total')+'</div>'; }
  function bars(rows, labelKey, valueKey){
    rows=rows || [];
    if(!rows.length) return '<div class="proy-empty">Sin datos</div>';
    const max=Math.max(...rows.map(r=>num(r[valueKey])),1);
    return '<div class="proy-bars">'+rows.map(r=>'<div class="proy-bar-row"><span>'+esc(r[labelKey])+'</span><div class="proy-bar-track"><div class="proy-bar-fill" style="width:'+pct(r[valueKey],max)+'%"></div></div><b>'+int(r[valueKey])+'</b></div>').join('')+'</div>';
  }
  function renderResp(rows){
    rows=rows || [];
    if(!rows.length) return '<div class="proy-empty">Sin datos</div>';
    const total=rows.reduce((a,r)=>a+num(r.total),0);
    return '<div class="proy-bars">'+rows.map(r=>'<div class="proy-bar-row"><span>'+esc(r.responsabilidad || 'Sin dato')+'</span><div class="proy-bar-track"><div class="proy-bar-fill" style="width:'+pct(r.total,total)+'%"></div></div><b>'+int(r.total)+'</b></div>').join('')+'</div>';
  }
  function renderEquipos(rows){
    if(!rows || !rows.length) return '<tr><td colspan="7" class="proy-empty">Sin equipos</td></tr>';
    return rows.map(e=>'<tr><td class="proy-name">'+esc(e.numero_equipo)+'</td><td>'+esc(e.identificacion_sitio)+'</td><td>'+esc(e.tipo_equipo)+'</td><td>'+esc(e.contrato)+'</td><td>'+badgeOper(e.estado_operativo)+'</td><td class="num">'+(e.dias_parado==null?'—':int(e.dias_parado))+'</td><td>'+esc(e.ultimo_ticket)+'</td></tr>').join('');
  }
  function renderTickets(rows){
    if(!rows || !rows.length) return '<tr><td colspan="7" class="proy-empty">Sin tickets</td></tr>';
    return rows.map(t=>'<tr><td class="proy-name">'+esc(t.ticket)+'</td><td>'+esc(t.codigo_equipo)+'</td><td>'+esc(t.estado_ticket || t.estado)+'</td><td>'+date(t.fecha_reporte)+'</td><td>'+date(t.fecha_cierre)+'</td><td>'+esc(t.responsabilidad)+'</td><td>'+esc(t.causa_falla || t.causa)+'</td></tr>').join('');
  }
  function badgeOper(v){ return String(v).toLowerCase()==='parado' ? '<span class="proy-badge proy-badge-bad">Parado</span>' : '<span class="proy-badge proy-badge-ok">Funcionando</span>'; }

  async function init(payload){
    await loadHtml();
    await refresh();
    const targetProject = payload && (payload.id || payload.proyecto || payload.project || payload.codigo);
    if(targetProject) await openDetail(String(targetProject));
  }

  window.ManttoProyectos = { init, refresh, openDetail, formatProyectoName, version:MODULE_VERSION };
})();

(function(){
  const MODULE_VERSION = '20260706-v001';
  const COLORS = ['#1B4FD8','#16A34A','#D97706','#DC2626','#0891B2','#7C3AED','#64748B','#E87722'];
  const state = { loaded:false, filtersLoaded:false, dashboard:null, rows:[], total:0, page:1, pageSize:25, lastParams:{} };

  const PF_INLINE_HTML = `
<div class="pf-page"><section class="pf-card pf-head"><div><p class="pf-eyebrow">Aiven · Portafolio</p><h1>Dashboard Portafolio</h1><p>Vista operativa de equipos, contrato, disponibilidad estimada y equipos parados.</p></div><div class="pf-head-actions"><span class="pf-status loading" id="pf-status"><span class="pf-dot"></span><span>Cargando Aiven...</span></span><button type="button" class="pf-btn pf-btn-primary" data-pf-action="refresh">↻ Actualizar</button></div></section><section class="pf-card pf-filters" aria-label="Filtros de Portafolio"><label>Zona<select id="pf-filter-zona"><option value="">Todas</option></select></label><label>Tipo<select id="pf-filter-tipo"><option value="">Todos</option></select></label><label>Supervisor<select id="pf-filter-supervisor"><option value="">Todos</option></select></label><label>Buscar<input id="pf-filter-search" type="search" placeholder="Proyecto, equipo, ciudad..." /></label><button type="button" class="pf-btn" data-pf-action="clear">Limpiar</button><button type="button" class="pf-btn pf-btn-primary" data-pf-action="apply">Aplicar</button></section><section class="pf-grid pf-kpis" aria-label="Indicadores de Portafolio"><article class="pf-kpi pf-kpi-blue" data-pf-detail="total"><span>📦</span><strong id="pf-kpi-total">—</strong><b>Total portafolio</b><small>Activos registrados</small></article><article class="pf-kpi pf-kpi-indigo" data-pf-detail="servicio"><span>🛠️</span><strong id="pf-kpi-servicio">—</strong><b>En servicio</b><small>Contrato activo</small></article><article class="pf-kpi pf-kpi-amber" data-pf-detail="cobranza"><span>💰</span><strong id="pf-kpi-cobranza">—</strong><b>En cobranza</b><small>Objetivo de cobro</small></article><article class="pf-kpi pf-kpi-slate" data-pf-detail="gratuito"><span>🎁</span><strong id="pf-kpi-gratuito">—</strong><b>Gratuito / garantía</b><small>Sin cobro todavía</small></article><article class="pf-kpi pf-kpi-green" data-pf-detail="funcionando"><span>✅</span><strong id="pf-kpi-funcionando">—</strong><b>Funcionando</b><small>Último estado operativo</small></article><article class="pf-kpi pf-kpi-red" data-pf-detail="parado"><span>⛔</span><strong id="pf-kpi-parado">—</strong><b>Parados</b><small>Último ticket no funcionando</small></article></section><section class="pf-grid pf-donuts" aria-label="Distribuciones"><article class="pf-card pf-chart"><h3>Tipo de contrato</h3><div id="pf-donut-contrato" class="pf-donut-box"></div></article><article class="pf-card pf-chart"><h3>Estado operativo</h3><div id="pf-donut-operativo" class="pf-donut-box"></div></article><article class="pf-card pf-chart"><h3>Por tipo de equipo</h3><div id="pf-donut-tipo" class="pf-donut-box"></div></article><article class="pf-card pf-chart"><h3>Por zona</h3><div id="pf-donut-zona" class="pf-donut-box"></div></article></section><section class="pf-card pf-table-section"><div class="pf-section-head"><div><h2>Equipos parados</h2><p id="pf-parados-count">—</p></div></div><div class="pf-table-wrap"><table class="pf-table"><thead><tr><th>Código</th><th>Proyecto</th><th>Zona</th><th>Tipo</th><th>Días parado</th><th>Desde</th><th>Último ticket</th><th>Supervisor</th></tr></thead><tbody id="pf-parados-body"><tr><td colspan="8" class="pf-empty">Cargando...</td></tr></tbody></table></div></section><section class="pf-card pf-table-section"><div class="pf-section-head"><div><h2>Detalle de equipos</h2><p id="pf-equipos-count">—</p></div><div class="pf-inline-actions"><select id="pf-filter-operativo"><option value="">Todos</option><option value="funcionando">Funcionando</option><option value="parado">Parado</option></select></div></div><div class="pf-table-wrap"><table class="pf-table"><thead><tr><th>Código</th><th>Proyecto</th><th>Ciudad</th><th>Zona</th><th>Tipo</th><th>Supervisor</th><th>Contrato</th><th>Operativo</th><th>Días parado</th><th></th></tr></thead><tbody id="pf-equipos-body"><tr><td colspan="10" class="pf-empty">Cargando...</td></tr></tbody></table></div><div class="pf-pagination"><button type="button" id="pf-prev">← Anterior</button><span id="pf-page-info">—</span><button type="button" id="pf-next">Siguiente →</button></div></section><section id="pf-detail-modal" class="pf-detail" hidden><div class="pf-detail-panel"><div class="pf-detail-head"><button type="button" id="pf-detail-close" aria-label="Cerrar">×</button><div><h2 id="pf-detail-title">Detalle</h2><p id="pf-detail-sub">Portafolio</p></div></div><div class="pf-detail-body" id="pf-detail-body"></div></div></section></div>`;

  function API(){ return (window.MANTTO_API_BASE || '').replace(/\/$/, ''); }
  function $(id){ return document.getElementById(id); }
  function esc(v){ return String(v == null || v === '' ? '—' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function int(v){ const n = Number(v || 0); return Number.isFinite(n) ? n.toLocaleString('es-MX') : '0'; }
  function val(id){ const el=$(id); return el ? el.value.trim() : ''; }
  function date(v){ if(!v) return '—'; const d = new Date(v); return Number.isNaN(d.getTime()) ? esc(String(v).slice(0,10)) : d.toLocaleDateString('es-MX'); }
  function qs(params){ const u = new URLSearchParams(); Object.entries(params || {}).forEach(([k,v])=>{ if(v !== undefined && v !== null && String(v).trim() !== '') u.set(k, v); }); return u.toString(); }

  async function fetchJson(path){
    const r = await fetch(API() + path, { headers:{ 'Accept':'application/json' }, cache:'no-store' });
    const data = await r.json().catch(()=>({ ok:false, message:'Respuesta invalida del backend' }));
    if(!r.ok || !data.ok) throw new Error(data.message || data.error || 'Error consultando backend');
    return data;
  }

  function setStatus(type, text){
    const el = $('pf-status'); if(!el) return;
    el.className = 'pf-status ' + (type || 'loading');
    el.innerHTML = '<span class="pf-dot"></span><span>' + esc(text || 'Cargando...') + '</span>';
  }

  async function loadHtml(){
    const view = $('view-portafolio');
    if(!view || state.loaded) return;
    let html = PF_INLINE_HTML;
    try{
      const r = await fetch('./modules/portafolio/portafolio.html?v=' + MODULE_VERSION, { cache:'no-store' });
      if(r.ok){ const t = await r.text(); if(t && t.trim()) html = t; }
    } catch(e) {}
    view.innerHTML = html;
    bind();
    state.loaded = true;
  }

  function bind(){
    document.querySelectorAll('[data-pf-action]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const a = btn.dataset.pfAction;
        if(a === 'refresh') refreshAll();
        if(a === 'apply') refreshAll(1);
        if(a === 'clear') clearFilters();
      });
    });
    ['pf-filter-zona','pf-filter-tipo','pf-filter-supervisor','pf-filter-operativo'].forEach(id=>{ const el=$(id); if(el) el.addEventListener('change', ()=>refreshAll(1)); });
    const search = $('pf-filter-search');
    if(search) search.addEventListener('keydown', ev=>{ if(ev.key === 'Enter'){ ev.preventDefault(); refreshAll(1); } });
    const prev = $('pf-prev'); if(prev) prev.addEventListener('click', ()=>loadEquipos(state.page - 1));
    const next = $('pf-next'); if(next) next.addEventListener('click', ()=>loadEquipos(state.page + 1));
    const close = $('pf-detail-close'); if(close) close.addEventListener('click', ()=>{ $('pf-detail-modal').hidden = true; });
    document.querySelectorAll('[data-pf-detail]').forEach(el=>el.addEventListener('click', ()=>openKpiDetail(el.dataset.pfDetail)));
  }

  function currentParams(){
    return { zona:val('pf-filter-zona'), tipo:val('pf-filter-tipo'), supervisor:val('pf-filter-supervisor'), search:val('pf-filter-search'), operativo:val('pf-filter-operativo'), page_size:state.pageSize };
  }

  function clearFilters(){
    ['pf-filter-zona','pf-filter-tipo','pf-filter-supervisor','pf-filter-search','pf-filter-operativo'].forEach(id=>{ const el=$(id); if(el) el.value=''; });
    refreshAll(1);
  }

  async function loadFilters(){
    if(state.filtersLoaded) return;
    try{
      const data = await fetchJson('/api/portafolio/filtros');
      fillSelect('pf-filter-zona', data.filters?.zonas || []);
      fillSelect('pf-filter-tipo', data.filters?.tipos || []);
      fillSelect('pf-filter-supervisor', data.filters?.supervisores || []);
      state.filtersLoaded = true;
    }catch(e){ setStatus('error', e.message); }
  }

  function fillSelect(id, values){
    const el=$(id); if(!el) return;
    const first = el.querySelector('option') ? el.querySelector('option').outerHTML : '<option value="">Todos</option>';
    el.innerHTML = first + (values || []).filter(Boolean).map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join('');
  }

  async function refreshAll(page){
    await loadFilters();
    await Promise.all([loadDashboard(), loadEquipos(page || state.page || 1)]);
  }

  async function loadDashboard(){
    setStatus('loading', 'Consultando Portafolio...');
    const params = currentParams();
    try{
      const data = await fetchJson('/api/portafolio/dashboard?' + qs(params));
      state.dashboard = data;
      renderDashboard(data);
      setStatus('ok', 'Portafolio actualizado');
    }catch(e){ setStatus('error', e.message); }
  }

  async function loadEquipos(page){
    state.page = Math.max(1, page || 1);
    const body = $('pf-equipos-body'); if(body) body.innerHTML = '<tr><td colspan="10" class="pf-empty">Cargando equipos...</td></tr>';
    const params = currentParams(); params.page = state.page; state.lastParams = params;
    try{
      const data = await fetchJson('/api/portafolio/equipos?' + qs(params));
      state.rows = data.data || []; state.total = data.pagination?.total || 0; state.page = data.pagination?.page || state.page;
      renderEquipos();
    }catch(e){ if(body) body.innerHTML = '<tr><td colspan="10" class="pf-empty">Error: '+esc(e.message)+'</td></tr>'; }
  }

  function renderDashboard(data){
    const k = data.kpis || {};
    text('pf-kpi-total', int(k.total_activos));
    text('pf-kpi-servicio', int(k.en_servicio));
    text('pf-kpi-cobranza', int(k.en_cobranza));
    text('pf-kpi-gratuito', int(k.gratuito_garantia));
    text('pf-kpi-funcionando', int(k.funcionando));
    text('pf-kpi-parado', int(k.parado));
    renderBars('pf-donut-contrato', data.distribuciones?.contrato || []);
    renderBars('pf-donut-operativo', data.distribuciones?.operativo || []);
    renderBars('pf-donut-tipo', data.distribuciones?.tipo || []);
    renderBars('pf-donut-zona', data.distribuciones?.zona || []);
    renderParados(data.parados || []);
  }
  function text(id,v){ const el=$(id); if(el) el.textContent = v; }

  function renderBars(id, rows){
    const el=$(id); if(!el) return;
    const total = rows.reduce((a,r)=>a + Number(r.total || 0), 0);
    if(!rows.length || !total){ el.innerHTML='<div class="pf-empty">Sin datos</div>'; return; }
    el.innerHTML = rows.slice(0,8).map((r,i)=>{
      const pct = Math.round((Number(r.total || 0) / total) * 100);
      return '<div class="pf-bar-row"><div class="pf-bar-label" title="'+esc(r.label)+'">'+esc(r.label)+'</div><div class="pf-bar-track"><div class="pf-bar-fill" style="width:'+pct+'%;background:'+COLORS[i % COLORS.length]+'"></div></div><div class="pf-bar-val">'+int(r.total)+'</div></div>';
    }).join('');
  }

  function renderParados(rows){
    const body=$('pf-parados-body'); if(!body) return;
    text('pf-parados-count', int(rows.length) + ' equipos mostrados');
    if(!rows.length){ body.innerHTML='<tr><td colspan="8" class="pf-empty">Sin equipos parados con el criterio actual</td></tr>'; return; }
    body.innerHTML = rows.map(r=>`<tr><td class="pf-code">${esc(r.numero_equipo)}</td><td>${esc(r.proyecto)}</td><td>${esc(r.zona)}</td><td>${esc(r.tipo_equipo)}</td><td><span class="pf-tag red">${esc(r.dias_parado)} d</span></td><td>${date(r.fecha_inicio_paro)}</td><td>${esc(r.ultimo_ticket)}</td><td>${esc(r.supervisor)}</td></tr>`).join('');
  }

  function renderEquipos(){
    const body=$('pf-equipos-body'); if(!body) return;
    const totalPages = Math.max(1, Math.ceil(state.total / state.pageSize));
    text('pf-equipos-count', int(state.total) + ' equipos filtrados');
    text('pf-page-info', 'Página ' + state.page + ' de ' + totalPages + ' · ' + int(state.total) + ' equipos');
    const prev=$('pf-prev'), next=$('pf-next'); if(prev) prev.disabled = state.page <= 1; if(next) next.disabled = state.page >= totalPages;
    if(!state.rows.length){ body.innerHTML='<tr><td colspan="10" class="pf-empty">Sin equipos para este filtro</td></tr>'; return; }
    body.innerHTML = state.rows.map(r=>{
      const op = String(r.estado_operativo || '').toLowerCase() === 'parado';
      const contrato = String(r.contrato || '').toLowerCase();
      let contratoClass = contrato.includes('cobranza') ? 'amber' : contrato.includes('servicio') ? 'green' : '';
      return `<tr><td class="pf-code">${esc(r.numero_equipo)}</td><td>${esc(r.proyecto)}</td><td>${esc(r.ciudad)}</td><td>${esc(r.zona)}</td><td>${esc(r.tipo_equipo)}</td><td>${esc(r.supervisor)}</td><td><span class="pf-tag ${contratoClass}">${esc(r.contrato)}</span></td><td><span class="pf-tag ${op?'red':'green'}">${esc(r.estado_operativo)}</span></td><td>${r.dias_parado == null ? '—' : esc(r.dias_parado) + ' d'}</td><td><button type="button" class="pf-btn" onclick="ManttoPortafolio.openEquipo('${encodeURIComponent(r.numero_equipo || '')}')">Ver</button></td></tr>`;
    }).join('');
  }

  async function openEquipo(codigoEncoded){
    const codigo = decodeURIComponent(codigoEncoded || '');
    if(!codigo) return;
    const modal=$('pf-detail-modal'); const body=$('pf-detail-body');
    $('pf-detail-title').textContent = codigo;
    $('pf-detail-sub').textContent = 'Detalle de equipo desde Aiven';
    body.innerHTML = '<div class="pf-empty">Cargando detalle...</div>';
    modal.hidden = false;
    try{
      const data = await fetchJson('/api/portafolio/equipos/' + encodeURIComponent(codigo));
      const r = data.data || {};
      body.innerHTML = '<div class="pf-detail-grid">' + [
        ['Proyecto', r.proyecto], ['Ciudad', r.ciudad], ['Estado', r.estado], ['Zona', r.zona], ['Supervisor', r.supervisor], ['Superintendente', r.superintendente], ['Contrato', r.contrato], ['Operativo', r.estado_operativo], ['Días parado', r.dias_parado == null ? '—' : r.dias_parado + ' d'], ['Identificación sitio', r.identificacion_sitio], ['Último ticket', r.ultimo_ticket], ['Última fecha reporte', date(r.ultimo_fecha_reporte)], ['Estatus servicio', r.estatus_servicio], ['Causa no servicio', r.causa_no_servicio], ['Detalle no servicio', r.detalle_no_servicio]
      ].map(([k,v])=>'<div class="pf-field"><label>'+esc(k)+'</label><span>'+esc(v)+'</span></div>').join('') + '</div>';
    }catch(e){ body.innerHTML = '<div class="pf-empty">Error: '+esc(e.message)+'</div>'; }
  }

  function openKpiDetail(type){
    const data = state.dashboard || {}; const modal=$('pf-detail-modal'); const body=$('pf-detail-body');
    const labels = { total:'Total portafolio', servicio:'En servicio', cobranza:'En cobranza', gratuito:'Gratuito / garantía', funcionando:'Funcionando', parado:'Parados' };
    $('pf-detail-title').textContent = labels[type] || 'Detalle';
    $('pf-detail-sub').textContent = 'Resumen del KPI seleccionado';
    const k = data.kpis || {};
    body.innerHTML = '<div class="pf-detail-grid">' + Object.entries(k).map(([key,value])=>'<div class="pf-field"><label>'+esc(key.replace(/_/g,' '))+'</label><span>'+int(value)+'</span></div>').join('') + '</div>';
    modal.hidden = false;
  }

  async function init(){
    await loadHtml();
    await refreshAll(1);
  }

  window.ManttoPortafolio = { init, refreshAll, openEquipo };
})();

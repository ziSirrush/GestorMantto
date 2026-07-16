(function(){
  const MODULE_VERSION = '20260716-portafolio-filtros-tabla-v003';
  const COLORS = ['#1B4FD8','#16A34A','#D97706','#DC2626','#0891B2','#7C3AED','#64748B','#E87722'];
  const state = { loaded:false, filtersLoaded:false, dashboard:null, rows:[], total:0, page:1, pageSize:25, lastParams:{}, tickets:[], criticalCodes:new Set() };

  const PF_INLINE_HTML = `<div class="pf-page"> <section class="pf-card pf-head"> <div> <p class="pf-eyebrow">Aiven · Portafolio</p> <h1>Dashboard Portafolio</h1> <p>Vista ejecutiva del portafolio comercial y del estado operativo de los equipos.</p> </div> <div class="pf-head-actions"> <span class="pf-status loading" id="pf-status"><span class="pf-dot"></span><span>Cargando Aiven...</span></span> <button type="button" class="pf-btn pf-btn-primary" data-pf-action="refresh">↻ Actualizar</button> </div> </section> <section class="pf-grid pf-kpis" aria-label="Indicadores de Portafolio"> <article class="pf-kpi pf-kpi-blue" data-pf-detail="total"><span>📦</span><strong id="pf-kpi-total">—</strong><b>Total portafolio</b><small>Universo activo del portafolio</small></article> <article class="pf-kpi pf-kpi-amber" data-pf-detail="cobranza"><span>💰</span><strong id="pf-kpi-cobranza">—</strong><b>En cobranza</b><small id="pf-kpi-cobranza-sub">Categoría comercial</small></article> <article class="pf-kpi pf-kpi-slate" data-pf-detail="gratuito"><span>🎁</span><strong id="pf-kpi-gratuito">—</strong><b>Gratuito / garantía</b><small id="pf-kpi-gratuito-sub">Categoría comercial</small></article> <article class="pf-kpi pf-kpi-indigo pf-kpi-development" data-pf-detail="conversiones"><span>⇄</span><strong id="pf-kpi-conversiones">En desarrollo</strong><b>Conversiones</b><small>Pendiente de definición de Dirección</small></article> <article class="pf-kpi pf-kpi-green" data-pf-detail="funcionando"><span>✅</span><strong id="pf-kpi-funcionando">—</strong><b>Funcionando</b><small id="pf-kpi-funcionando-sub">— equipos</small></article> <article class="pf-kpi pf-kpi-red" data-pf-detail="parado"><span>⛔</span><strong id="pf-kpi-parado">—</strong><b>Parados</b><small id="pf-kpi-parado-sub">— equipos</small></article> </section> <section class="pf-grid pf-donuts" aria-label="Distribuciones"> <article class="pf-card pf-chart"><h3>Distribución comercial</h3><div id="pf-donut-contrato" class="pf-donut-box"></div></article> <article class="pf-card pf-chart"><h3>Estado operativo</h3><div id="pf-donut-operativo" class="pf-donut-box"></div></article> <article class="pf-card pf-chart"><h3>Por tipo de equipo</h3><div id="pf-donut-tipo" class="pf-donut-box"></div></article> <article class="pf-card pf-chart"><h3>Por zona</h3><div id="pf-donut-zona" class="pf-donut-box"></div></article> </section> <section class="pf-card pf-table-section"> <div class="pf-section-head pf-table-head"> <div class="pf-table-title"><h2>Tabla Portafolio</h2><p id="pf-equipos-count">—</p></div> <div class="pf-filters pf-table-filters" aria-label="Filtros de la Tabla Portafolio"> <label>Zona <select id="pf-filter-zona"><option value="">Todas</option></select> </label> <label>Tipo <select id="pf-filter-tipo"><option value="">Todos</option></select> </label> <label>Supervisor <select id="pf-filter-supervisor"><option value="">Todos</option></select> </label> <label>Estado operativo <select id="pf-filter-operativo"><option value="">Todos</option><option value="funcionando">Funcionando</option><option value="parado">Parado</option></select> </label> <label class="pf-filter-search">Buscar <input id="pf-filter-search" type="search" placeholder="Proyecto, equipo, ciudad..." /> </label> <button type="button" class="pf-btn" data-pf-action="clear">Limpiar</button> <button type="button" class="pf-btn pf-btn-primary" data-pf-action="apply">Aplicar</button> </div> </div> <div class="estado-leyenda-host-gnral" data-estados-leyenda="CRITICO,NO_FUNCIONANDO"></div> <div class="pf-table-wrap"> <table class="pf-table"> <thead><tr><th>Código</th><th>Proyecto</th><th>Ciudad</th><th>Zona</th><th>Tipo</th><th>Supervisor</th><th>Contrato</th><th>Operativo</th><th>Días parado</th><th></th></tr></thead> <tbody id="pf-equipos-body"><tr><td colspan="10" class="pf-empty">Cargando...</td></tr></tbody> </table> </div> <div class="pf-pagination"><button type="button" id="pf-prev">← Anterior</button><span id="pf-page-info">—</span><button type="button" id="pf-next">Siguiente →</button></div> </section> <section id="pf-detail-modal" class="pf-detail" hidden> <div class="pf-detail-panel"> <div class="pf-detail-head"> <button type="button" id="pf-detail-close" aria-label="Cerrar">×</button> <div><h2 id="pf-detail-title">Detalle</h2><p id="pf-detail-sub">Portafolio</p></div> </div> <div class="pf-detail-body" id="pf-detail-body"></div> </div> </section> </div>`;

  function API(){ return (window.MANTTO_API_BASE || '').replace(/\/$/, ''); }
  function $(id){ return document.getElementById(id); }
  function esc(v){ return String(v == null || v === '' ? '—' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function int(v){ const n = Number(v || 0); return Number.isFinite(n) ? n.toLocaleString('es-MX') : '0'; }
  function pct(value,total){ const v=Number(value||0), t=Number(total||0); return t>0 ? ((v/t)*100).toFixed(1)+'%' : '0.0%'; }
  function val(id){ const el=$(id); return el ? el.value.trim() : ''; }
  function date(v){ if(!v) return '—'; const d = new Date(v); return Number.isNaN(d.getTime()) ? esc(String(v).slice(0,10)) : d.toLocaleDateString('es-MX'); }
  function ticketCode(row){return String((row&& (row.codigo_equipo||row.cod||row.numero_equipo))||'').trim();}
  function buildCriticalCodes(rows){const cut=new Date();cut.setDate(cut.getDate()-35);const key=cut.toISOString().slice(0,10),counts={};(rows||[]).forEach(t=>{const cod=ticketCode(t),fr=String(t.fecha_reporte||t.fr||'').slice(0,10),res=String(t.responsabilidad||t.res||'').toUpperCase();if(cod&&fr>=key&&res==='BLT')counts[cod]=(counts[cod]||0)+1;});return new Set(Object.keys(counts).filter(c=>counts[c]>=3));}
  function ticketById(id){return state.tickets.find(t=>String(t.ticket||t.n||'')===String(id||''))||null;}
  function visualCodes(row){ if(Array.isArray(row&&row.estados_visuales)) return row.estados_visuales.map(x=>typeof x==='string'?x:x.codigo).filter(Boolean); const cod=String(row&&row.numero_equipo||''); return window.EstadosVisuales_gnral?window.EstadosVisuales_gnral.codesForEquipo(row,[],{critico:state.criticalCodes.has(cod)}):[]; }
  function ticketVisualIdentifier(id){const t=ticketById(id);const codes=window.EstadosVisuales_gnral&&t?window.EstadosVisuales_gnral.codesForTicket(t):[];return window.EstadosVisuales_gnral?window.EstadosVisuales_gnral.renderIdentifier(codes,id):esc(id);}
  function visualIdentifier(row,text){ return window.EstadosVisuales_gnral?window.EstadosVisuales_gnral.renderIdentifier(visualCodes(row),text):esc(text); }
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
        if(a === 'apply') loadEquipos(1);
        if(a === 'clear') clearFilters();
      });
    });
    ['pf-filter-zona','pf-filter-tipo','pf-filter-supervisor','pf-filter-operativo'].forEach(id=>{ const el=$(id); if(el) el.addEventListener('change', ()=>loadEquipos(1)); });
    const search = $('pf-filter-search');
    if(search) search.addEventListener('keydown', ev=>{ if(ev.key === 'Enter'){ ev.preventDefault(); loadEquipos(1); } });
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
    loadEquipos(1);
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

  async function loadTicketsVisuales(){try{const data=await fetchJson('/api/tickets?limit=20000');state.tickets=data.data||data.rows||data.tickets||[];state.criticalCodes=new Set(state.tickets.map(t=>String(t.codigo_equipo||t.cod||'').trim()).filter(c=>c&&window.EstadosVisuales_gnral&&window.EstadosVisuales_gnral.isCriticoEquipo(c)));}catch(e){state.tickets=[];state.criticalCodes=new Set();}}

  async function refreshAll(page){
    await loadFilters();
    await loadTicketsVisuales();
    await Promise.all([loadDashboard(), loadEquipos(page || state.page || 1)]);
  }

  async function loadDashboard(){
    setStatus('loading', 'Consultando Portafolio...');
    try{
      const data = await fetchJson('/api/portafolio/dashboard');
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
    const total = Number(k.total_activos || 0);
    text('pf-kpi-total', int(total));
    text('pf-kpi-cobranza', int(k.en_cobranza));
    text('pf-kpi-gratuito', int(k.gratuito_garantia));
    text('pf-kpi-cobranza-sub', pct(k.en_cobranza, total) + ' del portafolio');
    text('pf-kpi-gratuito-sub', pct(k.gratuito_garantia, total) + ' del portafolio');
    text('pf-kpi-funcionando', pct(k.funcionando, total));
    text('pf-kpi-funcionando-sub', int(k.funcionando) + ' equipos');
    text('pf-kpi-parado', pct(k.parado, total));
    text('pf-kpi-parado-sub', int(k.parado) + ' equipos');
    const contrato = orderCommercialRows(data.distribuciones?.contrato || []);
    renderBars('pf-donut-contrato', contrato);
    renderBars('pf-donut-operativo', data.distribuciones?.operativo || []);
    renderBars('pf-donut-tipo', data.distribuciones?.tipo || []);
    renderBars('pf-donut-zona', data.distribuciones?.zona || []);
  }
  function orderCommercialRows(rows){
    const order = {'En Cobranza':0,'Gratuito/Garantía':1,'No en Servicio':2};
    return [...rows].sort((a,b)=>(order[a.label] ?? 99) - (order[b.label] ?? 99));
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
      let contratoClass = contrato.includes('cobranza') ? 'amber' : contrato.includes('gratuito') || contrato.includes('garant') ? 'slate' : contrato.includes('no en servicio') ? 'red' : '';
      return `<tr><td class="pf-code"><button class="mg-link" data-pf-equipo="${esc(r.numero_equipo)}" type="button">${visualIdentifier(r,r.numero_equipo)}</button></td><td><button class="mg-link" data-pf-proyecto="${esc(r.proyecto)}" type="button">${esc(r.proyecto)}</button></td><td>${esc(r.ciudad)}</td><td>${esc(r.zona)}</td><td>${esc(r.tipo_equipo)}</td><td>${esc(r.supervisor)}</td><td><span class="pf-tag ${contratoClass}">${esc(r.contrato)}</span></td><td><span class="pf-tag ${op?'red':'green'}">${esc(r.estado_operativo)}</span></td><td>${r.dias_parado == null ? '—' : esc(r.dias_parado) + ' d'}</td><td><button type="button" class="pf-btn" data-pf-equipo="${esc(r.numero_equipo)}">Ver</button></td></tr>`;
    }).join('');
    bindGeneralDetailLinks(body);
  }

  function bindGeneralDetailLinks(root){
    const scope=root||document;
    scope.querySelectorAll('[data-pf-equipo]').forEach(el=>el.addEventListener('click',ev=>{ ev.preventDefault(); ev.stopPropagation(); if(window.ManttoDetails&&window.ManttoDetails.openEquipo) window.ManttoDetails.openEquipo(el.dataset.pfEquipo); }));
    scope.querySelectorAll('[data-pf-proyecto]').forEach(el=>el.addEventListener('click',ev=>{ ev.preventDefault(); ev.stopPropagation(); if(window.ManttoDetails&&window.ManttoDetails.openProyecto) window.ManttoDetails.openProyecto(el.dataset.pfProyecto); }));
    scope.querySelectorAll('[data-pf-ticket]').forEach(el=>el.addEventListener('click',ev=>{ ev.preventDefault(); ev.stopPropagation(); const id=String(el.dataset.pfTicket||'').trim(); if(id&&id!=='—'&&window.ManttoDetails&&window.ManttoDetails.openTicket) window.ManttoDetails.openTicket(id); }));
  }

  async function openEquipo(codigoEncoded){
    const codigo = decodeURIComponent(codigoEncoded || '');
    if(!codigo) return;
    if(window.ManttoDetails && window.ManttoDetails.openEquipo){
      window.ManttoDetails.openEquipo(codigo);
      return;
    }
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
    const labels = { total:'Total portafolio', cobranza:'En cobranza', gratuito:'Gratuito / garantía', conversiones:'Conversiones', funcionando:'Funcionando', parado:'Parados' };
    $('pf-detail-title').textContent = labels[type] || 'Detalle';
    $('pf-detail-sub').textContent = 'Resumen del KPI seleccionado';
    if(type === 'conversiones'){
      body.innerHTML = '<div class="pf-empty">Indicador en desarrollo. La regla de negocio será definida por Dirección antes de habilitar datos.</div>';
      modal.hidden = false;
      return;
    }
    const k = data.kpis || {};
    const total = Number(k.total_activos || 0);
    const rows = [
      ['Total portafolio', k.total_activos],
      ['En cobranza', k.en_cobranza],
      ['Gratuito / garantía', k.gratuito_garantia],
      ['No en servicio', k.no_en_servicio],
      ['Funcionando', k.funcionando],
      ['Parados', k.parado]
    ];
    body.innerHTML = '<div class="pf-detail-grid">' + rows.map(([key,value])=>'<div class="pf-field"><label>'+esc(key)+'</label><span>'+int(value)+(key==='Funcionando'||key==='Parados' ? ' · '+pct(value,total) : '')+'</span></div>').join('') + '</div>';
    modal.hidden = false;
  }

  async function init(){
    if(window.EstadosVisuales_gnral) await window.EstadosVisuales_gnral.loadCriticidadCorporativa();
    await loadHtml();
    await refreshAll(1);
  }

  window.ManttoPortafolio = { init, refreshAll, openEquipo };
})();

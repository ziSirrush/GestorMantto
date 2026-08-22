(function(){
  const MODULE_VERSION = '20260821-fase7-11-dashboard-portafolio-cuartos-v001';
  const COLORS = ['#1B4FD8','#16A34A','#D97706','#DC2626','#0891B2','#7C3AED','#64748B','#E87722'];
  const CATEGORY_META = {
    cobranza:{ title:'En cobranza', subtitle:'Equipos activos clasificados comercialmente en cobranza', api:'cobranza' },
    gratuito:{ title:'Gratuito / Garantía', subtitle:'Equipos activos cuyo Estatus Cobranza es Gratuito', api:'gratuito' },
    no_servicio:{ title:'No en Servicio', subtitle:'Equipos con estatus de servicio No en Servicio', api:'no_servicio' }
  };
  const state = { loaded:false, filtersLoaded:false, dashboard:null, rows:[], total:0, page:1, pageSize:30, criticalCodes:new Set(), mode:'dashboard', category:'', sortKey:'proyecto', sortDir:'asc', alcance:{zona_ids:[],zonas:[]} };

  function API(){ return (window.MANTTO_API_BASE || '').replace(/\/$/, ''); }
  function $(id){ return document.getElementById(id); }
  function esc(v){ return String(v == null || v === '' ? '—' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function int(v){ const n=Number(v||0); return Number.isFinite(n)?n.toLocaleString('es-MX'):'0'; }
  function pct(value,total){ const v=Number(value||0),t=Number(total||0); return t>0?((v/t)*100).toFixed(1)+'%':'0.0%'; }
  function val(id){ const el=$(id); return el?el.value.trim():''; }
  function qs(params){ const u=new URLSearchParams(); Object.entries(params||{}).forEach(([k,v])=>{ if(v!==undefined&&v!==null&&String(v).trim()!=='')u.set(k,v); }); return u.toString(); }
  function authHeaders(){ return Object.assign({Accept:'application/json'},window.ManttoAuth&&window.ManttoAuth.authHeaders?window.ManttoAuth.authHeaders():{}); }
  function projectName_uni(v){ return window.ManttoFormat&&window.ManttoFormat.projectName?window.ManttoFormat.projectName(v):String(v||'—'); }
  function visualCodes(row){
    if(Array.isArray(row&&row.estados_visuales))return row.estados_visuales.map(x=>typeof x==='string'?x:x.codigo).filter(Boolean);
    const cod=String(row&&row.numero_equipo||'').trim();
    return window.EstadosVisuales_gnral?window.EstadosVisuales_gnral.codesForEquipo(row,[],{critico:state.criticalCodes.has(cod)}):[];
  }
  function visualIdentifier(row,text){ return window.EstadosVisuales_gnral?window.EstadosVisuales_gnral.renderIdentifier(visualCodes(row),text):esc(text); }

  async function fetchJson(path){
    const r=await fetch(API()+path,{headers:authHeaders(),cache:'no-store'});
    const data=await r.json().catch(()=>({ok:false,message:'Respuesta inválida del backend'}));
    if(!r.ok||!data.ok)throw new Error(data.message||data.error||'Error consultando backend');
    return data;
  }

  function setStatus(type,text){ const el=$('pf-status'); if(!el)return; el.className='pf-status '+(type||'loading'); el.innerHTML='<span class="pf-dot"></span><span>'+esc(text||'Cargando...')+'</span>'; }
  function text(id,v){ const el=$(id); if(el)el.textContent=v; }

  function dashboardHtml(){
    return `<div class="pf-page">
      <section class="pf-card pf-head"><div><p class="pf-eyebrow">Aiven · Portafolio</p><h1>Dashboard Portafolio</h1><p>Vista ejecutiva del portafolio comercial y del estado operativo de los equipos.</p></div><div class="pf-head-actions"><span class="pf-status loading" id="pf-status"><span class="pf-dot"></span><span>Cargando Aiven...</span></span><button type="button" class="pf-btn pf-btn-primary" data-pf-action="refresh">↻ Actualizar</button></div></section>
      <section class="pf-kpis" aria-label="Indicadores de Portafolio">
        <div class="pf-grid pf-kpis-row pf-kpis-row-5">
          <article class="pf-kpi pf-kpi-blue"><span>📦</span><strong id="pf-kpi-total">—</strong><b>Total portafolio</b><small>Universo activo del portafolio</small></article>
          <article class="pf-kpi pf-kpi-amber pf-kpi-link" data-pf-category="cobranza" tabindex="0"><span>💰</span><strong id="pf-kpi-cobranza">—</strong><b>En cobranza</b><small id="pf-kpi-cobranza-sub">Categoría comercial</small></article>
          <article class="pf-kpi pf-kpi-slate pf-kpi-link" data-pf-category="gratuito" tabindex="0"><span>🎁</span><strong id="pf-kpi-gratuito">—</strong><b>Gratuito / Garantía</b><small id="pf-kpi-gratuito-sub">Categoría comercial</small></article>
          <article class="pf-kpi pf-kpi-red pf-kpi-link" data-pf-category="no_servicio" tabindex="0"><span>🚫</span><strong id="pf-kpi-no-servicio">—</strong><b>No en Servicio</b><small id="pf-kpi-no-servicio-sub">Categoría comercial</small></article>
          <article class="pf-kpi pf-kpi-indigo pf-kpi-development"><span>⇄</span><strong>En desarrollo</strong><b>Conversiones</b><small>Pendiente de definición de Dirección</small></article>
        </div>
        <div class="pf-grid pf-kpis-row pf-kpis-row-2">
          <article class="pf-kpi pf-kpi-green"><span>✅</span><strong id="pf-kpi-funcionando">—</strong><b>Funcionando</b><small id="pf-kpi-funcionando-sub">— equipos</small></article>
          <article class="pf-kpi pf-kpi-red"><span>⛔</span><strong id="pf-kpi-parado">—</strong><b>Parados</b><small id="pf-kpi-parado-sub">— equipos</small></article>
        </div>
        <div class="pf-kpi-group-heading"><div><b>Indicadores por proyecto</b><small>Cada proyecto se contabiliza una sola vez dentro de cada indicador, sin importar cuántos equipos tenga asociados.</small></div></div>
        <div class="pf-grid pf-kpis-row pf-kpis-row-4" aria-label="Indicadores de Portafolio por proyecto">
          <article class="pf-kpi pf-kpi-blue"><span>🏢</span><strong id="pf-kpi-proyectos-total">—</strong><b>Total portafolio</b><small>Proyectos únicos</small></article>
          <article class="pf-kpi pf-kpi-amber"><span>💰</span><strong id="pf-kpi-proyectos-cobranza">—</strong><b>En cobranza</b><small id="pf-kpi-proyectos-cobranza-sub">Proyectos únicos</small></article>
          <article class="pf-kpi pf-kpi-slate"><span>🎁</span><strong id="pf-kpi-proyectos-gratuito">—</strong><b>Gratuito / Garantía</b><small id="pf-kpi-proyectos-gratuito-sub">Proyectos únicos</small></article>
          <article class="pf-kpi pf-kpi-red"><span>🚫</span><strong id="pf-kpi-proyectos-no-servicio">—</strong><b>No en Servicio</b><small id="pf-kpi-proyectos-no-servicio-sub">Proyectos únicos</small></article>
        </div>
      </section>
      <section class="pf-grid pf-donuts" aria-label="Distribuciones"><article class="pf-card pf-chart"><h3>Distribución comercial</h3><div id="pf-donut-contrato" class="pf-donut-box"></div></article><article class="pf-card pf-chart"><h3>Estado operativo</h3><div id="pf-donut-operativo" class="pf-donut-box"></div></article><article class="pf-card pf-chart"><h3>Por tipo de equipo</h3><div id="pf-donut-tipo" class="pf-donut-box"></div></article><article class="pf-card pf-chart"><h3>Por zona</h3><div id="pf-donut-zona" class="pf-donut-box"></div></article></section>
      ${tableSectionHtml(false)}
    </div>`;
  }

  function categoryHtml(category){
    const meta=CATEGORY_META[category];
    return `<div class="pf-page pf-category-page">
      <section class="pf-card pf-head"><div><p class="pf-eyebrow">Aiven · Portafolio comercial</p><h1>${esc(meta.title)}</h1><p>${esc(meta.subtitle)}</p></div><div class="pf-head-actions"><span class="pf-status loading" id="pf-status"><span class="pf-dot"></span><span>Cargando Aiven...</span></span><button type="button" class="pf-btn" data-pf-action="back">← Dashboard Portafolio</button><button type="button" class="pf-btn pf-btn-primary" data-pf-action="refresh">↻ Actualizar</button></div></section>
      ${tableSectionHtml(true,meta.title)}
    </div>`;
  }

  function sortTh(label,key){ const active=state.sortKey===key; const arrow=active?(state.sortDir==='asc'?' ▲':' ▼'):''; return `<th><button type="button" class="pf-sort" data-pf-sort="${key}">${label}${arrow}</button></th>`; }
  function tableSectionHtml(categoryMode,title){
    return `<section class="pf-card pf-table-section"><div class="pf-section-head pf-table-head"><div class="pf-table-title"><h2>${categoryMode?esc(title):'Tabla Portafolio'}</h2><p id="pf-equipos-count">—</p></div><div class="pf-filters pf-table-filters" aria-label="Filtros de la Tabla Portafolio">
      <label>Zona<select id="pf-filter-zona"><option value="">Todas</option></select></label><label>Tipo<select id="pf-filter-tipo"><option value="">Todos</option></select></label><label>Supervisor<select id="pf-filter-supervisor"><option value="">Todos</option></select></label>
      <label>Estado operativo<select id="pf-filter-operativo"><option value="">Todos</option><option value="funcionando">Funcionando</option><option value="parado">Parado</option></select></label>
      <label class="pf-filter-search">Buscar<input id="pf-filter-search" type="search" placeholder="Proyecto, equipo, ciudad..."></label><button type="button" class="pf-btn" data-pf-action="clear">Limpiar</button><button type="button" class="pf-btn pf-btn-primary" data-pf-action="apply">Aplicar</button></div></div>
      <div class="estado-leyenda-host-gnral" data-estados-leyenda="CRITICO,NO_FUNCIONANDO"></div><div class="pf-table-wrap"><table class="pf-table"><thead><tr>${sortTh('Código','numero_equipo')}${sortTh('Proyecto','proyecto')}${sortTh('Ciudad','ciudad')}${sortTh('Zona','zona')}${sortTh('Tipo','tipo_equipo')}${sortTh('Supervisor','supervisor')}<th>Contrato</th><th>Operativo</th>${sortTh('Días parado','dias_parado')}<th></th></tr></thead><tbody id="pf-equipos-body"><tr><td colspan="10" class="pf-empty">Cargando...</td></tr></tbody></table></div><div class="pf-pagination"><button type="button" id="pf-prev">← Anterior</button><span id="pf-page-info">—</span><button type="button" id="pf-next">Siguiente →</button></div></section>`;
  }

  function currentParams(){ return {zona:val('pf-filter-zona'),tipo:val('pf-filter-tipo'),supervisor:val('pf-filter-supervisor'),search:val('pf-filter-search'),operativo:val('pf-filter-operativo'),contrato:state.category?CATEGORY_META[state.category].api:'',sort:state.sortKey,direction:state.sortDir,page_size:state.pageSize}; }
  function fillSelect(id,values){const el=$(id);if(!el)return;const current=el.value;const first=el.querySelector('option')?el.querySelector('option').outerHTML:'<option value="">Todos</option>';el.innerHTML=first+(values||[]).filter(Boolean).map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join('');if([...el.options].some(o=>o.value===current))el.value=current;}
  function syncCriticalCodes(){state.criticalCodes=new Set(state.rows.map(r=>String(r.numero_equipo||'').trim()).filter(c=>c&&window.EstadosVisuales_gnral&&window.EstadosVisuales_gnral.isCriticoEquipo(c)));}

  async function loadInitial(page){
    state.page=Math.max(1,page||1);
    setStatus('loading','Consultando Portafolio...');
    const params=currentParams();params.page=state.page;
    try{
      const data=await fetchJson('/api/portafolio/dashboard/inicial?'+qs(params));
      state.alcance=data.alcance||{zona_ids:[],zonas:[]};
      fillSelect('pf-filter-zona',data.filters?.zonas||[]);
      fillSelect('pf-filter-tipo',data.filters?.tipos||[]);
      fillSelect('pf-filter-supervisor',data.filters?.supervisores||[]);
      state.filtersLoaded=true;
      state.dashboard=data.dashboard||null;
      state.rows=data.equipos?.data||[];
      state.total=Number(data.equipos?.pagination?.total||0);
      state.page=Number(data.equipos?.pagination?.page||state.page);
      syncCriticalCodes();
      if(state.mode==='dashboard')renderDashboard(state.dashboard||{});
      renderEquipos();
      setStatus('ok',state.mode==='category'?CATEGORY_META[state.category].title+' actualizado':'Portafolio actualizado');
    }catch(e){
      const body=$('pf-equipos-body');if(body)body.innerHTML='<tr><td colspan="10" class="pf-empty">Error: '+esc(e.message)+'</td></tr>';
      state.rows=[];state.total=0;state.alcance={zona_ids:[],zonas:[]};
      setStatus('error',e.message);
    }
  }

  async function renderMode(mode,category){
    const view=$('view-portafolio'); if(!view)return;
    state.mode=mode==='category'?'category':'dashboard'; state.category=state.mode==='category'&&CATEGORY_META[category]?category:''; state.page=1; state.filtersLoaded=false;
    view.innerHTML=state.mode==='category'?categoryHtml(state.category):dashboardHtml();
    bind();
    await loadInitial(1);
    if(window.EstadosVisuales_gnral)window.EstadosVisuales_gnral.apply(view);
  }

  function bind(){
    document.querySelectorAll('[data-pf-action]').forEach(btn=>btn.addEventListener('click',()=>{ const a=btn.dataset.pfAction; if(a==='refresh')loadInitial(state.page||1); if(a==='apply')loadEquipos(1); if(a==='clear')clearFilters(); if(a==='back'&&window.ManttoRouter)window.ManttoRouter.back(); }));
    ['pf-filter-zona','pf-filter-tipo','pf-filter-supervisor','pf-filter-operativo'].forEach(id=>{ const el=$(id); if(el)el.addEventListener('change',()=>loadEquipos(1)); });
    const search=$('pf-filter-search'); if(search)search.addEventListener('keydown',ev=>{ if(ev.key==='Enter'){ev.preventDefault();loadEquipos(1);} });
    const prev=$('pf-prev'); if(prev)prev.addEventListener('click',()=>loadEquipos(state.page-1)); const next=$('pf-next'); if(next)next.addEventListener('click',()=>loadEquipos(state.page+1));
    document.querySelectorAll('[data-pf-category]').forEach(el=>{ const open=()=>openCategory(el.dataset.pfCategory); el.addEventListener('click',open); el.addEventListener('keydown',ev=>{ if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();open();} }); });
    document.querySelectorAll('[data-pf-sort]').forEach(btn=>btn.addEventListener('click',()=>{ const key=btn.dataset.pfSort; if(state.sortKey===key)state.sortDir=state.sortDir==='asc'?'desc':'asc'; else{state.sortKey=key;state.sortDir='asc';} updateSortHeaders(); loadEquipos(1); }));
  }

  function updateSortHeaders(){document.querySelectorAll('[data-pf-sort]').forEach(btn=>{const base=String(btn.textContent||'').replace(/ [▲▼]$/,'');btn.textContent=base+(btn.dataset.pfSort===state.sortKey?(state.sortDir==='asc'?' ▲':' ▼'):'');});}
  function openCategory(category){ if(!CATEGORY_META[category]||!window.ManttoRouter)return; window.ManttoRouter.go('portafolio',{id:'categoria-'+category,view:'categoria',categoria:category}); }
  function clearFilters(){ ['pf-filter-zona','pf-filter-tipo','pf-filter-supervisor','pf-filter-search','pf-filter-operativo'].forEach(id=>{const el=$(id);if(el)el.value='';}); loadEquipos(1); }

  async function loadEquipos(page){
    state.page=Math.max(1,page||1);const body=$('pf-equipos-body');if(body)body.innerHTML='<tr><td colspan="10" class="pf-empty">Cargando equipos...</td></tr>';
    const params=currentParams();params.page=state.page;
    try{
      const data=await fetchJson('/api/portafolio/dashboard/equipos?'+qs(params));
      state.rows=data.data||[];state.total=data.pagination?.total||0;state.page=data.pagination?.page||state.page;syncCriticalCodes();renderEquipos();setStatus('ok',state.mode==='category'?CATEGORY_META[state.category].title+' actualizado':'Portafolio actualizado');
    }catch(e){if(body)body.innerHTML='<tr><td colspan="10" class="pf-empty">Error: '+esc(e.message)+'</td></tr>';setStatus('error',e.message);}
  }

  function renderDashboard(data){
    const k=data.kpis||{},kp=data.kpis_proyectos||{},total=Number(k.total_activos||0),gratuito=Number(k.gratuito??k.gratuito_garantia??0),totalProyectos=Number(kp.total_proyectos||0);
    text('pf-kpi-total',int(total));text('pf-kpi-cobranza',int(k.en_cobranza));text('pf-kpi-gratuito',int(gratuito));text('pf-kpi-no-servicio',int(k.no_en_servicio));text('pf-kpi-cobranza-sub',pct(k.en_cobranza,total)+' del portafolio');text('pf-kpi-gratuito-sub',pct(gratuito,total)+' del portafolio');text('pf-kpi-no-servicio-sub',pct(k.no_en_servicio,total)+' del portafolio');text('pf-kpi-funcionando',pct(k.funcionando,total));text('pf-kpi-funcionando-sub',int(k.funcionando)+' equipos');text('pf-kpi-parado',pct(k.parado,total));text('pf-kpi-parado-sub',int(k.parado)+' equipos');
    text('pf-kpi-proyectos-total',int(totalProyectos));text('pf-kpi-proyectos-cobranza',int(kp.en_cobranza));text('pf-kpi-proyectos-gratuito',int(kp.gratuito));text('pf-kpi-proyectos-no-servicio',int(kp.no_en_servicio));text('pf-kpi-proyectos-cobranza-sub',pct(kp.en_cobranza,totalProyectos)+' de proyectos');text('pf-kpi-proyectos-gratuito-sub',pct(kp.gratuito,totalProyectos)+' de proyectos');text('pf-kpi-proyectos-no-servicio-sub',pct(kp.no_en_servicio,totalProyectos)+' de proyectos');
    renderBars('pf-donut-contrato',orderCommercialRows(data.distribuciones?.contrato||[]));renderBars('pf-donut-operativo',data.distribuciones?.operativo||[]);renderBars('pf-donut-tipo',data.distribuciones?.tipo||[]);renderBars('pf-donut-zona',data.distribuciones?.zona||[]);
  }
  function orderCommercialRows(rows){const order={'En Cobranza':0,'Gratuito/Garantía':1,'No en Servicio':2,'Sin dato':3};return [...rows].sort((a,b)=>(order[a.label]??99)-(order[b.label]??99));}
  function renderBars(id,rows){const el=$(id);if(!el)return;const total=rows.reduce((a,r)=>a+Number(r.total||0),0);if(!rows.length||!total){el.innerHTML='<div class="pf-empty">Sin datos</div>';return;}el.innerHTML=rows.slice(0,8).map((r,i)=>{const p=Math.round((Number(r.total||0)/total)*100);return '<div class="pf-bar-row"><div class="pf-bar-label" title="'+esc(r.label)+'">'+esc(r.label)+'</div><div class="pf-bar-track"><div class="pf-bar-fill" style="width:'+p+'%;background:'+COLORS[i%COLORS.length]+'"></div></div><div class="pf-bar-val">'+int(r.total)+'</div></div>';}).join('');}
  function renderEquipos(){const body=$('pf-equipos-body');if(!body)return;const totalPages=Math.max(1,Math.ceil(state.total/state.pageSize));text('pf-equipos-count',int(state.total)+' equipos filtrados');text('pf-page-info','Página '+state.page+' de '+totalPages+' · '+int(state.total)+' equipos');const prev=$('pf-prev'),next=$('pf-next');if(prev)prev.disabled=state.page<=1;if(next)next.disabled=state.page>=totalPages;if(!state.rows.length){body.innerHTML='<tr><td colspan="10" class="pf-empty">Sin equipos para este filtro</td></tr>';return;}body.innerHTML=state.rows.map(r=>{const op=String(r.estado_operativo||'').toLowerCase()==='parado';const contrato=String(r.contrato||'').toLowerCase();const cc=contrato.includes('cobranza')?'amber':contrato.includes('gratuito')?'slate':contrato.includes('no en servicio')?'red':'';return `<tr><td class="pf-code"><button class="mg-link" data-pf-equipo="${esc(r.numero_equipo)}" type="button">${visualIdentifier(r,r.numero_equipo)}</button></td><td><button class="mg-link" data-pf-proyecto="${esc(r.proyecto)}" type="button">${esc(projectName_uni(r.proyecto))}</button></td><td>${esc(r.ciudad)}</td><td>${esc(r.zona_oficial||r.zona)}</td><td>${esc(r.tipo_equipo)}</td><td>${esc(r.supervisor)}</td><td><span class="pf-tag ${cc}">${esc(r.contrato)}</span></td><td><span class="pf-tag ${op?'red':'green'}">${esc(r.estado_operativo)}</span></td><td>${r.dias_parado==null?'—':esc(r.dias_parado)+' d'}</td><td><button type="button" class="pf-btn" data-pf-equipo="${esc(r.numero_equipo)}">Ver</button></td></tr>`;}).join('');bindDetailLinks(body);}
  function bindDetailLinks(root){root.querySelectorAll('[data-pf-equipo]').forEach(el=>el.addEventListener('click',ev=>{ev.preventDefault();ev.stopPropagation();if(window.ManttoDetails&&window.ManttoDetails.openEquipo)window.ManttoDetails.openEquipo(el.dataset.pfEquipo);}));root.querySelectorAll('[data-pf-proyecto]').forEach(el=>el.addEventListener('click',ev=>{ev.preventDefault();ev.stopPropagation();if(window.ManttoDetails&&window.ManttoDetails.openProyecto)window.ManttoDetails.openProyecto(el.dataset.pfProyecto);}));}

  async function init(payload){
    const inferred=payload&&String(payload.id||'').startsWith('categoria-')?String(payload.id).slice(10):'';
    const category=payload&&payload.view==='categoria'&&CATEGORY_META[payload.categoria]?payload.categoria:(CATEGORY_META[inferred]?inferred:'');

    // FASE 7/11: la primera consulta de datos al abrir Dashboard Portafolio
    // debe ser la carga dedicada PORTAFOLIO. La criticidad es informacion
    // cruzada de OPERACION y se solicita solo despues de cerrar la carga propia.
    await renderMode(category?'category':'dashboard',category);
    state.loaded=true;

    if(window.EstadosVisuales_gnral&&typeof window.EstadosVisuales_gnral.loadCriticidadCorporativa==='function'){
      await window.EstadosVisuales_gnral.loadCriticidadCorporativa();
      syncCriticalCodes();
      renderEquipos();
      window.EstadosVisuales_gnral.apply(document.getElementById('view-portafolio')||document);
    }
  }
  window.ManttoPortafolio={init,refreshAll:()=>loadInitial(state.page||1)};
})();

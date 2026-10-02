(function(){
  'use strict';

  // [Aster | 2026-10-02 | ASTER-MG | FIX PAGOS LIST BUSCABLE ESTILO TRADICIONAL V004]
  if(window.ManttoCobranzaCorPagos) return;

  const ROUTE='cobranza-pagos';
  const API_PATH='/api/cobranza-cor/pagos';
  const PAGE_SIZE=50;
  const SEARCH_DELAY_MS=300;

  const state={
    root:null,
    response:null,
    records:[],
    projects:[],
    projectMap:new Map(),
    projectInputMap:new Map(),
    projectsLoaded:false,
    summary:{registros:0,con_proyecto:0,sin_proyecto:0},
    pagination:{page:1,pageSize:PAGE_SIZE,totalRecords:0,totalPages:1},
    filters:{q:'',estado:'',zonaAdm:'',relacionProyecto:''},
    selectedIds:new Set(),
    rowDrafts:new Map(),
    bulkProject:'',
    requestSequence:0,
    projectsSequence:0,
    searchTimer:null,
    loading:false,
    saving:false,
    boundRoot:null,
    activeProjectInput:null,
    activeProjectResults:[],
    activeProjectIndex:-1,
    globalComboEventsBound:false
  };

  function currentNavigation_cor(){
    if(!window.ManttoRouter||typeof window.ManttoRouter.getCurrent!=='function') return {route:'',payload:null};
    const current=window.ManttoRouter.getCurrent()||{};
    return {route:String(current.route||''),payload:current.payload||null};
  }
  function isActive_cor(){return currentNavigation_cor().route===ROUTE;}

  function escapeHtml_cor(value){
    return String(value===null||value===undefined?'':value)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function text_cor(value,fallback='—'){
    if(value===null||value===undefined) return fallback;
    const normalized=String(value).trim();
    return normalized||fallback;
  }
  function number_cor(value){
    if(value===null||value===undefined||value==='') return null;
    const parsed=Number(value);
    return Number.isFinite(parsed)?parsed:null;
  }
  function formatInteger_cor(value){
    const parsed=number_cor(value);
    return parsed===null?'—':new Intl.NumberFormat('es-MX',{maximumFractionDigits:0}).format(parsed);
  }
  function formatAmount_cor(value){
    const parsed=number_cor(value);
    return parsed===null?'—':new Intl.NumberFormat('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2}).format(parsed);
  }
  function formatDate_cor(value){
    const raw=String(value||'').trim();
    if(!raw) return '—';
    const iso=raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return iso?iso[3]+'/'+iso[2]+'/'+iso[1]:raw;
  }
  function formatDateTimeNow_cor(){
    if(window.ManttoHumanTime&&typeof window.ManttoHumanTime.formatMexicoCityDateTime==='function'){
      return window.ManttoHumanTime.formatMexicoCityDateTime();
    }
    return new Intl.DateTimeFormat('es-MX',{
      timeZone:'America/Mexico_City',day:'2-digit',month:'2-digit',year:'numeric',
      hour:'2-digit',minute:'2-digit',hourCycle:'h23'
    }).format(new Date()).replace(',',' -');
  }

  function apiGet_cor(path){
    if(!window.ManttoHttp||typeof window.ManttoHttp.get!=='function') return Promise.reject(new Error('Cliente HTTP central no disponible.'));
    return window.ManttoHttp.get(path);
  }
  function apiRequest_cor(path,options){
    if(!window.ManttoHttp||typeof window.ManttoHttp.request!=='function') return Promise.reject(new Error('Cliente HTTP central no disponible.'));
    return window.ManttoHttp.request(path,options||{});
  }
  function isViewerReadonly_cor(){
    const auth=window.ManttoAuth;
    if(auth&&typeof auth.getViewUser==='function'){
      try{return Boolean(auth.getViewUser());}catch(_error){}
    }
    const banner=document.getElementById('user-viewer-banner');
    return Boolean(banner&&!banner.hidden);
  }
  function errorMessage_cor(error){
    const code=String(error&&error.code||'').trim();
    const status=Number(error&&((error.statusCode||error.status))||0);
    if(code==='VIEWER_READ_ONLY') return 'El Visor de usuarios es de solo lectura.';
    if(code==='COBRANZA_PAGOS_PROYECTO_CON_FACTURAS') return 'Primero deben quitarse las relaciones con Facturas antes de quitar el proyecto.';
    if(code==='COBRANZA_PAGOS_PROYECTO_CONFLICTO_FACTURAS') return 'Uno de los Pagos ya tiene Facturas relacionadas con otro proyecto.';
    if(code==='COBRANZA_PAGOS_RELACIONES_INCONSISTENTES') return 'Uno de los Pagos tiene relaciones inconsistentes y no puede reasignarse.';
    if(code==='COBRANZA_PAGOS_MASIVO_NO_ENCONTRADOS') return 'Uno o más Pagos seleccionados ya no existen. Actualiza la tabla.';
    if(status===403||code==='INFORMATION_COMPLETE_DOMAIN_REQUIRED') return 'No tienes alcance completo autorizado para operar la bandeja general de Pagos.';
    if(status===404) return text_cor(error&&error.message,'El registro solicitado no fue encontrado.');
    return text_cor(error&&error.message,'No fue posible completar la operación.');
  }

  function setText_cor(id,value){
    const node=state.root&&state.root.querySelector('#'+id);
    if(node) node.textContent=String(value??'');
  }
  function setLoading_cor(loading){
    state.loading=Boolean(loading);
    if(!state.root) return;
    state.root.querySelectorAll('[data-ccor-pg-refresh],[data-ccor-pg-prev],[data-ccor-pg-next]')
      .forEach(button=>{button.disabled=state.loading||state.saving;});
  }

  function buildQuery_cor(){
    const query=new URLSearchParams();
    if(state.filters.q.trim()) query.set('q',state.filters.q.trim());
    if(state.filters.estado.trim()) query.set('estado',state.filters.estado.trim());
    if(state.filters.zonaAdm.trim()) query.set('zona_adm',state.filters.zonaAdm.trim());
    if(state.filters.relacionProyecto) query.set('relacion_proyecto',state.filters.relacionProyecto);
    query.set('page',String(state.pagination.page));
    query.set('page_size',String(state.pagination.pageSize));
    return query.toString();
  }
  function normalizePagination_cor(response){
    const raw=response&&response.paginacion||{};
    const page=Math.max(1,Number(raw.pagina)||1);
    const pageSize=Math.max(1,Math.min(100,Number(raw.tamano)||PAGE_SIZE));
    const totalRecords=Math.max(0,Number(raw.total_registros)||0);
    const totalPages=Math.max(1,Number(raw.total_paginas)||Math.ceil(totalRecords/pageSize)||1);
    return {page,pageSize,totalRecords,totalPages};
  }

  function canonicalProjectInput_cor(value){
    return String(value===null||value===undefined?'':value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .trim()
      .toUpperCase()
      .replace(/\s+/g,' ');
  }
  function projectLabel_cor(project){
    if(!project) return '';
    const parts=[text_cor(project.ppns,''),text_cor(project.proyecto,''),text_cor(project.cliente,'')].filter(Boolean);
    return parts.join(' · ');
  }
  function rebuildProjectMaps_cor(){
    state.projectMap=new Map();
    state.projectInputMap=new Map();
    state.projects.forEach(project=>{
      const ppns=String(project&&project.ppns||'').trim();
      if(!ppns) return;
      const label=projectLabel_cor(project);
      state.projectMap.set(canonicalProjectInput_cor(ppns),project);
      state.projectInputMap.set(canonicalProjectInput_cor(ppns),project);
      state.projectInputMap.set(canonicalProjectInput_cor(label),project);
    });
  }
  function projectMainLabel_cor(project){
    if(!project) return '';
    return [text_cor(project.ppns,''),text_cor(project.proyecto,'')].filter(Boolean).join(' · ');
  }
  function filterProjects_cor(query){
    const key=canonicalProjectInput_cor(query);
    if(!key) return state.projects.slice();
    return state.projects.filter(project=>canonicalProjectInput_cor(projectLabel_cor(project)).includes(key));
  }
  function projectDropdownOptionsHtml_cor(){
    if(!state.activeProjectResults.length){
      return '<div class="ccor-pg-project-dropdown-empty">Sin coincidencias</div>';
    }
    return state.activeProjectResults.map((project,index)=>{
      const active=index===state.activeProjectIndex;
      const ppns=String(project&&project.ppns||'').trim();
      const client=text_cor(project&&project.cliente,'');
      return `<button type="button" class="ccor-pg-project-option${active?' is-active':''}" data-ccor-pg-project-option data-index="${index}" data-ppns="${escapeHtml_cor(ppns)}" role="option" aria-selected="${active?'true':'false'}"><span class="ccor-pg-project-option-main">${escapeHtml_cor(projectMainLabel_cor(project))}</span>${client?`<small>${escapeHtml_cor(client)}</small>`:''}</button>`;
    }).join('');
  }
  function closeProjectDropdown_cor(){
    const dropdown=state.root&&state.root.querySelector('#ccor-pg-project-dropdown');
    if(dropdown){dropdown.hidden=true;dropdown.innerHTML='';}
    if(state.activeProjectInput&&state.activeProjectInput.setAttribute) state.activeProjectInput.setAttribute('aria-expanded','false');
    state.activeProjectInput=null;
    state.activeProjectResults=[];
    state.activeProjectIndex=-1;
  }
  function positionProjectDropdown_cor(input,dropdown){
    if(!input||!dropdown||typeof input.getBoundingClientRect!=='function') return;
    const rect=input.getBoundingClientRect();
    const viewportWidth=(document.documentElement&&document.documentElement.clientWidth)||window.innerWidth||1024;
    const width=Math.min(Math.max(rect.width,280),Math.max(220,viewportWidth-24));
    const left=Math.max(12,Math.min(rect.left,viewportWidth-width-12));
    dropdown.style.left=left+'px';
    dropdown.style.top=(rect.bottom+4)+'px';
    dropdown.style.width=width+'px';
  }
  function renderProjectDropdown_cor(input,query){
    if(!state.root||!input||input.disabled) return;
    const dropdown=state.root.querySelector('#ccor-pg-project-dropdown');
    if(!dropdown) return;
    if(state.activeProjectInput!==input) state.activeProjectIndex=-1;
    state.activeProjectInput=input;
    state.activeProjectResults=filterProjects_cor(query);
    if(state.activeProjectIndex>=state.activeProjectResults.length) state.activeProjectIndex=-1;
    dropdown.innerHTML=projectDropdownOptionsHtml_cor();
    dropdown.hidden=false;
    input.setAttribute('aria-expanded','true');
    positionProjectDropdown_cor(input,dropdown);
  }
  function selectProjectOption_cor(index){
    const input=state.activeProjectInput;
    const project=state.activeProjectResults[Number(index)];
    if(!input||!project) return false;
    const ppns=String(project.ppns||'').trim();
    input.value=projectLabel_cor(project);
    input.setAttribute('aria-invalid','false');
    if(input.id==='ccor-pg-bulk-project'){
      state.bulkProject=ppns;
    }else if(input.matches('[data-ccor-pg-row-project]')){
      const id=Number(input.dataset.pagoId);
      if(Number.isInteger(id)) state.rowDrafts.set(id,ppns);
    }
    closeProjectDropdown_cor();
    syncSelectionUi_cor();
    return true;
  }
  function moveProjectDropdown_cor(delta){
    if(!state.activeProjectInput) return;
    const total=state.activeProjectResults.length;
    if(!total) return;
    if(state.activeProjectIndex<0) state.activeProjectIndex=delta>0?0:total-1;
    else state.activeProjectIndex=(state.activeProjectIndex+delta+total)%total;
    const dropdown=state.root&&state.root.querySelector('#ccor-pg-project-dropdown');
    if(dropdown){
      dropdown.innerHTML=projectDropdownOptionsHtml_cor();
      const active=dropdown.querySelector('.ccor-pg-project-option.is-active');
      if(active&&typeof active.scrollIntoView==='function') active.scrollIntoView({block:'nearest'});
    }
  }
  function projectInputValue_cor(ppns){
    const raw=String(ppns||'').trim();
    if(!raw) return '';
    const project=state.projectMap.get(canonicalProjectInput_cor(raw));
    return project?projectLabel_cor(project):raw;
  }
  function resolveProjectInput_cor(value){
    const raw=String(value||'').trim();
    if(!raw) return {valid:true,ppns:'',project:null};
    const project=state.projectInputMap.get(canonicalProjectInput_cor(raw))||null;
    if(!project) return {valid:false,ppns:'',project:null};
    return {valid:true,ppns:String(project.ppns||'').trim(),project};
  }

  function renderShell_cor(){
    if(!state.root) return;
    const readonly=isViewerReadonly_cor();
    state.root.innerHTML=`
      <div class="ccor-pg-page" data-ccor-pg-root>
        <section class="ccor-pg-hero">
          <div>
            <p class="ccor-pg-eyebrow">Cobranza CORELLIAN</p>
            <h1>Pagos</h1>
            <p>Relación de Pagos con proyectos directamente desde la tabla principal.</p>
          </div>
          <div class="ccor-pg-hero-actions">
            <span class="ccor-pg-updated" id="ccor-pg-updated">Sin consultar</span>
            <button class="ccor-pg-btn ccor-pg-btn-primary" data-ccor-pg-refresh type="button">↻ Actualizar</button>
          </div>
        </section>

        <section class="ccor-pg-metrics" aria-label="Resumen de Pagos">
          <article><span>Total</span><strong id="ccor-pg-total">0</strong></article>
          <article><span>Con proyecto</span><strong id="ccor-pg-linked">0</strong></article>
          <article><span>Sin proyecto</span><strong id="ccor-pg-unlinked">0</strong></article>
          <article><span>Página</span><strong id="ccor-pg-page">1 / 1</strong></article>
        </section>

        <section class="ccor-pg-card ccor-pg-filters" aria-label="Filtros de Pagos">
          <label class="ccor-pg-field ccor-pg-search"><span>Buscar</span><input id="ccor-pg-search" type="search" autocomplete="off" placeholder="Factura, cliente, proyecto, PPNS o complemento..." value="${escapeHtml_cor(state.filters.q)}"></label>
          <label class="ccor-pg-field"><span>Estado</span><input id="ccor-pg-filter-estado" type="text" autocomplete="off" placeholder="Todos" value="${escapeHtml_cor(state.filters.estado)}"></label>
          <label class="ccor-pg-field"><span>Zona Adm.</span><input id="ccor-pg-filter-zona" type="text" autocomplete="off" placeholder="Todas" value="${escapeHtml_cor(state.filters.zonaAdm)}"></label>
          <label class="ccor-pg-field"><span>Proyecto</span><select id="ccor-pg-filter-relacion"><option value="">Todos</option><option value="CON_PROYECTO"${state.filters.relacionProyecto==='CON_PROYECTO'?' selected':''}>Con proyecto</option><option value="SIN_PROYECTO"${state.filters.relacionProyecto==='SIN_PROYECTO'?' selected':''}>Sin proyecto</option></select></label>
          <label class="ccor-pg-field ccor-pg-page-size"><span>Por página</span><select id="ccor-pg-page-size">${[25,50,100].map(size=>`<option value="${size}"${size===state.pagination.pageSize?' selected':''}>${size}</option>`).join('')}</select></label>
          <button class="ccor-pg-btn" data-ccor-pg-clear type="button">Limpiar</button>
        </section>

        <section class="ccor-pg-card ccor-pg-bulk" aria-label="Asignación masiva">
          <div>
            <strong>Asignación masiva</strong>
            <span id="ccor-pg-selected-count">0 seleccionados</span>
          </div>
          <label class="ccor-pg-field ccor-pg-bulk-project"><span>Proyecto de Fuente</span><div class="ccor-pg-project-combo"><input id="ccor-pg-bulk-project" type="text" data-ccor-pg-project-combo autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="ccor-pg-project-dropdown" placeholder="Escribe PPNS, proyecto o cliente..." value="${escapeHtml_cor(projectInputValue_cor(state.bulkProject))}" ${readonly?'disabled':''}><span class="ccor-pg-project-combo-arrow" aria-hidden="true">▾</span></div><small class="ccor-pg-project-hint">Escribe para acotar las opciones.</small></label>
          <button class="ccor-pg-btn ccor-pg-btn-primary" data-ccor-pg-bulk-save type="button" ${readonly?'disabled':''}>Asignar seleccionados</button>
        </section>

        <div class="ccor-pg-message" id="ccor-pg-message" aria-live="polite"></div>

        <section class="ccor-pg-card ccor-pg-table-card">
          <div class="ccor-pg-section-head"><div><h2>Listado de Pagos</h2><p id="ccor-pg-count">0 registros</p></div></div>
          <div class="ccor-pg-table-wrap">
            <table class="ccor-pg-table">
              <thead><tr>
                <th class="ccor-pg-select-col"><input id="ccor-pg-select-all" type="checkbox" aria-label="Seleccionar página" ${readonly?'disabled':''}></th>
                <th>ID Pago</th><th>Factura</th><th>Cliente</th><th>Proyecto origen</th><th>Proyecto relacionado</th><th>Complemento Pago</th><th>Fecha Pago</th><th class="ccor-pg-num">Importe</th><th>Estado</th><th>Zona Adm.</th><th>Acción</th>
              </tr></thead>
              <tbody id="ccor-pg-tbody"><tr><td colspan="12" class="ccor-pg-empty">Consultando Pagos...</td></tr></tbody>
            </table>
          </div>
          <div class="ccor-pg-pagination"><button class="ccor-pg-btn" data-ccor-pg-prev type="button">← Anterior</button><span id="ccor-pg-page-label">Página 1 de 1</span><button class="ccor-pg-btn" data-ccor-pg-next type="button">Siguiente →</button></div>
        </section>
        <div id="ccor-pg-project-dropdown" class="ccor-pg-project-dropdown" role="listbox" hidden></div>
      </div>`;
  }

  function renderRows_cor(){
    if(!state.root) return;
    closeProjectDropdown_cor();
    const tbody=state.root.querySelector('#ccor-pg-tbody');
    if(!tbody) return;
    const readonly=isViewerReadonly_cor();
    if(!state.records.length){
      tbody.innerHTML='<tr><td colspan="12" class="ccor-pg-empty">No hay Pagos para los filtros seleccionados.</td></tr>';
      syncSelectionUi_cor();
      return;
    }
    tbody.innerHTML=state.records.map(row=>{
      const id=Number(row&&row.id_pago_cor);
      const safeId=Number.isInteger(id)&&id>0?id:'';
      const current=String(row&&row.ppns_relacionado||'').trim();
      const draft=state.rowDrafts.has(safeId)?state.rowDrafts.get(safeId):current;
      const checked=state.selectedIds.has(safeId);
      return `<tr data-ccor-pg-row data-pago-id="${safeId}">
        <td class="ccor-pg-select-col" data-label="Seleccionar"><input type="checkbox" data-ccor-pg-select-row data-pago-id="${safeId}" ${checked?'checked':''} ${readonly?'disabled':''}></td>
        <td data-label="ID Pago"><strong>${escapeHtml_cor(text_cor(row.id_pago_cor))}</strong></td>
        <td data-label="Factura">${escapeHtml_cor(text_cor(row.no_factura))}</td>
        <td data-label="Cliente">${escapeHtml_cor(text_cor(row.cliente))}</td>
        <td data-label="Proyecto origen">${escapeHtml_cor(text_cor(row.proyecto))}</td>
        <td data-label="Proyecto relacionado" class="ccor-pg-project-cell">
          <div class="ccor-pg-project-combo ccor-pg-project-combo-row"><input type="text" class="ccor-pg-row-project" data-ccor-pg-row-project data-ccor-pg-project-combo data-pago-id="${safeId}" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="ccor-pg-project-dropdown" placeholder="Escribe para buscar..." value="${escapeHtml_cor(projectInputValue_cor(draft))}" ${readonly||state.saving?'disabled':''}><span class="ccor-pg-project-combo-arrow" aria-hidden="true">▾</span></div>
          ${current?`<small>${escapeHtml_cor(current)}</small>`:'<small>Sin relación</small>'}
        </td>
        <td data-label="Complemento Pago">${escapeHtml_cor(text_cor(row.complemento_pago))}</td>
        <td data-label="Fecha Pago">${escapeHtml_cor(formatDate_cor(row.fecha_complemento_pago))}</td>
        <td data-label="Importe" class="ccor-pg-num">${escapeHtml_cor(formatAmount_cor(row.importe_complemento_pago))}</td>
        <td data-label="Estado"><span class="ccor-pg-pill">${escapeHtml_cor(text_cor(row.estado))}</span></td>
        <td data-label="Zona Adm.">${escapeHtml_cor(text_cor(row.zona_adm))}</td>
        <td data-label="Acción"><button class="ccor-pg-btn ccor-pg-btn-small" type="button" data-ccor-pg-row-save data-pago-id="${safeId}" ${readonly||state.saving?'disabled':''}>Guardar</button></td>
      </tr>`;
    }).join('');
    syncSelectionUi_cor();
  }

  function syncSelectionUi_cor(){
    if(!state.root) return;
    const visibleIds=state.records.map(r=>Number(r.id_pago_cor)).filter(Number.isInteger);
    const selectedVisible=visibleIds.filter(id=>state.selectedIds.has(id));
    const all=state.root.querySelector('#ccor-pg-select-all');
    if(all){
      all.checked=visibleIds.length>0&&selectedVisible.length===visibleIds.length;
      all.indeterminate=selectedVisible.length>0&&selectedVisible.length<visibleIds.length;
    }
    setText_cor('ccor-pg-selected-count',state.selectedIds.size+' seleccionados');
    const bulk=state.root.querySelector('[data-ccor-pg-bulk-save]');
    if(bulk) bulk.disabled=isViewerReadonly_cor()||state.saving||state.selectedIds.size===0||!state.bulkProject;
  }

  function applyResponse_cor(response){
    state.response=response||{};
    state.records=Array.isArray(response&&response.data)?response.data:[];
    state.summary=response&&response.resumen&&typeof response.resumen==='object'?response.resumen:{registros:0,con_proyecto:0,sin_proyecto:0};
    state.pagination=normalizePagination_cor(response);
    const pageIds=new Set(state.records.map(row=>Number(row.id_pago_cor)).filter(Number.isInteger));
    state.selectedIds=new Set([...state.selectedIds].filter(id=>pageIds.has(id)));
    state.rowDrafts.clear();
    renderRows_cor();
    setText_cor('ccor-pg-total',formatInteger_cor(state.summary.registros??state.pagination.totalRecords));
    setText_cor('ccor-pg-linked',formatInteger_cor(state.summary.con_proyecto??0));
    setText_cor('ccor-pg-unlinked',formatInteger_cor(state.summary.sin_proyecto??0));
    setText_cor('ccor-pg-page',state.pagination.page+' / '+state.pagination.totalPages);
    setText_cor('ccor-pg-count',formatInteger_cor(state.pagination.totalRecords)+' registros');
    setText_cor('ccor-pg-page-label','Página '+state.pagination.page+' de '+state.pagination.totalPages);
    setText_cor('ccor-pg-updated','Actualizado '+formatDateTimeNow_cor());
    const prev=state.root&&state.root.querySelector('[data-ccor-pg-prev]');
    const next=state.root&&state.root.querySelector('[data-ccor-pg-next]');
    if(prev) prev.disabled=state.loading||state.saving||state.pagination.page<=1;
    if(next) next.disabled=state.loading||state.saving||state.pagination.page>=state.pagination.totalPages;
  }

  async function loadProjects_cor(){
    if(state.projectsLoaded) return true;
    const sequence=++state.projectsSequence;
    try{
      const response=await apiGet_cor(API_PATH+'/proyectos');
      if(sequence!==state.projectsSequence) return false;
      state.projects=Array.isArray(response&&response.data)?response.data:[];
      rebuildProjectMaps_cor();
      state.projectsLoaded=true;
      return true;
    }catch(error){
      state.projects=[];
      state.projectMap=new Map();
      state.projectInputMap=new Map();
      state.projectsLoaded=false;
      closeProjectDropdown_cor();
      throw error;
    }
  }

  async function refresh_cor(options={}){
    if(!state.root||!isActive_cor()) return false;
    if(options.resetPage) state.pagination.page=1;
    const sequence=++state.requestSequence;
    setLoading_cor(true);
    setText_cor('ccor-pg-message','Consultando Pagos...');
    try{
      await loadProjects_cor();
      const response=await apiGet_cor(API_PATH+'?'+buildQuery_cor());
      if(sequence!==state.requestSequence||!isActive_cor()) return false;
      if(!state.root.querySelector('#ccor-pg-bulk-project')){
        renderShell_cor();
        bindEvents_cor();
      }else{
        const bulkInput=state.root.querySelector('#ccor-pg-bulk-project');
        if(bulkInput&&document.activeElement!==bulkInput) bulkInput.value=projectInputValue_cor(state.bulkProject);
      }
      applyResponse_cor(response||{});
      setText_cor('ccor-pg-message','');
      return true;
    }catch(error){
      if(sequence!==state.requestSequence) return false;
      state.records=[];
      renderRows_cor();
      setText_cor('ccor-pg-message',errorMessage_cor(error));
      return false;
    }finally{
      if(sequence===state.requestSequence){setLoading_cor(false);syncSelectionUi_cor();}
    }
  }

  async function saveRowProject_cor(idPagoCor){
    const id=Number(idPagoCor);
    if(!Number.isInteger(id)||id<=0||state.saving||isViewerReadonly_cor()) return false;
    const row=state.records.find(item=>Number(item.id_pago_cor)===id);
    if(!row) return false;
    const input=state.root&&state.root.querySelector(`[data-ccor-pg-row-project][data-pago-id="${id}"]`);
    const inputValue=String(input?input.value:projectInputValue_cor(state.rowDrafts.get(id)||'')).trim();
    const resolved=resolveProjectInput_cor(inputValue);
    if(!resolved.valid){
      setText_cor('ccor-pg-message','Selecciona un proyecto válido del listado.');
      if(input) input.setAttribute('aria-invalid','true');
      return false;
    }
    if(input) input.removeAttribute('aria-invalid');
    const ppns=resolved.ppns;
    const current=String(row.ppns_relacionado||'').trim();
    state.saving=true;
    setText_cor('ccor-pg-message',ppns?'Guardando relación...':'Quitando relación...');
    renderRows_cor();
    try{
      if(ppns){
        await apiRequest_cor(API_PATH+'/'+encodeURIComponent(String(id))+'/proyecto',{method:'PUT',body:{ppns}});
      }else if(current){
        await apiRequest_cor(API_PATH+'/'+encodeURIComponent(String(id))+'/proyecto',{method:'DELETE'});
      }
      state.selectedIds.delete(id);
      await refresh_cor();
      setText_cor('ccor-pg-message','Relación actualizada.');
      return true;
    }catch(error){
      setText_cor('ccor-pg-message',errorMessage_cor(error));
      return false;
    }finally{
      state.saving=false;
      renderRows_cor();
      syncSelectionUi_cor();
    }
  }

  async function saveBulkProject_cor(){
    if(state.saving||isViewerReadonly_cor()) return false;
    const ids=[...state.selectedIds].filter(id=>Number.isInteger(id)&&id>0);
    const bulkInput=state.root&&state.root.querySelector('#ccor-pg-bulk-project');
    const resolved=resolveProjectInput_cor(bulkInput?bulkInput.value:projectInputValue_cor(state.bulkProject));
    const ppns=resolved.valid?resolved.ppns:'';
    if(!ids.length){setText_cor('ccor-pg-message','Selecciona al menos un Pago.');return false;}
    if(!resolved.valid){setText_cor('ccor-pg-message','Selecciona un proyecto válido del listado para la asignación masiva.');return false;}
    if(!ppns){setText_cor('ccor-pg-message','Selecciona el proyecto para la asignación masiva.');return false;}
    state.saving=true;
    syncSelectionUi_cor();
    setText_cor('ccor-pg-message','Asignando '+ids.length+' Pagos...');
    try{
      const response=await apiRequest_cor(API_PATH+'/proyecto/masivo',{method:'PUT',body:{ids_pago_cor:ids,ppns}});
      state.selectedIds.clear();
      state.bulkProject='';
      await refresh_cor();
      setText_cor('ccor-pg-message',(response&&Number(response.actualizados)||0)+' Pagos actualizados.');
      return true;
    }catch(error){
      setText_cor('ccor-pg-message',errorMessage_cor(error));
      return false;
    }finally{
      state.saving=false;
      syncSelectionUi_cor();
    }
  }

  function clearFilters_cor(){
    state.filters={q:'',estado:'',zonaAdm:'',relacionProyecto:''};
    state.pagination.page=1;
    state.selectedIds.clear();
    state.rowDrafts.clear();
    state.bulkProject='';
    renderShell_cor();
    bindEvents_cor();
    refresh_cor();
  }

  function bindEvents_cor(){
    const root=state.root;
    if(!root||state.boundRoot===root) return;
    state.boundRoot=root;

    root.addEventListener('click',event=>{
      const option=event.target.closest('[data-ccor-pg-project-option]');
      if(option){selectProjectOption_cor(option.dataset.index);return;}
      const comboInput=event.target.closest('[data-ccor-pg-project-combo]');
      if(comboInput){renderProjectDropdown_cor(comboInput,comboInput.value);return;}
      if(event.target.closest('[data-ccor-pg-refresh]')){refresh_cor();return;}
      if(event.target.closest('[data-ccor-pg-clear]')){clearFilters_cor();return;}
      if(event.target.closest('[data-ccor-pg-prev]')){if(state.pagination.page>1){state.pagination.page-=1;state.selectedIds.clear();refresh_cor();}return;}
      if(event.target.closest('[data-ccor-pg-next]')){if(state.pagination.page<state.pagination.totalPages){state.pagination.page+=1;state.selectedIds.clear();refresh_cor();}return;}
      const saveRow=event.target.closest('[data-ccor-pg-row-save]');
      if(saveRow){saveRowProject_cor(saveRow.dataset.pagoId);return;}
      if(event.target.closest('[data-ccor-pg-bulk-save]')){saveBulkProject_cor();}
    });

    root.addEventListener('input',event=>{
      if(event.target.id==='ccor-pg-search'){
        window.clearTimeout(state.searchTimer);
        state.searchTimer=window.setTimeout(()=>{
          state.filters.q=event.target.value||'';
          state.selectedIds.clear();
          refresh_cor({resetPage:true});
        },SEARCH_DELAY_MS);
        return;
      }
      if(event.target.matches('[data-ccor-pg-row-project]')){
        const id=Number(event.target.dataset.pagoId);
        const resolved=resolveProjectInput_cor(event.target.value);
        if(Number.isInteger(id)&&resolved.valid) state.rowDrafts.set(id,resolved.ppns);
        event.target.setAttribute('aria-invalid','false');
        renderProjectDropdown_cor(event.target,event.target.value);
        return;
      }
      if(event.target.id==='ccor-pg-bulk-project'){
        const resolved=resolveProjectInput_cor(event.target.value);
        state.bulkProject=resolved.valid?resolved.ppns:'';
        event.target.setAttribute('aria-invalid','false');
        renderProjectDropdown_cor(event.target,event.target.value);
        syncSelectionUi_cor();
      }
    });

    root.addEventListener('focusin',event=>{
      if(event.target.matches&&event.target.matches('[data-ccor-pg-project-combo]')){
        renderProjectDropdown_cor(event.target,event.target.value);
      }
    });

    root.addEventListener('keydown',event=>{
      if(!event.target.matches||!event.target.matches('[data-ccor-pg-project-combo]')) return;
      if(event.key==='ArrowDown'){event.preventDefault();if(state.activeProjectInput!==event.target) renderProjectDropdown_cor(event.target,event.target.value);moveProjectDropdown_cor(1);return;}
      if(event.key==='ArrowUp'){event.preventDefault();if(state.activeProjectInput!==event.target) renderProjectDropdown_cor(event.target,event.target.value);moveProjectDropdown_cor(-1);return;}
      if(event.key==='Enter'&&state.activeProjectInput===event.target&&state.activeProjectIndex>=0){event.preventDefault();selectProjectOption_cor(state.activeProjectIndex);return;}
      if(event.key==='Escape'){closeProjectDropdown_cor();return;}
      if(event.key==='Tab') closeProjectDropdown_cor();
    });

    root.addEventListener('change',event=>{
      if(event.target.id==='ccor-pg-filter-estado'){
        state.filters.estado=event.target.value||'';state.selectedIds.clear();refresh_cor({resetPage:true});return;
      }
      if(event.target.id==='ccor-pg-filter-zona'){
        state.filters.zonaAdm=event.target.value||'';state.selectedIds.clear();refresh_cor({resetPage:true});return;
      }
      if(event.target.id==='ccor-pg-filter-relacion'){
        state.filters.relacionProyecto=event.target.value||'';state.selectedIds.clear();refresh_cor({resetPage:true});return;
      }
      if(event.target.id==='ccor-pg-page-size'){
        const size=Number(event.target.value);state.pagination.pageSize=[25,50,100].includes(size)?size:PAGE_SIZE;state.selectedIds.clear();refresh_cor({resetPage:true});return;
      }
      if(event.target.id==='ccor-pg-select-all'){
        const checked=Boolean(event.target.checked);
        state.records.forEach(row=>{
          const id=Number(row.id_pago_cor);
          if(!Number.isInteger(id)) return;
          if(checked) state.selectedIds.add(id); else state.selectedIds.delete(id);
        });
        renderRows_cor();return;
      }
      if(event.target.matches('[data-ccor-pg-select-row]')){
        const id=Number(event.target.dataset.pagoId);
        if(Number.isInteger(id)){
          if(event.target.checked) state.selectedIds.add(id); else state.selectedIds.delete(id);
        }
        syncSelectionUi_cor();return;
      }
      if(event.target.matches('[data-ccor-pg-row-project]')){
        const id=Number(event.target.dataset.pagoId);
        const resolved=resolveProjectInput_cor(event.target.value);
        if(resolved.valid){
          if(Number.isInteger(id)) state.rowDrafts.set(id,resolved.ppns);
          event.target.value=projectInputValue_cor(resolved.ppns);
          event.target.setAttribute('aria-invalid','false');
        }else{
          event.target.setAttribute('aria-invalid','true');
        }
        closeProjectDropdown_cor();
        return;
      }
      if(event.target.id==='ccor-pg-bulk-project'){
        const resolved=resolveProjectInput_cor(event.target.value);
        if(resolved.valid){
          state.bulkProject=resolved.ppns;
          event.target.value=projectInputValue_cor(resolved.ppns);
          event.target.setAttribute('aria-invalid','false');
        }else{
          state.bulkProject='';
          event.target.setAttribute('aria-invalid','true');
        }
        syncSelectionUi_cor();
        closeProjectDropdown_cor();
      }
    });

    if(!state.globalComboEventsBound){
      document.addEventListener('pointerdown',event=>{
        if(!state.activeProjectInput) return;
        const dropdown=state.root&&state.root.querySelector('#ccor-pg-project-dropdown');
        const insideDropdown=dropdown&&dropdown.contains&&dropdown.contains(event.target);
        const insideCombo=event.target&&event.target.closest&&event.target.closest('.ccor-pg-project-combo');
        if(!insideDropdown&&!insideCombo) closeProjectDropdown_cor();
      });
      if(window.addEventListener) window.addEventListener('resize',closeProjectDropdown_cor);
      state.globalComboEventsBound=true;
    }
  }

  async function init_cor(rootArg){
    const root=rootArg&&rootArg.nodeType===1?rootArg:(document.getElementById('view-cobranza-pagos')||document.getElementById('view-placeholder'));
    if(!root||!isActive_cor()) return false;
    state.root=root;
    state.boundRoot=null;
    state.selectedIds.clear();
    state.rowDrafts.clear();
    renderShell_cor();
    bindEvents_cor();
    return refresh_cor();
  }

  function refreshCurrent_cor(){
    if(!isActive_cor()) return Promise.resolve(false);
    return refresh_cor();
  }

  document.addEventListener('mantto:navigation',event=>{
    const detail=event&&event.detail?event.detail:{};
    if(String(detail.route||'')!==ROUTE) return;
    const root=document.getElementById('view-placeholder');
    if(root) init_cor(root);
  });

  document.addEventListener('mantto:view-user-changed',()=>{
    state.response=null;
    state.records=[];
    state.projects=[];
    state.projectMap=new Map();
    state.projectInputMap=new Map();
    state.projectsLoaded=false;
    closeProjectDropdown_cor();
    state.pagination={page:1,pageSize:PAGE_SIZE,totalRecords:0,totalPages:1};
    state.selectedIds.clear();
    state.rowDrafts.clear();
    state.requestSequence+=1;
    state.projectsSequence+=1;
    if(isActive_cor()&&state.root) init_cor(state.root);
  });

  window.ManttoCobranzaCorPagos=Object.freeze({
    init:init_cor,
    refresh:refreshCurrent_cor,
    route:ROUTE,
    apiPath:API_PATH
  });
})();

(function(){
  'use strict';

  // [Aster | 2026-10-02 | ASTER-MG | COBRANZA COR PAGOS MODULO FASE 4 PROYECTO V001]
  // Fase 4: relacion manual Pago -> Proyecto/PPNS usando cobranza_pagos_cor.id_pp.
  // La edicion ocurre dentro de la vista; no se usan modales ni ventanas flotantes.
  if(window.ManttoCobranzaCorPagos) return;

  const ROUTE='cobranza-pagos';
  const API_PATH='/api/cobranza-cor/pagos';
  const PAGE_SIZE=50;
  const SEARCH_DELAY_MS=300;
  const PROJECT_SEARCH_DELAY_MS=250;

  const state={
    root:null,
    response:null,
    records:[],
    summary:{registros:0,con_proyecto:0,sin_proyecto:0},
    pagination:{page:1,pageSize:PAGE_SIZE,totalRecords:0,totalPages:1},
    filters:{q:'',estado:'',zonaAdm:'',relacionProyecto:''},
    requestSequence:0,
    detailSequence:0,
    projectSequence:0,
    searchTimer:null,
    projectSearchTimer:null,
    loading:false,
    savingProject:false,
    boundRoot:null,
    view:'list',
    selectedId:null,
    detail:null,
    projectEditorOpen:false,
    projectQuery:'',
    projectResults:[],
    selectedProject:null,
    confirmUnlink:false
  };

  function currentNavigation_cor(){
    if(!window.ManttoRouter||typeof window.ManttoRouter.getCurrent!=='function') return {route:'',payload:null};
    const current=window.ManttoRouter.getCurrent()||{};
    return {route:String(current.route||''),payload:current.payload||null};
  }
  function isActive_cor(){return currentNavigation_cor().route===ROUTE;}
  function currentPayload_cor(){return currentNavigation_cor().payload||null;}

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
  function formatDateTime_cor(value){
    const raw=String(value||'').trim();
    if(!raw) return '—';
    const match=raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
    if(!match) return raw;
    return match[3]+'/'+match[2]+'/'+match[1]+' '+match[4]+':'+match[5];
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
    if(code==='COBRANZA_PAGOS_PROYECTO_CONFLICTO_FACTURAS') return 'El Pago ya tiene Facturas relacionadas con otro proyecto.';
    if(code==='COBRANZA_PAGOS_RELACIONES_INCONSISTENTES') return 'El Pago tiene relaciones existentes que deben revisarse antes de cambiar de proyecto.';
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
      .forEach(button=>{button.disabled=state.loading;});
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

  function renderShell_cor(){
    if(!state.root) return;
    state.root.innerHTML=`
      <div class="ccor-pg-page" data-ccor-pg-root>
        <section class="ccor-pg-hero">
          <div>
            <p class="ccor-pg-eyebrow">Cobranza CORELLIAN</p>
            <h1>Pagos</h1>
            <p>Consulta y relación de Pagos con proyectos.</p>
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
          <label class="ccor-pg-field ccor-pg-search">
            <span>Buscar</span>
            <input id="ccor-pg-search" type="search" autocomplete="off" placeholder="Factura, cliente, proyecto, PPNS o complemento..." value="${escapeHtml_cor(state.filters.q)}">
          </label>
          <label class="ccor-pg-field"><span>Estado</span><input id="ccor-pg-filter-estado" type="text" autocomplete="off" placeholder="Todos" value="${escapeHtml_cor(state.filters.estado)}"></label>
          <label class="ccor-pg-field"><span>Zona Adm.</span><input id="ccor-pg-filter-zona" type="text" autocomplete="off" placeholder="Todas" value="${escapeHtml_cor(state.filters.zonaAdm)}"></label>
          <label class="ccor-pg-field"><span>Proyecto</span><select id="ccor-pg-filter-relacion"><option value="">Todos</option><option value="CON_PROYECTO"${state.filters.relacionProyecto==='CON_PROYECTO'?' selected':''}>Con proyecto</option><option value="SIN_PROYECTO"${state.filters.relacionProyecto==='SIN_PROYECTO'?' selected':''}>Sin proyecto</option></select></label>
          <label class="ccor-pg-field ccor-pg-page-size"><span>Por página</span><select id="ccor-pg-page-size">${[25,50,100].map(size=>`<option value="${size}"${size===state.pagination.pageSize?' selected':''}>${size}</option>`).join('')}</select></label>
          <button class="ccor-pg-btn" data-ccor-pg-clear type="button">Limpiar</button>
        </section>

        <div class="ccor-pg-message" id="ccor-pg-message" aria-live="polite"></div>

        <section class="ccor-pg-card ccor-pg-table-card">
          <div class="ccor-pg-section-head"><div><h2>Listado de Pagos</h2><p id="ccor-pg-count">0 registros</p></div></div>
          <div class="ccor-pg-table-wrap">
            <table class="ccor-pg-table">
              <thead><tr><th>ID Pago</th><th>Factura</th><th>Cliente</th><th>Proyecto origen</th><th>Proyecto relacionado</th><th>Complemento Pago</th><th>Fecha Pago</th><th class="ccor-pg-num">Importe</th><th>Estado</th><th>Zona Adm.</th></tr></thead>
              <tbody id="ccor-pg-tbody"><tr><td colspan="10" class="ccor-pg-empty">Consultando Pagos...</td></tr></tbody>
            </table>
          </div>
          <div class="ccor-pg-pagination"><button class="ccor-pg-btn" data-ccor-pg-prev type="button">← Anterior</button><span id="ccor-pg-page-label">Página 1 de 1</span><button class="ccor-pg-btn" data-ccor-pg-next type="button">Siguiente →</button></div>
        </section>
      </div>`;
  }

  function relationCell_cor(row){
    const ppns=text_cor(row&&row.ppns_relacionado,'');
    if(!ppns) return '<span class="ccor-pg-relation-empty">Sin proyecto</span>';
    const project=text_cor(row&&row.proyecto_relacionado,'');
    return `<span class="ccor-pg-relation"><strong>${escapeHtml_cor(ppns)}</strong>${project?`<small>${escapeHtml_cor(project)}</small>`:''}</span>`;
  }

  function renderRows_cor(){
    if(!state.root) return;
    const tbody=state.root.querySelector('#ccor-pg-tbody');
    if(!tbody) return;
    if(!state.records.length){
      tbody.innerHTML='<tr><td colspan="10" class="ccor-pg-empty">No hay Pagos para los filtros seleccionados.</td></tr>';
      return;
    }
    tbody.innerHTML=state.records.map(row=>{
      const id=Number(row&&row.id_pago_cor);
      const safeId=Number.isInteger(id)&&id>0?id:'';
      return `<tr class="ccor-pg-row" tabindex="0" role="button" data-ccor-pg-row data-pago-id="${safeId}" aria-label="Abrir Pago ${safeId}">
        <td data-label="ID Pago"><strong>${escapeHtml_cor(text_cor(row.id_pago_cor))}</strong></td>
        <td data-label="Factura">${escapeHtml_cor(text_cor(row.no_factura))}</td>
        <td data-label="Cliente">${escapeHtml_cor(text_cor(row.cliente))}</td>
        <td data-label="Proyecto origen">${escapeHtml_cor(text_cor(row.proyecto))}</td>
        <td data-label="Proyecto relacionado">${relationCell_cor(row)}</td>
        <td data-label="Complemento Pago">${escapeHtml_cor(text_cor(row.complemento_pago))}</td>
        <td data-label="Fecha Pago">${escapeHtml_cor(formatDate_cor(row.fecha_complemento_pago))}</td>
        <td data-label="Importe" class="ccor-pg-num">${escapeHtml_cor(formatAmount_cor(row.importe_complemento_pago))}</td>
        <td data-label="Estado"><span class="ccor-pg-pill">${escapeHtml_cor(text_cor(row.estado))}</span></td>
        <td data-label="Zona Adm.">${escapeHtml_cor(text_cor(row.zona_adm))}</td>
      </tr>`;
    }).join('');
  }

  function applyResponse_cor(response){
    state.response=response||{};
    state.records=Array.isArray(response&&response.data)?response.data:[];
    state.summary=response&&response.resumen&&typeof response.resumen==='object'?response.resumen:{registros:0,con_proyecto:0,sin_proyecto:0};
    state.pagination=normalizePagination_cor(response);
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
    if(prev) prev.disabled=state.loading||state.pagination.page<=1;
    if(next) next.disabled=state.loading||state.pagination.page>=state.pagination.totalPages;
  }

  async function refresh_cor(options={}){
    if(!state.root||!isActive_cor()) return false;
    if(options.resetPage) state.pagination.page=1;
    const sequence=++state.requestSequence;
    setLoading_cor(true);
    setText_cor('ccor-pg-message','Consultando Pagos...');
    try{
      const response=await apiGet_cor(API_PATH+'?'+buildQuery_cor());
      if(sequence!==state.requestSequence||!isActive_cor()) return false;
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
      if(sequence===state.requestSequence){
        setLoading_cor(false);
        if(state.response) applyResponse_cor(state.response);
      }
    }
  }

  function detailField_cor(label,value,formatter){
    const display=formatter?formatter(value):text_cor(value);
    return `<div class="ccor-pg-detail-field"><span>${escapeHtml_cor(label)}</span><strong>${escapeHtml_cor(display)}</strong></div>`;
  }

  function projectDisplay_cor(row){
    const ppns=text_cor(row&&row.ppns_relacionado,'');
    if(!ppns) return '<div class="ccor-pg-project-empty"><strong>Sin proyecto relacionado</strong><span>Selecciona un proyecto para vincular este Pago.</span></div>';
    return `<div class="ccor-pg-project-current"><div><span>PPNS</span><strong>${escapeHtml_cor(ppns)}</strong></div><div><span>Proyecto</span><strong>${escapeHtml_cor(text_cor(row.proyecto_relacionado))}</strong></div><div><span>Cliente</span><strong>${escapeHtml_cor(text_cor(row.cliente_relacionado))}</strong></div></div>`;
  }

  function projectEditor_cor(){
    if(!state.projectEditorOpen) return '';
    const readonly=isViewerReadonly_cor();
    const results=state.projectResults.length
      ? state.projectResults.map(item=>{
          const selected=state.selectedProject&&state.selectedProject.ppns===item.ppns;
          return `<button type="button" class="ccor-pg-project-result${selected?' is-selected':''}" data-ccor-pg-project-result data-ppns="${escapeHtml_cor(item.ppns||'')}"><strong>${escapeHtml_cor(text_cor(item.ppns))}</strong><span>${escapeHtml_cor(text_cor(item.proyecto))}</span><small>${escapeHtml_cor(text_cor(item.cliente))}</small></button>`;
        }).join('')
      : '<div class="ccor-pg-project-no-results">Escribe para buscar un PPNS, proyecto o cliente.</div>';
    return `<div class="ccor-pg-project-editor">
      <label class="ccor-pg-field"><span>Buscar proyecto</span><input id="ccor-pg-project-search" type="search" autocomplete="off" placeholder="PPNS, proyecto o cliente..." value="${escapeHtml_cor(state.projectQuery)}" ${readonly?'disabled':''}></label>
      <div class="ccor-pg-project-results" id="ccor-pg-project-results">${results}</div>
      <div class="ccor-pg-project-editor-actions">
        <button class="ccor-pg-btn" type="button" data-ccor-pg-project-cancel ${state.savingProject?'disabled':''}>Cancelar</button>
        <button class="ccor-pg-btn ccor-pg-btn-primary" type="button" data-ccor-pg-project-save ${(!state.selectedProject||state.savingProject||readonly)?'disabled':''}>${state.savingProject?'Guardando...':'Guardar relación'}</button>
      </div>
    </div>`;
  }

  function unlinkConfirm_cor(){
    if(!state.confirmUnlink) return '';
    return `<div class="ccor-pg-inline-confirm"><span>¿Quitar la relación con este proyecto?</span><div><button class="ccor-pg-btn" type="button" data-ccor-pg-unlink-cancel ${state.savingProject?'disabled':''}>Cancelar</button><button class="ccor-pg-btn ccor-pg-btn-danger" type="button" data-ccor-pg-unlink-confirm ${state.savingProject?'disabled':''}>${state.savingProject?'Quitando...':'Confirmar quitar'}</button></div></div>`;
  }

  function renderProjectCard_cor(row){
    const assigned=Boolean(text_cor(row&&row.ppns_relacionado,''));
    const readonly=isViewerReadonly_cor();
    return `<section class="ccor-pg-card ccor-pg-project-card">
      <div class="ccor-pg-project-head"><div><h2>Proyecto relacionado</h2><p>Relación operativa del Pago con el PPNS.</p></div><div class="ccor-pg-project-actions">
        <button class="ccor-pg-btn" type="button" data-ccor-pg-project-edit ${readonly||state.savingProject?'disabled':''}>${assigned?'Cambiar proyecto':'Relacionar proyecto'}</button>
        ${assigned?`<button class="ccor-pg-btn ccor-pg-btn-danger-outline" type="button" data-ccor-pg-unlink ${readonly||state.savingProject?'disabled':''}>Quitar relación</button>`:''}
      </div></div>
      ${projectDisplay_cor(row)}
      <div class="ccor-pg-project-message" id="ccor-pg-project-message" aria-live="polite"></div>
      ${projectEditor_cor()}
      ${unlinkConfirm_cor()}
    </section>`;
  }

  function renderDetail_cor(row){
    if(!state.root) return;
    state.root.innerHTML=`
      <div class="ccor-pg-page ccor-pg-detail-page" data-ccor-pg-root>
        <section class="ccor-pg-hero ccor-pg-hero-detail">
          <div><p class="ccor-pg-eyebrow">Cobranza CORELLIAN · Pago ${escapeHtml_cor(text_cor(row.id_pago_cor))}</p><h1>Detalle del Pago</h1><p>${escapeHtml_cor(text_cor(row.cliente))} · ${escapeHtml_cor(text_cor(row.proyecto))}</p></div>
          <div class="ccor-pg-hero-actions"><span class="ccor-pg-pill">${escapeHtml_cor(text_cor(row.estado))}</span><button class="ccor-pg-btn ccor-pg-btn-primary" data-ccor-pg-refresh-detail type="button">↻ Actualizar</button></div>
        </section>
        <div class="ccor-pg-message" id="ccor-pg-message" aria-live="polite"></div>
        ${renderProjectCard_cor(row)}
        <section class="ccor-pg-detail-grid">
          <article class="ccor-pg-card"><h2>Pago</h2><div class="ccor-pg-detail-fields">${detailField_cor('ID Pago',row.id_pago_cor)}${detailField_cor('No. Factura',row.no_factura)}${detailField_cor('Complemento Pago',row.complemento_pago)}${detailField_cor('Fecha Complemento',row.fecha_complemento_pago,formatDate_cor)}${detailField_cor('Importe Complemento',row.importe_complemento_pago,formatAmount_cor)}${detailField_cor('Estado',row.estado)}</div></article>
          <article class="ccor-pg-card"><h2>Cliente y proyecto de origen</h2><div class="ccor-pg-detail-fields">${detailField_cor('Cliente',row.cliente)}${detailField_cor('Proyecto origen',row.proyecto)}${detailField_cor('Zona Adm.',row.zona_adm)}${detailField_cor('Subsidiaria',row.subsidiaria)}${detailField_cor('Clase',row.clase)}${detailField_cor('Creado desde',row.creado_desde)}</div></article>
          <article class="ccor-pg-card"><h2>Importes</h2><div class="ccor-pg-detail-fields">${detailField_cor('Límite crédito',row.limite_credito,formatAmount_cor)}${detailField_cor('Facturado',row.facturado,formatAmount_cor)}${detailField_cor('Pagado',row.pagado,formatAmount_cor)}${detailField_cor('Saldo',row.saldo,formatAmount_cor)}${detailField_cor('Días retraso',row.dias_retraso,formatInteger_cor)}${detailField_cor('Términos',row.terminos)}</div></article>
          <article class="ccor-pg-card"><h2>Fechas</h2><div class="ccor-pg-detail-fields">${detailField_cor('Fecha servicio',row.fecha_servicio,formatDate_cor)}${detailField_cor('Fecha emisión',row.fecha_emision,formatDate_cor)}${detailField_cor('Fecha vencimiento',row.fecha_vencimiento,formatDate_cor)}${detailField_cor('Fecha creación OV',row.fecha_creacion_ov,formatDateTime_cor)}</div></article>
        </section>
      </div>`;
  }

  async function loadDetail_cor(idPagoCor){
    const id=Number(idPagoCor);
    if(!Number.isInteger(id)||id<=0) return false;
    state.view='detail';state.selectedId=id;state.detail=null;state.projectEditorOpen=false;state.projectQuery='';state.projectResults=[];state.selectedProject=null;state.confirmUnlink=false;
    if(state.root) state.root.innerHTML='<div class="ccor-pg-loading">Consultando detalle del Pago...</div>';
    const sequence=++state.detailSequence;
    try{
      const response=await apiGet_cor(API_PATH+'/'+encodeURIComponent(String(id)));
      if(sequence!==state.detailSequence||!isActive_cor()) return false;
      const row=response&&response.pago;
      if(!row) throw new Error('El backend no devolvió el Pago solicitado.');
      state.detail=row;
      renderDetail_cor(row);
      bindEvents_cor();
      return true;
    }catch(error){
      if(sequence!==state.detailSequence) return false;
      if(state.root) state.root.innerHTML=`<div class="ccor-pg-page"><section class="ccor-pg-card ccor-pg-error"><h1>Pagos</h1><p>${escapeHtml_cor(errorMessage_cor(error))}</p></section></div>`;
      return false;
    }
  }

  function renderDetailPreserving_cor(message){
    if(!state.detail) return;
    renderDetail_cor(state.detail);
    bindEvents_cor();
    if(message) setText_cor('ccor-pg-project-message',message);
  }

  async function searchProjects_cor(query){
    const q=String(query||'').trim();
    state.projectQuery=q;
    const sequence=++state.projectSequence;
    const params=new URLSearchParams();
    if(q) params.set('q',q);
    params.set('limit','25');
    try{
      const response=await apiGet_cor(API_PATH+'/proyectos?'+params.toString());
      if(sequence!==state.projectSequence||!state.projectEditorOpen) return;
      state.projectResults=Array.isArray(response&&response.data)?response.data:[];
      renderDetailPreserving_cor();
      const input=state.root&&state.root.querySelector('#ccor-pg-project-search');
      if(input){input.focus();input.setSelectionRange(input.value.length,input.value.length);}
    }catch(error){
      if(sequence!==state.projectSequence) return;
      state.projectResults=[];
      renderDetailPreserving_cor(errorMessage_cor(error));
    }
  }

  function openProjectEditor_cor(){
    if(isViewerReadonly_cor()||!state.detail) return;
    state.projectEditorOpen=true;state.confirmUnlink=false;state.projectQuery='';state.projectResults=[];state.selectedProject=null;
    renderDetailPreserving_cor();
    searchProjects_cor('');
  }

  async function saveProject_cor(){
    if(state.savingProject||!state.selectedProject||!state.selectedId) return;
    state.savingProject=true;
    renderDetailPreserving_cor('Guardando relación...');
    try{
      const response=await apiRequest_cor(API_PATH+'/'+encodeURIComponent(String(state.selectedId))+'/proyecto',{
        method:'PUT',headers:{'Content-Type':'application/json','Accept':'application/json'},
        body:JSON.stringify({ppns:state.selectedProject.ppns}),dedupe:false
      });
      if(!response||!response.pago) throw new Error('El backend no devolvió el Pago actualizado.');
      state.detail=response.pago;state.response=null;state.projectEditorOpen=false;state.projectResults=[];state.selectedProject=null;state.confirmUnlink=false;
      state.savingProject=false;
      renderDetailPreserving_cor('Proyecto relacionado correctamente.');
    }catch(error){
      state.savingProject=false;
      renderDetailPreserving_cor(errorMessage_cor(error));
    }
  }

  async function unlinkProject_cor(){
    if(state.savingProject||!state.selectedId) return;
    state.savingProject=true;
    renderDetailPreserving_cor('Quitando relación...');
    try{
      const response=await apiRequest_cor(API_PATH+'/'+encodeURIComponent(String(state.selectedId))+'/proyecto',{
        method:'DELETE',headers:{'Accept':'application/json'},dedupe:false
      });
      if(!response||!response.pago) throw new Error('El backend no devolvió el Pago actualizado.');
      state.detail=response.pago;state.response=null;state.projectEditorOpen=false;state.projectResults=[];state.selectedProject=null;state.confirmUnlink=false;
      state.savingProject=false;
      renderDetailPreserving_cor('Relación con proyecto eliminada.');
    }catch(error){
      state.savingProject=false;
      state.confirmUnlink=false;
      renderDetailPreserving_cor(errorMessage_cor(error));
    }
  }

  function openDetailRoute_cor(idPagoCor){
    const id=Number(idPagoCor);
    if(!Number.isInteger(id)||id<=0) return;
    if(window.ManttoRouter&&typeof window.ManttoRouter.go==='function'){
      window.ManttoRouter.go(ROUTE,{id},{navigationType:'open'});
      return;
    }
    loadDetail_cor(id);
  }

  function clearFilters_cor(){
    state.filters={q:'',estado:'',zonaAdm:'',relacionProyecto:''};
    state.pagination.page=1;
    renderShell_cor();bindEvents_cor();refresh_cor();
  }

  function bindEvents_cor(){
    const root=state.root;
    if(!root||state.boundRoot===root) return;
    state.boundRoot=root;

    root.addEventListener('click',event=>{
      if(event.target.closest('[data-ccor-pg-refresh]')){refresh_cor();return;}
      if(event.target.closest('[data-ccor-pg-refresh-detail]')){loadDetail_cor(state.selectedId);return;}
      if(event.target.closest('[data-ccor-pg-clear]')){clearFilters_cor();return;}
      if(event.target.closest('[data-ccor-pg-prev]')){if(state.pagination.page>1){state.pagination.page-=1;refresh_cor();}return;}
      if(event.target.closest('[data-ccor-pg-next]')){if(state.pagination.page<state.pagination.totalPages){state.pagination.page+=1;refresh_cor();}return;}
      if(event.target.closest('[data-ccor-pg-project-edit]')){openProjectEditor_cor();return;}
      if(event.target.closest('[data-ccor-pg-project-cancel]')){state.projectEditorOpen=false;state.projectResults=[];state.selectedProject=null;renderDetailPreserving_cor();return;}
      if(event.target.closest('[data-ccor-pg-project-save]')){saveProject_cor();return;}
      if(event.target.closest('[data-ccor-pg-unlink]')){state.projectEditorOpen=false;state.confirmUnlink=true;renderDetailPreserving_cor();return;}
      if(event.target.closest('[data-ccor-pg-unlink-cancel]')){state.confirmUnlink=false;renderDetailPreserving_cor();return;}
      if(event.target.closest('[data-ccor-pg-unlink-confirm]')){unlinkProject_cor();return;}
      const project=event.target.closest('[data-ccor-pg-project-result]');
      if(project&&project.dataset.ppns){
        state.selectedProject=state.projectResults.find(item=>String(item.ppns||'')===project.dataset.ppns)||null;
        renderDetailPreserving_cor();
        return;
      }
      const row=event.target.closest('[data-ccor-pg-row]');
      if(row&&row.dataset.pagoId) openDetailRoute_cor(row.dataset.pagoId);
    });

    root.addEventListener('keydown',event=>{
      if(event.key!=='Enter'&&event.key!==' ') return;
      const row=event.target.closest('[data-ccor-pg-row]');
      if(!row||!row.dataset.pagoId) return;
      event.preventDefault();openDetailRoute_cor(row.dataset.pagoId);
    });

    root.addEventListener('input',event=>{
      if(event.target.id==='ccor-pg-search'){
        window.clearTimeout(state.searchTimer);
        state.searchTimer=window.setTimeout(()=>{state.filters.q=event.target.value||'';refresh_cor({resetPage:true});},SEARCH_DELAY_MS);
        return;
      }
      if(event.target.id==='ccor-pg-project-search'){
        window.clearTimeout(state.projectSearchTimer);
        const value=event.target.value||'';
        state.projectQuery=value;
        state.projectSearchTimer=window.setTimeout(()=>searchProjects_cor(value),PROJECT_SEARCH_DELAY_MS);
      }
    });

    root.addEventListener('change',event=>{
      if(event.target.id==='ccor-pg-filter-estado'){state.filters.estado=event.target.value||'';refresh_cor({resetPage:true});return;}
      if(event.target.id==='ccor-pg-filter-zona'){state.filters.zonaAdm=event.target.value||'';refresh_cor({resetPage:true});return;}
      if(event.target.id==='ccor-pg-filter-relacion'){state.filters.relacionProyecto=event.target.value||'';refresh_cor({resetPage:true});return;}
      if(event.target.id==='ccor-pg-page-size'){
        const size=Number(event.target.value);state.pagination.pageSize=[25,50,100].includes(size)?size:PAGE_SIZE;refresh_cor({resetPage:true});
      }
    });
  }

  async function init_cor(rootArg){
    const root=rootArg&&rootArg.nodeType===1?rootArg:(document.getElementById('view-cobranza-pagos')||document.getElementById('view-placeholder'));
    if(!root||!isActive_cor()) return false;
    state.root=root;state.boundRoot=null;
    const payload=currentPayload_cor();
    const requestedId=Number(payload&&(payload.id||payload.id_pago_cor));
    if(Number.isInteger(requestedId)&&requestedId>0) return loadDetail_cor(requestedId);
    state.view='list';state.selectedId=null;state.detail=null;state.projectEditorOpen=false;state.confirmUnlink=false;
    renderShell_cor();bindEvents_cor();
    if(state.response){applyResponse_cor(state.response);setText_cor('ccor-pg-updated','Datos conservados de la consulta anterior');return true;}
    return refresh_cor();
  }

  function refreshCurrent_cor(){
    if(!isActive_cor()) return Promise.resolve(false);
    const payload=currentPayload_cor();
    const requestedId=Number(payload&&(payload.id||payload.id_pago_cor));
    if(Number.isInteger(requestedId)&&requestedId>0) return loadDetail_cor(requestedId);
    return refresh_cor();
  }

  document.addEventListener('mantto:navigation',event=>{
    const detail=event&&event.detail?event.detail:{};
    if(String(detail.route||'')!==ROUTE) return;
    const root=document.getElementById('view-placeholder');
    if(root) init_cor(root);
  });

  document.addEventListener('mantto:view-user-changed',()=>{
    state.response=null;state.records=[];state.summary={registros:0,con_proyecto:0,sin_proyecto:0};
    state.pagination={page:1,pageSize:PAGE_SIZE,totalRecords:0,totalPages:1};state.selectedId=null;state.detail=null;
    state.requestSequence+=1;state.detailSequence+=1;state.projectSequence+=1;
    if(isActive_cor()&&state.root) init_cor(state.root);
  });

  window.ManttoCobranzaCorPagos=Object.freeze({
    init:init_cor,refresh:refreshCurrent_cor,openDetail:openDetailRoute_cor,route:ROUTE,apiPath:API_PATH
  });
})();

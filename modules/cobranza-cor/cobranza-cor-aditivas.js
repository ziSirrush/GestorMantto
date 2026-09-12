(function(){
  'use strict';

  // [Aster | 2026-09-12 | ASTER-MG | FIX FASE 4 COBRANZA COR ADITIVAS CRUD V001]
  // Contrato funcional: FASE_3_COBRANZA_COR_ADITIVAS_BACKEND_V001 + CRUD manual de esta entrega.
  // Listado, detalle y formulario son vistas internas del Gestor. No se usan modales.
  // El Back pertenece exclusivamente a la barra contextual global.
  if(window.ManttoCobranzaCorAditivas) return;

  const ROUTE = 'cobranza-aditivas';
  const API_PATH = '/api/cobranza-cor/aditivas';
  const PAGE_SIZE = 30;
  const SEARCH_DELAY_MS = 300;

  const state = {
    root:null,
    response:null,
    records:[],
    summary:null,
    catalogs:{
      anios:[], departamentos:[], categorias:[], firmas_cot:[],
      estatus_trabajos:[], estatus_cobranza:[], supervisores:[], monedas:[]
    },
    pagination:{ page:1, pageSize:PAGE_SIZE, totalRecords:0, totalPages:1 },
    filters:{
      q:'', anio:'', departamento:'', categoria:'', firmaCot:'',
      estatusTrabajos:'', estatusCobranza:'', sup:'', moneda:'', soloPendientes:false
    },
    requestSequence:0,
    detailSequence:0,
    formSequence:0,
    searchTimer:null,
    loading:false,
    saving:false,
    boundRoot:null,
    view:'list',
    selectedId:null,
    detail:null,
    formMode:null
  };

  function currentNavigation_cor(){
    if(!window.ManttoRouter || typeof window.ManttoRouter.getCurrent !== 'function') return {route:'',payload:null};
    const current=window.ManttoRouter.getCurrent()||{};
    return {route:String(current.route||''),payload:current.payload||null};
  }

  function isActive_cor(){ return currentNavigation_cor().route===ROUTE; }
  function currentPayload_cor(){ return currentNavigation_cor().payload||null; }

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

  function canonical_cor(value){
    return String(value===null||value===undefined?'':value)
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase().replace(/\s+/g,' ');
  }

  function formatInteger_cor(value){
    const parsed=number_cor(value);
    return parsed===null?'—':new Intl.NumberFormat('es-MX',{maximumFractionDigits:0}).format(parsed);
  }

  function formatAmount_cor(value){
    const parsed=number_cor(value);
    return parsed===null?'—':new Intl.NumberFormat('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2}).format(parsed);
  }

  function formatMoney_cor(value,currency){
    const parsed=number_cor(value);
    if(parsed===null) return '—';
    const code=canonical_cor(currency);
    if(/^[A-Z]{3}$/.test(code) && code!=='SIN_MONEDA'){
      try{return new Intl.NumberFormat('es-MX',{style:'currency',currency:code,minimumFractionDigits:2,maximumFractionDigits:2}).format(parsed);}catch(_error){}
    }
    return formatAmount_cor(parsed)+(code&&code!=='SIN_MONEDA'?' '+code:'');
  }

  function formatPercent_cor(value){
    const parsed=number_cor(value);
    if(parsed===null) return '—';
    const normalized=Math.abs(parsed)<=1?parsed*100:parsed;
    return new Intl.NumberFormat('es-MX',{minimumFractionDigits:0,maximumFractionDigits:2}).format(normalized)+'%';
  }

  function formatDate_cor(value){
    const raw=String(value||'').trim();
    if(!raw) return '—';
    const iso=raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return iso?iso[3]+'/'+iso[2]+'/'+iso[1]:raw;
  }

  function formatDateTimeNow_cor(){
    return new Intl.DateTimeFormat('es-MX',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date());
  }

  function apiGet_cor(path){
    if(!window.ManttoHttp || typeof window.ManttoHttp.get!=='function') return Promise.reject(new Error('Cliente HTTP central no disponible.'));
    return window.ManttoHttp.get(path);
  }

  function apiRequest_cor(path,options){
    if(!window.ManttoHttp || typeof window.ManttoHttp.request!=='function') return Promise.reject(new Error('Cliente HTTP central no disponible.'));
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

  function errorMessage_cor(error,context){
    const status=Number(error&&error.status);
    if(status===401) return 'La sesión ya no está disponible. Vuelve a iniciar sesión para consultar Aditivas.';
    if(status===403 && context==='save') return text_cor(error&&error.message,'No tienes permiso o alcance para guardar esta Aditiva.');
    if(status===403) return 'No tienes permiso o alcance de información para consultar Aditivas.';
    if(status===404 && context==='detail') return 'La Aditiva no existe o quedó fuera de tu alcance autorizado.';
    if(status===404) return 'El endpoint funcional de Aditivas no está disponible en este entorno.';
    return text_cor(error&&error.message,'No fue posible consultar Aditivas.');
  }

  function statusClass_cor(value){
    const status=canonical_cor(value);
    if(!status) return 'is-neutral';
    if(status.includes('PAGAD')||status.includes('COBRAD')||status.includes('LIQUIDAD')||status.includes('EJECUTAD')||status.includes('TERMINAD')) return 'is-ok';
    if(status.includes('VENC')||status.includes('CANCEL')||status.includes('RECHAZ')||status.includes('NO PAG')) return 'is-danger';
    if(status.includes('PEND')||status.includes('PROCES')||status.includes('ESPERA')||status.includes('PARCIAL')) return 'is-warn';
    return 'is-neutral';
  }

  function isBackendPending_cor(response){
    return Boolean(response&&(response.available===false||response.supported===false||response.status==='PENDING_COBRANZA_COR_FUNCTIONAL_READ'));
  }

  function buildListPath_cor(){
    const params=new URLSearchParams();
    const f=state.filters;
    if(f.q) params.set('q',f.q);
    if(f.anio) params.set('anio',f.anio);
    if(f.departamento) params.set('departamento',f.departamento);
    if(f.categoria) params.set('categoria',f.categoria);
    if(f.firmaCot) params.set('firma_cot',f.firmaCot);
    if(f.estatusTrabajos) params.set('estatus_trabajos',f.estatusTrabajos);
    if(f.estatusCobranza) params.set('estatus_cobranza',f.estatusCobranza);
    if(f.sup) params.set('sup',f.sup);
    if(f.moneda) params.set('moneda',f.moneda);
    if(f.soloPendientes) params.set('solo_pendientes','1');
    params.set('page',String(state.pagination.page));
    params.set('page_size',String(state.pagination.pageSize));
    return API_PATH+'?'+params.toString();
  }

  function renderShell_cor(){
    if(!state.root) return;
    state.view='list';
    state.root.innerHTML=`
      <div class="ccor-ad-page">
        <section class="ccor-ad-card ccor-ad-hero">
          <div>
            <p class="ccor-ad-eyebrow">Cobranza · Corellian</p>
            <h1>Aditivas</h1>
            <p>Seguimiento de cotizaciones adicionales, cobranza y saldos pendientes.</p>
          </div>
          <div class="ccor-ad-hero-actions">
            <span id="ccor-ad-updated">Sin actualizar</span>
            <button id="ccor-ad-new" class="ccor-ad-btn ccor-ad-btn-primary" type="button" ${isViewerReadonly_cor()?'disabled title="El Visor de usuarios es de solo lectura"':''}>+ Nueva Aditiva</button>
            <button id="ccor-ad-refresh" class="ccor-ad-btn" type="button">↻ Actualizar</button>
          </div>
        </section>

        <section class="ccor-ad-card ccor-ad-note" role="note">
          <strong>Regla de negocio:</strong>
          <span>Las Aditivas se presentan separadas de Suministro e Instalación. Los filtros, el alcance, la paginación y los totales financieros provienen del backend CORELLIAN.</span>
        </section>

        <section id="ccor-ad-backend-state" class="ccor-ad-card ccor-ad-backend-state" hidden></section>

        <section id="ccor-ad-content">
          <section class="ccor-ad-kpi-grid" aria-label="Resumen autoritativo de Aditivas">
            <article class="ccor-ad-card ccor-ad-kpi"><span>Registros</span><b id="ccor-ad-kpi-records">0</b><small>Resultado filtrado</small></article>
            <article class="ccor-ad-card ccor-ad-kpi"><span>Vinculadas</span><b id="ccor-ad-kpi-linked">0</b><small>Con relación a INDICE</small></article>
            <article class="ccor-ad-card ccor-ad-kpi"><span>Sin vínculo</span><b id="ccor-ad-kpi-unlinked">0</b><small>Sin id_indice_cor</small></article>
            <article class="ccor-ad-card ccor-ad-kpi"><span>Con pendiente</span><b id="ccor-ad-kpi-pending">0</b><small>Saldo pendiente &gt; 0</small></article>
          </section>

          <section class="ccor-ad-card ccor-ad-financial-card">
            <div class="ccor-ad-section-head"><div><h2>Resumen financiero</h2><p>Importes calculados por el backend y separados por moneda.</p></div></div>
            <div id="ccor-ad-financial-summary" class="ccor-ad-financial-summary"></div>
          </section>

          <section class="ccor-ad-card ccor-ad-filters" aria-label="Filtros de Aditivas">
            <label class="ccor-ad-search-field"><span>Buscar</span><input id="ccor-ad-search" type="search" autocomplete="off" placeholder="Proyecto, PP, COT, OV, factura, equipo..." /></label>
            <label><span>Año cot.</span><select id="ccor-ad-year"><option value="">Todos</option></select></label>
            <label><span>Departamento</span><select id="ccor-ad-department"><option value="">Todos</option></select></label>
            <label><span>Categoría</span><select id="ccor-ad-category"><option value="">Todas</option></select></label>
            <label><span>Firma cot.</span><select id="ccor-ad-signature"><option value="">Todas</option></select></label>
            <label><span>Estatus trabajos</span><select id="ccor-ad-work-status"><option value="">Todos</option></select></label>
            <label><span>Estatus cobranza</span><select id="ccor-ad-status"><option value="">Todos</option></select></label>
            <label><span>Supervisor</span><select id="ccor-ad-supervisor"><option value="">Todos</option></select></label>
            <label><span>Moneda</span><select id="ccor-ad-currency"><option value="">Todas</option></select></label>
            <label><span>Pendiente</span><select id="ccor-ad-pending"><option value="">Todos</option><option value="1">Solo con pendiente</option></select></label>
            <button id="ccor-ad-clear" class="ccor-ad-btn" type="button">Limpiar filtros</button>
          </section>

          <section class="ccor-ad-card ccor-ad-table-card">
            <div class="ccor-ad-section-head"><div><h2>Listado de Aditivas</h2><p id="ccor-ad-count">0 registros</p></div></div>
            <div id="ccor-ad-status-line" class="ccor-ad-inline-status" aria-live="polite"></div>
            <div class="ccor-ad-table-wrap">
              <table class="ccor-ad-table">
                <thead><tr>
                  <th>Cotización</th><th>Proyecto</th><th>PP NS</th><th>Fecha cot.</th><th>Departamento</th><th>Categoría</th>
                  <th>Estatus trabajos</th><th>Estatus cobranza</th><th>OV</th><th>Factura</th><th>Moneda</th><th>Total</th><th>Pagado</th><th>Pendiente</th>
                </tr></thead>
                <tbody id="ccor-ad-table-body"></tbody>
              </table>
            </div>
            <div class="ccor-ad-pagination">
              <button id="ccor-ad-prev" class="ccor-ad-btn" type="button">← Anterior</button>
              <span id="ccor-ad-page-info">Página 1 de 1</span>
              <button id="ccor-ad-next" class="ccor-ad-btn" type="button">Siguiente →</button>
            </div>
          </section>
        </section>
      </div>`;

    const subtitle=document.getElementById('app-context-subtitle');
    if(subtitle) subtitle.textContent='Cobranza Corellian · Aditivas';
    bindEvents_cor();
  }

  function renderBackendPending_cor(response){
    const box=document.getElementById('ccor-ad-backend-state');
    const content=document.getElementById('ccor-ad-content');
    if(!box||!content) return;
    box.hidden=false;
    box.className='ccor-ad-card ccor-ad-backend-state is-pending';
    box.innerHTML=`<div class="ccor-ad-state-icon">🧩</div><div><h2>Backend funcional de Aditivas no disponible</h2><p>${escapeHtml_cor(text_cor(response&&response.message,'La ruta no entregó el contrato funcional esperado.'))}</p><small>${escapeHtml_cor(text_cor(response&&response.source_table,''))}</small></div>`;
    content.hidden=true;
  }

  function renderBackendReady_cor(){
    const box=document.getElementById('ccor-ad-backend-state');
    const content=document.getElementById('ccor-ad-content');
    if(box) box.hidden=true;
    if(content) content.hidden=false;
  }

  function fillSelect_cor(id,values,current,emptyLabel){
    const node=document.getElementById(id);
    if(!node) return;
    const normalized=Array.isArray(values)?values:[];
    node.innerHTML=`<option value="">${escapeHtml_cor(emptyLabel||'Todos')}</option>`+normalized.map(value=>`<option value="${escapeHtml_cor(value)}">${escapeHtml_cor(value)}</option>`).join('');
    node.value=current||'';
  }

  function renderCatalogs_cor(){
    const c=state.catalogs||{};
    fillSelect_cor('ccor-ad-year',c.anios,state.filters.anio,'Todos');
    fillSelect_cor('ccor-ad-department',c.departamentos,state.filters.departamento,'Todos');
    fillSelect_cor('ccor-ad-category',c.categorias,state.filters.categoria,'Todas');
    fillSelect_cor('ccor-ad-signature',c.firmas_cot,state.filters.firmaCot,'Todas');
    fillSelect_cor('ccor-ad-work-status',c.estatus_trabajos,state.filters.estatusTrabajos,'Todos');
    fillSelect_cor('ccor-ad-status',c.estatus_cobranza,state.filters.estatusCobranza,'Todos');
    fillSelect_cor('ccor-ad-supervisor',c.supervisores,state.filters.sup,'Todos');
    fillSelect_cor('ccor-ad-currency',c.monedas,state.filters.moneda,'Todas');
    const pending=document.getElementById('ccor-ad-pending');
    if(pending) pending.value=state.filters.soloPendientes?'1':'';
  }

  function renderKpis_cor(){
    const s=state.summary||{};
    setText_cor('ccor-ad-kpi-records',formatInteger_cor(s.registros??state.pagination.totalRecords));
    setText_cor('ccor-ad-kpi-linked',formatInteger_cor(s.vinculadas_indice??0));
    setText_cor('ccor-ad-kpi-unlinked',formatInteger_cor(s.sin_vinculo_indice??0));
    setText_cor('ccor-ad-kpi-pending',formatInteger_cor(s.con_pendiente??0));
  }

  function renderFinancialSummary_cor(){
    const root=document.getElementById('ccor-ad-financial-summary');
    if(!root) return;
    const items=Array.isArray(state.summary&&state.summary.por_moneda)?state.summary.por_moneda:[];
    if(!items.length){
      root.innerHTML='<div class="ccor-ad-financial-empty">Sin importes para los filtros seleccionados.</div>';
      return;
    }
    root.innerHTML=items.map(item=>{
      const currency=canonical_cor(item&&item.moneda)||'SIN_MONEDA';
      return `<article class="ccor-ad-financial-currency">
        <div class="ccor-ad-financial-title"><b>${escapeHtml_cor(currency)}</b><span>${escapeHtml_cor(formatInteger_cor(item.registros))} reg.</span></div>
        <div><span>Subtotal</span><b>${escapeHtml_cor(formatMoney_cor(item.monto_subtotal,currency))}</b></div>
        <div><span>IVA</span><b>${escapeHtml_cor(formatMoney_cor(item.monto_iva,currency))}</b></div>
        <div><span>Total</span><b>${escapeHtml_cor(formatMoney_cor(item.monto_total,currency))}</b></div>
        <div><span>Gasto</span><b>${escapeHtml_cor(formatMoney_cor(item.gasto_subtotal,currency))}</b></div>
        <div><span>Diferencia</span><b>${escapeHtml_cor(formatMoney_cor(item.diferencia,currency))}</b></div>
        <div><span>Pagado</span><b>${escapeHtml_cor(formatMoney_cor(item.monto_pagado,currency))}</b></div>
        <div><span>Pendiente</span><b class="is-pending">${escapeHtml_cor(formatMoney_cor(item.pendiente_pago,currency))}</b></div>
      </article>`;
    }).join('');
  }

  function renderTable_cor(){
    const body=document.getElementById('ccor-ad-table-body');
    if(!body) return;
    if(!state.records.length){
      body.innerHTML='<tr><td colspan="14" class="ccor-ad-empty">No se encontraron Aditivas con los filtros seleccionados.</td></tr>';
      return;
    }
    body.innerHTML=state.records.map(row=>{
      const id=Number(row&&row.id_aditiva_cor);
      const currency=canonical_cor(row&&row.moneda);
      return `<tr class="ccor-ad-row" data-ccor-ad-row="${Number.isInteger(id)&&id>0?id:''}" tabindex="0" role="button" aria-label="Abrir detalle de ${escapeHtml_cor(text_cor(row&&row.no_cot,'Aditiva'))}">
        <td><strong>${escapeHtml_cor(text_cor(row&&row.no_cot))}</strong></td>
        <td>${escapeHtml_cor(text_cor(row&&row.proyecto))}</td>
        <td>${escapeHtml_cor(text_cor(row&&row.pp_ns))}</td>
        <td>${escapeHtml_cor(formatDate_cor(row&&row.fecha_cot))}</td>
        <td>${escapeHtml_cor(text_cor(row&&row.departamento))}</td>
        <td>${escapeHtml_cor(text_cor(row&&row.categoria))}</td>
        <td><span class="ccor-ad-badge ${statusClass_cor(row&&row.estatus_trabajos)}">${escapeHtml_cor(text_cor(row&&row.estatus_trabajos))}</span></td>
        <td><span class="ccor-ad-badge ${statusClass_cor(row&&row.estatus_cobranza)}">${escapeHtml_cor(text_cor(row&&row.estatus_cobranza))}</span></td>
        <td>${escapeHtml_cor(text_cor(row&&row.ov))}</td>
        <td>${escapeHtml_cor(text_cor(row&&row.factura))}</td>
        <td><b>${escapeHtml_cor(currency||'—')}</b></td>
        <td class="ccor-ad-num">${escapeHtml_cor(formatMoney_cor(row&&row.monto_total,currency))}</td>
        <td class="ccor-ad-num">${escapeHtml_cor(formatMoney_cor(row&&row.monto_pagado,currency))}</td>
        <td class="ccor-ad-num is-pending">${escapeHtml_cor(formatMoney_cor(row&&row.pendiente_pago,currency))}</td>
      </tr>`;
    }).join('');
  }

  function renderPagination_cor(){
    const p=state.pagination;
    const prev=document.getElementById('ccor-ad-prev');
    const next=document.getElementById('ccor-ad-next');
    const info=document.getElementById('ccor-ad-page-info');
    if(prev) prev.disabled=state.loading||p.page<=1;
    if(next) next.disabled=state.loading||p.page>=p.totalPages;
    if(info) info.textContent=`Página ${p.page} de ${p.totalPages}`;
    setText_cor('ccor-ad-count',`${formatInteger_cor(p.totalRecords)} registros`);
  }

  function detailValue_cor(label,value,className){
    return `<div class="ccor-ad-detail-pair ${className||''}"><span>${escapeHtml_cor(label)}</span><b>${escapeHtml_cor(text_cor(value))}</b></div>`;
  }

  function detailMoney_cor(label,value,currency,className){
    return `<div class="ccor-ad-detail-pair ${className||''}"><span>${escapeHtml_cor(label)}</span><b>${escapeHtml_cor(formatMoney_cor(value,currency))}</b></div>`;
  }

  function detailStatusBadge_cor(value){
    return `<span class="ccor-ad-badge ${statusClass_cor(value)}">${escapeHtml_cor(text_cor(value))}</span>`;
  }

  function renderDetailLoading_cor(){
    if(!state.root) return;
    state.view='detail';
    state.root.innerHTML=`
      <div class="ccor-ad-page ccor-ad-detail-page">
        <section class="ccor-ad-card ccor-ad-detail-loading">
          <span class="ccor-ad-spinner" aria-hidden="true"></span>
          <div><b>Cargando Aditiva...</b><small>Consultando el registro autorizado en CORELLIAN.</small></div>
        </section>
      </div>`;
  }

  function renderDetailError_cor(message){
    if(!state.root) return;
    state.view='detail';
    state.root.innerHTML=`
      <div class="ccor-ad-page ccor-ad-detail-page">
        <section class="ccor-ad-card ccor-ad-detail-error">
          <div class="ccor-ad-detail-error-icon">⚠️</div>
          <div><h2>No fue posible abrir la Aditiva</h2><p>${escapeHtml_cor(message)}</p></div>
        </section>
      </div>`;
  }

  function renderLinkedProject_cor(row){
    const indice=row&&row.indice&&typeof row.indice==='object'?row.indice:null;
    if(!row||row.vinculo_indice!==true||!indice){
      return `
        <section class="ccor-ad-card ccor-ad-linked-card is-unlinked">
          <div class="ccor-ad-linked-title"><span class="ccor-ad-linked-icon">○</span><b>Proyecto CORELLIAN vinculado</b></div>
          <div class="ccor-ad-linked-empty">
            <strong>Sin vínculo a INDICE</strong>
            <span>Esta Aditiva no tiene una relación estructurada inequívoca con un proyecto de Cobranza COR.</span>
          </div>
        </section>`;
    }

    const indiceId=Number(indice.id_indice_cor||row.id_indice_cor);
    return `
      <section class="ccor-ad-card ccor-ad-linked-card">
        <div class="ccor-ad-linked-title"><span class="ccor-ad-linked-icon">↗</span><b>Proyecto CORELLIAN vinculado</b></div>
        <div class="ccor-ad-linked-body">
          <dl>
            <div><dt>Proyecto</dt><dd>${escapeHtml_cor(text_cor(indice.proyecto))}</dd></div>
            <div><dt>PP / NS</dt><dd>${escapeHtml_cor(text_cor(indice.pp))}</dd></div>
            <div><dt>Año</dt><dd>${escapeHtml_cor(text_cor(indice.anio))}</dd></div>
          </dl>
          ${Number.isInteger(indiceId)&&indiceId>0?`<button class="ccor-ad-btn ccor-ad-btn-primary ccor-ad-linked-button" type="button" data-ccor-ad-estado-cuenta="${indiceId}">Ver Estado de Cuenta</button>`:''}
        </div>
        <div class="ccor-ad-linked-ok">✓ Vinculada a INDICE</div>
      </section>`;
  }

  function renderDetailSection_cor(title,icon,body,className){
    return `
      <section class="ccor-ad-card ccor-ad-detail-section ${className||''}">
        <div class="ccor-ad-detail-section-title"><span>${icon}</span><h2>${escapeHtml_cor(title)}</h2></div>
        <div class="ccor-ad-detail-section-body">${body}</div>
      </section>`;
  }

  function renderDetail_cor(row){
    if(!state.root||!row) return;
    state.view='detail';
    const currency=canonical_cor(row.moneda)||'—';
    const pending=number_cor(row.pendiente_pago);
    const pendingClass=pending!==null&&pending>0?'is-danger':'is-ok';
    const project=text_cor(row.proyecto,'Proyecto sin nombre');
    const equipment=text_cor(row.equipo,'');
    const subtitle=equipment&&equipment!=='—'?project+' · '+equipment:project;

    const identification=[
      detailValue_cor('Año Cot.',row.anio_cot),
      detailValue_cor('No. Cotización',row.no_cot),
      detailValue_cor('Fecha Cotización',formatDate_cor(row.fecha_cot)),
      detailValue_cor('Departamento',row.departamento),
      detailValue_cor('Categoría',row.categoria),
      detailValue_cor('Firma Cot.',row.firma_cot),
      detailValue_cor('Supervisor (SUP)',row.sup)
    ].join('');

    const work=[
      detailValue_cor('Proyecto',row.proyecto,'is-wide'),
      detailValue_cor('PP / NS',row.pp_ns),
      detailValue_cor('Equipo',row.equipo),
      detailValue_cor('Estatus Trabajos',row.estatus_trabajos,'is-wide'),
      `<div class="ccor-ad-detail-pair is-wide"><span>Descripción</span><b class="is-normal">${escapeHtml_cor(text_cor(row.descripcion,'Sin descripción registrada.'))}</b></div>`,
      `<div class="ccor-ad-detail-pair is-wide"><span>Comentario Fuente</span><b class="is-normal">${escapeHtml_cor(text_cor(row.comentario_fuente,'Sin comentario registrado.'))}</b></div>`
    ].join('');

    const documents=[
      detailValue_cor('Orden de Venta (OV)',row.ov),
      detailValue_cor('Orden de Compra (OC)',row.oc),
      detailValue_cor('Factura',row.factura)
    ].join('');

    const financial=[
      detailMoney_cor('Subtotal',row.monto_subtotal,currency),
      detailValue_cor('IVA %',formatPercent_cor(row.iva_pct)),
      detailMoney_cor('IVA',row.monto_iva,currency),
      detailMoney_cor('Total',row.monto_total,currency),
      detailMoney_cor('Gasto Subtotal',row.gasto_subtotal,currency),
      detailMoney_cor('Diferencia',row.diferencia,currency),
      detailValue_cor('Utilidad Real %',formatPercent_cor(row.utilidad_real_pct))
    ].join('');

    const collection=[
      detailValue_cor('Estatus Cobranza',row.estatus_cobranza),
      detailMoney_cor('Monto Pagado',row.monto_pagado,currency),
      detailMoney_cor('Pagado sin IVA',row.pagado_sin_iva,currency),
      detailMoney_cor('Pendiente de Pago',row.pendiente_pago,currency,'is-pending'),
      detailValue_cor('Fecha de Pago',formatDate_cor(row.fecha_pago)),
      detailValue_cor('Semana de Pago',row.semana_pago),
      detailValue_cor('Moneda',currency),
      detailValue_cor('Gasto Ejercido',row.gasto_ejercido)
    ].join('');

    state.root.innerHTML=`
      <div class="ccor-ad-page ccor-ad-detail-page">
        <div class="ccor-ad-detail-toolbar">
          <span>Consulta: <b>${escapeHtml_cor(formatDateTimeNow_cor())}</b></span>
          <button class="ccor-ad-btn ccor-ad-btn-primary" type="button" data-ccor-ad-edit="${escapeHtml_cor(row.id_aditiva_cor)}" ${isViewerReadonly_cor()?'disabled title="El Visor de usuarios es de solo lectura"':''}>Editar Aditiva</button>
        </div>

        <section class="ccor-ad-detail-hero">
          <div class="ccor-ad-detail-identity">
            <div class="ccor-ad-detail-document-icon" aria-hidden="true">▤+</div>
            <div>
              <p class="ccor-ad-eyebrow">Cobranza · Corellian</p>
              <h1>Aditiva · ${escapeHtml_cor(text_cor(row.no_cot,'Sin No. Cot.'))}</h1>
              <p class="ccor-ad-detail-subtitle">${escapeHtml_cor(subtitle)}</p>
              <div class="ccor-ad-detail-badges">
                ${detailStatusBadge_cor(row.estatus_cobranza)}
                ${detailStatusBadge_cor(row.estatus_trabajos)}
                <span class="ccor-ad-badge is-currency">${escapeHtml_cor(currency)}</span>
              </div>
            </div>
          </div>
          <article class="ccor-ad-card ccor-ad-pending-hero ${pendingClass}">
            <span>Pendiente de pago</span>
            <b>${escapeHtml_cor(formatMoney_cor(row.pendiente_pago,currency))}</b>
          </article>
        </section>

        <div class="ccor-ad-detail-summary-row">
          <section class="ccor-ad-card ccor-ad-detail-summary-card">
            <div class="ccor-ad-detail-summary-title">Resumen financiero</div>
            <div class="ccor-ad-detail-summary-grid">
              ${detailMoney_cor('Subtotal',row.monto_subtotal,currency)}
              ${detailMoney_cor('IVA',row.monto_iva,currency)}
              ${detailMoney_cor('Total',row.monto_total,currency)}
              ${detailMoney_cor('Pagado',row.monto_pagado,currency,'is-paid')}
              ${detailMoney_cor('Pendiente',row.pendiente_pago,currency,'is-pending')}
            </div>
          </section>
          ${renderLinkedProject_cor(row)}
        </div>

        <div class="ccor-ad-detail-grid-top">
          ${renderDetailSection_cor('1. Identificación','▤',identification)}
          ${renderDetailSection_cor('2. Proyecto / Trabajo','▣',work)}
          ${renderDetailSection_cor('3. Documentación comercial','□',documents)}
        </div>

        <div class="ccor-ad-detail-grid-bottom">
          ${renderDetailSection_cor('4. Información financiera','⌁',financial)}
          ${renderDetailSection_cor('5. Cobranza','$',collection)}
        </div>
      </div>`;

    const subtitleNode=document.getElementById('app-context-subtitle');
    if(subtitleNode) subtitleNode.textContent='Aditiva · '+text_cor(row.no_cot,'Detalle');
    try{window.scrollTo({top:0,behavior:'smooth'});}catch(_error){window.scrollTo(0,0);}
  }

  function formRaw_cor(value){
    return value===null||value===undefined?'':String(value);
  }

  function formPercent_cor(value){
    const parsed=number_cor(value);
    if(parsed===null) return '';
    const pct=Math.abs(parsed)<=1?parsed*100:parsed;
    return String(Math.round((pct+Number.EPSILON)*10000)/10000);
  }

  function formOptions_cor(values){
    return (Array.isArray(values)?values:[])
      .map(value=>`<option value="${escapeHtml_cor(value)}"></option>`)
      .join('');
  }

  async function ensureFormCatalogs_cor(){
    const c=state.catalogs||{};
    if(Object.values(c).some(values=>Array.isArray(values)&&values.length)) return true;
    try{
      const response=await apiGet_cor(API_PATH+'?page=1&page_size=1');
      if(response&&response.catalogos&&typeof response.catalogos==='object') state.catalogs=response.catalogos;
      return true;
    }catch(_error){
      return false;
    }
  }

  function formField_cor(label,name,value,options){
    const cfg=options||{};
    const type=cfg.type||'text';
    const wide=cfg.wide?' is-wide':'';
    const list=cfg.list?` list="${escapeHtml_cor(cfg.list)}"`:'';
    const step=cfg.step?` step="${escapeHtml_cor(cfg.step)}"`:'';
    const min=cfg.min!==undefined?` min="${escapeHtml_cor(cfg.min)}"`:'';
    const max=cfg.max!==undefined?` max="${escapeHtml_cor(cfg.max)}"`:'';
    const placeholder=cfg.placeholder?` placeholder="${escapeHtml_cor(cfg.placeholder)}"`:'';
    return `<label class="ccor-ad-form-field${wide}"><span>${escapeHtml_cor(label)}</span><input name="${escapeHtml_cor(name)}" type="${escapeHtml_cor(type)}" value="${escapeHtml_cor(formRaw_cor(value))}"${list}${step}${min}${max}${placeholder}></label>`;
  }

  function formTextarea_cor(label,name,value){
    return `<label class="ccor-ad-form-field is-wide"><span>${escapeHtml_cor(label)}</span><textarea name="${escapeHtml_cor(name)}" rows="4">${escapeHtml_cor(formRaw_cor(value))}</textarea></label>`;
  }

  function renderForm_cor(mode,row){
    if(!state.root) return;
    if(isViewerReadonly_cor()){
      renderDetailError_cor('El Visor de usuarios es de solo lectura. Sal del visor para crear o editar Aditivas.');
      return;
    }
    const record=row||{};
    const isEdit=mode==='edit';
    state.view='form';
    state.formMode=isEdit?'edit':'create';
    state.selectedId=isEdit?Number(record.id_aditiva_cor)||null:null;
    const c=state.catalogs||{};

    state.root.innerHTML=`
      <div class="ccor-ad-page ccor-ad-form-page">
        <section class="ccor-ad-card ccor-ad-form-hero">
          <div>
            <p class="ccor-ad-eyebrow">Cobranza · Corellian</p>
            <h1>${isEdit?'Editar Aditiva':'Nueva Aditiva'}</h1>
            <p>${isEdit?'Actualiza el registro existente usando el mismo formulario de alta.':'Captura una Aditiva nueva. El vínculo con INDICE se resuelve y valida en backend.'}</p>
          </div>
          ${isEdit?`<span class="ccor-ad-form-id">ID ${escapeHtml_cor(record.id_aditiva_cor)}</span>`:''}
        </section>

        <div id="ccor-ad-form-status" class="ccor-ad-inline-status" aria-live="polite"></div>

        <form id="ccor-ad-form" class="ccor-ad-form" novalidate>
          <section class="ccor-ad-card ccor-ad-form-section">
            <div class="ccor-ad-detail-section-title"><span>▤</span><h2>1. Identificación</h2></div>
            <div class="ccor-ad-form-grid">
              ${formField_cor('Año Cot.','anio_cot',record.anio_cot,{type:'number',min:1900,max:2500})}
              ${formField_cor('No. Cotización','no_cot',record.no_cot)}
              ${formField_cor('Fecha Cotización','fecha_cot',record.fecha_cot,{type:'date'})}
              ${formField_cor('Departamento','departamento',record.departamento,{list:'ccor-ad-form-departamentos'})}
              ${formField_cor('Categoría','categoria',record.categoria,{list:'ccor-ad-form-categorias'})}
              ${formField_cor('Firma Cot.','firma_cot',record.firma_cot,{list:'ccor-ad-form-firmas'})}
            </div>
          </section>

          <section class="ccor-ad-card ccor-ad-form-section">
            <div class="ccor-ad-detail-section-title"><span>▣</span><h2>2. Proyecto / Trabajo</h2></div>
            <div class="ccor-ad-form-grid">
              ${formField_cor('Proyecto','proyecto',record.proyecto,{wide:true})}
              ${formField_cor('PP / NS','pp_ns',record.pp_ns)}
              ${formField_cor('Equipo','equipo',record.equipo)}
              ${formField_cor('Supervisor (SUP)','sup',record.sup,{list:'ccor-ad-form-supervisores'})}
              ${formField_cor('Estatus Trabajos','estatus_trabajos',record.estatus_trabajos,{list:'ccor-ad-form-estatus-trabajos'})}
              ${formTextarea_cor('Descripción','descripcion',record.descripcion)}
              ${formTextarea_cor('Comentario Fuente','comentario_fuente',record.comentario_fuente)}
            </div>
          </section>

          <section class="ccor-ad-card ccor-ad-form-section">
            <div class="ccor-ad-detail-section-title"><span>□</span><h2>3. Documentación comercial</h2></div>
            <div class="ccor-ad-form-grid ccor-ad-form-grid-3">
              ${formField_cor('Orden de Venta (OV)','ov',record.ov)}
              ${formField_cor('Orden de Compra (OC)','oc',record.oc)}
              ${formField_cor('Factura','factura',record.factura)}
            </div>
          </section>

          <section class="ccor-ad-form-two-columns">
            <section class="ccor-ad-card ccor-ad-form-section">
              <div class="ccor-ad-detail-section-title"><span>⌁</span><h2>4. Información financiera</h2></div>
              <div class="ccor-ad-form-grid">
                ${formField_cor('Subtotal','monto_subtotal',record.monto_subtotal,{type:'number',step:'0.01'})}
                ${formField_cor('IVA %','iva_pct',formPercent_cor(record.iva_pct),{type:'number',step:'0.01'})}
                ${formField_cor('IVA','monto_iva',record.monto_iva,{type:'number',step:'0.01'})}
                ${formField_cor('Total','monto_total',record.monto_total,{type:'number',step:'0.01'})}
                ${formField_cor('Gasto Subtotal','gasto_subtotal',record.gasto_subtotal,{type:'number',step:'0.01'})}
                ${formField_cor('Diferencia','diferencia',record.diferencia,{type:'number',step:'0.01'})}
                ${formField_cor('Utilidad Real %','utilidad_real_pct',formPercent_cor(record.utilidad_real_pct),{type:'number',step:'0.01'})}
              </div>
              <p class="ccor-ad-form-note">El frontend no recalcula importes ni porcentajes. El backend valida y guarda los valores capturados.</p>
            </section>

            <section class="ccor-ad-card ccor-ad-form-section">
              <div class="ccor-ad-detail-section-title"><span>$</span><h2>5. Cobranza</h2></div>
              <div class="ccor-ad-form-grid">
                ${formField_cor('Estatus Cobranza','estatus_cobranza',record.estatus_cobranza,{list:'ccor-ad-form-estatus-cobranza'})}
                ${formField_cor('Moneda','moneda',record.moneda,{list:'ccor-ad-form-monedas'})}
                ${formField_cor('Monto Pagado','monto_pagado',record.monto_pagado,{type:'number',step:'0.01'})}
                ${formField_cor('Pagado sin IVA','pagado_sin_iva',record.pagado_sin_iva,{type:'number',step:'0.01'})}
                ${formField_cor('Pendiente de Pago','pendiente_pago',record.pendiente_pago,{type:'number',step:'0.01'})}
                ${formField_cor('Fecha de Pago','fecha_pago',record.fecha_pago,{type:'date'})}
                ${formField_cor('Semana de Pago','semana_pago',record.semana_pago)}
                ${formField_cor('Gasto Ejercido','gasto_ejercido',record.gasto_ejercido)}
              </div>
            </section>
          </section>

          <datalist id="ccor-ad-form-departamentos">${formOptions_cor(c.departamentos)}</datalist>
          <datalist id="ccor-ad-form-categorias">${formOptions_cor(c.categorias)}</datalist>
          <datalist id="ccor-ad-form-firmas">${formOptions_cor(c.firmas_cot)}</datalist>
          <datalist id="ccor-ad-form-supervisores">${formOptions_cor(c.supervisores)}</datalist>
          <datalist id="ccor-ad-form-estatus-trabajos">${formOptions_cor(c.estatus_trabajos)}</datalist>
          <datalist id="ccor-ad-form-estatus-cobranza">${formOptions_cor(c.estatus_cobranza)}</datalist>
          <datalist id="ccor-ad-form-monedas">${formOptions_cor(c.monedas)}</datalist>

          <section class="ccor-ad-card ccor-ad-form-actions">
            <button class="ccor-ad-btn" type="button" data-ccor-ad-cancel>Cancelar</button>
            <button class="ccor-ad-btn ccor-ad-btn-primary" type="submit" id="ccor-ad-save">${isEdit?'Guardar cambios':'Guardar Aditiva'}</button>
          </section>
        </form>
      </div>`;

    const subtitle=document.getElementById('app-context-subtitle');
    if(subtitle) subtitle.textContent=isEdit?'Aditivas · Editar '+text_cor(record.no_cot,'registro'):'Aditivas · Nueva Aditiva';
    try{window.scrollTo({top:0,behavior:'auto'});}catch(_error){window.scrollTo(0,0);}
  }

  function setFormStatus_cor(message,kind){
    const node=document.getElementById('ccor-ad-form-status');
    if(!node) return;
    node.className='ccor-ad-inline-status'+(kind?' is-'+kind:'');
    node.textContent=message||'';
  }

  function formPayload_cor(form){
    const raw=Object.fromEntries(new FormData(form).entries());
    Object.keys(raw).forEach(key=>{ if(typeof raw[key]==='string') raw[key]=raw[key].trim(); });
    if(raw.iva_pct) raw.iva_pct=raw.iva_pct+'%';
    if(raw.utilidad_real_pct) raw.utilidad_real_pct=raw.utilidad_real_pct+'%';
    if(raw.moneda) raw.moneda=String(raw.moneda).toUpperCase();
    return raw;
  }

  function validateFormPayload_cor(payload){
    const hasIdentifier=['proyecto','no_cot','ov','factura','descripcion'].some(key=>String(payload[key]||'').trim());
    if(!hasIdentifier) return 'Captura al menos Proyecto, No. Cotización, OV, Factura o Descripción.';
    return '';
  }

  async function saveForm_cor(form){
    if(state.saving||isViewerReadonly_cor()) return false;
    const payload=formPayload_cor(form);
    const validation=validateFormPayload_cor(payload);
    if(validation){ setFormStatus_cor(validation,'error'); return false; }

    const isEdit=state.formMode==='edit';
    const id=Number(state.selectedId);
    if(isEdit&&(!Number.isInteger(id)||id<=0)){ setFormStatus_cor('No fue posible identificar la Aditiva a editar.','error'); return false; }

    state.saving=true;
    const save=document.getElementById('ccor-ad-save');
    if(save){save.disabled=true;save.textContent='Guardando...';}
    setFormStatus_cor(isEdit?'Actualizando Aditiva...':'Creando Aditiva...','loading');

    try{
      const response=await apiRequest_cor(
        isEdit?API_PATH+'/'+encodeURIComponent(id):API_PATH,
        {
          method:isEdit?'PUT':'POST',
          headers:{'Content-Type':'application/json','Accept':'application/json'},
          body:JSON.stringify(payload),
          dedupe:false
        }
      );
      if(!response||!response.aditiva) throw new Error('El backend no devolvió la Aditiva guardada.');
      const savedId=Number(response.aditiva.id_aditiva_cor);
      if(!Number.isInteger(savedId)||savedId<=0) throw new Error('El backend no devolvió un identificador válido para la Aditiva.');

      state.response=null;
      state.records=[];
      state.summary=null;
      state.detail=response.aditiva;
      state.selectedId=savedId;
      if(window.ManttoHttp&&typeof window.ManttoHttp.invalidate==='function') window.ManttoHttp.invalidate(API_PATH);

      const router=window.ManttoRouter;
      if(isEdit&&router&&typeof router.getHistory==='function'&&typeof router.back==='function'){
        const history=router.getHistory();
        const previous=history[history.length-1];
        if(previous&&String(previous.route||'')===ROUTE&&Number(previous.payload&&previous.payload.id)===savedId){
          await router.back();
          return true;
        }
      }
      if(router&&typeof router.go==='function'){
        await router.go(ROUTE,{id:savedId},{replace:true,skipHistory:true,navigationType:'open'});
        return true;
      }
      renderDetail_cor(response.aditiva);
      return true;
    }catch(error){
      setFormStatus_cor(errorMessage_cor(error,'save'),'error');
      return false;
    }finally{
      state.saving=false;
      const button=document.getElementById('ccor-ad-save');
      if(button){button.disabled=false;button.textContent=isEdit?'Guardar cambios':'Guardar Aditiva';}
    }
  }

  async function loadCreateForm_cor(){
    state.formMode='create';
    state.selectedId=null;
    await ensureFormCatalogs_cor();
    if(!isActive_cor()) return false;
    renderForm_cor('create',{});
    return true;
  }

  async function loadEditForm_cor(id){
    const parsed=Number(id);
    if(!Number.isInteger(parsed)||parsed<=0) return false;
    if(isViewerReadonly_cor()){
      renderDetailError_cor('El Visor de usuarios es de solo lectura. Sal del visor para editar Aditivas.');
      return false;
    }
    state.view='form';
    state.formMode='edit';
    state.selectedId=parsed;
    const sequence=++state.formSequence;
    if(state.root){
      state.root.innerHTML=`<div class="ccor-ad-page ccor-ad-form-page"><section class="ccor-ad-card ccor-ad-detail-loading"><span class="ccor-ad-spinner" aria-hidden="true"></span><div><b>Cargando formulario...</b><small>Consultando la Aditiva autorizada.</small></div></section></div>`;
    }
    try{
      const [response]=await Promise.all([
        apiGet_cor(API_PATH+'/'+encodeURIComponent(parsed)),
        ensureFormCatalogs_cor()
      ]);
      if(sequence!==state.formSequence||!isActive_cor()) return false;
      if(!response||!response.aditiva) throw new Error('El backend no devolvió el objeto aditiva esperado.');
      state.detail=response.aditiva;
      renderForm_cor('edit',response.aditiva);
      return true;
    }catch(error){
      if(sequence!==state.formSequence||!isActive_cor()) return false;
      renderDetailError_cor(errorMessage_cor(error,'detail'));
      return false;
    }
  }

  async function loadDetail_cor(id){
    const parsed=Number(id);
    if(!Number.isInteger(parsed)||parsed<=0) return false;
    state.selectedId=parsed;
    state.detail=null;
    const sequence=++state.detailSequence;
    renderDetailLoading_cor();
    try{
      const response=await apiGet_cor(API_PATH+'/'+encodeURIComponent(parsed));
      if(sequence!==state.detailSequence||!isActive_cor()) return false;
      if(!response||!response.aditiva) throw new Error('El backend no devolvió el objeto aditiva esperado.');
      state.detail=response.aditiva;
      renderDetail_cor(state.detail);
      return true;
    }catch(error){
      if(sequence!==state.detailSequence||!isActive_cor()) return false;
      renderDetailError_cor(errorMessage_cor(error,'detail'));
      return false;
    }
  }

  function openDetailRoute_cor(id){
    const parsed=Number(id);
    if(!Number.isInteger(parsed)||parsed<=0) return false;
    if(window.ManttoRouter&&typeof window.ManttoRouter.go==='function'){
      window.ManttoRouter.go(ROUTE,{id:parsed},{navigationType:'open'});
      return true;
    }
    loadDetail_cor(parsed);
    return true;
  }

  function openCreateForm_cor(){
    if(isViewerReadonly_cor()) return false;
    const router=window.ManttoRouter;
    if(router&&typeof router.go==='function'){
      router.go(ROUTE,{mode:'create'},{navigationType:'open'});
      return true;
    }
    renderForm_cor('create',{});
    return true;
  }

  function openEditForm_cor(id){
    const parsed=Number(id);
    if(!Number.isInteger(parsed)||parsed<=0||isViewerReadonly_cor()) return false;
    const router=window.ManttoRouter;
    if(router&&typeof router.go==='function'){
      router.go(ROUTE,{mode:'edit',id:parsed},{navigationType:'open'});
      return true;
    }
    loadEditForm_cor(parsed);
    return true;
  }

  function cancelForm_cor(){
    const router=window.ManttoRouter;
    if(router&&typeof router.getHistory==='function'&&typeof router.back==='function'){
      const history=router.getHistory();
      const previous=history[history.length-1];
      if(previous&&String(previous.route||'')===ROUTE){
        router.back();
        return;
      }
    }
    if(router&&typeof router.go==='function'){
      router.go(ROUTE,null,{replace:true,skipHistory:true,navigationType:'back'});
      return;
    }
    state.formMode=null;
    renderShell_cor();
    refresh_cor({resetPage:true});
  }

  function openEstadoCuenta_cor(idIndiceCor){
    const parsed=Number(idIndiceCor);
    if(!Number.isInteger(parsed)||parsed<=0) return;
    if(window.ManttoRouter&&typeof window.ManttoRouter.go==='function'){
      const navigation=window.ManttoRouter.go('cobranza-estados-cuenta',{id:parsed},{navigationType:'open'});
      Promise.resolve(navigation).then(()=>{
        if(window.ManttoCobranzaCorEstadosCuenta&&typeof window.ManttoCobranzaCorEstadosCuenta.init==='function'){
          window.ManttoCobranzaCorEstadosCuenta.init();
        }
      }).catch(()=>{});
    }
  }

  function renderStatus_cor(message,kind){
    const node=document.getElementById('ccor-ad-status-line');
    if(!node) return;
    node.className='ccor-ad-inline-status'+(kind?' is-'+kind:'');
    node.textContent=message||'';
  }

  function setText_cor(id,value){ const node=document.getElementById(id); if(node) node.textContent=String(value??''); }

  function setLoading_cor(loading){
    state.loading=loading;
    const refresh=document.getElementById('ccor-ad-refresh');
    if(refresh){ refresh.disabled=loading; refresh.textContent=loading?'Actualizando...':'↻ Actualizar'; }
    renderPagination_cor();
  }

  function applyResponse_cor(response){
    state.response=response||{};
    state.records=Array.isArray(state.response.data)?state.response.data:[];
    state.summary=state.response.resumen&&typeof state.response.resumen==='object'?state.response.resumen:{};
    state.catalogs=state.response.catalogos&&typeof state.response.catalogos==='object'?state.response.catalogos:state.catalogs;
    const p=state.response.paginacion&&typeof state.response.paginacion==='object'?state.response.paginacion:{};
    state.pagination.page=Number(p.pagina)||1;
    state.pagination.pageSize=Number(p.tamano)||PAGE_SIZE;
    state.pagination.totalRecords=Number(p.total_registros)||0;
    state.pagination.totalPages=Math.max(1,Number(p.total_paginas)||1);
    renderCatalogs_cor();
    renderKpis_cor();
    renderFinancialSummary_cor();
    renderTable_cor();
    renderPagination_cor();
  }

  async function refresh_cor(options){
    if(!state.root) return false;
    const opts=options||{};
    if(opts.resetPage) state.pagination.page=1;
    const sequence=++state.requestSequence;
    setLoading_cor(true);
    renderStatus_cor('Consultando Aditivas autorizadas...', 'loading');
    try{
      const response=await apiGet_cor(buildListPath_cor());
      if(sequence!==state.requestSequence) return false;
      if(isBackendPending_cor(response)){
        renderBackendPending_cor(response);
        return true;
      }
      renderBackendReady_cor();
      applyResponse_cor(response);
      renderStatus_cor(state.pagination.totalRecords?'':'La consulta fue exitosa, pero no devolvió Aditivas para los filtros y alcance actuales.',state.pagination.totalRecords?'':'empty');
      setText_cor('ccor-ad-updated','Actualizado '+formatDateTimeNow_cor());
      return true;
    }catch(error){
      if(sequence!==state.requestSequence) return false;
      renderBackendReady_cor();
      state.records=[];
      state.summary={};
      state.pagination.totalRecords=0;
      state.pagination.totalPages=1;
      renderKpis_cor(); renderFinancialSummary_cor(); renderTable_cor(); renderPagination_cor();
      renderStatus_cor(errorMessage_cor(error,'list'),'error');
      return false;
    }finally{
      if(sequence===state.requestSequence) setLoading_cor(false);
    }
  }

  function resetFilters_cor(){
    state.filters={q:'',anio:'',departamento:'',categoria:'',firmaCot:'',estatusTrabajos:'',estatusCobranza:'',sup:'',moneda:'',soloPendientes:false};
    const search=document.getElementById('ccor-ad-search'); if(search) search.value='';
    renderCatalogs_cor();
    refresh_cor({resetPage:true});
  }

  function setFilterFromChange_cor(target){
    if(target.id==='ccor-ad-year') state.filters.anio=target.value||'';
    else if(target.id==='ccor-ad-department') state.filters.departamento=target.value||'';
    else if(target.id==='ccor-ad-category') state.filters.categoria=target.value||'';
    else if(target.id==='ccor-ad-signature') state.filters.firmaCot=target.value||'';
    else if(target.id==='ccor-ad-work-status') state.filters.estatusTrabajos=target.value||'';
    else if(target.id==='ccor-ad-status') state.filters.estatusCobranza=target.value||'';
    else if(target.id==='ccor-ad-supervisor') state.filters.sup=target.value||'';
    else if(target.id==='ccor-ad-currency') state.filters.moneda=target.value||'';
    else if(target.id==='ccor-ad-pending') state.filters.soloPendientes=target.value==='1';
    else return false;
    return true;
  }

  function bindEvents_cor(){
    const root=state.root;
    if(!root||state.boundRoot===root) return;
    state.boundRoot=root;

    root.addEventListener('click',event=>{
      if(event.target.closest('#ccor-ad-new')){ openCreateForm_cor(); return; }
      if(event.target.closest('#ccor-ad-refresh')){ refresh_cor(); return; }
      if(event.target.closest('#ccor-ad-clear')){ resetFilters_cor(); return; }
      const prev=event.target.closest('#ccor-ad-prev');
      if(prev&&!prev.disabled){ state.pagination.page-=1; refresh_cor(); return; }
      const next=event.target.closest('#ccor-ad-next');
      if(next&&!next.disabled){ state.pagination.page+=1; refresh_cor(); return; }
      const edit=event.target.closest('[data-ccor-ad-edit]');
      if(edit&&edit.dataset.ccorAdEdit){ openEditForm_cor(edit.dataset.ccorAdEdit); return; }
      if(event.target.closest('[data-ccor-ad-cancel]')){ cancelForm_cor(); return; }
      const estadoCuenta=event.target.closest('[data-ccor-ad-estado-cuenta]');
      if(estadoCuenta&&estadoCuenta.dataset.ccorAdEstadoCuenta){ openEstadoCuenta_cor(estadoCuenta.dataset.ccorAdEstadoCuenta); return; }
      const row=event.target.closest('[data-ccor-ad-row]');
      if(row&&row.dataset.ccorAdRow) openDetailRoute_cor(row.dataset.ccorAdRow);
    });

    root.addEventListener('submit',event=>{
      if(event.target&&event.target.id==='ccor-ad-form'){
        event.preventDefault();
        saveForm_cor(event.target);
      }
    });

    root.addEventListener('keydown',event=>{
      if(event.key!=='Enter'&&event.key!==' ') return;
      const row=event.target.closest('[data-ccor-ad-row]');
      if(!row||!row.dataset.ccorAdRow) return;
      event.preventDefault();
      openDetailRoute_cor(row.dataset.ccorAdRow);
    });

    root.addEventListener('input',event=>{
      if(event.target.id!=='ccor-ad-search') return;
      window.clearTimeout(state.searchTimer);
      state.searchTimer=window.setTimeout(()=>{
        state.filters.q=event.target.value||'';
        refresh_cor({resetPage:true});
      },SEARCH_DELAY_MS);
    });

    root.addEventListener('change',event=>{
      if(!setFilterFromChange_cor(event.target)) return;
      refresh_cor({resetPage:true});
    });
  }

  async function init_cor(rootArg){
    const root=rootArg&&rootArg.nodeType===1?rootArg:(document.getElementById('view-cobranza-aditivas')||document.getElementById('view-placeholder'));
    if(!root||!isActive_cor()) return false;
    state.root=root;
    bindEvents_cor();

    const payload=currentPayload_cor();
    const mode=String(payload&&payload.mode||'').toLowerCase();
    const requestedId=Number(payload&&(payload.id||payload.id_aditiva_cor));
    if(mode==='create'){
      await loadCreateForm_cor();
      return true;
    }
    if(mode==='edit'&&Number.isInteger(requestedId)&&requestedId>0){
      await loadEditForm_cor(requestedId);
      return true;
    }
    if(Number.isInteger(requestedId)&&requestedId>0){
      state.view='detail';
      await loadDetail_cor(requestedId);
      return true;
    }

    state.view='list';
    state.formMode=null;
    state.selectedId=null;
    state.detail=null;
    renderShell_cor();

    if(state.response&&!isBackendPending_cor(state.response)){
      renderBackendReady_cor();
      applyResponse_cor(state.response);
      setText_cor('ccor-ad-updated','Datos conservados de la consulta anterior');
      return true;
    }

    await refresh_cor();
    return true;
  }

  function refreshCurrent_cor(){
    if(!isActive_cor()) return Promise.resolve(false);
    const payload=currentPayload_cor();
    const mode=String(payload&&payload.mode||'').toLowerCase();
    const requestedId=Number(payload&&(payload.id||payload.id_aditiva_cor));
    if(mode==='create') return loadCreateForm_cor();
    if(mode==='edit'&&Number.isInteger(requestedId)&&requestedId>0) return loadEditForm_cor(requestedId);
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
    state.response=null;
    state.records=[];
    state.summary=null;
    state.pagination.page=1;
    state.selectedId=null;
    state.detail=null;
    state.formMode=null;
    state.detailSequence+=1;
    state.formSequence+=1;
    if(isActive_cor()&&state.root) init_cor(state.root);
  });

  window.ManttoCobranzaCorAditivas=Object.freeze({
    init:init_cor,
    refresh:refreshCurrent_cor,
    openDetail:openDetailRoute_cor,
    newAditiva:openCreateForm_cor,
    editAditiva:openEditForm_cor,
    route:ROUTE,
    apiPath:API_PATH
  });
})();

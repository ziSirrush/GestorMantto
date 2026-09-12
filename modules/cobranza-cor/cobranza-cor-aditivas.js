(function(){
  'use strict';

  // [Aster | 2026-09-12 | ASTER-MG | FIX FASE 4 COBRANZA COR ADITIVAS BACKEND V001]
  // Contrato funcional: FASE_3_COBRANZA_COR_ADITIVAS_BACKEND_V001.
  // Filtros, paginacion, resumen y detalle son autoritativos en backend.
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
    searchTimer:null,
    loading:false,
    boundRoot:null,
    pendingDetailId:null
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

  function errorMessage_cor(error,context){
    const status=Number(error&&error.status);
    if(status===401) return 'La sesión ya no está disponible. Vuelve a iniciar sesión para consultar Aditivas.';
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
            <button id="ccor-ad-refresh" class="ccor-ad-btn ccor-ad-btn-primary" type="button">↻ Actualizar</button>
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

        <div id="ccor-ad-modal" class="ccor-ad-modal" hidden>
          <div class="ccor-ad-modal-backdrop" data-ccor-ad-close></div>
          <section class="ccor-ad-modal-card" role="dialog" aria-modal="true" aria-labelledby="ccor-ad-modal-title">
            <button class="ccor-ad-modal-close" type="button" aria-label="Cerrar detalle" data-ccor-ad-close>×</button>
            <div id="ccor-ad-modal-content"></div>
          </section>
        </div>
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

  function detailField_cor(label,value,className){
    return `<div class="ccor-ad-detail-field ${className||''}"><span>${escapeHtml_cor(label)}</span><b>${escapeHtml_cor(text_cor(value))}</b></div>`;
  }

  function moneyField_cor(label,value,currency,className){
    return `<div class="ccor-ad-detail-field ${className||''}"><span>${escapeHtml_cor(label)}</span><b>${escapeHtml_cor(formatMoney_cor(value,currency))}</b></div>`;
  }

  function renderDetail_cor(row){
    const modal=document.getElementById('ccor-ad-modal');
    const content=document.getElementById('ccor-ad-modal-content');
    if(!modal||!content||!row) return;
    const currency=canonical_cor(row.moneda);
    const indice=row.indice&&typeof row.indice==='object'?row.indice:null;
    content.innerHTML=`
      <div class="ccor-ad-detail-head">
        <p class="ccor-ad-eyebrow">Aditiva · Corellian</p>
        <h2 id="ccor-ad-modal-title">${escapeHtml_cor(text_cor(row.no_cot,'Detalle de Aditiva'))}</h2>
        <p>${escapeHtml_cor(text_cor(row.descripcion,'Sin descripción registrada.'))}</p>
      </div>
      <div class="ccor-ad-detail-grid">
        ${detailField_cor('Proyecto',row.proyecto,'is-wide')}
        ${detailField_cor('PP NS',row.pp_ns)}
        ${detailField_cor('Equipo',row.equipo)}
        ${detailField_cor('Año cot.',row.anio_cot)}
        ${detailField_cor('Fecha cot.',formatDate_cor(row.fecha_cot))}
        ${detailField_cor('Firma cot.',row.firma_cot)}
        ${detailField_cor('Departamento',row.departamento)}
        ${detailField_cor('Categoría',row.categoria)}
        ${detailField_cor('SUP',row.sup)}
        ${detailField_cor('OV',row.ov)}
        ${detailField_cor('Factura',row.factura)}
        ${detailField_cor('OC',row.oc)}
        ${detailField_cor('Estatus trabajos',row.estatus_trabajos)}
        ${detailField_cor('Estatus cobranza',row.estatus_cobranza)}
        ${detailField_cor('Moneda',currency||'—')}
        ${detailField_cor('Semana de pago',row.semana_pago)}
        ${detailField_cor('Fecha de pago',formatDate_cor(row.fecha_pago))}
        ${detailField_cor('Gasto ejercido',row.gasto_ejercido)}
        ${detailField_cor('Vínculo INDICE',row.vinculo_indice?'Sí':'No')}
        ${detailField_cor('INDICE proyecto',indice&&indice.proyecto)}
        ${detailField_cor('INDICE PP',indice&&indice.pp)}
        ${detailField_cor('INDICE año',indice&&indice.anio)}
      </div>
      <div class="ccor-ad-money-grid">
        ${moneyField_cor('Subtotal',row.monto_subtotal,currency)}
        ${detailField_cor('IVA %',formatPercent_cor(row.iva_pct))}
        ${moneyField_cor('Monto IVA',row.monto_iva,currency)}
        ${moneyField_cor('Total',row.monto_total,currency)}
        ${moneyField_cor('Gasto subtotal',row.gasto_subtotal,currency)}
        ${moneyField_cor('Diferencia',row.diferencia,currency)}
        ${detailField_cor('Utilidad real',formatPercent_cor(row.utilidad_real_pct))}
        ${moneyField_cor('Monto pagado',row.monto_pagado,currency)}
        ${moneyField_cor('Pagado sin IVA',row.pagado_sin_iva,currency)}
        ${moneyField_cor('Pendiente de pago',row.pendiente_pago,currency,'is-pending')}
      </div>
      <div class="ccor-ad-detail-comments"><span>Comentario fuente</span><p>${escapeHtml_cor(text_cor(row.comentario_fuente,'Sin comentario registrado.'))}</p></div>`;
    modal.hidden=false;
    document.body.classList.add('ccor-ad-modal-open');
  }

  function showDetailLoading_cor(){
    const modal=document.getElementById('ccor-ad-modal');
    const content=document.getElementById('ccor-ad-modal-content');
    if(!modal||!content) return;
    content.innerHTML='<div class="ccor-ad-detail-head"><p class="ccor-ad-eyebrow">Aditiva · Corellian</p><h2 id="ccor-ad-modal-title">Cargando detalle...</h2><p>Consultando el registro autorizado en backend.</p></div>';
    modal.hidden=false;
    document.body.classList.add('ccor-ad-modal-open');
  }

  function showDetailError_cor(message){
    const content=document.getElementById('ccor-ad-modal-content');
    if(content) content.innerHTML=`<div class="ccor-ad-detail-head"><p class="ccor-ad-eyebrow">Aditiva · Corellian</p><h2 id="ccor-ad-modal-title">No fue posible abrir el detalle</h2><p>${escapeHtml_cor(message)}</p></div>`;
  }

  async function openDetailById_cor(id){
    const parsed=Number(id);
    if(!Number.isInteger(parsed)||parsed<=0) return false;
    const sequence=++state.detailSequence;
    showDetailLoading_cor();
    try{
      const response=await apiGet_cor(API_PATH+'/'+encodeURIComponent(parsed));
      if(sequence!==state.detailSequence) return false;
      if(!response||!response.aditiva) throw new Error('El backend no devolvió el objeto aditiva esperado.');
      renderDetail_cor(response.aditiva);
      return true;
    }catch(error){
      if(sequence!==state.detailSequence) return false;
      showDetailError_cor(errorMessage_cor(error,'detail'));
      return false;
    }
  }

  function closeDetail_cor(){
    state.detailSequence+=1;
    const modal=document.getElementById('ccor-ad-modal');
    if(modal) modal.hidden=true;
    document.body.classList.remove('ccor-ad-modal-open');
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
      if(state.pendingDetailId){
        const target=state.pendingDetailId;
        state.pendingDetailId=null;
        openDetailById_cor(target);
      }
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
      if(event.target.closest('#ccor-ad-refresh')){ refresh_cor(); return; }
      if(event.target.closest('#ccor-ad-clear')){ resetFilters_cor(); return; }
      const prev=event.target.closest('#ccor-ad-prev');
      if(prev&&!prev.disabled){ state.pagination.page-=1; refresh_cor(); return; }
      const next=event.target.closest('#ccor-ad-next');
      if(next&&!next.disabled){ state.pagination.page+=1; refresh_cor(); return; }
      if(event.target.closest('[data-ccor-ad-close]')){ closeDetail_cor(); return; }
      const row=event.target.closest('[data-ccor-ad-row]');
      if(row&&row.dataset.ccorAdRow) openDetailById_cor(row.dataset.ccorAdRow);
    });

    root.addEventListener('keydown',event=>{
      if(event.key==='Escape'){ closeDetail_cor(); return; }
      if(event.key!=='Enter'&&event.key!==' ') return;
      const row=event.target.closest('[data-ccor-ad-row]');
      if(!row||!row.dataset.ccorAdRow) return;
      event.preventDefault();
      openDetailById_cor(row.dataset.ccorAdRow);
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

  function init_cor(rootArg){
    const root=rootArg&&rootArg.nodeType===1?rootArg:(document.getElementById('view-cobranza-aditivas')||document.getElementById('view-placeholder'));
    if(!root) return false;
    state.root=root;
    const payload=currentPayload_cor();
    state.pendingDetailId=payload&&(payload.id||payload.id_aditiva_cor)?(payload.id||payload.id_aditiva_cor):null;
    renderShell_cor();
    refresh_cor();
    return true;
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
    closeDetail_cor();
    if(isActive_cor()&&state.root) refresh_cor({resetPage:true});
  });

  window.ManttoCobranzaCorAditivas=Object.freeze({
    init:init_cor,
    refresh:refresh_cor,
    openDetail:openDetailById_cor,
    route:ROUTE,
    apiPath:API_PATH
  });
})();

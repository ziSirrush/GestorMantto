(function(){
  'use strict';

  // [Aster | 2026-09-11 | ASTER-MG | FASE 4 COBRANZA COR ADITIVAS FRONTEND V002]
  if(window.ManttoCobranzaCorAditivas) return;

  const ROUTE = 'cobranza-aditivas';
  const API_PATH = '/api/cobranza-cor/aditivas';
  const PAGE_SIZE = 30;
  const SEARCH_DELAY_MS = 250;

  const state = {
    root: null,
    response: null,
    records: [],
    filtered: [],
    summary: null,
    page: 1,
    pageSize: PAGE_SIZE,
    requestSequence: 0,
    searchTimer: null,
    loading: false,
    pendingDetailId: null,
    boundRoot: null,
    filters: {
      q: '',
      anio: '',
      departamento: '',
      estatusCobranza: '',
      moneda: ''
    },
    catalogs: {
      years: [],
      departments: [],
      statuses: [],
      currencies: []
    }
  };

  function currentNavigation_cor(){
    if(!window.ManttoRouter || typeof window.ManttoRouter.getCurrent !== 'function'){
      return { route:'', payload:null };
    }
    const current = window.ManttoRouter.getCurrent() || {};
    return { route:String(current.route || ''), payload:current.payload || null };
  }

  function isActive_cor(){
    return currentNavigation_cor().route === ROUTE;
  }

  function currentPayload_cor(){
    return currentNavigation_cor().payload || null;
  }

  function escapeHtml_cor(value){
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function text_cor(value, fallback = '—'){
    if(value === null || value === undefined) return fallback;
    const normalized = String(value).trim();
    return normalized || fallback;
  }

  function number_cor(value){
    if(value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function int_cor(value){
    const parsed = number_cor(value);
    return parsed === null ? null : Math.trunc(parsed);
  }

  function canonical_cor(value){
    return String(value === null || value === undefined ? '' : value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, ' ');
  }

  function formatInteger_cor(value){
    const parsed = number_cor(value);
    if(parsed === null) return '—';
    return new Intl.NumberFormat('es-MX', { maximumFractionDigits:0 }).format(parsed);
  }

  function formatAmount_cor(value){
    const parsed = number_cor(value);
    if(parsed === null) return '—';
    return new Intl.NumberFormat('es-MX', {
      minimumFractionDigits:2,
      maximumFractionDigits:2
    }).format(parsed);
  }

  function formatMoney_cor(value, currency){
    const parsed = number_cor(value);
    if(parsed === null) return '—';
    const code = canonical_cor(currency);
    if(/^[A-Z]{3}$/.test(code)){
      try{
        return new Intl.NumberFormat('es-MX', {
          style:'currency',
          currency:code,
          minimumFractionDigits:2,
          maximumFractionDigits:2
        }).format(parsed);
      }catch(_error){}
    }
    return formatAmount_cor(parsed) + (code ? ' ' + code : '');
  }

  function formatPercent_cor(value){
    const parsed = number_cor(value);
    if(parsed === null) return '—';
    const normalized = Math.abs(parsed) <= 1 ? parsed * 100 : parsed;
    return new Intl.NumberFormat('es-MX', {
      minimumFractionDigits:0,
      maximumFractionDigits:2
    }).format(normalized) + '%';
  }

  function formatDate_cor(value){
    const raw = String(value || '').trim();
    if(!raw) return '—';
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(iso) return iso[3] + '/' + iso[2] + '/' + iso[1];
    return raw;
  }

  function formatDateTimeNow_cor(){
    return new Intl.DateTimeFormat('es-MX', {
      day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'
    }).format(new Date());
  }

  function apiGet_cor(path){
    if(!window.ManttoHttp || typeof window.ManttoHttp.get !== 'function'){
      return Promise.reject(new Error('Cliente HTTP central no disponible.'));
    }
    return window.ManttoHttp.get(path);
  }

  function errorMessage_cor(error){
    const status = Number(error && error.status);
    if(status === 401) return 'La sesión ya no está disponible. Vuelve a iniciar sesión para consultar Aditivas.';
    if(status === 403) return 'No tienes permiso o alcance de información para consultar Aditivas.';
    if(status === 404) return 'El endpoint funcional de Aditivas no está disponible en este entorno.';
    return text_cor(error && error.message, 'No fue posible consultar Aditivas.');
  }

  function extractRecords_cor(response){
    if(Array.isArray(response)) return response;
    if(Array.isArray(response && response.data)) return response.data;
    if(Array.isArray(response && response.aditivas)) return response.aditivas;
    if(Array.isArray(response && response.records)) return response.records;
    if(Array.isArray(response && response.registros)) return response.registros;
    return [];
  }

  function extractSummary_cor(response){
    if(!response || typeof response !== 'object') return null;
    if(response.resumen && typeof response.resumen === 'object') return response.resumen;
    if(response.summary && typeof response.summary === 'object') return response.summary;
    return null;
  }

  function rowId_cor(row, index){
    const candidate = row && (row.id_aditiva_cor ?? row.id ?? row.id_aditiva);
    const parsed = Number(candidate);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 'row-' + index;
  }

  function rowYear_cor(row){
    return int_cor(row && (row.anio_cot ?? row.anio ?? row.ano_cot));
  }

  function rowCurrency_cor(row){
    return canonical_cor(row && row.moneda);
  }

  function rowPending_cor(row){
    return number_cor(row && (row.pendiente_pago ?? row.pendiente));
  }

  function rowSearchText_cor(row){
    return canonical_cor([
      row && row.proyecto,
      row && row.pp_ns,
      row && row.no_cot,
      row && row.ov,
      row && row.factura,
      row && row.equipo,
      row && row.descripcion,
      row && row.departamento,
      row && row.categoria,
      row && row.estatus_trabajos,
      row && row.estatus_cobranza
    ].filter(Boolean).join(' | '));
  }

  function statusClass_cor(value){
    const status = canonical_cor(value);
    if(!status) return 'is-neutral';
    if(status.includes('PAGAD') || status.includes('COBRAD') || status.includes('LIQUIDAD') || status.includes('EJECUTAD') || status.includes('TERMINAD')) return 'is-ok';
    if(status.includes('VENC') || status.includes('CANCEL') || status.includes('RECHAZ') || status.includes('NO PAG')) return 'is-danger';
    if(status.includes('PEND') || status.includes('PROCES') || status.includes('ESPERA') || status.includes('PARCIAL')) return 'is-warn';
    return 'is-neutral';
  }

  function isBackendPending_cor(response){
    return Boolean(response && (response.available === false || response.supported === false || response.status === 'PENDING_COBRANZA_COR_FUNCTIONAL_READ'));
  }

  function renderShell_cor(){
    const root = state.root;
    if(!root) return;

    root.innerHTML = `
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
          <span>Las Aditivas se presentan separadas de Suministro e Instalación. No se incorporan a los totales contractuales del Estado de Cuenta.</span>
        </section>

        <section id="ccor-ad-backend-state" class="ccor-ad-card ccor-ad-backend-state" hidden></section>

        <section id="ccor-ad-content">
          <section class="ccor-ad-kpi-grid" aria-label="Resumen de registros visibles">
            <article class="ccor-ad-card ccor-ad-kpi"><span>Registros</span><b id="ccor-ad-kpi-records">0</b><small>Filas visibles</small></article>
            <article class="ccor-ad-card ccor-ad-kpi"><span>Proyectos</span><b id="ccor-ad-kpi-projects">0</b><small>Proyectos distintos</small></article>
            <article class="ccor-ad-card ccor-ad-kpi"><span>Cotizaciones</span><b id="ccor-ad-kpi-quotes">0</b><small>No. de cotización distintos</small></article>
            <article class="ccor-ad-card ccor-ad-kpi"><span>Con pendiente</span><b id="ccor-ad-kpi-pending">0</b><small>Registros con saldo pendiente</small></article>
          </section>

          <section class="ccor-ad-card ccor-ad-financial-card">
            <div class="ccor-ad-section-head">
              <div><h2>Resumen financiero</h2><p>Importes únicamente cuando el backend los entrega calculados por moneda.</p></div>
            </div>
            <div id="ccor-ad-financial-summary" class="ccor-ad-financial-summary"></div>
          </section>

          <section class="ccor-ad-card ccor-ad-filters" aria-label="Filtros de Aditivas">
            <label class="ccor-ad-search-field">
              <span>Buscar</span>
              <input id="ccor-ad-search" type="search" autocomplete="off" placeholder="Proyecto, PP, cotización, OV, factura..." />
            </label>
            <label>
              <span>Año cot.</span>
              <select id="ccor-ad-year"><option value="">Todos</option></select>
            </label>
            <label>
              <span>Departamento</span>
              <select id="ccor-ad-department"><option value="">Todos</option></select>
            </label>
            <label>
              <span>Estatus cobranza</span>
              <select id="ccor-ad-status"><option value="">Todos</option></select>
            </label>
            <label>
              <span>Moneda</span>
              <select id="ccor-ad-currency"><option value="">Todas</option></select>
            </label>
            <button id="ccor-ad-clear" class="ccor-ad-btn" type="button">Limpiar filtros</button>
          </section>

          <section class="ccor-ad-card ccor-ad-table-card">
            <div class="ccor-ad-section-head">
              <div><h2>Listado de Aditivas</h2><p id="ccor-ad-count">0 registros</p></div>
            </div>
            <div id="ccor-ad-status-line" class="ccor-ad-inline-status" aria-live="polite"></div>
            <div class="ccor-ad-table-wrap">
              <table class="ccor-ad-table">
                <thead>
                  <tr>
                    <th>Cotización</th>
                    <th>Proyecto</th>
                    <th>PP NS</th>
                    <th>Fecha cot.</th>
                    <th>Departamento</th>
                    <th>Categoría</th>
                    <th>Estatus trabajos</th>
                    <th>Estatus cobranza</th>
                    <th>OV</th>
                    <th>Factura</th>
                    <th>Moneda</th>
                    <th>Total</th>
                    <th>Pagado</th>
                    <th>Pendiente</th>
                  </tr>
                </thead>
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

    const subtitle = document.getElementById('app-context-subtitle');
    if(subtitle) subtitle.textContent = 'Cobranza Corellian · Aditivas';

    bindEvents_cor();
  }

  function renderBackendPending_cor(response){
    const box = document.getElementById('ccor-ad-backend-state');
    const content = document.getElementById('ccor-ad-content');
    if(!box || !content) return;
    box.hidden = false;
    box.className = 'ccor-ad-card ccor-ad-backend-state is-pending';
    box.innerHTML = `
      <div class="ccor-ad-state-icon">🧩</div>
      <div>
        <h2>Backend funcional de Aditivas pendiente</h2>
        <p>${escapeHtml_cor(text_cor(response && response.message, 'La ruta de Aditivas existe, pero todavía no entrega la lectura funcional.'))}</p>
        <small>Fuente reservada: ${escapeHtml_cor(text_cor(response && response.source_table, 'cobranza_aditivas_cor'))}</small>
      </div>`;
    content.hidden = true;
  }

  function renderBackendReady_cor(){
    const box = document.getElementById('ccor-ad-backend-state');
    const content = document.getElementById('ccor-ad-content');
    if(box) box.hidden = true;
    if(content) content.hidden = false;
  }

  function updateCatalogs_cor(){
    const years = [...new Set(state.records.map(rowYear_cor).filter(value => value !== null))].sort((a,b) => b-a);
    const departments = [...new Set(state.records.map(row => text_cor(row && row.departamento, '')).filter(Boolean))].sort((a,b) => a.localeCompare(b, 'es'));
    const statuses = [...new Set(state.records.map(row => text_cor(row && row.estatus_cobranza, '')).filter(Boolean))].sort((a,b) => a.localeCompare(b, 'es'));
    const currencies = [...new Set(state.records.map(rowCurrency_cor).filter(Boolean))].sort();
    state.catalogs = { years, departments, statuses, currencies };

    fillSelect_cor('ccor-ad-year', years, state.filters.anio, 'Todos');
    fillSelect_cor('ccor-ad-department', departments, state.filters.departamento, 'Todos');
    fillSelect_cor('ccor-ad-status', statuses, state.filters.estatusCobranza, 'Todos');
    fillSelect_cor('ccor-ad-currency', currencies, state.filters.moneda, 'Todas');
  }

  function fillSelect_cor(id, values, selected, allLabel){
    const node = document.getElementById(id);
    if(!node) return;
    node.innerHTML = `<option value="">${escapeHtml_cor(allLabel)}</option>` + values
      .map(value => `<option value="${escapeHtml_cor(value)}">${escapeHtml_cor(value)}</option>`)
      .join('');
    node.value = String(selected || '');
  }

  function applyFilters_cor(){
    const q = canonical_cor(state.filters.q);
    const department = canonical_cor(state.filters.departamento);
    const status = canonical_cor(state.filters.estatusCobranza);
    const currency = canonical_cor(state.filters.moneda);
    const year = state.filters.anio ? Number(state.filters.anio) : null;

    state.filtered = state.records.filter(row => {
      if(q && !rowSearchText_cor(row).includes(q)) return false;
      if(year !== null && rowYear_cor(row) !== year) return false;
      if(department && canonical_cor(row && row.departamento) !== department) return false;
      if(status && canonical_cor(row && row.estatus_cobranza) !== status) return false;
      if(currency && rowCurrency_cor(row) !== currency) return false;
      return true;
    });

    const totalPages = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
    if(state.page > totalPages) state.page = totalPages;
    if(state.page < 1) state.page = 1;
    renderVisible_cor();
  }

  function renderVisible_cor(){
    renderCounters_cor();
    renderFinancialSummary_cor();
    renderTable_cor();
    renderPagination_cor();
  }

  function renderCounters_cor(){
    const rows = state.filtered;
    const projects = new Set(rows.map(row => canonical_cor(row && row.proyecto)).filter(Boolean));
    const quotes = new Set(rows.map(row => canonical_cor(row && row.no_cot)).filter(Boolean));
    const withPending = rows.filter(row => {
      const pending = rowPending_cor(row);
      return pending !== null && pending > 0;
    }).length;

    setText_cor('ccor-ad-kpi-records', formatInteger_cor(rows.length));
    setText_cor('ccor-ad-kpi-projects', formatInteger_cor(projects.size));
    setText_cor('ccor-ad-kpi-quotes', formatInteger_cor(quotes.size));
    setText_cor('ccor-ad-kpi-pending', formatInteger_cor(withPending));
    setText_cor('ccor-ad-count', rows.length === 1 ? '1 registro' : formatInteger_cor(rows.length) + ' registros');
  }

  function summaryCurrencyItems_cor(){
    const summary = state.summary;
    if(!summary || typeof summary !== 'object') return [];
    if(Array.isArray(summary)) return summary;
    if(Array.isArray(summary.monedas)) return summary.monedas;
    if(Array.isArray(summary.currencies)) return summary.currencies;
    if(Array.isArray(summary.por_moneda)) return summary.por_moneda;

    const source = summary.monedas && typeof summary.monedas === 'object'
      ? summary.monedas
      : (summary.por_moneda && typeof summary.por_moneda === 'object' ? summary.por_moneda : null);
    if(!source) return [];
    return Object.entries(source).map(([moneda, values]) => ({ moneda, ...(values || {}) }));
  }

  function firstNumber_cor(object, keys){
    for(const key of keys){
      const value = number_cor(object && object[key]);
      if(value !== null) return value;
    }
    return null;
  }

  function renderFinancialSummary_cor(){
    const root = document.getElementById('ccor-ad-financial-summary');
    if(!root) return;
    const items = summaryCurrencyItems_cor();
    if(!items.length){
      root.innerHTML = '<div class="ccor-ad-financial-empty">El backend aún no entregó un resumen financiero autoritativo por moneda. No se calculan totales financieros en el frontend.</div>';
      return;
    }

    root.innerHTML = items.map(item => {
      const currency = canonical_cor(item && (item.moneda ?? item.currency));
      const total = firstNumber_cor(item, ['monto_total','total','venta_total']);
      const paid = firstNumber_cor(item, ['monto_pagado','pagado','cobrado']);
      const pending = firstNumber_cor(item, ['pendiente_pago','pendiente','por_cobrar']);
      const count = firstNumber_cor(item, ['registros','count','total_registros']);
      return `
        <article class="ccor-ad-financial-currency">
          <div class="ccor-ad-financial-title"><b>${escapeHtml_cor(currency || 'SIN MONEDA')}</b>${count === null ? '' : `<span>${escapeHtml_cor(formatInteger_cor(count))} reg.</span>`}</div>
          <div><span>Total</span><b>${escapeHtml_cor(formatMoney_cor(total, currency))}</b></div>
          <div><span>Pagado</span><b>${escapeHtml_cor(formatMoney_cor(paid, currency))}</b></div>
          <div><span>Pendiente</span><b class="is-pending">${escapeHtml_cor(formatMoney_cor(pending, currency))}</b></div>
        </article>`;
    }).join('');
  }

  function renderTable_cor(){
    const body = document.getElementById('ccor-ad-table-body');
    if(!body) return;
    const start = (state.page - 1) * state.pageSize;
    const rows = state.filtered.slice(start, start + state.pageSize);

    if(!rows.length){
      body.innerHTML = '<tr><td colspan="14" class="ccor-ad-empty">No se encontraron Aditivas con los filtros seleccionados.</td></tr>';
      return;
    }

    body.innerHTML = rows.map((row, index) => {
      const absoluteIndex = start + index;
      const id = rowId_cor(row, absoluteIndex);
      const currency = rowCurrency_cor(row);
      return `
        <tr class="ccor-ad-row" data-ccor-ad-row="${escapeHtml_cor(id)}" tabindex="0" role="button" aria-label="Abrir detalle de ${escapeHtml_cor(text_cor(row && row.no_cot, 'Aditiva'))}">
          <td><strong>${escapeHtml_cor(text_cor(row && row.no_cot))}</strong></td>
          <td>${escapeHtml_cor(text_cor(row && row.proyecto))}</td>
          <td>${escapeHtml_cor(text_cor(row && row.pp_ns))}</td>
          <td>${escapeHtml_cor(formatDate_cor(row && row.fecha_cot))}</td>
          <td>${escapeHtml_cor(text_cor(row && row.departamento))}</td>
          <td>${escapeHtml_cor(text_cor(row && row.categoria))}</td>
          <td><span class="ccor-ad-badge ${statusClass_cor(row && row.estatus_trabajos)}">${escapeHtml_cor(text_cor(row && row.estatus_trabajos))}</span></td>
          <td><span class="ccor-ad-badge ${statusClass_cor(row && row.estatus_cobranza)}">${escapeHtml_cor(text_cor(row && row.estatus_cobranza))}</span></td>
          <td>${escapeHtml_cor(text_cor(row && row.ov))}</td>
          <td>${escapeHtml_cor(text_cor(row && row.factura))}</td>
          <td><b>${escapeHtml_cor(currency || '—')}</b></td>
          <td class="ccor-ad-num">${escapeHtml_cor(formatMoney_cor(row && row.monto_total, currency))}</td>
          <td class="ccor-ad-num">${escapeHtml_cor(formatMoney_cor(row && row.monto_pagado, currency))}</td>
          <td class="ccor-ad-num is-pending">${escapeHtml_cor(formatMoney_cor(rowPending_cor(row), currency))}</td>
        </tr>`;
    }).join('');
  }

  function renderPagination_cor(){
    const totalPages = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
    const prev = document.getElementById('ccor-ad-prev');
    const next = document.getElementById('ccor-ad-next');
    const info = document.getElementById('ccor-ad-page-info');
    if(prev) prev.disabled = state.page <= 1;
    if(next) next.disabled = state.page >= totalPages;
    if(info) info.textContent = `Página ${state.page} de ${totalPages}`;
  }

  function detailField_cor(label, value, className){
    return `<div class="ccor-ad-detail-field ${className || ''}"><span>${escapeHtml_cor(label)}</span><b>${escapeHtml_cor(text_cor(value))}</b></div>`;
  }

  function openDetail_cor(row){
    const modal = document.getElementById('ccor-ad-modal');
    const content = document.getElementById('ccor-ad-modal-content');
    if(!modal || !content || !row) return;
    const currency = rowCurrency_cor(row);
    content.innerHTML = `
      <div class="ccor-ad-detail-head">
        <p class="ccor-ad-eyebrow">Aditiva · Corellian</p>
        <h2 id="ccor-ad-modal-title">${escapeHtml_cor(text_cor(row.no_cot, 'Detalle de Aditiva'))}</h2>
        <p>${escapeHtml_cor(text_cor(row.descripcion, 'Sin descripción registrada.'))}</p>
      </div>

      <div class="ccor-ad-detail-grid">
        ${detailField_cor('Proyecto', row.proyecto, 'is-wide')}
        ${detailField_cor('PP NS', row.pp_ns)}
        ${detailField_cor('Equipo', row.equipo)}
        ${detailField_cor('Año cot.', rowYear_cor(row))}
        ${detailField_cor('Fecha cot.', formatDate_cor(row.fecha_cot))}
        ${detailField_cor('Firma cot.', row.firma_cot)}
        ${detailField_cor('Departamento', row.departamento)}
        ${detailField_cor('Categoría', row.categoria)}
        ${detailField_cor('SUP', row.sup)}
        ${detailField_cor('OV', row.ov)}
        ${detailField_cor('Factura', row.factura)}
        ${detailField_cor('OC', row.oc)}
        ${detailField_cor('Estatus trabajos', row.estatus_trabajos)}
        ${detailField_cor('Estatus cobranza', row.estatus_cobranza)}
        ${detailField_cor('Moneda', currency || '—')}
        ${detailField_cor('Semana de pago', row.semana_pago)}
        ${detailField_cor('Fecha de pago', formatDate_cor(row.fecha_pago))}
        ${detailField_cor('Gasto ejercido', row.gasto_ejercido)}
      </div>

      <div class="ccor-ad-money-grid">
        ${moneyField_cor('Subtotal', row.monto_subtotal, currency)}
        ${detailField_cor('IVA %', formatPercent_cor(row.iva_pct))}
        ${moneyField_cor('Monto IVA', row.monto_iva, currency)}
        ${moneyField_cor('Total', row.monto_total, currency)}
        ${moneyField_cor('Gasto subtotal', row.gasto_subtotal, currency)}
        ${moneyField_cor('Diferencia', row.diferencia, currency)}
        ${detailField_cor('Utilidad real', formatPercent_cor(row.utilidad_real_pct))}
        ${moneyField_cor('Monto pagado', row.monto_pagado, currency)}
        ${moneyField_cor('Pagado sin IVA', row.pagado_sin_iva, currency)}
        ${moneyField_cor('Pendiente de pago', rowPending_cor(row), currency, 'is-pending')}
      </div>

      <div class="ccor-ad-detail-comments">
        <span>Comentario fuente</span>
        <p>${escapeHtml_cor(text_cor(row.comentario_fuente, 'Sin comentario registrado.'))}</p>
      </div>`;
    modal.hidden = false;
    document.body.classList.add('ccor-ad-modal-open');
  }

  function moneyField_cor(label, value, currency, className){
    return `<div class="ccor-ad-detail-field ${className || ''}"><span>${escapeHtml_cor(label)}</span><b>${escapeHtml_cor(formatMoney_cor(value, currency))}</b></div>`;
  }

  function closeDetail_cor(){
    const modal = document.getElementById('ccor-ad-modal');
    if(modal) modal.hidden = true;
    document.body.classList.remove('ccor-ad-modal-open');
  }

  function findRowByDomId_cor(domId){
    const start = (state.page - 1) * state.pageSize;
    const rows = state.filtered.slice(start, start + state.pageSize);
    for(let index = 0; index < rows.length; index += 1){
      if(String(rowId_cor(rows[index], start + index)) === String(domId)) return rows[index];
    }
    return null;
  }

  function maybeOpenPayloadDetail_cor(){
    if(state.pendingDetailId === null || state.pendingDetailId === undefined || state.pendingDetailId === '') return;
    const target = String(state.pendingDetailId);
    const row = state.records.find((item, index) => String(rowId_cor(item, index)) === target);
    state.pendingDetailId = null;
    if(row) openDetail_cor(row);
  }

  function renderStatus_cor(message, kind){
    const node = document.getElementById('ccor-ad-status-line');
    if(!node) return;
    node.className = 'ccor-ad-inline-status' + (kind ? ' is-' + kind : '');
    node.textContent = message || '';
  }

  function setText_cor(id, value){
    const node = document.getElementById(id);
    if(node) node.textContent = String(value ?? '');
  }

  function setLoading_cor(loading){
    state.loading = loading;
    const refresh = document.getElementById('ccor-ad-refresh');
    if(refresh){
      refresh.disabled = loading;
      refresh.textContent = loading ? 'Actualizando...' : '↻ Actualizar';
    }
  }

  async function refresh_cor(){
    if(!state.root) return false;
    const sequence = ++state.requestSequence;
    setLoading_cor(true);
    renderStatus_cor('Consultando Aditivas autorizadas...', 'loading');

    try{
      const response = await apiGet_cor(API_PATH);
      if(sequence !== state.requestSequence) return false;
      state.response = response || {};

      if(isBackendPending_cor(state.response)){
        state.records = [];
        state.filtered = [];
        state.summary = null;
        renderBackendPending_cor(state.response);
        renderStatus_cor('', '');
        return true;
      }

      renderBackendReady_cor();
      state.records = extractRecords_cor(state.response);
      state.summary = extractSummary_cor(state.response);
      state.page = 1;
      updateCatalogs_cor();
      applyFilters_cor();
      renderStatus_cor(state.records.length ? '' : 'La consulta fue exitosa, pero no devolvió Aditivas para tu alcance actual.', state.records.length ? '' : 'empty');
      setText_cor('ccor-ad-updated', 'Actualizado ' + formatDateTimeNow_cor());
      maybeOpenPayloadDetail_cor();
      return true;
    }catch(error){
      if(sequence !== state.requestSequence) return false;
      renderBackendReady_cor();
      state.records = [];
      state.filtered = [];
      state.summary = null;
      updateCatalogs_cor();
      applyFilters_cor();
      renderStatus_cor(errorMessage_cor(error), 'error');
      return false;
    }finally{
      if(sequence === state.requestSequence) setLoading_cor(false);
    }
  }

  function resetFilters_cor(){
    state.filters = { q:'', anio:'', departamento:'', estatusCobranza:'', moneda:'' };
    const search = document.getElementById('ccor-ad-search');
    if(search) search.value = '';
    fillSelect_cor('ccor-ad-year', state.catalogs.years, '', 'Todos');
    fillSelect_cor('ccor-ad-department', state.catalogs.departments, '', 'Todos');
    fillSelect_cor('ccor-ad-status', state.catalogs.statuses, '', 'Todos');
    fillSelect_cor('ccor-ad-currency', state.catalogs.currencies, '', 'Todas');
    state.page = 1;
    applyFilters_cor();
  }

  function bindEvents_cor(){
    const root = state.root;
    if(!root || state.boundRoot === root) return;
    state.boundRoot = root;

    root.addEventListener('click', event => {
      const refresh = event.target.closest('#ccor-ad-refresh');
      if(refresh){ refresh_cor(); return; }

      const clear = event.target.closest('#ccor-ad-clear');
      if(clear){ resetFilters_cor(); return; }

      const prev = event.target.closest('#ccor-ad-prev');
      if(prev && !prev.disabled){ state.page -= 1; renderTable_cor(); renderPagination_cor(); return; }

      const next = event.target.closest('#ccor-ad-next');
      if(next && !next.disabled){ state.page += 1; renderTable_cor(); renderPagination_cor(); return; }

      if(event.target.closest('[data-ccor-ad-close]')){ closeDetail_cor(); return; }

      const rowNode = event.target.closest('[data-ccor-ad-row]');
      if(rowNode){
        const row = findRowByDomId_cor(rowNode.dataset.ccorAdRow);
        if(row) openDetail_cor(row);
      }
    });

    root.addEventListener('keydown', event => {
      if(event.key === 'Escape'){
        closeDetail_cor();
        return;
      }
      if(event.key !== 'Enter' && event.key !== ' ') return;
      const rowNode = event.target.closest('[data-ccor-ad-row]');
      if(!rowNode) return;
      event.preventDefault();
      const row = findRowByDomId_cor(rowNode.dataset.ccorAdRow);
      if(row) openDetail_cor(row);
    });

    root.addEventListener('input', event => {
      if(event.target.id !== 'ccor-ad-search') return;
      window.clearTimeout(state.searchTimer);
      state.searchTimer = window.setTimeout(() => {
        state.filters.q = event.target.value || '';
        state.page = 1;
        applyFilters_cor();
      }, SEARCH_DELAY_MS);
    });

    root.addEventListener('change', event => {
      if(event.target.id === 'ccor-ad-year') state.filters.anio = event.target.value || '';
      else if(event.target.id === 'ccor-ad-department') state.filters.departamento = event.target.value || '';
      else if(event.target.id === 'ccor-ad-status') state.filters.estatusCobranza = event.target.value || '';
      else if(event.target.id === 'ccor-ad-currency') state.filters.moneda = event.target.value || '';
      else return;
      state.page = 1;
      applyFilters_cor();
    });
  }

  function init_cor(rootArg){
    const root = rootArg && rootArg.nodeType === 1
      ? rootArg
      : (document.getElementById('view-cobranza-aditivas') || document.getElementById('view-placeholder'));
    if(!root) return false;
    state.root = root;
    const payload = currentPayload_cor();
    state.pendingDetailId = payload && (payload.id || payload.id_aditiva_cor) ? (payload.id || payload.id_aditiva_cor) : null;
    renderShell_cor();
    refresh_cor();
    return true;
  }

  // La ruta ya existe en el router global y cae en view-placeholder hasta que el
  // módulo lazy-loaded termina de integrarse. El router emite mantto:navigation
  // después de renderizar; este listener reemplaza únicamente ese placeholder
  // cuando el destino real es Cobranza COR > Aditivas.
  document.addEventListener('mantto:navigation', event => {
    const detail = event && event.detail ? event.detail : {};
    if(String(detail.route || '') !== ROUTE) return;
    const root = document.getElementById('view-placeholder');
    if(root) init_cor(root);
  });

  document.addEventListener('mantto:view-user-changed', () => {
    state.response = null;
    state.records = [];
    state.filtered = [];
    state.summary = null;
    state.page = 1;
    closeDetail_cor();
    if(isActive_cor() && state.root) refresh_cor();
  });

  window.ManttoCobranzaCorAditivas = Object.freeze({
    init:init_cor,
    refresh:refresh_cor,
    route:ROUTE,
    apiPath:API_PATH
  });
})();

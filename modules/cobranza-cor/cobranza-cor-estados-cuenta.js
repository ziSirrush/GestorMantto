(function(){
  'use strict';

  if(window.ManttoCobranzaCorEstadosCuenta) return;

  const ROUTE = 'cobranza-estados-cuenta';
  const LIST_PATH = '/api/cobranza-cor/estados-cuenta';
  const SEARCH_DELAY_MS = 350;

  const state = {
    root: null,
    records: [],
    catalogYears: [],
    catalogStatuses: [],
    selectedId: null,
    detail: null,
    filters: {
      q: '',
      anio: '',
      estatus: '',
      soloConFuente: false
    },
    listSequence: 0,
    detailSequence: 0,
    searchTimer: null,
    loadingList: false,
    loadingDetail: false
  };

  function currentRoute_cor(){
    if(!window.ManttoRouter || typeof window.ManttoRouter.getCurrent !== 'function') return '';
    const current = window.ManttoRouter.getCurrent() || {};
    return String(current.route || '');
  }

  function isActive_cor(){
    return currentRoute_cor() === ROUTE;
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

  function formatInteger_cor(value){
    const parsed = number_cor(value);
    if(parsed === null) return '—';
    return new Intl.NumberFormat('es-MX', { maximumFractionDigits:0 }).format(parsed);
  }

  function formatPercent_cor(value){
    const parsed = number_cor(value);
    if(parsed === null) return '—';
    const pct = parsed * 100;
    return new Intl.NumberFormat('es-MX', {
      minimumFractionDigits:0,
      maximumFractionDigits:2
    }).format(pct) + '%';
  }

  function formatDifference_cor(value){
    const parsed = number_cor(value);
    if(parsed === null) return '—';
    const pp = parsed * 100;
    const sign = pp > 0 ? '+' : '';
    return sign + new Intl.NumberFormat('es-MX', {
      minimumFractionDigits:0,
      maximumFractionDigits:2
    }).format(pp) + ' pp';
  }

  function formatMoney_cor(value, currency){
    const parsed = number_cor(value);
    if(parsed === null) return '—';
    const code = String(currency || '').trim().toUpperCase();
    if(/^[A-Z]{3}$/.test(code) && code !== 'SIN_MONEDA'){
      try{
        return new Intl.NumberFormat('es-MX', {
          style:'currency',
          currency:code,
          minimumFractionDigits:2,
          maximumFractionDigits:2
        }).format(parsed);
      }catch(_error){}
    }
    const amount = new Intl.NumberFormat('es-MX', {
      minimumFractionDigits:2,
      maximumFractionDigits:2
    }).format(parsed);
    return code && code !== 'SIN_MONEDA' ? amount + ' ' + code : amount;
  }

  function formatDate_cor(value){
    const raw = String(value || '').trim();
    if(!raw) return '—';
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(!match) return raw;
    return match[3] + '/' + match[2] + '/' + match[1];
  }

  function statusClass_cor(value){
    const status = String(value || '').trim().toUpperCase();
    if(!status) return 'is-neutral';
    if(['PAGADO','PAGADA','COBRADO','COBRADA','LIQUIDADO','LIQUIDADA','AL DIA','AL DÍA'].includes(status)) return 'is-ok';
    if(status.includes('VENC') || status.includes('NO PAG') || status.includes('PEND')) return 'is-danger';
    if(status.includes('COBRANZA') || status.includes('PROCESO') || status.includes('ESPERA')) return 'is-warn';
    return 'is-neutral';
  }

  function apiGet_cor(path, options){
    if(!window.ManttoHttp || typeof window.ManttoHttp.get !== 'function'){
      return Promise.reject(new Error('Cliente HTTP central no disponible.'));
    }
    return window.ManttoHttp.get(path, options || {});
  }

  function buildListPath_cor(){
    const params = new URLSearchParams();
    if(state.filters.q) params.set('q', state.filters.q);
    if(state.filters.anio) params.set('anio', state.filters.anio);
    if(state.filters.estatus) params.set('estatus', state.filters.estatus);
    if(state.filters.soloConFuente) params.set('solo_con_fuente', '1');
    const query = params.toString();
    return LIST_PATH + (query ? '?' + query : '');
  }

  function errorMessage_cor(error, context){
    const status = Number(error && error.status);
    if(status === 401) return 'La sesión ya no está disponible. Vuelve a iniciar sesión para consultar Estados de Cuenta.';
    if(status === 403) return 'No tienes permiso o alcance de información para consultar estos Estados de Cuenta.';
    if(status === 404 && context === 'list') return 'El endpoint de Estados de Cuenta no está disponible en este entorno. Despliega primero el backend de la FASE 3.';
    if(status === 404) return 'El proyecto ya no existe o quedó fuera de tu alcance autorizado.';
    return text_cor(error && error.message, 'No fue posible consultar Estados de Cuenta.');
  }

  function renderShell_cor(){
    const root = state.root;
    if(!root) return;

    root.innerHTML = `
      <div class="ccor-ec-page">
        <section class="ccor-ec-card ccor-ec-hero">
          <div>
            <p class="ccor-ec-eyebrow">Cobranza · Corellian</p>
            <h1>Estados de Cuenta</h1>
            <p>Detalle de facturación, pagos y adeudos por proyecto.</p>
          </div>
          <div class="ccor-ec-hero-actions">
            <span id="ccor-ec-updated">Sin actualizar</span>
            <button id="ccor-ec-refresh" class="ccor-ec-btn ccor-ec-btn-primary" type="button">↻ Actualizar</button>
          </div>
        </section>

        <section class="ccor-ec-card ccor-ec-filters" aria-label="Filtros de Estados de Cuenta">
          <label>
            <span>Año</span>
            <select id="ccor-ec-year"><option value="">Todos</option></select>
          </label>
          <label>
            <span>Estatus</span>
            <select id="ccor-ec-status"><option value="">Todos</option></select>
          </label>
          <label class="ccor-ec-search-field">
            <span>Buscar proyecto / PP</span>
            <input id="ccor-ec-search" type="search" autocomplete="off" placeholder="Buscar..." />
          </label>
          <label class="ccor-ec-check">
            <input id="ccor-ec-only-source" type="checkbox" />
            <span>Solo con movimientos</span>
          </label>
          <div class="ccor-ec-filter-total">Proyectos: <b id="ccor-ec-total">0</b></div>
        </section>

        <section class="ccor-ec-card ccor-ec-projects-card">
          <div id="ccor-ec-list-status" class="ccor-ec-inline-status" aria-live="polite"></div>
          <div class="ccor-ec-table-wrap ccor-ec-projects-wrap">
            <table class="ccor-ec-table ccor-ec-projects-table">
              <thead>
                <tr>
                  <th>Proyecto</th>
                  <th>PP</th>
                  <th>Año</th>
                  <th>QTY</th>
                  <th>ADM</th>
                  <th>SUP</th>
                  <th>VEND</th>
                  <th>EDO</th>
                  <th>Estatus</th>
                  <th>% USD</th>
                  <th>% MXN</th>
                  <th>Mov.</th>
                  <th>Monedas</th>
                </tr>
              </thead>
              <tbody id="ccor-ec-projects-body"></tbody>
            </table>
          </div>
        </section>

        <section id="ccor-ec-detail" class="ccor-ec-detail" aria-live="polite">
          <div class="ccor-ec-card ccor-ec-empty-detail">
            <div class="ccor-ec-empty-icon">🧾</div>
            <h2>Selecciona un proyecto</h2>
            <p>El Estado de Cuenta se abrirá por <code>id_indice_cor</code>.</p>
          </div>
        </section>
      </div>`;

    const contextSubtitle = document.getElementById('app-context-subtitle');
    if(contextSubtitle) contextSubtitle.textContent = 'Cobranza Corellian · detalle de facturación, pagos y adeudos por proyecto';

    const search = document.getElementById('ccor-ec-search');
    const year = document.getElementById('ccor-ec-year');
    const status = document.getElementById('ccor-ec-status');
    const onlySource = document.getElementById('ccor-ec-only-source');
    if(search) search.value = state.filters.q;
    if(year) year.value = state.filters.anio;
    if(status) status.value = state.filters.estatus;
    if(onlySource) onlySource.checked = state.filters.soloConFuente;
  }

  function renderCatalogs_cor(){
    const yearSelect = document.getElementById('ccor-ec-year');
    const statusSelect = document.getElementById('ccor-ec-status');
    if(yearSelect){
      yearSelect.innerHTML = '<option value="">Todos</option>' + state.catalogYears
        .map(value => `<option value="${escapeHtml_cor(value)}">${escapeHtml_cor(value)}</option>`)
        .join('');
      yearSelect.value = state.filters.anio;
    }
    if(statusSelect){
      statusSelect.innerHTML = '<option value="">Todos</option>' + state.catalogStatuses
        .map(value => `<option value="${escapeHtml_cor(value)}">${escapeHtml_cor(value)}</option>`)
        .join('');
      statusSelect.value = state.filters.estatus;
    }
  }

  function updateCatalogsFromRecords_cor(records){
    if(!state.catalogYears.length){
      state.catalogYears = [...new Set((records || [])
        .map(row => number_cor(row && row.anio))
        .filter(value => value !== null)
        .map(String))]
        .sort((a,b) => Number(b) - Number(a));
    }
    if(!state.catalogStatuses.length){
      state.catalogStatuses = [...new Set((records || [])
        .map(row => text_cor(row && row.estatus, ''))
        .filter(Boolean))]
        .sort((a,b) => a.localeCompare(b, 'es'));
    }
    renderCatalogs_cor();
  }

  function renderListStatus_cor(message, kind){
    const node = document.getElementById('ccor-ec-list-status');
    if(!node) return;
    node.className = 'ccor-ec-inline-status' + (kind ? ' is-' + kind : '');
    node.textContent = message || '';
  }

  function renderList_cor(){
    const body = document.getElementById('ccor-ec-projects-body');
    const total = document.getElementById('ccor-ec-total');
    if(total) total.textContent = String(state.records.length);
    if(!body) return;

    if(!state.records.length){
      body.innerHTML = '<tr><td colspan="13" class="ccor-ec-table-empty">No se encontraron proyectos con los filtros seleccionados.</td></tr>';
      return;
    }

    body.innerHTML = state.records.map(row => {
      const id = Number(row.id_indice_cor);
      const selected = id === Number(state.selectedId);
      const currencies = Array.isArray(row.monedas) && row.monedas.length ? row.monedas.join(', ') : '—';
      return `
        <tr class="ccor-ec-project-row${selected ? ' is-selected' : ''}" data-id-indice-cor="${Number.isFinite(id) ? id : ''}" tabindex="0" role="button" aria-selected="${selected ? 'true' : 'false'}">
          <td><strong>${escapeHtml_cor(text_cor(row.proyecto))}</strong></td>
          <td>${escapeHtml_cor(text_cor(row.pp))}</td>
          <td>${escapeHtml_cor(text_cor(row.anio))}</td>
          <td>${escapeHtml_cor(formatInteger_cor(row.qty))}</td>
          <td>${escapeHtml_cor(text_cor(row.adm))}</td>
          <td>${escapeHtml_cor(text_cor(row.sup))}</td>
          <td>${escapeHtml_cor(text_cor(row.vend))}</td>
          <td>${escapeHtml_cor(text_cor(row.edo))}</td>
          <td><span class="ccor-ec-badge ${statusClass_cor(row.estatus)}">${escapeHtml_cor(text_cor(row.estatus))}</span></td>
          <td>${escapeHtml_cor(formatPercent_cor(row.cobranza_usd))}</td>
          <td>${escapeHtml_cor(formatPercent_cor(row.cobranza_mxn))}</td>
          <td>${escapeHtml_cor(formatInteger_cor(row.registros_estado_cuenta))}</td>
          <td>${escapeHtml_cor(currencies)}</td>
        </tr>`;
    }).join('');
  }

  function renderDetailLoading_cor(){
    const root = document.getElementById('ccor-ec-detail');
    if(!root) return;
    root.innerHTML = `
      <div class="ccor-ec-card ccor-ec-loading-card">
        <span class="ccor-ec-spinner" aria-hidden="true"></span>
        <div><b>Cargando Estado de Cuenta...</b><small>Consultando Aiven mediante el backend de Gestor Mantto.</small></div>
      </div>`;
  }

  function renderDetailError_cor(message){
    const root = document.getElementById('ccor-ec-detail');
    if(!root) return;
    root.innerHTML = `
      <div class="ccor-ec-card ccor-ec-error-card">
        <div class="ccor-ec-empty-icon">⚠️</div>
        <div><h2>No fue posible abrir el Estado de Cuenta</h2><p>${escapeHtml_cor(message)}</p></div>
      </div>`;
  }

  function renderCurrencyCards_cor(summary){
    const currencies = Array.isArray(summary && summary.monedas) ? summary.monedas : [];
    if(!currencies.length){
      return '<div class="ccor-ec-empty-box">Este proyecto no tiene movimientos vinculados en <code>cobranza_fuente_cor</code>.</div>';
    }
    return currencies.map(item => {
      const currency = text_cor(item.moneda, 'SIN MONEDA');
      return `
        <article class="ccor-ec-currency-card">
          <div class="ccor-ec-currency-head">
            <strong>${escapeHtml_cor(currency === 'SIN_MONEDA' ? 'Sin moneda' : currency)}</strong>
            <span>${escapeHtml_cor(formatInteger_cor(item.registros))} mov.</span>
          </div>
          <dl>
            <div><dt>Total</dt><dd>${escapeHtml_cor(formatMoney_cor(item.total, item.moneda))}</dd></div>
            <div><dt>Cobrado</dt><dd class="is-positive">${escapeHtml_cor(formatMoney_cor(item.cobrado, item.moneda))}</dd></div>
            <div><dt>Pendiente</dt><dd class="is-negative">${escapeHtml_cor(formatMoney_cor(item.pendiente, item.moneda))}</dd></div>
            <div><dt>% cobrado calculado</dt><dd>${escapeHtml_cor(formatPercent_cor(item.porcentaje_cobrado_calculado))}</dd></div>
            <div><dt>% cobranza Índice</dt><dd>${escapeHtml_cor(formatPercent_cor(item.porcentaje_cobranza_indice))}</dd></div>
            <div><dt>Pagados / No pagados</dt><dd>${escapeHtml_cor(formatInteger_cor(item.pagados))} / ${escapeHtml_cor(formatInteger_cor(item.no_pagados))}</dd></div>
          </dl>
        </article>`;
    }).join('');
  }

  function renderQuality_cor(quality){
    const comparison = Array.isArray(quality && quality.comparacion_porcentaje_indice_fuente)
      ? quality.comparacion_porcentaje_indice_fuente
      : [];
    const alerts = [
      ['Filas sin moneda', number_cor(quality && quality.filas_sin_moneda) || 0],
      ['Total inconsistente', number_cor(quality && quality.filas_total_inconsistente) || 0],
      ['Pagadas sin fecha de pago', number_cor(quality && quality.filas_pagadas_sin_fecha_pago) || 0]
    ];
    const totalAlerts = alerts.reduce((sum, entry) => sum + entry[1], 0);

    const comparisonHtml = comparison.length
      ? `<div class="ccor-ec-comparison-grid">${comparison.map(item => `
          <div class="ccor-ec-comparison-card">
            <b>${escapeHtml_cor(text_cor(item.moneda))}</b>
            <span>Índice <strong>${escapeHtml_cor(formatPercent_cor(item.porcentaje_indice))}</strong></span>
            <span>Fuente <strong>${escapeHtml_cor(formatPercent_cor(item.porcentaje_calculado_fuente))}</strong></span>
            <span>Diferencia <strong>${escapeHtml_cor(formatDifference_cor(item.diferencia))}</strong></span>
          </div>`).join('')}</div>`
      : '<p class="ccor-ec-muted">Sin comparación USD/MXN disponible.</p>';

    return `
      <div class="ccor-ec-quality-row ${totalAlerts ? 'has-alerts' : ''}">
        <div>
          <b>${totalAlerts ? 'Validaciones de consistencia' : 'Consistencia de la fuente'}</b>
          <span>${totalAlerts ? 'Se detectaron observaciones que conviene revisar en la fuente.' : 'Sin alertas detectadas por el backend para este Estado de Cuenta.'}</span>
        </div>
        <div class="ccor-ec-quality-counts">
          ${alerts.map(entry => `<span><b>${escapeHtml_cor(entry[1])}</b> ${escapeHtml_cor(entry[0])}</span>`).join('')}
        </div>
      </div>
      ${comparisonHtml}`;
  }

  function renderMovements_cor(rows){
    const records = Array.isArray(rows) ? rows : [];
    if(!records.length){
      return '<div class="ccor-ec-empty-box">No hay movimientos que mostrar.</div>';
    }
    return `
      <div class="ccor-ec-table-wrap ccor-ec-movements-wrap">
        <table class="ccor-ec-table ccor-ec-movements-table">
          <thead>
            <tr>
              <th>#</th><th>%</th><th>Condición</th><th>Factura</th><th>Moneda</th>
              <th>Subtotal</th><th>IVA</th><th>Total</th><th>Estatus factura</th>
              <th>Fecha pago</th><th>Pago (TOTAL)</th><th>Pago contabilizado</th><th>Pendiente</th>
              <th>Fecha vencimiento</th><th>Días venc.</th><th>Estimado pago</th><th>Estatus venc.</th>
            </tr>
          </thead>
          <tbody>
            ${records.map((row, index) => `
              <tr>
                <td>${index + 1}</td>
                <td>${escapeHtml_cor(formatPercent_cor(row.porcentaje))}</td>
                <td>${escapeHtml_cor(text_cor(row.condicion))}</td>
                <td>${escapeHtml_cor(text_cor(row.factura))}</td>
                <td><b>${escapeHtml_cor(text_cor(row.moneda))}</b></td>
                <td class="ccor-ec-num">${escapeHtml_cor(formatMoney_cor(row.subtotal, row.moneda))}</td>
                <td class="ccor-ec-num">${escapeHtml_cor(formatMoney_cor(row.iva, row.moneda))}</td>
                <td class="ccor-ec-num"><b>${escapeHtml_cor(formatMoney_cor(row.total, row.moneda))}</b></td>
                <td><span class="ccor-ec-badge ${statusClass_cor(row.estatus_factura)}">${escapeHtml_cor(text_cor(row.estatus_factura))}</span></td>
                <td>${escapeHtml_cor(formatDate_cor(row.fecha_pago))}</td>
                <td class="ccor-ec-num">${escapeHtml_cor(formatMoney_cor(row.pago_total, row.moneda))}</td>
                <td class="ccor-ec-num is-positive">${escapeHtml_cor(formatMoney_cor(row.pago_contabilizado, row.moneda))}</td>
                <td class="ccor-ec-num is-negative">${escapeHtml_cor(formatMoney_cor(row.pendiente_calculado, row.moneda))}</td>
                <td>${escapeHtml_cor(formatDate_cor(row.fecha_vencimiento))}</td>
                <td>${escapeHtml_cor(text_cor(row.dias_vencimiento))}</td>
                <td>${escapeHtml_cor(text_cor(row.estimado_pago))}</td>
                <td><span class="ccor-ec-badge ${statusClass_cor(row.estatus_vencimiento)}">${escapeHtml_cor(text_cor(row.estatus_vencimiento))}</span></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function renderDetail_cor(){
    const root = document.getElementById('ccor-ec-detail');
    const detail = state.detail;
    if(!root || !detail) return;

    const project = detail.proyecto || {};
    const summary = detail.resumen || {};
    const quality = detail.calidad || {};
    const movements = Array.isArray(detail.estado_cuenta) ? detail.estado_cuenta : [];

    root.innerHTML = `
      <section class="ccor-ec-card ccor-ec-detail-card">
        <div class="ccor-ec-detail-head">
          <div>
            <div class="ccor-ec-title-row">
              <h2>${escapeHtml_cor(text_cor(project.proyecto, 'Proyecto'))}</h2>
              <span class="ccor-ec-badge ${statusClass_cor(project.estatus)}">${escapeHtml_cor(text_cor(project.estatus))}</span>
            </div>
            <div class="ccor-ec-project-meta">
              <span><b>ID</b> ${escapeHtml_cor(text_cor(project.id_indice_cor))}</span>
              <span><b>PP</b> ${escapeHtml_cor(text_cor(project.pp))}</span>
              <span><b>Año</b> ${escapeHtml_cor(text_cor(project.anio))}</span>
              <span><b>QTY</b> ${escapeHtml_cor(formatInteger_cor(project.qty))}</span>
              <span><b>EDO</b> ${escapeHtml_cor(text_cor(project.edo))}</span>
            </div>
          </div>
          <div class="ccor-ec-compliance">
            <span class="${project.fianzas ? 'is-ok' : 'is-neutral'}">Fianzas: <b>${project.fianzas ? 'Sí' : 'No'}</b>${project.tipo_fianza ? ' · ' + escapeHtml_cor(project.tipo_fianza) : ''}</span>
            <span class="${project.repse_siroc ? 'is-ok' : 'is-neutral'}">REPSE / SIROC: <b>${project.repse_siroc ? 'Sí' : 'No'}</b></span>
          </div>
        </div>

        <div class="ccor-ec-responsibles">
          <span><small>ADM</small><b>${escapeHtml_cor(text_cor(project.adm))}</b></span>
          <span><small>SUP</small><b>${escapeHtml_cor(text_cor(project.sup))}</b></span>
          <span><small>VEND</small><b>${escapeHtml_cor(text_cor(project.vend))}</b></span>
          <span><small>MRC</small><b>${escapeHtml_cor(text_cor(project.mrc))}</b></span>
        </div>

        <div class="ccor-ec-section-title"><div><h3>Resumen por moneda</h3><p>${escapeHtml_cor(text_cor(summary.nota, 'Los importes se muestran por moneda.'))}</p></div></div>
        <div class="ccor-ec-currency-grid">${renderCurrencyCards_cor(summary)}</div>
      </section>

      <section class="ccor-ec-card ccor-ec-quality-card">
        <div class="ccor-ec-section-title"><div><h3>Comparativo Índice vs. Fuente</h3><p>Los porcentajes se reciben calculados desde backend; el frontend solo los presenta.</p></div></div>
        ${renderQuality_cor(quality)}
      </section>

      <section class="ccor-ec-card ccor-ec-movements-card">
        <div class="ccor-ec-section-title">
          <div><h3>Movimientos</h3><p>${escapeHtml_cor(formatInteger_cor(movements.length))} registros vinculados al proyecto.</p></div>
        </div>
        ${renderMovements_cor(movements)}
      </section>`;
  }

  async function loadDetail_cor(id, options){
    const numericId = Number(id);
    if(!Number.isInteger(numericId) || numericId <= 0) return;
    state.selectedId = numericId;
    state.detail = null;
    state.loadingDetail = true;
    renderList_cor();
    renderDetailLoading_cor();

    const sequence = ++state.detailSequence;
    try{
      const payload = await apiGet_cor(LIST_PATH + '/' + encodeURIComponent(numericId), {
        force:Boolean(options && options.force),
        cacheTtlMs:0
      });
      if(sequence !== state.detailSequence || !isActive_cor()) return;
      state.detail = payload || null;
      renderDetail_cor();
    }catch(error){
      if(sequence !== state.detailSequence || !isActive_cor()) return;
      renderDetailError_cor(errorMessage_cor(error, 'detail'));
    }finally{
      if(sequence === state.detailSequence) state.loadingDetail = false;
    }
  }

  async function loadList_cor(options){
    const sequence = ++state.listSequence;
    const preserveSelection = !(options && options.resetSelection);
    const previousSelection = preserveSelection ? Number(state.selectedId) : null;
    state.loadingList = true;
    renderListStatus_cor('Cargando proyectos...', 'loading');

    try{
      const payload = await apiGet_cor(buildListPath_cor(), {
        force:Boolean(options && options.force),
        cacheTtlMs:0
      });
      if(sequence !== state.listSequence || !isActive_cor()) return;

      const records = Array.isArray(payload && payload.data) ? payload.data : [];
      state.records = records;
      updateCatalogsFromRecords_cor(records);

      const stillVisible = previousSelection && records.some(row => Number(row.id_indice_cor) === previousSelection);
      if(stillVisible) state.selectedId = previousSelection;
      else state.selectedId = records.length ? Number(records[0].id_indice_cor) : null;

      renderList_cor();
      renderListStatus_cor(records.length ? '' : 'No hay proyectos para los filtros actuales.', records.length ? '' : 'empty');
      const updated = document.getElementById('ccor-ec-updated');
      if(updated){
        updated.textContent = 'Actualizado ' + new Intl.DateTimeFormat('es-MX', {
          day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'
        }).format(new Date());
      }

      if(state.selectedId){
        await loadDetail_cor(state.selectedId, { force:Boolean(options && options.force) });
      }else{
        state.detail = null;
        const detailRoot = document.getElementById('ccor-ec-detail');
        if(detailRoot){
          detailRoot.innerHTML = '<div class="ccor-ec-card ccor-ec-empty-detail"><div class="ccor-ec-empty-icon">🧾</div><h2>Sin proyectos</h2><p>No hay un proyecto disponible para abrir con los filtros actuales.</p></div>';
        }
      }
    }catch(error){
      if(sequence !== state.listSequence || !isActive_cor()) return;
      state.records = [];
      state.selectedId = null;
      state.detail = null;
      renderList_cor();
      renderListStatus_cor(errorMessage_cor(error, 'list'), 'error');
      const detailRoot = document.getElementById('ccor-ec-detail');
      if(detailRoot){
        detailRoot.innerHTML = '<div class="ccor-ec-card ccor-ec-empty-detail"><div class="ccor-ec-empty-icon">⚠️</div><h2>Estados de Cuenta no disponible</h2><p>' + escapeHtml_cor(errorMessage_cor(error, 'list')) + '</p></div>';
      }
    }finally{
      if(sequence === state.listSequence) state.loadingList = false;
    }
  }

  function applyFilterAndReload_cor(){
    loadList_cor({ force:true, resetSelection:true });
  }

  function bindEvents_cor(){
    const root = state.root;
    if(!root || root.dataset.ccorEstadosCuentaBound === '1') return;
    root.dataset.ccorEstadosCuentaBound = '1';

    root.addEventListener('click', event => {
      const refresh = event.target.closest('#ccor-ec-refresh');
      if(refresh){
        loadList_cor({ force:true });
        return;
      }

      const row = event.target.closest('[data-id-indice-cor]');
      if(row){
        const id = Number(row.dataset.idIndiceCor);
        if(Number.isInteger(id) && id > 0 && id !== Number(state.selectedId)) loadDetail_cor(id, { force:true });
      }
    });

    root.addEventListener('keydown', event => {
      if(event.key !== 'Enter' && event.key !== ' ') return;
      const row = event.target.closest('[data-id-indice-cor]');
      if(!row) return;
      event.preventDefault();
      const id = Number(row.dataset.idIndiceCor);
      if(Number.isInteger(id) && id > 0 && id !== Number(state.selectedId)) loadDetail_cor(id, { force:true });
    });

    root.addEventListener('change', event => {
      if(event.target.id === 'ccor-ec-year'){
        state.filters.anio = String(event.target.value || '');
        applyFilterAndReload_cor();
      }else if(event.target.id === 'ccor-ec-status'){
        state.filters.estatus = String(event.target.value || '');
        applyFilterAndReload_cor();
      }else if(event.target.id === 'ccor-ec-only-source'){
        state.filters.soloConFuente = Boolean(event.target.checked);
        applyFilterAndReload_cor();
      }
    });

    root.addEventListener('input', event => {
      if(event.target.id !== 'ccor-ec-search') return;
      state.filters.q = String(event.target.value || '').trim();
      if(state.searchTimer) window.clearTimeout(state.searchTimer);
      state.searchTimer = window.setTimeout(() => {
        state.searchTimer = null;
        applyFilterAndReload_cor();
      }, SEARCH_DELAY_MS);
    });
  }

  async function init_cor(){
    if(!isActive_cor()) return false;
    const root = document.getElementById('view-placeholder');
    if(!root) return false;

    state.root = root;
    renderShell_cor();
    bindEvents_cor();
    renderCatalogs_cor();
    renderList_cor();

    await loadList_cor({ force:true });
    return true;
  }

  function refresh_cor(){
    if(!isActive_cor()) return Promise.resolve(false);
    return loadList_cor({ force:true });
  }

  window.ManttoCobranzaCorEstadosCuenta = Object.freeze({
    init:init_cor,
    refresh:refresh_cor
  });
})();

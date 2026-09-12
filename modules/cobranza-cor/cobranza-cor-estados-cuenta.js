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
    loadingDetail: false,
    view: 'list'
  };

  function currentNavigation_cor(){
    if(!window.ManttoRouter || typeof window.ManttoRouter.getCurrent !== 'function'){
      return { route:'', payload:null };
    }
    const current = window.ManttoRouter.getCurrent() || {};
    return {
      route:String(current.route || ''),
      payload:current.payload || null
    };
  }

  function currentRoute_cor(){
    return currentNavigation_cor().route;
  }

  function currentPayload_cor(){
    return currentNavigation_cor().payload;
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
    return new Intl.NumberFormat('es-MX', {
      minimumFractionDigits:0,
      maximumFractionDigits:2
    }).format(parsed * 100) + '%';
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
    return formatAmount_cor(parsed) + (code && code !== 'SIN_MONEDA' ? ' ' + code : '');
  }

  function formatDate_cor(value){
    const raw = String(value || '').trim();
    if(!raw) return '—';
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(!match) return raw;
    return match[3] + '/' + match[2] + '/' + match[1];
  }

  function formatDateTimeNow_cor(){
    return new Intl.DateTimeFormat('es-MX', {
      day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'
    }).format(new Date());
  }

  function statusClass_cor(value){
    const status = String(value || '').trim().toUpperCase();
    if(!status) return 'is-neutral';
    if(['PAGADO','PAGADA','COBRADO','COBRADA','LIQUIDADO','LIQUIDADA','AL DIA','AL DÍA','ACTIVO'].includes(status)) return 'is-ok';
    if(status.includes('VENC') || status.includes('NO PAG') || status.includes('PEND')) return 'is-danger';
    if(status.includes('COBRANZA') || status.includes('PROCESO') || status.includes('ESPERA') || status.includes('REVISAR')) return 'is-warn';
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
    if(status === 404 && context === 'list') return 'El endpoint de Estados de Cuenta no está disponible en este entorno.';
    if(status === 404) return 'El proyecto ya no existe o quedó fuera de tu alcance autorizado.';
    return text_cor(error && error.message, 'No fue posible consultar Estados de Cuenta.');
  }

  function renderListShell_cor(){
    const root = state.root;
    if(!root) return;
    state.view = 'list';

    root.innerHTML = `
      <div class="ccor-ec-page ccor-ec-list-page">
        <section class="ccor-ec-card ccor-ec-hero">
          <div>
            <p class="ccor-ec-eyebrow">Cobranza · Corellian</p>
            <h1>Estados de Cuenta</h1>
            <p>Selecciona un proyecto para abrir su Estado de Cuenta.</p>
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
      </div>`;

    const contextSubtitle = document.getElementById('app-context-subtitle');
    if(contextSubtitle) contextSubtitle.textContent = 'Cobranza Corellian · Estados de Cuenta por proyecto';

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
    state.catalogYears = [...new Set((records || [])
      .map(row => number_cor(row && row.anio))
      .filter(value => value !== null)
      .map(String))]
      .sort((a,b) => Number(b) - Number(a));

    state.catalogStatuses = [...new Set((records || [])
      .map(row => text_cor(row && row.estatus, ''))
      .filter(Boolean))]
      .sort((a,b) => a.localeCompare(b, 'es'));

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
      const currencies = Array.isArray(row.monedas) && row.monedas.length ? row.monedas.join(', ') : '—';
      return `
        <tr class="ccor-ec-project-row" data-id-indice-cor="${Number.isFinite(id) ? id : ''}" tabindex="0" role="button" aria-label="Abrir Estado de Cuenta de ${escapeHtml_cor(text_cor(row.proyecto, 'proyecto'))}">
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

  function getSummaryItems_cor(detail){
    return Array.isArray(detail && detail.resumen && detail.resumen.monedas)
      ? detail.resumen.monedas
      : [];
  }

  function getMovements_cor(detail){
    return Array.isArray(detail && detail.estado_cuenta) ? detail.estado_cuenta : [];
  }

  function isMxn_cor(currency){
    return String(currency || '').trim().toUpperCase() === 'MXN';
  }

  function isKnownForeign_cor(currency){
    const code = String(currency || '').trim().toUpperCase();
    return Boolean(code) && code !== 'MXN' && code !== 'SIN_MONEDA';
  }

  function renderSummaryMini_cor(item, sectionClass){
    if(!item){
      return '<div class="ccor-ec-summary-empty">Sin movimientos</div>';
    }
    return `
      <div class="ccor-ec-summary-line ${sectionClass || ''}">
        <div class="ccor-ec-summary-currency">${escapeHtml_cor(text_cor(item.moneda))}</div>
        <div><span>Monto inicial</span><b>${escapeHtml_cor(formatMoney_cor(item.total, item.moneda))}</b></div>
        <div><span>Monto cobrado</span><b>${escapeHtml_cor(formatMoney_cor(item.cobrado, item.moneda))}</b></div>
        <div><span>Monto pendiente</span><b>${escapeHtml_cor(formatMoney_cor(item.pendiente, item.moneda))}</b></div>
        <div><span>% cobrado</span><b>${escapeHtml_cor(formatPercent_cor(item.porcentaje_cobrado_calculado))}</b></div>
      </div>`;
  }

  function renderSupplySummary_cor(summaryItems){
    const foreign = summaryItems.filter(item => isKnownForeign_cor(item.moneda));
    if(!foreign.length) return '<div class="ccor-ec-summary-empty">Sin movimientos de moneda extranjera.</div>';
    return foreign.map(item => renderSummaryMini_cor(item, 'is-supply')).join('');
  }

  function renderInstallationSummary_cor(summaryItems){
    const mxn = summaryItems.find(item => isMxn_cor(item.moneda));
    return mxn
      ? renderSummaryMini_cor(mxn, 'is-installation')
      : '<div class="ccor-ec-summary-empty">Sin movimientos en MXN.</div>';
  }

  function renderVencido_cor(row){
    const status = text_cor(row && row.estatus_vencimiento, '');
    if(status) return status;
    const days = number_cor(row && row.dias_vencimiento);
    if(days !== null && days > 0) return formatInteger_cor(days) + ' días';
    return '—';
  }

  function renderPaymentMe_cor(row){
    if(!isKnownForeign_cor(row && row.moneda)) return '—';
    const amount = number_cor(row && row.pago_contabilizado);
    return amount && amount > 0 ? formatAmount_cor(amount) : '—';
  }

  function renderPaymentMxn_cor(row){
    if(!isMxn_cor(row && row.moneda)) return '—';
    const amount = number_cor(row && row.pago_contabilizado);
    return amount && amount > 0 ? formatAmount_cor(amount) : '—';
  }

  function renderMovementRows_cor(rows, section){
    if(!rows.length){
      return '<tr><td colspan="12" class="ccor-ec-table-empty">Sin movimientos para esta sección.</td></tr>';
    }

    return rows.map(row => `
      <tr>
        <td>${escapeHtml_cor(formatPercent_cor(row.porcentaje))}</td>
        <td class="ccor-ec-condition">${escapeHtml_cor(text_cor(row.condicion))}</td>
        <td>${escapeHtml_cor(text_cor(row.factura))}</td>
        <td><b>${escapeHtml_cor(text_cor(row.moneda))}</b></td>
        <td class="ccor-ec-num">${escapeHtml_cor(formatAmount_cor(row.subtotal))}</td>
        <td class="ccor-ec-num">${escapeHtml_cor(formatAmount_cor(row.iva))}</td>
        <td class="ccor-ec-num"><b>${escapeHtml_cor(formatAmount_cor(row.total))}</b></td>
        <td>${escapeHtml_cor(formatDate_cor(row.fecha_pago))}</td>
        <td class="ccor-ec-num">${escapeHtml_cor(renderPaymentMe_cor(row))}</td>
        <td class="ccor-ec-num">${escapeHtml_cor(renderPaymentMxn_cor(row))}</td>
        <td>${escapeHtml_cor(renderVencido_cor(row))}</td>
        <td class="ccor-ec-num is-pending">${escapeHtml_cor(formatAmount_cor(row.pendiente_calculado))}</td>
      </tr>`).join('');
  }

  function renderTotalsRows_cor(summaryItems, section){
    const selected = section === 'supply'
      ? summaryItems.filter(item => isKnownForeign_cor(item.moneda))
      : summaryItems.filter(item => isMxn_cor(item.moneda));

    if(!selected.length) return '';

    return selected.map(item => `
      <tr class="ccor-ec-total-row">
        <td colspan="4">TOTAL ${escapeHtml_cor(text_cor(item.moneda))}</td>
        <td class="ccor-ec-num">${escapeHtml_cor(formatAmount_cor(item.subtotal))}</td>
        <td class="ccor-ec-num">${escapeHtml_cor(formatAmount_cor(item.iva))}</td>
        <td class="ccor-ec-num">${escapeHtml_cor(formatAmount_cor(item.total))}</td>
        <td>—</td>
        <td class="ccor-ec-num">${section === 'supply' ? escapeHtml_cor(formatAmount_cor(item.cobrado)) : '—'}</td>
        <td class="ccor-ec-num">${section === 'installation' ? escapeHtml_cor(formatAmount_cor(item.cobrado)) : '—'}</td>
        <td>—</td>
        <td class="ccor-ec-num">${escapeHtml_cor(formatAmount_cor(item.pendiente))}</td>
      </tr>`).join('');
  }

  function renderAccountTable_cor(title, section, rows, summaryItems){
    const sectionClass = section === 'supply' ? 'is-supply' : 'is-installation';
    const percentLabel = section === 'supply' ? '% ME' : '% MXN';

    return `
      <section class="ccor-ec-account-section ${sectionClass}">
        <div class="ccor-ec-account-title">${escapeHtml_cor(title)}</div>
        <div class="ccor-ec-table-wrap ccor-ec-detail-table-wrap">
          <table class="ccor-ec-table ccor-ec-detail-table">
            <thead>
              <tr>
                <th>${percentLabel}</th>
                <th>Condición</th>
                <th>Factura</th>
                <th>Mon</th>
                <th>Subtotal</th>
                <th>IVA</th>
                <th>Total</th>
                <th>Fecha pago</th>
                <th>Pago M.E.</th>
                <th>Pago MXN</th>
                <th>Vencido</th>
                <th>Por cobrar</th>
              </tr>
            </thead>
            <tbody>
              ${renderMovementRows_cor(rows, section)}
              ${renderTotalsRows_cor(summaryItems, section)}
            </tbody>
          </table>
        </div>
      </section>`;
  }

  function renderUnknownCurrency_cor(rows){
    if(!rows.length) return '';
    return `
      <section class="ccor-ec-card ccor-ec-unknown-card">
        <b>Movimientos sin moneda identificada: ${escapeHtml_cor(formatInteger_cor(rows.length))}</b>
        <span>Estos registros no se clasifican como Suministro ni Instalación hasta que la fuente indique la moneda.</span>
      </section>`;
  }

  function renderDetailLoading_cor(){
    const root = state.root;
    if(!root) return;
    state.view = 'detail';
    root.innerHTML = `
      <div class="ccor-ec-page">
        <button class="ccor-ec-back" type="button" data-ccor-back>← Regresar</button>
        <section class="ccor-ec-card ccor-ec-loading-card">
          <span class="ccor-ec-spinner" aria-hidden="true"></span>
          <div><b>Cargando Estado de Cuenta...</b><small>Consultando la información del proyecto seleccionado.</small></div>
        </section>
      </div>`;
  }

  function renderDetailError_cor(message){
    const root = state.root;
    if(!root) return;
    root.innerHTML = `
      <div class="ccor-ec-page">
        <button class="ccor-ec-back" type="button" data-ccor-back>← Regresar</button>
        <section class="ccor-ec-card ccor-ec-error-card">
          <div class="ccor-ec-empty-icon">⚠️</div>
          <div><h2>No fue posible abrir el Estado de Cuenta</h2><p>${escapeHtml_cor(message)}</p></div>
        </section>
      </div>`;
  }

  function renderDetail_cor(){
    const root = state.root;
    const detail = state.detail;
    if(!root || !detail) return;

    const project = detail.proyecto || {};
    const movements = getMovements_cor(detail);
    const summaryItems = getSummaryItems_cor(detail);
    const supplyRows = movements.filter(row => isKnownForeign_cor(row && row.moneda));
    const installationRows = movements.filter(row => isMxn_cor(row && row.moneda));
    const unknownRows = movements.filter(row => !isKnownForeign_cor(row && row.moneda) && !isMxn_cor(row && row.moneda));
    const sourceByPp = movements.filter(row => {
      const pp = String(project.pp || '').trim().toUpperCase();
      const source = String(row && row.id_proyecto_origen || '').trim().toUpperCase();
      return Boolean(pp) && pp === source;
    }).length;
    const sourceByName = movements.filter(row => {
      const projectName = String(project.proyecto || '').trim().toUpperCase();
      const sourceName = String(row && row.proyecto || '').trim().toUpperCase();
      return Boolean(projectName) && projectName === sourceName;
    }).length;

    state.view = 'detail';
    root.innerHTML = `
      <div class="ccor-ec-page ccor-ec-detail-page">
        <div class="ccor-ec-detail-toolbar">
          <button class="ccor-ec-back" type="button" data-ccor-back>← Regresar</button>
          <span>Fecha de consulta: <b>${escapeHtml_cor(formatDateTimeNow_cor())}</b></span>
        </div>

        <section class="ccor-ec-detail-title">
          <div>
            <p class="ccor-ec-eyebrow">Cobranza · Corellian</p>
            <h1>Estado de Cuenta</h1>
          </div>
          <span class="ccor-ec-badge ${statusClass_cor(project.estatus)}">${escapeHtml_cor(text_cor(project.estatus))}</span>
        </section>

        <section class="ccor-ec-card ccor-ec-project-header">
          <div><span>Proyecto</span><b>${escapeHtml_cor(text_cor(project.proyecto))}</b></div>
          <div><span>PP / Contrato</span><b>${escapeHtml_cor(text_cor(project.pp))}</b></div>
          <div><span>Año</span><b>${escapeHtml_cor(text_cor(project.anio))}</b></div>
          <div><span>Unidades</span><b>${escapeHtml_cor(formatInteger_cor(project.qty))}</b></div>
          <div><span>EDO</span><b>${escapeHtml_cor(text_cor(project.edo))}</b></div>
        </section>

        <section class="ccor-ec-summary-grid">
          <article class="ccor-ec-card ccor-ec-summary-card is-supply">
            <div class="ccor-ec-summary-title">
              <div><span class="ccor-ec-summary-icon">◎</span><b>SUMINISTRO</b></div>
              <small>Moneda extranjera</small>
            </div>
            ${renderSupplySummary_cor(summaryItems)}
          </article>

          <article class="ccor-ec-card ccor-ec-summary-card is-installation">
            <div class="ccor-ec-summary-title">
              <div><span class="ccor-ec-summary-icon">⌁</span><b>INSTALACIÓN</b></div>
              <small>Moneda nacional · MXN</small>
            </div>
            ${renderInstallationSummary_cor(summaryItems)}
          </article>
        </section>

        ${renderAccountTable_cor('SUMINISTRO', 'supply', supplyRows, summaryItems)}
        ${renderAccountTable_cor('INSTALACIÓN', 'installation', installationRows, summaryItems)}
        ${renderUnknownCurrency_cor(unknownRows)}

        <section class="ccor-ec-info-grid">
          <article class="ccor-ec-card ccor-ec-info-card">
            <h3>Información del proyecto</h3>
            <dl>
              <div><dt>ADM</dt><dd>${escapeHtml_cor(text_cor(project.adm))}</dd></div>
              <div><dt>SUP</dt><dd>${escapeHtml_cor(text_cor(project.sup))}</dd></div>
              <div><dt>VEND</dt><dd>${escapeHtml_cor(text_cor(project.vend))}</dd></div>
              <div><dt>MRC</dt><dd>${escapeHtml_cor(text_cor(project.mrc))}</dd></div>
            </dl>
          </article>

          <article class="ccor-ec-card ccor-ec-info-card">
            <h3>Cumplimiento</h3>
            <dl>
              <div><dt>Fianzas</dt><dd>${project.fianzas ? 'Sí' : 'No'}</dd></div>
              <div><dt>Tipo de fianza</dt><dd>${escapeHtml_cor(text_cor(project.tipo_fianza))}</dd></div>
              <div><dt>REPSE / SIROC</dt><dd>${project.repse_siroc ? 'Sí' : 'No'}</dd></div>
              <div><dt>Movimientos</dt><dd>${escapeHtml_cor(formatInteger_cor(movements.length))}</dd></div>
            </dl>
          </article>

          <article class="ccor-ec-card ccor-ec-info-card">
            <h3>Coincidencia con FUENTE</h3>
            <dl>
              <div><dt>Por PP / ID Proyecto</dt><dd>${escapeHtml_cor(formatInteger_cor(sourceByPp))}</dd></div>
              <div><dt>Por nombre de proyecto</dt><dd>${escapeHtml_cor(formatInteger_cor(sourceByName))}</dd></div>
              <div><dt>Filas mostradas</dt><dd>${escapeHtml_cor(formatInteger_cor(movements.length))}</dd></div>
            </dl>
            <p class="ccor-ec-info-note">Una fila se muestra una sola vez aunque coincida por PP y por nombre.</p>
          </article>
        </section>
      </div>`;

    const contextSubtitle = document.getElementById('app-context-subtitle');
    if(contextSubtitle) contextSubtitle.textContent = 'Estado de Cuenta · ' + text_cor(project.proyecto, 'Proyecto');
    try{ window.scrollTo({ top:0, behavior:'smooth' }); }catch(_error){ window.scrollTo(0, 0); }
  }

  async function loadDetail_cor(id, options){
    const numericId = Number(id);
    if(!Number.isInteger(numericId) || numericId <= 0) return;
    state.selectedId = numericId;
    state.detail = null;
    state.loadingDetail = true;
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
    state.loadingList = true;
    if(state.view !== 'list') renderListShell_cor();
    renderListStatus_cor('Cargando proyectos...', 'loading');

    try{
      const payload = await apiGet_cor(buildListPath_cor(), {
        force:Boolean(options && options.force),
        cacheTtlMs:0
      });
      if(sequence !== state.listSequence || !isActive_cor()) return;

      const records = Array.isArray(payload && payload.data) ? payload.data : [];
      state.records = records;
      state.selectedId = null;
      state.detail = null;
      updateCatalogsFromRecords_cor(records);
      renderList_cor();
      renderListStatus_cor(records.length ? '' : 'No hay proyectos para los filtros actuales.', records.length ? '' : 'empty');

      const updated = document.getElementById('ccor-ec-updated');
      if(updated) updated.textContent = 'Actualizado ' + formatDateTimeNow_cor();
    }catch(error){
      if(sequence !== state.listSequence || !isActive_cor()) return;
      state.records = [];
      state.selectedId = null;
      state.detail = null;
      renderList_cor();
      renderListStatus_cor(errorMessage_cor(error, 'list'), 'error');
    }finally{
      if(sequence === state.listSequence) state.loadingList = false;
    }
  }

  function restoreList_cor(){
    state.detail = null;
    state.selectedId = null;
    renderListShell_cor();
    renderCatalogs_cor();
    renderList_cor();
    const updated = document.getElementById('ccor-ec-updated');
    if(updated) updated.textContent = 'Actualizado ' + formatDateTimeNow_cor();
    try{ window.scrollTo({ top:0, behavior:'smooth' }); }catch(_error){ window.scrollTo(0, 0); }
  }

  function openDetailRoute_cor(id){
    const numericId = Number(id);
    if(!Number.isInteger(numericId) || numericId <= 0) return;

    if(window.ManttoRouter && typeof window.ManttoRouter.go === 'function'){
      window.ManttoRouter.go(ROUTE, { id:numericId }, { navigationType:'open' });
      return;
    }

    loadDetail_cor(numericId, { force:true });
  }

  function backFromDetail_cor(){
    if(window.ManttoRouter && typeof window.ManttoRouter.back === 'function'){
      window.ManttoRouter.back();
      return;
    }
    restoreList_cor();
  }

  function applyFilterAndReload_cor(){
    state.view = 'list';
    loadList_cor({ force:true });
  }

  function bindEvents_cor(){
    const root = state.root;
    if(!root || root.dataset.ccorEstadosCuentaBound === '1') return;
    root.dataset.ccorEstadosCuentaBound = '1';

    root.addEventListener('click', event => {
      const back = event.target.closest('[data-ccor-back]');
      if(back){
        backFromDetail_cor();
        return;
      }

      const refresh = event.target.closest('#ccor-ec-refresh');
      if(refresh){
        loadList_cor({ force:true });
        return;
      }

      const row = event.target.closest('[data-id-indice-cor]');
      if(row){
        const id = Number(row.dataset.idIndiceCor);
        if(Number.isInteger(id) && id > 0) openDetailRoute_cor(id);
      }
    });

    root.addEventListener('keydown', event => {
      if(event.key !== 'Enter' && event.key !== ' ') return;
      const row = event.target.closest('[data-id-indice-cor]');
      if(!row) return;
      event.preventDefault();
      const id = Number(row.dataset.idIndiceCor);
      if(Number.isInteger(id) && id > 0) openDetailRoute_cor(id);
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
    bindEvents_cor();

    const payload = currentPayload_cor();
    const requestedId = Number(payload && payload.id);
    if(Number.isInteger(requestedId) && requestedId > 0){
      state.view = 'detail';
      await loadDetail_cor(requestedId, { force:true });
      return true;
    }

    state.view = 'list';
    state.selectedId = null;
    state.detail = null;
    renderListShell_cor();
    renderCatalogs_cor();
    renderList_cor();

    if(state.records.length){
      const updated = document.getElementById('ccor-ec-updated');
      if(updated) updated.textContent = 'Actualizado ' + formatDateTimeNow_cor();
      return true;
    }

    await loadList_cor({ force:true });
    return true;
  }

  function refresh_cor(){
    if(!isActive_cor()) return Promise.resolve(false);
    const payload = currentPayload_cor();
    const requestedId = Number(payload && payload.id);
    if(Number.isInteger(requestedId) && requestedId > 0){
      return loadDetail_cor(requestedId, { force:true });
    }
    return loadList_cor({ force:true });
  }

  window.ManttoCobranzaCorEstadosCuenta = Object.freeze({
    init:init_cor,
    refresh:refresh_cor
  });
})();

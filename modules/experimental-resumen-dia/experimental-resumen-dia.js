(function(){
  'use strict';

  const ROUTE_EXP = 'experimental-resumen-dia';
  const ENDPOINT_EXP = '/api/experimental/resumen-dia';
  const state_exp = {
    initialized:false,
    loading:false,
    requestId:0,
    controller:null,
    estado:'',
    zona:'',
    filters:{estados:[],zonas:[]},
    period:{today:null,yesterday:null},
    today:null,
    yesterday:null,
    comparisons:{tickets:0,equipos_parados:0,no_funcionando:0},
    generatedAt:null
  };

  function root_exp(){
    return document.getElementById('view-' + ROUTE_EXP);
  }

  function apiBase_exp(){
    return String(window.MANTTO_API_BASE || 'http://localhost:3001').replace(/\/$/, '');
  }

  function headers_exp(){
    return Object.assign(
      {'Accept':'application/json'},
      window.ManttoAuth && window.ManttoAuth.authHeaders
        ? window.ManttoAuth.authHeaders()
        : {}
    );
  }

  function escapeHtml_exp(value){
    return String(value == null ? '' : value).replace(/[&<>"']/g,function(character){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character];
    });
  }

  function number_exp(value){
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function formatCount_exp(value){
    return number_exp(value).toLocaleString('es-MX');
  }

  function formatDate_exp(value){
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return '—';
    return `${match[3]}/${match[2]}/${match[1]}`;
  }

  function formatUpdated_exp(value){
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('es-MX', {
      day:'2-digit', month:'2-digit', year:'numeric',
      hour:'2-digit', minute:'2-digit'
    }).replace(',', ' -');
  }

  function renderLayout_exp(){
    const root = root_exp();
    if (!root) return false;
    root.innerHTML = `
      <div class="rdx-exp-page" data-rdx-exp-root>
        <section class="rdx-exp-head">
          <div>
            <p class="rdx-exp-eyebrow">📅 Experimental</p>
            <h1>Resumen del día</h1>
            <p class="rdx-exp-description">Resumen ejecutivo diario con comparación contra el día anterior.</p>
            <p class="rdx-exp-date" data-rdx-exp-date></p>
          </div>
          <div class="rdx-exp-head-actions">
            <span class="rdx-exp-updated" data-rdx-exp-updated></span>
            <button class="rdx-exp-refresh" data-rdx-exp-refresh type="button"><span aria-hidden="true">↻</span> Actualizar</button>
          </div>
        </section>

        <section class="rdx-exp-filter-card" aria-label="Filtros del Resumen del Día Experimental">
          <div class="rdx-exp-filter-row">
            <span class="rdx-exp-filter-label">Estado</span>
            <div class="rdx-exp-chips" data-rdx-exp-estados></div>
          </div>
          <div class="rdx-exp-filter-row">
            <span class="rdx-exp-filter-label">Zona operativa</span>
            <div class="rdx-exp-chips" data-rdx-exp-zonas></div>
          </div>
        </section>

        <div class="rdx-exp-feedback" data-rdx-exp-feedback hidden></div>

        <section class="rdx-exp-grid">
          <article class="rdx-exp-card rdx-exp-card-total">
            <header><span class="rdx-exp-card-icon">🎟️</span><h2>Tickets del día</h2></header>
            <strong class="rdx-exp-big" data-rdx-exp="total">0</strong>
            <p>reportados hoy</p>
            <div class="rdx-exp-compare" data-rdx-exp-compare="tickets" data-tone="neutral">= igual que ayer</div>
          </article>

          <article class="rdx-exp-card">
            <header><span class="rdx-exp-card-icon">📋</span><h2>Estado de tickets</h2></header>
            <div class="rdx-exp-status-grid">
              <div><span class="rdx-exp-dot rdx-exp-dot-open"></span><small>Abiertos</small><strong data-rdx-exp="abiertos">0</strong></div>
              <div><span class="rdx-exp-dot rdx-exp-dot-closed"></span><small>Cerrados</small><strong data-rdx-exp="cerrados">0</strong></div>
              <div><span class="rdx-exp-dot rdx-exp-dot-progress"></span><small>En curso</small><strong data-rdx-exp="en_curso">0</strong></div>
            </div>
            <div class="rdx-exp-progress" aria-label="Distribución de estados">
              <span class="rdx-exp-progress-open" data-rdx-exp-bar="abiertos"></span>
              <span class="rdx-exp-progress-closed" data-rdx-exp-bar="cerrados"></span>
              <span class="rdx-exp-progress-current" data-rdx-exp-bar="en_curso"></span>
            </div>
            <div class="rdx-exp-pct-grid">
              <span data-rdx-exp-pct="abiertos">0%</span>
              <span data-rdx-exp-pct="cerrados">0%</span>
              <span data-rdx-exp-pct="en_curso">0%</span>
            </div>
          </article>

          <article class="rdx-exp-card">
            <header><span class="rdx-exp-card-icon">⏱️</span><h2>Promedio tiempo de llegada</h2></header>
            <strong class="rdx-exp-big" data-rdx-exp="promedio_llegada">—</strong>
            <p>promedio del día</p>
          </article>

          <article class="rdx-exp-card">
            <header><span class="rdx-exp-card-icon">✅</span><h2>Cierre del día</h2></header>
            <div class="rdx-exp-dual">
              <div class="rdx-exp-dual-good"><small>Funcionando</small><strong data-rdx-exp="funcionando">0</strong></div>
              <div class="rdx-exp-dual-bad"><small>No funcionando</small><strong data-rdx-exp="no_funcionando">0</strong></div>
            </div>
            <div class="rdx-exp-summary-good" data-rdx-exp="porcentaje_funcionando">—</div>
          </article>

          <article class="rdx-exp-card">
            <header><span class="rdx-exp-card-icon">👥</span><h2>Responsabilidad</h2></header>
            <div class="rdx-exp-responsibility">
              <div><small>BLT</small><strong data-rdx-exp="blt">0</strong><span data-rdx-exp-pct="blt">0%</span></div>
              <div><small>Cliente</small><strong data-rdx-exp="cliente">0</strong><span data-rdx-exp-pct="cliente">0%</span></div>
            </div>
            <div class="rdx-exp-progress rdx-exp-progress-responsibility">
              <span class="rdx-exp-progress-blt" data-rdx-exp-bar="blt"></span>
              <span class="rdx-exp-progress-client" data-rdx-exp-bar="cliente"></span>
            </div>
          </article>

          <article class="rdx-exp-card">
            <header><span class="rdx-exp-card-icon">📊</span><h2>Equipos parados vs. ayer</h2></header>
            <div class="rdx-exp-stopped"><strong data-rdx-exp="equipos_parados">0</strong><span>equipos parados</span></div>
            <div class="rdx-exp-compare" data-rdx-exp-compare="equipos_parados" data-tone="neutral">= igual que ayer</div>
            <div class="rdx-exp-secondary-compare" data-rdx-exp-compare="no_funcionando" data-tone="neutral">Sin cambio en No Funcionando</div>
          </article>
        </section>
      </div>`;
    root.dataset.experimentalReady = '1';
    return true;
  }

  function setFeedback_exp(type, message){
    const root = root_exp();
    const box = root && root.querySelector('[data-rdx-exp-feedback]');
    if (!box) return;
    if (!message) {
      box.hidden = true;
      box.textContent = '';
      box.dataset.type = '';
      return;
    }
    box.hidden = false;
    box.dataset.type = type || 'info';
    box.textContent = message;
  }

  function setLoading_exp(loading){
    state_exp.loading = Boolean(loading);
    const root = root_exp();
    if (!root) return;
    root.classList.toggle('rdx-exp-is-loading', state_exp.loading);
    const refresh = root.querySelector('[data-rdx-exp-refresh]');
    if (refresh) {
      refresh.disabled = state_exp.loading;
      refresh.setAttribute('aria-busy', String(state_exp.loading));
    }
  }

  function renderChips_exp(container, items, selected, kind){
    if (!container) return;
    const allLabel = kind === 'estado' ? 'Todos' : 'Todas';
    const values = [''].concat(Array.isArray(items) ? items : []);
    container.innerHTML = values.map(function(value){
      const active = value === selected;
      return `<button type="button" class="rdx-exp-chip${active ? ' active' : ''}" data-rdx-exp-filter-kind="${kind}" data-rdx-exp-filter-value="${escapeHtml_exp(value)}" aria-pressed="${active}">${escapeHtml_exp(value || allLabel)}</button>`;
    }).join('');
  }

  function renderFilters_exp(){
    const root = root_exp();
    if (!root) return;
    renderChips_exp(root.querySelector('[data-rdx-exp-estados]'), state_exp.filters.estados, state_exp.estado, 'estado');
    renderChips_exp(root.querySelector('[data-rdx-exp-zonas]'), state_exp.filters.zonas, state_exp.zona, 'zona');
  }

  function setText_exp(name, value){
    const root = root_exp();
    const element = root && root.querySelector(`[data-rdx-exp="${name}"]`);
    if (element) element.textContent = value;
  }

  function setPercentage_exp(name, value){
    const root = root_exp();
    const number = Math.max(0, Math.min(100, number_exp(value)));
    const label = root && root.querySelector(`[data-rdx-exp-pct="${name}"]`);
    const bar = root && root.querySelector(`[data-rdx-exp-bar="${name}"]`);
    if (label) label.textContent = Math.round(number) + '%';
    if (bar) bar.style.width = number + '%';
  }

  function comparisonText_exp(value, kind){
    const delta = number_exp(value);
    if (kind === 'no_funcionando') {
      if (delta > 0) return {text:`↓ ${delta} menos funcionando`, tone:'negative'};
      if (delta < 0) return {text:`↑ ${Math.abs(delta)} más funcionando`, tone:'positive'};
      return {text:'Sin cambio en No Funcionando', tone:'neutral'};
    }
    if (delta > 0) return {text:`↑ +${delta} vs. ayer`, tone:'negative'};
    if (delta < 0) return {text:`↓ ${delta} vs. ayer`, tone:'positive'};
    return {text:'= igual que ayer', tone:'neutral'};
  }

  function setComparison_exp(kind, value){
    const root = root_exp();
    const element = root && root.querySelector(`[data-rdx-exp-compare="${kind}"]`);
    if (!element) return;
    const output = comparisonText_exp(value, kind);
    element.textContent = output.text;
    element.dataset.tone = output.tone;
  }

  function renderData_exp(){
    const root = root_exp();
    if (!root) return;
    const today = state_exp.today || {};
    const status = today.estado_tickets || {};
    const statusPct = status.porcentajes || {};
    const closure = today.cierre_dia || {};
    const responsibility = today.responsabilidad || {};
    const responsibilityPct = responsibility.porcentajes || {};

    setText_exp('total', formatCount_exp(today.total));
    setText_exp('abiertos', formatCount_exp(status.abiertos));
    setText_exp('cerrados', formatCount_exp(status.cerrados));
    setText_exp('en_curso', formatCount_exp(status.en_curso));
    setPercentage_exp('abiertos', statusPct.abiertos);
    setPercentage_exp('cerrados', statusPct.cerrados);
    setPercentage_exp('en_curso', statusPct.en_curso);

    const arrivalRaw = today.promedio_llegada_horas;
    const arrival = arrivalRaw === null || arrivalRaw === undefined || arrivalRaw === '' ? null : Number(arrivalRaw);
    setText_exp('promedio_llegada', arrival !== null && Number.isFinite(arrival) ? arrival.toFixed(1) + ' h' : '—');
    setText_exp('funcionando', formatCount_exp(closure.funcionando));
    setText_exp('no_funcionando', formatCount_exp(closure.no_funcionando));
    setText_exp('porcentaje_funcionando', number_exp(closure.total) > 0 ? `✅ ${number_exp(closure.porcentaje_funcionando)}% funcionando` : '—');

    setText_exp('blt', formatCount_exp(responsibility.blt));
    setText_exp('cliente', formatCount_exp(responsibility.cliente));
    setPercentage_exp('blt', responsibilityPct.blt);
    setPercentage_exp('cliente', responsibilityPct.cliente);

    setText_exp('equipos_parados', formatCount_exp(today.equipos_parados));
    setComparison_exp('tickets', state_exp.comparisons.tickets);
    setComparison_exp('equipos_parados', state_exp.comparisons.equipos_parados);
    setComparison_exp('no_funcionando', state_exp.comparisons.no_funcionando);

    const dateLabel = root.querySelector('[data-rdx-exp-date]');
    if (dateLabel) dateLabel.textContent = state_exp.period.today ? `Fecha operativa: ${formatDate_exp(state_exp.period.today)}` : '';
    const updated = root.querySelector('[data-rdx-exp-updated]');
    if (updated) {
      const text = formatUpdated_exp(state_exp.generatedAt);
      updated.textContent = text ? 'Actualizado ' + text : '';
    }
  }

  function bind_exp(){
    const root = root_exp();
    if (!root || root.dataset.rdxExpBound === '1') return;
    root.dataset.rdxExpBound = '1';
    root.addEventListener('click', function(event){
      const refresh = event.target.closest('[data-rdx-exp-refresh]');
      if (refresh) {
        event.preventDefault();
        load_exp(true);
        return;
      }
      const chip = event.target.closest('[data-rdx-exp-filter-kind]');
      if (!chip) return;
      event.preventDefault();
      const kind = chip.dataset.rdxExpFilterKind;
      const value = chip.dataset.rdxExpFilterValue || '';
      if (kind === 'estado') state_exp.estado = value;
      if (kind === 'zona') state_exp.zona = value;
      renderFilters_exp();
      load_exp(true);
    });
  }

  async function request_exp(){
    const params = new URLSearchParams();
    if (state_exp.estado) params.set('estado', state_exp.estado);
    if (state_exp.zona) params.set('zona', state_exp.zona);
    const query = params.toString();
    const response = await fetch(apiBase_exp() + ENDPOINT_EXP + (query ? '?' + query : ''), {
      method:'GET',
      headers:headers_exp(),
      cache:'no-store',
      signal:state_exp.controller ? state_exp.controller.signal : undefined
    });
    const text = await response.text();
    let payload = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch (error) {
      throw new Error('El backend respondió contenido no JSON.');
    }
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.message || payload.error || ('HTTP ' + response.status));
    }
    return payload;
  }

  async function load_exp(force){
    if (state_exp.loading && !force) return;
    if (state_exp.controller) state_exp.controller.abort();
    state_exp.controller = typeof AbortController === 'function' ? new AbortController() : null;
    const requestId = ++state_exp.requestId;
    setLoading_exp(true);
    setFeedback_exp('loading', 'Actualizando resumen del día...');
    try {
      const payload = await request_exp();
      if (requestId !== state_exp.requestId) return;
      state_exp.filters = payload.filters || {estados:[],zonas:[]};
      state_exp.period = payload.period || {today:null,yesterday:null};
      state_exp.today = payload.today || null;
      state_exp.yesterday = payload.yesterday || null;
      state_exp.comparisons = payload.comparisons || {tickets:0,equipos_parados:0,no_funcionando:0};
      state_exp.generatedAt = payload.generated_at || new Date().toISOString();
      renderFilters_exp();
      renderData_exp();
      setFeedback_exp('', '');
    } catch (error) {
      if (error && error.name === 'AbortError') return;
      if (requestId !== state_exp.requestId) return;
      state_exp.today = null;
      state_exp.yesterday = null;
      state_exp.comparisons = {tickets:0,equipos_parados:0,no_funcionando:0};
      renderData_exp();
      setFeedback_exp('error', error && error.message ? error.message : 'No fue posible consultar el resumen del día.');
    } finally {
      if (requestId === state_exp.requestId) setLoading_exp(false);
    }
  }

  function init_exp(){
    if (!root_exp()) return false;
    if (!root_exp().querySelector('[data-rdx-exp-root]')) renderLayout_exp();
    bind_exp();
    renderFilters_exp();
    renderData_exp();
    if (!state_exp.initialized) {
      state_exp.initialized = true;
      load_exp(false);
    }
    return true;
  }

  function refresh_exp(){
    return load_exp(true);
  }

  window.ManttoResumenDiaExperimental_exp = {
    init:init_exp,
    refresh:refresh_exp
  };
})();

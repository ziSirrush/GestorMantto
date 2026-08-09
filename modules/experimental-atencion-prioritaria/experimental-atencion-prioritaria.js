(function(){
  'use strict';

  const ROUTE_EXP = 'experimental-atencion-prioritaria';
  const ENDPOINT_EXP = '/api/experimental/atencion-prioritaria';
  const state_exp = {
    initialized:false,
    loading:false,
    requestId:0,
    controller:null,
    estado:'',
    zona:'',
    periodo:'dia',
    filters:{estados:[],zonas:[]},
    counts:{atrapados:0,sin_llegada:0,criticos_reincidentes:0},
    data:{atrapados:[],sin_llegada:[],criticos_reincidentes:[]},
    criteria:null,
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

  function safeText_exp(value, fallback){
    const text = String(value == null ? '' : value).trim();
    return text || fallback || '—';
  }

  function formatElapsed_exp(minutes, compactHours){
    const value = Number(minutes);
    if (!Number.isFinite(value)) return '—';
    if (value < 60) return Math.max(0, Math.round(value)) + ' min';
    if (compactHours) return (value / 60).toFixed(1) + ' h';
    const days = Math.floor(value / 1440);
    const remainder = value % 1440;
    const hours = Math.floor(remainder / 60);
    const mins = Math.round(remainder % 60);
    if (days > 0) {
      const parts = [days + ' d'];
      if (hours) parts.push(hours + ' h');
      if (mins) parts.push(mins + ' min');
      return parts.join(' ');
    }
    return mins ? hours + ' h ' + mins + ' min' : hours + ' h';
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

  function statusClass_exp(status){
    const normalized = String(status || '').toLowerCase();
    if (normalized.includes('cerr')) return 'atp-exp-status-closed';
    if (normalized.includes('curso') || normalized.includes('proceso')) return 'atp-exp-status-progress';
    return 'atp-exp-status-open';
  }

  function renderLayout_exp(){
    const root = root_exp();
    if (!root) return false;
    root.innerHTML = `
      <div class="atp-exp-page" data-atp-exp-root>
        <section class="atp-exp-head">
          <div>
            <p class="atp-exp-eyebrow">🚨 Experimental</p>
            <h1>Alertas prioritarias</h1>
            <p class="atp-exp-description">Vista ejecutiva de incidencias que requieren atención inmediata.</p>
          </div>
          <div class="atp-exp-head-actions">
            <span class="atp-exp-updated" data-atp-exp-updated></span>
            <button class="atp-exp-refresh" data-atp-exp-refresh type="button">
              <span aria-hidden="true">↻</span> Actualizar
            </button>
          </div>
        </section>

        <section class="atp-exp-filter-card" aria-label="Filtros de Atención Prioritaria">
          <div class="atp-exp-filter-row">
            <span class="atp-exp-filter-label">Período</span>
            <div class="atp-exp-chips" data-atp-exp-periodos>
              <button type="button" class="atp-exp-chip active" data-atp-exp-periodo="dia" aria-pressed="true">Día</button>
              <button type="button" class="atp-exp-chip" data-atp-exp-periodo="todos" aria-pressed="false">Todos</button>
            </div>
          </div>
          <div class="atp-exp-filter-row">
            <span class="atp-exp-filter-label">Estado</span>
            <div class="atp-exp-chips" data-atp-exp-estados></div>
          </div>
          <div class="atp-exp-filter-row">
            <span class="atp-exp-filter-label">Zona operativa</span>
            <div class="atp-exp-chips" data-atp-exp-zonas></div>
          </div>
        </section>

        <div class="atp-exp-feedback" data-atp-exp-feedback hidden></div>

        <section class="atp-exp-kpis" aria-label="Resumen de alertas prioritarias">
          <button class="atp-exp-kpi atp-exp-kpi-danger" data-atp-exp-scroll="atrapados" type="button">
            <span class="atp-exp-kpi-icon" aria-hidden="true">🚨</span>
            <span class="atp-exp-kpi-label">Atrapados</span>
            <strong data-atp-exp-count="atrapados">0</strong>
            <span class="atp-exp-kpi-line"></span>
          </button>
          <button class="atp-exp-kpi atp-exp-kpi-warning" data-atp-exp-scroll="sin-llegada" type="button">
            <span class="atp-exp-kpi-icon" aria-hidden="true">⏱️</span>
            <span class="atp-exp-kpi-label">Llegada &gt; 2h</span>
            <strong data-atp-exp-count="sin_llegada">0</strong>
            <span class="atp-exp-kpi-line"></span>
          </button>
          <button class="atp-exp-kpi atp-exp-kpi-critical" data-atp-exp-scroll="reincidentes" type="button">
            <span class="atp-exp-kpi-icon" aria-hidden="true">💥</span>
            <span class="atp-exp-kpi-label">Crítico reinc.</span>
            <strong data-atp-exp-count="criticos_reincidentes">0</strong>
            <span class="atp-exp-kpi-line"></span>
          </button>
        </section>

        <section class="atp-exp-section" id="atp-exp-section-atrapados">
          <header class="atp-exp-section-head">
            <span class="atp-exp-section-icon atp-exp-section-icon-danger" aria-hidden="true">🚨</span>
            <div>
              <h2>Tickets de personas atrapadas</h2>
              <p class="atp-exp-danger-text">Máxima prioridad · respuesta inmediata</p>
            </div>
            <span class="atp-exp-severity atp-exp-severity-danger">CRÍTICO</span>
          </header>
          <div class="atp-exp-table-wrap">
            <table class="atp-exp-table">
              <thead><tr><th>Ticket</th><th>Proyecto</th><th>Tiempo abierto</th><th>Estado</th></tr></thead>
              <tbody data-atp-exp-table="atrapados"></tbody>
            </table>
          </div>
        </section>

        <section class="atp-exp-section" id="atp-exp-section-sin-llegada">
          <header class="atp-exp-section-head">
            <span class="atp-exp-section-icon atp-exp-section-icon-warning" aria-hidden="true">⏱️</span>
            <div>
              <h2>Sin reporte de llegada en más de 2 horas</h2>
              <p>Revisar asignación y seguimiento.</p>
            </div>
            <span class="atp-exp-section-symbol" aria-hidden="true">⚠️</span>
          </header>
          <div class="atp-exp-table-wrap">
            <table class="atp-exp-table">
              <thead><tr><th>Ticket</th><th>Proyecto</th><th>Tiempo abierto</th><th>Seguimiento</th></tr></thead>
              <tbody data-atp-exp-table="sin_llegada"></tbody>
            </table>
          </div>
        </section>

        <section class="atp-exp-section" id="atp-exp-section-reincidentes">
          <header class="atp-exp-section-head">
            <span class="atp-exp-section-icon atp-exp-section-icon-critical" aria-hidden="true">💥</span>
            <div>
              <h2>Equipos críticos que volvieron a fallar</h2>
              <p>Requieren revisión especial.</p>
            </div>
            <span class="atp-exp-section-symbol" aria-hidden="true">⚠️</span>
          </header>
          <div class="atp-exp-table-wrap">
            <table class="atp-exp-table">
              <thead><tr><th>Ticket</th><th>Proyecto</th><th>Reincidencia</th><th>Clasificación</th></tr></thead>
              <tbody data-atp-exp-table="criticos_reincidentes"></tbody>
            </table>
          </div>
        </section>
      </div>`;
    root.dataset.experimentalReady = '1';
    return true;
  }

  function setFeedback_exp(type, message){
    const root = root_exp();
    const box = root && root.querySelector('[data-atp-exp-feedback]');
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
    root.classList.toggle('atp-exp-is-loading', state_exp.loading);
    const refresh = root.querySelector('[data-atp-exp-refresh]');
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
      return `<button type="button" class="atp-exp-chip${active ? ' active' : ''}" data-atp-exp-filter-kind="${kind}" data-atp-exp-filter-value="${escapeHtml_exp(value)}" aria-pressed="${active}">${escapeHtml_exp(value || allLabel)}</button>`;
    }).join('');
  }

  function renderPeriodo_exp(){
    const root = root_exp();
    if (!root) return;
    root.querySelectorAll('[data-atp-exp-periodo]').forEach(function(button){
      const active = button.dataset.atpExpPeriodo === state_exp.periodo;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function renderFilters_exp(){
    const root = root_exp();
    if (!root) return;
    renderPeriodo_exp();
    renderChips_exp(root.querySelector('[data-atp-exp-estados]'), state_exp.filters.estados, state_exp.estado, 'estado');
    renderChips_exp(root.querySelector('[data-atp-exp-zonas]'), state_exp.filters.zonas, state_exp.zona, 'zona');
  }

  function ticketButton_exp(row, className){
    const ticket = safeText_exp(row.ticket);
    return `<button type="button" class="atp-exp-ticket-link ${className || ''}" data-ticket="${escapeHtml_exp(ticket)}">${escapeHtml_exp(ticket)}</button>`;
  }

  function emptyRow_exp(message){
    return `<tr class="atp-exp-empty-row"><td colspan="4">${escapeHtml_exp(message)}</td></tr>`;
  }

  function renderAtrapados_exp(rows){
    const body = root_exp() && root_exp().querySelector('[data-atp-exp-table="atrapados"]');
    if (!body) return;
    if (!rows.length) {
      body.innerHTML = emptyRow_exp('Sin tickets de atrapados');
      return;
    }
    body.innerHTML = rows.map(function(row){
      return `<tr data-ticket-row="${escapeHtml_exp(row.ticket)}">
        <td data-label="Ticket">${ticketButton_exp(row, 'atp-exp-ticket-danger')}</td>
        <td data-label="Proyecto">${escapeHtml_exp(safeText_exp(row.proyecto))}</td>
        <td data-label="Tiempo abierto"><strong class="atp-exp-time-danger">${escapeHtml_exp(formatElapsed_exp(row.minutos_abierto, false))}</strong></td>
        <td data-label="Estado"><span class="atp-exp-status ${statusClass_exp(row.estado_ticket)}">${escapeHtml_exp(safeText_exp(row.estado_ticket))}</span></td>
      </tr>`;
    }).join('');
  }

  function renderSinLlegada_exp(rows){
    const body = root_exp() && root_exp().querySelector('[data-atp-exp-table="sin_llegada"]');
    if (!body) return;
    if (!rows.length) {
      body.innerHTML = emptyRow_exp('Sin tickets pendientes de llegada');
      return;
    }
    body.innerHTML = rows.map(function(row){
      return `<tr data-ticket-row="${escapeHtml_exp(row.ticket)}">
        <td data-label="Ticket">${ticketButton_exp(row, 'atp-exp-ticket-warning')}</td>
        <td data-label="Proyecto">${escapeHtml_exp(safeText_exp(row.proyecto))}</td>
        <td data-label="Tiempo abierto"><strong class="atp-exp-time-warning">${escapeHtml_exp(formatElapsed_exp(row.minutos_abierto, true))}</strong></td>
        <td data-label="Seguimiento"><span class="atp-exp-status atp-exp-status-checkin">Sin check-in</span></td>
      </tr>`;
    }).join('');
  }

  function renderReincidentes_exp(rows){
    const body = root_exp() && root_exp().querySelector('[data-atp-exp-table="criticos_reincidentes"]');
    if (!body) return;
    if (!rows.length) {
      body.innerHTML = emptyRow_exp('Sin equipos críticos reincidentes activos');
      return;
    }
    body.innerHTML = rows.map(function(row){
      return `<tr data-ticket-row="${escapeHtml_exp(row.ticket)}">
        <td data-label="Ticket">${ticketButton_exp(row, 'atp-exp-ticket-critical')}</td>
        <td data-label="Proyecto">${escapeHtml_exp(safeText_exp(row.proyecto))}</td>
        <td data-label="Reincidencia"><strong class="atp-exp-recurrence">${escapeHtml_exp(safeText_exp(row.reincidencia))}</strong></td>
        <td data-label="Clasificación"><span class="atp-exp-status atp-exp-status-critical">Crítico</span></td>
      </tr>`;
    }).join('');
  }

  function renderData_exp(){
    const root = root_exp();
    if (!root) return;
    Object.keys(state_exp.counts).forEach(function(key){
      const target = root.querySelector('[data-atp-exp-count="' + key + '"]');
      if (target) target.textContent = Number(state_exp.counts[key] || 0).toLocaleString('es-MX');
    });
    renderAtrapados_exp(state_exp.data.atrapados || []);
    renderSinLlegada_exp(state_exp.data.sin_llegada || []);
    renderReincidentes_exp(state_exp.data.criticos_reincidentes || []);
    const updated = root.querySelector('[data-atp-exp-updated]');
    if (updated) {
      const text = formatUpdated_exp(state_exp.generatedAt);
      updated.textContent = text ? 'Actualizado ' + text : '';
    }
  }

  function openTicket_exp(ticket){
    const value = String(ticket || '').trim();
    if (!value) return;
    if (window.ManttoDetails && typeof window.ManttoDetails.openTicket === 'function') {
      window.ManttoDetails.openTicket(value);
      return;
    }
    if (window.ManttoRouter && typeof window.ManttoRouter.go === 'function') {
      window.ManttoRouter.go('detalle', {type:'ticket', id:value});
    }
  }

  function bind_exp(){
    const root = root_exp();
    if (!root || root.dataset.atpExpBound === '1') return;
    root.dataset.atpExpBound = '1';

    root.addEventListener('click', function(event){
      const refresh = event.target.closest('[data-atp-exp-refresh]');
      if (refresh) {
        event.preventDefault();
        load_exp(true);
        return;
      }

      const periodo = event.target.closest('[data-atp-exp-periodo]');
      if (periodo) {
        event.preventDefault();
        state_exp.periodo = periodo.dataset.atpExpPeriodo === 'todos' ? 'todos' : 'dia';
        renderPeriodo_exp();
        load_exp(true);
        return;
      }

      const chip = event.target.closest('[data-atp-exp-filter-kind]');
      if (chip) {
        event.preventDefault();
        const kind = chip.dataset.atpExpFilterKind;
        const value = chip.dataset.atpExpFilterValue || '';
        if (kind === 'estado') state_exp.estado = value;
        if (kind === 'zona') state_exp.zona = value;
        renderFilters_exp();
        load_exp(true);
        return;
      }

      const scroller = event.target.closest('[data-atp-exp-scroll]');
      if (scroller) {
        event.preventDefault();
        const id = 'atp-exp-section-' + scroller.dataset.atpExpScroll;
        const section = document.getElementById(id);
        if (section) section.scrollIntoView({behavior:'smooth', block:'start'});
        return;
      }

      const ticketLink = event.target.closest('[data-ticket]');
      if (ticketLink && root.contains(ticketLink)) {
        event.preventDefault();
        event.stopPropagation();
        openTicket_exp(ticketLink.getAttribute('data-ticket'));
        return;
      }

      const row = event.target.closest('[data-ticket-row]');
      if (row && root.contains(row)) {
        event.preventDefault();
        openTicket_exp(row.dataset.ticketRow);
      }
    });
  }

  async function request_exp(){
    const params = new URLSearchParams();
    if (state_exp.estado) params.set('estado', state_exp.estado);
    if (state_exp.zona) params.set('zona', state_exp.zona);
    params.set('periodo', state_exp.periodo === 'todos' ? 'todos' : 'dia');
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
    setFeedback_exp('loading', 'Actualizando alertas prioritarias...');

    try {
      const payload = await request_exp();
      if (requestId !== state_exp.requestId) return;
      state_exp.periodo = payload.period === 'todos' ? 'todos' : 'dia';
      state_exp.filters = payload.filters || {estados:[],zonas:[]};
      state_exp.counts = payload.counts || {atrapados:0,sin_llegada:0,criticos_reincidentes:0};
      state_exp.data = payload.data || {atrapados:[],sin_llegada:[],criticos_reincidentes:[]};
      state_exp.criteria = payload.criteria || null;
      state_exp.generatedAt = payload.generated_at || new Date().toISOString();
      renderFilters_exp();
      renderData_exp();
      setFeedback_exp('', '');
    } catch (error) {
      if (error && error.name === 'AbortError') return;
      if (requestId !== state_exp.requestId) return;
      setFeedback_exp('error', error && error.message ? error.message : 'No fue posible consultar las alertas prioritarias.');
      state_exp.counts = {atrapados:0,sin_llegada:0,criticos_reincidentes:0};
      state_exp.data = {atrapados:[],sin_llegada:[],criticos_reincidentes:[]};
      renderData_exp();
    } finally {
      if (requestId === state_exp.requestId) setLoading_exp(false);
    }
  }

  function init_exp(){
    if (!root_exp()) return false;
    if (!root_exp().querySelector('[data-atp-exp-root]')) renderLayout_exp();
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

  window.ManttoAtencionPrioritaria_exp = {
    init:init_exp,
    refresh:refresh_exp
  };
})();

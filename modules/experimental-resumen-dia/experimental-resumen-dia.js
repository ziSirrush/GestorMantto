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
    supervisor:'',
    filters:{estados:[],zonas:[],supervisores:[],disponibilidad:{}},
    promedios:null,
    period:{today:null,yesterday:null},
    today:null,
    yesterday:null,
    tickets:[],
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
    if(window.ManttoHumanTime && typeof window.ManttoHumanTime.formatMexicoCityDateTime === 'function'){
      return window.ManttoHumanTime.formatMexicoCityDateTime(date);
    }
    return new Intl.DateTimeFormat('es-MX', {
      timeZone:'America/Mexico_City', day:'2-digit', month:'2-digit', year:'numeric',
      hour:'2-digit', minute:'2-digit', hourCycle:'h23'
    }).format(date).replace(',', ' -');
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
            <p class="rdx-exp-description">Resumen ejecutivo diario frente al promedio del mes y del año en curso.</p>
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
          <div class="rdx-exp-filter-row">
            <span class="rdx-exp-filter-label">Supervisor</span>
            <div class="rdx-exp-chips" data-rdx-exp-supervisores></div>
          </div>
          <p class="rdx-exp-filter-note">Se habilitan las opciones con tickets reportados hoy dentro de tu alcance.</p>
        </section>

        <div class="rdx-exp-feedback" data-rdx-exp-feedback hidden></div>

        <section class="rdx-exp-grid">
          <article class="rdx-exp-card rdx-exp-card-total" data-rdx-exp-drill="todos" style="cursor:pointer">
            <header><span class="rdx-exp-card-icon">🎟️</span><h2>Tickets del día</h2></header>
            <strong class="rdx-exp-big" data-rdx-exp="total">0</strong>
            <p>reportados hoy</p>
            <div class="rdx-exp-averages" aria-label="Comparación de tickets por día">
              <div><small>Promedio mensual</small><strong data-rdx-exp="promedio_mes">—</strong><span data-rdx-exp="delta_mes"></span></div>
              <div><small>Promedio anual</small><strong data-rdx-exp="promedio_anio">—</strong><span data-rdx-exp="delta_anio"></span></div>
            </div>
            <p>Días completos del mes y año actuales, incluidos los días sin tickets.</p>
          </article>

          <article class="rdx-exp-card">
            <header><span class="rdx-exp-card-icon">📋</span><h2>Estado de tickets</h2></header>
            <div class="rdx-exp-status-grid">
              <div data-rdx-exp-drill="Abierto" style="cursor:pointer"><span class="rdx-exp-dot rdx-exp-dot-open"></span><small>Abiertos</small><strong data-rdx-exp="abiertos">0</strong></div>
              <div data-rdx-exp-drill="Cerrado" style="cursor:pointer"><span class="rdx-exp-dot rdx-exp-dot-closed"></span><small>Cerrados</small><strong data-rdx-exp="cerrados">0</strong></div>
              <div data-rdx-exp-drill="En curso" style="cursor:pointer"><span class="rdx-exp-dot rdx-exp-dot-progress"></span><small>En curso</small><strong data-rdx-exp="en_curso">0</strong></div>
            </div>
            <div class="rdx-exp-progress" aria-label="Distribución de estados">
              <span class="rdx-exp-progress-open" data-rdx-exp-bar="abiertos" data-rdx-exp-drill="Abierto" role="button" tabindex="0" aria-label="Ver tickets Abierto"></span>
              <span class="rdx-exp-progress-closed" data-rdx-exp-bar="cerrados" data-rdx-exp-drill="Cerrado" role="button" tabindex="0" aria-label="Ver tickets Cerrado"></span>
              <span class="rdx-exp-progress-current" data-rdx-exp-bar="en_curso" data-rdx-exp-drill="En curso" role="button" tabindex="0" aria-label="Ver tickets En curso"></span>
            </div>
            <div class="rdx-exp-pct-grid">
              <span data-rdx-exp-pct="abiertos" data-rdx-exp-drill="Abierto" role="button" tabindex="0" aria-label="Ver tickets Abierto">0%</span>
              <span data-rdx-exp-pct="cerrados" data-rdx-exp-drill="Cerrado" role="button" tabindex="0" aria-label="Ver tickets Cerrado">0%</span>
              <span data-rdx-exp-pct="en_curso" data-rdx-exp-drill="En curso" role="button" tabindex="0" aria-label="Ver tickets En curso">0%</span>
            </div>
          </article>

          <article class="rdx-exp-card" data-rdx-exp-drill="conLlegada" style="cursor:pointer">
            <header><span class="rdx-exp-card-icon">⏱️</span><h2>Promedio tiempo de llegada</h2></header>
            <strong class="rdx-exp-big" data-rdx-exp="promedio_llegada">—</strong>
            <p>promedio del día</p>
          </article>

          <article class="rdx-exp-card">
            <header><span class="rdx-exp-card-icon">✅</span><h2>Cierre del día</h2></header>
            <div class="rdx-exp-dual">
              <div class="rdx-exp-dual-good" data-rdx-exp-drill="Funcionando" style="cursor:pointer"><small>Funcionando</small><strong data-rdx-exp="funcionando">0</strong></div>
              <div class="rdx-exp-dual-bad" data-rdx-exp-drill="NoFuncionando" style="cursor:pointer"><small>No funcionando</small><strong data-rdx-exp="no_funcionando">0</strong></div>
            </div>
            <div class="rdx-exp-summary-good" data-rdx-exp="porcentaje_funcionando">—</div>
          </article>

          <article class="rdx-exp-card">
            <header><span class="rdx-exp-card-icon">👥</span><h2>Responsabilidad</h2></header>
            <div class="rdx-exp-responsibility">
              <div data-rdx-exp-drill="BLT" style="cursor:pointer"><small>BLT</small><strong data-rdx-exp="blt">0</strong><span data-rdx-exp-pct="blt">0%</span></div>
              <div data-rdx-exp-drill="CLIENTE" style="cursor:pointer"><small>Cliente</small><strong data-rdx-exp="cliente">0</strong><span data-rdx-exp-pct="cliente">0%</span></div>
            </div>
            <div class="rdx-exp-progress rdx-exp-progress-responsibility">
              <span class="rdx-exp-progress-blt" data-rdx-exp-bar="blt" data-rdx-exp-drill="BLT" role="button" tabindex="0" aria-label="Ver tickets BLT"></span>
              <span class="rdx-exp-progress-client" data-rdx-exp-bar="cliente" data-rdx-exp-drill="CLIENTE" role="button" tabindex="0" aria-label="Ver tickets CLIENTE"></span>
            </div>
          </article>

          <article class="rdx-exp-card" data-rdx-exp-drill="parados" style="cursor:pointer">
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

  function renderChips_exp(container, items, enabledItems, selected, kind){
    if (!container) return;
    const allLabel = kind === 'zona' ? 'Todas' : 'Todos';
    const values = [''].concat(Array.isArray(items) ? items : []);
    const enabled = new Set(Array.isArray(enabledItems) ? enabledItems : []);
    // Permitir siempre limpiar la selección, incluso si no hay tickets.
    container.innerHTML = values.map(function(value){
      const active = value === selected;
      const disabled = value !== '' && !enabled.has(value);
      return '<button type="button" class="rdx-exp-chip'+(active?' active':'')+
        '" data-rdx-exp-filter-kind="'+kind+'" data-rdx-exp-filter-value="'+escapeHtml_exp(value)+
        '" aria-pressed="'+active+'"'+(disabled?' disabled aria-disabled="true" title="Sin tickets hoy"':'')+
        '>'+escapeHtml_exp(value || allLabel)+'</button>';
    }).join('');
  }

  function renderFilters_exp(){
    const root = root_exp();
    if (!root) return;
    const available = state_exp.filters.disponibilidad || {};
    renderChips_exp(root.querySelector('[data-rdx-exp-estados]'), state_exp.filters.estados, available.estados, state_exp.estado, 'estado');
    renderChips_exp(root.querySelector('[data-rdx-exp-zonas]'), state_exp.filters.zonas, available.zonas, state_exp.zona, 'zona');
    renderChips_exp(root.querySelector('[data-rdx-exp-supervisores]'), state_exp.filters.supervisores, available.supervisores, state_exp.supervisor, 'supervisor');
  }

  function renderAverage_exp(key, period, total){
    const valid = period && period.promedio != null && Number.isFinite(Number(period.promedio));
    const format = value => Number(value).toLocaleString('es-MX',{maximumFractionDigits:2});
    setText_exp('promedio_'+key, valid ? format(period.promedio)+' / día' : '—');
    if(!valid || total == null){
      setText_exp('delta_'+key, period && period.dias === 0 ? 'Sin días completos' : '');
      return;
    }
    const delta = Math.round((Number(total)-Number(period.promedio))*100)/100;
    setText_exp('delta_'+key,(delta>0?'+':'')+format(delta)+' hoy vs. promedio');
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
    renderAverage_exp('mes', state_exp.promedios && state_exp.promedios.mes, state_exp.today && state_exp.today.total);
    renderAverage_exp('anio', state_exp.promedios && state_exp.promedios.anio, state_exp.today && state_exp.today.total);
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

  function openReference_exp(type, reference){
    const value = String(reference || '').trim();
    if (!value) return;
    closeDrill_exp();
    const methods = {ticket:'openTicket',proyecto:'openProyecto',equipo:'openEquipo'};
    const details = window.ManttoDetails;
    if (details && typeof details[methods[type]] === 'function') {
      details[methods[type]](value);
    } else if (window.ManttoRouter && typeof window.ManttoRouter.go === 'function') {
      window.ManttoRouter.go('detalle', {type,id:value});
    }
  }

  function closeDrill_exp(){
    const modal = document.getElementById('rdx-exp-drill-modal');
    if (modal) modal.remove();
  }

  function drillRows_exp(type){
    const tickets = Array.isArray(state_exp.tickets) ? state_exp.tickets : [];
    if (type === 'todos') return tickets;
    const statuses = {'Abierto':'abierto','En curso':'en_curso','Cerrado':'cerrado'};
    if (statuses[type]) return tickets.filter(t => t.estado_ticket_normalizado === statuses[type]);
    if (type === 'parados') return tickets.filter(t => t.codigo_equipo && t.estado_ticket_normalizado !== 'cerrado');
    if (type === 'Funcionando' || type === 'NoFuncionando') {
      return tickets.filter(t => t.estado_ticket_normalizado === 'cerrado' &&
        t.estatus_final_normalizado === (type === 'Funcionando' ? 'funcionando' : 'no_funcionando'));
    }
    if (type === 'conLlegada') return tickets.filter(t => t.llegada_valida === true);
    if (type === 'BLT' || type === 'CLIENTE') return tickets.filter(t => t.responsabilidad_normalizada === type.toLowerCase());
    return [];
  }

  function drillTitle_exp(type){
    const titles={todos:'Tickets del día',Abierto:'Tickets Abiertos','En curso':'Tickets En curso',Cerrado:'Tickets Cerrados',Funcionando:'Cierre: Funcionando',NoFuncionando:'Cierre: No Funcionando',BLT:'Responsabilidad BLT',CLIENTE:'Responsabilidad Cliente',conLlegada:'Tickets con llegada registrada',parados:'Equipos parados'};
    return titles[type] || 'Tickets';
  }

  // Mismo contrato de 18 columnas que el listado contextual de Operación.
  const TICKETS_CONTEXTUAL_UNI_HEADERS = ['No. Ticket','Proyecto','Equipo','Estado','Fecha Reporte','Hora Reporte','Asunto','Estatus inicial','Fecha Llegada','Hora Llegada','T. llegada','Fecha Solución','Hora Solución','Estatus final','Causa','Acción cierre','Responsabilidad','Causa de falla'];
  function drillTable_exp(rows){
    const cell = value => '<td>'+escapeHtml_exp(value == null || value === '' ? '—' : value)+'</td>';
    const link = (type, value, label) => {
      if(!value) return cell('');
      return '<td><button type="button" class="rdx-exp-drill-link" data-rdx-exp-reference="'+type+'" data-rdx-exp-value="'+escapeHtml_exp(value)+'">'+escapeHtml_exp(label || value)+'</button></td>';
    };
    const hours = value => value == null || !Number.isFinite(Number(value)) ? '—' : Number(value).toLocaleString('es-MX',{maximumFractionDigits:2})+' h';
    return '<table class="rdx-exp-drill-table"><thead><tr>'+TICKETS_CONTEXTUAL_UNI_HEADERS.map(h=>'<th scope="col">'+escapeHtml_exp(h)+'</th>').join('')+
      '</tr></thead><tbody>'+(rows.length ? rows.map(r=>{
        const project = window.ManttoFormat && window.ManttoFormat.projectName ? window.ManttoFormat.projectName(r.proyecto) : r.proyecto;
        return '<tr>'+link('ticket',r.ticket)+link('proyecto',r.proyecto,project)+link('equipo',r.codigo_equipo)+
          [r.estado,formatDate_exp(r.fecha_reporte),r.h_reporte,r.descripcion,r.estatus_equipo_ir,
           formatDate_exp(r.fecha_llegada),r.h_llegada,hours(r.tiempo_llegada),formatDate_exp(r.fecha_cierre),
           r.h_solucion,r.estatus_equipo_final,r.causa,r.accion_en_cierre,r.responsabilidad,r.causa_falla].map(cell).join('')+'</tr>';
      }).join('') : '<tr><td colspan="18">Sin tickets para este indicador.</td></tr>')+'</tbody></table>';
  }

  function openDrill_exp(type){
    if (state_exp.loading || !state_exp.today) return;
    closeDrill_exp();
    const rows=drillRows_exp(type);
    const overlay=document.createElement('div');
    overlay.id='rdx-exp-drill-modal';
    overlay.className='rdx-exp-drill-overlay';
    overlay.innerHTML='<div class="rdx-exp-drill-dialog" role="dialog" aria-modal="true" aria-label="'+escapeHtml_exp(drillTitle_exp(type))+'">'+
      '<header><div><strong>'+escapeHtml_exp(drillTitle_exp(type))+'</strong><small>'+rows.length+' tickets</small></div>'+
      '<button type="button" data-rdx-exp-close aria-label="Cerrar">×</button></header>'+
      '<div class="rdx-exp-drill-scroll">'+drillTable_exp(rows)+'</div></div>';
    document.body.appendChild(overlay);
    const close=overlay.querySelector('[data-rdx-exp-close]');
    if(close)close.focus();
  }

  function bind_exp(){
    const root = root_exp();
    if (!root || root.dataset.rdxExpBound === '1') return;
    root.dataset.rdxExpBound = '1';
    document.addEventListener('click', function(event){
      const modal = document.getElementById('rdx-exp-drill-modal');
      if (!modal || !modal.contains(event.target)) return;
      if (event.target === modal || event.target.closest('[data-rdx-exp-close]')) {
        closeDrill_exp();
        return;
      }
      const link = event.target.closest('[data-rdx-exp-reference]');
      if (link) {
        event.preventDefault();
        openReference_exp(link.dataset.rdxExpReference,link.dataset.rdxExpValue);
      }
    });
    document.addEventListener('keydown',function(event){
      if(event.key === 'Escape') closeDrill_exp();
    });
    root.addEventListener('keydown',function(event){
      const target = event.target.closest('[data-rdx-exp-drill][role="button"]');
      if(target && (event.key === 'Enter' || event.key === ' ')){
        event.preventDefault();
        openDrill_exp(target.dataset.rdxExpDrill);
      }
    });
    root.addEventListener('click', function(event){
      const drill = event.target.closest('[data-rdx-exp-drill]');
      if (drill) {
        event.preventDefault();
        openDrill_exp(drill.dataset.rdxExpDrill);
        return;
      }

      const refresh = event.target.closest('[data-rdx-exp-refresh]');
      if (refresh) {
        event.preventDefault();
        load_exp(true);
        return;
      }
      const chip = event.target.closest('[data-rdx-exp-filter-kind]');
      if (!chip || chip.disabled) return;
      event.preventDefault();
      const kind = chip.dataset.rdxExpFilterKind;
      const value = chip.dataset.rdxExpFilterValue || '';
      if (kind === 'estado') state_exp.estado = value;
      if (kind === 'zona') state_exp.zona = value;
      if (kind === 'supervisor') state_exp.supervisor = value;
      renderFilters_exp();
      load_exp(true);
    });
  }

  async function request_exp(){
    const params = new URLSearchParams();
    if (state_exp.estado) params.set('estado', state_exp.estado);
    if (state_exp.zona) params.set('zona', state_exp.zona);
    if (state_exp.supervisor) params.set('supervisor', state_exp.supervisor);
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
    closeDrill_exp();
    setLoading_exp(true);
    setFeedback_exp('loading', 'Actualizando resumen del día...');
    try {
      const payload = await request_exp();
      if (requestId !== state_exp.requestId) return;
      // Evitar presentar un filtro nuevo como efectivo durante un despliegue
      // escalonado si la API aún entrega el contrato anterior.
      if(!payload.promedios || !payload.filters || !payload.filters.disponibilidad ||
          !Array.isArray(payload.filters.supervisores)){
        throw new Error('Resumen del día: API aún no compatible con los nuevos filtros. Actualiza nuevamente.');
      }
      state_exp.filters = payload.filters;
      state_exp.promedios = payload.promedios;
      // Si el catálogo cambió, mantener seleccionable la opción de limpiar.
      for(const [kind,field] of [['estado','estados'],['zona','zonas'],['supervisor','supervisores']]){
        if(state_exp[kind] && !state_exp.filters[field].includes(state_exp[kind])) {
          state_exp.filters[field] = state_exp.filters[field].concat(state_exp[kind]);
        }
      }
      state_exp.period = payload.period || {today:null,yesterday:null};
      state_exp.today = payload.today || null;
      state_exp.yesterday = payload.yesterday || null;
      state_exp.tickets = Array.isArray(payload.tickets) ? payload.tickets : [];
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
      state_exp.promedios = null;
      state_exp.tickets = [];
      state_exp.comparisons = {tickets:0,equipos_parados:0,no_funcionando:0};
      renderData_exp();
      setFeedback_exp('error', error && error.message ? error.message : 'No fue posible consultar el resumen del día.');
    } finally {
      if (requestId === state_exp.requestId) setLoading_exp(false);
    }
  }

  function resetContext_exp(){
    if(state_exp.controller) state_exp.controller.abort();
    state_exp.requestId++;
    Object.assign(state_exp,{initialized:false,loading:false,controller:null,estado:'',zona:'',supervisor:'',
      filters:{estados:[],zonas:[],supervisores:[],disponibilidad:{}},period:{today:null,yesterday:null},
      today:null,yesterday:null,tickets:[],promedios:null,generatedAt:null,
      comparisons:{tickets:0,equipos_parados:0,no_funcionando:0}});
    closeDrill_exp();
    setLoading_exp(false);
    renderFilters_exp();
    renderData_exp();
    setFeedback_exp('','');
  }

  document.addEventListener('mantto:view-user-changed',resetContext_exp);
  document.addEventListener('mantto:logout',resetContext_exp);
  document.addEventListener('mantto:auth-ready',resetContext_exp);
  document.addEventListener('mantto:permissions-updated',function(){
    resetContext_exp();
    if(window.ManttoRouter?.getCurrent?.().route === ROUTE_EXP &&
        window.ManttoPermissions?.canNavigate?.(ROUTE_EXP) === true) init_exp();
  });

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

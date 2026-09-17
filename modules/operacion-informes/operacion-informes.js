// [Aster | 2026-09-17 | ASTER-MG | FASE 4 INFORMES PDF QA V001]
(function(){
  'use strict';

  const API = () => (window.MANTTO_API_BASE || 'http://localhost:3001').replace(/\/$/, '');
  const FILTER_IDS = Object.freeze([
    'inf-f-superintendente','inf-f-supervisor','inf-f-estado',
    'inf-f-zona','inf-f-proyecto','inf-f-equipo'
  ]);
  const FILTER_MAP = Object.freeze({
    superintendente:'inf-f-superintendente',
    supervisor:'inf-f-supervisor',
    estado:'inf-f-estado',
    zona:'inf-f-zona',
    proyecto:'inf-f-proyecto',
    equipo:'inf-f-equipo'
  });

  const state = {
    loaded:false,
    bound:false,
    opciones:{ superintendentes:[], supervisores:[], estados:[], zonas:[], proyectos:[], equipos:[] },
    ultimoInforme:null,
    mtbcVentana:'anio',
    refreshTimer:null,
    requestSequence:0,
    mtbcSequence:0,
    mtbcBusy:false,
    pdfBusy:false,
    bootstrapBusy:false
  };

  const INF_HTML = `
    <div class="inf-page">
      <section class="inf-card inf-head">
        <div>
          <p class="inf-eyebrow">Operación · Informes</p>
          <h1>Informes</h1>
          <p>Alcance de Portafolio y actividad de Tickets. Los seis filtros son independientes y el informe se recalcula al cambiar cualquier selección.</p>
        </div>
        <div class="inf-head-note">Periodo aplicado solo a Tickets</div>
      </section>

      <section class="inf-card inf-filter-card">
        <div class="inf-filter-heading">
          <div>
            <h2>Periodo y alcance</h2>
            <p>Deja un selector vacío para incluir todo lo permitido por tu alcance de información.</p>
          </div>
          <span class="inf-live-badge"><span></span>Recálculo automático</span>
        </div>
        <div class="inf-filters">
          <label>Fecha inicio<input type="date" id="inf-fecha-inicio"></label>
          <label>Fecha final<input type="date" id="inf-fecha-fin"></label>
          <label>Superintendente<select id="inf-f-superintendente" multiple></select></label>
          <label>Supervisor<select id="inf-f-supervisor" multiple></select></label>
          <label>Estado<select id="inf-f-estado" multiple></select></label>
          <label>Zona<select id="inf-f-zona" multiple></select></label>
          <label>Proyecto<select id="inf-f-proyecto" multiple></select></label>
          <label>Equipo<select id="inf-f-equipo" multiple></select></label>
        </div>
        <div class="inf-actions">
          <button type="button" class="inf-btn inf-btn-primary" id="inf-generar">Actualizar ahora</button>
          <button type="button" class="inf-btn inf-btn-soft" id="inf-limpiar">Limpiar filtros</button>
          <button type="button" class="inf-btn inf-btn-soft" id="inf-pdf" disabled>Exportar PDF</button>
          <span class="inf-action-status" id="inf-action-status" aria-live="polite"></span>
        </div>
      </section>

      <div id="inf-resultado"><div class="inf-status">Cargando opciones del alcance...</div></div>
    </div>`;

  function $(id){ return document.getElementById(id); }
  function esc(value){
    return String(value === null || value === undefined || value === '' ? '—' : value)
      .replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  }
  function n0(value){
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }
  function n1(value){
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(number * 10) / 10 : null;
  }
  function h1(value){
    const number = n1(value);
    return number === null ? '—' : `${number} h`;
  }
  function d1(value){
    const number = n1(value);
    return number === null ? '—' : String(number);
  }

  function mexicoCityIsoToday(){
    try{
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone:'America/Mexico_City', year:'numeric', month:'2-digit', day:'2-digit'
      }).formatToParts(new Date()).reduce((acc, part) => {
        if(part.type !== 'literal') acc[part.type] = part.value;
        return acc;
      }, {});
      return `${parts.year}-${parts.month}-${parts.day}`;
    }catch(_error){
      return new Date().toISOString().slice(0,10);
    }
  }

  function shiftIsoMonths(value, months){
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!match) return value;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const target = new Date(Date.UTC(year, month - 1 + Number(months || 0), 1));
    const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(day, lastDay));
    return target.toISOString().slice(0,10);
  }

  function todayIso(){ return mexicoCityIsoToday(); }
  function monthsAgoIso(months){ return shiftIsoMonths(todayIso(), -Math.abs(Number(months || 0))); }

  function formatDate(value){
    if(value === null || value === undefined || value === '') return '—';
    const text = String(value).trim();
    let match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(match) return `${match[3]}/${match[2]}/${match[1]}`;
    match = text.match(/^(\d{2})[/-](\d{2})[/-](\d{4})/);
    if(match) return `${match[1]}/${match[2]}/${match[3]}`;
    return text;
  }

  function formatMonth(value){
    const text = String(value || '').trim();
    const match = text.match(/^(\d{4})-(\d{2})$/);
    return match ? `${match[2]}/${match[1]}` : (text || '—');
  }

  function formatMexicoCityDateTime(value){
    const date = value instanceof Date ? value : new Date(value || Date.now());
    if(Number.isNaN(date.getTime())) return '—';
    try{
      return new Intl.DateTimeFormat('es-MX', {
        timeZone:'America/Mexico_City', day:'2-digit', month:'2-digit', year:'numeric',
        hour:'2-digit', minute:'2-digit', hourCycle:'h23'
      }).format(date);
    }catch(_error){
      return date.toISOString().slice(0,16).replace('T',' ');
    }
  }

  function statusFromError(error){
    const status = Number(error && (error.status || error.statusCode) || 0);
    if(status === 401) return { title:'Sesión no válida', message:'Inicia sesión nuevamente para consultar Informes.' };
    if(status === 403) return { title:'Acceso no autorizado', message:'Tu usuario no tiene el permiso requerido para consultar Operación · Informes.' };
    return { title:'No fue posible actualizar Informes', message:error && error.message ? error.message : 'Ocurrió un error consultando el backend.' };
  }

  function renderStatePanel(kind, title, message, retryAction){
    const retry = retryAction
      ? `<button type="button" class="inf-btn inf-btn-primary inf-retry-btn" data-inf-retry="${esc(retryAction)}">Reintentar</button>`
      : '';
    return `<div class="inf-state-panel inf-state-${esc(kind || 'info')}">
      <div class="inf-state-icon" aria-hidden="true">${kind === 'error' ? '!' : kind === 'empty' ? '0' : 'i'}</div>
      <div class="inf-state-copy"><h3>${esc(title)}</h3><p>${esc(message)}</p>${retry}</div>
    </div>`;
  }

  function setRefreshWarning(message){
    const result = $('inf-resultado');
    if(!result) return;
    let warning = result.querySelector('#inf-refresh-warning');
    if(!warning){
      warning = document.createElement('div');
      warning.id = 'inf-refresh-warning';
      warning.className = 'inf-refresh-warning';
      result.prepend(warning);
    }
    warning.textContent = message || '';
  }

  function clearRefreshWarning(){
    $('inf-refresh-warning')?.remove();
  }

  function setPdfBusy(busy){
    state.pdfBusy = Boolean(busy);
    const button = $('inf-pdf');
    if(!button) return;
    button.disabled = state.pdfBusy || !state.ultimoInforme;
    button.textContent = state.pdfBusy ? 'Generando PDF...' : 'Exportar PDF';
  }

  function setActionStatus(text, type){
    const el = $('inf-action-status');
    if(!el) return;
    el.textContent = text || '';
    el.className = `inf-action-status${type ? ` ${type}` : ''}`;
  }

  async function requestJson(path, options){
    const opts = Object.assign({ method:'GET' }, options || {});
    if(window.ManttoAuth && typeof window.ManttoAuth.api === 'function'){
      return window.ManttoAuth.api(path, opts);
    }
    const headers = Object.assign({ 'Accept':'application/json', 'Content-Type':'application/json' }, opts.headers || {});
    if(window.ManttoAuth && typeof window.ManttoAuth.authHeaders === 'function'){
      Object.assign(headers, window.ManttoAuth.authHeaders());
    }
    const response = await fetch(API()+path, Object.assign({}, opts, { headers }));
    const data = await response.json().catch(()=>({ ok:false, message:'Respuesta inválida del backend.' }));
    if(!response.ok || data.ok === false){
      const error = new Error(data.message || data.error || 'Error consultando backend.');
      error.status = response.status;
      error.payload = data;
      throw error;
    }
    return data;
  }
  async function fetchJson(path){ return requestJson(path, { method:'GET' }); }

  function selectedValues(id){
    const el = $(id);
    if(!el) return [];
    return Array.from(el.selectedOptions || []).map(option => option.value).filter(Boolean);
  }

  function selectedFilterState(){
    return Object.fromEntries(Object.entries(FILTER_MAP).map(([key,id]) => [key, selectedValues(id)]));
  }

  function fillSelect(id, values){
    const el = $(id);
    if(!el) return;
    const previous = new Set(selectedValues(id));
    el.innerHTML = (values || []).map(value => {
      const selected = previous.has(String(value)) ? ' selected' : '';
      return `<option value="${esc(value)}"${selected}>${esc(value)}</option>`;
    }).join('');
  }

  async function loadOpciones(){
    const data = await fetchJson('/api/informes/opciones');
    state.opciones = data.opciones || state.opciones;
    fillSelect('inf-f-superintendente', state.opciones.superintendentes);
    fillSelect('inf-f-supervisor', state.opciones.supervisores);
    fillSelect('inf-f-estado', state.opciones.estados);
    fillSelect('inf-f-zona', state.opciones.zonas);
    fillSelect('inf-f-proyecto', state.opciones.proyectos);
    fillSelect('inf-f-equipo', state.opciones.equipos);
  }

  function appendScopeFilters(params){
    Object.entries(FILTER_MAP).forEach(([key,id]) => {
      selectedValues(id).forEach(value => params.append(key, value));
    });
    return params;
  }

  function buildReportQuery(){
    const params = appendScopeFilters(new URLSearchParams());
    params.set('fecha_inicio', $('inf-fecha-inicio')?.value || monthsAgoIso(6));
    params.set('fecha_fin', $('inf-fecha-fin')?.value || todayIso());
    params.set('mtbc_ventana', state.mtbcVentana);
    return params.toString();
  }

  function buildMtbcQuery(){
    const params = appendScopeFilters(new URLSearchParams());
    params.set('mtbc_ventana', state.mtbcVentana);
    return params.toString();
  }

  function metricCard(label, value, extraClass){
    return `<div class="inf-scope-kpi${extraClass ? ` ${extraClass}` : ''}"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
  }

  function detailItem(label, value, dateValue){
    const rendered = dateValue ? formatDate(value) : (value === null || value === undefined || value === '' ? '—' : value);
    return `<div class="inf-detail-item"><span>${esc(label)}</span><strong>${esc(rendered)}</strong></div>`;
  }

  function renderScopeSummary(data){
    const summary = data.resumen_alcance || {};
    const detail = data.detalle_alcance || {};
    const filters = data.criterio?.filtros || selectedFilterState();

    if(detail.tipo === 'equipo' && detail.data){
      const row = detail.data;
      return `
        <section class="inf-card inf-scope-card">
          <div class="inf-section-head"><div><p class="inf-eyebrow">Alcance específico</p><h2>Equipo ${esc(row.equipo)}</h2></div><span class="inf-badge inf-badge-info">1 equipo seleccionado</span></div>
          <div class="inf-detail-grid">
            ${detailItem('Referencia en sitio', row.referencia_en_sitio)}
            ${detailItem('Proyecto', row.proyecto)}
            ${detailItem('Ciudad', row.ciudad)}
            ${detailItem('Estado', row.estado)}
            ${detailItem('Zona operativa', row.zona)}
            ${detailItem('Superintendente', row.superintendente)}
            ${detailItem('Supervisor', row.supervisor)}
            ${detailItem('Dirección', row.direccion)}
            ${detailItem('Estatus de servicio', row.estatus_servicio)}
            ${detailItem('Fecha instalación', row.fecha_instalacion, true)}
            ${detailItem('Fecha entrega', row.fecha_entrega, true)}
            ${detailItem('Término garantía', row.termino_garantia, true)}
            ${detailItem('Recepción mantenimiento', row.fecha_recepcion_mantenimiento, true)}
            ${detailItem('Mes inicio gratuitos', row.mes_inicio_gratuitos)}
            ${detailItem('Mes término gratuitos', row.mes_termino_gratuitos)}
            ${detailItem('Cobranza', detail.cobranza_pendiente_fuente ? 'Pendiente de definir fuente' : '—')}
          </div>
        </section>`;
    }

    if(detail.tipo === 'proyecto' && detail.data){
      const row = detail.data;
      return `
        <section class="inf-card inf-scope-card">
          <div class="inf-section-head"><div><p class="inf-eyebrow">Alcance específico</p><h2>${esc(row.proyecto)}</h2></div><span class="inf-badge inf-badge-info">${n0(row.equipos)} equipos</span></div>
          <div class="inf-detail-grid">
            ${detailItem('Ciudad', row.ciudad)}
            ${detailItem('Estado', row.estado)}
            ${detailItem('Zona operativa', row.zona)}
            ${detailItem('Superintendente', row.superintendente)}
            ${detailItem('Supervisor', row.supervisor)}
            ${detailItem('Dirección', row.direccion)}
            ${detailItem('Estatus de servicio', row.estatus_servicio)}
            ${detailItem('Cobranza', detail.cobranza_pendiente_fuente ? 'Pendiente de definir fuente' : '—')}
          </div>
        </section>`;
    }

    const cards = [];
    if(!(filters.supervisor || []).length) cards.push(metricCard('Supervisores', n0(summary.n_supervisores)));
    cards.push(metricCard('Zonas', n0(summary.n_zonas)));
    cards.push(metricCard('Estados', n0(summary.n_estados)));
    cards.push(metricCard('Proyectos', n0(summary.n_proyectos)));
    cards.push(metricCard('Equipos', n0(summary.equipos ?? summary.equipos_activos), 'primary'));

    return `
      <section class="inf-card inf-scope-card">
        <div class="inf-section-head"><div><p class="inf-eyebrow">Alcance actual</p><h2>Universo de Portafolio</h2></div><span class="inf-badge inf-badge-ok">Sin filtro de fecha</span></div>
        <div class="inf-scope-grid">${cards.join('')}</div>
      </section>`;
  }

  function barList(items, options){
    const opts = Object.assign({ labelKey:'causa', empty:'Sin datos en el periodo.' }, options || {});
    if(!items || !items.length) return `<div class="inf-empty">${esc(opts.empty)}</div>`;
    const total = items.reduce((sum,item) => sum + n0(item.total), 0) || 1;
    const max = Math.max(...items.map(item => n0(item.total)), 1);
    return items.map(item => {
      const value = n0(item.total);
      const percentage = item.porcentaje !== undefined && item.porcentaje !== null
        ? n1(item.porcentaje)
        : Math.round((value * 1000) / total) / 10;
      const width = Math.max(value > 0 ? 4 : 0, Math.round((value * 100) / max));
      return `
        <div class="inf-bar-row">
          <div class="inf-bar-labels"><span>${esc(item[opts.labelKey] || 'Sin dato')}</span><span>${value} · ${percentage}%</span></div>
          <div class="inf-bar-track"><div class="inf-bar-fill" style="width:${width}%"></div></div>
        </div>`;
    }).join('');
  }

  function listRows(items, rowBuilder, emptyText){
    if(!items || !items.length) return `<div class="inf-empty">${esc(emptyText || 'Sin registros.')}</div>`;
    return `<div class="inf-scroll-list">${items.map(rowBuilder).join('')}</div>`;
  }

  function renderPriorityList(items){
    if(!items || !items.length) return '<div class="inf-empty">Sin prioridad registrada en el periodo.</div>';
    return items.map(item => `<div class="inf-list-row"><span>${esc(item.prioridad)}</span><strong>${n0(item.total)}</strong></div>`).join('');
  }

  function renderTicketsSection(data){
    const tickets = data.tickets || {};
    const noActivity = n0(tickets.total) === 0
      ? '<div class="inf-notice inf-notice-empty"><b>Sin actividad de Tickets en el periodo.</b><span>El alcance de Portafolio y la fotografía actual se conservan porque no dependen del rango de fechas.</span></div>'
      : '';
    return `
      <section class="inf-section-block">
        <div class="inf-section-title"><div><p class="inf-eyebrow">Actividad del periodo</p><h2>Tickets</h2></div><span>${formatDate(data.criterio?.fecha_inicio)} al ${formatDate(data.criterio?.fecha_fin)}</span></div>
        ${noActivity}
        <div class="inf-grid inf-grid-4">
          <section class="inf-card inf-kpi-card"><p class="inf-metric-label">Tickets totales</p><p class="inf-metric-value">${n0(tickets.total)}</p></section>
          <section class="inf-card"><p class="inf-metric-label">Estado</p><div class="inf-list-row"><span>Abiertos</span><strong>${n0(tickets.abiertos)}</strong></div><div class="inf-list-row"><span>Cerrados</span><strong>${n0(tickets.cerrados)}</strong></div><div class="inf-list-row"><span>En curso</span><strong>${n0(tickets.en_curso)}</strong></div></section>
          <section class="inf-card"><p class="inf-metric-label">Responsabilidad</p><div class="inf-list-row"><span>BLT</span><strong>${n0(tickets.responsabilidad_blt)}</strong></div><div class="inf-list-row"><span>Cliente</span><strong>${n0(tickets.responsabilidad_cliente)}</strong></div></section>
          <section class="inf-card"><p class="inf-metric-label">Prioridad</p>${renderPriorityList(tickets.prioridades)}</section>
        </div>

        <div class="inf-grid inf-grid-2">
          <section class="inf-card"><p class="inf-metric-label">Causas de falla · BLT</p>${barList(tickets.causas_blt,{labelKey:'causa'})}</section>
          <section class="inf-card"><p class="inf-metric-label">Causas de falla · Cliente</p>${barList(tickets.causas_cliente,{labelKey:'causa'})}</section>
        </div>

        <div class="inf-grid inf-grid-3">
          <section class="inf-card"><p class="inf-metric-label">Tickets por tipo de equipo</p>${barList(tickets.tipo_equipo,{labelKey:'tipo'})}</section>
          <section class="inf-card">
            <p class="inf-metric-label">Tiempo promedio de llegada</p>
            <div class="inf-time-grid"><div><strong>${h1(tickets.tiempo_promedio_llegada)}</strong><span>Total</span></div><div><strong>${h1(tickets.tiempo_promedio_llegada_habil)}</strong><span>Hábil</span></div><div><strong>${h1(tickets.tiempo_promedio_llegada_inhabil)}</strong><span>Inhábil</span></div></div>
            <p class="inf-metric-sub">Inhábil = 20:00–08:00 y fines de semana. La clasificación usa la hora real de <code>h_reporte</code>.</p>
          </section>
          <section class="inf-card inf-kpi-card"><p class="inf-metric-label">Tiempo promedio de solución</p><p class="inf-metric-value">${h1(tickets.tiempo_promedio_solucion)}</p><p class="inf-metric-sub">Solo Tickets cerrados.</p></section>
        </div>
      </section>`;
  }

  function renderCurrentSnapshot(data){
    const current = data.estado_actual || {};
    const stopped = current.equipos_parados_detalle || [];
    const critical = current.equipos_criticos || [];
    const trappedWrap = current.eventos_atrapados || {};
    const trapped = Array.isArray(trappedWrap.data) ? trappedWrap.data : [];

    return `
      <section class="inf-section-block">
        <div class="inf-section-title"><div><p class="inf-eyebrow">Fotografía actual</p><h2>Estado operativo</h2></div><span>Independiente del periodo elegido</span></div>
        <div class="inf-grid inf-grid-3">
          <section class="inf-card">
            <div class="inf-card-heading"><div><p class="inf-metric-label">Equipos parados actuales</p><p class="inf-metric-value warning">${n0(current.equipos_parados)}</p></div></div>
            ${listRows(stopped, item => `<div class="inf-list-row inf-list-row-stack"><span><b>${esc(item.equipo)}</b><small>${esc(item.proyecto)}</small></span><span>${esc(item.estatus_servicio)}</span></div>`, 'No hay equipos detenidos en el alcance.')}
          </section>
          <section class="inf-card">
            <div class="inf-card-heading"><div><p class="inf-metric-label">Equipos críticos actuales</p><p class="inf-metric-value danger">${critical.length}</p></div><span class="inf-metric-sub">${n0(data.criterio?.min_fallas_criticos)}+ BLT / ${n0(data.criterio?.dias_criticos)} días</span></div>
            ${listRows(critical, item => `<div class="inf-list-row inf-list-row-stack"><span><b>${esc(item.equipo)}</b><small>${esc(item.proyecto)}</small></span><strong>${n0(item.fallas_blt)} BLT</strong></div>`, 'No hay equipos críticos en el alcance.')}
          </section>
          <section class="inf-card">
            <div class="inf-card-heading"><div><p class="inf-metric-label">Eventos con persona atrapada</p><p class="inf-metric-value danger">${n0(trappedWrap.total ?? trapped.length)}</p></div></div>
            ${listRows(trapped, item => `<article class="inf-event"><div class="inf-event-head"><b>${esc(item.equipo)}</b><span>${formatDate(item.fecha_reporte)}</span></div><small>${esc(item.proyecto)}</small><p><b>Descripción:</b> ${esc(item.descripcion)}</p><p><b>Causa:</b> ${esc(item.causa)}</p><p><b>Acción cierre:</b> ${esc(item.accion_en_cierre)}</p></article>`, 'No hay eventos detectados en el alcance.')}
          </section>
        </div>
      </section>`;
  }

  function renderMtbcCard(current){
    const loading = state.mtbcBusy ? '<span class="inf-inline-loading"><span class="inf-spinner"></span>Actualizando</span>' : '';
    return `
      <div class="inf-card-heading"><div><p class="inf-metric-label">MTBC general</p><p class="inf-metric-value">${current.mtbc_general == null ? '—' : d1(current.mtbc_general)}</p><p class="inf-metric-sub">días</p></div>${loading}</div>
      <div class="inf-mtbc-toggle" role="group" aria-label="Ventana MTBC">
        <button type="button" data-mtbc="anio" class="${state.mtbcVentana==='anio'?'active':''}">Año actual</button>
        <button type="button" data-mtbc="365" class="${state.mtbcVentana==='365'?'active':''}">U365D</button>
      </div>
      <div class="inf-list-row"><span>Ventana</span><strong>${formatDate(current.mtbc_fecha_inicio)} – ${formatDate(current.mtbc_fecha_fin)}</strong></div>
      <div class="inf-list-row"><span>Días considerados</span><strong>${n0(current.mtbc_dias_ventana)}</strong></div>
      <div class="inf-list-row"><span>Equipos en servicio</span><strong>${n0(current.mtbc_equipos_activos)}</strong></div>
      <div class="inf-list-row"><span>Fallas BLT</span><strong>${n0(current.mtbc_fallas_blt)}</strong></div>`;
  }

  function renderMtbcTrend(current){
    const rows = current.mtbc_tendencia_mensual || [];
    if(!rows.length) return '<div class="inf-empty">Sin meses dentro de la ventana.</div>';
    return `<div class="inf-scroll-list inf-scroll-tall">${rows.map(item => `
      <div class="inf-list-row">
        <span>${formatMonth(item.mes)} <small>(${n0(item.dias)} días)</small></span>
        <span><b>${item.mtbc == null ? '—' : `${d1(item.mtbc)} días`}</b><small>${n0(item.fallas_blt)} BLT</small></span>
      </div>`).join('')}</div>`;
  }

  function renderCriticalProjects(current){
    const projects = current.proyectos_criticos || [];
    if(!projects.length) return '<div class="inf-empty">Ningún proyecto está por debajo de 100 días de MTBC en este alcance.</div>';
    return `<div class="inf-scroll-list inf-scroll-tall">${projects.map((item,index) => `
      <div class="inf-list-row"><span>${index+1}. ${esc(item.proyecto)} <small>${n0(item.equipos_activos)} equipos · ${n0(item.fallas_blt)} BLT</small></span><strong class="danger-text">${d1(item.mtbc)} días</strong></div>`).join('')}</div>`;
  }

  function renderMtbcSection(data){
    const current = data.estado_actual || {};
    return `
      <section class="inf-section-block inf-mtbc-section">
        <div class="inf-section-title"><div><p class="inf-eyebrow">Confiabilidad</p><h2>MTBC</h2></div><span>El selector actualiza solo esta sección</span></div>
        <div class="inf-grid inf-grid-3">
          <section class="inf-card" id="inf-mtbc-card">${renderMtbcCard(current)}</section>
          <section class="inf-card inf-span-2"><p class="inf-metric-label">Tendencia mensual</p><div id="inf-mtbc-trend">${renderMtbcTrend(current)}</div></section>
        </div>
        <section class="inf-card"><div class="inf-card-heading"><div><p class="inf-metric-label">Proyectos críticos</p><h3>MTBC menor a 100 días</h3></div></div><div id="inf-critical-projects">${renderCriticalProjects(current)}</div></section>
      </section>`;
  }

  function bindMtbcButtons(){
    const root = $('inf-resultado');
    if(!root) return;
    root.querySelectorAll('[data-mtbc]').forEach(button => {
      button.addEventListener('click', () => updateMtbc(button.getAttribute('data-mtbc')));
    });
  }

  function renderMtbcOnly(){
    if(!state.ultimoInforme) return;
    const current = state.ultimoInforme.estado_actual || {};
    const card = $('inf-mtbc-card');
    const trend = $('inf-mtbc-trend');
    const projects = $('inf-critical-projects');
    if(card) card.innerHTML = renderMtbcCard(current);
    if(trend) trend.innerHTML = renderMtbcTrend(current);
    if(projects) projects.innerHTML = renderCriticalProjects(current);
    bindMtbcButtons();
  }

  function renderInforme(data){
    state.ultimoInforme = data;
    state.mtbcVentana = data.criterio?.mtbc_ventana === '365' ? '365' : 'anio';
    const summary = data.resumen_alcance || {};
    const scopeTotal = n0(summary.equipos ?? summary.equipos_activos);
    const noScope = scopeTotal === 0
      ? renderStatePanel('empty','Sin equipos en el alcance','No se encontraron equipos de Portafolio para la combinación de filtros y alcance de información actual.',null)
      : '';
    const html = `
      <div class="inf-scope-banner"><b>Actividad de Tickets:</b> ${formatDate(data.criterio?.fecha_inicio)} al ${formatDate(data.criterio?.fecha_fin)}. <b>Portafolio:</b> fotografía del alcance actual, sin filtro de fecha.</div>
      ${renderScopeSummary(data)}
      ${noScope || `${renderTicketsSection(data)}${renderCurrentSnapshot(data)}${renderMtbcSection(data)}`}`;
    const result = $('inf-resultado');
    if(result) result.innerHTML = html;
    bindMtbcButtons();
    setPdfBusy(false);
  }

  async function generar(options){
    const opts = Object.assign({ quiet:false }, options || {});
    const result = $('inf-resultado');
    const sequence = ++state.requestSequence;
    if(!opts.quiet && result) result.innerHTML = '<div class="inf-status"><span class="inf-spinner"></span>Generando informe...</div>';
    setActionStatus('Actualizando...', 'loading');
    try{
      const data = await fetchJson('/api/informes/generar?'+buildReportQuery());
      if(sequence !== state.requestSequence) return false;
      renderInforme(data);
      clearRefreshWarning();
      setActionStatus('Actualizado', 'ok');
      return true;
    }catch(error){
      if(sequence !== state.requestSequence) return false;
      const status = statusFromError(error);
      if(opts.quiet && state.ultimoInforme){
        setRefreshWarning(`No se pudo actualizar. Se conserva la última lectura correcta. ${status.message}`);
      }else if(result){
        result.innerHTML = renderStatePanel('error', status.title, status.message, 'report');
      }
      setActionStatus('Error al actualizar', 'error');
      setPdfBusy(false);
      return false;
    }
  }

  function scheduleGenerate(){
    if(state.refreshTimer) window.clearTimeout(state.refreshTimer);
    state.refreshTimer = window.setTimeout(() => {
      state.refreshTimer = null;
      generar({ quiet:Boolean(state.ultimoInforme) });
    }, 220);
  }

  async function updateMtbc(windowValue){
    const next = String(windowValue || '').toLowerCase() === '365' ? '365' : 'anio';
    if((next === state.mtbcVentana && state.ultimoInforme) || state.mtbcBusy) return;
    const previous = state.mtbcVentana;
    state.mtbcVentana = next;
    state.mtbcBusy = true;
    renderMtbcOnly();
    const sequence = ++state.mtbcSequence;
    setActionStatus('Actualizando MTBC...', 'loading');
    try{
      const data = await fetchJson('/api/informes/mtbc?'+buildMtbcQuery());
      if(sequence !== state.mtbcSequence || !state.ultimoInforme) return;
      state.ultimoInforme.criterio = Object.assign({}, state.ultimoInforme.criterio || {}, {
        mtbc_ventana: data.criterio?.mtbc_ventana || next
      });
      state.ultimoInforme.estado_actual = Object.assign({}, state.ultimoInforme.estado_actual || {}, data.estado_actual || {});
      state.mtbcBusy = false;
      renderMtbcOnly();
      clearRefreshWarning();
      setActionStatus('MTBC actualizado', 'ok');
    }catch(error){
      if(sequence !== state.mtbcSequence) return;
      state.mtbcVentana = previous;
      state.mtbcBusy = false;
      renderMtbcOnly();
      const status = statusFromError(error);
      setRefreshWarning(`No se pudo actualizar MTBC; se conserva la ventana anterior. ${status.message}`);
      setActionStatus('Error al actualizar MTBC', 'error');
    }
  }

  function limpiarFiltros(){
    FILTER_IDS.forEach(id => {
      const el = $(id);
      if(el) Array.from(el.options).forEach(option => { option.selected = false; });
    });
    scheduleGenerate();
  }

  async function bootstrap(){
    if(state.bootstrapBusy) return false;
    state.bootstrapBusy = true;
    const result = $('inf-resultado');
    if(result) result.innerHTML = '<div class="inf-status"><span class="inf-spinner"></span>Cargando opciones del alcance...</div>';
    setActionStatus('Cargando...', 'loading');
    try{
      await loadOpciones();
      state.loaded = true;
      return await generar();
    }catch(error){
      const status = statusFromError(error);
      if(result) result.innerHTML = renderStatePanel('error', status.title, status.message, 'bootstrap');
      setActionStatus('Error de carga', 'error');
      console.error('[Informes]', error);
      return false;
    }finally{
      state.bootstrapBusy = false;
    }
  }

  function bindLiveControls(){
    if(state.bound) return;
    state.bound = true;
    FILTER_IDS.forEach(id => $(id)?.addEventListener('change', scheduleGenerate));
    $('inf-fecha-inicio')?.addEventListener('change', scheduleGenerate);
    $('inf-fecha-fin')?.addEventListener('change', scheduleGenerate);
    $('inf-generar')?.addEventListener('click', () => generar());
    $('inf-limpiar')?.addEventListener('click', limpiarFiltros);
    $('inf-pdf')?.addEventListener('click', exportPdf);
    $('inf-resultado')?.addEventListener('click', event => {
      const retry = event.target instanceof Element ? event.target.closest('[data-inf-retry]') : null;
      if(!retry) return;
      const action = retry.getAttribute('data-inf-retry');
      if(action === 'bootstrap') bootstrap();
      else if(action === 'report') generar();
    });
  }

  function pdfValue(value){
    if(value === null || value === undefined || value === '') return '-';
    return String(value).replace(/[—–]/g,'-').replace(/\s+/g,' ').trim();
  }

  function pdfSelectedFilters(data){
    const filters = data.criterio?.filtros || selectedFilterState();
    const labels = {
      superintendente:'Superintendente', supervisor:'Supervisor', estado:'Estado',
      zona:'Zona', proyecto:'Proyecto', equipo:'Equipo'
    };
    return Object.entries(labels).map(([key,label]) => {
      const values = Array.isArray(filters[key]) ? filters[key] : [];
      return [label, values.length ? values.join(' / ') : 'Todos dentro del alcance permitido'];
    });
  }

  function exportPdf(){
    const data = state.ultimoInforme;
    if(!data){ window.alert('Genera un informe primero.'); return; }
    if(state.pdfBusy) return;
    if(!window.jspdf || !window.jspdf.jsPDF){ window.alert('jsPDF no está disponible.'); return; }

    setPdfBusy(true);
    setActionStatus('Generando PDF...', 'loading');
    try{
      const doc = new window.jspdf.jsPDF({ orientation:'landscape', unit:'pt', format:'letter' });
      if(typeof doc.autoTable !== 'function') throw new Error('jsPDF AutoTable no está disponible.');

      const summary = data.resumen_alcance || {};
      const detail = data.detalle_alcance || {};
      const tickets = data.tickets || {};
      const current = data.estado_actual || {};
      const trapped = Array.isArray(current.eventos_atrapados?.data) ? current.eventos_atrapados.data : [];
      const critical = Array.isArray(current.equipos_criticos) ? current.equipos_criticos : [];
      const stopped = Array.isArray(current.equipos_parados_detalle) ? current.equipos_parados_detalle : [];
      const generatedAt = formatMexicoCityDateTime(new Date());
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const left = 32;
      const right = 32;
      let y = 34;

      const tableDefaults = {
        theme:'grid',
        margin:{ left, right, top:36, bottom:34 },
        styles:{ font:'helvetica', fontSize:7.4, cellPadding:3.5, overflow:'linebreak', valign:'top', textColor:[30,41,59], lineColor:[226,232,240], lineWidth:.35 },
        headStyles:{ fillColor:[13,46,110], textColor:[255,255,255], fontStyle:'bold', fontSize:7.5 },
        alternateRowStyles:{ fillColor:[248,250,252] }
      };

      function ensureSpace(height){
        if(y + Number(height || 0) <= pageHeight - 42) return;
        doc.addPage();
        y = 42;
      }
      function sectionTitle(title, subtitle){
        ensureSpace(subtitle ? 34 : 24);
        doc.setFont('helvetica','bold');
        doc.setTextColor(13,46,110);
        doc.setFontSize(11);
        doc.text(pdfValue(title), left, y);
        y += 12;
        if(subtitle){
          doc.setFont('helvetica','normal');
          doc.setTextColor(100,116,139);
          doc.setFontSize(7.5);
          const lines = doc.splitTextToSize(pdfValue(subtitle), pageWidth-left-right);
          doc.text(lines, left, y);
          y += lines.length * 8 + 3;
        }
      }
      function table(title, head, body, options){
        const opts = options || {};
        if(title) sectionTitle(title, opts.subtitle || '');
        const rows = body && body.length ? body : [head.map((_item,index) => index === 0 ? 'Sin datos' : '-')];
        doc.autoTable(Object.assign({}, tableDefaults, opts.table || {}, {
          startY:y,
          head:[head.map(pdfValue)],
          body:rows.map(row => row.map(pdfValue))
        }));
        y = doc.lastAutoTable.finalY + 16;
      }

      doc.setTextColor(13,46,110);
      doc.setFont('helvetica','bold');
      doc.setFontSize(18);
      doc.text('Informes - Gestor Mantto', left, y);
      y += 15;
      doc.setFont('helvetica','normal');
      doc.setTextColor(71,85,105);
      doc.setFontSize(8.5);
      doc.text(`Generado: ${pdfValue(generatedAt)} CDMX`, left, y);
      y += 11;
      doc.text(`Periodo Tickets: ${pdfValue(formatDate(data.criterio?.fecha_inicio))} al ${pdfValue(formatDate(data.criterio?.fecha_fin))} | MTBC: ${state.mtbcVentana==='365'?'U365D':'Año actual'}`, left, y);
      y += 17;

      table('Filtros aplicados', ['Filtro','Selección'], pdfSelectedFilters(data), {
        table:{ columnStyles:{ 0:{cellWidth:120,fontStyle:'bold'}, 1:{cellWidth:'auto'} } }
      });

      if(detail.tipo === 'equipo' && detail.data){
        const row = detail.data;
        table('Alcance - Equipo', ['Campo','Valor'], [
          ['Equipo',row.equipo],['Referencia en sitio',row.referencia_en_sitio],['Proyecto',row.proyecto],['Ciudad',row.ciudad],['Estado',row.estado],['Zona operativa',row.zona],['Superintendente',row.superintendente],['Supervisor',row.supervisor],['Dirección',row.direccion],['Estatus de servicio',row.estatus_servicio],['Fecha instalación',formatDate(row.fecha_instalacion)],['Fecha entrega',formatDate(row.fecha_entrega)],['Término garantía',formatDate(row.termino_garantia)],['Recepción mantenimiento',formatDate(row.fecha_recepcion_mantenimiento)],['Mes inicio gratuitos',row.mes_inicio_gratuitos],['Mes término gratuitos',row.mes_termino_gratuitos],['Cobranza',detail.cobranza_pendiente_fuente?'Pendiente de definir fuente':'-']
        ], { table:{ columnStyles:{0:{cellWidth:150,fontStyle:'bold'},1:{cellWidth:'auto'}} } });
      }else if(detail.tipo === 'proyecto' && detail.data){
        const row = detail.data;
        table('Alcance - Proyecto', ['Campo','Valor'], [
          ['Proyecto',row.proyecto],['Ciudad',row.ciudad],['Estado',row.estado],['Zona operativa',row.zona],['Superintendente',row.superintendente],['Supervisor',row.supervisor],['Dirección',row.direccion],['Estatus de servicio',row.estatus_servicio],['Equipos',n0(row.equipos)],['Cobranza',detail.cobranza_pendiente_fuente?'Pendiente de definir fuente':'-']
        ], { table:{ columnStyles:{0:{cellWidth:150,fontStyle:'bold'},1:{cellWidth:'auto'}} } });
      }else{
        table('Alcance de Portafolio', ['Equipos','Proyectos','Supervisores','Zonas','Estados'], [[
          n0(summary.equipos ?? summary.equipos_activos), n0(summary.n_proyectos), n0(summary.n_supervisores), n0(summary.n_zonas), n0(summary.n_estados)
        ]], { subtitle:'Fotografía del alcance actual; el rango de fechas no modifica este universo.' });
      }

      table('Actividad de Tickets', ['Total','Abiertos','Cerrados','En curso','Resp. BLT','Resp. Cliente'], [[
        n0(tickets.total), n0(tickets.abiertos), n0(tickets.cerrados), n0(tickets.en_curso), n0(tickets.responsabilidad_blt), n0(tickets.responsabilidad_cliente)
      ]], { subtitle:`Periodo ${formatDate(data.criterio?.fecha_inicio)} al ${formatDate(data.criterio?.fecha_fin)}.` });

      table('Prioridad de Tickets', ['Prioridad','Tickets'], (tickets.prioridades || []).map(item => [item.prioridad,n0(item.total)]));
      table('Causas de falla', ['Responsabilidad','Causa','Tickets','%'],
        (tickets.causas_blt || []).map(item => ['BLT',item.causa,n0(item.total),`${n1(item.porcentaje) ?? 0}%`])
          .concat((tickets.causas_cliente || []).map(item => ['Cliente',item.causa,n0(item.total),`${n1(item.porcentaje) ?? 0}%`])),
        { table:{ columnStyles:{0:{cellWidth:90},1:{cellWidth:'auto'},2:{cellWidth:65},3:{cellWidth:55}} } }
      );
      table('Tickets por tipo de equipo', ['Tipo de equipo','Tickets'], (tickets.tipo_equipo || []).map(item => [item.tipo,n0(item.total)]));
      table('Tiempos promedio', ['Llegada total','Llegada hábil','Llegada inhábil','Solución cerrados'], [[
        h1(tickets.tiempo_promedio_llegada), h1(tickets.tiempo_promedio_llegada_habil), h1(tickets.tiempo_promedio_llegada_inhabil), h1(tickets.tiempo_promedio_solucion)
      ]], { subtitle:'Hábil/inhábil se clasifica con h_reporte. Inhábil = 20:00-08:00 y fines de semana.' });

      table('Equipos parados actuales', ['Equipo','Proyecto','Zona','Supervisor','Estatus'], stopped.map(item => [
        item.equipo,item.proyecto,item.zona,item.supervisor,item.estatus_servicio
      ]), { subtitle:'Fotografía actual independiente del periodo de Tickets.' });

      table('Equipos críticos actuales', ['Equipo','Proyecto','Zona','Supervisor','Fallas BLT'], critical.map(item => [
        item.equipo,item.proyecto,item.zona,item.supervisor,n0(item.fallas_blt)
      ]), { subtitle:`Criterio: ${n0(data.criterio?.min_fallas_criticos)}+ fallas BLT en ${n0(data.criterio?.dias_criticos)} días.` });

      table('Eventos con persona atrapada', ['Fecha','Equipo','Proyecto','Descripción','Causa','Acción en cierre'], trapped.map(item => [
        formatDate(item.fecha_reporte),item.equipo,item.proyecto,item.descripcion,item.causa,item.accion_en_cierre
      ]), { table:{ styles:{fontSize:6.8}, columnStyles:{0:{cellWidth:58},1:{cellWidth:72},2:{cellWidth:115},3:{cellWidth:155},4:{cellWidth:125},5:{cellWidth:155}} }, subtitle:'Detección textual sobre descripción, causa y acción de cierre; independiente del periodo seleccionado.' });

      table('MTBC general', ['Ventana','Inicio','Fin','Días','Equipos en servicio','Fallas BLT','MTBC días'], [[
        state.mtbcVentana==='365'?'U365D':'Año actual', formatDate(current.mtbc_fecha_inicio), formatDate(current.mtbc_fecha_fin), n0(current.mtbc_dias_ventana), n0(current.mtbc_equipos_activos), n0(current.mtbc_fallas_blt), current.mtbc_general == null ? '-' : d1(current.mtbc_general)
      ]]);

      table('Tendencia mensual MTBC', ['Mes','Días','Equipos en servicio','Fallas BLT','MTBC días'], (current.mtbc_tendencia_mensual || []).map(item => [
        formatMonth(item.mes),n0(item.dias),n0(item.equipos_activos),n0(item.fallas_blt),item.mtbc == null ? '-' : d1(item.mtbc)
      ]));

      table('Proyectos críticos por MTBC', ['Proyecto','Equipos en servicio','Fallas BLT','MTBC días'], (current.proyectos_criticos || []).map(item => [
        item.proyecto,n0(item.equipos_activos),n0(item.fallas_blt),item.mtbc == null ? '-' : d1(item.mtbc)
      ]), { subtitle:'Se incluyen proyectos con MTBC menor a 100 días dentro de la ventana MTBC seleccionada.' });

      ensureSpace(62);
      sectionTitle('Notas metodológicas');
      doc.setTextColor(71,85,105);
      doc.setFont('helvetica','normal');
      doc.setFontSize(7.5);
      const notes = [
        '1. El rango Fecha inicio/Fecha final afecta únicamente la actividad de Tickets; Portafolio, equipos parados, criticidad y eventos de persona atrapada se presentan como fotografía del alcance actual según la lógica del módulo.',
        '2. El cálculo hábil/inhábil usa h_reporte para la hora real del reporte. Se considera inhábil de 20:00 a 08:00 y fines de semana.',
        '3. MTBC usa la ventana seleccionada Año actual o U365D y se calcula con equipos en servicio y fallas BLT del alcance.',
        '4. La fuente definitiva de Cobranza continúa pendiente de definición; el informe no inventa ni sustituye ese dato.'
      ];
      notes.forEach(note => {
        const lines = doc.splitTextToSize(pdfValue(note), pageWidth-left-right);
        doc.text(lines,left,y);
        y += lines.length * 8 + 3;
      });

      const pageCount = doc.internal.getNumberOfPages();
      for(let page = 1; page <= pageCount; page += 1){
        doc.setPage(page);
        if(page > 1){
          doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(13,46,110);
          doc.text('Informes - Gestor Mantto',left,18);
          doc.setDrawColor(226,232,240); doc.line(left,24,pageWidth-right,24);
        }
        doc.setFont('helvetica','normal'); doc.setFontSize(6.8); doc.setTextColor(100,116,139);
        doc.text(`Generado ${pdfValue(generatedAt)} CDMX`,left,pageHeight-16);
        doc.text(`Página ${page} de ${pageCount}`,pageWidth-right,pageHeight-16,{align:'right'});
      }

      const start = String(data.criterio?.fecha_inicio || 'inicio').replace(/[^0-9-]/g,'');
      const finish = String(data.criterio?.fecha_fin || 'fin').replace(/[^0-9-]/g,'');
      doc.save(`informe-gestor-mantto-${start}-a-${finish}-${state.mtbcVentana==='365'?'u365d':'anio'}.pdf`);
      setActionStatus('PDF generado', 'ok');
    }catch(error){
      console.error('[Informes PDF]', error);
      setActionStatus('Error generando PDF', 'error');
      window.alert(error && error.message ? error.message : 'No fue posible generar el PDF.');
    }finally{
      setPdfBusy(false);
    }
  }

  async function init(){
    const view = $('view-informes');
    if(!view) return;
    if(!view.innerHTML.trim() || !view.querySelector('#inf-resultado')) view.innerHTML = INF_HTML;
    bindLiveControls();

    if(!$('inf-fecha-inicio').value) $('inf-fecha-inicio').value = monthsAgoIso(6);
    if(!$('inf-fecha-fin').value) $('inf-fecha-fin').value = todayIso();

    if(!state.loaded){
      await bootstrap();
      return;
    }

    if(state.ultimoInforme) renderInforme(state.ultimoInforme);
    else await generar();
  }

  window.ManttoOperacionInformes = { init, refresh:generar };
})();

(function(){
  'use strict';

  const VERSION_COR = '20260821-pendientes-supervisor-v001';
  const API_BASE = (window.MANTTO_API_BASE || 'http://localhost:3001').replace(/\/$/, '');
  const PAGE_SIZE_COR = 30;
  const STATUS_NAMES_COR = Object.freeze({
    '04-M':'Montaje',
    '05-PA':'Próximos a Ajustar',
    '06-A':'Ajuste',
    '07-PE':'Próximos a Entregar'
  });
  const STATUS_COLORS_COR = Object.freeze({
    '04-M':'#2f80ed',
    '05-PA':'#f3b61f',
    '06-A':'#2fb36d',
    '07-PE':'#ef5b5b'
  });

  const state = {
    mounted:false,
    bound:false,
    loaded:false,
    loading:false,
    requestSeq:0,
    page:1,
    supervisorId:'',
    q:'',
    estado:'',
    estatus:'',
    documentacion:'TODOS',
    data:null,
    searchTimer:null
  };

  const $ = id => document.getElementById(id);
  const raw = value => value === null || value === undefined ? '' : String(value).trim();
  const esc = value => raw(value)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');

  function view_cor(){ return $('view-instalaciones-documentacion'); }
  function fmtNumber_cor(value){
    const number = Number(value || 0);
    return Number.isFinite(number) ? number.toLocaleString('es-MX') : '0';
  }
  function fmtPct_cor(value){
    const number = Number(value || 0);
    return (Number.isFinite(number) ? number : 0).toFixed(1).replace('.0','') + '%';
  }
  function fmtDate_cor(value){
    const text = raw(value);
    if(!text) return '';
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?/);
    if(!match) return text;
    return match[3] + '/' + match[2] + '/' + match[1] + (match[4] ? ' - ' + match[4] + ':' + match[5] : '');
  }
  function initials_cor(value){
    const text = raw(value);
    if(!text) return '--';
    const compact = text.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9]/g,'');
    if(compact.length <= 4) return compact.toUpperCase();
    return text.split(/\s+/).filter(Boolean).slice(0,2).map(part => part[0]).join('').toUpperCase() || '--';
  }
  function currentUser_cor(){
    return window.ManttoAuth && typeof window.ManttoAuth.getUser === 'function'
      ? (window.ManttoAuth.getUser() || {})
      : {};
  }

  async function requestJson_cor(path){
    if(window.ManttoAuth && typeof window.ManttoAuth.api === 'function'){
      return window.ManttoAuth.api(path, { method:'GET' });
    }
    const headers = Object.assign(
      { Accept:'application/json' },
      window.ManttoAuth && window.ManttoAuth.authHeaders ? window.ManttoAuth.authHeaders() : {}
    );
    const response = await fetch(API_BASE + path, { headers, cache:'no-store', credentials:'include' });
    const text = await response.text();
    let json = {};
    try{ json = text ? JSON.parse(text) : {}; }
    catch(_error){ throw new Error('El backend respondió contenido no JSON.'); }
    if(!response.ok || json.ok === false){
      const error = new Error(json.message || json.error || ('Error HTTP ' + response.status));
      error.status = response.status;
      error.code = json.code;
      throw error;
    }
    return json;
  }

  async function loadHtml_cor(){
    const view = view_cor();
    if(!view) throw new Error('No existe la vista view-instalaciones-documentacion.');
    if(view.dataset.idocCorReady === '1') return;
    const response = await fetch(
      './modules/instalaciones-documentacion/instalaciones-documentacion_cor.html?v=' + VERSION_COR,
      { cache:'no-store' }
    );
    if(!response.ok) throw new Error('No se pudo cargar la vista Documentación Pendiente.');
    view.innerHTML = await response.text();
    view.dataset.idocCorReady = '1';
  }

  function setStatus_cor(message, type){
    const el = $('idoc-cor-status');
    if(!el) return;
    el.textContent = message || '';
    el.dataset.type = type || 'ready';
  }

  function setLoading_cor(value){
    state.loading = Boolean(value);
    const root = view_cor() && view_cor().querySelector('[data-idoc-root]');
    if(root) root.classList.toggle('idoc-cor-loading', state.loading);
    const refresh = $('idoc-cor-refresh');
    if(refresh) refresh.disabled = state.loading;
    const prev = $('idoc-cor-prev');
    const next = $('idoc-cor-next');
    if(prev) prev.disabled = state.loading || !(state.data && state.data.pagination && state.data.pagination.has_previous);
    if(next) next.disabled = state.loading || !(state.data && state.data.pagination && state.data.pagination.has_next);
  }

  function queryString_cor(){
    const params = new URLSearchParams();
    params.set('page', String(state.page || 1));
    if(state.supervisorId) params.set('id_supervisor', state.supervisorId);
    if(state.q) params.set('q', state.q);
    if(state.estado) params.set('estado', state.estado);
    if(state.estatus) params.set('estatus', state.estatus);
    if(state.documentacion && state.documentacion !== 'TODOS') params.set('documentacion', state.documentacion);
    return params.toString();
  }

  function setSelectOptions_cor(select, values, selected, labels){
    if(!select) return;
    const rows = Array.isArray(values) ? values : [];
    const placeholder = select.dataset.placeholder || 'Todos';
    select.innerHTML = '<option value="">' + esc(placeholder) + '</option>' + rows.map(value => {
      const key = raw(value);
      const label = labels && labels[key] ? labels[key] : key;
      return '<option value="' + esc(key) + '">' + esc(label) + '</option>';
    }).join('');
    select.value = raw(selected);
  }

  function renderSupervisor_cor(payload){
    const context = payload && payload.supervisor_context ? payload.supervisor_context : {};
    const selected = context.selected || {};
    const user = currentUser_cor();
    const avatar = $('idoc-cor-supervisor-avatar');
    const name = $('idoc-cor-supervisor-name');
    const meta = $('idoc-cor-supervisor-meta');
    const fixed = $('idoc-cor-supervisor-fixed');
    const selectorWrap = $('idoc-cor-supervisor-select-wrap');
    const selector = $('idoc-cor-supervisor-select');
    const selectorMeta = $('idoc-cor-supervisor-select-meta');

    const displayName = selected.nombre || selected.iniciales || user.nombre || 'Supervisor';
    const displayInitials = selected.all === true ? 'ALL' : (selected.iniciales || user.iniciales || initials_cor(displayName));
    if(avatar) avatar.textContent = initials_cor(displayInitials);
    if(name) name.textContent = displayName;
    if(meta){
      if(selected.all === true) meta.textContent = 'Acceso total · todos los supervisores';
      else meta.textContent = [selected.iniciales, selected.id_supervisor ? 'ID ' + selected.id_supervisor : ''].filter(Boolean).join(' · ') || 'Vista individual';
    }

    const canSwitch = context.can_switch === true;
    if(fixed) fixed.hidden = canSwitch;
    if(selectorWrap) selectorWrap.hidden = !canSwitch;

    if(canSwitch && selector){
      const options = Array.isArray(context.options) ? context.options : [];
      selector.innerHTML = '<option value="">Todos los supervisores</option>' + options.map(item => {
        const label = [item.iniciales, item.nombre].filter(Boolean).join(' · ') || ('Supervisor ' + item.id_supervisor);
        return '<option value="' + esc(item.id_supervisor) + '">' + esc(label) + '</option>';
      }).join('');
      selector.value = selected.all === true ? '' : raw(selected.id_supervisor || state.supervisorId);
      state.supervisorId = selector.value;
      if(selectorMeta){
        selectorMeta.textContent = fmtNumber_cor((payload.resumen && payload.resumen.total_equipos) || selected.total_equipos || 0) + ' equipos en seguimiento';
      }
    }else{
      state.supervisorId = raw(selected.id_supervisor || '');
    }
  }

  function renderKpis_cor(payload){
    const summary = payload && payload.resumen ? payload.resumen : {};
    const required = Number(summary.documentos_requeridos || 0);
    const generated = Number(summary.documentos_generados || 0);
    const pending = Number(summary.documentos_pendientes || 0);
    const pct = Math.max(0, Math.min(100, Number(summary.cumplimiento_porcentaje || 0)));
    const pendingPct = required > 0 ? (pending / required) * 100 : 0;

    if($('idoc-kpi-equipos')) $('idoc-kpi-equipos').textContent = fmtNumber_cor(summary.total_equipos);
    if($('idoc-kpi-requeridos')) $('idoc-kpi-requeridos').textContent = fmtNumber_cor(required);
    if($('idoc-kpi-generados')) $('idoc-kpi-generados').textContent = fmtNumber_cor(generated);
    if($('idoc-kpi-generados-pct')) $('idoc-kpi-generados-pct').textContent = fmtPct_cor(pct) + ' del total requerido';
    if($('idoc-kpi-pendientes')) $('idoc-kpi-pendientes').textContent = fmtNumber_cor(pending);
    if($('idoc-kpi-pendientes-pct')) $('idoc-kpi-pendientes-pct').textContent = fmtPct_cor(pendingPct) + ' del total requerido';
    if($('idoc-kpi-cumplimiento')) $('idoc-kpi-cumplimiento').textContent = fmtPct_cor(pct);
    if($('idoc-cor-ring')) $('idoc-cor-ring').style.setProperty('--pct', String(pct));
  }

  function renderCharts_cor(payload){
    const progress = Array.isArray(payload && payload.progreso_por_estatus) ? payload.progreso_por_estatus : [];
    const total = progress.reduce((sum,row) => sum + Number(row.total_equipos || 0), 0);
    const donut = $('idoc-cor-status-donut');
    const legend = $('idoc-cor-status-legend');
    const list = $('idoc-cor-progress-list');
    if($('idoc-cor-donut-total')) $('idoc-cor-donut-total').textContent = fmtNumber_cor(total);
    if($('idoc-cor-chart-total')) $('idoc-cor-chart-total').textContent = fmtNumber_cor(total) + ' equipos';

    let cursor = 0;
    const segments = [];
    progress.forEach(row => {
      const count = Number(row.total_equipos || 0);
      const share = total > 0 ? (count / total) * 100 : 0;
      const start = cursor;
      cursor += share;
      const color = STATUS_COLORS_COR[row.estatus] || '#94a3b8';
      segments.push(color + ' ' + start.toFixed(2) + '% ' + cursor.toFixed(2) + '%');
    });
    if(donut) donut.style.background = total > 0 ? 'conic-gradient(' + segments.join(',') + ')' : '#e8edf5';

    if(legend){
      legend.innerHTML = progress.map(row => {
        const color = STATUS_COLORS_COR[row.estatus] || '#94a3b8';
        const count = Number(row.total_equipos || 0);
        const share = total > 0 ? (count / total) * 100 : 0;
        return '<div class="idoc-cor-legend-row">' +
          '<span class="idoc-cor-dot" style="background:' + esc(color) + '"></span>' +
          '<span>' + esc(row.estatus + ' · ' + (row.nombre || STATUS_NAMES_COR[row.estatus] || row.estatus)) + '</span>' +
          '<small>' + fmtNumber_cor(count) + ' · ' + fmtPct_cor(share) + '</small>' +
        '</div>';
      }).join('') || '<div class="idoc-cor-empty">Sin datos para graficar.</div>';
    }

    if(list){
      list.innerHTML = progress.map(row => {
        const pct = Math.max(0, Math.min(100, Number(row.cumplimiento_porcentaje || 0)));
        return '<div class="idoc-cor-progress-row">' +
          '<div class="idoc-cor-progress-name">' + esc(row.estatus + ' · ' + (row.nombre || STATUS_NAMES_COR[row.estatus] || row.estatus)) + '</div>' +
          '<div class="idoc-cor-progress-track"><div class="idoc-cor-progress-fill" style="width:' + pct + '%"></div></div>' +
          '<div class="idoc-cor-progress-pct">' + fmtPct_cor(pct) + '</div>' +
          '<div class="idoc-cor-progress-count">' + fmtNumber_cor(row.documentos_generados) + ' / ' + fmtNumber_cor(row.documentos_requeridos) + '</div>' +
        '</div>';
      }).join('') || '<div class="idoc-cor-empty">Sin datos para graficar.</div>';
    }
  }

  function renderFilters_cor(payload){
    const permissions = payload && payload.permissions ? payload.permissions : {};
    const filterPanel = $('idoc-cor-filters-panel');
    if(filterPanel) filterPanel.hidden = permissions.filtros_ver !== true && permissions.listado_buscar !== true;

    const searchWrap = $('idoc-cor-search-wrap');
    const q = $('idoc-cor-q');
    if(searchWrap) searchWrap.hidden = permissions.listado_buscar !== true;
    if(q){ q.disabled = permissions.listado_buscar !== true; q.value = state.q; }

    const controlsEnabled = permissions.filtros_ver === true && permissions.filtros_filtrar === true;
    const options = payload && payload.filters && payload.filters.options ? payload.filters.options : {};
    setSelectOptions_cor($('idoc-cor-estado'), options.estados || [], state.estado);
    setSelectOptions_cor($('idoc-cor-estatus'), options.estatus || [], state.estatus, STATUS_NAMES_COR);
    if($('idoc-cor-estado')) $('idoc-cor-estado').disabled = !controlsEnabled;
    if($('idoc-cor-estatus')) $('idoc-cor-estatus').disabled = !controlsEnabled;
    if($('idoc-cor-documentacion')){
      $('idoc-cor-documentacion').disabled = !controlsEnabled;
      $('idoc-cor-documentacion').value = state.documentacion || 'TODOS';
    }
    if($('idoc-cor-clear')) $('idoc-cor-clear').disabled = state.loading || (!controlsEnabled && permissions.listado_buscar !== true);
  }

  function pctClass_cor(value){
    const pct = Number(value || 0);
    if(pct >= 80) return 'good';
    if(pct >= 50) return 'mid';
    return 'low';
  }

  function docCell_cor(doc, type){
    const item = doc || {};
    const value = raw(item.valor);
    if(item.generado === true){
      const hasDate = /^(\d{4})-(\d{2})-(\d{2})/.test(value) ||
        /^\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}$/.test(value) ||
        /^\d{1,2}-[A-Za-z]{3}-\d{2,4}$/.test(value);
      const display = type === 'date'
        ? (hasDate ? fmtDate_cor(value) : 'Entregado')
        : (value || 'Entregado');
      return '<span class="idoc-cor-doc idoc-cor-doc-ok" title="' + esc(value || 'Entregado') + '">' + esc(display) + '</span>';
    }
    if(value){
      return '<span class="idoc-cor-doc idoc-cor-doc-missing" title="' + esc(value) + '">Falta</span>';
    }
    return '<span class="idoc-cor-doc idoc-cor-doc-neutral">Falta</span>';
  }

  function openProject_cor(row){
    const permissions = state.data && state.data.permissions ? state.data.permissions : {};
    if(permissions.listado_abrir_detalle !== true) return;
    if(window.ManttoDetails && typeof window.ManttoDetails.openProyecto === 'function'){
      window.ManttoDetails.openProyecto(row.id_proyecto || row.proyecto, {
        template:'cliente-unificado',
        source:'instalaciones-documentacion',
        projectName:row.proyecto || ''
      });
    }
  }

  function openEquipment_cor(row){
    const permissions = state.data && state.data.permissions ? state.data.permissions : {};
    if(permissions.listado_abrir_detalle !== true) return;
    if(window.ManttoDetails && typeof window.ManttoDetails.openEquipo === 'function'){
      window.ManttoDetails.openEquipo(row.referencia_sitio);
    }
  }

  function renderTable_cor(payload){
    const permissions = payload && payload.permissions ? payload.permissions : {};
    const panel = $('idoc-cor-list-panel');
    if(panel) panel.hidden = permissions.listado_ver !== true;
    if(permissions.listado_ver !== true) return;

    const pagination = payload.pagination || {};
    const rows = Array.isArray(payload.data) ? payload.data : [];
    const tbody = $('idoc-cor-tbody');
    const canOpen = permissions.listado_abrir_detalle === true;
    const start = (Number(pagination.page || 1) - 1) * PAGE_SIZE_COR;

    if($('idoc-cor-total-rows')) $('idoc-cor-total-rows').textContent = fmtNumber_cor(pagination.total_rows) + ' registros';
    if(!rows.length){
      if(tbody) tbody.innerHTML = '<tr><td colspan="19" class="idoc-cor-empty">Sin registros para los filtros seleccionados.</td></tr>';
    }else if(tbody){
      tbody.innerHTML = rows.map((row,index) => {
        const docs = row.documentos || {};
        const project = canOpen
          ? '<button type="button" class="idoc-cor-link" data-idoc-project="' + index + '">' + esc(row.proyecto || row.id_proyecto || '—') + '</button>'
          : esc(row.proyecto || row.id_proyecto || '—');
        const equipment = canOpen
          ? '<button type="button" class="idoc-cor-link" data-idoc-equipment="' + index + '">' + esc(row.referencia_sitio || '—') + '</button>'
          : esc(row.referencia_sitio || '—');
        return '<tr>' +
          '<td>' + (start + index + 1) + '</td>' +
          '<td>' + esc(row.supervisor || '—') + '</td>' +
          '<td>' + esc(row.estado || '—') + '</td>' +
          '<td><span class="idoc-cor-status-chip">' + esc(row.estatus || '—') + '</span></td>' +
          '<td>' + project + '</td>' +
          '<td>' + equipment + '</td>' +
          '<td>' + docCell_cor(docs.cpvp,'date') + '</td>' +
          '<td>' + docCell_cor(docs.ccnr,'date') + '</td>' +
          '<td>' + docCell_cor(docs.ccr,'date') + '</td>' +
          '<td>' + docCell_cor(docs.condiciones_obra,'text') + '</td>' +
          '<td>' + docCell_cor(docs.cti,'date') + '</td>' +
          '<td>' + docCell_cor(docs.revision_supervisor,'date') + '</td>' +
          '<td>' + docCell_cor(docs.evaluacion_montaje,'text') + '</td>' +
          '<td>' + docCell_cor(docs.minuta_interfon,'date') + '</td>' +
          '<td>' + docCell_cor(docs.certificado_regulador,'text') + '</td>' +
          '<td class="idoc-cor-number">' + fmtNumber_cor(row.documentos_requeridos) + '</td>' +
          '<td class="idoc-cor-number">' + fmtNumber_cor(row.documentos_generados_progreso) + '</td>' +
          '<td class="idoc-cor-number">' + fmtNumber_cor(row.documentos_pendientes) + '</td>' +
          '<td class="idoc-cor-number"><span class="idoc-cor-pct ' + pctClass_cor(row.cumplimiento_porcentaje) + '">' + fmtPct_cor(row.cumplimiento_porcentaje) + '</span></td>' +
        '</tr>';
      }).join('');

      tbody.querySelectorAll('[data-idoc-project]').forEach(button => {
        button.addEventListener('click', () => openProject_cor(rows[Number(button.dataset.idocProject)]));
      });
      tbody.querySelectorAll('[data-idoc-equipment]').forEach(button => {
        button.addEventListener('click', () => openEquipment_cor(rows[Number(button.dataset.idocEquipment)]));
      });
    }

    renderPagination_cor(pagination);
  }

  function pageWindow_cor(page,totalPages){
    const total = Math.max(1, Number(totalPages || 1));
    const current = Math.max(1, Math.min(Number(page || 1), total));
    let start = Math.max(1, current - 2);
    let end = Math.min(total, start + 4);
    start = Math.max(1, end - 4);
    const pages = [];
    for(let value=start; value<=end; value += 1) pages.push(value);
    return pages;
  }

  function renderPagination_cor(pagination){
    const page = Number(pagination.page || 1);
    const totalPages = Math.max(1, Number(pagination.total_pages || 1));
    const totalRows = Number(pagination.total_rows || 0);
    const start = totalRows ? ((page - 1) * PAGE_SIZE_COR) + 1 : 0;
    const end = Math.min(totalRows, page * PAGE_SIZE_COR);
    if($('idoc-cor-range')) $('idoc-cor-range').textContent = totalRows ? ('Mostrando ' + start + ' a ' + end + ' de ' + totalRows) : '0 registros';
    if($('idoc-cor-page-label')) $('idoc-cor-page-label').textContent = 'Página ' + page + ' de ' + totalPages;
    if($('idoc-cor-prev')) $('idoc-cor-prev').disabled = state.loading || !pagination.has_previous;
    if($('idoc-cor-next')) $('idoc-cor-next').disabled = state.loading || !pagination.has_next;
    const pages = $('idoc-cor-pages');
    if(pages){
      pages.innerHTML = pageWindow_cor(page,totalPages).map(value =>
        '<button type="button" data-idoc-page="' + value + '" class="' + (value === page ? 'active' : '') + '">' + value + '</button>'
      ).join('');
      pages.querySelectorAll('[data-idoc-page]').forEach(button => {
        button.addEventListener('click', () => {
          const target = Number(button.dataset.idocPage || 1);
          if(target === state.page) return;
          state.page = target;
          load_cor();
        });
      });
    }
  }

  function applyVisibility_cor(payload){
    const permissions = payload && payload.permissions ? payload.permissions : {};
    if($('idoc-cor-summary-charts')) $('idoc-cor-summary-charts').hidden = permissions.resumen_ver !== true;
    if($('idoc-cor-kpis')) $('idoc-cor-kpis').hidden = permissions.resumen_ver !== true;
  }

  function render_cor(payload){
    state.data = payload;
    const pagination = payload.pagination || {};
    state.page = Number(pagination.page || state.page || 1);
    renderSupervisor_cor(payload);
    applyVisibility_cor(payload);
    renderKpis_cor(payload);
    renderCharts_cor(payload);
    renderFilters_cor(payload);
    renderTable_cor(payload);
    setStatus_cor('Información actualizada', 'ok');
  }

  async function load_cor(){
    const seq = ++state.requestSeq;
    setLoading_cor(true);
    setStatus_cor('Actualizando información...', 'loading');
    try{
      const payload = await requestJson_cor('/api/instalaciones/documentacion/bootstrap?' + queryString_cor());
      if(seq !== state.requestSeq) return;
      render_cor(payload || {});
      state.loaded = true;
    }catch(error){
      if(seq !== state.requestSeq) return;
      setStatus_cor(error.message || 'No se pudo cargar el módulo.', 'error');
      const tbody = $('idoc-cor-tbody');
      if(tbody) tbody.innerHTML = '<tr><td colspan="19" class="idoc-cor-empty">' + esc(error.message || 'Error consultando Documentación Pendiente.') + '</td></tr>';
    }finally{
      if(seq === state.requestSeq) setLoading_cor(false);
    }
  }

  function resetFilters_cor(){
    state.page = 1;
    state.q = '';
    state.estado = '';
    state.estatus = '';
    state.documentacion = 'TODOS';
    if($('idoc-cor-q')) $('idoc-cor-q').value = '';
    if($('idoc-cor-estado')) $('idoc-cor-estado').value = '';
    if($('idoc-cor-estatus')) $('idoc-cor-estatus').value = '';
    if($('idoc-cor-documentacion')) $('idoc-cor-documentacion').value = 'TODOS';
  }

  function bind_cor(){
    if(state.bound) return;
    state.bound = true;

    $('idoc-cor-refresh')?.addEventListener('click', () => load_cor());
    $('idoc-cor-clear')?.addEventListener('click', () => { resetFilters_cor(); load_cor(); });
    $('idoc-cor-prev')?.addEventListener('click', () => {
      if(state.page <= 1) return;
      state.page -= 1;
      load_cor();
    });
    $('idoc-cor-next')?.addEventListener('click', () => {
      const totalPages = Number(state.data?.pagination?.total_pages || 1);
      if(state.page >= totalPages) return;
      state.page += 1;
      load_cor();
    });

    $('idoc-cor-supervisor-select')?.addEventListener('change', event => {
      state.supervisorId = raw(event.target.value);
      resetFilters_cor();
      load_cor();
    });
    $('idoc-cor-estado')?.addEventListener('change', event => { state.estado = raw(event.target.value); state.page = 1; load_cor(); });
    $('idoc-cor-estatus')?.addEventListener('change', event => { state.estatus = raw(event.target.value); state.page = 1; load_cor(); });
    $('idoc-cor-documentacion')?.addEventListener('change', event => { state.documentacion = raw(event.target.value) || 'TODOS'; state.page = 1; load_cor(); });
    $('idoc-cor-q')?.addEventListener('input', event => {
      state.q = raw(event.target.value);
      state.page = 1;
      if(state.searchTimer) window.clearTimeout(state.searchTimer);
      state.searchTimer = window.setTimeout(() => load_cor(), 350);
    });
  }

  async function init_cor(){
    try{
      await loadHtml_cor();
      bind_cor();
      if(!state.loaded) await load_cor();
      else render_cor(state.data || {});
      return true;
    }catch(error){
      const view = view_cor();
      if(view){
        view.innerHTML = '<div class="idoc-cor-page"><section class="idoc-cor-card idoc-cor-head"><div><p class="idoc-cor-eyebrow">Instalaciones · Corellian</p><h1>Documentación Pendiente</h1><p>' + esc(error.message || 'No fue posible inicializar el módulo.') + '</p></div></section></div>';
      }
      return false;
    }
  }

  window.ManttoInstalacionesDocumentacion_cor = {
    init:init_cor,
    reload:load_cor
  };
})();

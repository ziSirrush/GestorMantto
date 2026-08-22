(function(){
  'use strict';

  const VERSION_COR = '20260821-paginacion-30-v002';
  const API_BASE = (window.MANTTO_API_BASE || 'http://localhost:3001').replace(/\/$/, '');
  const DEFAULT_PAGE_SIZE_COR = 30;

  const PERMISSIONS_COR = Object.freeze({
    selector_ver:'INSTALACIONES_AJUSTE_COMPORTAMIENTO_TIPO_SELECTOR.VER',
    selector_filtrar:'INSTALACIONES_AJUSTE_COMPORTAMIENTO_TIPO_SELECTOR.FILTRAR',
    resumen_ver:'INSTALACIONES_AJUSTE_COMPORTAMIENTO_TIPO_RESUMEN.VER',
    detalle_ver:'INSTALACIONES_AJUSTE_DETALLE_ANIO_LISTADO.VER',
    detalle_abrir:'INSTALACIONES_AJUSTE_DETALLE_ANIO_LISTADO.ABRIR_DETALLE'
  });

  const state = {
    ready:false,
    bound:false,
    loaded:false,
    loading:false,
    bootstrap:null,
    permissions:{},
    types:[],
    years:[],
    selectedType:'',
    selectedYear:'',
    behavior:null,
    detail:null,
    detailLimit:DEFAULT_PAGE_SIZE_COR,
    detailOffset:0
  };

  const $ = id => document.getElementById(id);
  const raw = value => value === null || value === undefined ? '' : String(value).trim();
  const esc = value => raw(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  function getView_cor(){
    return $('view-instalaciones-ajuste');
  }

  function authHeaders_cor(){
    return Object.assign(
      { Accept:'application/json' },
      window.ManttoAuth && window.ManttoAuth.authHeaders
        ? window.ManttoAuth.authHeaders()
        : {}
    );
  }

  async function fetchJson_cor(path){
    const response = await fetch(API_BASE + path, {
      headers:authHeaders_cor(),
      cache:'no-store'
    });
    const text = await response.text();
    let json = null;
    try{
      json = text ? JSON.parse(text) : null;
    }catch(_error){
      throw new Error('El backend respondió contenido no JSON.');
    }
    if(!response.ok || (json && json.ok === false)){
      const error = new Error((json && (json.message || json.error)) || ('Error HTTP ' + response.status));
      error.status = response.status;
      error.code = json && json.code;
      throw error;
    }
    return json || {};
  }

  async function loadHtml_cor(){
    const view = getView_cor();
    if(!view) throw new Error('No existe la vista view-instalaciones-ajuste.');
    if(view.dataset.iajCorReady === '1') return view;

    const response = await fetch(
      './modules/instalaciones-ajuste/instalaciones-ajuste_cor.html?v=' + VERSION_COR,
      { cache:'no-store' }
    );
    if(!response.ok) throw new Error('No se pudo cargar la vista Ajuste.');

    view.innerHTML = await response.text();
    view.dataset.iajCorReady = '1';
    return view;
  }

  function setStatus_cor(message, type){
    const status = $('iaj-cor-status');
    if(!status) return;
    status.textContent = message || '';
    status.dataset.type = type || 'ready';
  }

  function setLoading_cor(loading){
    state.loading = Boolean(loading);
    const refresh = $('iaj-cor-refresh');
    if(refresh) refresh.disabled = state.loading;
  }

  function formatNumber_cor(value){
    const number = Number(value);
    return Number.isFinite(number) ? number.toLocaleString('es-MX') : '0';
  }

  function formatDate_cor(value){
    const text = raw(value);
    if(!text || text === '-' || text === '.') return '—';

    const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(iso) return iso[3] + '/' + iso[2] + '/' + iso[1];

    const months = {
      JAN:'01', FEB:'02', MAR:'03', APR:'04', MAY:'05', JUN:'06',
      JUL:'07', AUG:'08', SEP:'09', OCT:'10', NOV:'11', DEC:'12'
    };
    const legacy = text.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2}|\d{4})$/);
    if(legacy){
      const month = months[String(legacy[2]).toUpperCase()];
      if(month){
        const year = legacy[3].length === 2 ? ('20' + legacy[3]) : legacy[3];
        return String(legacy[1]).padStart(2, '0') + '/' + month + '/' + year;
      }
    }

    return text;
  }

  function formatTimestamp_cor(){
    const date = new Date();
    const pad = value => String(value).padStart(2, '0');
    return pad(date.getDate()) + '/' + pad(date.getMonth() + 1) + '/' + date.getFullYear() +
      ' - ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
  }

  function displayDays_cor(value){
    return value === null || value === undefined || value === '' ? '—' : String(value);
  }

  function hasPermission_cor(key){
    return state.permissions[key] === true;
  }

  function applyPermissionUi_cor(){
    const selectorWrap = $('iaj-cor-type-selector-wrap');
    const typeSelect = $('iaj-cor-type-select');
    const behaviorResult = $('iaj-cor-behavior-result');
    const behaviorCard = $('iaj-cor-behavior-card');
    const detailCard = $('iaj-cor-detail-card');

    if(window.ManttoPermissions && typeof window.ManttoPermissions.apply === 'function'){
      window.ManttoPermissions.apply(getView_cor() || document);
    }

    if(selectorWrap) selectorWrap.hidden = !hasPermission_cor('comportamiento_selector_ver');
    if(typeSelect) typeSelect.disabled = state.loading || !hasPermission_cor('comportamiento_filtrar');
    if(behaviorResult) behaviorResult.hidden = !hasPermission_cor('comportamiento_resumen_ver');
    if(behaviorCard) behaviorCard.hidden = !hasPermission_cor('comportamiento_selector_ver');
    if(detailCard) detailCard.hidden = !hasPermission_cor('detalle_ver');
  }

  function populateTypeSelect_cor(){
    const select = $('iaj-cor-type-select');
    if(!select) return;

    const current = state.selectedType;
    select.innerHTML = '<option value="">Todos</option>' + state.types.map(item => {
      const levels = raw(item.numero_pisos) || '—';
      const capacity = raw(item.capacidad_kg) || '—';
      return '<option value="' + esc(item.clave) + '">' +
        esc(levels + ' niveles, ' + capacity + ' kg') +
        ' (' + formatNumber_cor(item.total_equipos) + ' equipos)</option>';
    }).join('');

    if(current && state.types.some(item => item.clave === current)){
      select.value = current;
    }else{
      state.selectedType = '';
      select.value = '';
    }
  }

  function populateYearSelect_cor(){
    const select = $('iaj-cor-year-select');
    if(!select) return;

    const current = state.selectedYear;
    const total = state.years.reduce((sum, item) => sum + (Number(item.total_equipos) || 0), 0);
    select.innerHTML = '<option value="">Todos los años (' + formatNumber_cor(total) + ')</option>' +
      state.years.map(item => '<option value="' + esc(item.valor) + '">' +
        esc(item.etiqueta) + ' (' + formatNumber_cor(item.total_equipos) + ')</option>').join('');

    if(current && state.years.some(item => item.valor === current)){
      select.value = current;
    }else{
      state.selectedYear = '';
      select.value = '';
    }
  }

  function renderBootstrap_cor(response){
    state.bootstrap = response;
    state.permissions = response && response.permisos ? response.permisos : {};
    state.types = Array.isArray(response && response.tipos_equipo) ? response.tipos_equipo : [];
    state.years = Array.isArray(response && response.anios) ? response.anios : [];

    populateTypeSelect_cor();
    populateYearSelect_cor();
    applyPermissionUi_cor();
  }

  function behaviorType_cor(){
    return state.types.find(item => item.clave === state.selectedType) || null;
  }

  function renderBehaviorChart_cor(rows){
    const host = $('iaj-cor-chart-wrap');
    if(!host) return;

    const values = [];
    rows.forEach(row => {
      [
        row.promedio_dias_inicio_real,
        row.promedio_dias_inicio_calidad,
        row.promedio_dias_inicio_cliente
      ].forEach(value => {
        const number = Number(value);
        if(Number.isFinite(number)) values.push(number);
      });
    });

    const rawMin = values.length ? Math.min(0, ...values) : 0;
    const rawMax = values.length ? Math.max(0, ...values) : 1;
    const minValue = rawMin < 0 ? Math.floor(rawMin / 10) * 10 : 0;
    const maxValue = rawMax > 0 ? Math.ceil(rawMax / 10) * 10 : 10;
    const range = Math.max(1, maxValue - minValue);
    const zeroPct = ((maxValue - 0) / range) * 100;
    const axisLabels = [
      maxValue,
      Math.round(maxValue - range * .25),
      Math.round(maxValue - range * .5),
      Math.round(maxValue - range * .75),
      minValue
    ];

    const bar = (value, className, label) => {
      const number = Number(value);
      if(!Number.isFinite(number)){
        return '<span class="iaj-cor-chart-lane" title="' + esc(label + ': sin dato') + '"></span>';
      }
      const top = number >= 0
        ? ((maxValue - number) / range) * 100
        : zeroPct;
      const height = Math.max(number === 0 ? 1 : 2, (Math.abs(number) / range) * 100);
      const labelClass = number < 0 ? ' iaj-cor-chart-value-negative' : '';
      return '<span class="iaj-cor-chart-lane" title="' + esc(label + ': ' + number + ' días') + '">' +
        '<span class="iaj-cor-chart-bar ' + className + '" style="top:' + top.toFixed(2) + '%;height:' + height.toFixed(2) + '%">' +
          '<em class="' + labelClass.trim() + '">' + esc(number) + '</em>' +
        '</span>' +
      '</span>';
    };

    host.innerHTML = '<div class="iaj-cor-chart">' +
      '<div class="iaj-cor-chart-y">' + axisLabels.map(value => '<span>' + esc(value) + '</span>').join('') + '</div>' +
      '<div class="iaj-cor-chart-years" style="--iaj-zero:' + zeroPct.toFixed(2) + '%">' + rows.map(row =>
        '<div class="iaj-cor-chart-year">' +
          '<div class="iaj-cor-chart-bars">' +
            '<i class="iaj-cor-zero-line" aria-hidden="true"></i>' +
            bar(row.promedio_dias_inicio_real, 'iaj-cor-bar-real', 'Inicio → Real') +
            bar(row.promedio_dias_inicio_calidad, 'iaj-cor-bar-quality', 'Inicio → Calidad') +
            bar(row.promedio_dias_inicio_cliente, 'iaj-cor-bar-client', 'Inicio → Cliente') +
          '</div>' +
          '<div class="iaj-cor-chart-label">' + esc(row.etiqueta_anio || row.anio || '—') + '</div>' +
        '</div>'
      ).join('') + '</div>' +
    '</div>';
  }

  function renderBehavior_cor(response){
    state.behavior = response;
    const rows = Array.isArray(response && response.por_anio) ? response.por_anio : [];
    const type = response && response.tipo ? response.tipo : behaviorType_cor();
    const empty = $('iaj-cor-behavior-empty');
    const content = $('iaj-cor-behavior-content');
    const selectedBox = $('iaj-cor-selected-type');
    const selectedCount = $('iaj-cor-selected-type-count');
    const label = $('iaj-cor-behavior-label');
    const body = $('iaj-cor-behavior-body');

    if(selectedBox) selectedBox.hidden = !type;
    if(selectedCount) selectedCount.textContent = formatNumber_cor(type && type.total_equipos);

    if(!rows.length){
      if(content) content.hidden = true;
      if(empty){
        empty.hidden = false;
        empty.innerHTML = '<span aria-hidden="true">📉</span><strong>Sin comportamiento calculable</strong>' +
          '<p>El tipo seleccionado no devolvió promedios por año.</p>';
      }
      return;
    }

    if(empty) empty.hidden = true;
    if(content) content.hidden = false;
    if(label){
      label.textContent = raw(type && type.numero_pisos) + ' niveles · ' +
        raw(type && type.capacidad_kg) + ' kg · ' + formatNumber_cor(type && type.total_equipos) + ' equipos';
    }
    if(body){
      body.innerHTML = rows.map(row => '<tr>' +
        '<td>' + esc(row.etiqueta_anio || row.anio || '—') + '</td>' +
        '<td>' + formatNumber_cor(row.total_equipos) + '</td>' +
        '<td>' + esc(displayDays_cor(row.promedio_dias_inicio_real)) + '</td>' +
        '<td>' + esc(displayDays_cor(row.promedio_dias_inicio_calidad)) + '</td>' +
        '<td>' + esc(displayDays_cor(row.promedio_dias_inicio_cliente)) + '</td>' +
      '</tr>').join('');
    }
    renderBehaviorChart_cor(rows);
  }

  function resetBehavior_cor(){
    state.behavior = null;
    const empty = $('iaj-cor-behavior-empty');
    const content = $('iaj-cor-behavior-content');
    const selectedBox = $('iaj-cor-selected-type');
    if(content) content.hidden = true;
    if(selectedBox) selectedBox.hidden = true;
    if(empty){
      empty.hidden = false;
      empty.innerHTML = '<span aria-hidden="true">📊</span><strong>Todos los tipos</strong>' +
        '<p>El listado muestra todos los equipos. Selecciona un tipo para mostrar su gráfica histórica.</p>';
    }
  }

  async function loadBehavior_cor(){
    if(!state.selectedType){
      resetBehavior_cor();
      return;
    }
    if(!hasPermission_cor('comportamiento_selector_ver') ||
       !hasPermission_cor('comportamiento_filtrar') ||
       !hasPermission_cor('comportamiento_resumen_ver')){
      resetBehavior_cor();
      return;
    }

    const type = behaviorType_cor();
    if(!type){
      resetBehavior_cor();
      return;
    }

    const select = $('iaj-cor-type-select');
    if(select) select.disabled = true;
    setStatus_cor('Actualizando comportamiento...', 'loading');
    try{
      const params = new URLSearchParams();
      params.set('numero_pisos', raw(type.numero_pisos));
      params.set('capacidad_kg', raw(type.capacidad_kg));
      const response = await fetchJson_cor('/api/instalaciones/ajuste/comportamiento?' + params.toString());
      renderBehavior_cor(response);
      setStatus_cor('Actualizado ' + formatTimestamp_cor(), 'ready');
    }catch(error){
      resetBehavior_cor();
      const empty = $('iaj-cor-behavior-empty');
      if(empty){
        empty.hidden = false;
        empty.innerHTML = '<span aria-hidden="true">⚠️</span><strong>No se pudo cargar el comportamiento</strong><p>' + esc(error.message) + '</p>';
      }
      setStatus_cor(error.message, 'error');
    }finally{
      applyPermissionUi_cor();
    }
  }

  function dayCell_cor(value){
    const negative = Number(value) < 0;
    return '<td class="iaj-cor-days' + (negative ? ' iaj-cor-days-negative' : '') + '">' +
      esc(displayDays_cor(value)) + '</td>';
  }

  function dateCell_cor(value, inverted){
    return '<td class="' + (inverted ? 'iaj-cor-date-inverted' : '') + '">' + esc(formatDate_cor(value)) + '</td>';
  }

  function detailRow_cor(row){
    const fechas = row && row.fechas ? row.fechas : {};
    const dias = row && row.dias ? row.dias : {};
    const inverted = row && row.inversiones_fecha ? row.inversiones_fecha : {};
    const canOpen = hasPermission_cor('detalle_abrir');
    const key = raw(row && row.proyecto) && raw(row && row.referencia_sitio)
      ? raw(row.proyecto) + '|||' + raw(row.referencia_sitio)
      : '';

    return '<tr' +
      (canOpen && key
        ? ' class="iaj-cor-clickable" tabindex="0" role="button" data-equipment-key="' + esc(key) + '" data-project="' + esc(row.proyecto) + '" data-reference="' + esc(row.referencia_sitio) + '"'
        : '') + '>' +
      '<td class="iaj-cor-project" title="' + esc(row.proyecto || '') + '">' + esc(row.proyecto || '—') + '</td>' +
      '<td class="iaj-cor-equipment">' + esc(row.referencia_sitio || '—') + '</td>' +
      '<td>' + esc(row.numero_pisos || '—') + '</td>' +
      '<td>' + esc(row.capacidad_kg || '—') + '</td>' +
      dateCell_cor(fechas.inicio_ajuste, false) +
      dateCell_cor(fechas.fin_teorico, inverted.fin_teorico_antes_inicio) +
      dayCell_cor(dias.inicio_teorico) +
      dateCell_cor(fechas.fin_real, inverted.fin_real_antes_inicio) +
      dayCell_cor(dias.inicio_real) +
      dateCell_cor(fechas.entrega_calidad, inverted.calidad_antes_real) +
      dayCell_cor(dias.inicio_calidad) +
      dateCell_cor(fechas.entrega_cliente, inverted.cliente_antes_calidad) +
      dayCell_cor(dias.inicio_cliente) +
    '</tr>';
  }

  function bindDetailRows_cor(){
    const body = $('iaj-cor-detail-body');
    if(!body) return;

    const open = row => {
      const key = row && row.dataset ? raw(row.dataset.equipmentKey) : '';
      if(!key || !hasPermission_cor('detalle_abrir')) return;
      if(window.ManttoRouter && typeof window.ManttoRouter.go === 'function'){
        window.ManttoRouter.go('detalle', {
          type:'equipo',
          id:key,
          source:'instalaciones-ajuste',
          projectName:raw(row.dataset.project),
          referencia_sitio:raw(row.dataset.reference)
        }, { navigationType:'open' });
      }
    };

    body.querySelectorAll('[data-equipment-key]').forEach(row => {
      row.addEventListener('click', () => open(row));
      row.addEventListener('keydown', event => {
        if(event.key === 'Enter' || event.key === ' '){
          event.preventDefault();
          open(row);
        }
      });
    });
  }

  function renderDetail_cor(response){
    state.detail = response;
    const body = $('iaj-cor-detail-body');
    const totalLabel = $('iaj-cor-detail-total');
    const summary = $('iaj-cor-page-summary');
    const pageNumber = $('iaj-cor-page-number');
    const prev = $('iaj-cor-prev');
    const next = $('iaj-cor-next');
    const pagination = response && response.pagination ? response.pagination : {};
    const rows = Array.isArray(response && response.data) ? response.data : [];
    const total = Number(pagination.total) || 0;
    const limit = Number(pagination.limit) || state.detailLimit;
    const offset = Number(pagination.offset) || 0;
    const start = total ? offset + 1 : 0;
    const end = Math.min(total, offset + rows.length);
    const page = limit > 0 ? Math.floor(offset / limit) + 1 : 1;

    const type = response && response.tipo;
    const typeLabel = type ? (' · ' + raw(type.numero_pisos) + ' niveles, ' + raw(type.capacidad_kg) + ' kg') : ' · Todos los tipos';
    if(totalLabel) totalLabel.textContent = formatNumber_cor(total) + ' equipos · ' + esc(response.etiqueta_anio || response.anio || 'Todos los años') + typeLabel;
    if(summary) summary.textContent = formatNumber_cor(start) + '-' + formatNumber_cor(end) + ' de ' + formatNumber_cor(total) + ' registros';
    if(pageNumber) pageNumber.textContent = String(page);
    if(prev) prev.disabled = offset <= 0;
    if(next) next.disabled = offset + rows.length >= total;

    if(body){
      body.innerHTML = rows.length
        ? rows.map(detailRow_cor).join('')
        : '<tr><td colspan="13" class="iaj-cor-empty-cell">Sin equipos calificados para los filtros seleccionados.</td></tr>';
    }
    bindDetailRows_cor();
  }

  function renderDetailLoading_cor(){
    const body = $('iaj-cor-detail-body');
    const prev = $('iaj-cor-prev');
    const next = $('iaj-cor-next');
    if(body) body.innerHTML = '<tr class="iaj-cor-loading-row"><td colspan="13">Cargando detalle...</td></tr>';
    if(prev) prev.disabled = true;
    if(next) next.disabled = true;
  }

  async function loadDetail_cor(){
    if(!hasPermission_cor('detalle_ver')) return;

    renderDetailLoading_cor();
    const yearSelect = $('iaj-cor-year-select');
    if(yearSelect) yearSelect.disabled = true;
    setStatus_cor('Actualizando detalle...', 'loading');

    try{
      const params = new URLSearchParams();
      if(state.selectedYear) params.set('anio', state.selectedYear);
      const type = behaviorType_cor();
      if(type){
        params.set('numero_pisos', raw(type.numero_pisos));
        params.set('capacidad_kg', raw(type.capacidad_kg));
      }
      params.set('limit', String(state.detailLimit));
      params.set('offset', String(state.detailOffset));
      const response = await fetchJson_cor('/api/instalaciones/ajuste/detalle?' + params.toString());
      renderDetail_cor(response);
      setStatus_cor('Actualizado ' + formatTimestamp_cor(), 'ready');
    }catch(error){
      const body = $('iaj-cor-detail-body');
      if(body) body.innerHTML = '<tr><td colspan="13" class="iaj-cor-empty-cell">' + esc(error.message) + '</td></tr>';
      setStatus_cor(error.message, 'error');
    }finally{
      if(yearSelect) yearSelect.disabled = false;
    }
  }

  async function refresh_cor(force){
    if(state.loading) return;
    if(state.loaded && !force) return;

    state.loading = true;
    setLoading_cor(true);
    setStatus_cor('Actualizando módulo...', 'loading');
    try{
      const previousType = state.selectedType;
      const previousYear = state.selectedYear;
      const response = await fetchJson_cor('/api/instalaciones/ajuste/bootstrap');
      state.selectedType = previousType;
      state.selectedYear = previousYear;
      renderBootstrap_cor(response);
      state.loaded = true;

      const tasks = [];
      if(state.selectedType && hasPermission_cor('comportamiento_filtrar') && hasPermission_cor('comportamiento_resumen_ver')){
        tasks.push(loadBehavior_cor());
      }else{
        resetBehavior_cor();
      }
      if(hasPermission_cor('detalle_ver')){
        state.detailOffset = 0;
        tasks.push(loadDetail_cor());
      }
      if(tasks.length) await Promise.all(tasks);
      else setStatus_cor('Actualizado ' + formatTimestamp_cor(), 'ready');
    }catch(error){
      setStatus_cor(error.message, 'error');
      const view = getView_cor();
      if(view && !state.loaded){
        const detailBody = $('iaj-cor-detail-body');
        if(detailBody) detailBody.innerHTML = '<tr><td colspan="13" class="iaj-cor-empty-cell">' + esc(error.message) + '</td></tr>';
      }
    }finally{
      state.loading = false;
      setLoading_cor(false);
      applyPermissionUi_cor();
    }
  }

  function bind_cor(){
    if(state.bound) return;
    state.bound = true;

    $('iaj-cor-refresh')?.addEventListener('click', () => refresh_cor(true));

    $('iaj-cor-type-select')?.addEventListener('change', event => {
      state.selectedType = event.target.value || '';
      state.detailOffset = 0;
      loadBehavior_cor();
      loadDetail_cor();
    });

    $('iaj-cor-year-select')?.addEventListener('change', event => {
      state.selectedYear = event.target.value || '';
      state.detailOffset = 0;
      loadDetail_cor();
    });

    $('iaj-cor-prev')?.addEventListener('click', () => {
      state.detailOffset = Math.max(0, state.detailOffset - state.detailLimit);
      loadDetail_cor();
    });

    $('iaj-cor-next')?.addEventListener('click', () => {
      const total = Number(state.detail && state.detail.pagination && state.detail.pagination.total) || 0;
      if(state.detailOffset + state.detailLimit >= total) return;
      state.detailOffset += state.detailLimit;
      loadDetail_cor();
    });
  }

  async function init_cor(){
    try{
      await loadHtml_cor();
      bind_cor();
      state.ready = true;
      applyPermissionUi_cor();
      if(!state.loaded) await refresh_cor(false);
    }catch(error){
      setStatus_cor(error.message, 'error');
    }
  }

  function resetOpenState_cor(){
    state.selectedType = '';
    state.selectedYear = '';
    state.behavior = null;
    state.detail = null;
    state.detailLimit = DEFAULT_PAGE_SIZE_COR;
    state.detailOffset = 0;
    state.loaded = false;

    resetBehavior_cor();
  }

  document.addEventListener('mantto:navigation', event => {
    const detail = event && event.detail ? event.detail : {};
    if(detail.route !== 'instalaciones-ajuste' || detail.type !== 'open') return;
    if(!state.ready && !state.loaded) return;
    if(state.loading) return;
    resetOpenState_cor();
    refresh_cor(true).catch(() => {});
  });

  document.addEventListener('mantto:permissions-updated', () => {
    const current = window.ManttoRouter && window.ManttoRouter.getCurrent
      ? window.ManttoRouter.getCurrent()
      : null;
    if(current && current.route === 'instalaciones-ajuste'){
      state.loaded = false;
      refresh_cor(true).catch(() => {});
    }
  });

  window.ManttoInstalacionesAjuste_cor = {
    init:init_cor,
    refresh:refresh_cor
  };
})();

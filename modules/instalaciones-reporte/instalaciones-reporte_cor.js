(function(){
  'use strict';

  const VERSION_COR = '20260901-pdf-sort-sup-edo-v001';
  const API_BASE = (window.MANTTO_API_BASE || 'http://localhost:3001').replace(/\/$/, '');
  const PAGE_SIZE = 30;
  const API_LIMIT = 5000;

  const STAGES = Object.freeze([
    { code:'03-PM', name:'Equipos Próximos a Montar', short:'Próx. Montar', color:'#eab308' },
    { code:'04-M', name:'Equipos en Montaje', short:'Montaje', color:'#2583d8' },
    { code:'05-PA', name:'Equipos Próximos a Ajustar', short:'Próx. Ajustar', color:'#6f58c9' },
    { code:'06-A', name:'Equipos en Ajuste', short:'Ajuste', color:'#32a6ae' },
    { code:'07-PE', name:'Equipos Próximos a Entregar', short:'Próx. Entregar', color:'#2f96a8' },
    { code:'01-SUS', name:'Equipos Suspendidos', short:'Suspendidos', color:'#e85b50' },
    { code:'08-T', name:'Equipos Entregados', short:'Entregados', color:'#3aa65a' }
  ]);

  const STAGE_BY_CODE = new Map(STAGES.map(stage => [stage.code, stage]));
  const FULL_VIEW_STATUSES = new Set(['01-SUS', '08-T']);
  const state = {
    ready:false,
    bound:false,
    loaded:false,
    loading:false,
    printing:false,
    response:null,
    rows:[],
    summary:new Map(),
    visualCatalog:new Map(),
    visualByStatus:new Map(),
    openStatus:'03-PM',
    pageByStatus:Object.fromEntries(STAGES.map(stage => [stage.code, 1])),
    tableModeByStatus:{
      '01-SUS':'paged',
      '08-T':'paged'
    }
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
    return $('view-instalaciones-reporte');
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
    if(!view) throw new Error('No existe la vista view-instalaciones-reporte.');
    if(view.dataset.irCorReady === '1') return view;

    const response = await fetch(
      './modules/instalaciones-reporte/instalaciones-reporte_cor.html?v=' + VERSION_COR,
      { cache:'no-store' }
    );
    if(!response.ok) throw new Error('No se pudo cargar la vista Reporte de Instalaciones.');

    view.innerHTML = await response.text();
    view.dataset.irCorReady = '1';
    return view;
  }

  function setStatus_cor(message, type){
    const status = $('ir-cor-status');
    if(!status) return;
    status.textContent = message || '';
    status.dataset.type = type || 'ready';
  }

  function setLoading_cor(loading){
    state.loading = !!loading;
    ['ir-cor-refresh', 'ir-cor-pdf', 'ir-cor-clear', 'ir-cor-supervisor', 'ir-cor-asesor', 'ir-cor-estatus', 'ir-cor-year'].forEach(id => {
      const element = $(id);
      if(element) element.disabled = !!loading;
    });
  }

  function formatDate_cor(value){
    const text = raw(value);
    if(!text || ['-', '.', 'N/A'].includes(text.toUpperCase())) return '—';
    const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(iso) return iso[3] + '/' + iso[2] + '/' + iso[1];
    const slash = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    if(slash) return String(slash[1]).padStart(2, '0') + '/' + String(slash[2]).padStart(2, '0') + '/' + slash[3];
    const monthMap = { JAN:'01', FEB:'02', MAR:'03', APR:'04', MAY:'05', JUN:'06', JUL:'07', AUG:'08', SEP:'09', OCT:'10', NOV:'11', DEC:'12' };
    const legacy = text.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2}|\d{4})$/);
    if(legacy){
      const month = monthMap[String(legacy[2]).toUpperCase()];
      if(month){
        const year = legacy[3].length === 2 ? ('20' + legacy[3]) : legacy[3];
        return String(legacy[1]).padStart(2, '0') + '/' + month + '/' + year;
      }
    }
    return text;
  }

  function formatTimestamp_cor(value){
    const date = value ? new Date(value) : new Date();
    if(Number.isNaN(date.getTime())) return 'Actualizado';
    const pad = number => String(number).padStart(2, '0');
    return pad(date.getDate()) + '/' + pad(date.getMonth() + 1) + '/' + date.getFullYear() +
      ' - ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
  }

  function formatPercent_cor(value){
    if(value === null || value === undefined || raw(value) === '') return '—';
    const number = Number(String(value).replace('%', '').replace(',', '.'));
    if(!Number.isFinite(number)) return raw(value) || '—';
    const percent = Math.abs(number) <= 1 ? number * 100 : number;
    return Math.round(percent) + '%';
  }

  function formatNumber_cor(value){
    const number = Number(value);
    return Number.isFinite(number) ? number.toLocaleString('es-MX') : '0';
  }

  function value_cor(value){
    const text = raw(value);
    return text || '—';
  }

  function currentFilter_cor(id){
    return $(id) ? $(id).value : '';
  }

  function currentFilters_cor(){
    return {
      supervisor:currentFilter_cor('ir-cor-supervisor'),
      asesor:currentFilter_cor('ir-cor-asesor'),
      estatus:currentFilter_cor('ir-cor-estatus'),
      anio_termino:currentFilter_cor('ir-cor-year')
    };
  }

  function addPersonFilter_cor(params, rawValue, idKey, nameKey){
    const value = raw(rawValue);
    if(!value) return;
    const separator = value.indexOf(':');
    if(separator < 0) return;
    const type = value.slice(0, separator);
    const payload = value.slice(separator + 1);
    if(type === 'id' && /^\d+$/.test(payload)) params.set(idKey, payload);
    else if(type === 'name' && payload) params.set(nameKey, payload);
  }

  function buildQuery_cor(options){
    const config = options || {};
    const filters = currentFilters_cor();
    const params = new URLSearchParams();
    const limit = Math.min(Math.max(Number(config.limit) || API_LIMIT, 1), API_LIMIT);
    const offset = Math.max(Number(config.offset) || 0, 0);
    params.set('limit', String(limit));
    params.set('offset', String(offset));
    addPersonFilter_cor(params, filters.supervisor, 'id_sup', 'supervisor');
    addPersonFilter_cor(params, filters.asesor, 'id_asesor', 'asesor');
    if(filters.estatus) params.set('estatus', filters.estatus);
    if(filters.anio_termino) params.set('anio_termino', filters.anio_termino);
    return params.toString();
  }

  function resetPages_cor(){
    STAGES.forEach(stage => { state.pageByStatus[stage.code] = 1; });
  }

  function optionValue_cor(row, idKey){
    const id = Number(row && row[idKey]);
    if(Number.isInteger(id) && id > 0) return 'id:' + id;
    const name = raw(row && row.nombre);
    return name ? 'name:' + name : '';
  }

  function setSelectOptions_cor(select, options, placeholder, selected){
    if(!select) return;
    select.innerHTML = '<option value="">' + esc(placeholder) + '</option>' + options.join('');
    if(selected && Array.from(select.options).some(option => option.value === selected)){
      select.value = selected;
    }
  }

  function populateFilters_cor(response){
    const selected = currentFilters_cor();
    const filters = response && response.filters ? response.filters : {};

    const supervisorOptions = (Array.isArray(filters.supervisores) ? filters.supervisores : [])
      .map(row => {
        const optionValue = optionValue_cor(row, 'id_sup');
        if(!optionValue) return '';
        return '<option value="' + esc(optionValue) + '">' + esc(value_cor(row.nombre)) +
          ' (' + formatNumber_cor(row.total) + ')</option>';
      }).filter(Boolean);

    const advisorOptions = (Array.isArray(filters.asesores) ? filters.asesores : [])
      .map(row => {
        const optionValue = optionValue_cor(row, 'id_asesor');
        if(!optionValue) return '';
        return '<option value="' + esc(optionValue) + '">' + esc(value_cor(row.nombre)) +
          ' (' + formatNumber_cor(row.total) + ')</option>';
      }).filter(Boolean);

    const statusRows = new Map(
      (Array.isArray(filters.estatus) ? filters.estatus : [])
        .map(row => [raw(row && row.codigo).toUpperCase(), row])
    );
    const statusOptions = STAGES.map(stage => {
      const row = statusRows.get(stage.code) || {};
      return '<option value="' + esc(stage.code) + '">' + esc(stage.code + ' · ' + stage.name) +
        ' (' + formatNumber_cor(row.total || 0) + ')</option>';
    });

    setSelectOptions_cor($('ir-cor-supervisor'), supervisorOptions, 'Todos', selected.supervisor);
    setSelectOptions_cor($('ir-cor-asesor'), advisorOptions, 'Todos', selected.asesor);
    setSelectOptions_cor($('ir-cor-estatus'), statusOptions, 'Todos los estatus', selected.estatus);

    const yearSelect = $('ir-cor-year');
    if(yearSelect){
      const years = (Array.isArray(filters.anios_entregados) ? filters.anios_entregados : [])
        .map(year => Number(year))
        .filter(year => Number.isInteger(year) && year > 0);
      const responseYear = Number(response && response.anio_entregados);
      const preferredYear = /^\d{4}$/.test(raw(selected.anio_termino))
        ? Number(selected.anio_termino)
        : (Number.isInteger(responseYear) ? responseYear : (years[0] || null));

      if(years.length){
        yearSelect.innerHTML = years.map(year => '<option value="' + year + '">' + year + '</option>').join('');
        yearSelect.value = years.includes(preferredYear) ? String(preferredYear) : String(years[0]);
      }else{
        yearSelect.innerHTML = '<option value="">Sin años disponibles</option>';
        yearSelect.value = '';
      }
    }
  }

  function syncResponse_cor(response){
    state.response = response;
    state.rows = Array.isArray(response && response.data) ? response.data : [];
    state.summary = new Map();
    const summaryRows = response && response.summary && Array.isArray(response.summary.por_estatus)
      ? response.summary.por_estatus
      : [];
    summaryRows.forEach(row => state.summary.set(String(row.codigo), Number(row.total || 0)));

    state.visualCatalog = new Map();
    state.visualByStatus = new Map();
    const visualConfig = response && response.estados_visuales ? response.estados_visuales : {};
    const visualCatalog = Array.isArray(visualConfig.catalogo) ? visualConfig.catalogo : [];
    visualCatalog.forEach(item => {
      const code = raw(item && item.codigo);
      if(code) state.visualCatalog.set(code, item);
    });
    const visualByStatus = visualConfig && visualConfig.por_estatus && typeof visualConfig.por_estatus === 'object'
      ? visualConfig.por_estatus
      : {};
    STAGES.forEach(stage => {
      state.visualByStatus.set(stage.code, Array.isArray(visualByStatus[stage.code]) ? visualByStatus[stage.code] : []);
    });

    const selectedStatus = currentFilter_cor('ir-cor-estatus');
    if(selectedStatus && STAGE_BY_CODE.has(selectedStatus)) state.openStatus = selectedStatus;
    else if(!STAGE_BY_CODE.has(state.openStatus) || Number(state.summary.get(state.openStatus) || 0) === 0){
      const firstWithData = STAGES.find(stage => Number(state.summary.get(stage.code) || 0) > 0);
      state.openStatus = firstWithData ? firstWithData.code : '03-PM';
    }
  }

  function stageTotal_cor(code){
    return Number(state.summary.get(code) || 0);
  }

  function stageRows_cor(code){
    return state.rows.filter(row => raw(row.estatus).toUpperCase() === code);
  }

  function reportTotal_cor(){
    return STAGES.reduce((total, stage) => total + stageTotal_cor(stage.code), 0);
  }

  function renderStages_cor(){
    const root = $('ir-cor-stages');
    if(!root) return;
    root.innerHTML = STAGES.map(stage => {
      const active = state.openStatus === stage.code ? ' active' : '';
      return '<button class="ir-cor-stage' + active + '" type="button" data-ir-stage="' + esc(stage.code) +
        '" style="--stage-color:' + esc(stage.color) + '">' +
        '<span class="ir-cor-stage-code">' + esc(stage.code) + '</span>' +
        '<span class="ir-cor-stage-name">' + esc(stage.short) + '</span>' +
        '<strong class="ir-cor-stage-total">' + formatNumber_cor(stageTotal_cor(stage.code)) + '</strong>' +
        '</button>';
    }).join('');
  }

  function renderChart_cor(){
    const root = $('ir-cor-chart');
    if(!root) return;
    const max = Math.max(1, ...STAGES.map(stage => stageTotal_cor(stage.code)));
    root.innerHTML = STAGES.map(stage => {
      const total = stageTotal_cor(stage.code);
      const width = Math.max(total > 0 ? 3 : 0, Math.round((total / max) * 100));
      return '<div class="ir-cor-bar-row" style="--stage-color:' + esc(stage.color) + '">' +
        '<span class="ir-cor-bar-label">' + esc(stage.code) + '</span>' +
        '<div class="ir-cor-bar-track"><div class="ir-cor-bar-fill" style="width:' + width + '%"></div></div>' +
        '<span class="ir-cor-bar-value">' + formatNumber_cor(total) + '</span>' +
        '</div>';
    }).join('');
    const total = reportTotal_cor();
    if($('ir-cor-total')) $('ir-cor-total').textContent = formatNumber_cor(total) + ' equipo(s)';
    if($('ir-cor-side-total')) $('ir-cor-side-total').textContent = formatNumber_cor(total) + ' equipo(s)';
  }

  function renderLegend_cor(){
    const root = $('ir-cor-stage-legend');
    if(!root) return;
    root.innerHTML = STAGES.map(stage =>
      '<div class="ir-cor-legend-row" style="--stage-color:' + esc(stage.color) + '">' +
      '<span class="ir-cor-legend-dot"></span><b>' + esc(stage.code) + '</b><span>' + esc(stage.short) + '</span></div>'
    ).join('');
  }

  function safeColor_cor(value, fallback){
    const text = raw(value);
    return /^#[0-9a-fA-F]{6}$/.test(text) ? text : fallback;
  }

  function visualStatesForRow_cor(row){
    const codes = Array.isArray(row && row.estados_visuales_codigos) ? row.estados_visuales_codigos : [];
    return codes.map(code => state.visualCatalog.get(raw(code))).filter(Boolean);
  }

  function visualBadge_cor(item, withName){
    if(!item) return '';
    const emoji = raw(item.emoji) || '•';
    const name = raw(item.nombre) || raw(item.codigo) || 'Estado visual';
    const description = raw(item.descripcion);
    const title = description ? (name + ' · ' + description) : name;
    const text = safeColor_cor(item.color_texto, '#0f172a');
    const background = safeColor_cor(item.color_fondo, '#f8fafc');
    const border = safeColor_cor(item.color_borde, '#cbd5e1');
    return '<span class="ir-cor-visual-badge' + (withName ? ' ir-cor-visual-badge-wide' : '') + '"' +
      ' title="' + esc(title) + '" aria-label="' + esc(name) + '"' +
      ' style="--ir-ev-text:' + esc(text) + ';--ir-ev-bg:' + esc(background) + ';--ir-ev-border:' + esc(border) + '">' +
      '<span aria-hidden="true">' + esc(emoji) + '</span>' + (withName ? '<span>' + esc(name) + '</span>' : '') + '</span>';
  }

  function visualStatesCell_cor(row){
    const items = visualStatesForRow_cor(row);
    if(!items.length) return '<span class="ir-cor-no-visual-state">—</span>';
    const title = items.map(item => raw(item.nombre) || raw(item.codigo)).filter(Boolean).join(' | ');
    return '<div class="ir-cor-visual-list" title="' + esc(title) + '">' +
      items.map(item => visualBadge_cor(item, false)).join('') + '</div>';
  }

  function stageVisualLegendHtml_cor(code){
    const items = state.visualByStatus.get(code) || [];
    if(!items.length) return '';
    return '<div class="ir-cor-visual-legend" aria-label="Leyenda de estados visuales">' +
      '<strong>Estados visuales</strong><div class="ir-cor-visual-legend-items">' +
      items.map(item => visualBadge_cor(item, true)).join('') +
      '</div></div>';
  }

  function baseColumns_cor(code){
    const columns = [
      { label:'SUP', value:row => value_cor(row.supervisor_fl) }
    ];
    if((state.visualByStatus.get(code) || []).length){
      columns.push({ label:'NOTIF', html:row => visualStatesCell_cor(row), className:'ir-cor-notif-cell' });
    }
    columns.push(
      { label:'EDO', value:row => value_cor(row.estado) },
      { label:'PROYECTO', html:row => '<button type="button" class="ir-cor-project-link" data-ir-project="' + esc(row.id_proyecto) + '" data-ir-project-name="' + esc(row.proyecto) + '">' + esc(value_cor(row.proyecto)) + '</button>' },
      { label:'REFERENCIA', value:row => value_cor(row.referencia_sitio) }
    );
    return columns;
  }

  function stageColumns_cor(code){
    const commonOc = [
      { label:'CPVP', value:row => formatDate_cor(row.fecha_cpvp) },
      { label:'FABRICACIÓN', value:row => value_cor(row.estatus_produccion) },
      { label:'FECHA DE DESCARGA', value:row => formatDate_cor(row.fecha_descarga) },
      { label:'ÚLTIMA VISITA', value:row => formatDate_cor(row.fecha_visita) },
      { label:'COMENTARIO', value:row => value_cor(row.comentarios_fl), className:'ir-cor-comment' },
      { label:'% OC', value:row => formatPercent_cor(row.avance_oc) },
      { label:'ÚLTIMA CCNR', value:row => formatDate_cor(row.fecha_ccnr) }
    ];

    if(code === '01-SUS' || code === '02-OC') return commonOc;
    if(code === '03-PM') return commonOc.concat([
      { label:'POSIBLE RECEPCIÓN DE CUBO', value:row => formatDate_cor(row.fecha_posible_recepcion_cubo) }
    ]);
    if(code === '04-M') return [
      { label:'CCR', value:row => formatDate_cor(row.fecha_ccr) },
      { label:'SUB', value:row => value_cor(row.subcontratista) },
      { label:'INICIO DE MONTAJE', value:row => formatDate_cor(row.fecha_inicio_montaje) },
      { label:'FIN DE MONTAJE', value:row => formatDate_cor(row.fecha_fin_montaje_modificado || row.fecha_fin_montaje_planeado) },
      { label:'DÍAS RESTANTES', value:row => value_cor(row.dias_restantes) },
      { label:'ÚLTIMA VISITA', value:row => formatDate_cor(row.fecha_visita) },
      { label:'% M', value:row => formatPercent_cor(row.avance_mo) },
      { label:'COMENTARIO', value:row => value_cor(row.comentarios_fl), className:'ir-cor-comment' }
    ];
    if(code === '05-PA') return [
      { label:'REVISIÓN POR SUPERVISOR', value:row => formatDate_cor(row.fecha_revision_supervisor) },
      { label:'REVISIÓN POR AJUSTE', value:row => formatDate_cor(row.fecha_minuta_revision_ajuste) },
      { label:'¿LIBERADO?', value:row => value_cor(row.fecha_liberacion_ajuste) },
      { label:'CTI', value:row => formatDate_cor(row.fecha_cti) },
      { label:'ÚLTIMA VISITA', value:row => formatDate_cor(row.fecha_visita) },
      { label:'COMENTARIO', value:row => value_cor(row.comentarios_fl), className:'ir-cor-comment' },
      { label:'POSIBLE INICIO DE AJUSTE', value:row => formatDate_cor(row.fecha_posible_inicio_ajuste) }
    ];
    if(code === '06-A') return [
      { label:'AJUSTADOR', value:row => value_cor(row.ajustador) },
      { label:'INICIO DE AJUSTE', value:row => formatDate_cor(row.fecha_inicio_ajuste) },
      { label:'FIN DE AJUSTE', value:row => formatDate_cor(row.fecha_fin_ajuste_planeado) },
      { label:'FIN DE AJUSTE MODIFICADO', value:row => formatDate_cor(row.fecha_fin_ajuste_modificado) },
      { label:'COMENTARIO', value:row => value_cor(row.comentarios_fl), className:'ir-cor-comment' }
    ];
    if(code === '07-PE' || code === '08-T') return [
      { label:'INSPECCIÓN DE CALIDAD', value:row => formatDate_cor(row.fecha_protocolo_aceptacion) },
      { label:'ESTATUS DE INSPECCIÓN', value:row => value_cor(row.estatus_inspeccion_calidad) },
      { label:'¿PENDIENTES?', value:row => value_cor(row.pendientes_calidad) },
      { label:'ENTREGA AL CLIENTE (CAF-PG)', value:row => formatDate_cor(row.fecha_entrega_cliente) },
      { label:'FORMATO', value:row => value_cor(row.formato_caf_pg) },
      { label:'EL EQUIPO SE QUEDA', value:row => value_cor(row.estatus_equipo_entrega) }
    ];
    return [];
  }

  function rowCell_cor(column, row){
    const className = column.className ? ' class="' + esc(column.className) + '"' : '';
    if(typeof column.html === 'function') return '<td' + className + '>' + column.html(row) + '</td>';
    const text = typeof column.value === 'function' ? column.value(row) : '—';
    return '<td' + className + '>' + esc(text) + '</td>';
  }

  function tableHtml_cor(stage){
    const rows = stageRows_cor(stage.code);
    const columns = baseColumns_cor(stage.code).concat(stageColumns_cor(stage.code));
    const supportsFullView = FULL_VIEW_STATUSES.has(stage.code);
    const tableMode = supportsFullView && state.tableModeByStatus[stage.code] === 'full'
      ? 'full'
      : 'paged';
    const showAll = tableMode === 'full';
    const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    const currentPage = Math.min(Math.max(Number(state.pageByStatus[stage.code] || 1), 1), pageCount);
    state.pageByStatus[stage.code] = currentPage;
    const start = (currentPage - 1) * PAGE_SIZE;
    const pageRows = showAll ? rows : rows.slice(start, start + PAGE_SIZE);
    const body = pageRows.length
      ? pageRows.map(row => '<tr>' + columns.map(column => rowCell_cor(column, row)).join('') + '</tr>').join('')
      : '<tr><td class="ir-cor-empty-cell" colspan="' + columns.length + '">Sin registros cargados para esta etapa.</td></tr>';
    const modeToolbar = supportsFullView
      ? '<div class="ir-cor-table-toolbar"><span>Vista de tabla</span><div class="ir-cor-table-mode" role="group" aria-label="Vista de ' + esc(stage.code) + '">' +
        '<button type="button" data-ir-table-mode="paged" data-ir-table-status="' + esc(stage.code) + '" class="' + (showAll ? '' : 'active') + '">30 por página</button>' +
        '<button type="button" data-ir-table-mode="full" data-ir-table-status="' + esc(stage.code) + '" class="' + (showAll ? 'active' : '') + '">Tabla completa</button>' +
        '</div></div>'
      : '';
    const pager = showAll
      ? '<div class="ir-cor-pager"><strong>Vista completa</strong></div>'
      : '<div class="ir-cor-pager">' +
        '<button type="button" data-ir-page-prev="' + esc(stage.code) + '"' + (currentPage <= 1 ? ' disabled' : '') + '>‹</button>' +
        '<strong>' + currentPage + ' / ' + pageCount + '</strong>' +
        '<button type="button" data-ir-page-next="' + esc(stage.code) + '"' + (currentPage >= pageCount ? ' disabled' : '') + '>›</button>' +
        '</div>';

    return stageVisualLegendHtml_cor(stage.code) + modeToolbar +
      '<div class="ir-cor-table-wrap"><table class="ir-cor-table"><thead><tr>' +
      columns.map(column => '<th>' + esc(column.label) + '</th>').join('') +
      '</tr></thead><tbody>' + body + '</tbody></table></div>' +
      '<div class="ir-cor-table-footer"><span>Mostrando ' + formatNumber_cor(pageRows.length) + ' de ' + formatNumber_cor(rows.length) +
      ' registro(s)</span>' + pager +
      '<span class="ir-cor-page-size">' + (showAll ? 'Todos los registros' : '30 por página') + '</span></div>';
  }

  function renderSections_cor(){
    const root = $('ir-cor-sections');
    if(!root) return;
    const selectedStatus = currentFilter_cor('ir-cor-estatus');
    const visibleStages = selectedStatus ? STAGES.filter(stage => stage.code === selectedStatus) : STAGES;

    root.innerHTML = visibleStages.map(stage => {
      const open = state.openStatus === stage.code;
      return '<section class="ir-cor-accordion' + (open ? ' open' : '') + '" data-ir-accordion="' + esc(stage.code) + '" style="--stage-color:' + esc(stage.color) + '">' +
        '<button class="ir-cor-accordion-toggle" type="button" data-ir-toggle="' + esc(stage.code) + '" aria-expanded="' + (open ? 'true' : 'false') + '">' +
        '<span class="ir-cor-accordion-title"><b class="ir-cor-accordion-code">' + esc(stage.code) + '</b><span class="ir-cor-accordion-name">' + esc(stage.name) + '</span></span>' +
        '<span class="ir-cor-accordion-count">' + formatNumber_cor(stageTotal_cor(stage.code)) + ' registros</span>' +
        '<span class="ir-cor-accordion-chevron" aria-hidden="true">⌄</span></button>' +
        '<div class="ir-cor-accordion-body"' + (open ? '' : ' hidden') + '>' + (open ? tableHtml_cor(stage) : '') + '</div></section>';
    }).join('');
  }

  function renderEmpty_cor(){
    const total = reportTotal_cor();
    const empty = $('ir-cor-empty');
    if(empty) empty.hidden = total !== 0;
  }

  function renderMeta_cor(){
    const pagination = state.response && state.response.pagination ? state.response.pagination : {};
    const total = Number(pagination.total || 0);
    const returned = Number(pagination.returned || 0);
    const updated = formatTimestamp_cor(state.response && state.response.generated_at);
    setStatus_cor(returned < total ? ('Actualizado ' + updated + ' · ' + returned + ' de ' + total) : ('Actualizado ' + updated), 'ready');
    if($('ir-cor-side-updated')) $('ir-cor-side-updated').textContent = 'Última actualización: ' + updated;
  }

  function selectedOptionLabel_cor(id, fallback){
    const select = $(id);
    if(!select) return fallback || 'Todos';
    const option = select.options && select.selectedIndex >= 0 ? select.options[select.selectedIndex] : null;
    const label = raw(option && option.textContent) || fallback || 'Todos';
    return label.replace(/\s+\([\d.,]+\)\s*$/, '');
  }

  function printDate_cor(){
    return new Date().toLocaleDateString('es-MX');
  }

  function printFilenameDate_cor(){
    const date = new Date();
    const pad = number => String(number).padStart(2, '0');
    return date.getFullYear() + pad(date.getMonth() + 1) + pad(date.getDate());
  }

  const PDF_LEGEND_BY_STATUS_COR = Object.freeze({
    '02-OC':'✂️ Mayor a 200 dias sin visita (posible suspension) &middot; 📅 Requiere visita &middot; ⚠️ Actualizar CCNR &middot; ‼️ Falta 1era CCNR',
    '03-PM':'📌 Deberia estar en montaje (100% OC) &middot; ☢️ Programar montador (95%+ OC) &middot; 📅 Requiere visita &middot; ⚠️ Actualizar CCNR &middot; ‼️ Falta 1era CCNR',
    '04-M':'🟡 Dias restantes &le;14 &middot; 🟠 &le;7 &middot; 🔴 &le;3 &middot; 🚫 Falta CCR &middot; ⏰ Montaje con atraso &middot; 📅 Requiere visita',
    '05-PA':'👁️ Falta rev supervisor &middot; 👎 No liberado por ajuste &middot; 🚫 Falta CTI &middot; 📅 Requiere visita',
    '06-A':'⏰ Ajuste con retraso &middot; ❌ Fin ajuste modificado &middot; 📅 Requiere visita &middot; 👁️ Falta rev supervisor &middot; 👎 No liberado por ajuste &middot; 🚫 Falta CTI',
    '07-PE':'❌ Pendientes calidad',
    '08-T':'❌ Pendientes calidad &middot; 🚫 Formato original falta &middot; 🛑 Se queda detenido'
  });

  const PDF_STAGE_COLUMNS_COR = Object.freeze({
    '01-SUS':Object.freeze([
      ['CPVP','fecha_cpvp','fecha'], ['FABRICACIÓN','estatus_produccion','texto'],
      ['FECHA DE DESCARGA','fecha_descarga','fecha'], ['ULTIMA VISITA','fecha_visita','fecha'],
      ['COMENTARIO','comentarios_fl','comentario'], ['% OC','avance_oc','pct'], ['ULTIMA CCNR','fecha_ccnr','fecha']
    ]),
    '02-OC':Object.freeze([
      ['CPVP','fecha_cpvp','fecha'], ['FABRICACIÓN','estatus_produccion','texto'],
      ['FECHA DE DESCARGA','fecha_descarga','fecha'], ['ULTIMA VISITA','fecha_visita','fecha'],
      ['COMENTARIO','comentarios_fl','comentario'], ['% OC','avance_oc','pct'], ['ULTIMA CCNR','fecha_ccnr','fecha']
    ]),
    '03-PM':Object.freeze([
      ['CPVP','fecha_cpvp','fecha'], ['FABRICACIÓN','estatus_produccion','texto'],
      ['FECHA DE DESCARGA','fecha_descarga','fecha'], ['ULTIMA VISITA','fecha_visita','fecha'],
      ['COMENTARIO','comentarios_fl','comentario'], ['% OC','avance_oc','pct'], ['ULTIMA CCNR','fecha_ccnr','fecha'],
      ['POSIBLE RECEPCIÓN DE CUBO','fecha_posible_recepcion_cubo','fecha']
    ]),
    '04-M':Object.freeze([
      ['CCR','fecha_ccr','fecha'], ['SUB','subcontratista','texto'],
      ['INICIO DE MONTAJE','fecha_inicio_montaje','fecha'], ['FIN DE MONTAJE',['fecha_fin_montaje_modificado','fecha_fin_montaje_planeado'],'fecha'],
      ['DIAS RESTANTES','dias_restantes','texto'], ['ULTIMA VISITA','fecha_visita','fecha'],
      ['% M','avance_mo','pct'], ['COMENTARIO','comentarios_fl','comentario']
    ]),
    '05-PA':Object.freeze([
      ['REVISIÓN POR SUPERVISOR','fecha_revision_supervisor','fecha'], ['REVISIÓN POR AJUSTE','fecha_minuta_revision_ajuste','fecha'],
      ['¿LIBERADO?','fecha_liberacion_ajuste','texto'], ['CTI','fecha_cti','fecha'],
      ['ULTIMA VISITA','fecha_visita','fecha'], ['COMENTARIO','comentarios_fl','comentario'],
      ['POSIBLE INICIO DE AJUSTE','fecha_posible_inicio_ajuste','fecha']
    ]),
    '06-A':Object.freeze([
      ['AJUSTADOR','ajustador','texto'], ['INICIO DE AJUSTE','fecha_inicio_ajuste','fecha'],
      ['FIN DE AJUSTE','fecha_fin_ajuste_planeado','fecha'], ['FIN DE AJUSTE MODIFICADO','fecha_fin_ajuste_modificado','fecha'],
      ['COMENTARIO','comentarios_fl','comentario']
    ]),
    '07-PE':Object.freeze([
      ['INSPECCIÓN DE CALIDAD','fecha_protocolo_aceptacion','fecha'], ['ESTATUS DE INSPECCIÓN','estatus_inspeccion_calidad','texto'],
      ['¿PENDIENTES?','pendientes_calidad','texto'], ['ENTREGA AL CLIENTE (CAF-PG)','fecha_entrega_cliente','fecha'],
      ['FORMATO','formato_caf_pg','texto'], ['EL EQUIPO SE QUEDA','estatus_equipo_entrega','texto']
    ]),
    '08-T':Object.freeze([
      ['INSPECCIÓN DE CALIDAD','fecha_protocolo_aceptacion','fecha'], ['ESTATUS DE INSPECCIÓN','estatus_inspeccion_calidad','texto'],
      ['¿PENDIENTES?','pendientes_calidad','texto'], ['ENTREGA AL CLIENTE (CAF-PG)','fecha_entrega_cliente','fecha'],
      ['FORMATO','formato_caf_pg','texto'], ['EL EQUIPO SE QUEDA','estatus_equipo_entrega','texto']
    ])
  });

  const PDF_WIDTH_DATE_COR = 88;
  const PDF_WIDTH_COMMENT_COR = Math.round(PDF_WIDTH_DATE_COR * 2.5);

  function stageRowsFrom_cor(rows, code){
    const deliveredYear = Number(state.response && state.response.anio_entregados);
    return (Array.isArray(rows) ? rows : []).filter(row => {
      if(raw(row.estatus).toUpperCase() !== code) return false;
      if(code !== '08-T' || !Number.isInteger(deliveredYear)) return true;
      return Number(String(row.anio_termino || '').trim()) === deliveredYear;
    });
  }

  function uniqueRows_cor(rows){
    const result = [];
    const seen = new Set();
    (Array.isArray(rows) ? rows : []).forEach((row, index) => {
      const id = Number(row && row.id_ins_fl);
      const key = Number.isInteger(id) && id > 0
        ? ('id:' + id)
        : ('fallback:' + raw(row && row.id_proyecto) + '|' + raw(row && row.referencia_sitio) + '|' + index);
      if(seen.has(key)) return;
      seen.add(key);
      result.push(row);
    });
    return result;
  }

  async function rowsForPrint_cor(){
    const pagination = state.response && state.response.pagination ? state.response.pagination : {};
    const total = Math.max(Number(pagination.total || 0), state.rows.length);
    let rows = uniqueRows_cor(state.rows);
    if(rows.length >= total) return rows;

    let offset = Math.max(Number(pagination.offset || 0) + Number(pagination.returned || state.rows.length), state.rows.length);
    while(offset < total){
      const response = await fetchJson_cor('/api/instalaciones/reporte?' + buildQuery_cor({ limit:API_LIMIT, offset }));
      const batch = Array.isArray(response && response.data) ? response.data : [];
      if(!batch.length) break;
      rows = uniqueRows_cor(rows.concat(batch));
      offset += batch.length;
    }

    if(rows.length < total){
      throw new Error('No fue posible recuperar todos los registros del reporte para el PDF (' + rows.length + ' de ' + total + ').');
    }
    return rows;
  }

  function pdfLegacyStages_cor(){
    const selectedStatus = currentFilter_cor('ir-cor-estatus');
    const obraCivil = Object.freeze({
      code:'02-OC',
      name:'Equipos en Obra Civil',
      short:'Obra Civil',
      color:'#64748b'
    });
    const pdfStages = [];
    STAGES.forEach(stage => {
      pdfStages.push(stage);
      if(stage.code === '01-SUS') pdfStages.push(obraCivil);
    });
    return selectedStatus ? pdfStages.filter(stage => stage.code === selectedStatus) : pdfStages;
  }

  function pdfLegacySortBySupervisorEstado_cor(rows){
    return (Array.isArray(rows) ? rows : []).slice().sort((a, b) => {
      const supervisorOrder = raw(a && a.supervisor_fl).localeCompare(
        raw(b && b.supervisor_fl), 'es', { sensitivity:'base' }
      );
      if(supervisorOrder !== 0) return supervisorOrder;

      const estadoOrder = raw(a && a.estado).localeCompare(
        raw(b && b.estado), 'es', { sensitivity:'base' }
      );
      if(estadoOrder !== 0) return estadoOrder;

      const proyectoOrder = raw(a && a.proyecto).localeCompare(
        raw(b && b.proyecto), 'es', { sensitivity:'base' }
      );
      if(proyectoOrder !== 0) return proyectoOrder;

      const referenciaOrder = raw(a && a.referencia_sitio).localeCompare(
        raw(b && b.referencia_sitio), 'es', { sensitivity:'base' }
      );
      if(referenciaOrder !== 0) return referenciaOrder;

      return Number(a && a.id_ins_fl || 0) - Number(b && b.id_ins_fl || 0);
    });
  }

  function pdfLegacyFormatValue_cor(value, type){
    if(type === 'pct') return formatPercent_cor(value).replace('—', '-');
    if(value === null || value === undefined || value === '') return '-';
    const text = String(value);
    if(type === 'fecha' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(text)) return text.slice(0, 10);
    return text === '—' ? '-' : text;
  }

  function pdfLegacyValueFromFields_cor(row, fieldOrFields){
    const fields = Array.isArray(fieldOrFields) ? fieldOrFields : [fieldOrFields];
    for(const field of fields){
      const value = row ? row[field] : null;
      if(value !== null && value !== undefined && value !== '' && value !== '-') return value;
    }
    return null;
  }

  function pdfLegacyVisualFlags_cor(row){
    return visualStatesForRow_cor(row).map(item => ({
      emoji:raw(item && item.emoji) || '•',
      texto:raw(item && item.nombre) || raw(item && item.codigo) || 'Estado visual'
    }));
  }

  function pdfLegacyWidthByContent_cor(values, min, max){
    const longest = (Array.isArray(values) ? values : []).reduce((result, value) =>
      Math.max(result, String(value || '').length), 0
    );
    return Math.max(min, Math.min(max, longest * 6.5 + 20));
  }

  function pdfLegacyColgroup_cor(columns, rows){
    const projectWidth = pdfLegacyWidthByContent_cor(rows.map(row => row.proyecto), 90, 220);
    const referenceWidth = pdfLegacyWidthByContent_cor(rows.map(row => row.referencia_sitio), 70, 160);
    const widths = columns.map(column => {
      if(column.type === 'icono') return 82;
      if(column.type === 'fecha') return PDF_WIDTH_DATE_COR;
      if(column.type === 'pct') return 56;
      if(column.type === 'comentario') return PDF_WIDTH_COMMENT_COR;
      if(column.type === 'proyecto') return projectWidth;
      if(column.type === 'referencia') return referenceWidth;
      return 95;
    });
    const totalWidth = Math.max(1, widths.reduce((sum, width) => sum + width, 0));
    const cols = widths.map(width =>
      '<col style="width:' + ((width / totalWidth) * 100).toFixed(3) + '%;">'
    ).join('');
    return '<colgroup>' + cols + '</colgroup>';
  }

  function pdfLegacyColumns_cor(stage){
    const withNotification = stage.code !== '01-SUS';
    const columns = [
      { label:'SUP', type:'texto', render:row => pdfLegacyFormatValue_cor(row.supervisor_fl, 'texto') }
    ];
    if(withNotification){
      columns.push({
        label:'NOTIF',
        type:'icono',
        html:row => {
          const flags = pdfLegacyVisualFlags_cor(row);
          return {
            html:flags.map(flag => esc(flag.emoji)).join(' ') || '-',
            className:flags.length ? 'con-alerta' : '',
            title:flags.map(flag => flag.texto).join(' | ')
          };
        }
      });
    }
    columns.push(
      { label:'EDO', type:'texto', render:row => pdfLegacyFormatValue_cor(row.estado, 'texto') },
      { label:'PROYECTO', type:'proyecto', render:row => pdfLegacyFormatValue_cor(row.proyecto, 'texto') },
      { label:'REFERENCIA', type:'referencia', render:row => pdfLegacyFormatValue_cor(row.referencia_sitio, 'texto') }
    );

    (PDF_STAGE_COLUMNS_COR[stage.code] || []).forEach(config => {
      columns.push({
        label:config[0],
        type:config[2],
        render:row => pdfLegacyFormatValue_cor(pdfLegacyValueFromFields_cor(row, config[1]), config[2])
      });
    });
    return columns;
  }

  function pdfLegacyTableSection_cor(stage, allRows){
    const rows = pdfLegacySortBySupervisorEstado_cor(stageRowsFrom_cor(allRows, stage.code));
    const columns = pdfLegacyColumns_cor(stage);
    const headings = columns.map(column => '<th class="col-' + esc(column.type) + '">' + esc(column.label) + '</th>').join('');

    const body = rows.map(row => '<tr>' + columns.map(column => {
      if(typeof column.html === 'function'){
        const result = column.html(row) || {};
        const extraClass = result.className ? (' ' + result.className) : '';
        const title = result.title ? (' title="' + esc(result.title) + '"') : '';
        return '<td class="col-' + esc(column.type) + extraClass + '"' + title + '>' + (result.html || '-') + '</td>';
      }
      const value = typeof column.render === 'function' ? column.render(row) : '-';
      return '<td class="col-' + esc(column.type) + '">' + esc(value || '-') + '</td>';
    }).join('') + '</tr>').join('');

    const legend = PDF_LEGEND_BY_STATUS_COR[stage.code]
      ? '<div class="ir-cor-pdf-leyenda-notif">' + PDF_LEGEND_BY_STATUS_COR[stage.code] + '</div>'
      : '';

    return '<div class="ir-cor-pdf-foto-grupo">' +
      '<div class="ir-cor-pdf-foto-grupo-title">' + esc(stage.code) + ' &middot; ' + esc(stage.name) +
      ' <span class="count">(' + rows.length + ')</span></div>' +
      legend +
      '<div class="ir-cor-pdf-table-wrap"><table class="ir-cor-pdf-table-reporte">' +
      pdfLegacyColgroup_cor(columns, rows) +
      '<thead><tr>' + headings + '</tr></thead><tbody>' +
      (body || '<tr><td colspan="' + columns.length + '" class="ir-cor-pdf-empty">Sin equipos en esta seccion.</td></tr>') +
      '</tbody></table></div></div>';
  }

  function pdfLegacyChart_cor(allRows, stages){
    const counts = stages.map(stage => ({
      code:stage.code,
      name:stage.name,
      total:stageRowsFrom_cor(allRows, stage.code).length
    }));
    const max = Math.max(1, ...counts.map(item => item.total));

    return '<div class="ir-cor-pdf-grafica-wrap">' +
      '<div class="ir-cor-pdf-grafica-titulo">Resumen de equipos por seccion</div>' +
      counts.map(item => {
        const width = Math.max(4, Math.round(item.total / max * 100));
        const valueInside = width > 20;
        return '<div class="ir-cor-pdf-grafica-fila">' +
          '<div class="ir-cor-pdf-grafica-label">' + esc(item.code + ' ' + item.name) + '</div>' +
          '<div class="ir-cor-pdf-grafica-barra-fondo"><div class="ir-cor-pdf-grafica-barra" style="width:' + width + '%;">' +
          (valueInside ? '<span class="ir-cor-pdf-grafica-valor">' + item.total + '</span>' : '') +
          '</div></div>' +
          (!valueInside ? '<span class="ir-cor-pdf-grafica-valor fuera">' + item.total + '</span>' : '') +
          '</div>';
      }).join('') + '</div>';
  }

  function buildPrintHtml_cor(rows){
    const stages = pdfLegacyStages_cor();
    return '<div class="ir-cor-pdf-print-header">' +
      '<div class="logo"><img class="ir-cor-pdf-logo" src="./assets/logo.png" alt="BLT Brilliant"></div>' +
      '<div class="titulo">REPORTE GENERAL DE INSTALACIONES</div>' +
      '<div class="fecha">' + esc(printDate_cor()) + '</div></div>' +
      pdfLegacyChart_cor(rows, stages) +
      '<div class="ir-cor-pdf-sections">' + stages.map(stage => pdfLegacyTableSection_cor(stage, rows)).join('') + '</div>';
  }

  function setPrinting_cor(printing){
    state.printing = !!printing;
    const button = $('ir-cor-pdf');
    if(!button) return;
    button.disabled = !!printing || state.loading;
    button.textContent = printing ? 'Preparando PDF…' : '📄 Generar PDF';
  }

  async function waitForPrintAssets_cor(host){
    const images = Array.from(host ? host.querySelectorAll('img') : []);
    await Promise.all(images.map(image => {
      if(image.complete && image.naturalWidth > 0){
        if(typeof image.decode === 'function'){
          return image.decode().catch(() => undefined);
        }
        return Promise.resolve();
      }
      return new Promise(resolve => {
        const done = () => resolve();
        image.addEventListener('load', done, { once:true });
        image.addEventListener('error', done, { once:true });
      });
    }));
  }

  async function generatePdf_cor(){
    if(state.printing || state.loading) return;
    if(!state.loaded || !state.response) await refresh_cor();
    if(!state.loaded || !state.response) return;

    setPrinting_cor(true);
    let host = null;
    let pageStyle = null;
    let cleaned = false;
    const cleanup = () => {
      if(cleaned) return;
      cleaned = true;
      document.body.classList.remove('ir-cor-printing');
      if(host && host.parentNode) host.parentNode.removeChild(host);
      if(pageStyle && pageStyle.parentNode) pageStyle.parentNode.removeChild(pageStyle);
      setPrinting_cor(false);
    };

    try{
      const rows = await rowsForPrint_cor();
      host = document.createElement('section');
      host.id = 'ir-cor-print-host';
      host.className = 'ir-cor-print-host';
      host.setAttribute('aria-hidden', 'true');
      host.innerHTML = buildPrintHtml_cor(rows);
      document.body.appendChild(host);
      pageStyle = document.createElement('style');
      pageStyle.id = 'ir-cor-pdf-page-style';
      pageStyle.textContent = '@page { size: A4 landscape; margin: 8mm; }';
      document.head.appendChild(pageStyle);
      document.body.classList.add('ir-cor-printing');
      window.addEventListener('afterprint', cleanup, { once:true });
      await waitForPrintAssets_cor(host);

      window.setTimeout(() => {
        window.print();
        window.setTimeout(cleanup, 1500);
      }, 50);
    }catch(error){
      cleanup();
      setStatus_cor('No se pudo preparar el PDF', 'error');
      console.error('[Instalaciones Reporte COR] PDF Desarrollo Proyectos:', error);
    }
  }

  function render_cor(){
    renderStages_cor();
    renderChart_cor();
    renderLegend_cor();
    renderSections_cor();
    renderEmpty_cor();
    renderMeta_cor();
  }

  function renderLoading_cor(){
    setStatus_cor('Actualizando reporte...', 'loading');
    const stages = $('ir-cor-stages');
    if(stages && !state.loaded){
      stages.innerHTML = STAGES.map(() => '<div class="ir-cor-card ir-cor-stage"><div class="ir-cor-skeleton"></div><div class="ir-cor-skeleton"></div><div class="ir-cor-skeleton"></div></div>').join('');
    }
    const sections = $('ir-cor-sections');
    if(sections && !state.loaded){
      sections.innerHTML = STAGES.slice(0, 4).map(() => '<div class="ir-cor-accordion"><div class="ir-cor-accordion-toggle"><div class="ir-cor-skeleton" style="width:55%"></div></div></div>').join('');
    }
  }

  function renderError_cor(error){
    setStatus_cor('No se pudo actualizar', 'error');
    const root = $('ir-cor-sections');
    if(root){
      root.innerHTML = '<section class="ir-cor-card ir-cor-empty"><div aria-hidden="true">⚠️</div><h2>Error consultando el reporte</h2><p>' + esc(error && error.message ? error.message : error) + '</p></section>';
    }
  }

  async function refresh_cor(){
    if(state.loading) return;
    setLoading_cor(true);
    renderLoading_cor();
    try{
      const response = await fetchJson_cor('/api/instalaciones/reporte?' + buildQuery_cor());
      populateFilters_cor(response);
      syncResponse_cor(response);
      state.loaded = true;
      render_cor();
    }catch(error){
      renderError_cor(error);
      console.error('[Instalaciones Reporte COR] Fase 4:', error);
    }finally{
      setLoading_cor(false);
    }
  }

  function clearFilters_cor(){
    ['ir-cor-supervisor', 'ir-cor-asesor', 'ir-cor-estatus', 'ir-cor-year'].forEach(id => {
      const element = $(id);
      if(element) element.value = '';
    });
    resetPages_cor();
    state.openStatus = '03-PM';
    refresh_cor();
  }

  function openStage_cor(code, scroll){
    if(!STAGE_BY_CODE.has(code)) return;
    state.openStatus = code;
    renderStages_cor();
    renderSections_cor();
    if(scroll){
      const section = Array.from(document.querySelectorAll('[data-ir-accordion]')).find(item => item.dataset.irAccordion === code);
      if(section) section.scrollIntoView({ behavior:'smooth', block:'start' });
    }
  }

  function navigateProject_cor(target){
    const id = raw(target && target.dataset.irProject);
    const projectName = raw(target && target.dataset.irProjectName);
    if(!id || !window.ManttoRouter || typeof window.ManttoRouter.go !== 'function') return;
    window.ManttoRouter.go('detalle', {
      type:'proyecto',
      id,
      projectName,
      source:'instalaciones-proyectos',
      template:'cliente-unificado'
    });
  }

  function movePage_cor(code, delta){
    if(!STAGE_BY_CODE.has(code)) return;
    const rows = stageRows_cor(code);
    const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    const current = Number(state.pageByStatus[code] || 1);
    state.pageByStatus[code] = Math.min(Math.max(current + delta, 1), pageCount);
    renderSections_cor();
  }

  function bind_cor(){
    if(state.bound) return;
    state.bound = true;

    $('ir-cor-refresh')?.addEventListener('click', refresh_cor);
    $('ir-cor-pdf')?.addEventListener('click', generatePdf_cor);
    $('ir-cor-clear')?.addEventListener('click', clearFilters_cor);
    ['ir-cor-supervisor', 'ir-cor-asesor', 'ir-cor-estatus', 'ir-cor-year'].forEach(id => {
      $(id)?.addEventListener('change', () => {
        resetPages_cor();
        const selectedStatus = currentFilter_cor('ir-cor-estatus');
        if(selectedStatus) state.openStatus = selectedStatus;
        refresh_cor();
      });
    });

    $('ir-cor-stages')?.addEventListener('click', event => {
      const button = event.target.closest('[data-ir-stage]');
      if(button) openStage_cor(button.dataset.irStage, true);
    });

    $('ir-cor-sections')?.addEventListener('click', event => {
      const project = event.target.closest('[data-ir-project]');
      if(project){
        navigateProject_cor(project);
        return;
      }
      const previous = event.target.closest('[data-ir-page-prev]');
      if(previous){
        movePage_cor(previous.dataset.irPagePrev, -1);
        return;
      }
      const next = event.target.closest('[data-ir-page-next]');
      if(next){
        movePage_cor(next.dataset.irPageNext, 1);
        return;
      }
      const tableMode = event.target.closest('[data-ir-table-mode]');
      if(tableMode){
        const code = raw(tableMode.dataset.irTableStatus).toUpperCase();
        const mode = raw(tableMode.dataset.irTableMode);
        if(FULL_VIEW_STATUSES.has(code) && (mode === 'paged' || mode === 'full')){
          state.tableModeByStatus[code] = mode;
          state.pageByStatus[code] = 1;
          renderSections_cor();
        }
        return;
      }
      const toggle = event.target.closest('[data-ir-toggle]');
      if(toggle) openStage_cor(toggle.dataset.irToggle, false);
    });
  }

  async function init_cor(payload){
    try{
      await loadHtml_cor();
      bind_cor();
      renderLegend_cor();
      if(!state.loaded || (payload && payload.refresh === true)) await refresh_cor();
      else render_cor();
    }catch(error){
      const view = getView_cor();
      if(view){
        view.innerHTML = '<div class="ir-cor-page"><section class="ir-cor-card ir-cor-empty"><div>⚠️</div><h2>No se pudo cargar Reporte de Instalaciones</h2><p>' + esc(error && error.message ? error.message : error) + '</p></section></div>';
      }
      console.error('[Instalaciones Reporte COR] Init Fase 4:', error);
    }
  }

  window.ManttoInstalacionesReporte_cor = Object.freeze({
    version:VERSION_COR,
    init:init_cor,
    refresh:refresh_cor,
    generatePdf:generatePdf_cor
  });
})();

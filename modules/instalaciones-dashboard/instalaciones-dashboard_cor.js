(function(){
  'use strict';

  const VERSION_COR = '20260819-dashboard-modo-junta-orden-v002';
  const API_BASE = (window.MANTTO_API_BASE || 'http://localhost:3001').replace(/\/$/, '');
  const AFL_CODE_COR = 'AFL';
  const AJUSTE_STATUS_COR = '06-A';
  const DASHBOARD_CONFIG_KEY_PREFIX_COR = 'mantto:instalaciones-dashboard:config:v1:';
  const QUICK_EDIT_FIELDS_COR = Object.freeze({
    '01-SUS': Object.freeze({
      estatus:{ label:'Estatus', type:'select' }
    }),
    '02-OC': Object.freeze({
      estatus:{ label:'Estatus', type:'select' },
      fecha_posible_recepcion_cubo:{ label:'Posible recepción de cubo', type:'date' },
      comentarios_fl:{ label:'Comentario', type:'textarea' }
    }),
    '03-PM': Object.freeze({
      estatus:{ label:'Estatus', type:'select' },
      fecha_posible_recepcion_cubo:{ label:'Posible recepción de cubo', type:'date' },
      comentarios_fl:{ label:'Comentario', type:'textarea' }
    }),
    '04-M': Object.freeze({
      estatus:{ label:'Estatus', type:'select' },
      comentarios_fl:{ label:'Comentario', type:'textarea' }
    }),
    '05-PA': Object.freeze({
      estatus:{ label:'Estatus', type:'select' },
      ajustador:{ label:'Ajustador', type:'text' },
      fecha_posible_inicio_ajuste:{ label:'Posible inicio de Ajuste', type:'date' },
      comentarios_fl:{ label:'Comentario', type:'textarea' }
    }),
    '06-A': Object.freeze({
      estatus:{ label:'Estatus', type:'select' },
      fecha_inicio_ajuste:{ label:'Fecha Inicio Ajuste', type:'date' },
      fecha_fin_ajuste_planeado:{ label:'Fecha Fin Ajuste', type:'date' },
      fecha_fin_ajuste_modificado:{ label:'Fecha Fin Ajuste Modificado', type:'date' },
      ajustador:{ label:'Ajustador', type:'text' },
      comentarios_fl:{ label:'Comentario', type:'textarea' }
    }),
    '07-PE': Object.freeze({
      estatus:{ label:'Estatus', type:'select' },
      comentarios_fl:{ label:'Comentario', type:'textarea' }
    }),
    '08-T': Object.freeze({
      estatus:{ label:'Estatus', type:'select' },
      comentarios_fl:{ label:'Comentario', type:'textarea' }
    })
  });

  const QUICK_EDIT_MISSING_COLUMNS_COR = Object.freeze({
    '02-OC': Object.freeze([
      ['Estatus','estatus','texto'],
      ['POSIBLE RECEPCIÓN DE CUBO','fecha_posible_recepcion_cubo','fecha']
    ]),
    '03-PM': Object.freeze([['Estatus','estatus','texto']]),
    '04-M': Object.freeze([['Estatus','estatus','texto']]),
    '05-PA': Object.freeze([
      ['Estatus','estatus','texto'],
      ['AJUSTADOR','ajustador','texto']
    ]),
    '06-A': Object.freeze([['Estatus','estatus','texto']]),
    '07-PE': Object.freeze([
      ['Estatus','estatus','texto'],
      ['COMENTARIO','comentarios_fl','comentario']
    ]),
    '08-T': Object.freeze([['COMENTARIO','comentarios_fl','comentario']])
  });


  // Columnas exclusivas de Modo Junta. Se agregan al final de la etapa
  // indicada y, si una columna ya existe en la definicion base, se mueve
  // al bloque final para conservar exactamente el orden funcional acordado.
  const MEETING_APPEND_COLUMNS_COR = Object.freeze({
    '04-M': Object.freeze([
      ['Minuta Revisión de Ajuste','fecha_minuta_revision_ajuste','fecha'],
      ['Liberado por Ajuste','fecha_liberacion_ajuste','texto']
    ]),
    '06-A': Object.freeze([
      ['No. Pisos','numero_pisos','texto'],
      ['No. Desembarques','numero_desembarques','texto'],
      ['No. Puertas','numero_puertas','texto'],
      ['Capacidad (kg)','capacidad_kg','texto'],
      ['Revisión por Supervisor','fecha_revision_supervisor','fecha'],
      ['Revisión por Ajuste','fecha_minuta_revision_ajuste','fecha'],
      ['Liberado por Ajuste','fecha_liberacion_ajuste','texto'],
      ['CTI','fecha_cti','fecha'],
      ['Última Visita','fecha_visita','fecha'],
      ['Comentario','comentarios_fl','comentario'],
      ['Posible Inicio de Ajuste','fecha_posible_inicio_ajuste','fecha']
    ])
  });

  const PERMISSIONS_COR = Object.freeze({
    acceso_visual:'INSTALACIONES_DASHBOARD_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
    selector_ver:'INSTALACIONES_DASHBOARD_SELECTOR_SUPERVISORES_SELECTOR.VER',
    selector_filtrar:'INSTALACIONES_DASHBOARD_SELECTOR_SUPERVISORES_SELECTOR.FILTRAR',
    comentarios_ver:'INSTALACIONES_DASHBOARD_COMENTARIOS_JUNTA_LISTADO.VER',
    reporte_selector_ver:'INSTALACIONES_DASHBOARD_REPORTE_SECCION_SELECTOR.VER',
    reporte_selector_filtrar:'INSTALACIONES_DASHBOARD_REPORTE_SECCION_SELECTOR.FILTRAR',
    reporte_listado_ver:'INSTALACIONES_DASHBOARD_REPORTE_SECCION_LISTADO.VER',
    reporte_abrir_detalle:'INSTALACIONES_DASHBOARD_REPORTE_SECCION_LISTADO.ABRIR_DETALLE',
    reporte_editar:'INSTALACIONES_DASHBOARD_REPORTE_SECCION_LISTADO.EDITAR',
    proyectos_ver:'INSTALACIONES_DASHBOARD_PROYECTOS_ACTIVOS_LISTADO.VER',
    proyectos_abrir_detalle:'INSTALACIONES_DASHBOARD_PROYECTOS_ACTIVOS_LISTADO.ABRIR_DETALLE',
    aditivas_indicadores_ver:'INSTALACIONES_DASHBOARD_ADITIVAS_INDICADORES.VER',
    aditivas_pendientes_ver:'INSTALACIONES_DASHBOARD_ADITIVAS_PENDIENTES.VER',
    adeudos_ver:'INSTALACIONES_DASHBOARD_ADEUDOS_CONTRACTUALES_LISTADO.VER',
    adeudos_abrir_detalle:'INSTALACIONES_DASHBOARD_ADEUDOS_CONTRACTUALES_LISTADO.ABRIR_DETALLE'
  });

  const state = {
    ready:false,
    bound:false,
    loading:false,
    loaded:false,
    bootstrap:null,
    permissions:{},
    supervisors:[],
    specialFilters:[],
    sections:[],
    selectedSupervisors:[],
    afl:false,
    meetingMode:false,
    reportSection:'',
    summary:null,
    report:null,
    documentationPage:1,
    summaryRequest:0,
    reportRequest:0,
    pendingOpenReset:false,
    editor:null
  };

  const $ = id => document.getElementById(id);
  const raw = value => value === null || value === undefined ? '' : String(value).trim();
  const esc = value => raw(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  function actorUserId_cor(){
    const auth = window.ManttoAuth || null;
    const actor = auth && typeof auth.getActorUser === 'function'
      ? auth.getActorUser()
      : (auth && typeof auth.getUser === 'function' ? auth.getUser() : null);
    const id = Number(actor && (actor.id_SB || actor.id));
    return Number.isInteger(id) && id > 0 ? id : null;
  }

  function dashboardConfigKey_cor(){
    const userId = actorUserId_cor();
    return userId ? DASHBOARD_CONFIG_KEY_PREFIX_COR + userId : '';
  }

  function readDashboardConfig_cor(){
    const key = dashboardConfigKey_cor();
    if(!key) return null;
    try{
      const parsed = JSON.parse(localStorage.getItem(key) || 'null');
      return parsed && typeof parsed === 'object' ? parsed : null;
    }catch(_error){
      return null;
    }
  }

  function persistDashboardConfig_cor(){
    const key = dashboardConfigKey_cor();
    if(!key) return;
    const payload = {
      meetingMode:Boolean(state.meetingMode),
      selectedSupervisors:Array.isArray(state.selectedSupervisors) ? [...state.selectedSupervisors] : [],
      afl:Boolean(state.afl),
      reportSection:raw(state.reportSection),
      updatedAt:new Date().toISOString()
    };
    try{ localStorage.setItem(key, JSON.stringify(payload)); }catch(_error){}
  }

  function restoreDashboardConfig_cor(){
    const config = readDashboardConfig_cor();
    if(!config) return false;
    state.meetingMode = config.meetingMode === true;
    state.selectedSupervisors = Array.isArray(config.selectedSupervisors)
      ? config.selectedSupervisors.map(raw).filter(Boolean)
      : [];
    state.afl = config.afl === true;
    state.reportSection = raw(config.reportSection);
    return true;
  }

  function getView_cor(){ return $('view-instalaciones-dashboard'); }

  function authHeaders_cor(){
    return Object.assign(
      { Accept:'application/json' },
      window.ManttoAuth && window.ManttoAuth.authHeaders
        ? window.ManttoAuth.authHeaders()
        : {}
    );
  }

  async function fetchJson_cor(path){
    const response = await fetch(API_BASE + path, { headers:authHeaders_cor(), cache:'no-store' });
    const text = await response.text();
    let json = null;
    try{ json = text ? JSON.parse(text) : null; }
    catch(_error){ throw new Error('El backend respondió contenido no JSON.'); }
    if(!response.ok || (json && json.ok === false)){
      const error = new Error((json && (json.message || json.error)) || ('Error HTTP ' + response.status));
      error.status = response.status;
      error.code = json && json.code;
      throw error;
    }
    return json || {};
  }

  async function mutateJson_cor(path, method, body){
    if(window.ManttoAuth && typeof window.ManttoAuth.api === 'function'){
      return window.ManttoAuth.api(path, {
        method:method || 'PATCH',
        body:JSON.stringify(body || {})
      });
    }
    const headers = Object.assign({
      Accept:'application/json',
      'Content-Type':'application/json'
    }, authHeaders_cor());
    const response = await fetch(API_BASE + path, {
      method:method || 'PATCH',
      credentials:'include',
      headers,
      body:JSON.stringify(body || {})
    });
    const text = await response.text();
    let json = null;
    try{ json = text ? JSON.parse(text) : null; }
    catch(_error){ throw new Error('El backend respondió contenido no JSON.'); }
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
    if(!view) throw new Error('No existe la vista view-instalaciones-dashboard.');
    if(view.dataset.idbCorReady === '1') return view;
    const response = await fetch(
      './modules/instalaciones-dashboard/instalaciones-dashboard_cor.html?v=' + VERSION_COR,
      { cache:'no-store' }
    );
    if(!response.ok) throw new Error('No se pudo cargar la vista Dashboard de Instalaciones.');
    view.innerHTML = await response.text();
    view.dataset.idbCorReady = '1';
    return view;
  }

  function hasPermission_cor(key){
    if(state.permissions[key] !== true) return false;
    const code = PERMISSIONS_COR[key];
    if(!code || !window.ManttoPermissions || typeof window.ManttoPermissions.state !== 'function') return true;
    const effective = window.ManttoPermissions.state(code);
    if(!effective || effective.exists !== true) return true;
    return effective.efectivo === true;
  }

  function normalizePermissions_cor(source){
    const incoming = source && typeof source === 'object' ? source : {};
    return Object.keys(PERMISSIONS_COR).reduce((result, key) => {
      result[key] = incoming[key] === true;
      return result;
    }, {});
  }

  function applyPermissions_cor(){
    if(window.ManttoPermissions && typeof window.ManttoPermissions.apply === 'function'){
      window.ManttoPermissions.apply(getView_cor() || document);
    }
    const selector = $('idb-cor-supervisor-chips');
    if(selector) selector.classList.toggle('idb-cor-loading', !hasPermission_cor('selector_filtrar'));
    const sectionSelect = $('idb-cor-section-select');
    if(sectionSelect){
      sectionSelect.disabled = state.afl || state.loading || !hasPermission_cor('reporte_selector_filtrar');
    }
  }

  function setLoading_cor(value){
    state.loading = Boolean(value);
    const view = getView_cor();
    if(view) view.classList.toggle('idb-cor-loading', state.loading);
    const refresh = $('idb-cor-refresh');
    if(refresh) refresh.disabled = state.loading;
    applyPermissions_cor();
  }

  function setStatus_cor(message){
    const el = $('idb-cor-status');
    if(el) el.textContent = message || '';
  }

  function formatDate_cor(value){
    const text = raw(value);
    if(!text || text === '-' || text === '.') return '—';
    const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(iso) return iso[3] + '/' + iso[2] + '/' + iso[1];
    return text;
  }

  function formatDateTime_cor(value){
    const text = raw(value);
    if(!text) return '—';
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/);
    if(match) return match[3] + '/' + match[2] + '/' + match[1] + ' - ' + match[4] + ':' + match[5];
    return formatDate_cor(text);
  }

  function formatPct_cor(value){
    if(value === null || value === undefined || value === '' || value === '-') return '—';
    const text = String(value).trim();
    if(text.includes('%')) return text;
    const parsed = Number(String(value).replace(',', '.'));
    if(!Number.isFinite(parsed)) return text;
    const pct = parsed <= 1 ? parsed * 100 : parsed;
    return Math.round(pct) + '%';
  }

  function formatAmount_cor(value){
    const number = Number(value);
    if(!Number.isFinite(number)) return '—';
    return new Intl.NumberFormat('es-MX', { minimumFractionDigits:2, maximumFractionDigits:2 }).format(number);
  }

  function formatInteger_cor(value){
    const number = Number(value);
    return Number.isFinite(number) ? new Intl.NumberFormat('es-MX', { maximumFractionDigits:0 }).format(number) : '0';
  }

  function validUniverse_cor(){ return state.afl || state.selectedSupervisors.length > 0; }

  function currentAfl_cor(){
    return state.specialFilters.find(item => raw(item.codigo).toUpperCase() === AFL_CODE_COR) || null;
  }

  function selectedText_cor(){
    const parts = [];
    if(state.afl){
      const afl = currentAfl_cor();
      parts.push(afl && afl.etiqueta ? afl.etiqueta : 'AFL · Alejandro Flores');
    }
    if(state.selectedSupervisors.length) parts.push(state.selectedSupervisors.join(', '));
    if(!parts.length) return 'Selecciona uno o más supervisores para comenzar.';
    return parts.join(' + ') + (state.afl ? ' · solo equipos activos en Ajuste' : '');
  }

  function updateModeUi_cor(){
    const normal = $('idb-cor-mode-normal');
    const junta = $('idb-cor-mode-junta');
    if(normal){ normal.classList.toggle('active', !state.meetingMode); normal.setAttribute('aria-pressed', state.meetingMode ? 'false' : 'true'); }
    if(junta){ junta.classList.toggle('active', state.meetingMode); junta.setAttribute('aria-pressed', state.meetingMode ? 'true' : 'false'); }

    const comments = $('idb-cor-comments-card');
    const projects = $('idb-cor-projects-card');
    const documentation = $('idb-cor-documentation-card');
    if(comments) comments.classList.toggle('idb-cor-hidden-by-junta', state.meetingMode);
    if(projects) projects.classList.toggle('idb-cor-hidden-by-junta', state.meetingMode);
    if(documentation) documentation.hidden = !state.meetingMode || !validUniverse_cor();
  }

  function updateSelectionUi_cor(){
    const count = $('idb-cor-selection-count');
    const text = $('idb-cor-selection-text');
    const regularCount = state.selectedSupervisors.length;
    const total = regularCount + (state.afl ? 1 : 0);
    if(count) count.textContent = total + (total === 1 ? ' seleccionado' : ' seleccionados');
    if(text) text.textContent = selectedText_cor();

    const empty = $('idb-cor-empty-selection');
    const results = $('idb-cor-results');
    if(empty) empty.hidden = validUniverse_cor();
    if(results) results.hidden = !validUniverse_cor();
    updateModeUi_cor();
  }

  function renderSupervisorChips_cor(){
    const host = $('idb-cor-supervisor-chips');
    if(!host) return;

    const allSelected = state.supervisors.length > 0 && state.selectedSupervisors.length === state.supervisors.length;
    let html = '<button type="button" class="idb-cor-chip all' + (allSelected && !state.afl ? ' active' : '') + '" data-supervisor-all="1">Todos</button>';

    html += state.supervisors.map(item => {
      const code = raw(item.supervisor);
      const active = state.selectedSupervisors.includes(code);
      return '<button type="button" class="idb-cor-chip' + (active ? ' active' : '') + '" data-supervisor="' + esc(code) + '">' +
        '<span>' + esc(code) + '</span><small>' + esc(formatInteger_cor(item.total_equipos)) + '</small></button>';
    }).join('');

    const afl = currentAfl_cor();
    if(afl){
      html += '<button type="button" class="idb-cor-chip afl' + (state.afl ? ' active' : '') + '" data-special-filter="AFL" title="Alejandro Flores · equipos activos en Ajuste">' +
        '<span>' + esc(afl.etiqueta || 'AFL · Alejandro Flores') + '</span><small>' + esc(formatInteger_cor(afl.total_equipos)) + '</small></button>';
    }

    host.innerHTML = html;
    bindSupervisorChips_cor();
    updateSelectionUi_cor();
  }

  function renderSectionSelect_cor(){
    const select = $('idb-cor-section-select');
    const help = $('idb-cor-report-help');
    const scope = $('idb-cor-report-scope');
    if(!select) return;

    select.innerHTML = '<option value="">Selecciona una sección...</option>' + state.sections.map(section =>
      '<option value="' + esc(section.codigo) + '">' + esc(section.codigo + ' - ' + section.nombre) + '</option>'
    ).join('');

    if(state.afl){
      state.reportSection = AJUSTE_STATUS_COR;
      select.value = AJUSTE_STATUS_COR;
      select.disabled = true;
      if(help) help.textContent = 'AFL fuerza la sección 06-A para mostrar únicamente equipos activos en Ajuste.';
      if(scope){ scope.hidden = false; scope.textContent = 'AFL activo · Estatus 06-A · activo = 1' + (state.selectedSupervisors.length ? ' · supervisores: ' + state.selectedSupervisors.join(', ') : ' · todos los supervisores'); }
    }else{
      if(!state.sections.some(section => section.codigo === state.reportSection)) state.reportSection = '';
      select.value = state.reportSection;
      select.disabled = state.loading || !hasPermission_cor('reporte_selector_filtrar');
      if(help) help.textContent = 'Selecciona una etapa para consultar sus equipos.';
      if(scope){ scope.hidden = true; scope.textContent = ''; }
    }
  }

  function applyBootstrap_cor(response){
    state.bootstrap = response;
    state.permissions = normalizePermissions_cor(response && response.permissions);
    state.supervisors = Array.isArray(response && response.supervisors) ? response.supervisors : [];
    state.specialFilters = Array.isArray(response && response.special_filters) ? response.special_filters : [];
    state.sections = Array.isArray(response && response.sections) ? response.sections : [];

    const validCodes = new Set(state.supervisors.map(item => raw(item.supervisor)));
    state.selectedSupervisors = state.selectedSupervisors.filter(code => validCodes.has(code));
    if(!currentAfl_cor()) state.afl = false;

    renderSupervisorChips_cor();
    renderSectionSelect_cor();
    applyPermissions_cor();
    persistDashboardConfig_cor();
  }

  function queryParams_cor(includeSection){
    const params = new URLSearchParams();
    if(state.selectedSupervisors.length) params.set('supervisores', state.selectedSupervisors.join(','));
    if(state.afl){
      params.set('filtro_especial', AFL_CODE_COR);
      params.set('ajuste_activo', '1');
    }
    if(state.meetingMode){
      params.set('modo_junta', '1');
      params.set('documentacion_page', String(state.documentationPage || 1));
    }
    if(includeSection && state.reportSection) params.set('seccion', state.reportSection);
    return params;
  }

  function emptyRow_cor(colspan, message){
    return '<tr><td colspan="' + colspan + '" class="idb-cor-muted">' + esc(message) + '</td></tr>';
  }

  function openEquipment_cor(project, reference){
    const p = raw(project);
    const r = raw(reference);
    if(!p || !r || !hasPermission_cor('reporte_abrir_detalle')) return;
    const key = p + '|||' + r;
    if(window.ManttoRouter && typeof window.ManttoRouter.open === 'function'){
      window.ManttoRouter.open('detalle', { type:'equipo', id:key, source:'instalaciones-dashboard', projectName:p, referencia_sitio:r });
      return;
    }
    if(window.ManttoDetails && typeof window.ManttoDetails.openEquipo === 'function') window.ManttoDetails.openEquipo(key);
  }

  function openProject_cor(project){
    const name = raw(project);
    if(!name) return;
    if(window.ManttoDetails && typeof window.ManttoDetails.openProyecto === 'function'){
      window.ManttoDetails.openProyecto(name);
      return;
    }
    if(window.ManttoRouter && typeof window.ManttoRouter.open === 'function'){
      window.ManttoRouter.open('detalle', { type:'proyecto', id:name, source:'instalaciones-dashboard' });
    }
  }

  function renderComments_cor(block){
    const card = $('idb-cor-comments-card');
    if(!card) return;
    card.hidden = !hasPermission_cor('comentarios_ver');
    card.classList.toggle('idb-cor-hidden-by-junta', state.meetingMode);
    const rows = block && Array.isArray(block.rows) ? block.rows : [];
    const total = $('idb-cor-comments-total');
    if(total) total.textContent = formatInteger_cor(rows.length);
    const body = $('idb-cor-comments-body');
    if(!body) return;
    if(!rows.length){ body.innerHTML = emptyRow_cor(6, state.meetingMode ? 'Oculto en Modo Junta.' : 'Sin comentarios registrados para este universo.'); return; }
    body.innerHTML = rows.map(row => {
      return '<tr>' +
        '<td>' + esc(row.semana_iso || '—') + '</td>' +
        '<td>' + esc(row.proyecto || '—') + '</td>' +
        '<td>' + esc(row.referencia_sitio || '—') + '</td>' +
        '<td>' + esc(row.comentario || '—') + '</td>' +
        '<td>' + esc(row.responsables || '—') + '</td>' +
        '<td>' + esc(formatDateTime_cor(row.fecha_creacion)) + '</td></tr>';
    }).join('');
  }

  function renderProjects_cor(block){
    const card = $('idb-cor-projects-card');
    if(!card) return;
    card.hidden = !hasPermission_cor('proyectos_ver');
    card.classList.toggle('idb-cor-hidden-by-junta', state.meetingMode);
    const rows = block && Array.isArray(block.rows) ? block.rows : [];
    const total = $('idb-cor-projects-total');
    if(total) total.textContent = formatInteger_cor(rows.length);
    const help = $('idb-cor-projects-help');
    if(help) help.textContent = state.afl ? 'Proyectos con equipos activos en Ajuste dentro del universo seleccionado.' : 'Proyectos activos vinculados al universo de supervisores seleccionado.';
    const body = $('idb-cor-projects-body');
    if(!body) return;
    if(!rows.length){ body.innerHTML = emptyRow_cor(7, state.meetingMode ? 'Oculto en Modo Junta.' : 'Sin proyectos activos para este universo.'); return; }
    const canOpen = hasPermission_cor('proyectos_abrir_detalle');
    body.innerHTML = rows.map(row => '<tr' + (canOpen && raw(row.proyecto) ? ' class="idb-cor-clickable" data-project="' + esc(row.proyecto) + '"' : '') + '>' +
      '<td>' + esc(row.proyecto || '—') + '</td><td>' + esc(row.id_proyecto || '—') + '</td><td>' + esc(row.ciudad || '—') + '</td>' +
      '<td>' + esc(row.estado || '—') + '</td><td>' + esc(formatInteger_cor(row.total_equipos)) + '</td><td>' + esc(row.asesor || '—') + '</td><td>' + esc(row.supervisores || '—') + '</td></tr>').join('');
  }

  function renderAditivas_cor(block){
    const card = $('idb-cor-aditivas-card');
    if(!card) return;
    const allowedIndicators = block && block.allowed_indicadores === true && hasPermission_cor('aditivas_indicadores_ver');
    const allowedPending = block && block.allowed_pendientes === true && hasPermission_cor('aditivas_pendientes_ver');
    card.hidden = !allowedIndicators && !allowedPending;
    if(card.hidden) return;

    const kpis = $('idb-cor-aditivas-kpis');
    const note = $('idb-cor-aditivas-note');
    const body = $('idb-cor-aditivas-body');

    if(block.available !== true){
      if(kpis){ kpis.hidden = true; kpis.innerHTML = ''; }
      if(note){
        const route = raw(block.source_route);
        note.textContent = (block.message || 'La fuente de Aditivas de Cobranza Corellian aún no está creada.') + (route ? ' Ruta reservada: ' + route : '');
      }
      if(body) body.innerHTML = emptyRow_cor(5, 'Pendiente de integración con Cobranza Corellian. No se consultan datos de United.');
      return;
    }

    const indicators = block && block.indicadores ? block.indicadores : {};
    if(kpis){
      kpis.hidden = !allowedIndicators;
      kpis.innerHTML = allowedIndicators
        ? '<article class="idb-cor-kpi info"><span>Total Aditivas</span><strong>' + esc(formatAmount_cor(indicators.total)) + '</strong></article>' +
          '<article class="idb-cor-kpi warning"><span>Pendiente</span><strong>' + esc(formatAmount_cor(indicators.pendiente)) + '</strong></article>' +
          '<article class="idb-cor-kpi"><span>Registros relacionados</span><strong>' + esc(formatInteger_cor(block.total_registros)) + '</strong></article>'
        : '';
    }
    if(note) note.textContent = block && block.note ? block.note : 'Fuente: Cobranza Corellian.';
    if(!body) return;
    const rows = allowedPending && Array.isArray(block.pendientes) ? block.pendientes : [];
    body.innerHTML = rows.length ? rows.map(row => '<tr>' +
      '<td>' + esc(row.proyecto || '—') + '</td><td>' + esc(row.concepto || '—') + '</td><td>' + esc(row.ov || '—') + '</td><td>' + esc(row.no_factura || '—') + '</td><td class="idb-cor-money">' + esc(formatAmount_cor(row.pendiente)) + '</td></tr>').join('') : emptyRow_cor(5, 'Sin Aditivas pendientes para el universo seleccionado.');
  }

  function renderDebt_cor(block){
    const card = $('idb-cor-debt-card');
    if(!card) return;
    const allowed = block && block.allowed === true && hasPermission_cor('adeudos_ver');
    card.hidden = !allowed;
    if(card.hidden) return;
    const content = $('idb-cor-debt-content');
    if(!content) return;
    if(block.supported !== true){
      const route = raw(block.source_route);
      content.innerHTML = '<div class="idb-cor-note idb-cor-note-warning"><strong>Cobranza Corellian pendiente de integración.</strong><br>' + esc(block.message || 'La tabla fuente aún no está creada.') + (route ? '<br><small>Ruta reservada: ' + esc(route) + '</small>' : '') + '</div>';
      return;
    }
    const rows = Array.isArray(block.rows) ? block.rows : [];
    const canOpen = hasPermission_cor('adeudos_abrir_detalle');
    content.innerHTML = '<div class="idb-cor-table-wrap"><table class="idb-cor-table"><thead><tr><th>Proyecto</th><th>Moneda</th><th>Pendiente contractual</th></tr></thead><tbody>' +
      (rows.length ? rows.map(row => '<tr' + (canOpen && raw(row.proyecto) ? ' class="idb-cor-clickable" data-project="' + esc(row.proyecto) + '"' : '') + '><td>' + esc(row.proyecto || '—') + '</td><td>' + esc(row.moneda || '—') + '</td><td class="idb-cor-money">' + esc(formatAmount_cor(row.pendiente)) + '</td></tr>').join('') : emptyRow_cor(3, 'Sin adeudos contractuales.')) +
      '</tbody></table></div>';
  }

  function quickEditConfig_cor(sectionCode, field){
    const section = QUICK_EDIT_FIELDS_COR[raw(sectionCode)] || null;
    return section && typeof field === 'string' ? (section[field] || null) : null;
  }

  function reportColumns_cor(section){
    const base = Array.isArray(section && section.columnas)
      ? section.columnas.map(item => Array.isArray(item) ? [item[0], item[1], item[2]] : item)
      : [];
    const sectionCode = raw(section && section.codigo);
    const existing = new Set();
    base.forEach(item => {
      if(Array.isArray(item) && typeof item[1] === 'string') existing.add(item[1]);
    });

    // Estatus es una columna exclusiva de Modo Junta.
    // Fuera de Modo Junta se conserva exactamente la tabla original del reporte.
    if(!state.meetingMode) return base;

    const withStatus = existing.has('estatus')
      ? base
      : [['Estatus','estatus','texto']].concat(base);
    existing.add('estatus');

    const editable = QUICK_EDIT_FIELDS_COR[sectionCode];
    if(!editable) return withStatus;

    // 04-M y 06-A tienen columnas adicionales exclusivas de Modo Junta.
    // Las columnas repetidas se retiran de la base y se reinsertan al final
    // para respetar el orden exacto solicitado sin duplicarlas.
    const meetingAppend = Array.isArray(MEETING_APPEND_COLUMNS_COR[sectionCode])
      ? MEETING_APPEND_COLUMNS_COR[sectionCode]
      : [];
    let meetingColumns = withStatus;
    if(meetingAppend.length){
      const appendFields = new Set(meetingAppend.map(item => item[1]));
      meetingColumns = withStatus.filter(item => !(
        Array.isArray(item) && typeof item[1] === 'string' && appendFields.has(item[1])
      ));
      meetingColumns = meetingColumns.concat(meetingAppend.map(item => [item[0], item[1], item[2]]));
    }

    const currentFields = new Set();
    meetingColumns.forEach(item => {
      if(Array.isArray(item) && typeof item[1] === 'string') currentFields.add(item[1]);
    });
    const additions = Array.isArray(QUICK_EDIT_MISSING_COLUMNS_COR[sectionCode])
      ? QUICK_EDIT_MISSING_COLUMNS_COR[sectionCode]
      : [];
    const rest = [];
    additions.forEach(item => {
      if(currentFields.has(item[1])) return;
      rest.push(item);
      currentFields.add(item[1]);
    });
    return meetingColumns.concat(rest);
  }

  function dateInputValue_cor(value){
    const text = raw(value);
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? match[1] + '-' + match[2] + '-' + match[3] : '';
  }

  function editorControl_cor(config, value){
    const current = raw(value);
    if(config.type === 'select'){
      const options = state.sections.map(section => {
        const code = raw(section.codigo);
        const label = code + (section.nombre ? ' · ' + section.nombre : '');
        return '<option value="' + esc(code) + '"' + (code === current ? ' selected' : '') + '>' + esc(label) + '</option>';
      }).join('');
      return '<select id="idb-cor-cell-editor-control" class="idb-cor-cell-editor-control">' + options + '</select>';
    }
    if(config.type === 'date'){
      return '<input id="idb-cor-cell-editor-control" class="idb-cor-cell-editor-control" type="date" value="' + esc(dateInputValue_cor(value)) + '">';
    }
    if(config.type === 'textarea'){
      return '<textarea id="idb-cor-cell-editor-control" class="idb-cor-cell-editor-control idb-cor-cell-editor-textarea" rows="4">' + esc(current) + '</textarea>';
    }
    return '<input id="idb-cor-cell-editor-control" class="idb-cor-cell-editor-control" type="text" value="' + esc(current) + '">';
  }

  function closeCellEditor_cor(){
    const editor = $('idb-cor-cell-editor');
    if(editor) editor.remove();
    const root = getView_cor();
    if(root) root.querySelectorAll('.idb-cor-cell-editing').forEach(cell => cell.classList.remove('idb-cor-cell-editing'));
    state.editor = null;
  }

  function positionCellEditor_cor(){
    const editor = $('idb-cor-cell-editor');
    const context = state.editor;
    const cell = context && context.cell;
    if(!editor || !cell || !document.body.contains(cell)) return;
    if(window.matchMedia && window.matchMedia('(max-width: 640px)').matches){
      editor.style.left = '';
      editor.style.top = '';
      editor.style.width = '';
      return;
    }
    const rect = cell.getBoundingClientRect();
    const viewportWidth = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    const viewportHeight = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
    const width = Math.min(340, Math.max(280, rect.width + 90));
    editor.style.width = width + 'px';
    editor.style.visibility = 'hidden';
    editor.style.left = '12px';
    editor.style.top = '12px';
    const measuredHeight = editor.offsetHeight || 210;
    let left = Math.min(Math.max(12, rect.left), Math.max(12, viewportWidth - width - 12));
    let top = rect.bottom + 8;
    if(top + measuredHeight > viewportHeight - 12) top = Math.max(12, rect.top - measuredHeight - 8);
    editor.style.left = Math.round(left) + 'px';
    editor.style.top = Math.round(top) + 'px';
    editor.style.visibility = 'visible';
  }

  function openCellEditor_cor(cell){
    if(!state.meetingMode || !hasPermission_cor('reporte_editar')) return;
    const sectionCode = raw(cell.dataset.section);
    const field = raw(cell.dataset.field);
    const rowId = raw(cell.dataset.rowId);
    const config = quickEditConfig_cor(sectionCode, field);
    if(!config) return;
    const rows = Array.isArray(state.report && state.report.rows) ? state.report.rows : [];
    const row = rows.find(item => raw(item.id_ins_fl) === rowId);
    if(!row) return;

    closeCellEditor_cor();
    cell.classList.add('idb-cor-cell-editing');
    state.editor = { cell, sectionCode, field, rowId };

    const editor = document.createElement('div');
    editor.id = 'idb-cor-cell-editor';
    editor.className = 'idb-cor-cell-editor';
    editor.setAttribute('role', 'dialog');
    editor.setAttribute('aria-modal', 'false');
    editor.setAttribute('aria-label', 'Edición rápida de ' + config.label);
    editor.innerHTML =
      '<div class="idb-cor-cell-editor-head"><div><small>Edición rápida · ' + esc(sectionCode) + '</small><strong>' + esc(config.label) + '</strong></div>' +
      '<button type="button" class="idb-cor-cell-editor-close" data-idb-cor-editor-close aria-label="Cerrar">×</button></div>' +
      '<div class="idb-cor-cell-editor-context"><span>' + esc(row.referencia_sitio || 'Equipo') + '</span><small>' + esc(row.proyecto || '') + '</small></div>' +
      '<label class="idb-cor-cell-editor-label"><span>Valor</span>' + editorControl_cor(config, row[field]) + '</label>' +
      '<div class="idb-cor-cell-editor-note" data-idb-cor-editor-note>El cambio sobrescribirá únicamente esta celda.</div>' +
      '<div class="idb-cor-cell-editor-actions"><button type="button" class="idb-cor-cell-editor-cancel" data-idb-cor-editor-close>Cancelar</button>' +
      '<button type="button" class="idb-cor-cell-editor-save" data-idb-cor-editor-save>Guardar</button></div>';
    document.body.appendChild(editor);

    editor.querySelectorAll('[data-idb-cor-editor-close]').forEach(button => button.addEventListener('click', closeCellEditor_cor));
    editor.querySelector('[data-idb-cor-editor-save]')?.addEventListener('click', () => saveCellEditor_cor());
    positionCellEditor_cor();
    const control = $('idb-cor-cell-editor-control');
    if(control) window.setTimeout(() => control.focus(), 0);
    setStatus_cor('Edición rápida · ' + sectionCode + ' · ' + raw(row.referencia_sitio) + ' · ' + config.label + '.');
  }

  async function refreshAfterQuickEdit_cor(field){
    if(field === 'estatus'){
      const bootstrap = await fetchJson_cor('/api/instalaciones/dashboard/bootstrap');
      applyBootstrap_cor(bootstrap);
    }
    if(state.reportSection && validUniverse_cor() && hasPermission_cor('reporte_listado_ver')){
      await loadReport_cor();
    }
  }

  async function saveCellEditor_cor(){
    const context = state.editor;
    if(!context || !state.meetingMode || !hasPermission_cor('reporte_editar')) return;
    const editor = $('idb-cor-cell-editor');
    const control = $('idb-cor-cell-editor-control');
    const save = editor && editor.querySelector('[data-idb-cor-editor-save]');
    const cancel = editor && editor.querySelector('.idb-cor-cell-editor-cancel');
    const note = editor && editor.querySelector('[data-idb-cor-editor-note]');
    if(!editor || !control || !save) return;

    save.disabled = true;
    if(cancel) cancel.disabled = true;
    control.disabled = true;
    if(note) note.textContent = 'Guardando cambio en Aiven...';
    setStatus_cor('Guardando Edición rápida...');

    let response;
    try{
      response = await mutateJson_cor(
        '/api/instalaciones/dashboard/reporte/' + encodeURIComponent(context.rowId) + '/celda',
        'PATCH',
        {
          campo:context.field,
          valor:control.value,
          seccion:context.sectionCode,
          modo_junta:true
        }
      );
    }catch(error){
      if(note) note.textContent = error.message || 'No fue posible guardar el cambio.';
      save.disabled = false;
      if(cancel) cancel.disabled = false;
      control.disabled = false;
      control.focus();
      setStatus_cor('No se pudo guardar la Edición rápida: ' + (error.message || 'Error desconocido.'));
      return;
    }

    const changed = response && response.changed === true;
    const label = quickEditConfig_cor(context.sectionCode, context.field)?.label || context.field;
    closeCellEditor_cor();
    try{
      await refreshAfterQuickEdit_cor(context.field);
      setStatus_cor(changed
        ? 'Cambio guardado · ' + label + '. Interacción registrada.'
        : 'Sin cambios · ' + label + ' conserva el mismo valor.');
    }catch(refreshError){
      setStatus_cor(changed
        ? 'Cambio guardado · ' + label + '. No se pudo refrescar la tabla; usa Actualizar.'
        : 'Sin cambios · ' + label + '. No se pudo refrescar la tabla; usa Actualizar.');
    }
  }

  function bindResultRows_cor(){
    const root = getView_cor();
    if(!root) return;
    root.querySelectorAll('[data-idb-cor-cell-edit]').forEach(cell => {
      cell.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        openCellEditor_cor(cell);
      });
      cell.addEventListener('keydown', event => {
        if(event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        event.stopPropagation();
        openCellEditor_cor(cell);
      });
    });
    root.querySelectorAll('[data-equipment-project][data-equipment-reference]').forEach(row => {
      row.addEventListener('click', () => openEquipment_cor(row.dataset.equipmentProject, row.dataset.equipmentReference));
    });
    root.querySelectorAll('[data-project]').forEach(row => {
      row.addEventListener('click', () => openProject_cor(row.dataset.project));
    });
  }

  function documentationPctClass_cor(value){
    const number = Number(value);
    if(number >= 90) return 'good';
    if(number >= 70) return 'mid';
    return 'low';
  }

  function documentationCell_cor(doc, type){
    const item = doc && typeof doc === 'object' ? doc : {};
    const value = raw(item.valor);
    const generated = item.generado === true;
    if(!generated){
      return '<span class="idb-cor-doc-chip idb-cor-doc-missing" title="' + esc(value || 'Falta') + '">Falta</span>';
    }
    const hasDate = /^(\d{4})-(\d{2})-(\d{2})/.test(value) ||
      /^\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}$/.test(value) ||
      /^\d{1,2}-[A-Za-z]{3}-\d{2,4}$/.test(value);
    const label = type === 'date'
      ? (hasDate ? formatDate_cor(value) : 'Entregado')
      : (value || 'Entregado');
    return '<span class="idb-cor-doc-chip idb-cor-doc-ok" title="' + esc(value || 'Entregado') + '">' + esc(label) + '</span>';
  }

  function documentationPageWindow_cor(page,totalPages){
    const total = Math.max(1, Number(totalPages || 1));
    const current = Math.max(1, Math.min(Number(page || 1), total));
    let start = Math.max(1, current - 2);
    let end = Math.min(total, start + 4);
    start = Math.max(1, end - 4);
    const pages = [];
    for(let value=start; value<=end; value += 1) pages.push(value);
    return pages;
  }

  function renderDocumentation_cor(block){
    const card = $('idb-cor-documentation-card');
    const host = $('idb-cor-documentation-content');
    const ring = $('idb-cor-documentation-ring');
    const pctEl = $('idb-cor-documentation-pct');
    const count = $('idb-cor-documentation-count');
    const help = $('idb-cor-documentation-help');
    if(!card || !host) return;

    const visible = state.meetingMode && block && block.visible === true;
    card.hidden = !state.meetingMode;
    if(!state.meetingMode) return;

    if(!visible){
      const message = block && block.message
        ? block.message
        : (state.selectedSupervisors.length ? 'No fue posible consultar Documentación Pendiente para este universo.' : 'Selecciona al menos un supervisor para consultar Documentación Pendiente.');
      if(ring) ring.style.setProperty('--pct','0');
      if(pctEl) pctEl.textContent = '0%';
      if(count) count.textContent = '0 pendientes';
      if(help) help.textContent = 'Cumplimiento documental del universo de supervisores seleccionado.';
      host.innerHTML = '<div class="idb-cor-empty idb-cor-inline-empty"><span aria-hidden="true">📄</span><strong>Documentación Pendiente</strong><p>' + esc(message) + '</p></div>';
      return;
    }

    const summary = block.resumen || {};
    const pagination = block.pagination || {};
    const rows = Array.isArray(block.rows) ? block.rows : [];
    const pct = Math.max(0, Math.min(100, Number(summary.cumplimiento_porcentaje || 0)));
    const pending = Number(summary.documentos_pendientes || 0);
    const required = Number(summary.documentos_requeridos || 0);
    const generated = Number(summary.documentos_generados || 0);
    const supervisors = Array.isArray(block.selected_supervisors) ? block.selected_supervisors : state.selectedSupervisors;

    state.documentationPage = Number(pagination.page || state.documentationPage || 1);
    if(ring) ring.style.setProperty('--pct', String(pct));
    if(pctEl) pctEl.textContent = formatPct_cor(pct);
    if(count) count.textContent = formatInteger_cor(pending) + ' pendientes';
    if(help) help.textContent = 'Supervisor(es): ' + (supervisors.length ? supervisors.join(', ') : '—') + ' · ' + formatInteger_cor(generated) + ' de ' + formatInteger_cor(required) + ' documentos generados.';

    const start = (Number(pagination.page || 1) - 1) * Number(pagination.page_size || 30);
    const canOpen = hasPermission_cor('reporte_abrir_detalle');
    const body = rows.length ? rows.map((row,index) => {
      const docs = row.documentos || {};
      const project = canOpen
        ? '<button type="button" class="idb-cor-project-link" data-idb-doc-project="' + index + '">' + esc(row.proyecto || row.id_proyecto || '—') + '</button>'
        : esc(row.proyecto || row.id_proyecto || '—');
      const equipment = canOpen
        ? '<button type="button" class="idb-cor-equipment-link" data-idb-doc-equipment="' + index + '">' + esc(row.referencia_sitio || '—') + '</button>'
        : esc(row.referencia_sitio || '—');
      return '<tr>' +
        '<td>' + (start + index + 1) + '</td>' +
        '<td>' + esc(row.supervisor || '—') + '</td>' +
        '<td>' + esc(row.estado || '—') + '</td>' +
        '<td>' + esc(row.estatus || '—') + '</td>' +
        '<td>' + project + '</td>' +
        '<td>' + equipment + '</td>' +
        '<td>' + documentationCell_cor(docs.cpvp,'date') + '</td>' +
        '<td>' + documentationCell_cor(docs.ccnr,'date') + '</td>' +
        '<td>' + documentationCell_cor(docs.ccr,'date') + '</td>' +
        '<td>' + documentationCell_cor(docs.condiciones_obra,'text') + '</td>' +
        '<td>' + documentationCell_cor(docs.cti,'date') + '</td>' +
        '<td>' + documentationCell_cor(docs.revision_supervisor,'date') + '</td>' +
        '<td>' + documentationCell_cor(docs.evaluacion_montaje,'text') + '</td>' +
        '<td>' + documentationCell_cor(docs.minuta_interfon,'date') + '</td>' +
        '<td>' + documentationCell_cor(docs.certificado_regulador,'text') + '</td>' +
        '<td>' + formatInteger_cor(row.documentos_requeridos) + '</td>' +
        '<td>' + formatInteger_cor(row.documentos_generados_progreso) + '</td>' +
        '<td>' + formatInteger_cor(row.documentos_pendientes) + '</td>' +
        '<td><span class="idb-cor-doc-pct ' + documentationPctClass_cor(row.cumplimiento_porcentaje) + '">' + formatPct_cor(row.cumplimiento_porcentaje) + '</span></td>' +
      '</tr>';
    }).join('') : emptyRow_cor(19, 'Sin equipos dentro del alcance documental para el supervisor seleccionado.');

    const page = Number(pagination.page || 1);
    const totalPages = Math.max(1, Number(pagination.total_pages || 1));
    const totalRows = Number(pagination.total_rows || 0);
    const rangeStart = totalRows ? start + 1 : 0;
    const rangeEnd = Math.min(totalRows, start + rows.length);
    const pageButtons = documentationPageWindow_cor(page,totalPages).map(value =>
      '<button type="button" data-idb-doc-page="' + value + '" class="' + (value === page ? 'active' : '') + '">' + value + '</button>'
    ).join('');

    host.innerHTML = '<div class="idb-cor-table-wrap"><table class="idb-cor-table idb-cor-documentation-table"><thead><tr>' +
      '<th>#</th><th>SUP</th><th>EDO</th><th>ESTATUS</th><th>PROYECTO</th><th>REFERENCIA EN SITIO</th>' +
      '<th>CPVP</th><th>CCNR</th><th>CCR</th><th>COND. OBRA</th><th>CTI</th><th>REV. SUP</th><th>EVAL. MONTAJE</th><th>MINUTA INTERFON</th><th>CERT. REGULADOR</th><th>REQ.</th><th>GEN.</th><th>PEND.</th><th>%</th>' +
      '</tr></thead><tbody>' + body + '</tbody></table></div>' +
      '<div class="idb-cor-documentation-foot"><span>' + (totalRows ? ('Mostrando ' + rangeStart + ' a ' + rangeEnd + ' de ' + totalRows) : '0 registros') + '</span>' +
      '<div class="idb-cor-documentation-pages"><button type="button" data-idb-doc-prev="1"' + (pagination.has_previous ? '' : ' disabled') + '>‹</button>' + pageButtons + '<button type="button" data-idb-doc-next="1"' + (pagination.has_next ? '' : ' disabled') + '>›</button></div>' +
      '<span>Página ' + page + ' de ' + totalPages + '</span></div>';

    host.querySelectorAll('[data-idb-doc-project]').forEach(button => {
      button.addEventListener('click', () => openProject_cor(rows[Number(button.dataset.idbDocProject)]?.proyecto || rows[Number(button.dataset.idbDocProject)]?.id_proyecto));
    });
    host.querySelectorAll('[data-idb-doc-equipment]').forEach(button => {
      button.addEventListener('click', () => {
        const row = rows[Number(button.dataset.idbDocEquipment)];
        if(row) openEquipment_cor(row.proyecto, row.referencia_sitio);
      });
    });
    host.querySelectorAll('[data-idb-doc-page]').forEach(button => {
      button.addEventListener('click', () => {
        const target = Number(button.dataset.idbDocPage || 1);
        if(!target || target === state.documentationPage) return;
        state.documentationPage = target;
        loadSummary_cor().catch(() => {});
      });
    });
    host.querySelector('[data-idb-doc-prev]')?.addEventListener('click', () => {
      if(state.documentationPage <= 1) return;
      state.documentationPage -= 1;
      loadSummary_cor().catch(() => {});
    });
    host.querySelector('[data-idb-doc-next]')?.addEventListener('click', () => {
      if(state.documentationPage >= totalPages) return;
      state.documentationPage += 1;
      loadSummary_cor().catch(() => {});
    });
  }

  function renderSummary_cor(response){
    state.summary = response;
    const blocks = response && response.blocks ? response.blocks : {};
    renderComments_cor(blocks.comentarios_junta || {});
    renderProjects_cor(blocks.proyectos_activos || {});
    renderDocumentation_cor(blocks.documentacion_pendiente || {});
    renderAditivas_cor(blocks.aditivas || {});
    renderDebt_cor(blocks.adeudos_contractuales || {});
    updateModeUi_cor();
    bindResultRows_cor();
  }

  function resolveColumnValue_cor(row, field){
    if(Array.isArray(field)){
      for(const key of field){
        const value = row && row[key];
        if(value !== null && value !== undefined && raw(value) !== '' && raw(value) !== '-' && raw(value) !== '.') return value;
      }
      return null;
    }
    return row && row[field];
  }

  function displayColumn_cor(value, type){
    if(type === 'fecha') return formatDate_cor(value);
    if(type === 'pct') return formatPct_cor(value);
    return raw(value) || '—';
  }

  function renderReportCell_cor(row, item, sectionCode){
    const label = Array.isArray(item) ? item[0] : '';
    const field = Array.isArray(item) ? item[1] : '';
    const type = Array.isArray(item) ? item[2] : 'texto';
    const value = resolveColumnValue_cor(row, field);
    const display = displayColumn_cor(value, type);
    const editableField = typeof field === 'string' ? field : '';
    const config = state.meetingMode && hasPermission_cor('reporte_editar') ? quickEditConfig_cor(sectionCode, editableField) : null;
    if(!config) return '<td>' + esc(display) + '</td>';
    return '<td class="idb-cor-cell-editable" tabindex="0" role="button" data-idb-cor-cell-edit data-row-id="' + esc(row.id_ins_fl) + '" data-section="' + esc(sectionCode) + '" data-field="' + esc(editableField) + '" aria-label="Editar ' + esc(config.label) + ' de ' + esc(row.referencia_sitio || 'equipo') + '">' +
      '<span class="idb-cor-cell-value">' + esc(display) + '</span></td>';
  }

  function renderReport_cor(response){
    closeCellEditor_cor();
    state.report = response;
    const host = $('idb-cor-report-result');
    if(!host) return;
    const section = response && response.section ? response.section : null;
    const rows = Array.isArray(response && response.rows) ? response.rows : [];
    if(!section){
      host.innerHTML = '<div class="idb-cor-empty idb-cor-inline-empty"><span>📋</span><strong>Sin sección consultada</strong></div>';
      return;
    }

    const sectionCode = raw(section.codigo);
    const columns = reportColumns_cor(section);
    const quickEditVisible = state.meetingMode && hasPermission_cor('reporte_editar') && Boolean(QUICK_EDIT_FIELDS_COR[sectionCode]);
    const header = ['Proyecto','Equipo','Ciudad','Supervisor','Asesor'].concat(columns.map(item => item[0])).concat(['Alertas']);
    const canOpen = hasPermission_cor('reporte_abrir_detalle');
    const body = rows.length ? rows.map(row => {
      const dynamic = columns.map(item => renderReportCell_cor(row, item, sectionCode)).join('');
      const alerts = Array.isArray(row.notificaciones) && row.notificaciones.length
        ? '<div class="idb-cor-alerts">' + row.notificaciones.map(alert => '<span class="idb-cor-alert" title="' + esc(alert.texto) + '">' + esc(alert.emoji) + ' ' + esc(alert.texto) + '</span>').join('') + '</div>'
        : '<span class="idb-cor-muted">—</span>';
      const attrs = canOpen && raw(row.proyecto) && raw(row.referencia_sitio)
        ? ' class="idb-cor-clickable" data-equipment-project="' + esc(row.proyecto) + '" data-equipment-reference="' + esc(row.referencia_sitio) + '"'
        : '';
      return '<tr' + attrs + '><td>' + esc(row.proyecto || '—') + '</td><td>' + esc(row.referencia_sitio || '—') + '</td><td>' + esc(row.ciudad || '—') + '</td><td>' + esc(row.supervisor_fl || '—') + '</td><td>' + esc(row.vendedor || '—') + '</td>' + dynamic + '<td>' + alerts + '</td></tr>';
    }).join('') : emptyRow_cor(header.length, 'Sin equipos para esta sección y universo seleccionado.');

    const editHint = quickEditVisible ? ' · <span class="idb-cor-edit-hint">Edición rápida activa</span>' : '';
    host.innerHTML = '<div class="idb-cor-note idb-cor-note-neutral"><strong>' + esc(section.codigo + ' · ' + section.nombre) + '</strong> · ' + esc(formatInteger_cor(response.total)) + ' equipos' + (response.section_forced ? ' · Sección forzada por AFL' : '') + editHint + '</div>' +
      '<div class="idb-cor-table-wrap"><table class="idb-cor-table"><thead><tr>' + header.map(label => '<th>' + esc(label) + '</th>').join('') + '</tr></thead><tbody>' + body + '</tbody></table></div>';
    bindResultRows_cor();
  }

  async function loadSummary_cor(){
    if(!validUniverse_cor()) return;
    const requestId = ++state.summaryRequest;
    try{
      const params = queryParams_cor(false);
      const response = await fetchJson_cor('/api/instalaciones/dashboard/resumen?' + params.toString());
      if(requestId !== state.summaryRequest) return;
      renderSummary_cor(response);
    }catch(error){
      if(requestId !== state.summaryRequest) return;
      setStatus_cor('No se pudo cargar el resumen: ' + error.message);
    }
  }

  async function loadReport_cor(){
    if(!validUniverse_cor() || !state.reportSection || !hasPermission_cor('reporte_listado_ver')) return;
    const requestId = ++state.reportRequest;
    const host = $('idb-cor-report-result');
    if(host) host.innerHTML = '<div class="idb-cor-empty idb-cor-inline-empty"><span>⏳</span><strong>Consultando sección...</strong></div>';
    try{
      const params = queryParams_cor(true);
      const response = await fetchJson_cor('/api/instalaciones/dashboard/reporte?' + params.toString());
      if(requestId !== state.reportRequest) return;
      renderReport_cor(response);
    }catch(error){
      if(requestId !== state.reportRequest) return;
      if(host) host.innerHTML = '<div class="idb-cor-note idb-cor-note-warning">' + esc(error.message) + '</div>';
      setStatus_cor('No se pudo cargar el reporte: ' + error.message);
    }
  }

  async function reloadUniverse_cor(){
    updateSelectionUi_cor();
    renderSectionSelect_cor();
    if(!validUniverse_cor()){
      state.summary = null;
      state.report = null;
      return;
    }
    setLoading_cor(true);
    try{
      await Promise.all([
        loadSummary_cor(),
        state.reportSection && hasPermission_cor('reporte_listado_ver') ? loadReport_cor() : Promise.resolve()
      ]);
      setStatus_cor('Dashboard actualizado para: ' + selectedText_cor());
    }finally{
      setLoading_cor(false);
    }
  }

  function bindSupervisorChips_cor(){
    const host = $('idb-cor-supervisor-chips');
    if(!host || !hasPermission_cor('selector_filtrar')) return;
    host.querySelectorAll('[data-supervisor]').forEach(button => {
      button.addEventListener('click', () => {
        const code = raw(button.dataset.supervisor);
        const index = state.selectedSupervisors.indexOf(code);
        if(index >= 0) state.selectedSupervisors.splice(index, 1);
        else state.selectedSupervisors.push(code);
        state.selectedSupervisors.sort((a,b) => a.localeCompare(b, 'es', { sensitivity:'base' }));
        state.documentationPage = 1;
        persistDashboardConfig_cor();
        renderSupervisorChips_cor();
        reloadUniverse_cor().catch(() => {});
      });
    });
    host.querySelector('[data-supervisor-all]')?.addEventListener('click', () => {
      const all = state.supervisors.map(item => raw(item.supervisor)).filter(Boolean);
      const allSelected = all.length > 0 && state.selectedSupervisors.length === all.length;
      state.selectedSupervisors = allSelected ? [] : [...all];
      state.documentationPage = 1;
      state.afl = false;
      persistDashboardConfig_cor();
      renderSupervisorChips_cor();
      reloadUniverse_cor().catch(() => {});
    });
    host.querySelector('[data-special-filter="AFL"]')?.addEventListener('click', () => {
      state.afl = !state.afl;
      state.documentationPage = 1;
      if(state.afl) state.reportSection = AJUSTE_STATUS_COR;
      persistDashboardConfig_cor();
      renderSupervisorChips_cor();
      renderSectionSelect_cor();
      reloadUniverse_cor().catch(() => {});
    });
  }

  function bind_cor(){
    if(state.bound) return;
    state.bound = true;

    document.addEventListener('pointerdown', event => {
      const editor = $('idb-cor-cell-editor');
      if(!editor || editor.contains(event.target)) return;
      const cell = event.target && event.target.closest ? event.target.closest('[data-idb-cor-cell-edit]') : null;
      if(cell) return;
      closeCellEditor_cor();
    });
    document.addEventListener('keydown', event => {
      if(event.key === 'Escape') closeCellEditor_cor();
    });
    window.addEventListener('resize', positionCellEditor_cor);
    document.addEventListener('scroll', positionCellEditor_cor, true);

    $('idb-cor-refresh')?.addEventListener('click', () => refresh_cor(true));
    $('idb-cor-mode-normal')?.addEventListener('click', () => {
      if(!state.meetingMode) return;
      closeCellEditor_cor();
      state.meetingMode = false;
      state.documentationPage = 1;
      persistDashboardConfig_cor();
      updateModeUi_cor();
      if(validUniverse_cor()) reloadUniverse_cor().catch(() => {});
    });
    $('idb-cor-mode-junta')?.addEventListener('click', () => {
      if(state.meetingMode) return;
      closeCellEditor_cor();
      state.meetingMode = true;
      state.documentationPage = 1;
      persistDashboardConfig_cor();
      updateModeUi_cor();
      if(validUniverse_cor()) reloadUniverse_cor().catch(() => {});
    });
    $('idb-cor-section-select')?.addEventListener('change', event => {
      if(state.afl) return;
      state.reportSection = raw(event.target.value);
      persistDashboardConfig_cor();
      if(state.reportSection && validUniverse_cor()) loadReport_cor().catch(() => {});
      else{
        const host = $('idb-cor-report-result');
        if(host) host.innerHTML = '<div class="idb-cor-empty idb-cor-inline-empty"><span aria-hidden="true">📋</span><strong>Sin sección consultada</strong><p>Selecciona una etapa del reporte para mostrar la tabla.</p></div>';
      }
    });
  }

  async function refresh_cor(keepSelection){
    if(state.loading) return;
    setLoading_cor(true);
    try{
      const response = await fetchJson_cor('/api/instalaciones/dashboard/bootstrap');
      if(!keepSelection){
        restoreDashboardConfig_cor();
        state.summary = null;
        state.report = null;
      }
      applyBootstrap_cor(response);
      state.loaded = true;
      if(validUniverse_cor()){
        await Promise.all([
          loadSummary_cor(),
          state.reportSection && hasPermission_cor('reporte_listado_ver') ? loadReport_cor() : Promise.resolve()
        ]);
        setStatus_cor('Dashboard actualizado para: ' + selectedText_cor());
      }else{
        setStatus_cor('Selecciona supervisores para consultar el Dashboard.');
      }
    }catch(error){
      setStatus_cor('No se pudo cargar Dashboard de Instalaciones: ' + error.message);
    }finally{
      setLoading_cor(false);
      if(state.pendingOpenReset){
        state.pendingOpenReset = false;
        resetOpenState_cor();
        refresh_cor(false).catch(() => {});
      }
    }
  }

  function resetOpenState_cor(){
    closeCellEditor_cor();
    restoreDashboardConfig_cor();
    state.summary = null;
    state.report = null;
    state.documentationPage = 1;
    state.loaded = false;
    state.summaryRequest += 1;
    state.reportRequest += 1;
    updateSelectionUi_cor();
    updateModeUi_cor();
  }

  async function init_cor(){
    try{
      await loadHtml_cor();
      bind_cor();
      state.ready = true;
      restoreDashboardConfig_cor();
      applyPermissions_cor();
      if(!state.loaded) await refresh_cor(true);
    }catch(error){
      setStatus_cor(error.message);
    }
  }

  document.addEventListener('mantto:navigation', event => {
    const detail = event && event.detail ? event.detail : {};
    if(detail.route !== 'instalaciones-dashboard' || detail.type !== 'open') return;
    if(!state.ready && !state.loaded) return;
    if(state.loading){ state.pendingOpenReset = true; return; }
    resetOpenState_cor();
    refresh_cor(false).catch(() => {});
  });

  document.addEventListener('mantto:permissions-updated', () => {
    const current = window.ManttoRouter && window.ManttoRouter.getCurrent ? window.ManttoRouter.getCurrent() : null;
    if(current && current.route === 'instalaciones-dashboard'){
      state.loaded = false;
      refresh_cor(true).catch(() => {});
    }
  });

  window.ManttoInstalacionesDashboard_cor = {
    init:init_cor,
    refresh:refresh_cor
  };
})();

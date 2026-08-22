(function(){
  'use strict';

  const VERSION_COR = '20260821-carpetas-disponibles-v002';
  const API_BASE = (window.MANTTO_API_BASE || 'http://localhost:3001').replace(/\/$/, '');
  const TABLE_PAGE_SIZE_COR = 30;

  const PERMISSIONS_COR = Object.freeze({
    acceso_visual:'INSTALACIONES_CARPETAS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
    carpetas_ver:'INSTALACIONES_CARPETAS_CARPETAS_REGISTRADAS_LISTADO.VER',
    carpetas_buscar:'INSTALACIONES_CARPETAS_CARPETAS_REGISTRADAS_LISTADO.BUSCAR',
    carpetas_redirigir:'INSTALACIONES_CARPETAS_CARPETAS_REGISTRADAS_LISTADO.REDIRIGIR',
    proyectos_ver:'INSTALACIONES_CARPETAS_PROYECTOS_SIN_CARPETA_LISTADO.VER',
    proyectos_buscar:'INSTALACIONES_CARPETAS_PROYECTOS_SIN_CARPETA_LISTADO.BUSCAR',
    relacionador_ver:'INSTALACIONES_CARPETAS_RELACIONADOR_FORMULARIO.VER',
    relacionador_crear:'INSTALACIONES_CARPETAS_RELACIONADOR_FORMULARIO.CREAR'
  });

  const state = {
    ready:false,
    bound:false,
    loaded:false,
    loading:false,
    saving:false,
    permissions:{},
    folders:[],
    projects:[],
    availableFolders:[],
    folderSearch:'',
    projectSearch:'',
    projectStatusFilter:'',
    folderPage:1,
    projectPage:1,
    selectedProject:'',
    selectedFolder:''
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
    return $('view-instalaciones-carpetas');
  }

  function normalizePermissions_cor(source){
    const incoming = source && typeof source === 'object' ? source : {};
    return Object.keys(PERMISSIONS_COR).reduce((result, key) => {
      result[key] = incoming[key] === true;
      return result;
    }, {});
  }

  function hasPermission_cor(key){
    if(state.permissions[key] !== true) return false;
    const code = PERMISSIONS_COR[key];
    if(!code || !window.ManttoPermissions || typeof window.ManttoPermissions.state !== 'function') return true;
    const effective = window.ManttoPermissions.state(code);
    if(!effective || effective.exists !== true) return true;
    return effective.efectivo === true;
  }

  function authHeaders_cor(){
    return Object.assign(
      { Accept:'application/json' },
      window.ManttoAuth && window.ManttoAuth.authHeaders
        ? window.ManttoAuth.authHeaders()
        : {}
    );
  }

  async function requestJson_cor(path, options){
    const opts = options || {};
    if(window.ManttoAuth && typeof window.ManttoAuth.api === 'function'){
      return window.ManttoAuth.api(path, opts);
    }

    const method = String(opts.method || 'GET').toUpperCase();
    const headers = Object.assign({ Accept:'application/json' }, authHeaders_cor());
    if(method !== 'GET' && method !== 'HEAD') headers['Content-Type'] = 'application/json';
    const response = await fetch(API_BASE + path, {
      method,
      credentials:'include',
      headers,
      cache:'no-store',
      body:opts.body
    });
    const text = await response.text();
    let json = null;
    try{ json = text ? JSON.parse(text) : {}; }
    catch(_error){ throw new Error('El backend respondio contenido no JSON.'); }
    if(!response.ok || (json && json.ok === false)){
      const error = new Error((json && (json.message || json.error)) || ('Error HTTP ' + response.status));
      error.status = response.status;
      error.code = json && json.code;
      error.details = json && json.details;
      throw error;
    }
    return json || {};
  }

  async function loadHtml_cor(){
    const view = getView_cor();
    if(!view) throw new Error('No existe la vista view-instalaciones-carpetas.');
    if(view.dataset.icarpCorReady === '1') return view;

    const response = await fetch(
      './modules/instalaciones-carpetas/instalaciones-carpetas_cor.html?v=' + VERSION_COR,
      { cache:'no-store' }
    );
    if(!response.ok) throw new Error('No se pudo cargar la vista Gestor de Carpetas.');
    view.innerHTML = await response.text();
    view.dataset.icarpCorReady = '1';
    return view;
  }

  function setStatus_cor(message, type){
    const status = $('icarp-cor-status');
    if(!status) return;
    status.textContent = message || '';
    status.dataset.type = type || 'ready';
  }

  function setFeedback_cor(message, type){
    const feedback = $('icarp-cor-relation-feedback');
    if(!feedback) return;
    feedback.textContent = message || '';
    feedback.dataset.type = type || 'ready';
  }

  function setLoading_cor(value){
    state.loading = Boolean(value);
    const page = getView_cor() && getView_cor().querySelector('.icarp-cor-page');
    if(page) page.classList.toggle('icarp-cor-loading', state.loading);
    const refresh = $('icarp-cor-refresh');
    if(refresh) refresh.disabled = state.loading || state.saving;
    updateRelationControls_cor();
  }

  function formatCount_cor(value){
    const number = Number(value);
    return Number.isFinite(number) ? number.toLocaleString('es-MX') : '0';
  }

  function formatDateTime_cor(value){
    const text = raw(value);
    if(!text) return '\u2014';
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?/);
    if(!match) return text;
    const date = match[3] + '/' + match[2] + '/' + match[1];
    return match[4] ? date + ' - ' + match[4] + ':' + match[5] : date;
  }

  function formatTimestamp_cor(){
    const date = new Date();
    const pad = value => String(value).padStart(2, '0');
    return pad(date.getDate()) + '/' + pad(date.getMonth() + 1) + '/' + date.getFullYear() +
      ' - ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
  }

  function normalizeSearch_cor(value){
    return raw(value).toLocaleLowerCase('es-MX');
  }

  function matchesSearch_cor(values, search){
    const needle = normalizeSearch_cor(search);
    if(!needle) return true;
    return values.some(value => normalizeSearch_cor(value).includes(needle));
  }

  function safeUrl_cor(value){
    const text = raw(value);
    if(!text) return '';
    try{
      const url = new URL(text, window.location.origin);
      return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
    }catch(_error){
      return '';
    }
  }

  function filteredFolders_cor(){
    if(!hasPermission_cor('carpetas_ver')) return [];
    return state.folders.filter(row => matchesSearch_cor([
      row.nombre_carpeta,
      row.carpeta_id,
      row.id_proyecto,
      row.nombre_proyecto
    ], state.folderSearch));
  }

  function projectStatus_cor(row){
    const explicit = raw(row && row.proyecto_estado).toUpperCase();
    if(explicit === 'ACTIVO' || explicit === 'INACTIVO') return explicit;
    return row && row.proyecto_activo === true ? 'ACTIVO' : 'INACTIVO';
  }

  function filteredProjects_cor(){
    if(!hasPermission_cor('proyectos_ver')) return [];
    return state.projects.filter(row => {
      if(state.projectStatusFilter && projectStatus_cor(row) !== state.projectStatusFilter) return false;
      return matchesSearch_cor([
        row.id_proyecto,
        row.nombre_proyecto,
        row.supervisores,
        row.ciudad,
        row.estado
      ], state.projectSearch);
    });
  }

  function clampPage_cor(page, totalRows){
    const totalPages = Math.max(1, Math.ceil(totalRows / TABLE_PAGE_SIZE_COR));
    return Math.max(1, Math.min(Number(page) || 1, totalPages));
  }

  function pageRows_cor(rows, page){
    const safePage = clampPage_cor(page, rows.length);
    const start = (safePage - 1) * TABLE_PAGE_SIZE_COR;
    return {
      page:safePage,
      totalPages:Math.max(1, Math.ceil(rows.length / TABLE_PAGE_SIZE_COR)),
      start,
      rows:rows.slice(start, start + TABLE_PAGE_SIZE_COR)
    };
  }

  function folderRow_cor(row, index){
    const linked = Boolean(row.id_proyecto_drive && row.id_proyecto);
    const link = hasPermission_cor('carpetas_redirigir') ? safeUrl_cor(row.enlace) : '';
    const project = linked
      ? '<div class="icarp-cor-project-ref"><span class="icarp-cor-project-name">' + esc(row.nombre_proyecto || row.id_proyecto) + '</span><small>' + esc(row.id_proyecto) + '</small></div>'
      : '<span class="icarp-cor-muted">Sin relacionar</span>';
    const linkCell = link
      ? '<a class="icarp-cor-drive-link" href="' + esc(link) + '" target="_blank" rel="noopener noreferrer">Abrir en Drive</a>'
      : '<span class="icarp-cor-muted">\u2014</span>';
    const badge = linked
      ? '<span class="icarp-cor-badge icarp-cor-badge-related">Relacionada</span>'
      : '<span class="icarp-cor-badge icarp-cor-badge-available">Disponible</span>';

    return '<tr>' +
      '<td>' + index + '</td>' +
      '<td><span class="icarp-cor-folder-name">' + esc(row.nombre_carpeta || 'Sin nombre') + '</span></td>' +
      '<td><span class="icarp-cor-drive-id" title="' + esc(row.carpeta_id) + '">' + esc(row.carpeta_id || '\u2014') + '</span></td>' +
      '<td>' + linkCell + '</td>' +
      '<td>' + project + '</td>' +
      '<td>' + badge + '</td>' +
      '<td>' + esc(formatDateTime_cor(row.fecha_sincronizacion || row.updated_at)) + '</td>' +
    '</tr>';
  }

  function projectRow_cor(row, index){
    const status = projectStatus_cor(row);
    const badge = status === 'ACTIVO'
      ? '<span class="icarp-cor-badge icarp-cor-badge-related">Activo</span>'
      : '<span class="icarp-cor-badge icarp-cor-badge-inactive">Inactivo</span>';
    return '<tr class="icarp-cor-project-row" tabindex="0" role="button" data-project-id="' + esc(row.id_proyecto) + '" aria-label="Abrir proyecto ' + esc(row.nombre_proyecto || row.id_proyecto || '') + '">' +
      '<td>' + index + '</td>' +
      '<td><span class="icarp-cor-drive-id">' + esc(row.id_proyecto || '\u2014') + '</span></td>' +
      '<td><span class="icarp-cor-project-name">' + esc(row.nombre_proyecto || row.id_proyecto || 'Sin nombre') + '</span></td>' +
      '<td>' + esc(row.supervisores || '\u2014') + '</td>' +
      '<td>' + badge + '</td>' +
    '</tr>';
  }

  function renderFolderPagination_cor(filtered, pageData){
    const total = $('icarp-cor-folders-total');
    const info = $('icarp-cor-folders-page-info');
    const prev = $('icarp-cor-folders-prev');
    const next = $('icarp-cor-folders-next');
    if(total){
      const filteredCount = filtered.length;
      const baseCount = state.folders.length;
      total.textContent = state.folderSearch
        ? formatCount_cor(filteredCount) + ' de ' + formatCount_cor(baseCount) + ' carpetas'
        : formatCount_cor(filteredCount) + (filteredCount === 1 ? ' carpeta' : ' carpetas');
    }
    if(info) info.textContent = 'Pagina ' + pageData.page + ' de ' + pageData.totalPages;
    if(prev) prev.disabled = pageData.page <= 1;
    if(next) next.disabled = pageData.page >= pageData.totalPages;
  }

  function renderProjectPagination_cor(filtered, pageData){
    const total = $('icarp-cor-projects-total');
    const info = $('icarp-cor-projects-page-info');
    const prev = $('icarp-cor-projects-prev');
    const next = $('icarp-cor-projects-next');
    if(total){
      const filtering = Boolean(state.projectSearch || state.projectStatusFilter);
      total.textContent = filtering
        ? formatCount_cor(filtered.length) + ' de ' + formatCount_cor(state.projects.length) + ' proyectos sin carpeta'
        : formatCount_cor(filtered.length) + (filtered.length === 1 ? ' proyecto sin carpeta' : ' proyectos sin carpeta');
    }
    if(info) info.textContent = 'Pagina ' + pageData.page + ' de ' + pageData.totalPages;
    if(prev) prev.disabled = pageData.page <= 1;
    if(next) next.disabled = pageData.page >= pageData.totalPages;
  }

  function renderFolders_cor(){
    const body = $('icarp-cor-folders-body');
    if(!body) return;
    const filtered = filteredFolders_cor();
    const pageData = pageRows_cor(filtered, state.folderPage);
    state.folderPage = pageData.page;
    body.innerHTML = pageData.rows.length
      ? pageData.rows.map((row, index) => folderRow_cor(row, pageData.start + index + 1)).join('')
      : '<tr><td colspan="7" class="icarp-cor-empty-cell">' +
          (state.folderSearch ? 'No hay carpetas que coincidan con la busqueda.' : 'No hay carpetas registradas disponibles.') +
        '</td></tr>';
    renderFolderPagination_cor(filtered, pageData);
  }

  function openProject_cor(projectId){
    const id = raw(projectId);
    if(!id) return;
    const project = state.projects.find(row => raw(row.id_proyecto) === id);
    if(!project) return;
    if(window.ManttoDetails && typeof window.ManttoDetails.openProyecto === 'function'){
      window.ManttoDetails.openProyecto(id, {
        template:'cliente-unificado',
        source:'instalaciones-carpetas',
        projectName:project.nombre_proyecto || id
      });
    }
  }

  function bindProjectRows_cor(){
    const body = $('icarp-cor-projects-body');
    if(!body) return;
    body.querySelectorAll('[data-project-id]').forEach(row => {
      const open = () => openProject_cor(row.dataset.projectId);
      row.addEventListener('click', open);
      row.addEventListener('keydown', event => {
        if(event.key === 'Enter' || event.key === ' '){
          event.preventDefault();
          open();
        }
      });
    });
  }

  function renderProjects_cor(){
    const body = $('icarp-cor-projects-body');
    if(!body) return;
    const filtered = filteredProjects_cor();
    const pageData = pageRows_cor(filtered, state.projectPage);
    state.projectPage = pageData.page;
    body.innerHTML = pageData.rows.length
      ? pageData.rows.map((row, index) => projectRow_cor(row, pageData.start + index + 1)).join('')
      : '<tr><td colspan="5" class="icarp-cor-empty-cell">' +
          ((state.projectSearch || state.projectStatusFilter) ? 'No hay proyectos que coincidan con los filtros.' : 'No hay proyectos pendientes de carpeta.') +
        '</td></tr>';
    renderProjectPagination_cor(filtered, pageData);
    bindProjectRows_cor();
  }

  function projectOptionLabel_cor(row){
    const name = raw(row.nombre_proyecto) || raw(row.id_proyecto) || 'Proyecto';
    return name + (row.id_proyecto ? ' - ' + row.id_proyecto : '');
  }

  function folderOptionLabel_cor(row){
    const name = raw(row.nombre_carpeta) || raw(row.carpeta_id) || 'Carpeta';
    return name + (row.carpeta_id ? ' - ' + row.carpeta_id : '');
  }

  function renderRelationOptions_cor(){
    const projectSelect = $('icarp-cor-project-select');
    const folderSelect = $('icarp-cor-folder-select');
    if(!projectSelect || !folderSelect) return;

    const previousProject = state.selectedProject;
    const previousFolder = state.selectedFolder;

    projectSelect.innerHTML = '<option value="">Selecciona un proyecto...</option>' + state.projects.map(row =>
      '<option value="' + esc(row.id_proyecto) + '">' + esc(projectOptionLabel_cor(row)) + '</option>'
    ).join('');
    folderSelect.innerHTML = '<option value="">Selecciona una carpeta...</option>' + state.availableFolders.map(row =>
      '<option value="' + esc(row.id_carpeta) + '">' + esc(folderOptionLabel_cor(row)) + '</option>'
    ).join('');

    state.selectedProject = state.projects.some(row => raw(row.id_proyecto) === raw(previousProject)) ? raw(previousProject) : '';
    state.selectedFolder = state.availableFolders.some(row => String(row.id_carpeta) === String(previousFolder)) ? String(previousFolder) : '';
    projectSelect.value = state.selectedProject;
    folderSelect.value = state.selectedFolder;
    updateRelationControls_cor();
  }

  function updateRelationControls_cor(){
    const canCreate = hasPermission_cor('relacionador_crear');
    const projectSelect = $('icarp-cor-project-select');
    const folderSelect = $('icarp-cor-folder-select');
    const save = $('icarp-cor-save');
    const clear = $('icarp-cor-relation-clear');
    const blocked = state.loading || state.saving || !canCreate;

    if(projectSelect) projectSelect.disabled = blocked || state.projects.length === 0;
    if(folderSelect) folderSelect.disabled = blocked || state.availableFolders.length === 0;
    if(save){
      save.disabled = blocked || !state.selectedProject || !state.selectedFolder || state.projects.length === 0 || state.availableFolders.length === 0;
      save.textContent = state.saving ? 'Guardando relacion...' : 'Guardar relacion';
    }
    if(clear) clear.disabled = state.loading || state.saving || (!state.selectedProject && !state.selectedFolder);
  }

  function clearRelation_cor(){
    state.selectedProject = '';
    state.selectedFolder = '';
    const projectSelect = $('icarp-cor-project-select');
    const folderSelect = $('icarp-cor-folder-select');
    if(projectSelect) projectSelect.value = '';
    if(folderSelect) folderSelect.value = '';
    setFeedback_cor('', 'ready');
    updateRelationControls_cor();
  }

  function applyPermissionUi_cor(){
    if(window.ManttoPermissions && typeof window.ManttoPermissions.apply === 'function'){
      window.ManttoPermissions.apply(getView_cor() || document);
    }

    const foldersPanel = $('icarp-cor-folders-panel');
    const projectsPanel = $('icarp-cor-projects-panel');
    const relationPanel = $('icarp-cor-relation-panel');
    const folderSearch = $('icarp-cor-folder-search-wrap');
    const projectSearch = $('icarp-cor-project-search-wrap');
    const projectStatus = $('icarp-cor-project-status-wrap');

    if(foldersPanel) foldersPanel.hidden = !hasPermission_cor('carpetas_ver');
    if(projectsPanel) projectsPanel.hidden = !hasPermission_cor('proyectos_ver');
    if(relationPanel) relationPanel.hidden = !hasPermission_cor('relacionador_ver');
    if(folderSearch) folderSearch.hidden = !hasPermission_cor('carpetas_buscar');
    if(projectSearch) projectSearch.hidden = !hasPermission_cor('proyectos_buscar');
    if(projectStatus) projectStatus.hidden = !hasPermission_cor('proyectos_ver');
    updateRelationControls_cor();
  }

  function renderBootstrap_cor(response){
    state.permissions = normalizePermissions_cor(response && response.permissions);
    state.folders = Array.isArray(response && response.carpetas_registradas) ? response.carpetas_registradas : [];
    state.projects = Array.isArray(response && response.proyectos_sin_carpeta) ? response.proyectos_sin_carpeta : [];
    state.availableFolders = Array.isArray(response && response.carpetas_disponibles) ? response.carpetas_disponibles : [];
    state.folderPage = clampPage_cor(state.folderPage, state.folders.length);
    state.projectPage = clampPage_cor(state.projectPage, state.projects.length);

    applyPermissionUi_cor();
    renderFolders_cor();
    renderProjects_cor();
    renderRelationOptions_cor();
  }

  function renderLoading_cor(){
    const foldersBody = $('icarp-cor-folders-body');
    const projectsBody = $('icarp-cor-projects-body');
    if(foldersBody) foldersBody.innerHTML = '<tr><td colspan="7" class="icarp-cor-empty-cell">Cargando carpetas...</td></tr>';
    if(projectsBody) projectsBody.innerHTML = '<tr><td colspan="5" class="icarp-cor-empty-cell">Cargando proyectos...</td></tr>';
  }

  async function refresh_cor(force){
    if(state.loading || state.saving) return;
    if(state.loaded && !force) return;

    setLoading_cor(true);
    setStatus_cor('Actualizando modulo...', 'loading');
    if(!state.loaded) renderLoading_cor();

    try{
      const response = await requestJson_cor('/api/instalaciones/carpetas/bootstrap', { method:'GET' });
      renderBootstrap_cor(response);
      state.loaded = true;
      setStatus_cor('Actualizado ' + formatTimestamp_cor(), 'ok');
    }catch(error){
      setStatus_cor(error.message || 'No fue posible cargar Carpetas.', 'error');
      if(!state.loaded){
        const foldersBody = $('icarp-cor-folders-body');
        const projectsBody = $('icarp-cor-projects-body');
        if(foldersBody) foldersBody.innerHTML = '<tr><td colspan="7" class="icarp-cor-empty-cell">' + esc(error.message) + '</td></tr>';
        if(projectsBody) projectsBody.innerHTML = '<tr><td colspan="5" class="icarp-cor-empty-cell">' + esc(error.message) + '</td></tr>';
      }
    }finally{
      setLoading_cor(false);
      applyPermissionUi_cor();
    }
  }

  function applyRelationGhost_cor(response, projectId, folderId){
    const project = state.projects.find(row => raw(row.id_proyecto) === raw(projectId));
    const folderIndex = state.folders.findIndex(row => Number(row.id_carpeta) === Number(folderId));
    const relation = response && response.relation ? response.relation : {};

    if(folderIndex >= 0){
      const currentFolder = state.folders[folderIndex];
      state.folders[folderIndex] = Object.assign({}, currentFolder, {
        id_proyecto_drive:Number(relation.id_proyecto_drive) || currentFolder.id_proyecto_drive || null,
        id_proyecto:raw(relation.id_proyecto) || raw(projectId),
        nombre_proyecto:raw(relation.nombre_proyecto) || raw(project && project.nombre_proyecto) || raw(projectId),
        vinculado_at:relation.vinculado_at || new Date().toISOString()
      });
    }

    state.projects = state.projects.filter(row => raw(row.id_proyecto) !== raw(projectId));
    state.availableFolders = state.availableFolders.filter(row => Number(row.id_carpeta) !== Number(folderId));
    state.selectedProject = '';
    state.selectedFolder = '';

    const filteredFolders = filteredFolders_cor();
    const filteredProjects = filteredProjects_cor();
    state.folderPage = clampPage_cor(state.folderPage, filteredFolders.length);
    state.projectPage = clampPage_cor(state.projectPage, filteredProjects.length);

    renderFolders_cor();
    renderProjects_cor();
    renderRelationOptions_cor();
  }

  async function saveRelation_cor(event){
    event.preventDefault();
    if(state.saving || state.loading) return;
    if(!hasPermission_cor('relacionador_crear')){
      setFeedback_cor('No tienes permiso para relacionar proyectos con carpetas.', 'error');
      return;
    }

    const projectId = raw($('icarp-cor-project-select') && $('icarp-cor-project-select').value);
    const folderId = Number($('icarp-cor-folder-select') && $('icarp-cor-folder-select').value);
    if(!projectId || !Number.isInteger(folderId) || folderId <= 0){
      setFeedback_cor('Selecciona un proyecto y una carpeta disponibles.', 'error');
      return;
    }

    state.selectedProject = projectId;
    state.selectedFolder = String(folderId);
    state.saving = true;
    setFeedback_cor('Guardando relacion...', 'loading');
    updateRelationControls_cor();

    try{
      const response = await requestJson_cor('/api/instalaciones/carpetas/relacion', {
        method:'POST',
        body:JSON.stringify({ id_proyecto:projectId, id_carpeta:folderId })
      });

      applyRelationGhost_cor(response, projectId, folderId);
      setFeedback_cor((response && response.message) || 'Relacion guardada correctamente.', 'ok');
      setStatus_cor('Actualizado ' + formatTimestamp_cor(), 'ok');
    }catch(error){
      const message = error && error.status === 409
        ? (error.message || 'Los datos cambiaron durante la relacion.') + ' Usa Actualizar para sincronizar el modulo.'
        : (error.message || 'No fue posible guardar la relacion.');
      setFeedback_cor(message, 'error');
    }finally{
      state.saving = false;
      updateRelationControls_cor();
    }
  }

  function changeFolderPage_cor(delta){
    const rows = filteredFolders_cor();
    state.folderPage = clampPage_cor(state.folderPage + delta, rows.length);
    renderFolders_cor();
  }

  function changeProjectPage_cor(delta){
    const rows = filteredProjects_cor();
    state.projectPage = clampPage_cor(state.projectPage + delta, rows.length);
    renderProjects_cor();
  }

  function resetOpenState_cor(){
    state.loaded = false;
    state.folderSearch = '';
    state.projectSearch = '';
    state.projectStatusFilter = '';
    state.folderPage = 1;
    state.projectPage = 1;
    state.selectedProject = '';
    state.selectedFolder = '';
    const folderSearch = $('icarp-cor-folder-search');
    const projectSearch = $('icarp-cor-project-search');
    const projectStatus = $('icarp-cor-project-status-filter');
    const projectSelect = $('icarp-cor-project-select');
    const folderSelect = $('icarp-cor-folder-select');
    if(folderSearch) folderSearch.value = '';
    if(projectSearch) projectSearch.value = '';
    if(projectStatus) projectStatus.value = '';
    if(projectSelect) projectSelect.value = '';
    if(folderSelect) folderSelect.value = '';
    setFeedback_cor('', 'ready');
  }

  function bind_cor(){
    if(state.bound) return;
    state.bound = true;

    $('icarp-cor-refresh')?.addEventListener('click', () => refresh_cor(true));
    $('icarp-cor-folder-search')?.addEventListener('input', event => {
      state.folderSearch = event.target.value || '';
      state.folderPage = 1;
      renderFolders_cor();
    });
    $('icarp-cor-project-search')?.addEventListener('input', event => {
      state.projectSearch = event.target.value || '';
      state.projectPage = 1;
      renderProjects_cor();
    });
    $('icarp-cor-project-status-filter')?.addEventListener('change', event => {
      state.projectStatusFilter = raw(event.target.value).toUpperCase();
      state.projectPage = 1;
      renderProjects_cor();
    });
    $('icarp-cor-folders-prev')?.addEventListener('click', () => changeFolderPage_cor(-1));
    $('icarp-cor-folders-next')?.addEventListener('click', () => changeFolderPage_cor(1));
    $('icarp-cor-projects-prev')?.addEventListener('click', () => changeProjectPage_cor(-1));
    $('icarp-cor-projects-next')?.addEventListener('click', () => changeProjectPage_cor(1));
    $('icarp-cor-project-select')?.addEventListener('change', event => {
      state.selectedProject = event.target.value || '';
      setFeedback_cor('', 'ready');
      updateRelationControls_cor();
    });
    $('icarp-cor-folder-select')?.addEventListener('change', event => {
      state.selectedFolder = event.target.value || '';
      setFeedback_cor('', 'ready');
      updateRelationControls_cor();
    });
    $('icarp-cor-relation-clear')?.addEventListener('click', clearRelation_cor);
    $('icarp-cor-relation-form')?.addEventListener('submit', saveRelation_cor);
  }

  async function init_cor(){
    try{
      await loadHtml_cor();
      bind_cor();
      state.ready = true;
      applyPermissionUi_cor();
      if(!state.loaded) await refresh_cor(false);
      if(window.ManttoViewerReadOnly && typeof window.ManttoViewerReadOnly.refresh === 'function'){
        window.ManttoViewerReadOnly.refresh();
      }
    }catch(error){
      setStatus_cor(error.message || 'No fue posible iniciar Carpetas.', 'error');
    }
  }

  document.addEventListener('mantto:navigation', event => {
    const detail = event && event.detail ? event.detail : {};
    if(detail.route !== 'instalaciones-carpetas' || detail.type !== 'open') return;
    if(!state.ready && !state.loaded) return;
    if(state.loading || state.saving) return;
    resetOpenState_cor();
    refresh_cor(true).catch(() => {});
  });

  document.addEventListener('mantto:permissions-updated', () => {
    const current = window.ManttoRouter && window.ManttoRouter.getCurrent
      ? window.ManttoRouter.getCurrent()
      : null;
    if(current && current.route === 'instalaciones-carpetas'){
      state.loaded = false;
      refresh_cor(true).catch(() => {});
    }
  });

  window.ManttoInstalacionesCarpetas_cor = {
    init:init_cor,
    refresh:refresh_cor
  };
})();

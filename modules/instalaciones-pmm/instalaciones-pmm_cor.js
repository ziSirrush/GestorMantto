(function(){
  'use strict';

  const VERSION_COR = '20260821-tabla-unificada-v003';
  const PAGE_SIZE_COR = 30;
  const STAGE_ORDER_COR = Object.freeze(['03-PM', '04-M']);
  const STAGES_COR = Object.freeze({
    '03-PM':Object.freeze({ path:'/api/instalaciones/pmm/03-pm', label:'Próximos a montar' }),
    '04-M':Object.freeze({ path:'/api/instalaciones/pmm/04-m', label:'En montaje' })
  });

  const state = {
    ready:false,
    bound:false,
    loading:false,
    page:1,
    statusFilter:'',
    supervisorFilter:'',
    stages:{
      '03-PM':{ forbidden:false, error:null, response:null, visualCatalog:new Map() },
      '04-M':{ forbidden:false, error:null, response:null, visualCatalog:new Map() }
    }
  };

  const $ = id => document.getElementById(id);
  const raw = value => value === null || value === undefined ? '' : String(value).trim();
  const esc = value => raw(value)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');

  function getView_cor(){ return $('view-instalaciones-pmm'); }

  async function loadHtml_cor(){
    const view = getView_cor();
    if(!view) throw new Error('No existe la vista view-instalaciones-pmm.');
    if(view.dataset.ipmmCorReady === '1') return view;
    const response = await fetch(
      './modules/instalaciones-pmm/instalaciones-pmm_cor.html?v=' + VERSION_COR,
      { cache:'no-store' }
    );
    if(!response.ok) throw new Error('No se pudo cargar la vista PM&M.');
    view.innerHTML = await response.text();
    view.dataset.ipmmCorReady = '1';
    return view;
  }

  async function apiGet_cor(path){
    if(window.ManttoAuth && typeof window.ManttoAuth.api === 'function'){
      return window.ManttoAuth.api(path,{ method:'GET', cache:'no-store' });
    }
    const base = (window.MANTTO_API_BASE || 'http://localhost:3001').replace(/\/$/,'');
    const headers = Object.assign(
      { Accept:'application/json' },
      window.ManttoAuth && typeof window.ManttoAuth.authHeaders === 'function'
        ? window.ManttoAuth.authHeaders()
        : {}
    );
    const response = await fetch(base + path,{ headers, cache:'no-store' });
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

  function formatTimestamp_cor(value){
    const date = value ? new Date(value) : new Date();
    if(Number.isNaN(date.getTime())) return '';
    const pad = number => String(number).padStart(2,'0');
    return pad(date.getDate()) + '/' + pad(date.getMonth() + 1) + '/' + date.getFullYear() +
      ' - ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
  }

  function formatDate_cor(value){
    const text = raw(value);
    if(!text || ['-','.','N/A'].includes(text.toUpperCase())) return '—';
    const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(iso) return iso[3] + '/' + iso[2] + '/' + iso[1];
    const slash = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    if(slash) return String(slash[1]).padStart(2,'0') + '/' + String(slash[2]).padStart(2,'0') + '/' + slash[3];
    const monthMap = {JAN:'01',FEB:'02',MAR:'03',APR:'04',MAY:'05',JUN:'06',JUL:'07',AUG:'08',SEP:'09',OCT:'10',NOV:'11',DEC:'12'};
    const legacy = text.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2}|\d{4})$/);
    if(legacy){
      const month = monthMap[String(legacy[2]).toUpperCase()];
      if(month){
        const year = legacy[3].length === 2 ? ('20' + legacy[3]) : legacy[3];
        return String(legacy[1]).padStart(2,'0') + '/' + month + '/' + year;
      }
    }
    return text;
  }

  function dateSortValue_cor(value){
    const text = raw(value);
    if(!text || text === '-' || text === '.') return null;
    const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(iso) return Number(iso[1] + iso[2] + iso[3]);
    const slash = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    if(slash) return Number(slash[3] + String(slash[2]).padStart(2,'0') + String(slash[1]).padStart(2,'0'));
    const months = {JAN:'01',FEB:'02',MAR:'03',APR:'04',MAY:'05',JUN:'06',JUL:'07',AUG:'08',SEP:'09',OCT:'10',NOV:'11',DEC:'12'};
    const legacy = text.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2}|\d{4})$/);
    if(legacy){
      const month = months[String(legacy[2]).toUpperCase()];
      if(month){
        const year = legacy[3].length === 2 ? ('20' + legacy[3]) : legacy[3];
        return Number(year + month + String(legacy[1]).padStart(2,'0'));
      }
    }
    return null;
  }

  function formatPercent_cor(value){
    if(value === null || value === undefined || raw(value) === '') return '—';
    const number = Number(String(value).replace('%','').replace(',','.'));
    if(!Number.isFinite(number)) return raw(value) || '—';
    const percent = Math.abs(number) <= 1 ? number * 100 : number;
    return Math.round(percent) + '%';
  }

  function textOrDash_cor(value){ return raw(value) || '—'; }

  function safeColor_cor(value, fallback){
    const text = raw(value);
    return /^#[0-9a-fA-F]{6}$/.test(text) ? text : fallback;
  }

  function stableCompare_cor(a,b){
    const project = raw(a.proyecto).localeCompare(raw(b.proyecto),'es',{sensitivity:'base',numeric:true});
    if(project !== 0) return project;
    const reference = raw(a.referencia_sitio).localeCompare(raw(b.referencia_sitio),'es',{sensitivity:'base',numeric:true});
    if(reference !== 0) return reference;
    return Number(a.id_ins_fl || 0) - Number(b.id_ins_fl || 0);
  }

  function rowCompare_cor(a,b){
    const statusCompare = STAGE_ORDER_COR.indexOf(raw(a.estatus)) - STAGE_ORDER_COR.indexOf(raw(b.estatus));
    if(statusCompare !== 0) return statusCompare;
    if(raw(a.estatus) === '03-PM'){
      const aDate = dateSortValue_cor(a.fecha_posible_recepcion_cubo);
      const bDate = dateSortValue_cor(b.fecha_posible_recepcion_cubo);
      if(aDate !== null && bDate === null) return -1;
      if(aDate === null && bDate !== null) return 1;
      if(aDate !== null && bDate !== null && aDate !== bDate) return aDate - bDate;
    }
    return stableCompare_cor(a,b);
  }

  function updateVisualCatalog_cor(code, response){
    const stage = state.stages[code];
    stage.visualCatalog = new Map();
    const visual = response && response.estados_visuales ? response.estados_visuales : {};
    const catalog = Array.isArray(visual.catalogo) ? visual.catalogo : [];
    const byStatus = visual.por_estatus && Array.isArray(visual.por_estatus[code])
      ? visual.por_estatus[code]
      : [];
    catalog.concat(byStatus).forEach(item => {
      const key = raw(item && item.codigo);
      if(key && !stage.visualCatalog.has(key)) stage.visualCatalog.set(key,item);
    });
  }

  function visualItemsForRow_cor(row){
    const stage = state.stages[raw(row && row.estatus)];
    if(!stage) return [];
    const codes = Array.isArray(row && row.estados_visuales_codigos) ? row.estados_visuales_codigos : [];
    return codes.map(code => stage.visualCatalog.get(raw(code))).filter(Boolean);
  }

  function visualBadge_cor(item, withName){
    if(!item) return '';
    const emoji = raw(item.emoji) || '•';
    const name = raw(item.nombre) || raw(item.codigo) || 'Alerta';
    const description = raw(item.descripcion);
    const title = description ? (name + ' · ' + description) : name;
    const text = safeColor_cor(item.color_texto,'#0f172a');
    const background = safeColor_cor(item.color_fondo,'#f8fafc');
    const border = safeColor_cor(item.color_borde,'#cbd5e1');
    return '<span class="ipmm-cor-visual-badge' + (withName ? ' ipmm-cor-visual-badge-wide' : '') + '"' +
      ' title="' + esc(title) + '" aria-label="' + esc(name) + '"' +
      ' style="--ipmm-ev-text:' + esc(text) + ';--ipmm-ev-bg:' + esc(background) + ';--ipmm-ev-border:' + esc(border) + '">' +
      '<span aria-hidden="true">' + esc(emoji) + '</span>' + (withName ? '<span>' + esc(name) + '</span>' : '') + '</span>';
  }

  function visualCell_cor(row){
    const items = visualItemsForRow_cor(row);
    if(!items.length) return '<span class="ipmm-cor-no-visual-state">—</span>';
    return '<div class="ipmm-cor-visual-list">' + items.map(item => visualBadge_cor(item,false)).join('') + '</div>';
  }

  function renderLegend_cor(){
    const root = $('ipmm-cor-legend');
    if(!root) return;
    const selectedStatuses = state.statusFilter ? [state.statusFilter] : STAGE_ORDER_COR;
    const items = [];
    const seen = new Set();
    selectedStatuses.forEach(code => {
      state.stages[code].visualCatalog.forEach(item => {
        const key = raw(item && item.codigo);
        if(key && !seen.has(key)){
          seen.add(key);
          items.push(item);
        }
      });
    });
    items.sort((a,b)=>(Number(a.prioridad)||100)-(Number(b.prioridad)||100));
    root.hidden = !items.length;
    root.innerHTML = items.length
      ? '<strong>Alertas Reporte Instalaciones</strong><div class="ipmm-cor-visual-legend-items">' +
        items.map(item => visualBadge_cor(item,true)).join('') + '</div>'
      : '';
  }

  function projectButton_cor(row){
    const id = raw(row && row.id_proyecto);
    const project = raw(row && row.proyecto);
    if(!project) return '—';
    return '<button type="button" class="ipmm-cor-link" data-ipmm-project-link="1"' +
      ' data-ipmm-project-id="' + esc(id) + '" data-ipmm-project-name="' + esc(project) + '">' + esc(project) + '</button>';
  }

  function equipmentButton_cor(row){
    const project = raw(row && row.proyecto);
    const reference = raw(row && row.referencia_sitio);
    if(!project || !reference) return esc(textOrDash_cor(reference));
    return '<button type="button" class="ipmm-cor-link" data-ipmm-equipment="1"' +
      ' data-ipmm-project="' + esc(project) + '" data-ipmm-reference="' + esc(reference) + '">' + esc(reference) + '</button>';
  }

  function statusChip_cor(status){
    const code = raw(status);
    return '<span class="ipmm-cor-status-chip ipmm-cor-status-' + (code === '04-M' ? '04' : '03') + '">' + esc(code || '—') + '</span>';
  }

  function daysCell_cor(value){
    const text = raw(value);
    if(!text) return '—';
    const number = Number(text.replace(',','.'));
    let className = 'ipmm-cor-days';
    if(Number.isFinite(number) && number < 0) className += ' is-late';
    else if(Number.isFinite(number) && number <= 14) className += ' is-close';
    return '<span class="' + className + '">' + esc(text) + '</span>';
  }

  function unifiedRow_cor(row){
    const is03 = raw(row.estatus) === '03-PM';
    const progress = is03 ? row.avance_oc : row.avance_mo;
    const keyDate = is03 ? row.fecha_posible_recepcion_cubo : row.fecha_ccr;
    return '<tr>' +
      '<td>' + statusChip_cor(row.estatus) + '</td>' +
      '<td>' + esc(textOrDash_cor(row.supervisor_fl)) + '</td>' +
      '<td>' + visualCell_cor(row) + '</td>' +
      '<td><span class="ipmm-cor-percent">' + esc(formatPercent_cor(progress)) + '</span></td>' +
      '<td class="ipmm-cor-date">' + esc(formatDate_cor(keyDate)) + '</td>' +
      '<td>' + projectButton_cor(row) + '</td>' +
      '<td>' + equipmentButton_cor(row) + '</td>' +
      '<td>' + esc(textOrDash_cor(row.subcontratista)) + '</td>' +
      '<td class="ipmm-cor-date">' + esc(formatDate_cor(row.fecha_inicio_montaje)) + '</td>' +
      '<td class="ipmm-cor-date">' + esc(formatDate_cor(row.fecha_fin_montaje_planeado)) + '</td>' +
      '<td class="ipmm-cor-date">' + esc(formatDate_cor(row.fecha_fin_montaje_modificado)) + '</td>' +
      '<td class="ipmm-cor-date">' + esc(formatDate_cor(row.fecha_fin_montaje_real)) + '</td>' +
      '<td>' + daysCell_cor(row.dias_restantes) + '</td>' +
      '<td class="ipmm-cor-comment">' + esc(textOrDash_cor(row.comentarios_fl)) + '</td>' +
      '</tr>';
  }

  function allRows_cor(){
    return STAGE_ORDER_COR.flatMap(code => {
      const response = state.stages[code].response || {};
      const rows = Array.isArray(response.data) ? response.data : [];
      return rows.map(row => Object.assign({ estatus:code }, row));
    }).sort(rowCompare_cor);
  }

  function filteredRows_cor(){
    return allRows_cor().filter(row => {
      if(state.statusFilter && raw(row.estatus) !== state.statusFilter) return false;
      if(state.supervisorFilter && raw(row.supervisor_fl) !== state.supervisorFilter) return false;
      return true;
    });
  }

  function populateSupervisorFilter_cor(){
    const select = $('ipmm-cor-filter-supervisor');
    if(!select) return;
    const current = state.supervisorFilter;
    const values = [...new Set(allRows_cor().map(row => raw(row.supervisor_fl)).filter(Boolean))]
      .sort((a,b)=>a.localeCompare(b,'es',{sensitivity:'base',numeric:true}));
    select.innerHTML = '<option value="">Todos</option>' + values.map(value =>
      '<option value="' + esc(value) + '">' + esc(value) + '</option>'
    ).join('');
    if(current && values.includes(current)) select.value = current;
    else{
      state.supervisorFilter = '';
      select.value = '';
    }
  }

  function stageTotal_cor(code){
    const stage = state.stages[code];
    if(stage.forbidden || !stage.response) return 0;
    return Number(stage.response.pagination && stage.response.pagination.total) || 0;
  }

  function renderKpis_cor(){
    const total03 = stageTotal_cor('03-PM');
    const total04 = stageTotal_cor('04-M');
    if($('ipmm-cor-kpi-03')) $('ipmm-cor-kpi-03').textContent = total03.toLocaleString('es-MX');
    if($('ipmm-cor-kpi-04')) $('ipmm-cor-kpi-04').textContent = total04.toLocaleString('es-MX');
    if($('ipmm-cor-kpi-total')) $('ipmm-cor-kpi-total').textContent = (total03 + total04).toLocaleString('es-MX');
  }

  function render_cor(){
    const allowed = STAGE_ORDER_COR.filter(code => !state.stages[code].forbidden);
    const errors = STAGE_ORDER_COR.map(code => state.stages[code].error).filter(Boolean);
    const global = $('ipmm-cor-global-message');
    const listCard = getView_cor() && getView_cor().querySelector('.ipmm-cor-list-card');
    const kpis = $('ipmm-cor-kpis');
    const loading = $('ipmm-cor-loading');
    const error = $('ipmm-cor-error');
    const wrap = $('ipmm-cor-table-wrap');
    const footer = $('ipmm-cor-footer');

    if(global){
      global.hidden = allowed.length > 0;
      global.textContent = allowed.length ? '' : 'No tienes permiso para consultar 03-PM ni 04-M.';
    }
    if(listCard) listCard.hidden = allowed.length === 0;
    if(kpis) kpis.hidden = allowed.length === 0;
    if(allowed.length === 0) return;

    if(loading) loading.hidden = !state.loading;
    if(error){
      error.hidden = !errors.length;
      error.dataset.type = errors.length ? 'error' : '';
      error.textContent = errors.join(' · ');
    }
    if(wrap) wrap.hidden = state.loading;
    if(footer) footer.hidden = state.loading;

    const rows = filteredRows_cor();
    const total = rows.length;
    const totalPages = Math.max(1,Math.ceil(total / PAGE_SIZE_COR));
    state.page = Math.max(1,Math.min(state.page,totalPages));
    const startIndex = (state.page - 1) * PAGE_SIZE_COR;
    const pageRows = rows.slice(startIndex,startIndex + PAGE_SIZE_COR);
    const body = $('ipmm-cor-body');
    if(body){
      body.innerHTML = pageRows.length
        ? pageRows.map(unifiedRow_cor).join('')
        : '<tr><td class="ipmm-cor-empty" colspan="14">Sin equipos para los filtros seleccionados.</td></tr>';
    }

    if($('ipmm-cor-list-total')) $('ipmm-cor-list-total').textContent = total.toLocaleString('es-MX') + ' equipo(s)';
    if($('ipmm-cor-range')){
      const start = total ? startIndex + 1 : 0;
      const end = total ? Math.min(startIndex + pageRows.length,total) : 0;
      $('ipmm-cor-range').textContent = total ? ('Mostrando ' + start + '-' + end + ' de ' + total.toLocaleString('es-MX')) : '0 registros';
    }
    if($('ipmm-cor-page')) $('ipmm-cor-page').textContent = state.page + ' / ' + totalPages;
    if($('ipmm-cor-prev')) $('ipmm-cor-prev').disabled = state.loading || state.page <= 1;
    if($('ipmm-cor-next')) $('ipmm-cor-next').disabled = state.loading || state.page >= totalPages;

    renderKpis_cor();
    renderLegend_cor();
  }

  async function loadStage_cor(code){
    const stage = state.stages[code];
    stage.error = null;
    stage.forbidden = false;
    try{
      const response = await apiGet_cor(STAGES_COR[code].path + '?page=1&page_size=5000');
      stage.response = response || {};
      updateVisualCatalog_cor(code,response);
    }catch(error){
      if(Number(error && error.status) === 403){
        stage.forbidden = true;
        stage.response = null;
        stage.visualCatalog = new Map();
      }else{
        stage.error = (STAGES_COR[code].label + ': ' + (error && error.message ? error.message : 'no fue posible cargar los datos'));
        stage.response = null;
        stage.visualCatalog = new Map();
      }
    }
  }

  async function loadAll_cor(){
    if(state.loading) return;
    state.loading = true;
    const refresh = $('ipmm-cor-refresh');
    const status = $('ipmm-cor-status');
    if(refresh) refresh.disabled = true;
    if(status) status.textContent = 'Actualizando...';
    render_cor();

    await Promise.all(STAGE_ORDER_COR.map(loadStage_cor));
    populateSupervisorFilter_cor();
    state.loading = false;
    render_cor();

    const responses = STAGE_ORDER_COR.map(code => state.stages[code].response).filter(Boolean);
    const generatedAt = responses.map(item => item.generated_at).filter(Boolean).sort().pop();
    if(status) status.textContent = generatedAt ? ('Actualizado ' + formatTimestamp_cor(generatedAt)) : '';
    if(refresh) refresh.disabled = false;
  }

  function openProject_cor(target){
    const project = raw(target && target.dataset.ipmmProjectName);
    const id = raw(target && target.dataset.ipmmProjectId) || project;
    if(!id || !window.ManttoRouter || typeof window.ManttoRouter.open !== 'function') return;
    window.ManttoRouter.open('detalle',{
      type:'proyecto', id, projectName:project, source:'instalaciones-pmm', template:'cliente-unificado'
    });
  }

  function openEquipment_cor(target){
    const project = raw(target && target.dataset.ipmmProject);
    const reference = raw(target && target.dataset.ipmmReference);
    if(!project || !reference || !window.ManttoRouter || typeof window.ManttoRouter.open !== 'function') return;
    window.ManttoRouter.open('detalle',{
      type:'equipo', id:project + '|||' + reference, source:'instalaciones-pmm',
      projectName:project, referencia_sitio:reference
    });
  }

  function bind_cor(){
    if(state.bound) return;
    state.bound = true;
    $('ipmm-cor-refresh')?.addEventListener('click',loadAll_cor);
    $('ipmm-cor-filter-status')?.addEventListener('change',event => {
      state.statusFilter = raw(event.target.value);
      state.page = 1;
      render_cor();
    });
    $('ipmm-cor-filter-supervisor')?.addEventListener('change',event => {
      state.supervisorFilter = raw(event.target.value);
      state.page = 1;
      render_cor();
    });
    $('ipmm-cor-prev')?.addEventListener('click',()=>{
      if(state.page <= 1) return;
      state.page -= 1;
      render_cor();
    });
    $('ipmm-cor-next')?.addEventListener('click',()=>{
      const totalPages = Math.max(1,Math.ceil(filteredRows_cor().length / PAGE_SIZE_COR));
      if(state.page >= totalPages) return;
      state.page += 1;
      render_cor();
    });
    getView_cor()?.addEventListener('click',event => {
      const project = event.target.closest('[data-ipmm-project-link]');
      if(project){ openProject_cor(project); return; }
      const equipment = event.target.closest('[data-ipmm-equipment]');
      if(equipment) openEquipment_cor(equipment);
    });
  }

  async function init(){
    try{
      await loadHtml_cor();
      bind_cor();
      await loadAll_cor();
      state.ready = true;
    }catch(error){
      const view = getView_cor();
      if(view){
        view.innerHTML = '<div class="ipmm-cor-page"><section class="ipmm-cor-card ipmm-cor-head"><div><p class="ipmm-cor-eyebrow">Instalaciones</p><h1>PM&amp;M</h1><p>No fue posible inicializar el módulo.</p></div></section><div class="ipmm-cor-message">' + esc(error && error.message ? error.message : 'Error de inicialización.') + '</div></div>';
      }
      console.error('[PMM_cor]',error);
    }
  }

  window.ManttoInstalacionesPmm_cor = { init, refresh:loadAll_cor };
})();

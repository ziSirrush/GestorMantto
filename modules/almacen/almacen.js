(function(){
  'use strict';

  if(window.ManttoAlmacen) return;

  const ROUTES = Object.freeze({
    'almacen-dashboard': { shortTitle:'Dashboard', icon:'📊', description:'Resumen ejecutivo del inventario cargado temporalmente desde Excel hacia Aiven.' },
    'almacen-inventario': { shortTitle:'Inventario', icon:'📦', description:'Consulta consolidada de artículos con vistas por empresa, almacén y ranking.' },
    'almacen-stock': { shortTitle:'Stock', icon:'📈', description:'Existencia del DET y parámetros calculados desde las hojas MOVIMIENTOS del cierre Excel seleccionado.' },
    'almacen-prestamos': { shortTitle:'Préstamos', icon:'🔄', description:'Seguimiento de artículos en préstamo del cierre Excel seleccionado cuando contiene un conjunto compatible.' },
    'almacen-resguardos': { shortTitle:'Resguardos', icon:'🔒', description:'Consulta de resguardos del cierre Excel seleccionado cuando contiene un conjunto compatible.' },
    'almacen-auditoria': { shortTitle:'Auditoría', icon:'🔍', description:'Contraste físico contra el cierre seleccionado, con conteos y observaciones persistidos en Aiven.' }
  });

  const INVENTORY_TABS = Object.freeze([
    { key:'inventario', label:'Inventario', icon:'📦' },
    { key:'empresa', label:'Por Empresa', icon:'🏢' },
    { key:'almacen', label:'Por Almacén', icon:'🏪' },
    { key:'top', label:'Top', icon:'📊' }
  ]);

  const state = {
    inventoryTab:'inventario',
    source:null,
    canImport:false,
    catalogs:{ companies:[], categories:[], warehouses:[] },
    dashboard:null,
    inventory:{ query:'', company:'todas', category:'todas', warehouse:'todos', minValue:'', maxValue:'', stockOnly:true, page:1, data:null },
    company:{ selected:'Corellian', query:'', page:1, data:null },
    warehouse:{ company:'todas', query:'', data:null },
    top:{ mode:'valor', company:'todas', count:'20', data:null },
    stock:{ query:'', company:'todas', abc:'todas', alert:'todas', page:1, data:null },
    loans:{ company:'todas', view:'resumen', responsible:'todos', age:'todas', query:'', page:1, catalogs:{companies:[],responsibles:[],available:false}, summary:null, detail:null },
    guards:{ query:'', subsidiary:'todas', department:'todos', exitStatus:'todos', page:1, catalogs:{companies:[],departments:[],available:false}, data:null },
    audit:{ view:'select', company:'todas', warehouseQuery:'', selectedCompany:'', selectedWarehouse:'', catalogs:null, history:[], session:null, result:null, saving:false, saveError:'' },
    requestSeq:0
  };

  function escapeHtml(value){
    return String(value == null ? '' : value).replace(/[&<>"']/g, function(character){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character];
    });
  }

  function apiBase(){ return String(window.MANTTO_API_BASE || 'http://localhost:3001').replace(/\/$/, ''); }
  function qs(params){
    const search = new URLSearchParams();
    Object.entries(params || {}).forEach(function(entry){
      const key = entry[0], value = entry[1];
      if(value === '' || value === null || value === undefined) return;
      search.set(key, String(value));
    });
    const text = search.toString();
    return text ? '?' + text : '';
  }
  // [Aster | 2026-08-31 | ASTER-MG | FASE 3 ALMACEN CIERRES/AUDITORIA PERSISTENTE V001]
  const ALMACEN_SOURCE_KEY='mantto:almacen:lote-seleccionado';
  function selectedSourceLot(){
    try{return String(window.sessionStorage.getItem(ALMACEN_SOURCE_KEY)||'').trim();}catch(_error){return '';}
  }
  function sourceAwarePath(path){
    const lot=selectedSourceLot();
    if(!lot||!String(path).startsWith('/api/almacen/')||String(path).startsWith('/api/almacen/fuentes')||String(path).startsWith('/api/almacen/carga/'))return path;
    const separator=String(path).includes('?')?'&':'?';
    return String(path)+separator+'loteImportacion='+encodeURIComponent(lot);
  }
  async function sendJson(path,method,body){
    const target=sourceAwarePath(path);
    const options={method:method||'POST',credentials:'include',headers:{'Content-Type':'application/json','Accept':'application/json'},body:body===undefined?undefined:JSON.stringify(body)};
    if(window.ManttoAuth&&typeof window.ManttoAuth.api==='function')return window.ManttoAuth.api(target,options);
    if(window.ManttoAuth&&window.ManttoAuth.authHeaders)Object.assign(options.headers,window.ManttoAuth.authHeaders());
    const response=await fetch(apiBase()+target,options);
    let data={};try{data=await response.json();}catch(_error){}
    if(!response.ok||data.ok===false){const error=new Error(data.message||('HTTP '+response.status));error.status=response.status;error.details=data.details||null;throw error;}
    return data;
  }
  function auditFromApi(audit){
    if(!audit)return null;
    return {
      sessionId:audit.folioAuditoria,
      folioAuditoria:audit.folioAuditoria,
      loteImportacion:audit.loteImportacion,
      fechaCorte:audit.fechaCorte,
      company:audit.empresa,
      warehouse:audit.almacen,
      status:audit.estatus,
      generatedAt:audit.fechaInicio,
      finishedAt:audit.fechaCierre,
      totalReferences:(audit.items||[]).length,
      sampleSize:(audit.items||[]).length,
      items:(audit.items||[]).map(function(item){return {
        idAuditoria:item.idAuditoria,
        code:item.codigo||'',article:item.articulo||item.codigo||'Sin descripción',category:item.categoria||'',
        company:item.empresa,warehouse:item.almacen,expected:Number(item.existenciaEsperada||0),
        expectedValue:item.valorEsperado==null?null:Number(item.valorEsperado),unitValue:item.precioUnitario==null?null:Number(item.precioUnitario),
        found:item.existenciaFisica==null?null:Number(item.existenciaFisica),observaciones:item.observaciones||'',
        difference:item.diferencia==null?null:Number(item.diferencia),valueDifference:item.valorDiferencia==null?null:Number(item.valorDiferencia),status:item.estatus
      };})
    };
  }
  async function get(path, options){
    const target=sourceAwarePath(path);
    if(window.ManttoHttp && typeof window.ManttoHttp.get === 'function') return window.ManttoHttp.get(target, options || {});
    const response = await fetch(apiBase() + target, { credentials:'include' });
    const data = await response.json();
    if(!response.ok || data.ok === false) throw new Error(data.message || ('HTTP ' + response.status));
    return data;
  }

  async function upload(path, formData){
    const response = await fetch(apiBase() + path, { method:'POST', body:formData, credentials:'include', manttoNoDedupe:true });
    let data = {};
    try{ data = await response.json(); }catch(_error){}
    if(!response.ok || data.ok === false){
      const error = new Error(data.message || ('HTTP ' + response.status));
      error.status = response.status;
      error.details = data.details || null;
      throw error;
    }
    return data;
  }

  function money(value){
    if(value === null || value === undefined || value === '') return '—';
    const number = Number(value);
    if(!Number.isFinite(number)) return '—';
    return new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:2}).format(number);
  }
  function number(value, decimals){
    if(value === null || value === undefined || value === '') return '—';
    const n = Number(value);
    if(!Number.isFinite(n)) return '—';
    return new Intl.NumberFormat('es-MX',{maximumFractionDigits:decimals == null ? 2 : decimals}).format(n);
  }
  function dateText(value){
    if(!value) return '—';
    const raw=String(value).trim();
    // Fechas canónicas del backend: presentar estrictamente DD/MM/AAAA y
    // DD/MM/AAAA - HH:MM sin reinterpretar zona horaria.
    const iso=raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
    if(iso){
      const base=`${iso[3]}/${iso[2]}/${iso[1]}`;
      return iso[4]&&iso[5]?`${base} - ${iso[4]}:${iso[5]}`:base;
    }
    // Textos operativos no canónicos (por ejemplo FECHA2 con varios cortes)
    // se preservan completos: no se recortan ni se inventa una sola fecha.
    return escapeHtml(raw);
  }

  function statusPill(text, tone){ return '<span class="alm-status-pill' + (tone ? ' is-' + tone : '') + '">' + escapeHtml(text) + '</span>'; }
  function shell(route, body){
    const config = ROUTES[route];
    const historical=Boolean(state.source&&state.source.selection==='SELECCIONADO'&&!state.source.activo);
    return '<div class="alm-shell">' +
      '<section class="alm-head alm-card"><div class="alm-head-main"><p class="alm-eyebrow">' + escapeHtml(config.icon) + ' Gestión de Almacén</p><h1>' + escapeHtml(config.shortTitle) + '</h1><p>' + escapeHtml(config.description) + '</p></div>' +
      statusPill(state.source ? (historical?'Cierre histórico seleccionado':'Cierre activo') : 'Sin carga activa', state.source ? (historical?'warn':'ok') : 'warn') + '</section>' + body + '</div>';
  }

  function loading(message){ return '<div class="alm-loading"><span></span><strong>' + escapeHtml(message || 'Cargando información...') + '</strong></div>'; }
  function empty(message){ return '<div class="alm-pending-block"><strong>Sin información</strong><small>' + escapeHtml(message || 'No hay registros disponibles.') + '</small></div>'; }
  function errorBlock(message){ return '<div class="alm-error-block"><strong>No fue posible cargar la información</strong><small>' + escapeHtml(message || 'Error no identificado.') + '</small></div>'; }
  function sourceCard(){
    if(!state.source) return '<section class="alm-card alm-source-card"><div><strong>Fuente temporal Excel</strong><span>No existe un cierre disponible.</span></div>' + statusPill('Sin carga','warn') + '</section>';
    const invRows=state.source.datasets&&state.source.datasets.INVENTARIO?state.source.datasets.INVENTARIO.filas:state.source.filas;
    const historical=state.source.selection==='SELECCIONADO'&&!state.source.activo;
    return '<section class="alm-card alm-source-card"><div><strong>Fuente temporal Excel</strong><span>' + escapeHtml(state.source.archivoOrigen || 'Archivo') + ' · ' + escapeHtml(state.source.hojaOrigen || 'Hoja') + ' · ' + number(invRows,0) + ' filas de inventario</span><small class="alm-source-selected-note">Corte: ' + dateText(state.source.fechaCorte) + ' · ' + (historical?'Histórico seleccionado':'Cierre activo') + '</small></div>' + statusPill(historical?'Histórico':'Activo',historical?'warn':'ok') + '</section>';
  }

  function kpi(label, icon, value, subtitle, tone){
    return '<article class="alm-kpi' + (tone ? ' alm-kpi-' + tone : '') + '"><div class="alm-kpi-icon">' + escapeHtml(icon) + '</div><div class="alm-kpi-content"><span class="alm-kpi-label">' + escapeHtml(label) + '</span><strong class="alm-kpi-value">' + escapeHtml(value) + '</strong><small>' + escapeHtml(subtitle || '') + '</small></div></article>';
  }

  function renderTable(headers, rows, minWidth){
    return '<div class="alm-table-wrap"><table class="alm-table"' + (minWidth ? ' style="min-width:' + Number(minWidth) + 'px"' : '') + '><thead><tr>' + headers.map(function(h){return '<th>' + escapeHtml(h) + '</th>';}).join('') + '</tr></thead><tbody>' + (rows.length ? rows.join('') : '<tr><td class="alm-empty-cell" colspan="' + headers.length + '">Sin registros para los filtros seleccionados.</td></tr>') + '</tbody></table></div>';
  }

  function companyChips(active, attr, includeAll){
    const values = (includeAll ? ['todas'] : []).concat(state.catalogs.companies.length ? state.catalogs.companies : ['Corellian','Nubian','United']);
    return '<div class="alm-chip-row">' + values.map(function(value){
      const label = value === 'todas' ? 'Todas' : value;
      return '<button type="button" class="alm-chip' + (value===active?' is-active':'') + '" ' + attr + '="' + escapeHtml(value) + '">' + escapeHtml(label) + '</button>';
    }).join('') + '</div>';
  }

  function rankingRows(rows, formatter){
    if(!rows || !rows.length) return '<div class="alm-ranking-empty"><span>—</span><div><b>Sin datos</b><i></i></div><strong>—</strong></div>';
    const max = Math.max.apply(null, rows.map(function(row){return Number(row.total||0);}).concat([1]));
    return rows.map(function(row,index){
      const label = row.articulo || row.codigo || row.clave || 'Sin descripción';
      const width = Math.max(2, Math.round((Number(row.total||0)/max)*100));
      return '<div class="alm-ranking-empty"><span>' + (index+1) + '</span><div><b>' + escapeHtml(label) + '</b><i style="width:' + width + '%"></i></div><strong>' + escapeHtml(formatter(row.total)) + '</strong></div>';
    }).join('');
  }

  function renderDashboardLoaded(data){
    state.source = data.source || null;
    if(!data.source) return shell('almacen-dashboard', sourceCard() + empty('Carga primero el Excel de inventario desde Almacén > Inventario.'));
    const k = data.kpis || {};
    const companyRows = (data.companies || []).map(function(row){
      return '<article class="alm-company-summary"><div class="alm-company-title"><span>' + escapeHtml(row.empresa) + '</span></div><div class="alm-company-metrics"><div><small>Valor</small><strong>' + escapeHtml(money(row.valorTotal)) + '</strong></div><div><small>Piezas</small><strong>' + number(row.piezas,2) + '</strong></div><div><small>Referencias</small><strong>' + number(row.referencias,0) + '</strong></div></div></article>';
    }).join('');
    const warehouseRows = (data.warehouses || []).map(function(row,index){
      return '<tr><td>' + (index+1) + '</td><td>' + escapeHtml(row.almacen) + '</td><td>' + escapeHtml(row.tipo || '—') + '</td><td>' + escapeHtml(row.empresa) + '</td><td>' + escapeHtml(money(row.valorTotal)) + '</td><td>' + number(row.piezas,2) + '</td><td>' + number(row.referencias,0) + '</td></tr>';
    });
    return shell('almacen-dashboard',
      sourceCard() +
      '<section class="alm-kpi-grid">' +
        kpi('Valor total','💰',money(k.valorTotal), data.coverage && data.coverage.valor ? 'Inventario consolidado' : 'Sin columna de valor/precio','green') +
        kpi('Piezas','📦',number(k.piezas,2),'Existencia física','blue') +
        kpi('Almacenes','🏪',number(k.almacenes,0),'Almacenes distintos','amber') +
        kpi('Sin stock','⚠️',number(k.sinStock,0),'Renglones con existencia ≤ 0','red') +
      '</section>' +
      '<section class="alm-card"><div class="alm-section-head"><div><h2>Resumen por empresa</h2><p>Derivado del cierre Excel seleccionado.</p></div></div><div class="alm-company-summary-grid">' + (companyRows || '<span>Sin empresas.</span>') + '</div></section>' +
      '<section class="alm-card"><div class="alm-section-head"><div><h2>Top 5 almacenes</h2><p>Ordenados por valor cuando la fuente permite calcularlo.</p></div></div>' + renderTable(['#','Almacén','Tipo','Empresa','Valor est.','Piezas','Refs'],warehouseRows,820) + '</section>' +
      '<section class="alm-card"><div class="alm-ranking-head"><div><h2>Rankings de artículos</h2><p>Información del cierre seleccionado. “Más movidos” sigue pendiente de historial de movimientos.</p></div></div><div class="alm-grid-2 alm-ranking-grid"><section class="alm-ranking-panel"><div class="alm-ranking-title"><span>📦</span><div><strong>Top 15 por volumen</strong><small>Cantidad física</small></div></div>' + rankingRows(data.topByVolume, function(v){return number(v,2);}) + '</section><section class="alm-ranking-panel"><div class="alm-ranking-title"><span>💰</span><div><strong>Top 15 por valor</strong><small>Valor estimado</small></div></div>' + rankingRows(data.topByValue, money) + '</section></div><div class="alm-movements-pending"><div><strong>🔄 Top 15 más movidos</strong><span>No se calcula con snapshots de Excel; requiere movimientos históricos/BG.</span></div>' + statusPill('Pendiente BG','warn') + '</div></section>'
    );
  }

  async function loadDashboard(view){
    view.innerHTML = shell('almacen-dashboard', loading('Consultando inventario del cierre seleccionado...'));
    try{
      const data = await get('/api/almacen/dashboard',{force:true});
      state.dashboard = data;
      state.source = data.source || null;
      view.innerHTML = renderDashboardLoaded(data);
    }catch(error){ view.innerHTML = shell('almacen-dashboard', errorBlock(error.message)); }
  }

  function sourceImportPanel(){
    const source = sourceCard();
    if(!state.canImport) return source;
    return source + '<section class="alm-card alm-import-card"><div class="alm-section-head"><div><h2>Actualizar fuente temporal</h2><p>Solo Programador / Programador Corellian. Acepta .xlsx y .csv, máximo 25 MB.</p></div>' + statusPill('No reemplaza el lote anterior hasta terminar','ok') + '</div><div class="alm-import-grid"><label class="alm-field"><span>Archivo</span><input id="alm-import-file" type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"></label><label class="alm-field"><span>Fecha de corte</span><input id="alm-import-cutoff" type="date"></label><div class="alm-import-actions"><button type="button" class="alm-btn" id="alm-import-validate">Validar</button><button type="button" class="alm-btn alm-btn-primary" id="alm-import-run" disabled>Importar y activar</button></div></div><div id="alm-import-result" class="alm-import-result">Selecciona el Excel y valida sus encabezados antes de importarlo.</div></section>';
  }

  function inventoryTabs(){
    return '<nav class="alm-subtabs">' + INVENTORY_TABS.map(function(tab){ return '<button type="button" class="alm-subtab' + (state.inventoryTab===tab.key?' is-active':'') + '" data-alm-inventory-tab="' + tab.key + '"><span>' + tab.icon + '</span>' + escapeHtml(tab.label) + '</button>'; }).join('') + '</nav>';
  }
  function optionList(values, current, allValue, allLabel){
    return '<option value="' + allValue + '">' + escapeHtml(allLabel) + '</option>' + values.map(function(value){return '<option value="' + escapeHtml(value) + '"' + (String(value)===String(current)?' selected':'') + '>' + escapeHtml(value) + '</option>';}).join('');
  }
  function inventoryFilters(data){
    const f = state.inventory;
    const summary = data && data.summary || {};
    return '<section class="alm-card alm-filter-card"><div class="alm-filter-row alm-filter-row-main"><label class="alm-field"><span>Buscar</span><input id="alm-inv-query" type="search" value="' + escapeHtml(f.query) + '" placeholder="Artículo o código..."></label><div class="alm-field alm-field-chips"><span>Empresa</span>' + companyChips(f.company,'data-alm-inventory-company',true) + '</div><label class="alm-field"><span>Categoría</span><select id="alm-inv-category">' + optionList(state.catalogs.categories,f.category,'todas','Todas las categorías') + '</select></label></div><div class="alm-filter-row alm-filter-row-secondary"><label class="alm-field"><span>Almacén</span><select id="alm-inv-warehouse">' + optionList(state.catalogs.warehouses,f.warehouse,'todos','Todos los almacenes') + '</select></label><label class="alm-field"><span>Valor mínimo</span><input id="alm-inv-min-value" type="number" step="0.01" value="' + escapeHtml(f.minValue) + '"></label><label class="alm-field"><span>Valor máximo</span><input id="alm-inv-max-value" type="number" step="0.01" value="' + escapeHtml(f.maxValue) + '"></label><label class="alm-check-field"><input id="alm-inv-stock-only" type="checkbox"' + (f.stockOnly?' checked':'') + '><span>Solo con stock</span></label><div class="alm-filter-summary"><span><strong>' + number(summary.registros,0) + '</strong> registros</span><span>Piezas: <strong>' + number(summary.piezas,2) + '</strong></span><span>Valor: <strong>' + escapeHtml(money(summary.valorTotal)) + '</strong></span></div></div></section>';
  }
  // [Aster | 2026-08-30 | ALMACEN-FASE5-PAGINACION-QA-V002]
  function inventoryPager(pagination, prefix){
    const p = pagination || {page:1,pages:1,total:0};
    return '<div class="alm-pager"><span>Página ' + number(p.page,0) + ' de ' + number(p.pages,0) + ' · ' + number(p.total,0) + ' registros</span><div><button type="button" data-alm-page="prev" data-alm-page-scope="' + prefix + '"' + (p.page<=1?' disabled':'') + '>← Ant</button><button type="button" data-alm-page="next" data-alm-page-scope="' + prefix + '"' + (p.page>=p.pages?' disabled':'') + '>Sig →</button></div></div>';
  }
  function inventoryMain(data){
    const rows = (data && data.rows || []).map(function(row){return '<tr><td><strong>' + escapeHtml(row.articulo || '—') + '</strong><small class="alm-cell-sub">' + escapeHtml(row.codigo || '') + '</small></td><td>' + escapeHtml(row.categoria || '—') + '</td><td>' + escapeHtml(row.empresa || '—') + '</td><td>' + number(row.fisico,2) + '</td><td>' + escapeHtml(money(row.precioUnitario)) + '</td><td>' + escapeHtml(money(row.valor)) + '</td><td>' + number(row.almacenes,0) + '</td></tr>';});
    return inventoryFilters(data) + '<section class="alm-card alm-table-card"><div class="alm-section-head"><div><h2>Inventario consolidado</h2><p>Un renglón por artículo/empresa; Físico suma los almacenes del cierre oficial.</p></div></div>' + renderTable(['Artículo','Categoría','Empresa','Físico','P. Unit.','Valor','Alm.'],rows,900) + inventoryPager(data && data.pagination,'inventory') + '</section>';
  }
  function companyTab(data){
    const s = data && data.summary || {};
    const rows = (data && data.rows || []).map(function(row,index){return '<tr><td>' + (((data.pagination.page-1)*data.pagination.pageSize)+index+1) + '</td><td><strong>' + escapeHtml(row.articulo || '—') + '</strong><small class="alm-cell-sub">' + escapeHtml(row.codigo || '') + '</small></td><td>' + escapeHtml(row.categoria || '—') + '</td><td>' + number(row.fisico,2) + '</td><td>' + escapeHtml(money(row.precioUnitario)) + '</td><td>' + escapeHtml(money(row.valor)) + '</td><td>' + number(row.almacenes,0) + '</td></tr>';});
    return '<section class="alm-card alm-company-selector-card"><div><h2>Empresa</h2><p>Concentrado por empresa.</p></div>' + companyChips(state.company.selected,'data-alm-company-tab-company',false) + '</section><section class="alm-kpi-grid alm-kpi-grid-3">' + kpi('Valor total','💰',money(s.valorTotal),state.company.selected,'green') + kpi('Piezas','📦',number(s.piezas,2),'Existencia física','blue') + kpi('Precio promedio','📊',money(s.precioPromedio),'Promedio de registros con precio','amber') + '</section><section class="alm-card alm-table-card"><div class="alm-section-head alm-section-head-filter"><div><h2>' + escapeHtml(state.company.selected) + ' — artículos</h2></div><label class="alm-compact-search"><span>Filtrar</span><input id="alm-company-query" type="search" value="' + escapeHtml(state.company.query) + '" placeholder="Artículo..."></label></div>' + renderTable(['#','Artículo','Categoría','Físico','P. Unit.','Valor','Alm.'],rows,900) + inventoryPager(data && data.pagination,'company') + '</section>';
  }
  function warehouseTab(data){
    const rows = (data && data.rows || []).map(function(row,index){return '<tr><td>'+(index+1)+'</td><td>' + escapeHtml(row.almacen) + '</td><td>' + escapeHtml(row.tipo || '—') + '</td><td>' + escapeHtml(row.empresa) + '</td><td>' + number(row.piezas,2) + '</td><td>' + escapeHtml(money(row.valorTotal)) + '</td><td>' + number(row.referencias,0) + '</td></tr>';});
    return '<section class="alm-card alm-filter-card"><div class="alm-filter-row alm-filter-row-main"><div class="alm-field alm-field-chips"><span>Empresa</span>' + companyChips(state.warehouse.company,'data-alm-warehouse-company',true) + '</div><label class="alm-field"><span>Buscar almacén</span><input id="alm-warehouse-query" type="search" value="' + escapeHtml(state.warehouse.query) + '"></label><div class="alm-filter-summary"><strong>' + number(rows.length,0) + '</strong> almacenes</div></div></section><section class="alm-card alm-table-card"><div class="alm-section-head"><div><h2>Almacenes</h2><p>El tipo se deriva del nombre oficial del almacén con la misma regla de Desarrollo Almacén (Préstamo, Recuperación, Obsoletos, etc.).</p></div></div>' + renderTable(['#','Almacén','Tipo','Empresa','Piezas','Valor est.','Refs'],rows,860) + '</section>';
  }
  function topTab(data){
    const rows = data && data.rows || [];
    return '<section class="alm-card alm-top-controls"><div class="alm-segmented"><button type="button" data-alm-top-mode="valor" class="' + (state.top.mode==='valor'?'is-active':'') + '">Por valor</button><button type="button" data-alm-top-mode="fisico" class="' + (state.top.mode==='fisico'?'is-active':'') + '">Por cantidad</button></div>' + companyChips(state.top.company,'data-alm-top-company',true) + '<label class="alm-top-count"><span>Resultados</span><select id="alm-top-count">' + ['10','20','30','50'].map(function(v){return '<option value="'+v+'"'+(state.top.count===v?' selected':'')+'>Top '+v+'</option>';}).join('') + '</select></label></section><section class="alm-card"><div class="alm-section-head"><div><h2>Top ' + escapeHtml(state.top.count) + '</h2><p>' + (state.top.mode==='valor'?'Mayor valor estimado':'Mayor cantidad física') + '</p></div></div><div class="alm-top-empty-list">' + (rows.length ? rows.map(function(row,index){return '<div class="alm-top-empty-row"><span>'+(index+1)+'</span><div><strong>' + escapeHtml(row.articulo || row.codigo || 'Sin descripción') + '</strong><i></i></div><b>' + escapeHtml(state.top.mode==='valor'?money(row.total):number(row.total,2)) + '</b></div>';}).join('') : '<div class="alm-top-empty-row"><span>—</span><div><strong>Sin datos</strong><i></i></div><b>—</b></div>') + '</div></section>';
  }
  function inventoryContent(){
    if(state.inventoryTab==='empresa') return companyTab(state.company.data);
    if(state.inventoryTab==='almacen') return warehouseTab(state.warehouse.data);
    if(state.inventoryTab==='top') return topTab(state.top.data);
    return inventoryMain(state.inventory.data);
  }
  function renderInventoryShell(body){ return shell('almacen-inventario', sourceImportPanel() + '<section class="alm-card alm-inventory-nav">' + inventoryTabs() + '</section><div id="alm-inventory-content" class="alm-stack">' + body + '</div>'); }

  async function loadCapabilities(){
    const data = await get('/api/almacen/importaciones/capabilities',{force:true});
    state.canImport = Boolean(data.canImport);
    state.source = data.source || null;
  }
  async function loadCatalogs(){ state.catalogs = await get('/api/almacen/inventario/catalogos',{force:true}); }
  async function loadInventoryData(){
    const f=state.inventory;
    state.inventory.data = await get('/api/almacen/inventario'+qs({page:f.page,pageSize:30,q:f.query,company:f.company,category:f.category,warehouse:f.warehouse,minValue:f.minValue,maxValue:f.maxValue,stockOnly:f.stockOnly}),{force:true});
  }
  async function loadCompanyData(){
    if(!state.catalogs.companies.includes(state.company.selected) && state.catalogs.companies.length) state.company.selected = state.catalogs.companies[0];
    state.company.data = await get('/api/almacen/inventario/empresa'+qs({company:state.company.selected,q:state.company.query,page:state.company.page}),{force:true});
  }
  async function loadWarehouseData(){ state.warehouse.data = await get('/api/almacen/inventario/almacenes'+qs({company:state.warehouse.company,q:state.warehouse.query}),{force:true}); }
  async function loadTopData(){ state.top.data = await get('/api/almacen/inventario/top'+qs({mode:state.top.mode,company:state.top.company,limit:state.top.count}),{force:true}); }
  async function loadCurrentTab(){
    if(state.inventoryTab==='empresa') return loadCompanyData();
    if(state.inventoryTab==='almacen') return loadWarehouseData();
    if(state.inventoryTab==='top') return loadTopData();
    return loadInventoryData();
  }

  function importMessage(view,text,tone){
    const box=view.querySelector('#alm-import-result');
    if(!box) return;
    box.className='alm-import-result' + (tone?' is-'+tone:'');
    box.innerHTML=escapeHtml(text);
  }
  function mappingSummary(data){
    const mapping=data.mapping||{};
    return Object.keys(mapping).map(function(key){return key + ' ← ' + mapping[key].header;}).join(' · ');
  }
  function bindImport(view){
    const fileInput=view.querySelector('#alm-import-file');
    const cutoff=view.querySelector('#alm-import-cutoff');
    const validate=view.querySelector('#alm-import-validate');
    const run=view.querySelector('#alm-import-run');
    if(!fileInput||!validate||!run) return;
    let validatedHash='';
    validate.addEventListener('click',async function(){
      const file=fileInput.files&&fileInput.files[0];
      if(!file){importMessage(view,'Selecciona un archivo .xlsx o .csv.','error');return;}
      validate.disabled=true; run.disabled=true; importMessage(view,'Validando encabezados y mapeo...','working');
      try{
        const form=new FormData(); form.append('archivo',file); if(cutoff&&cutoff.value) form.append('fechaCorte',cutoff.value);
        const data=await upload('/api/almacen/importaciones/validar',form);
        validatedHash=data.hash||''; run.disabled=false;
        const warnings=Array.isArray(data.warnings)&&data.warnings.length?' · ADVERTENCIAS: '+data.warnings.join(' '):'';
        importMessage(view,'Validación correcta: '+number(data.rows,0)+' filas · '+mappingSummary(data)+(data.coverage&&data.coverage.valor?'':' · ADVERTENCIA: no se confirmó valor/precio para todas las métricas.')+warnings, warnings?'warn':'ok');
      }catch(error){
        validatedHash='';
        const details=error.details;
        let message=error.message;
        if(details&&details.headers) message+=' Encabezados detectados: '+details.headers.join(' | ');
        importMessage(view,message,'error');
      }finally{validate.disabled=false;}
    });
    fileInput.addEventListener('change',function(){validatedHash='';run.disabled=true;importMessage(view,'Archivo cambiado. Vuelve a validar antes de importar.','');});
    run.addEventListener('click',async function(){
      const file=fileInput.files&&fileInput.files[0];
      if(!file||!validatedHash){importMessage(view,'Valida el archivo antes de importarlo.','error');return;}
      if(!window.confirm('Se importará este archivo como nuevo lote activo. El lote anterior se conservará desactivado. ¿Continuar?')) return;
      run.disabled=true; validate.disabled=true; importMessage(view,'Importando en Aiven. No cierres esta vista...','working');
      try{
        const form=new FormData(); form.append('archivo',file); if(cutoff&&cutoff.value) form.append('fechaCorte',cutoff.value);
        const data=await upload('/api/almacen/importaciones',form);
        if(window.ManttoHttp&&window.ManttoHttp.invalidate) window.ManttoHttp.invalidate('/api/almacen');
        document.dispatchEvent(new CustomEvent('mantto:data-mutated',{detail:{path:'/api/almacen/importaciones',method:'POST',source:'almacen-import'}}));
        state.source={archivoOrigen:data.archivoOrigen,hojaOrigen:data.hojaOrigen,fechaCorte:data.fechaCorte,fechaImportacion:new Date().toISOString(),filas:data.filas,loteImportacion:data.loteImportacion};
        await loadCatalogs(); state.inventory.page=1; await loadCurrentTab();
        view.innerHTML=renderInventoryShell(inventoryContent()); bindInventory(view);
      }catch(error){importMessage(view,error.message,'error');run.disabled=false;validate.disabled=false;}
    });
  }

  function debounce(fn,wait){let timer;return function(){clearTimeout(timer);timer=setTimeout(fn,wait);};}
  function bindInventory(view){
    bindImport(view);
    view.querySelectorAll('[data-alm-inventory-tab]').forEach(function(button){button.addEventListener('click',async function(){state.inventoryTab=button.dataset.almInventoryTab; view.innerHTML=renderInventoryShell(loading('Consultando vista...')); bindImport(view); try{await loadCurrentTab(); view.innerHTML=renderInventoryShell(inventoryContent()); bindInventory(view);}catch(error){view.querySelector('#alm-inventory-content').innerHTML=errorBlock(error.message);}});});
    view.querySelectorAll('[data-alm-inventory-company]').forEach(function(button){button.addEventListener('click',async function(){state.inventory.company=button.dataset.almInventoryCompany;state.inventory.page=1;await refreshInventory(view);});});
    view.querySelectorAll('[data-alm-company-tab-company]').forEach(function(button){button.addEventListener('click',async function(){state.company.selected=button.dataset.almCompanyTabCompany;state.company.page=1;await refreshInventory(view);});});
    view.querySelectorAll('[data-alm-warehouse-company]').forEach(function(button){button.addEventListener('click',async function(){state.warehouse.company=button.dataset.almWarehouseCompany;await refreshInventory(view);});});
    view.querySelectorAll('[data-alm-top-company]').forEach(function(button){button.addEventListener('click',async function(){state.top.company=button.dataset.almTopCompany;await refreshInventory(view);});});
    view.querySelectorAll('[data-alm-top-mode]').forEach(function(button){button.addEventListener('click',async function(){state.top.mode=button.dataset.almTopMode==='fisico'?'fisico':'valor';await refreshInventory(view);});});
    const refresh=debounce(function(){state.inventory.page=1;refreshInventory(view);},350);
    const q=view.querySelector('#alm-inv-query'); if(q)q.addEventListener('input',function(){state.inventory.query=q.value;refresh();});
    const cat=view.querySelector('#alm-inv-category'); if(cat)cat.addEventListener('change',function(){state.inventory.category=cat.value;state.inventory.page=1;refreshInventory(view);});
    const wh=view.querySelector('#alm-inv-warehouse'); if(wh)wh.addEventListener('change',function(){state.inventory.warehouse=wh.value;state.inventory.page=1;refreshInventory(view);});
    const min=view.querySelector('#alm-inv-min-value'); if(min)min.addEventListener('change',function(){state.inventory.minValue=min.value;state.inventory.page=1;refreshInventory(view);});
    const max=view.querySelector('#alm-inv-max-value'); if(max)max.addEventListener('change',function(){state.inventory.maxValue=max.value;state.inventory.page=1;refreshInventory(view);});
    const stock=view.querySelector('#alm-inv-stock-only'); if(stock)stock.addEventListener('change',function(){state.inventory.stockOnly=stock.checked;state.inventory.page=1;refreshInventory(view);});
    const cq=view.querySelector('#alm-company-query'); if(cq)cq.addEventListener('input',debounce(function(){state.company.query=cq.value;state.company.page=1;refreshInventory(view);},350));
    const wq=view.querySelector('#alm-warehouse-query'); if(wq)wq.addEventListener('input',debounce(function(){state.warehouse.query=wq.value;refreshInventory(view);},350));
    const tc=view.querySelector('#alm-top-count'); if(tc)tc.addEventListener('change',function(){state.top.count=tc.value;refreshInventory(view);});
    view.querySelectorAll('[data-alm-page]').forEach(function(button){button.addEventListener('click',async function(){const scope=button.dataset.almPageScope;const dir=button.dataset.almPage==='next'?1:-1;if(scope==='company')state.company.page=Math.max(1,state.company.page+dir);else state.inventory.page=Math.max(1,state.inventory.page+dir);await refreshInventory(view);});});
  }
  async function refreshInventory(view){
    const content=view.querySelector('#alm-inventory-content'); if(content)content.innerHTML=loading('Actualizando...');
    try{await loadCurrentTab();view.innerHTML=renderInventoryShell(inventoryContent());bindInventory(view);}catch(error){if(content)content.innerHTML=errorBlock(error.message);}
  }

  async function loadInventario(view){
    view.innerHTML=shell('almacen-inventario',loading('Consultando fuente de inventario...'));
    try{
      await Promise.all([loadCapabilities(),loadCatalogs()]);
      if(!state.source){view.innerHTML=renderInventoryShell(empty('No existe un cierre disponible. Si tienes autorización, carga el Excel desde Carga de Información.'));bindInventory(view);return;}
      await loadCurrentTab();
      view.innerHTML=renderInventoryShell(inventoryContent()); bindInventory(view);
    }catch(error){view.innerHTML=shell('almacen-inventario',errorBlock(error.message));}
  }

  function placeholder(route,body){return shell(route,body);}

  function operationalDatasetCard(type,label){
    const dataset=state.source&&state.source.datasets&&state.source.datasets[type];
    if(!dataset)return '<section class="alm-card alm-source-card"><div><strong>'+escapeHtml(label)+'</strong><span>El cierre seleccionado no contiene un conjunto '+escapeHtml(type)+' compatible.</span><small>Inventario puede seguir funcionando normalmente. Carga un .xlsx con los encabezados requeridos para habilitar esta vista.</small></div>'+statusPill('Sin datos compatibles','warn')+'</section>';
    return '<section class="alm-card alm-source-card"><div><strong>'+escapeHtml(label)+'</strong><span>'+escapeHtml(dataset.hojaOrigen||'Hoja')+' · '+number(dataset.filas,0)+' filas</span><small>Archivo: '+escapeHtml(state.source.archivoOrigen||'—')+' · Corte: '+dateText(state.source.fechaCorte)+'</small></div>'+statusPill('Datos del cierre','ok')+'</section>';
  }

  function operationalPager(scope,pagination){
    const p=pagination||{page:1,pages:1,total:0};
    return '<div class="alm-pager"><span>Página '+number(p.page,0)+' de '+number(p.pages,0)+' · '+number(p.total,0)+' registros</span><div><button type="button" data-alm-op-page="prev" data-alm-op-scope="'+scope+'"'+(Number(p.page)<=1?' disabled':'')+'>← Ant</button><button type="button" data-alm-op-page="next" data-alm-op-scope="'+scope+'"'+(Number(p.page)>=Number(p.pages)?' disabled':'')+'>Sig →</button></div></div>';
  }

  function stockCoverageLabel(data){
    const c=data&&data.coverage||{};
    const available=[];
    if(c.abc)available.push('ABC'); if(c.criticidad)available.push('Criticidad'); if(c.demanda)available.push('Demanda');
    if(c.stockSeguridad)available.push('Stock seguridad'); if(c.puntoReorden)available.push('ROP'); if(c.minimo)available.push('Mínimo'); if(c.maximo)available.push('Máximo');
    return available.length ? 'Parámetros derivados y guardados en el cierre: '+available.join(', ')+'.' : 'No hay artículos con al menos 2 meses de salidas interpretables en MOVIMIENTOS.';
  }

  function renderStock(data){
    state.source=data.source||state.source;
    const c=data.coverage||{}, k=data.kpis||{}, p=data.pagination||{};
    const rows=(data.rows||[]).map(function(row){
      return '<tr><td><strong>'+escapeHtml(row.articulo||row.codigo||'—')+'</strong><small class="alm-cell-sub">'+escapeHtml(row.codigo||'')+'</small></td><td>'+escapeHtml(row.empresa||'—')+'</td><td>'+escapeHtml(row.abc||'—')+'</td><td>'+escapeHtml(row.criticidad||'—')+'</td><td>'+number(row.demanda,2)+'</td><td>'+number(row.fisico,2)+'</td><td>'+number(row.stockSeguridad,2)+'</td><td>'+number(row.puntoReorden,2)+'</td><td>'+number(row.minimo,2)+'</td><td>'+number(row.maximo,2)+'</td><td>'+escapeHtml(row.alerta||'—')+'</td></tr>';
    });
    const classMap={}; (data.classSummary||[]).forEach(function(item){classMap[item.abc]=item.total;});
    const companyOptions=['todas'].concat(data.companies||[]).map(function(value){return '<option value="'+escapeHtml(value)+'"'+(value===state.stock.company?' selected':'')+'>'+escapeHtml(value==='todas'?'Todas':value)+'</option>';}).join('');
    return shell('almacen-stock',
      operationalDatasetCard('INVENTARIO','Fuente para Stock')+
      '<section class="alm-card alm-operational-note"><strong>Regla de cálculo alineada a Desarrollo Almacén</strong><span>Las hojas MOVIMIENTOS aportan las salidas mensuales. Se calcula Demanda promedio y desviación; SS = Z(95%) × σD × √LT con LT=1 mes; ROP = D̄ × LT + SS; Mínimo = SS; Máximo = ROP + 2×D̄; ABC = Volumen anual × P.Unit. × Criticidad, usando Criticidad Media como valor inicial del modelo de Desarrollo. '+escapeHtml(stockCoverageLabel(data))+'</span></section>'+
      '<section class="alm-kpi-grid">'+
        kpi('Artículos analizados','📊',number(k.articulos,0),'Inventario del cierre','blue')+
        kpi('Bajo stock seguridad','🔴',c.stockSeguridad?number(k.criticos,0):'—',c.stockSeguridad?'Stock actual vs SS calculado':'Sin cálculo disponible','red')+
        kpi('En punto de reorden','⏰',c.puntoReorden?number(k.reorden,0):'—',c.puntoReorden?'Stock actual vs ROP calculado':'Sin cálculo disponible','amber')+
        kpi('Sobre el máximo','📦',c.maximo?number(k.exceso,0):'—',c.maximo?'Stock actual vs Máximo calculado':'Sin cálculo disponible','purple')+
      '</section>'+
      '<section class="alm-card alm-filter-card"><div class="alm-filter-row alm-filter-row-main">'+
        '<label class="alm-field"><span>Buscar artículo</span><input id="alm-stock-query" type="search" value="'+escapeHtml(state.stock.query)+'" placeholder="Artículo o código..."></label>'+
        '<label class="alm-field"><span>Empresa</span><select id="alm-stock-company">'+companyOptions+'</select></label>'+
        '<label class="alm-field"><span>Clase ABC</span><select id="alm-stock-abc"><option value="todas">Todas</option><option value="A"'+(state.stock.abc==='A'?' selected':'')+'>A</option><option value="B"'+(state.stock.abc==='B'?' selected':'')+'>B</option><option value="C"'+(state.stock.abc==='C'?' selected':'')+'>C</option></select></label>'+
        '<label class="alm-field"><span>Alerta</span><select id="alm-stock-alert"><option value="todas">Todas</option><option value="critico"'+(state.stock.alert==='critico'?' selected':'')+'>Bajo stock seguridad</option><option value="reorden"'+(state.stock.alert==='reorden'?' selected':'')+'>Punto de reorden</option><option value="exceso"'+(state.stock.alert==='exceso'?' selected':'')+'>Sobre máximo</option><option value="ok"'+(state.stock.alert==='ok'?' selected':'')+'>OK</option></select></label>'+
      '</div></section>'+
      '<section class="alm-stock-class-grid"><article class="alm-stock-class alm-stock-class-a"><span>A</span><div><strong>Clase A</strong><small>Calculada desde MOVIMIENTOS</small></div><b>'+ (c.abc?number(classMap.A||0,0):'—') +'</b></article><article class="alm-stock-class alm-stock-class-b"><span>B</span><div><strong>Clase B</strong><small>Calculada desde MOVIMIENTOS</small></div><b>'+ (c.abc?number(classMap.B||0,0):'—') +'</b></article><article class="alm-stock-class alm-stock-class-c"><span>C</span><div><strong>Clase C</strong><small>Calculada desde MOVIMIENTOS</small></div><b>'+ (c.abc?number(classMap.C||0,0):'—') +'</b></article></section>'+
      '<section class="alm-card alm-table-card"><div class="alm-section-head"><div><h2>Análisis de stock</h2><p>Existencia del DET + parámetros derivados de MOVIMIENTOS del mismo cierre.</p></div>'+statusPill('30 por página','ok')+'</div>'+renderTable(['Artículo','Empresa','ABC','Criticidad','Demanda','Stock actual','Stock seg.','Pto. reorden','Mínimo','Máximo','Alerta'],rows,1220)+operationalPager('stock',p)+'</section>'
    );
  }

  async function loadStock(view){
    view.innerHTML=shell('almacen-stock',loading('Consultando stock del cierre seleccionado...'));
    try{
      const data=await get('/api/almacen/stock'+qs({q:state.stock.query,company:state.stock.company,abc:state.stock.abc,alert:state.stock.alert,page:state.stock.page}),{force:true});
      state.stock.data=data; state.source=data.source||state.source; view.innerHTML=renderStock(data); bindStock(view);
    }catch(error){view.innerHTML=shell('almacen-stock',errorBlock(error.message));}
  }

  function bindStock(view){
    const refresh=debounce(function(){state.stock.page=1;loadStock(view);},350);
    const q=view.querySelector('#alm-stock-query');if(q)q.addEventListener('input',function(){state.stock.query=q.value;refresh();});
    const company=view.querySelector('#alm-stock-company');if(company)company.addEventListener('change',function(){state.stock.company=company.value;state.stock.page=1;loadStock(view);});
    const abc=view.querySelector('#alm-stock-abc');if(abc)abc.addEventListener('change',function(){state.stock.abc=abc.value;state.stock.page=1;loadStock(view);});
    const alert=view.querySelector('#alm-stock-alert');if(alert)alert.addEventListener('change',function(){state.stock.alert=alert.value;state.stock.page=1;loadStock(view);});
    bindOperationalPager(view,'stock',function(dir){state.stock.page=Math.max(1,state.stock.page+dir);return loadStock(view);});
  }

  function loanCompanyOptions(){
    const values=['todas'].concat(state.loans.catalogs.companies||[]);
    return values.map(function(value){return '<button type="button" class="alm-loan-company'+(state.loans.company===value?' is-active':'')+'" data-alm-loan-company="'+escapeHtml(value)+'"><span>🏢</span><strong>'+escapeHtml(value==='todas'?'Todas':value)+'</strong><small>'+escapeHtml(value==='todas'?'Consolidado':'Ver préstamos')+'</small></button>';}).join('');
  }

  function loanAgeTone(label,index){
    const key=String(label||'').toUpperCase();
    if(key.includes('MAYOR'))return 'red';
    if(key.includes('0-6')||key.includes('1-6'))return 'green';
    if(key.includes('6-15'))return 'amber';
    return ['green','amber','red','purple'][index%4];
  }

  function loanAgeCards(summary){
    const ages=(summary.ages||[]).filter(function(row){return row&&row.antiguedad;});
    if(!ages.length)return '<section class="alm-card alm-operational-note"><strong>Antigüedad</strong><span>El cierre no trae clasificación de antigüedad para los préstamos seleccionados.</span></section>';
    return '<section class="alm-loan-age-grid">'+ages.map(function(row,index){const label=row.antiguedad||'SIN CLASIFICAR';const tone=loanAgeTone(label,index);return '<article class="alm-loan-age alm-loan-age-'+tone+'"><small>'+escapeHtml(label)+'</small><strong>'+number(row.articulos||0,0)+' art.</strong><span>Valor: '+money(row.valorTotal)+'</span></article>';}).join('')+'</section>';
  }

  function renderLoanSummary(summary){
    const rows=(summary.rows||[]).map(function(row){return '<tr><td><strong>'+escapeHtml(row.responsable||'—')+'</strong></td><td>'+number(row.articulos,0)+'</td><td>'+number(row.cantidad,2)+'</td><td>'+money(row.valorTotal)+'</td><td>'+(row.porcentaje==null?'—':number(row.porcentaje,1)+'%')+'</td><td>'+number(row.diasPrestamo,0)+'</td><td>'+dateText(row.desde)+'</td><td>'+number(row.sitios,0)+'</td><td><button type="button" class="alm-table-action" data-alm-loan-responsible-open="'+escapeHtml(row.responsable||'')+'">Detalle</button></td></tr>';});
    return loanAgeCards(summary)+'<section class="alm-card alm-table-card"><div class="alm-section-head"><div><h2>Préstamos por responsable</h2><p>Concentrado del conjunto PRESTAMO del cierre seleccionado.</p></div>'+statusPill('Fuente Excel','ok')+'</div>'+renderTable(['Responsable','Artículos','Cantidad','Valor total','% del total','Días en préstamo','Desde','Sitios','Detalle'],rows,1060)+'</section>';
  }

  function renderLoanDetail(detail){
    const responsibleOptions='<option value="todos">Todos los responsables</option>'+(state.loans.catalogs.responsibles||[]).map(function(value){return '<option value="'+escapeHtml(value)+'"'+(state.loans.responsible===value?' selected':'')+'>'+escapeHtml(value)+'</option>';}).join('');
    const rows=(detail.rows||[]).map(function(row){return '<tr><td><strong>'+escapeHtml(row.articulo||row.codigo||'—')+'</strong><small class="alm-cell-sub">'+escapeHtml(row.codigo||'')+'</small></td><td>'+escapeHtml(row.ag||'—')+'</td><td>'+escapeHtml(row.responsable||'—')+'</td><td>'+escapeHtml(row.sitio||'—')+'</td><td>'+number(row.cantidad,2)+'</td><td>'+money(row.costo)+'</td><td>'+dateText(row.fecha)+'</td><td>'+number(row.dias,0)+'</td><td>'+escapeHtml(row.antiguedad||'—')+'</td></tr>';});
    return '<section class="alm-card alm-filter-card"><div class="alm-filter-row alm-filter-row-main"><label class="alm-field"><span>Responsable</span><select id="alm-loan-responsible">'+responsibleOptions+'</select></label><label class="alm-field"><span>Antigüedad</span><select id="alm-loan-age"><option value="todas">Todas</option>'+(state.loans.catalogs.ages||[]).map(function(value){return '<option value="'+escapeHtml(value)+'"'+(state.loans.age===value?' selected':'')+'>'+escapeHtml(value)+'</option>';}).join('')+'</select></label><label class="alm-field"><span>Buscar</span><input id="alm-loan-query" type="search" value="'+escapeHtml(state.loans.query)+'" placeholder="Artículo, sitio o AG..."></label></div></section>'+
      '<section class="alm-mini-summary-grid"><article><small>Artículos filtrados</small><strong>'+number(detail.summary&&detail.summary.articulos,0)+'</strong></article><article><small>Cantidad filtrada</small><strong>'+number(detail.summary&&detail.summary.cantidad,2)+' pz</strong></article><article><small>Valor filtrado</small><strong>'+money(detail.summary&&detail.summary.valorTotal)+'</strong></article></section>'+
      '<section class="alm-card alm-table-card"><div class="alm-section-head"><div><h2>Detalle de artículos en préstamo</h2><p>Desglose del conjunto PRESTAMO del cierre seleccionado.</p></div>'+statusPill('30 por página','ok')+'</div>'+renderTable(['Artículo','AG','Responsable','Sitio / AD','Cant.','Costo total','Fecha','Días','Antigüedad'],rows,980)+operationalPager('loans',detail.pagination)+'</section>';
  }

  function renderLoans(){
    const catalogs=state.loans.catalogs||{};
    if(!state.source)return shell('almacen-prestamos',empty('No existe un cierre disponible de Almacén.'));
    if(!catalogs.available)return shell('almacen-prestamos',operationalDatasetCard('PRESTAMO','Fuente para Préstamos')+empty('No se detectó una hoja o conjunto con Empresa, Fecha, Artículo, Responsable y Cantidad. No se fabrican préstamos a partir del inventario.'));
    const summary=state.loans.summary||{kpis:{},ages:[],rows:[]}; const k=summary.kpis||{};
    return shell('almacen-prestamos',operationalDatasetCard('PRESTAMO','Fuente para Préstamos')+'<section class="alm-loan-company-row">'+loanCompanyOptions()+'</section><section class="alm-kpi-grid">'+kpi('Total artículos','🔄',number(k.articulos,0),'Registros de préstamo','blue')+kpi('Valor en préstamo','💰',money(k.valorTotal),'Cuando costo/valor viene en fuente','green')+kpi('Piezas totales','📦',number(k.piezas,2),'Cantidad','amber')+kpi('Responsables','👤',number(k.responsables,0),'Con material','purple')+'</section><section class="alm-card alm-inventory-nav"><nav class="alm-subtabs"><button type="button" class="alm-subtab'+(state.loans.view==='resumen'?' is-active':'')+'" data-alm-loan-view="resumen"><span>👥</span>Por responsable</button><button type="button" class="alm-subtab'+(state.loans.view==='detalle'?' is-active':'')+'" data-alm-loan-view="detalle"><span>📋</span>Detalle de artículos</button></nav></section><div class="alm-stack">'+(state.loans.view==='detalle'?renderLoanDetail(state.loans.detail||{rows:[],summary:{},pagination:{page:1,pages:1,total:0}}):renderLoanSummary(summary))+'</div>');
  }

  async function loadLoans(view){
    view.innerHTML=shell('almacen-prestamos',loading('Consultando préstamos...'));
    try{
      state.loans.catalogs=await get('/api/almacen/prestamos/catalogos',{force:true}); state.source=state.loans.catalogs.source||state.source;
      if(!state.loans.catalogs.available){view.innerHTML=renderLoans();return;}
      if(state.loans.company!=='todas' && !(state.loans.catalogs.companies||[]).includes(state.loans.company))state.loans.company='todas';
      if(state.loans.responsible!=='todos' && !(state.loans.catalogs.responsibles||[]).includes(state.loans.responsible))state.loans.responsible='todos';
      if(state.loans.age!=='todas' && !(state.loans.catalogs.ages||[]).includes(state.loans.age))state.loans.age='todas';
      state.loans.summary=await get('/api/almacen/prestamos/resumen'+qs({company:state.loans.company}),{force:true});
      if(state.loans.view==='detalle')state.loans.detail=await get('/api/almacen/prestamos'+qs({company:state.loans.company,responsible:state.loans.responsible,age:state.loans.age,q:state.loans.query,page:state.loans.page}),{force:true});
      view.innerHTML=renderLoans(); bindLoans(view);
    }catch(error){view.innerHTML=shell('almacen-prestamos',errorBlock(error.message));}
  }

  function bindLoans(view){
    view.querySelectorAll('[data-alm-loan-company]').forEach(function(button){button.addEventListener('click',function(){state.loans.company=button.dataset.almLoanCompany||'todas';state.loans.page=1;loadLoans(view);});});
    view.querySelectorAll('[data-alm-loan-view]').forEach(function(button){button.addEventListener('click',function(){state.loans.view=button.dataset.almLoanView||'resumen';state.loans.page=1;loadLoans(view);});});
    view.querySelectorAll('[data-alm-loan-responsible-open]').forEach(function(button){button.addEventListener('click',function(){state.loans.responsible=button.dataset.almLoanResponsibleOpen||'todos';state.loans.view='detalle';state.loans.page=1;loadLoans(view);});});
    const resp=view.querySelector('#alm-loan-responsible');if(resp)resp.addEventListener('change',function(){state.loans.responsible=resp.value;state.loans.page=1;loadLoans(view);});
    const age=view.querySelector('#alm-loan-age');if(age)age.addEventListener('change',function(){state.loans.age=age.value;state.loans.page=1;loadLoans(view);});
    const q=view.querySelector('#alm-loan-query');if(q)q.addEventListener('input',debounce(function(){state.loans.query=q.value;state.loans.page=1;loadLoans(view);},350));
    bindOperationalPager(view,'loans',function(dir){state.loans.page=Math.max(1,state.loans.page+dir);return loadLoans(view);});
  }

  function renderGuards(){
    const catalogs=state.guards.catalogs||{}; const data=state.guards.data||{kpis:{},rows:[],pagination:{page:1,pages:1,total:0}};
    if(!state.source)return shell('almacen-resguardos',empty('No existe un cierre disponible de Almacén.'));
    if(!catalogs.available)return shell('almacen-resguardos',operationalDatasetCard('RESGUARDO','Fuente para Resguardos')+empty('No se detectó una hoja o conjunto compatible de Resguardos. No se fabrican resguardos a partir del inventario.'));
    const companyOptions='<option value="todas">Todas las subsidiarias</option>'+(catalogs.companies||[]).map(function(value){return '<option value="'+escapeHtml(value)+'"'+(state.guards.subsidiary===value?' selected':'')+'>'+escapeHtml(value)+'</option>';}).join('');
    const deptOptions='<option value="todos">Todos los departamentos</option>'+(catalogs.departments||[]).map(function(value){return '<option value="'+escapeHtml(value)+'"'+(state.guards.department===value?' selected':'')+'>'+escapeHtml(value)+'</option>';}).join('');
    const rows=(data.rows||[]).map(function(row){return '<tr><td>'+dateText(row.fecha)+'</td><td>'+escapeHtml(row.folio||'—')+'</td><td>'+escapeHtml(row.subsidiaria||'—')+'</td><td>'+escapeHtml(row.departamento||'—')+'</td><td>'+escapeHtml(row.ag||'—')+'</td><td>'+number(row.cantidad,2)+'</td><td>'+escapeHtml(row.unidad||'—')+'</td><td>'+escapeHtml(row.descripcion||'—')+'</td><td>'+escapeHtml(row.proyecto||'—')+'</td><td>'+escapeHtml(row.equipo||'—')+'</td><td>'+escapeHtml(row.entregadoPor||'—')+'</td><td>'+number(row.salida,2)+'</td><td>'+escapeHtml(row.folioSalida||'—')+'</td><td>'+dateText(row.fechaSalida)+'</td><td>'+escapeHtml(row.aCargoDe||'—')+'</td><td>'+number(row.totalPendiente,2)+'</td><td>'+escapeHtml(row.ubicacion||'—')+'</td><td>'+escapeHtml(row.conStock||'—')+'</td></tr>';});
    const k=data.kpis||{};
    return shell('almacen-resguardos',operationalDatasetCard('RESGUARDO','Fuente para Resguardos')+'<section class="alm-kpi-grid">'+kpi('Total resguardos','🔒',number(k.total,0),'Conjunto del cierre','purple')+kpi('Con salida registrada','✅',number(k.conSalida,0),'SALIDA distinta de 0','green')+kpi('Sin salida','⏳',number(k.sinSalida,0),'SALIDA vacía o 0','amber')+kpi('Filtrados','🔍',number(k.filtrados,0),'Filtros actuales','blue')+'</section><section class="alm-card alm-filter-card"><div class="alm-filter-row alm-filter-row-main"><label class="alm-field"><span>Buscar</span><input id="alm-guard-query" type="search" value="'+escapeHtml(state.guards.query)+'" placeholder="Descripción, proyecto, AG o folio..."></label><label class="alm-field"><span>Subsidiaria</span><select id="alm-guard-subsidiary">'+companyOptions+'</select></label><label class="alm-field"><span>Departamento</span><select id="alm-guard-department">'+deptOptions+'</select></label><label class="alm-field"><span>Salida</span><select id="alm-guard-exit"><option value="todos">Todos</option><option value="con"'+(state.guards.exitStatus==='con'?' selected':'')+'>Con salida registrada</option><option value="sin"'+(state.guards.exitStatus==='sin'?' selected':'')+'>Sin salida</option></select></label></div></section><section class="alm-card alm-table-card"><div class="alm-section-head"><div><h2>Resguardos</h2><p>Detalle proveniente del conjunto RESGUARDO del cierre seleccionado.</p></div>'+statusPill('30 por página','ok')+'</div>'+renderTable(['Fecha','Folio entrada','Subsidiaria','Depto.','AG','Cant.','Unidad','Descripción','Proyecto','No. equipo','Entregado por','Salida','Folio salida','Fecha salida','A cargo de','Total','Ubicación','Con stock'],rows,1980)+operationalPager('guards',data.pagination)+'</section>');
  }

  async function loadGuards(view){
    view.innerHTML=shell('almacen-resguardos',loading('Consultando resguardos...'));
    try{
      state.guards.catalogs=await get('/api/almacen/resguardos/catalogos',{force:true}); state.source=state.guards.catalogs.source||state.source;
      if(!state.guards.catalogs.available){view.innerHTML=renderGuards();return;}
      state.guards.data=await get('/api/almacen/resguardos'+qs({q:state.guards.query,company:state.guards.subsidiary,department:state.guards.department,exitStatus:state.guards.exitStatus,page:state.guards.page}),{force:true});
      view.innerHTML=renderGuards(); bindGuards(view);
    }catch(error){view.innerHTML=shell('almacen-resguardos',errorBlock(error.message));}
  }

  function bindGuards(view){
    const q=view.querySelector('#alm-guard-query');if(q)q.addEventListener('input',debounce(function(){state.guards.query=q.value;state.guards.page=1;loadGuards(view);},350));
    const company=view.querySelector('#alm-guard-subsidiary');if(company)company.addEventListener('change',function(){state.guards.subsidiary=company.value;state.guards.page=1;loadGuards(view);});
    const dept=view.querySelector('#alm-guard-department');if(dept)dept.addEventListener('change',function(){state.guards.department=dept.value;state.guards.page=1;loadGuards(view);});
    const exit=view.querySelector('#alm-guard-exit');if(exit)exit.addEventListener('change',function(){state.guards.exitStatus=exit.value;state.guards.page=1;loadGuards(view);});
    bindOperationalPager(view,'guards',function(dir){state.guards.page=Math.max(1,state.guards.page+dir);return loadGuards(view);});
  }

  function bindOperationalPager(view,scope,handler){
    view.querySelectorAll('[data-alm-op-page][data-alm-op-scope="'+scope+'"]').forEach(function(button){button.addEventListener('click',function(){if(button.disabled)return;const dir=button.dataset.almOpPage==='next'?1:-1;Promise.resolve(handler(dir)).catch(function(){});});});
  }


  // [Aster | 2026-08-30 | ALMACEN-AUDITORIA-AIVEN-V002]
  // F4 V002: auditoría operativa de solo lectura/contraste. Sin persistencia en navegador ni escrituras API.
  function auditModeCard(){
    return '<section class="alm-card alm-audit-mode"><div><strong>Auditoría persistente</strong><span>El esperado se copia del cierre seleccionado de almacen_fuente_excel. Conteos y observaciones se guardan en almacen_auditoria; nunca modifican el cierre Excel.</span></div>'+statusPill('Persistente','ok')+'</section>';
  }

  function auditMetrics(session){
    const items=(session&&session.items)||[];
    let completed=0, exact=0, expectedPieces=0, foundPieces=0, expectedValue=0, foundValue=0, valued=0;
    items.forEach(function(item){
      expectedPieces+=Number(item.expected||0);
      if(item.found===null||item.found===undefined||item.found==='')return;
      completed+=1;
      const found=Number(item.found||0), expected=Number(item.expected||0);
      foundPieces+=found;
      if(Math.abs(found-expected)<1e-9)exact+=1;
      if(item.expectedValue!==null&&item.expectedValue!==undefined&&item.unitValue!==null&&item.unitValue!==undefined){
        expectedValue+=Number(item.expectedValue||0); foundValue+=found*Number(item.unitValue||0); valued+=1;
      }
    });
    return {total:items.length,completed:completed,exact:exact,expectedPieces:expectedPieces,foundPieces:foundPieces,pieceDifference:foundPieces-expectedPieces,expectedValue:valued?expectedValue:null,foundValue:valued?foundValue:null,valueDifference:valued?(foundValue-expectedValue):null,valued:valued,matchPercent:items.length?(exact/items.length)*100:0};
  }

  function auditWarehouseCards(){
    const catalogs=state.audit.catalogs||{warehouses:[]};
    const q=String(state.audit.warehouseQuery||'').trim().toLowerCase();
    const company=state.audit.company;
    const rows=(catalogs.warehouses||[]).filter(function(row){
      if(company!=='todas'&&row.company!==company)return false;
      if(q&&!String(row.warehouse||'').toLowerCase().includes(q))return false;
      return true;
    });
    if(!rows.length)return empty('No hay almacenes con existencia positiva para los filtros actuales.');
    return '<div class="alm-audit-warehouse-grid">'+rows.map(function(row){
      const selected=state.audit.selectedCompany===row.company&&state.audit.selectedWarehouse===row.warehouse;
      return '<button type="button" class="alm-audit-warehouse'+(selected?' is-selected':'')+'" data-audit-company="'+escapeHtml(row.company)+'" data-audit-warehouse="'+escapeHtml(row.warehouse)+'"><div class="alm-audit-warehouse-head"><strong>'+escapeHtml(row.warehouse)+'</strong>'+statusPill(row.company,'ok')+'</div><span>'+escapeHtml(row.type||'—')+'</span><div class="alm-audit-warehouse-stats"><small><b>'+number(row.references,0)+'</b> referencias</small><small><b>'+number(row.pieces,2)+'</b> piezas</small><small><b>'+money(row.expectedValue)+'</b> valor</small></div></button>';
    }).join('')+'</div>';
  }

  function auditHistoryHtml(){
    const rows=state.audit.history||[];
    if(!rows.length)return '<section class="alm-card"><div class="alm-section-head"><div><h2>Auditorías del cierre</h2><p>Aún no hay auditorías persistidas para este cierre.</p></div></div></section>';
    return '<section class="alm-card"><div class="alm-section-head"><div><h2>Auditorías del cierre</h2><p>Conteos almacenados en almacen_auditoria.</p></div>'+statusPill(number(rows.length,0)+' registros','ok')+'</div><div class="alm-audit-history">'+rows.map(function(row){return '<div class="alm-audit-history-row"><div><strong>'+escapeHtml(row.folioAuditoria)+'</strong><small>'+escapeHtml(row.empresa||'—')+' · '+escapeHtml(row.almacen||'—')+'</small></div><div><strong>'+escapeHtml(row.estatus||'—')+'</strong><small>'+dateText(row.fechaInicio)+'</small></div><div><strong>'+number(row.capturadas,0)+' / '+number(row.referencias,0)+'</strong><small>capturadas</small></div><div><strong>'+(Number(row.diferencia||0)>0?'+':'')+number(row.diferencia,2)+'</strong><small>diferencia</small></div><div><strong>'+money(row.valorDiferencia)+'</strong><small>impacto</small></div><button type="button" data-audit-open="'+escapeHtml(row.folioAuditoria)+'">Abrir</button></div>';}).join('')+'</div></section>';
  }
  function renderAuditSelect(){
    const catalogs=state.audit.catalogs||{warehouses:[]};
    const history=auditHistoryHtml();
    if(!catalogs.source)return shell('almacen-auditoria',sourceCard()+auditModeCard()+history+empty('No existe un cierre de inventario disponible para auditar.'));
    if(!catalogs.available)return shell('almacen-auditoria',sourceCard()+auditModeCard()+history+empty('El cierre seleccionado no contiene almacenes con existencia positiva para auditar.'));
    const companies=['todas'].concat(Array.from(new Set((catalogs.warehouses||[]).map(function(row){return row.company;}))).sort());
    const companyOptions=companies.map(function(value){return '<option value="'+escapeHtml(value)+'"'+(state.audit.company===value?' selected':'')+'>'+(value==='todas'?'Todas las empresas':escapeHtml(value))+'</option>';}).join('');
    const canGenerate=Boolean(state.audit.selectedCompany&&state.audit.selectedWarehouse);
    return shell('almacen-auditoria',sourceCard()+auditModeCard()+history+'<section class="alm-card"><div class="alm-section-head"><div><h2>Nueva auditoría</h2><p>Selecciona un almacén del cierre consultado. Al iniciar, la muestra y sus valores esperados quedan fotografiados en almacen_auditoria.</p></div>'+statusPill('5% · 70/30','ok')+'</div><div class="alm-audit-method"><div><b>1</b><span><strong>Almacén</strong><small>Empresa + almacén con físico mayor a cero.</small></span></div><div><b>2</b><span><strong>Muestra</strong><small>5% de referencias; 70% por valor y 30% aleatorio.</small></span></div><div><b>3</b><span><strong>Persistencia</strong><small>Conteo y observaciones se guardan en la tabla de auditoría.</small></span></div></div></section><section class="alm-card alm-filter-card"><div class="alm-filter-row alm-filter-row-main"><label class="alm-field"><span>Empresa</span><select id="alm-audit-company">'+companyOptions+'</select></label><label class="alm-field alm-field-grow"><span>Buscar almacén</span><input id="alm-audit-warehouse-query" type="search" value="'+escapeHtml(state.audit.warehouseQuery)+'" placeholder="Nombre de almacén..."></label></div></section><section class="alm-card"><div class="alm-section-head"><div><h2>Almacenes disponibles</h2><p>Fuente: INVENTARIO del cierre seleccionado.</p></div></div>'+auditWarehouseCards()+'<div class="alm-audit-generate"><div>'+(canGenerate?'<strong>'+escapeHtml(state.audit.selectedWarehouse)+'</strong><small>'+escapeHtml(state.audit.selectedCompany)+'</small>':'<strong>Sin selección</strong><small>Selecciona un almacén para continuar.</small>')+'</div><button id="alm-audit-generate" type="button"'+(canGenerate?'':' disabled')+'>Iniciar auditoría</button></div></section>');
  }

  function auditFoundValue(item){ return item.found===null||item.found===undefined||item.unitValue===null||item.unitValue===undefined?null:Number(item.found)*Number(item.unitValue); }
  function renderAuditCapture(){
    const session=state.audit.session;
    if(!session)return renderAuditSelect();
    const metrics=auditMetrics(session);
    const locked=String(session.status||'').toUpperCase()==='CERRADA';
    const rows=(session.items||[]).map(function(item,index){
      const has=item.found!==null&&item.found!==undefined&&item.found!=='';
      const found=has?Number(item.found):null;
      const diff=has?found-Number(item.expected||0):null;
      const tone=!has?'pending':Math.abs(diff)<1e-9?'ok':'diff';
      return '<article class="alm-audit-item is-'+tone+'"><div class="alm-audit-item-main"><span class="alm-audit-index">'+String(index+1).padStart(2,'0')+'</span><div><strong>'+escapeHtml(item.article||item.code||'Sin descripción')+'</strong><small>'+escapeHtml(item.code||'Sin código')+(item.category?' · '+escapeHtml(item.category):'')+'</small></div></div><div class="alm-audit-expected"><span>Esperado</span><strong>'+number(item.expected,2)+'</strong><small>'+money(item.expectedValue)+'</small></div><div class="alm-audit-capture"><label><span>Encontrado</span><input type="number" min="0" step="any" data-audit-found="'+index+'" value="'+(has?escapeHtml(item.found):'')+'" placeholder="0"'+(locked?' disabled':'')+'></label><button type="button" data-audit-ok="'+index+'"'+(locked?' disabled':'')+'>✓ Correcto</button><label><span>Observaciones</span><textarea class="alm-audit-observations" data-audit-observations="'+index+'"'+(locked?' disabled':'')+'>'+escapeHtml(item.observaciones||'')+'</textarea></label><small class="alm-audit-save-state">'+(state.audit.saving?'Guardando...':'Guardado en Aiven')+'</small></div><div class="alm-audit-difference"><span>Diferencia</span><strong>'+(diff===null?'—':(diff>0?'+':'')+number(diff,2))+'</strong><small>'+(has&&item.unitValue!==null&&item.unitValue!==undefined?money(auditFoundValue(item)-Number(item.expectedValue||0)):'Valor —')+'</small></div></article>';
    }).join('');
    const allDone=metrics.completed===metrics.total&&metrics.total>0;
    return shell('almacen-auditoria',sourceCard()+auditModeCard()+'<section class="alm-card alm-audit-session-head"><button type="button" class="alm-link-button" id="alm-audit-cancel">← Guardar y salir</button><div><h2>Auditoría '+escapeHtml(session.folioAuditoria||session.sessionId||'')+' · '+escapeHtml(session.warehouse)+'</h2><p>'+escapeHtml(session.company)+' · '+number(session.sampleSize,0)+' referencias · Corte '+dateText(session.fechaCorte)+'</p></div>'+statusPill(locked?'Cerrada':number(metrics.completed,0)+' / '+number(metrics.total,0),locked?'ok':'warn')+'</section><section class="alm-kpi-grid">'+kpi('Capturados','🧾',number(metrics.completed,0)+' / '+number(metrics.total,0),'Conteos persistidos','blue')+kpi('Coincidencias','✅',number(metrics.exact,0),'Misma cantidad esperada','green')+kpi('Esperado','📦',number(metrics.expectedPieces,2)+' pz','Fotografía del cierre','purple')+kpi('Diferencia','±',(metrics.pieceDifference>0?'+':'')+number(metrics.pieceDifference,2)+' pz','Capturas actuales','amber')+'</section>'+ (state.audit.saveError?'<section class="alm-card alm-error-block"><strong>Error al guardar</strong><small>'+escapeHtml(state.audit.saveError)+'</small></section>':'') +'<section class="alm-audit-capture-list">'+rows+'</section><section class="alm-card alm-audit-footer"><div><strong>'+ (locked?'Auditoría cerrada':allDone?'Conteo completo':'Faltan '+number(metrics.total-metrics.completed,0)+' artículos') +'</strong><small>'+ (locked?'El histórico queda protegido contra cambios normales.':allDone?'Ya puedes cerrar la auditoría.':'Cada cambio se guarda en almacen_auditoria.') +'</small></div>'+(locked?'':'<button id="alm-audit-finish" type="button"'+(allDone?'':' disabled')+'>Cerrar auditoría</button>')+'</section>');
  }
  async function finalizeAudit(view){
    if(!state.audit.session)return;
    const metrics=auditMetrics(state.audit.session);
    if(metrics.completed!==metrics.total){alert('Completa todos los artículos antes de cerrar la auditoría.');return;}
    try{
      state.audit.saving=true;state.audit.saveError='';view.innerHTML=renderAuditCapture();bindAudit(view);
      const data=await sendJson('/api/almacen/auditoria/'+encodeURIComponent(state.audit.session.folioAuditoria)+'/cerrar','POST',{});
      const session=auditFromApi(data.audit);
      session.finishedAt=data.audit.fechaCierre;
      state.audit.session=session;
      state.audit.result={session:session,metrics:auditMetrics(session),finishedAt:data.audit.fechaCierre};
      state.audit.view='result';state.audit.saving=false;
      if(window.ManttoHttp&&window.ManttoHttp.invalidate)window.ManttoHttp.invalidate('/api/almacen/auditoria');
      document.dispatchEvent(new CustomEvent('mantto:data-mutated',{detail:{path:'/api/almacen/auditoria/'+session.folioAuditoria+'/cerrar',method:'POST',source:'almacen-auditoria'}}));
      view.innerHTML=renderAuditResult();bindAudit(view);
    }catch(error){state.audit.saving=false;state.audit.saveError=error.message;view.innerHTML=renderAuditCapture();bindAudit(view);}
  }

  function renderAuditResult(){
    const result=state.audit.result;
    if(!result)return renderAuditCapture();
    const session=result.session, metrics=result.metrics;
    const rows=session.items.map(function(item){
      const found=Number(item.found||0), diff=found-Number(item.expected||0), exact=Math.abs(diff)<1e-9;
      const valueDiff=item.valueDifference!=null?Number(item.valueDifference):(item.unitValue==null?null:diff*Number(item.unitValue));
      return '<tr><td>'+escapeHtml(item.article||'—')+'</td><td>'+escapeHtml(item.code||'—')+'</td><td>'+number(item.expected,2)+'</td><td>'+number(found,2)+'</td><td class="'+(exact?'alm-text-ok':'alm-text-diff')+'">'+(diff>0?'+':'')+number(diff,2)+'</td><td>'+money(item.expectedValue)+'</td><td>'+money(valueDiff)+'</td><td>'+statusPill(exact?'Correcto':'Diferencia',exact?'ok':'warn')+'</td></tr>';
    });
    return shell('almacen-auditoria',sourceCard()+auditModeCard()+'<section class="alm-card alm-audit-result-head"><div><span class="alm-eyebrow">Auditoría cerrada</span><h2>'+escapeHtml(session.warehouse)+'</h2><p>'+escapeHtml(session.company)+' · Folio '+escapeHtml(session.folioAuditoria||session.sessionId||'')+' · '+dateText(session.finishedAt||result.finishedAt)+'</p></div><div class="alm-audit-result-actions"><button type="button" class="alm-link-button" id="alm-audit-new">Regresar</button><button type="button" id="alm-audit-print">Imprimir / Guardar PDF</button></div></section><section class="alm-kpi-grid">'+kpi('Renglones correctos','✅',number(metrics.exact,0)+' / '+number(metrics.total,0),number(metrics.matchPercent,1)+'% coincidencia','green')+kpi('Piezas esperadas','📦',number(metrics.expectedPieces,2),'Fotografía del cierre','blue')+kpi('Piezas encontradas','🔎',number(metrics.foundPieces,2),(metrics.pieceDifference>0?'+':'')+number(metrics.pieceDifference,2)+' diferencia','amber')+kpi('Impacto valor','💰',money(metrics.valueDifference),metrics.valued+' artículos con valor comparable','purple')+'</section><section class="alm-card alm-table-card"><div class="alm-section-head"><div><h2>Detalle del contraste</h2><p>Resultado persistido en almacen_auditoria. El cierre Excel original permanece sin cambios.</p></div>'+statusPill('Persistido','ok')+'</div>'+renderTable(['Artículo','Código','Esperado','Encontrado','Diferencia','Valor esperado','Dif. valor','Estado'],rows,980)+'</section>');
  }

  function renderAudit(){
    if(state.audit.view==='capture')return renderAuditCapture();
    if(state.audit.view==='result')return renderAuditResult();
    return renderAuditSelect();
  }
  async function loadAudit(view){
    view.innerHTML=shell('almacen-auditoria',loading('Consultando cierre y auditorías...'));
    try{
      if(state.audit.view==='select'||!state.audit.catalogs){
        const responses=await Promise.all([
          get('/api/almacen/auditoria/catalogos',{force:true}),
          get('/api/almacen/auditoria/historico',{force:true})
        ]);
        state.audit.catalogs=responses[0];
        state.audit.history=responses[1].rows||[];
        state.source=state.audit.catalogs.source||state.source;
      }
      view.innerHTML=renderAudit(); bindAudit(view);
    }catch(error){view.innerHTML=shell('almacen-auditoria',errorBlock(error.message));}
  }
  async function generateAuditSample(view){
    if(!state.audit.selectedCompany||!state.audit.selectedWarehouse)return;
    const lot=selectedSourceLot()||(state.source&&state.source.loteImportacion)||'';
    if(!lot){view.innerHTML=shell('almacen-auditoria',errorBlock('Selecciona un cierre antes de iniciar la auditoría.'));return;}
    view.innerHTML=shell('almacen-auditoria',loading('Creando auditoría y fotografiando el cierre seleccionado...'));
    try{
      const data=await sendJson('/api/almacen/auditoria','POST',{loteImportacion:lot,company:state.audit.selectedCompany,warehouse:state.audit.selectedWarehouse});
      if(!data.audit)throw new Error('No se recibió la auditoría creada.');
      state.audit.session=auditFromApi(data.audit);
      state.audit.result=null; state.audit.view='capture'; state.audit.saveError='';
      if(window.ManttoHttp&&window.ManttoHttp.invalidate)window.ManttoHttp.invalidate('/api/almacen/auditoria');
      document.dispatchEvent(new CustomEvent('mantto:data-mutated',{detail:{path:'/api/almacen/auditoria',method:'POST',source:'almacen-auditoria'}}));
      view.innerHTML=renderAuditCapture(); bindAudit(view);
    }catch(error){view.innerHTML=shell('almacen-auditoria',errorBlock(error.message)+'<div class="alm-retry-row"><button type="button" id="alm-audit-retry">Volver a selección</button></div>'); const retry=view.querySelector('#alm-audit-retry');if(retry)retry.addEventListener('click',function(){state.audit.view='select';loadAudit(view);});}
  }

  async function persistAuditItem(view,index){
    const session=state.audit.session,item=session&&session.items&&session.items[index];
    if(!session||!item||!item.idAuditoria||String(session.status||'').toUpperCase()==='CERRADA')return;
    try{
      state.audit.saving=true;state.audit.saveError='';
      const data=await sendJson('/api/almacen/auditoria/'+encodeURIComponent(session.folioAuditoria)+'/items/'+encodeURIComponent(item.idAuditoria),'PATCH',{existenciaFisica:item.found,observaciones:item.observaciones||null});
      state.audit.session=auditFromApi(data.audit);state.audit.saving=false;
      if(window.ManttoHttp&&window.ManttoHttp.invalidate)window.ManttoHttp.invalidate('/api/almacen/auditoria');
      document.dispatchEvent(new CustomEvent('mantto:data-mutated',{detail:{path:'/api/almacen/auditoria/'+session.folioAuditoria,method:'PATCH',source:'almacen-auditoria'}}));
      view.innerHTML=renderAuditCapture();bindAudit(view);
    }catch(error){state.audit.saving=false;state.audit.saveError=error.message;view.innerHTML=renderAuditCapture();bindAudit(view);}
  }

  async function openAudit(view,folio){
    view.innerHTML=shell('almacen-auditoria',loading('Abriendo auditoría '+String(folio||'')+'...'));
    try{
      const data=await get('/api/almacen/auditoria/'+encodeURIComponent(folio),{force:true});
      const session=auditFromApi(data.audit);state.audit.session=session;state.audit.saveError='';
      if(String(data.audit.estatus||'').toUpperCase()==='CERRADA'){
        session.finishedAt=data.audit.fechaCierre;state.audit.result={session:session,metrics:auditMetrics(session),finishedAt:data.audit.fechaCierre};state.audit.view='result';
      }else{state.audit.result=null;state.audit.view='capture';}
      view.innerHTML=renderAudit();bindAudit(view);
    }catch(error){state.audit.view='select';view.innerHTML=shell('almacen-auditoria',errorBlock(error.message));}
  }
  function bindAudit(view){
    const company=view.querySelector('#alm-audit-company');if(company)company.addEventListener('change',function(){state.audit.company=company.value;state.audit.selectedCompany='';state.audit.selectedWarehouse='';view.innerHTML=renderAuditSelect();bindAudit(view);});
    const query=view.querySelector('#alm-audit-warehouse-query');if(query)query.addEventListener('input',debounce(function(){state.audit.warehouseQuery=query.value;view.innerHTML=renderAuditSelect();bindAudit(view);const fresh=view.querySelector('#alm-audit-warehouse-query');if(fresh){fresh.focus();fresh.setSelectionRange(fresh.value.length,fresh.value.length);}},250));
    view.querySelectorAll('[data-audit-company][data-audit-warehouse]').forEach(function(button){button.addEventListener('click',function(){state.audit.selectedCompany=button.dataset.auditCompany||'';state.audit.selectedWarehouse=button.dataset.auditWarehouse||'';view.innerHTML=renderAuditSelect();bindAudit(view);});});
    view.querySelectorAll('[data-audit-open]').forEach(function(button){button.addEventListener('click',function(){openAudit(view,button.dataset.auditOpen);});});
    const generate=view.querySelector('#alm-audit-generate');if(generate)generate.addEventListener('click',function(){generateAuditSample(view);});
    view.querySelectorAll('[data-audit-found]').forEach(function(input){input.addEventListener('input',function(){const idx=Number(input.dataset.auditFound);if(!state.audit.session||!state.audit.session.items[idx])return;state.audit.session.items[idx].found=input.value===''?null:Number(input.value);});input.addEventListener('change',function(){persistAuditItem(view,Number(input.dataset.auditFound));});});
    view.querySelectorAll('[data-audit-observations]').forEach(function(input){input.addEventListener('input',function(){const idx=Number(input.dataset.auditObservations);if(!state.audit.session||!state.audit.session.items[idx])return;state.audit.session.items[idx].observaciones=input.value||'';});input.addEventListener('change',function(){persistAuditItem(view,Number(input.dataset.auditObservations));});});
    view.querySelectorAll('[data-audit-ok]').forEach(function(button){button.addEventListener('click',function(){const idx=Number(button.dataset.auditOk);if(!state.audit.session||!state.audit.session.items[idx])return;state.audit.session.items[idx].found=Number(state.audit.session.items[idx].expected||0);persistAuditItem(view,idx);});});
    const cancel=view.querySelector('#alm-audit-cancel');if(cancel)cancel.addEventListener('click',function(){state.audit.session=null;state.audit.result=null;state.audit.view='select';loadAudit(view);});
    const finish=view.querySelector('#alm-audit-finish');if(finish)finish.addEventListener('click',function(){finalizeAudit(view);});
    const fresh=view.querySelector('#alm-audit-new');if(fresh)fresh.addEventListener('click',function(){state.audit.session=null;state.audit.result=null;state.audit.view='select';state.audit.selectedCompany='';state.audit.selectedWarehouse='';loadAudit(view);});
    const print=view.querySelector('#alm-audit-print');if(print)print.addEventListener('click',printAuditResult);
  }

  function printAuditResult(){
    const result=state.audit.result;if(!result)return;
    const s=result.session,m=result.metrics;
    const rows=s.items.map(function(item){const found=Number(item.found||0),diff=found-Number(item.expected||0),exact=Math.abs(diff)<1e-9;return '<tr><td>'+escapeHtml(item.article||'—')+'</td><td>'+escapeHtml(item.code||'—')+'</td><td>'+number(item.expected,2)+'</td><td>'+number(found,2)+'</td><td>'+(diff>0?'+':'')+number(diff,2)+'</td><td>'+(exact?'Correcto':'Diferencia')+'</td></tr>';}).join('');
    const html='<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Auditoría '+escapeHtml(s.warehouse)+'</title><style>body{font-family:Arial,sans-serif;color:#15315f;padding:28px}h1{margin:0 0 4px}p{color:#66758d}.notice{padding:10px 12px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;margin:16px 0;font-size:12px}table{width:100%;border-collapse:collapse;margin-top:18px}th,td{padding:8px;border-bottom:1px solid #e5e7eb;text-align:left;font-size:12px}th{background:#f8fafc}.metrics{display:flex;gap:12px;flex-wrap:wrap}.metric{border:1px solid #dbe4f0;border-radius:8px;padding:10px 14px}.metric b{display:block;font-size:18px}@media print{button{display:none}}</style></head><body><h1>Reporte de contraste de inventario</h1><p>'+escapeHtml(s.company)+' · '+escapeHtml(s.warehouse)+' · '+dateText(result.finishedAt)+'</p><div class="notice">Auditoría persistida en almacen_auditoria. Fuente esperada: cierre INVENTARIO seleccionado en Aiven. El histórico del cierre Excel permanece sin modificaciones.</div><div class="metrics"><div class="metric"><span>Renglones correctos</span><b>'+number(m.exact,0)+' / '+number(m.total,0)+'</b></div><div class="metric"><span>Piezas esperadas</span><b>'+number(m.expectedPieces,2)+'</b></div><div class="metric"><span>Piezas encontradas</span><b>'+number(m.foundPieces,2)+'</b></div><div class="metric"><span>Diferencia</span><b>'+(m.pieceDifference>0?'+':'')+number(m.pieceDifference,2)+'</b></div></div><table><thead><tr><th>Artículo</th><th>Código</th><th>Esperado</th><th>Encontrado</th><th>Diferencia</th><th>Estado</th></tr></thead><tbody>'+rows+'</tbody></table><p>Sesión: '+escapeHtml(s.sessionId||'')+' · Cierre: '+escapeHtml(s.loteImportacion||(state.source&&state.source.loteImportacion)||'')+'</p><button onclick="window.print()">Imprimir / Guardar PDF</button></body></html>';
    const popup=window.open('','_blank');if(!popup){alert('El navegador bloqueó la ventana de impresión.');return;}popup.document.open();popup.document.write(html);popup.document.close();
  }

  function renderPending(){ return ''; }

  function init(route){
    const view=document.getElementById('view-'+route);
    if(!ROUTES[route]||!view)return false;
    const seq=++state.requestSeq;
    view.dataset.almacenReady='f3-cierres-auditoria-v001';
    if(route==='almacen-dashboard') loadDashboard(view).catch(function(error){if(seq===state.requestSeq)view.innerHTML=shell(route,errorBlock(error.message));});
    else if(route==='almacen-inventario') loadInventario(view).catch(function(error){if(seq===state.requestSeq)view.innerHTML=shell(route,errorBlock(error.message));});
    else if(route==='almacen-stock') loadStock(view).catch(function(error){if(seq===state.requestSeq)view.innerHTML=shell(route,errorBlock(error.message));});
    else if(route==='almacen-prestamos') loadLoans(view).catch(function(error){if(seq===state.requestSeq)view.innerHTML=shell(route,errorBlock(error.message));});
    else if(route==='almacen-resguardos') loadGuards(view).catch(function(error){if(seq===state.requestSeq)view.innerHTML=shell(route,errorBlock(error.message));});
    else if(route==='almacen-auditoria') loadAudit(view).catch(function(error){if(seq===state.requestSeq)view.innerHTML=shell(route,errorBlock(error.message));});
    else view.innerHTML=renderPending(route);
    return true;
  }


  document.addEventListener('mantto:almacen-source-changed',function(){
    if(window.ManttoHttp&&window.ManttoHttp.invalidate)window.ManttoHttp.invalidate('/api/almacen');
    state.source=null;state.catalogs={companies:[],categories:[],warehouses:[]};state.dashboard=null;
    state.audit.catalogs=null;state.audit.history=[];state.audit.session=null;state.audit.result=null;state.audit.view='select';
  });

  document.addEventListener('mantto:data-mutated',function(event){
    const path=String(event&&event.detail&&event.detail.path||'');
    if(path.includes('/api/almacen')&&window.ManttoHttp&&window.ManttoHttp.invalidate)window.ManttoHttp.invalidate('/api/almacen');
  });

  window.ManttoAlmacen=Object.freeze({init:init});
})();

(function(){
  const MODULE_VERSION = '20260707-v004';
  const state = { loaded:false, rows:[], filtersLoaded:false };

  const MOV_INLINE_HTML = `
<div class="mov-page">
  <section class="mov-card mov-head">
    <div>
      <p class="mov-eyebrow">Aiven · Portafolio</p>
      <h1>Movimientos de Portafolio</h1>
      <p>Equipos cuyo estatus actual cambió contra el estatus registrado del último corte mensual.</p>
    </div>
    <div class="mov-head-actions">
      <span class="mov-status loading" id="mov-status"><span class="mov-dot"></span><span>Cargando Aiven...</span></span>
      <button type="button" class="mov-btn mov-btn-primary" data-mov-action="refresh">↻ Actualizar</button>
    </div>
  </section>

  <section class="mov-card mov-filters" aria-label="Filtros de Movimientos de Portafolio">
    <label>Zona<select id="mov-filter-zona"><option value="">Todas</option></select></label>
    <label>Tipo de movimiento<select id="mov-filter-tipo"><option value="">Todos</option><option value="DEGRADADO">Salida de servicio</option><option value="RECUPERADO">Regreso a servicio</option><option value="CAMBIO">Cambio operativo</option></select></label>
    <label>Buscar<input id="mov-filter-search" type="search" placeholder="Equipo, proyecto, supervisor..." /></label>
    <button type="button" class="mov-btn" data-mov-action="clear">Limpiar</button>
    <button type="button" class="mov-btn mov-btn-primary" data-mov-action="apply">Aplicar</button>
  </section>

  <section class="mov-grid mov-kpis" aria-label="Indicadores de movimientos">
    <article class="mov-kpi mov-kpi-blue" data-mov-detail="total"><i class="mov-led blue"></i><strong id="mov-kpi-total">—</strong><b>Movimientos</b><small>cambios detectados</small></article>
    <article class="mov-kpi mov-kpi-red" data-mov-detail="degradados"><i class="mov-led red"></i><strong id="mov-kpi-degradados">—</strong><b>Salidas de servicio</b><small>equipos detenidos</small></article>
    <article class="mov-kpi mov-kpi-green" data-mov-detail="recuperados"><i class="mov-led green"></i><strong id="mov-kpi-recuperados">—</strong><b>Regresos a servicio</b><small>equipos recuperados</small></article>
    <article class="mov-kpi mov-kpi-amber" data-mov-detail="cambios"><i class="mov-led amber"></i><strong id="mov-kpi-cambios">—</strong><b>Cambios operativos</b><small>estatus distinto</small></article>
  </section>

  <section class="mov-card mov-table-section">
    <div class="mov-section-head"><div><h2>Detalle de movimientos</h2><p id="mov-count">—</p></div><small id="mov-corte">Corte mensual: —</small></div>
    <div class="mov-table-wrap"><table class="mov-table"><thead><tr><th>Tipo</th><th>Código</th><th>Proyecto</th><th>Zona</th><th>Estatus anterior</th><th>Estatus actual</th><th>Supervisor</th><th>Fecha corte</th></tr></thead><tbody id="mov-body"><tr><td colspan="8" class="mov-empty">Cargando...</td></tr></tbody></table></div>
  </section>

  <section id="mov-detail-modal" class="mov-detail" hidden><div class="mov-detail-panel"><div class="mov-detail-head"><button type="button" id="mov-detail-close" aria-label="Cerrar">×</button><div><h2 id="mov-detail-title">Detalle</h2><p id="mov-detail-sub">Movimientos de Portafolio</p></div></div><div class="mov-detail-body" id="mov-detail-body"></div></div></section>
</div>`;

  function API(){ return (window.MANTTO_API_BASE || 'http://localhost:3001').replace(/\/$/, ''); }
  function $(id){ return document.getElementById(id); }
  function esc(v){ return String(v == null || v === '' ? '—' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function int(v){ const n = Number(v || 0); return Number.isFinite(n) ? n.toLocaleString('es-MX') : '0'; }
  function val(id){ const el=$(id); return el ? el.value.trim() : ''; }
  function qs(params){ const u = new URLSearchParams(); Object.entries(params || {}).forEach(([k,v])=>{ if(v !== undefined && v !== null && String(v).trim() !== '') u.set(k, v); }); return u.toString(); }
  function text(id, value){ const el=$(id); if(el) el.textContent = value; }

  async function fetchJson(path){
    const headers = Object.assign({ 'Accept':'application/json' }, window.ManttoAuth && window.ManttoAuth.authHeaders ? window.ManttoAuth.authHeaders() : {});
    const r = await fetch(API() + path, { headers, cache:'no-store' });
    const raw = await r.text();
    let data;
    try { data = raw ? JSON.parse(raw) : {}; }
    catch(e){ const err = new Error('Respuesta inválida del backend. Verifica API_BASE/Railway y que el endpoint responda JSON.'); err.invalidJson = true; err.raw = raw; throw err; }
    if(!r.ok || !data.ok) throw new Error(data.message || data.error || 'Error consultando backend');
    return data;
  }

  function first(row, keys){ for(const k of keys){ if(row && row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') return row[k]; } return null; }
  function normTxt(value){ return String(value == null ? '' : value).trim(); }
  function normStatus(value){ return normTxt(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  function isServicio(value){ const s = normStatus(value); return s === 'en servicio' || s === 'servicio'; }
  function isInactive(value){ const s = normStatus(value).toUpperCase(); return ['SI','SÍ','1','TRUE','INACTIVO'].includes(s); }
  function tipoMovimiento(prev, cur){ if(isServicio(prev) && !isServicio(cur)) return 'DEGRADADO'; if(!isServicio(prev) && isServicio(cur)) return 'RECUPERADO'; return 'CAMBIO'; }
  function tipoLabel(type){ const t=String(type||'').toUpperCase(); if(t==='DEGRADADO') return 'Salida de servicio'; if(t==='RECUPERADO') return 'Regreso a servicio'; return 'Cambio operativo'; }
  function fmtDate(value){
    if(!value) return '—';
    const s = String(value).trim();
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(iso) return iso[3] + '/' + iso[2] + '/' + iso[1];
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString('es-MX');
  }
  function fmtProjectName(value){
    const raw = String(value || '').trim();
    const m = raw.match(/^(\d+)-(\d{2})-(\d{2})(?:T.*)?$/);
    if(!m) return raw;
    const meses = {'01':'Enero','02':'Febrero','03':'Marzo','04':'Abril','05':'Mayo','06':'Junio','07':'Julio','08':'Agosto','09':'Septiembre','10':'Octubre','11':'Noviembre','12':'Diciembre'};
    const numero = String(Number(m[1]) || m[1].replace(/^0+/, '') || m[1]);
    return String(Number(m[3]) || m[3]) + ' de ' + (meses[m[2]] || m[2]) + ' #' + numero;
  }
  function proyectoCodigo(row){ return first(row, ['proyecto_codigo','proyecto','Proyecto','codigo_proyecto']); }
  function proyectoDisplay(row){ return fmtProjectName(first(row, ['proyecto_nombre','nombre_proyecto','proyecto_visual','Proyecto Visual','proyecto_cc_x_port','Proyecto CC x Port']) || proyectoCodigo(row)); }

  function mapPortafolioMovimiento(row){
    const anterior = first(row, ['estatus_anterior','estatus_ul_mes','Estatus UL Mes','Estatus_Ul_Mes']);
    const actual = first(row, ['estatus_actual','estatus_servicio','Estatus Servicio','Estatus_Servicio']);
    return {
      id_portafolio: first(row, ['id_portafolio','id','ID_SB']),
      numero_equipo: first(row, ['numero_equipo','Numero de Equipo','Numero_de_Equipo']),
      proyecto: proyectoCodigo(row),
      proyecto_nombre: proyectoDisplay(row),
      ciudad: first(row, ['ciudad','Ciudad']),
      estado: first(row, ['estado','Estado']),
      identificacion_sitio: first(row, ['identificacion_sitio','Identificacion en Sitio','Identificacion_en_Sitio']),
      zona: first(row, ['zona_operativa','zona','Z. Oper.','Zona Operativa','Zona_Operativa']),
      supervisor: first(row, ['supervisor_zona','supervisor','Supervisor Zona','Supervisor_Zona']),
      superintendente: first(row, ['superintendente','Superintendente']),
      estatus_anterior: anterior,
      estatus_actual: actual,
      fecha_corte: first(row, ['estatus_ul_mes_fecha','fecha_corte','Estatus UL Mes Fecha']),
      tipo_movimiento: first(row, ['tipo_movimiento']) || tipoMovimiento(anterior, actual),
      inactivo: first(row, ['inactivo','Inactivo']),
      estado_registro: first(row, ['estado_registro','Estado Registro'])
    };
  }

  async function fetchMovimientosFallback(){
    const data = await fetchJson('/api/portafolio');
    const rows = Array.isArray(data.data) ? data.data : [];
    const p = getParams();
    const zona = normTxt(p.zona).toLowerCase();
    const tipo = normTxt(p.tipo).toUpperCase();
    const search = normTxt(p.search).toLowerCase();

    let movs = rows.map(mapPortafolioMovimiento).filter(r=>{
      if(String(r.estado_registro || '1') !== '1') return false;
      if(isInactive(r.inactivo)) return false;
      if(!normTxt(r.estatus_anterior) || !normTxt(r.estatus_actual)) return false;
      if(normStatus(r.estatus_anterior) === normStatus(r.estatus_actual)) return false;
      if(zona && !normTxt(r.zona).toLowerCase().includes(zona)) return false;
      if(tipo && r.tipo_movimiento !== tipo) return false;
      if(search){ const hay = [r.numero_equipo,r.proyecto,r.proyecto_nombre,r.ciudad,r.estado,r.identificacion_sitio,r.supervisor,r.superintendente].map(normTxt).join(' ').toLowerCase(); if(!hay.includes(search)) return false; }
      return true;
    }).sort((a,b)=>String(a.tipo_movimiento).localeCompare(String(b.tipo_movimiento)) || String(a.zona||'').localeCompare(String(b.zona||'')) || String(a.proyecto||'').localeCompare(String(b.proyecto||'')) || String(a.numero_equipo||'').localeCompare(String(b.numero_equipo||''))).slice(0,1000);

    const kpis = movs.reduce((acc,r)=>{ acc.total += 1; if(r.tipo_movimiento === 'DEGRADADO') acc.degradados += 1; else if(r.tipo_movimiento === 'RECUPERADO') acc.recuperados += 1; else acc.cambios += 1; return acc; }, {total:0,degradados:0,recuperados:0,cambios:0});
    const zonas = [...new Set(rows.map(r=>first(r, ['zona_operativa','Z. Oper.','Zona Operativa','Zona_Operativa'])).filter(Boolean))].sort();
    const corte = movs.map(r=>r.fecha_corte).filter(Boolean).sort().pop() || null;
    return { ok:true, source:'aiven-portafolio-fallback', warning:'Movimientos calculados desde /api/portafolio.', kpis, corte, filters:{zonas}, data:movs };
  }

  function setStatus(type, msg){ const el=$('mov-status'); if(!el) return; el.className = 'mov-status ' + (type || 'loading'); el.innerHTML = '<span class="mov-dot"></span><span>' + esc(msg || 'Cargando...') + '</span>'; }

  async function loadHtml(){
    const view = $('view-movimientos');
    if(!view || state.loaded) return;
    let html = MOV_INLINE_HTML;
    try{ const r = await fetch('./modules/movimientos-portafolio/movimientos-portafolio.html?v=' + MODULE_VERSION, { cache:'no-store' }); if(r.ok){ const t = await r.text(); if(t && t.trim()) html = t; } }catch(e){}
    view.innerHTML = html;
    bind();
    state.loaded = true;
  }

  function bind(){
    document.querySelectorAll('[data-mov-action]').forEach(btn=>{ btn.addEventListener('click', ()=>{ const action = btn.dataset.movAction; if(action === 'refresh' || action === 'apply') refresh(); if(action === 'clear') clearFilters(); }); });
    ['mov-filter-zona','mov-filter-tipo'].forEach(id=>{ const el=$(id); if(el) el.addEventListener('change', refresh); });
    const search = $('mov-filter-search'); if(search) search.addEventListener('keydown', ev=>{ if(ev.key === 'Enter'){ ev.preventDefault(); refresh(); } });
    const close = $('mov-detail-close'); if(close) close.addEventListener('click', ()=>{ $('mov-detail-modal').hidden = true; });
    document.querySelectorAll('[data-mov-detail]').forEach(el=>el.addEventListener('click', ()=>openDetail(el.dataset.movDetail)));
  }

  function clearFilters(){ ['mov-filter-zona','mov-filter-tipo','mov-filter-search'].forEach(id=>{ const el=$(id); if(el) el.value=''; }); refresh(); }
  function fillZona(rows){ const el=$('mov-filter-zona'); if(!el || state.filtersLoaded) return; const zonas=[...new Set((rows || []).map(r=>r.zona).filter(Boolean))].sort(); el.innerHTML = '<option value="">Todas</option>' + zonas.map(z=>'<option value="'+esc(z)+'">'+esc(z)+'</option>').join(''); state.filtersLoaded = true; }
  function getParams(){ return { zona:val('mov-filter-zona'), tipo:val('mov-filter-tipo'), search:val('mov-filter-search') }; }

  async function refresh(){
    setStatus('loading', 'Consultando movimientos...');
    const body = $('mov-body'); if(body) body.innerHTML = '<tr><td colspan="8" class="mov-empty">Cargando movimientos...</td></tr>';
    try{
      let data;
      try { data = await fetchJson('/api/portafolio/movimientos?' + qs(getParams())); }
      catch(primaryError){ console.warn('[Movimientos] Endpoint /api/portafolio/movimientos no disponible, usando /api/portafolio:', primaryError.message); data = await fetchMovimientosFallback(); }
      state.rows = (data.data || []).map(mapPortafolioMovimiento);
      fillZona(data.filters?.zonas ? data.filters.zonas.map(z=>({ zona:z })) : state.rows);
      render(data);
      if(data.warning) setStatus('warn', data.warning); else setStatus('ok', 'Movimientos actualizados');
    }catch(e){ setStatus('error', e.message); renderError(e.message); }
  }

  function render(data){
    const k = data.kpis || {};
    text('mov-kpi-total', int(k.total)); text('mov-kpi-degradados', int(k.degradados)); text('mov-kpi-recuperados', int(k.recuperados)); text('mov-kpi-cambios', int(k.cambios));
    text('mov-count', int(state.rows.length) + ' movimientos'); text('mov-corte', 'Corte mensual: ' + fmtDate(data.corte));
    const body = $('mov-body'); if(!body) return;
    if(!state.rows.length){ body.innerHTML = '<tr><td colspan="8" class="mov-empty">' + esc(data.warning || 'Sin movimientos detectados con los filtros actuales') + '</td></tr>'; return; }
    body.innerHTML = state.rows.map((row, idx)=>{
      const tag = tagFor(row.tipo_movimiento);
      return '<tr class="mov-row" data-mov-idx="'+idx+'" data-codigo="'+esc(row.numero_equipo)+'">'
        + '<td><span class="mov-tag '+tag.cls+'"><i></i>'+esc(tipoLabel(row.tipo_movimiento))+'</span></td>'
        + '<td class="mov-code">'+esc(row.numero_equipo)+'</td>'
        + '<td><button type="button" class="mov-link" data-mov-proyecto="'+esc(row.proyecto)+'">'+esc(row.proyecto_nombre || row.proyecto)+'</button></td>'
        + '<td>'+esc(row.zona)+'</td>'
        + '<td>'+statusPill(row.estatus_anterior)+'</td>'
        + '<td>'+statusPill(row.estatus_actual)+'</td>'
        + '<td>'+esc(row.supervisor)+'</td>'
        + '<td>'+fmtDate(row.fecha_corte)+'</td>'
        + '</tr>';
    }).join('');
    bindTableRows(body);
  }

  function bindTableRows(root){
    root.querySelectorAll('tr[data-mov-idx]').forEach(tr=>tr.addEventListener('click', ev=>{ if(ev.target.closest('button')) return; openRow(state.rows[Number(tr.dataset.movIdx)]); }));
    root.querySelectorAll('[data-mov-proyecto]').forEach(btn=>btn.addEventListener('click', ev=>{ ev.stopPropagation(); const pro=btn.getAttribute('data-mov-proyecto'); if(window.ManttoDetails && window.ManttoDetails.openProyecto) window.ManttoDetails.openProyecto(pro); else openDetailModal('Proyecto', pro, '<div class="mov-empty">Detalle de proyecto no disponible</div>'); }));
  }

  function renderError(msg){ ['mov-kpi-total','mov-kpi-degradados','mov-kpi-recuperados','mov-kpi-cambios'].forEach(id=>text(id, '0')); text('mov-count', '0 movimientos'); const body=$('mov-body'); if(body) body.innerHTML = '<tr><td colspan="8" class="mov-empty">Error: '+esc(msg)+'</td></tr>'; }
  function tagFor(type){ const t=String(type||'').toUpperCase(); if(t==='DEGRADADO') return { cls:'red' }; if(t==='RECUPERADO') return { cls:'green' }; return { cls:'amber' }; }
  function filteredByType(type){ if(type === 'degradados') return state.rows.filter(r=>r.tipo_movimiento === 'DEGRADADO'); if(type === 'recuperados') return state.rows.filter(r=>r.tipo_movimiento === 'RECUPERADO'); if(type === 'cambios') return state.rows.filter(r=>r.tipo_movimiento === 'CAMBIO'); return state.rows; }
  function openDetailModal(title, sub, html){ const modal=$('mov-detail-modal'), body=$('mov-detail-body'); if(!modal || !body) return; text('mov-detail-title', title); text('mov-detail-sub', sub); body.innerHTML = html || ''; modal.hidden = false; }
  function closeDetailModal(){ const modal=$('mov-detail-modal'); if(modal) modal.hidden = true; }

  function openDetail(type){
    const rows = filteredByType(type);
    const labels = { total:'Todos los movimientos', degradados:'Salidas de servicio', recuperados:'Regresos a servicio', cambios:'Cambios operativos' };
    const html = rows.length ? '<div class="mov-table-wrap"><table class="mov-table"><thead><tr><th>Tipo</th><th>Código</th><th>Proyecto</th><th>Zona</th><th>Anterior</th><th>Actual</th><th>Fecha corte</th></tr></thead><tbody>' + rows.map((r, idx)=>{ const tag=tagFor(r.tipo_movimiento); return '<tr class="mov-row" data-mov-idx="'+state.rows.indexOf(r)+'"><td><span class="mov-tag '+tag.cls+'"><i></i>'+esc(tipoLabel(r.tipo_movimiento))+'</span></td><td class="mov-code">'+esc(r.numero_equipo)+'</td><td><button type="button" class="mov-link" data-mov-proyecto="'+esc(r.proyecto)+'">'+esc(r.proyecto_nombre || r.proyecto)+'</button></td><td>'+esc(r.zona)+'</td><td>'+statusPill(r.estatus_anterior)+'</td><td>'+statusPill(r.estatus_actual)+'</td><td>'+fmtDate(r.fecha_corte)+'</td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="mov-empty">Sin registros para este detalle</div>';
    openDetailModal(labels[type] || 'Movimientos', int(rows.length) + ' registros · Selecciona un renglón para ver proyecto, equipo y tickets', html);
    const body=$('mov-detail-body'); if(body) bindTableRows(body);
  }

  function grid(items){ return '<div class="mov-detail-grid">'+items.map(([k,v])=>'<div class="mov-field"><label>'+esc(k)+'</label><span>'+String(v == null || v === '' ? '—' : v)+'</span></div>').join('')+'</div>'; }
  function statusPill(value){ const ok=isServicio(value); return '<span class="mov-status-pill '+(ok?'ok':'bad')+'"><i></i>'+esc(value)+'</span>'; }
  function ticketTable(rows){
    if(!rows || !rows.length) return '<div class="mov-empty">Sin tickets relacionados al equipo</div>';
    return '<div class="mov-table-wrap"><table class="mov-table"><thead><tr><th>Ticket</th><th>Fecha</th><th>Estado</th><th>Proyecto</th><th>Equipo</th><th>Responsabilidad</th><th>Causa</th></tr></thead><tbody>' + rows.map(t=>'<tr><td><button type="button" class="mov-link" data-ticket="'+esc(t.ticket || t.n || '')+'">'+esc(t.ticket || t.n)+'</button></td><td>'+fmtDate(t.fecha_reporte || t.fr)+'</td><td>'+esc(t.estado_ticket || t.estado || t.et)+'</td><td><button type="button" class="mov-link" data-mov-proyecto="'+esc(t.proyecto || t.pro || '')+'">'+esc(t.proyecto || t.pro)+'</button></td><td><button type="button" class="mov-link" data-equipo="'+esc(t.codigo_equipo || t.cod || '')+'">'+esc(t.codigo_equipo || t.cod)+'</button></td><td>'+esc(t.responsabilidad || t.res)+'</td><td>'+esc(t.causa_falla || t.causa || t.caf)+'</td></tr>').join('') + '</tbody></table></div>';
  }

  async function openRow(row){
    if(!row || !row.numero_equipo) return;
    if(window.ManttoDetails && typeof window.ManttoDetails.openEquipoCritico === 'function'){
      closeDetailModal();
      return window.ManttoDetails.openEquipoCritico(row.numero_equipo, { dias: 3650 });
    }
    openDetailModal('Movimiento · ' + (row.numero_equipo || 'Equipo'), (fmtProjectName(row.proyecto_nombre || row.proyecto) || 'Movimientos de Portafolio'), '<div class="mov-empty">Cargando detalle combinado...</div>');
    try{
      const data = await fetchJson('/api/portafolio/movimientos/' + encodeURIComponent(row.numero_equipo) + '/detalle');
      const d = data.data || {};
      const e = d.equipo || {};
      const p = d.proyecto || {};
      const tks = d.tickets || [];
      const equipoCodigo = e.numero_equipo || row.numero_equipo;
      const proyectoCodigo = e.proyecto_codigo || e.proyecto || row.proyecto;
      const proyectoNombre = fmtProjectName(e.proyecto_nombre || row.proyecto_nombre || e.proyecto || row.proyecto);
      const html =
        '<section class="mov-detail-section"><h3><span>1</span>Detalle del Proyecto</h3>' + grid([
          ['Proyecto','<button type="button" class="mov-link" data-mov-proyecto="'+esc(proyectoCodigo)+'">'+esc(proyectoNombre)+'</button>'],
          ['Ciudad', p.ciudad || e.ciudad || row.ciudad], ['Estado', p.estado || e.estado || row.estado], ['Zona', p.zona || e.zona || row.zona], ['Supervisor', p.supervisor || e.supervisor || row.supervisor], ['Superintendente', p.superintendente || e.superintendente || row.superintendente], ['Equipos', p.equipos], ['En servicio', p.en_servicio], ['No en servicio', p.no_en_servicio]
        ]) + '</section>' +
        '<section class="mov-detail-section"><h3><span>2</span>Detalle del Equipo</h3>' + grid([
          ['Código','<button type="button" class="mov-link" data-equipo="'+esc(equipoCodigo)+'">'+esc(equipoCodigo)+'</button>'], ['ID portafolio', e.id_portafolio || row.id_portafolio], ['ID Equipo NS', e.id_equipo_ns], ['Identificación sitio', e.identificacion_sitio || row.identificacion_sitio], ['Estatus anterior', statusPill(e.estatus_ul_mes || row.estatus_anterior)], ['Estatus actual', statusPill(e.estatus_servicio || row.estatus_actual)], ['Movimiento', '<span class="mov-tag '+tagFor(row.tipo_movimiento).cls+'"><i></i>'+esc(tipoLabel(row.tipo_movimiento))+'</span>'], ['Fecha corte', fmtDate(e.estatus_ul_mes_fecha || row.fecha_corte)], ['Contrato', e.contrato], ['Operativo', e.estado_operativo], ['Fecha instalación', e.fecha_instalacion], ['Fecha entrega', e.fecha_entrega], ['Término garantía', e.termino_garantia], ['Dirección', e.direccion]
        ]) + '</section>' +
        '<section class="mov-detail-section"><h3><span>3</span>Tickets relacionados al equipo</h3>' + ticketTable(tks) + '</section>';
      openDetailModal('Movimiento · ' + equipoCodigo, (tks.length || 0) + ' tickets relacionados', html);
      bindDetailLinks();
    }catch(e){
      if(window.ManttoDetails && window.ManttoDetails.openEquipoCritico) return window.ManttoDetails.openEquipoCritico(row.numero_equipo, { dias:3650 });
      openDetailModal('Movimiento · ' + row.numero_equipo, (row.proyecto_nombre || row.proyecto) || 'Movimientos de Portafolio', '<div class="mov-empty">Error: '+esc(e.message)+'</div>');
    }
  }

  function bindDetailLinks(){
    const body=$('mov-detail-body'); if(!body) return;
    body.querySelectorAll('[data-mov-proyecto]').forEach(btn=>btn.addEventListener('click', ev=>{ ev.preventDefault(); ev.stopPropagation(); const pro=btn.getAttribute('data-mov-proyecto'); if(window.ManttoDetails && window.ManttoDetails.openProyecto) window.ManttoDetails.openProyecto(pro); }));
    body.querySelectorAll('[data-equipo]').forEach(btn=>btn.addEventListener('click', ev=>{ ev.preventDefault(); ev.stopPropagation(); const cod=btn.getAttribute('data-equipo'); if(window.ManttoDetails && window.ManttoDetails.openEquipo) window.ManttoDetails.openEquipo(cod); }));
    body.querySelectorAll('[data-ticket]').forEach(btn=>btn.addEventListener('click', ev=>{ ev.preventDefault(); ev.stopPropagation(); const t=btn.getAttribute('data-ticket'); if(window.ManttoResumenDia && window.ManttoResumenDia.openTicket) window.ManttoResumenDia.openTicket(t); else if(window.ManttoDetails && window.ManttoDetails.show) window.ManttoDetails.show('Ticket', t, '<div class="mg-empty">Ticket: '+esc(t)+'</div>'); }));
  }

  async function init(){ await loadHtml(); await refresh(); }
  window.ManttoMovimientosPortafolio = { init, refresh, openRow };
})();

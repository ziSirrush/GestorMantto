(function(){
  const API = () => (window.MANTTO_API_BASE || 'http://localhost:3001').replace(/\/$/, '');
  const state = {
    loaded:false,
    eq:{ page:1, pageSize:25, total:0, rows:[], lastCriteria:null, expandedCode:'', expandedTickets:[], expanding:false },
    pro:{ page:1, pageSize:25, total:0, rows:[], lastCriteria:null },
    u365:{ rows:[], expanded:false },
    detail:{ title:'Detalle', rows:[] },
    preferences:{ fallas:3, periodo:35, loaded:false, saving:false }
  };
  const EC_INLINE_HTML = "<div class=\"ec-page\">\n  <section class=\"ec-head card\">\n    <div>\n      <p class=\"ec-eyebrow\">Módulo en pruebas</p>\n      <h1>Equipos Críticos</h1>\n      <p>Consulta equipos y proyectos con reincidencia de fallas con responsabilidad BLT. El criterio de Equipos es personal por usuario y también gobierna el emoji de criticidad en los demás módulos.</p>\n    </div>\n    <button type=\"button\" class=\"ec-btn ec-btn-soft\" data-ec-action=\"refresh-all\">↻ Actualizar todo</button>\n  </section>\n\n  <section class=\"ec-panel card\" aria-label=\"Equipos críticos\">\n    <div class=\"ec-panel-head\">\n      <div>\n        <h2>Equipos Críticos</h2>\n        <small id=\"ec-eq-count\">Sin cargar</small>\n      </div>\n      <div class=\"ec-actions\">\n        <button type=\"button\" class=\"ec-btn\" data-ec-action=\"clear-equipos\">Limpiar filtros</button>\n        <button type=\"button\" class=\"ec-btn ec-btn-danger\" data-ec-action=\"pdf-equipos\">PDF Equipos</button>\n      </div>\n    </div>\n\n    <div class=\"ec-filters\">\n      <label>Fallas BLT mín.<input type=\"number\" id=\"ec-eq-min\" min=\"1\" value=\"3\" /></label>\n      <label>Días<input type=\"number\" id=\"ec-eq-dias\" min=\"1\" value=\"35\" /></label>\n      <label>Zona<input type=\"text\" id=\"ec-eq-zona\" placeholder=\"Ej. NOR\" /></label>\n      <label>Proyecto<input type=\"text\" id=\"ec-eq-proyecto\" placeholder=\"Proyecto\" /></label>\n      <label>Buscar<input type=\"search\" id=\"ec-eq-search\" placeholder=\"Equipo, ticket, ref.\" /></label>\n      <button type=\"button\" class=\"ec-btn ec-btn-primary\" data-ec-action=\"load-equipos\" id=\"ec-eq-apply\">Aplicar y guardar</button>\n    </div>\n\n    <div class=\"ec-note\">Criterio personal activo: <b id=\"ec-eq-criteria\">3 fallas BLT en 35 días</b>. Se guarda en el usuario y gobierna qué equipos reciben 💥 en el Gestor. El MTBC se calcula únicamente con RESP BLT: (días transcurridos × equipos considerados) ÷ fallas BLT. Año Actual usa los días transcurridos desde el 1 de enero; U365 usa 365 días.</div>\n\n    <div class=\"estado-leyenda-host-gnral\" data-estados-leyenda=\"CRITICO,ATRAPADO,FILTRACION,VOLTAJE,NO_FUNCIONANDO,FUERA_SLA\" data-estados-excluir=\"CRITICO\"></div>\n    <div class=\"ec-table-wrap\">\n      <table class=\"ec-table\">\n        <thead><tr><th>Zona</th><th>Proyecto</th><th>Código</th><th>Ref. sitio</th><th>Estatus</th><th>Calls año</th><th>Fallas BLT período</th><th>BLT fuera del período</th><th>Último BLT</th><th>Resp. Cliente período</th><th>Cliente fuera del período</th><th>Último Cliente</th><th title='(Días transcurridos desde el 1 de enero × equipos considerados) ÷ fallas BLT del año'>MTBC Año Actual</th><th title='(365 × equipos considerados) ÷ fallas BLT de los últimos 365 días'>MTBC U365</th><th></th></tr></thead>\n        <tbody id=\"ec-eq-body\"><tr><td colspan=\"15\" class=\"ec-empty\">Cargando...</td></tr></tbody>\n      </table>\n    </div>\n    <div class=\"ec-pagination\"><button type=\"button\" id=\"ec-eq-prev\">← Anterior</button><span id=\"ec-eq-page\">—</span><button type=\"button\" id=\"ec-eq-next\">Siguiente →</button></div>\n  </section>\n\n  <section class=\"ec-panel card ec-collapsible is-collapsed\" id=\"ec-365-panel\" aria-label=\"Equipos críticos últimos 365 días\">\n    <div class=\"ec-panel-head ec-collapsible-head\">\n      <div><h2>Equipos críticos · últimos 365 días</h2><small id=\"ec-365-count\">Sin cargar</small></div>\n      <button type=\"button\" class=\"ec-btn ec-btn-soft ec-toggle\" data-ec-action=\"toggle-u365\" id=\"ec-365-toggle\" aria-expanded=\"false\" aria-controls=\"ec-365-content\">▼ Expandir</button>\n    </div>\n    <div id=\"ec-365-content\" class=\"ec-collapsible-content\" hidden>\n      <div class=\"ec-note\">Criterio corporativo móvil: <b>3 o más RESP BLT en los últimos 365 días</b>. Se actualiza diariamente con la fecha actual.</div>\n      <div class=\"ec-table-wrap\"><table class=\"ec-table\"><thead><tr><th>Zona</th><th>Proyecto</th><th>Código</th><th>Ref. sitio</th><th>Estatus</th><th>Llamadas 365d</th><th>Fallas BLT 365d</th><th>Último BLT</th><th>Crítico año actual</th><th title='(Días transcurridos desde el 1 de enero × equipos considerados) ÷ fallas BLT del año'>MTBC Año Actual</th><th title='(365 × equipos considerados) ÷ fallas BLT de los últimos 365 días'>MTBC U365</th></tr></thead><tbody id=\"ec-365-body\"><tr><td colspan=\"11\" class=\"ec-empty\">Cargando...</td></tr></tbody></table></div>\n    </div>\n  </section>\n\n  <section class=\"ec-panel card\" aria-label=\"Proyectos críticos\">\n    <div class=\"ec-panel-head\">\n      <div>\n        <h2>Proyectos Críticos</h2>\n        <small id=\"ec-pro-count\">Sin cargar</small>\n      </div>\n      <div class=\"ec-actions\">\n        <button type=\"button\" class=\"ec-btn\" data-ec-action=\"clear-proyectos\">Limpiar filtros</button>\n        <button type=\"button\" class=\"ec-btn ec-btn-danger\" data-ec-action=\"pdf-proyectos\">PDF Proyectos</button>\n      </div>\n    </div>\n\n    <div class=\"ec-filters\">\n      <label>Fallas BLT mín.<input type=\"number\" id=\"ec-pro-min\" min=\"1\" value=\"5\" /></label>\n      <label>Días<input type=\"number\" id=\"ec-pro-dias\" min=\"1\" value=\"35\" /></label>\n      <label>Fallas por equipo<input type=\"number\" id=\"ec-pro-min-equipo\" min=\"1\" value=\"3\" /></label>\n      <label>Zona<input type=\"text\" id=\"ec-pro-zona\" placeholder=\"Ej. CNA\" /></label>\n      <label>Proyecto<input type=\"text\" id=\"ec-pro-proyecto\" placeholder=\"Proyecto\" /></label>\n      <button type=\"button\" class=\"ec-btn ec-btn-primary\" data-ec-action=\"load-proyectos\">Aplicar</button>\n    </div>\n\n    <div class=\"ec-note\">Criterio actual de esta tabla: <b id=\"ec-pro-criteria\">5 fallas BLT en 35 días</b>. La regla de equipos críticos dentro del proyecto usa su propio mínimo. El MTBC de proyecto usa: (días transcurridos × equipos activos en servicio) ÷ fallas BLT. Año Actual usa los días transcurridos desde el 1 de enero; U365 usa 365 días.</div>\n\n    <div class=\"estado-leyenda-host-gnral\" data-estados-leyenda=\"CRITICO,ATRAPADO,FILTRACION,VOLTAJE,NO_FUNCIONANDO,FUERA_SLA\" data-estados-excluir=\"CRITICO\"></div>\n    <div class=\"ec-table-wrap\">\n      <table class=\"ec-table\">\n        <thead><tr><th>Zona</th><th>Proyecto</th><th>Ciudad</th><th>Supervisor</th><th>Equipos activos</th><th>Fallas BLT período</th><th>Equipos con falla</th><th>Equipos críticos</th><th>Último BLT</th><th title='(Días transcurridos desde el 1 de enero × equipos considerados) ÷ fallas BLT del año'>MTBC Año Actual</th><th title='(365 × equipos considerados) ÷ fallas BLT de los últimos 365 días'>MTBC U365</th><th></th></tr></thead>\n        <tbody id=\"ec-pro-body\"><tr><td colspan=\"12\" class=\"ec-empty\">Cargando...</td></tr></tbody>\n      </table>\n    </div>\n    <div class=\"ec-pagination\"><button type=\"button\" id=\"ec-pro-prev\">← Anterior</button><span id=\"ec-pro-page\">—</span><button type=\"button\" id=\"ec-pro-next\">Siguiente →</button></div>\n  </section>\n</div>\n\n<section id=\"ec-detail-modal\" class=\"ec-detail\" hidden>\n  <div class=\"ec-detail-panel\">\n    <div class=\"ec-detail-head\">\n      <button type=\"button\" id=\"ec-detail-close\">×</button>\n      <div><h2 id=\"ec-detail-title\">Detalle</h2><p id=\"ec-detail-sub\">Historial</p></div>\n      <button type=\"button\" class=\"ec-btn ec-btn-danger\" id=\"ec-detail-pdf\">PDF detalle</button>\n    </div>\n    <div class=\"ec-detail-body\">\n      <div class=\"estado-leyenda-host-gnral\" data-estados-leyenda=\"CRITICO,ATRAPADO,FILTRACION,VOLTAJE,NO_FUNCIONANDO,FUERA_SLA\" data-estados-excluir=\"CRITICO\"></div>\n      <div class=\"ec-table-wrap\"><table class=\"ec-table\"><thead><tr><th>Ticket</th><th>Fecha reporte</th><th>Estado</th><th>Proyecto</th><th>Equipo</th><th>Zona</th><th>Responsabilidad</th><th>Causa</th><th>T. llegada</th><th>T. solución</th></tr></thead><tbody id=\"ec-detail-body\"></tbody></table></div>\n    </div>\n  </div>\n</section>\n";

  function $(id){ return document.getElementById(id); }
  function esc(v){ return String(v == null || v === '' ? '—' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function date(v){ if(!v) return '—'; const d=new Date(v); return Number.isNaN(d.getTime()) ? esc(v) : d.toLocaleDateString('es-MX'); }
  function qs(params){ const u=new URLSearchParams(); Object.entries(params).forEach(([k,v])=>{ if(v!==undefined && v!==null && String(v).trim()!=='') u.set(k, v); }); return u.toString(); }
  function num(id, fallback){ const el=$(id); const n=parseInt(el && el.value,10); return Number.isNaN(n) ? fallback : n; }
  function val(id){ const el=$(id); return el ? el.value.trim() : ''; }
  function textMatch(value, needle){ return !needle || String(value || '').toLowerCase().includes(String(needle || '').toLowerCase()); }
  function pick(row, names){
    for(const name of names){
      if(row && Object.prototype.hasOwnProperty.call(row, name) && row[name] !== null && row[name] !== undefined && String(row[name]).trim() !== '') return row[name];
    }
    return '';
  }
  function ymd(v){
    if(!v) return '';
    const s = String(v).trim();
    if(/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
    if(/^\d{2}\/\d{2}\/\d{4}$/.test(s)){ const a=s.split('/'); return a[2]+'-'+a[1]+'-'+a[0]; }
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0,10);
  }
  function normalizeResp(v, causa){
    const raw = String(v || '').trim().toUpperCase();
    if(raw.includes('BLT')) return 'BLT';
    if(raw.includes('CLIENT')) return 'CLIENTE';
    const c = String(causa || '').trim().toUpperCase();
    if(c.includes('BLT') || c.includes('INHERENTE') || c.includes('EQUIPO')) return 'BLT';
    if(c.includes('CLIENT') || c.includes('OPERACION') || c.includes('OPERACIÓN') || c.includes('USUARIO')) return 'CLIENTE';
    return raw;
  }
  function normalizeTicket(row){
    const causa = pick(row, ['causa_falla','Causa_de_Falla','causa','Causa','caf']);
    return {
      ticket: String(pick(row, ['ticket','No_Ticket','folio','id_interno','ID_Interno','n','id']) || '').trim(),
      fecha_reporte: ymd(pick(row, ['fecha_reporte','F_Reporte','fr'])),
      estado_ticket: String(pick(row, ['estado_ticket','Estado_Ticket','estado','Estado','et']) || '').trim(),
      proyecto: String(pick(row, ['proyecto','Proyecto','pro']) || '').trim(),
      codigo_equipo: String(pick(row, ['codigo_equipo','Codigo_Equipo','equipo','cod']) || '').trim(),
      zona: String(pick(row, ['zona','zona_operativa','Zona_Operativa','zon']) || '').trim(),
      responsabilidad: normalizeResp(pick(row, ['responsabilidad','RESPONSABILID','res']), causa),
      causa_falla: String(causa || '').trim(),
      tiempo_llegada: pick(row, ['tiempo_llegada','Tiempo_Llegada','tll']),
      tiempo_solucion: pick(row, ['tiempo_solucion','Tiempo_Solucion','tso'])
    };
  }
  function normalizeEquipo(row){
    const inactivo = String(pick(row, ['inactivo','Inactivo']) || '').trim().toLowerCase();
    const estatus = String(pick(row, ['estatus_servicio','Estatus Servicio','estatus','estado_servicio']) || '').trim();
    const estadoRegistro = pick(row, ['estado_registro','estado']);
    const inactive = ['1','si','sí','true','inactivo','x'].includes(inactivo);
    const activeRegistro = estadoRegistro === '' || estadoRegistro == null || String(estadoRegistro) !== '0';
    return {
      codigo_equipo: String(pick(row, ['numero_equipo','Numero de Equipo','codigo_equipo','cod','equipo']) || '').trim(),
      proyecto: String(pick(row, ['proyecto','Proyecto','pro']) || '').trim(),
      ciudad: String(pick(row, ['ciudad','Ciudad']) || '').trim(),
      zona: String(pick(row, ['zona_operativa','Z. Oper.','zona','zon']) || '').trim(),
      supervisor: String(pick(row, ['supervisor_zona','Supervisor Zona','supervisor','sup']) || '').trim(),
      estatus_servicio: estatus,
      activo: activeRegistro && !inactive && estatus.toLowerCase() !== 'no en servicio'
    };
  }
  async function fetchRowsFromApi(paths){
    for(const path of paths){
      try{
        const data = await fetchJson(path);
        const rows = Array.isArray(data) ? data : (data.data || data.rows || data.tickets || data.equipos || []);
        if(Array.isArray(rows)) return rows;
      }catch(e){}
    }
    return [];
  }
  async function fetchTicketsForCriticalProjects(){
    const rows = await fetchRowsFromApi(['/api/tickets?limit=20000','/api/tickets']);
    return rows.map(normalizeTicket).filter(t=>t.ticket && t.fecha_reporte && t.proyecto);
  }
  async function fetchPortafolioForCriticalProjects(){
    const rows = await fetchRowsFromApi(['/api/portafolio/equipos?page=1&page_size=20000','/api/portafolio?limit=20000','/api/portafolio']);
    return rows.map(normalizeEquipo).filter(e=>e.codigo_equipo || e.proyecto);
  }

  function formatProyectoName(value){
    if (window.ManttoProyectos && typeof window.ManttoProyectos.formatProyectoName === 'function') {
      try { return window.ManttoProyectos.formatProyectoName(value); } catch (e) {}
    }
    if (typeof window.formatProyectoName === 'function') {
      try { return window.formatProyectoName(value); } catch (e) {}
    }
    const raw = String(value == null ? '' : value).trim();
    if (!raw) return '—';
    const m = raw.match(/^(\d{1,4})-(\d{1,2})-(\d{1,4})$/);
    if (!m) return raw;
    const num = String(Number(m[1]));
    const month = String(Number(m[2])).padStart(2, '0');
    const tail = String(Number(m[3]));
    const MONTH_NAMES = {
      '01':'Enero','02':'Febrero','03':'Marzo','04':'Abril','05':'Mayo','06':'Junio',
      '07':'Julio','08':'Agosto','09':'Septiembre','10':'Octubre','11':'Noviembre','12':'Diciembre'
    };
    const monthName = MONTH_NAMES[month];
    return monthName ? `${tail} de ${monthName} #${num}` : raw;
  }

  async function requestJson(path, options){
    const opts = Object.assign({ method:'GET' }, options || {});
    if(window.ManttoAuth && typeof window.ManttoAuth.api === 'function') return window.ManttoAuth.api(path, opts);
    const headers = Object.assign({ 'Accept':'application/json', 'Content-Type':'application/json' }, opts.headers || {});
    if(window.ManttoAuth && typeof window.ManttoAuth.authHeaders === 'function') Object.assign(headers, window.ManttoAuth.authHeaders());
    const r = await fetch(API()+path, Object.assign({}, opts, { headers }));
    const data = await r.json().catch(()=>({ ok:false, message:'Respuesta invalida del backend' }));
    if(!r.ok || !data.ok) throw new Error(data.message || data.error || 'Error consultando backend');
    return data;
  }
  async function fetchJson(path){ return requestJson(path, { method:'GET' }); }

  function positivePreference(value, fallback){
    const n = Number.parseInt(value, 10);
    return Number.isInteger(n) && n > 0 ? n : fallback;
  }
  function updateCachedUserPreferences(fallas, periodo){
    const user = window.ManttoAuth && typeof window.ManttoAuth.getUser === 'function' ? window.ManttoAuth.getUser() : null;
    if(user){
      user.criticos_fallas = fallas;
      user.criticos_periodo = periodo;
      try{ localStorage.setItem('mantto_user', JSON.stringify(user)); }catch(e){}
    }
  }
  function applyPreferencesToInputs(){
    if($('ec-eq-min')) $('ec-eq-min').value = state.preferences.fallas;
    if($('ec-eq-dias')) $('ec-eq-dias').value = state.preferences.periodo;
  }
  async function loadUserPreferences(){
    let fallas = 3;
    let periodo = 35;
    try{
      const data = await fetchJson('/api/usuarios/me/criticos-preferencias');
      fallas = positivePreference(data.data && data.data.criticos_fallas, 3);
      periodo = positivePreference(data.data && data.data.criticos_periodo, 35);
    }catch(error){
      const user = window.ManttoAuth && typeof window.ManttoAuth.getUser === 'function' ? window.ManttoAuth.getUser() : null;
      fallas = positivePreference(user && user.criticos_fallas, 3);
      periodo = positivePreference(user && user.criticos_periodo, 35);
      console.warn('[Equipos Criticos] Preferencias no disponibles; se usan valores de sesión/default.', error);
    }
    state.preferences = { fallas, periodo, loaded:true, saving:false };
    applyPreferencesToInputs();
    updateCachedUserPreferences(fallas, periodo);
  }
  async function saveUserPreferences(){
    const fallas = num('ec-eq-min', state.preferences.fallas || 3);
    const periodo = num('ec-eq-dias', state.preferences.periodo || 35);
    if(fallas < 1 || periodo < 1) throw new Error('Fallas y período deben ser mayores a cero.');
    const button = $('ec-eq-apply');
    state.preferences.saving = true;
    if(button){ button.disabled = true; button.textContent = 'Guardando...'; }
    try{
      const data = await requestJson('/api/usuarios/me/criticos-preferencias', { method:'PATCH', body:JSON.stringify({ criticos_fallas:fallas, criticos_periodo:periodo }) });
      const savedFallas = positivePreference(data.data && data.data.criticos_fallas, fallas);
      const savedPeriodo = positivePreference(data.data && data.data.criticos_periodo, periodo);
      state.preferences = { fallas:savedFallas, periodo:savedPeriodo, loaded:true, saving:false };
      applyPreferencesToInputs();
      updateCachedUserPreferences(savedFallas, savedPeriodo);
      document.dispatchEvent(new CustomEvent('mantto:criticos-preferencias-updated', { detail:{ criticos_fallas:savedFallas, criticos_periodo:savedPeriodo } }));
      return state.preferences;
    }finally{
      state.preferences.saving = false;
      if(button){ button.disabled = false; button.textContent = 'Aplicar y guardar'; }
    }
  }
  async function applyEquipoCriteria(){
    const count = $('ec-eq-count');
    if(count) count.textContent = 'Guardando criterio personal...';
    try{
      await saveUserPreferences();
      await loadEquipos(1);
    }catch(error){
      if(count) count.textContent = 'No se pudo guardar el criterio';
      const body = $('ec-eq-body');
      if(body) body.innerHTML = '<tr><td colspan="15" class="ec-empty">Error: '+esc(error.message)+'</td></tr>';
    }
  }

  async function loadHtml(){
    const view=$('view-criticos');
    if(!view || state.loaded) return;
    let html = EC_INLINE_HTML;
    try{
      const r = await fetch('./modules/equipos-criticos/equipos-criticos.html?v=20260717-fix4', { cache:'no-store' });
      if(r.ok){
        const fetched = await r.text();
        if(fetched && fetched.trim()) html = fetched;
      }
    }catch(e){
      // Fallback interno para evitar vista vacia si falla la ruta del HTML modular.
    }
    view.innerHTML = html;
    bind();
    toggleU365(false);
    state.loaded=true;
  }

  function bind(){
    document.querySelectorAll('[data-ec-action]').forEach(btn=>{
      btn.addEventListener('click',()=>{
        const a=btn.dataset.ecAction;
        if(a==='refresh-all'){ applyEquipoCriteria().then(()=>Promise.all([loadProyectos(1), loadU365()])); }
        if(a==='toggle-u365') toggleU365();
        if(a==='load-equipos') applyEquipoCriteria();
        if(a==='load-proyectos') loadProyectos(1);
        if(a==='clear-equipos') { ['ec-eq-zona','ec-eq-proyecto','ec-eq-search'].forEach(id=>$(id).value=''); applyPreferencesToInputs(); loadEquipos(1); }
        if(a==='clear-proyectos') { ['ec-pro-zona','ec-pro-proyecto'].forEach(id=>$(id).value=''); $('ec-pro-min').value=5; $('ec-pro-dias').value=35; $('ec-pro-min-equipo').value=3; loadProyectos(1); }
        if(a==='pdf-equipos') exportTablePdf('equipos');
        if(a==='pdf-proyectos') exportTablePdf('proyectos');
      });
    });
    $('ec-eq-prev').addEventListener('click',()=>loadEquipos(state.eq.page-1));
    $('ec-eq-next').addEventListener('click',()=>loadEquipos(state.eq.page+1));
    $('ec-pro-prev').addEventListener('click',()=>loadProyectos(state.pro.page-1));
    $('ec-pro-next').addEventListener('click',()=>loadProyectos(state.pro.page+1));
    $('ec-detail-close').addEventListener('click',()=>{ $('ec-detail-modal').hidden=true; });
    $('ec-detail-pdf').addEventListener('click',()=>exportDetailPdf());
    ['ec-eq-min','ec-eq-dias','ec-eq-search','ec-eq-zona','ec-eq-proyecto','ec-pro-zona','ec-pro-proyecto'].forEach(id=>{
      const el=$(id); if(el) el.addEventListener('keydown', ev=>{ if(ev.key==='Enter') { ev.preventDefault(); id.startsWith('ec-eq') ? applyEquipoCriteria() : loadProyectos(1); } });
    });
  }

  function eqCriteria(){
    return { min_fallas:num('ec-eq-min',3), dias:num('ec-eq-dias',35), zona:val('ec-eq-zona'), proyecto:val('ec-eq-proyecto'), search:val('ec-eq-search'), page_size:state.eq.pageSize };
  }
  function proCriteria(){
    return { min_fallas:num('ec-pro-min',5), dias:num('ec-pro-dias',35), min_fallas_equipo:num('ec-pro-min-equipo',3), zona:val('ec-pro-zona'), proyecto:val('ec-pro-proyecto'), page_size:state.pro.pageSize };
  }

  async function loadEquipos(page){
    state.eq.page=Math.max(1,page||1);
    state.eq.expandedCode='';
    state.eq.expandedTickets=[];
    state.eq.expanding=false;
    const body=$('ec-eq-body'); if(body) body.innerHTML='<tr><td colspan="15" class="ec-empty">Cargando equipos críticos...</td></tr>';
    const c=eqCriteria(); c.page=state.eq.page; state.eq.lastCriteria=c;
    $('ec-eq-criteria').textContent=`${c.min_fallas} fallas BLT en ${c.dias} días`;
    try{
      const data=await fetchJson('/api/equipos-criticos?'+qs(c));
      state.eq.rows=data.data||[]; state.eq.total=data.pagination?.total||0; state.eq.page=data.pagination?.page||state.eq.page;
      renderEquipos();
    }catch(e){ body.innerHTML='<tr><td colspan="15" class="ec-empty">Error: '+esc(e.message)+'</td></tr>'; }
  }

  function visualIdentifier(codes,text){ return window.EstadosVisuales_gnral ? window.EstadosVisuales_gnral.renderIdentifier(codes,text) : esc(text); }
  function fmtMtbc(value){ const n=Number(value); return value===null || value===undefined || value==='' || Number.isNaN(n) || n < 0 ? 'N/A' : esc(n.toFixed(2))+' d'; }
  function renderEquipoTicketRows(){
    if(state.eq.expanding){
      return '<tr><td colspan="10" class="ec-empty">Cargando tickets que originaron la criticidad...</td></tr>';
    }
    if(!state.eq.expandedTickets.length){
      return '<tr><td colspan="10" class="ec-empty">No se encontraron tickets BLT dentro del período.</td></tr>';
    }
    return state.eq.expandedTickets.map(t=>`<tr>
      <td class="ec-code"><button class="ec-link" type="button" data-ticket="${esc(t.ticket)}">${esc(t.ticket)}</button></td>
      <td>${date(t.fecha_reporte)}</td><td>${esc(t.estado_ticket||t.estado)}</td><td>${esc(t.responsabilidad)}</td>
      <td>${esc(t.causa_falla||t.causa)}</td><td>${esc(t.parte)}</td><td>${esc(t.procedencia)}</td>
      <td>${esc(t.tiempo_llegada)}</td><td>${esc(t.tiempo_solucion)}</td><td>${esc(t.tecnico||t.atendido_por)}</td>
    </tr>`).join('');
  }

  function renderEquipoExpandedRow(codigo){
    if(state.eq.expandedCode !== String(codigo || '')) return '';
    return `<tr class="ec-expanded-row" data-ec-expanded-for="${esc(codigo)}"><td colspan="15">
      <div class="ec-expanded-box">
        <div class="ec-expanded-head"><div><b>Tickets que hicieron crítico al equipo ${esc(codigo)}</b><small>Solo fallas con responsabilidad BLT dentro del período seleccionado.</small></div><button type="button" class="ec-btn" data-ec-collapse="${esc(codigo)}">Cerrar</button></div>
        <div class="ec-table-wrap"><table class="ec-table ec-subtable"><thead><tr><th>Ticket</th><th>Fecha reporte</th><th>Estado</th><th>Responsabilidad</th><th>Causa</th><th>Parte</th><th>Procedencia</th><th>T. llegada</th><th>T. solución</th><th>Técnico</th></tr></thead><tbody>${renderEquipoTicketRows()}</tbody></table></div>
      </div>
    </td></tr>`;
  }

  async function toggleEquipoTickets(codigo){
    const normalized=String(codigo || '');
    if(!normalized) return;
    if(state.eq.expandedCode===normalized){
      state.eq.expandedCode=''; state.eq.expandedTickets=[]; state.eq.expanding=false; renderEquipos(); return;
    }
    state.eq.expandedCode=normalized; state.eq.expandedTickets=[]; state.eq.expanding=true; renderEquipos();
    const c=state.eq.lastCriteria || eqCriteria();
    try{
      const data=await fetchJson('/api/equipos-criticos/'+encodeURIComponent(normalized)+'/tickets?'+qs({dias:c.dias,responsabilidad:'BLT'}));
      if(state.eq.expandedCode!==normalized) return;
      state.eq.expandedTickets=Array.isArray(data.data)?data.data:[];
    }catch(error){
      if(state.eq.expandedCode!==normalized) return;
      state.eq.expandedTickets=[];
      console.error('[Equipos Criticos] No se pudieron cargar los tickets del equipo.', error);
    }finally{
      if(state.eq.expandedCode===normalized){ state.eq.expanding=false; renderEquipos(); }
    }
  }

  function renderEquipos(){
    const body=$('ec-eq-body');
    if(!state.eq.rows.length){ body.innerHTML='<tr><td colspan="15" class="ec-empty">Sin equipos críticos para este criterio</td></tr>'; }
    else body.innerHTML=state.eq.rows.map(r=>`<tr class="ec-click-row${state.eq.expandedCode===String(r.codigo_equipo||'')?' is-expanded':''}" data-ec-equipo="${esc(r.codigo_equipo)}" aria-expanded="${state.eq.expandedCode===String(r.codigo_equipo||'')?'true':'false'}">
      <td>${esc(r.zona)}</td><td><button class="ec-link" type="button" data-proyecto="${esc(r.proyecto)}">${visualIdentifier([],formatProyectoName(r.proyecto))}</button></td><td class="ec-code"><button class="ec-link" type="button" data-equipo="${esc(r.codigo_equipo)}">${visualIdentifier([],r.codigo_equipo)}</button></td><td>${esc(r.referencia_en_sitio)}</td><td>${esc(r.estatus_servicio)}</td>
      <td class="ec-num">${esc(r.calls_anio)}</td><td class="ec-num"><span class="ec-tag">${esc(r.fallas_blt_periodo)}</span></td><td class="ec-num">${esc(r.fallas_blt_fuera_periodo)}</td><td>${date(r.ultimo_blt)}</td>
      <td class="ec-num">${esc(r.resp_cliente_periodo)}</td><td class="ec-num">${esc(r.resp_cliente_fuera_periodo)}</td><td>${date(r.ultimo_cliente)}</td><td class="ec-num">${fmtMtbc(r.mtbc_anio)}</td><td class="ec-num">${fmtMtbc(r.mtbc_365)}</td>
      <td><button class="ec-btn" type="button" data-ec-view-equipo="${esc(r.codigo_equipo)}">Ver</button></td></tr>${renderEquipoExpandedRow(r.codigo_equipo)}`).join('');
    if(window.ManttoDetails && window.ManttoDetails.bindLinks) window.ManttoDetails.bindLinks(body);
    body.querySelectorAll('tr[data-ec-equipo]').forEach(tr=>tr.addEventListener('click', ev=>{
      if(ev.target.closest('button, a, input, select, textarea')) return;
      toggleEquipoTickets(tr.dataset.ecEquipo);
    }));
    body.querySelectorAll('[data-ec-view-equipo]').forEach(btn=>btn.addEventListener('click', ev=>{ ev.stopPropagation(); openEquipo(btn.dataset.ecViewEquipo); }));
    body.querySelectorAll('[data-ec-collapse]').forEach(btn=>btn.addEventListener('click', ev=>{ ev.stopPropagation(); toggleEquipoTickets(btn.dataset.ecCollapse); }));
    renderPage('eq','ec-eq');
    $('ec-eq-count').textContent=`${state.eq.total} equipos · mostrando ${state.eq.rows.length}`;
  }

  async function loadProyectos(page){
    state.pro.page=Math.max(1,page||1);
    const body=$('ec-pro-body'); if(body) body.innerHTML='<tr><td colspan="12" class="ec-empty">Calculando proyectos críticos...</td></tr>';
    const c=proCriteria(); c.page=state.pro.page; state.pro.lastCriteria=c;
    $('ec-pro-criteria').textContent=`${c.min_fallas} fallas BLT en ${c.dias} días · equipos críticos: ${c.min_fallas_equipo}+ fallas`;
    try{
      // La fuente oficial es el backend: parte de Portafolio y excluye equipos
      // inactivos o con estatus "No en servicio" antes de agrupar por proyecto.
      const data = await fetchJson('/api/proyectos-criticos?'+qs(c));
      state.pro.rows = await enrichProjectMtbc_uni(data.data || [], c);
      state.pro.total = Number(data.pagination?.total || 0);
      state.pro.page = Number(data.pagination?.page || state.pro.page);
      renderProyectos();
    }catch(e){ body.innerHTML='<tr><td colspan="12" class="ec-empty">Error: '+esc(e.message)+'</td></tr>'; }
  }

  async function buildProyectosCriticosFromFrontend(c){
    const tickets = await fetchTicketsForCriticalProjects();
    const portafolio = await fetchPortafolioForCriticalProjects();
    const cut = new Date();
    cut.setDate(cut.getDate() - Math.max(1, Number(c.dias || 35)));
    const cutStr = cut.toISOString().slice(0,10);
    const proNeedle = String(c.proyecto || '').trim().toLowerCase();
    const zonaNeedle = String(c.zona || '').trim().toLowerCase();
    const proMap = new Map();
    const eqFailMapByProject = new Map();

    tickets.forEach(t=>{
      if(!t.proyecto || !t.fecha_reporte || t.fecha_reporte < cutStr) return;
      if(t.responsabilidad !== 'BLT') return;
      if(proNeedle && !textMatch(t.proyecto, proNeedle)) return;
      if(zonaNeedle && !textMatch(t.zona, zonaNeedle)) return;
      if(!proMap.has(t.proyecto)){
        const pf = portafolio.find(e=>e.proyecto === t.proyecto) || {};
        proMap.set(t.proyecto, {
          proyecto:t.proyecto, zona:t.zona || pf.zona || '—', ciudad:pf.ciudad || '—', supervisor:pf.supervisor || '—',
          equipos_activos:0, fallas_blt_periodo:0, equipos_con_falla:0, equipos_criticos:0, ultimo_blt:null
        });
      }
      const p = proMap.get(t.proyecto);
      p.fallas_blt_periodo += 1;
      if(!p.ultimo_blt || t.fecha_reporte > p.ultimo_blt) p.ultimo_blt = t.fecha_reporte;
      if(t.codigo_equipo){
        if(!eqFailMapByProject.has(t.proyecto)) eqFailMapByProject.set(t.proyecto, new Map());
        const eqMap = eqFailMapByProject.get(t.proyecto);
        eqMap.set(t.codigo_equipo, (eqMap.get(t.codigo_equipo) || 0) + 1);
      }
    });

    const rows = Array.from(proMap.values()).map(p=>{
      const equiposProyecto = portafolio.filter(e=>e.proyecto === p.proyecto);
      const activos = equiposProyecto.filter(e=>e.activo).length;
      const eqMap = eqFailMapByProject.get(p.proyecto) || new Map();
      const criticos = Array.from(eqMap.values()).filter(n=>n >= Number(c.min_fallas_equipo || 3)).length;
      const pf = equiposProyecto[0] || {};
      return Object.assign(p, {
        zona:p.zona || pf.zona || '—',
        ciudad:p.ciudad || pf.ciudad || '—',
        supervisor:p.supervisor || pf.supervisor || '—',
        equipos_activos:activos,
        equipos_con_falla:eqMap.size,
        equipos_criticos:criticos
      });
    }).filter(p=>p.fallas_blt_periodo >= Number(c.min_fallas || 5))
      .sort((a,b)=>(b.fallas_blt_periodo-a.fallas_blt_periodo) || (b.equipos_criticos-a.equipos_criticos) || String(a.proyecto).localeCompare(String(b.proyecto)));

    const total = rows.length;
    const pageSize = Number(c.page_size || state.pro.pageSize || 25);
    const maxPage = Math.max(1, Math.ceil(total / pageSize));
    const pageNow = Math.min(Math.max(1, Number(c.page || 1)), maxPage);
    return { rows: rows.slice((pageNow-1)*pageSize, (pageNow-1)*pageSize + pageSize), total, page:pageNow };
  }

  async function loadU365(){
    const body=$('ec-365-body');
    if(body) body.innerHTML='<tr><td colspan="11" class="ec-empty">Cargando...</td></tr>';
    try{
      if(window.EstadosVisuales_gnral) await window.EstadosVisuales_gnral.loadCriticidadCorporativa(true);
      const criticos=window.EstadosVisuales_gnral?window.EstadosVisuales_gnral.getCriticos365():[];
      state.u365.rows=await enrichEquipmentMtbc_uni(criticos);
      renderU365();
    }catch(error){
      if(body) body.innerHTML='<tr><td colspan="11" class="ec-empty">Error: '+esc(error.message)+'</td></tr>';
    }
  }
  async function enrichEquipmentMtbc_uni(rows){
    if(!Array.isArray(rows) || !rows.length) return rows || [];
    const map=new Map();
    try{
      let page=1;
      let pages=1;
      do{
        const data=await fetchJson('/api/indicadores/mtbc/equipos?'+qs({page,page_size:100}));
        (data.data||[]).forEach(item=>map.set(String(item.codigo_equipo||'').trim(),item));
        const total=Number(data.pagination?.total||0);
        const pageSize=Number(data.pagination?.page_size||100);
        pages=Math.max(1,Math.ceil(total/pageSize));
        page+=1;
      }while(page<=pages);
    }catch(error){
      console.warn('[Equipos Criticos] No se pudo cargar MTBC U365 por equipo:',error.message);
    }
    return rows.map(row=>{
      const metric=map.get(String(row.codigo_equipo||'').trim())||{};
      return Object.assign({},row,{
        mtbc_anio:metric.mtbc_anio,
        mtbc_365:metric.mtbc_365,
        fallas_blt_anio:metric.fallas_blt_anio ?? row.fallas_blt_anio,
        fallas_blt_365:metric.fallas_blt_365 ?? row.fallas_blt_365
      });
    });
  }

  function toggleU365(force){
    const panel=$('ec-365-panel');
    const content=$('ec-365-content');
    const button=$('ec-365-toggle');
    if(!panel || !content || !button) return;
    const expanded=typeof force==='boolean' ? force : !state.u365.expanded;
    state.u365.expanded=expanded;
    content.hidden=!expanded;
    panel.classList.toggle('is-collapsed',!expanded);
    button.setAttribute('aria-expanded',String(expanded));
    button.textContent=expanded?'▲ Contraer':'▼ Expandir';
  }

  function renderU365(){
    const body=$('ec-365-body'); if(!body) return;
    const rows=state.u365.rows||[];
    body.innerHTML=rows.length?rows.map(r=>`<tr><td>${esc(r.zona)}</td><td><button class="ec-link" type="button" data-proyecto="${esc(r.proyecto)}">${esc(formatProyectoName(r.proyecto))}</button></td><td class="ec-code"><button class="ec-link" type="button" data-equipo="${esc(r.codigo_equipo)}">${esc(r.codigo_equipo)}</button></td><td>${esc(r.referencia_en_sitio)}</td><td>${esc(r.estatus_servicio)}</td><td class="ec-num">${esc(r.llamadas_365)}</td><td class="ec-num"><span class="ec-tag">${esc(r.fallas_blt_365)}</span></td><td>${date(r.ultimo_blt)}</td><td>${window.EstadosVisuales_gnral&&window.EstadosVisuales_gnral.isCriticoEquipo(r.codigo_equipo)?'Sí':'No'}</td><td class="ec-num">${fmtMtbc(r.mtbc_anio)}</td><td class="ec-num">${fmtMtbc(r.mtbc_365)}</td></tr>`).join(''):'<tr><td colspan="11" class="ec-empty">Sin equipos con 3 o más RESP BLT en los últimos 365 días</td></tr>';
    if(window.ManttoDetails&&window.ManttoDetails.bindLinks)window.ManttoDetails.bindLinks(body);
    const count=$('ec-365-count'); if(count) count.textContent=rows.length+' equipos';
  }

  async function enrichProjectMtbc_uni(rows, criteria){
    if(!Array.isArray(rows) || !rows.length) return rows || [];
    const map = new Map();
    try{
      const base = await fetchJson('/api/indicadores/mtbc/proyectos?'+qs({
        page:1,
        page_size:100,
        zona:criteria && criteria.zona,
        proyecto:criteria && criteria.proyecto
      }));
      (base.data || []).forEach(item=>map.set(String(item.proyecto || '').trim(), item));

      const missing = rows.filter(row=>!map.has(String(row.proyecto || '').trim()));
      for(const row of missing){
        try{
          const one = await fetchJson('/api/indicadores/mtbc/proyectos?'+qs({page:1,page_size:5,proyecto:row.proyecto}));
          const exact = (one.data || []).find(item=>String(item.proyecto || '').trim()===String(row.proyecto || '').trim());
          if(exact) map.set(String(row.proyecto || '').trim(), exact);
        }catch(error){ /* El listado operativo sigue visible aunque falle un MTBC puntual. */ }
      }
    }catch(error){
      console.warn('[Equipos Criticos] No se pudo cargar MTBC de proyectos:', error.message);
    }
    return rows.map(row=>{
      const metric = map.get(String(row.proyecto || '').trim()) || {};
      return Object.assign({}, row, {
        fallas_blt_anio: metric.fallas_blt_anio,
        fallas_blt_365: metric.fallas_blt_365,
        mtbc_anio: metric.mtbc_anio,
        mtbc_365: metric.mtbc_365
      });
    });
  }

  function renderProyectos(){
    const body=$('ec-pro-body');
    if(!state.pro.rows.length){ body.innerHTML='<tr><td colspan="12" class="ec-empty">Sin proyectos críticos para este criterio</td></tr>'; }
    else body.innerHTML=state.pro.rows.map(r=>`<tr>
      <td>${esc(r.zona)}</td><td class="ec-project-cell"><button class="ec-link ec-project-link" type="button" data-proyecto="${esc(r.proyecto)}" title="${esc(formatProyectoName(r.proyecto))}">${visualIdentifier([],formatProyectoName(r.proyecto))}</button></td><td>${esc(r.ciudad)}</td><td>${esc(r.supervisor)}</td>
      <td class="ec-num">${esc(r.equipos_activos)}</td><td class="ec-num"><span class="ec-tag">${esc(r.fallas_blt_periodo)}</span></td>
      <td class="ec-num">${esc(r.equipos_con_falla)}</td><td class="ec-num">${esc(r.equipos_criticos)}</td><td>${date(r.ultimo_blt)}</td><td class="ec-num">${fmtMtbc(r.mtbc_anio)}</td><td class="ec-num">${fmtMtbc(r.mtbc_365)}</td>
      <td><button class="ec-btn" type="button" onclick="ManttoEquiposCriticos.openProyecto('${encodeURIComponent(r.proyecto||'')}')">Ver</button></td></tr>`).join('');
    if(window.ManttoDetails && window.ManttoDetails.bindLinks) window.ManttoDetails.bindLinks(body);
    renderPage('pro','ec-pro');
    $('ec-pro-count').textContent=`${state.pro.total} proyectos · mostrando ${state.pro.rows.length}`;
  }

  function renderPage(key,prefix){
    const st=state[key], pages=Math.max(1,Math.ceil((st.total||0)/st.pageSize));
    $(prefix+'-page').textContent=`Página ${st.page} de ${pages} · ${st.total} registros`;
    $(prefix+'-prev').disabled=st.page<=1;
    $(prefix+'-next').disabled=st.page>=pages;
  }

  async function openEquipo(codigo){
    const c=state.eq.lastCriteria || eqCriteria();
    if(window.ManttoDetails && window.ManttoDetails.openEquipoCritico){
      return window.ManttoDetails.openEquipoCritico(codigo, { dias:c.dias, min_fallas:c.min_fallas });
    }
    await openDetail('Equipo '+codigo, `${c.min_fallas} fallas BLT en ${c.dias} días`, '/api/equipos-criticos/'+encodeURIComponent(codigo)+'/tickets?'+qs({dias:c.dias,responsabilidad:'BLT'}));
  }
  async function openProyecto(proyectoEncoded){
    const proyecto=decodeURIComponent(proyectoEncoded||'');
    if(!proyecto) return;
    if(window.ManttoDetails && window.ManttoDetails.openProyecto) return window.ManttoDetails.openProyecto(proyecto);
    const c=state.pro.lastCriteria || proCriteria();
    await openDetail('Proyecto '+formatProyectoName(proyecto), `${c.min_fallas} fallas BLT en ${c.dias} días`, '/api/proyectos-criticos/'+encodeURIComponent(proyecto)+'/tickets?'+qs({dias:c.dias}));
  }
  async function openDetail(title,sub,path){
    $('ec-detail-title').textContent=title; $('ec-detail-sub').textContent=sub; $('ec-detail-body').innerHTML='<tr><td colspan="10" class="ec-empty">Cargando historial...</td></tr>'; $('ec-detail-modal').hidden=false;
    try{
      const data=await fetchJson(path); state.detail={title, rows:data.data||[]};
      $('ec-detail-body').innerHTML = state.detail.rows.length ? state.detail.rows.map(t=>`<tr><td class="ec-code">${esc(t.ticket)}</td><td>${date(t.fecha_reporte)}</td><td>${esc(t.estado_ticket||t.estado)}</td><td>${esc(formatProyectoName(t.proyecto))}</td><td>${esc(t.codigo_equipo)}</td><td>${esc(t.zona)}</td><td>${esc(t.responsabilidad)}</td><td>${esc(t.causa_falla||t.causa)}</td><td>${esc(t.tiempo_llegada)}</td><td>${esc(t.tiempo_solucion)}</td></tr>`).join('') : '<tr><td colspan="10" class="ec-empty">Sin tickets en el periodo</td></tr>';
    }catch(e){ $('ec-detail-body').innerHTML='<tr><td colspan="10" class="ec-empty">Error: '+esc(e.message)+'</td></tr>'; }
  }

  async function fetchAllEquiposForPdf(criteria){
    const rows=[];
    let page=1;
    let total=0;
    do{
      const query=Object.assign({},criteria,{page,page_size:100});
      const data=await fetchJson('/api/equipos-criticos?'+qs(query));
      const batch=Array.isArray(data.data)?data.data:[];
      rows.push(...batch);
      total=Number(data.pagination?.total||rows.length);
      page+=1;
    }while(rows.length<total);
    return rows;
  }

  async function fetchEquipoTicketsBatchForPdf(equipos){
    const anio = new Date().getFullYear();
    const codigos = Array.from(new Set((equipos || [])
      .map(equipo=>String(equipo && equipo.codigo_equipo || '').trim())
      .filter(Boolean)));
    if(!codigos.length) return {};
    const data = await requestJson('/api/portafolio/equipos/tickets-lote', {
      method:'POST',
      body:JSON.stringify({ equipos:codigos, anio })
    });
    return data && data.data && typeof data.data === 'object' ? data.data : {};
  }

  function pdfDate(value){
    if(!value) return '—';
    const raw=String(value).slice(0,10);
    const parts=raw.split('-');
    if(parts.length===3) return parts[2]+'/'+parts[1]+'/'+parts[0];
    return date(value);
  }

  function pdfMtbc(value){
    const n=Number(value);
    return value===null || value===undefined || value==='' || Number.isNaN(n) || n < 0 ? 'N/A' : n.toFixed(2)+' d';
  }


  function pdfLongDate(){
    return new Date().toLocaleDateString('es-MX',{day:'numeric',month:'long',year:'numeric'});
  }

  function pdfTicketWithEmojis(row){
    const ticket = String((row && (row.ticket || row.folio)) || '—');
    if(!window.EstadosVisuales_gnral || typeof window.EstadosVisuales_gnral.codesForTicket !== 'function') return ticket;
    try{
      const codes = window.EstadosVisuales_gnral.codesForTicket(row || {});
      const emojis = codes.map(code=>window.EstadosVisuales_gnral.emoji(code,'')).filter(Boolean).join(' ');
      return emojis ? emojis+' '+ticket : ticket;
    }catch(error){
      return ticket;
    }
  }

  async function buildEquiposPdf(){
    const criteria=Object.assign({},state.eq.lastCriteria||eqCriteria());
    const equipos=await fetchAllEquiposForPdf(criteria);
    if(!equipos.length) throw new Error('No hay equipos críticos para exportar con los filtros actuales.');

    const ticketsPorEquipo=await fetchEquipoTicketsBatchForPdf(equipos);
    const details=equipos.map(equipo=>({
      equipo,
      tickets:Array.isArray(ticketsPorEquipo[equipo.codigo_equipo])
        ? ticketsPorEquipo[equipo.codigo_equipo]
        : []
    }));

    const sections=[{
      title:'BLT Brilliant — Equipos Críticos',
      titleColor:[30,64,175],
      showDate:false,
      lines:[
        'Generado: '+pdfLongDate()+' | Período: últimos '+criteria.dias+' días | Fallas BLT mínimas: '+criteria.min_fallas,
        'Total de equipos críticos: '+equipos.length
      ],
      rows:equipos,
      columns:[
        {key:'codigo_equipo',label:'Código'},
        {key:'proyecto',label:'Proyecto',value:r=>formatProyectoName(r.proyecto)},
        {key:'zona',label:'Zona'},
        {key:'fallas_blt_periodo',label:'Fallas\nBLT'},
        {key:'ultimo_blt',label:'Último\nticket',value:r=>pdfDate(r.ultimo_blt)},
        {key:'mtbc_anio',label:'MTBC Año\nActual',value:r=>pdfMtbc(r.mtbc_anio)},
        {key:'mtbc_365',label:'MTBC\nU365',value:r=>pdfMtbc(r.mtbc_365)}
      ],
      columnStyles:{
        0:{cellWidth:88},
        1:{cellWidth:230},
        2:{cellWidth:58},
        3:{cellWidth:54,halign:'center'},
        4:{cellWidth:70,halign:'center'},
        5:{cellWidth:78,halign:'center'},
        6:{cellWidth:70,halign:'center'}
      },
      headStyles:{fillColor:[220,38,38]},
      alternateRowStyles:{fillColor:[254,242,242]},
      styles:{fontSize:6.8,cellPadding:2.6,minCellWidth:1}
    }];

    details.forEach(item=>{
      const anio = new Date().getFullYear();
      sections.push({
        title:'Tickets del equipo — '+item.equipo.codigo_equipo,
        titleColor:[30,64,175],
        showDate:false,
        lines:[
          formatProyectoName(item.equipo.proyecto)+' | Zona: '+(item.equipo.zona||'—')+
          ' | Tickets del año: '+anio+
          ' | Total: '+item.tickets.length
        ],
        rows:item.tickets,
        columns:[
          {key:'ticket',label:'No.\nTicket',value:r=>pdfTicketWithEmojis(r)},
          {key:'estado_ticket',label:'Estado',value:r=>r.estado_ticket||r.estado},
          {key:'fecha_reporte',label:'Fecha\nReporte',value:r=>pdfDate(r.fecha_reporte)},
          {key:'h_reporte',label:'Hora\nReporte'},
          {key:'descripcion',label:'Asunto',value:r=>r.descripcion||r.asunto},
          {key:'estatus_equipo_ir',label:'Estatus\ninicial'},
          {key:'fecha_llegada',label:'Fecha\nLlegada',value:r=>pdfDate(r.fecha_llegada)},
          {key:'h_llegada',label:'Hora\nLlegada'},
          {key:'tiempo_llegada',label:'T\nllegada'},
          {key:'fecha_cierre',label:'Fecha\nSolución',value:r=>pdfDate(r.fecha_cierre)},
          {key:'h_solucion',label:'Hora\nSolución'},
          {key:'estatus_equipo_final',label:'Estatus\nfinal'},
          {key:'causa',label:'Causa',value:r=>r.causa||r.causa_falla},
          {key:'accion_en_cierre',label:'Acción\ncierre'},
          {key:'responsabilidad',label:'Responsa-\nbilidad'},
          {key:'causa_falla',label:'Causa de\nfalla',value:r=>r.causa_falla||r.causa}
        ],
        columnStyles:{
          0:{cellWidth:44},
          1:{cellWidth:32},
          2:{cellWidth:38},
          3:{cellWidth:30},
          4:{cellWidth:56},
          5:{cellWidth:44},
          6:{cellWidth:38},
          7:{cellWidth:30},
          8:{cellWidth:28,halign:'center'},
          9:{cellWidth:38},
          10:{cellWidth:30},
          11:{cellWidth:42},
          12:{cellWidth:58},
          13:{cellWidth:68},
          14:{cellWidth:48},
          15:{cellWidth:84}
        },
        headStyles:{fillColor:[13,46,110]},
        alternateRowStyles:{fillColor:[239,246,255]},
        styles:{fontSize:4.6,cellPadding:0.8,overflow:'linebreak',valign:'middle',minCellWidth:1},
        margin:{left:30,right:30,bottom:32}
      });
    });

    window.ManttoPdf_gnral.exportReport({
      title:'Equipos Críticos',
      fileName:'Equipos_Criticos_Desglose',
      sections,
      footerText:'Mantto Gestor · United Elevadores'
    });
  }

  async function buildProyectosPdf(){
    const criteria=Object.assign({},state.pro.lastCriteria||proCriteria(),{page:1,page_size:1000000});
    const result=await buildProyectosCriticosFromFrontend(criteria);
    const rows=await enrichProjectMtbc_uni(result.rows,criteria);
    if(!rows.length) throw new Error('No hay proyectos críticos para exportar con los filtros actuales.');
    window.ManttoPdf_gnral.exportReport({
      title:'Proyectos Críticos',
      fileName:'Proyectos_Criticos',
      footerText:'Mantto Gestor · United Elevadores',
      sections:[{
        title:'BLT Brilliant — Proyectos Críticos',
        titleColor:[30,64,175],
        showDate:false,
        lines:[
          'Generado: '+pdfLongDate()+' | Período: últimos '+criteria.dias+' días | Fallas BLT mínimas: '+criteria.min_fallas,
          'Total de proyectos críticos: '+rows.length
        ],
        rows,
        columns:[
          {key:'zona',label:'Zona'},
          {key:'proyecto',label:'Proyecto',value:r=>formatProyectoName(r.proyecto)},
          {key:'equipos_activos',label:'Equipos activos'},
          {key:'fallas_blt_periodo',label:'Fallas BLT'},
          {key:'equipos_criticos',label:'Equipos críticos'},
          {key:'mtbc_anio',label:'MTBC Año Actual',value:r=>pdfMtbc(r.mtbc_anio)},
          {key:'mtbc_365',label:'MTBC U365',value:r=>pdfMtbc(r.mtbc_365)}
        ],
        columnStyles:{
          0:{cellWidth:72},
          1:{cellWidth:300},
          2:{cellWidth:78,halign:'center'},
          3:{cellWidth:68,halign:'center'},
          4:{cellWidth:78,halign:'center'},
          5:{cellWidth:82,halign:'center'},
          6:{cellWidth:72,halign:'center'}
        },
        headStyles:{fillColor:[220,38,38]},
        alternateRowStyles:{fillColor:[254,242,242]},
        styles:{fontSize:6.8,cellPadding:2.6}
      }]
    });
  }

  async function exportTablePdf(type){
    if(!window.ManttoPdf_gnral || typeof window.ManttoPdf_gnral.exportReport !== 'function'){
      alert('El motor general de PDF no está disponible.');
      return;
    }
    try{
      if(type==='equipos') await buildEquiposPdf();
      else await buildProyectosPdf();
    }catch(error){
      alert('No se pudo generar el PDF: '+error.message);
    }
  }

  function exportDetailPdf(){
    if(!window.ManttoPdf_gnral || typeof window.ManttoPdf_gnral.exportTable !== 'function'){
      alert('El motor general de PDF no está disponible.');
      return;
    }
    window.ManttoPdf_gnral.exportTable({
      title:state.detail.title,
      fileName:state.detail.title,
      rows:state.detail.rows,
      columns:[
        {key:'ticket',label:'Ticket'}, {key:'fecha_reporte',label:'Fecha reporte'},
        {key:'estado_ticket',label:'Estado'}, {key:'proyecto',label:'Proyecto'},
        {key:'codigo_equipo',label:'Equipo'}, {key:'zona',label:'Zona'},
        {key:'responsabilidad',label:'Responsabilidad'}, {key:'causa_falla',label:'Causa'},
        {key:'tiempo_llegada',label:'T. llegada'}, {key:'tiempo_solucion',label:'T. solución'}
      ],
      headStyles:{fillColor:[13,46,110]}
    });
  }

  async function init(){
    try{
      await loadHtml();
      await loadUserPreferences();
      if(window.EstadosVisuales_gnral) await window.EstadosVisuales_gnral.loadCriticidadCorporativa();
      await Promise.all([loadEquipos(state.eq.page), loadProyectos(state.pro.page), loadU365()]);
    }catch(e){
      const view=$('view-criticos');
      if(view) view.innerHTML = '<div class="ec-page"><section class="ec-head card"><div><p class="ec-eyebrow">Error de carga</p><h1>Equipos Críticos</h1><p>No se pudo inicializar el módulo: '+esc(e.message)+'</p></div></section></div>';
      console.error('[Equipos Criticos]', e);
    }
  }

  window.ManttoEquiposCriticos = { init, openEquipo, openProyecto };
})();

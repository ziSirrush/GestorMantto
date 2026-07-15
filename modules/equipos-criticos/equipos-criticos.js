(function(){
  const API = () => (window.MANTTO_API_BASE || 'http://localhost:3001').replace(/\/$/, '');
  const state = {
    loaded:false,
    eq:{ page:1, pageSize:25, total:0, rows:[], lastCriteria:null },
    pro:{ page:1, pageSize:25, total:0, rows:[], lastCriteria:null },
    u365:{ rows:[] },
    detail:{ title:'Detalle', rows:[] }
  };
  const EC_INLINE_HTML = '<div class="ec-page">\n  <section class="ec-head card">\n    <div>\n      <p class="ec-eyebrow">Módulo en pruebas</p>\n      <h1>Equipos Críticos</h1>\n      <p>Consulta equipos y proyectos con reincidencia de fallas con responsabilidad BLT. Los criterios son independientes por tabla y no modifican Resumen del Día.</p>\n    </div>\n    <button type="button" class="ec-btn ec-btn-soft" data-ec-action="refresh-all">↻ Actualizar todo</button>\n  </section>\n\n  <section class="ec-panel card" aria-label="Equipos críticos">\n    <div class="ec-panel-head">\n      <div>\n        <h2>Equipos Críticos</h2>\n        <small id="ec-eq-count">Sin cargar</small>\n      </div>\n      <div class="ec-actions">\n        <button type="button" class="ec-btn" data-ec-action="clear-equipos">Limpiar filtros</button>\n        <button type="button" class="ec-btn ec-btn-danger" data-ec-action="pdf-equipos">PDF Equipos</button>\n      </div>\n    </div>\n\n    <div class="ec-filters">\n      <label>Fallas BLT mín.<input type="number" id="ec-eq-min" min="1" value="3" /></label>\n      <label>Días<input type="number" id="ec-eq-dias" min="1" value="35" /></label>\n      <label>Zona<input type="text" id="ec-eq-zona" placeholder="Ej. NOR" /></label>\n      <label>Proyecto<input type="text" id="ec-eq-proyecto" placeholder="Proyecto" /></label>\n      <label>Buscar<input type="search" id="ec-eq-search" placeholder="Equipo, ticket, ref." /></label>\n      <button type="button" class="ec-btn ec-btn-primary" data-ec-action="load-equipos">Aplicar</button>\n    </div>\n\n    <div class="ec-note">Criterio actual de esta tabla: <b id="ec-eq-criteria">3 fallas BLT en 35 días</b>.</div>\n\n    <div class="ec-table-wrap">\n      <table class="ec-table">\n        <thead><tr><th>Zona</th><th>Proyecto</th><th>Código</th><th>Ref. sitio</th><th>Estatus</th><th>Calls año</th><th>Fallas BLT</th><th>Último BLT</th><th>Resp. Cliente</th><th>Último Cliente</th><th>MTBC</th><th></th></tr></thead>\n        <tbody id="ec-eq-body"><tr><td colspan="12" class="ec-empty">Cargando...</td></tr></tbody>\n      </table>\n    </div>\n    <div class="ec-pagination"><button type="button" id="ec-eq-prev">← Anterior</button><span id="ec-eq-page">—</span><button type="button" id="ec-eq-next">Siguiente →</button></div>\n  </section>\n\n  <section class="ec-panel card" aria-label="Proyectos críticos">\n    <div class="ec-panel-head">\n      <div>\n        <h2>Proyectos Críticos</h2>\n        <small id="ec-pro-count">Sin cargar</small>\n      </div>\n      <div class="ec-actions">\n        <button type="button" class="ec-btn" data-ec-action="clear-proyectos">Limpiar filtros</button>\n        <button type="button" class="ec-btn ec-btn-danger" data-ec-action="pdf-proyectos">PDF Proyectos</button>\n      </div>\n    </div>\n\n    <div class="ec-filters">\n      <label>Fallas BLT mín.<input type="number" id="ec-pro-min" min="1" value="5" /></label>\n      <label>Días<input type="number" id="ec-pro-dias" min="1" value="35" /></label>\n      <label>Fallas por equipo<input type="number" id="ec-pro-min-equipo" min="1" value="3" /></label>\n      <label>Zona<input type="text" id="ec-pro-zona" placeholder="Ej. CNA" /></label>\n      <label>Proyecto<input type="text" id="ec-pro-proyecto" placeholder="Proyecto" /></label>\n      <button type="button" class="ec-btn ec-btn-primary" data-ec-action="load-proyectos">Aplicar</button>\n    </div>\n\n    <div class="ec-note">Criterio actual de esta tabla: <b id="ec-pro-criteria">5 fallas BLT en 35 días</b>. La regla de equipos críticos dentro del proyecto usa su propio mínimo.</div>\n\n    <div class="ec-table-wrap">\n      <table class="ec-table">\n        <thead><tr><th>Zona</th><th>Proyecto</th><th>Ciudad</th><th>Supervisor</th><th>Equipos activos</th><th>Fallas BLT</th><th>Equipos con falla</th><th>Equipos críticos</th><th>Último BLT</th><th></th></tr></thead>\n        <tbody id="ec-pro-body"><tr><td colspan="10" class="ec-empty">Cargando...</td></tr></tbody>\n      </table>\n    </div>\n    <div class="ec-pagination"><button type="button" id="ec-pro-prev">← Anterior</button><span id="ec-pro-page">—</span><button type="button" id="ec-pro-next">Siguiente →</button></div>\n  </section>\n</div>\n\n<section id="ec-detail-modal" class="ec-detail" hidden>\n  <div class="ec-detail-panel">\n    <div class="ec-detail-head">\n      <button type="button" id="ec-detail-close">×</button>\n      <div><h2 id="ec-detail-title">Detalle</h2><p id="ec-detail-sub">Historial</p></div>\n      <button type="button" class="ec-btn ec-btn-danger" id="ec-detail-pdf">PDF detalle</button>\n    </div>\n    <div class="ec-detail-body">\n      <div class="ec-table-wrap"><table class="ec-table"><thead><tr><th>Ticket</th><th>Fecha reporte</th><th>Estado</th><th>Proyecto</th><th>Equipo</th><th>Zona</th><th>Responsabilidad</th><th>Causa</th><th>T. llegada</th><th>T. solución</th></tr></thead><tbody id="ec-detail-body"></tbody></table></div>\n    </div>\n  </div>\n</section>\n';

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

  async function fetchJson(path){
    const r = await fetch(API()+path, { headers:{ 'Accept':'application/json' }});
    const data = await r.json().catch(()=>({ ok:false, message:'Respuesta invalida del backend' }));
    if(!r.ok || !data.ok) throw new Error(data.message || data.error || 'Error consultando backend');
    return data;
  }

  async function loadHtml(){
    const view=$('view-criticos');
    if(!view || state.loaded) return;
    let html = EC_INLINE_HTML;
    try{
      const r = await fetch('./modules/equipos-criticos/equipos-criticos.html?v=20260706-v031', { cache:'no-store' });
      if(r.ok){
        const fetched = await r.text();
        if(fetched && fetched.trim()) html = fetched;
      }
    }catch(e){
      // Fallback interno para evitar vista vacia si falla la ruta del HTML modular.
    }
    view.innerHTML = html;
    bind();
    state.loaded=true;
  }

  function bind(){
    document.querySelectorAll('[data-ec-action]').forEach(btn=>{
      btn.addEventListener('click',()=>{
        const a=btn.dataset.ecAction;
        if(a==='refresh-all'){ loadEquipos(1); loadProyectos(1); loadU365(); }
        if(a==='load-equipos') loadEquipos(1);
        if(a==='load-proyectos') loadProyectos(1);
        if(a==='clear-equipos') { ['ec-eq-zona','ec-eq-proyecto','ec-eq-search'].forEach(id=>$(id).value=''); $('ec-eq-min').value=3; $('ec-eq-dias').value=35; loadEquipos(1); }
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
    ['ec-eq-search','ec-eq-zona','ec-eq-proyecto','ec-pro-zona','ec-pro-proyecto'].forEach(id=>{
      const el=$(id); if(el) el.addEventListener('keydown', ev=>{ if(ev.key==='Enter') { ev.preventDefault(); id.startsWith('ec-eq') ? loadEquipos(1) : loadProyectos(1); } });
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
    const body=$('ec-eq-body'); if(body) body.innerHTML='<tr><td colspan="12" class="ec-empty">Cargando equipos críticos...</td></tr>';
    const c=eqCriteria(); c.page=state.eq.page; state.eq.lastCriteria=c;
    $('ec-eq-criteria').textContent=`${c.min_fallas} fallas BLT en ${c.dias} días`;
    try{
      const data=await fetchJson('/api/equipos-criticos?'+qs(c));
      state.eq.rows=data.data||[]; state.eq.total=data.pagination?.total||0; state.eq.page=data.pagination?.page||state.eq.page;
      renderEquipos();
    }catch(e){ body.innerHTML='<tr><td colspan="12" class="ec-empty">Error: '+esc(e.message)+'</td></tr>'; }
  }

  function visualIdentifier(codes,text){ return window.EstadosVisuales_gnral ? window.EstadosVisuales_gnral.renderIdentifier(codes,text) : esc(text); }
  function renderEquipos(){
    const body=$('ec-eq-body');
    if(!state.eq.rows.length){ body.innerHTML='<tr><td colspan="12" class="ec-empty">Sin equipos críticos para este criterio</td></tr>'; }
    else body.innerHTML=state.eq.rows.map(r=>`<tr class="ec-click-row" data-ec-equipo="${esc(r.codigo_equipo)}">
      <td>${esc(r.zona)}</td><td><button class="ec-link" type="button" data-proyecto="${esc(r.proyecto)}">${visualIdentifier([],formatProyectoName(r.proyecto))}</button></td><td class="ec-code"><button class="ec-link" type="button" data-equipo="${esc(r.codigo_equipo)}">${visualIdentifier([],r.codigo_equipo)}</button></td><td>${esc(r.referencia_en_sitio)}</td><td>${esc(r.estatus_servicio)}</td>
      <td class="ec-num">${esc(r.calls_anio)}</td><td class="ec-num"><span class="ec-tag">${esc(r.fallas_blt_periodo)}</span></td><td>${date(r.ultimo_blt)}</td>
      <td class="ec-num">${esc(r.resp_cliente_periodo)}</td><td>${date(r.ultimo_cliente)}</td><td class="ec-num">${r.mtbc_dias==null?'—':esc(r.mtbc_dias)+' d'}</td>
      <td><button class="ec-btn" type="button" onclick="ManttoEquiposCriticos.openEquipo('${esc(r.codigo_equipo)}')">Ver</button></td></tr>`).join('');
    if(window.ManttoDetails && window.ManttoDetails.bindLinks) window.ManttoDetails.bindLinks(body);
    body.querySelectorAll('tr[data-ec-equipo]').forEach(tr=>tr.addEventListener('click', ev=>{ if(ev.target.closest('button')) return; openEquipo(tr.dataset.ecEquipo); }));
    renderPage('eq','ec-eq');
    $('ec-eq-count').textContent=`${state.eq.total} equipos · mostrando ${state.eq.rows.length}`;
  }

  async function loadProyectos(page){
    state.pro.page=Math.max(1,page||1);
    const body=$('ec-pro-body'); if(body) body.innerHTML='<tr><td colspan="10" class="ec-empty">Calculando proyectos críticos...</td></tr>';
    const c=proCriteria(); c.page=state.pro.page; state.pro.lastCriteria=c;
    $('ec-pro-criteria').textContent=`${c.min_fallas} fallas BLT en ${c.dias} días · equipos críticos: ${c.min_fallas_equipo}+ fallas`;
    try{
      const result = await buildProyectosCriticosFromFrontend(c);
      state.pro.rows = result.rows;
      state.pro.total = result.total;
      state.pro.page = result.page;
      renderProyectos();
    }catch(e){ body.innerHTML='<tr><td colspan="10" class="ec-empty">Error: '+esc(e.message)+'</td></tr>'; }
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
    if(body) body.innerHTML='<tr><td colspan="9" class="ec-empty">Cargando...</td></tr>';
    try{
      if(window.EstadosVisuales_gnral) await window.EstadosVisuales_gnral.loadCriticidadCorporativa(true);
      state.u365.rows=window.EstadosVisuales_gnral?window.EstadosVisuales_gnral.getCriticos365():[];
      renderU365();
    }catch(error){
      if(body) body.innerHTML='<tr><td colspan="9" class="ec-empty">Error: '+esc(error.message)+'</td></tr>';
    }
  }
  function renderU365(){
    const body=$('ec-365-body'); if(!body) return;
    const rows=state.u365.rows||[];
    body.innerHTML=rows.length?rows.map(r=>`<tr><td>${esc(r.zona)}</td><td><button class="ec-link" type="button" data-proyecto="${esc(r.proyecto)}">${esc(formatProyectoName(r.proyecto))}</button></td><td class="ec-code"><button class="ec-link" type="button" data-equipo="${esc(r.codigo_equipo)}">${esc(r.codigo_equipo)}</button></td><td>${esc(r.referencia_en_sitio)}</td><td>${esc(r.estatus_servicio)}</td><td class="ec-num">${esc(r.llamadas_365)}</td><td class="ec-num"><span class="ec-tag">${esc(r.fallas_blt_365)}</span></td><td>${date(r.ultimo_blt)}</td><td>${window.EstadosVisuales_gnral&&window.EstadosVisuales_gnral.isCriticoEquipo(r.codigo_equipo)?'Sí':'No'}</td></tr>`).join(''):'<tr><td colspan="9" class="ec-empty">Sin equipos con 3 o más RESP BLT en los últimos 365 días</td></tr>';
    if(window.ManttoDetails&&window.ManttoDetails.bindLinks)window.ManttoDetails.bindLinks(body);
    const count=$('ec-365-count'); if(count) count.textContent=rows.length+' equipos';
  }

  function renderProyectos(){
    const body=$('ec-pro-body');
    if(!state.pro.rows.length){ body.innerHTML='<tr><td colspan="10" class="ec-empty">Sin proyectos críticos para este criterio</td></tr>'; }
    else body.innerHTML=state.pro.rows.map(r=>`<tr>
      <td>${esc(r.zona)}</td><td class="ec-code"><button class="ec-link" type="button" data-proyecto="${esc(r.proyecto)}">${visualIdentifier([],formatProyectoName(r.proyecto))}</button><br><small>${esc(r.proyecto)}</small></td><td>${esc(r.ciudad)}</td><td>${esc(r.supervisor)}</td>
      <td class="ec-num">${esc(r.equipos_activos)}</td><td class="ec-num"><span class="ec-tag">${esc(r.fallas_blt_periodo)}</span></td>
      <td class="ec-num">${esc(r.equipos_con_falla)}</td><td class="ec-num">${esc(r.equipos_criticos)}</td><td>${date(r.ultimo_blt)}</td>
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

  function exportTablePdf(type){
    const rows = type==='equipos' ? state.eq.rows : state.pro.rows;
    const title = type==='equipos' ? 'Equipos Críticos' : 'Proyectos Críticos';
    const criteria = type==='equipos' ? state.eq.lastCriteria : state.pro.lastCriteria;
    if(!rows.length){ alert('No hay datos para exportar.'); return; }
    if(!window.jspdf || !window.jspdf.jsPDF) return exportCsvFallback(title, rows);
    const doc = new window.jspdf.jsPDF({ orientation:'landscape', unit:'pt', format:'letter' });
    doc.setFontSize(14); doc.text(title, 36, 36);
    doc.setFontSize(9); doc.text('Generado: '+new Date().toLocaleString('es-MX'), 36, 52);
    doc.text('Criterio: '+(criteria?.min_fallas||'—')+' fallas BLT en '+(criteria?.dias||'—')+' días', 36, 66);
    const keys = type==='equipos'
      ? ['zona','proyecto','codigo_equipo','referencia_en_sitio','estatus_servicio','calls_anio','fallas_blt_periodo','ultimo_blt','resp_cliente_periodo','ultimo_cliente','mtbc_dias']
      : ['zona','proyecto','ciudad','supervisor','equipos_activos','fallas_blt_periodo','equipos_con_falla','equipos_criticos','ultimo_blt'];
    const headers = type==='equipos'
      ? ['Zona','Proyecto','Código','Ref. sitio','Estatus','Calls año','Fallas BLT','Último BLT','Resp. Cliente','Último Cliente','MTBC']
      : ['Zona','Proyecto','Ciudad','Supervisor','Equipos activos','Fallas BLT','Equipos con falla','Equipos críticos','Último BLT'];
    doc.autoTable({ startY:82, head:[headers], body: rows.map(r=>keys.map(k=>String(r[k]??'—'))), styles:{fontSize:7, cellPadding:3}, headStyles:{fillColor:[153,27,27]} });
    doc.save(title.replace(/\s+/g,'_')+'_'+new Date().toISOString().slice(0,10)+'.pdf');
  }
  function exportDetailPdf(){
    if(!state.detail.rows.length){ alert('No hay detalle para exportar.'); return; }
    if(!window.jspdf || !window.jspdf.jsPDF) return exportCsvFallback(state.detail.title.replace(/\s+/g,'_'), state.detail.rows);
    const doc = new window.jspdf.jsPDF({ orientation:'landscape', unit:'pt', format:'letter' });
    doc.setFontSize(14); doc.text(state.detail.title, 36, 36);
    doc.setFontSize(9); doc.text('Generado: '+new Date().toLocaleString('es-MX'), 36, 52);
    const keys=['ticket','fecha_reporte','estado_ticket','proyecto','codigo_equipo','zona','responsabilidad','causa_falla','tiempo_llegada','tiempo_solucion'];
    const headers=['Ticket','Fecha reporte','Estado','Proyecto','Equipo','Zona','Responsabilidad','Causa','T. llegada','T. solución'];
    doc.autoTable({ startY:70, head:[headers], body: state.detail.rows.map(r=>keys.map(k=>String(r[k]??'—'))), styles:{fontSize:7, cellPadding:3}, headStyles:{fillColor:[13,46,110]} });
    doc.save(state.detail.title.replace(/\s+/g,'_')+'_'+new Date().toISOString().slice(0,10)+'.pdf');
  }
  function exportCsvFallback(name, rows){
    // Fallback si no cargan jsPDF/autoTable, por ejemplo sin internet o bloqueo de CDN.
    const keys=Object.keys(rows[0]||{});
    const csv=[keys.join(',')].concat(rows.map(r=>keys.map(k=>'"'+String(r[k]??'').replace(/"/g,'""')+'"').join(','))).join('\n');
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name+'_'+new Date().toISOString().slice(0,10)+'.csv'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }

  async function init(){
    try{
      await loadHtml();
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

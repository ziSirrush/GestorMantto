(function(){
  const API = () => (window.MANTTO_API_BASE || 'http://localhost:3001').replace(/\/$/, '');
  const ticketCache = new Map();
  function ticketKey(v){ return String(v || '').trim(); }
  function registerTickets(rows){
    (rows || []).forEach(t => {
      const k = ticketKey(t && (t.ticket || t.n || t.folio));
      if(k) ticketCache.set(k, Object.assign({}, ticketCache.get(k) || {}, t));
    });
  }
  function esc(v){ return String(v == null || v === '' ? '—' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function fmtDate(v){ if(!v) return '—'; const d = new Date(v); return Number.isNaN(d.getTime()) ? esc(v) : d.toLocaleDateString('es-MX'); }
  async function fetchJson(path){
    const headers = Object.assign({ 'Accept':'application/json' }, window.ManttoAuth && window.ManttoAuth.authHeaders ? window.ManttoAuth.authHeaders() : {});
    const r = await fetch(API() + path, { headers, cache:'no-store' });
    const text = await r.text();
    let data = null;
    try { data = text ? JSON.parse(text) : {}; }
    catch(e){ throw new Error('Respuesta inválida del backend. Verifica que Railway/API esté activo y que la ruta exista.'); }
    if(!r.ok || data.ok === false) throw new Error(data.message || data.error || 'Error consultando backend');
    return data;
  }
  function ensure(){
    let modal = document.getElementById('mg-detail-modal');
    if(modal) return modal;
    const css = document.createElement('style');
    css.textContent = `
      .mg-detail-modal{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:950;display:flex;align-items:center;justify-content:center;padding:18px}
      .mg-detail-panel{width:min(1180px,96vw);max-height:92vh;background:#fff;border-radius:16px;border:1px solid #0D2E6E;box-shadow:0 20px 60px rgba(0,0,0,.25);display:flex;flex-direction:column;overflow:hidden}
      .mg-detail-head{background:#0D2E6E;color:#fff;padding:14px 16px;display:flex;align-items:center;gap:12px}.mg-detail-head h2{font-size:16px;margin:0}.mg-detail-head p{margin:2px 0 0;color:rgba(255,255,255,.72);font-size:12px}.mg-detail-close{margin-left:auto;border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.12);color:#fff;border-radius:8px;width:34px;height:34px;font-size:20px;cursor:pointer}
      .mg-detail-body{padding:16px;overflow:auto;background:#F8FAFC}.mg-detail-section{background:#fff;border:1px solid rgba(13,46,110,.18);border-radius:12px;margin-bottom:14px;overflow:hidden}.mg-detail-section h3{margin:0;padding:10px 14px;background:#EFF6FF;color:#0D2E6E;font-size:13px}.mg-detail-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:0}.mg-field{padding:10px 12px;border-right:1px solid #EEF2FF;border-bottom:1px solid #EEF2FF}.mg-field label{display:block;font-size:10px;color:#64748B;text-transform:uppercase;font-weight:700;margin-bottom:3px}.mg-field span{font-size:12px;color:#1E293B}.mg-table-wrap{overflow:auto}.mg-table{width:100%;border-collapse:collapse;min-width:760px}.mg-table th{background:#0D2E6E;color:#fff;text-align:left;font-size:11px;padding:8px}.mg-table td{font-size:12px;padding:8px;border-bottom:1px solid #E2E8F0;color:#334155}.mg-link{border:0;background:transparent;color:#1B4FD8;text-decoration:underline;cursor:pointer;font:inherit;padding:0}.mg-empty{padding:18px;text-align:center;color:#64748B}`;
    document.head.appendChild(css);
    modal = document.createElement('section');
    modal.id = 'mg-detail-modal';
    modal.className = 'mg-detail-modal';
    modal.hidden = true;
    modal.innerHTML = '<div class="mg-detail-panel"><div class="mg-detail-head"><div><h2 id="mg-detail-title">Detalle</h2><p id="mg-detail-sub">Mantto Gestor</p></div><button class="mg-detail-close" id="mg-detail-close" type="button">×</button></div><div class="mg-detail-body" id="mg-detail-body"></div></div>';
    document.body.appendChild(modal);
    document.getElementById('mg-detail-close').addEventListener('click', close);
    modal.addEventListener('click', ev => { if(ev.target === modal) close(); });
    return modal;
  }
  function show(title, sub, html){ const modal=ensure(); document.getElementById('mg-detail-title').textContent=title||'Detalle'; document.getElementById('mg-detail-sub').textContent=sub||'Mantto Gestor'; document.getElementById('mg-detail-body').innerHTML=html||''; modal.hidden=false; }
  function close(){ const modal=document.getElementById('mg-detail-modal'); if(modal) modal.hidden=true; }
  function grid(items){ return '<div class="mg-detail-grid">'+items.map(([k,v])=>'<div class="mg-field"><label>'+esc(k)+'</label><span>'+esc(v)+'</span></div>').join('')+'</div>'; }
  function ticketsTable(rows){
    if(!rows || !rows.length) return '<div class="mg-empty">Sin tickets relacionados</div>';
    return '<div class="mg-table-wrap"><table class="mg-table"><thead><tr><th>Ticket</th><th>Fecha</th><th>Estado</th><th>Proyecto</th><th>Equipo</th><th>Responsabilidad</th><th>Causa</th></tr></thead><tbody>' + rows.map(t=>'<tr><td><button class="mg-link" data-ticket="'+esc(t.ticket || t.n || '')+'">'+esc(t.ticket || t.n)+'</button></td><td>'+fmtDate(t.fecha_reporte || t.fr)+'</td><td>'+esc(t.estado_ticket || t.estado || t.et)+'</td><td><button class="mg-link" data-proyecto="'+esc(t.proyecto || t.pro || '')+'">'+esc(t.proyecto || t.pro)+'</button></td><td><button class="mg-link" data-equipo="'+esc(t.codigo_equipo || t.cod || '')+'">'+esc(t.codigo_equipo || t.cod)+'</button></td><td>'+esc(t.responsabilidad || t.res)+'</td><td>'+esc(t.causa_falla || t.causa || t.caf)+'</td></tr>').join('') + '</tbody></table></div>';
  }
  function bindLinks(root){
    (root || document).querySelectorAll('[data-proyecto]').forEach(el=>el.addEventListener('click', ev=>{ ev.preventDefault(); ev.stopPropagation(); openProyecto(el.getAttribute('data-proyecto')); }));
    (root || document).querySelectorAll('[data-equipo]').forEach(el=>el.addEventListener('click', ev=>{ ev.preventDefault(); ev.stopPropagation(); openEquipo(el.getAttribute('data-equipo')); }));
    (root || document).querySelectorAll('[data-ticket]').forEach(el=>el.addEventListener('click', ev=>{ ev.preventDefault(); ev.stopPropagation(); openTicket(el.getAttribute('data-ticket')); }));
  }
  async function openProyecto(proyecto){
    proyecto = String(proyecto || '').trim(); if(!proyecto || proyecto === '—') return;
    show('Proyecto', proyecto, '<div class="mg-empty">Cargando detalle del proyecto...</div>');
    try{
      const data = await fetchJson('/api/proyectos/detalle/' + encodeURIComponent(proyecto));
      const p = data.proyecto || data.data?.proyecto || {};
      const equipos = data.equipos || data.data?.equipos || [];
      const tickets = data.tickets || data.data?.tickets || [];
      show('Proyecto · ' + (p.proyecto_nombre || p.proyecto || proyecto), proyecto, '<section class="mg-detail-section"><h3>Detalle del Proyecto</h3>'+grid([['Proyecto',p.proyecto_nombre || p.proyecto || proyecto],['Código',p.proyecto_codigo || p.proyecto],['Ciudad',p.ciudad],['Estado',p.estado],['Zona',p.zona],['Supervisor',p.supervisor],['Equipos',p.equipos],['Parados',p.parados],['Tickets 35d',p.tickets_35d],['MTBC 365d',p.mtbc_365]])+'</section><section class="mg-detail-section"><h3>Equipos del proyecto</h3><div class="mg-table-wrap"><table class="mg-table"><thead><tr><th>Equipo</th><th>Referencia</th><th>Zona</th><th>Estatus servicio</th><th>Operativo</th></tr></thead><tbody>'+ (equipos.length?equipos.map(e=>'<tr><td><button class="mg-link" data-equipo="'+esc(e.numero_equipo)+'">'+esc(e.numero_equipo)+'</button></td><td>'+esc(e.identificacion_sitio)+'</td><td>'+esc(e.zona)+'</td><td>'+esc(e.estatus_servicio)+'</td><td>'+esc(e.estado_operativo)+'</td></tr>').join(''):'<tr><td colspan="5" class="mg-empty">Sin equipos</td></tr>') + '</tbody></table></div></section><section class="mg-detail-section"><h3>Tickets relacionados</h3>'+ticketsTable(tickets)+'</section>');
      bindLinks(document.getElementById('mg-detail-body'));
    }catch(e){ show('Proyecto', proyecto, '<div class="mg-empty">Error: '+esc(e.message)+'</div>'); }
  }
  async function openEquipo(codigo){
    codigo = String(codigo || '').trim(); if(!codigo || codigo === '—') return;
    show('Equipo', codigo, '<div class="mg-empty">Cargando detalle del equipo...</div>');
    try{
      const data = await fetchJson('/api/portafolio/equipos/' + encodeURIComponent(codigo));
      const e = data.data || data.equipo || {};
      show('Equipo · ' + (e.numero_equipo || codigo), e.proyecto || 'Detalle de equipo', '<section class="mg-detail-section"><h3>Detalle del Equipo</h3>'+grid([['Código',e.numero_equipo || codigo],['Proyecto',e.proyecto],['Ciudad',e.ciudad],['Estado',e.estado],['Zona',e.zona],['Supervisor',e.supervisor],['Superintendente',e.superintendente],['Contrato',e.contrato],['Operativo',e.estado_operativo],['Estatus servicio',e.estatus_servicio],['Días parado',e.dias_parado == null ? '—' : e.dias_parado + ' d'],['Último ticket',e.ultimo_ticket],['Última fecha reporte',fmtDate(e.ultimo_fecha_reporte)],['Identificación sitio',e.identificacion_sitio],['Dirección',e.direccion]])+'</section><section class="mg-detail-section"><h3>Accesos relacionados</h3>'+grid([['Proyecto','<button class="mg-link" data-proyecto="'+esc(e.proyecto)+'">'+esc(e.proyecto)+'</button>']])+'</section>');
      const body=document.getElementById('mg-detail-body');
      body.innerHTML = body.innerHTML.replace(/&lt;button/g,'<button').replace(/&lt;\/button&gt;/g,'</button>').replace(/&gt;/g,'>').replace(/&quot;/g,'"');
      bindLinks(body);
    }catch(e){ show('Equipo', codigo, '<div class="mg-empty">Error: '+esc(e.message)+'</div>'); }
  }
  function pickTicket(rows, ticketId){
    const key = ticketKey(ticketId);
    return ticketCache.get(key) || (rows || []).find(t => ticketKey(t.ticket || t.n || t.folio) === key) || null;
  }
  function ticketDetailHtml(t, ticketId){
    const equipo = t.codigo_equipo || t.cod || t.equipo || '';
    const proyecto = t.proyecto || t.pro || '';
    return '<section class="mg-detail-section"><h3>Datos generales</h3>'+grid([
      ['Ticket', t.ticket || t.n || ticketId],
      ['Folio', t.folio],
      ['Estado ticket', t.estado_ticket || t.estado || t.et],
      ['Proyecto', proyecto ? '<button class="mg-link" data-proyecto="'+esc(proyecto)+'">'+esc(proyecto)+'</button>' : '—'],
      ['Equipo', equipo ? '<button class="mg-link" data-equipo="'+esc(equipo)+'">'+esc(equipo)+'</button>' : '—'],
      ['Zona', t.zona || t.zon],
      ['Ciudad', t.ciudad],
      ['Prioridad', t.prioridad || t.pri]
    ])+'</section>'+
    '<section class="mg-detail-section"><h3>Reporte y atención</h3>'+grid([
      ['Fecha reporte', fmtDate(t.fecha_reporte || t.fr)],
      ['Hora reporte', t.h_reporte || t.hr],
      ['Fecha llegada', fmtDate(t.fecha_llegada || t.fl)],
      ['Hora llegada', t.h_llegada || t.hl],
      ['Fecha cierre', fmtDate(t.fecha_cierre || t.fs)],
      ['Hora solución', t.h_solucion || t.hs],
      ['Técnico', t.tecnico || t.tec],
      ['Supervisor', t.supervisor || t.sup],
      ['Persona que atiende', t.persona_que_atiende || t.persona_atiende],
      ['Ejecutivo Call Center', t.ejecutivo_call]
    ])+'</section>'+
    '<section class="mg-detail-section"><h3>Diagnóstico</h3>'+grid([
      ['Estatus inicial', t.estatus_equipo_ir || t.eqi],
      ['Estatus final', t.estatus_equipo_final || t.eqf],
      ['Responsabilidad', t.responsabilidad || t.res],
      ['Causa falla', t.causa_falla || t.caf],
      ['Tiempo llegada', t.tiempo_llegada ?? t.tll],
      ['Tiempo solución', t.tiempo_solucion ?? t.tso],
      ['Tipo equipo', t.tipo_equipo || t.prd],
      ['SLA / excede', t.ticket_excede || t.xat]
    ])+'</section>'+
    '<section class="mg-detail-section"><h3>Descripción y cierre</h3>'+grid([
      ['Referencia zona operativa', t.referencia_en_zona_operativa || t.ref],
      ['Descripción', t.descripcion || t.asu],
      ['Causa', t.causa || t.cau],
      ['Acción en cierre', t.accion_en_cierre || t.acc],
      ['Vo.Bo. estado', t.vobo_estado],
      ['Vo.Bo. comentario', t.vobo_comentario]
    ])+'</section>';
  }
  async function openTicket(ticketId, knownTicket){
    ticketId = ticketKey(ticketId); if(!ticketId || ticketId === '—') return;
    if(knownTicket) registerTickets([knownTicket]);
    show('Ticket', ticketId, '<div class="mg-empty">Cargando detalle del ticket...</div>');
    try{
      let t = null;

      try{
        const data = await fetchJson('/api/tickets/' + encodeURIComponent(ticketId));
        t = data.data || data.ticket || data;
        if(t && (t.ticket || t.folio)) registerTickets([t]);
      }catch(detailErr){
        t = ticketCache.get(ticketId) || knownTicket || null;
        if(!t){
          try{
            const data = await fetchJson('/api/tickets');
            const rows = data.data || data.tickets || [];
            registerTickets(rows);
            t = pickTicket(rows, ticketId);
          }catch(listErr){
            throw detailErr;
          }
        }
      }

      if(!t) t = { ticket: ticketId };
      show('Ticket · ' + (t.ticket || t.n || ticketId), [t.proyecto || t.pro, t.codigo_equipo || t.cod || t.equipo, t.zona || t.zon].filter(Boolean).join(' · ') || 'Detalle de ticket', ticketDetailHtml(t, ticketId));
      const body=document.getElementById('mg-detail-body');
      body.innerHTML = body.innerHTML.replace(/&lt;button/g,'<button').replace(/&lt;\/button&gt;/g,'</button>').replace(/&gt;/g,'>').replace(/&quot;/g,'"');
      bindLinks(body);
    }catch(e){ show('Ticket', ticketId, '<div class="mg-empty">Error: '+esc(e.message)+'</div>'); }
  }
  async function openEquipoCritico(codigo, opts){
    codigo = String(codigo || '').trim(); if(!codigo) return;
    const dias = (opts && opts.dias) || 35;
    show('Equipo crítico', codigo, '<div class="mg-empty">Cargando detalle combinado...</div>');
    try{
      const eqData = await fetchJson('/api/portafolio/equipos/' + encodeURIComponent(codigo));
      const ticketData = await fetchJson('/api/equipos-criticos/' + encodeURIComponent(codigo) + '/tickets?dias=' + encodeURIComponent(dias) + '&responsabilidad=BLT');
      const e = eqData.data || {};
      let projectHtml = '<div class="mg-empty">Proyecto no disponible</div>';
      if(e.proyecto){
        try{
          const pd = await fetchJson('/api/proyectos/detalle/' + encodeURIComponent(e.proyecto));
          const p = pd.proyecto || {};
          projectHtml = grid([['Proyecto','<button class="mg-link" data-proyecto="'+esc(e.proyecto)+'">'+esc(p.proyecto_nombre || e.proyecto)+'</button>'],['Código',p.proyecto_codigo || e.proyecto],['Ciudad',p.ciudad],['Estado',p.estado],['Zona',p.zona],['Supervisor',p.supervisor],['Equipos',p.equipos],['Parados',p.parados],['Tickets 35d',p.tickets_35d]]);
        }catch(e2){ projectHtml = '<div class="mg-empty">No se pudo cargar detalle del proyecto: '+esc(e2.message)+'</div>'; }
      }
      const rows = ticketData.data || ticketData.tickets || [];
      show('Equipo crítico · ' + codigo, (rows.length || 0) + ' tickets relacionados', '<section class="mg-detail-section"><h3>Detalle del Proyecto</h3>'+projectHtml+'</section><section class="mg-detail-section"><h3>Detalle del Equipo</h3>'+grid([['Código','<button class="mg-link" data-equipo="'+esc(codigo)+'">'+esc(codigo)+'</button>'],['Proyecto',e.proyecto],['Ciudad',e.ciudad],['Estado',e.estado],['Zona',e.zona],['Supervisor',e.supervisor],['Estatus servicio',e.estatus_servicio],['Operativo',e.estado_operativo],['Identificación sitio',e.identificacion_sitio]])+'</section><section class="mg-detail-section"><h3>Tickets relacionados al equipo</h3>'+ticketsTable(rows)+'</section>');
      const body=document.getElementById('mg-detail-body'); body.innerHTML=body.innerHTML.replace(/&lt;button/g,'<button').replace(/&lt;\/button&gt;/g,'</button>').replace(/&gt;/g,'>').replace(/&quot;/g,'"'); bindLinks(body);
    }catch(e){ show('Equipo crítico', codigo, '<div class="mg-empty">Error: '+esc(e.message)+'</div>'); }
  }
  window.ManttoDetails = { show, close, openProyecto, openEquipo, openTicket, openEquipoCritico, bindLinks, ticketsTable, registerTickets };
})();

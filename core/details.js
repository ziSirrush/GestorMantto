(function(){
  const API = () => (window.MANTTO_API_BASE || 'http://localhost:3001').replace(/\/$/, '');
  const ticketCache = new Map();
  const projectPhotoState = { photos:[], index:0, projectId:'', projectName:'', principalUrl:'' };
  function ticketKey(v){ return String(v || '').trim(); }
  function registerTickets(rows){
    (rows || []).forEach(t => {
      const k = ticketKey(t && (t.ticket || t.n || t.folio));
      if(k) ticketCache.set(k, Object.assign({}, ticketCache.get(k) || {}, t));
    });
  }
  function esc(v){ return String(v == null || v === '' ? '—' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function fmtDate(v){
    if(!v) return '—';
    const s=String(v).trim();

    // Fechas operativas DATE/ISO: conservar el día recibido y no reinterpretar UTC.
    let m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(m) return m[3]+'/'+m[2]+'/'+m[1];

    // Fechas ya formateadas para México.
    m=s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if(m) return m[1]+'/'+m[2]+'/'+m[3];

    // Formato alternativo de MySQL: AAAA/MM/DD.
    m=s.match(/^(\d{4})\/(\d{2})\/(\d{2})/);
    if(m) return m[3]+'/'+m[2]+'/'+m[1];

    // No convertir cadenas desconocidas a Date: evita cambiar el día por zona horaria.
    return esc(s);
  }
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
  async function patchJson(path, body){
    const headers = Object.assign({ 'Accept':'application/json', 'Content-Type':'application/json' }, window.ManttoAuth && window.ManttoAuth.authHeaders ? window.ManttoAuth.authHeaders() : {});
    const r = await fetch(API() + path, { method:'PATCH', headers, body:JSON.stringify(body || {}), cache:'no-store' });
    const text = await r.text();
    let data = null;
    try { data = text ? JSON.parse(text) : {}; }
    catch(e){ throw new Error('Respuesta inválida del backend.'); }
    if(!r.ok || data.ok === false) throw new Error(data.message || data.error || 'No fue posible actualizar la foto principal');
    return data;
  }
  function isProgramador(){
    const u=window.ManttoAuth&&window.ManttoAuth.getUser?window.ManttoAuth.getUser():{};
    const roles=[u&&u.rol].concat((u&&u.roles)||[]).concat(((u&&u.roles_detalle)||[]).map(r=>r&&r.rol)).filter(Boolean).map(v=>String(v).trim().toLowerCase());
    return Boolean(u&&u.is_programador)||roles.includes('programador');
  }
  function currentDetailMatches(type, id){
    if(!window.ManttoRouter || !window.ManttoRouter.getCurrent) return false;
    const current = window.ManttoRouter.getCurrent();
    return current.route === 'detalle' && current.payload && current.payload.type === type && String(current.payload.id || '') === String(id || '');
  }
  function navigate(type, id, extra){
    if(!window.ManttoRouter || !window.ManttoRouter.go) return false;
    window.ManttoRouter.go('detalle', Object.assign({ type, id:String(id || '') }, extra || {}));
    return true;
  }
  function ensure(){
    let view = document.getElementById('view-detalle');
    if(!view){
      view = document.createElement('section');
      view.id = 'view-detalle';
      view.className = 'view mg-detail-view';
      view.dataset.view = 'detalle';
      view.setAttribute('aria-label', 'Detalle');
      const main = document.querySelector('.main-content');
      if(main) main.appendChild(view);
    }
    if(!document.getElementById('mg-detail-styles')){
      const css = document.createElement('style');
      css.id = 'mg-detail-styles';
      css.textContent = `
        .mg-detail-view{min-height:100%;background:#F8FAFC;padding:0 0 24px}
        .mg-detail-page{width:100%;min-height:100%;display:flex;flex-direction:column}
        .mg-detail-head{background:#0D2E6E;color:#fff;padding:16px 20px;display:flex;align-items:center;gap:14px;border-radius:14px 14px 0 0}
        .mg-detail-head-copy{min-width:0}.mg-detail-head h2{font-size:18px;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mg-detail-head p{margin:3px 0 0;color:rgba(255,255,255,.76);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .mg-detail-body{padding:16px;overflow:visible;background:#F8FAFC}
        .mg-detail-section{background:#fff;border:1px solid rgba(13,46,110,.18);border-radius:12px;margin-bottom:14px;overflow:hidden}.mg-detail-section h3{margin:0;padding:10px 14px;background:#EFF6FF;color:#0D2E6E;font-size:13px}.mg-detail-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:0}.mg-field{padding:10px 12px;border-right:1px solid #EEF2FF;border-bottom:1px solid #EEF2FF}.mg-field label{display:block;font-size:10px;color:#64748B;text-transform:uppercase;font-weight:700;margin-bottom:3px}.mg-field span{font-size:12px;color:#1E293B}.mg-table-wrap{overflow:auto}.mg-table{width:100%;border-collapse:collapse;min-width:760px}.mg-table th{background:#0D2E6E;color:#fff;text-align:left;font-size:11px;padding:8px}.mg-table td{font-size:12px;padding:8px;border-bottom:1px solid #E2E8F0;color:#334155}.mg-link{border:0;background:transparent;color:#1B4FD8;text-decoration:underline;cursor:pointer;font:inherit;padding:0}.mg-empty{padding:18px;text-align:center;color:#64748B}

        .mg-company-block{background:#fff;border:1px solid rgba(13,46,110,.18);border-radius:14px;margin-bottom:16px;overflow:hidden;box-shadow:0 6px 18px rgba(15,23,42,.05)}
        .mg-company-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;color:#fff}.mg-company-head h3{margin:0;font-size:14px}.mg-company-head p{margin:3px 0 0;font-size:11px;color:rgba(255,255,255,.78)}
        .mg-company-block.corellian .mg-company-head{background:#0D2E6E}.mg-company-block.united .mg-company-head{background:#0D2E6E}.mg-company-content{padding:14px}.mg-company-content .mg-detail-section:last-child{margin-bottom:0}
        .mg-chart-grid{display:grid;grid-template-columns:minmax(260px,.8fr) minmax(360px,1.2fr);gap:14px}.mg-chart-card{border:1px solid #E2E8F0;border-radius:12px;padding:14px;background:#fff}.mg-chart-card h4{margin:0 0 12px;color:#0D2E6E;font-size:13px}
        .mg-bar-row{display:grid;grid-template-columns:minmax(90px,160px) 1fr 48px;gap:10px;align-items:center;margin:9px 0}.mg-bar-label{font-size:11px;color:#475569;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mg-bar-track{height:16px;border-radius:999px;background:#E9EFF8;overflow:hidden}.mg-bar-fill{height:100%;border-radius:inherit;background:linear-gradient(90deg,#1B4FD8,#0D2E6E);min-width:0}.mg-bar-value{text-align:right;font-size:11px;font-weight:800;color:#0D2E6E}
        .mg-project-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:14px}.mg-project-kpi{border:1px solid #E2E8F0;border-radius:11px;background:#F8FAFC;padding:11px}.mg-project-kpi span{display:block;font-size:9px;text-transform:uppercase;font-weight:800;color:#64748B}.mg-project-kpi strong{display:block;margin-top:4px;color:#0D2E6E;font-size:20px}.mg-project-kpi-button{width:100%;text-align:left;cursor:pointer;font:inherit}.mg-project-kpi-button:hover{border-color:#1B4FD8;background:#EFF6FF}.mg-project-kpi-button.is-active{border-color:#1B4FD8;background:#DBEAFE;box-shadow:0 0 0 2px rgba(27,79,216,.12)}.mg-project-equipment-row[hidden]{display:none}.mg-project-equipment-empty{display:none}.mg-project-equipment-empty.is-visible{display:table-row}
        .mg-equipment-identity{background:#fff;border:1px solid rgba(13,46,110,.18);border-radius:12px;margin-bottom:14px;padding:14px 16px}.mg-equipment-identity h3{margin:0;color:#0D2E6E;font-size:20px}.mg-equipment-identity strong{display:block;margin-top:4px;color:#1E293B;font-size:13px}.mg-equipment-identity span{display:inline-flex;margin-top:7px;padding:4px 9px;border-radius:999px;background:#EAF1FF;color:#0D2E6E;font-size:10px;font-weight:800}
        .mg-progress-panel{background:#fff;border:1px solid rgba(13,46,110,.18);border-radius:12px;margin-bottom:14px;overflow:hidden}.mg-progress-panel-title{margin:0;padding:10px 14px;background:#EFF6FF;color:#0D2E6E;font-size:13px}.mg-progress-list{padding:12px 14px}.mg-progress-item{border-bottom:1px solid #E2E8F0;padding:10px 0}.mg-progress-item:last-child{border-bottom:0}.mg-progress-button{display:block;width:100%;border:0;background:transparent;padding:0;cursor:pointer;text-align:left;color:inherit}.mg-progress-button:focus-visible{outline:2px solid #1B4FD8;outline-offset:4px;border-radius:6px}.mg-progress-label-row{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:7px}.mg-progress-label{font-size:11px;font-weight:800;color:#334155}.mg-progress-percent{font-size:11px;font-weight:900;color:#0D2E6E}.mg-progress-track{height:7px;border-radius:999px;background:#E2E8F0;overflow:hidden}.mg-progress-fill{height:100%;border-radius:inherit;transition:width .25s ease}.mg-progress-fill.general{background:#1B4FD8}.mg-progress-fill.oc{background:#C83B3B}.mg-progress-fill.mo{background:#D7A514}.mg-progress-fill.aj{background:#238B45}.mg-progress-chevron{display:inline-block;margin-left:6px;font-size:10px;transition:transform .2s ease}.mg-progress-item.is-open .mg-progress-chevron{transform:rotate(180deg)}.mg-progress-detail{display:none;margin-top:11px;border:1px solid #E2E8F0;border-radius:10px;overflow:hidden;background:#F8FAFC}.mg-progress-item.is-open .mg-progress-detail{display:block}
        .mg-clickable-row{cursor:pointer}.mg-clickable-row:hover td{background:#EFF6FF}.mg-clickable-row:focus-visible{outline:2px solid #1B4FD8;outline-offset:-2px}.mg-project-equipment-table{min-width:1180px}.mg-project-ticket-table{min-width:2100px}.mg-ticket-group td{background:#EAF1FF!important;color:#0D2E6E!important;font-weight:900;border-top:2px solid #BFDBFE}.mg-ticket-group span{font-weight:600;color:#64748B;margin-left:8px}.mg-section-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;background:#EFF6FF;padding-right:14px}.mg-section-toolbar h3{flex:1}.mg-section-toolbar label{display:flex;align-items:center;gap:7px;color:#0D2E6E;font-size:11px;font-weight:800}.mg-section-toolbar select{border:1px solid #BFDBFE;border-radius:8px;background:#fff;padding:6px 28px 6px 9px;color:#0D2E6E;font-weight:700}
        .mg-equipment-kpi-group{margin-bottom:14px}.mg-equipment-kpi-group h4{margin:0 0 8px;color:#0D2E6E;font-size:11px;text-transform:uppercase;letter-spacing:.05em}.mg-equipment-kpis{display:grid;gap:9px}.mg-equipment-kpis.cols-6{grid-template-columns:repeat(6,minmax(0,1fr))}.mg-equipment-kpis.cols-4{grid-template-columns:repeat(4,minmax(0,1fr))}.mg-equipment-kpi{border:1px solid #D7E1F1;border-radius:11px;background:#F8FAFC;padding:10px;text-align:left;min-height:76px}.mg-equipment-kpi{cursor:default}.mg-equipment-kpi span{display:block;color:#64748B;font-size:9px;font-weight:800;text-transform:uppercase}.mg-equipment-kpi strong{display:block;margin-top:5px;color:#0D2E6E;font-size:20px}.mg-equipment-charts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;padding:14px}.mg-line-chart{border:1px solid #E2E8F0;border-radius:11px;padding:12px;background:#fff}.mg-line-chart h4{margin:0;color:#0D2E6E;font-size:12px}.mg-line-chart p{margin:3px 0 10px;color:#64748B;font-size:10px}.mg-line-chart svg{display:block;width:100%;height:auto}.mg-line-chart .grid{stroke:#E2E8F0;stroke-width:1}.mg-line-chart .axis-label{fill:#64748B;font-size:8px}.mg-line-chart .line{fill:none;stroke:#1B4FD8;stroke-width:2.5}.mg-line-chart .point{fill:#fff;stroke:#1B4FD8;stroke-width:2}.mg-service-panel-toggle{width:100%;border:0;background:#EFF6FF;color:#0D2E6E;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;font-weight:800;cursor:pointer}.mg-service-months{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;padding:12px}.mg-service-month{border:1px solid #FED7AA;border-radius:10px;background:#FFF7ED;padding:10px;text-align:center;min-height:66px}.mg-service-month.confirmed{border-color:#86EFAC;background:#F0FDF4}.mg-service-month button{border:0;background:transparent;width:100%;cursor:pointer;color:inherit}.mg-service-month button:disabled{cursor:default}.mg-service-month strong{display:block;color:#0D2E6E;font-size:10px}.mg-service-month span{display:block;margin-top:4px;color:#D97706;font-size:9px}.mg-service-month.confirmed span{color:#15803D}.mg-equipment-ticket-table{min-width:2100px}.mg-equipment-ticket-row[hidden]{display:none}.mg-mobile-fold-title{display:none}
        .mg-compact-table{width:100%;border-collapse:collapse}.mg-compact-table th{background:#0D2E6E;color:#fff;text-align:left;font-size:10px;padding:8px;white-space:nowrap}.mg-compact-table td{font-size:11px;color:#334155;padding:9px 8px;border-bottom:1px solid #E2E8F0;vertical-align:top}.mg-compact-table tr:last-child td{border-bottom:0}.mg-compact-table-wrap{overflow:auto}.mg-section-hidden{display:none!important}
        .mg-project-overview{display:grid;grid-template-columns:minmax(250px,36%) 1fr;gap:14px;margin-bottom:14px}.mg-project-overview.no-photo{grid-template-columns:1fr}.mg-project-cover{display:block;width:100%;height:260px;border:0;border-radius:12px;overflow:hidden;padding:0;background:#E2E8F0;cursor:pointer;box-shadow:0 6px 18px rgba(15,23,42,.08)}.mg-project-cover img{display:block;width:100%;height:100%;object-fit:cover;object-position:center}.mg-project-overview .mg-detail-section{margin-bottom:0}
        .mg-stage-bars{background:#fff;border:1px solid rgba(13,46,110,.18);border-radius:12px;padding:14px;margin-bottom:14px}.mg-stage-row{margin:11px 0}.mg-stage-row:first-child{margin-top:0}.mg-stage-row:last-child{margin-bottom:0}.mg-stage-meta{display:flex;justify-content:space-between;gap:12px;margin-bottom:7px;font-size:11px;font-weight:800;color:#334155}.mg-stage-track{height:9px;border-radius:999px;background:#E2E8F0;overflow:hidden}.mg-stage-fill{height:100%;border-radius:inherit}.mg-stage-fill.general{background:#1B4FD8}.mg-stage-fill.oc{background:#C83B3B}.mg-stage-fill.mo{background:#D7A514}.mg-stage-fill.aj{background:#238B45}
        .mg-photo-lightbox{position:fixed;inset:0;z-index:10050;background:rgba(2,6,23,.92);display:grid;place-items:center;padding:28px}.mg-photo-lightbox[hidden]{display:none}.mg-photo-lightbox figure{margin:0;max-width:min(1120px,88vw);text-align:center}.mg-photo-lightbox img{display:block;max-width:100%;max-height:76vh;margin:auto;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.45)}.mg-photo-lightbox figcaption{color:#fff;margin-top:10px;font-size:12px}.mg-photo-close,.mg-photo-nav{position:absolute;border:0;background:rgba(255,255,255,.14);color:#fff;cursor:pointer}.mg-photo-close{top:18px;right:22px;width:44px;height:44px;border-radius:50%;font-size:30px}.mg-photo-nav{top:50%;transform:translateY(-50%);width:50px;height:70px;border-radius:12px;font-size:46px}.mg-photo-nav.prev{left:18px}.mg-photo-nav.next{right:18px}.mg-photo-principal{margin-top:14px;border:1px solid rgba(255,255,255,.45);border-radius:10px;background:#0D2E6E;color:#fff;padding:10px 15px;font-weight:800;cursor:pointer}.mg-photo-principal:disabled{background:#475569;cursor:default;opacity:.9}
        @media(max-width:900px){.mg-project-overview{grid-template-columns:1fr}.mg-project-cover{height:210px}.mg-chart-grid{grid-template-columns:1fr}.mg-project-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.mg-equipment-kpis.cols-6,.mg-equipment-kpis.cols-4{grid-template-columns:repeat(3,minmax(0,1fr))}.mg-equipment-charts{grid-template-columns:1fr}.mg-service-months{grid-template-columns:repeat(2,minmax(0,1fr))}}
        @media(max-width:760px){.mg-detail-view{padding:0}.mg-detail-head{border-radius:0;padding:12px;align-items:flex-start}.mg-detail-head h2{font-size:16px}.mg-detail-body{padding:10px}.mg-detail-grid{grid-template-columns:1fr}.mg-table{min-width:680px}.mg-equipment-kpis.cols-6,.mg-equipment-kpis.cols-4{grid-template-columns:repeat(2,minmax(0,1fr))}.mg-service-months{grid-template-columns:repeat(2,minmax(0,1fr))}}
      `;
      document.head.appendChild(css);
    }
    if(!view.querySelector('.mg-detail-page')){
      view.innerHTML = '<div class="mg-detail-page"><div class="mg-detail-head"><div class="mg-detail-head-copy"><h2 id="mg-detail-title">Detalle</h2><p id="mg-detail-sub">Mantto Gestor</p></div></div><div class="mg-detail-body" id="mg-detail-body"></div></div>';
    }
    if(!document.getElementById('mg-photo-lightbox')){
      const lightbox=document.createElement('div');
      lightbox.id='mg-photo-lightbox';
      lightbox.className='mg-photo-lightbox';
      lightbox.hidden=true;
      lightbox.innerHTML='<button type="button" class="mg-photo-close" aria-label="Cerrar">×</button><button type="button" class="mg-photo-nav prev" aria-label="Anterior">‹</button><figure><img alt="Fotografía del proyecto"><figcaption></figcaption><button type="button" class="mg-photo-principal">Usar como foto principal</button></figure><button type="button" class="mg-photo-nav next" aria-label="Siguiente">›</button>';
      document.body.appendChild(lightbox);
      lightbox.querySelector('.mg-photo-close').addEventListener('click',closeProjectPhotoLightbox);
      lightbox.querySelector('.mg-photo-nav.prev').addEventListener('click',()=>moveProjectPhoto(-1));
      lightbox.querySelector('.mg-photo-nav.next').addEventListener('click',()=>moveProjectPhoto(1));
      lightbox.querySelector('.mg-photo-principal').addEventListener('click',selectProjectPrincipalPhoto);
      lightbox.addEventListener('click',e=>{if(e.target===lightbox)closeProjectPhotoLightbox();});
    }
    return view;
  }
  function show(title, sub, html){
    ensure();
    const titleEl=document.getElementById('mg-detail-title');
    const subEl=document.getElementById('mg-detail-sub');
    const body=document.getElementById('mg-detail-body');
    if(titleEl) titleEl.textContent=title||'Detalle';
    if(subEl) subEl.textContent=sub||'Mantto Gestor';
    if(body) body.innerHTML=html||'';
  }
  function close(){
    if(window.ManttoRouter && window.ManttoRouter.back) window.ManttoRouter.back();
  }
  function render(payload){
    const type = payload && payload.type;
    const id = payload && payload.id;
    if(type === 'proyecto') return openProyecto(id, payload || {});
    if(type === 'equipo') return openEquipo_gnral(id);
    if(type === 'ticket') return openTicket(id, payload && payload.knownTicket);
    if(type === 'equipo-critico') return openEquipoCritico(id, payload && payload.options);
    show('Detalle', 'Mantto Gestor', '<div class="mg-empty">No se indicó un detalle válido.</div>');
  }
  function grid(items){ return '<div class="mg-detail-grid">'+items.map(([k,v])=>'<div class="mg-field"><label>'+esc(k)+'</label><span>'+esc(v)+'</span></div>').join('')+'</div>'; }

  function renderIdentifierVisual(codes, text, options){
    if(window.EstadosVisuales_gnral && window.EstadosVisuales_gnral.renderIdentifier){
      return window.EstadosVisuales_gnral.renderIdentifier(codes||[],text,options||{});
    }
    return esc(text);
  }
  function legendHostVisual(codes, excludeCodes){
    const list=(Array.isArray(codes)?codes:[]).filter(Boolean).join(',');
    const excluded=(Array.isArray(excludeCodes)?excludeCodes:[]).filter(Boolean).join(',');
    return '<div class="estado-leyenda-host-gnral" data-estados-leyenda="'+esc(list)+'"'+(excluded?' data-estados-excluir="'+esc(excluded)+'"':'')+'></div>';
  }
  function visualCodesTicket(ticket){
    return window.EstadosVisuales_gnral && window.EstadosVisuales_gnral.codesForTicket
      ? window.EstadosVisuales_gnral.codesForTicket(ticket||{}) : [];
  }
  function isCriticalEquipmentByTickets(code, tickets){
    const target=String(code||'').trim();
    if(!target) return false;
    if(window.EstadosVisuales_gnral && window.EstadosVisuales_gnral.isCriticoEquipo) return window.EstadosVisuales_gnral.isCriticoEquipo(target);
    const year=String(new Date().getFullYear());
    return (tickets||[]).filter(t=>{
      const ticketCode=String(t.codigo_equipo||t.cod||t.equipo||'').trim();
      const date=String(t.fecha_reporte||t.fr||'').slice(0,10);
      const resp=String(t.responsabilidad||t.res||'').toUpperCase();
      return ticketCode===target && date.slice(0,4)===year && resp.includes('BLT');
    }).length>=3;
  }
  function visualCodesEquipo(equipo,tickets){
    const code=String((equipo&&equipo.numero_equipo)||'').trim();
    const own=(tickets||[]).filter(t=>String(t.codigo_equipo||t.cod||t.equipo||'').trim()===code);
    if(window.EstadosVisuales_gnral && window.EstadosVisuales_gnral.codesForEquipo){
      return window.EstadosVisuales_gnral.codesForEquipo(equipo||{},own,{critico:isCriticalEquipmentByTickets(code,tickets)});
    }
    return isCriticalEquipmentByTickets(code,tickets)?['CRITICO']:[];
  }
  function ticketsTable(rows){
    if(!rows || !rows.length) return '<div class="mg-empty">Sin tickets relacionados</div>';
    return legendHostVisual(['CRITICO','ATRAPADO','FILTRACION','VOLTAJE','NO_FUNCIONANDO','FUERA_SLA'])+'<div class="mg-table-wrap"><table class="mg-table"><thead><tr><th>Ticket</th><th>Fecha</th><th>Estado</th><th>Proyecto</th><th>Equipo</th><th>Responsabilidad</th><th>Causa</th></tr></thead><tbody>' + rows.map(t=>{const ticketId=t.ticket||t.n||'';const ticketCodes=visualCodesTicket(t);return '<tr><td><button class="mg-link" data-ticket="'+esc(ticketId)+'">'+renderIdentifierVisual(ticketCodes,ticketId)+'</button></td><td>'+fmtDate(t.fecha_reporte || t.fr)+'</td><td>'+esc(t.estado_ticket || t.estado || t.et)+'</td><td><button class="mg-link" data-proyecto="'+esc(t.proyecto || t.pro || '')+'">'+esc(t.proyecto || t.pro)+'</button></td><td><button class="mg-link" data-equipo="'+esc(t.codigo_equipo || t.cod || '')+'">'+esc(t.codigo_equipo || t.cod)+'</button></td><td>'+esc(t.responsabilidad || t.res)+'</td><td>'+esc(t.causa_falla || t.causa || t.caf)+'</td></tr>';}).join('') + '</tbody></table></div>';
  }
  function bindLinks(root){
    (root || document).querySelectorAll('[data-proyecto]').forEach(el=>el.addEventListener('click', ev=>{ ev.preventDefault(); ev.stopPropagation(); openProyecto(el.getAttribute('data-proyecto')); }));
    (root || document).querySelectorAll('[data-equipo]').forEach(el=>el.addEventListener('click', ev=>{ ev.preventDefault(); ev.stopPropagation(); openEquipo_gnral(el.getAttribute('data-equipo')); }));
    (root || document).querySelectorAll('[data-ticket]').forEach(el=>el.addEventListener('click', ev=>{ ev.preventDefault(); ev.stopPropagation(); openTicket(el.getAttribute('data-ticket')); }));
  }
  function bindProjectEquipmentKpis(root){
    const scope=root||document;
    const buttons=Array.from(scope.querySelectorAll('[data-project-equipment-filter]'));
    const rows=Array.from(scope.querySelectorAll('[data-project-equipment-row]'));
    const empty=scope.querySelector('[data-project-equipment-empty]');
    if(!buttons.length||!rows.length) return;
    buttons.forEach(button=>button.addEventListener('click',()=>{
      const filter=button.getAttribute('data-project-equipment-filter')||'all';
      const alreadyActive=button.classList.contains('is-active');
      buttons.forEach(item=>item.classList.remove('is-active'));
      const effective=alreadyActive?'all':filter;
      if(!alreadyActive&&filter!=='all') button.classList.add('is-active');
      let visible=0;
      rows.forEach(row=>{
        const showRow=effective==='all'||row.getAttribute('data-is-stopped')==='1';
        row.hidden=!showRow;
        if(showRow) visible+=1;
      });
      if(empty) empty.classList.toggle('is-visible',visible===0);
    }));
  }
  function toPct(value){
    const n=Number(String(value == null ? '' : value).replace('%','').trim());
    return Number.isFinite(n) ? Math.max(0,Math.min(100,n)) : 0;
  }
  function average(values){
    const nums=(values||[]).map(toPct);
    return nums.length ? Math.round(nums.reduce((sum,n)=>sum+n,0)/nums.length) : 0;
  }
  function valueOf(row, keys){
    for(const key of keys){
      const value=row && row[key];
      if(value !== null && value !== undefined && String(value).trim() !== '') return value;
    }
    return '';
  }
  function barsHtml(items){
    return (items||[]).map(item=>{
      const pct=toPct(item.value);
      return '<div class="mg-bar-row"><div class="mg-bar-label" title="'+esc(item.label)+'">'+esc(item.label)+'</div><div class="mg-bar-track"><div class="mg-bar-fill" style="width:'+pct+'%"></div></div><div class="mg-bar-value">'+pct+'%</div></div>';
    }).join('') || '<div class="mg-empty">Sin avances disponibles.</div>';
  }
  function equipmentProgress(row){
    return average([valueOf(row,['avance_oc','OC']),valueOf(row,['avance_mo','MO']),valueOf(row,['avance_aj','AJ','avance_ajuste'])]);
  }
  function projectGeneral(coreRows, options){
    const first=coreRows[0]||{};
    return [['Proyecto',valueOf(first,['proyecto'])||options.projectName||options.id],['ID proyecto',valueOf(first,['id_proyecto'])||options.id],['Cliente',valueOf(first,['cliente'])||options.cliente],['Ciudad',valueOf(first,['ciudad'])],['Estado',valueOf(first,['estado'])],['Supervisor',valueOf(first,['supervisor_nombre','supervisor_fl','id_sup'])],['Asesor',valueOf(first,['asesor_nombre','vendedor','id_asesor'])],['ADMIN', valueOf(first,['rel_admin','rel_administrativo','administrativo_nombre','administrativo'])]];
  }
  async function optionalJson(path){try{return await fetchJson(path);}catch(e){return null;}}
  function projectPhotos(row){
    const fields=[['foto_blt_1','FOTO BLT'],['foto_blt_2','FOTO BLT 2'],['foto_blt_3','FOTO BLT 3'],['foto_blt_4','FOTO BLT 4'],['foto_blt_5','FOTO BLT 5'],['foto_blt_6','FOTO BLT 6'],['foto_blt_7','FOTO BLT 7']];
    return fields.map(([campo,alias],index)=>({campo,url:String((row&&(row[alias]||row[campo]))||'').trim(),label:'Foto '+(index+1)})).filter(item=>/^https?:\/\//i.test(item.url));
  }
  function projectPrincipalUrl(row, photos){
    const direct=String(row&&row.foto_portada||'').trim();
    if(/^https?:\/\//i.test(direct)) return direct;
    const selected=String(row&&row.foto_principal||'').trim();
    const match=(photos||[]).find(item=>item.campo===selected);
    return match?match.url:((photos&&photos[0]&&photos[0].url)||'');
  }
  function openProjectPhotoLightbox(projectId, projectName, photos, principalUrl){
    if(!photos||!photos.length)return;
    ensure();
    projectPhotoState.photos=photos.slice();
    projectPhotoState.index=Math.max(0,photos.findIndex(item=>item.url===principalUrl));
    projectPhotoState.projectId=String(projectId||'');
    projectPhotoState.projectName=String(projectName||'');
    projectPhotoState.principalUrl=String(principalUrl||'');
    renderProjectPhotoLightbox();
    document.getElementById('mg-photo-lightbox').hidden=false;
  }
  function renderProjectPhotoLightbox(){
    const lightbox=document.getElementById('mg-photo-lightbox');
    const item=projectPhotoState.photos[projectPhotoState.index];
    if(!lightbox||!item)return;
    lightbox.querySelector('img').src=item.url;
    lightbox.querySelector('figcaption').textContent=(projectPhotoState.projectName||'Proyecto')+' · '+item.label+' ('+(projectPhotoState.index+1)+'/'+projectPhotoState.photos.length+')';
    const nav=projectPhotoState.photos.length>1;
    lightbox.querySelector('.mg-photo-nav.prev').style.display=nav?'block':'none';
    lightbox.querySelector('.mg-photo-nav.next').style.display=nav?'block':'none';
    const btn=lightbox.querySelector('.mg-photo-principal');
    const allowed=isProgramador();
    btn.style.display=allowed?'inline-block':'none';
    btn.disabled=allowed&&item.url===projectPhotoState.principalUrl;
    btn.textContent=btn.disabled?'Foto principal actual':'Usar como foto principal';
  }
  function moveProjectPhoto(delta){
    const total=projectPhotoState.photos.length;if(!total)return;
    projectPhotoState.index=(projectPhotoState.index+delta+total)%total;renderProjectPhotoLightbox();
  }
  function closeProjectPhotoLightbox(){const el=document.getElementById('mg-photo-lightbox');if(el)el.hidden=true;}
  async function selectProjectPrincipalPhoto(){
    if(!isProgramador())return;
    const item=projectPhotoState.photos[projectPhotoState.index];if(!item||!item.campo||!projectPhotoState.projectId)return;
    try{
      await patchJson('/api/ins-fl/proyectos/fotografias/'+encodeURIComponent(projectPhotoState.projectId)+'/principal',{campo:item.campo});
      projectPhotoState.principalUrl=item.url;
      const hero=document.getElementById('mg-project-cover-image');if(hero)hero.src=item.url;
      renderProjectPhotoLightbox();
    }catch(error){window.alert(error.message||'No fue posible actualizar la foto principal.');}
  }
  async function openUnifiedClientProject(proyecto, options){
    show('Proyecto',options.projectName||proyecto,'<div class="mg-empty">Preparando expediente unificado del cliente...</div>');
    const projectName=String(options.projectName||'').trim();
    const [insResponse,unitedResponse,photoResponse]=await Promise.all([fetchJson('/api/ins-fl?limit=5000'),optionalJson('/api/portafolio/proyectos/detalle/'+encodeURIComponent(projectName||proyecto)),optionalJson('/api/ins-fl/proyectos/fotografias?id_ppns='+encodeURIComponent(proyecto)+'&limit=50')]);
    const allRows=Array.isArray(insResponse)?insResponse:(insResponse.data||insResponse.rows||[]);
    const coreRows=allRows.filter(row=>{
      const rowId=String(valueOf(row,['id_proyecto','ID PROYECTO'])||'').trim().toUpperCase();
      const rowProject=String(valueOf(row,['proyecto','PROYECTO'])||'').trim().toUpperCase();
      return rowId===String(proyecto).trim().toUpperCase()||(projectName&&rowProject===projectName.toUpperCase());
    });
    const first=coreRows[0]||{};
    const resolvedName=valueOf(first,['proyecto'])||projectName||proyecto;
    const photoRows=photoResponse?(Array.isArray(photoResponse)?photoResponse:(photoResponse.data||[])):[];
    const photoRow=photoRows.find(row=>String(valueOf(row,['ID Proyecto','id_ppns','id_proyecto'])||'').trim().toUpperCase()===String(proyecto).trim().toUpperCase())||photoRows[0]||{};
    const photos=projectPhotos(photoRow);
    const principalUrl=projectPrincipalUrl(photoRow,photos);
    const phaseBars=[{label:'Obra Civil',value:average(coreRows.map(r=>valueOf(r,['avance_oc','OC'])))},{label:'Montaje',value:average(coreRows.map(r=>valueOf(r,['avance_mo','MO'])))},{label:'Ajuste',value:average(coreRows.map(r=>valueOf(r,['avance_aj','AJ','avance_ajuste'])))}];
    const equipmentBars=coreRows.map(row=>({label:valueOf(row,['referencia_sitio','REFERENCIA EN SITIO'])||'Equipo',value:equipmentProgress(row)}));
    const overall=average(equipmentBars.map(item=>item.value));
    const closed=coreRows.filter(row=>String(valueOf(row,['estatus','ESTATUS'])).trim().toUpperCase()==='08-T').length;
    const inProcess=Math.max(0,coreRows.length-closed);
    const coreEquipmentRows=coreRows.length?coreRows.map(row=>{const ref=valueOf(row,['referencia_sitio','REFERENCIA EN SITIO']);const key=resolvedName&&ref?resolvedName+'|||'+ref:ref;return '<tr><td><button class="mg-link" data-equipo="'+esc(key)+'">'+esc(ref)+'</button></td><td>'+esc(valueOf(row,['estatus','ESTATUS']))+'</td><td>'+fmtDate(valueOf(row,['fecha_visita','FECHA VISITA']))+'</td><td>'+fmtDate(valueOf(row,['fecha_fin_montaje_real','FIN DE MONTAJE REAL']))+'</td><td>'+fmtDate(valueOf(row,['fecha_fin_ajuste_real','FIN DE AJUSTE REAL']))+'</td><td>'+equipmentProgress(row)+'%</td></tr>';}).join(''):'<tr><td colspan="6" class="mg-empty">Sin equipos de Instalaciones.</td></tr>';
    const generalPct=Math.round((toPct(phaseBars[0].value)*.4)+(toPct(phaseBars[1].value)*.4)+(toPct(phaseBars[2].value)*.2));
    const overview='<div class="mg-project-overview '+(principalUrl?'':'no-photo')+'">'+(principalUrl?'<button type="button" class="mg-project-cover" data-project-photo-open aria-label="Abrir fotografías del proyecto"><img id="mg-project-cover-image" src="'+esc(principalUrl)+'" alt="Foto principal del proyecto"></button>':'')+'<section class="mg-detail-section"><h3>Información general del proyecto</h3>'+grid(projectGeneral(coreRows,options))+'</section></div>';
    const stageBars='<section class="mg-stage-bars"><div class="mg-stage-row"><div class="mg-stage-meta"><span>Avance General</span><strong>'+generalPct+'%</strong></div><div class="mg-stage-track"><div class="mg-stage-fill general" style="width:'+generalPct+'%"></div></div></div>'+phaseBars.map((item,index)=>{const key=['oc','mo','aj'][index];const weight=['40%','40%','20%'][index];const pct=toPct(item.value);return '<div class="mg-stage-row"><div class="mg-stage-meta"><span>'+esc(item.label)+' ('+weight+')</span><strong>'+pct+'%</strong></div><div class="mg-stage-track"><div class="mg-stage-fill '+key+'" style="width:'+pct+'%"></div></div></div>';}).join('')+'</section>';
    const coreHtml='<section class="mg-company-block corellian"><div class="mg-company-head"><div><h3>CORELLIAN · Instalaciones</h3><p>Información y avances del proyecto de instalación.</p></div></div><div class="mg-company-content">'+overview+'<div class="mg-project-kpis"><article class="mg-project-kpi"><span>Equipos</span><strong>'+coreRows.length+'</strong></article><article class="mg-project-kpi"><span>Terminados</span><strong>'+closed+'</strong></article><article class="mg-project-kpi"><span>En proceso</span><strong>'+inProcess+'</strong></article><article class="mg-project-kpi"><span>Avance promedio</span><strong>'+overall+'%</strong></article></div>'+stageBars+'<section class="mg-detail-section"><h3>Equipos del proyecto</h3><div class="mg-table-wrap"><table class="mg-table"><thead><tr><th>Referencia en sitio</th><th>Estatus</th><th>Fecha visita</th><th>Fin montaje real</th><th>Fin ajuste real</th><th>Avance</th></tr></thead><tbody>'+coreEquipmentRows+'</tbody></table></div></section><div class="mg-chart-grid"><article class="mg-chart-card"><h4>Avance individual por equipo</h4>'+barsHtml(equipmentBars)+'</article></div></div></section>';
    const unitedRoot=unitedResponse&&(unitedResponse.data||unitedResponse);
    const unitedSource=String(unitedResponse&&(unitedResponse.origen||unitedResponse.source)||'').trim().toUpperCase();
    const isUnitedPortafolio=unitedSource==='PORTAFOLIO'||unitedSource==='AIVEN-PORTAFOLIO';
    const up=isUnitedPortafolio&&unitedRoot?(unitedRoot.proyecto||{}):{};
    const unitedEquipos=isUnitedPortafolio&&unitedRoot&&Array.isArray(unitedRoot.equipos)?unitedRoot.equipos:[];
    const unitedTickets=isUnitedPortafolio&&unitedRoot&&Array.isArray(unitedRoot.tickets)?unitedRoot.tickets:[];
    const hasUnited=Boolean(isUnitedPortafolio&&(unitedEquipos.length||unitedTickets.length||up.proyecto||up.proyecto_nombre));
    const unitedRows=unitedEquipos.length?unitedEquipos.map(e=>{const code=String(e.numero_equipo||'').trim();const equipoCell=code?'<button class="mg-link" data-equipo="'+esc(code)+'">'+esc(code)+'</button>':'—';return '<tr><td>'+equipoCell+'</td><td>'+esc(e.identificacion_sitio)+'</td><td>'+esc(e.zona)+'</td><td>'+esc(e.estatus_servicio)+'</td><td>'+esc(e.estado_operativo)+'</td></tr>';}).join(''):'<tr><td colspan="5" class="mg-empty">Sin equipos relacionados en Portafolio.</td></tr>';
    const unitedHtml=hasUnited?'<section class="mg-company-block united"><div class="mg-company-head"><div><h3>UNITED · Operación y Mantenimiento</h3><p>Información relacionada del Portafolio de mantenimiento.</p></div></div><div class="mg-company-content"><section class="mg-detail-section"><h3>Información general de Mantenimiento</h3>'+grid([['Proyecto',up.nombre_publico||up.proyecto_nombre||up.proyecto||resolvedName],['Código',up.proyecto_busqueda||up.proyecto_codigo||up.proyecto],['Ciudad',up.ciudad],['Estado',up.estado],['Zona',up.zona],['Supervisor',up.supervisor],['Equipos',up.equipos||unitedEquipos.length],['Parados',up.parados],['Tickets 35d',up.tickets_35d],['MTBC 365d',up.mtbc_365]])+'</section><section class="mg-detail-section"><h3>Equipos de Mantenimiento</h3>'+legendHostVisual(['CRITICO','ATRAPADO','FILTRACION','VOLTAJE','NO_FUNCIONANDO','FUERA_SLA'])+'<div class="mg-table-wrap"><table class="mg-table"><thead><tr><th>Equipo</th><th>Referencia</th><th>Zona</th><th>Estatus servicio</th><th>Operativo</th></tr></thead><tbody>'+unitedRows+'</tbody></table></div></section><section class="mg-detail-section"><h3>Tickets relacionados</h3>'+ticketsTable(unitedTickets)+'</section></div></section>':'';
    show('Proyecto · '+resolvedName,valueOf(first,['id_proyecto'])||proyecto,coreHtml+unitedHtml);
    const detailRoot=document.getElementById('mg-detail-body');
    bindLinks(detailRoot);
    const photoButton=detailRoot&&detailRoot.querySelector('[data-project-photo-open]');
    if(photoButton)photoButton.addEventListener('click',()=>openProjectPhotoLightbox(proyecto,resolvedName,photos,principalUrl));
  }

  async function openProyecto(proyecto, options){
    options=options||{};
    proyecto = String(proyecto || '').trim(); if(!proyecto || proyecto === '—') return;
    if(!currentDetailMatches('proyecto', proyecto) && navigate('proyecto', proyecto, options)) return;
    if(options.template==='cliente-unificado'||options.source==='instalaciones-concentrado-cliente'){try{return await openUnifiedClientProject(proyecto,options);}catch(e){show('Proyecto',proyecto,'<div class="mg-empty">Error: '+esc(e.message)+'</div>');return;}}
    const currentYear=new Date().getFullYear();
    let selectedYear=Number(options.anio_tickets)||currentYear;
    show('Proyecto', proyecto, '<div class="mg-empty">Cargando detalle del proyecto...</div>');

    const isStopped=e=>{const state=String(e.estado_operativo||e.estatus_equipo_final||'').trim().toUpperCase();return state.includes('NO FUNC')||state.includes('PARAD');};
    const fmtTime=v=>{if(!v)return '—';const value=String(v).trim();const match=value.match(/(?:T|\s)(\d{2}:\d{2})(?::\d{2})?/);if(match)return match[1];const plain=value.match(/^(\d{1,2}:\d{2})/);return plain?plain[1]:value;};
    const fmtDuration=v=>{if(v===null||v===undefined||String(v).trim()==='')return '—';const n=Number(v);return Number.isFinite(n)?(Math.round(n*10)/10)+' h':String(v);};
    const fmtMtbc=v=>{if(v===null||v===undefined||String(v).trim()==='')return '—';const n=Number(v);return Number.isFinite(n)?(Math.round(n*10)/10)+' d':String(v);};
    const normalizeResponsibility=v=>{const value=String(v||'').trim();return value||'—';};

    function equipmentRows(equipos,tickets){
      if(!equipos.length)return '<tr><td colspan="9" class="mg-empty">Sin equipos</td></tr>';
      return equipos.map(e=>{
        const equipoKey=String(e.numero_equipo||'').trim();
        const equipoCodes=visualCodesEquipo(e,tickets);
        const equipoCell=equipoKey?renderIdentifierVisual(equipoCodes,equipoKey):'—';
        return '<tr class="mg-project-equipment-row mg-clickable-row" data-equipo="'+esc(equipoKey)+'" data-is-stopped="'+(isStopped(e)?'1':'0')+'" tabindex="0" role="button">'+
          '<td>'+equipoCell+'</td><td>'+esc(e.identificacion_sitio)+'</td><td>'+esc(e.estado_operativo)+'</td><td>'+esc(e.fallas_blt_anio||0)+'</td><td>'+fmtDate(e.ultimo_blt)+'</td><td>'+esc(e.resp_cliente_anio||0)+'</td><td>'+fmtDate(e.ultimo_cliente)+'</td><td>'+fmtMtbc(e.mtbc_anio)+'</td><td>'+fmtMtbc(e.mtbc_365)+'</td></tr>';
      }).join('');
    }

    function groupedTicketRows(tickets){
      if(!tickets.length)return '<tr><td colspan="16" class="mg-empty">Sin tickets para el año seleccionado.</td></tr>';
      const groups=new Map();
      tickets.forEach(ticket=>{
        const key=String(ticket.codigo_equipo||ticket.equipo||'Sin equipo').trim()||'Sin equipo';
        if(!groups.has(key))groups.set(key,[]);
        groups.get(key).push(ticket);
      });
      return Array.from(groups.entries()).map(([equipo,rows])=>{
        const header='<tr class="mg-ticket-group"><td colspan="16">Equipo: '+esc(equipo)+' <span>'+rows.length+' ticket(s)</span></td></tr>';
        const body=rows.map(t=>{
          const ticketId=String(t.ticket||t.folio||'').trim();
          return '<tr class="mg-clickable-row" data-ticket="'+esc(ticketId)+'" tabindex="0" role="button">'+
            '<td>'+esc(ticketId)+'</td><td>'+fmtDate(t.fecha_reporte)+'</td><td>'+esc(fmtTime(t.h_reporte))+'</td><td>'+esc(t.estado_ticket||t.estado)+'</td><td>'+esc(t.descripcion||t.asunto)+'</td><td>'+esc(t.estatus_equipo_ir)+'</td><td>'+fmtDate(t.fecha_llegada)+'</td><td>'+esc(fmtTime(t.h_llegada))+'</td><td>'+esc(fmtDuration(t.tiempo_llegada))+'</td><td>'+fmtDate(t.fecha_cierre)+'</td><td>'+esc(fmtTime(t.h_solucion))+'</td><td>'+esc(fmtDuration(t.tiempo_solucion))+'</td><td>'+esc(t.estatus_equipo_final)+'</td><td>'+esc(t.causa||t.causa_falla)+'</td><td>'+esc(t.accion_en_cierre)+'</td><td>'+esc(normalizeResponsibility(t.responsabilidad))+'</td></tr>';
        }).join('');
        return header+body;
      }).join('');
    }

    async function load(year){
      selectedYear=Number(year)||currentYear;
      const data=await fetchJson('/api/proyectos/detalle/'+encodeURIComponent(proyecto)+'?anio_tickets='+encodeURIComponent(selectedYear));
      const p=data.proyecto||data.data?.proyecto||{};
      const equipos=data.equipos||data.data?.equipos||[];
      const tickets=data.tickets||data.data?.tickets||[];
      const years=Array.from(new Set((data.ticket_years||[]).map(Number).filter(Boolean).concat([selectedYear]))).sort((a,b)=>b-a);
      registerTickets(tickets);
      const totalEquipos=equipos.length||Number(p.equipos||0);
      const totalParados=equipos.length?equipos.filter(isStopped).length:Number(p.parados||0);
      const general=[['Ciudad',p.ciudad],['Estado',p.estado],['Estatus de servicio',p.estatus_servicio],['Zona Op',p.zona_operativa||p.zona],['Dirección',p.direccion],['Fecha instalación',fmtDate(p.fecha_instalacion)],['Fecha ingreso Portafolio',fmtDate(p.fecha_ingreso_portafolio)],['Superintendente',p.superintendente],['Supervisor',p.supervisor_zona||p.supervisor]];
      const equipmentKpis='<div class="mg-project-kpis" style="grid-template-columns:repeat(2,minmax(0,1fr))"><button type="button" class="mg-project-kpi mg-project-kpi-button" data-project-equipment-filter="all"><span>Total de equipos</span><strong>'+esc(totalEquipos)+'</strong></button><button type="button" class="mg-project-kpi mg-project-kpi-button" data-project-equipment-filter="stopped"><span>Parados</span><strong>'+esc(totalParados)+'</strong></button></div>';
      const yearOptions=years.map(y=>'<option value="'+y+'" '+(y===selectedYear?'selected':'')+'>'+y+'</option>').join('');
      show('Proyecto · '+(p.proyecto_nombre||p.nombre_publico||p.proyecto||proyecto),proyecto,
        '<section class="mg-detail-section"><h3>Detalle del Proyecto</h3>'+grid(general)+'</section>'+ 
        '<section class="mg-detail-section"><h3>Equipos del Proyecto</h3><div style="padding:12px 14px 0">'+equipmentKpis+'</div>'+legendHostVisual(['CRITICO','ATRAPADO','FILTRACION','VOLTAJE','NO_FUNCIONANDO','FUERA_SLA'])+'<div class="mg-table-wrap"><table class="mg-table mg-project-equipment-table"><thead><tr><th>Equipo</th><th>Referencia</th><th>Operativo</th><th>Fallas al año</th><th>Resp. BLT Última</th><th>Resp. Cliente</th><th>Última Resp. Cliente</th><th>MTBC Año</th><th>MTBC U365</th></tr></thead><tbody>'+equipmentRows(equipos,tickets)+'<tr class="mg-project-equipment-empty" data-project-equipment-empty><td colspan="9" class="mg-empty">No hay equipos parados en este proyecto.</td></tr></tbody></table></div></section>'+ 
        '<section class="mg-detail-section"><div class="mg-section-toolbar"><h3>Tickets del Proyecto</h3><label>Año <select id="mg-project-ticket-year">'+yearOptions+'</select></label></div><div class="mg-table-wrap"><table class="mg-table mg-project-ticket-table"><thead><tr><th>No. ticket</th><th>Fecha Rep</th><th>Hora Rep</th><th>Estado</th><th>Asunto</th><th>Estatus inicial</th><th>F. Llegada</th><th>H. Llegada</th><th>T. Llegada</th><th>F. Solución</th><th>H. Solución</th><th>T. Solución</th><th>Estatus final</th><th>Causa</th><th>Acción en cierre</th><th>Resp.</th></tr></thead><tbody>'+groupedTicketRows(tickets)+'</tbody></table></div></section>');
      const detailRoot=document.getElementById('mg-detail-body');
      bindLinks(detailRoot);
      bindProjectEquipmentKpis(detailRoot);
      detailRoot.querySelectorAll('.mg-clickable-row').forEach(row=>row.addEventListener('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();row.click();}}));
      const yearSelect=detailRoot.querySelector('#mg-project-ticket-year');
      if(yearSelect)yearSelect.addEventListener('change',()=>load(yearSelect.value).catch(e=>show('Proyecto',proyecto,'<div class="mg-empty">Error: '+esc(e.message)+'</div>')));
    }

    try{await load(selectedYear);}catch(e){show('Proyecto',proyecto,'<div class="mg-empty">Error: '+esc(e.message)+'</div>');}
  }
  function hasValue(v){
    return v !== null && v !== undefined && String(v).trim() !== '' && String(v).trim() !== '—';
  }
  function compactRow(items){
    return (items || []).filter(([,v])=>hasValue(v));
  }
  function compactTable(items, emptyText){
    const visible=compactRow(items);
    if(!visible.length) return '<div class="mg-empty">'+esc(emptyText || 'Sin información disponible.')+'</div>';
    return '<div class="mg-compact-table-wrap"><table class="mg-compact-table"><thead><tr>'+visible.map(([k])=>'<th>'+esc(k)+'</th>').join('')+'</tr></thead><tbody><tr>'+visible.map(([,v])=>'<td>'+esc(v)+'</td>').join('')+'</tr></tbody></table></div>';
  }
  function progressDetailTable(items){
    const visible=compactRow(items);
    if(!visible.length) return '<div class="mg-empty">Sin información registrada para esta etapa.</div>';
    return compactTable(visible);
  }
  function progressItem(key,label,value,detailHtml,clickable){
    const pct=toPct(value);
    const inner='<div class="mg-progress-label-row"><span class="mg-progress-label">'+esc(label)+(clickable?' <span class="mg-progress-chevron">▼</span>':'')+'</span><span class="mg-progress-percent">'+pct+'%</span></div><div class="mg-progress-track"><div class="mg-progress-fill '+key+'" style="width:'+pct+'%"></div></div>';
    if(!clickable) return '<div class="mg-progress-item">'+inner+'</div>';
    return '<div class="mg-progress-item" data-progress-item="'+esc(key)+'"><button type="button" class="mg-progress-button" data-progress-toggle="'+esc(key)+'" aria-expanded="false">'+inner+'</button><div class="mg-progress-detail">'+detailHtml+'</div></div>';
  }
  function bindProgressAccordions(root){
    (root || document).querySelectorAll('[data-progress-toggle]').forEach(button=>button.addEventListener('click',()=>{
      const current=button.closest('[data-progress-item]');
      const wasOpen=current.classList.contains('is-open');
      (root || document).querySelectorAll('[data-progress-item]').forEach(item=>{
        item.classList.remove('is-open');
        const btn=item.querySelector('[data-progress-toggle]');
        if(btn) btn.setAttribute('aria-expanded','false');
      });
      if(!wasOpen){
        current.classList.add('is-open');
        button.setAttribute('aria-expanded','true');
      }
    }));
  }
  async function openEquipo_uni(codigo){
    codigo = String(codigo || '').trim(); if(!codigo || codigo === '—') return;
    if(!currentDetailMatches('equipo', codigo) && navigate('equipo', codigo)) return;
    const currentYear=new Date().getFullYear();
    let selectedYear=currentYear;
    let activeFilter='all';
    show('Equipo', codigo, '<div class="mg-empty">Cargando detalle del equipo...</div>');

    const fmtTime=v=>{if(!v)return '—';const value=String(v).trim();const match=value.match(/(?:T|\s)(\d{2}:\d{2})(?::\d{2})?/);if(match)return match[1];const plain=value.match(/^(\d{1,2}:\d{2})/);return plain?plain[1]:value;};
    const fmtDuration=v=>{if(v===null||v===undefined||String(v).trim()==='')return '—';const n=Number(v);return Number.isFinite(n)?(Math.round(n*10)/10)+' h':String(v);};
    const fmtMtbc=v=>{if(v===null||v===undefined||String(v).trim()==='')return '—';const n=Number(v);return Number.isFinite(n)?(Math.round(n*10)/10)+' d':String(v);};
    const normalize=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
    const ticketBlob=t=>normalize([t.descripcion,t.asunto,t.causa,t.causa_falla,t.accion_en_cierre].filter(Boolean).join(' '));
    const ticketStatus=t=>normalize(t.estado_ticket||t.estado);
    const filterMatch=(t,key)=>{
      if(key==='all')return true;
      if(key==='closed')return ticketStatus(t).includes('CERR');
      if(key==='open')return ticketStatus(t).includes('ABIER');
      if(key==='progress')return !ticketStatus(t).includes('CERR')&&!ticketStatus(t).includes('ABIER');
      if(key==='water')return ['FILTRACION','AGUA','INUNDACION','GOTERA'].some(v=>ticketBlob(t).includes(v));
      if(key==='trapped')return ['ATRAPADO','ATRAPADA','ENCERRADO','ENCERRADA','RESCATE'].some(v=>ticketBlob(t).includes(v));
      if(key==='voltage')return ['VOLTAJE','FALLA ELECTRICA','SIN ENERGIA','APAGON'].some(v=>ticketBlob(t).includes(v));
      if(key==='blt')return normalize(t.responsabilidad).includes('BLT');
      if(key==='client')return normalize(t.responsabilidad).includes('CLIENTE');
      return true;
    };
    const monthLabel=key=>{const [y,m]=String(key).split('-').map(Number);return new Intl.DateTimeFormat('es-MX',{month:'short',year:'2-digit'}).format(new Date(y,m-1,1)).replace('.','');};
    const lineChart=(title,subtitle,rows,keys)=>{
      const map=new Map((rows||[]).map(r=>[String(r.mes),Number(r.total||0)]));
      const vals=keys.map(k=>map.get(k)||0);const max=Math.max(1,...vals);const w=620,h=190,left=34,right=12,top=14,bottom=34;const cw=w-left-right,ch=h-top-bottom;
      const pts=vals.map((v,i)=>{const x=left+(keys.length===1?cw/2:(i*cw/(keys.length-1)));const y=top+ch-(v/max*ch);return{x,y,v,key:keys[i]};});
      const lines=[0,.25,.5,.75,1].map(f=>{const y=top+ch-(f*ch);return '<line class="grid" x1="'+left+'" y1="'+y+'" x2="'+(w-right)+'" y2="'+y+'"/><text class="axis-label" x="2" y="'+(y+3)+'">'+Math.round(max*f)+'</text>';}).join('');
      const labels=pts.map((p,i)=>i%2===0?'<text class="axis-label" text-anchor="middle" x="'+p.x+'" y="'+(h-8)+'">'+esc(monthLabel(p.key))+'</text>':'').join('');
      const points=pts.map(p=>'<circle class="point" cx="'+p.x+'" cy="'+p.y+'" r="4"><title>'+esc(monthLabel(p.key))+': '+p.v+'</title></circle>').join('');
      return '<article class="mg-line-chart"><h4>'+esc(title)+'</h4><p>'+esc(subtitle)+'</p><svg viewBox="0 0 '+w+' '+h+'" role="img" aria-label="'+esc(title)+'">'+lines+'<polyline class="line" points="'+pts.map(p=>p.x+','+p.y).join(' ')+'"/>'+points+labels+'</svg></article>';
    };
    const ticketRows=(tickets,year,availableYears)=>{
      const rows=tickets.map(t=>{const id=String(t.ticket||t.folio||'').trim();return '<tr class="mg-clickable-row mg-equipment-ticket-row" data-ticket="'+esc(id)+'" tabindex="0" role="button"><td>'+esc(id)+'</td><td>'+fmtDate(t.fecha_reporte)+'</td><td>'+esc(fmtTime(t.h_reporte))+'</td><td>'+esc(t.estado_ticket||t.estado)+'</td><td>'+esc(t.descripcion||t.asunto)+'</td><td>'+esc(t.estatus_equipo_ir)+'</td><td>'+fmtDate(t.fecha_llegada)+'</td><td>'+esc(fmtTime(t.h_llegada))+'</td><td>'+esc(fmtDuration(t.tiempo_llegada))+'</td><td>'+fmtDate(t.fecha_cierre)+'</td><td>'+esc(fmtTime(t.h_solucion))+'</td><td>'+esc(fmtDuration(t.tiempo_solucion))+'</td><td>'+esc(t.estatus_equipo_final)+'</td><td>'+esc(t.causa||t.causa_falla)+'</td><td>'+esc(t.accion_en_cierre)+'</td><td>'+esc(t.responsabilidad)+'</td></tr>';}).join('');
      if(rows)return rows;
      const latest=(availableYears||[]).find(y=>Number(y)!==Number(year));
      const extra=latest?' Último año con información: '+latest+'.':'';
      return '<tr><td colspan="16" class="mg-empty">Sin tickets registrados en '+esc(year)+'.'+esc(extra)+'</td></tr>';
    };

    function userTokens(){const u=window.ManttoAuth&&window.ManttoAuth.getUser?window.ManttoAuth.getUser():{};return [u.nombre,u.name,u.iniciales,u.initials,u.correo,u.email,u.puesto,u.rol,u.role,u.rol_nombre,u.role_name].map(normalize).filter(Boolean);}
    function isDirectorAllowed(){const u=window.ManttoAuth&&window.ManttoAuth.getUser?window.ManttoAuth.getUser():{};const containers=[u,u.permisos,u.permissions,u.permiso,u.access].filter(Boolean);const keys=['dashboard_operativo_confirmar','confirmar_servicio_operativo','operativo_confirmar_servicio','director_confirmar_servicio','puede_confirmar_operativo'];return userTokens().some(v=>v.includes('DIRECTOR'))&&containers.some(obj=>keys.some(k=>obj[k]===true||obj[k]===1||obj[k]==='1'||String(obj[k]).toLowerCase()==='true'));}
    function canConfirm(e){const assigned=[e.supervisor,e.superintendente].map(normalize).filter(Boolean);return assigned.some(name=>userTokens().some(token=>name===token||name.includes(token)||token.includes(name)))||isDirectorAllowed();}
    function serviceMonths(e){const storageKey='mantto_operativo_servicio_confirm_v1';let confirmations={};try{confirmations=JSON.parse(localStorage.getItem(storageKey)||'{}')||{};}catch(_e){}const items=[];const now=new Date();for(let i=0;i<12;i++){const d=new Date(now.getFullYear(),now.getMonth()-i,1);const key=d.getFullYear()+'_'+String(d.getMonth()+1).padStart(2,'0');const conf=confirmations[codigo+'__'+key];items.push({key,label:new Intl.DateTimeFormat('es-MX',{month:'long',year:'numeric'}).format(d),conf});}return{storageKey,confirmations,items};}

    async function load(year){
      selectedYear=Number(year)||currentYear;
      const data=await fetchJson('/api/portafolio/equipos/'+encodeURIComponent(codigo)+'?anio_tickets='+encodeURIComponent(selectedYear));
      const e=data.data||data.mantenimiento||data.equipo||{};const tickets=Array.isArray(data.tickets)?data.tickets:[];const metrics=data.metrics||{};
      if(!e||!String(e.numero_equipo||'').trim()){show('Equipo',codigo,'<div class="mg-empty">Equipo no encontrado en Portafolio.</div>');return;}
      registerTickets(tickets);
      const years=Array.from(new Set((data.ticket_years||[]).map(Number).filter(Boolean).concat([selectedYear]))).sort((a,b)=>b-a);
      const yearOptions=years.map(y=>'<option value="'+y+'" '+(y===selectedYear?'selected':'')+'>'+y+'</option>').join('');
      const general=[['Ciudad',e.ciudad],['Estado',e.estado],['Estatus de servicio',e.estatus_servicio],['Zona Op',e.zona],['Dirección',e.direccion],['Fecha instalación',fmtDate(e.fecha_instalacion)],['Fecha ingreso Portafolio',fmtDate(e.fecha_ingreso_portafolio)],['Superintendente',e.superintendente],['Supervisor',e.supervisor]];
      const kpi=(label,value)=>'<article class="mg-equipment-kpi"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong></article>';
      const kpis='<div style="padding:12px 14px"><div class="mg-equipment-kpi-group"><h4>Estado de tickets</h4><div class="mg-equipment-kpis cols-6">'+kpi('Total cerrados',metrics.cerrados||0)+kpi('Total en curso',metrics.en_curso||0)+kpi('Total abiertos',metrics.abiertos||0)+kpi('Con filtración',metrics.filtracion||0)+kpi('Atrapados',metrics.atrapados||0)+kpi('Por voltaje',metrics.voltaje||0)+'</div></div><div class="mg-equipment-kpi-group"><h4>Desempeño operativo</h4><div class="mg-equipment-kpis cols-4">'+kpi('Total en SLA',metrics.en_sla||0)+kpi('Prom. T. llegada',fmtDuration(metrics.promedio_llegada))+kpi('Prom. T. solución',fmtDuration(metrics.promedio_solucion))+kpi('Tickets año actual',metrics.tickets_anio||0)+'</div></div><div class="mg-equipment-kpi-group"><h4>Responsabilidad y confiabilidad</h4><div class="mg-equipment-kpis cols-4">'+kpi('Resp. BLT año actual',metrics.resp_blt_anio||0)+kpi('Resp. Cliente año actual',metrics.resp_cliente_anio||0)+kpi('MTBC año actual',fmtMtbc(metrics.mtbc_anio))+kpi('MTBC U365',fmtMtbc(metrics.mtbc_u365))+'</div></div></div>';
      const currentKeys=Array.from({length:12},(_,i)=>currentYear+'-'+String(i+1).padStart(2,'0'));
      const u365Start=data.u365_desde?new Date(data.u365_desde+'T00:00:00'):new Date(Date.now()-364*86400000);
      const u365End=data.u365_hasta?new Date(data.u365_hasta+'T00:00:00'):new Date();
      const u365Keys=[];for(let d=new Date(u365Start.getFullYear(),u365Start.getMonth(),1);d<=new Date(u365End.getFullYear(),u365End.getMonth(),1);d.setMonth(d.getMonth()+1)){u365Keys.push(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'));}
      const u365Subtitle='Del '+fmtDate(data.u365_desde)+' al '+fmtDate(data.u365_hasta);
      const charts='<section class="mg-detail-section"><h3>Fallas BLT por mes</h3><div class="mg-equipment-charts">'+lineChart('Año en curso',String(currentYear),data.fallas_blt_mes_anio||[],currentKeys)+lineChart('Bloque 365 días',u365Subtitle,data.fallas_blt_mes_u365||[],u365Keys)+'</div></section>';
      const services=serviceMonths(e);const confirmed=services.items.filter(item=>item.conf&&item.conf.confirmed).length;const allowed=canConfirm(e);
      const serviceCards=services.items.map(item=>'<article class="mg-service-month '+(item.conf&&item.conf.confirmed?'confirmed':'')+'"><button type="button" data-service-month="'+item.key+'" '+(allowed?'':'disabled')+'><strong>'+esc(item.label)+'</strong><span>'+(item.conf&&item.conf.confirmed?'Confirmado · '+esc(item.conf.by||'Usuario'):'Pendiente')+'</span></button></article>').join('');
      const servicesHtml='<section class="mg-detail-section"><button class="mg-service-panel-toggle" type="button" id="mg-service-toggle" aria-expanded="false"><span>🗓️ Servicios mensuales · '+confirmed+' de 12 confirmados</span><span>⌄</span></button><div id="mg-service-content" hidden><div class="mg-service-months">'+serviceCards+'</div></div></section>';
      show('Equipo · '+(e.numero_equipo||codigo),e.proyecto||'Detalle de equipo','<section class="mg-detail-section"><h3>Detalle del Equipo</h3>'+grid(general)+'</section><section class="mg-detail-section"><h3>Indicadores del equipo</h3>'+kpis+'</section>'+charts+servicesHtml+'<section class="mg-detail-section"><div class="mg-section-toolbar"><h3>Tickets del Equipo</h3><label>Año <select id="mg-equipment-ticket-year">'+yearOptions+'</select></label></div><div class="mg-table-wrap"><table class="mg-table mg-equipment-ticket-table"><thead><tr><th>No. ticket</th><th>Fecha Rep</th><th>Hora Rep</th><th>Estado</th><th>Asunto</th><th>Estatus inicial</th><th>F. Llegada</th><th>H. Llegada</th><th>T. Llegada</th><th>F. Solución</th><th>H. Solución</th><th>T. Solución</th><th>Estatus final</th><th>Causa</th><th>Acción en cierre</th><th>Resp.</th></tr></thead><tbody id="mg-equipment-ticket-body">'+ticketRows(tickets,selectedYear,years)+'</tbody></table></div></section>');
      const root=document.getElementById('mg-detail-body');bindLinks(root);
      root.querySelectorAll('.mg-clickable-row').forEach(row=>row.addEventListener('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();row.click();}}));
      const yearSelect=root.querySelector('#mg-equipment-ticket-year');if(yearSelect)yearSelect.addEventListener('change',()=>load(yearSelect.value).catch(err=>show('Equipo',codigo,'<div class="mg-empty">Error: '+esc(err.message)+'</div>')));
      const toggle=root.querySelector('#mg-service-toggle');if(toggle)toggle.addEventListener('click',()=>{const content=root.querySelector('#mg-service-content');const open=toggle.getAttribute('aria-expanded')==='true';toggle.setAttribute('aria-expanded',String(!open));content.hidden=open;toggle.lastElementChild.textContent=open?'⌄':'⌃';});
      root.querySelectorAll('[data-service-month]').forEach(btn=>btn.addEventListener('click',()=>{if(!allowed)return;const key=btn.dataset.serviceMonth;const store=serviceMonths(e);const storageKey=codigo+'__'+key;if(store.confirmations[storageKey]&&store.confirmations[storageKey].confirmed){delete store.confirmations[storageKey];}else{const u=window.ManttoAuth&&window.ManttoAuth.getUser?window.ManttoAuth.getUser():{};store.confirmations[storageKey]={confirmed:true,by:u.iniciales||u.nombre||u.correo||'Usuario',at:new Date().toLocaleString('es-MX'),mes:key,role:'SUPERVISION'};}localStorage.setItem(store.storageKey,JSON.stringify(store.confirmations));load(selectedYear).catch(()=>{});}));
    }
    try{await load(selectedYear);}catch(error){show('Equipo',codigo,'<div class="mg-empty">Error: '+esc(error.message)+'</div>');}
  }

  function openEquipo_gnral(codigo){
    const key = String(codigo || '').trim();
    return key.includes('|||') ? openEquipo_cor(key) : openEquipo_uni(key);
  }

  async function openEquipo_cor(codigo){
    codigo = String(codigo || '').trim(); if(!codigo || codigo === '—') return;
    if(!currentDetailMatches('equipo', codigo) && navigate('equipo', codigo)) return;
    show('Equipo', codigo, '<div class="mg-empty">Cargando detalle del equipo...</div>');
    try{
      const data = await fetchJson('/api/portafolio/equipos/' + encodeURIComponent(codigo));
      const instalaciones = Array.isArray(data.instalaciones) ? data.instalaciones : [];
      const i = instalaciones[0] || null;
      if(!i){
        show('Equipo', codigo, '<div class="mg-empty">Este equipo no tiene información de Instalaciones disponible.</div>');
        return;
      }

      const ref=i.referencia_sitio || codigo;
      const project=i.proyecto || i.id_proyecto || 'Proyecto sin identificar';
      const status=i.estatus || 'Sin estatus';
      const oc=toPct(i.avance_oc);
      const mo=toPct(i.avance_mo);
      const aj=toPct(i.avance_aj);
      const overall=Math.round((oc*0.4)+(mo*0.4)+(aj*0.2));

      const ocItems = oc >= 100
        ? compactRow([['CCR',fmtDate(i.fecha_ccr)]])
        : compactRow([['CCNR',fmtDate(i.fecha_ccnr)],['Días sin hacer CCNR',i.dias_sin_ccnr]]);
      const ocDetail = progressDetailTable(ocItems);
      const moItems = compactRow([
        ['Inicio de Montaje',fmtDate(i.fecha_inicio_montaje)],
        ['Fin de Montaje Planeado',fmtDate(i.fecha_fin_montaje_planeado)],
        ['Fin de Montaje Modificado',fmtDate(i.fecha_fin_montaje_modificado)],
        ['Fin de Montaje Real',fmtDate(i.fecha_fin_montaje_real)],
        ['Carta Término Instalación (CTI)',fmtDate(i.fecha_cti)],
        ['Revisión de Instalación por Supervisor',fmtDate(i.fecha_revision_supervisor)],
        ['Minuta revisión por Ajuste',fmtDate(i.fecha_minuta_revision_ajuste)],
        ['Liberado por ajuste (Montaje)',fmtDate(i.fecha_liberacion_ajuste)]
      ]);
      const moDetail = progressDetailTable(moItems);
      const ajItems = compactRow([
        ['Ajustador',i.ajustador],
        ['Inicio de Ajuste',fmtDate(i.fecha_inicio_ajuste)],
        ['Fin de Ajuste Planeado',fmtDate(i.fecha_fin_ajuste_planeado)],
        ['Fin de Ajuste Modificado',fmtDate(i.fecha_fin_ajuste_modificado)],
        ['Fin de Ajuste Real',fmtDate(i.fecha_fin_ajuste_real)],
        ['Reporte de Ajuste',fmtDate(i.fecha_reporte_ajuste)],
        ['Protocolo de Aceptación (Calidad)',fmtDate(i.fecha_protocolo_aceptacion)],
        ['Estatus de Inspección (Calidad)',i.estatus_inspeccion_calidad],
        ['Pendientes (Calidad)',i.pendientes_calidad],
        ['Entrega a Cliente (CAF-PG)',fmtDate(i.fecha_entrega_cliente)],
        ['Formato (CAF-PG)',i.formato_caf_pg],
        ['Equipo se queda (entrega)',i.estatus_equipo_entrega],
        ['Año de Término',i.anio_termino]
      ]);
      const ajDetail = progressDetailTable(ajItems);

      const progressHtml='<section class="mg-progress-panel"><h3 class="mg-progress-panel-title">Avances del equipo</h3><div class="mg-progress-list">'
        +progressItem('general','Avance General Equipo',overall,'',false)
        +progressItem('oc','% Avance Obra Civil (40%)',oc,ocDetail,ocItems.length>0)
        +progressItem('mo','% Avance Instalación (40%)',mo,moDetail,moItems.length>0)
        +progressItem('aj','% Avance Ajuste (20%)',aj,ajDetail,ajItems.length>0)
        +'</div></section>';

      const generales=compactTable([
        ['No. Pisos',i.numero_pisos],
        ['No. Desembarques',i.numero_desembarques],
        ['No. Puertas',i.numero_puertas],
        ['Capacidad (kg)',i.capacidad_kg],
        ['Velocidad (m/s)',i.velocidad_ms],
        ['Entrepiso',i.entrepiso_mm],
        ['Longitud',i.longitud_mm],
        ['Ancho peldaño',i.ancho_peldano_mm]
      ],'Sin datos generales registrados para este equipo.');

      const logistica=compactTable([
        ['Estatus',i.estatus_produccion],
        ['Fecha de descarga',fmtDate(i.fecha_descarga)],
        ['Colocación de ESC-RAMP',fmtDate(i.fecha_colocacion_esc_ramp)]
      ],'Sin información de logística y materiales.');

      const supervision=compactTable([
        ['CPVP',fmtDate(i.fecha_cpvp)],
        ['Fecha de última visita',fmtDate(i.fecha_visita)],
        ['Días de última visita',i.dias_sin_visita],
        ['Último comentario sup.',i.comentarios_fl]
      ],'Sin información de supervisión registrada.');

      const html='<section class="mg-equipment-identity"><h3>'+esc(ref)+'</h3><strong>'+esc(project)+'</strong><span>'+esc(status)+'</span></section>'
        +progressHtml
        +'<section class="mg-detail-section"><h3>Generales del equipo</h3>'+generales+'</section>'
        +'<section class="mg-detail-section"><h3>Logística y Materiales</h3>'+logistica+'</section>'
        +'<section class="mg-detail-section"><h3>Supervisión Obra / Instalaciones</h3>'+supervision+'</section>';

      show(ref,project+' · '+status,html);
      bindProgressAccordions(document.getElementById('mg-detail-body'));
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
    if(!currentDetailMatches('ticket', ticketId) && navigate('ticket', ticketId, knownTicket ? { knownTicket } : null)) return;
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
    if(!currentDetailMatches('equipo-critico', codigo) && navigate('equipo-critico', codigo, { options:opts || {} })) return;
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
  window.ManttoDetails = { show, close, render, openProyecto, openEquipo:openEquipo_gnral, openEquipo_uni, openEquipo_cor, openEquipo_gnral, openTicket, openEquipoCritico, bindLinks, ticketsTable, registerTickets };
})();

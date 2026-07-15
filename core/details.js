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
        .mg-project-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:14px}.mg-project-kpi{border:1px solid #E2E8F0;border-radius:11px;background:#F8FAFC;padding:11px}.mg-project-kpi span{display:block;font-size:9px;text-transform:uppercase;font-weight:800;color:#64748B}.mg-project-kpi strong{display:block;margin-top:4px;color:#0D2E6E;font-size:20px}
        .mg-equipment-identity{background:#fff;border:1px solid rgba(13,46,110,.18);border-radius:12px;margin-bottom:14px;padding:14px 16px}.mg-equipment-identity h3{margin:0;color:#0D2E6E;font-size:20px}.mg-equipment-identity strong{display:block;margin-top:4px;color:#1E293B;font-size:13px}.mg-equipment-identity span{display:inline-flex;margin-top:7px;padding:4px 9px;border-radius:999px;background:#EAF1FF;color:#0D2E6E;font-size:10px;font-weight:800}
        .mg-progress-panel{background:#fff;border:1px solid rgba(13,46,110,.18);border-radius:12px;margin-bottom:14px;overflow:hidden}.mg-progress-panel-title{margin:0;padding:10px 14px;background:#EFF6FF;color:#0D2E6E;font-size:13px}.mg-progress-list{padding:12px 14px}.mg-progress-item{border-bottom:1px solid #E2E8F0;padding:10px 0}.mg-progress-item:last-child{border-bottom:0}.mg-progress-button{display:block;width:100%;border:0;background:transparent;padding:0;cursor:pointer;text-align:left;color:inherit}.mg-progress-button:focus-visible{outline:2px solid #1B4FD8;outline-offset:4px;border-radius:6px}.mg-progress-label-row{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:7px}.mg-progress-label{font-size:11px;font-weight:800;color:#334155}.mg-progress-percent{font-size:11px;font-weight:900;color:#0D2E6E}.mg-progress-track{height:7px;border-radius:999px;background:#E2E8F0;overflow:hidden}.mg-progress-fill{height:100%;border-radius:inherit;transition:width .25s ease}.mg-progress-fill.general{background:#1B4FD8}.mg-progress-fill.oc{background:#C83B3B}.mg-progress-fill.mo{background:#D7A514}.mg-progress-fill.aj{background:#238B45}.mg-progress-chevron{display:inline-block;margin-left:6px;font-size:10px;transition:transform .2s ease}.mg-progress-item.is-open .mg-progress-chevron{transform:rotate(180deg)}.mg-progress-detail{display:none;margin-top:11px;border:1px solid #E2E8F0;border-radius:10px;overflow:hidden;background:#F8FAFC}.mg-progress-item.is-open .mg-progress-detail{display:block}
        .mg-compact-table{width:100%;border-collapse:collapse}.mg-compact-table th{background:#0D2E6E;color:#fff;text-align:left;font-size:10px;padding:8px;white-space:nowrap}.mg-compact-table td{font-size:11px;color:#334155;padding:9px 8px;border-bottom:1px solid #E2E8F0;vertical-align:top}.mg-compact-table tr:last-child td{border-bottom:0}.mg-compact-table-wrap{overflow:auto}.mg-section-hidden{display:none!important}
        .mg-project-overview{display:grid;grid-template-columns:minmax(250px,36%) 1fr;gap:14px;margin-bottom:14px}.mg-project-overview.no-photo{grid-template-columns:1fr}.mg-project-cover{display:block;width:100%;height:260px;border:0;border-radius:12px;overflow:hidden;padding:0;background:#E2E8F0;cursor:pointer;box-shadow:0 6px 18px rgba(15,23,42,.08)}.mg-project-cover img{display:block;width:100%;height:100%;object-fit:cover;object-position:center}.mg-project-overview .mg-detail-section{margin-bottom:0}
        .mg-stage-bars{background:#fff;border:1px solid rgba(13,46,110,.18);border-radius:12px;padding:14px;margin-bottom:14px}.mg-stage-row{margin:11px 0}.mg-stage-row:first-child{margin-top:0}.mg-stage-row:last-child{margin-bottom:0}.mg-stage-meta{display:flex;justify-content:space-between;gap:12px;margin-bottom:7px;font-size:11px;font-weight:800;color:#334155}.mg-stage-track{height:9px;border-radius:999px;background:#E2E8F0;overflow:hidden}.mg-stage-fill{height:100%;border-radius:inherit}.mg-stage-fill.general{background:#1B4FD8}.mg-stage-fill.oc{background:#C83B3B}.mg-stage-fill.mo{background:#D7A514}.mg-stage-fill.aj{background:#238B45}
        .mg-photo-lightbox{position:fixed;inset:0;z-index:10050;background:rgba(2,6,23,.92);display:grid;place-items:center;padding:28px}.mg-photo-lightbox[hidden]{display:none}.mg-photo-lightbox figure{margin:0;max-width:min(1120px,88vw);text-align:center}.mg-photo-lightbox img{display:block;max-width:100%;max-height:76vh;margin:auto;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.45)}.mg-photo-lightbox figcaption{color:#fff;margin-top:10px;font-size:12px}.mg-photo-close,.mg-photo-nav{position:absolute;border:0;background:rgba(255,255,255,.14);color:#fff;cursor:pointer}.mg-photo-close{top:18px;right:22px;width:44px;height:44px;border-radius:50%;font-size:30px}.mg-photo-nav{top:50%;transform:translateY(-50%);width:50px;height:70px;border-radius:12px;font-size:46px}.mg-photo-nav.prev{left:18px}.mg-photo-nav.next{right:18px}.mg-photo-principal{margin-top:14px;border:1px solid rgba(255,255,255,.45);border-radius:10px;background:#0D2E6E;color:#fff;padding:10px 15px;font-weight:800;cursor:pointer}.mg-photo-principal:disabled{background:#475569;cursor:default;opacity:.9}
        @media(max-width:900px){.mg-project-overview{grid-template-columns:1fr}.mg-project-cover{height:210px}.mg-chart-grid{grid-template-columns:1fr}.mg-project-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
        @media(max-width:760px){.mg-detail-view{padding:0}.mg-detail-head{border-radius:0;padding:12px;align-items:flex-start}.mg-detail-head h2{font-size:16px}.mg-detail-body{padding:10px}.mg-detail-grid{grid-template-columns:1fr}.mg-table{min-width:680px}}
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
  function ticketsTable(rows){
    if(!rows || !rows.length) return '<div class="mg-empty">Sin tickets relacionados</div>';
    return '<div class="mg-table-wrap"><table class="mg-table"><thead><tr><th>Ticket</th><th>Fecha</th><th>Estado</th><th>Proyecto</th><th>Equipo</th><th>Responsabilidad</th><th>Causa</th></tr></thead><tbody>' + rows.map(t=>'<tr><td><button class="mg-link" data-ticket="'+esc(t.ticket || t.n || '')+'">'+esc(t.ticket || t.n)+'</button></td><td>'+fmtDate(t.fecha_reporte || t.fr)+'</td><td>'+esc(t.estado_ticket || t.estado || t.et)+'</td><td><button class="mg-link" data-proyecto="'+esc(t.proyecto || t.pro || '')+'">'+esc(t.proyecto || t.pro)+'</button></td><td><button class="mg-link" data-equipo="'+esc(t.codigo_equipo || t.cod || '')+'">'+esc(t.codigo_equipo || t.cod)+'</button></td><td>'+esc(t.responsabilidad || t.res)+'</td><td>'+esc(t.causa_falla || t.causa || t.caf)+'</td></tr>').join('') + '</tbody></table></div>';
  }
  function bindLinks(root){
    (root || document).querySelectorAll('[data-proyecto]').forEach(el=>el.addEventListener('click', ev=>{ ev.preventDefault(); ev.stopPropagation(); openProyecto(el.getAttribute('data-proyecto')); }));
    (root || document).querySelectorAll('[data-equipo]').forEach(el=>el.addEventListener('click', ev=>{ ev.preventDefault(); ev.stopPropagation(); openEquipo_gnral(el.getAttribute('data-equipo')); }));
    (root || document).querySelectorAll('[data-ticket]').forEach(el=>el.addEventListener('click', ev=>{ ev.preventDefault(); ev.stopPropagation(); openTicket(el.getAttribute('data-ticket')); }));
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
    const unitedHtml=hasUnited?'<section class="mg-company-block united"><div class="mg-company-head"><div><h3>UNITED · Operación y Mantenimiento</h3><p>Información relacionada del Portafolio de mantenimiento.</p></div></div><div class="mg-company-content"><section class="mg-detail-section"><h3>Información general de Mantenimiento</h3>'+grid([['Proyecto',up.nombre_publico||up.proyecto_nombre||up.proyecto||resolvedName],['Código',up.proyecto_busqueda||up.proyecto_codigo||up.proyecto],['Ciudad',up.ciudad],['Estado',up.estado],['Zona',up.zona],['Supervisor',up.supervisor],['Equipos',up.equipos||unitedEquipos.length],['Parados',up.parados],['Tickets 35d',up.tickets_35d],['MTBC 365d',up.mtbc_365]])+'</section><section class="mg-detail-section"><h3>Equipos de Mantenimiento</h3><div class="mg-table-wrap"><table class="mg-table"><thead><tr><th>Equipo</th><th>Referencia</th><th>Zona</th><th>Estatus servicio</th><th>Operativo</th></tr></thead><tbody>'+unitedRows+'</tbody></table></div></section><section class="mg-detail-section"><h3>Tickets relacionados</h3>'+ticketsTable(unitedTickets)+'</section></div></section>':'';
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
    show('Proyecto', proyecto, '<div class="mg-empty">Cargando detalle del proyecto...</div>');
    try{
      const data = await fetchJson('/api/proyectos/detalle/' + encodeURIComponent(proyecto));
      const p = data.proyecto || data.data?.proyecto || {};
      const equipos = data.equipos || data.data?.equipos || [];
      const tickets = data.tickets || data.data?.tickets || [];
      show('Proyecto · ' + (p.proyecto_nombre || p.proyecto || proyecto), proyecto, '<section class="mg-detail-section"><h3>Detalle del Proyecto</h3>'+grid([['Proyecto',p.proyecto_nombre || p.proyecto || proyecto],['Código',p.proyecto_codigo || p.proyecto],['Ciudad',p.ciudad],['Estado',p.estado],['Zona',p.zona],['Supervisor',p.supervisor],['Equipos',p.equipos],['Parados',p.parados],['Tickets 35d',p.tickets_35d],['MTBC 365d',p.mtbc_365]])+'</section><section class="mg-detail-section"><h3>Equipos del proyecto</h3><div class="mg-table-wrap"><table class="mg-table"><thead><tr><th>Equipo</th><th>Referencia</th><th>Zona</th><th>Estatus servicio</th><th>Operativo</th></tr></thead><tbody>'+ (equipos.length?equipos.map(e=>{const equipoKey=String(e.numero_equipo||'').trim();const equipoCell=equipoKey?'<button class="mg-link" data-equipo="'+esc(equipoKey)+'">'+esc(equipoKey)+'</button>':'—';return '<tr><td>'+equipoCell+'</td><td>'+esc(e.identificacion_sitio)+'</td><td>'+esc(e.zona)+'</td><td>'+esc(e.estatus_servicio)+'</td><td>'+esc(e.estado_operativo)+'</td></tr>';}).join(''):'<tr><td colspan="5" class="mg-empty">Sin equipos</td></tr>') + '</tbody></table></div></section><section class="mg-detail-section"><h3>Tickets relacionados</h3>'+ticketsTable(tickets)+'</section>');
      bindLinks(document.getElementById('mg-detail-body'));
    }catch(e){ show('Proyecto', proyecto, '<div class="mg-empty">Error: '+esc(e.message)+'</div>'); }
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
    show('Equipo', codigo, '<div class="mg-empty">Cargando detalle del equipo...</div>');
    try{
      const data = await fetchJson('/api/portafolio/equipos/' + encodeURIComponent(codigo));
      const e = data.data || data.mantenimiento || data.equipo || {};
      const tickets = Array.isArray(data.tickets)
        ? data.tickets
        : (data.data && Array.isArray(data.data.tickets) ? data.data.tickets : []);
      if(!e || !String(e.numero_equipo || '').trim()){
        show('Equipo', codigo, '<div class="mg-empty">Equipo no encontrado en Portafolio.</div>');
        return;
      }
      registerTickets(tickets);
      show('Equipo · ' + (e.numero_equipo || codigo), e.proyecto || 'Detalle de equipo', '<section class="mg-detail-section"><h3>Detalle del Equipo</h3>'+grid([['Código',e.numero_equipo || codigo],['Proyecto',e.proyecto],['Ciudad',e.ciudad],['Estado',e.estado],['Zona',e.zona],['Supervisor',e.supervisor],['Superintendente',e.superintendente],['Contrato',e.contrato],['Operativo',e.estado_operativo],['Estatus servicio',e.estatus_servicio],['Días parado',e.dias_parado == null ? '—' : e.dias_parado + ' d'],['Último ticket',e.ultimo_ticket],['Última fecha reporte',fmtDate(e.ultimo_fecha_reporte)],['Identificación sitio',e.identificacion_sitio],['Dirección',e.direccion]])+'</section><section class="mg-detail-section"><h3>Accesos relacionados</h3>'+grid([['Proyecto','<button class="mg-link" data-proyecto="'+esc(e.proyecto)+'">'+esc(e.proyecto)+'</button>']])+'</section><section class="mg-detail-section"><h3>Tickets relacionados al equipo</h3>'+ticketsTable(tickets)+'</section>');
      const body=document.getElementById('mg-detail-body');
      body.innerHTML = body.innerHTML.replace(/&lt;button/g,'<button').replace(/&lt;\/button&gt;/g,'</button>').replace(/&gt;/g,'>').replace(/&quot;/g,'"');
      bindLinks(body);
    }catch(e){ show('Equipo', codigo, '<div class="mg-empty">Error: '+esc(e.message)+'</div>'); }
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

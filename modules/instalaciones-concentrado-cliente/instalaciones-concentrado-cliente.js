(function(){
  const VERSION='20260713-v002';
  const API_BASE=(window.MANTTO_API_BASE||'http://localhost:3001').replace(/\/$/,'');
  const state={loaded:false,loading:false,rows:[],selected:'',search:'',lightbox:[],lightboxIndex:0};
  const $=id=>document.getElementById(id);
  const raw=v=>v===null||v===undefined?'':String(v).trim();
  const esc=v=>raw(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const norm=v=>raw(v).toLocaleUpperCase('es-MX');

  function authHeaders(){return Object.assign({'Accept':'application/json'},window.ManttoAuth&&window.ManttoAuth.authHeaders?window.ManttoAuth.authHeaders():{});}
  async function fetchJson(path){
    const response=await fetch(API_BASE+path,{headers:authHeaders(),cache:'no-store'});
    const text=await response.text();
    let json=null;
    try{json=text?JSON.parse(text):null;}catch(e){throw new Error('La API respondió contenido no JSON.');}
    if(!response.ok||(json&&json.ok===false))throw new Error((json&&(json.message||json.error))||('Error HTTP '+response.status));
    return json;
  }

  async function loadHtml(){
    const view=$('view-instalaciones-concentrado-cliente');
    if(!view||view.dataset.ready==='1')return;
    const response=await fetch('./modules/instalaciones-concentrado-cliente/instalaciones-concentrado-cliente.html?v='+VERSION,{cache:'no-store'});
    if(!response.ok)throw new Error('No se pudo cargar la vista Concentrado Cliente.');
    view.innerHTML=await response.text();
    view.dataset.ready='1';
    bind();
  }

  function bind(){
    $('icc-client-select')?.addEventListener('change',event=>{state.selected=event.target.value;renderSelected();});
    $('icc-search')?.addEventListener('input',event=>{state.search=event.target.value;syncSelectionFromSearch();populateClients();renderSelected();});
    $('icc-refresh')?.addEventListener('click',()=>refresh(true));
    $('icc-lightbox-close')?.addEventListener('click',closeLightbox);
    $('icc-lightbox-prev')?.addEventListener('click',()=>moveLightbox(-1));
    $('icc-lightbox-next')?.addEventListener('click',()=>moveLightbox(1));
    $('icc-lightbox')?.addEventListener('click',event=>{if(event.target===$('icc-lightbox'))closeLightbox();});
    document.addEventListener('keydown',event=>{
      if($('icc-lightbox')?.hidden!==false)return;
      if(event.key==='Escape')closeLightbox();
      if(event.key==='ArrowLeft')moveLightbox(-1);
      if(event.key==='ArrowRight')moveLightbox(1);
    });
  }

  function setStatus(message,type=''){
    const el=$('icc-status');
    if(!el)return;
    el.className='icc-status '+type;
    el.textContent=message;
  }

  function photosOf(row){
    const candidates=[row.foto_portada,row.foto_blt_1,row.foto_blt_2,row.foto_blt_3,row.foto_blt_4,row.foto_blt_5,row.foto_blt_6,row.foto_blt_7];
    return [...new Set(candidates.map(raw).filter(url=>/^https?:\/\//i.test(url)))];
  }

  function normalizeRow(row){
    const total=Number(row.total_equipos)||0;
    const done=Number(row.equipos_terminados)||0;
    return {
      cliente:raw(row.cliente)||'Sin cliente',
      proyecto:raw(row.proyecto)||'Sin nombre',
      id_proyecto:raw(row.id_proyecto),
      ciudad:raw(row.ciudad),
      estado:raw(row.estado),
      total_equipos:total,
      equipos_terminados:done,
      cerrado:total>0&&done===total,
      asesor:raw(row.asesor_iniciales||row.asesor||row.id_asesor),
      supervisor:raw(row.supervisor_iniciales||row.supervisor||row.id_sup),
      carpeta:raw(row.carpeta),
      foto_blt_1:row.foto_blt_1,foto_blt_2:row.foto_blt_2,foto_blt_3:row.foto_blt_3,
      foto_blt_4:row.foto_blt_4,foto_blt_5:row.foto_blt_5,foto_blt_6:row.foto_blt_6,
      foto_blt_7:row.foto_blt_7,foto_portada:row.foto_portada,imagen_drive:row.imagen_drive,imagen_p_g:row.imagen_p_g
    };
  }

  function matchesSearch(row){
    const q=norm(state.search);
    if(!q)return true;
    return norm(row.cliente).includes(q)||norm(row.proyecto).includes(q)||norm(row.id_proyecto).includes(q);
  }

  function syncSelectionFromSearch(){
    if(!raw(state.search))return;
    const currentHasMatch=state.rows.some(row=>norm(row.cliente)===norm(state.selected)&&matchesSearch(row));
    if(currentHasMatch)return;
    const first=state.rows.find(matchesSearch);
    if(first)state.selected=first.cliente;
  }

  function populateClients(){
    const select=$('icc-client-select');
    if(!select)return;
    const current=state.selected;
    const counts=new Map();
    state.rows.filter(matchesSearch).forEach(row=>counts.set(row.cliente,(counts.get(row.cliente)||0)+1));
    const clients=[...counts.entries()].sort((a,b)=>a[0].localeCompare(b[0],'es'));
    select.innerHTML='<option value="">Selecciona un cliente...</option>'+clients.map(([name,count])=>'<option value="'+esc(name)+'">'+esc(name)+' ('+count+')</option>').join('');
    if(clients.some(([name])=>name===current)){select.value=current;}else{state.selected='';}
  }

  function uniqueText(rows,key){
    const values=[...new Set(rows.map(row=>raw(row[key])).filter(Boolean))];
    return values.length?values.join(', '):'—';
  }

  function rowHtml(row){
    return '<tr data-project="'+esc(row.id_proyecto)+'" data-project-name="'+esc(row.proyecto)+'"><td>'+esc(row.proyecto)+'</td><td>'+esc(row.id_proyecto||'—')+'</td><td>'+esc(row.ciudad||'—')+'</td><td>'+esc(row.estado||'—')+'</td><td>'+row.total_equipos.toLocaleString('es-MX')+'</td><td>'+esc(row.asesor||'—')+'</td><td>'+esc(row.supervisor||'—')+'</td></tr>';
  }

  function bindProjectRows(){
    document.querySelectorAll('[data-project]').forEach(row=>row.addEventListener('click',()=>{
      const id=row.dataset.project;
      const projectName=row.dataset.projectName||'';
      if(window.ManttoRouter&&window.ManttoRouter.go){
        window.ManttoRouter.go('detalle',{
          type:'proyecto',
          id,
          projectName,
          cliente:state.selected,
          source:'instalaciones-concentrado-cliente',
          template:'cliente-unificado'
        });
      }
    }));
  }

  function renderSelected(){
    const content=$('icc-content');
    const empty=$('icc-empty');
    const selected=state.selected;
    if(!selected){if(content)content.hidden=true;if(empty)empty.hidden=false;return;}
    const rows=state.rows.filter(row=>norm(row.cliente)===norm(selected)&&matchesSearch(row)).sort((a,b)=>a.proyecto.localeCompare(b.proyecto,'es'));
    if(!rows.length){if(content)content.hidden=true;if(empty){empty.hidden=false;empty.innerHTML='<div class="icc-empty-icon">🔎</div><h2>Sin coincidencias</h2><p>No se encontraron proyectos o clientes con esa búsqueda.</p>';}return;}
    const active=rows.filter(row=>!row.cerrado);
    const closed=rows.filter(row=>row.cerrado);
    const withPhotos=rows.filter(row=>photosOf(row).length>0);
    if(content)content.hidden=false;
    if(empty)empty.hidden=true;
    $('icc-kpi-active').textContent=active.length.toLocaleString('es-MX');
    $('icc-kpi-closed').textContent=closed.length.toLocaleString('es-MX');
    $('icc-kpi-photos').textContent=withPhotos.length.toLocaleString('es-MX');
    $('icc-client-name').textContent=selected;
    $('icc-client-grid').innerHTML=[
      ['Cliente',selected],['Ciudades',uniqueText(rows,'ciudad')],['Estados',uniqueText(rows,'estado')],
      ['Total de proyectos',rows.length],['Total de equipos',rows.reduce((sum,row)=>sum+row.total_equipos,0)]
    ].map(([label,value])=>'<article><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong></article>').join('');
    $('icc-active-count').textContent=active.length+' proyecto(s)';
    $('icc-closed-count').textContent=closed.length+' proyecto(s)';
    $('icc-photo-count').textContent=withPhotos.length+' proyecto(s) con evidencia';
    $('icc-active-body').innerHTML=active.length?active.map(rowHtml).join(''):'<tr><td colspan="7" class="icc-empty-row">Sin proyectos activos.</td></tr>';
    $('icc-closed-body').innerHTML=closed.length?closed.map(rowHtml).join(''):'<tr><td colspan="7" class="icc-empty-row">Sin proyectos cerrados.</td></tr>';
    $('icc-photo-grid').innerHTML=withPhotos.length?withPhotos.map((row,index)=>{
      const images=photosOf(row);
      return '<article class="icc-photo-tile" data-photo-project="'+esc(row.id_proyecto)+'"><img src="'+esc(images[0])+'" loading="lazy" alt="'+esc(row.proyecto)+'"><div class="icc-photo-meta"><strong>'+esc(row.proyecto)+'</strong><span>'+images.length+' foto(s)</span></div></article>';
    }).join(''):'<div class="icc-empty-row">Sin fotografías.</div>';
    bindProjectRows();
    document.querySelectorAll('[data-photo-project]').forEach(tile=>tile.addEventListener('click',()=>openProjectPhotos(tile.dataset.photoProject)));
  }

  function openProjectPhotos(id){
    const row=state.rows.find(item=>item.id_proyecto===id&&norm(item.cliente)===norm(state.selected));
    if(!row)return;
    state.lightbox=photosOf(row).map((url,index)=>({url,caption:row.proyecto+' · Foto '+(index+1)}));
    state.lightboxIndex=0;
    renderLightbox();
    $('icc-lightbox').hidden=false;
  }

  function renderLightbox(){
    const item=state.lightbox[state.lightboxIndex];
    if(!item)return;
    $('icc-lightbox-image').src=item.url;
    $('icc-lightbox-caption').textContent=item.caption+' ('+(state.lightboxIndex+1)+'/'+state.lightbox.length+')';
  }
  function moveLightbox(delta){if(!state.lightbox.length)return;state.lightboxIndex=(state.lightboxIndex+delta+state.lightbox.length)%state.lightbox.length;renderLightbox();}
  function closeLightbox(){if($('icc-lightbox'))$('icc-lightbox').hidden=true;}

  async function refresh(force=false){
    if(state.loading)return;
    if(state.loaded&&!force){renderSelected();return;}
    state.loading=true;
    setStatus('Consultando Aiven...');
    try{
      const json=await fetchJson('/api/ins-fl/proyectos/concentrado-clientes');
      state.rows=(Array.isArray(json)?json:(json.data||[])).map(normalizeRow);
      state.loaded=true;
      syncSelectionFromSearch();
      populateClients();
      renderSelected();
      setStatus(state.rows.length+' proyectos disponibles','ok');
    }catch(error){
      setStatus(error.message,'error');
      const empty=$('icc-empty');
      if(empty){empty.hidden=false;empty.innerHTML='<div class="icc-empty-icon">⚠️</div><h2>No se pudo cargar el concentrado</h2><p>'+esc(error.message)+'</p>';}
    }finally{state.loading=false;}
  }

  async function init(){
    try{await loadHtml();await refresh(false);}catch(error){setStatus(error.message,'error');}
  }

  window.ManttoInstalacionesConcentradoCliente={init,refresh};
})();

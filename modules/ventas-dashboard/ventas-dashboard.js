(function(){
  'use strict';

  const TEMPLATE_URL='./modules/ventas-dashboard/ventas-dashboard.html?v=20260804-a2-v003';
  const STORAGE_KEY='mantto:ventas-dashboard:a1';
  let initialized=false;
  let loadingPromise=null;
  let users=[];
  let kpiRequestId=0;

  function apiBase(){
    const host=String(window.location?.hostname||'').toLowerCase();
    const isLocal=host==='localhost'||host==='127.0.0.1'||host==='::1';
    if(isLocal) return 'http://localhost:3001';
    return String(window.MANTTO_API_BASE||'').replace(/\/$/,'');
  }
  function authHeaders(){ return window.ManttoAuth?.authHeaders?.() || {}; }
  function esc(value){
    return String(value ?? '').replace(/[&<>"']/g,function(char){return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'})[char];});
  }
  function readState(){
    try{return JSON.parse(sessionStorage.getItem(STORAGE_KEY)||'{}')||{};}catch(error){return {};}
  }
  function saveState(){
    const select=document.getElementById('vd-user-select');
    const modules=[...document.querySelectorAll('#vd-check-grid input:not([value="todos"]):checked')].map(function(input){return input.value;});
    sessionStorage.setItem(STORAGE_KEY,JSON.stringify({usuario_id:select?.value||'',modulos:modules}));
  }
  function message(text,type){
    const node=document.getElementById('vd-message');
    if(!node)return;
    node.textContent=text||'';
    node.className='vd-message'+(type?' is-'+type:'');
  }
  async function request(path){
    const controller=new AbortController();
    const timeout=setTimeout(function(){controller.abort();},15000);
    try{
      const response=await fetch(apiBase()+path,{
        headers:Object.assign({'Accept':'application/json'},authHeaders()),
        credentials:'include',
        signal:controller.signal
      });
      const contentType=String(response.headers.get('content-type')||'');
      let data=null;
      if(contentType.includes('application/json')){
        try{data=await response.json();}catch(error){data=null;}
      }else{
        const text=await response.text();
        throw new Error(text?('El backend respondió contenido no JSON: '+text.slice(0,120)):'El backend respondió contenido no JSON.');
      }
      if(!response.ok) throw new Error(data?.message||data?.error||('Error HTTP '+response.status));
      return data||{};
    }catch(error){
      if(error?.name==='AbortError') throw new Error('La consulta al backend excedió 15 segundos.');
      if(error instanceof TypeError && /fetch/i.test(String(error.message||''))){
        throw new Error('No fue posible conectar con el backend local en http://localhost:3001.');
      }
      throw error;
    }finally{
      clearTimeout(timeout);
    }
  }
  async function ensureTemplate(){
    const view=document.getElementById('view-ventas-dashboard');
    if(!view) throw new Error('No existe la vista Dashboard Ventas.');
    if(view.querySelector('.vd-page')) return view;
    const response=await fetch(TEMPLATE_URL,{cache:'no-store'});
    if(!response.ok) throw new Error('No fue posible cargar la vista Dashboard Ventas.');
    view.innerHTML=await response.text();
    return view;
  }
  function renderUsers(){
    const select=document.getElementById('vd-user-select');
    if(!select)return;
    const stored=readState();
    select.innerHTML='<option value="">Seleccionar responsable comercial</option>'+users.map(function(user){
      const meta=[user.puesto,user.tipo_perfil].filter(Boolean).join(' · ');
      return '<option value="'+esc(user.id_usuario)+'" data-meta="'+esc(meta)+'">'+esc(user.nombre)+'</option>';
    }).join('');
    const preferred=String(stored.usuario_id||'');
    if(preferred && users.some(function(user){return String(user.id_usuario)===preferred;})) select.value=preferred;
    else if(users.length===1) select.value=String(users[0].id_usuario);
  }
  function applyStoredModules(){
    const stored=readState();
    if(!Array.isArray(stored.modulos)||!stored.modulos.length)return;
    document.querySelectorAll('#vd-check-grid input:not([value="todos"])').forEach(function(input){input.checked=stored.modulos.includes(input.value);});
    syncAllCheckbox();
  }
  function syncAllCheckbox(){
    const all=document.querySelector('#vd-check-grid input[value="todos"]');
    const items=[...document.querySelectorAll('#vd-check-grid input:not([value="todos"])')];
    if(all) all.checked=items.length>0 && items.every(function(input){return input.checked;});
  }
  function selectedModules(){
    return [...document.querySelectorAll('#vd-check-grid input:not([value="todos"]):checked')].map(function(input){return input.value;});
  }
  function updateKpiVisibility(){
    const modules=selectedModules();
    document.querySelectorAll('[data-dashboard-section]').forEach(function(node){
      node.hidden=!modules.includes(node.dataset.dashboardSection);
    });
  }
  function setKpiValues(kpis){
    const values={
      'vd-kpi-cotizados-cotizaciones':kpis?.cotizados?.cotizaciones,
      'vd-kpi-cotizados-equipos':kpis?.cotizados?.equipos,
      'vd-kpi-vendidos-cotizaciones':kpis?.vendidos?.cotizaciones,
      'vd-kpi-vendidos-equipos':kpis?.vendidos?.equipos,
      'vd-kpi-perdidos-cotizaciones':kpis?.perdidos?.cotizaciones,
      'vd-kpi-perdidos-equipos':kpis?.perdidos?.equipos
    };
    Object.entries(values).forEach(function(entry){
      const node=document.getElementById(entry[0]);
      if(node) node.textContent=entry[1] == null ? '—' : Number(entry[1]).toLocaleString('es-MX');
    });
  }
  async function loadKpis(silent){
    const select=document.getElementById('vd-user-select');
    const userId=Number(select?.value);
    const requestId=++kpiRequestId;
    if(!Number.isInteger(userId)||userId<=0){
      setKpiValues(null);
      if(!silent) message('Selecciona un responsable comercial para consultar los indicadores.');
      return;
    }
    if(!silent) message('Consultando indicadores comerciales...');
    const data=await request('/api/ventas/dashboard/kpis?usuario_id='+encodeURIComponent(userId));
    if(requestId!==kpiRequestId)return;
    setKpiValues(data.kpis||{});
    if(!silent) message('');
  }
  function updateSummary(options){
    const settings=options||{};
    const select=document.getElementById('vd-user-select');
    const option=select?.selectedOptions?.[0];
    const title=document.getElementById('vd-selected-user');
    const meta=document.getElementById('vd-selected-meta');
    const modulesNode=document.getElementById('vd-selected-modules');
    const checked=[...document.querySelectorAll('#vd-check-grid input:not([value="todos"]):checked')];
    if(title) title.textContent=select?.value ? option.textContent : 'Selecciona un responsable comercial';
    if(meta) meta.textContent=select?.value ? (option.dataset.meta||'Perfil comercial activo') : 'Los indicadores se actualizarán al seleccionar un responsable.';
    if(modulesNode){
      if(checked.length===8) modulesNode.textContent='Todos los módulos seleccionados';
      else if(!checked.length) modulesNode.textContent='Sin módulos seleccionados';
      else modulesNode.textContent=checked.map(function(input){return input.nextElementSibling?.textContent||input.value;}).join(' · ');
    }
    updateKpiVisibility();
    saveState();
    document.dispatchEvent(new CustomEvent('mantto:ventas-dashboard-filters',{detail:{usuario_id:select?.value?Number(select.value):null,modulos:checked.map(function(input){return input.value;})}}));
    if(settings.refreshKpis!==false) loadKpis(Boolean(settings.silent)).catch(function(error){message(error.message||'No fue posible cargar los indicadores.','error');});
  }
  function bind(){
    if(initialized)return;
    initialized=true;
    const select=document.getElementById('vd-user-select');
    select?.addEventListener('change',function(){updateSummary({refreshKpis:true,silent:false});});
    document.getElementById('vd-check-grid')?.addEventListener('change',function(event){
      const input=event.target;
      if(!(input instanceof HTMLInputElement))return;
      if(input.value==='todos') document.querySelectorAll('#vd-check-grid input:not([value="todos"])').forEach(function(item){item.checked=input.checked;});
      else syncAllCheckbox();
      updateSummary({refreshKpis:false});
    });
    document.addEventListener('mantto:data-mutated',function(event){
      const url=String(event.detail?.url||'');
      if(url.includes('/api/ventas/cotizaciones')||url.includes('/ventas/cotizaciones')) loadKpis(true).catch(function(){});
    });
  }
  async function loadUsers(silent){
    const select=document.getElementById('vd-user-select');
    if(select){
      select.disabled=true;
      select.innerHTML='<option value="">Cargando usuarios...</option>';
    }
    if(!silent)message('Consultando responsables comerciales...');
    try{
      const data=await request('/api/ventas/dashboard/usuarios');
      users=Array.isArray(data.usuarios)?data.usuarios:[];
      renderUsers();
      applyStoredModules();
      updateSummary({refreshKpis:false});
      if(!users.length){
        setKpiValues(null);
        if(select){
          select.innerHTML='<option value="">Sin responsables comerciales disponibles</option>';
          select.disabled=true;
        }
        message('No se encontraron responsables comerciales activos.','error');
        return;
      }
      if(select) select.disabled=false;
      await loadKpis(Boolean(silent));
    }catch(error){
      users=[];
      setKpiValues(null);
      if(select){
        select.innerHTML='<option value="">No fue posible cargar usuarios</option>';
        select.disabled=true;
      }
      throw error;
    }
  }
  async function init(){
    if(loadingPromise)return loadingPromise;
    loadingPromise=(async function(){
      try{
        await ensureTemplate();
        bind();
        await loadUsers(false);
      }catch(error){
        message(error.message||'No fue posible iniciar Dashboard Ventas.','error');
      }finally{loadingPromise=null;}
    })();
    return loadingPromise;
  }

  window.ManttoVentasDashboard={
    init:init,
    refresh:function(){return Promise.all([loadUsers(true),loadKpis(true)]);},
    refreshKpis:function(){return loadKpis(true);},
    getFilters:function(){return readState();}
  };
})();

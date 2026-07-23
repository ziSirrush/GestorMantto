(function(){
  const state={bootstrap:null,catalog:[],permissions:new Map(),ready:false,users:[]};
  const PROGRAMMER_ROLES=new Set(['Programador','Programador United','Programador Corellian']);
  const VIEWER_RETURN_KEY='mantto:user-viewer:return-location';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'');
  function actor(){return window.ManttoAuth?.getActorUser?.()||{};}
  function actorRoles(){const u=actor();return new Set([u.rol,...(u.roles||[])].filter(Boolean));}
  function allowed(){return [...actorRoles()].some(r=>PROGRAMMER_ROLES.has(r));}
  function elements(){
    return {
      wrap:document.getElementById('user-viewer-wrap'),
      trigger:document.getElementById('user-viewer-trigger'),
      triggerText:document.getElementById('user-viewer-trigger-text'),
      menu:document.getElementById('user-viewer-menu'),
      search:document.getElementById('user-viewer-search'),
      list:document.getElementById('user-viewer-list'),
      banner:document.getElementById('user-viewer-banner'),
      actor:document.getElementById('user-viewer-actor'),
      view:document.getElementById('user-viewer-current'),
      exit:document.getElementById('user-viewer-exit')
    };
  }
  function userRoles(user){return (user.roles||[]).map(r=>typeof r==='string'?r:r.rol).filter(Boolean);}
  function principalRole(user){
    const principal=(user.roles||[]).find(r=>r&&r.principal)||(user.roles||[])[0]||{};
    return principal.rol||user.rol||'Sin rol';
  }
  function buildViewUser(user){
    const principal=(user.roles||[]).find(r=>r&&r.principal)||(user.roles||[])[0]||{};
    return {id_SB:user.id_SB,nombre:user.nombre,iniciales:user.iniciales,correo:user.correo,empresa:user.empresa,puesto:user.puesto,area:user.area,rol:principal.rol||user.rol||'Sin rol',rol_id:principal.id_rol||user.rol_id||null,roles:userRoles(user),roles_detalle:user.roles||[]};
  }
  function availableUsers(){
    const real=actor();
    const active=(state.bootstrap?.usuarios||[]).filter(u=>Number(u.estado)===1);
    return [real,...active.filter(u=>Number(u.id_SB)!==Number(real.id_SB))];
  }
  function userSearchText(user){
    return norm([user.nombre,user.correo,user.empresa,user.puesto,user.area,principalRole(user),...userRoles(user)].join(' '));
  }
  function renderList(filter=''){
    const {list}=elements(); if(!list)return;
    const current=window.ManttoAuth?.getUser?.()||actor();
    const query=norm(filter);
    const users=state.users.filter(user=>!query||userSearchText(user).includes(query));
    if(!users.length){
      list.innerHTML='<div class="user-viewer-empty">No se encontraron usuarios.</div>';
      return;
    }
    list.innerHTML=users.map(user=>{
      const real=Number(user.id_SB)===Number(actor().id_SB);
      const selected=Number(user.id_SB)===Number(current.id_SB);
      const meta=[principalRole(user),user.empresa||'BLT'].filter(Boolean).join(' · ');
      return `<button class="user-viewer-option${selected?' is-selected':''}" type="button" role="option" aria-selected="${selected?'true':'false'}" data-user-id="${esc(user.id_SB)}"><span><b>${esc(user.nombre||user.correo||'Usuario')}</b><small>${esc(meta)}${real?' · Sesión real':''}</small></span>${selected?'<span class="user-viewer-check" aria-hidden="true">✓</span>':''}</button>`;
    }).join('');
  }
  function updateTrigger(){
    const {triggerText}=elements(); if(!triggerText)return;
    const current=window.ManttoAuth?.getUser?.()||actor();
    triggerText.textContent=current.nombre||current.correo||'Seleccionar usuario';
  }
  function openMenu(){
    const {menu,trigger,search}=elements(); if(!menu||!trigger)return;
    menu.hidden=false; trigger.setAttribute('aria-expanded','true');
    if(search){search.value='';renderList('');setTimeout(()=>search.focus(),0);}
  }
  function closeMenu(){
    const {menu,trigger}=elements(); if(!menu||!trigger)return;
    menu.hidden=true; trigger.setAttribute('aria-expanded','false');
  }
  function toggleMenu(){const {menu}=elements();if(!menu)return;menu.hidden?openMenu():closeMenu();}
  function renderBanner(){
    const {banner,actor:actorEl,view}=elements(); if(!banner)return;
    const real=actor(), current=window.ManttoAuth?.getUser?.()||real, active=window.ManttoAuth?.isViewingAs?.();
    banner.hidden=!active;
    if(actorEl) actorEl.textContent=real.nombre||real.correo||'Usuario real';
    if(view) view.textContent=current.nombre||current.correo||'Usuario';
    document.body.classList.toggle('viewer-active',Boolean(active));
    updateTrigger();
  }
  function permissionKeysForItem(item){
    const raw=[item.dataset.permission,item.dataset.route].filter(Boolean).map(norm);
    const aliases={
      home:['inicio','home'],usuarios:['usuarios','usuario'],panelcontrol:['panelcontrol'],
      operacionresumen:['resumendeldia','resumendia','resumen'],operacioncriticos:['equiposcriticos','criticos'],
      operacioncallcenter:['dashboardcallcenter','callcenter'],operacionoperativo:['dashboardoperativo','operativo'],
      portafoliodashboard:['dashboardportafolio','portafolio'],portafoliomovimientos:['movimientosportafolio','movimientos'],
      portafolioproyectos:['proyectosdemantenimiento','proyectosmantenimiento','proyectos'],
      logisticadashboard:['dashboardlogistica'],logisticareporte:['reportedelogistica','reportelogistica'],
      instalacionesproyectos:['instalacionesproyectos','proyectosinstalaciones'],instalacionesconcentradocliente:['concentradocliente'],
      cobranzadashboard:['dashboardcobranza'],almacendashboard:['dashboardalmacen'],
      cxdashboard:['dashboardcx','customerexperiencedashboard'],
      cxencuestas:['customerexperienceencuestas'],
      cxvisitas:['customerexperiencevisitas'],
      legaldashboard:['dashboardlegal']
    };
    const key=norm(item.dataset.permission); return [...new Set([...raw,...(aliases[key]||[])])];
  }
  function catalogText(row){return norm([row.agrupacion_codigo,row.agrupacion_nombre,row.modulo_codigo,row.modulo_nombre,row.elemento_codigo,row.elemento_nombre,row.subelemento_codigo,row.subelemento_nombre].join(' '));}
  function groupKeys(group){
    const key=norm(group?.dataset?.group);
    const aliases={
      operacion:['operacion'],portafolio:['portafolio'],ventas:['ventas'],logistica:['logistica'],
      instalaciones:['instalaciones'],cobranza:['cobranza'],almacen:['almacen'],
      customerexperience:['customerexperience','costumerexperience','cx'],legal:['legal']
    };
    return [...new Set([key,...(aliases[key]||[])].filter(Boolean))];
  }
  function rowsForModule(item){
    const keys=permissionKeysForItem(item);
    return state.catalog.filter(row=>keys.some(k=>k&&catalogText(row).includes(k)));
  }
  function isActiveCatalogRow(row){
    return Number(row?.agrupacion_activo)!==0 && Number(row?.modulo_activo)!==0;
  }
  function hasModuleAccess(item){
    const permission=item.dataset.permission||'';
    if(permission==='home') return true;
    const rows=rowsForModule(item).filter(isActiveCatalogRow);
    if(!rows.length) return false;

    const actionRows=rows.filter(row=>Number(row.id_subelemento_accion)>0);
    if(!actionRows.length) return false;

    return actionRows.some(row=>state.permissions.get(Number(row.id_subelemento_accion))===true);
  }
  function hasActiveCatalogGroup(group){
    const keys=groupKeys(group);
    if(!keys.length) return false;
    return state.catalog.some(row=>Number(row.agrupacion_activo)!==0 && keys.some(k=>k&&norm([row.agrupacion_codigo,row.agrupacion_nombre].join(' ')).includes(k)));
  }

  function groupVisualRows(group){
    const keys=groupKeys(group);
    if(!keys.length)return [];
    return state.catalog.filter(row=>{
      const groupMatch=keys.some(k=>k&&norm([row.agrupacion_codigo,row.agrupacion_nombre].join(' ')).includes(k));
      return groupMatch&&Number(row.modulo_interno_visual)===1&&Number(row.id_subelemento_accion)>0;
    });
  }
  function hasGroupVisualAccess(group){
    return groupVisualRows(group).some(row=>state.permissions.get(Number(row.id_subelemento_accion))===true);
  }
  function applySidebar(){
    document.querySelectorAll('[data-permission]').forEach(item=>{
      item.hidden=!hasModuleAccess(item);
    });
    document.querySelectorAll('.side-group').forEach(group=>{
      const hasVisibleModule=Array.from(group.querySelectorAll('.side-item')).some(item=>!item.hidden);
      const hasVisualGroupPermission=hasGroupVisualAccess(group);
      group.hidden=!(hasActiveCatalogGroup(group)&&(hasVisibleModule||hasVisualGroupPermission));
    });

    const currentRoute=window.ManttoRouter?.getCurrent?.().route;
    const currentItem=currentRoute?document.querySelector(`.side-item[data-route="${CSS.escape(currentRoute)}"]`):null;
    if(currentItem?.hidden&&currentRoute!=='home') window.ManttoRouter.reset();
  }
  async function loadSessionPermissions(){
    const json=await window.ManttoAuth.apiGet('/api/panel-control/session-permissions');
    state.catalog=json.data?.catalogo||[];
    state.permissions=new Map((json.data?.permisos||[]).map(p=>[Number(p.id_subelemento_accion),p.efectivo===true]));
  }
  function rememberReturnLocation(){
    if(window.ManttoAuth?.isViewingAs?.())return;
    const hash=window.location.hash&&window.location.hash!=='#/'?window.location.hash:'#/panel-control';
    const route=window.history.state?.route||null;
    const payload=window.history.state?.payload??null;
    sessionStorage.setItem(VIEWER_RETURN_KEY,JSON.stringify({hash,route,payload}));
  }
  function consumeReturnLocation(){
    const fallback={hash:'#/panel-control',route:'panel-control',payload:null};
    try{
      const saved=JSON.parse(sessionStorage.getItem(VIEWER_RETURN_KEY)||'null');
      sessionStorage.removeItem(VIEWER_RETURN_KEY);
      if(!saved||typeof saved.hash!=='string'||!saved.hash.startsWith('#/'))return fallback;
      return {hash:saved.hash,route:saved.route||null,payload:saved.payload??null};
    }catch(error){
      sessionStorage.removeItem(VIEWER_RETURN_KEY);
      return fallback;
    }
  }
  function reloadApplicationContext(destination){
    const target=destination||{hash:'#/home',route:'home',payload:null};
    try{
      const url=new URL(window.location.href);
      url.hash=target.hash||'#/home';
      window.history.replaceState({mantto:true,route:target.route||'home',payload:target.payload??null},'',url.toString());
    }catch(error){
      window.location.hash=target.hash||'#/home';
    }
    window.location.reload();
  }
  async function change(userId){
    const real=actor();
    closeMenu();
    if(Number(userId)===Number(real.id_SB)){
      const destination=consumeReturnLocation();
      window.ManttoAuth.clearViewUser();
      state.permissions.clear();
      reloadApplicationContext(destination);
      return;
    }
    const target=(state.bootstrap?.usuarios||[]).find(u=>Number(u.id_SB)===Number(userId));
    if(!target) throw new Error('El usuario seleccionado no pertenece a tu alcance.');
    rememberReturnLocation();
    window.ManttoAuth.setViewUser(buildViewUser(target));
    reloadApplicationContext();
  }
  function bindEvents(){
    const {wrap,trigger,search,list,exit}=elements();
    trigger?.addEventListener('click',event=>{event.stopPropagation();toggleMenu();});
    search?.addEventListener('input',()=>renderList(search.value));
    search?.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();closeMenu();trigger?.focus();}});
    list?.addEventListener('click',async event=>{
      const option=event.target.closest('[data-user-id]'); if(!option)return;
      option.disabled=true;
      try{await change(option.dataset.userId);}catch(error){alert(error.message||'No fue posible cambiar la vista.');option.disabled=false;}
    });
    exit?.addEventListener('click',()=>change(actor().id_SB));
    document.addEventListener('click',event=>{if(wrap&&!wrap.contains(event.target))closeMenu();});
  }
  async function init(){
    if(state.ready)return; state.ready=true;
    const {wrap}=elements();
    try{
      await loadSessionPermissions();
      applySidebar();

      if(allowed()){
        const json=await window.ManttoAuth.apiGet('/api/panel-control/bootstrap');
        state.bootstrap=json.data||{};
        state.users=availableUsers();
        renderList('');
        if(wrap)wrap.hidden=false;
        renderBanner();
        bindEvents();
      }else if(wrap){
        wrap.hidden=true;
      }
    }catch(error){
      console.error('[Permisos de sesión]',error);
      state.catalog=[];
      state.permissions.clear();
      applySidebar();
      if(wrap)wrap.hidden=true;
    }
  }
  document.addEventListener('mantto:auth-ready',init);
  document.addEventListener('mantto:view-user-changed',async()=>{
    try{await loadSessionPermissions();}catch(error){console.error('[Permisos de sesión]',error);state.permissions.clear();}
    renderBanner();applySidebar();renderList('');
  });
  window.ManttoUserViewer={init,applySidebar};
})();

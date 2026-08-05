(function(){
  const state={
    catalog:[],
    permissions:new Map(),
    ready:false,
    users:[],
    usersLoaded:false,
    canUseViewer:false,
    headerBound:false,
    bannerBound:false
  };
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'');

  function actor(){return window.ManttoAuth?.getActorUser?.()||{};}
  function allowed(){return Boolean(state.canUseViewer)&&!window.ManttoAuth?.isViewingAs?.();}
  function elements(){
    return {
      banner:document.getElementById('user-viewer-banner'),
      actor:document.getElementById('user-viewer-actor'),
      view:document.getElementById('user-viewer-current'),
      exit:document.getElementById('user-viewer-exit'),
      wrap:document.getElementById('user-viewer-wrap'),
      trigger:document.getElementById('user-viewer-trigger'),
      menu:document.getElementById('user-viewer-menu'),
      search:document.getElementById('user-viewer-search'),
      list:document.getElementById('user-viewer-list')
    };
  }
  function userRoles(user){return (user.roles||[]).map(r=>typeof r==='string'?r:r.rol).filter(Boolean);}
  function principalRole(user){
    const principal=(user.roles||[]).find(r=>r&&r.principal)||(user.roles||[])[0]||{};
    return principal.rol||user.rol||'Sin rol';
  }
  function buildViewUser(user){
    const principal=(user.roles||[]).find(r=>r&&r.principal)||(user.roles||[])[0]||{};
    return {
      id_SB:user.id_SB,
      nombre:user.nombre,
      iniciales:user.iniciales,
      correo:user.correo,
      empresa:user.empresa,
      puesto:user.puesto,
      area:user.area,
      rol:principal.rol||user.rol||'Sin rol',
      rol_id:principal.id_rol||user.rol_id||null,
      roles:userRoles(user),
      roles_detalle:user.roles||[]
    };
  }
  function userSearchText(user){
    return norm([user.nombre,user.correo,user.empresa,user.puesto,user.area,principalRole(user),...userRoles(user)].join(' '));
  }
  function filteredUsers(filter=''){
    const query=norm(filter);
    return state.users.filter(user=>!query||userSearchText(user).includes(query));
  }
  function optionHtml(user){
    const meta=[principalRole(user),user.empresa||'BLT'].filter(Boolean).join(' · ');
    return `<button class="user-viewer-option" type="button" data-viewer-user-id="${esc(user.id_SB)}"><span><b>${esc(user.nombre||user.correo||'Usuario')}</b><small>${esc(meta)}</small></span><span class="user-viewer-open" aria-hidden="true">↗</span></button>`;
  }
  function bindOptionButtons(root){
    root?.querySelectorAll?.('[data-viewer-user-id]').forEach(button=>button.addEventListener('click',async()=>{
      button.disabled=true;
      try{
        await openViewer(button.dataset.viewerUserId);
      }catch(error){
        alert(error.message||'No fue posible abrir el Visor de usuarios.');
      }finally{
        button.disabled=false;
      }
    }));
  }
  function renderHeaderList(filter=''){
    const {list}=elements();
    if(!list)return;
    const users=filteredUsers(filter);
    list.innerHTML=users.length?users.map(optionHtml).join(''):'<div class="user-viewer-empty">No se encontraron usuarios.</div>';
    bindOptionButtons(list);
  }
  function panelHtml(){
    return `<section class="user-viewer-panel"><div class="user-viewer-panel-head"><div><span>VISOR DE USUARIOS</span><h2>Abrir vista de otro usuario</h2><p>La vista se abrirá en una pestaña nueva con un contexto independiente del usuario seleccionado.</p></div></div><div class="user-viewer-panel-search"><input id="user-viewer-panel-search" type="search" autocomplete="off" placeholder="Buscar por nombre, correo, rol o empresa..."></div><div class="user-viewer-panel-list" id="user-viewer-panel-list"></div></section>`;
  }
  function renderPanelList(filter=''){
    const list=document.getElementById('user-viewer-panel-list');
    if(!list)return;
    const users=filteredUsers(filter);
    list.innerHTML=users.length?users.map(optionHtml).join(''):'<div class="user-viewer-empty">No se encontraron usuarios.</div>';
    bindOptionButtons(list);
  }
  async function loadViewerUsers(force=false){
    if(state.usersLoaded&&!force)return state.users;
    const json=await window.ManttoAuth.apiGet('/api/panel-control/viewer-users');
    state.users=json.data?.usuarios||[];
    state.usersLoaded=true;
    renderHeaderList(elements().search?.value||'');
    return state.users;
  }
  async function renderPanel(container){
    if(!container)return;
    if(!allowed()){
      container.innerHTML='<section class="user-viewer-panel"><div class="user-viewer-empty">No tienes autorización para usar el Visor de usuarios.</div></section>';
      return;
    }
    await loadViewerUsers();
    container.innerHTML=panelHtml();
    const search=document.getElementById('user-viewer-panel-search');
    search?.addEventListener('input',()=>renderPanelList(search.value));
    renderPanelList('');
  }
  function closeHeaderMenu(){
    const {trigger,menu}=elements();
    if(menu)menu.hidden=true;
    trigger?.setAttribute('aria-expanded','false');
  }
  async function openHeaderMenu(){
    const {trigger,menu,search}=elements();
    if(!allowed()||!menu)return;
    await loadViewerUsers();
    menu.hidden=false;
    trigger?.setAttribute('aria-expanded','true');
    renderHeaderList(search?.value||'');
    window.setTimeout(()=>search?.focus(),0);
  }
  function toggleHeaderMenu(){
    const {menu}=elements();
    if(!menu||!menu.hidden){closeHeaderMenu();return;}
    openHeaderMenu().catch(error=>alert(error.message||'No fue posible cargar los usuarios.'));
  }
  function renderLauncher(){
    const {wrap}=elements();
    if(wrap)wrap.hidden=!allowed();
    if(!allowed())closeHeaderMenu();
  }
  async function openViewer(userId){
    if(!allowed())throw new Error('No tienes autorización para usar el Visor de usuarios.');
    const target=state.users.find(user=>Number(user.id_SB)===Number(userId));
    if(!target)throw new Error('El usuario seleccionado no pertenece a tu alcance.');

    const viewerWindow=window.open('about:blank','_blank');
    if(!viewerWindow)throw new Error('El navegador bloqueó la pestaña nueva. Habilita las ventanas emergentes para este sitio.');

    try{
      viewerWindow.document.title='Preparando Visor de usuarios...';
      viewerWindow.document.body.innerHTML='<p style="font-family:system-ui;padding:24px;color:#0d2e6e">Preparando vista del usuario seleccionado...</p>';
      const response=await window.ManttoAuth.api('/api/panel-control/viewer-context',{method:'POST',body:JSON.stringify({id_usuario:Number(target.id_SB)}),skipMutationEvent:true});
      const context=response.data||{};
      const url=window.ManttoAuth?.createViewerLaunch?.({
        user:buildViewUser(target),
        viewer_token:context.viewer_token
      });
      if(!url)throw new Error('No fue posible crear el contexto temporal del visor.');
      viewerWindow.location.replace(url);
      try{viewerWindow.opener=null;}catch(error){}
      closeHeaderMenu();
    }catch(error){
      try{viewerWindow.close();}catch(closeError){}
      throw error;
    }
  }
  async function exitViewer(){
    try{
      await window.ManttoAuth?.api?.('/api/panel-control/viewer-close',{
        method:'POST',
        body:'{}',
        skipMutationEvent:true
      });
    }catch(error){
      console.warn('[Visor] No fue posible registrar el cierre:',error.message||error);
    }
    window.ManttoAuth?.clearViewUser?.();
    window.close();
    window.setTimeout(()=>{
      if(window.closed)return;
      window.location.hash='#/home';
      window.location.reload();
    },120);
  }
  function renderBanner(){
    const {banner,actor:actorEl,view}=elements();
    if(!banner)return;
    const real=actor();
    const current=window.ManttoAuth?.getUser?.()||real;
    const active=window.ManttoAuth?.isViewingAs?.();
    banner.hidden=!active;
    if(actorEl)actorEl.textContent=real.nombre||real.correo||'Usuario real';
    if(view)view.textContent=current.nombre||current.correo||'Usuario';
    document.body.classList.toggle('viewer-active',Boolean(active));
  }

  function permissionKeysForItem(item){
    const raw=[item.dataset.permission,item.dataset.route].filter(Boolean).map(norm);
    const aliases={
      home:['inicio','home'],usuarios:['usuarios','usuario'],panelcontrol:['panelcontrol','paneldecontrol','generalpaneldecontrol'],
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
      legaldashboard:['dashboardlegal'],
      soportedashboard:['dashboardsoporte','soportedashboard'],
      soportesolicitudes:['solicitudessoporte','soportesolicitudes'],
      soportechats:['chatssoporte','soportechats']
    };
    const key=norm(item.dataset.permission);
    return [...new Set([...raw,...(aliases[key]||[])])];
  }
  function groupKeys(group){
    const key=norm(group?.dataset?.group);
    const aliases={
      operacion:['operacion'],portafolio:['portafolio'],ventas:['ventas'],logistica:['logistica'],
      instalaciones:['instalaciones'],cobranza:['cobranza'],almacen:['almacen'],
      customerexperience:['customerexperience','costumerexperience','cx'],legal:['legal'],soporte:['soporte']
    };
    return [...new Set([key,...(aliases[key]||[])].filter(Boolean))];
  }
  function catalogGroupKeys(row){return [row.agrupacion_codigo,row.agrupacion_nombre].map(norm).filter(Boolean);}
  function catalogModuleKeys(row){return [row.modulo_codigo,row.modulo_nombre,row.modulo_ruta_frontend].map(norm).filter(Boolean);}
  function rowsForModule(item){
    const keys=permissionKeysForItem(item);
    if(!keys.length)return [];
    const group=item.closest('.side-group');
    const acceptedGroups=groupKeys(group);
    return state.catalog.filter(row=>{
      if(Number(row.modulo_interno_visual)===1)return false;
      if(group){
        const catalogGroups=catalogGroupKeys(row);
        const sameGroup=acceptedGroups.some(key=>key&&catalogGroups.includes(key));
        if(!sameGroup)return false;
      }
      const moduleKeys=catalogModuleKeys(row);
      return keys.some(key=>key&&moduleKeys.includes(key));
    });
  }
  function isActiveCatalogRow(row){return Number(row?.agrupacion_activo)!==0&&Number(row?.modulo_activo)!==0;}
  function hasModuleAccess(item){
    const permission=item.dataset.permission||'';
    if(permission==='home')return true;
    const rows=rowsForModule(item).filter(isActiveCatalogRow);
    if(!rows.length)return false;
    const actionRows=rows.filter(row=>Number(row.id_subelemento_accion)>0);
    if(!actionRows.length)return false;
    return actionRows.some(row=>state.permissions.get(Number(row.id_subelemento_accion))===true);
  }
  function hasActiveCatalogGroup(group){
    const keys=groupKeys(group);
    if(!keys.length)return false;
    return state.catalog.some(row=>Number(row.agrupacion_activo)!==0&&keys.some(key=>key&&norm([row.agrupacion_codigo,row.agrupacion_nombre].join(' ')).includes(key)));
  }
  function groupVisualRows(group){
    const keys=groupKeys(group);
    if(!keys.length)return [];
    return state.catalog.filter(row=>{
      const groupMatch=keys.some(key=>key&&norm([row.agrupacion_codigo,row.agrupacion_nombre].join(' ')).includes(key));
      return groupMatch&&Number(row.modulo_interno_visual)===1&&Number(row.id_subelemento_accion)>0;
    });
  }
  function hasGroupVisualAccess(group){return groupVisualRows(group).some(row=>state.permissions.get(Number(row.id_subelemento_accion))===true);}
  function applySidebar(){
    document.querySelectorAll('[data-permission]').forEach(item=>{item.hidden=!hasModuleAccess(item);});
    document.querySelectorAll('.side-group').forEach(group=>{
      const hasVisibleModule=Array.from(group.querySelectorAll('.side-item')).some(item=>!item.hidden);
      const hasVisualGroupPermission=hasGroupVisualAccess(group);
      group.hidden=!(hasActiveCatalogGroup(group)&&(hasVisibleModule||hasVisualGroupPermission));
    });
    const currentRoute=window.ManttoRouter?.getCurrent?.().route;
    const currentItem=currentRoute?document.querySelector(`.side-item[data-route="${CSS.escape(currentRoute)}"]`):null;
    if(currentItem?.hidden&&currentRoute!=='home')window.ManttoRouter.reset();
  }
  async function loadSessionPermissions(){
    const json=await window.ManttoAuth.apiGet('/api/panel-control/session-permissions');
    state.catalog=json.data?.catalogo||[];
    state.permissions=new Map((json.data?.permisos||[]).map(permission=>[Number(permission.id_subelemento_accion),permission.efectivo===true]));
    state.canUseViewer=Boolean(json.data?.puede_usar_visor);
  }
  function bindHeader(){
    if(state.headerBound)return;
    state.headerBound=true;
    const {wrap,trigger,search}=elements();
    trigger?.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();toggleHeaderMenu();});
    search?.addEventListener('input',()=>renderHeaderList(search.value));
    wrap?.addEventListener('click',event=>event.stopPropagation());
    document.addEventListener('click',closeHeaderMenu);
    document.addEventListener('keydown',event=>{if(event.key==='Escape')closeHeaderMenu();});
  }
  function bindBanner(){
    if(state.bannerBound)return;
    state.bannerBound=true;
    elements().exit?.addEventListener('click',exitViewer);
  }
  async function init(){
    if(state.ready)return;
    state.ready=true;
    bindHeader();
    bindBanner();
    try{
      await loadSessionPermissions();
      applySidebar();
      renderLauncher();
      renderBanner();
      if(allowed())await loadViewerUsers();
    }catch(error){
      console.error('[Permisos de sesión]',error);
      state.catalog=[];
      state.permissions.clear();
      state.canUseViewer=false;
      applySidebar();
      renderLauncher();
      renderBanner();
    }
  }
  document.addEventListener('mantto:auth-ready',init);
  document.addEventListener('mantto:view-user-changed',async()=>{
    try{await loadSessionPermissions();}catch(error){console.error('[Permisos de sesión]',error);state.permissions.clear();state.canUseViewer=false;}
    renderLauncher();
    renderBanner();
    applySidebar();
  });
  window.ManttoUserViewer={init,applySidebar,allowed,renderPanel,openViewer};
})();

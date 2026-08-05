(function(){
  const POLL_MS = 60000;
  const STALE_MS = 30000;
  const MIN_REFRESH_GAP_MS = 1500;
  const state = {
    route:'home',
    payload:null,
    lastSync:new Map(),
    running:new Map(),
    handlers:new Map(),
    pollTimer:null,
    observer:null,
    channel:null
  };

  const routeObjects = Object.freeze({
    home:'ManttoHome',
    resumen:'ManttoResumenDia',
    criticos:'ManttoEquiposCriticos',
    portafolio:'ManttoPortafolio',
    proyectos:'ManttoProyectos',
    callcenter:'ManttoCallCenter',
    operativo:'ManttoDashboardOperativo',
    movimientos:'ManttoMovimientosPortafolio',
    usuarios:'ManttoUsuarios',
    'panel-control':'ManttoPanelControl',
    'ventas-dashboard':'ManttoVentasDashboard',
    'ventas-clientes':'ManttoVentasClientes',
    'ventas-cotizaciones':'ManttoVentasCotizaciones',
    'ventas-proyeccion':'ManttoVentasProyeccion',
    'ventas-perdidos':'ManttoVentasPerdidos',
    'ventas-vendidos':'ManttoVentasVendidos',
    'ventas-prospeccion':'ManttoVentasProspeccion',
    'ventas-mapa-prospeccion':'ManttoVentasMapaProspeccion',
    'ventas-asignacion-redes':'ManttoVentasAsignacionRedes',
    'soporte-solicitudes':'ManttoSoporteSolicitudes'
  });

  function currentUser(){
    return window.ManttoAuth?.getActorUser?.() || window.ManttoAuth?.getUser?.() || {};
  }

  function isProgrammer(){
    const user=currentUser();
    const roles=[user.rol].concat(Array.isArray(user.roles)?user.roles:[])
      .map(v=>String(v||'').trim().toLowerCase());
    return roles.some(role=>role==='programador' || role==='programador united' || role==='programador corellian');
  }

  function isManualRefreshControl(el){
    if(!el || el.dataset.keepRefreshVisible==='true') return false;
    const text=String(el.textContent||'').replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim().toLowerCase();
    const title=String(el.getAttribute('title')||'').trim().toLowerCase();
    const onclick=String(el.getAttribute('onclick')||'').toLowerCase();
    const exact=/^(actualizar|recargar|refrescar|sincronizar)$/;
    return exact.test(text) || exact.test(title) || /\b(refresh|reload|actualizar|recargar|refrescar)\s*\(/.test(onclick);
  }

  function applyRefreshVisibility(root){
    const scope=root && root.querySelectorAll ? root : document;
    const controls=[];
    if(root && root.matches && root.matches('button,a,[role="button"]')) controls.push(root);
    controls.push(...scope.querySelectorAll('button,a,[role="button"]'));
    const programmer=isProgrammer();
    controls.forEach(el=>{
      if(!isManualRefreshControl(el)) return;
      el.dataset.manualRefreshControl='true';
      el.hidden=!programmer;
      el.setAttribute('aria-hidden', programmer?'false':'true');
      if(!programmer) el.setAttribute('tabindex','-1');
      else el.removeAttribute('tabindex');
    });
  }

  function resolveHandler(route){
    if(state.handlers.has(route)) return state.handlers.get(route);
    const objectName=routeObjects[route];
    const target=objectName ? window[objectName] : null;
    if(!target) return null;
    if(typeof target.refresh==='function') return ()=>target.refresh(state.payload);
    if(typeof target.reload==='function') return ()=>target.reload(state.payload);
    if(typeof target.load==='function') return ()=>target.load(state.payload);
    if(typeof target.init==='function') return ()=>target.init(state.payload, { revalidate:true });
    return null;
  }

  function markSynced(route){
    state.lastSync.set(route || state.route, Date.now());
    document.dispatchEvent(new CustomEvent('mantto:data-synced',{detail:{route:route||state.route,at:Date.now()}}));
  }

  async function refresh(route, reason, options){
    const targetRoute=route || state.route;
    const opts=options || {};
    if(document.hidden && !opts.force) return false;
    const last=state.lastSync.get(targetRoute)||0;
    if(!opts.force && Date.now()-last<MIN_REFRESH_GAP_MS) return false;
    if(state.running.has(targetRoute)) return state.running.get(targetRoute);
    const handler=resolveHandler(targetRoute);
    if(!handler) return false;
    const task=Promise.resolve().then(()=>handler()).then(()=>{
      markSynced(targetRoute);
      return true;
    }).catch(error=>{
      console.warn('[DataSync] No se pudo revalidar '+targetRoute+' ('+(reason||'sin motivo')+').', error);
      return false;
    }).finally(()=>state.running.delete(targetRoute));
    state.running.set(targetRoute,task);
    return task;
  }

  function register(route, handler){
    if(route && typeof handler==='function') state.handlers.set(String(route),handler);
  }

  function routeFromApiPath(path){
    const value=String(path||'').toLowerCase();
    if(value.includes('/ventas/cotizaciones')) return 'ventas-cotizaciones';
    if(value.includes('/ventas/prospeccion')) return 'ventas-prospeccion';
    if(value.includes('/ventas/redes')) return 'ventas-asignacion-redes';
    if(value.includes('/ventas/clientes')) return 'ventas-clientes';
    if(value.includes('/usuarios') || value.includes('/auth/me')) return 'usuarios';
    if(value.includes('/panel-control')) return 'panel-control';
    if(value.includes('/notificaciones')) return 'home';
    if(value.includes('/tickets')) return state.route==='resumen'||state.route==='callcenter'?state.route:'home';
    if(value.includes('/pendientes') || value.includes('/tareas')) return 'home';
    return state.route;
  }

  function notifyMutation(detail){
    const targetRoute=detail?.route || routeFromApiPath(detail?.path);
    window.setTimeout(()=>refresh(targetRoute,'mutacion',{force:true}),80);
    if(targetRoute!==state.route) window.setTimeout(()=>refresh(state.route,'mutacion-relacionada'),180);
    try{ state.channel?.postMessage({type:'mutation',route:targetRoute,at:Date.now()}); }catch(e){}
  }

  function startPolling(){
    if(state.pollTimer) clearInterval(state.pollTimer);
    state.pollTimer=setInterval(()=>{
      if(document.hidden || !navigator.onLine) return;
      refresh(state.route,'polling-respaldo');
    },POLL_MS);
  }

  function bind(){
    document.addEventListener('mantto:navigation',event=>{
      state.route=event.detail?.route || 'home';
      state.payload=event.detail?.payload || null;
      applyRefreshVisibility(document);
      if(event.detail?.type==='back') window.setTimeout(()=>refresh(state.route,'regreso',{force:true}),220);
      else markSynced(state.route);
    });
    document.addEventListener('mantto:navigation-restore',()=>window.setTimeout(()=>refresh(state.route,'restauracion',{force:true}),260));
    document.addEventListener('mantto:data-mutated',event=>notifyMutation(event.detail||{}));
    document.addEventListener('mantto:auth-ready',()=>applyRefreshVisibility(document));
    document.addEventListener('visibilitychange',()=>{
      if(document.hidden) return;
      applyRefreshVisibility(document);
      const last=state.lastSync.get(state.route)||0;
      if(Date.now()-last>=STALE_MS) refresh(state.route,'pestana-visible',{force:true});
    });
    window.addEventListener('online',()=>refresh(state.route,'conexion-restaurada',{force:true}));
    if('BroadcastChannel' in window){
      state.channel=new BroadcastChannel('mantto-data-sync');
      state.channel.onmessage=event=>{
        if(event.data?.type==='mutation') refresh(event.data.route||state.route,'otra-pestana',{force:true});
      };
    }
    state.observer=new MutationObserver(entries=>entries.forEach(entry=>entry.addedNodes.forEach(node=>{
      if(node.nodeType===1) applyRefreshVisibility(node);
    })));
    state.observer.observe(document.documentElement,{childList:true,subtree:true});
    applyRefreshVisibility(document);
    startPolling();
  }

  window.ManttoDataSync={register,refresh,notifyMutation,isProgrammer,applyRefreshVisibility,markSynced};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',bind,{once:true});
  else bind();
})();

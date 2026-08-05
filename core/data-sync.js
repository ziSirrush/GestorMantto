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
    return window.ManttoAuth?.getUser?.() || window.ManttoAuth?.getActorUser?.() || {};
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

  const technicalContainerSelector = [
    '[id*="status"]',
    '[class*="status"]',
    '[class*="connection"]',
    '[class*="conexion"]',
    '[class*="eyebrow"]',
    '[data-technical-status]'
  ].join(',');

  function textContainsTechnicalOrigin(value){
    return /(^|\s|[·:])(?:aiven|api)(?=$|\s|[·:])/i.test(String(value||''));
  }

  function technicalContainerFor(element){
    if(!element || element.nodeType!==1) return null;
    const candidate=element.matches?.(technicalContainerSelector)
      ? element
      : element.closest?.(technicalContainerSelector);
    if(!candidate || !textContainsTechnicalOrigin(candidate.textContent)) return null;
    return candidate;
  }

  function sanitizeTechnicalCopy(root, programmer){
    const scope=root && root.querySelectorAll ? root : document;
    const candidates=[];
    if(root?.nodeType===1) candidates.push(root);
    candidates.push(...scope.querySelectorAll('p,small,span,div,td'));
    candidates.forEach(element=>{
      if(element.childElementCount>0 || technicalContainerFor(element)) return;
      const text=String(element.textContent||'');
      if(!textContainsTechnicalOrigin(text) && !element.dataset.technicalOriginalText) return;
      if(!element.dataset.technicalOriginalText) element.dataset.technicalOriginalText=text;
      if(programmer){
        element.textContent=element.dataset.technicalOriginalText;
        return;
      }
      const generic=element.dataset.technicalOriginalText
        .replace(/consultando\s+aiven/gi,'Cargando información')
        .replace(/cargando(?:\s+datos)?\s+desde\s+aiven/gi,'Cargando información')
        .replace(/cargando\s+aiven/gi,'Cargando información')
        .replace(/no\s+fue\s+posible\s+consultar\s+aiven/gi,'No fue posible cargar la información')
        .replace(/\s+consultad[oa]s?\s+desde\s+aiven/gi,'')
        .replace(/\s+desde\s+aiven/gi,'')
        .replace(/\s+en\s+aiven/gi,'')
        .replace(/aiven\s*[·:-]\s*/gi,'')
        .replace(/\s{2,}/g,' ')
        .trim();
      element.textContent=generic || 'Cargando información...';
    });
  }

  function applyTechnicalVisibility(root){
    const scope=root && root.querySelectorAll ? root : document;
    const programmer=isProgrammer();
    const containers=new Set();
    if(root?.nodeType===1){
      const own=technicalContainerFor(root);
      if(own) containers.add(own);
    }
    scope.querySelectorAll(technicalContainerSelector).forEach(element=>{
      if(textContainsTechnicalOrigin(element.textContent)) containers.add(element);
    });
    containers.forEach(element=>{
      element.dataset.programmerTechnicalControl='true';
      element.hidden=!programmer;
      element.setAttribute('aria-hidden',programmer?'false':'true');
    });
    sanitizeTechnicalCopy(root,programmer);
    document.body?.classList.toggle('effective-programmer',programmer);
  }

  function applyRoleVisibility(root){
    applyRefreshVisibility(root);
    applyTechnicalVisibility(root);
  }

  function normalizeRegisteredHandler(entry, context){
    if(typeof entry==='function') return ()=>entry(context);
    if(entry && typeof entry.backgroundSync==='function') return ()=>entry.backgroundSync(context);
    if(entry && typeof entry.sync==='function') return ()=>entry.sync(context);
    return null;
  }

  function resolveHandler(route, context){
    if(state.handlers.has(route)){
      const registered=normalizeRegisteredHandler(state.handlers.get(route),context);
      if(registered) return registered;
    }
    const objectName=routeObjects[route];
    const target=objectName ? window[objectName] : null;
    if(!target) return null;
    if(typeof target.backgroundSync==='function') return ()=>target.backgroundSync(context);
    if(typeof target.syncInBackground==='function') return ()=>target.syncInBackground(context);
    if(typeof target.refreshSilent==='function') return ()=>target.refreshSilent(context);
    return null;
  }

  function supportsBackgroundSync(route){
    const targetRoute=String(route||state.route||'');
    return Boolean(resolveHandler(targetRoute,{
      route:targetRoute,
      reason:'capability-check',
      payload:state.payload,
      silent:true,
      preserveUi:true,
      background:true
    }));
  }

  function markSynced(route){
    const targetRoute=route || state.route;
    const at=Date.now();
    state.lastSync.set(targetRoute,at);
    document.dispatchEvent(new CustomEvent('mantto:data-synced',{detail:{route:targetRoute,at}}));
  }

  function markAttempted(route){
    state.lastSync.set(route || state.route,Date.now());
  }

  function dispatchBackgroundRequest(route, reason){
    const detail={
      route,
      reason:reason||'sin motivo',
      payload:state.payload,
      silent:true,
      preserveUi:true,
      background:true,
      handled:false,
      at:Date.now()
    };
    document.dispatchEvent(new CustomEvent('mantto:background-sync-request',{detail}));
    return detail.handled===true;
  }

  async function refresh(route, reason, options){
    const targetRoute=route || state.route;
    const opts=options || {};
    if(document.hidden && !opts.force) return false;
    const last=state.lastSync.get(targetRoute)||0;
    if(!opts.force && Date.now()-last<MIN_REFRESH_GAP_MS) return false;
    if(state.running.has(targetRoute)) return state.running.get(targetRoute);

    const context={
      route:targetRoute,
      reason:reason||'sin motivo',
      payload:targetRoute===state.route?state.payload:null,
      silent:true,
      preserveUi:true,
      background:true,
      force:Boolean(opts.force)
    };
    const handler=resolveHandler(targetRoute,context);

    if(!handler){
      const handledByEvent=dispatchBackgroundRequest(targetRoute,reason);
      markAttempted(targetRoute);
      return handledByEvent;
    }

    const task=Promise.resolve().then(()=>handler()).then(result=>{
      if(result===false){
        markAttempted(targetRoute);
        return false;
      }
      markSynced(targetRoute);
      return true;
    }).catch(error=>{
      console.warn('[DataSync] No se pudo sincronizar en segundo plano '+targetRoute+' ('+(reason||'sin motivo')+').', error);
      markAttempted(targetRoute);
      return false;
    }).finally(()=>state.running.delete(targetRoute));
    state.running.set(targetRoute,task);
    return task;
  }

  function register(route, handler){
    if(!route) return false;
    const valid=typeof handler==='function'
      || Boolean(handler && (typeof handler.backgroundSync==='function' || typeof handler.sync==='function'));
    if(!valid) return false;
    state.handlers.set(String(route),handler);
    return true;
  }

  function unregister(route){
    return state.handlers.delete(String(route||''));
  }

  function routeFromApiPath(path){
    const value=String(path||'').toLowerCase();
    if(value.includes('/ventas/dashboard')) return 'ventas-dashboard';
    if(value.includes('/ventas/cotizaciones/vendidos')) return 'ventas-vendidos';
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
    const targetRoute=detail?.route || routeFromApiPath(detail?.path || detail?.url);
    window.setTimeout(()=>refresh(targetRoute,'mutacion',{force:true}),80);
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
      applyRoleVisibility(document);
      if(event.detail?.type==='back') window.setTimeout(()=>refresh(state.route,'regreso',{force:true}),220);
      else markSynced(state.route);
    });
    document.addEventListener('mantto:navigation-restore',()=>window.setTimeout(()=>refresh(state.route,'restauracion',{force:true}),260));
    document.addEventListener('mantto:data-mutated',event=>notifyMutation(event.detail||{}));
    document.addEventListener('mantto:auth-ready',()=>applyRoleVisibility(document));
    document.addEventListener('mantto:view-user-changed',()=>applyRoleVisibility(document));
    document.addEventListener('visibilitychange',()=>{
      if(document.hidden) return;
      applyRoleVisibility(document);
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
      if(node.nodeType===1) applyRoleVisibility(node);
    })));
    state.observer.observe(document.documentElement,{childList:true,subtree:true});
    applyRoleVisibility(document);
    startPolling();
  }

  window.ManttoDataSync={
    register,
    unregister,
    refresh,
    notifyMutation,
    supportsBackgroundSync,
    isProgrammer,
    applyRefreshVisibility,
    applyTechnicalVisibility,
    applyRoleVisibility,
    markSynced
  };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',bind,{once:true});
  else bind();
})();

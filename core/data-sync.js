(function(){
  'use strict';

  // [Aster | 2026-08-31 | ASTER-MG | FASE 1 CORE NAVEGACION/SYNC GLOBAL V001]
  // [Aster | 2026-09-01 | ASTER-MG | FASE 2 REUSO GLOBAL MODULOS LEGACY V001]
  // [Aster | 2026-09-01 | ASTER-MG | FASE 3 SYNC SELECTIVO + DEPENDENCIAS CRUZADAS V001]
  // Contrato global de datos:
  // 1) entrar por primera vez => el modulo carga sus datos;
  // 2) navegar y regresar sin cambios => DataSync NO fuerza una nueva consulta;
  // 3) una mutacion exitosa => invalida solo las vistas consumidoras afectadas;
  // 4) una vista inactiva nunca se consulta en segundo plano: queda dirty hasta abrirse;
  // 5) los botones funcionales Actualizar/Recargar son visibles para cualquier usuario autorizado;
  //    solo un control marcado explicitamente como tecnico/programador se restringe por rol.

  const MIN_REFRESH_GAP_MS = 1500;
  const state = {
    route:'home',
    payload:null,
    lastSync:new Map(),
    running:new Map(),
    handlers:new Map(),
    dirty:new Set(),
    mutationTimers:new Map(),
    observer:null,
    channel:null
  };

  // Objetos ya existentes que pueden exponer backgroundSync/syncInBackground/refreshSilent.
  // Las fases siguientes pueden registrar adaptadores adicionales con ManttoDataSync.register().
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
    'ventas-proyectos-interes':'ManttoVentasProyectosInteres',

    'almacen-dashboard':'ManttoAlmacen',
    'almacen-inventario':'ManttoAlmacen',
    'almacen-stock':'ManttoAlmacen',
    'almacen-prestamos':'ManttoAlmacen',
    'almacen-resguardos':'ManttoAlmacen',
    'almacen-auditoria':'ManttoAlmacen',
    'almacen-carga':'ManttoAlmacenCarga',

    'cobranza-uni-estados-cuenta':'ManttoCobranza_uni',
    'cobranza-uni-mp-pro':'ManttoCobranza_uni',
    'cobranza-uni-aditivas':'ManttoCobranza_uni',

    'experimental-atencion-prioritaria':'ManttoAtencionPrioritaria_exp',
    'experimental-resumen-dia':'ManttoResumenDiaExperimental_exp',
    'experimental-entregas-recientes':'ManttoEntregasRecientesExperimental_uni',
    'experimental-equipos-criticos':'ManttoEquiposCriticosExperimental_uni',
    'experimental-dashboard-call-center':'ManttoDashboardCallCenterExperimental_uni',
    'experimental-proyectos-criticos':'ManttoProyectosCriticosExperimental_uni',

    'logistica-dashboard':'ManttoDashboardLogistica',
    'logistica-reporte':'ManttoReporteLogistica',

    'instalaciones-dashboard':'ManttoInstalacionesDashboard_cor',
    'instalaciones-proyectos':'ManttoInstalacionesProyectos',
    'instalaciones-cerrados':'ManttoInstalacionesCerrados',
    'instalaciones-concentrado-cliente':'ManttoInstalacionesConcentradoCliente',
    'instalaciones-reporte':'ManttoInstalacionesReporte_cor',
    'instalaciones-ajuste':'ManttoInstalacionesAjuste_cor',
    'instalaciones-carpetas':'ManttoInstalacionesCarpetas_cor',
    'instalaciones-documentacion':'ManttoInstalacionesDocumentacion_cor',

    'ventas-fotos-mapa':'ManttoVentasFotosMapa',

    'soporte-solicitudes':'ManttoSoporteSolicitudes'
  });

  // Adaptadores de Fase 3 para modulos que ya conservaban datos localmente, pero cuyo
  // init() no fuerza una consulta cuando el Core los marca dirty. Se usan solo como
  // fallback: si un modulo expone backgroundSync/syncInBackground/refreshSilent, ese
  // contrato nativo sigue teniendo prioridad.
  const ROUTE_REFRESH_ADAPTERS = Object.freeze({
    resumen:Object.freeze({object:'ManttoResumenDia',method:'load'}),
    callcenter:Object.freeze({object:'ManttoCallCenter',method:'reload',args:()=>[{forceSecondary:true}]}),
    operativo:Object.freeze({object:'ManttoDashboardOperativo',method:'init',args:()=>[true]}),

    'logistica-dashboard':Object.freeze({object:'ManttoDashboardLogistica',method:'reload'}),
    'logistica-reporte':Object.freeze({object:'ManttoReporteLogistica',method:'reload'}),

    'instalaciones-dashboard':Object.freeze({object:'ManttoInstalacionesDashboard_cor',method:'refresh',args:()=>[true]}),
    'instalaciones-proyectos':Object.freeze({object:'ManttoInstalacionesProyectos',method:'reload'}),
    'instalaciones-cerrados':Object.freeze({object:'ManttoInstalacionesCerrados',method:'reload'}),
    'instalaciones-concentrado-cliente':Object.freeze({object:'ManttoInstalacionesConcentradoCliente',method:'refresh',args:()=>[true]}),
    'instalaciones-reporte':Object.freeze({object:'ManttoInstalacionesReporte_cor',method:'refresh',args:()=>[true]}),
    'instalaciones-ajuste':Object.freeze({object:'ManttoInstalacionesAjuste_cor',method:'refresh',args:()=>[true]}),
    'instalaciones-carpetas':Object.freeze({object:'ManttoInstalacionesCarpetas_cor',method:'refresh',args:()=>[true]}),
    'instalaciones-documentacion':Object.freeze({object:'ManttoInstalacionesDocumentacion_cor',method:'reload'}),

    'ventas-fotos-mapa':Object.freeze({object:'ManttoVentasFotosMapa',method:'reload'}),
    'ventas-clientes':Object.freeze({object:'ManttoVentasClientes',method:'reload'}),

    'experimental-atencion-prioritaria':Object.freeze({object:'ManttoAtencionPrioritaria_exp',method:'refresh'}),
    'experimental-resumen-dia':Object.freeze({object:'ManttoResumenDiaExperimental_exp',method:'refresh'}),
    'experimental-entregas-recientes':Object.freeze({object:'ManttoEntregasRecientesExperimental_uni',method:'refresh'}),

    'cobranza-uni-estados-cuenta':Object.freeze({object:'ManttoCobranza_uni',method:'reloadGestionCredito'}),
    'cobranza-uni-mp-pro':Object.freeze({object:'ManttoCobranza_uni',method:'reloadMantenimientoPreventivo'}),
    'cobranza-uni-aditivas':Object.freeze({object:'ManttoCobranza_uni',method:'reloadVentaAdicional'})
  });

  const ROUTE_GROUPS = Object.freeze({
    tickets:Object.freeze([
      'home','resumen','criticos','callcenter','operativo','portafolio','proyectos',
      'experimental-atencion-prioritaria','experimental-resumen-dia','experimental-entregas-recientes',
      'experimental-equipos-criticos','experimental-dashboard-call-center','experimental-proyectos-criticos'
    ]),
    portafolio:Object.freeze([
      'resumen','criticos','callcenter','portafolio','proyectos','movimientos','operativo',
      'experimental-equipos-criticos','experimental-dashboard-call-center','experimental-proyectos-criticos'
    ]),
    criticosPreferencias:Object.freeze([
      'resumen','criticos','callcenter','operativo',
      'experimental-atencion-prioritaria','experimental-entregas-recientes',
      'experimental-equipos-criticos','experimental-dashboard-call-center','experimental-proyectos-criticos'
    ]),
    tareas:Object.freeze(['home','ventas-dashboard']),
    usuarios:Object.freeze(['usuarios','panel-control']),
    ventasCotizaciones:Object.freeze([
      'ventas-dashboard','ventas-cotizaciones','ventas-vendidos','ventas-perdidos',
      'ventas-proyeccion','ventas-proyectos-interes','ventas-clientes'
    ]),
    ventasClientes:Object.freeze(['ventas-dashboard','ventas-clientes','ventas-cotizaciones']),
    ventasProspeccion:Object.freeze(['ventas-dashboard','ventas-prospeccion','ventas-mapa-prospeccion']),
    ventasRedes:Object.freeze(['ventas-dashboard','ventas-asignacion-redes']),
    ventasFotos:Object.freeze([
      'ventas-fotos-mapa','instalaciones-proyectos','instalaciones-concentrado-cliente'
    ]),
    logistica:Object.freeze([
      'logistica-dashboard','logistica-reporte','logistica-produccion','logistica-pvo','logistica-documentos',
      'ventas-dashboard'
    ]),
    instalaciones:Object.freeze([
      'instalaciones-dashboard','instalaciones-proyectos','instalaciones-cerrados',
      'instalaciones-concentrado-cliente','instalaciones-reporte','instalaciones-ajuste',
      'instalaciones-carpetas','instalaciones-documentacion','instalaciones-pmm',
      'ventas-dashboard','ventas-fotos-mapa'
    ]),
    almacen:Object.freeze([
      'almacen-dashboard','almacen-inventario','almacen-stock','almacen-prestamos',
      'almacen-resguardos','almacen-auditoria','almacen-carga'
    ]),
    cobranzaUnited:Object.freeze([
      'cobranza-uni-dashboard','cobranza-uni-estados-cuenta','cobranza-uni-mp-pro','cobranza-uni-aditivas'
    ]),
    soporte:Object.freeze(['soporte-solicitudes','home']),
    experimental:Object.freeze([
      'experimental-atencion-prioritaria','experimental-resumen-dia','experimental-entregas-recientes',
      'experimental-equipos-criticos','experimental-dashboard-call-center','experimental-proyectos-criticos'
    ]),
    cx:Object.freeze(['cx-dashboard','cx-encuestas','cx-visitas']),
    legal:Object.freeze(['legal-dashboard','legal-contratos','legal-suspendidos'])
  });

  const MUTATION_DEPENDENCIES = Object.freeze([
    { match:value=>value.includes('/api/usuarios/me/criticos-preferencias'), routes:ROUTE_GROUPS.criticosPreferencias },
    { match:value=>value.includes('/api/ventas/fotos-mapa'), routes:ROUTE_GROUPS.ventasFotos },
    { match:value=>value.includes('/api/ventas/cotizaciones'), routes:ROUTE_GROUPS.ventasCotizaciones },
    { match:value=>value.includes('/api/ventas/clientes'), routes:ROUTE_GROUPS.ventasClientes },
    { match:value=>value.includes('/api/ventas/prospeccion'), routes:ROUTE_GROUPS.ventasProspeccion },
    { match:value=>value.includes('/api/ventas/redes') || value.includes('/api/ventas/asignacion-redes'), routes:ROUTE_GROUPS.ventasRedes },
    { match:value=>value.includes('/api/ventas/dashboard'), routes:Object.freeze(['ventas-dashboard']) },

    { match:value=>value.includes('/api/almacen/'), routes:ROUTE_GROUPS.almacen },
    { match:value=>value.includes('/api/cobranza-uni/'), routes:ROUTE_GROUPS.cobranzaUnited },

    { match:value=>value.includes('/api/logistica') || value.includes('/api/produccion-logistica'), routes:ROUTE_GROUPS.logistica },
    { match:value=>value.includes('/api/ins-fl') || value.includes('/api/instalaciones'), routes:ROUTE_GROUPS.instalaciones },

    { match:value=>value.includes('/api/support/tickets') || value.includes('/api/soporte'), routes:ROUTE_GROUPS.soporte },
    { match:value=>value.includes('/api/experimental/'), routes:ROUTE_GROUPS.experimental },
    { match:value=>value.includes('/api/cx/'), routes:ROUTE_GROUPS.cx },
    { match:value=>value.includes('/api/legal/'), routes:ROUTE_GROUPS.legal },

    { match:value=>value.includes('/api/portafolio') || value.includes('/api/movimientos-portafolio'), routes:ROUTE_GROUPS.portafolio },
    { match:value=>value.includes('/api/tickets'), routes:ROUTE_GROUPS.tickets },
    { match:value=>value.includes('/api/pendientes') || value.includes('/api/tareas'), routes:ROUTE_GROUPS.tareas },
    { match:value=>value.includes('/api/panel-control'), routes:Object.freeze(['panel-control']) },
    { match:value=>value.includes('/api/usuarios') || value.includes('/api/auth/me'), routes:ROUTE_GROUPS.usuarios },
    { match:value=>value.includes('/api/notificaciones'), routes:Object.freeze(['home']) }
  ]);

  function currentUser(){
    return window.ManttoAuth?.getUser?.() || window.ManttoAuth?.getActorUser?.() || {};
  }

  function isProgrammer(){
    const user=currentUser();
    const roleValues=[];
    if(user && user.rol) roleValues.push(user.rol);
    if(Array.isArray(user && user.roles)){
      user.roles.forEach(role=>{
        if(role && typeof role==='object') roleValues.push(role.rol || role.nombre || role.name || '');
        else roleValues.push(role);
      });
    }
    return roleValues
      .map(value=>String(value||'').trim().toLowerCase())
      .some(role=>role==='programador' || role==='programador united' || role==='programador corellian');
  }

  // IMPORTANTE: un boton que diga "Actualizar" NO es tecnico por definicion.
  // Solo se restringe si el propio markup lo declara explicitamente.
  function isProgrammerOnlyRefreshControl(el){
    if(!el || el.dataset.keepRefreshVisible==='true') return false;
    return el.dataset.programmerOnlyRefresh==='true'
      || el.dataset.technicalRefresh==='true'
      || el.dataset.refreshVisibility==='programmer';
  }

  function applyRefreshVisibility(root){
    const scope=root && root.querySelectorAll ? root : document;
    const controls=[];
    if(root && root.matches && root.matches('button,a,[role="button"]')) controls.push(root);
    controls.push(...scope.querySelectorAll('button,a,[role="button"]'));
    const programmer=isProgrammer();

    controls.forEach(el=>{
      if(!isProgrammerOnlyRefreshControl(el)){
        // Solo revierte ocultamiento que haya sido aplicado expresamente por esta version.
        if(el.dataset.hiddenByDataSyncRefresh==='true'){
          el.hidden=false;
          el.removeAttribute('aria-hidden');
          el.removeAttribute('tabindex');
          delete el.dataset.hiddenByDataSyncRefresh;
        }
        return;
      }

      el.dataset.manualRefreshControl='true';
      el.hidden=!programmer;
      el.setAttribute('aria-hidden',programmer?'false':'true');
      if(!programmer){
        el.setAttribute('tabindex','-1');
        el.dataset.hiddenByDataSyncRefresh='true';
      }else{
        el.removeAttribute('tabindex');
        delete el.dataset.hiddenByDataSyncRefresh;
      }
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
        .replace(/consultando\s+aiven/gi,'Cargando informacion')
        .replace(/cargando(?:\s+datos)?\s+desde\s+aiven/gi,'Cargando informacion')
        .replace(/cargando\s+aiven/gi,'Cargando informacion')
        .replace(/no\s+fue\s+posible\s+consultar\s+aiven/gi,'No fue posible cargar la informacion')
        .replace(/\s+consultad[oa]s?\s+desde\s+aiven/gi,'')
        .replace(/\s+desde\s+aiven/gi,'')
        .replace(/\s+en\s+aiven/gi,'')
        .replace(/aiven\s*[·:-]\s*/gi,'')
        .replace(/\s{2,}/g,' ')
        .trim();
      element.textContent=generic || 'Cargando informacion...';
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

  function resolveLegacyRefreshAdapter(route, context){
    const spec=ROUTE_REFRESH_ADAPTERS[route];
    if(!spec) return null;
    const target=window[spec.object];
    if(!target || typeof target[spec.method]!=='function') return null;
    return ()=>{
      const args=typeof spec.args==='function' ? spec.args(context) : [];
      return target[spec.method].apply(target,Array.isArray(args)?args:[]);
    };
  }

  function resolveHandler(route, context){
    if(state.handlers.has(route)){
      const registered=normalizeRegisteredHandler(state.handlers.get(route),context);
      if(registered) return registered;
    }
    const objectName=routeObjects[route];
    const target=objectName ? window[objectName] : null;
    if(target){
      if(typeof target.backgroundSync==='function') return ()=>target.backgroundSync(context);
      if(typeof target.syncInBackground==='function') return ()=>target.syncInBackground(context);
      if(typeof target.refreshSilent==='function') return ()=>target.refreshSilent(context);
    }
    return resolveLegacyRefreshAdapter(route,context);
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

  function uniqueRoutes(values){
    const output=[];
    const seen=new Set();
    (Array.isArray(values)?values:[values]).forEach(value=>{
      const route=String(value||'').trim();
      if(!route || seen.has(route)) return;
      seen.add(route);
      output.push(route);
    });
    return output;
  }

  function markDirty(route){
    const targetRoute=String(route||state.route||'home');
    state.dirty.add(targetRoute);
    document.dispatchEvent(new CustomEvent('mantto:data-dirty',{detail:{route:targetRoute,at:Date.now()}}));
  }

  function markDirtyMany(routes){
    uniqueRoutes(routes).forEach(markDirty);
  }

  function markSynced(route){
    const targetRoute=route || state.route;
    const at=Date.now();
    state.lastSync.set(targetRoute,at);
    state.dirty.delete(targetRoute);
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

    // Nunca consultar una vista inactiva. Si cambio, queda marcada y se sincroniza al abrirla.
    if(targetRoute!==state.route && !opts.allowInactive){
      markDirty(targetRoute);
      return false;
    }

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
      if(handledByEvent) markSynced(targetRoute);
      else markAttempted(targetRoute);
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

  function resolveMutationRoutes(detail){
    const input=detail||{};
    const path=String(input.path||input.url||'').toLowerCase();
    const routes=[];

    if(Array.isArray(input.routes)) routes.push(...input.routes);
    if(input.route) routes.push(input.route);

    MUTATION_DEPENDENCIES.forEach(rule=>{
      if(path && rule.match(path)) routes.push(...rule.routes);
    });

    // Compatibilidad con eventos antiguos que no informan path/ruta.
    if(!routes.length) routes.push(state.route||'home');
    return uniqueRoutes(routes);
  }

  function scheduleActiveMutationRefresh(route){
    const targetRoute=String(route||'');
    if(!targetRoute || targetRoute!==state.route) return;
    const previous=state.mutationTimers.get(targetRoute);
    if(previous) window.clearTimeout(previous);
    const timer=window.setTimeout(()=>{
      state.mutationTimers.delete(targetRoute);
      refresh(targetRoute,'mutacion',{force:true});
    },120);
    state.mutationTimers.set(targetRoute,timer);
  }

  function notifyMutation(detail){
    const targets=resolveMutationRoutes(detail);
    markDirtyMany(targets);

    // Solo la vista activa puede refrescar inmediatamente. Las demas quedan dirty.
    if(targets.includes(state.route)) scheduleActiveMutationRefresh(state.route);

    try{
      state.channel?.postMessage({
        type:'mutation',
        routes:targets,
        route:targets[0]||state.route,
        at:Date.now()
      });
    }catch(_error){}
    return targets;
  }

  function bind(){
    document.addEventListener('mantto:navigation',event=>{
      state.route=event.detail?.route || 'home';
      state.payload=event.detail?.payload || null;
      applyRoleVisibility(document);

      // REGLA FASE 1: "back" por si solo NO significa datos nuevos.
      // Solo se solicita sincronizacion si esta ruta fue marcada dirty por una mutacion real.
      if(state.dirty.has(state.route)){
        window.setTimeout(()=>refresh(state.route,'entrada-con-cambios',{force:true}),80);
      }else{
        state.lastSync.set(state.route,Date.now());
      }
    });

    document.addEventListener('mantto:navigation-restore',()=>{
      if(state.dirty.has(state.route)) window.setTimeout(()=>refresh(state.route,'restauracion-con-cambios',{force:true}),80);
    });

    document.addEventListener('mantto:data-mutated',event=>notifyMutation(event.detail||{}));
    document.addEventListener('mantto:auth-ready',()=>applyRoleVisibility(document));
    document.addEventListener('mantto:view-user-changed',()=>applyRoleVisibility(document));
    document.addEventListener('visibilitychange',()=>{
      if(!document.hidden) applyRoleVisibility(document);
    });

    if('BroadcastChannel' in window){
      state.channel=new BroadcastChannel('mantto-data-sync');
      state.channel.onmessage=event=>{
        if(event.data?.type!=='mutation') return;
        const targets=uniqueRoutes(event.data.routes&&event.data.routes.length ? event.data.routes : [event.data.route||state.route]);
        markDirtyMany(targets);
        if(targets.includes(state.route) && !document.hidden){
          window.setTimeout(()=>refresh(state.route,'otra-pestana',{force:true}),80);
        }
      };
    }

    state.observer=new MutationObserver(entries=>entries.forEach(entry=>entry.addedNodes.forEach(node=>{
      if(node.nodeType===1) applyRoleVisibility(node);
    })));
    state.observer.observe(document.documentElement,{childList:true,subtree:true});
    applyRoleVisibility(document);
  }

  window.ManttoDataSync={
    register,
    unregister,
    refresh,
    notifyMutation,
    markDirty,
    markDirtyMany,
    supportsBackgroundSync,
    isProgrammer,
    applyRefreshVisibility,
    applyTechnicalVisibility,
    applyRoleVisibility,
    markSynced,
    resolveMutationRoutes,
    isDirty:(route)=>state.dirty.has(String(route||state.route||'home')),
    getDirtyRoutes:()=>Array.from(state.dirty),
    getCurrentRoute:()=>state.route,
    hasRefreshAdapter:(route)=>Boolean(ROUTE_REFRESH_ADAPTERS[String(route||'')]),
    getRefreshAdapterRoutes:()=>Object.keys(ROUTE_REFRESH_ADAPTERS)
  };

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',bind,{once:true});
  else bind();
})();

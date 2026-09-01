(function(){
  'use strict';

  if(window.ManttoModuleLoader) return;

  const loadedScripts = new Map();
  const loadedStyles = new Map();
  const routePromises = new Map();

  // [Aster | 2026-09-01 | ASTER-MG | FASE 2 REUSO GLOBAL MODULOS LEGACY V001]
  // [Aster | 2026-09-01 | ASTER-MG | FASE 3 SYNC SELECTIVO + DEPENDENCIAS CRUZADAS V001]
  // Compatibilidad central para modulos legacy: el router puede seguir invocando init(),
  // pero una vista de datos ya inicializada NO vuelve a ejecutar su carga al regresar
  // si DataSync no la marco dirty. Formularios/detalles transaccionales quedan fuera.
  const INIT_ARM_TTL_MS = 5000;
  const PERSISTENT_DATA_ROUTES = new Set([
    'home','resumen','criticos','portafolio','proyectos','callcenter','operativo','movimientos',
    'logistica-dashboard','logistica-reporte','logistica-produccion','logistica-pvo','logistica-documentos',
    'instalaciones-dashboard','instalaciones-proyectos','instalaciones-cerrados',
    'instalaciones-concentrado-cliente','instalaciones-reporte','instalaciones-ajuste',
    'instalaciones-carpetas','instalaciones-documentacion','instalaciones-pmm',
    'ventas-dashboard','ventas-fotos-mapa','ventas-clientes','ventas-cotizaciones','ventas-vendidos',
    'ventas-proyeccion','ventas-proyectos-interes','ventas-perdidos','ventas-prospeccion',
    'ventas-mapa-prospeccion','ventas-asignacion-redes',
    'almacen-dashboard','almacen-inventario','almacen-stock','almacen-prestamos',
    'almacen-resguardos','almacen-auditoria','almacen-carga',
    'usuarios','panel-control','soporte-solicitudes',
    'experimental-atencion-prioritaria','experimental-resumen-dia','experimental-entregas-recientes',
    'experimental-equipos-criticos','experimental-dashboard-call-center','experimental-proyectos-criticos',
    'cobranza-uni-dashboard','cobranza-uni-estados-cuenta','cobranza-uni-mp-pro','cobranza-uni-aditivas'
  ]);
  const initializedContexts = new Set();
  const armedRoutes = new Map();

  function identityPart(user){
    return String(user && (user.id_SB || user.id || user.correo || user.email) || 'anon');
  }

  function lifecycleIdentity(){
    const auth=window.ManttoAuth;
    const actor=auth&&auth.getActorUser?auth.getActorUser():null;
    const effective=auth&&auth.getUser?auth.getUser():null;
    const viewed=auth&&auth.getViewUser?auth.getViewUser():null;
    return [identityPart(actor),identityPart(effective),identityPart(viewed)].join(':');
  }

  function currentNavigation(){
    if(window.ManttoRouter&&typeof window.ManttoRouter.getCurrent==='function'){
      const current=window.ManttoRouter.getCurrent()||{};
      return {route:String(current.route||'home'),payload:current.payload||null};
    }
    return {route:'home',payload:null};
  }

  function safePayloadKey(payload){
    try{return JSON.stringify(payload||null);}catch(_error){return '';}
  }

  function lifecycleKey(route,payload){
    return lifecycleIdentity()+'|'+String(route||'home')+'|'+safePayloadKey(payload);
  }

  function armRouteInit(route){
    const key=String(route||'home');
    if(!PERSISTENT_DATA_ROUTES.has(key)) return;
    armedRoutes.set(key,Date.now());
  }

  function consumeRouteArm(route){
    const key=String(route||'');
    const armedAt=armedRoutes.get(key);
    armedRoutes.delete(key);
    return Number.isFinite(armedAt) && Date.now()-armedAt<=INIT_ARM_TTL_MS;
  }

  function dataSyncIsDirty(route){
    const sync=window.ManttoDataSync;
    if(sync&&typeof sync.isDirty==='function') return sync.isDirty(route);
    if(sync&&typeof sync.getDirtyRoutes==='function') return sync.getDirtyRoutes().includes(String(route||''));
    return false;
  }

  function dataSyncCanRefresh(route){
    const sync=window.ManttoDataSync;
    return Boolean(sync&&typeof sync.supportsBackgroundSync==='function'&&sync.supportsBackgroundSync(route));
  }

  function routeFromInitArgs(args,current){
    const direct=typeof args[0]==='string'?String(args[0]):'';
    if(PERSISTENT_DATA_ROUTES.has(direct)) return direct;
    return String(current.route||'home');
  }

  function payloadFromInitArgs(args,route,current){
    if(String(current.route||'')===String(route||'')) return current.payload||null;
    if(args[1]&&typeof args[1]==='object') return args[1];
    if(args[0]&&typeof args[0]==='object') return args[0];
    return null;
  }

  function finishInitialization(key,route,value){
    initializedContexts.add(key);
    if(window.ManttoDataSync&&typeof window.ManttoDataSync.markSynced==='function') window.ManttoDataSync.markSynced(route);
    document.dispatchEvent(new CustomEvent('mantto:view-initialized',{detail:{route,key,at:Date.now()}}));
    return value;
  }

  function wrapInitExport(name,target){
    if(!target||typeof target.init!=='function'||target.init.__manttoLifecycleGuard===true) return false;
    const original=target.init;
    function guardedInit(){
      const args=Array.from(arguments);
      const current=currentNavigation();
      const route=routeFromInitArgs(args,current);
      if(!PERSISTENT_DATA_ROUTES.has(route)||!consumeRouteArm(route)) return original.apply(this,args);

      const payload=payloadFromInitArgs(args,route,current);
      const key=lifecycleKey(route,payload);
      const initialized=initializedContexts.has(key);
      const dirty=dataSyncIsDirty(route);

      if(initialized&&!dirty){
        document.dispatchEvent(new CustomEvent('mantto:view-reused',{detail:{route,key,exportName:name,dirty:false,at:Date.now()}}));
        return true;
      }

      // FASE 3: si la vista ya estaba inicializada y existe un handler selectivo real,
      // NO ejecutamos init() otra vez. Conservamos DOM/filtros, dejamos la ruta dirty y
      // DataSync ejecuta el adaptador despues de mantto:navigation. Esto evita que modulos
      // con state.loaded/initialized limpien dirty sin consultar datos nuevos.
      if(initialized&&dirty&&dataSyncCanRefresh(route)){
        document.dispatchEvent(new CustomEvent('mantto:view-reused',{
          detail:{route,key,exportName:name,dirty:true,pendingSync:true,at:Date.now()}
        }));
        return true;
      }

      // Fallback legacy: si no existe handler selectivo, el propio init() debe realizar
      // la actualizacion. Se limpia antes para impedir una segunda carga paralela; si
      // falla, la marca dirty se restaura.
      if(dirty&&window.ManttoDataSync&&typeof window.ManttoDataSync.markSynced==='function') window.ManttoDataSync.markSynced(route);

      let result;
      try{result=original.apply(this,args);}catch(error){
        initializedContexts.delete(key);
        if(dirty&&window.ManttoDataSync&&typeof window.ManttoDataSync.markDirty==='function') window.ManttoDataSync.markDirty(route);
        throw error;
      }
      if(result&&typeof result.then==='function'){
        return result.then(value=>finishInitialization(key,route,value),error=>{
          initializedContexts.delete(key);
          if(dirty&&window.ManttoDataSync&&typeof window.ManttoDataSync.markDirty==='function') window.ManttoDataSync.markDirty(route);
          throw error;
        });
      }
      return finishInitialization(key,route,result);
    }
    guardedInit.__manttoLifecycleGuard=true;
    guardedInit.__manttoOriginalInit=original;
    try{target.init=guardedInit;}catch(_error){return false;}
    return target.init===guardedInit;
  }

  function installLifecycleGuards(){
    Object.keys(window).filter(name=>name.startsWith('Mantto')).forEach(name=>{
      let target=null;
      try{target=window[name];}catch(_error){return;}
      wrapInitExport(name,target);
    });
  }

  function resetLifecycle(){
    initializedContexts.clear();
    armedRoutes.clear();
  }

  const CONTACTO_FORM_JS = './modules/ventas-contacto-form/ventas-contacto-form.js?v=20260729-v011';
  const CONTACTO_FORM_CSS = './modules/ventas-contacto-form/ventas-contacto-form.css?v=20260729-v011';
  const EXPERIMENTAL_SHELL_JS = './modules/experimental/experimental.js?v=20260806-fase7-2-v001';
  const EXPERIMENTAL_SHELL_CSS = './modules/experimental/experimental.css?v=20260805-fase1-v001';
  const ALMACEN_MODULE_JS = './modules/almacen/almacen.js?v=20260830-almacen-integracion-v002';
  const ALMACEN_MODULE_CSS = './modules/almacen/almacen.css?v=20260830-almacen-integracion-v002';

  const ROUTES = Object.freeze({
    resumen:{css:['./modules/resumen-dia/resumen-dia.css?v=20260716-v117'],js:['./modules/resumen-dia/resumen-dia.js?v=20260814-project-name-v010']},
    criticos:{css:['./modules/equipos-criticos/equipos-criticos.css?v=20260717-fix5'],js:['./modules/equipos-criticos/equipos-criticos.js?v=20260821-pdf-emojis-v001']},
    portafolio:{css:['./modules/portafolio/portafolio.css?v=20260817-lote-cobranza-uni-v001'],js:['./modules/portafolio/portafolio.js?v=20260817-lote-cobranza-uni-v001']},
    proyectos:{css:['./modules/proyectos/proyectos.css?v=20260706-v001'],js:['./modules/proyectos/proyectos.js?v=20260828-fase4-frontend-v001']},
    callcenter:{css:['./modules/callcenter/callcenter.css?v=cc-v005'],js:['./modules/callcenter/callcenter.js?v=20260827-fase2-carga-acotada-v001']},
    operativo:{css:['./modules/dashboard-operativo/dashboard-operativo.css?v=20260707-v001'],js:['./modules/dashboard-operativo/dashboard-operativo.js?v=20260828-fase4-frontend-v001']},
    movimientos:{css:['./modules/movimientos-portafolio/movimientos-portafolio.css?v=20260830-corte-semanal-v004'],js:['./modules/movimientos-portafolio/movimientos-portafolio.js?v=20260830-corte-semanal-v004']},

    'logistica-dashboard':{css:['./modules/dashboard-logistica/dashboard-logistica.css?v=20260830-responsive-v002'],js:['./modules/dashboard-logistica/dashboard-logistica.js?v=20260710-v003']},
    'logistica-reporte':{css:['./modules/reporte-logistica/reporte-logistica.css?v=20260711-v004'],js:['./modules/reporte-logistica/reporte-logistica.js?v=20260711-v004']},
    'logistica-produccion':{css:['./modules/logistica-produccion/logistica-produccion.css?v=20260901-logprod-fix-ux-catalog-cancel-v001'],js:['./modules/logistica-produccion/logistica-produccion.js?v=20260901-logprod-fix-ux-catalog-cancel-v001']},
    'logistica-produccion-nuevo':{css:['./modules/logistica-produccion/logistica-produccion.css?v=20260901-logprod-fix-ux-catalog-cancel-v001'],js:['./modules/logistica-produccion/logistica-produccion.js?v=20260901-logprod-fix-ux-catalog-cancel-v001']},
    'logistica-produccion-detalle':{css:['./modules/logistica-produccion/logistica-produccion.css?v=20260901-logprod-fix-ux-catalog-cancel-v001'],js:['./modules/logistica-produccion/logistica-produccion.js?v=20260901-logprod-fix-ux-catalog-cancel-v001']},
    'logistica-pvo':{css:['./modules/logistica-produccion/logistica-produccion.css?v=20260901-logprod-fix-ux-catalog-cancel-v001'],js:['./modules/logistica-produccion/logistica-produccion.js?v=20260901-logprod-fix-ux-catalog-cancel-v001']},
    'logistica-documentos':{css:['./modules/logistica-produccion/logistica-produccion.css?v=20260901-logprod-fix-ux-catalog-cancel-v001'],js:['./modules/logistica-produccion/logistica-produccion.js?v=20260901-logprod-fix-ux-catalog-cancel-v001']},

    'instalaciones-dashboard':{css:['./modules/instalaciones-dashboard/instalaciones-dashboard_cor.css?v=20260821-paginador-centrado-v003'],js:['./modules/instalaciones-dashboard/instalaciones-dashboard_cor.js?v=20260819-dashboard-modo-junta-orden-v002']},
    'instalaciones-proyectos':{css:['./modules/instalaciones-proyectos/instalaciones-proyectos.css?v=20260821-activos-paginados-v004'],js:['./modules/instalaciones-proyectos/instalaciones-proyectos.js?v=20260828-fase4-frontend-v001']},
    'instalaciones-cerrados':{css:['./modules/instalaciones-cerrados/instalaciones-cerrados.css?v=20260821-paginacion-v002'],js:['./modules/instalaciones-cerrados/instalaciones-cerrados.js?v=20260821-paginacion-v002']},
    'instalaciones-concentrado-cliente':{css:['./modules/instalaciones-concentrado-cliente/instalaciones-concentrado-cliente.css?v=20260713-v001'],js:['./modules/instalaciones-concentrado-cliente/instalaciones-concentrado-cliente.js?v=20260828-fase4-frontend-v001']},
    'instalaciones-reporte':{css:['./modules/instalaciones-reporte/instalaciones-reporte_cor.css?v=20260821-orden-vistas-v002'],js:['./modules/instalaciones-reporte/instalaciones-reporte_cor.js?v=20260901-pdf-sort-sup-edo-v001']},
    'instalaciones-ajuste':{css:['./modules/instalaciones-ajuste/instalaciones-ajuste_cor.css?v=20260821-paginacion-30-v002'],js:['./modules/instalaciones-ajuste/instalaciones-ajuste_cor.js?v=20260821-paginacion-30-v002']},
    'instalaciones-carpetas':{css:['./modules/instalaciones-carpetas/instalaciones-carpetas_cor.css?v=20260821-carpetas-disponibles-v002'],js:['./modules/instalaciones-carpetas/instalaciones-carpetas_cor.js?v=20260821-carpetas-disponibles-v002']},
    'instalaciones-documentacion':{css:['./modules/instalaciones-documentacion/instalaciones-documentacion_cor.css?v=20260818-documentacion-fase2-v001'],js:['./modules/instalaciones-documentacion/instalaciones-documentacion_cor.js?v=20260821-pendientes-supervisor-v001']},
    'instalaciones-pmm':{css:['./modules/instalaciones-pmm/instalaciones-pmm_cor.css?v=20260821-tabla-unificada-v003'],js:['./modules/instalaciones-pmm/instalaciones-pmm_cor.js?v=20260821-tabla-unificada-v003']},

    'ventas-dashboard':{css:['./modules/ventas-dashboard/ventas-dashboard.css?v=20260831-anio-seccion-v003'],js:['./modules/ventas-dashboard/ventas-dashboard-pdf.js?v=20260805-b4-v001','./modules/ventas-dashboard/ventas-dashboard.js?v=20260831-anio-seccion-v003']},
    'ventas-fotos-mapa':{css:['./modules/ventas-fotos-mapa/ventas-fotos-mapa.css?v=20260726-fix-tabs-estados-v002'],js:['./modules/ventas-fotos-mapa/ventas-fotos-mapa.js?v=20260828-fase4-frontend-v001']},
    'ventas-clientes':{css:['./modules/ventas-clientes/ventas-clientes.css?v=20260729-fase3-v003'],js:['./modules/ventas-clientes/ventas-clientes.js?v=20260828-fase4-frontend-v001']},
    'ventas-clientes-nuevo':{css:['./modules/ventas-clientes-nuevo/ventas-clientes-nuevo.css?v=20260729-v009'],js:['./modules/ventas-clientes-nuevo/ventas-clientes-nuevo.js?v=20260828-fase4-frontend-v001']},
    'ventas-clientes-detalle':{css:['./modules/ventas-clientes-detalle/ventas-clientes-detalle.css?v=20260729-v011',CONTACTO_FORM_CSS],js:[CONTACTO_FORM_JS,'./modules/ventas-clientes-detalle/ventas-clientes-detalle.js?v=20260828-fase4-frontend-v001']},
    'ventas-cotizaciones':{css:['./modules/ventas-cotizaciones/ventas-cotizaciones.css?v=20260729-v008'],js:['./modules/ventas-cotizaciones/ventas-cotizaciones.js?v=20260828-fase4-frontend-v001']},
    'ventas-cotizaciones-nueva':{css:['./modules/ventas-cotizaciones-nueva/ventas-cotizaciones-nueva.css?v=20260805-equipos-multiples-v001',CONTACTO_FORM_CSS],js:[CONTACTO_FORM_JS,'./modules/ventas-cotizaciones-nueva/ventas-cotizaciones-nueva.js?v=20260828-fase4-frontend-v001']},
    'ventas-cotizaciones-editar':{css:['./modules/ventas-cotizaciones-nueva/ventas-cotizaciones-nueva.css?v=20260805-equipos-multiples-v001','./modules/ventas-cotizaciones-editar/ventas-cotizaciones-editar.css?v=20260813-v004',CONTACTO_FORM_CSS],js:[CONTACTO_FORM_JS,'./modules/ventas-cotizaciones-editar/ventas-cotizaciones-editar.js?v=20260828-fase4-frontend-v001']},
    'ventas-cotizaciones-detalle':{css:['./modules/ventas-cotizaciones-detalle/ventas-cotizaciones-detalle.css?v=20260803-cffaa05-v001'],js:['./modules/ventas-cotizaciones-detalle/ventas-cotizaciones-detalle.js?v=20260830-fase3-proyecto-interes-v001']},
    'ventas-vendidos':{css:['./modules/ventas-vendidos/ventas-vendidos.css?v=20260804-paginado-f2-v001'],js:['./modules/ventas-vendidos/ventas-vendidos.js?v=20260828-fase4-frontend-v001']},
    'ventas-proyeccion':{css:['./modules/ventas-proyeccion/ventas-proyeccion.css?v=20260830-responsive-v002'],js:['./modules/ventas-proyeccion/ventas-proyeccion.js?v=20260828-fase4-frontend-v001']},
    'ventas-proyectos-interes':{css:['./modules/ventas-proyectos-interes/ventas-proyectos-interes.css?v=20260830-fase6-v001'],js:['./modules/ventas-proyectos-interes/ventas-proyectos-interes.js?v=20260830-fase6-v001']},
    'ventas-perdidos':{css:['./modules/ventas-perdidos/ventas-perdidos.css?v=20260804-paginado-f2-v001'],js:['./modules/ventas-perdidos/ventas-perdidos.js?v=20260828-fase4-frontend-v001']},
    'ventas-prospeccion':{css:['./modules/ventas-prospeccion/ventas-prospeccion.css?v=20260830-responsive-v002'],js:['./modules/ventas-prospeccion/ventas-prospeccion.js?v=20260828-fase4-frontend-v001']},
    'ventas-prospeccion-nueva':{css:['./modules/ventas-prospeccion-nueva/ventas-prospeccion-nueva.css?v=20260731-v002'],js:['./modules/ventas-prospeccion-nueva/ventas-prospeccion-nueva.js?v=20260828-fase4-frontend-v001']},
    'ventas-prospeccion-detalle':{css:['./modules/ventas-prospeccion-detalle/ventas-prospeccion-detalle.css?v=20260803-cffaa04-v001'],js:['./modules/ventas-prospeccion-detalle/ventas-prospeccion-detalle.js?v=20260828-fase4-frontend-v001']},
    'ventas-mapa-prospeccion':{css:['./modules/ventas-mapa-prospeccion/ventas-mapa-prospeccion.css?v=20260731-fase1-v001'],js:['./modules/ventas-mapa-prospeccion/ventas-mapa-prospeccion.js?v=20260828-fase4-frontend-v001']},
    'ventas-asignacion-redes':{css:['./modules/ventas-asignacion-redes/ventas-asignacion-redes.css?v=20260804-paginado-f2-v001'],js:['./modules/ventas-asignacion-redes/ventas-asignacion-redes.js?v=20260828-fase4-frontend-v001']},
    'ventas-asignacion-redes-detalle':{css:['./modules/ventas-asignacion-redes-detalle/ventas-asignacion-redes-detalle.css?v=20260804-v002'],js:['./modules/ventas-asignacion-redes-detalle/ventas-asignacion-redes-detalle.js?v=20260828-fase4-frontend-v001']},
    'ventas-asignacion-redes-formulario':{css:['./modules/ventas-asignacion-redes-formulario/ventas-asignacion-redes-formulario.css?v=20260804-v001'],js:['./modules/ventas-asignacion-redes-formulario/ventas-asignacion-redes-formulario.js?v=20260828-fase4-frontend-v001']},

    'almacen-dashboard':{css:[ALMACEN_MODULE_CSS],js:[ALMACEN_MODULE_JS]},
    'almacen-inventario':{css:[ALMACEN_MODULE_CSS],js:[ALMACEN_MODULE_JS]},
    'almacen-stock':{css:[ALMACEN_MODULE_CSS],js:[ALMACEN_MODULE_JS]},
    'almacen-prestamos':{css:[ALMACEN_MODULE_CSS],js:[ALMACEN_MODULE_JS]},
    'almacen-resguardos':{css:[ALMACEN_MODULE_CSS],js:[ALMACEN_MODULE_JS]},
    'almacen-auditoria':{css:[ALMACEN_MODULE_CSS],js:[ALMACEN_MODULE_JS]},
    'almacen-carga':{css:[ALMACEN_MODULE_CSS,'./modules/almacen-carga/almacen-carga.css?v=20260830-v001'],js:['./modules/almacen-carga/almacen-carga.js?v=20260830-v001']},

    usuarios:{css:['./modules/usuarios/usuarios.css?v=20260707-v001'],js:['./modules/usuarios/usuarios.js?v=20260707-v001']},
    'panel-control':{css:['./modules/panel-control/panel-control.css?v=20260819-permisos-alcance-v001'],js:['./modules/panel-control/panel-control.js?v=20260819-permisos-alcance-v001']},
    'soporte-solicitudes':{css:['./modules/soporte-solicitudes/soporte-solicitudes.css?v=20260803-cffaa03-v001'],js:['./modules/soporte-solicitudes/soporte-solicitudes.js?v=20260803-cffaa03-v001']},

    'experimental-atencion-prioritaria':{css:[EXPERIMENTAL_SHELL_CSS,'./modules/experimental-atencion-prioritaria/experimental-atencion-prioritaria.css?v=20260805-fase2-v001'],js:['./modules/experimental-atencion-prioritaria/experimental-atencion-prioritaria.js?v=20260805-fase2-v001',EXPERIMENTAL_SHELL_JS]},
    'experimental-resumen-dia':{css:[EXPERIMENTAL_SHELL_CSS,'./modules/experimental-resumen-dia/experimental-resumen-dia.css?v=20260805-fase3-v001'],js:['./modules/experimental-resumen-dia/experimental-resumen-dia.js?v=20260805-fase3-v001',EXPERIMENTAL_SHELL_JS]},
    'experimental-entregas-recientes':{css:[EXPERIMENTAL_SHELL_CSS,'./modules/experimental-entregas-recientes/experimental-entregas-recientes.css?v=20260806-fix-er-v001'],js:['./modules/experimental-entregas-recientes/experimental-entregas-recientes.js?v=20260806-fix-er-v001',EXPERIMENTAL_SHELL_JS]},
    'experimental-equipos-criticos':{css:[EXPERIMENTAL_SHELL_CSS,'./modules/experimental-equipos-criticos/experimental-equipos-criticos.css?v=20260806-fase5-2-v001'],js:['./modules/experimental-equipos-criticos/experimental-equipos-criticos.js?v=20260806-fase5-2-v001',EXPERIMENTAL_SHELL_JS]},
    'experimental-dashboard-call-center':{css:[EXPERIMENTAL_SHELL_CSS,'./modules/experimental-dashboard-call-center/experimental-dashboard-call-center.css?v=20260806-fase6-2-v001'],js:['./modules/experimental-dashboard-call-center/experimental-dashboard-call-center.js?v=20260806-fase6-2-v001',EXPERIMENTAL_SHELL_JS]},
    'experimental-proyectos-criticos':{css:[EXPERIMENTAL_SHELL_CSS,'./modules/experimental-proyectos-criticos/experimental-proyectos-criticos.css?v=20260806-fase7-2-v001'],js:['./modules/experimental-proyectos-criticos/experimental-proyectos-criticos.js?v=20260806-fase7-2-v001',EXPERIMENTAL_SHELL_JS]},

    'cobranza-uni-dashboard':{css:['./modules/cobranza-uni/cobranza-uni.css?v=20260817-lote-cobranza-uni-v001'],js:['./modules/cobranza-uni/cobranza-uni.js?v=20260817-lote-cobranza-uni-v001']},
    'cobranza-uni-estados-cuenta':{css:['./modules/cobranza-uni/cobranza-uni.css?v=20260817-lote-cobranza-uni-v001'],js:['./modules/cobranza-uni/cobranza-uni.js?v=20260817-lote-cobranza-uni-v001']},
    'cobranza-uni-mp-pro':{css:['./modules/cobranza-uni/cobranza-uni.css?v=20260817-lote-cobranza-uni-v001'],js:['./modules/cobranza-uni/cobranza-uni.js?v=20260817-lote-cobranza-uni-v001']},
    'cobranza-uni-aditivas':{css:['./modules/cobranza-uni/cobranza-uni.css?v=20260817-lote-cobranza-uni-v001'],js:['./modules/cobranza-uni/cobranza-uni.js?v=20260817-lote-cobranza-uni-v001']}
  });

  function absoluteUrl(src){
    try{return new URL(src, document.baseURI).href;}catch(_error){return String(src||'');}
  }

  function seedExisting(){
    document.querySelectorAll('script[src]').forEach(node => loadedScripts.set(absoluteUrl(node.getAttribute('src')), Promise.resolve(node)));
    document.querySelectorAll('link[rel="stylesheet"][href]').forEach(node => loadedStyles.set(absoluteUrl(node.getAttribute('href')), Promise.resolve(node)));
  }

  function loadStyle(href){
    const key=absoluteUrl(href);
    if(loadedStyles.has(key)) return loadedStyles.get(key);
    const task=new Promise((resolve,reject)=>{
      const link=document.createElement('link');
      link.rel='stylesheet';
      link.href=href;
      link.dataset.manttoLazy='1';
      link.addEventListener('load',()=>resolve(link),{once:true});
      link.addEventListener('error',()=>reject(new Error('No se pudo cargar '+href)),{once:true});
      document.head.appendChild(link);
    });
    loadedStyles.set(key,task);
    task.catch(()=>loadedStyles.delete(key));
    return task;
  }

  function loadScript(src){
    const key=absoluteUrl(src);
    if(loadedScripts.has(key)) return loadedScripts.get(key);
    const task=new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src=src;
      script.async=false;
      script.dataset.manttoLazy='1';
      script.addEventListener('load',()=>resolve(script),{once:true});
      script.addEventListener('error',()=>reject(new Error('No se pudo cargar '+src)),{once:true});
      document.body.appendChild(script);
    });
    loadedScripts.set(key,task);
    task.catch(()=>loadedScripts.delete(key));
    return task;
  }

  async function ensure(route){
    const key=String(route||'home');
    const config=ROUTES[key];
    if(!config){
      installLifecycleGuards();
      armRouteInit(key);
      return true;
    }
    if(routePromises.has(key)){
      const value=await routePromises.get(key);
      installLifecycleGuards();
      armRouteInit(key);
      return value;
    }
    const task=(async()=>{
      await Promise.all((config.css||[]).map(loadStyle));
      for(const src of (config.js||[])) await loadScript(src);
      installLifecycleGuards();
      document.dispatchEvent(new CustomEvent('mantto:module-loaded',{detail:{route:key}}));
      return true;
    })();
    routePromises.set(key,task);
    try{
      const value=await task;
      armRouteInit(key);
      return value;
    }catch(error){routePromises.delete(key);throw error;}
  }

  function hasRoute(route){return Boolean(ROUTES[String(route||'')]);}

  seedExisting();
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',installLifecycleGuards,{once:true});
  else installLifecycleGuards();
  document.addEventListener('mantto:auth-ready',installLifecycleGuards);
  document.addEventListener('mantto:view-user-changed',()=>{resetLifecycle();installLifecycleGuards();});
  document.addEventListener('mantto:session-expired',resetLifecycle);

  window.ManttoModuleLoader=Object.freeze({
    ensure,hasRoute,loadScript,loadStyle,
    lifecycle:{
      persistentRoutes:()=>Array.from(PERSISTENT_DATA_ROUTES),
      initialized:()=>Array.from(initializedContexts),
      canRefresh:(route)=>dataSyncCanRefresh(String(route||'')),
      reset:resetLifecycle
    }
  });
})();

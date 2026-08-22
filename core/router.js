(function(){
  const routeNames = {
    home:'Inicio', resumen:'Resumen del día', tickets:'Tickets', callcenter:'Dashboard Call Center',
    operativo:'Dashboard Operativo', portafolio:'Dashboard Portafolio', movimientos:'Movimientos Portafolio',
    proyectos:'Proyectos', criticos:'Equipos Críticos', usuarios:'Usuarios',
    tareas:'Tareas', activity:'Actividad reciente', 'panel-control':'Panel de Control', control:'Centro de Control',
    help:'Centro de Ayuda', notifications:'Notificaciones', services:'Estado de servicios',
    profile:'Perfil de usuario', 'support-request':'Solicitud de soporte', detalle:'Detalle',
    'cobranza-dashboard':'Dashboard Cobranza', 'cobranza-estados-cuenta':'Estados de Cuenta', 'cobranza-aditivas':'Aditivas',
    'logistica-dashboard':'Dashboard Logística', 'logistica-reporte':'Reporte de Logística', 'logistica-pvo':'PVO', 'logistica-produccion':'Producción', 'logistica-documentos':'Documentos de Producción',
    'instalaciones-dashboard':'Dashboard Instalaciones', 'instalaciones-proyectos':'Proyectos de Instalación',
    'instalaciones-concentrado-cliente':'Concentrado Cliente', 'instalaciones-reporte':'Reporte de Instalaciones',
    'instalaciones-ajuste':'Ajuste', 'instalaciones-carpetas':'Carpetas', 'instalaciones-pmm':'PM&M', 'instalaciones-documentacion':'Documentación Pendiente', 'instalaciones-cerrados':'Proyectos Cerrados',
    'ventas-dashboard':'Dashboard Ventas', 'ventas-vendidos':'Vendidos', 'ventas-proyeccion':'Proyección', 'ventas-perdidos':'Perdidos',
    'ventas-fotos-mapa':'Fotos Mapa', 'ventas-clientes':'Clientes', 'ventas-clientes-nuevo':'Nuevo cliente', 'ventas-clientes-detalle':'Detalle del cliente', 'ventas-cotizaciones':'Cotizaciones', 'ventas-cotizaciones-nueva':'Nueva cotización', 'ventas-cotizaciones-editar':'Editar cotización', 'ventas-cotizaciones-detalle':'Detalle de cotización',
    'ventas-prospeccion':'Prospección', 'ventas-prospeccion-nueva':'Nueva visita', 'ventas-prospeccion-detalle':'Detalle de visita', 'ventas-mapa-prospeccion':'Mapa Prospección', 'ventas-asignacion-redes':'Asignación Redes', 'ventas-asignacion-redes-detalle':'Detalle de Asignación a Redes', 'ventas-asignacion-redes-formulario':'Formulario de Asignación a Redes',
    'almacen-dashboard':'Dashboard Almacén', 'almacen-inventarios':'Inventarios', 'almacen-movimientos':'Movimientos Almacén',
    'cx-dashboard':'Dashboard CX', 'cx-encuestas':'Encuestas', 'cx-visitas':'Visitas',
    'legal-dashboard':'Dashboard Legal', 'legal-contratos':'Contratos', 'legal-suspendidos':'Suspendidos',
    'soporte-dashboard':'Dashboard de Soporte', 'soporte-solicitudes':'Solicitudes de Soporte', 'soporte-chats':'Chats de Soporte',
    'experimental-atencion-prioritaria':'Atención Prioritaria', 'experimental-resumen-dia':'Resumen del Día',
    'experimental-entregas-recientes':'Entregas Recientes', 'experimental-equipos-criticos':'Equipos Críticos',
    'experimental-dashboard-call-center':'Dashboard Call Center', 'experimental-proyectos-criticos':'Proyectos Críticos',
    'cobranza-uni-dashboard':'Dashboard Cobranza', 'cobranza-uni-estados-cuenta':'Gestión de Crédito', 'cobranza-uni-mp-pro':'Mantenimiento Preventivo', 'cobranza-uni-aditivas':'Venta Adicional'
  };

  const EXPERIMENTAL_ROUTES_EXP = new Set([
    'experimental-atencion-prioritaria',
    'experimental-resumen-dia',
    'experimental-entregas-recientes',
    'experimental-equipos-criticos',
    'experimental-dashboard-call-center',
    'experimental-proyectos-criticos'
  ]);
  const COBRANZA_ROUTES_UNI = new Set([
    'cobranza-uni-dashboard',
    'cobranza-uni-estados-cuenta',
    'cobranza-uni-mp-pro',
    'cobranza-uni-aditivas'
  ]);

  let currentRoute = 'home';
  let currentPayload = null;
  const historyStack = [];
  let browserNavActive = false;
  let initialRouteRestored = false;
  const NAV_CURRENT_KEY = 'mantto:navigation:current';

  function readSession(key, fallback){
    try{
      const raw = window.sessionStorage ? window.sessionStorage.getItem(key) : null;
      return raw ? JSON.parse(raw) : fallback;
    }catch(e){ return fallback; }
  }
  function writeSession(key, value){
    try{ if(window.sessionStorage) window.sessionStorage.setItem(key, JSON.stringify(value)); }catch(e){}
  }
  function contextKey(route, payload){ return String(route || 'home') + '::' + payloadKey(payload); }
  function activeView(){ return document.querySelector('.view.active'); }
  function captureControls(root){
    const values = {};
    if(!root) return values;
    root.querySelectorAll('input,select,textarea').forEach(function(el, index){
      const key = el.id ? 'id:'+el.id : (el.name ? 'name:'+el.name+':'+index : 'idx:'+index);
      if(el.type === 'checkbox' || el.type === 'radio') values[key] = { checked:!!el.checked };
      else values[key] = { value:el.value };
    });
    return values;
  }
  function captureContext(route, payload){
    const view = activeView();
    const main = document.querySelector('.main-content');
    return {
      key:contextKey(route, payload),
      scroll:{
        view:view ? Number(view.scrollTop) || 0 : 0,
        main:main ? Number(main.scrollTop) || 0 : 0,
        window:Number(window.scrollY || window.pageYOffset) || 0
      },
      controls:captureControls(view),
      capturedAt:Date.now()
    };
  }
  function restoreControls(root, controls){
    if(!root || !controls) return;
    let index = 0;
    root.querySelectorAll('input,select,textarea').forEach(function(el){
      const key = el.id ? 'id:'+el.id : (el.name ? 'name:'+el.name+':'+index : 'idx:'+index);
      index += 1;
      const saved = controls[key];
      if(!saved) return;
      if(Object.prototype.hasOwnProperty.call(saved,'checked')) el.checked = !!saved.checked;
      else if(Object.prototype.hasOwnProperty.call(saved,'value')) el.value = saved.value;
    });
  }
  function restoreContext(context){
    if(!context) return;
    const apply = function(){
      const view = activeView();
      const main = document.querySelector('.main-content');
      restoreControls(view, context.controls);
      if(view) view.scrollTop = Number(context.scroll && context.scroll.view) || 0;
      if(main) main.scrollTop = Number(context.scroll && context.scroll.main) || 0;
      window.scrollTo?.({ top:Number(context.scroll && context.scroll.window) || 0, behavior:'auto' });
      document.dispatchEvent(new CustomEvent('mantto:navigation-restore',{ detail:{ route:currentRoute, payload:currentPayload, context:context } }));
    };
    window.setTimeout(apply, 0);
    window.setTimeout(apply, 160);
    window.setTimeout(apply, 450);
  }
  function resetScroll(){
    const view = activeView();
    const main = document.querySelector('.main-content');
    if(view) view.scrollTop = 0;
    if(main) main.scrollTop = 0;
    window.scrollTo?.({top:0,behavior:'auto'});
  }
  function saveCurrentRoute(){
    writeSession(NAV_CURRENT_KEY,{ route:currentRoute || 'home', payload:currentPayload || null, savedAt:Date.now() });
  }
  function updateBrowserCurrentContext(context){
    if(!window.history) return;
    try{
      const previous = window.history.state || {};
      window.history.replaceState(Object.assign({}, previous, { mantto:true, route:currentRoute, payload:currentPayload, context:context || null }), '', routeUrl(currentRoute,currentPayload));
    }catch(e){}
  }
  function parseHashRoute(){
    const raw = String(window.location.hash || '').replace(/^#\/?/,'');
    if(!raw) return null;
    const parts = raw.split('/').filter(Boolean).map(function(v){ try{return decodeURIComponent(v);}catch(e){return v;} });
    if(!parts.length) return null;
    const route = parts[0];
    if(route === 'detalle' && parts[1] && parts[2]) return { route:'detalle', payload:{ type:parts[1], id:parts.slice(2).join('/') } };
    return { route:route, payload:parts[1] ? { id:parts.slice(1).join('/') } : null };
  }

  function label(route){ return routeNames[route] || route || 'Inicio'; }
  function safeText(value){
    const text = value === null || value === undefined ? '' : String(value);
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function payloadKey(payload){ try{return JSON.stringify(payload || null);}catch(e){return ''; } }
  function routeUrl(route, payload){
    let hash = '#/' + encodeURIComponent(route || 'home');
    if(route === 'detalle' && payload && payload.type && payload.id){
      hash += '/' + encodeURIComponent(payload.type) + '/' + encodeURIComponent(payload.id);
    } else if(payload && payload.id) hash += '/' + encodeURIComponent(payload.id);
    return hash;
  }
  function syncBrowserHistory(route, payload, replace, scrollY){
    if(browserNavActive || !window.history) return;
    const state = { mantto:true, route:route || 'home', payload:payload || null, scrollY:Number(scrollY)||0, context:null };
    const url = routeUrl(route || 'home', payload || null);
    try{
      if(replace) window.history.replaceState(state, '', url);
      else window.history.pushState(state, '', url);
    }catch(e){}
  }

  function updateBackButton(){
    const btn = document.getElementById('app-back-btn');
    const lbl = document.getElementById('app-back-label');
    const last = historyStack[historyStack.length - 1];
    if(!btn || !lbl) return;
    if(currentRoute === 'home'){
      btn.hidden = true;
      btn.disabled = true;
      lbl.textContent = 'Inicio';
      btn.title = 'Ya estás en Inicio';
      return;
    }
    btn.hidden = false;
    if(!last){
      btn.disabled = false;
      lbl.textContent = 'Inicio';
      btn.title = 'Volver a Inicio';
      return;
    }
    btn.disabled = false;
    lbl.textContent = label(last.route);
    btn.title = 'Volver a ' + label(last.route);
  }

  function updateContext(route, subtitle){
    const title = document.getElementById('app-context-title');
    const sub = document.getElementById('app-context-subtitle');
    if(title) title.textContent = label(route);
    if(sub) sub.textContent = subtitle || 'Entorno de pruebas · navegación preparada';
    updateBackButton();
  }

  function setActiveSide(route){
    let activeItem = null;
    document.querySelectorAll('.side-item').forEach(function(button){
      const active = button.dataset.route === route;
      button.classList.toggle('active', active);
      if(active) activeItem = button;
    });
    const sidebar = document.getElementById('sidebar');
    const activeGroup = activeItem ? activeItem.closest('.side-group') : null;
    const canExpandGroup = sidebar && !sidebar.classList.contains('collapsed');
    document.querySelectorAll('.side-group').forEach(function(group){
      const isActiveGroup = Boolean(activeGroup && group === activeGroup);
      const shouldOpen = Boolean(canExpandGroup && isActiveGroup);

      // El grupo conserva el estado visual activo aunque la barra esté contraída.
      // Así, el emoji del área actual queda resaltado igual que Inicio/Usuarios.
      group.classList.toggle('active', isActiveGroup);
      group.classList.toggle('open', shouldOpen);

      const toggle = group.querySelector('.side-group-toggle');
      if(toggle){
        toggle.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
        toggle.setAttribute('aria-current', isActiveGroup ? 'true' : 'false');
      }
    });
  }

  function activateViewById(viewId){
    document.querySelectorAll('.view').forEach(v=>{
      v.classList.remove('active');
      v.setAttribute('aria-hidden','true');
      v.style.display='none';
    });
    const view=document.getElementById(viewId);
    if(!view) return null;
    view.classList.add('active');
    view.removeAttribute('aria-hidden');
    view.style.display='block';
    view.scrollTop=0;
    const main=document.querySelector('.main-content');
    if(main) main.scrollTop=0;
    return view;
  }


  function showResumen(){
    const rv=document.getElementById('view-resumen');
    if(!rv) return false;
    activateViewById('view-resumen');
    setActiveSide('resumen');
    updateContext('resumen','Resumen ejecutivo diario · datos reales desde Aiven');
    if(window.ManttoResumenDia) window.ManttoResumenDia.init();
    return true;
  }


  function showCriticos(){
    const view=document.getElementById('view-criticos');
    if(!view) return false;
    activateViewById('view-criticos');
    if(!view.innerHTML.trim()){
      view.innerHTML = '<div class="ec-page"><section class="ec-head card"><div><p class="ec-eyebrow">Cargando módulo</p><h1>Equipos Críticos</h1><p>Inicializando vista de pruebas...</p></div></section></div>';
    }
    setActiveSide('criticos');
    updateContext('criticos','Equipos y proyectos críticos · criterios configurables por usuario');
    if(window.ManttoEquiposCriticos) window.ManttoEquiposCriticos.init();
    return true;
  }


  function showPortafolio(){
    const view=document.getElementById('view-portafolio');
    if(!view) return false;
    activateViewById('view-portafolio');
    if(!view.innerHTML.trim()){
      view.innerHTML = '<div class="pf-page"><section class="pf-card pf-head"><div><p class="pf-eyebrow">Cargando módulo</p><h1>Portafolio</h1><p>Inicializando vista de pruebas...</p></div></section></div>';
    }
    setActiveSide('portafolio');
    updateContext('portafolio','Dashboard Portafolio · datos reales desde Aiven');
    if(window.ManttoPortafolio) window.ManttoPortafolio.init(currentPayload);
    return true;
  }


  function showProyectos(){
    const view=document.getElementById('view-proyectos');
    if(!view) return false;
    activateViewById('view-proyectos');
    if(!view.innerHTML.trim()){
      view.innerHTML = '<div class="proy-page"><section class="proy-card proy-head"><div><p class="proy-eyebrow">Cargando módulo</p><h1>Proyectos</h1><p>Inicializando vista de pruebas...</p></div></section></div>';
    }
    setActiveSide('proyectos');
    updateContext('proyectos','Proyectos · vista agregada desde Portafolio y Tickets Aiven');
    // El payload con id es una instruccion de apertura de una sola vez.
    // Se limpia antes de que el detalle navegue para que al regresar a Proyectos
    // no vuelva a abrir automaticamente el mismo proyecto.
    const launchPayload = currentPayload;
    if(launchPayload && (launchPayload.id || launchPayload.proyecto || launchPayload.project || launchPayload.codigo)){
      currentPayload = null;
    }
    if(window.ManttoProyectos) window.ManttoProyectos.init(launchPayload);
    return true;
  }


  function showCallCenter(){
    const view=document.getElementById('view-callcenter');
    if(!view) return false;
    activateViewById('view-callcenter');
    if(!view.innerHTML.trim()){
      view.innerHTML = '<div class="cc-page"><section class="cc-card cc-head"><div><p class="cc-eyebrow">Cargando módulo</p><h1>Dashboard Call Center</h1><p>Inicializando vista de pruebas...</p></div></section></div>';
    }
    setActiveSide('callcenter');
    updateContext('callcenter','Dashboard Call Center · KPIs y llamadas por período desde Aiven');
    if(window.ManttoCallCenter) window.ManttoCallCenter.init(currentPayload || { view:'dashboard' });
    return true;
  }


  function showOperativo(){
    const view=document.getElementById('view-operativo');
    if(!view) return false;
    activateViewById('view-operativo');
    if(!view.innerHTML.trim()){
      view.innerHTML = '<div class="op-page"><section class="op-card op-head"><div><p class="op-eyebrow">Cargando módulo</p><h1>Dashboard Operativo</h1><p>Inicializando vista de pruebas...</p></div></section></div>';
    }
    setActiveSide('operativo');
    updateContext('operativo','Dashboard Operativo · cumplimiento mensual, preventivos y Vo.Bo. desde Aiven');
    if(window.ManttoDashboardOperativo) window.ManttoDashboardOperativo.init();
    return true;
  }


  function showMovimientos(){
    const view=document.getElementById('view-movimientos');
    if(!view) return false;
    activateViewById('view-movimientos');
    if(!view.innerHTML.trim()){
      view.innerHTML = '<div class="mov-page"><section class="mov-card mov-head"><div><p class="mov-eyebrow">Cargando módulo</p><h1>Movimientos de Portafolio</h1><p>Inicializando vista de pruebas...</p></div></section></div>';
    }
    setActiveSide('movimientos');
    updateContext('movimientos','Movimientos de Portafolio · comparación mensual de estatus desde Aiven');
    if(window.ManttoMovimientosPortafolio) window.ManttoMovimientosPortafolio.init();
    return true;
  }




  function showInstalacionesDashboard_cor(){
    const view=document.getElementById('view-instalaciones-dashboard');
    if(!view) return false;
    activateViewById('view-instalaciones-dashboard');
    if(!view.innerHTML.trim()){
      view.innerHTML = '<div class="idb-cor-page"><section class="idb-cor-card idb-cor-head"><div><p class="idb-cor-eyebrow">Cargando módulo</p><h1>Dashboard Supervisores</h1><p>Inicializando Dashboard de Instalaciones...</p></div></section></div>';
    }
    setActiveSide('instalaciones-dashboard');
    updateContext('instalaciones-dashboard','Dashboard Supervisores · seguimiento operativo y Modo Junta');
    if(window.ManttoInstalacionesDashboard_cor) window.ManttoInstalacionesDashboard_cor.init(currentPayload || null);
    return true;
  }


  function showInstalacionesProyectos(){
    const view=document.getElementById('view-instalaciones-proyectos');
    if(!view) return false;
    activateViewById('view-instalaciones-proyectos');
    if(!view.innerHTML.trim()){
      view.innerHTML = '<div class="insproy-page"><section class="insproy-card insproy-head"><div><p class="insproy-eyebrow">Cargando módulo</p><h1>Proyectos de Instalación</h1><p>Inicializando vista de pruebas...</p></div></section></div>';
    }
    setActiveSide('instalaciones-proyectos');
    updateContext('instalaciones-proyectos','Proyectos de Instalación · gestión integral desde Aiven');
    if(window.ManttoInstalacionesProyectos) window.ManttoInstalacionesProyectos.init();
    return true;
  }

  function showInstalacionesCerrados(){
    const view=document.getElementById('view-instalaciones-cerrados');
    if(!view) return false;
    activateViewById('view-instalaciones-cerrados');
    setActiveSide('instalaciones-cerrados');
    updateContext('instalaciones-cerrados','Proyectos Cerrados · datos reales desde Aiven');
    if(window.ManttoInstalacionesCerrados) window.ManttoInstalacionesCerrados.init();
    return true;
  }

  function showVentasDashboard(){
    const view=document.getElementById('view-ventas-dashboard');
    if(!view) return false;
    activateViewById('view-ventas-dashboard');
    setActiveSide('ventas-dashboard');
    updateContext('ventas-dashboard','Dashboard Ventas · selector maestro y filtros comerciales');
    if(window.ManttoVentasDashboard) window.ManttoVentasDashboard.init(currentPayload || null);
    return true;
  }

  function showVentasFotosMapa(){
    const view=document.getElementById('view-ventas-fotos-mapa');
    if(!view) return false;
    activateViewById('view-ventas-fotos-mapa');
    setActiveSide('ventas-fotos-mapa');
    updateContext('ventas-fotos-mapa','Fotos Mapa · evidencia fotográfica por estado desde Aiven');
    if(window.ManttoVentasFotosMapa) window.ManttoVentasFotosMapa.init();
    return true;
  }

  function showVentasClientes(){
    const view=document.getElementById('view-ventas-clientes');
    if(!view) return false;
    activateViewById('view-ventas-clientes');
    setActiveSide('ventas-clientes');
    updateContext('ventas-clientes','Clientes · directorio comercial y contactos desde Aiven');
    if(window.ManttoVentasClientes) window.ManttoVentasClientes.init(currentPayload || null);
    return true;
  }

  function showVentasClientesNuevo(){
    const view=document.getElementById('view-ventas-clientes-nuevo');
    if(!view) return false;
    activateViewById('view-ventas-clientes-nuevo');
    setActiveSide('ventas-clientes');
    updateContext('ventas-clientes-nuevo','Nuevo cliente · alta comercial y contacto principal en Aiven');
    if(window.ManttoVentasClientesNuevo) window.ManttoVentasClientesNuevo.init(currentPayload || null);
    return true;
  }

  function showVentasClientesDetalle(){
    const view=document.getElementById('view-ventas-clientes-detalle');
    if(!view) return false;
    activateViewById('view-ventas-clientes-detalle');
    setActiveSide('ventas-clientes');
    updateContext('ventas-clientes-detalle','Detalle de cliente · contactos y actividad comercial desde Aiven');
    if(window.ManttoVentasClientesDetalle) window.ManttoVentasClientesDetalle.init(currentPayload || null);
    return true;
  }

  function showVentasCotizaciones(){
    const view=document.getElementById('view-ventas-cotizaciones');
    if(!view) return false;
    activateViewById('view-ventas-cotizaciones');
    setActiveSide('ventas-cotizaciones');
    updateContext('ventas-cotizaciones','Cotizaciones · gestión comercial, comentarios y archivos desde Aiven');
    if(window.ManttoVentasCotizaciones) window.ManttoVentasCotizaciones.init();
    return true;
  }


  function showVentasCotizacionesNueva(){
    const view=document.getElementById('view-ventas-cotizaciones-nueva');
    if(!view) return false;
    activateViewById('view-ventas-cotizaciones-nueva');
    setActiveSide('ventas-cotizaciones');
    updateContext('ventas-cotizaciones-nueva','Nueva cotización · alta comercial desde Aiven');
    if(window.ManttoVentasCotizacionesNueva) window.ManttoVentasCotizacionesNueva.init(currentPayload || null);
    return true;
  }

  function showVentasCotizacionesEditar(){
    const view=document.getElementById('view-ventas-cotizaciones-nueva');
    if(!view) return false;
    activateViewById('view-ventas-cotizaciones-nueva');
    setActiveSide('ventas-cotizaciones');
    updateContext('ventas-cotizaciones-editar','Editar cotización · actualización de registro existente en Aiven');
    if(window.ManttoVentasCotizacionesEditar) window.ManttoVentasCotizacionesEditar.init(currentPayload || null);
    return true;
  }


  function showVentasCotizacionesDetalle(){
    const view=document.getElementById('view-ventas-cotizaciones-detalle');
    if(!view) return false;
    activateViewById('view-ventas-cotizaciones-detalle');
    setActiveSide('ventas-cotizaciones');
    updateContext('ventas-cotizaciones-detalle','Detalle de cotización · información comercial desde Aiven');
    if(window.ManttoVentasCotizacionesDetalle) window.ManttoVentasCotizacionesDetalle.init(currentPayload || null);
    return true;
  }

  function showVentasVendidos(){
    const view=document.getElementById('view-ventas-vendidos');
    if(!view) return false;
    activateViewById('view-ventas-vendidos');
    setActiveSide('ventas-vendidos');
    updateContext('ventas-vendidos','Vendidos · cierres comerciales confirmados desde Aiven');
    if(window.ManttoVentasVendidos) window.ManttoVentasVendidos.init();
    return true;
  }

  function showVentasProyeccion(){
    const view=document.getElementById('view-ventas-proyeccion');
    if(!view) return false;
    activateViewById('view-ventas-proyeccion');
    setActiveSide('ventas-proyeccion');
    updateContext('ventas-proyeccion','Proyección · cotizaciones activas por etapa comercial desde Aiven');
    if(window.ManttoVentasProyeccion) window.ManttoVentasProyeccion.init();
    return true;
  }

  function showVentasPerdidos(){
    const view=document.getElementById('view-ventas-perdidos');
    if(!view) return false;
    activateViewById('view-ventas-perdidos');
    setActiveSide('ventas-perdidos');
    updateContext('ventas-perdidos','Perdidos · cotizaciones perdidas por fecha de cambio de estatus');
    if(window.ManttoVentasPerdidos) window.ManttoVentasPerdidos.init();
    return true;
  }

  function showVentasProspeccion(){
    const view=document.getElementById('view-ventas-prospeccion');
    if(!view) return false;
    activateViewById('view-ventas-prospeccion');
    setActiveSide('ventas-prospeccion');
    updateContext('ventas-prospeccion','Prospección · estructura visual de visitas comerciales');
    if(window.ManttoVentasProspeccion) window.ManttoVentasProspeccion.init();
    return true;
  }

  function showVentasProspeccionNueva(){
    const view=document.getElementById('view-ventas-prospeccion-nueva');
    if(!view) return false;
    activateViewById('view-ventas-prospeccion-nueva');
    setActiveSide('ventas-prospeccion');
    updateContext('ventas-prospeccion-nueva','Nueva visita · alta de prospección en Aiven');
    if(window.ManttoVentasProspeccionNueva) window.ManttoVentasProspeccionNueva.init(currentPayload || null);
    return true;
  }

  function showVentasProspeccionDetalle(){
    const view=document.getElementById('view-ventas-prospeccion-detalle');
    if(!view) return false;
    activateViewById('view-ventas-prospeccion-detalle');
    setActiveSide('ventas-prospeccion');
    updateContext('ventas-prospeccion-detalle','Detalle de visita · información comercial desde Aiven');
    if(window.ManttoVentasProspeccionDetalle) window.ManttoVentasProspeccionDetalle.init(currentPayload || null);
    return true;
  }

  function showVentasMapaProspeccion(){
    const view=document.getElementById('view-ventas-mapa-prospeccion');
    if(!view) return false;
    activateViewById('view-ventas-mapa-prospeccion');
    setActiveSide('ventas-mapa-prospeccion');
    updateContext('ventas-mapa-prospeccion','Mapa Prospección · visualización geográfica de visitas');
    if(window.ManttoVentasMapaProspeccion) window.ManttoVentasMapaProspeccion.init(currentPayload || null);
    return true;
  }

  function showVentasAsignacionRedes(){
    const view=document.getElementById('view-ventas-asignacion-redes');
    if(!view) return false;
    activateViewById('view-ventas-asignacion-redes');
    setActiveSide('ventas-asignacion-redes');
    updateContext('ventas-asignacion-redes','Asignación a Redes · contactos, responsables y seguimiento desde Aiven');
    if(window.ManttoVentasAsignacionRedes) window.ManttoVentasAsignacionRedes.init(currentPayload || null);
    return true;
  }

  function showVentasAsignacionRedesDetalle(){
    const view=document.getElementById('view-ventas-asignacion-redes-detalle');
    if(!view) return false;
    activateViewById('view-ventas-asignacion-redes-detalle');
    setActiveSide('ventas-asignacion-redes');
    updateContext('ventas-asignacion-redes-detalle','Detalle de Asignación a Redes · contacto, evidencias, interacciones y cotización');
    if(window.ManttoVentasAsignacionRedesDetalle) window.ManttoVentasAsignacionRedesDetalle.init(currentPayload || null);
    return true;
  }

  function showVentasAsignacionRedesFormulario(){
    const view=document.getElementById('view-ventas-asignacion-redes-formulario');
    if(!view) return false;
    activateViewById('view-ventas-asignacion-redes-formulario');
    setActiveSide('ventas-asignacion-redes');
    updateContext('ventas-asignacion-redes-formulario', currentPayload && currentPayload.mode === 'edit' ? 'Editar Asignación a Redes' : 'Crear nueva Asignación a Redes');
    if(window.ManttoVentasAsignacionRedesFormulario) window.ManttoVentasAsignacionRedesFormulario.init(currentPayload || null);
    return true;
  }

  function showInstalacionesConcentradoCliente(){
    const view=document.getElementById('view-instalaciones-concentrado-cliente');
    if(!view) return false;
    activateViewById('view-instalaciones-concentrado-cliente');
    if(!view.innerHTML.trim()){
      view.innerHTML = '<div class="icc-page"><section class="icc-card icc-head"><div><p class="icc-eyebrow">Cargando módulo</p><h1>Concentrado Cliente</h1><p>Inicializando vista desde Aiven...</p></div></section></div>';
    }
    setActiveSide('instalaciones-concentrado-cliente');
    updateContext('instalaciones-concentrado-cliente','Concentrado de proyectos por cliente · datos desde Aiven');
    if(window.ManttoInstalacionesConcentradoCliente) window.ManttoInstalacionesConcentradoCliente.init();
    return true;
  }

  function showInstalacionesReporte_cor(){
    const view=document.getElementById('view-instalaciones-reporte');
    if(!view) return false;
    activateViewById('view-instalaciones-reporte');
    if(!view.innerHTML.trim()){
      view.innerHTML = '<div class="ir-cor-page"><section class="ir-cor-card ir-cor-head"><div><p class="ir-cor-eyebrow">Cargando módulo</p><h1>Reporte de Instalaciones</h1><p>Inicializando estructura del reporte...</p></div></section></div>';
    }
    setActiveSide('instalaciones-reporte');
    updateContext('instalaciones-reporte','Reporte de Instalaciones · seguimiento operativo por etapa');
    if(window.ManttoInstalacionesReporte_cor) window.ManttoInstalacionesReporte_cor.init(currentPayload || null);
    return true;
  }

  function showInstalacionesAjuste_cor(){
    const view=document.getElementById('view-instalaciones-ajuste');
    if(!view) return false;
    activateViewById('view-instalaciones-ajuste');
    if(!view.innerHTML.trim()){
      view.innerHTML = '<div class="iaj-cor-page"><section class="iaj-cor-card iaj-cor-head"><div><p class="iaj-cor-eyebrow">Cargando módulo</p><h1>Ajuste</h1><p>Inicializando análisis histórico de ajuste...</p></div></section></div>';
    }
    setActiveSide('instalaciones-ajuste');
    updateContext('instalaciones-ajuste','Ajuste · comportamiento histórico por tipo de equipo y año de término');
    if(window.ManttoInstalacionesAjuste_cor) window.ManttoInstalacionesAjuste_cor.init(currentPayload || null);
    return true;
  }

  function showInstalacionesCarpetas_cor(){
    const view=document.getElementById('view-instalaciones-carpetas');
    if(!view) return false;
    activateViewById('view-instalaciones-carpetas');
    if(!view.innerHTML.trim()){
      view.innerHTML = '<div class="icarp-cor-page"><section class="icarp-cor-card icarp-cor-head"><div><p class="icarp-cor-eyebrow">Cargando modulo</p><h1>Gestor de Carpetas</h1><p>Inicializando relaciones de proyectos y carpetas...</p></div></section></div>';
    }
    setActiveSide('instalaciones-carpetas');
    updateContext('instalaciones-carpetas','Carpetas de Instalaciones \u00b7 relacion Proyecto \u2194 Carpeta Drive');
    if(window.ManttoInstalacionesCarpetas_cor) window.ManttoInstalacionesCarpetas_cor.init(currentPayload || null);
    return true;
  }

  function showInstalacionesDocumentacion_cor(){
    const view=document.getElementById('view-instalaciones-documentacion');
    if(!view) return false;
    activateViewById('view-instalaciones-documentacion');
    if(!view.innerHTML.trim()){
      view.innerHTML = '<div class="idoc-cor-page"><section class="idoc-cor-card idoc-cor-head"><div><p class="idoc-cor-eyebrow">Cargando módulo</p><h1>Documentación Pendiente</h1><p>Inicializando seguimiento documental por supervisor...</p></div></section></div>';
    }
    setActiveSide('instalaciones-documentacion');
    updateContext('instalaciones-documentacion','Documentación Pendiente · avance individual por supervisor');
    if(window.ManttoInstalacionesDocumentacion_cor) window.ManttoInstalacionesDocumentacion_cor.init(currentPayload || null);
    return true;
  }

  function showInstalacionesPmm_cor(){
    const view=document.getElementById('view-instalaciones-pmm');
    if(!view) return false;
    activateViewById('view-instalaciones-pmm');
    if(!view.innerHTML.trim()){
      view.innerHTML = '<div class="ipmm-cor-page"><section class="ipmm-cor-card ipmm-cor-head"><div><p class="ipmm-cor-eyebrow">Cargando modulo</p><h1>PM&amp;M</h1><p>Inicializando seguimiento de montaje...</p></div></section></div>';
    }
    setActiveSide('instalaciones-pmm');
    updateContext('instalaciones-pmm','PM&amp;M · equipos proximos a montar y equipos en montaje');
    if(window.ManttoInstalacionesPmm_cor) window.ManttoInstalacionesPmm_cor.init(currentPayload || null);
    return true;
  }

  function showLogisticaDashboard(){
    const view=document.getElementById('view-logistica-dashboard');
    if(!view) return false;
    activateViewById('view-logistica-dashboard');
    if(!view.innerHTML.trim()){
      view.innerHTML = '<div class="dl-page"><section class="dl-card dl-head"><div><p class="dl-eyebrow">Cargando módulo</p><h1>Dashboard Logística</h1><p>Inicializando vista desde Aiven...</p></div></section></div>';
    }
    setActiveSide('logistica-dashboard');
    updateContext('logistica-dashboard','Dashboard Logística · producción, tránsito y movimientos semanales desde Aiven');
    if(window.ManttoDashboardLogistica) window.ManttoDashboardLogistica.init();
    return true;
  }


  function showLogisticaReporte(){
    const view=document.getElementById('view-logistica-reporte');
    if(!view) return false;
    activateViewById('view-logistica-reporte');
    if(!view.innerHTML.trim()){
      view.innerHTML = '<div class="rl-page"><section class="rl-card rl-head"><div><p class="rl-eyebrow">Cargando módulo</p><h1>Reporte de Logística</h1><p>Inicializando detalle desde Aiven...</p></div></section></div>';
    }
    setActiveSide('logistica-reporte');
    updateContext('logistica-reporte','Reporte de Logística · detalle operativo por estatus desde Aiven');
    if(window.ManttoReporteLogistica) window.ManttoReporteLogistica.init(currentPayload || {});
    return true;
  }

  function showSoporteSolicitudes(){
    const view = document.getElementById('view-soporte-solicitudes');
    if(!view) return false;
    activateViewById('view-soporte-solicitudes');
    setActiveSide('soporte-solicitudes');
    updateContext('soporte-solicitudes','Solicitudes de soporte · consulta y seguimiento');
    if(window.ManttoSoporteSolicitudes && window.ManttoSoporteSolicitudes.init){
      const requesterMode = currentPayload && currentPayload.mode === 'requester';
      window.ManttoSoporteSolicitudes.init(view.querySelector('[data-ss-root]') || view, {
        mode: requesterMode ? 'requester' : 'support',
        backRoute: currentPayload && currentPayload.backRoute ? currentPayload.backRoute : (requesterMode ? 'help' : 'soporte-solicitudes')
      });
      const solicitudId = currentPayload && (currentPayload.id || currentPayload.id_solicitud || currentPayload.id_ticket);
      if(solicitudId && window.ManttoSoporteSolicitudes.openDetail){
        window.setTimeout(() => window.ManttoSoporteSolicitudes.openDetail(solicitudId), 0);
      }
    }
    return true;
  }

  function showUsuarios(){
    const view=document.getElementById('view-usuarios');
    if(!view) return false;
    activateViewById('view-usuarios');
    setActiveSide('usuarios');
    updateContext('usuarios','Mi perfil y directorio de usuarios · datos reales desde Aiven');
    if(window.ManttoUsuarios) window.ManttoUsuarios.init();
    return true;
  }

  async function showNotifications(payload){
    const view = activateViewById('view-placeholder');
    setActiveSide('notifications');
    updateContext('notifications', 'Notificaciones nuevas pendientes de abrir');
    view.innerHTML = `<div class="placeholder"><div class="card placeholder-card construction-card"><div class="construction-icon">🔔</div><h1>Notificaciones nuevas</h1><p>Cargando notificaciones no abiertas...</p></div></div>`;
    const API_BASE = (window.MANTTO_API_BASE || 'http://localhost:3001').replace(/\/$/, '');
    const headers = Object.assign({ 'Accept':'application/json' }, window.ManttoAuth && window.ManttoAuth.authHeaders ? window.ManttoAuth.authHeaders() : {});
    try{
      const res = await fetch(API_BASE + '/api/notificaciones?estado=nuevas&limit=50', { headers });
      const json = await res.json();
      const rows = Array.isArray(json) ? json : (json.data || []);
      if(!rows.length){
        view.innerHTML = `<div class="placeholder"><div class="card placeholder-card construction-card"><div class="construction-icon">🔔</div><h1>Notificaciones nuevas</h1><p>No tienes notificaciones nuevas.</p></div></div>`;
        if(window.ManttoHome && window.ManttoHome.refreshHeaderNotifications) window.ManttoHome.refreshHeaderNotifications();
        return true;
      }
      view.innerHTML = `<div class="placeholder"><div class="card placeholder-card construction-card"><div class="construction-icon">🔔</div><h1>Notificaciones nuevas</h1><p>Solo aparecen notificaciones que todavía no han sido abiertas.</p><div id="notif-new-list" class="rail-list" style="max-height:60vh;overflow:auto;margin-top:14px"></div></div></div>`;
      const list = document.getElementById('notif-new-list');
      list.innerHTML = rows.map(n => `<article class="notif-item unread clickable" data-id="${safeText(n.id_notificacion || '')}" data-ref="${safeText(n.id_referencia || '')}" data-action="${safeText(n.accion_notificacion || '')}" data-tipo="${safeText(n.tipo_notificacion || '')}" data-title="${safeText(n.titulo_notificacion || '')}" data-message="${safeText(n.mensaje_notificacion || '')}" data-ruta="${safeText(n.ruta_destino || '')}"><div class="notif-icon">${safeText(n.icono_notificacion || '🔔')}</div><div><div class="notif-title">${safeText(n.titulo_notificacion || 'Notificación')}</div><div class="notif-text">${safeText(n.mensaje_notificacion || '')}</div><div class="notif-time">${new Date(n.fecha_creacion).toLocaleString('es-MX')}</div></div></article>`).join('');
      list.querySelectorAll('[data-id]').forEach(el => el.addEventListener('click', async () => {
        const id = el.dataset.id;
        const ref = el.dataset.ref;
        const ruta = el.dataset.ruta || '';
        await fetch(API_BASE + '/api/notificaciones/' + encodeURIComponent(id) + '/abrir', { method:'PATCH', headers }).catch(()=>null);
        if(window.ManttoHome && window.ManttoHome.refreshHeaderNotifications) window.ManttoHome.refreshHeaderNotifications();
        if(ruta.startsWith('home:tarea:') || el.dataset.action === 'ABRIR_TAREA'){
          const focusChat = isCommentNotification({
            action:el.dataset.action,
            tipo_notificacion:el.dataset.tipo,
            titulo_notificacion:el.dataset.title,
            mensaje_notificacion:el.dataset.message
          });
          window.ManttoRouter.go('tareas', {
            module:'tareas',
            id: ref || ruta.split(':').pop(),
            focus:focusChat ? 'chat' : null
          });
        }
        else if(ruta.startsWith('detalle:ticket:') || el.dataset.action === 'ABRIR_TICKET'){
          const focusChat = isCommentNotification({
            action:el.dataset.action,
            tipo_notificacion:el.dataset.tipo,
            titulo_notificacion:el.dataset.title,
            mensaje_notificacion:el.dataset.message
          });
          window.ManttoRouter.go('detalle', { type:'ticket', id:ruta.split(':').slice(2).join(':') || ref, focus:focusChat ? 'chat' : null });
        }
        else if(ruta === 'soporte-solicitudes' || el.dataset.action === 'ABRIR_SOLICITUD') window.ManttoRouter.go('soporte-solicitudes', { id: ref });
        else window.ManttoRouter.go('home');
      }));
    }catch(error){
      view.innerHTML = `<div class="placeholder"><div class="card placeholder-card construction-card"><div class="construction-icon">⚠️</div><h1>Notificaciones</h1><p>No se pudieron consultar las notificaciones.</p></div></div>`;
    }
    return true;
  }

  function showView(route, subtitle){
    const view = document.getElementById('view-' + route);
    if(!view) return false;
    activateViewById('view-' + route);
    setActiveSide(route);
    updateContext(route, subtitle || 'Datos reales desde Aiven');
    if(route==='help' && window.ManttoSupport){
      if(window.ManttoSupport.openHelp) window.ManttoSupport.openHelp(currentPayload || {});
      else window.ManttoSupport.loadHelp();
    }
    return true;
  }

  function showExperimental_exp(route){
    const view = document.getElementById('view-' + route);
    if(!view) return false;
    activateViewById('view-' + route);
    setActiveSide(route);
    updateContext(route, 'Agrupación Experimental · estructura base preparada para integración con Aiven');
    if(window.ManttoExperimental_exp && window.ManttoExperimental_exp.init){
      window.ManttoExperimental_exp.init(route, currentPayload || null);
    }
    return true;
  }

  function showCobranza_uni(route){
    const view = document.getElementById('view-' + route);
    if(!view) return false;
    activateViewById('view-' + route);
    setActiveSide(route);
    updateContext(route, 'Cobranza United · estructura base preparada para integración');
    if(window.ManttoCobranza_uni && window.ManttoCobranza_uni.init){
      window.ManttoCobranza_uni.init(route, currentPayload || null);
    }
    return true;
  }

  function showDetalle(payload){
    const view = document.getElementById('view-detalle');
    if(!view && window.ManttoDetails && window.ManttoDetails.show) window.ManttoDetails.show('Detalle','Mantto Gestor','<div class="mg-empty">Preparando detalle...</div>');
    activateViewById('view-detalle');
    setActiveSide('');
    const typeLabel = payload && payload.type === 'proyecto' ? 'Proyecto' : payload && payload.type === 'equipo' ? 'Equipo' : payload && payload.type === 'ticket' ? 'Ticket' : 'Detalle';
    updateContext('detalle', typeLabel + (payload && payload.id ? ' · ' + payload.id : ''));
    if(window.ManttoDetails && window.ManttoDetails.render) window.ManttoDetails.render(payload || {});
    return true;
  }

  function showPlaceholder(route, payload){
    if(route==='detalle' && showDetalle(payload)) return;
    if(EXPERIMENTAL_ROUTES_EXP.has(route) && showExperimental_exp(route)) return;
    if(COBRANZA_ROUTES_UNI.has(route) && showCobranza_uni(route)) return;
    if(route==='resumen' && showResumen()) return;
    if(route==='criticos' && showCriticos()) return;
    if(route==='portafolio' && showPortafolio()) return;
    if(route==='proyectos' && showProyectos()) return;
    if(route==='callcenter' && showCallCenter()) return;
    if(route==='operativo' && showOperativo()) return;
    if(route==='movimientos' && showMovimientos()) return;
    if(route==='instalaciones-dashboard' && showInstalacionesDashboard_cor()) return;
    if(route==='instalaciones-proyectos' && showInstalacionesProyectos()) return;
    if(route==='instalaciones-cerrados' && showInstalacionesCerrados()) return;
    if(route==='ventas-dashboard' && showVentasDashboard()) return;
    if(route==='ventas-fotos-mapa' && showVentasFotosMapa()) return;
    if(route==='ventas-clientes' && showVentasClientes()) return;
    if(route==='ventas-clientes-nuevo' && showVentasClientesNuevo()) return;
    if(route==='ventas-clientes-detalle' && showVentasClientesDetalle()) return;
    if(route==='ventas-cotizaciones' && showVentasCotizaciones()) return;
    if(route==='ventas-cotizaciones-nueva' && showVentasCotizacionesNueva()) return;
    if(route==='ventas-cotizaciones-editar' && showVentasCotizacionesEditar()) return;
    if(route==='ventas-cotizaciones-detalle' && showVentasCotizacionesDetalle()) return;
    if(route==='ventas-vendidos' && showVentasVendidos()) return;
    if(route==='ventas-proyeccion' && showVentasProyeccion()) return;
    if(route==='ventas-perdidos' && showVentasPerdidos()) return;
    if(route==='ventas-prospeccion' && showVentasProspeccion()) return;
    if(route==='ventas-prospeccion-nueva' && showVentasProspeccionNueva()) return;
    if(route==='ventas-prospeccion-detalle' && showVentasProspeccionDetalle()) return;
    if(route==='ventas-mapa-prospeccion' && showVentasMapaProspeccion()) return;
    if(route==='ventas-asignacion-redes' && showVentasAsignacionRedes()) return;
    if(route==='ventas-asignacion-redes-detalle' && showVentasAsignacionRedesDetalle()) return;
    if(route==='ventas-asignacion-redes-formulario' && showVentasAsignacionRedesFormulario()) return;
    if(route==='instalaciones-concentrado-cliente' && showInstalacionesConcentradoCliente()) return;
    if(route==='instalaciones-reporte' && showInstalacionesReporte_cor()) return;
    if(route==='instalaciones-ajuste' && showInstalacionesAjuste_cor()) return;
    if(route==='instalaciones-carpetas' && showInstalacionesCarpetas_cor()) return;
    if(route==='instalaciones-documentacion' && showInstalacionesDocumentacion_cor()) return;
    if(route==='instalaciones-pmm' && showInstalacionesPmm_cor()) return;
    if(route==='logistica-dashboard' && showLogisticaDashboard()) return;
    if(route==='logistica-reporte' && showLogisticaReporte()) return;
    if(route==='soporte-solicitudes' && showSoporteSolicitudes()) return;
    if(route==='usuarios' && showUsuarios()) return;
    if(route==='panel-control' && showPanelControl()) return;
    if(route==='help' && showView('help','Centro de Ayuda · flujos y FAQ desde Aiven')) return;
    if(route==='notifications'){ showNotifications(payload); return; }
    if(route==='support-request' && showView('support-request', currentPayload && currentPayload.id ? 'Editar mi solicitud de soporte' : 'Crear solicitud de soporte en Aiven')){
      if(window.ManttoSupport && window.ManttoSupport.openRequestForm) window.ManttoSupport.openRequestForm(currentPayload || {});
      return;
    }
    if(route==='tareas'){
      showHome();
      window.setTimeout(function(){
        if(window.ManttoHome){
          if(payload && payload.action === 'new') window.ManttoHome.openTaskForm('create');
          else if(payload && payload.id) window.ManttoHome.openTaskDetail(payload.id, { focus: payload.focus || null });
        }
      }, 0);
      return;
    }

    const view = activateViewById('view-placeholder');
    const detail = payload ? JSON.stringify(payload) : '';
    view.innerHTML = `<div class="placeholder"><div class="card placeholder-card construction-card">
      <div class="construction-icon">🚧</div>
      <h1>${label(route)}</h1>
      <h2>En construcción / En desarrollo</h2>
      <p>Este destino ya está registrado en la navegación de Mantto Gestor, pero el módulo todavía no ha sido integrado en Pruebas.</p>
      <p class="construction-note">Cuando este módulo se integre, este mismo acceso abrirá su vista real. Por ahora no se redirige a Resumen del día ni a otro módulo.</p>
      <span class="route-chip">Destino solicitado: ${route}${detail ? ' · ' + detail : ''}</span>
    </div></div>`;
    setActiveSide(route);
    updateContext(route, payload ? 'Destino en desarrollo generado desde un elemento clickeable' : 'Módulo en construcción');
  }


  function showPanelControl(){
    const view = activateViewById('view-panel-control');
    if(!view) return false;
    setActiveSide('panel-control');
    updateContext('panel-control', 'Administración de permisos por rol, excepciones por usuario y auditoría');
    if(window.ManttoPanelControl && window.ManttoPanelControl.init) window.ManttoPanelControl.init();
    return true;
  }

  function showHome(){
    activateViewById('view-home');
    setActiveSide('home');
    updateContext('home', 'Home operativo · datos reales desde Aiven cuando existan registros');
  }

  function render(route, payload){
    const isInstallationProjectDetail = route === 'detalle' && payload && payload.type === 'proyecto' && (payload.template === 'cliente-unificado' || payload.source === 'instalaciones-concentrado-cliente' || payload.source === 'instalaciones-proyectos');
    document.body.classList.toggle('mg-installation-project-detail', Boolean(isInstallationProjectDetail));
    if(route==='home') return showHome();
    return showPlaceholder(route, payload);
  }

  function internalGo(route, payload, opts){
    const options = opts || {};
    const navigationType = options.navigationType || 'forward';
    const nextRoute = route || 'home';
    const nextPayload = payload || null;
    const same = currentRoute === nextRoute && payloadKey(currentPayload) === payloadKey(nextPayload);

    if(!options.replace && !options.skipHistory && currentRoute && !same){
      const previousContext = captureContext(currentRoute, currentPayload);
      historyStack.push({ route:currentRoute, payload:currentPayload, context:previousContext });
      if(historyStack.length > 25) historyStack.shift();
      updateBrowserCurrentContext(previousContext);
    }

    currentRoute = nextRoute;
    currentPayload = nextPayload;
    render(currentRoute, currentPayload);
    saveCurrentRoute();

    if(navigationType === 'back' && options.context) restoreContext(options.context);
    else window.setTimeout(resetScroll,0);

    syncBrowserHistory(currentRoute, currentPayload, !!options.replace, 0);
    document.dispatchEvent(new CustomEvent('mantto:navigation',{ detail:{ type:navigationType, route:currentRoute, payload:currentPayload } }));
  }

  function internalBack(opts){
    const options = opts || {};
    const previous = historyStack.pop();
    if(previous){
      currentRoute = previous.route;
      currentPayload = previous.payload || null;
      render(currentRoute, currentPayload);
      saveCurrentRoute();
      restoreContext(previous.context);
    } else if(currentRoute !== 'home') {
      currentRoute = 'home';
      currentPayload = null;
      render('home', null);
      saveCurrentRoute();
      window.setTimeout(resetScroll,0);
    } else {
      render('home', null);
      window.setTimeout(resetScroll,0);
    }
    if(!options.fromBrowser) syncBrowserHistory(currentRoute, currentPayload, true, 0);
    document.dispatchEvent(new CustomEvent('mantto:navigation',{ detail:{ type:'back', route:currentRoute, payload:currentPayload } }));
  }

  window.addEventListener('popstate', function(ev){
    browserNavActive = true;
    try{
      const state = ev.state;
      if(state && state.mantto){
        currentRoute = state.route || 'home';
        currentPayload = state.payload || null;
        render(currentRoute, currentPayload);
        saveCurrentRoute();
        if(state.context) restoreContext(state.context);
        else window.setTimeout(resetScroll,0);
        document.dispatchEvent(new CustomEvent('mantto:navigation',{ detail:{ type:'back', route:currentRoute, payload:currentPayload } }));
      } else {
        internalBack({fromBrowser:true});
      }
    } finally {
      browserNavActive = false;
    }
  });

  function isCommentNotification(target){
    const source = [
      target && target.action,
      target && target.accion_notificacion,
      target && target.tipo_notificacion,
      target && target.title,
      target && target.titulo_notificacion,
      target && target.text,
      target && target.mensaje_notificacion
    ].map(function(value){ return String(value || '').toUpperCase(); }).join(' ');
    return source.includes('COMENT');
  }

  function normalizeOpenTarget(target){
    if(!target) return { route:'home', payload:null };

    const rawRoute = String(target.module || target.route || '').trim();
    const action = String(target.action || target.accion_notificacion || '').trim().toUpperCase();
    const reference = target.id_referencia || target.referenceId || target.id || null;
    const notificationId = target.notificationId || target.id_notificacion || null;
    const focusChat = isCommentNotification(target) || target.focus === 'chat';

    const detailMatch = rawRoute.match(/^detalle:(ticket|proyecto|equipo):(.+)$/i);
    if(detailMatch){
      return {
        route:'detalle',
        payload:{
          type:String(detailMatch[1]).toLowerCase(),
          id:detailMatch[2],
          notificationId,
          focus:focusChat ? 'chat' : null
        }
      };
    }

    if(action === 'ABRIR_TICKET'){
      return { route:'detalle', payload:{ type:'ticket', id:reference, notificationId, focus:focusChat ? 'chat' : null } };
    }

    if(action === 'ABRIR_TAREA'){
      return { route:'tareas', payload:{ module:'tareas', id:reference, notificationId, focus:focusChat ? 'chat' : null } };
    }

    if(action === 'ABRIR_SOLICITUD'){
      return { route:'soporte-solicitudes', payload:{ id:reference, notificationId } };
    }

    if(rawRoute === 'detalle' && target.type){
      return { route:'detalle', payload:target };
    }

    return { route:rawRoute || 'home', payload:target };
  }

  window.ManttoRouter = {
    go(route, payload, opts){ internalGo(route, payload, opts); },
    open(route, payload){ internalGo(route, payload, { navigationType:'open' }); },
    back(){ internalBack(); },
    openTarget(target){
      const destination = normalizeOpenTarget(target);
      this.go(destination.route, destination.payload);
    },
    getHistory(){ return historyStack.slice(); },
    getCurrent(){ return { route: currentRoute, payload: currentPayload }; },
    reset(){ historyStack.length = 0; internalGo('home', null, {replace:true,navigationType:'open',skipHistory:true}); }
  };

  function restoreInitialRoute(){
    if(initialRouteRestored) return;
    initialRouteRestored = true;
    const hashRoute = parseHashRoute();
    const stored = readSession(NAV_CURRENT_KEY, null);
    let target = hashRoute || stored || { route:'home', payload:null };
    if(hashRoute && stored && hashRoute.route === stored.route){
      const sameDetail = hashRoute.route !== 'detalle' || (hashRoute.payload && stored.payload && String(hashRoute.payload.type||'')===String(stored.payload.type||'') && String(hashRoute.payload.id||'')===String(stored.payload.id||''));
      if(sameDetail) target = { route:hashRoute.route, payload:Object.assign({}, stored.payload || {}, hashRoute.payload || {}) };
    }
    internalGo(target.route || 'home', target.payload || null, { replace:true, skipHistory:true, navigationType:'refresh' });
    updateBackButton();
  }

  document.addEventListener('DOMContentLoaded', function(){
    if(!window.ManttoAuth) window.setTimeout(restoreInitialRoute, 0);
    else window.setTimeout(function(){ if(!initialRouteRestored) restoreInitialRoute(); }, 800);
  });
  document.addEventListener('mantto:auth-ready', restoreInitialRoute);
})();

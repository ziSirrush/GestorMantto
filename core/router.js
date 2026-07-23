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
    'instalaciones-pmm':'PM&M', 'instalaciones-documentacion':'Documentación Pendiente', 'instalaciones-cerrados':'Proyectos Cerrados',
    'ventas-dashboard':'Dashboard Ventas', 'ventas-vendidos':'Vendidos', 'ventas-proyeccion':'Proyección', 'ventas-perdidos':'Perdidos',
    'ventas-fotos-mapa':'Fotos Mapa', 'ventas-clientes':'Clientes', 'ventas-cotizaciones':'Cotizaciones',
    'ventas-prospeccion':'Prospección', 'ventas-mapa-prospeccion':'Mapa Prospección', 'ventas-asignacion-redes':'Asignación Redes',
    'almacen-dashboard':'Dashboard Almacén', 'almacen-inventarios':'Inventarios', 'almacen-movimientos':'Movimientos Almacén',
    'cx-dashboard':'Dashboard CX', 'cx-encuestas':'Encuestas', 'cx-visitas':'Visitas',
    'legal-dashboard':'Dashboard Legal', 'legal-contratos':'Contratos', 'legal-suspendidos':'Suspendidos'
  };

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
      list.innerHTML = rows.map(n => `<article class="notif-item unread clickable" data-id="${safeText(n.id_notificacion || '')}" data-ref="${safeText(n.id_referencia || '')}" data-action="${safeText(n.accion_notificacion || '')}" data-ruta="${safeText(n.ruta_destino || '')}"><div class="notif-icon">${safeText(n.icono_notificacion || '🔔')}</div><div><div class="notif-title">${safeText(n.titulo_notificacion || 'Notificación')}</div><div class="notif-text">${safeText(n.mensaje_notificacion || '')}</div><div class="notif-time">${new Date(n.fecha_creacion).toLocaleString('es-MX')}</div></div></article>`).join('');
      list.querySelectorAll('[data-id]').forEach(el => el.addEventListener('click', async () => {
        const id = el.dataset.id;
        const ref = el.dataset.ref;
        const ruta = el.dataset.ruta || '';
        await fetch(API_BASE + '/api/notificaciones/' + encodeURIComponent(id) + '/abrir', { method:'PATCH', headers }).catch(()=>null);
        if(window.ManttoHome && window.ManttoHome.refreshHeaderNotifications) window.ManttoHome.refreshHeaderNotifications();
        if(ruta.startsWith('home:tarea:') || el.dataset.action === 'ABRIR_TAREA') window.ManttoRouter.go('tareas', { module:'tareas', id: ref || ruta.split(':').pop() });
        else if(ruta.startsWith('detalle:ticket:') || el.dataset.action === 'ABRIR_TICKET') window.ManttoRouter.go('detalle', { type:'ticket', id:ruta.split(':').slice(2).join(':') || ref });
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
    if(route==='help' && window.ManttoSupport) window.ManttoSupport.loadHelp();
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
    if(route==='resumen' && showResumen()) return;
    if(route==='criticos' && showCriticos()) return;
    if(route==='portafolio' && showPortafolio()) return;
    if(route==='proyectos' && showProyectos()) return;
    if(route==='callcenter' && showCallCenter()) return;
    if(route==='operativo' && showOperativo()) return;
    if(route==='movimientos' && showMovimientos()) return;
    if(route==='instalaciones-proyectos' && showInstalacionesProyectos()) return;
    if(route==='instalaciones-concentrado-cliente' && showInstalacionesConcentradoCliente()) return;
    if(route==='logistica-dashboard' && showLogisticaDashboard()) return;
    if(route==='logistica-reporte' && showLogisticaReporte()) return;
    if(route==='usuarios' && showUsuarios()) return;
    if(route==='panel-control' && showPanelControl()) return;
    if(route==='help' && showView('help','Centro de Ayuda · flujos y FAQ desde Aiven')) return;
    if(route==='notifications'){ showNotifications(payload); return; }
    if(route==='support-request' && showView('support-request','Crear solicitud de soporte en Aiven')) return;
    if(route==='tareas'){
      showHome();
      window.setTimeout(function(){
        if(window.ManttoHome){
          if(payload && payload.action === 'new') window.ManttoHome.openTaskForm('create');
          else if(payload && payload.id) window.ManttoHome.openTaskDetail(payload.id);
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

  window.ManttoRouter = {
    go(route, payload, opts){ internalGo(route, payload, opts); },
    open(route, payload){ internalGo(route, payload, { navigationType:'open' }); },
    back(){ internalBack(); },
    openTarget(target){
      if(!target) return;
      this.go(target.module || target.route || 'home', target);
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

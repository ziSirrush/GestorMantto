(function(){
  const routeNames = {
    home:'Inicio', resumen:'Resumen del día', tickets:'Tickets', callcenter:'Dashboard Call Center',
    operativo:'Dashboard Operativo', portafolio:'Dashboard Portafolio', movimientos:'Movimientos Portafolio',
    proyectos:'Proyectos', criticos:'Equipos Críticos', usuarios:'Usuarios',
    tareas:'Tareas', activity:'Actividad reciente', 'panel-control':'Panel de Control', control:'Centro de Control',
    help:'Centro de Ayuda', notifications:'Notificaciones', services:'Estado de servicios',
    profile:'Perfil de usuario', 'support-request':'Solicitud de soporte', detalle:'Detalle'
  };

  let currentRoute = 'home';
  let currentPayload = null;
  const historyStack = [];
  let browserNavActive = false;

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
  function syncBrowserHistory(route, payload, replace){
    if(browserNavActive || !window.history) return;
    const state = { mantto:true, route:route || 'home', payload:payload || null };
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
    document.querySelectorAll('.side-item').forEach(b=>b.classList.toggle('active', b.dataset.route===route));
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
    if(window.ManttoPortafolio) window.ManttoPortafolio.init();
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
    if(window.ManttoProyectos) window.ManttoProyectos.init(currentPayload);
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
    if(window.ManttoCallCenter) window.ManttoCallCenter.init();
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
    if(route==='usuarios' && showUsuarios()) return;
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
    const nextRoute = route || 'home';
    const same = currentRoute === nextRoute && payloadKey(currentPayload) === payloadKey(payload || null);
    if(!options.replace && currentRoute && !same){
      const main = document.querySelector('.main-content');
      historyStack.push({ route: currentRoute, payload: currentPayload, scrollY: main ? main.scrollTop : 0 });
      if(historyStack.length > 25) historyStack.shift();
    }
    currentRoute = nextRoute;
    currentPayload = payload || null;
    render(currentRoute, currentPayload);
    syncBrowserHistory(currentRoute, currentPayload, !!options.replace);
  }

  function internalBack(opts){
    const options = opts || {};
    const previous = historyStack.pop();
    if(previous){
      currentRoute = previous.route;
      currentPayload = previous.payload || null;
      render(currentRoute, currentPayload);
      window.setTimeout(function(){ const main=document.querySelector('.main-content'); if(main) main.scrollTop=previous.scrollY || 0; }, 0);
    } else if(currentRoute !== 'home') {
      currentRoute = 'home';
      currentPayload = null;
      render('home', null);
    } else {
      render('home', null);
    }
    if(!options.fromBrowser) syncBrowserHistory(currentRoute, currentPayload, false);
  }

  window.addEventListener('popstate', function(ev){
    browserNavActive = true;
    try{
      const state = ev.state;
      if(state && state.mantto){
        currentRoute = state.route || 'home';
        currentPayload = state.payload || null;
        render(currentRoute, currentPayload);
      } else {
        internalBack({fromBrowser:true});
      }
    } finally {
      browserNavActive = false;
    }
  });

  window.ManttoRouter = {
    go(route, payload, opts){ internalGo(route, payload, opts); },
    back(){ internalBack(); },
    openTarget(target){
      if(!target) return;
      this.go(target.module || target.route || 'home', target);
    },
    getHistory(){ return historyStack.slice(); },
    getCurrent(){ return { route: currentRoute, payload: currentPayload }; },
    reset(){ historyStack.length = 0; internalGo('home', null, {replace:true}); }
  };

  document.addEventListener('DOMContentLoaded', function(){
    syncBrowserHistory(currentRoute, currentPayload, true);
    updateBackButton();
  });
})();

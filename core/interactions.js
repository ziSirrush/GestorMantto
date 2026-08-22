(function(){
  'use strict';

  if(window.ManttoInteractions) return;

  const API_BASE = (window.MANTTO_API_BASE || 'http://localhost:3001').replace(/\/$/, '');
  const nativeFetch = window.fetch.bind(window);
  const HISTORY_PAGE_SIZE = 100;
  const USER_GESTURE_WINDOW_MS = 8000;
  const ROUTING_PAYLOAD_KEYS = new Set([
    'id', 'id_referencia', 'referenceId', 'type', 'module', 'route', 'source', 'template',
    'view', 'categoria', 'mode', 'proyecto', 'project', 'codigo', 'equipo', 'ticket',
    'notificationId', 'focus', 'tab'
  ]);

  let initialized = false;
  let fetchPatched = false;
  let lastUserGestureAt = 0;
  let homeObserver = null;
  let homeRefreshTimer = null;
  let historyOffset = 0;
  let historyLoading = false;
  let lastNavigationKey = '';
  let lastNavigationAt = 0;
  let lastConsultationKey = '';
  let lastConsultationAt = 0;

  const routeLabels = {
    home:'Inicio', resumen:'Resumen del día', tickets:'Tickets', callcenter:'Dashboard Call Center',
    operativo:'Dashboard Operativo', portafolio:'Dashboard Portafolio', movimientos:'Movimientos Portafolio',
    proyectos:'Proyectos', criticos:'Equipos Críticos', usuarios:'Usuarios', tareas:'Tareas',
    activity:'Actividad reciente', 'panel-control':'Panel de Control', help:'Centro de Ayuda',
    notifications:'Notificaciones', services:'Estado de servicios', detalle:'Detalle',
    'soporte-solicitudes':'Solicitudes de Soporte', 'ventas-dashboard':'Dashboard Ventas',
    'ventas-clientes':'Clientes', 'ventas-clientes-detalle':'Detalle de cliente',
    'ventas-cotizaciones':'Cotizaciones', 'ventas-cotizaciones-detalle':'Detalle de cotización',
    'ventas-prospeccion':'Prospección', 'ventas-prospeccion-detalle':'Detalle de visita',
    'ventas-asignacion-redes':'Asignación a Redes', 'ventas-asignacion-redes-detalle':'Detalle de Asignación a Redes',
    'instalaciones-proyectos':'Proyectos de Instalación', 'cobranza-uni-dashboard':'Dashboard Cobranza',
    'cobranza-uni-estados-cuenta':'Gestión de Crédito', 'cobranza-uni-mp-pro':'Mantenimiento Preventivo',
    'cobranza-uni-aditivas':'Venta Adicional'
  };

  const entityPatterns = [
    { kind:'tarea', re:/^\/api\/pendientes(?:\/([^/?#]+))?/i },
    { kind:'ticket', re:/^\/api\/(?:tickets|ticket)(?:\/([^/?#]+))?/i },
    { kind:'cotizacion', re:/^\/api\/ventas\/cotizaciones(?:\/([^/?#]+))?/i },
    { kind:'prospeccion', re:/^\/api\/ventas\/prospeccion(?:\/([^/?#]+))?/i },
    { kind:'redes', re:/^\/api\/ventas\/redes(?:\/([^/?#]+))?/i },
    { kind:'soporte', re:/^\/api\/(?:soporte(?:-solicitudes)?|support)(?:\/solicitudes)?(?:\/([^/?#]+))?/i },
    { kind:'proyecto_instalaciones', re:/^\/api\/instalaciones\/(?:proyectos|proyecto)(?:\/([^/?#]+))?/i },
    { kind:'proyecto', re:/^\/api\/proyectos(?:\/([^/?#]+))?/i },
    { kind:'equipo', re:/^\/api\/(?:portafolio|equipos)(?:\/([^/?#]+))?/i },
    { kind:'usuario', re:/^\/api\/(?:usuarios|panel-control\/usuarios)(?:\/([^/?#]+))?/i }
  ];

  const invalidReferenceWords = new Set([
    'catalogos', 'catalogo', 'bootstrap', 'sync', 'estado', 'estatus', 'prioridad',
    'comentarios', 'comentario', 'archivos', 'archivo', 'adjuntos', 'adjunto',
    'subtareas', 'subtarea', 'detalle', 'dashboard', 'resumen', 'search', 'buscar',
    'preferencias', 'matriz', 'auditoria'
  ]);

  function safeText_gnral(value){
    const text = value === null || value === undefined ? '' : String(value);
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function cloneJson_gnral(value){
    if(value === null || value === undefined) return null;
    try{ return JSON.parse(JSON.stringify(value)); }
    catch(_error){ return null; }
  }

  function parseJson_gnral(value){
    if(value === null || value === undefined || value === '') return null;
    if(typeof value === 'object') return value;
    try{ return JSON.parse(String(value)); }
    catch(_error){ return null; }
  }

  function cleanReference_gnral(value){
    if(value === null || value === undefined || value === '') return null;
    const text = String(value).trim();
    if(!text || invalidReferenceWords.has(text.toLowerCase())) return null;
    return text.slice(0, 150);
  }

  function authHeaders_gnral(){
    if(window.ManttoAuth && typeof window.ManttoAuth.authHeaders === 'function'){
      const headers = window.ManttoAuth.authHeaders() || {};
      if(headers.Authorization || headers.authorization) return headers;
    }

    const token =
      localStorage.getItem('mantto_token') ||
      localStorage.getItem('MANTTO_TOKEN') ||
      localStorage.getItem('token') ||
      sessionStorage.getItem('mantto_token') ||
      sessionStorage.getItem('MANTTO_TOKEN') ||
      sessionStorage.getItem('token') ||
      '';

    return token ? { Authorization:'Bearer ' + token } : {};
  }

  function hasAuth_gnral(){
    const headers = authHeaders_gnral();
    return Boolean(headers.Authorization || headers.authorization);
  }

  function currentRoute_gnral(){
    if(window.ManttoRouter && typeof window.ManttoRouter.getCurrent === 'function'){
      const current = window.ManttoRouter.getCurrent() || {};
      return {
        route:String(current.route || 'home'),
        payload:cloneJson_gnral(current.payload)
      };
    }
    return { route:'home', payload:null };
  }

  function routingPayload_gnral(value){
    if(!value || typeof value !== 'object') return null;
    const safe = {};
    Object.keys(value).forEach(key => {
      if(!ROUTING_PAYLOAD_KEYS.has(key)) return;
      const item = value[key];
      if(item === null || ['string','number','boolean'].includes(typeof item)) safe[key] = item;
    });
    return Object.keys(safe).length ? safe : null;
  }

  function routeLabel_gnral(route){
    const r = String(route || 'home');
    const contextTitle = document.getElementById('app-context-title');
    const current = currentRoute_gnral();
    if(contextTitle && current.route === r && String(contextTitle.textContent || '').trim()){
      return String(contextTitle.textContent).trim();
    }
    return routeLabels[r] || r.replace(/[-_]+/g, ' ');
  }

  function referenceFromPayload_gnral(payload){
    if(!payload || typeof payload !== 'object') return null;
    return cleanReference_gnral(
      payload.id || payload.id_referencia || payload.referenceId || payload.codigo ||
      payload.proyecto || payload.project || payload.equipo || payload.ticket
    );
  }

  function entityFromRoute_gnral(route, payload){
    const type = String(payload?.type || '').toLowerCase();
    if(type) return type;
    const r = String(route || '').toLowerCase();
    if(r === 'tareas') return 'tarea';
    if(r.includes('cotizacion')) return 'cotizacion';
    if(r.includes('prospeccion')) return 'prospeccion';
    if(r.includes('redes')) return 'redes';
    if(r.includes('ticket')) return 'ticket';
    if(r.includes('instalaciones-proyectos')) return 'proyecto_instalaciones';
    if(r.includes('proyecto')) return 'proyecto';
    if(r.includes('portafolio') || r.includes('equipo')) return 'equipo';
    if(r.includes('usuario')) return 'usuario';
    if(r.includes('soporte')) return 'soporte';
    return null;
  }

  function entityLabel_gnral(entity){
    const labels = {
      tarea:'Tarea', ticket:'Ticket', cotizacion:'Cotización', prospeccion:'Prospección',
      redes:'Asignación a Redes', soporte:'Solicitud de Soporte', proyecto:'Proyecto',
      proyecto_instalaciones:'Proyecto de Instalación', equipo:'Equipo', usuario:'Usuario'
    };
    return labels[String(entity || '').toLowerCase()] || null;
  }

  function targetFromEntity_gnral(entity, reference, current){
    const ref = cleanReference_gnral(reference);
    if(!entity || !ref) return current;
    if(entity === 'tarea') return { route:'tareas', payload:{ id:ref } };
    if(entity === 'ticket') return { route:'detalle', payload:{ type:'ticket', id:ref } };
    if(entity === 'cotizacion') return { route:'ventas-cotizaciones-detalle', payload:{ id:ref } };
    if(entity === 'prospeccion') return { route:'ventas-prospeccion-detalle', payload:{ id:ref } };
    if(entity === 'redes') return { route:'ventas-asignacion-redes-detalle', payload:{ id:ref } };
    if(entity === 'soporte') return { route:'soporte-solicitudes', payload:{ id:ref } };
    if(entity === 'proyecto') return { route:'detalle', payload:{ type:'proyecto', id:ref } };
    if(entity === 'proyecto_instalaciones') return { route:'detalle', payload:{ type:'proyecto', id:ref, source:'instalaciones-proyectos' } };
    if(entity === 'equipo') return { route:'detalle', payload:{ type:'equipo', id:ref } };
    if(entity === 'usuario') return { route:'usuarios', payload:{ id:ref } };
    return current;
  }

  function toUrl_gnral(input){
    try{
      const raw = typeof input === 'string' ? input : input && input.url;
      if(!raw) return null;
      return new URL(raw, window.location.href);
    }catch(_error){ return null; }
  }

  function requestMethod_gnral(input, init){
    return String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
  }

  function apiUrl_gnral(){
    try{ return new URL(API_BASE, window.location.href); }
    catch(_error){ return null; }
  }

  function isGestorApi_gnral(url){
    if(!url) return false;
    const base = apiUrl_gnral();
    return Boolean(base && url.origin === base.origin && url.pathname.startsWith('/api/'));
  }

  function isSystemEndpoint_gnral(path){
    const p = String(path || '').toLowerCase();
    return p === '/api/health' ||
      p.startsWith('/api/interacciones') ||
      p.startsWith('/api/auth/') ||
      p.startsWith('/api/push') ||
      p.startsWith('/api/device-permissions') ||
      p.includes('/viewer') ||
      p.includes('/sync') ||
      p.includes('/import');
  }

  function endpointEntity_gnral(path){
    for(const pattern of entityPatterns){
      const match = String(path || '').match(pattern.re);
      if(match) return { kind:pattern.kind, id:cleanReference_gnral(match[1]) };
    }
    return { kind:null, id:null };
  }

  function markUserGesture_gnral(event){
    if(event && event.isTrusted === false) return;
    lastUserGestureAt = Date.now();
  }

  function recentUserGesture_gnral(){
    return Date.now() - lastUserGestureAt <= USER_GESTURE_WINDOW_MS;
  }

  function addContextHeaders_gnral(input, init){
    const current = currentRoute_gnral();
    const nextInit = Object.assign({}, init || {});
    const sourceHeaders = (init && init.headers) || (typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined);
    const headers = new Headers(sourceHeaders || {});
    headers.set('X-Mantto-Route', String(current.route || 'home').slice(0, 500));
    const payload = routingPayload_gnral(current.payload);
    if(payload){
      const serialized = JSON.stringify(payload);
      if(serialized.length <= 3000) headers.set('X-Mantto-Payload', serialized);
    }
    nextInit.headers = headers;
    return nextInit;
  }

  async function record_gnral(input){
    const data = input || {};
    const type = String(data.tipo_interaccion || data.tipo || '').trim().toUpperCase();
    return {
      ok:true,
      skipped:true,
      reason:'SOLO_ACCIONES_OPERATIVAS_BACKEND',
      tipo_interaccion:type || null
    };
  }

  async function list_gnral(options){
    if(!hasAuth_gnral()) return [];
    const opts = options || {};
    const params = new URLSearchParams();
    params.set('limit', String(Math.min(200, Math.max(1, Number(opts.limit || 100)))));
    params.set('offset', String(Math.max(0, Number(opts.offset || 0))));

    const response = await nativeFetch(API_BASE + '/api/interacciones?' + params.toString(), {
      headers:Object.assign({ 'Accept':'application/json' }, authHeaders_gnral())
    });
    if(!response.ok) throw new Error('No fue posible consultar las interacciones.');
    const json = await response.json();
    return Array.isArray(json) ? json : (json.data || []);
  }

  function navigationData_gnral(detail){
    const route = String(detail?.route || 'home');
    const payload = routingPayload_gnral(detail?.payload);
    const entity = entityFromRoute_gnral(route, payload);
    const reference = referenceFromPayload_gnral(payload);
    const label = entityLabel_gnral(entity) || routeLabel_gnral(route);
    return {
      tipo_interaccion:'NAVEGACION',
      modulo:route,
      entidad:entity,
      id_referencia:reference,
      titulo:`Abriste ${label}${reference ? ' · ' + reference : ''}`,
      descripcion:`Navegación a ${routeLabel_gnral(route)}.`,
      ruta_destino:route,
      payload_json:payload,
      detalle_json:{ source:'router', navigation_type:detail?.type || 'forward' }
    };
  }

  function recordNavigation_gnral(detail){
    const data = navigationData_gnral(detail || {});
    let key = '';
    try{ key = JSON.stringify([data.modulo, data.payload_json, detail?.type || 'forward']); }catch(_error){}
    const now = Date.now();
    if(key && key === lastNavigationKey && now - lastNavigationAt < 250) return;
    lastNavigationKey = key;
    lastNavigationAt = now;
    record_gnral(data);
  }

  function shouldTrackConsultation_gnral(method, path){
    if(method !== 'GET' || !recentUserGesture_gnral() || isSystemEndpoint_gnral(path)) return false;
    const endpoint = endpointEntity_gnral(path);
    if(!endpoint.kind || !endpoint.id) return false;

    const current = currentRoute_gnral();
    const currentRef = referenceFromPayload_gnral(current.payload);
    if(currentRef && String(currentRef) === String(endpoint.id)) return false;
    return true;
  }

  function recordConsultation_gnral(path){
    const endpoint = endpointEntity_gnral(path);
    if(!endpoint.kind || !endpoint.id) return;
    const current = currentRoute_gnral();
    const target = targetFromEntity_gnral(endpoint.kind, endpoint.id, current);
    const label = entityLabel_gnral(endpoint.kind) || routeLabel_gnral(target.route);
    const key = `${endpoint.kind}:${endpoint.id}:${target.route}`;
    const now = Date.now();
    if(key === lastConsultationKey && now - lastConsultationAt < 1000) return;
    lastConsultationKey = key;
    lastConsultationAt = now;

    record_gnral({
      tipo_interaccion:'CONSULTAR',
      modulo:target.route || current.route || 'general',
      entidad:endpoint.kind,
      id_referencia:endpoint.id,
      titulo:`Consultaste ${label} · ${endpoint.id}`,
      descripcion:`Consulta abierta desde ${routeLabel_gnral(current.route)}.`,
      ruta_destino:target.route || current.route || 'home',
      payload_json:target.payload || current.payload || null,
      detalle_json:{ source:'frontend-get', endpoint:path }
    });
  }

  function patchFetch_gnral(){
    if(fetchPatched) return;
    fetchPatched = true;

    window.fetch = async function(input, init){
      const method = requestMethod_gnral(input, init);
      const url = toUrl_gnral(input);
      const apiRequest = isGestorApi_gnral(url);
      const path = url ? url.pathname : '';
      const trackMutationRefresh = apiRequest && ['POST','PUT','PATCH','DELETE'].includes(method) && !isSystemEndpoint_gnral(path);
      const nextInit = apiRequest ? addContextHeaders_gnral(input, init) : init;
      const response = await nativeFetch(input, nextInit);

      if(response.ok && trackMutationRefresh && currentRoute_gnral().route === 'home'){
        scheduleHomeRefresh_gnral(300);
      }
      return response;
    };
  }

  function rowPayload_gnral(row){
    const payload = parseJson_gnral(row.payload_json) || null;
    const route = String(row.ruta_destino || row.modulo || 'home');
    return { route, payload:routingPayload_gnral(payload) };
  }

  function formatDateTime_gnral(value){
    if(!value) return '';
    const date = new Date(value);
    if(Number.isNaN(date.getTime())) return String(value);
    const pad = number => String(number).padStart(2, '0');
    return `${pad(date.getDate())}/${pad(date.getMonth()+1)}/${date.getFullYear()} - ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function iconForType_gnral(type, fallback){
    if(fallback) return fallback;
    const icons = {
      NAVEGACION:'🧭', CONSULTAR:'👁️', CREAR:'🆕', EDITAR:'✏️', ACTUALIZAR:'🔄',
      COMENTAR:'💬', CAMBIAR_ESTATUS:'🔄', CAMBIAR_PRIORIDAD:'⚡', ASIGNAR:'👤',
      VALIDAR:'✅', VOBO:'✅', ADJUNTAR:'📎', ELIMINAR:'🗑️'
    };
    return icons[String(type || '').toUpperCase()] || '🕘';
  }

  function rowHtml_gnral(row, marker){
    const target = rowPayload_gnral(row);
    const targetAttr = safeText_gnral(JSON.stringify(target));
    return `<article class="activity-item clickable" ${marker}="1" data-h1-target='${targetAttr}'>
      <div class="activity-icon">${safeText_gnral(iconForType_gnral(row.tipo_interaccion, row.icono))}</div>
      <div>
        <div class="activity-title">${safeText_gnral(row.titulo || 'Interacción')}</div>
        <div class="activity-text">${safeText_gnral(row.descripcion || row.tipo_interaccion || '')}</div>
        <div class="activity-time">${safeText_gnral(formatDateTime_gnral(row.created_at || row.fecha_creacion))}</div>
      </div>
    </article>`;
  }

  function bindRows_gnral(scope){
    (scope || document).querySelectorAll('[data-h1-target]').forEach(element => {
      if(element.dataset.h1Bound === '1') return;
      element.dataset.h1Bound = '1';
      element.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        let target = null;
        try{ target = JSON.parse(element.dataset.h1Target || '{}'); }catch(_error){}
        if(!target || !target.route || !window.ManttoRouter) return;
        window.ManttoRouter.go(target.route, target.payload || null, { navigationType:'open' });
      });
    });
  }

  async function renderHomeRecent_gnral(){
    const container = document.getElementById('home-activity-list');
    if(!container) return;
    try{
      const rows = await list_gnral({ limit:5, offset:0 });
      const currentContainer = document.getElementById('home-activity-list');
      if(!currentContainer) return;
      currentContainer.innerHTML = rows.length
        ? rows.map(row => rowHtml_gnral(row, 'data-h1-interaction')).join('')
        : '<div class="empty-state" data-h1-interaction-empty="1">Sin interacciones registradas.</div>';
      bindRows_gnral(currentContainer);
    }catch(error){
      console.warn('H1 Interacciones: no fue posible cargar las últimas interacciones.', error);
    }
  }

  function scheduleHomeRefresh_gnral(delay){
    if(homeRefreshTimer) window.clearTimeout(homeRefreshTimer);
    homeRefreshTimer = window.setTimeout(() => {
      homeRefreshTimer = null;
      renderHomeRecent_gnral();
    }, Math.max(0, Number(delay || 0)));
  }

  function bindHomeObserver_gnral(){
    if(homeObserver) return;
    const root = document.getElementById('view-home');
    if(!root) return;

    homeObserver = new MutationObserver(() => {
      const activity = document.getElementById('home-activity-list');
      if(!activity) return;
      const hasH1 = activity.querySelector('[data-h1-interaction], [data-h1-interaction-empty]');
      if(!hasH1) scheduleHomeRefresh_gnral(20);
    });
    homeObserver.observe(root, { childList:true, subtree:true });
    scheduleHomeRefresh_gnral(0);
  }

  async function loadHistoryPage_gnral(reset){
    if(historyLoading) return;
    historyLoading = true;
    const list = document.getElementById('h1-interactions-history-list');
    const more = document.getElementById('h1-interactions-more');
    if(!list){ historyLoading = false; return; }

    if(reset){
      historyOffset = 0;
      list.innerHTML = '<div class="empty-state">Cargando interacciones...</div>';
    }

    try{
      const rows = await list_gnral({ limit:HISTORY_PAGE_SIZE, offset:historyOffset });
      if(reset) list.innerHTML = '';
      if(!rows.length && historyOffset === 0){
        list.innerHTML = '<div class="empty-state">Sin interacciones registradas.</div>';
      } else if(rows.length){
        list.insertAdjacentHTML('beforeend', rows.map(row => rowHtml_gnral(row, 'data-h1-history-interaction')).join(''));
        bindRows_gnral(list);
        historyOffset += rows.length;
      }
      if(more) more.hidden = rows.length < HISTORY_PAGE_SIZE;
    }catch(error){
      if(reset) list.innerHTML = '<div class="empty-state">No fue posible consultar el historial de interacciones.</div>';
      if(more) more.hidden = true;
    }finally{
      historyLoading = false;
    }
  }

  function renderActivityView_gnral(){
    const current = currentRoute_gnral();
    if(current.route !== 'activity') return false;
    const view = document.getElementById('view-placeholder');
    if(!view) return false;

    view.innerHTML = `<div class="placeholder">
      <section class="card placeholder-card" style="max-width:1100px">
        <h1>Actividad reciente</h1>
        <p>Historial personal de acciones operativas realizadas en el Gestor. Cada elemento regresa al contexto guardado cuando existe una referencia disponible.</p>
        <div id="h1-interactions-history-list" class="rail-list" style="margin-top:16px;max-height:none;overflow:visible"></div>
        <div class="form-actions" style="padding:14px 0 0">
          <button type="button" class="mini-action" id="h1-interactions-more">Cargar más</button>
        </div>
      </section>
    </div>`;

    document.getElementById('h1-interactions-more')?.addEventListener('click', () => loadHistoryPage_gnral(false));
    loadHistoryPage_gnral(true);
    return true;
  }

  function onNavigation_gnral(event){
    const detail = event?.detail || {};
    if(String(detail.route || '') === 'home'){
      bindHomeObserver_gnral();
      scheduleHomeRefresh_gnral(80);
    }
    if(String(detail.route || '') === 'activity'){
      window.setTimeout(renderActivityView_gnral, 0);
    }
  }

  function init(){
    if(initialized) return;
    initialized = true;
    patchFetch_gnral();
    document.addEventListener('mantto:navigation', onNavigation_gnral);
    bindHomeObserver_gnral();

    const current = currentRoute_gnral();
    if(current.route === 'activity') renderActivityView_gnral();
    if(current.route === 'home') scheduleHomeRefresh_gnral(100);
  }

  window.ManttoInteractions = {
    init,
    record_gnral,
    recordAction_gnral:record_gnral,
    list_gnral,
    renderHomeRecent_gnral,
    renderActivityView_gnral
  };
})();

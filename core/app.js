(function(){

  let interactionsModulePromise = null;

  function ensureInteractionsModule_gnral(){
    if(window.ManttoInteractions) return Promise.resolve(window.ManttoInteractions);
    if(interactionsModulePromise) return interactionsModulePromise;

    interactionsModulePromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-mantto-interactions="1"]');
      if(existing){
        existing.addEventListener('load', () => resolve(window.ManttoInteractions || null), { once:true });
        existing.addEventListener('error', reject, { once:true });
        return;
      }

      const script = document.createElement('script');
      script.src = './core/interactions.js?v=20260818-h1-v001';
      script.async = true;
      script.dataset.manttoInteractions = '1';
      script.addEventListener('load', () => resolve(window.ManttoInteractions || null), { once:true });
      script.addEventListener('error', reject, { once:true });
      document.head.appendChild(script);
    });

    return interactionsModulePromise;
  }

  ensureInteractionsModule_gnral().catch(error => {
    console.warn('No fue posible cargar el módulo general de interacciones H1.', error);
  });


  function formatDate(date){
    return date.toLocaleDateString('es-MX', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
  }
  function formatTime(date){
    return date.toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit' });
  }
  function initDailyPhrase(){
    const dateEl = document.getElementById('context-date');
    const timeEl = document.getElementById('context-time');
    const phraseEl = document.getElementById('daily-phrase-text');
    function render(){
      const now = new Date();
      if(dateEl) dateEl.textContent = formatDate(now);
      if(timeEl) timeEl.textContent = formatTime(now);
      if(phraseEl) phraseEl.textContent = '"' + window.ManttoDailyPhrases.getDailyPhrase(now) + '"';
    }
    render();
    window.setInterval(render, 30000);
  }

  const TEMP_SIDEBAR_PERMISSIONS = Object.freeze({
    home:true
  });

  function applyTemporarySidebarPermissions(){
    document.querySelectorAll('[data-permission]').forEach(function(el){
      const permission = el.dataset.permission;
      el.hidden = TEMP_SIDEBAR_PERMISSIONS[permission] !== true;
    });
    document.querySelectorAll('.side-group').forEach(function(group){
      const visibleItems = Array.from(group.querySelectorAll('.side-item')).some(function(item){ return !item.hidden; });
      group.hidden = !visibleItems;
    });
  }

  function openSidebarGroup(groupToOpen){
    document.querySelectorAll('.side-group').forEach(function(group){
      const shouldOpen = group === groupToOpen;
      group.classList.toggle('open', shouldOpen);
      const toggle = group.querySelector('.side-group-toggle');
      if(toggle) toggle.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
    });
  }

  function openGroupForCurrentRoute(){
    const active = document.querySelector('.side-item.active');
    const group = active ? active.closest('.side-group') : null;
    if(group) openSidebarGroup(group);
  }

  function bindGlobalNavigation(){
    applyTemporarySidebarPermissions();
    openSidebarGroup(null);

    document.querySelectorAll('.side-group-toggle').forEach(function(toggle){
      toggle.addEventListener('click', function(){
        const group = toggle.closest('.side-group');
        if(!group) return;
        const willOpen = !group.classList.contains('open');
        if(willOpen) openSidebarGroup(group);
        else {
          group.classList.remove('open');
          toggle.setAttribute('aria-expanded','false');
        }
      });
    });

    const sidebar = document.getElementById('sidebar');
    if(sidebar){
      sidebar.addEventListener('click', function(event){
        if(window.innerWidth <= 920 || !sidebar.classList.contains('collapsed')) return;

        // Solo los encabezados de grupos expanden la barra cuando esta contraida.
        // Los accesos directos (Inicio, Usuarios y Panel de Control) conservan
        // su accion normal y no modifican el estado contraido del panel.
        const groupToggle = event.target.closest('.side-group-toggle');
        if(!groupToggle) return;

        const clickedGroup = groupToggle.closest('.side-group');
        sidebar.classList.remove('collapsed');
        if(clickedGroup) openSidebarGroup(clickedGroup);

        // El primer clic solo expande y abre el grupo; no navega.
        event.preventDefault();
        event.stopImmediatePropagation();
      }, true);
    }

    document.querySelectorAll('[data-route]').forEach(el=>{
      if(el.id === 'app-back-btn') return;
      el.addEventListener('click', e=>{
        const route = el.dataset.route;
        if(route) window.ManttoRouter.go(route, null, { navigationType:'open' });
        if(route && el.classList && el.classList.contains('side-item')){
          const sb = document.getElementById('sidebar');
          if(sb){
            if(window.innerWidth <= 920) sb.classList.remove('open');
            else sb.classList.add('collapsed');
          }
          if(!el.closest('.side-group')) openSidebarGroup(null);
        }
      });
    });
    const backBtn = document.getElementById('app-back-btn');
    if(backBtn){
      backBtn.removeAttribute('data-route');
      backBtn.addEventListener('click', e=>{
        e.preventDefault();
        if(window.ManttoRouter && window.ManttoRouter.back) window.ManttoRouter.back();
      });
    }
    document.getElementById('btnToggleSidebar').addEventListener('click',()=>{
      const sb = document.getElementById('sidebar');
      if(window.innerWidth <= 920) sb.classList.toggle('open');
      else {
        sb.classList.toggle('collapsed');
        if(!sb.classList.contains('collapsed')) openGroupForCurrentRoute();
      }
    });

    const noriFloat = document.getElementById('noriFloat');
    const noriClose = document.getElementById('noriClose');
    const noriChat = document.getElementById('pandaChat');
    if(noriFloat && noriChat){
      const defaultInlinePosition = {
        left: noriFloat.style.left || '',
        right: noriFloat.style.right || '',
        top: noriFloat.style.top || '',
        bottom: noriFloat.style.bottom || '',
        transform: noriFloat.style.transform || ''
      };
      let drag = null;
      let suppressClick = false;

      const isMobileNori = () => window.matchMedia('(max-width: 760px)').matches;
      const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
      const resetNoriPosition = () => {
        noriFloat.style.left = defaultInlinePosition.left;
        noriFloat.style.right = defaultInlinePosition.right;
        noriFloat.style.top = defaultInlinePosition.top;
        noriFloat.style.bottom = defaultInlinePosition.bottom;
        noriFloat.style.transform = defaultInlinePosition.transform;
      };
      const setNoriOpen = open => {
        const shouldOpen = Boolean(open);
        noriChat.classList.toggle('open', shouldOpen);
        noriFloat.classList.toggle('is-open', shouldOpen);
        noriFloat.setAttribute('aria-expanded', String(shouldOpen));
        noriFloat.setAttribute('aria-label', shouldOpen ? 'Minimizar Nori' : 'Abrir Nori');
        noriFloat.title = shouldOpen ? 'Minimizar Nori' : 'Abrir Nori';
        document.documentElement.classList.toggle('nori-panel-open', shouldOpen && !isMobileNori());
      };
      const toggleNori = () => setNoriOpen(!noriChat.classList.contains('open'));

      noriFloat.style.touchAction = 'none';
      noriFloat.addEventListener('pointerdown', event => {
        if(!isMobileNori() || event.button !== 0) return;
        const rect = noriFloat.getBoundingClientRect();
        drag = {
          pointerId: event.pointerId,
          offsetX: event.clientX - rect.left,
          offsetY: event.clientY - rect.top,
          startX: event.clientX,
          startY: event.clientY,
          moved: false
        };
        noriFloat.setPointerCapture?.(event.pointerId);
      });
      noriFloat.addEventListener('pointermove', event => {
        if(!drag || event.pointerId !== drag.pointerId || !isMobileNori()) return;
        const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
        if(distance > 6) drag.moved = true;
        if(!drag.moved) return;
        event.preventDefault();
        const rect = noriFloat.getBoundingClientRect();
        const margin = 8;
        const left = clamp(event.clientX - drag.offsetX, margin, window.innerWidth - rect.width - margin);
        const top = clamp(event.clientY - drag.offsetY, margin, window.innerHeight - rect.height - margin);
        noriFloat.style.left = left + 'px';
        noriFloat.style.top = top + 'px';
        noriFloat.style.right = 'auto';
        noriFloat.style.bottom = 'auto';
        noriFloat.style.transform = 'none';
      });
      const finishNoriDrag = event => {
        if(!drag || event.pointerId !== drag.pointerId) return;
        suppressClick = drag.moved;
        drag = null;
        window.setTimeout(() => { suppressClick = false; }, 0);
      };
      noriFloat.addEventListener('pointerup', finishNoriDrag);
      noriFloat.addEventListener('pointercancel', finishNoriDrag);
      noriFloat.addEventListener('click', event => {
        if(suppressClick){
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if(isMobileNori()) resetNoriPosition();
        toggleNori();
      });

      if(noriClose){
        noriClose.addEventListener('click', () => setNoriOpen(false));
      }

      document.addEventListener('keydown', event => {
        if(event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'n'){
          event.preventDefault();
          toggleNori();
        }
        if(event.key === 'Escape' && noriChat.classList.contains('open')){
          setNoriOpen(false);
        }
      });

      window.addEventListener('resize', () => {
        if(!isMobileNori()) resetNoriPosition();
        document.documentElement.classList.toggle(
          'nori-panel-open',
          noriChat.classList.contains('open') && !isMobileNori()
        );
      });
    }
  }
  const NOTIFICACIONES_REFRESH_MS = 30000;
  let notificacionesTimer = null;
  let notificacionesActualizando = false;

  async function refrescarNotificacionesHeader(){
    if(document.hidden || notificacionesActualizando) return;
    if(!window.ManttoHome || typeof window.ManttoHome.refreshHeaderNotificationState !== 'function') return;

    notificacionesActualizando = true;
    try{
      await window.ManttoHome.refreshHeaderNotificationState();
    }finally{
      notificacionesActualizando = false;
    }
  }

  function detenerTimerNotificaciones(){
    if(notificacionesTimer !== null){
      window.clearInterval(notificacionesTimer);
      notificacionesTimer = null;
    }
  }

  function iniciarTimerNotificaciones(refrescarAhora){
    detenerTimerNotificaciones();
    if(document.hidden) return;

    if(refrescarAhora) refrescarNotificacionesHeader();
    notificacionesTimer = window.setInterval(refrescarNotificacionesHeader, NOTIFICACIONES_REFRESH_MS);
  }

  function bindNotificationRefreshVisibility(){
    if(window.__MANTTO_NOTIFICATIONS_VISIBILITY_BOUND__) return;
    window.__MANTTO_NOTIFICATIONS_VISIBILITY_BOUND__ = true;

    document.addEventListener('visibilitychange', function(){
      if(document.hidden){
        detenerTimerNotificaciones();
        return;
      }
      iniciarTimerNotificaciones(true);
    });
  }

  const HOME_HOY_VIEW_PERMISSION_CODE = 'GENERAL_INICIO_BARRA_BIENVENIDA_BOTON_HOY.VER';
  const HOME_HOY_OPEN_PERMISSION_CODE = 'GENERAL_INICIO_BARRA_BIENVENIDA_BOTON_HOY.ABRIR_RESUMEN_DEL_DIA';
  let homeHoyPermissionObserver = null;
  let homeHoyPermissionFrame = null;

  function homeTargetModule_gnral(node){
    if(!node || !node.dataset || !node.dataset.target) return '';
    try{
      const target = JSON.parse(node.dataset.target);
      return String(target && (target.module || target.route) || '').trim().toLowerCase();
    }catch(_error){
      return '';
    }
  }

  function homeHoyPermissionEffective_gnral(code){
    if(!window.ManttoPermissions || typeof window.ManttoPermissions.state !== 'function') return false;
    const permission = window.ManttoPermissions.state(code);
    return Boolean(permission && permission.exists && permission.efectivo === true);
  }

  function canViewHomeHoy_gnral(){
    return homeHoyPermissionEffective_gnral(HOME_HOY_VIEW_PERMISSION_CODE);
  }

  function canOpenHomeHoy_gnral(){
    return homeHoyPermissionEffective_gnral(HOME_HOY_OPEN_PERMISSION_CODE);
  }

  function applyHomeHoyPermission_gnral(){
    const root = document.getElementById('view-home');
    if(!root) return;
    const visible = canViewHomeHoy_gnral();
    const canOpen = visible && canOpenHomeHoy_gnral();
    root.querySelectorAll('[data-target]').forEach(node => {
      if(homeTargetModule_gnral(node) !== 'resumen') return;
      node.hidden = !visible;
      node.setAttribute('aria-disabled', canOpen ? 'false' : 'true');
      if(canOpen) node.removeAttribute('tabindex');
      else node.setAttribute('tabindex', '-1');
    });
  }

  function scheduleHomeHoyPermission_gnral(){
    if(homeHoyPermissionFrame !== null) return;
    homeHoyPermissionFrame = window.requestAnimationFrame(() => {
      homeHoyPermissionFrame = null;
      applyHomeHoyPermission_gnral();
    });
  }

  function bindHomeHoyPermission_gnral(){
    if(window.__MANTTO_HOME_HOY_PERMISSION_BOUND__) return;
    window.__MANTTO_HOME_HOY_PERMISSION_BOUND__ = true;

    document.addEventListener('mantto:permissions-updated', scheduleHomeHoyPermission_gnral);
    document.addEventListener('mantto:navigation', scheduleHomeHoyPermission_gnral);

    document.addEventListener('click', event => {
      const target = event.target instanceof Element
        ? event.target.closest('#view-home [data-target]')
        : null;
      if(!target || homeTargetModule_gnral(target) !== 'resumen') return;
      if(canViewHomeHoy_gnral() && canOpenHomeHoy_gnral()) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      if(!canViewHomeHoy_gnral()) return;
      alert('Puedes ver el botón Hoy, pero no tienes permiso para abrir Resumen del Día.');
    }, true);

    const observedRoot = document.getElementById('view-home') || document.body;
    if(observedRoot && typeof MutationObserver === 'function'){
      homeHoyPermissionObserver = new MutationObserver(scheduleHomeHoyPermission_gnral);
      homeHoyPermissionObserver.observe(observedRoot, { childList:true, subtree:true });
    }

    scheduleHomeHoyPermission_gnral();
  }

  function initAfterAuth(){
    if(window.__MANTTO_APP_READY__) return;
    window.__MANTTO_APP_READY__ = true;
    if(window.ManttoHome) window.ManttoHome.init();
    bindHomeHoyPermission_gnral();
    ensureInteractionsModule_gnral()
      .then(module => {
        if(module && typeof module.init === 'function') module.init();
      })
      .catch(error => {
        console.warn('No fue posible inicializar el módulo general de interacciones H1.', error);
      });
    bindNotificationRefreshVisibility();
    iniciarTimerNotificaciones(false);
    if(window.ManttoSupport) window.ManttoSupport.init();
    initDailyPhrase();
    if(window.ManttoBuildInfo && typeof window.ManttoBuildInfo.initProgrammerBanner === 'function') window.ManttoBuildInfo.initProgrammerBanner();
    bindGlobalNavigation();
  }

  document.addEventListener('DOMContentLoaded',()=>{
    if(window.ManttoAuth) window.ManttoAuth.init();
    else initAfterAuth();
  });

  document.addEventListener('mantto:auth-ready',()=>{
    initAfterAuth();
  });
})();

(function(){

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
        resetNoriPosition();
        noriChat.classList.toggle('open');
      });
      window.addEventListener('resize', () => {
        if(!isMobileNori()) resetNoriPosition();
      });
    }
    if(noriClose && noriChat){
      noriClose.addEventListener('click',()=>noriChat.classList.remove('open'));
    }
  }
  function initAfterAuth(){
    if(window.__MANTTO_APP_READY__) return;
    window.__MANTTO_APP_READY__ = true;
    if(window.ManttoHome) window.ManttoHome.init();
    window.setInterval(()=>{ if(window.ManttoHome && window.ManttoHome.refreshHeaderNotifications) window.ManttoHome.refreshHeaderNotifications(); }, 60000);
    if(window.ManttoSupport) window.ManttoSupport.init();
    initDailyPhrase();
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

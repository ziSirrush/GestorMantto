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

  function bindGlobalNavigation(){
    document.querySelectorAll('[data-route]').forEach(el=>{
      if(el.id === 'app-back-btn') return;
      el.addEventListener('click', e=>{
        const route = el.dataset.route;
        if(route) window.ManttoRouter.go(route);
        if(route && el.classList && el.classList.contains('side-item')){
          const sb = document.getElementById('sidebar');
          if(sb){
            if(window.innerWidth <= 920) sb.classList.remove('open');
            else sb.classList.add('collapsed');
          }
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
      else sb.classList.toggle('collapsed');
    });

    const noriFloat = document.getElementById('noriFloat');
    const noriClose = document.getElementById('noriClose');
    const noriChat = document.getElementById('pandaChat');
    if(noriFloat && noriChat){
      noriFloat.addEventListener('click',()=>noriChat.classList.toggle('open'));
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

(function(){
  const API_BASE = (window.MANTTO_API_BASE || 'http://localhost:3001').replace(/\/$/, '');
  const SW_PATH = './service-worker.js';
  let registration = null;
  let config = null;
  let initialized = false;
  let busy = false;

  function authHeaders(){
    return Object.assign({ 'Accept':'application/json', 'Content-Type':'application/json' },
      window.ManttoAuth && window.ManttoAuth.authHeaders ? window.ManttoAuth.authHeaders() : {});
  }

  async function request(path, options){
    const response = await fetch(API_BASE + path, Object.assign({}, options || {}, {
      headers: Object.assign({}, authHeaders(), options && options.headers || {})
    }));
    const json = await response.json().catch(() => ({ ok:false, message:'Respuesta no JSON' }));
    if(!response.ok || json.ok === false) throw new Error(json.message || ('HTTP ' + response.status));
    return json.data || json;
  }

  function urlBase64ToUint8Array(value){
    const padding = '='.repeat((4 - value.length % 4) % 4);
    const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = window.atob(base64);
    return Uint8Array.from([...raw].map(char => char.charCodeAt(0)));
  }

  function supported(){
    return window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  }

  function deviceName(){
    const platform = navigator.userAgentData && navigator.userAgentData.platform || navigator.platform || '';
    return String(platform || 'Navegador').slice(0, 150);
  }

  function toast(message, error){
    let element = document.getElementById('mantto-push-toast');
    if(!element){
      element = document.createElement('div');
      element.id = 'mantto-push-toast';
      element.setAttribute('aria-live', 'polite');
      Object.assign(element.style, {
        position:'fixed', right:'18px', bottom:'18px', zIndex:'5000', maxWidth:'360px',
        padding:'11px 14px', borderRadius:'11px', color:'#fff', fontSize:'12px',
        fontWeight:'800', boxShadow:'0 12px 28px rgba(13,46,110,.25)', opacity:'0',
        transform:'translateY(10px)', transition:'.2s', pointerEvents:'none'
      });
      document.body.appendChild(element);
    }
    element.textContent = message;
    element.style.background = error ? '#a82e38' : '#173567';
    element.style.opacity = '1';
    element.style.transform = 'none';
    window.clearTimeout(toast.timer);
    toast.timer = window.setTimeout(() => {
      element.style.opacity = '0';
      element.style.transform = 'translateY(10px)';
    }, 3200);
  }

  function ensureButton(){
    let button = document.getElementById('hdr-push-btn');
    if(button) return button;
    const notificationButton = document.getElementById('hdr-notif-btn');
    if(!notificationButton || !notificationButton.parentElement) return null;
    button = document.createElement('button');
    button.type = 'button';
    button.id = 'hdr-push-btn';
    button.className = 'hdr-icon-btn';
    button.setAttribute('aria-label', 'Activar notificaciones push');
    button.title = 'Activar notificaciones push';
    button.textContent = '📳';
    notificationButton.insertAdjacentElement('afterend', button);
    button.addEventListener('click', togglePush);
    return button;
  }

  function setButtonState(state){
    const button = ensureButton();
    if(!button) return;
    const states = {
      active: ['🔔', 'Notificaciones push activas'],
      off: ['📳', 'Activar notificaciones push'],
      denied: ['🔕', 'Notificaciones bloqueadas en el navegador'],
      unavailable: ['—', 'Notificaciones push no disponibles'],
      busy: ['…', 'Actualizando notificaciones push']
    };
    const value = states[state] || states.off;
    button.textContent = value[0];
    button.title = value[1];
    button.setAttribute('aria-label', value[1]);
    button.disabled = state === 'busy' || state === 'unavailable';
    button.dataset.pushState = state;
  }

  async function getSubscription(){
    if(!registration) return null;
    return registration.pushManager.getSubscription();
  }

  async function syncSubscription(subscription){
    await request('/api/push/subscriptions', {
      method:'POST',
      body: JSON.stringify({ subscription: subscription.toJSON(), device_name: deviceName() })
    });
  }

  async function enablePush(){
    if(busy) return;
    busy = true;
    setButtonState('busy');
    try{
      const permission = await Notification.requestPermission();
      if(permission !== 'granted'){
        setButtonState(permission === 'denied' ? 'denied' : 'off');
        toast('No se activaron las notificaciones push.', true);
        return;
      }
      let subscription = await getSubscription();
      if(!subscription){
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly:true,
          applicationServerKey:urlBase64ToUint8Array(config.public_key)
        });
      }
      await syncSubscription(subscription);
      setButtonState('active');
      toast('Notificaciones push activadas.');
    }catch(error){
      setButtonState('off');
      toast(error.message || 'No fue posible activar las notificaciones push.', true);
    }finally{
      busy = false;
    }
  }

  async function disablePush(){
    if(busy) return;
    busy = true;
    setButtonState('busy');
    try{
      const subscription = await getSubscription();
      if(subscription){
        await request('/api/push/subscriptions', {
          method:'DELETE',
          body: JSON.stringify({ endpoint: subscription.endpoint })
        }).catch(() => null);
        await subscription.unsubscribe();
      }
      setButtonState('off');
      toast('Notificaciones push desactivadas en este dispositivo.');
    }catch(error){
      setButtonState('active');
      toast(error.message || 'No fue posible desactivar las notificaciones push.', true);
    }finally{
      busy = false;
    }
  }

  async function togglePush(){
    const subscription = await getSubscription().catch(() => null);
    if(subscription) await disablePush();
    else await enablePush();
  }

  function openNotifications(){
    if(window.ManttoRouter && window.ManttoRouter.go) window.ManttoRouter.go('notifications');
  }

  async function init(){
    if(initialized) return;
    initialized = true;
    const button = ensureButton();
    if(!supported()){
      if(button) setButtonState('unavailable');
      return;
    }
    try{
      config = await request('/api/push/config', { method:'GET' });
      if(!config.enabled || !config.public_key){
        setButtonState('unavailable');
        return;
      }
      registration = await navigator.serviceWorker.register(SW_PATH, { scope:'./' });
      const subscription = await getSubscription();
      if(subscription && Notification.permission === 'granted'){
        await syncSubscription(subscription);
        setButtonState('active');
      }else if(Notification.permission === 'denied') setButtonState('denied');
      else setButtonState('off');
    }catch(error){
      console.warn('[Push] No fue posible inicializar notificaciones push:', error);
      setButtonState('unavailable');
    }
  }

  navigator.serviceWorker && navigator.serviceWorker.addEventListener('message', event => {
    if(event.data && event.data.type === 'MANTTO_OPEN_NOTIFICATIONS') openNotifications();
  });

  document.addEventListener('mantto:auth-ready', init);
  document.addEventListener('mantto:view-user-changed', () => {
    const actor = window.ManttoAuth && window.ManttoAuth.getActorUser && window.ManttoAuth.getActorUser();
    if(actor) init();
  });
  document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    if(params.get('push_open') === 'notifications'){
      window.setTimeout(openNotifications, 800);
      params.delete('push_open');
      const clean = window.location.pathname + (params.toString() ? '?' + params.toString() : '') + window.location.hash;
      window.history.replaceState({}, document.title, clean);
    }
  });

  window.ManttoPushNotifications = { init, enable:enablePush, disable:disablePush };
})();

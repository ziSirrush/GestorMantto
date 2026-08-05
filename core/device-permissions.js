(function(){
  const DEVICE_TOKEN_KEY = 'mantto_device_token';
  const REQUIRED = ['gps', 'camara', 'microfono', 'push'];
  const REMINDER_KEY_PREFIX = 'mantto_device_permissions_reminder_at_';
  const LOCAL_STATE_KEY_PREFIX = 'mantto_native_permissions_state_';
  const REMINDER_INTERVAL_MS = 24 * 60 * 60 * 1000;
  let activePromise = null;
  let forceNextOpen = false;

  function randomToken(){
    const bytes = new Uint8Array(32);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  }

  function getDeviceToken(){
    let token = localStorage.getItem(DEVICE_TOKEN_KEY) || '';
    if(!/^[a-f0-9]{64}$/i.test(token)){
      token = randomToken();
      localStorage.setItem(DEVICE_TOKEN_KEY, token);
    }
    return token.toLowerCase();
  }

  function reminderKey(){ return `${REMINDER_KEY_PREFIX}${getDeviceToken()}`; }
  function reminderDue(){
    const value = Number(localStorage.getItem(reminderKey()) || 0);
    return !Number.isFinite(value) || value <= 0 || (Date.now() - value) >= REMINDER_INTERVAL_MS;
  }
  function rememberPrompt(){ localStorage.setItem(reminderKey(), String(Date.now())); }

  function localStateKey(){ return `${LOCAL_STATE_KEY_PREFIX}${getDeviceToken()}`; }
  function readLocalStates(){
    try{
      const value = JSON.parse(localStorage.getItem(localStateKey()) || '{}');
      return value && typeof value === 'object' ? value : {};
    }catch(error){ return {}; }
  }
  function saveLocalState(key, state){
    if(!REQUIRED.includes(key) || !['PERMITIDO','DENEGADO'].includes(state)) return;
    const current = readLocalStates();
    current[key] = state;
    current.updated_at = new Date().toISOString();
    localStorage.setItem(localStateKey(), JSON.stringify(current));
  }
  function mergeWithLocal(key, nativeState){
    if(['PERMITIDO','DENEGADO'].includes(nativeState)){
      saveLocalState(key, nativeState);
      return nativeState;
    }
    if(nativeState === 'NO_DISPONIBLE') return nativeState;
    const localState = readLocalStates()[key];
    return ['PERMITIDO','DENEGADO'].includes(localState) ? localState : nativeState;
  }

  function isIos(){ return /iPad|iPhone|iPod/.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function isStandalone(){
    return window.matchMedia && window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }
  function notificationApi(){ return typeof window !== 'undefined' && 'Notification' in window ? window.Notification : null; }

  async function queryPermission(name){
    if(!navigator.permissions || !navigator.permissions.query) return 'unknown';
    try{
      const result = await navigator.permissions.query({ name });
      return result && result.state || 'unknown';
    }catch(error){ return 'unknown'; }
  }

  function mapState(value){
    if(value === 'granted') return 'PERMITIDO';
    if(value === 'denied') return 'DENEGADO';
    return 'PENDIENTE';
  }

  async function inspectGps(){
    if(!navigator.geolocation) return 'NO_DISPONIBLE';
    return mapState(await queryPermission('geolocation'));
  }

  async function inspectMedia(name){
    if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return 'NO_DISPONIBLE';
    return mapState(await queryPermission(name));
  }

  function pushAvailability(){
    if(!window.isSecureContext) return { available:false, reason:'Las notificaciones requieren HTTPS.' };
    if(isIos() && !isStandalone()) return { available:false, reason:'En iPhone/iPad, abre Mantto Gestor desde la PWA instalada en la pantalla de inicio.' };
    if(!notificationApi() || !('serviceWorker' in navigator) || !('PushManager' in window)){
      return { available:false, reason:'Este navegador no ofrece Web Push en este modo.' };
    }
    return { available:true, reason:'' };
  }

  async function inspectPush(){
    const availability = pushAvailability();
    if(!availability.available) return 'NO_DISPONIBLE';
    const notifications = notificationApi();
    if(notifications.permission === 'granted'){
      try{
        const registration = await navigator.serviceWorker.getRegistration('./');
        const subscription = registration && await registration.pushManager.getSubscription();
        return subscription ? 'PERMITIDO' : 'PENDIENTE';
      }catch(error){ return 'PENDIENTE'; }
    }
    return mapState(notifications.permission);
  }

  async function inspectAll(){
    const [gpsNative, camaraNative, microfonoNative, pushNative] = await Promise.all([
      inspectGps(), inspectMedia('camera'), inspectMedia('microphone'), inspectPush()
    ]);
    return {
      gps:mergeWithLocal('gps', gpsNative),
      camara:mergeWithLocal('camara', camaraNative),
      microfono:mergeWithLocal('microfono', microfonoNative),
      push:mergeWithLocal('push', pushNative)
    };
  }

  function requestGps(){
    return new Promise(resolve => {
      if(!navigator.geolocation) return resolve('NO_DISPONIBLE');
      navigator.geolocation.getCurrentPosition(
        () => resolve('PERMITIDO'),
        error => resolve(error && error.code === 1 ? 'DENEGADO' : 'PENDIENTE'),
        { enableHighAccuracy:true, timeout:15000, maximumAge:0 }
      );
    });
  }

  async function requestMedia(kind){
    if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return 'NO_DISPONIBLE';
    try{
      const stream = await navigator.mediaDevices.getUserMedia(kind === 'video' ? { video:true } : { audio:true });
      stream.getTracks().forEach(track => track.stop());
      return 'PERMITIDO';
    }catch(error){
      if(error && ['NotAllowedError','SecurityError'].includes(error.name)) return 'DENEGADO';
      if(error && ['NotFoundError','OverconstrainedError'].includes(error.name)) return 'NO_DISPONIBLE';
      return 'PENDIENTE';
    }
  }

  async function requestPush(){
    const availability = pushAvailability();
    if(!availability.available) return { state:'NO_DISPONIBLE', detail:availability.reason };
    const notifications = notificationApi();
    try{
      let permission = notifications.permission;
      if(permission === 'default') permission = await notifications.requestPermission();
      if(permission === 'denied') return { state:'DENEGADO', detail:'Las notificaciones están bloqueadas en el navegador.' };
      if(permission !== 'granted') return { state:'PENDIENTE', detail:'El permiso de notificaciones continúa pendiente.' };
      if(!window.ManttoPushNotifications || typeof window.ManttoPushNotifications.ensureEnabled !== 'function'){
        return { state:'PENDIENTE', detail:'Permiso concedido; falta registrar este dispositivo para Push.' };
      }
      const result = await window.ManttoPushNotifications.ensureEnabled({
        silent:true,
        deviceToken:getDeviceToken(),
        permissionAlreadyGranted:true
      });
      return result && result.active
        ? { state:'PERMITIDO', detail:'Notificaciones Push activadas.' }
        : { state:'PENDIENTE', detail:'Permiso concedido; no se completó el registro Push.' };
    }catch(error){
      const current = notificationApi();
      return {
        state: current && current.permission === 'denied' ? 'DENEGADO' : 'PENDIENTE',
        detail: error && error.message ? error.message : 'No fue posible registrar Push en este dispositivo.'
      };
    }
  }

  function ensureModal(){
    let modal = document.getElementById('device-permissions-gate');
    if(modal) return modal;
    modal = document.createElement('section');
    modal.id = 'device-permissions-gate';
    modal.className = 'device-permissions-gate';
    modal.hidden = true;
    modal.innerHTML = `
      <div class="device-permissions-card" role="dialog" aria-modal="true" aria-labelledby="device-permissions-title">
        <div class="device-permissions-eyebrow">Configuración del dispositivo</div>
        <h2 id="device-permissions-title">Permisos del dispositivo</h2>
        <p>Activa cada permiso de forma independiente. Puedes continuar aunque alguno quede pendiente; el sistema volverá a recordártelo después.</p>
        <div class="device-permissions-list" id="device-permissions-list"></div>
        <div class="device-permissions-message" id="device-permissions-message" aria-live="polite"></div>
        <div class="device-permissions-actions">
          <button type="button" class="device-permissions-primary" id="device-permissions-continue">Continuar</button>
          <button type="button" class="device-permissions-secondary" id="device-permissions-retry">Volver a validar</button>
          <button type="button" class="device-permissions-link" id="device-permissions-logout">Cerrar sesión</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    return modal;
  }

  const labels = {
    gps:['📍','Ubicación (GPS)'], camara:['📷','Cámara'], microfono:['🎙️','Micrófono'], push:['🔔','Notificaciones push']
  };
  function stateText(state){ return ({PERMITIDO:'Permitido',DENEGADO:'Bloqueado',NO_DISPONIBLE:'No disponible',PENDIENTE:'Pendiente',VALIDANDO:'Validando...'})[state] || 'Pendiente'; }
  function actionText(state){
    if(state === 'PERMITIDO') return 'Activo';
    if(state === 'VALIDANDO') return 'Validando...';
    if(state === 'DENEGADO') return 'Reintentar';
    if(state === 'NO_DISPONIBLE') return 'Información';
    return 'Activar';
  }
  function pushNote(){
    const availability = pushAvailability();
    return availability.available ? '' : availability.reason;
  }

  function render(permisos, pendingKeys){
    const list = document.getElementById('device-permissions-list');
    if(!list) return;
    const pending = pendingKeys || new Set();
    list.innerHTML = REQUIRED.map(key => {
      const state = pending.has(key) ? 'VALIDANDO' : (permisos[key] || 'PENDIENTE');
      const disabled = state === 'PERMITIDO' || state === 'VALIDANDO';
      const note = key === 'push' && state === 'NO_DISPONIBLE' ? pushNote() : '';
      return `<div class="device-permission-row" data-state="${state}" data-permission="${key}">
        <span class="device-permission-icon">${labels[key][0]}</span>
        <span class="device-permission-label">${labels[key][1]}${note ? `<small>${note}</small>` : ''}</span>
        <strong>${stateText(state)}</strong>
        <button type="button" class="device-permission-action" data-permission-action="${key}" ${disabled ? 'disabled' : ''}>${actionText(state)}</button>
      </div>`;
    }).join('');
    const continueButton = document.getElementById('device-permissions-continue');
    if(continueButton) continueButton.disabled = false;
  }

  function allAllowed(permisos){ return REQUIRED.every(key => permisos[key] === 'PERMITIDO'); }
  function setGlobalBusy(value){
    ['device-permissions-retry','device-permissions-logout'].forEach(id => {
      const button = document.getElementById(id); if(button) button.disabled = Boolean(value);
    });
  }
  function message(text, error){
    const element = document.getElementById('device-permissions-message');
    if(!element) return;
    element.textContent = text || '';
    element.classList.toggle('is-error', Boolean(error));
  }

  async function requestOne(key){
    if(key === 'gps') return { state:await requestGps(), detail:'' };
    if(key === 'camara') return { state:await requestMedia('video'), detail:'' };
    if(key === 'microfono') return { state:await requestMedia('audio'), detail:'' };
    if(key === 'push') return requestPush();
    return { state:'NO_DISPONIBLE', detail:'' };
  }

  async function openGate(options){
    const opts = options || {};
    if(activePromise) return activePromise;
    activePromise = new Promise(async resolve => {
      const modal = ensureModal();
      let permisos = await inspectAll();
      if(allAllowed(permisos) && !opts.force){ modal.hidden = true; activePromise = null; resolve(true); return; }
      if(!opts.force && !forceNextOpen && !reminderDue()){ modal.hidden = true; activePromise = null; resolve(true); return; }
      forceNextOpen = false;
      modal.hidden = false;
      const pendingKeys = new Set();
      render(permisos, pendingKeys);
      message(allAllowed(permisos) ? 'Todos los permisos están activos.' : 'Activa los permisos que necesites o continúa para hacerlo después.');

      document.getElementById('device-permissions-list').onclick = async event => {
        const button = event.target.closest('[data-permission-action]');
        if(!button) return;
        const key = button.dataset.permissionAction;
        if(!REQUIRED.includes(key) || pendingKeys.has(key) || permisos[key] === 'PERMITIDO') return;
        if(key === 'push' && permisos[key] === 'NO_DISPONIBLE'){
          message(pushNote() || 'Push no está disponible en este navegador.', false);
          return;
        }
        pendingKeys.add(key); render(permisos, pendingKeys); message(`Validando ${labels[key][1]}...`);
        try{
          const result = await requestOne(key);
          permisos[key] = result.state;
          saveLocalState(key, result.state);
          if(result.state === 'PERMITIDO'){
            message(`${labels[key][1]} quedó autorizado en este dispositivo.`, false);
          }else if(result.state === 'DENEGADO'){
            message(result.detail || `${labels[key][1]} está bloqueado. Revisa los permisos del navegador o del sistema.`, true);
          }else if(result.state === 'NO_DISPONIBLE'){
            message(result.detail || `${labels[key][1]} no está disponible en este dispositivo o navegador.`, false);
          }else{
            message(result.detail || `${labels[key][1]} continúa pendiente. Puedes activar los demás permisos.`, false);
          }
        }catch(error){ message(error.message || `No fue posible validar ${labels[key][1]}.`, true); }
        finally{ pendingKeys.delete(key); render(permisos, pendingKeys); }
      };

      document.getElementById('device-permissions-continue').onclick = async () => {
        setGlobalBusy(true);
        permisos = await inspectAll().catch(() => permisos);
        render(permisos, pendingKeys);
        rememberPrompt(); modal.hidden = true; message(''); activePromise = null; resolve(true); setGlobalBusy(false);
      };

      document.getElementById('device-permissions-retry').onclick = async () => {
        setGlobalBusy(true); message('Revisando el estado actual de los permisos...');
        permisos = await inspectAll();
        render(permisos, pendingKeys);
        message('Estados revisados directamente en este dispositivo.', false);
        setGlobalBusy(false);
      };

      document.getElementById('device-permissions-logout').onclick = () => {
        modal.hidden = true; activePromise = null; resolve(false);
        window.ManttoAuth && window.ManttoAuth.logout && window.ManttoAuth.logout();
      };
    });
    return activePromise;
  }

  function requireForSession(){ return openGate({ force:false, source:'session' }); }
  function revalidateFromProfile(){
    forceNextOpen = true;
    return openGate({ force:true, source:'profile' });
  }

  window.ManttoDevicePermissions = {
    getDeviceToken, inspectAll, requireForSession, revalidateFromProfile, reminderDue,
    reminderIntervalMs:REMINDER_INTERVAL_MS,
    isStandalone,
    pushAvailability
  };
})();

(function(){
  const DEVICE_TOKEN_KEY = 'mantto_device_token';
  const REQUIRED = ['gps', 'camara', 'microfono', 'push'];
  const REMINDER_KEY_PREFIX = 'mantto_device_permissions_reminder_at_';
  const REMINDER_INTERVAL_MS = 24 * 60 * 60 * 1000;
  let activePromise = null;

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

  function reminderKey(){
    return `${REMINDER_KEY_PREFIX}${getDeviceToken()}`;
  }

  function reminderDue(){
    const value = Number(localStorage.getItem(reminderKey()) || 0);
    return !Number.isFinite(value) || value <= 0 || (Date.now() - value) >= REMINDER_INTERVAL_MS;
  }

  function rememberPrompt(){
    localStorage.setItem(reminderKey(), String(Date.now()));
  }

  function deviceName(){
    const platform = navigator.userAgentData && navigator.userAgentData.platform || navigator.platform || 'Navegador';
    return String(platform).slice(0, 150);
  }

  async function queryPermission(name){
    if(!navigator.permissions || !navigator.permissions.query) return 'unknown';
    try{
      const result = await navigator.permissions.query({ name });
      return result && result.state || 'unknown';
    }catch(error){
      return 'unknown';
    }
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

  async function inspectMedia(name, kind){
    if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return 'NO_DISPONIBLE';
    return mapState(await queryPermission(name || kind));
  }

  async function inspectPush(){
    if(!window.isSecureContext || !('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)){
      return 'NO_DISPONIBLE';
    }
    if(Notification.permission === 'granted'){
      try{
        const registration = await navigator.serviceWorker.getRegistration('./');
        const subscription = registration && await registration.pushManager.getSubscription();
        return subscription ? 'PERMITIDO' : 'PENDIENTE';
      }catch(error){
        return 'PENDIENTE';
      }
    }
    return mapState(Notification.permission);
  }

  async function inspectAll(){
    const [gps, camara, microfono, push] = await Promise.all([
      inspectGps(),
      inspectMedia('camera', 'video'),
      inspectMedia('microphone', 'audio'),
      inspectPush()
    ]);
    return { gps, camara, microfono, push };
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
    if(!window.ManttoPushNotifications || !window.ManttoPushNotifications.ensureEnabled) return 'NO_DISPONIBLE';
    try{
      const result = await window.ManttoPushNotifications.ensureEnabled({
        silent:true,
        deviceToken:getDeviceToken()
      });
      return result && result.active ? 'PERMITIDO' : (result && result.permission === 'denied' ? 'DENEGADO' : 'PENDIENTE');
    }catch(error){
      return Notification.permission === 'denied' ? 'DENEGADO' : 'PENDIENTE';
    }
  }

  async function sync(permisos){
    const response = await window.ManttoAuth.apiPost('/api/device-permissions/sync', {
      device_token:getDeviceToken(),
      device_name:deviceName(),
      permisos
    });
    return response.data || response;
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
        <h2 id="device-permissions-title">Permisos obligatorios</h2>
        <p>Activa cada permiso de forma independiente. Puedes continuar ahora aunque alguno quede pendiente; el sistema volverá a recordártelo después.</p>
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
    gps:['📍','Ubicación (GPS)'],
    camara:['📷','Cámara'],
    microfono:['🎙️','Micrófono'],
    push:['🔔','Notificaciones push']
  };

  function stateText(state){
    return {
      PERMITIDO:'Permitido',
      DENEGADO:'Bloqueado',
      NO_DISPONIBLE:'No disponible',
      PENDIENTE:'Pendiente',
      VALIDANDO:'Validando...'
    }[state] || 'Pendiente';
  }

  function actionText(state){
    if(state === 'PERMITIDO') return 'Activo';
    if(state === 'VALIDANDO') return 'Validando...';
    if(state === 'DENEGADO') return 'Reintentar';
    if(state === 'NO_DISPONIBLE') return 'Revisar';
    return 'Activar';
  }

  function render(permisos, pendingKeys){
    const list = document.getElementById('device-permissions-list');
    if(!list) return;
    const pending = pendingKeys || new Set();
    list.innerHTML = REQUIRED.map(key => {
      const state = pending.has(key) ? 'VALIDANDO' : (permisos[key] || 'PENDIENTE');
      const disabled = state === 'PERMITIDO' || state === 'VALIDANDO';
      return `<div class="device-permission-row" data-state="${state}" data-permission="${key}">
        <span class="device-permission-icon">${labels[key][0]}</span>
        <span class="device-permission-label">${labels[key][1]}</span>
        <strong>${stateText(state)}</strong>
        <button type="button" class="device-permission-action" data-permission-action="${key}" ${disabled ? 'disabled' : ''}>${actionText(state)}</button>
      </div>`;
    }).join('');

    const continueButton = document.getElementById('device-permissions-continue');
    if(continueButton) continueButton.disabled = false;
  }

  function allAllowed(permisos){
    return REQUIRED.every(key => permisos[key] === 'PERMITIDO');
  }

  function setGlobalBusy(value){
    ['device-permissions-retry','device-permissions-logout'].forEach(id => {
      const button = document.getElementById(id);
      if(button) button.disabled = Boolean(value);
    });
  }

  function message(text, error){
    const element = document.getElementById('device-permissions-message');
    if(!element) return;
    element.textContent = text || '';
    element.classList.toggle('is-error', Boolean(error));
  }

  async function requestOne(key){
    if(key === 'gps') return requestGps();
    if(key === 'camara') return requestMedia('video');
    if(key === 'microfono') return requestMedia('audio');
    if(key === 'push') return requestPush();
    return 'NO_DISPONIBLE';
  }

  async function requireForSession(){
    if(activePromise) return activePromise;
    activePromise = new Promise(async resolve => {
      const modal = ensureModal();
      let permisos = await inspectAll();
      await sync(permisos).catch(() => null);

      if(allAllowed(permisos)){
        modal.hidden = true;
        activePromise = null;
        resolve(true);
        return;
      }

      if(!reminderDue()){
        modal.hidden = true;
        activePromise = null;
        resolve(true);
        return;
      }

      modal.hidden = false;
      const pendingKeys = new Set();
      render(permisos, pendingKeys);

      const refreshMessage = () => {
        if(allAllowed(permisos)){
          message('Todos los permisos están activos. Ya puedes continuar.');
        }else{
          message('Puedes activar los permisos pendientes de forma individual o continuar y hacerlo después.');
        }
      };

      const finishIfAllowed = async () => {
        permisos = await inspectAll();
        render(permisos, pendingKeys);
        const result = await sync(permisos);
        if(allAllowed(permisos) && result.acceso_general !== false){
          modal.hidden = true;
          message('');
          activePromise = null;
          resolve(true);
          return true;
        }
        refreshMessage();
        return false;
      };

      document.getElementById('device-permissions-list').onclick = async event => {
        const button = event.target.closest('[data-permission-action]');
        if(!button) return;
        const key = button.dataset.permissionAction;
        if(!REQUIRED.includes(key) || pendingKeys.has(key) || permisos[key] === 'PERMITIDO') return;

        pendingKeys.add(key);
        render(permisos, pendingKeys);
        message(`Validando ${labels[key][1]}...`);

        try{
          permisos[key] = await requestOne(key);
          await sync(permisos);
          if(permisos[key] === 'PERMITIDO'){
            message(`${labels[key][1]} quedó autorizado.`);
          }else if(permisos[key] === 'DENEGADO'){
            message(`${labels[key][1]} está bloqueado. Revisa los permisos del navegador o del sistema.`, true);
          }else if(permisos[key] === 'NO_DISPONIBLE'){
            message(`${labels[key][1]} no está disponible en este dispositivo o navegador.`, true);
          }else{
            message(`${labels[key][1]} continúa pendiente. Puedes activar los demás permisos.`, true);
          }
        }catch(error){
          message(error.message || `No fue posible validar ${labels[key][1]}.`, true);
        }finally{
          pendingKeys.delete(key);
          render(permisos, pendingKeys);
          if(allAllowed(permisos)) refreshMessage();
        }
      };

      document.getElementById('device-permissions-continue').onclick = async () => {
        setGlobalBusy(true);
        try{
          permisos = await inspectAll();
          render(permisos, pendingKeys);
          await sync(permisos).catch(() => null);
          rememberPrompt();
          modal.hidden = true;
          message('');
          activePromise = null;
          resolve(true);
        }catch(error){
          message(error.message || 'No fue posible guardar el estado de los permisos.', true);
        }finally{
          setGlobalBusy(false);
        }
      };

      document.getElementById('device-permissions-retry').onclick = async () => {
        setGlobalBusy(true);
        message('Revisando el estado actual de los permisos...');
        try{
          permisos = await inspectAll();
          await sync(permisos);
          render(permisos, pendingKeys);
          refreshMessage();
        }catch(error){
          message(error.message || 'No fue posible validar los permisos.', true);
        }finally{
          setGlobalBusy(false);
        }
      };

      document.getElementById('device-permissions-logout').onclick = () => {
        modal.hidden = true;
        activePromise = null;
        resolve(false);
        window.ManttoAuth && window.ManttoAuth.logout && window.ManttoAuth.logout();
      };

      if(allAllowed(permisos)) refreshMessage();
      else refreshMessage();
    });
    return activePromise;
  }

  window.ManttoDevicePermissions = {
    getDeviceToken,
    inspectAll,
    requireForSession,
    reminderDue,
    reminderIntervalMs: REMINDER_INTERVAL_MS
  };
})();

(function(){
  const DEVICE_TOKEN_KEY = 'mantto_device_token';
  const REQUIRED = ['gps', 'camara', 'microfono', 'push'];
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
        <p>Para usar Mantto Gestor en este dispositivo debes autorizar ubicación, cámara, micrófono y notificaciones.</p>
        <div class="device-permissions-list" id="device-permissions-list"></div>
        <div class="device-permissions-message" id="device-permissions-message" aria-live="polite"></div>
        <div class="device-permissions-actions">
          <button type="button" class="device-permissions-primary" id="device-permissions-authorize">Autorizar y continuar</button>
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
      PENDIENTE:'Pendiente'
    }[state] || 'Pendiente';
  }

  function render(permisos){
    const list = document.getElementById('device-permissions-list');
    if(!list) return;
    list.innerHTML = REQUIRED.map(key => {
      const state = permisos[key] || 'PENDIENTE';
      return `<div class="device-permission-row" data-state="${state}">
        <span class="device-permission-icon">${labels[key][0]}</span>
        <span class="device-permission-label">${labels[key][1]}</span>
        <strong>${stateText(state)}</strong>
      </div>`;
    }).join('');
  }

  function allAllowed(permisos){
    return REQUIRED.every(key => permisos[key] === 'PERMITIDO');
  }

  function setBusy(value){
    ['device-permissions-authorize','device-permissions-retry','device-permissions-logout'].forEach(id => {
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

  async function requireForSession(){
    if(activePromise) return activePromise;
    activePromise = new Promise(async resolve => {
      const modal = ensureModal();
      modal.hidden = false;
      let permisos = await inspectAll();
      render(permisos);
      await sync(permisos).catch(() => null);

      const finishIfAllowed = async () => {
        permisos = await inspectAll();
        render(permisos);
        const result = await sync(permisos);
        if(allAllowed(permisos) && result.acceso_general !== false){
          modal.hidden = true;
          message('');
          activePromise = null;
          resolve(true);
          return true;
        }
        message('Debes habilitar los cuatro permisos para ingresar en este dispositivo.', true);
        return false;
      };

      document.getElementById('device-permissions-authorize').onclick = async () => {
        setBusy(true);
        message('Solicitando permisos del dispositivo...');
        try{
          permisos.gps = await requestGps(); render(permisos); await sync(permisos);
          permisos.camara = await requestMedia('video'); render(permisos); await sync(permisos);
          permisos.microfono = await requestMedia('audio'); render(permisos); await sync(permisos);
          permisos.push = await requestPush(); render(permisos); await sync(permisos);
          await finishIfAllowed();
        }catch(error){
          message(error.message || 'No fue posible validar los permisos.', true);
        }finally{
          setBusy(false);
        }
      };

      document.getElementById('device-permissions-retry').onclick = async () => {
        setBusy(true);
        message('Validando permisos actuales...');
        try{ await finishIfAllowed(); }
        catch(error){ message(error.message || 'No fue posible validar los permisos.', true); }
        finally{ setBusy(false); }
      };

      document.getElementById('device-permissions-logout').onclick = () => {
        modal.hidden = true;
        activePromise = null;
        resolve(false);
        window.ManttoAuth && window.ManttoAuth.logout && window.ManttoAuth.logout();
      };

      if(allAllowed(permisos)) await finishIfAllowed();
      else message('Autoriza los permisos pendientes para completar el inicio de sesión.');
    });
    return activePromise;
  }

  async function revalidateFromProfile(){
    const modal = ensureModal();
    modal.hidden = false;
    let permisos = await inspectAll();
    render(permisos);
    message('Validando permisos actuales del dispositivo...');
    setBusy(true);
    try{
      permisos.gps = await requestGps(); render(permisos); await sync(permisos);
      permisos.camara = await requestMedia('video'); render(permisos); await sync(permisos);
      permisos.microfono = await requestMedia('audio'); render(permisos); await sync(permisos);
      permisos.push = await requestPush(); render(permisos);
      const result = await sync(permisos);
      if(allAllowed(permisos) && result.acceso_general !== false){
        message('Los cuatro permisos están activos en este dispositivo.');
      }else{
        message('Uno o más permisos siguen bloqueados. Revísalos en la configuración del navegador.', true);
      }
      document.dispatchEvent(new CustomEvent('mantto:device-permissions-updated',{detail:{permisos}}));
      return permisos;
    }finally{
      setBusy(false);
      const logout = document.getElementById('device-permissions-logout');
      if(logout){
        logout.textContent = 'Cerrar';
        logout.onclick = () => { modal.hidden = true; };
      }
    }
  }

  window.ManttoDevicePermissions = {
    getDeviceToken,
    inspectAll,
    requireForSession,
    revalidateFromProfile
  };
})();

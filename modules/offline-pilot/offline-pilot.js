(function(){
  'use strict';

  if(window.ManttoOfflinePilot) return;

  const PERMISSION_CODE='GENERAL_MODO_OFFLINE_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';
  const DB_NAME='mantto-offline-pilot-v1';
  const STORE_NAME='diagnostics';
  const STORAGE_PREFIX='mantto:offline-pilot:preferences:v1:';
  let capabilities=null;

  function root(){return document.getElementById('view-offline-configuracion');}

  function renderLoading(){
    const view=root();
    if(!view)return;
    view.innerHTML='<div class="off-page"><div class="off-card off-loading">Validando permiso de BLT NOW…</div></div>';
  }

  function renderDenied(message){
    const view=root();
    if(!view)return;
    view.innerHTML=`<div class="off-page"><div class="off-card off-denied">
      <div class="off-icon" aria-hidden="true">🔒</div>
      <h1>Modo Offline no habilitado</h1>
      <p>${escapeHtml(message||'Tu usuario no tiene el permiso individual requerido.')}</p>
      <p class="off-muted">Solicita que te asignen el acceso desde el Panel de Control de BLT NOW.</p>
    </div></div>`;
  }

  function escapeHtml(value){
    return String(value||'').replace(/[&<>'"]/g,char=>({
      '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
    })[char]);
  }

  async function hasExplicitPermission(){
    const permissions=window.ManttoPermissions;
    if(!permissions||typeof permissions.state!=='function')return false;
    let current=permissions.state(PERMISSION_CODE);
    if(current?.exists!==true&&typeof permissions.reload==='function'){
      try{await permissions.reload();}catch(_error){return false;}
      current=permissions.state(PERMISSION_CODE);
    }
    return current?.exists===true&&current?.efectivo===true;
  }

  function currentUserId(){
    const user=window.ManttoAuth?.getUser?.()||{};
    const value=Number(capabilities?.effective_user_id||user.id_SB||user.id||user.user_id||0);
    return Number.isSafeInteger(value)&&value>0?value:null;
  }

  function preferenceKey(){
    const id=currentUserId();
    if(!id)throw new Error('No fue posible identificar al usuario para guardar la preferencia.');
    return STORAGE_PREFIX+id;
  }

  function readPreferences(){
    try{
      const parsed=JSON.parse(localStorage.getItem(preferenceKey())||'null');
      if(!parsed||typeof parsed!=='object')return {daily_enabled:false,preferred_time:'18:00'};
      return {
        daily_enabled:parsed.daily_enabled===true,
        preferred_time:/^([01]\d|2[0-3]):[0-5]\d$/.test(String(parsed.preferred_time||''))?parsed.preferred_time:'18:00',
        updated_at:parsed.updated_at||null,
        last_test_at:parsed.last_test_at||null,
        last_test_status:parsed.last_test_status||null
      };
    }catch(_error){return {daily_enabled:false,preferred_time:'18:00'};}
  }

  function writePreferences(changes){
    const next=Object.assign({},readPreferences(),changes,{updated_at:new Date().toISOString()});
    localStorage.setItem(preferenceKey(),JSON.stringify(next));
    return next;
  }

  function renderPage(){
    const view=root();
    if(!view)return;
    const viewer=capabilities?.viewer_read_only===true||window.ManttoAuth?.isViewingAs?.()===true;
    const prefs=readPreferences();
    view.innerHTML=`<div class="off-page">
      <header class="off-hero">
        <div><span class="off-kicker">PILOTO CONTROLADO · FASE 1</span><h1>Modo Offline</h1>
        <p>Prueba el permiso, la configuración del horario y el almacenamiento de este dispositivo.</p></div>
        <span class="off-badge">Sin datos operativos</span>
      </header>

      <div class="off-notice" role="note">
        <span aria-hidden="true">📶</span><div><strong>Confirmación de Wi‑Fi obligatoria</strong>
        <p>Antes de cada respaldo, BLT NOW avisará lo que hará. La persona deberá confirmar que está conectada a una red Wi‑Fi.</p></div>
      </div>

      ${viewer?'<div class="off-viewer" role="status">Modo Visor: puedes revisar la pantalla, pero no guardar ni ejecutar pruebas en el dispositivo.</div>':''}

      <div class="off-grid">
        <section class="off-card">
          <div class="off-card-title"><span>🕒</span><div><h2>Horario preferido</h2><p>Esta fase guarda la preferencia sólo en este dispositivo.</p></div></div>
          <label class="off-switch-row"><input id="off-daily-enabled" type="checkbox" ${prefs.daily_enabled?'checked':''} ${viewer?'disabled':''}/><span>Preparar respaldo diario en una fase posterior</span></label>
          <label class="off-field">Hora preferida
            <input id="off-preferred-time" type="time" value="${escapeHtml(prefs.preferred_time)}" ${viewer?'disabled':''}/>
          </label>
          <p class="off-help">La hora es una preferencia. Si BLT NOW está cerrado, el navegador no garantiza ejecutarla exactamente; se intentará en la siguiente oportunidad disponible.</p>
          <button class="off-btn" id="off-save" type="button" ${viewer?'disabled':''}>Guardar horario</button>
          <div class="off-message" id="off-save-message" aria-live="polite"></div>
        </section>

        <section class="off-card">
          <div class="off-card-title"><span>💾</span><div><h2>Prueba del dispositivo</h2><p>Escribe y elimina un registro técnico sin información de operación.</p></div></div>
          <dl class="off-diagnostics">
            <div><dt>IndexedDB</dt><dd id="off-indexeddb">Validando…</dd></div>
            <div><dt>Espacio estimado</dt><dd id="off-storage">Validando…</dd></div>
            <div><dt>Persistencia</dt><dd id="off-persisted">Validando…</dd></div>
            <div><dt>Datos de negocio</dt><dd>No habilitados</dd></div>
          </dl>
          <label class="off-wifi-confirm"><input id="off-wifi-confirm" type="checkbox" ${viewer?'disabled':''}/><span>Confirmo que estoy conectado a Wi‑Fi y autorizo esta prueba local.</span></label>
          <button class="off-btn off-btn-test" id="off-test" type="button" ${viewer?'disabled':''}>Ejecutar prueba de dispositivo</button>
          <div class="off-message" id="off-test-message" aria-live="polite"></div>
        </section>
      </div>

      <section class="off-card off-scope">
        <h2>Alcance de esta prueba</h2>
        <ul><li>Valida el permiso individual de BLT NOW en frontend y backend.</li>
        <li>Guarda el horario por usuario y por dispositivo.</li>
        <li>Exige confirmación manual de Wi‑Fi antes de la prueba.</li>
        <li>No descarga tickets, clientes, inventario, fotografías ni otro dato operativo.</li></ul>
      </section>
    </div>`;
    bindControls();
    updateDeviceDiagnostics();
  }

  function setMessage(id,message,type){
    const node=document.getElementById(id);
    if(!node)return;
    node.textContent=message||'';
    node.className='off-message'+(type?' '+type:'');
  }

  function bindControls(){
    document.getElementById('off-save')?.addEventListener('click',()=>{
      const input=document.getElementById('off-preferred-time');
      const time=String(input?.value||'');
      if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)){
        setMessage('off-save-message','Selecciona una hora válida.','error');
        return;
      }
      try{
        writePreferences({
          daily_enabled:document.getElementById('off-daily-enabled')?.checked===true,
          preferred_time:time
        });
        setMessage('off-save-message','Horario guardado en este dispositivo.','ok');
      }catch(error){setMessage('off-save-message',error.message,'error');}
    });
    document.getElementById('off-test')?.addEventListener('click',runDeviceTest);
  }

  function formatBytes(value){
    const bytes=Number(value||0);
    if(!Number.isFinite(bytes)||bytes<=0)return 'No disponible';
    const units=['B','KB','MB','GB'];
    let size=bytes,index=0;
    while(size>=1024&&index<units.length-1){size/=1024;index+=1;}
    return `${size.toFixed(index===0?0:1)} ${units[index]}`;
  }

  async function updateDeviceDiagnostics(){
    const indexed=document.getElementById('off-indexeddb');
    if(indexed)indexed.textContent=window.indexedDB?'Disponible':'No disponible';
    const storage=document.getElementById('off-storage');
    const persisted=document.getElementById('off-persisted');
    try{
      if(navigator.storage?.estimate){
        const estimate=await navigator.storage.estimate();
        if(storage)storage.textContent=`${formatBytes(estimate.usage)} usados de ${formatBytes(estimate.quota)}`;
      }else if(storage)storage.textContent='No disponible';
      if(navigator.storage?.persisted){
        const value=await navigator.storage.persisted();
        if(persisted)persisted.textContent=value?'Persistente':'Administrada por el navegador';
      }else if(persisted)persisted.textContent='No disponible';
    }catch(_error){
      if(storage)storage.textContent='No disponible';
      if(persisted)persisted.textContent='No disponible';
    }
  }

  function diagnosticMarker(){
    if(window.crypto?.randomUUID)return window.crypto.randomUUID();
    return `pilot-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function indexedDbDiagnostic(){
    if(!window.indexedDB)return Promise.reject(new Error('Este navegador no ofrece IndexedDB.'));
    return new Promise((resolve,reject)=>{
      const openRequest=window.indexedDB.open(DB_NAME,1);
      let db=null;
      let settled=false;
      const marker=diagnosticMarker();
      const fail=error=>{
        if(settled)return;
        settled=true;
        try{db?.close();}catch(_closeError){}
        reject(error instanceof Error?error:new Error('Falló la prueba local de IndexedDB.'));
      };
      openRequest.onerror=()=>fail(openRequest.error);
      openRequest.onblocked=()=>fail(new Error('El almacenamiento local está bloqueado por otra pestaña.'));
      openRequest.onupgradeneeded=event=>{
        const upgradeDb=event.target.result;
        if(!upgradeDb.objectStoreNames.contains(STORE_NAME))upgradeDb.createObjectStore(STORE_NAME,{keyPath:'key'});
      };
      openRequest.onsuccess=()=>{
        db=openRequest.result;
        const transaction=db.transaction(STORE_NAME,'readwrite');
        const store=transaction.objectStore(STORE_NAME);
        const put=store.put({key:'health-check',marker,created_at:new Date().toISOString()});
        put.onerror=()=>fail(put.error);
        put.onsuccess=()=>{
          const get=store.get('health-check');
          get.onerror=()=>fail(get.error);
          get.onsuccess=()=>{
            if(get.result?.marker!==marker){
              try{transaction.abort();}catch(_abortError){}
              fail(new Error('El registro técnico no pudo verificarse.'));
              return;
            }
            const remove=store.delete('health-check');
            remove.onerror=()=>fail(remove.error);
          };
        };
        transaction.onabort=()=>fail(transaction.error);
        transaction.onerror=()=>fail(transaction.error);
        transaction.oncomplete=()=>{
          if(settled)return;
          settled=true;
          db.close();
          resolve(true);
        };
      };
    });
  }

  async function runDeviceTest(){
    if(capabilities?.viewer_read_only===true||window.ManttoAuth?.isViewingAs?.()===true){
      setMessage('off-test-message','El Modo Visor es de solo lectura.','error');
      return;
    }
    if(document.getElementById('off-wifi-confirm')?.checked!==true){
      setMessage('off-test-message','Confirma primero que estás conectado a Wi‑Fi.','error');
      return;
    }
    const button=document.getElementById('off-test');
    if(button)button.disabled=true;
    setMessage('off-test-message','Probando almacenamiento local…','info');
    try{
      await indexedDbDiagnostic();
      writePreferences({last_test_at:new Date().toISOString(),last_test_status:'PASS'});
      setMessage('off-test-message','Prueba correcta: el registro técnico se escribió, verificó y eliminó.','ok');
      await updateDeviceDiagnostics();
    }catch(error){
      try{writePreferences({last_test_at:new Date().toISOString(),last_test_status:'FAIL'});}catch(_storageError){}
      setMessage('off-test-message',error?.message||'No fue posible completar la prueba.','error');
    }finally{if(button)button.disabled=false;}
  }

  async function init(){
    renderLoading();
    if(!await hasExplicitPermission()){
      renderDenied();
      return false;
    }
    try{
      const response=await window.ManttoAuth.apiGet('/api/offline/capabilities');
      if(response?.data?.permission_code!==PERMISSION_CODE)throw new Error('La validación de permiso devolvió un contrato inesperado.');
      capabilities=response.data;
      renderPage();
      return true;
    }catch(error){
      renderDenied(error?.status===403?'El backend de BLT NOW rechazó este acceso.':(error?.message||'No fue posible validar el acceso.'));
      return false;
    }
  }

  window.ManttoOfflinePilot={init,permissionCode:PERMISSION_CODE};
})();

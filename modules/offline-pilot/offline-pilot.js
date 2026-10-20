(function(){
  'use strict';

  if(window.ManttoOfflinePilot)return;

  const PERMISSION_CODE='GENERAL_MODO_OFFLINE_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';
  const STORAGE_PREFIX='mantto:offline-pilot:preferences:v1:';
  const ACCESS_PREFIX='mantto:offline-access:';
  const ACCESS_TTL_MS=24*60*60*1000;
  let capabilities=null;
  let capabilitySource='online';

  function root(){return document.getElementById('view-offline-configuracion');}
  function escapeHtml(value){
    return String(value??'').replace(/[&<>'"]/g,char=>({
      '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
    })[char]);
  }
  function renderLoading(){
    const view=root();
    if(view)view.innerHTML='<div class="off-page"><div class="off-card off-loading">Validando permiso y copia local de BLT NOW…</div></div>';
  }
  function renderDenied(message){
    const view=root();
    if(!view)return;
    view.innerHTML=`<div class="off-page"><div class="off-card off-denied">
      <div class="off-icon" aria-hidden="true">🔒</div><h1>Modo Offline no habilitado</h1>
      <p>${escapeHtml(message||'Tu usuario no tiene el permiso individual requerido.')}</p>
      <p class="off-muted">Solicita que te asignen el acceso desde el Panel de Control de BLT NOW.</p>
    </div></div>`;
  }

  function userId(user){
    const value=Number(user?.id_SB||user?.id||user?.user_id||0);
    return Number.isSafeInteger(value)&&value>0?value:null;
  }
  function actorUserId(){return userId(window.ManttoAuth?.getActorUser?.());}
  function currentUserId(){return Number(capabilities?.effective_user_id)||userId(window.ManttoAuth?.getUser?.());}
  function accessKey(){
    const actor=actorUserId();
    const effective=currentUserId()||userId(window.ManttoAuth?.getUser?.());
    return actor&&effective?`${ACCESS_PREFIX}${actor}:${effective}`:null;
  }
  function saveCapability(value){
    const key=accessKey();
    if(key)localStorage.setItem(key,JSON.stringify({saved_at:new Date().toISOString(),data:value}));
  }
  function readCachedCapability(){
    const key=accessKey();
    if(!key)return null;
    try{
      const cached=JSON.parse(localStorage.getItem(key)||'null');
      const savedAt=new Date(cached?.saved_at||0).getTime();
      const data=cached?.data;
      if(!data||Date.now()-savedAt>ACCESS_TTL_MS)return null;
      if(data.permission_code!==PERMISSION_CODE)return null;
      if(Number(data.effective_user_id)!==userId(window.ManttoAuth?.getUser?.()))return null;
      return data;
    }catch(_error){return null;}
  }
  async function explicitPermissionState(){
    const permissions=window.ManttoPermissions;
    if(!permissions||typeof permissions.state!=='function')return 'unknown';
    let current=permissions.state(PERMISSION_CODE);
    if(current?.exists===true)return current?.efectivo===true?'granted':'denied';
    if(current?.exists!==true&&typeof permissions.reload==='function'&&navigator.onLine!==false){
      try{await permissions.reload();}catch(_error){return 'unknown';}
      current=permissions.state(PERMISSION_CODE);
    }
    if(current?.exists===true)return current?.efectivo===true?'granted':'denied';
    return navigator.onLine===false?'unknown':'denied';
  }
  async function resolveCapabilities(){
    const explicit=await explicitPermissionState();
    const cached=readCachedCapability();
    if(explicit!=='granted'){
      if(explicit==='unknown'&&cached){capabilitySource='cache';return cached;}
      return null;
    }
    try{
      const response=await window.ManttoAuth.apiGet('/api/offline/capabilities');
      if(response?.data?.permission_code!==PERMISSION_CODE)throw new Error('La validación devolvió un contrato inesperado.');
      capabilities=response.data;
      saveCapability(capabilities);
      capabilitySource='online';
      return capabilities;
    }catch(error){
      if(cached&&(navigator.onLine===false||!Number(error?.status||0))){capabilitySource='cache';return cached;}
      throw error;
    }
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
      return Object.assign({},parsed,{
        daily_enabled:parsed.daily_enabled===true,
        preferred_time:/^([01]\d|2[0-3]):[0-5]\d$/.test(String(parsed.preferred_time||''))?parsed.preferred_time:'18:00'
      });
    }catch(_error){return {daily_enabled:false,preferred_time:'18:00'};}
  }
  function writePreferences(changes){
    const next=Object.assign({},readPreferences(),changes,{updated_at:new Date().toISOString()});
    localStorage.setItem(preferenceKey(),JSON.stringify(next));
    return next;
  }
  function selectedDataset(){
    const datasets=Array.isArray(capabilities?.datasets)?capabilities.datasets:[];
    return datasets.find(item=>item?.key==='operacion-resumen-dia')||datasets[0]||null;
  }
  function snapshotContext(){
    const dataset=selectedDataset();
    if(!dataset)throw new Error('El backend no habilitó ningún conjunto offline.');
    return {actor_user_id:actorUserId(),effective_user_id:currentUserId(),domain:dataset.domain,dataset:dataset.key};
  }
  function isViewer(){return capabilities?.viewer_read_only===true||window.ManttoAuth?.isViewingAs?.()===true;}
  function formatBytes(value){
    const bytes=Number(value||0);
    if(!Number.isFinite(bytes)||bytes<=0)return '0 B';
    const units=['B','KB','MB','GB'];
    let size=bytes,index=0;
    while(size>=1024&&index<units.length-1){size/=1024;index+=1;}
    return `${size.toFixed(index===0?0:1)} ${units[index]}`;
  }
  function formatDateTime(value){
    const date=new Date(value||0);
    if(!Number.isFinite(date.getTime()))return 'Nunca';
    return new Intl.DateTimeFormat('es-MX',{dateStyle:'medium',timeStyle:'short'}).format(date);
  }

  function renderPage(){
    const view=root();
    if(!view)return;
    const viewer=isViewer();
    const prefs=readPreferences();
    const offline=capabilitySource==='cache'||navigator.onLine===false;
    view.innerHTML=`<div class="off-page">
      <header class="off-hero">
        <div><span class="off-kicker">PILOTO CONTROLADO · FASE 2</span><h1>Modo Offline</h1>
        <p>Crea y consulta una copia operativa autorizada de solo lectura en este dispositivo.</p></div>
        <span class="off-badge ${offline?'off-badge-local':''}">${offline?'Copia local':'Solo lectura · UNITED'}</span>
      </header>
      <div class="off-notice" role="note"><span aria-hidden="true">📶</span><div><strong>Tu confirmación de Wi‑Fi es obligatoria</strong>
        <p>BLT NOW no iniciará la descarga automáticamente. Cuando el respaldo esté pendiente te avisará y deberás confirmar la red antes de autorizarlo.</p></div></div>
      ${viewer?'<div class="off-viewer" role="status">Modo Visor: puedes consultar una copia ya guardada, pero no crear respaldos ni cambiar la programación.</div>':''}
      <div class="off-grid">
        <section class="off-card">
          <div class="off-card-title"><span>🕒</span><div><h2>Horario preferido</h2><p>Se revisa al abrir BLT NOW, recuperar conexión o volver al primer plano.</p></div></div>
          <label class="off-switch-row"><input id="off-daily-enabled" type="checkbox" ${prefs.daily_enabled?'checked':''} ${viewer?'disabled':''}/><span>Solicitar un respaldo diario</span></label>
          <label class="off-field">Hora preferida<input id="off-preferred-time" type="time" value="${escapeHtml(prefs.preferred_time)}" ${viewer?'disabled':''}/></label>
          <p class="off-help">Si la PWA está cerrada a esa hora, lo solicitará en la siguiente oportunidad. Nunca se descarga sin tu confirmación.</p>
          <button class="off-btn" id="off-save" type="button" ${viewer?'disabled':''}>Guardar horario</button>
          <div class="off-message" id="off-save-message" aria-live="polite"></div>
        </section>
        <section class="off-card">
          <div class="off-card-title"><span>💾</span><div><h2>Almacenamiento del dispositivo</h2><p>Separado por usuario actor, usuario efectivo, dominio y conjunto.</p></div></div>
          <dl class="off-diagnostics">
            <div><dt>IndexedDB</dt><dd id="off-indexeddb">Validando…</dd></div>
            <div><dt>Espacio estimado</dt><dd id="off-storage">Validando…</dd></div>
            <div><dt>Persistencia</dt><dd id="off-persisted">Validando…</dd></div>
            <div><dt>Cola hacia Aiven</dt><dd id="off-outbox">Deshabilitada</dd></div>
          </dl>
          <button class="off-btn off-btn-secondary" id="off-test" type="button" ${viewer?'disabled':''}>Probar IndexedDB</button>
          <div class="off-message" id="off-test-message" aria-live="polite"></div>
        </section>
        <section class="off-card off-card-backup">
          <div class="off-card-title"><span>⬇️</span><div><h2>Copia de Resumen del Día</h2><p>Tickets y portafolio filtrados por tus permisos y alcance UNITED.</p></div></div>
          <dl class="off-diagnostics off-backup-meta">
            <div><dt>Última copia</dt><dd id="off-last-backup">Consultando…</dd></div>
            <div><dt>Registros</dt><dd id="off-record-count">—</dd></div>
            <div><dt>Tamaño</dt><dd id="off-backup-size">—</dd></div>
          </dl>
          <label class="off-wifi-confirm"><input id="off-wifi-confirm" type="checkbox" ${viewer?'disabled':''}/><span>Confirmo que estoy conectado a Wi‑Fi y autorizo ahora esta copia offline.</span></label>
          <div class="off-actions">
            <button class="off-btn off-btn-test" id="off-download" type="button" ${viewer||offline?'disabled':''}>Descargar copia autorizada</button>
            <button class="off-btn off-btn-secondary" id="off-read" type="button">Consultar copia local</button>
          </div>
          <div class="off-message" id="off-backup-message" aria-live="polite"></div>
        </section>
      </div>
      <section class="off-card off-scope"><h2>Consulta operativa sin internet</h2>
        <div id="off-local-results" class="off-local-results"><p class="off-muted">Pulsa “Consultar copia local” para leer exclusivamente desde este dispositivo.</p></div>
      </section>
      <section class="off-card off-scope off-safety"><h2>Estado de la implementación</h2><ul>
        <li><strong>Activo:</strong> permiso individual, horario, aviso pendiente, IndexedDB y copia de Resumen del Día.</li>
        <li><strong>Activo:</strong> consulta local de solo lectura tras perder conexión dentro de la sesión.</li>
        <li><strong>Bloqueado:</strong> cambios offline y envío a Aiven; la cola existe vacía, pero no acepta ni transmite operaciones hasta F8/F9.</li>
        <li><strong>Excluido:</strong> fotografías, documentos y respuestas autenticadas en Cache Storage.</li>
      </ul></section>
    </div>`;
    bindControls();
    updateDeviceDiagnostics();
    refreshSnapshotMetadata();
    const due=window.ManttoOfflineScheduler?.evaluate?.();
    if(due?.due)setMessage('off-backup-message','Respaldo pendiente: confirma Wi‑Fi y autoriza la descarga.','info');
  }

  function setMessage(id,message,type){
    const node=document.getElementById(id);
    if(!node)return;
    node.textContent=message||'';
    node.className='off-message'+(type?' '+type:'');
  }
  function bindControls(){
    document.getElementById('off-save')?.addEventListener('click',saveSchedule);
    document.getElementById('off-test')?.addEventListener('click',runDeviceTest);
    document.getElementById('off-download')?.addEventListener('click',downloadSnapshot);
    document.getElementById('off-read')?.addEventListener('click',readLocalSnapshot);
  }
  function saveSchedule(){
    const time=String(document.getElementById('off-preferred-time')?.value||'');
    if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))return setMessage('off-save-message','Selecciona una hora válida.','error');
    try{
      const previous=readPreferences();
      const enabled=document.getElementById('off-daily-enabled')?.checked===true;
      writePreferences({daily_enabled:enabled,preferred_time:time,
        schedule_started_at:enabled&&previous.daily_enabled!==true?new Date().toISOString():(previous.schedule_started_at||new Date().toISOString())});
      setMessage('off-save-message','Horario guardado. La descarga siempre pedirá confirmación de Wi‑Fi.','ok');
      window.ManttoOfflineScheduler?.evaluate?.();
    }catch(error){setMessage('off-save-message',error.message,'error');}
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
      const outbox=await window.ManttoOfflineStorage?.outboxStatus?.();
      const outboxNode=document.getElementById('off-outbox');
      if(outboxNode)outboxNode.textContent=`${outbox?.count||0} pendientes · envío deshabilitado`;
    }catch(_error){
      if(storage)storage.textContent='No disponible';
      if(persisted)persisted.textContent='No disponible';
    }
  }
  async function runDeviceTest(){
    const button=document.getElementById('off-test');
    if(button)button.disabled=true;
    setMessage('off-test-message','Probando escritura técnica temporal…','info');
    try{
      await window.ManttoOfflineStorage.healthCheck();
      writePreferences({last_test_at:new Date().toISOString(),last_test_status:'PASS'});
      setMessage('off-test-message','Prueba correcta: el registro técnico se escribió, verificó y eliminó.','ok');
      await updateDeviceDiagnostics();
    }catch(error){
      try{writePreferences({last_test_at:new Date().toISOString(),last_test_status:'FAIL'});}catch(_storageError){}
      setMessage('off-test-message',error?.message||'No fue posible completar la prueba.','error');
    }finally{if(button)button.disabled=false;}
  }

  async function downloadSnapshot(){
    if(isViewer())return setMessage('off-backup-message','El Modo Visor no puede crear copias en el dispositivo.','error');
    if(navigator.onLine===false)return setMessage('off-backup-message','No hay conexión. Puedes consultar la copia local existente.','error');
    if(document.getElementById('off-wifi-confirm')?.checked!==true)return setMessage('off-backup-message','Confirma primero que estás conectado a Wi‑Fi.','error');
    const dataset=selectedDataset();
    if(!dataset?.endpoint)return setMessage('off-backup-message','No hay un conjunto autorizado para descargar.','error');
    const button=document.getElementById('off-download');
    if(button)button.disabled=true;
    setMessage('off-backup-message','Descargando información autorizada desde BLT NOW…','info');
    try{
      // El endpoint conserva su Guard OPERACION/UNITED y sus cuartos. El
      // permiso general de Modo Offline nunca sustituye esa autorización.
      const payload=await window.ManttoAuth.api(dataset.endpoint,{method:'GET',cache:'no-store'});
      const saved=await window.ManttoOfflineStorage.saveSnapshot(snapshotContext(),payload,{
        record_count:Number(payload?.total?.tickets||0)+Number(payload?.total?.portafolio||0)
      });
      writePreferences({last_backup_at:saved.downloaded_at,last_backup_status:'PASS',last_backup_error:null});
      window.ManttoOfflineScheduler?.markCompleted?.(currentUserId(),saved.downloaded_at);
      const checkbox=document.getElementById('off-wifi-confirm');
      if(checkbox)checkbox.checked=false;
      setMessage('off-backup-message','Copia guardada. La confirmación de Wi‑Fi se restableció para el siguiente respaldo.','ok');
      await refreshSnapshotMetadata(saved);
      renderSnapshot(saved);
    }catch(error){
      writePreferences({last_backup_status:'FAIL',last_backup_error:String(error?.message||'Error de respaldo').slice(0,300)});
      window.ManttoOfflineScheduler?.markFailed?.(currentUserId(),error?.message);
      setMessage('off-backup-message',error?.status===403?'No tienes acceso al Resumen del Día o a su alcance UNITED.':(error?.message||'No fue posible guardar la copia.'),'error');
    }finally{if(button)button.disabled=false;}
  }
  async function getLocalSnapshot(){
    if(!window.ManttoOfflineStorage)throw new Error('El motor local no está disponible.');
    return window.ManttoOfflineStorage.getSnapshot(snapshotContext());
  }
  async function refreshSnapshotMetadata(existing){
    try{
      const row=existing||await getLocalSnapshot();
      const last=document.getElementById('off-last-backup');
      const count=document.getElementById('off-record-count');
      const size=document.getElementById('off-backup-size');
      if(last)last.textContent=row?formatDateTime(row.downloaded_at):'Nunca';
      if(count)count.textContent=row?Number(row.record_count||0).toLocaleString('es-MX'):'0';
      if(size)size.textContent=row?formatBytes(row.byte_size):'0 B';
    }catch(error){const last=document.getElementById('off-last-backup');if(last)last.textContent=error?.message||'No disponible';}
  }
  async function readLocalSnapshot(){
    const button=document.getElementById('off-read');
    if(button)button.disabled=true;
    setMessage('off-backup-message','Leyendo IndexedDB sin consultar Aiven…','info');
    try{
      const row=await getLocalSnapshot();
      if(!row){setMessage('off-backup-message','Aún no existe una copia local para este usuario.','error');renderSnapshot(null);return;}
      renderSnapshot(row);
      setMessage('off-backup-message','Copia local abierta sin consultar Aiven.','ok');
    }catch(error){setMessage('off-backup-message',error?.message||'No fue posible leer la copia local.','error');}
    finally{if(button)button.disabled=false;}
  }
  function firstValue(row,keys){
    for(const key of keys){if(row?.[key]!==undefined&&row?.[key]!==null&&String(row[key]).trim()!=='')return row[key];}
    return '—';
  }
  function renderSnapshot(row){
    const target=document.getElementById('off-local-results');
    if(!target)return;
    if(!row){target.innerHTML='<p class="off-muted">No hay datos operativos guardados para esta identidad.</p>';return;}
    const payload=row.payload||{};
    const tickets=Array.isArray(payload?.data?.tickets)?payload.data.tickets:[];
    const portafolio=Array.isArray(payload?.data?.portafolio)?payload.data.portafolio:[];
    const zones=Array.isArray(payload?.alcance?.zonas)?payload.alcance.zonas:[];
    const preview=tickets.slice(0,50);
    target.innerHTML=`<div class="off-local-summary">
      <div><strong>${tickets.length.toLocaleString('es-MX')}</strong><span>Tickets</span></div>
      <div><strong>${portafolio.length.toLocaleString('es-MX')}</strong><span>Equipos / proyectos</span></div>
      <div><strong>${zones.length?escapeHtml(zones.join(', ')):'Alcance global autorizado'}</strong><span>Alcance</span></div>
      <div><strong>${escapeHtml(formatDateTime(row.downloaded_at))}</strong><span>Descargado</span></div>
    </div><div class="off-table-wrap"><table class="off-table"><thead><tr><th>Ticket</th><th>Fecha</th><th>Estado</th><th>Proyecto</th><th>Equipo</th></tr></thead>
    <tbody>${preview.map(ticket=>`<tr>
      <td>${escapeHtml(firstValue(ticket,['numero_ticket','ticket','folio','n']))}</td>
      <td>${escapeHtml(firstValue(ticket,['fecha_reporte','fecha','fecha_ticket','fr']))}</td>
      <td>${escapeHtml(firstValue(ticket,['estado_ticket','estado','estatus','et']))}</td>
      <td>${escapeHtml(firstValue(ticket,['proyecto','nombre_proyecto','pro']))}</td>
      <td>${escapeHtml(firstValue(ticket,['numero_equipo','codigo_equipo','equipo','cod']))}</td>
    </tr>`).join('')||'<tr><td colspan="5">La copia no contiene tickets visibles.</td></tr>'}</tbody></table></div>
    ${tickets.length>preview.length?`<p class="off-help">Vista previa de 50 de ${tickets.length.toLocaleString('es-MX')} tickets. La copia completa permanece en IndexedDB.</p>`:''}`;
  }

  async function init(){
    renderLoading();
    if(!window.ManttoOfflineStorage){renderDenied('El motor de almacenamiento offline no está disponible.');return false;}
    try{
      capabilities=await resolveCapabilities();
      if(!capabilities){renderDenied();return false;}
      renderPage();
      return true;
    }catch(error){
      renderDenied(error?.status===403?'El backend de BLT NOW rechazó este acceso.':(error?.message||'No fue posible validar el acceso.'));
      return false;
    }
  }

  window.ManttoOfflinePilot={init,permissionCode:PERMISSION_CODE};
})();

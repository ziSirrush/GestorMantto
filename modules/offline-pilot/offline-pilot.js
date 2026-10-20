(function(){
  'use strict';

  if(window.ManttoOfflinePilot)return;

  const PERMISSION_CODE='GENERAL_MODO_OFFLINE_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';
  const STORAGE_PREFIX='mantto:offline-pilot:preferences:v1:';
  const ACCESS_PREFIX='mantto:offline-access:';
  const SELECTION_PREFIX='mantto:offline-selection:f1:';
  const ACCESS_TTL_MS=24*60*60*1000;
  let capabilities=null;
  let capabilitySource='online';
  let catalog=[];
  let excluded=new Set();

  function root(){return document.getElementById('view-offline-configuracion');}
  function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function positiveId(value){const n=Number(value);return Number.isSafeInteger(n)&&n>0?n:null;}
  function userId(user){return positiveId(user?.id_SB||user?.id||user?.user_id);}
  function actorUserId(){return userId(window.ManttoAuth?.getActorUser?.());}
  function currentUserId(){return positiveId(capabilities?.effective_user_id)||userId(window.ManttoAuth?.getUser?.());}
  function isViewer(){return capabilities?.viewer_read_only===true||window.ManttoAuth?.isViewingAs?.()===true;}
  function storageKey(prefix){const actor=actorUserId(),effective=currentUserId();return actor&&effective?`${prefix}${actor}:${effective}`:null;}
  function accessKey(){return storageKey(ACCESS_PREFIX);}
  function saveCapability(value){
    const key=accessKey();
    if(key)localStorage.setItem(key,JSON.stringify({saved_at:new Date().toISOString(),data:value}));
  }
  function readCachedCapability(){
    const key=accessKey();
    if(!key)return null;
    try{
      const cached=JSON.parse(localStorage.getItem(key)||'null');
      const timestamp=new Date(cached?.saved_at||0).getTime();
      if(!Number.isFinite(timestamp)||Date.now()<timestamp||Date.now()-timestamp>ACCESS_TTL_MS)return null;
      const value=cached?.data;
      if(value?.permission_code!==PERMISSION_CODE||Number(value?.effective_user_id)!==currentUserId())return null;
      return value;
    }catch(_error){return null;}
  }
  async function explicitPermissionState(){
    const permissions=window.ManttoPermissions;
    if(!permissions||typeof permissions.state!=='function')return 'unknown';
    let current=permissions.state(PERMISSION_CODE);
    if(current?.exists===true)return current?.efectivo===true?'granted':'denied';
    if(typeof permissions.reload==='function'&&navigator.onLine!==false){
      try{await permissions.reload();}catch(_error){return 'unknown';}
      current=permissions.state(PERMISSION_CODE);
    }
    if(current?.exists===true)return current?.efectivo===true?'granted':'denied';
    return navigator.onLine===false?'unknown':'denied';
  }
  async function resolveCapabilities(){
    const permission=await explicitPermissionState();
    const cached=readCachedCapability();
    if(permission!=='granted'){
      if(permission==='unknown'&&cached){capabilitySource='cache';return cached;}
      return null;
    }
    try{
      const response=await window.ManttoAuth.apiGet('/api/offline/capabilities');
      if(response?.data?.permission_code!==PERMISSION_CODE)throw new Error('Contrato de permiso offline inesperado.');
      capabilitySource='online';
      saveCapability(response.data);
      return response.data;
    }catch(error){
      if(cached&&(navigator.onLine===false||!Number(error?.status||0))){capabilitySource='cache';return cached;}
      throw error;
    }
  }
  function renderLoading(){const view=root();if(view)view.innerHTML='<div class="off-page"><div class="off-card off-loading">Validando permiso y copia local de BLT NOW…</div></div>';}
  function renderDenied(message){
    const view=root();if(!view)return;
    view.innerHTML=`<div class="off-page"><div class="off-card off-denied"><div class="off-icon" aria-hidden="true">🔒</div><h1>Modo Offline no habilitado</h1><p>${escapeHtml(message||'Tu usuario no tiene el permiso individual requerido.')}</p><p class="off-muted">Solicita el acceso desde el Panel de Control.</p></div></div>`;
  }
  function preferenceKey(){const id=currentUserId();if(!id)throw new Error('No es posible identificar al usuario.');return STORAGE_PREFIX+id;}
  function readPreferences(){
    try{
      const parsed=JSON.parse(localStorage.getItem(preferenceKey())||'null');
      if(!parsed||typeof parsed!=='object')return {daily_enabled:false,preferred_time:'18:00'};
      return {...parsed,daily_enabled:parsed.daily_enabled===true,
        preferred_time:/^([01]\d|2[0-3]):[0-5]\d$/.test(String(parsed.preferred_time||''))?parsed.preferred_time:'18:00'};
    }catch(_error){return {daily_enabled:false,preferred_time:'18:00'};}
  }
  function writePreferences(changes){
    const updated={...readPreferences(),...changes,updated_at:new Date().toISOString()};
    localStorage.setItem(preferenceKey(),JSON.stringify(updated));
    return updated;
  }
  function selectionKey(){return storageKey(SELECTION_PREFIX);}
  function readExcluded(){
    try{
      const key=selectionKey();if(!key)return new Set();
      const saved=JSON.parse(localStorage.getItem(key)||'null');
      return new Set(Array.isArray(saved?.excluded_codes)?saved.excluded_codes.filter(x=>typeof x==='string'):[]);
    }catch(_error){return new Set();}
  }
  function saveExcluded(){
    const key=selectionKey();
    if(!key)throw new Error('No se puede asociar la selección con la identidad del usuario.');
    localStorage.setItem(key,JSON.stringify({excluded_codes:[...excluded].sort(),updated_at:new Date().toISOString()}));
  }
  function isSelected(code){return catalog.some(m=>m.code===code)&&!excluded.has(code);}
  function canDownload(datasetKey){
    return catalog.some(m=>isSelected(m.code)&&Array.isArray(m.datasets)&&m.datasets.includes(datasetKey));
  }
  function scopeLabel(module){
    const s=module?.scope||{};
    if(s.master_key===true&&s.mode==='DOMINIO_COMPLETO')return `${module.domain} · llave maestra · dominio completo`;
    if(module.domain==='UNITED'&&s.mode==='ZONAS')return `UNITED · ${s.zone_ids?.length||0} zonas: ${(s.zones||[]).join(', ')||'IDs autorizados'}`;
    if(module.domain==='CORELLIAN'&&s.mode==='USUARIOS')return `CORELLIAN · ${s.visible_user_count||0} personas en alcance`;
    if(module.domain==='GENERAL'&&s.mode==='RELACION_DIRECTA')return 'GENERAL · relación directa y permisos específicos';
    return 'Alcance no verificado';
  }
  function syncPilotCardVisibility(){
    const card=document.getElementById('off-existing-download');
    const dataset=selectedDataset();
    if(card)card.hidden=!dataset||!canDownload(dataset.key);
  }
  function safeCatalog(value){
    if(!Array.isArray(value))return [];
    const used=new Set();
    return value.filter(m=>{
      if(!m||typeof m.code!=='string'||!m.code||!m.scope||!['GENERAL','CORELLIAN','UNITED'].includes(m.domain)||used.has(m.code))return false;
      used.add(m.code);return true;
    });
  }
  function selectedDataset(){
    const choices=Array.isArray(capabilities?.datasets)?capabilities.datasets:[];
    return choices.find(d=>d?.key==='operacion-resumen-dia')||choices[0]||null;
  }
  function snapshotContext(){
    const dataset=selectedDataset();
    if(!dataset)throw new Error('No existe un conjunto autorizado para la copia actual.');
    return {actor_user_id:actorUserId(),effective_user_id:currentUserId(),domain:dataset.domain,dataset:dataset.key};
  }
  function formatBytes(value){
    const bytes=Number(value)||0;
    if(!Number.isFinite(bytes)||bytes<=0)return '0 B';
    const units=['B','KB','MB','GB'];let n=bytes,i=0;
    while(n>=1024&&i<units.length-1){n/=1024;i++;}
    return `${n.toFixed(i?1:0)} ${units[i]}`;
  }
  function formatDateTime(value){
    const date=new Date(value||0);
    return Number.isFinite(date.getTime())?new Intl.DateTimeFormat('es-MX',{dateStyle:'medium',timeStyle:'short'}).format(date):'Nunca';
  }
  function setMessage(id,message,type){
    const node=document.getElementById(id);if(!node)return;
    node.textContent=message||'';node.className='off-message'+(type?' '+type:'');
  }
  function create(tag,className,content){
    const node=document.createElement(tag);if(className)node.className=className;
    if(content!==undefined)node.textContent=String(content);
    return node;
  }
  function renderCatalog(){
    const target=document.getElementById('off-catalog-modules');if(!target)return;
    target.replaceChildren();
    const count=document.getElementById('off-catalog-count');
    const all=document.getElementById('off-catalog-all');
    const updateCount=()=>{
      if(count)count.textContent=`${catalog.filter(m=>isSelected(m.code)).length} de ${catalog.length} seleccionados`;
      if(all)all.checked=Boolean(catalog.length)&&catalog.every(m=>isSelected(m.code));
    };
    if(all){
      all.disabled=isViewer()||catalog.length===0;
      all.onchange=()=>{
        if(isViewer())return;
        const old=excluded;
        excluded=all.checked?new Set():new Set(catalog.map(m=>m.code));
        try{saveExcluded();renderCatalog();syncPilotCardVisibility();renderSavedModules();}
        catch(error){excluded=old;renderCatalog();setMessage('off-catalog-message',error.message,'error');}
      };
    }
    if(!catalog.length){
      target.append(create('p','off-muted','No hay módulos disponibles para tus permisos y alcance actuales.'));
      updateCount();return;
    }
    const groupMap=new Map();
    for(const m of catalog){
      const title=`${m.domain} · ${m.grouping_name||m.grouping_code||'General'}`;
      if(!groupMap.has(title))groupMap.set(title,[]);
      groupMap.get(title).push(m);
    }
    for(const [title,modules] of groupMap){
      const group=create('div','off-catalog-group');
      const heading=create('h3','',title);heading.style.margin='16px 0 8px';group.append(heading);
      for(const m of modules){
        const label=create('label','off-switch-row');label.style.display='flex';label.style.gap='12px';
        label.style.alignItems='start';label.style.padding='5px 0';
        const checkbox=create('input');checkbox.type='checkbox';checkbox.checked=isSelected(m.code);
        checkbox.disabled=isViewer();checkbox.setAttribute('data-offline-module',m.code);
        checkbox.onchange=()=>{
          if(isViewer())return;
          const before=new Set(excluded);
          if(checkbox.checked)excluded.delete(m.code);else excluded.add(m.code);
          try{saveExcluded();updateCount();syncPilotCardVisibility();renderSavedModules();}
          catch(error){excluded=before;checkbox.checked=!checkbox.checked;setMessage('off-catalog-message',error.message,'error');}
        };
        const text=create('div');text.style.flex='1';
        text.append(create('strong','',m.name),create('p','off-muted',scopeLabel(m)),
          create('p','off-muted',m.backup_status==='EXPORTADOR_COMPLETO'?'Respaldo automático disponible':'Exportador pendiente para este módulo'));
        label.append(checkbox,text);group.append(label);
      }
      target.append(group);
    }
    updateCount();
  }
  function renderPage(){
    const view=root();if(!view)return;
    const prefs=readPreferences();
    const viewer=isViewer();
    const offline=capabilitySource==='cache'||navigator.onLine===false;
    view.innerHTML=`<div class="off-page">
      <header class="off-hero"><div><span class="off-kicker">NUEVA IMPLEMENTACIÓN · FASE 4</span><h1>Modo Offline</h1>
        <p>Selecciona qué módulos autorizados deseas respaldar. Todos están marcados de forma predeterminada.</p></div>
        <span class="off-badge ${offline?'off-badge-local':''}">${offline?'Catálogo en caché':'Permisos verificados'}</span></header>
      ${viewer?'<div class="off-viewer" role="status">Modo Visor: consulta de solo lectura; no puedes cambiar la selección ni crear copias.</div>':''}
      <div class="off-grid">
        <section class="off-card"><div class="off-card-title"><span>🕒</span><div><h2>Horario preferido</h2><p>La programación automática se ejecutará cuando la aplicación esté disponible.</p></div></div>
          <label class="off-switch-row"><input id="off-daily-enabled" type="checkbox" ${prefs.daily_enabled?'checked':''} ${viewer?'disabled':''}/><span>Activar respaldo diario automático</span></label>
          <label class="off-field">Hora preferida<input id="off-preferred-time" type="time" value="${escapeHtml(prefs.preferred_time)}" ${viewer?'disabled':''}/></label>
          <p class="off-help">Una vez configurado, BLT NOW inicia automáticamente el respaldo; con la aplicación cerrada lo intentará al abrirla de nuevo.</p>
          <button class="off-btn" id="off-save" type="button" ${viewer?'disabled':''}>Guardar horario</button>
          <div class="off-message" id="off-save-message" aria-live="polite"></div>
        </section>
        <section class="off-card"><div class="off-card-title"><span>💾</span><div><h2>Almacenamiento del dispositivo</h2><p>Separado por usuario actor, efectivo, dominio y conjunto.</p></div></div>
          <dl class="off-diagnostics"><div><dt>IndexedDB</dt><dd id="off-indexeddb">Validando…</dd></div>
            <div><dt>Espacio estimado</dt><dd id="off-storage">Validando…</dd></div>
            <div><dt>Persistencia</dt><dd id="off-persisted">Validando…</dd></div>
            <div><dt>Cola hacia Aiven</dt><dd id="off-outbox">Deshabilitada</dd></div></dl>
          <button class="off-btn off-btn-secondary" id="off-test" type="button" ${viewer?'disabled':''}>Probar IndexedDB</button>
          <div class="off-message" id="off-test-message" aria-live="polite"></div>
        </section>
        <section class="off-card off-card-backup" id="off-existing-download"><div class="off-card-title"><span>⬇️</span><div><h2>Respaldo de módulos autorizados</h2><p>Descarga automática y por bloques, con validación del alcance de cada módulo.</p></div></div>
          <dl class="off-diagnostics off-backup-meta"><div><dt>Última copia</dt><dd id="off-last-backup">Consultando…</dd></div>
            <div><dt>Registros</dt><dd id="off-record-count">—</dd></div>
            <div><dt>Tamaño</dt><dd id="off-backup-size">—</dd></div></dl>
          <div class="off-actions"><button class="off-btn off-btn-test" id="off-download" type="button" ${viewer||offline?'disabled':''}>Respaldar ahora</button>
            <button class="off-btn off-btn-secondary" id="off-read" type="button">Consultar copia local</button></div>
          <div class="off-message" id="off-backup-message" aria-live="polite"></div>
        </section>
      </div>
      <section class="off-card off-scope" id="off-catalog-card"><div class="off-card-title"><span>☑</span>
        <div><h2>Módulos que deseo respaldar</h2><p>Solo los módulos autorizados por el backend. Seleccionar no concede permisos nuevos.</p></div></div>
        <label class="off-switch-row"><input id="off-catalog-all" type="checkbox" ${viewer?'disabled':''}/>
          <span>Seleccionar todos</span><span class="off-muted" id="off-catalog-count"></span></label>
        <div id="off-catalog-modules"></div><div id="off-catalog-message" class="off-message" aria-live="polite"></div></section>
      <style>
        .off-reader-card{margin:12px 0;display:grid;gap:6px;}
        .off-reader{margin-top:14px;display:grid;gap:14px;}
        .off-reader-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:14px;}
        .off-reader-toolbar h3{font-size:1.1rem;margin:0 0 3px;}
        .off-reader-tabs,.off-reader-search-row,.off-reader-pager{display:flex;flex-wrap:wrap;align-items:center;gap:8px;}
        .off-reader-search{display:grid;gap:7px;}
        .off-reader-search label{font-weight:700;font-size:.92rem;}
        .off-reader-search input{border:1px solid #9bacc6;border-radius:8px;min-width:200px;flex:1;padding:10px;background:var(--color-background,#fff);color:inherit;}
        .off-reader-pager{justify-content:space-between;}
        .off-reader-detail-title{margin:18px 0 8px;}
        .off-reader-detail-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin:12px 0;}
        .off-reader-detail-field{border:1px solid rgba(110,130,160,.25);border-radius:8px;padding:10px;min-width:0;overflow-wrap:anywhere;}
        .off-reader-detail-field dt{font-size:.78rem;opacity:.78;margin-bottom:4px;}
        .off-reader-detail-field dd{margin:0;font-size:.91rem;white-space:pre-wrap;}
        .off-reader button{cursor:pointer;}
        .off-reader button:disabled{cursor:default;opacity:.6;}
        .off-writer{display:grid;gap:10px;margin:15px 0;padding:15px;border:1px solid #aabdd6;border-radius:10px;}
        .off-writer label{display:grid;gap:6px;}
        .off-writer select,.off-writer textarea{border:1px solid #9bacc6;border-radius:8px;padding:10px;background:var(--color-background,#fff);color:inherit;max-width:100%;}
        .off-pending-row{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;padding:12px;border:1px solid #c0cada;border-radius:8px;margin:9px 0;overflow-wrap:anywhere;}
        .off-pending-row p{margin:4px 0;white-space:pre-wrap;}
        .off-pending-section .off-message{margin-top:7px;}
        @media(max-width:640px){.off-reader-toolbar{align-items:flex-start;flex-direction:column;}.off-reader-search-row{display:grid;grid-template-columns:1fr 1fr;}.off-reader-search input{grid-column:1/-1;min-width:0;}}
      </style>
      <section class="off-card off-scope"><h2>Consulta operativa sin internet</h2>
        <p class="off-muted">Solo módulos con respaldo completo y validado. Consulta, búsqueda y detalle íntegramente locales.</p>
        <div id="off-local-results" class="off-local-results"></div>
        <div id="off-local-preview" class="off-local-results" hidden></div></section>
      <section class="off-card off-pending-section" id="off-pending-section">
        <h2>Operaciones pendientes de sincronización</h2>
        <p class="off-muted">Los cambios aquí están guardados <strong>solo en este dispositivo</strong>. No son registros confirmados en Aiven.
        Al recuperar internet, BLT NOW intentará enviarlos automáticamente. Las operaciones rechazadas permanecerán para revisión.</p>
        <p class="off-muted">Por seguridad, cerrar sesión borrará los pendientes no sincronizados.</p>
        <button type="button" class="off-btn" id="off-sync-now">Sincronizar pendientes ahora</button>
        <div id="off-pending-list" aria-live="polite"></div>
        <div class="off-message" id="off-pending-message" aria-live="polite"></div>
      </section>
      <section class="off-card off-scope off-safety"><h2>Estado de esta fase</h2><ul>
        <li>Activo: catálogo autorizado, selección y navegación local de registros completos por módulo.</li>
        <li>Exportadores paginados certificados: Resumen del Día (UNITED) y Proyectos de Instalaciones (CORELLIAN).</li>
        <li>Los demás módulos no tienen exportador certificado; por seguridad no se muestran en la navegación.</li>
        <li>Sincronización Fase 5: comentarios de Ticket y movimientos descriptivos enviados con validación e idempotencia.</li>
        <li>Los conflictos quedan retenidos para revisión. Vo.Bo., estatus, asignaciones y cambios de inventario no se sincronizan por este adaptador.</li>
        <li>Los documentos originales y fotografías no se descargan adicionalmente. Cerrar sesión elimina también los pendientes locales por seguridad.</li></ul></section>
    </div>`;
    bindControls();renderCatalog();syncPilotCardVisibility();
    updateDeviceDiagnostics();
    if(selectedDataset())refreshSnapshotMetadata();
    renderSavedModules();
    renderPendingActions();
    const due=window.ManttoOfflineScheduler?.evaluate?.();
    if(due?.due)setMessage('off-backup-message','Respaldo programado pendiente; se descargará automáticamente al haber conexión.','info');
  }
  function bindControls(){
    document.getElementById('off-save')?.addEventListener('click',saveSchedule);
    document.getElementById('off-test')?.addEventListener('click',runDeviceTest);
    document.getElementById('off-download')?.addEventListener('click',downloadSnapshot);
    document.getElementById('off-read')?.addEventListener('click',readLocalSnapshot);
    document.getElementById('off-sync-now')?.addEventListener('click',manualSyncNow);
  }
  function saveSchedule(){
    if(isViewer())return;
    const time=String(document.getElementById('off-preferred-time')?.value||'');
    if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))return setMessage('off-save-message','Selecciona una hora válida.','error');
    try{
      const prev=readPreferences(),enabled=document.getElementById('off-daily-enabled')?.checked===true;
      writePreferences({daily_enabled:enabled,preferred_time:time,
        schedule_started_at:enabled&&prev.daily_enabled!==true?new Date().toISOString():(prev.schedule_started_at||new Date().toISOString())});
      window.ManttoOfflineScheduler?.evaluate?.();
      if(enabled)document.dispatchEvent(new CustomEvent('mantto:offline-backup-configured'));
      setMessage('off-save-message',enabled?'Respaldo automático configurado.':'Respaldo automático desactivado.','ok');
    }catch(error){setMessage('off-save-message',error.message,'error');}
  }
  async function updateDeviceDiagnostics(){
    const indexed=document.getElementById('off-indexeddb');if(indexed)indexed.textContent=window.indexedDB?'Disponible':'No disponible';
    const storage=document.getElementById('off-storage'),persist=document.getElementById('off-persisted');
    try{
      if(storage)storage.textContent=navigator.storage?.estimate?'Consultando…':'No disponible';
      if(navigator.storage?.estimate){const q=await navigator.storage.estimate();if(storage)storage.textContent=`${formatBytes(q.usage)} usados de ${formatBytes(q.quota)}`;}
      if(persist)persist.textContent=navigator.storage?.persisted?(await navigator.storage.persisted()?'Persistente':'Administrada por el navegador'):'No disponible';
      const outbox=await window.ManttoOfflineStorage?.outboxStatus?.({actor_user_id:actorUserId(),effective_user_id:currentUserId()});
      const node=document.getElementById('off-outbox');if(node)node.textContent=`${outbox?.count||0} operaciones locales pendientes de sincronización`;
    }catch(_error){if(storage)storage.textContent='No disponible';if(persist)persist.textContent='No disponible';}
  }
  async function runDeviceTest(){
    if(isViewer())return setMessage('off-test-message','Modo Visor: solo lectura.','error');
    const button=document.getElementById('off-test');if(button)button.disabled=true;
    try{
      await window.ManttoOfflineStorage.healthCheck();
      writePreferences({last_test_at:new Date().toISOString(),last_test_status:'PASS'});
      setMessage('off-test-message','Prueba correcta: el registro técnico se escribió, verificó y eliminó.','ok');
      await updateDeviceDiagnostics();
    }catch(error){
      try{writePreferences({last_test_at:new Date().toISOString(),last_test_status:'FAIL'});}catch(_e){}
      setMessage('off-test-message',error?.message||'Error en IndexedDB.','error');
    }finally{if(button)button.disabled=false;}
  }
  function scopeMatchesSnapshot(row,module){
    if(!row||!module||row.domain!==module.domain||row.actor_user_id!==actorUserId()||row.effective_user_id!==currentUserId())return false;
    // Contrato nuevo F2: firma de alcance validada por el backend para TODAS las empresas.
    if(row.schema_version===2){
      return typeof row.scope_signature==='string'&&row.scope_signature===module.scope?.scope_signature;
    }
    // Compatibilidad exclusiva con la copia previa a F2 de UNITED, hasta que se sustituya.
    if(module.domain!=='UNITED')return false;
    if(module.scope?.master_key===true)return row.payload?.alcance?.zona_ids===null;
    const before=row.payload?.alcance?.zona_ids,now=module.scope?.zone_ids;
    if(!Array.isArray(before)||!Array.isArray(now)||!now.length)return false;
    const a=[...new Set(before.map(positiveId).filter(Boolean))].sort((x,y)=>x-y);
    const b=[...new Set(now.map(positiveId).filter(Boolean))].sort((x,y)=>x-y);
    return a.length===b.length&&a.every((x,i)=>x===b[i]);
  }
  async function getLocalSnapshot(){return window.ManttoOfflineStorage.getSnapshot(snapshotContext());}
  // Fase 3: lector de modulos respaldados. No usa endpoints ni crea mutaciones.
  const READER_LABELS=Object.freeze({tickets:'Tickets',portafolio:'Portafolio / Equipos',proyectos:'Proyectos de Instalaciones'});
  const READER_FIELDS=Object.freeze({
    tickets:[['Ticket',['ticket','numero_ticket','folio','id']],['Fecha',['fecha_reporte','fecha']],['Estatus',['estado_ticket','estatus','estado']],['Proyecto',['proyecto','proyecto_padre']],['Equipo',['codigo_equipo','numero_equipo']]],
    portafolio:[['Equipo',['numero_equipo','identificacion_sitio','id_portafolio']],['Proyecto',['proyecto']],['Zona',['zona_oficial','zona']],['Estatus',['estatus','estado_equipo']],['Tipo',['tipo_equipo','tipo']]],
    proyectos:[['Proyecto',['proyecto','id_proyecto']],['Referencia',['referencia_sitio']],['Estatus',['estatus']],['Vendedor',['vendedor']],['Supervisor',['supervisor_fl']]]
  });
  let activeReader=null;
  let readerEpoch=0;
  let inventoryEpoch=0;

  function readerCanOpen(row,module){
    if(!scopeMatchesSnapshot(row,module)||row?.schema_version!==2||!row.run_id||!isSelected(module.code))return false;
    const perm=window.ManttoPermissions?.state?.(PERMISSION_CODE);
    if(perm?.exists===true&&perm?.efectivo!==true)return false;
    if((navigator.onLine===false||capabilitySource==='cache')&&!readCachedCapability())return false;
    return catalog.some(m=>m.code===module.code&&m.domain===module.domain&&
      m.scope?.scope_signature===module.scope?.scope_signature);
  }
  function readerContext(row){
    return {actor_user_id:actorUserId(),effective_user_id:currentUserId(),domain:row.domain,dataset:row.dataset};
  }
  function closeReader(){
    readerEpoch++;
    activeReader=null;
    const target=document.getElementById('off-local-preview');
    if(target){target.hidden=true;target.replaceChildren();}
  }
  async function renderSavedModules(){
    const target=document.getElementById('off-local-results');if(!target)return;
    closeReader();
    const epoch=++inventoryEpoch;
    target.replaceChildren(create('p','off-muted','Verificando respaldos locales…'));
    if(!window.ManttoOfflineStorage?.verifiedSnapshot||!actorUserId()||!currentUserId()){
      target.replaceChildren(create('p','off-muted','No está disponible el lector o la identidad del usuario.'));return;
    }
    try{
      const rows=await window.ManttoOfflineStorage.listSnapshots({actor_user_id:actorUserId(),effective_user_id:currentUserId()});
      const ready=new Set((capabilities?.datasets||[]).map(d=>`${d.domain}:${String(d.key||'').toUpperCase()}`));
      const allowed=new Map();
      for(const module of catalog){
        if(!isSelected(module.code))continue;
        for(const key of module.datasets||[]){
          const full=`${module.domain}:${String(key).toUpperCase()}`;
          if(ready.has(full))allowed.set(full,module);
        }
      }
      const valid=[],errors=[];
      for(const row of rows||[]){
        const module=allowed.get(`${row.domain}:${row.dataset}`);
        if(!module||!readerCanOpen(row,module))continue;
        try{
          const metadata=await window.ManttoOfflineStorage.verifiedSnapshot(readerContext(row),module.scope.scope_signature);
          if(metadata.run_id!==row.run_id)throw new Error('La copia fue sustituida durante la lectura.');
          valid.push({module,metadata});
        }catch(_error){errors.push(`${module.domain} · ${module.name}`);}
      }
      if(epoch!==inventoryEpoch||!document.getElementById('off-local-results'))return;
      target.replaceChildren();
      for(const {module,metadata} of valid){
        const item=create('div','off-card off-reader-card');
        item.append(create('strong','',`${module.domain} · ${module.name}`),
          create('p','off-muted',`${metadata.record_count.toLocaleString('es-MX')} registros · ${formatBytes(metadata.byte_size)} · ${formatDateTime(metadata.downloaded_at)}`),
          create('p','off-muted',scopeLabel(module)));
        const button=create('button','off-btn off-btn-secondary','Consultar sin conexión');
        button.type='button';button.addEventListener('click',async()=>{
          button.disabled=true;
          try{await openOfflineModule(module,metadata);}
          catch(error){setMessage('off-backup-message',error?.message||'No fue posible abrir el módulo.','error');}
          finally{button.disabled=false;}
        });
        item.append(button);target.append(item);
      }
      if(!valid.length)target.append(create('p','off-muted','No hay módulos seleccionados con respaldos completos y autorizados.'));
      if(errors.length)target.append(create('p','off-muted',`${errors.length} copia(s) no superaron la verificación local. Deben renovarse antes de consultarlas.`));
      const old=(rows||[]).filter(r=>r.schema_version===1&&allowed.has(`${r.domain}:${r.dataset}`));
      if(old.length)target.append(create('p','off-muted','Las copias antiguas requieren un respaldo nuevo para habilitar la navegación completa.'));
    }catch(error){
      if(epoch===inventoryEpoch)target.replaceChildren(create('p','off-muted',error?.message||'No fue posible verificar los respaldos locales.'));
    }
  }
  async function openOfflineModule(module,metadata){
    if(!readerCanOpen(metadata,module))throw new Error('El módulo ya no está autorizado para consulta offline.');
    const epoch=++readerEpoch,context=readerContext(metadata);
    const checked=await window.ManttoOfflineStorage.verifiedSnapshot(context,module.scope.scope_signature);
    if(epoch!==readerEpoch)return false;
    if(checked.run_id!==metadata.run_id)throw new Error('El respaldo fue actualizado. Vuelve a abrir el módulo.');
    const kinds=Object.keys(checked.kind_counts||{});
    if(!kinds.length)throw new Error('El respaldo no contiene conjuntos de información reconocidos.');
    activeReader={module,context,metadata:checked,kinds,kind:kinds[0],search:'',after:0,previous:[],page:1,records:[],hasMore:false};
    renderReaderShell();
    await loadReaderPage();
    return true;
  }
  function readerElement(id){return document.getElementById(id);}
  function renderReaderShell(){
    const target=readerElement('off-local-preview'),r=activeReader;
    if(!target||!r)return;
    target.hidden=false;
    target.innerHTML=`<section class="off-reader" aria-label="Consulta de respaldo offline">
      <div class="off-reader-toolbar"><button type="button" id="off-reader-home" class="off-btn off-btn-secondary">← Módulos respaldados</button>
        <div><h3 id="off-reader-heading"></h3><p class="off-muted" id="off-reader-meta"></p></div></div>
      <div id="off-reader-tabs" class="off-reader-tabs" role="group" aria-label="Conjuntos del módulo"></div>
      <form id="off-reader-search" class="off-reader-search" role="search">
        <label for="off-reader-query">Buscar en todos los registros del respaldo</label>
        <div class="off-reader-search-row"><input id="off-reader-query" type="search" maxlength="120" autocomplete="off" placeholder="Ticket, equipo, proyecto, referencia…" />
          <button type="submit" class="off-btn">Buscar</button><button type="button" id="off-reader-clear" class="off-btn off-btn-secondary">Limpiar</button></div>
      </form>
      <p id="off-reader-status" class="off-muted" role="status" aria-live="polite"></p>
      <div id="off-reader-list"></div>
      <div id="off-reader-detail" hidden></div>
      <nav class="off-reader-pager" id="off-reader-pager" aria-label="Paginación local">
        <button type="button" class="off-btn off-btn-secondary" id="off-reader-previous">← Anterior</button>
        <span id="off-reader-page-label" aria-live="polite"></span>
        <button type="button" class="off-btn off-btn-secondary" id="off-reader-next">Siguiente →</button>
      </nav></section>`;
    readerElement('off-reader-heading').textContent=`${r.module.domain} · ${r.module.name}`;
    readerElement('off-reader-meta').textContent=`Solo lectura local · ${formatDateTime(r.metadata.downloaded_at)} · ${scopeLabel(r.module)}`;
    readerElement('off-reader-home').addEventListener('click',()=>closeReader());
    readerElement('off-reader-search').addEventListener('submit',event=>{
      event.preventDefault();
      const search=String(readerElement('off-reader-query')?.value||'').trim();
      if(!activeReader||search.length>120)return;
      activeReader.search=search;resetReaderCursor();loadReaderPage();
    });
    readerElement('off-reader-clear').addEventListener('click',()=>{
      if(!activeReader)return;readerElement('off-reader-query').value='';activeReader.search='';resetReaderCursor();loadReaderPage();
    });
    readerElement('off-reader-previous').addEventListener('click',()=>{
      if(!activeReader||!activeReader.previous.length)return;
      activeReader.after=activeReader.previous.pop();activeReader.page=Math.max(1,activeReader.page-1);loadReaderPage();
    });
    readerElement('off-reader-next').addEventListener('click',()=>{
      if(!activeReader||!activeReader.hasMore||!activeReader.records.length)return;
      activeReader.previous.push(activeReader.after);
      const key=activeReader.kind==='tickets'?'id':activeReader.kind==='portafolio'?'id_portafolio':'id_ins_fl';
      activeReader.after=Number(activeReader.records[activeReader.records.length-1][key]);
      activeReader.page++;loadReaderPage();
    });
    renderReaderTabs();
  }
  function resetReaderCursor(){
    if(!activeReader)return;
    activeReader.after=0;activeReader.previous=[];activeReader.page=1;
    readerElement('off-reader-detail').hidden=true;
    readerElement('off-reader-list').hidden=false;
    readerElement('off-reader-pager').hidden=false;
  }
  function renderReaderTabs(){
    const target=readerElement('off-reader-tabs'),r=activeReader;
    if(!target||!r)return;target.replaceChildren();
    for(const kind of r.kinds){
      const button=create('button',`off-btn ${kind===r.kind?'':'off-btn-secondary'}`,
        `${READER_LABELS[kind]||kind} (${Number(r.metadata.kind_counts[kind]||0).toLocaleString('es-MX')})`);
      button.type='button';button.setAttribute('aria-pressed',kind===r.kind?'true':'false');
      button.addEventListener('click',()=>{
        if(!activeReader||activeReader.kind===kind)return;
        activeReader.kind=kind;activeReader.search='';readerElement('off-reader-query').value='';
        resetReaderCursor();renderReaderTabs();loadReaderPage();
      });target.append(button);
    }
  }
  async function loadReaderPage(){
    const r=activeReader,epoch=++readerEpoch;
    const status=readerElement('off-reader-status');if(status)status.textContent='Leyendo página desde IndexedDB…';
    if(!r||!readerCanOpen(r.metadata,r.module)){closeReader();setMessage('off-backup-message','La autorización offline ya no está vigente.','error');return;}
    const prev=readerElement('off-reader-previous'),next=readerElement('off-reader-next');
    if(prev)prev.disabled=true;if(next)next.disabled=true;
    try{
      const page=await window.ManttoOfflineStorage.readSnapshotPage(r.context,{
        scope_signature:r.metadata.scope_signature,run_id:r.metadata.run_id,
        kind:r.kind,limit:30,after_id:r.after,search:r.search
      });
      if(epoch!==readerEpoch||activeReader!==r)return;
      r.records=page.rows;r.hasMore=page.has_more;
      renderReaderRows();
      if(status)status.textContent=page.rows.length?
        `Página ${r.page} · ${page.rows.length} registros visibles · ${r.metadata.kind_counts[r.kind]} registros respaldados`:
        (r.search?'No se encontraron coincidencias en este respaldo.':'Este conjunto está vacío.');
    }catch(error){
      if(epoch!==readerEpoch)return;
      if(status)status.textContent=error?.message||'No se pudo consultar la copia.';
      const list=readerElement('off-reader-list');if(list)list.replaceChildren();
      r.records=[];r.hasMore=false;
    }finally{
      if(epoch===readerEpoch){
        if(prev)prev.disabled=!r.previous.length;
        if(next)next.disabled=!r.hasMore;
        const label=readerElement('off-reader-page-label');if(label)label.textContent=`Página ${r.page}`;
      }
    }
  }
  function renderReaderRows(){
    const r=activeReader,target=readerElement('off-reader-list');if(!r||!target)return;
    target.replaceChildren();
    readerElement('off-reader-detail').hidden=true;
    target.hidden=false;readerElement('off-reader-pager').hidden=false;
    const columns=READER_FIELDS[r.kind];if(!columns)return;
    const wrap=create('div','off-table-wrap');
    const table=create('table','off-table');
    const head=create('thead'),header=create('tr');
    for(const [title] of columns)header.append(create('th','',title));
    header.append(create('th','','Detalle'));
    head.append(header);table.append(head);
    const body=create('tbody');
    for(const record of r.records){
      const tr=create('tr');
      for(const [_title,keys] of columns)tr.append(create('td','',firstValue(record,keys)));
      const td=create('td');const button=create('button','off-btn off-btn-secondary','Ver detalle');
      button.type='button';button.addEventListener('click',()=>renderReaderDetail(record));
      td.append(button);tr.append(td);body.append(tr);
    }
    table.append(body);wrap.append(table);target.append(wrap);
  }
  function renderReaderDetail(record){
    const r=activeReader,detail=readerElement('off-reader-detail');if(!r||!detail)return;
    if(!readerCanOpen(r.metadata,r.module)){closeReader();return;}
    detail.hidden=false;detail.replaceChildren();
    readerElement('off-reader-list').hidden=true;readerElement('off-reader-pager').hidden=true;
    const back=create('button','off-btn off-btn-secondary','← Volver al listado');back.type='button';
    back.addEventListener('click',()=>{
      detail.hidden=true;readerElement('off-reader-list').hidden=false;readerElement('off-reader-pager').hidden=false;
    });
    detail.append(back,create('h4','off-reader-detail-title',`Detalle · ${READER_LABELS[r.kind]||r.kind}`));
    const grid=create('dl','off-reader-detail-grid');
    for(const [field,value] of Object.entries(record||{})){
      if(/password|contrasen|secret|token|api[_-]?key|private[_-]?key|credential/i.test(field))continue;
      let label=field.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
      let text;
      if(value===null||value===undefined)text='—';
      else if(typeof value==='string'||typeof value==='number'||typeof value==='boolean'){
        text=String(value);
        if(/^data:|^blob:/i.test(text)||text.length>12000)text='Archivo o dato extenso no disponible en esta vista previa.';
      }else text='Campo compuesto no disponible en esta vista previa.';
      const group=create('div','off-reader-detail-field');
      group.append(create('dt','',label),create('dd','',text));grid.append(group);
    }
    detail.append(grid,create('p','off-muted','Datos del respaldo de solo lectura. Las operaciones nuevas quedarán pendientes de enviar. Los originales adjuntos no se descargan.'));
    renderOfflineActionForm(record);
  }

  const ACTION_OPTIONS=Object.freeze({
    tickets:[['TICKET_COMMENT','Agregar comentario'],['TICKET_MOVEMENT','Registrar movimiento operativo']],
    portafolio:[['EQUIPMENT_MOVEMENT','Registrar movimiento del equipo']],
    proyectos:[['PROJECT_COMMENT','Agregar comentario del proyecto'],['PROJECT_MOVEMENT','Registrar movimiento operativo']]
  });
  const READER_ID=Object.freeze({tickets:'id',portafolio:'id_portafolio',proyectos:'id_ins_fl'});
  const ACTION_LABEL=Object.freeze({
    TICKET_COMMENT:'Comentario en ticket',TICKET_MOVEMENT:'Movimiento de ticket',
    EQUIPMENT_MOVEMENT:'Movimiento de equipo',PROJECT_COMMENT:'Comentario de proyecto',
    PROJECT_MOVEMENT:'Movimiento de proyecto'
  });
  function pendingIdentity(){return {actor_user_id:actorUserId(),effective_user_id:currentUserId()};}
  function renderOfflineActionForm(record){
    const r=activeReader,detail=readerElement('off-reader-detail');
    if(!r||!detail||isViewer()||!readerCanOpen(r.metadata,r.module))return;
    const types=ACTION_OPTIONS[r.kind];if(!types||!types.length)return;
    const form=create('form','off-writer');
    const title=create('h4','','Crear operación local pendiente');
    const help=create('p','off-muted','Esta operación no cambia el registro en el servidor hasta su futura sincronización.');
    const typeLabel=create('label','', 'Tipo de operación');
    const type=create('select');type.required=true;
    for(const [key,name] of types){
      const option=create('option','',name);option.value=key;type.append(option);
    }
    type.value=types[0][0];
    typeLabel.append(type);
    const textLabel=create('label','', 'Comentario o descripción del movimiento');
    const field=create('textarea');field.rows=4;field.maxLength=2000;field.required=true;
    field.placeholder='Describe el comentario o movimiento que deseas registrar…';
    textLabel.append(field);
    const button=create('button','off-btn','Guardar como pendiente');button.type='submit';
    const result=create('p','off-message');result.setAttribute('role','status');
    form.addEventListener('submit',async event=>{
      event.preventDefault();
      if(isViewer()||!activeReader||activeReader!==r||!readerCanOpen(r.metadata,r.module)){
        result.textContent='El alcance o la identidad cambiaron. No se guardó la operación.';return;
      }
      const raw=String(field.value||'').trim();
      if(!raw||raw.length>2000){result.textContent='Introduce entre 1 y 2000 caracteres.';return;}
      button.disabled=true;
      try{
        const operation=await window.ManttoOfflineStorage.enqueueOfflineAction(r.context,{
          action:type.value,kind:r.kind,record_id:record[READER_ID[r.kind]],
          scope_signature:r.metadata.scope_signature,run_id:r.metadata.run_id,text:raw
        });
        result.textContent=`Operación ${operation.id} guardada localmente. Pendiente de sincronización; Aiven no se modificó.`;
        field.value='';
        await renderPendingActions();
        await updateDeviceDiagnostics();
        window.ManttoOfflineScheduler?.refreshPendingNotice?.();
        if(navigator.onLine!==false&&typeof CustomEvent==='function')
          document.dispatchEvent?.(new CustomEvent('mantto:offline-action-created'));
      }catch(error){result.textContent=error?.message||'No se pudo guardar la operación local.';}
      finally{button.disabled=false;}
    });
    form.append(title,help,typeLabel,textLabel,button,result);detail.append(form);
  }
  async function manualSyncNow(){
    if(isViewer())return setMessage('off-pending-message','Visor no puede sincronizar movimientos.','error');
    if(navigator.onLine===false)return setMessage('off-pending-message','Necesitas conexión para sincronizar.','error');
    const button=document.getElementById('off-sync-now');if(button)button.disabled=true;
    setMessage('off-pending-message','Comprobando permisos y enviando pendientes…','info');
    try{
      const report=await window.ManttoOfflineScheduler?.syncPendingNow?.({manual:true});
      if(!report||report.skipped)throw new Error('La sincronización todavía no está disponible.');
      setMessage('off-pending-message',`${report.sent} operaciones confirmadas en Aiven · ${report.conflicts} requieren revisión · ${report.retried} se reintentarán.`,
        report.conflicts?'error':'ok');
      await renderPendingActions();await updateDeviceDiagnostics();
    }catch(error){setMessage('off-pending-message',error?.message||'No se pudo sincronizar.','error');}
    finally{if(button)button.disabled=false;}
  }

  async function renderPendingActions(){
    const target=document.getElementById('off-pending-list');
    if(!target||!actorUserId()||!currentUserId())return;
    target.replaceChildren(create('p','off-muted','Comprobando operaciones locales…'));
    const originalKey=`${actorUserId()}:${currentUserId()}`;
    try{
      const items=await window.ManttoOfflineStorage.listPendingActions(pendingIdentity());
      if(!document.getElementById('off-pending-list')||originalKey!==`${actorUserId()}:${currentUserId()}`)return;
      target.replaceChildren();
      if(!items.length){target.append(create('p','off-muted','No tienes comentarios ni movimientos pendientes.'));return;}
      target.append(create('p','off-muted',`${items.length} operaciones locales sin confirmar. ${navigator.onLine===false?'Conéctate para sincronizarlas.':'La sincronización automática está disponible; los conflictos requieren revisión.'}`));
      const visibleCatalog=new Map();
      for(const m of catalog){
        for(const d of m.datasets||[])visibleCatalog.set(`${m.domain}:${d.toUpperCase()}`,m.scope?.scope_signature);
      }
      for(const item of items){
        // No mostrar textos de registros si su dominio/módulo perdió el permiso.
        if(visibleCatalog.get(`${item.domain}:${item.dataset}`)!==item.scope_signature)continue;
        const row=create('div','off-pending-row');
        const left=create('div');left.style.flex='1';
        left.append(create('strong','',ACTION_LABEL[item.action]||'Operación local'),
          create('p','off-muted',`${item.domain} · ${item.reference} · ${formatDateTime(item.created_at)}`),
          create('p','',item.payload?.text||''),
          create('p','off-muted',item.status==='REQUIERE_REVISION'?`Requiere revisión: ${item.last_error||'Conflicto al sincronizar'}`:
            item.status==='ENVIANDO'?'Intentando obtener acuse de Aiven…':'Pendiente en este dispositivo · aún sin confirmación de Aiven'));
        row.append(left);
        if(!isViewer()&&item.status!=='ENVIANDO'){
          if(item.status==='REQUIERE_REVISION'){
            const retry=create('button','off-btn off-btn-secondary','Revisado · volver a intentar');retry.type='button';
            retry.addEventListener('click',async()=>{
              retry.disabled=true;
              try{await window.ManttoOfflineStorage.requeueReviewedAction(pendingIdentity(),item.id);
                await renderPendingActions();window.ManttoOfflineScheduler?.syncPendingNow?.({manual:true}).catch(()=>{});}
              catch(error){setMessage('off-pending-message',error.message,'error');retry.disabled=false;}
            });row.append(retry);
          }
          const discard=create('button','off-btn off-btn-secondary','Descartar pendiente');discard.type='button';
          discard.addEventListener('click',async()=>{
            if(typeof window.confirm==='function'&&!window.confirm('¿Eliminar este pendiente local? No se puede recuperar.'))return;
            discard.disabled=true;
            try{
              await window.ManttoOfflineStorage.discardPendingAction(pendingIdentity(),item.id);
              setMessage('off-pending-message','Operación pendiente descartada del dispositivo.','info');
              await renderPendingActions();await updateDeviceDiagnostics();
              window.ManttoOfflineScheduler?.refreshPendingNotice?.();
            }catch(error){setMessage('off-pending-message',error?.message||'No se pudo descartar.','error');discard.disabled=false;}
          });row.append(discard);
        }
        target.append(row);
      }
    }catch(error){target.replaceChildren(create('p','off-muted',error?.message||'No disponible.'));}
  }

  async function refreshSnapshotMetadata(){
    const last=document.getElementById('off-last-backup'),count=document.getElementById('off-record-count'),size=document.getElementById('off-backup-size');
    try{
      const storage=window.ManttoOfflineStorage;
      const rows=await storage.listSnapshots({actor_user_id:actorUserId(),effective_user_id:currentUserId()});
      const ready=new Set((capabilities?.datasets||[]).map(d=>`${d.domain}:${String(d.key||'').toUpperCase()}`));
      let records=0,bytes=0,newest=0;
      for(const row of rows||[]){
        const module=catalog.find(m=>m.domain===row.domain&&isSelected(m.code)&&
          (m.datasets||[]).some(key=>`${m.domain}:${String(key).toUpperCase()}`===`${row.domain}:${row.dataset}`));
        if(!module||!ready.has(`${row.domain}:${row.dataset}`)||!readerCanOpen(row,module))continue;
        try{
          const verified=await storage.verifiedSnapshot(readerContext(row),module.scope.scope_signature);
          records+=verified.record_count;bytes+=verified.byte_size;
          const time=Date.parse(verified.downloaded_at);
          if(Number.isFinite(time)&&time>newest)newest=time;
        }catch(_error){/* No sumar respaldos incompletos ni caducados. */}
      }
      if(last)last.textContent=newest?formatDateTime(newest):'Nunca';
      if(count)count.textContent=records.toLocaleString('es-MX');
      if(size)size.textContent=formatBytes(bytes);
    }catch(error){if(last)last.textContent=error?.message||'No disponible';}
  }
  async function downloadSnapshot(){
    if(isViewer())return setMessage('off-backup-message','El Modo Visor no puede crear copias.','error');
    if(navigator.onLine===false)return setMessage('off-backup-message','No hay conexión.','error');
    if(!window.ManttoOfflineScheduler?.backupNow)return setMessage('off-backup-message','El programador automático no está disponible.','error');
    const button=document.getElementById('off-download');if(button)button.disabled=true;
    setMessage('off-backup-message','Respaldando módulos autorizados por bloques…','info');
    try{
      const report=await window.ManttoOfflineScheduler.backupNow();
      if(report?.skipped)throw new Error('El respaldo no se pudo iniciar: '+report.reason);
      if(report?.failed?.length)throw new Error('Uno o más módulos fallaron; se conservó la copia anterior de los afectados.');
      const count=report?.completed?.length||0;
      setMessage('off-backup-message',report?.unsupported?.length?
        `${count} módulos respaldados. ${report.unsupported.length} módulos aún no tienen exportador certificado.`:
        `${count} módulos respaldados correctamente.`,report?.unsupported?.length?'info':'ok');
      await refreshSnapshotMetadata();await renderSavedModules();
    }catch(error){setMessage('off-backup-message',error?.message||'No fue posible guardar los respaldos.','error');}
    finally{if(button)button.disabled=false;}
  }
  async function readLocalSnapshot(){
    const button=document.getElementById('off-read');if(button)button.disabled=true;
    try{
      const rows=await window.ManttoOfflineStorage.listSnapshots({actor_user_id:actorUserId(),effective_user_id:currentUserId()});
      const ready=new Set((capabilities?.datasets||[]).map(d=>`${d.domain}:${String(d.key||'').toUpperCase()}`));
      for(const row of rows||[]){
        const module=catalog.find(m=>isSelected(m.code)&&m.domain===row.domain&&
          (m.datasets||[]).some(key=>`${m.domain}:${String(key).toUpperCase()}`===`${row.domain}:${row.dataset}`));
        if(!module||!ready.has(`${row.domain}:${row.dataset}`)||!readerCanOpen(row,module))continue;
        await openOfflineModule(module,row);
        setMessage('off-backup-message','Módulo abierto desde el almacenamiento local.','ok');
        return;
      }
      throw new Error('No hay módulos respaldados y verificados para tu alcance actual.');
    }catch(error){setMessage('off-backup-message',error?.message||'No se pudo abrir la copia local.','error');}
    finally{if(button)button.disabled=false;}
  }
  function firstValue(row,keys){for(const k of keys)if(row?.[k]!==undefined&&row[k]!==null&&String(row[k]).trim()!=='')return row[k];return '—';}
  async function init(){
    renderLoading();
    if(!window.ManttoOfflineStorage){renderDenied('El motor de almacenamiento offline no está disponible.');return false;}
    try{
      capabilities=await resolveCapabilities();
      if(!capabilities){renderDenied();return false;}
      catalog=safeCatalog(capabilities.catalog_modules);
      excluded=readExcluded();
      renderPage();return true;
    }catch(error){renderDenied(error?.status===403?'El backend de BLT NOW rechazó este acceso.':(error?.message||'No fue posible validar el acceso.'));return false;}
  }
  document.addEventListener?.('mantto:offline-outbox-changed',()=>{
    if(!root()||!capabilities)return;
    renderPendingActions();updateDeviceDiagnostics();
  });
  window.addEventListener?.('online',()=>{if(root()&&capabilities)renderPendingActions();});
  window.addEventListener?.('offline',()=>{if(root()&&capabilities)renderPendingActions();});
  document.addEventListener?.('mantto:offline-backup-progress',event=>{
    const d=event.detail||{};
    if(root())setMessage('off-backup-message',`${d.module||d.dataset}: ${d.kind||''} ${d.count||0} / ${d.total||0}`, 'info');
  });
  document.addEventListener?.('mantto:offline-sync-summary',async event=>{
    if(!root()||!capabilities)return;
    const d=event.detail||{};
    setMessage('off-pending-message',`${d.sent||0} confirmadas · ${d.conflicts||0} con conflicto · ${d.retried||0} para reintentar.`,d.conflicts?'error':'info');
    await renderPendingActions();await updateDeviceDiagnostics();
  });
  document.addEventListener?.('mantto:offline-backup-summary',async event=>{
    if(!root()||!capabilities)return;
    const d=event.detail||{};
    setMessage('off-backup-message',d.failed?.length?'Hay respaldos pendientes o fallidos.':
      d.unsupported?.length?`Respaldos disponibles actualizados; ${d.unsupported.length} módulos sin exportador.`:
      'Respaldo automático finalizado.','info');
    try{await refreshSnapshotMetadata();await renderSavedModules();}catch(_error){}
  });
  // Nunca conservar el DOM de copias tras cerrar/cambiar de identidad.
  function discardOfflineView(){
    inventoryEpoch++;closeReader();
    capabilities=null;catalog=[];excluded=new Set();
    const view=root();if(view)view.replaceChildren();
  }
  document.addEventListener?.('mantto:logout',discardOfflineView);
  document.addEventListener?.('mantto:session-expired',discardOfflineView);
  document.addEventListener?.('mantto:view-user-changed',discardOfflineView);
  document.addEventListener?.('mantto:permissions-updated',()=>{
    const state=window.ManttoPermissions?.state?.(PERMISSION_CODE);
    if(state?.exists===true&&state?.efectivo!==true){
      discardOfflineView();renderDenied('Tu acceso offline fue revocado.');
    }
  });
  window.ManttoOfflinePilot={init,permissionCode:PERMISSION_CODE};
})();

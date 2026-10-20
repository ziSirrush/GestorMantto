/* BLT NOW | Nueva implementacion de navegacion offline, Fase 1 V001.
 * Solo conectividad y barra lateral. Los adaptadores de datos de las vistas
 * normales corresponden a Fases 2 y 3. No modifica rutas ni datos operativos.
 */
(function(){
  'use strict';
  if(window.ManttoOfflineNavigation)return;

  const OFFLINE_PERMISSION='GENERAL_MODO_OFFLINE_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';
  const HEALTH_PATH='/api/health';
  const INTERVAL_MS=60000;
  const TIMEOUT_MS=6000;
  // Catalogo cerrado: solo rutas existentes con exportadores certificados.
  const CERTIFIED=Object.freeze([
    {route:'resumen',code:'OPERACION_RESUMEN_DEL_DIA',domain:'UNITED',dataset:'operacion-resumen-dia'},
    {route:'instalaciones-proyectos',code:'INSTALACIONES_PROYECTOS',domain:'CORELLIAN',dataset:'instalaciones-proyectos'}
  ]);
  let mode='CHECKING',identityKey='',allowedRoutes=new Set(),checkTask=null;
  let revision=0,initialized=false,observer=null,refreshQueued=false;

  function positiveId(value){const n=Number(value);return Number.isSafeInteger(n)&&n>0?n:null;}
  function identities(){
    const auth=window.ManttoAuth;
    const real=auth?.getActorUser?.(),effective=auth?.getUser?.();
    const actor=positiveId(real?.id_SB||real?.id||real?.user_id);
    const user=positiveId(effective?.id_SB||effective?.id||effective?.user_id);
    return actor&&user?{actor,user,key:`${actor}:${user}`}:null;
  }
  function isOffline(){return mode==='OFFLINE';}
  function canOpenRouteOffline(route){return isOffline()&&allowedRoutes.has(String(route||''));}
  function hasCachedAccess(ids){
    const storage=window.ManttoOfflineStorage;
    if(!storage||typeof storage.readCachedAccess!=='function')return null;
    const access=storage.readCachedAccess(ids.actor,ids.user);
    if(!access||access.permission_code!==OFFLINE_PERMISSION||Number(access.effective_user_id)!==ids.user||
      !Array.isArray(access.catalog_modules))return null;
    if(Number(access.actor_user_id||ids.actor)!==ids.actor)return null;
    return access;
  }

  function createBanner(){
    let banner=document.getElementById('bltnow-offline-connection');
    if(banner)return banner;
    const host=document.getElementById('app-context-nav');
    if(!host?.parentElement)return null;
    if(!document.getElementById('bltnow-offline-connection-style')){
      const css=document.createElement('style');
      css.id='bltnow-offline-connection-style';
      css.textContent=`
        #bltnow-offline-connection{display:flex;align-items:center;justify-content:space-between;
          gap:12px;flex-wrap:wrap;padding:10px 20px;background:#fff7e8;color:#713c05;
          border-bottom:1px solid #e0bb71;font-size:13px;font-weight:600}
        #bltnow-offline-connection[hidden]{display:none!important}
        #bltnow-offline-connection .bltnow-connection-copy{display:grid;gap:2px}
        #bltnow-offline-connection .bltnow-connection-note{font-size:12px;font-weight:400}
        #bltnow-offline-retry{padding:8px 14px;border:1px solid #93620c;border-radius:9px;
          background:#fff;color:#713c05;font-weight:700;cursor:pointer}
        #bltnow-offline-retry:disabled{opacity:.6;cursor:wait}
        @media(max-width:600px){#bltnow-offline-connection{padding:9px 12px}}
      `;
      document.head.appendChild(css);
    }
    banner=document.createElement('div');
    banner.id='bltnow-offline-connection';banner.hidden=true;
    banner.setAttribute('role','status');banner.setAttribute('aria-live','polite');
    const copy=document.createElement('div');copy.className='bltnow-connection-copy';
    const title=document.createElement('strong');title.id='bltnow-offline-title';
    const note=document.createElement('span');note.id='bltnow-offline-note';note.className='bltnow-connection-note';
    copy.append(title,note);
    const retry=document.createElement('button');retry.id='bltnow-offline-retry';retry.type='button';
    retry.textContent='↻ Reconectar';
    retry.addEventListener('click',()=>{check({manual:true}).catch(error=>{
      console.warn('[Offline] Falló la verificación manual.',error);
    });});
    banner.append(copy,retry);
    host.insertAdjacentElement('afterend',banner);
    return banner;
  }
  function renderBanner(checking=false){
    const banner=createBanner();if(!banner)return;
    const offline=isOffline();
    banner.hidden=!offline;
    if(!offline)return;
    const title=document.getElementById('bltnow-offline-title');
    const note=document.getElementById('bltnow-offline-note');
    const button=document.getElementById('bltnow-offline-retry');
    if(title)title.textContent=checking?'Comprobando conexión con BLT NOW…':'Sin conexión con BLT NOW';
    if(note)note.textContent=checking?'Volviendo a consultar la API operativa.':
      allowedRoutes.size?`${allowedRoutes.size} módulo(s) con copia local validada y disponibles en su menu habitual.`:
      'No hay módulos disponibles con copia local validada.';
    if(button){button.disabled=checking;button.textContent=checking?'Verificando…':'↻ Reconectar';}
  }
  function updateSidebar(){
    if(!isOffline())return;
    const sidebar=document.getElementById('sidebar');if(!sidebar)return;
    sidebar.querySelectorAll('.side-item[data-permission]').forEach(item=>{
      const route=item.dataset?.route||'';
      const show=route==='home'||route==='offline-configuracion'&&Boolean(identities()&&hasCachedAccess(identities()))||
        canOpenRouteOffline(route);
      if(item.hidden===show)item.hidden=!show;
    });
    sidebar.querySelectorAll('.side-group').forEach(group=>{
      const show=[...group.querySelectorAll('.side-item')].some(item=>!item.hidden);
      if(group.hidden===show)group.hidden=!show;
    });
  }
  function scheduleSidebar(){
    if(refreshQueued)return;
    refreshQueued=true;
    Promise.resolve().then(()=>{refreshQueued=false;updateSidebar();});
  }
  function watchSidebar(){
    if(observer||typeof MutationObserver!=='function')return;
    const sidebar=document.getElementById('sidebar');if(!sidebar)return;
    observer=new MutationObserver(()=>{if(isOffline())scheduleSidebar();});
    observer.observe(sidebar,{subtree:true,attributes:true,attributeFilter:['hidden']});
  }
  async function verifiedRoutes(ids,token){
    const storage=window.ManttoOfflineStorage;
    if(typeof storage?.verifiedSnapshot!=='function')return new Set();
    const access=hasCachedAccess(ids);if(!access)return new Set();
    const result=new Set();
    for(const certified of CERTIFIED){
      const module=access.catalog_modules.find(item=>item?.code===certified.code&&
        item.domain===certified.domain&&item.backup_status==='EXPORTADOR_COMPLETO'&&
        Array.isArray(item.datasets)&&item.datasets.includes(certified.dataset));
      const signature=module?.scope?.scope_signature;
      if(typeof signature!=='string'||!/^[a-f0-9]{64}$/.test(signature))continue;
      if(revision!==token||identityKey!==ids.key||!isOffline())return new Set();
      try{
        const snapshot=await storage.verifiedSnapshot({actor_user_id:ids.actor,
          effective_user_id:ids.user,domain:certified.domain,dataset:certified.dataset},signature);
        if(snapshot?.schema_version===2&&snapshot.read_only===true&&
          snapshot.domain===certified.domain&&snapshot.dataset===certified.dataset&&
          snapshot.scope_signature===signature&&snapshot.actor_user_id===ids.actor&&
          snapshot.effective_user_id===ids.user)result.add(certified.route);
      }catch(_error){/* La copia incompleta/revocada no se muestra. */}
    }
    // A long IndexedDB verification may cross the access TTL or a scope refresh.
    // Never publish routes from permissions that changed during that read.
    const current=hasCachedAccess(ids);
    if(!current||revision!==token||identityKey!==ids.key||!isOffline())return new Set();
    return new Set([...result].filter(route=>{
      const item=CERTIFIED.find(entry=>entry.route===route);
      const original=access.catalog_modules.find(entry=>entry.code===item.code&&
        entry.domain===item.domain&&entry.backup_status==='EXPORTADOR_COMPLETO'&&
        entry.datasets?.includes(item.dataset));
      const fresh=current.catalog_modules.find(entry=>entry.code===item.code&&
        entry.domain===item.domain&&entry.backup_status==='EXPORTADOR_COMPLETO'&&
        entry.datasets?.includes(item.dataset));
      return original?.scope?.scope_signature&&
        fresh?.scope?.scope_signature===original.scope.scope_signature;
    }));
  }
  async function showOffline(){
    const ids=identities();
    mode='OFFLINE';identityKey=ids?.key||'';allowedRoutes=new Set();
    const token=++revision;
    renderBanner();scheduleSidebar();watchSidebar();
    if(!ids)return;
    const routes=await verifiedRoutes(ids,token);
    if(revision!==token||mode!=='OFFLINE'||identities()?.key!==ids.key)return;
    allowedRoutes=routes;
    renderBanner();scheduleSidebar();
    document.dispatchEvent(new CustomEvent('mantto:offline-navigation-changed',{
      detail:{offline:true,available_routes:[...routes]}
    }));
  }
  async function restoreOnline(wasOffline){
    const token=++revision;
    mode='ONLINE';allowedRoutes=new Set();renderBanner();
    if(!wasOffline)return;
    // Nunca conservar en memoria la autorización offline como permiso online.
    let verifiedPermissions=false;
    try{
      if(typeof window.ManttoPermissions?.reload!=='function')throw new Error('Validador de permisos no disponible.');
      await window.ManttoPermissions.reload();verifiedPermissions=true;
    }catch(error){
      console.warn('[Offline] La API respondió, pero no fue posible revalidar permisos.',error?.message||error);
    }
    if(token!==revision||mode!=='ONLINE')return;
    if(!verifiedPermissions){
      // Proteger el menú cuando la salud de API se recuperó pero la identidad no.
      const sidebar=document.getElementById('sidebar');
      sidebar?.querySelectorAll('.side-item[data-permission]')?.forEach(item=>{
        if(item.dataset?.route!=='home')item.hidden=true;
      });
      sidebar?.querySelectorAll('.side-group')?.forEach(group=>{group.hidden=true;});
      return;
    }
    window.ManttoUserViewer?.applySidebar?.();
    try{await window.ManttoOfflineScheduler?.revalidateCopies?.(true);}catch(error){
      console.warn('[Offline] Quedó pendiente la revalidación de copias.',error?.message||error);
    }
    if(token!==revision||mode!=='ONLINE')return;
    // La sincronización existente vuelve a comprobar actor, permisos y alcance.
    try{await window.ManttoOfflineScheduler?.syncPendingNow?.();}catch(error){
      console.warn('[Offline] Pendientes aún sin sincronizar.',error?.message||error);
    }
    document.dispatchEvent(new CustomEvent('mantto:offline-navigation-changed',{
      detail:{offline:false,available_routes:[]}
    }));
  }
  async function probeHealth(){
    const base=String(window.MANTTO_API_BASE||'').replace(/\/$/,'');
    if(!/^https?:\/\//i.test(base))return false;
    const controller=typeof AbortController==='function'?new AbortController():null;
    const timeout=window.setTimeout(()=>controller?.abort(),TIMEOUT_MS);
    try{
      const result=await fetch(base+HEALTH_PATH+'?offline_probe='+Date.now(),{
        method:'GET',mode:'cors',credentials:'omit',cache:'no-store',
        ...(controller?{signal:controller.signal}:{}),
        headers:{Accept:'application/json'}
      });
      if(!result.ok)return false;
      const response=await result.json();
      return response?.ok===true&&response?.database==='connected';
    }catch(_error){return false;}
    finally{window.clearTimeout(timeout);}
  }
  async function check({manual=false}={}){
    if(checkTask)return checkTask;
    const ids=identities();
    if(!ids){mode='CHECKING';allowedRoutes=new Set();identityKey='';revision++;renderBanner();return {online:null,reason:'no-session'};}
    checkTask=(async()=>{
      if(!manual&&navigator.onLine===false){
        // Comprobar vigencia local sin escanear los bloques cada minuto.
        if(!isOffline()||identityKey!==ids.key||!hasCachedAccess(ids))await showOffline();
        return {online:false,reason:'browser-offline'};
      }
      const wasOffline=isOffline();
      if(wasOffline)renderBanner(true);
      const connected=await probeHealth();
      if(!identities()||identities().key!==ids.key)return {online:null,reason:'identity-changed'};
      if(connected){await restoreOnline(wasOffline);return {online:true};}
      if(!isOffline()||identityKey!==ids.key||!hasCachedAccess(ids))await showOffline();
      else {renderBanner();scheduleSidebar();}
      return {online:false,reason:'api-unavailable'};
    })();
    try{return await checkTask;}finally{checkTask=null;renderBanner();}
  }
  function reset(){
    revision++;mode='CHECKING';identityKey='';allowedRoutes=new Set();renderBanner();
  }
  function installResumenOfflineAdapter(){
    if(window.ManttoOfflineResumenDia||typeof document.createElement!=='function'||
       !document.head?.appendChild||document.getElementById?.('bltnow-offline-resumen-f2'))return;
    const script=document.createElement('script');
    script.id='bltnow-offline-resumen-f2';
    script.src='./core/offline-resumen-dia.js?v=20261020-navegacion-offline-f5-v001';
    script.async=false;
    script.addEventListener('error',()=>console.warn('[Offline] No fue posible cargar el lector del Resumen del Dia.'));
    document.head.appendChild(script);
  }
  function installInstalacionesOfflineAdapter(){
    if(window.ManttoOfflineInstalacionesProyectos||typeof document.createElement!=='function'||
       !document.head?.appendChild||document.getElementById?.('bltnow-offline-instalaciones-f3'))return;
    const script=document.createElement('script');
    script.id='bltnow-offline-instalaciones-f3';
    script.src='./core/offline-instalaciones-proyectos.js?v=20261020-navegacion-offline-f5-v001';
    script.async=false;
    script.addEventListener('error',()=>console.warn('[Offline] No fue posible cargar el lector CORELLIAN de Instalaciones.'));
    document.head.appendChild(script);
  }
  function installNativeActionsBridge(){
    if(window.ManttoOfflineNativeActions||typeof document.createElement!=='function'||
       !document.head?.appendChild||document.getElementById?.('bltnow-offline-native-actions-f4'))return;
    const script=document.createElement('script');
    script.id='bltnow-offline-native-actions-f4';
    script.src='./core/offline-native-actions.js?v=20261020-navegacion-offline-f5-v001';
    script.async=false;
    script.addEventListener('error',()=>console.warn('[Offline] No fue posible cargar la captura desde las pantallas normales.'));
    document.head.appendChild(script);
  }
  function start(){
    installResumenOfflineAdapter();
    installInstalacionesOfflineAdapter();
    installNativeActionsBridge();
    if(initialized)return;
    initialized=true;createBanner();watchSidebar();
    document.addEventListener('mantto:auth-ready',()=>{check().catch(error=>console.warn('[Offline] Conexión:',error));});
    document.addEventListener('mantto:view-user-changed',()=>{reset();check().catch(()=>{});});
    document.addEventListener('mantto:logout',reset);
    document.addEventListener('mantto:session-expired',reset);
    document.addEventListener('mantto:offline-backup-completed',()=>{if(isOffline())showOffline().catch(()=>{});});
    document.addEventListener('mantto:offline-capabilities-updated',()=>{if(isOffline())showOffline().catch(()=>{});});
    window.addEventListener('offline',()=>{showOffline().catch(()=>{});});
    window.addEventListener('online',()=>{check().catch(()=>{});});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)check().catch(()=>{});});
    window.setInterval(()=>{if(!document.hidden&&identities())check().catch(()=>{});},INTERVAL_MS);
    if(identities())check().catch(()=>{});
  }
  window.ManttoOfflineNavigation=Object.freeze({
    check,isOffline,canOpenRouteOffline,visibleRoutes:()=>[...allowedRoutes],
    status:()=>mode,healthPath:HEALTH_PATH,certifiedRoutes:()=>CERTIFIED.map(item=>item.route)
  });
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();

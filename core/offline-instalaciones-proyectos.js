/* BLT NOW | Nueva navegacion offline, Fase 3 V001.
 * Adaptador CORELLIAN exclusivamente de lectura para la interfaz existente de
 * Instalaciones > Proyectos y su expediente unificado en el motor normal.
 * No sustituye Aiven, no intercepta otras pantallas y no habilita escrituras.
 */
(function(){
  'use strict';
  if(window.ManttoOfflineInstalacionesProyectos)return;

  const OFFLINE_PERMISSION='GENERAL_MODO_OFFLINE_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';
  const MODULE='INSTALACIONES_PROYECTOS';
  const DOMAIN='CORELLIAN';
  const DATASET='instalaciones-proyectos';
  const RECORD_PATH='/api/ins-fl';
  const AUTHORIZED_ROUTE='instalaciones-proyectos';
  const COPY_SIGNATURE=/^[a-f0-9]{64}$/;
  const API_PREFIX='/api/';
  const STYLE_ID='bltnow-offline-instalaciones-f3-style';
  const NOT_BACKED_NOTE='Consulta desde respaldo local. Las fotografias, carpetas, comentarios de junta, bitacora y datos relacionados de otras empresas no estan incluidos en esta copia.';
  let currentTask=null,currentKey='',lastCopy=null,watcher=null,watchDetail=null;
  let scheduled=false,previousProjectMode=null;

  function userId(user){
    const n=Number(user?.id_SB||user?.id||user?.user_id);
    return Number.isSafeInteger(n)&&n>0?n:null;
  }
  function identities(){
    const auth=window.ManttoAuth;
    const actor=userId(auth?.getActorUser?.()),effective=userId(auth?.getUser?.());
    return actor&&effective?{actor,effective}:null;
  }
  function offline(){return window.ManttoOfflineNavigation?.isOffline?.()===true;}
  function routeAllowed(){
    return offline()&&window.ManttoOfflineNavigation?.canOpenRouteOffline?.(AUTHORIZED_ROUTE)===true;
  }
  function projectContext(){
    const current=window.ManttoRouter?.getCurrent?.()||{};
    if(current.route===AUTHORIZED_ROUTE)return true;
    return current.route==='detalle'&&current.payload?.type==='proyecto'&&
      current.payload?.source===AUTHORIZED_ROUTE;
  }
  function detailContext(){
    const current=window.ManttoRouter?.getCurrent?.()||{};
    return current.route==='detalle'&&current.payload?.type==='proyecto'&&
      current.payload?.source===AUTHORIZED_ROUTE;
  }
  function authorizedCopy(){
    if(!routeAllowed())throw new Error('No hay respaldo autorizado para Proyectos de Instalaciones.');
    const ids=identities(),storage=window.ManttoOfflineStorage;
    if(!ids||!storage?.readCachedAccess||!storage?.verifiedSnapshot||!storage?.getSnapshot)
      throw new Error('Sesion y almacenamiento CORELLIAN no disponibles.');
    const access=storage.readCachedAccess(ids.actor,ids.effective);
    if(access?.permission_code!==OFFLINE_PERMISSION||
       Number(access.actor_user_id||ids.actor)!==ids.actor||
       Number(access.effective_user_id)!==ids.effective||
       !Array.isArray(access.catalog_modules))
      throw new Error('Permiso de respaldo CORELLIAN expirado o incompatible.');
    const module=access.catalog_modules.find(item=>item?.code===MODULE&&
      item?.domain===DOMAIN&&item?.backup_status==='EXPORTADOR_COMPLETO'&&
      Array.isArray(item.datasets)&&item.datasets.includes(DATASET));
    const signature=module?.scope?.scope_signature;
    if(!COPY_SIGNATURE.test(String(signature||'')))
      throw new Error('Firma de alcance CORELLIAN no disponible.');
    return {ids,signature,context:{actor_user_id:ids.actor,effective_user_id:ids.effective,
      domain:DOMAIN,dataset:DATASET}};
  }
  async function readCompleteCopy(){
    const {ids,signature,context}=authorizedCopy();
    const key=`${ids.actor}:${ids.effective}:${signature}`;
    if(currentTask&&currentKey===key)return currentTask;
    const task=(async()=>{
      const storage=window.ManttoOfflineStorage;
      const verified=await storage.verifiedSnapshot(context,signature);
      if(verified?.schema_version!==2||verified.read_only!==true||
         verified.actor_user_id!==ids.actor||verified.effective_user_id!==ids.effective||
         verified.domain!==DOMAIN||verified.dataset!==DATASET||
         verified.scope_signature!==signature||!verified.run_id||
         !Number.isSafeInteger(Number(verified.kind_counts?.proyectos))||
         Number(verified.kind_counts.proyectos)<0)
        throw new Error('La copia CORELLIAN no supera la comprobacion de integridad.');
      const complete=await storage.getSnapshot(context);
      if(complete?.schema_version!==2||complete.read_only!==true||
         complete.actor_user_id!==ids.actor||complete.effective_user_id!==ids.effective||
         complete.domain!==DOMAIN||complete.dataset!==DATASET||
         complete.scope_signature!==signature||complete.run_id!==verified.run_id)
        throw new Error('La copia ha sido sustituida o corresponde a otra identidad.');
      const rows=complete?.payload?.data?.proyectos;
      if(!Array.isArray(rows)||rows.length!==Number(verified.kind_counts.proyectos)||
         rows.length!==Number(verified.record_count))
        throw new Error('El respaldo no contiene el universo completo certificado.');
      const current=authorizedCopy();
      if(!offline()||!projectContext()||current.ids.actor!==ids.actor||
         current.ids.effective!==ids.effective||current.signature!==signature)
        throw new Error('Sesion, alcance o pantalla cambiaron durante la consulta.');
      lastCopy={downloaded_at:verified.downloaded_at||null,records:rows.length,
        run_id:verified.run_id,scope_signature:signature};
      schedulePresentation();
      return rows;
    })();
    currentKey=key;currentTask=task;
    try{return await task;}
    finally{if(currentTask===task){currentTask=null;currentKey='';}}
  }
  function result(status,payload){return {status,payload};}
  function unavailable(){
    return result(503,{ok:false,code:'OFFLINE_COR_DATA_NOT_BACKED',
      message:'Esta informacion de Instalaciones no forma parte del respaldo local.'});
  }
  async function localResult(path,method='GET'){
    if(!routeAllowed())return result(403,{ok:false,code:'OFFLINE_COR_UNAUTHORIZED',
      message:'No existe un respaldo CORELLIAN autorizado para el usuario efectivo.'});
    if(method!=='GET')return result(503,{ok:false,code:'OFFLINE_COR_WRITE_DISABLED',
      message:'Sin conexion: no se puede confirmar esta operacion en Aiven.'});
    if(path!==RECORD_PATH)return unavailable();
    try{
      const rows=await readCompleteCopy();
      return result(200,{ok:true,data:rows,source:'indexeddb',offline:true,
        respaldo:{fecha:lastCopy?.downloaded_at||null,registros:rows.length}});
    }catch(error){
      return result(403,{ok:false,code:'OFFLINE_COR_REVALIDATION_REQUIRED',
        message:String(error?.message||'Respaldo no autorizado.').slice(0,250)});
    }
  }
  function classified(input,options){
    if(!projectContext())return null;
    const base=String(window.MANTTO_API_BASE||'').replace(/\/$/,'');
    if(!/^https?:\/\//i.test(base))return null;
    try{
      const expected=new URL(base),actual=new URL(typeof input==='string'?input:input?.url,
        window.location?.href||expected.href);
      if(actual.origin!==expected.origin||!actual.pathname.startsWith(API_PREFIX))return null;
      const pathname=actual.pathname;
      // La salud real de API y el motor de autorizacion NO se falsifican.
      if(pathname==='/api/health'||pathname.startsWith('/api/offline/')||
         pathname==='/api/auth'||pathname.startsWith('/api/auth/'))return null;
      return {path:pathname,method:String(options?.method||input?.method||'GET').toUpperCase()};
    }catch(_error){return null;}
  }
  function response(status,payload){
    return new Response(JSON.stringify(payload),{status,headers:{
      'Content-Type':'application/json','Cache-Control':'no-store'}});
  }
  function installFetchBridge(){
    const original=window.fetch;
    if(typeof original!=='function')return false;
    window.fetch=function(input,options){
      const request=classified(input,options);
      if(!request)return original.apply(this,arguments);
      if(offline())return localResult(request.path,request.method).then(({status,payload})=>response(status,payload));
      const nav=window.ManttoOfflineNavigation;
      if(request.method==='GET'&&nav?.status?.()==='CHECKING'&&typeof nav.check==='function'){
        const context=this,args=arguments;
        return Promise.resolve(nav.check()).then(()=>offline()
          ?localResult(request.path,request.method).then(({status,payload})=>response(status,payload))
          :original.apply(context,args));
      }
      return original.apply(this,arguments);
    };
    return true;
  }
  function installHttpBridge(){
    const http=window.ManttoHttp;
    if(!http||typeof http.get!=='function')return false;
    // ManttoHttp es inmutable en BLT NOW. ManttoAuth.api utiliza window.fetch,
    // interceptado por installFetchBridge sin modificar el cliente oficial.
    if(Object.isFrozen(http))return false;
    const original=http.get;
    http.get=function(path,...args){
      const query=typeof path==='string'?path:'';
      const target=classified(String(window.MANTTO_API_BASE||'').replace(/\/$/,'')+query,{method:'GET'});
      if(!offline()||!target)return original.call(this,path,...args);
      return localResult(target.path,'GET').then(({status,payload})=>{
        if(status!==200){const error=new Error(payload.message);error.status=status;error.code=payload.code;throw error;}
        return payload;
      });
    };
    return true;
  }
  function installHttpMutationGuard(){
    const http=window.ManttoHttp;
    if(!http||typeof http.request!=='function')return false;
    // El puente fetch ya bloquea POST/PATCH/DELETE offline en los endpoints
    // de Instalaciones. No mutar ManttoHttp.request, que es de solo lectura.
    if(Object.isFrozen(http))return false;
    const original=http.request;
    http.request=function(path,options,...rest){
      const method=String(options?.method||'GET').toUpperCase();
      if(offline()&&projectContext()&&['POST','PUT','PATCH','DELETE'].includes(method)){
        const target=classified(String(window.MANTTO_API_BASE||'').replace(/\/$/,'')+String(path||''),{method});
        if(target){
          const error=new Error('Sin conexion: no es posible confirmar cambios en Aiven desde Instalaciones.');
          error.status=503;error.code='OFFLINE_COR_WRITE_DISABLED';
          return Promise.reject(error);
        }
      }
      return original.call(this,path,options,...rest);
    };
    return true;
  }
  function formatDate(value){
    if(!value)return 'fecha no disponible';
    const date=new Date(value);
    if(!Number.isFinite(date.getTime()))return 'fecha no disponible';
    return date.toLocaleDateString('es-MX',{year:'numeric',month:'2-digit',day:'2-digit'});
  }
  function ensureStyle(){
    if(document.getElementById?.(STYLE_ID)||!document.head?.appendChild)return;
    const style=document.createElement('style');style.id=STYLE_ID;
    style.textContent=`
      #view-instalaciones-proyectos.bltnow-offline-cor .py-cj-caja,
      #view-instalaciones-proyectos.bltnow-offline-cor .py-upload-tile,
      #view-instalaciones-proyectos.bltnow-offline-cor #py-input-foto {display:none!important}
      body.bltnow-offline-cor-detail .mg-folder-manager,
      body.bltnow-offline-cor-detail .mg-bitacora-panel,
      body.bltnow-offline-cor-detail .mg-pvo-project-panel {display:none!important}
      #bltnow-cor-detail-note{padding:10px 14px;border-radius:9px;
        background:#fff8e9;border:1px solid #f2d49d;color:#694304;
        font-size:12px;font-weight:650;margin:0 0 12px}
    `;
    document.head.appendChild(style);
  }
  function present(){
    const active=routeAllowed()&&projectContext();
    const view=document.getElementById?.('view-instalaciones-proyectos');
    view?.classList?.toggle('bltnow-offline-cor',active);
    document.body?.classList?.toggle('bltnow-offline-cor-detail',active&&detailContext());
    if(view){
      const status=view.querySelector?.('#py-aiven-status');
      if(status&&active){
        const label=`Copia local · ${lastCopy?.records??'—'} equipos · ${formatDate(lastCopy?.downloaded_at)}`;
        if(status.textContent!==label)status.textContent=label;
      }
      const eyebrow=view.querySelector?.('.py-module-head .py-eyebrow');
      if(eyebrow){
        if(active){
          if(view._bltnowOriginalEyebrow===undefined)view._bltnowOriginalEyebrow=eyebrow.textContent;
          if(eyebrow.textContent!=='BLT NOW · Copia local')eyebrow.textContent='BLT NOW · Copia local';
        }else if(view._bltnowOriginalEyebrow!==undefined){
          if(eyebrow.textContent!==view._bltnowOriginalEyebrow)eyebrow.textContent=view._bltnowOriginalEyebrow;
          delete view._bltnowOriginalEyebrow;
        }
      }
      const note=view.querySelector?.('.py-source-note-wrap .py-note');
      if(note){
        if(active){
          if(view._bltnowOriginalSourceNote===undefined)view._bltnowOriginalSourceNote=note.innerHTML;
          if(note.textContent!==NOT_BACKED_NOTE)note.textContent=NOT_BACKED_NOTE;
        }else if(view._bltnowOriginalSourceNote!==undefined){
          if(note.innerHTML!==view._bltnowOriginalSourceNote)note.innerHTML=view._bltnowOriginalSourceNote;
          delete view._bltnowOriginalSourceNote;
        }
      }
    }
    const detail=document.getElementById?.('mg-detail-body');
    if(detail&&active&&detailContext()&&detail.querySelector?.('.mg-corellian-content')){
      if(!detail.querySelector?.('#bltnow-cor-detail-note')){
        const message=document.createElement('div');message.id='bltnow-cor-detail-note';
        message.textContent=NOT_BACKED_NOTE;detail.prepend(message);
      }
    }else{
      document.getElementById?.('bltnow-cor-detail-note')?.remove?.();
    }
  }
  function schedulePresentation(){
    if(scheduled)return;
    scheduled=true;
    Promise.resolve().then(()=>{scheduled=false;present();});
  }
  function watchViews(){
    if(typeof MutationObserver!=='function')return;
    const view=document.getElementById?.('view-instalaciones-proyectos');
    if(view&&!watcher){watcher=new MutationObserver(schedulePresentation);
      watcher.observe(view,{childList:true,subtree:true,attributes:false});}
    const detail=document.getElementById?.('view-detalle');
    if(detail&&!watchDetail){watchDetail=new MutationObserver(schedulePresentation);
      watchDetail.observe(detail,{childList:true,subtree:true,attributes:false});}
  }
  function reset(){
    lastCopy=null;currentTask=null;currentKey='';previousProjectMode=null;
    const view=document.getElementById?.('view-instalaciones-proyectos');
    if(view){
      view.innerHTML='';
      if(view.dataset)view.dataset.pyReady='0';
      delete view._bltnowOriginalSourceNote;
      delete view._bltnowOriginalEyebrow;
    }
    const current=window.ManttoRouter?.getCurrent?.();
    if(current?.route==='detalle'&&current.payload?.source===AUTHORIZED_ROUTE){
      const detail=document.getElementById?.('mg-detail-body');
      if(detail)detail.textContent='El respaldo debe revalidarse para esta identidad.';
    }
    schedulePresentation();
  }
  function onNavigation(event){
    watchViews();schedulePresentation();
    if(event?.detail?.route!==AUTHORIZED_ROUTE)return;
    if(!routeAllowed())return;
    // El modulo nativo conserva pyReady=1 incluso cuando cambia la fuente.
    const view=document.getElementById?.('view-instalaciones-proyectos');
    if(view?.dataset?.pyReady==='1'&&window.ManttoInstalacionesProyectos?.reload){
      Promise.resolve().then(()=>window.ManttoInstalacionesProyectos.reload()).catch(error=>
        console.warn('[Offline CORELLIAN] Recarga local aplazada.',error));
    }
  }
  function onConnectionChanged(){
    watchViews();schedulePresentation();
    // El modo puede seguir siendo OFFLINE aunque caduque la autorización.
    // No dejar filas del usuario anterior visibles tras la revocación.
    if(offline()&&projectContext()&&!routeAllowed()){
      reset();
      return;
    }
    const now=offline()?'OFFLINE':'ONLINE';
    if(now===previousProjectMode)return;
    previousProjectMode=now;
    const current=window.ManttoRouter?.getCurrent?.()||{};
    if(current.route===AUTHORIZED_ROUTE){
      const view=document.getElementById?.('view-instalaciones-proyectos');
      if(view?.dataset?.pyReady==='1'&&window.ManttoInstalacionesProyectos?.reload){
        Promise.resolve().then(()=>window.ManttoInstalacionesProyectos.reload()).catch(error=>
          console.warn('[Offline CORELLIAN] La lectura aun no esta disponible.',error));
      }
    }else if(detailContext()&&window.ManttoDetails?.openProyecto){
      const payload=current.payload;
      Promise.resolve().then(()=>window.ManttoDetails.openProyecto(payload.id,payload)).catch(error=>
        console.warn('[Offline CORELLIAN] No fue posible actualizar el expediente.',error));
    }
  }
  function stopUnsupportedAction(event){
    // A mounted project can remain in the DOM after offline rights expire.
    if(!offline()||!projectContext())return;
    const element=event.target;
    const selector='.py-cj-btn, .py-upload-tile, #py-lightbox-principal, #py-input-foto, '+
      '.mg-folder-oauth-btn, .mg-photo-add, .mg-photo-delete, .mg-photo-principal, '+
      '.mg-bitacora-refresh, .mg-folder-manager-open';
    if(event.type==='submit'||element?.closest?.(selector)){
      event.preventDefault?.();event.stopImmediatePropagation?.();
      if(typeof window.alert==='function')window.alert('Sin conexion: esta operacion no esta habilitada desde la pantalla normal en Fase 3.');
    }
  }
  function init(){
    ensureStyle();installFetchBridge();installHttpBridge();installHttpMutationGuard();watchViews();
    document.addEventListener('click',stopUnsupportedAction,true);
    document.addEventListener('change',stopUnsupportedAction,true);
    document.addEventListener('submit',stopUnsupportedAction,true);
    document.addEventListener('mantto:offline-navigation-changed',onConnectionChanged);
    document.addEventListener('mantto:navigation',onNavigation);
    document.addEventListener('mantto:logout',reset);
    document.addEventListener('mantto:view-user-changed',reset);
    document.addEventListener('mantto:session-expired',reset);
    document.addEventListener('mantto:offline-backup-completed',()=>{lastCopy=null;schedulePresentation();});
    schedulePresentation();
  }
  window.ManttoOfflineInstalacionesProyectos=Object.freeze({
    init,readCompleteCopy,routeAllowed,projectContext,localResult,installFetchBridge,
    installHttpBridge,installHttpMutationGuard,onNavigation,onConnectionChanged
  });
  init();
})();

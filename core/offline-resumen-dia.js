/* BLT NOW | Navegacion Offline, nueva Fase 2 V001.
 * Puente de lectura estrictamente limitado a los endpoints del Resumen del Dia
 * y el detalle de tickets contenidos en su copia UNITED autorizada.
 * No agrega un visor, no altera el modulo normal y no intercepta mutaciones.
 */
(function(){
  'use strict';
  if(window.ManttoOfflineResumenDia)return;

  const PERMISSION='GENERAL_MODO_OFFLINE_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';
  const MODULE='OPERACION_RESUMEN_DEL_DIA';
  const DATASET='operacion-resumen-dia';
  const DOMAIN='UNITED';
  const BASE_PATH='/api/operacion/resumen-dia/inicial';
  const REGULAR_TICKET=/^\/api\/tickets\/([^/]+)$/;
  const TICKET_INTERACTIONS=/^\/api\/tickets\/([^/]+)\/interacciones$/;
  const OPTIONAL_NOT_BACKED=new Set([
    '/api/usuarios/me/criticos-preferencias',
    '/api/equipos-criticos'
  ]);
  let lastLocalMetadata=null,viewObserver=null,refreshTimer=null;
  let lastRenderedOffline=false;
  let currentDataTask=null,currentDataKey='';
  let privacyRevision=0;

  function idOf(user){
    const n=Number(user?.id_SB||user?.id||user?.user_id);
    return Number.isSafeInteger(n)&&n>0?n:null;
  }
  function identities(){
    const auth=window.ManttoAuth;
    const actor=idOf(auth?.getActorUser?.());
    const effective=idOf(auth?.getUser?.());
    return actor&&effective?{actor,effective}:null;
  }
  function offline(){return window.ManttoOfflineNavigation?.isOffline?.()===true;}
  function routeAllowed(){return offline()&&window.ManttoOfflineNavigation?.canOpenRouteOffline?.('resumen')===true;}
  function ensurePermission(){
    if(!routeAllowed())throw new Error('No existe un Resumen del Dia offline habilitado para esta identidad.');
    const ids=identities(),storage=window.ManttoOfflineStorage;
    if(!ids||!storage?.readCachedAccess||!storage?.verifiedSnapshot||!storage?.getSnapshot)
      throw new Error('Sesion o almacenamiento offline no disponibles.');
    const access=storage.readCachedAccess(ids.actor,ids.effective);
    if(access?.permission_code!==PERMISSION||Number(access?.effective_user_id)!==ids.effective||
       Number(access.actor_user_id||ids.actor)!==ids.actor||!Array.isArray(access?.catalog_modules))
      throw new Error('Autorizacion offline vencida, incompatible o ajena al usuario.');
    const item=access.catalog_modules.find(m=>m?.code===MODULE&&m?.domain===DOMAIN&&
      m?.backup_status==='EXPORTADOR_COMPLETO'&&m.datasets?.includes(DATASET));
    const signature=item?.scope?.scope_signature;
    if(!/^[a-f0-9]{64}$/.test(String(signature||'')))throw new Error('Firma territorial offline no disponible.');
    return {ids,signature,context:{actor_user_id:ids.actor,effective_user_id:ids.effective,domain:DOMAIN,dataset:DATASET}};
  }
  function normalResumenContext(){
    const router=window.ManttoRouter;
    const route=router?.getCurrent?.().route;
    if(route==='resumen')return true;
    if(route==='detalle'){
      const history=router?.getHistory?.();
      return Array.isArray(history)&&history[history.length-1]?.route==='resumen';
    }
    return false;
  }
  function count(rows){return Array.isArray(rows)?rows.length:-1;}
  async function readCompleteCopy(){
    const authorization=ensurePermission();
    const {ids,signature,context}=authorization;
    const storage=window.ManttoOfflineStorage;
    // Compartir solamente solicitudes simultaneas; no conservar filas sensibles
    // en un cache permanente que sobreviva a una mutacion de identidad.
    const key=`${ids.actor}:${ids.effective}:${signature}`;
    if(currentDataTask&&currentDataKey===key)return currentDataTask;
    currentDataKey=key;
    const task=(async()=>{
      const verified=await storage.verifiedSnapshot(context,signature);
      if(verified?.schema_version!==2||verified?.read_only!==true||
         verified.domain!==DOMAIN||verified.dataset!==DATASET||
         verified.actor_user_id!==ids.actor||verified.effective_user_id!==ids.effective||
         verified.scope_signature!==signature||!verified.run_id)
        throw new Error('La copia del Resumen del Dia no supera la validacion de integridad.');
      const full=await storage.getSnapshot(context);
      if(full?.schema_version!==2||full.run_id!==verified.run_id||
         full.scope_signature!==signature||full.read_only!==true||
         full.actor_user_id!==ids.actor||full.effective_user_id!==ids.effective||
         full.domain!==DOMAIN||full.dataset!==DATASET)
        throw new Error('El respaldo cambio durante su consulta. Reabre el modulo.');
      const tickets=full?.payload?.data?.tickets;
      const portafolio=full?.payload?.data?.portafolio;
      if(count(tickets)!==Number(verified.kind_counts?.tickets)||
         count(portafolio)!==Number(verified.kind_counts?.portafolio)||
         count(tickets)+count(portafolio)!==Number(verified.record_count))
        throw new Error('La copia local no tiene todos los registros del manifiesto.');
      const current=ensurePermission();
      if(!offline()||current.ids.actor!==ids.actor||current.ids.effective!==ids.effective||
         current.signature!==signature)
        throw new Error('Cambio de sesion o alcance durante la lectura offline.');
      lastLocalMetadata={downloaded_at:verified.downloaded_at,tickets:count(tickets),run_id:verified.run_id};
      schedulePresentation();
      return {tickets,portafolio,alcance:full?.payload?.alcance||null};
    })();
    currentDataTask=task;
    try{return await task;}
    finally{if(currentDataTask===task){currentDataTask=null;currentDataKey='';}}
  }

  function safeTicketReference(raw){
    if(typeof raw!=='string'||raw.length>140)return '';
    try{return decodeURIComponent(raw).trim();}catch(_error){return '';}
  }
  function findTicket(rows,ref){
    if(!ref)return null;
    return rows.find(row=>[
      row.ticket,row.id,row.folio,row.id_interno
    ].some(value=>value!=null&&String(value).trim()===ref))||null;
  }
  async function localResult(path){
    if(!routeAllowed())return {status:403,payload:{ok:false,code:'OFFLINE_RESUMEN_UNAUTHORIZED',message:'No hay respaldo vigente autorizado para Resumen del Dia.'}};
    if(OPTIONAL_NOT_BACKED.has(path))return {status:503,payload:{ok:false,code:'OFFLINE_DATA_NOT_BACKED',message:'Los indicadores de criticidad requieren un respaldo especifico que todavia no existe.'}};
    if(TICKET_INTERACTIONS.test(path))return {status:503,payload:{ok:false,code:'OFFLINE_HISTORY_NOT_BACKED',message:'Las interacciones historicas no se incluyen en este respaldo.'}};
    try{
      const data=await readCompleteCopy();
      if(path===BASE_PATH){
        return {status:200,payload:{ok:true,data:{tickets:data.tickets,portafolio:data.portafolio},
          alcance:data.alcance,source:'indexeddb',offline:true}};
      }
      const match=path.match(REGULAR_TICKET);
      if(match){
        const ticket=findTicket(data.tickets,safeTicketReference(match[1]));
        if(!ticket)return {status:404,payload:{ok:false,code:'OFFLINE_TICKET_NOT_BACKED',message:'Este ticket no esta incluido en el respaldo.'}};
        return {status:200,payload:{ok:true,data:ticket,source:'indexeddb',offline:true}};
      }
      return {status:404,payload:{ok:false,code:'OFFLINE_ENDPOINT_NOT_AVAILABLE',message:'Consulta no incluida en el Resumen offline.'}};
    }catch(error){
      return {status:403,payload:{ok:false,code:'OFFLINE_RESUMEN_REVALIDATION_REQUIRED',message:String(error?.message||'Respaldo no autorizado.').slice(0,250)}};
    }
  }

  function normalizedGet(input,options){
    const method=String(options?.method||input?.method||'GET').toUpperCase();
    if(method!=='GET')return null;
    const base=String(window.MANTTO_API_BASE||'').replace(/\/$/,'');
    if(!/^https?:\/\//.test(base))return null;
    try{
      const api=new URL(base);
      const actual=new URL(typeof input==='string'?input:input?.url,window.location?.href||api.href);
      if(actual.origin!==api.origin)return null;
      const path=actual.pathname;
      if(!normalResumenContext())return null;
      if(path===BASE_PATH||REGULAR_TICKET.test(path)||TICKET_INTERACTIONS.test(path)||
         OPTIONAL_NOT_BACKED.has(path))return path;
    }catch(_error){return null;}
    return null;
  }
  function buildResponse(status,payload){
    return new Response(JSON.stringify(payload),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  }
  function installFetchBridge(){
    const original=window.fetch;
    if(typeof original!=='function')return false;
    // Se interceptan exclusivamente GET de los cuatro endpoints declarados,
    // solo durante una desconexion y sin ampliar puertas ni permisos.
    window.fetch=function(input,options){
      const path=normalizedGet(input,options);
      if(!path)return original.apply(this,arguments);
      if(offline())return localResult(path).then(({status,payload})=>buildResponse(status,payload));
      const nav=window.ManttoOfflineNavigation;
      if(nav?.status?.()==='CHECKING'&&typeof nav.check==='function'){
        const ctx=this,args=arguments;
        return Promise.resolve(nav.check()).then(()=>offline()
          ?localResult(path).then(({status,payload})=>buildResponse(status,payload))
          :original.apply(ctx,args));
      }
      return original.apply(this,arguments);
    };
    return true;
  }
  function installHttpBridge(){
    const http=window.ManttoHttp;
    if(!http||typeof http.get!=='function')return false;
    // ManttoHttp es inmutable en BLT NOW. El puente fetch ya entrega las respuestas
    // offline a ManttoAuth.api -> ManttoHttp; no se modifica el objeto congelado.
    if(Object.isFrozen(http))return false;
    const old=http.get;
    http.get=function(path,...rest){
      const clean=typeof path==='string'?path.split('?')[0]:'';
      if(!offline()||!normalResumenContext()||
         !(REGULAR_TICKET.test(clean)||TICKET_INTERACTIONS.test(clean)))
        return old.call(this,path,...rest);
      return localResult(clean).then(({status,payload})=>{
        if(status!==200){const error=new Error(payload.message);error.status=status;error.code=payload.code;throw error;}
        return payload;
      });
    };
    return true;
  }

  function localLabel(){
    if(!lastLocalMetadata)return 'Modo sin conexion · respaldo de Resumen del Dia';
    const date=new Date(lastLocalMetadata.downloaded_at||'');
    const when=Number.isFinite(date.getTime())?date.toLocaleString('es-MX',{dateStyle:'short',timeStyle:'short'}):'fecha no disponible';
    return `Copia local · ${when} · ${lastLocalMetadata.tickets.toLocaleString('es-MX')} tickets`;
  }
  function updatePresentation(){
    const nowOffline=routeAllowed();
    const view=document.getElementById('view-resumen');
    if(!view)return;
    const status=document.getElementById('rd-api-status');
    if(nowOffline){
      if(status){
        const label=localLabel();
        if(status.textContent!==label){status.className='rd-status ok rd-status-offline';status.textContent=label;}
      }
      const critical=document.getElementById('rd-criticos-dia');
      if(critical){
        if(critical.textContent!=='—')critical.textContent='—';
        critical.title='Indicador no incluido en el respaldo offline del Resumen del Dia.';
      }
      ['rd-vobo-save','rd-vobo-estado','rd-vobo-comentario'].forEach(id=>{
        const el=document.getElementById(id);
        if(el&&!el.disabled){el.disabled=true;el.dataset.offlineLocked='1';}
        if(el&&el.dataset.offlineLocked==='1')el.title='Las validaciones no pueden confirmarse sin conexion.';
      });
      if(status)status.title='Consulta historica offline. Los indicadores de Equipos Criticos y las interacciones no se incluyen en esta copia.';
    }else if(lastRenderedOffline){
      ['rd-vobo-save','rd-vobo-estado','rd-vobo-comentario'].forEach(id=>{
        const el=document.getElementById(id);
        if(el?.dataset.offlineLocked==='1'){el.disabled=false;delete el.dataset.offlineLocked;el.removeAttribute?.('title');}
      });
      if(status){status.classList.remove('rd-status-offline');status.removeAttribute?.('title');}
      const critical=document.getElementById('rd-criticos-dia');critical?.removeAttribute?.('title');
    }
    lastRenderedOffline=nowOffline;
  }
  function schedulePresentation(){
    if(refreshTimer!==null)return;
    refreshTimer=window.setTimeout(()=>{refreshTimer=null;updatePresentation();},0);
  }
  function observeView(){
    if(viewObserver||typeof MutationObserver!=='function')return;
    const view=document.getElementById('view-resumen');if(!view)return;
    viewObserver=new MutationObserver(()=>{if(offline())schedulePresentation();});
    viewObserver.observe(view,{subtree:true,childList:true,characterData:true});
  }
  function releaseCache(){currentDataTask=null;currentDataKey='';lastLocalMetadata=null;}
  function lockPreviousSessionView(){
    // The legacy native module retains tables in its closure and DOM.
    // Hide the view until the new identity has completed a fresh data load.
    privacyRevision++;
    releaseCache();
    if(window.ManttoResumenDia)window.ManttoResumenDia._detailData={};
    const view=document.getElementById?.('view-resumen');
    if(view?.style){
      view.style.visibility='hidden';
      if(view.dataset)view.dataset.offlineIdentityLock='1';
      view.setAttribute?.('aria-busy','true');
    }
  }
  async function safeReload(){
    const load=window.ManttoResumenDia?.load;
    if(typeof load!=='function')return;
    const actor=identities(),epoch=privacyRevision;
    if(!actor)return;
    await load();
    const now=identities();
    if(epoch!==privacyRevision||!now||actor.actor!==now.actor||
       actor.effective!==now.effective)return;
    const view=document.getElementById?.('view-resumen');
    if(view?.dataset?.offlineIdentityLock==='1'){
      if(view.style)view.style.visibility='';
      delete view.dataset.offlineIdentityLock;
      view.removeAttribute?.('aria-busy');
    }
  }
  function onConnectionChanged(event){
    releaseCache();observeView();schedulePresentation();
    // Si la vista ya estaba abierta, actualizarla sin cambiar de ruta.
    if(window.ManttoRouter?.getCurrent?.().route==='resumen'&&window.ManttoResumenDia?.load){
      Promise.resolve().then(safeReload).catch(error=>console.warn('[Offline Resumen] Recarga pospuesta.',error));
    }
  }
  function onNavigation(event){
    if(event?.detail?.route!=='resumen')return;
    observeView();schedulePresentation();
    // Si Resumen estaba montado en una visita previa, su init() omite load().
    // Forzar la actualizacion al entrar offline; no alterar la navegacion online.
    if((routeAllowed()||document.getElementById?.('view-resumen')?.dataset?.offlineIdentityLock==='1')&&
       window.ManttoResumenDia?.load){
      Promise.resolve().then(safeReload).catch(error=>console.warn('[Offline Resumen] Lectura no disponible.',error));
    }
  }
  function preventUnbackedMutation(event){
    // Block even when the cached module permission or backup expired.
    // No remote mutation is safe while Resumen/Ticket is disconnected.
    if(!offline()||!normalResumenContext())return;
    const element=event.target;
    const blocking=event.type==='submit'
      ?element?.id==='mg-ticket-chat-form'||element?.id==='rd-ticket-chat-form'
      :Boolean(element?.closest?.('#mg-ticket-vobo-save, #rd-vobo-save'));
    if(!blocking)return;
    event.preventDefault?.();event.stopImmediatePropagation?.();
    // La cola certificada de comentarios en las pantallas normales corresponde
    // a Fase 4; bloquear una escritura no equivale a registrar un movimiento.
    if(typeof window.alert==='function')window.alert('Sin conexion: esta accion no esta disponible desde la pantalla normal en Fase 2.');
  }
  function init(){
    installFetchBridge();installHttpBridge();observeView();
    document.addEventListener('click',preventUnbackedMutation,true);
    document.addEventListener('submit',preventUnbackedMutation,true);
    document.addEventListener('mantto:offline-navigation-changed',onConnectionChanged);
    document.addEventListener('mantto:navigation',onNavigation);
    document.addEventListener('mantto:logout',lockPreviousSessionView);
    document.addEventListener('mantto:view-user-changed',lockPreviousSessionView);
    document.addEventListener('mantto:session-expired',lockPreviousSessionView);
    document.addEventListener('mantto:auth-ready',()=>{
      if(window.ManttoRouter?.getCurrent?.().route==='resumen')
        Promise.resolve().then(safeReload).catch(error=>console.warn('[Offline Resumen] Sesion pendiente.',error));
    });
    document.addEventListener('mantto:offline-backup-completed',releaseCache);
  }
  window.ManttoOfflineResumenDia=Object.freeze({
    init,readCompleteCopy,isOffline:offline,routeAllowed,localResult,installFetchBridge,installHttpBridge
  });
  init();
})();

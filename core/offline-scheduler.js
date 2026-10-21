(function(){
  'use strict';
  if(window.ManttoOfflineScheduler)return;

  // BLT NOW | Nueva implementacion Fase 2: respaldo automatico mientras la PWA
  // este abierta o al recuperar una oportunidad. No promete tareas con la PWA cerrada.
  const PERMISSION_CODE='GENERAL_MODO_OFFLINE_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';
  const PREF_PREFIX='mantto:offline-pilot:preferences:v1:';
  const SELECTION_PREFIX='mantto:offline-selection:f1:';
  const PENDING_PREFIX='mantto:offline-pending:';
  const LEASE_PREFIX='mantto:offline-backup-lease:';
  const RETRY_BACKOFF_MS=5*60*1000;
  const LEASE_TTL_MS=5*60*1000;
  const INTERVAL_MS=60*1000;
  let active=null,lastAttempt=0,lastRevalidation=0,revalidating=null,sessionEpoch=0;

  function positiveId(value){const n=Number(value);return Number.isSafeInteger(n)&&n>0?n:null;}
  function actorId(){const u=window.ManttoAuth?.getActorUser?.()||{};return positiveId(u.id_SB||u.id||u.user_id);}
  function effectiveId(){const u=window.ManttoAuth?.getUser?.()||{};return positiveId(u.id_SB||u.id||u.user_id);}
  function keyFor(prefix,id){return prefix+id;}
  // Compartir el ultimo catalogo realmente autorizado con la navegacion local.
  // Se reutiliza exactamente el formato y vigencia de core/offline-storage.js.
  function rememberAuthorizedCatalog(caps,actor,effective){
    if(caps?.permission_code!==PERMISSION_CODE||Number(caps?.effective_user_id)!==effective||
       (caps.actor_user_id!=null&&Number(caps.actor_user_id)!==actor)||
       !Array.isArray(caps.catalog_modules))return false;
    try{
      localStorage.setItem(`mantto:offline-access:${actor}:${effective}`,
        JSON.stringify({saved_at:new Date().toISOString(),data:caps}));
      document.dispatchEvent(new CustomEvent('mantto:offline-capabilities-updated',{
        detail:{actor_user_id:actor,effective_user_id:effective}
      }));
      return true;
    }catch(error){console.warn('[Offline] No se pudo guardar el catalogo validado.',error);return false;}
  }
  function cacheAuthorizedModuleShell(caps){
    const loader=window.ManttoModuleLoader;
    const controller=navigator.serviceWorker?.controller;
    if(!loader?.offlineAssets||!controller?.postMessage||!Array.isArray(caps?.catalog_modules))return false;
    const routes=caps.catalog_modules.map(module=>module?.route).filter(Boolean);
    const assets=loader.offlineAssets(routes);
    if(!assets.length)return false;
    controller.postMessage({type:'BLT_CACHE_MODULE_SHELL',assets});
    return true;
  }
  function readPreferences(id){
    if(!id)return null;
    try{const p=JSON.parse(localStorage.getItem(keyFor(PREF_PREFIX,id))||'null');return p&&typeof p==='object'?p:null;}
    catch(_error){return null;}
  }
  function writePreferences(id,changes){
    const p={...(readPreferences(id)||{}),...changes,updated_at:new Date().toISOString()};
    localStorage.setItem(keyFor(PREF_PREFIX,id),JSON.stringify(p));return p;
  }
  function preferredOccurrence(now,time){
    const m=String(time||'').match(/^([01]\d|2[0-3]):([0-5]\d)$/);
    if(!m)return null;
    const date=new Date(now);
    date.setHours(Number(m[1]),Number(m[2]),0,0);
    if(date>now)date.setDate(date.getDate()-1);
    return date;
  }
  function dueState(preferences,at){
    const now=at instanceof Date?at:new Date(at||Date.now());
    if(!preferences||preferences.daily_enabled!==true)return {due:false,reason:'disabled'};
    const occurrence=preferredOccurrence(now,preferences.preferred_time);
    if(!occurrence)return {due:false,reason:'invalid-time'};
    const startedAt=new Date(preferences.schedule_started_at||preferences.updated_at||0);
    if(Number.isFinite(startedAt.getTime())&&startedAt>occurrence)return {due:false,reason:'not-started'};
    const last=new Date(preferences.last_backup_at||0);
    const due=!Number.isFinite(last.getTime())||last<occurrence;
    return {due,reason:due?'pending':'completed',due_at:occurrence.toISOString()};
  }
  function hasPermission(){
    const p=window.ManttoPermissions?.state?.(PERMISSION_CODE);
    return p?.exists===true&&p?.efectivo===true;
  }
  function userKey(){const a=actorId(),e=effectiveId();return a&&e?`${a}:${e}`:null;}
  function notify(type,details){
    document.dispatchEvent(new CustomEvent(`mantto:offline-backup-${type}`,{detail:details}));
  }
  function fail(message){throw new Error(message);}
  function readExcluded(a,e){
    try{
      const saved=JSON.parse(localStorage.getItem(`${SELECTION_PREFIX}${a}:${e}`)||'null');
      return new Set(Array.isArray(saved?.excluded_codes)?saved.excluded_codes.filter(c=>typeof c==='string'):[]);
    }catch(_error){return new Set();}
  }
  function selected(catalog,excluded){return (Array.isArray(catalog)?catalog:[]).filter(m=>m&&typeof m.code==='string'&&!excluded.has(m.code));}
  function activeSelectedDatasets(caps,selectedModules){
    const available=Array.isArray(caps?.datasets)?caps.datasets:[];
    const result=[];
    for(const dataset of available){
      if(!dataset||typeof dataset.key!=='string'||!dataset.exporter?.manifest||!dataset.exporter?.page)continue;
      const module=selectedModules.find(m=>m.code===dataset.module_code&&m.domain===dataset.domain&&
        m.scope?.scope_signature&&Array.isArray(m.datasets)&&m.datasets.includes(dataset.key));
      if(module)result.push({dataset,module});
    }
    return result;
  }
  function buildAuthorizedMap(items){
    const signatures={};
    for(const {dataset,module} of items){
      signatures[`${dataset.domain}:${dataset.key.toUpperCase()}`]={signature:module.scope.scope_signature,
        zone_ids:dataset.domain==='UNITED'?module.scope.zone_ids:null};
    }
    return signatures;
  }
  function sameManifest(first,last){
    if(!first||!last||first.scope_signature!==last.scope_signature||first.dataset!==last.dataset||first.domain!==last.domain)return false;
    const kinds=Object.keys(first.kinds||{});
    if(!kinds.length||kinds.length!==Object.keys(last.kinds||{}).length)return false;
    return kinds.every(k=>{
      const a=first.kinds[k],b=last.kinds[k];
      return a&&b&&Number(a.count)===Number(b.count)&&Number(a.max_id)===Number(b.max_id)&&String(a.max_updated||'')===String(b.max_updated||'');
    });
  }
  function contextFor(dataset,a,e){return {actor_user_id:a,effective_user_id:e,domain:dataset.domain,dataset:dataset.key};}
  // El porcentaje general solo usa modulos que cuentan con exportador seguro.
  // No confundir registros de un tipo con el progreso de TODO el respaldo.
  function backupPercent(completedModules,totalModules,partialFraction=0,allCommitted=false){
    const total=Number(totalModules),completed=Number(completedModules),partial=Number(partialFraction);
    if(!Number.isSafeInteger(total)||total<1)return 0;
    const safeCompleted=Number.isFinite(completed)?Math.min(total,Math.max(0,completed)):0;
    const safePartial=Number.isFinite(partial)?Math.min(1,Math.max(0,partial)):0;
    const calculated=Math.floor(100*Math.min(1,(safeCompleted+safePartial)/total));
    return allCommitted&&safeCompleted===total?100:Math.min(99,calculated);
  }
  function ensureManifest(manifest,dataset,module){
    if(manifest?.ok!==true||manifest.dataset!==dataset.key||manifest.domain!==dataset.domain||
      manifest.scope_signature!==module.scope.scope_signature||!manifest.kinds||!Object.keys(manifest.kinds).length)
      fail(`El manifiesto de ${dataset.label||dataset.key} no coincide con el alcance autorizado.`);
    const supported=dataset.exporter.kinds||[];
    if(Object.keys(manifest.kinds).some(k=>!supported.includes(k)))fail('El exportador devolvió una tabla no autorizada.');
  }

  function requireSameSession(actor,effective,epoch){
    if(actorId()!==actor||effectiveId()!==effective||sessionEpoch!==epoch||
       window.ManttoAuth?.isViewingAs?.()===true||!hasPermission())
      fail('La identidad o los permisos cambiaron durante el respaldo.');
  }

  async function backupDataset(api,storage,entry,actor,effective,onProgress,epoch){
    const {dataset,module}=entry;
    const ctx=contextFor(dataset,actor,effective);
    requireSameSession(actor,effective,epoch);
    const first=await api(dataset.exporter.manifest,{method:'GET',cache:'no-store'});
    ensureManifest(first,dataset,module);
    const totals=dataset.exporter.kinds.map(kind=>Number(first.kinds[kind]?.count));
    if(totals.some(n=>!Number.isSafeInteger(n)||n<0))fail('Conteos de respaldo inválidos.');
    const totalRecords=totals.reduce((sum,n)=>sum+n,0);
    const runId=await storage.beginDownload(ctx,first);
    let committed=false;
    let previousKindsCount=0;
    try{
      for(const kind of dataset.exporter.kinds){
        const expected=Number(first.kinds[kind]?.count);
        const upper=Number(first.kinds[kind]?.max_id);
        if(!Number.isSafeInteger(expected)||expected<0||!Number.isSafeInteger(upper)||upper<0)fail('Conteos de respaldo inválidos.');
        let cursor=0,count=0;
        const pageSize=Math.min(300,Number(dataset.exporter.page_limit)||300);
        while(count<expected){
          const qs=new URLSearchParams({kind,after_id:String(cursor),upper_id:String(upper),limit:String(pageSize)});
          const page=await api(`${dataset.exporter.page}?${qs.toString()}`,{method:'GET',cache:'no-store'});
          if(page?.ok!==true||page.dataset!==dataset.key||page.domain!==dataset.domain||page.scope_signature!==first.scope_signature||page.kind!==kind||!Array.isArray(page.rows))
            fail('Una página fue rechazada o cambió de alcance.');
          if(!page.rows.length||Number(page.next_cursor)<=cursor||page.rows.length>pageSize||count+page.rows.length>expected)
            fail('La paginación devolvió filas incompletas o duplicadas.');
          requireSameSession(actor,effective,epoch);
          await storage.appendDownload(ctx,runId,kind,page.rows);
          count+=page.rows.length;cursor=Number(page.next_cursor);
          const currentTotal=previousKindsCount+count;
          const fraction=totalRecords?currentTotal/totalRecords:0;
          // Hasta verificar el manifiesto final y el commit, nunca es 100/100.
          onProgress({dataset:dataset.key,module:dataset.label||dataset.key,
            progress_fraction:Math.min(0.99,Math.max(0,fraction)),
            module_percent:Math.min(99,Math.floor(100*fraction))});
          if(!page.has_more&&count!==expected)fail('El servidor terminó antes del total declarado.');
          if(page.has_more&&count>=expected)fail('Existen filas adicionales no contabilizadas.');
        }
        previousKindsCount+=expected;
      }
      const final=await api(dataset.exporter.manifest,{method:'GET',cache:'no-store'});
      ensureManifest(final,dataset,module);
      if(!sameManifest(first,final))fail('La base cambió durante el respaldo. Se conservará la copia anterior.');
      // Revalidación final de permisos funcionales y alcance antes del reemplazo.
      requireSameSession(actor,effective,epoch);
      const renewed=await window.ManttoAuth.apiGet('/api/offline/capabilities');
      const stillAuthorized=(renewed?.data?.catalog_modules||[]).some(m=>m.code===module.code&&m.domain===module.domain&&
        m.scope?.scope_signature===first.scope_signature&&(m.datasets||[]).includes(dataset.key));
      if(!stillAuthorized)fail('Se modificaron los permisos antes de completar el respaldo.');
      requireSameSession(actor,effective,epoch);
      const row=await storage.finishDownload(ctx,runId,first);
      committed=true;
      return row;
    }finally{
      if(!committed){try{await storage.abandonDownload(ctx,runId);}catch(error){console.warn('[Offline] Pendiente limpieza de respaldo interrumpido.',error);}}
    }
  }

  // El lease evita descarga simultánea entre pestañas del mismo usuario.
  // En navegadores con Web Locks se usa bloqueo atómico; fallback best-effort.
  async function withLease(identity,task){
    if(navigator.locks?.request){
      return navigator.locks.request(`bltnow-offline-backup:${identity}`,{ifAvailable:true},async lock=>lock?task():{skipped:true,reason:'another-tab'});
    }
    const key=LEASE_PREFIX+identity,token=`${Date.now()}:${Math.random()}`;
    try{
      const previous=JSON.parse(localStorage.getItem(key)||'null');
      if(previous?.until>Date.now())return {skipped:true,reason:'another-tab'};
      localStorage.setItem(key,JSON.stringify({token,until:Date.now()+LEASE_TTL_MS}));
      const current=JSON.parse(localStorage.getItem(key)||'null');
      if(current?.token!==token)return {skipped:true,reason:'another-tab'};
      return await task(()=>localStorage.setItem(key,JSON.stringify({token,until:Date.now()+LEASE_TTL_MS})));
    }finally{
      try{if(JSON.parse(localStorage.getItem(key)||'null')?.token===token)localStorage.removeItem(key);}catch(_error){}
    }
  }
  async function performBackup({manual=false}={}){
    if(active)return active;
    const actor=actorId(),effective=effectiveId(),identity=userKey();
    if(!actor||!effective||!identity||!hasPermission()||window.ManttoAuth?.isViewingAs?.()===true)
      return {skipped:true,reason:'unauthorized'};
    if(navigator.onLine===false)return {skipped:true,reason:'offline'};
    if(!manual&&!dueState(readPreferences(effective),new Date()).due)return {skipped:true,reason:'not-due'};
    if(!manual&&Date.now()-lastAttempt<RETRY_BACKOFF_MS)return {skipped:true,reason:'backoff'};
    if(!window.ManttoOfflineStorage||!window.ManttoAuth?.api)return {skipped:true,reason:'not-ready'};
    lastAttempt=Date.now();
    const epoch=sessionEpoch;
    active=withLease(identity,async renew=>{
      const api=(path,options)=>window.ManttoAuth.api(path,options);
      const capsResult=await window.ManttoAuth.apiGet('/api/offline/capabilities');
      const caps=capsResult?.data;
      if(caps?.permission_code!==PERMISSION_CODE||Number(caps.effective_user_id)!==effective||caps.viewer_read_only===true)
        fail('No se pudo revalidar la identidad y el permiso offline.');
      rememberAuthorizedCatalog(caps,actor,effective);
      cacheAuthorizedModuleShell(caps);
      const allAuthorized={};
      for(const m of caps.catalog_modules||[]){
        for(const dataset of m.datasets||[]){
          if(m.scope?.scope_signature)allAuthorized[`${m.domain}:${String(dataset).toUpperCase()}`]=m.scope.scope_signature;
        }
      }
      await window.ManttoOfflineStorage.pruneOutbox?.({actor_user_id:actor,effective_user_id:effective},allAuthorized);
      const excluded=readExcluded(actor,effective);
      const selectedModules=selected(caps.catalog_modules,excluded);
      const available=activeSelectedDatasets(caps,selectedModules);
      const unsupported=selectedModules.filter(m=>!(m.datasets||[]).some(k=>available.some(e=>e.dataset.key===k&&e.module.code===m.code&&e.module.domain===m.domain)));
      // Los modulos no exportables quedan fuera del denominador: NO son fallos.
      const totalModules=available.length;
      notify('start',{identity,total_modules:totalModules,completed_modules:0,overall_percent:0});
      // Reconciliación segura: permisos actuales y selección. Los datos fuera de alcance se limpian.
      await window.ManttoOfflineStorage.pruneSnapshots({actor_user_id:actor,effective_user_id:effective},buildAuthorizedMap(available));
      const results=[],failed=[];
      for(const [index,entry] of available.entries()){
        renew?.();
        const moduleName=entry.module.name||entry.dataset.label||entry.dataset.key;
        notify('module-start',{identity,module:moduleName,dataset:entry.dataset.key,
          module_index:index+1,total_modules:totalModules,completed_modules:results.length,
          module_percent:0,overall_percent:backupPercent(results.length,totalModules)});
        try{
          const row=await backupDataset(api,window.ManttoOfflineStorage,entry,actor,effective,detail=>{
            renew?.();
            notify('progress',{...detail,module:moduleName,module_index:index+1,total_modules:totalModules,
              completed_modules:results.length,
              overall_percent:backupPercent(results.length,totalModules,detail.progress_fraction)});
          },epoch);
          results.push({dataset:entry.dataset.key,domain:entry.dataset.domain,records:row.record_count,size:row.byte_size});
          notify('completed',{...results[results.length-1],identity,module:moduleName,
            module_percent:100,module_index:index+1,total_modules:totalModules,
            completed_modules:results.length,
            overall_percent:backupPercent(results.length,totalModules,0,results.length===totalModules)});
        }catch(error){
          failed.push({dataset:entry.dataset.key,error:String(error?.message||error).slice(0,300)});
          notify('error',{dataset:entry.dataset.key,module:moduleName,module_index:index+1,
            total_modules:totalModules,completed_modules:results.length,
            overall_percent:backupPercent(results.length,totalModules),error:String(error?.message||error)});
        }
      }
      const now=new Date().toISOString();
      const status=failed.length?'FAIL':totalModules?'PASS':'NO_AVAILABLE';
      if(status==='FAIL')markFailed(effective,failed[0]?.error);
      else if(status==='PASS'){
        markCompleted(effective,now);
        writePreferences(effective,{last_backup_status:status,last_backup_modules:results.length,
          unsupported_modules:unsupported.map(m=>`${m.domain}:${m.code}`),last_backup_error:null});
      }else{
        writePreferences(effective,{last_backup_status:status,last_backup_modules:0,
          unsupported_modules:unsupported.map(m=>`${m.domain}:${m.code}`),last_backup_error:'No hay modulos seleccionados con respaldo disponible.'});
      }
      const report={status,completed:results,failed,unsupported:unsupported.map(m=>`${m.domain}:${m.code}`),
        total_modules:totalModules,completed_modules:results.length,
        overall_percent:backupPercent(results.length,totalModules,0,status==='PASS'),at:now};
      notify('summary',report);
      return report;
    });
    try{return await active;}finally{active=null;}
  }
  async function revalidateCopies(force=false){
    const state=window.ManttoPermissions?.state?.(PERMISSION_CODE);
    if(state?.exists===true&&state.efectivo===false){
      // Revocación explícita: nunca conservar un respaldo utilizable.
      await window.ManttoOfflineStorage?.purgeAll?.();
      return {removed:true,reason:'revoked'};
    }
    const actor=actorId(),effective=effectiveId();
    if(!actor||!effective||navigator.onLine===false||!hasPermission()||!window.ManttoOfflineStorage?.pruneSnapshots)
      return {skipped:true,reason:'not-ready'};
    if(revalidating)return revalidating;
    if(!force&&Date.now()-lastRevalidation<120000)return {skipped:true,reason:'throttled'};
    lastRevalidation=Date.now();
    revalidating=(async()=>{
      try{
        const response=await window.ManttoAuth.apiGet('/api/offline/capabilities');
        const caps=response?.data;
        if(caps?.permission_code!==PERMISSION_CODE||Number(caps.effective_user_id)!==effective)
          fail('El backend no confirmó la autorización vigente.');
        rememberAuthorizedCatalog(caps,actor,effective);
        const writableScopes={};
        for(const m of caps.catalog_modules||[]){
          for(const dataset of m.datasets||[]){
            if(m.scope?.scope_signature)writableScopes[`${m.domain}:${String(dataset).toUpperCase()}`]=m.scope.scope_signature;
          }
        }
        await window.ManttoOfflineStorage.pruneOutbox?.({actor_user_id:actor,effective_user_id:effective},writableScopes);
        const entries=activeSelectedDatasets(caps,selected(caps.catalog_modules,readExcluded(actor,effective)));
        await window.ManttoOfflineStorage.pruneSnapshots(
          {actor_user_id:actor,effective_user_id:effective},buildAuthorizedMap(entries));
        return {ok:true};
      }catch(error){
        if(Number(error?.status)===403||Number(error?.status)===401){
          await window.ManttoOfflineStorage.purgeAll();
          return {removed:true,reason:'denied'};
        }
        throw error;
      }
    })();
    try{return await revalidating;}finally{revalidating=null;}
  }
  // Fase 5: aviso LOCAL de pendientes y conflictos; la confirmación del
  // servidor se refleja solo después de un ACK idempotente verificado.
  let localPendingCount=0,noticeRevision=0,noticeObserver=null;
  function isNotificationsView(){
    const view=document.getElementById('view-placeholder');
    if(!view)return false;
    const heading=view.querySelector?.('h1');
    return Boolean(heading&&/notificaciones/i.test(heading.textContent||''));
  }
  function showLocalPendingInNotifications(){
    const view=document.getElementById('view-placeholder');
    if(!view)return;
    const existing=document.getElementById('bltnow-offline-local-event');
    if(!localPendingCount||!isNotificationsView()){
      existing?.remove?.();return;
    }
    if(existing){
      const count=existing.querySelector?.('[data-count]');
      const label=`${localPendingCount} operaciones pendientes de sincronización`;
      if(count&&count.textContent!==label)count.textContent=label;
      return;
    }
    const card=document.createElement('article');
    card.id='bltnow-offline-local-event';card.setAttribute('role','status');
    card.style.cssText='padding:15px;margin:14px 0;border:1px solid #b5c6da;border-radius:10px;background:rgba(85,130,185,.07);';
    const title=document.createElement('strong');title.textContent='🔔 Aviso local · Modo Offline';
    const content=document.createElement('p');content.setAttribute('data-count','1');
    content.textContent=`${localPendingCount} operaciones pendientes de sincronización`;
    const help=document.createElement('p');
    help.textContent=navigator.onLine===false
      ?'Conéctate para iniciar la sincronización segura de pendientes.'
      :'Sincronización automática disponible; consulta Modo Offline si hay conflictos.';
    const button=document.createElement('button');button.type='button';
    button.textContent='Ver pendientes';button.style.cssText='padding:8px 12px;border-radius:8px;cursor:pointer;';
    button.onclick=()=>window.ManttoRouter?.go?.('offline-configuracion');
    card.append(title,content,help,button);
    const parent=view.querySelector?.('.placeholder .card')||view;
    parent.append(card);
  }
  function updateLocalNotice(count){
    localPendingCount=count;
    const btn=document.getElementById('hdr-notif-btn');
    const prev=document.getElementById('bltnow-offline-header-count');
    if(!count){prev?.remove?.();showLocalPendingInNotifications();return;}
    if(btn){
      let badge=prev;
      if(!badge){
        badge=document.createElement('span');badge.id='bltnow-offline-header-count';
        badge.setAttribute('aria-label','Operaciones offline pendientes');
        badge.style.cssText='position:absolute;right:-6px;bottom:-6px;font-size:10px;background:#6941c6;color:#fff;border-radius:9px;padding:1px 4px;line-height:14px;';
        btn.style.position='relative';btn.append(badge);
      }
      badge.textContent=count>99?'99+':String(count);
      btn.title=`Notificaciones · ${count} pendientes locales de sincronización`;
    }
    showLocalPendingInNotifications();
    if(!noticeObserver&&typeof MutationObserver==='function'){
      const placeholder=document.getElementById('view-placeholder');
      if(placeholder){
        noticeObserver=new MutationObserver(()=>showLocalPendingInNotifications());
        noticeObserver.observe(placeholder,{childList:true,subtree:true});
      }
    }
  }
  async function refreshPendingNotice(){
    const revision=++noticeRevision,actor=actorId(),effective=effectiveId();
    if(!actor||!effective||!window.ManttoOfflineStorage?.outboxStatus){
      if(revision===noticeRevision)updateLocalNotice(0);
      return {count:0};
    }
    try{
      const status=await window.ManttoOfflineStorage.outboxStatus({actor_user_id:actor,effective_user_id:effective});
      if(revision!==noticeRevision)return status;
      const count=Number(status?.count)||0;
      updateLocalNotice(count);
      if(count){
        document.dispatchEvent(new CustomEvent('mantto:offline-sync-required',{
          detail:{actor_user_id:actor,effective_user_id:effective,count,online:navigator.onLine!==false,local_only:true}
        }));
      }
      return status;
    }catch(error){console.warn('[Offline] No fue posible comprobar los pendientes locales:',error);return {count:0,error:true};}
  }
  // Fase 5: se ejecuta con la PWA activa, nunca desde Service Worker
  // ni con usuario en modo Visor. Se revalida catálogo y permiso en servidor.
  let pendingSync=null,lastSyncAttempt=0;
  function syncSameSession(actor,effective,epoch){
    return actorId()===actor&&effectiveId()===effective&&sessionEpoch===epoch&&
      hasPermission()&&window.ManttoAuth?.isViewingAs?.()!==true;
  }
  function authorizedScopeMap(caps){
    const allowed={};
    for(const m of caps?.catalog_modules||[]){
      if(!m?.scope?.scope_signature||!['UNITED','CORELLIAN'].includes(m.domain))continue;
      for(const dataset of m.datasets||[]){
        allowed[`${m.domain}:${String(dataset).toUpperCase()}`]=m.scope.scope_signature;
      }
    }
    return allowed;
  }
  async function syncPendingNow(options={}){
    if(pendingSync)return pendingSync;
    const actor=actorId(),effective=effectiveId(),epoch=sessionEpoch,storage=window.ManttoOfflineStorage;
    if(!actor||!effective||!storage?.listSendableActions||!storage?.claimPendingAction||
       !storage?.settlePendingAction||navigator.onLine===false||!hasPermission()||
       window.ManttoAuth?.isViewingAs?.()===true)
      return {skipped:true,reason:'unavailable'};
    if(options.manual!==true&&Date.now()-lastSyncAttempt<60000)return {skipped:true,reason:'throttled'};
    lastSyncAttempt=Date.now();
    pendingSync=(async()=>{
      const identity={actor_user_id:actor,effective_user_id:effective};
      const response=await window.ManttoAuth.apiGet('/api/offline/capabilities');
      if(!syncSameSession(actor,effective,epoch))return {skipped:true,reason:'identity-changed'};
      const caps=response?.data;
      if(caps?.viewer_read_only===true||caps?.permission_code!==PERMISSION_CODE||
         Number(caps?.effective_user_id)!==effective)
        throw new Error('El servidor no confirmó permisos offline vigentes.');
      const allowed=authorizedScopeMap(caps);
      await storage.pruneOutbox(identity,allowed);
      const actions=await storage.listSendableActions(identity,30);
      const report={sent:0,retried:0,conflicts:0,remaining:actions.length};
      for(const action of actions){
        if(!syncSameSession(actor,effective,epoch)||navigator.onLine===false)break;
        const moduleKey=`${action.domain}:${action.dataset}`;
        if(allowed[moduleKey]!==action.scope_signature)continue;
        let claimed;
        try{claimed=await storage.claimPendingAction(identity,action.id);}
        catch(_error){continue;}
        const endpoint=claimed.domain==='UNITED'
          ?'/api/offline/actions/sync/united':'/api/offline/actions/sync/corellian';
        const body={idempotency_key:claimed.idempotency_key,actor_user_id:actor,
          effective_user_id:effective,domain:claimed.domain,dataset:claimed.dataset.toLowerCase(),
          kind:claimed.kind,action:claimed.action,record_id:claimed.record_id,
          reference:claimed.reference,scope_signature:claimed.scope_signature,
          source_run_id:claimed.source_run_id,created_at:claimed.created_at,
          payload:{text:claimed.payload?.text}};
        try{
          const accepted=await window.ManttoAuth.api(endpoint,
            {method:'POST',body:JSON.stringify(body),cache:'no-store'});
          if(!syncSameSession(actor,effective,epoch))break;
          if(accepted?.ok!==true||!accepted.ack)throw new Error('El servidor no entregó acuse verificable.');
          await storage.settlePendingAction(identity,claimed.id,claimed.claim_token,
            {state:'ACK',ack:accepted.ack});
          report.sent++;
        }catch(error){
          if(!syncSameSession(actor,effective,epoch))break;
          const code=String(error?.code||'');const status=Number(error?.status||0);
          const conflict=(status===400||status===403||status===404||
            (status===409&&code!=='OFFLINE_SYNC_BUSY'));
          try{
            await storage.settlePendingAction(identity,claimed.id,claimed.claim_token,
              {state:conflict?'CONFLICT':'RETRY',reason:String(error?.message||'Sin confirmación del servidor')});
            if(conflict)report.conflicts++;else report.retried++;
          }catch(settleError){console.warn('[Offline] Pendiente retenido para revisión:',settleError);}
          if(status===401||navigator.onLine===false)break;
        }
      }
      await refreshPendingNotice();
      document.dispatchEvent(new CustomEvent('mantto:offline-sync-summary',{detail:report}));
      return report;
    })();
    try{return await pendingSync;}
    finally{pendingSync=null;}
  }
  function schedulePendingSync(){
    if(navigator.onLine===false)return;
    window.setTimeout(()=>syncPendingNow().catch(error=>{
      console.warn('[Modo Offline] Sincronización diferida:',error?.message||error);
    }),0);
  }

  function evaluate(){
    const id=effectiveId();
    if(!id||!hasPermission()){
      const p=window.ManttoPermissions?.state?.(PERMISSION_CODE);
      if(p?.exists===true&&p.efectivo===false)revalidateCopies(true).catch(error=>notify('error',{error:String(error.message||error)}));
      return {due:false,reason:'unauthorized'};
    }
    if(navigator.onLine!==false)revalidateCopies().catch(error=>notify('error',{error:String(error.message||error)}));
    const due=dueState(readPreferences(id),new Date());
    if(due.due){
      localStorage.setItem(PENDING_PREFIX+id,JSON.stringify({user_id:id,due_at:due.due_at,detected_at:new Date().toISOString()}));
      // El callback no bloquea autenticación ni navegación.
      window.setTimeout(()=>performBackup().catch(error=>{
        markFailed(id,error?.message||error);notify('error',{error:String(error?.message||error)});
      }),0);
    }
    return due;
  }
  function markCompleted(id,at){
    const user=positiveId(id);if(!user)throw new Error('Usuario no identificado.');
    localStorage.removeItem(PENDING_PREFIX+user);
    return writePreferences(user,{last_backup_at:at||new Date().toISOString(),last_backup_status:'PASS'});
  }
  function markFailed(id,error){
    const user=positiveId(id);if(!user)return null;
    return writePreferences(user,{last_backup_status:'FAIL',last_backup_error:String(error||'Error de respaldo').slice(0,300)});
  }
  function backupNow(){return performBackup({manual:true});}

  document.addEventListener('mantto:logout',()=>{sessionEpoch++;updateLocalNotice(0);noticeRevision++;});
  document.addEventListener('mantto:auth-ready',()=>window.setTimeout(()=>{evaluate();refreshPendingNotice();schedulePendingSync();},1200));
  document.addEventListener('mantto:permissions-updated',evaluate);
  document.addEventListener('mantto:offline-backup-configured',()=>window.setTimeout(()=>backupNow().catch(error=>notify('error',{error:error.message})),0));
  window.addEventListener('online',()=>{evaluate();refreshPendingNotice();schedulePendingSync();});
  window.addEventListener('offline',refreshPendingNotice);
  document.addEventListener('mantto:offline-outbox-changed',refreshPendingNotice);
  document.addEventListener('mantto:offline-action-created',schedulePendingSync);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){evaluate();schedulePendingSync();}});
  window.setInterval(()=>{if(!document.hidden){evaluate();refreshPendingNotice();schedulePendingSync();}},INTERVAL_MS);

  window.ManttoOfflineScheduler={evaluate,dueState,markCompleted,markFailed,readPreferences,backupNow,revalidateCopies,refreshPendingNotice,syncPendingNow};

  // Adaptador de navegacion desacoplado. Sin instaladores ni cambios en index.
  function installOfflineNavigation(){
    if(window.ManttoOfflineNavigation||typeof document.createElement!=='function'||!document.head?.appendChild||
       document.getElementById?.('bltnow-offline-navigation-script'))return;
    const script=document.createElement('script');
    script.id='bltnow-offline-navigation-script';
    script.src='./core/offline-navigation.js?v=20261020-offline-sidebar-shell-v001';
    script.async=false;
    script.addEventListener('error',()=>console.warn('[Offline] No se pudo cargar el adaptador de navegacion.'));
    document.head.appendChild(script);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installOfflineNavigation,{once:true});
  else installOfflineNavigation();
})();

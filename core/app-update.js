(function(){
  'use strict';

  const BUILD_INFO_URL='./core/build-info.generated.js';
  const CHECK_INTERVAL_MS=5*60*1000;
  const PROFILE_RECHECK_MS=30*1000;
  const state={
    available:false,
    checking:false,
    applying:false,
    latest:null,
    error:'',
    lastCheckedAt:0
  };

  function normalizeBuild(value){
    const raw=value&&typeof value==='object'?value:{};
    return {
      environment:String(raw.environment||'').trim().toUpperCase(),
      provider:String(raw.provider||'').trim(),
      message:String(raw.message||'').trim(),
      commit:String(raw.commit||'').trim(),
      commitShort:String(raw.commitShort||'').trim(),
      generatedAt:String(raw.generatedAt||'').trim()
    };
  }

  function buildKey(value){
    const info=normalizeBuild(value);
    return info.commit||info.commitShort||[info.message,info.generatedAt].filter(Boolean).join('|');
  }

  function parseBuildInfoSource(source){
    const text=String(source||'');
    const assignment=text.indexOf('window.MANTTO_BUILD_INFO');
    const freezeStart=text.indexOf('Object.freeze(',assignment);
    const objectStart=text.indexOf('{',freezeStart);
    const objectEnd=text.lastIndexOf('}');
    if(assignment<0||freezeStart<0||objectStart<0||objectEnd<=objectStart){
      throw new Error('La metadata de la versión publicada no tiene el formato esperado.');
    }
    return normalizeBuild(JSON.parse(text.slice(objectStart,objectEnd+1)));
  }

  function hasNewerBuild(current,remote){
    const installed=buildKey(current);
    const published=buildKey(remote);
    return Boolean(installed&&published&&installed!==published&&normalizeBuild(remote).environment==='DEPLOY');
  }

  function publicState(){
    return Object.freeze({
      available:state.available,
      checking:state.checking,
      applying:state.applying,
      latest:state.latest?Object.freeze(Object.assign({},state.latest)):null,
      error:state.error,
      lastCheckedAt:state.lastCheckedAt
    });
  }

  function renderProfileControl(){
    const panel=document.getElementById('usr-app-update');
    const button=document.getElementById('usr-app-update-button');
    const status=document.getElementById('usr-app-update-status');
    if(!panel||!button||!status)return;

    panel.hidden=!state.available;
    if(!state.available)return;

    button.disabled=state.applying;
    button.textContent=state.applying?'Descargando actualización…':'Descargar actualización';
    const installed=normalizeBuild(window.MANTTO_BUILD_INFO).message;
    const published=normalizeBuild(state.latest).message;
    status.textContent=state.error
      ? state.error
      : installed&&published
        ? 'Tu PWA tiene '+installed+'. Está disponible '+published+'.'
        : 'Hay una versión más reciente de BLT NOW disponible.';
    status.classList.toggle('error',Boolean(state.error));

    if(button.dataset.updateBound!=='1'){
      button.dataset.updateBound='1';
      button.addEventListener('click',()=>applyUpdate().catch(()=>null));
    }
  }

  function emitState(){
    renderProfileControl();
    if(typeof window.CustomEvent==='function'){
      document.dispatchEvent(new CustomEvent('mantto:app-update-state',{detail:publicState()}));
    }
  }

  async function checkForUpdate(){
    if(state.checking||state.applying)return publicState();
    state.checking=true;
    state.error='';
    try{
      const separator=BUILD_INFO_URL.includes('?')?'&':'?';
      const response=await fetch(BUILD_INFO_URL+separator+'update_check='+Date.now(),{
        cache:'no-store',
        credentials:'same-origin',
        headers:{Accept:'text/javascript'}
      });
      if(!response.ok)throw new Error('No fue posible consultar la versión publicada.');
      const latest=parseBuildInfoSource(await response.text());
      state.latest=latest;
      state.available=hasNewerBuild(window.MANTTO_BUILD_INFO,latest);
      state.lastCheckedAt=Date.now();
    }catch(error){
      // Una falla temporal de red no debe interrumpir el uso de la aplicación.
      console.warn('[BLT NOW] No fue posible comprobar actualizaciones:',error);
    }finally{
      state.checking=false;
      emitState();
    }
    return publicState();
  }

  function sameOriginAssetUrls(){
    const urls=new Set([new URL('./index.html',window.location.href).href]);
    document.querySelectorAll('script[src],link[rel="stylesheet"][href]').forEach(element=>{
      const value=element.src||element.href;
      if(value)urls.add(value);
    });
    if(window.performance&&typeof window.performance.getEntriesByType==='function'){
      window.performance.getEntriesByType('resource').forEach(entry=>{
        if(entry&&entry.name)urls.add(entry.name);
      });
    }
    return [...urls].filter(value=>{
      try{
        const url=new URL(value,window.location.href);
        return url.origin===window.location.origin&&/\.(?:css|html|js|json)$/i.test(url.pathname);
      }catch(_){return false;}
    });
  }

  async function refreshLoadedAssets(){
    const requests=sameOriginAssetUrls().map(url=>fetch(url,{
      cache:'reload',
      credentials:'same-origin'
    }).then(response=>{
      if(!response.ok)throw new Error('No se pudo descargar '+url);
      return response;
    }));
    const results=await Promise.allSettled(requests);
    if(results[0]&&results[0].status==='rejected')throw results[0].reason;
  }

  async function clearAppCaches(){
    if(!('caches' in window))return;
    const keys=await window.caches.keys();
    await Promise.all(keys.filter(key=>/^(?:blt-now|mantto)/i.test(key)).map(key=>window.caches.delete(key)));
  }

  async function updateServiceWorker(){
    if(!('serviceWorker' in navigator))return;
    const token=(buildKey(state.latest)||String(Date.now())).replace(/[^a-z0-9_-]/gi,'').slice(0,40);
    const workerUrl='./service-worker.js?blt_update='+encodeURIComponent(token||String(Date.now()));
    const registration=typeof navigator.serviceWorker.register==='function'
      ? await navigator.serviceWorker.register(workerUrl,{scope:'./',updateViaCache:'none'})
      : await navigator.serviceWorker.getRegistration('./');
    if(!registration)return;
    await registration.update();
    if(registration.waiting)registration.waiting.postMessage({type:'SKIP_WAITING'});
  }

  async function applyUpdate(){
    if(state.applying)return;
    state.applying=true;
    state.error='';
    emitState();
    try{
      const operations=await Promise.allSettled([
        updateServiceWorker(),
        clearAppCaches(),
        refreshLoadedAssets()
      ]);
      if(operations[2].status==='rejected')throw operations[2].reason;
      operations.slice(0,2).forEach(result=>{
        if(result.status==='rejected')console.warn('[BLT NOW] Actualización complementaria no disponible:',result.reason);
      });
      const token=(buildKey(state.latest)||String(Date.now())).replace(/[^a-z0-9_-]/gi,'').slice(0,40)||String(Date.now());
      const target=new URL(window.location.href);
      target.searchParams.set('blt_update',token);
      window.location.replace(target.href);
    }catch(error){
      state.applying=false;
      state.error='No fue posible completar la actualización. Revisa tu conexión e inténtalo nuevamente.';
      emitState();
      throw error;
    }
  }

  function mountProfile(){
    renderProfileControl();
    if(!state.checking&&Date.now()-state.lastCheckedAt>PROFILE_RECHECK_MS){
      checkForUpdate().catch(()=>null);
    }
  }

  function answerServiceWorkerProbe(event){
    if(!event||!event.data||event.data.type!=='BLT_VERSION_PROBE')return;
    const port=event.ports&&event.ports[0];
    if(!port||typeof port.postMessage!=='function')return;
    port.postMessage({
      type:'BLT_VERSION_RESPONSE',
      managedUpdate:true,
      build:buildKey(window.MANTTO_BUILD_INFO)
    });
  }

  function cleanUpdateParameters(){
    if(!window.history||typeof window.history.replaceState!=='function')return;
    const target=new URL(window.location.href);
    const hadUpdateParameter=target.searchParams.has('blt_update')||target.searchParams.has('blt_sw_update');
    if(!hadUpdateParameter)return;
    target.searchParams.delete('blt_update');
    target.searchParams.delete('blt_sw_update');
    window.history.replaceState(window.history.state,document.title,target.pathname+(target.search||'')+(target.hash||''));
  }

  function init(){
    cleanUpdateParameters();
    window.setTimeout(()=>checkForUpdate().catch(()=>null),1500);
    window.setInterval(()=>checkForUpdate().catch(()=>null),CHECK_INTERVAL_MS);
    document.addEventListener('visibilitychange',()=>{
      if(document.visibilityState==='visible'&&Date.now()-state.lastCheckedAt>PROFILE_RECHECK_MS){
        checkForUpdate().catch(()=>null);
      }
    });
    window.addEventListener('online',()=>checkForUpdate().catch(()=>null));
  }

  window.ManttoAppUpdate=Object.freeze({
    checkForUpdate,
    applyUpdate,
    mountProfile,
    getState:publicState,
    parseBuildInfoSource,
    hasNewerBuild,
    answerServiceWorkerProbe
  });

  if(navigator.serviceWorker&&typeof navigator.serviceWorker.addEventListener==='function'){
    navigator.serviceWorker.addEventListener('message',answerServiceWorkerProbe);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();

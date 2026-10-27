/* BLT NOW · Experimental NS · F8.
 * Instrumentacion temporal y agrupacion de invalidaciones por pestaña.
 * NO afecta core/data-sync.js, no almacena informacion operativa ni la envia.
 */
(function(){
  'use strict';
  if(window.ManttoExperimentalNsPerformance)return;
  const ROUTES=new Set([
    'experimental-ns-resumen-dia',
    'experimental-ns-equipos-criticos',
    'experimental-ns-proyectos-mantenimiento'
  ]);
  const WINDOW_MS=250;
  const MAX_SAMPLES=100;
  const metrics=new Map(),queue=new Map();

  function clock(){return typeof window.performance?.now==='function'?window.performance.now():Date.now();}
  function state(route){
    if(!ROUTES.has(route))return null;
    if(!metrics.has(route))metrics.set(route,{
      requests:0,revisions:0,queries:0,failures:0,checks:0,refreshes:0,
      visualChanges:0,coalesced:0,skipped:0,backoffs:0,
      inFlight:0,peakInFlight:0,latencies:[],refreshLatencies:[]
    });
    return metrics.get(route);
  }
  function push(sample,ms){
    if(!Number.isFinite(ms)||ms<0)return;
    sample.push(ms);
    if(sample.length>MAX_SAMPLES)sample.shift();
  }
  function percentile(values,p){
    if(!values.length)return null;
    const a=values.slice().sort((x,y)=>x-y);
    return a[Math.max(0,Math.ceil(a.length*p)-1)];
  }
  function isProgrammer(){
    const actor=window.ManttoAuth?.getActorUser?.();
    return actor?.is_programador===true; // Nunca inferir por rol o visor.
  }
  async function measureGet(route,kind,request){
    if(typeof request!=='function')throw new TypeError('Solicitud experimental invalida.');
    const current=state(route);
    if(!current)return request();
    const start=clock();
    current.requests++;
    if(kind==='revision')current.revisions++;
    else current.queries++;
    current.inFlight++;
    current.peakInFlight=Math.max(current.peakInFlight,current.inFlight);
    try{return await request();}
    catch(error){current.failures++;throw error;}
    finally{
      current.inFlight=Math.max(0,current.inFlight-1);
      push(current.latencies,clock()-start);
    }
  }
  function noteCheck(route){const m=state(route);if(m)m.checks++;}
  function noteRefresh(route,changed,ms){
    const m=state(route);if(!m)return;
    m.refreshes++;
    m.visualChanges+=Math.max(0,Number(changed)||0);
    push(m.refreshLatencies,ms);
  }
  function noteSkip(route,kind){const m=state(route);if(!m)return;m.skipped++;if(kind==='backoff')m.backoffs++;}
  function enqueue(route,request,delay=WINDOW_MS){
    if(!ROUTES.has(route)||typeof request!=='function')return Promise.resolve(false);
    const pending=queue.get(route);
    if(pending){state(route).coalesced++;return pending.promise;}
    let resolve,reject;
    const promise=new Promise((ok,fail)=>{resolve=ok;reject=fail;});
    const queued={timer:null,promise,resolve,reject};
    queue.set(route,queued);
    queued.timer=window.setTimeout(()=>{
      queue.delete(route);
      Promise.resolve().then(request).then(resolve,reject);
    },Math.max(0,Number(delay)||0));
    return promise;
  }
  function clear(){
    for(const item of queue.values()){
      window.clearTimeout?.(item.timer);
      item.resolve(false);
    }
    queue.clear();metrics.clear();
    document.querySelectorAll?.('.expns-performance')?.forEach(node=>node.remove());
  }
  function report(route){
    const m=state(route);if(!m)return null;
    return Object.freeze({
      requests:m.requests,revisions:m.revisions,dataRequests:m.queries,
      failures:m.failures,checks:m.checks,refreshes:m.refreshes,
      visualChanges:m.visualChanges,coalesced:m.coalesced,
      skipped:m.skipped,backoffs:m.backoffs,peakInFlight:m.peakInFlight,
      p50Ms:percentile(m.latencies,0.5),p95Ms:percentile(m.latencies,0.95),
      refreshP95Ms:percentile(m.refreshLatencies,0.95),
      memoryBytes:(Number.isFinite(window.performance?.memory?.usedJSHeapSize)
        ?window.performance.memory.usedJSHeapSize:null)
    });
  }
  function render(route,root){
    if(!ROUTES.has(route)||!root)return;
    let details=root.querySelector?.('.expns-performance');
    if(!isProgrammer()){
      details?.remove();return;
    }
    if(!details){
      details=document.createElement('details');details.className='expns-performance';
      const summary=document.createElement('summary');
      summary.textContent='⚙️ Diagnóstico de rendimiento NS (solo Programador)';
      const output=document.createElement('output');output.className='expns-performance-values';
      details.appendChild(summary);details.appendChild(output);
      const banner=root.querySelector('.expns-live-line');
      if(banner?.after)banner.after(details);else root.insertBefore(details,root.firstChild);
    }
    const m=report(route);
    const time=v=>v==null?'N/D':(Math.round(v*10)/10)+' ms';
    const heap=m.memoryBytes==null?'N/D':(m.memoryBytes/1048576).toFixed(1)+' MiB (pestaña)';
    const output=details.querySelector('.expns-performance-values');
    if(output)output.textContent=`GET: ${m.requests} · Revisiones: ${m.revisions} · Datos: ${m.dataRequests} · `+
      `Actualizaciones: ${m.refreshes} · Cambios visibles: ${m.visualChanges} · `+
      `Agrupadas: ${m.coalesced} · Omitidas: ${m.skipped} · Errores: ${m.failures} · `+
      `p50 GET: ${time(m.p50Ms)} · p95 GET: ${time(m.p95Ms)} · p95 vista: ${time(m.refreshP95Ms)} · Memoria: ${heap}`;
  }
  window.ManttoExperimentalNsPerformance=Object.freeze({
    measureGet,noteCheck,noteRefresh,noteSkip,enqueue,report,render,clear,
    config:Object.freeze({batchWindowMs:WINDOW_MS,samplesLimit:MAX_SAMPLES})
  });
})();

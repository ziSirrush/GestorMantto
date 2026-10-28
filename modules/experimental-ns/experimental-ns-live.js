/* BLT NOW | Experimental NS | F6: caché en memoria, revisión ligera y parcheo DOM.
 * Independiente de core/data-sync.js. Sin almacenamiento permanente.
 */
(function(){
  'use strict';
  if(window.ManttoExperimentalNsLive)return;
  const CHECK_MS=30000;
  const FORCE_VALIDATE_MS=120000;
  // F8: unicamente el modulo NS activo consulta. Los eventos se agrupan.
  const MAX_BACKOFF_MS=120000;
  const MODULE_BY_ROUTE=Object.freeze({
    'experimental-ns-resumen-dia':'resumen-dia',
    'experimental-ns-equipos-criticos':'equipos-criticos',
    'experimental-ns-proyectos-mantenimiento':'proyectos-mantenimiento'
  });
  const entries=new Map();
  let identity='';
  let timer=null;

  function active(){return window.ManttoRouter?.getCurrent?.()?.route||'';}
  function authKey(){
    const auth=window.ManttoAuth;
    const effective=auth?.getUser?.();
    if(!effective)return '';
    const actor=auth?.getActorUser?.()||effective;
    const viewed=auth?.getViewUser?.();
    const id=u=>String(u?.id_SB??u?.id??u?.user_id??u?.correo??u?.email??'');
    // Una sesion sin identificador verificable nunca reutiliza cache.
    if(!id(actor)||!id(effective))return '';
    return JSON.stringify([id(actor),id(effective),id(viewed),String(actor.rol||''),String(effective.rol||'')]);
  }
  function routeView(route){return document.getElementById('view-'+route);}
  function clear(reason){
    for(const entry of entries.values()){
      entry.version=null;entry.lastFetched=0;entry.busy=false;entry.visible=false;
      entry.pending=false;entry.retryCount=0;entry.nextRetryAt=0;
      if(typeof entry.reset==='function')entry.reset(reason||'cambio de sesion');
    }
    // F7: al revocarse acceso o cambiar el usuario se elimina tambien el
    // borrador local de la misma sesion, nunca se retiene dato experimental.
    window.ManttoExperimentalNsProtection?.clear();
    window.ManttoExperimentalNsPerformance?.clear();
    identity=authKey();
  }
  function validIdentity(){
    const key=authKey();
    if(!key){if(identity)clear('sin sesion');return false;}
    if(identity && key!==identity)clear('cambio de usuario efectivo');
    identity=key;
    return true;
  }
  function show(route,message,kind){
    const root=routeView(route);if(!root)return;
    let el=root.querySelector('.expns-live-line');
    if(!el){
      el=document.createElement('div');el.className='expns-live-line';
      el.setAttribute('role','status');el.setAttribute('aria-live','polite');
      root.insertBefore(el,root.firstChild);
    }
    el.dataset.state=kind||'ok';
    el.textContent=String(message||'');
    window.ManttoExperimentalNsPerformance?.render(route,root);
  }
  function register(route,callbacks){
    if(!MODULE_BY_ROUTE[route]||!callbacks||typeof callbacks.refreshSilent!=='function')return false;
    if(!validIdentity())return false;
    const prior=entries.get(route);
    const entry=prior||{version:null,lastFetched:0,busy:false,visible:false,
      pending:false,retryCount:0,nextRetryAt:0};
    entry.refreshSilent=callbacks.refreshSilent;
    entry.revisionQuery=typeof callbacks.revisionQuery==='function'?callbacks.revisionQuery:null;
    entry.reset=callbacks.reset;
    entries.set(route,entry);
    show(route,entry.lastFetched?'🟢 Información en memoria · verificando actualizaciones de NS en Aiven':'🧪 Experimental NS · preparando caché','ok');
    if(!timer)timer=window.setInterval(()=>queueCheck(active(),false,true),CHECK_MS);
    return true;
  }
  function markFetched(route){
    if(!validIdentity())return;
    const entry=entries.get(route);if(!entry)return;
    entry.lastFetched=Date.now();entry.visible=true;
    show(route,'🟢 Datos cargados · verificación automática cada 30 s','ok');
  }
  function highlight(node){
    if(!node||node.nodeType!==1)return;
    node.classList.add('expns-live-changed');
    // Al limpiar solo retiramos nuestra clase, nunca reemplazamos el nodo.
    window.setTimeout(()=>node.classList?.remove('expns-live-changed'),4500);
  }
  function editing(node){
    if(!node || node.nodeType!==1)return false;
    const current=document.activeElement;
    const isField=el=>Boolean(el&&el.matches&&el.matches('input,textarea,select,[contenteditable="true"]'));
    return Boolean(
      (current&&isField(current)&&(node===current||node.contains(current))) ||
      isField(node) ||
      node.querySelector?.('input,textarea,select,[contenteditable="true"]') ||
      node.matches?.('[data-expns-dirty="true"]') ||
      node.querySelector?.('[data-expns-dirty="true"]')
    );
  }
  function setText(node,value,route){
    if(!node)return false;
    const next=String(value==null?'':value);
    if(node.textContent===next)return false;
    if(editing(node))return false;
    node.textContent=next;
    if(entries.get(route)?.applying)highlight(node);
    return true;
  }
  function patchRows(tbody,html,route){
    if(!tbody)return 0;
    const fragment=document.createElement('tbody');fragment.innerHTML=html;
    const next=[...fragment.children];
    const old=[...tbody.children];
    const map=new Map(old.filter(row=>row.dataset?.nsnsKey).map(row=>[row.dataset.nsnsKey,row]));
    const nextKeys=new Set();
    let changed=0;
    const silent=Boolean(entries.get(route)?.applying);
    for(const fresh of next){
      const key=fresh.dataset?.nsnsKey;
      const existing=key?map.get(key):null;
      if(!existing){
        tbody.appendChild(fresh);changed++;
        if(silent)highlight(fresh);
        if(key)nextKeys.add(key);
        continue;
      }
      nextKeys.add(key);
      const oldCells=[...existing.cells],newCells=[...fresh.cells];
      if(oldCells.length!==newCells.length){
        if(!editing(existing)){
          existing.replaceWith(fresh);changed++;if(silent)highlight(fresh);
        }
        continue;
      }
      for(let i=0;i<newCells.length;i++){
        const current=oldCells[i],updated=newCells[i];
        if(current.innerHTML===updated.innerHTML&&current.getAttribute('title')===updated.getAttribute('title'))continue;
        if(editing(current))continue;
        current.innerHTML=updated.innerHTML;
        if(updated.hasAttribute('title'))current.setAttribute('title',updated.getAttribute('title'));
        else current.removeAttribute('title');
        changed++;if(silent)highlight(current);
      }
    }
    for(const oldRow of old){
      if(!oldRow.dataset?.nsnsKey || !nextKeys.has(oldRow.dataset.nsnsKey)){
        if(!editing(oldRow)){oldRow.remove();changed++;}
      }
    }
    if(!next.length && !tbody.children.length){
      tbody.innerHTML=html;
    }
    // Mantiene filas existentes en el mismo lugar para no desplazar el foco/scroll.
    return changed;
  }
  function patchTree(target,html,route){
    if(!target)return 0;
    const fragment=document.createElement('div');fragment.innerHTML=html;
    const silent=Boolean(entries.get(route)?.applying);
    let modified=0;
    function visit(oldNode,newNode){
      if(oldNode.nodeType!==newNode.nodeType || (oldNode.nodeType===1&&oldNode.tagName!==newNode.tagName)){
        if(editing(oldNode))return;
        const replacement=newNode.cloneNode(true);oldNode.replaceWith(replacement);modified++;
        if(silent)highlight(replacement.nodeType===1?replacement:replacement.parentElement);
        return;
      }
      if(oldNode.nodeType===3){
        if(oldNode.nodeValue!==newNode.nodeValue){oldNode.nodeValue=newNode.nodeValue;modified++;
          if(silent)highlight(oldNode.parentElement?.closest('td,.rdns-fields>div,.proy-kpi,strong,span')||oldNode.parentElement);}
        return;
      }
      if(oldNode.nodeType!==1||oldNode.matches?.('[data-expns-dirty="true"]'))return;
      if(oldNode.matches('input,textarea,select,[contenteditable="true"]'))return;
      for(const attr of [...oldNode.attributes]){
        if(!newNode.hasAttribute(attr.name)&&!attr.name.startsWith('data-expns-')&&!attr.name.startsWith('aria-live'))oldNode.removeAttribute(attr.name);
      }
      for(const attr of [...newNode.attributes]){
        if(attr.name.startsWith('on'))continue;
        if(oldNode.getAttribute(attr.name)!==attr.value)oldNode.setAttribute(attr.name,attr.value);
      }
      const oldChildren=[...oldNode.childNodes],newChildren=[...newNode.childNodes];
      for(let i=0;i<Math.max(oldChildren.length,newChildren.length);i++){
        const a=oldChildren[i],b=newChildren[i];
        if(!a&&b){const clone=b.cloneNode(true);oldNode.appendChild(clone);modified++;if(silent)highlight(clone);}
        else if(a&&!b){if(!editing(a)){a.remove();modified++;}}
        else if(a&&b)visit(a,b);
      }
    }
    const old=[...target.childNodes],next=[...fragment.childNodes];
    for(let i=0;i<Math.max(old.length,next.length);i++){
      if(!old[i]&&next[i]){target.appendChild(next[i].cloneNode(true));modified++;}
      else if(old[i]&&!next[i]){if(!editing(old[i])){old[i].remove();modified++;}}
      else if(old[i]&&next[i])visit(old[i],next[i]);
    }
    return modified;
  }
  function isApplying(route){return Boolean(entries.get(route)?.applying);}
  function now(){return typeof window.performance?.now==='function'?window.performance.now():Date.now();}
  function queueCheck(route,force,periodic){
    if(!MODULE_BY_ROUTE[route])return Promise.resolve(false);
    const entry=entries.get(route);
    if(entry?.busy){entry.pending=true;return Promise.resolve(false);}
    const performance=window.ManttoExperimentalNsPerformance;
    const delay=periodic?Math.floor(Math.random()*1750):250;
    return performance?.enqueue
      ?performance.enqueue(route,()=>check(route,force),delay)
      :check(route,force);
  }
  async function check(route,force){
    if(!MODULE_BY_ROUTE[route]||!validIdentity()||document.hidden||active()!==route||!navigator.onLine)return false;
    const entry=entries.get(route);
    if(!entry||!entry.lastFetched)return false;
    if(entry.busy){if(force)entry.pending=true;window.ManttoExperimentalNsPerformance?.noteSkip(route,'busy');return false;}
    if(!force && entry.nextRetryAt>Date.now()){
      window.ManttoExperimentalNsPerformance?.noteSkip(route,'backoff');return false;
    }
    const contextKey=identity;
    entry.busy=true;
    try{
      show(route,'🔄 Consultando actualizaciones NS en Aiven…','busy');
      const monitor=window.ManttoExperimentalNsPerformance;
      monitor?.noteCheck(route);
      // El monitoreo usa el MISMO periodo autorizado de la vista.
      const liveFilters=entry.revisionQuery?.()||{};
      const params=[];
      for(const key of ['fecha','dias','dias_proyectos','dias_criticos']){
        const value=liveFilters[key];
        if(value!==undefined&&value!==null&&value!==''){
          params.push(encodeURIComponent(key)+'='+encodeURIComponent(String(value)));
        }
      }
      const path='/api/experimental-ns/live/'+MODULE_BY_ROUTE[route]+'/revision'+
        (params.length?'?'+params.join('&'):'');
      const request=()=>window.ManttoAuth.apiGet(path);
      const res=await (monitor?.measureGet?monitor.measureGet(route,'revision',request):request());
      if(!res||res.ok!==true||res.source!=='experimental-ns'||!/^[a-f0-9]{64}$/.test(res.version||'')){
        throw new Error('Revision experimental invalida.');
      }
      if(!validIdentity()||authKey()!==contextKey||active()!==route)return false;
      const changed=(entry.version!==null && entry.version!==res.version);
      const timed=Date.now()-entry.lastFetched>=FORCE_VALIDATE_MS;
      if(changed||timed||force===true){
        entry.applying=true;
        const started=now();
        const result=await entry.refreshSilent();
        entry.applying=false;
        if(result!==false)monitor?.noteRefresh(route,Number(result?.changed)||0,now()-started);
        if(!validIdentity()||authKey()!==contextKey||active()!==route)return false;
        if(result===false)throw new Error('No fue posible actualizar el modulo experimental.');
        entry.version=res.version;
        entry.lastFetched=Date.now();
        entry.retryCount=0;entry.nextRetryAt=0;
        const count=Number(result?.changed)||0;
        show(route,count?'✅ '+count+' elementos visuales actualizados · sin interrumpir':'✅ Información NS verificada · pantalla conservada','ok');
        return true;
      }
      entry.version=res.version;
      entry.retryCount=0;entry.nextRetryAt=0;
      show(route,'🟢 Sin cambios · información de caché vigente','ok');
      return false;
    }catch(error){
      entry.applying=false;
      // El guard revalida en backend en cada chequeo. Si pierde acceso,
      // no se puede seguir mostrando el cache antiguo.
      const code=String(error?.code||'');
      const unauthorized=[401,403].includes(Number(error?.status||error?.statusCode||error?.response?.status)) ||
        /^(?:ALCANCE_|INFORMATION_GUARD_|EXPERIMENTAL_NS_(?:ACCESS|SCOPE|PROGRAMMER|PERMISSION))/.test(code);
      if(unauthorized){clear('acceso revocado o alcance no resuelto');show(route,'⛔ Acceso experimental no disponible','error');}
      else {
        entry.retryCount=Math.min(4,(entry.retryCount||0)+1);
        entry.nextRetryAt=Date.now()+Math.min(MAX_BACKOFF_MS,CHECK_MS*Math.pow(2,entry.retryCount-1));
        show(route,'⚠️ Sin actualización · reintento gradual, vista conservada','error');
      }
      return false;
    }finally{
      entry.busy=false;entry.applying=false;
      if(entry.pending&&entries.get(route)===entry){
        entry.pending=false;
        if(validIdentity()&&active()===route)queueCheck(route,true,false);
      }
      window.ManttoExperimentalNsPerformance?.render(route,routeView(route));
    }
  }
  function checkActive(force){return check(active(),Boolean(force));}
  function onEvent(){queueCheck(active(),false,false);}
  document.addEventListener('mantto:logout',()=>clear('logout'));
  document.addEventListener('mantto:session-expired',()=>clear('sesion expirada'));
  document.addEventListener('mantto:view-user-changed',()=>clear('visor cambiado'));
  document.addEventListener('mantto:auth-ready',()=>{if(identity && authKey()!==identity)clear('auth cambiado');});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)queueCheck(active(),false,false);});
  window.addEventListener('online',()=>queueCheck(active(),true,false));
  window.addEventListener('offline',()=>{
    const route=active();if(MODULE_BY_ROUTE[route])show(route,'📡 Sin internet · vista en caché, cambios pendientes','error');
  });
  // Evento manual del piloto; luego el receptor NS podra emitir invalidaciones.
  document.addEventListener('mantto:experimental-ns-invalidate',onEvent);
  window.ManttoExperimentalNsLive=Object.freeze({register,markFetched,check,checkActive,queueCheck,clear,show,
    setText,patchRows,patchTree,isApplying,
    config:Object.freeze({checkMs:CHECK_MS,forceValidateMs:FORCE_VALIDATE_MS})});
})();

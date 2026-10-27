/* BLT NOW · Experimental NS · F7: borradores y deteccion local de cambios externos.
 * SOLO local/browser: NO envia comentarios ni modifica Aiven o NetSuite.
 * Mantener fuera de core/data-sync.js y de los modulos productivos.
 */
(function(){
  'use strict';
  if(window.ManttoExperimentalNsProtection) return;
  const STORAGE_KEY='bltnow.expns.f7.drafts.v1';
  const EXPIRE_MS=8*60*60*1000;
  const MAX_DRAFTS=20;
  const MAX_TEXT=5000;
  const MAX_HISTORY=50;
  const ROUTES=new Set(['experimental-ns-resumen-dia','experimental-ns-equipos-criticos','experimental-ns-proyectos-mantenimiento']);
  const FIELD_NAMES=Object.freeze({
    estado_ticket:'Estado ticket',fecha_cierre:'Fecha cierre',codigo_equipo:'Equipo',
    responsabilidad:'Responsabilidad',custeventblt_mot_det:'Motivo NS',
    causa_falla:'Causa de falla',descripcion:'Asunto'
  });
  const FIELD_ALIASES=Object.freeze({
    estado_ticket:['estado_ticket','et'],fecha_cierre:['fecha_cierre','fs'],
    codigo_equipo:['codigo_equipo','cod'],responsabilidad:['responsabilidad','res'],
    custeventblt_mot_det:['custeventblt_mot_det','detalle'],
    causa_falla:['causa_falla','caf'],descripcion:['descripcion','asu']
  });
  let owner='';
  let drafts=Object.create(null);
  let snapshots=new Map();
  let history=[];
  let active=null;
  let saveTimer=null;
  let storageOk=true;

  function userId(user){return String(user?.id_SB??user?.id??user?.user_id??'').trim();}
  function identity(){
    const auth=window.ManttoAuth;
    const effective=auth?.getUser?.();
    if(!effective)return '';
    const actor=auth?.getActorUser?.()||effective;
    const viewed=auth?.getViewUser?.();
    if(!userId(actor)||!userId(effective))return '';
    return JSON.stringify([userId(actor),userId(effective),userId(viewed)]);
  }
  function readStorage(){
    try{return window.sessionStorage?.getItem(STORAGE_KEY)||null;}
    catch(_error){storageOk=false;return null;}
  }
  function removeStorage(){
    try{window.sessionStorage?.removeItem(STORAGE_KEY);}catch(_error){storageOk=false;}
  }
  function readForOwner(){
    const raw=readStorage();
    if(!raw)return;
    try{
      const parsed=JSON.parse(raw);
      if(parsed?.version!==1||parsed.owner!==owner||!parsed.drafts||typeof parsed.drafts!=='object'){
        removeStorage();return;
      }
      const now=Date.now();
      for(const [ticket,draft] of Object.entries(parsed.drafts)){
        if(typeof ticket!=='string'||ticket.length>120||!draft||typeof draft!=='object')continue;
        if(typeof draft.text!=='string'||draft.text.length>MAX_TEXT||!draft.text.trim())continue;
        if(!Number.isFinite(draft.updatedAt)||draft.updatedAt<now-EXPIRE_MS||draft.updatedAt>now+60000)continue;
        drafts[ticket]={text:draft.text,updatedAt:draft.updatedAt,
          baseline:validFields(draft.baseline),warning:Boolean(draft.warning)};
      }
      pruneDrafts();
    }catch(_error){removeStorage();}
  }
  function pruneDrafts(){
    const keys=Object.keys(drafts);
    if(keys.length<=MAX_DRAFTS)return;
    keys.sort((a,b)=>(drafts[b].updatedAt||0)-(drafts[a].updatedAt||0));
    for(const ticket of keys.slice(MAX_DRAFTS))delete drafts[ticket];
  }
  function writeStorage(){
    if(!owner)return false;
    pruneDrafts();
    try{
      if(!window.sessionStorage){storageOk=false;return false;}
      window.sessionStorage.setItem(STORAGE_KEY,JSON.stringify({version:1,owner,drafts}));
      storageOk=true;return true;
    }catch(_error){storageOk=false;return false;}
  }
  function flush(){
    if(saveTimer){window.clearTimeout(saveTimer);saveTimer=null;}
    return writeStorage();
  }
  function scheduleSave(){
    if(saveTimer)window.clearTimeout(saveTimer);
    saveTimer=window.setTimeout(()=>{saveTimer=null;const ok=writeStorage();if(active)paint(active,!ok);},300);
  }
  function clear(){
    if(saveTimer){window.clearTimeout(saveTimer);saveTimer=null;}
    if(active?.panel){active.panel.hidden=true;active.panel.querySelector('textarea')?.setAttribute('disabled','');}
    active=null;
    drafts=Object.create(null);snapshots=new Map();history=[];
    owner='';removeStorage();
  }
  function ensureIdentity(){
    const key=identity();
    if(!key){if(owner)clear();return false;}
    if(owner!==key){
      if(owner)clear();
      owner=key;drafts=Object.create(null);snapshots=new Map();history=[];
      readForOwner();
    }
    return true;
  }
  function text(value){return String(value==null?'':value).trim();}
  function validFields(input){
    const out=Object.create(null);
    if(!input||typeof input!=='object')return out;
    for(const key of Object.keys(FIELD_NAMES)){
      if(Object.prototype.hasOwnProperty.call(input,key))out[key]=text(input[key]).slice(0,500);
    }
    return out;
  }
  function normalize(row){
    if(!row||typeof row!=='object')return null;
    const ticket=text(row.ticket??row.n);
    if(!ticket||ticket.length>120)return null;
    const fields=Object.create(null);
    for(const [key,aliases] of Object.entries(FIELD_ALIASES)){
      for(const alias of aliases){
        if(Object.prototype.hasOwnProperty.call(row,alias)){
          fields[key]=text(row[alias]).slice(0,500);break;
        }
      }
    }
    return {ticket,fields};
  }
  function difference(before,after){
    return Object.keys(after).filter(key=>Object.prototype.hasOwnProperty.call(before,key)&&before[key]!==after[key]);
  }
  function observe(route,records){
    if(!ROUTES.has(route)||!ensureIdentity()||!Array.isArray(records))return 0;
    let count=0;
    const now=Date.now();
    for(const row of records){
      const current=normalize(row);if(!current)continue;
      const prev=snapshots.get(current.ticket);
      const merged=Object.assign(Object.create(null),prev||{},current.fields);
      const changes=prev?difference(prev,current.fields):[];
      if(changes.length){
        const draft=drafts[current.ticket];
        if(draft?.text && changes.some(key=>
          Object.prototype.hasOwnProperty.call(draft.baseline||{},key) &&
          draft.baseline[key]!==merged[key])){
          draft.warning=true;draft.updatedAt=now;scheduleSave();
        }
        for(const key of changes){
          // El usuario NS responsable no figura en estas tablas; NO atribuir.
          history.unshift({ticket:current.ticket,field:FIELD_NAMES[key],before:prev[key],after:merged[key],at:now,source:'NS / actor no confirmado',route});
          count++;
        }
        history=history.slice(0,MAX_HISTORY);
      }
      snapshots.set(current.ticket,merged);
      // La primera lectura tras un F5 puede descubrir un draft conservado de una
      // recarga anterior. Comparamos SOLO campos presentes en ambos snapshots.
      const draft=drafts[current.ticket];
      if(draft?.text && !draft.warning && difference(draft.baseline||{},current.fields).length){
        draft.warning=true;draft.updatedAt=now;scheduleSave();
      }
    }
    if(active)paint(active,false);
    return count;
  }
  function escapeHtml(input){
    return String(input==null?'':input).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function historyFor(ticket){return history.filter(row=>row.ticket===ticket).slice(0,10);}
  function paint(current,storageFailed){
    if(!current?.panel || current.panel.hidden)return;
    const saved=drafts[current.ticket];
    const note=current.panel.querySelector('[data-expns-draft-status]');
    const warning=current.panel.querySelector('[data-expns-conflict]');
    const changes=current.panel.querySelector('[data-expns-history]');
    const network=current.panel.querySelector('[data-expns-connectivity]');
    if(note)note.textContent=!saved?.text?'Sin borrador':
      (storageFailed || !storageOk ? '⚠ Borrador solo en memoria (almacenamiento no disponible)' :
      (saveTimer?'Guardando borrador…':'✓ Borrador guardado en esta pestaña'));
    if(warning){warning.hidden=!saved?.warning;}
    if(network)network.textContent=navigator.onLine?'🟢 Con conexión':'📡 Sin internet · borrador local conservado';
    if(changes){
      const list=historyFor(current.ticket);
      changes.innerHTML=list.length?list.map(row=>
        '<li><time>'+escapeHtml(new Date(row.at).toLocaleTimeString('es-MX'))+'</time> · <b>'+escapeHtml(row.field)+
        '</b>: <span>'+escapeHtml(row.before||'—')+'</span> → <strong>'+escapeHtml(row.after||'—')+'</strong></li>').join(''):
        '<li>Sin cambios externos detectados durante esta sesión.</li>';
    }
  }
  function openTicket(options){
    const route=options?.route,ticket=text(options?.ticket),host=options?.host;
    if(!ROUTES.has(route)||!ticket||ticket.length>120||!host?.appendChild||!ensureIdentity())return false;
    if(options.record)observe(route,[options.record]);
    if(active && (active.route!==route || active.ticket!==ticket))hide(active.route);
    let panel=host.querySelector('[data-expns-protection-panel]');
    if(!panel){
      panel=document.createElement('section');
      panel.className='expns-protect-panel';
      panel.dataset.expnsProtectionPanel='1';
      panel.innerHTML='<div class="expns-protect-heading"><div><b data-expns-draft-title>Borrador local · Ticket</b><small data-expns-connectivity></small></div><span class="expns-protect-pill">FASE 7 · PRUEBA</span></div>'+
        '<label class="expns-protect-label">Comentario de prueba (no se envía a NetSuite ni Aiven)<textarea data-expns-draft-input maxlength="5000" rows="3" placeholder="Escribe aquí; el texto se conserva durante la sesión de esta pestaña..."></textarea></label>'+
        '<div class="expns-protect-tools"><small data-expns-draft-status>Sin borrador</small><div><button type="button" data-expns-action="copy">Copiar</button><button type="button" data-expns-action="discard">Descartar</button></div></div>'+
        '<div data-expns-conflict class="expns-protect-warning" role="alert" hidden>⚠ NetSuite modificó este ticket mientras existía un borrador. Revisa los datos antes de utilizar tu texto. El borrador NO se sobrescribió. <button type="button" data-expns-action="ack">Ya revisé el cambio</button></div>'+
        '<details class="expns-protect-history"><summary>Historial de cambios detectados en esta sesión</summary><ol data-expns-history></ol><small>Origen NS · autor del cambio no confirmado · historial temporal, no auditoría oficial.</small></details>';
      host.appendChild(panel);
      const textarea=panel.querySelector('[data-expns-draft-input]');
      textarea.addEventListener('input',()=>{
        if(!ensureIdentity()||active?.panel!==panel)return;
        let item=drafts[active.ticket];
        if(!item){item={text:'',updatedAt:0,baseline:validFields(snapshots.get(active.ticket)),warning:false};drafts[active.ticket]=item;}
        item.text=textarea.value.slice(0,MAX_TEXT);item.updatedAt=Date.now();
        if(!item.text){delete drafts[active.ticket];}
        scheduleSave();paint(active,false);
      });
      panel.addEventListener('click',async(event)=>{
        const button=event.target.closest('[data-expns-action]');
        if(!button||!ensureIdentity()||active?.panel!==panel)return;
        if(button.dataset.expnsAction==='discard'){
          if(textarea.value && typeof window.confirm==='function' && !window.confirm('¿Descartar este borrador local de prueba?'))return;
          delete drafts[active.ticket];textarea.value='';flush();paint(active,false);return;
        }
        if(button.dataset.expnsAction==='ack'){
          const item=drafts[active.ticket];
          if(item){item.baseline=validFields(snapshots.get(active.ticket));item.warning=false;item.updatedAt=Date.now();flush();}
          paint(active,false);return;
        }
        if(button.dataset.expnsAction==='copy'){
          try{
            if(!navigator.clipboard?.writeText)throw new Error('No disponible');
            await navigator.clipboard.writeText(textarea.value);
            const note=panel.querySelector('[data-expns-draft-status]');if(note)note.textContent='✓ Copiado al portapapeles · no enviado';
          }catch(_error){const note=panel.querySelector('[data-expns-draft-status]');if(note)note.textContent='No se pudo copiar. Selecciona el texto manualmente.';}
        }
      });
    }
    const same=active?.ticket===ticket && active?.panel===panel;
    panel.hidden=false;
    panel.querySelector('[data-expns-draft-title]').textContent='Borrador local · Ticket '+ticket;
    if(!same){
      panel.querySelector('[data-expns-draft-input]').value=drafts[ticket]?.text||'';
    }
    active={route,ticket,panel};
    paint(active,false);
    return true;
  }
  function hide(route){
    if(!active|| (route && route!==active.route))return;
    flush();active.panel.hidden=true;active=null;
  }
  function getDraft(ticket){if(!ensureIdentity())return null;return drafts[String(ticket)]?{...drafts[String(ticket)]}:null;}
  function getHistory(ticket){if(!ensureIdentity())return [];return historyFor(String(ticket)).map(row=>({...row}));}
  function connectivity(){if(active)paint(active,false);}
  document.addEventListener('mantto:logout',clear);
  document.addEventListener('mantto:session-expired',clear);
  document.addEventListener('mantto:view-user-changed',clear);
  document.addEventListener('mantto:auth-ready',()=>{if(owner && identity()!==owner)clear();});
  document.addEventListener('mantto:navigation',event=>{
    if(active && event.detail?.route!==active.route)hide(active.route);
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden)flush();});
  window.addEventListener('pagehide',flush);
  window.addEventListener('offline',connectivity);
  window.addEventListener('online',()=>{
    connectivity();
    // F6 ya implementa reconexion y evita peticiones duplicadas. Solo revalidar
    // cuando hay una vista experimental activa y conectividad restaurada.
    if(active && !document.hidden)window.ManttoExperimentalNsLive?.checkActive?.(true);
  });
  window.ManttoExperimentalNsProtection=Object.freeze({openTicket,observe,hide,clear,flush,getDraft,getHistory,
    limits:Object.freeze({maxText:MAX_TEXT,maxDrafts:MAX_DRAFTS,expireMs:EXPIRE_MS})});
})();

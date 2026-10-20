/* BLT NOW | Navegacion offline Fase 4 V001.
 * Puente de captura de acciones dentro de las pantallas NATIVAS ya existentes.
 * No cambia endpoints online. Nunca confirma en Aiven sin acuse del backend.
 */
(function(){
  'use strict';
  if(window.ManttoOfflineNativeActions)return;

  const PERMISSION='GENERAL_MODO_OFFLINE_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';
  const MODULES=Object.freeze({
    ticket:{route:'resumen',code:'OPERACION_RESUMEN_DEL_DIA',domain:'UNITED',
      dataset:'operacion-resumen-dia',kind:'tickets'},
    project:{route:'instalaciones-proyectos',code:'INSTALACIONES_PROYECTOS',domain:'CORELLIAN',
      dataset:'instalaciones-proyectos',kind:'proyectos'}
  });
  const ACTIONS=Object.freeze({
    TICKET_COMMENT:'ticket',TICKET_MOVEMENT:'ticket',
    PROJECT_COMMENT:'project',PROJECT_MOVEMENT:'project'
  });
  const STYLE_ID='bltnow-native-offline-actions-style';
  const PANEL_ID='bltnow-native-offline-actions';
  const CHAT_NOTE_ID='bltnow-native-offline-chat-note';
  const STATUS_ID='bltnow-native-offline-status';
  let watcher=null,renderScheduled=false,refreshSequence=0;
  const saving=new WeakSet();

  function positiveId(value){const n=Number(value);return Number.isSafeInteger(n)&&n>0?n:null;}
  function identity(){
    const auth=window.ManttoAuth;
    const actor=positiveId(auth?.getActorUser?.()?.id_SB||auth?.getActorUser?.()?.id||auth?.getActorUser?.()?.user_id);
    const effective=positiveId(auth?.getUser?.()?.id_SB||auth?.getUser?.()?.id||auth?.getUser?.()?.user_id);
    return actor&&effective?{actor,effective}:null;
  }
  function isOffline(){return window.ManttoOfflineNavigation?.isOffline?.()===true;}
  function current(){return window.ManttoRouter?.getCurrent?.()||{};}
  function currentScreen(){
    const route=current(),payload=route.payload||{},history=window.ManttoRouter?.getHistory?.()||[];
    if(route.route==='detalle'&&payload.type==='ticket'&&
       history[history.length-1]?.route==='resumen'&&String(payload.id||'').trim())
      return {type:'ticket',id:String(payload.id).trim(),module:MODULES.ticket};
    if(route.route==='detalle'&&payload.type==='proyecto'&&
       payload.source==='instalaciones-proyectos'&&String(payload.id||'').trim())
      return {type:'project',id:String(payload.id).trim(),
        name:String(payload.projectName||'').trim(),module:MODULES.project};
    if(route.route==='resumen'){
      const pane=document.getElementById?.('rd-ticket-detail');
      const title=document.getElementById?.('rd-ticket-title');
      const match=String(title?.textContent||'').match(/^Ticket\s+(.+)$/i);
      if(pane&&!pane.hidden&&match&&match[1].trim())
        return {type:'ticket',id:match[1].trim(),module:MODULES.ticket,summary:true};
    }
    return null;
  }
  function enabledScreen(){
    const screen=currentScreen();
    if(!screen||!isOffline()||window.ManttoAuth?.isViewingAs?.()===true||
       window.ManttoOfflineNavigation?.canOpenRouteOffline?.(screen.module.route)!==true)return null;
    const ids=identity(),storage=window.ManttoOfflineStorage;
    if(!ids||!storage?.readCachedAccess||!storage?.enqueueOfflineAction||!storage?.verifiedSnapshot)return null;
    const access=storage.readCachedAccess(ids.actor,ids.effective);
    if(access?.permission_code!==PERMISSION||access.viewer_read_only===true||
       Number(access.actor_user_id||ids.actor)!==ids.actor||Number(access.effective_user_id)!==ids.effective||
       !Array.isArray(access.catalog_modules))return null;
    const entry=access.catalog_modules.find(item=>item?.code===screen.module.code&&
      item?.domain===screen.module.domain&&item?.backup_status==='EXPORTADOR_COMPLETO'&&
      item?.datasets?.includes(screen.module.dataset));
    const signature=entry?.scope?.scope_signature;
    if(typeof signature!=='string'||!/^[a-f0-9]{64}$/.test(signature))return null;
    return {...screen,ids,signature,context:{actor_user_id:ids.actor,
      effective_user_id:ids.effective,domain:screen.module.domain,
      dataset:screen.module.dataset}};
  }
  function sameScreen(before){
    const after=enabledScreen();
    return Boolean(after&&before&&before.type===after.type&&before.id===after.id&&
      before.ids.actor===after.ids.actor&&before.ids.effective===after.ids.effective&&
      before.signature===after.signature);
  }
  function matchRecord(screen,rows){
    if(!Array.isArray(rows))throw new Error('Los registros respaldados no son válidos.');
    let matches=[];
    if(screen.type==='ticket'){
      matches=rows.filter(row=>String(row.ticket||row.folio||'').trim()===screen.id);
      if(!matches.length)matches=rows.filter(row=>String(row.id||'').trim()===screen.id);
    }else{
      matches=rows.filter(row=>String(row.id_proyecto||'').trim()===screen.id);
      // Fallback sólo si el identificador es un nombre de proyecto inequívoco.
      if(!matches.length){
        const name=screen.name||screen.id;
        matches=rows.filter(row=>String(row.proyecto||'').trim().toUpperCase()===name.toUpperCase());
        const ids=new Set(matches.map(row=>String(row.id_proyecto||'')));
        if(ids.size!==1)matches=[];
      }
    }
    if(!matches.length)throw new Error('El registro no existe en tu respaldo autorizado.');
    const key=screen.type==='ticket'?'id':'id_ins_fl';
    matches.sort((a,b)=>Number(a[key])-Number(b[key]));
    if(screen.type==='ticket'&&matches.length>1)
      throw new Error('La referencia de Ticket no identifica un registro único.');
    const recordId=positiveId(matches[0]?.[key]);
    if(!recordId)throw new Error('La copia no contiene el identificador interno del registro.');
    return recordId;
  }
  async function actionRecord(screen){
    const storage=window.ManttoOfflineStorage;
    const meta=await storage.verifiedSnapshot(screen.context,screen.signature);
    if(meta?.schema_version!==2||meta.read_only!==true||
       meta.actor_user_id!==screen.ids.actor||meta.effective_user_id!==screen.ids.effective||
       meta.domain!==screen.module.domain||meta.dataset!==screen.module.dataset||
       meta.scope_signature!==screen.signature||!meta.run_id)
      throw new Error('El respaldo ya no está completo o autorizado.');
    let rows;
    if(screen.type==='ticket'){
      const bridge=window.ManttoOfflineResumenDia;
      if(!bridge?.routeAllowed?.()||!bridge?.readCompleteCopy)
        throw new Error('Lector de Resumen del Día no disponible.');
      const data=await bridge.readCompleteCopy();
      rows=data?.tickets;
    }else{
      const bridge=window.ManttoOfflineInstalacionesProyectos;
      if(!bridge?.routeAllowed?.()||!bridge?.readCompleteCopy)
        throw new Error('Lector de Instalaciones no disponible.');
      rows=await bridge.readCompleteCopy();
    }
    if(!Array.isArray(rows)||rows.length!==meta.kind_counts?.[screen.module.kind])
      throw new Error('La copia no coincide con el manifiesto autorizado.');
    const recordId=matchRecord(screen,rows);
    if(!sameScreen(screen))throw new Error('La sesión o el registro cambió durante la captura.');
    return {recordId,runId:meta.run_id};
  }
  async function enqueue(action,text){
    if(!Object.prototype.hasOwnProperty.call(ACTIONS,action))
      throw new Error('Acción offline no certificada.');
    const screen=enabledScreen();
    if(!screen||ACTIONS[action]!==screen.type)throw new Error('Esta pantalla no permite la captura offline.');
    if(typeof text!=='string'||!text.trim()||text.trim().length>2000)
      throw new Error('Escribe entre 1 y 2000 caracteres.');
    const target=await actionRecord(screen);
    if(!sameScreen(screen))throw new Error('La sesión cambió durante la captura.');
    const result=await window.ManttoOfflineStorage.enqueueOfflineAction(screen.context,{
      action,kind:screen.module.kind,record_id:target.recordId,
      run_id:target.runId,scope_signature:screen.signature,text
    });
    // La acción es estrictamente LOCAL hasta que el backend confirme el ACK.
    scheduleRender();
    return result;
  }
  function errorMessage(error){return String(error?.message||error||'Error guardando la acción local.').slice(0,230);}
  function setNotice(form,message,failure=false){
    let note=form?.querySelector?.('[data-offline-action-status]');
    if(!note&&form?.appendChild&&typeof document.createElement==='function'){
      note=document.createElement('p');note.dataset.offlineActionStatus='1';
      note.style.cssText='margin:6px 0 0;font-size:12px;font-weight:650';
      form.appendChild(note);
    }
    if(!note)return;
    note.textContent=message;
    note.style.color=failure?'#9f1239':'#166534';
  }
  function contentOf(form,action){
    if(action==='TICKET_COMMENT')return form.querySelector?.('#mg-ticket-chat-input, #rd-ticket-chat-input, textarea')?.value||'';
    return form.querySelector?.('textarea')?.value||'';
  }
  function handlesNativeTicketForm(form){
    // Fail closed: the native form may outlive its cached permission/snapshot.
    // We must intercept it even when enabledScreen() is already null.
    return form?.id==='mg-ticket-chat-form'||form?.id==='rd-ticket-chat-form';
  }
  async function saveForm(form,action){
    if(saving.has(form))return;
    saving.add(form);
    const screenAtStart=enabledScreen();
    const button=form.querySelector?.('button[type="submit"], button');
    const originalLabel=button?.textContent;
    if(button){button.disabled=true;button.textContent='Guardando localmente…';}
    try{
      const result=await enqueue(action,contentOf(form,action));
      // A successful IndexedDB write for the OLD user may finish after logout.
      // Never clear or acknowledge the replacement user's form.
      if(!sameScreen(screenAtStart))return;
      const textarea=form.querySelector?.('textarea');
      if(textarea)textarea.value='';
      setNotice(form,'Guardado en este dispositivo · Pendiente de sincronizar (no confirmado en Aiven).');
      document.dispatchEvent(new CustomEvent('mantto:offline-action-saved',{
        detail:{id:result.id,action,local_only:true}
      }));
    }catch(error){if(sameScreen(screenAtStart))setNotice(form,errorMessage(error),true);}
    finally{
      saving.delete(form);
      if(button){button.disabled=false;button.textContent=originalLabel||'Guardar';}
    }
  }
  function onSubmitCapture(event){
    if(!isOffline())return;
    const form=event.target;
    const native=handlesNativeTicketForm(form);
    const action=native?'TICKET_COMMENT':String(form?.dataset?.bltnowOfflineAction||'');
    if(!native&&!Object.prototype.hasOwnProperty.call(ACTIONS,action))return;
    event.preventDefault?.();event.stopImmediatePropagation?.();
    const screen=enabledScreen();
    if(!screen||ACTIONS[action]!==screen.type){
      setNotice(form,'Copia o autorización offline no disponible. Reconecta para validar tus permisos.',true);
      return;
    }
    saveForm(form,action).catch(error=>console.warn('[Offline acciones nativas]',error));
  }
  function makeForm(action,label,placeholder){
    const form=document.createElement('form');
    form.dataset.bltnowOfflineAction=action;form.className='bltnow-inline-offline-form';
    const title=document.createElement('label');title.textContent=label;
    const textarea=document.createElement('textarea');textarea.rows=2;textarea.maxLength=2000;
    textarea.placeholder=placeholder;textarea.required=true;
    const button=document.createElement('button');button.type='submit';
    button.textContent='Guardar pendiente';
    form.append(title,textarea,button);
    return form;
  }
  function ensureStyles(){
    if(document.getElementById?.(STYLE_ID)||!document.head?.appendChild)return;
    const css=document.createElement('style');css.id=STYLE_ID;
    css.textContent=`
      #${PANEL_ID}{background:#fff;border:1px solid #cbd5e1;border-radius:12px;
        padding:12px 15px;margin:12px 0;display:grid;gap:11px}
      #${PANEL_ID} h3{font-size:14px;margin:0;color:#0d2e6e}
      #${PANEL_ID} p{font-size:12px;margin:0;color:#475569}
      #${PANEL_ID} form{display:grid;gap:7px}
      #${PANEL_ID} label{font-weight:750;font-size:12px;color:#334155}
      #${PANEL_ID} textarea{width:100%;min-height:64px;max-width:100%;padding:9px;
        border:1px solid #94a3b8;border-radius:8px;box-sizing:border-box;color:#17202a}
      #${PANEL_ID} button{justify-self:start;background:#0d2e6e;color:white;
        border:0;border-radius:8px;padding:8px 13px;font-weight:700;cursor:pointer}
      #${PANEL_ID} button:disabled{opacity:.55;cursor:wait}
      #${CHAT_NOTE_ID}{font-size:12px;font-weight:650;color:#854d0e;
        padding:7px 9px;background:#fffbeb;border-radius:7px;margin:6px 0}
      #${STATUS_ID}{font-weight:700;color:#854d0e}
    `;
    document.head.appendChild(css);
  }
  function cleanup(){
    document.getElementById?.(PANEL_ID)?.remove?.();
    document.getElementById?.(CHAT_NOTE_ID)?.remove?.();
  }
  function placePanel(screen){
    if(!screen){cleanup();return;}
    const root=screen.summary
      ?document.getElementById?.('rd-ticket-detail')
      :document.getElementById?.('mg-detail-body');
    if(!root){cleanup();return;}
    if(!screen.summary&&screen.type==='ticket'&&!root.querySelector?.('#mg-ticket-chat-form')){
      cleanup();return;
    }
    if(screen.type==='project'&&!root.querySelector?.('.mg-corellian-content')){
      cleanup();return;
    }
    const holder=screen.type==='project'?root.querySelector('.mg-corellian-content'):root;
    let panel=document.getElementById?.(PANEL_ID);
    if(panel&&panel.dataset?.contextKey!==`${screen.type}:${screen.id}`){panel.remove();panel=null;}
    if(!panel){
      panel=document.createElement('section');panel.id=PANEL_ID;
      panel.dataset.contextKey=`${screen.type}:${screen.id}`;
      const heading=document.createElement('h3');heading.textContent='Seguimiento sin conexión';
      const note=document.createElement('p');note.textContent=
        'Estas acciones se guardan como pendientes locales. No modifican estatus, Vo.Bo., inventario ni se consideran registradas en Aiven hasta recibir confirmación.';
      panel.append(heading,note);
      if(screen.type==='project')panel.append(
        makeForm('PROJECT_COMMENT','Comentario de seguimiento','Escribe un comentario descriptivo…'));
      panel.append(makeForm(screen.type==='project'?'PROJECT_MOVEMENT':'TICKET_MOVEMENT',
        'Movimiento descriptivo','Describe el movimiento o seguimiento…'));
      const status=document.createElement('p');status.id=STATUS_ID;
      status.textContent='Sin conexión · Sólo guardado local';panel.append(status);
      holder.appendChild(panel);
    }
    if(screen.type==='ticket'){
      const native=root.querySelector?.('#mg-ticket-chat-form, #rd-ticket-chat-form');
      if(native&&!document.getElementById?.(CHAT_NOTE_ID)){
        const note=document.createElement('div');note.id=CHAT_NOTE_ID;
        note.textContent='Comentarios sin conexión: se guardan pendientes en el dispositivo; no aparecen en el histórico de Aiven hasta sincronizar.';
        native.insertAdjacentElement?.('afterend',note);
      }
    }
  }
  function scheduleRender(){
    if(renderScheduled)return;
    renderScheduled=true;
    Promise.resolve().then(()=>{renderScheduled=false;placePanel(enabledScreen());refreshCounter().catch(()=>{});});
  }
  async function refreshCounter(){
    const ticket=++refreshSequence;
    const screen=enabledScreen();
    const target=document.getElementById?.(STATUS_ID);
    if(!screen||!target||!window.ManttoOfflineStorage?.listPendingActions)return;
    try{
      const rows=await window.ManttoOfflineStorage.listPendingActions(screen.context,{limit:1000});
      if(ticket!==refreshSequence||!sameScreen(screen))return;
      const actions=screen.type==='ticket'?['TICKET_COMMENT','TICKET_MOVEMENT']:
        ['PROJECT_COMMENT','PROJECT_MOVEMENT'];
      const count=rows.filter(row=>actions.includes(row.action)&&row.scope_signature===screen.signature&&
        String(row.reference||'').trim().toUpperCase()===screen.id.toUpperCase()).length;
      const message=count?`${count} acción(es) local(es) pendientes para este registro`:
        'Sin conexión · Las nuevas acciones se guardarán localmente';
      if(target.textContent!==message)target.textContent=message;
    }catch(_error){/* No mostrar conteos ajenos a identidad o alcance. */}
  }
  function observeDetail(){
    if(watcher||typeof MutationObserver!=='function')return;
    const target=document.getElementById?.('view-detalle')||document.getElementById?.('app');
    if(!target)return;
    watcher=new MutationObserver(()=>{if(isOffline())scheduleRender();});
    watcher.observe(target,{childList:true,subtree:true});
  }
  function onNavigationChanged(event){
    scheduleRender();
    refreshCounter();
    // El puente de navegación oficial ya ejecuta sincronización tras revalidar
    // permisos, alcance e identidad. No enviar directamente desde la interfaz.
  }
  function init(){
    ensureStyles();observeDetail();
    // Captura en WINDOW antes de los bloqueos de fases 2/3 en DOCUMENT.
    // Al estar online se deja intacto el flujo nativo del backend.
    window.addEventListener('submit',onSubmitCapture,true);
    document.addEventListener('mantto:navigation',onNavigationChanged);
    document.addEventListener('mantto:offline-navigation-changed',onNavigationChanged);
    document.addEventListener('mantto:offline-outbox-changed',()=>{
      scheduleRender();refreshCounter();
    });
    document.addEventListener('mantto:logout',cleanup);
    document.addEventListener('mantto:view-user-changed',cleanup);
    document.addEventListener('mantto:session-expired',cleanup);
    scheduleRender();
  }
  window.ManttoOfflineNativeActions=Object.freeze({
    init,enqueue,enabledScreen,handlesNativeTicketForm,onSubmitCapture,
    actionRecord,matchRecord,placePanel
  });
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();

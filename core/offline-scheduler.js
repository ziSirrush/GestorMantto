(function(){
  'use strict';

  if(window.ManttoOfflineScheduler)return;

  const PERMISSION_CODE='GENERAL_MODO_OFFLINE_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';
  const PREFERENCE_PREFIX='mantto:offline-pilot:preferences:v1:';
  const PENDING_PREFIX='mantto:offline-pending:';
  let lastNoticeKey='';

  function positiveId(value){
    const parsed=Number(value);
    return Number.isSafeInteger(parsed)&&parsed>0?parsed:null;
  }

  function effectiveUserId(){
    const user=window.ManttoAuth?.getUser?.()||{};
    return positiveId(user.id_SB||user.id||user.user_id);
  }

  function readPreferences(userId){
    if(!userId)return null;
    try{
      const value=JSON.parse(localStorage.getItem(PREFERENCE_PREFIX+userId)||'null');
      return value&&typeof value==='object'?value:null;
    }catch(_error){return null;}
  }

  function writePreferences(userId,changes){
    const current=readPreferences(userId)||{};
    const next=Object.assign({},current,changes,{updated_at:new Date().toISOString()});
    localStorage.setItem(PREFERENCE_PREFIX+userId,JSON.stringify(next));
    return next;
  }

  function preferredOccurrence(now,time){
    const match=String(time||'').match(/^([01]\d|2[0-3]):([0-5]\d)$/);
    if(!match)return null;
    const due=new Date(now);
    due.setHours(Number(match[1]),Number(match[2]),0,0);
    if(due.getTime()>now.getTime())due.setDate(due.getDate()-1);
    return due;
  }

  function dueState(preferences,at){
    const now=at instanceof Date?at:new Date(at||Date.now());
    if(!preferences||preferences.daily_enabled!==true)return {due:false,reason:'disabled'};
    const occurrence=preferredOccurrence(now,preferences.preferred_time);
    if(!occurrence)return {due:false,reason:'invalid-time'};
    const startedAt=new Date(preferences.schedule_started_at||preferences.updated_at||0);
    if(Number.isFinite(startedAt.getTime())&&startedAt.getTime()>occurrence.getTime())return {due:false,reason:'not-started'};
    const lastBackup=new Date(preferences.last_backup_at||0);
    const due=!Number.isFinite(lastBackup.getTime())||lastBackup.getTime()<occurrence.getTime();
    return {due,reason:due?'pending':'completed',due_at:occurrence.toISOString()};
  }

  function hasPermission(){
    const state=window.ManttoPermissions?.state?.(PERMISSION_CODE);
    return state?.exists===true&&state?.efectivo===true;
  }

  function showNotice(message){
    let element=document.getElementById('mantto-offline-due-toast');
    if(!element){
      element=document.createElement('div');
      element.id='mantto-offline-due-toast';
      element.setAttribute('role','status');
      element.setAttribute('aria-live','polite');
      Object.assign(element.style,{
        position:'fixed',right:'18px',bottom:'18px',zIndex:'5000',maxWidth:'390px',padding:'13px 15px',
        borderRadius:'12px',color:'#fff',background:'#0d4f86',fontSize:'12px',fontWeight:'800',
        boxShadow:'0 12px 28px rgba(13,46,110,.28)'
      });
      document.body.appendChild(element);
    }
    element.textContent=message;
    window.clearTimeout(showNotice.timer);
    showNotice.timer=window.setTimeout(()=>element.remove(),9000);
  }

  function evaluate(){
    const userId=effectiveUserId();
    if(!userId||!hasPermission())return {due:false,reason:'unauthorized'};
    const state=dueState(readPreferences(userId),new Date());
    if(!state.due)return state;
    const pending={user_id:userId,due_at:state.due_at,requires_wifi_confirmation:true,detected_at:new Date().toISOString()};
    localStorage.setItem(PENDING_PREFIX+userId,JSON.stringify(pending));
    const noticeKey=`${userId}:${state.due_at}`;
    if(lastNoticeKey!==noticeKey){
      lastNoticeKey=noticeKey;
      showNotice('Respaldo offline pendiente: abre Modo Offline, confirma tu conexión Wi‑Fi y autoriza la descarga.');
    }
    document.dispatchEvent(new CustomEvent('mantto:offline-backup-due',{detail:pending}));
    return Object.assign({due:true},pending);
  }

  function markCompleted(userId,completedAt){
    const id=positiveId(userId);
    if(!id)throw new Error('No fue posible identificar al usuario del respaldo.');
    const value=completedAt||new Date().toISOString();
    localStorage.removeItem(PENDING_PREFIX+id);
    lastNoticeKey='';
    return writePreferences(id,{last_backup_at:value,last_backup_status:'PASS'});
  }

  function markFailed(userId,message){
    const id=positiveId(userId);
    if(!id)return null;
    return writePreferences(id,{last_backup_status:'FAIL',last_backup_error:String(message||'Error de respaldo').slice(0,300)});
  }

  document.addEventListener('mantto:auth-ready',()=>window.setTimeout(evaluate,1200));
  document.addEventListener('mantto:permissions-updated',evaluate);
  window.addEventListener('online',evaluate);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)evaluate();});

  window.ManttoOfflineScheduler={evaluate,dueState,markCompleted,markFailed,readPreferences};
})();

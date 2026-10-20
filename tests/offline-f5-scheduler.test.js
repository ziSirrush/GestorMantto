'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');
const script=fs.readFileSync(path.join(__dirname,'../core/offline-scheduler.js'),'utf8');
const signature='c'.repeat(64);
function env({offline=false,viewer=false,fail=null,scope=signature}={}){
  const events=[],calls=[],settled=[],claimed=[];
  const op={id:'8c77f28a-c3b6-448a-bf93-7d53ef18a5a4',idempotency_key:'8c77f28a-c3b6-448a-bf93-7d53ef18a5a4',
    actor_user_id:5,effective_user_id:5,domain:'UNITED',dataset:'OPERACION-RESUMEN-DIA',
    kind:'tickets',action:'TICKET_COMMENT',record_id:100,reference:'T-100',scope_signature:signature,
    source_run_id:'5:5:UNITED:OPERACION-RESUMEN-DIA:18290220:4ad04bdb-ffd1-43a4-ad42-ad090a7890ac',
    created_at:'2026-10-20T18:00:00Z',payload:{text:'Sincronizar operación descriptiva'},
    status:'PENDIENTE_SINCRONIZACION'};
  const caps={permission_code:'GENERAL_MODO_OFFLINE_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
    viewer_read_only:viewer,effective_user_id:5,catalog_modules:[
      {code:'OPERACION_RESUMEN_DEL_DIA',domain:'UNITED',scope:{scope_signature:scope},datasets:['operacion-resumen-dia']}],datasets:[]};
  let queue=[op];
  const storage={
    async pruneOutbox(_identity,authorized){calls.push({authorized});queue=queue.filter(x=>authorized[`${x.domain}:${x.dataset}`]===x.scope_signature);return 0;},
    async listSendableActions(){return queue;},
    async claimPendingAction(_identity,id){claimed.push(id);return {...op,claim_token:'send-token'};},
    async settlePendingAction(_identity,_id,token,result){assert.equal(token,'send-token');settled.push(result);queue=[];return result;},
    async outboxStatus(){return {count:queue.length};}
  };
  const auth={getActorUser:()=>({id_SB:5}),getUser:()=>({id_SB:5}),isViewingAs:()=>viewer,
    apiGet:async()=>({data:caps}),api:async(path,options)=>{
      calls.push({path,options});
      if(fail)throw Object.assign(new Error(fail.message),{status:fail.status,code:fail.code});
      const body=JSON.parse(options.body);
      return {ok:true,ack:{idempotency_key:body.idempotency_key,record_id:body.record_id,
        action:body.action,id_interaccion:999}};
    }};
  const document={hidden:false,addEventListener(){},dispatchEvent:e=>events.push(e),getElementById:()=>null};
  const window={ManttoAuth:auth,ManttoOfflineStorage:storage,ManttoPermissions:{state:()=>({exists:true,efectivo:true})},
    addEventListener(){},setTimeout(){return 0;},clearTimeout(){},setInterval(){return 0;}};
  const localStorage={getItem(){return null;},setItem(){},removeItem(){}};
  const navigator={onLine:!offline};
  class CustomEvent{constructor(type,opts){this.type=type;this.detail=opts.detail;}}
  vm.runInNewContext(script,{window,document,localStorage,navigator,Date,URL,URLSearchParams,CustomEvent,console});
  return {scheduler:window.ManttoOfflineScheduler,events,calls,settled,claimed,op};
}
test('F5 cliente: confirmación real envía POST con usuario/registro y retira pendiente',async()=>{
  const v=env(),result=await v.scheduler.syncPendingNow({manual:true});
  assert.equal(result.sent,1);assert.equal(result.conflicts,0);
  assert.equal(v.settled.length,1);assert.equal(v.settled[0].state,'ACK');
  const post=v.calls.find(x=>x.path);
  assert.equal(post.path,'/api/offline/actions/sync/united');
  assert.equal(JSON.parse(post.options.body).dataset,'operacion-resumen-dia');
  assert.ok(v.events.some(x=>x.type==='mantto:offline-sync-summary'));
});
test('F5 cliente: fallo temporal conserva cola y programa reintento seguro',async()=>{
  const v=env({fail:{message:'Sin internet',status:503,code:'OFFLINE_UNAVAILABLE'}});
  const r=await v.scheduler.syncPendingNow({manual:true});
  assert.equal(r.retried,1);assert.equal(v.settled[0].state,'RETRY');
});
test('F5 cliente: conflicto territorial no se reintenta automáticamente',async()=>{
  const v=env({fail:{message:'Cambio de zona',status:409,code:'OFFLINE_SYNC_SCOPE_CHANGED'}});
  const r=await v.scheduler.syncPendingNow({manual:true});
  assert.equal(r.conflicts,1);assert.equal(v.settled[0].state,'CONFLICT');
});
test('F5 cliente: usuario visor no sincroniza',async()=>{
  const v=env({viewer:true});
  assert.equal((await v.scheduler.syncPendingNow({manual:true})).skipped,true);
  assert.equal(v.claimed.length,0);assert.ok(!v.calls.some(x=>x.path));
});
test('F5 cliente: sin conexión no hace solicitudes',async()=>{
  const v=env({offline:true});
  assert.equal((await v.scheduler.syncPendingNow({manual:true})).skipped,true);
  assert.equal(v.claimed.length,0);
});
test('F5 cliente: módulo fuera del alcance actualizado se purga sin enviar',async()=>{
  const v=env({scope:'d'.repeat(64)});
  const r=await v.scheduler.syncPendingNow({manual:true});
  assert.equal(r.sent,0);assert.equal(v.claimed.length,0);assert.ok(!v.calls.some(x=>x.path));
});

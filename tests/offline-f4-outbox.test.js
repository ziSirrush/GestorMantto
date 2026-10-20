'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const code=fs.readFileSync(path.join(__dirname,'../core/offline-storage.js'),'utf8');

// Modelo transaccional mínimo en RAM para probar interacciones IndexedDB sin
// declarar que equivale a una prueba de navegador real.
function mockIdb(){
  const stores=new Map(),keyPaths=new Map(),indexes=new Map();
  function ensureStore(name,path){
    if(!stores.has(name)){stores.set(name,new Map());keyPaths.set(name,path);indexes.set(name,new Set());}
  }
  const database={
    objectStoreNames:{contains:name=>stores.has(name)},
    createObjectStore(name,options={}){
      ensureStore(name,options.keyPath);
      return {createIndex:indexName=>indexes.get(name).add(indexName)};
    },
    close(){},
    transaction(names,mode){
      const namesArray=Array.isArray(names)?names:[names];
      const tx={oncomplete:null,onabort:null,onerror:null,error:null,_pending:0,_timer:null};
      const working=new Map();
      for(const n of namesArray)working.set(n,mode==='readwrite'?new Map(stores.get(n)):stores.get(n));
      function completed(){
        if(tx._pending!==0)return;
        tx._timer=setTimeout(()=>{
          if(tx._pending)return;
          if(mode==='readwrite')for(const [name,values] of working)stores.set(name,values);
          tx.oncomplete?.();
        },1);
      }
      function request(op){
        tx._pending++;
        const req={result:undefined,error:null,onsuccess:null,onerror:null};
        setImmediate(()=>{
          try{req.result=op();req.onsuccess?.({target:req});}
          catch(error){req.error=error;req.onerror?.({target:req});tx.error=error;tx.onerror?.({target:tx});}
          finally{tx._pending--;completed();}
        });
        return req;
      }
      tx.objectStore=name=>{
        if(!working.has(name))throw new Error('Store not in transaction '+name);
        const data=working.get(name),keyPath=keyPaths.get(name);
        const getKey=item=>keyPath?item[keyPath]:item.key;
        return {
          get:key=>request(()=>data.get(key)),
          getAll:()=>request(()=>[...data.values()]),
          put:item=>request(()=>{data.set(getKey(item),item);return getKey(item);}),
          delete:key=>request(()=>data.delete(key)),
          count:()=>request(()=>data.size),
          index:indexName=>{
            if(!indexes.get(name).has(indexName))throw new Error('No index '+indexName);
            return {
              getAll:value=>request(()=>[...data.values()].filter(row=>row[indexName]===value)),
              getAllKeys:value=>request(()=>[...data].filter(([,row])=>row[indexName]===value).map(([key])=>key))
            };
          }
        };
      };
      return tx;
    }
  };
  return {
    stores,
    open(){
      const req={result:database,error:null,onupgradeneeded:null,onsuccess:null,onerror:null,onblocked:null};
      setImmediate(()=>{req.onupgradeneeded?.({target:req});req.onsuccess?.({target:req});});
      return req;
    },
    deleteDatabase(){
      const req={onsuccess:null,onerror:null,onblocked:null,error:null};
      setImmediate(()=>{stores.clear();keyPaths.clear();indexes.clear();req.onsuccess?.();});
      return req;
    }
  };
}
function createStorage(){
  const db=mockIdb(),events={};
  const values=new Map();
  const localStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,String(value)),
    removeItem:key=>values.delete(key),key:index=>[...values.keys()][index]||null,get length(){return values.size;}};
  const sandbox={window:{indexedDB:db,crypto:{randomUUID:()=>`uuid-${Math.random().toString(16).slice(2)}`}},
    document:{addEventListener(name,fn){events[name]=fn;},dispatchEvent(){}},
    CustomEvent:function CustomEvent(name){this.type=name;},localStorage,Blob,Date,console};
  vm.runInNewContext(code,sandbox);
  return {storage:sandbox.window.ManttoOfflineStorage,db,events,localStorage};
}

const offlinePermission='GENERAL_MODO_OFFLINE_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';
const united={actor_user_id:10,effective_user_id:20,domain:'UNITED',dataset:'operacion-resumen-dia'};
const corellian={actor_user_id:10,effective_user_id:20,domain:'CORELLIAN',dataset:'instalaciones-proyectos'};
const sigUni='a'.repeat(64),sigCor='b'.repeat(64);
function allow(localStorage,ctx,sig){
  const key=`mantto:offline-access:${ctx.actor_user_id}:${ctx.effective_user_id}`;
  const catalog_modules=JSON.parse(localStorage.getItem(key)||'null')?.data?.catalog_modules||[];
  catalog_modules.push({code:ctx.domain==='UNITED'?'OPERACION_RESUMEN_DEL_DIA':'INSTALACIONES_PROYECTOS',
    domain:ctx.domain,scope:{scope_signature:sig},datasets:[ctx.dataset]});
  localStorage.setItem(key,JSON.stringify({saved_at:new Date().toISOString(),data:{
    permission_code:offlinePermission,effective_user_id:ctx.effective_user_id,catalog_modules}}));
}
async function seed(storage,ctx,sig){
  const kinds=ctx.domain==='UNITED'
    ?{tickets:{count:2,max_id:8},portafolio:{count:1,max_id:12}}
    :{proyectos:{count:1,max_id:10}};
  const manifest={scope_signature:sig,kinds,alcance:{master_key:false}};
  const run=await storage.beginDownload(ctx,manifest);
  if(ctx.domain==='UNITED'){
    await storage.appendDownload(ctx,run,'tickets',[{id:3,ticket:'TK-3',proyecto:'A'},{id:8,ticket:'TK-8',proyecto:'B'}]);
    await storage.appendDownload(ctx,run,'portafolio',[{id_portafolio:12,numero_equipo:'12-CMX-ELE-BLT'}]);
  }else await storage.appendDownload(ctx,run,'proyectos',[{id_ins_fl:10,id_proyecto:'P-30',referencia_sitio:'Asc 1',proyecto:'Centro'}]);
  await storage.finishDownload(ctx,run,manifest);
  return run;
}
const make=(action,kind,id,scope_signature,run_id,text='Operación local')=>({action,kind,record_id:id,scope_signature,run_id,text});

test('F4: captura comentario de Ticket sin HTTP, con UUID de idempotencia y estado pendiente',async()=>{
  const {storage,localStorage,db}=createStorage();allow(localStorage,united,sigUni);
  const run=await seed(storage,united,sigUni);
  const op=await storage.enqueueOfflineAction(united,make('TICKET_COMMENT','tickets',3,sigUni,run,'Hola, pendiente de conectarme'));
  assert.equal(op.status,'PENDIENTE_SINCRONIZACION');
  assert.equal(op.idempotency_key,op.id);
  assert.equal(op.domain,'UNITED');assert.equal(op.reference,'TK-3');
  assert.equal(op.actor_user_id,10);assert.equal(op.effective_user_id,20);
  assert.equal(op.source_run_id,run);assert.equal(op.attempts,0);
  assert.equal(op.payload.text,'Hola, pendiente de conectarme');
  assert.equal(db.stores.get('outbox').size,1);
  assert.equal((await storage.outboxStatus({actor_user_id:10,effective_user_id:20})).count,1);
  assert.equal((await storage.outboxStatus({actor_user_id:10,effective_user_id:21})).count,0);
  assert.equal((await storage.listPendingActions({actor_user_id:10,effective_user_id:20})).length,1);
  assert.equal((await storage.getSnapshot(united)).record_count,3,'los respaldos nunca se modifican');
  assert.equal(typeof storage.syncOutbox,'undefined','Fase 4 no transmite acciones a Aiven');
});

test('F4: ancla movimiento a registro de equipo/proyecto y mantiene aislamiento',async()=>{
  const {storage,localStorage}=createStorage();allow(localStorage,united,sigUni);allow(localStorage,corellian,sigCor);
  const u=await seed(storage,united,sigUni),c=await seed(storage,corellian,sigCor);
  const equipment=await storage.enqueueOfflineAction(united,make('EQUIPMENT_MOVEMENT','portafolio',12,sigUni,u,'Movido a almacén'));
  const project=await storage.enqueueOfflineAction(corellian,make('PROJECT_MOVEMENT','proyectos',10,sigCor,c,'Visita realizada'));
  assert.equal(equipment.reference,'12-CMX-ELE-BLT');assert.equal(project.reference,'P-30');
  assert.equal(equipment.domain,'UNITED');assert.equal(project.domain,'CORELLIAN');
  assert.equal((await storage.listPendingActions({actor_user_id:10,effective_user_id:20})).length,2);
  await assert.rejects(storage.discardPendingAction({actor_user_id:10,effective_user_id:21},project.id),/identidad/);
  await storage.discardPendingAction({actor_user_id:10,effective_user_id:20},equipment.id);
  assert.equal((await storage.listPendingActions({actor_user_id:10,effective_user_id:20})).length,1);
});

test('F4: rechaza action, registro, alcance, generación y usuario no autorizados',async()=>{
  const {storage,localStorage}=createStorage();allow(localStorage,united,sigUni);
  const run=await seed(storage,united,sigUni);
  const makeTicket=(changes={})=>({...make('TICKET_COMMENT','tickets',3,sigUni,run,'Comentario'),...changes});
  await assert.rejects(storage.enqueueOfflineAction(united,makeTicket({action:'SAVE_VOBO'})),/no autorizada/);
  await assert.rejects(storage.enqueueOfflineAction(united,makeTicket({kind:'portafolio'})),/no autorizada/);
  await assert.rejects(storage.enqueueOfflineAction(united,makeTicket({record_id:999})),/No se localizó/);
  await assert.rejects(storage.enqueueOfflineAction(united,makeTicket({scope_signature:'f'.repeat(64)})),/alcance/);
  await assert.rejects(storage.enqueueOfflineAction(united,makeTicket({run_id:'other'})),/renovada/);
  await assert.rejects(storage.enqueueOfflineAction(united,makeTicket({text:'  '})),/1 a 2000/);
  await assert.rejects(storage.enqueueOfflineAction(united,makeTicket({text:'a'.repeat(2001)})),/1 a 2000/);
  await assert.rejects(storage.enqueueOfflineAction({...united,effective_user_id:33},makeTicket()),/autorización offline/);
  assert.equal((await storage.outboxStatus({actor_user_id:10,effective_user_id:20})).count,0);
});

test('F4: el reemplazo seguro del respaldo invalida la captura desde generación antigua',async()=>{
  const {storage,localStorage}=createStorage();allow(localStorage,united,sigUni);
  const old=await seed(storage,united,sigUni);
  const empty={scope_signature:sigUni,kinds:{tickets:{count:0},portafolio:{count:0}},alcance:{}};
  const next=await storage.beginDownload(united,empty);await storage.finishDownload(united,next,empty);
  await assert.rejects(storage.enqueueOfflineAction(united,make('TICKET_COMMENT','tickets',3,sigUni,old,'Comentario')),/renovada/);
  assert.equal((await storage.outboxStatus({actor_user_id:10,effective_user_id:20})).count,0);
});

test('F4: actualizaciones de alcance borran pendientes revocados, no los de otras identidades',async()=>{
  const {storage,localStorage}=createStorage();allow(localStorage,united,sigUni);allow(localStorage,corellian,sigCor);
  const run=await seed(storage,united,sigUni),c=await seed(storage,corellian,sigCor);
  await storage.enqueueOfflineAction(united,make('TICKET_COMMENT','tickets',3,sigUni,run,'Uno'));
  await storage.enqueueOfflineAction(corellian,make('PROJECT_COMMENT','proyectos',10,sigCor,c,'Dos'));
  const removed=await storage.pruneOutbox({actor_user_id:10,effective_user_id:20},{'UNITED:OPERACION-RESUMEN-DIA':sigUni});
  assert.equal(removed,1);
  assert.equal((await storage.outboxStatus({actor_user_id:10,effective_user_id:20})).count,1);
  const remaining=await storage.listPendingActions({actor_user_id:10,effective_user_id:20});
  assert.equal(remaining[0].domain,'UNITED');
  // No se borran pendientes al desmarcar un módulo: el caller debe enviar el
  // catálogo de TODOS los módulos autorizados, independientemente de selección.
  const before=await storage.pruneOutbox({actor_user_id:10,effective_user_id:20},{'UNITED:OPERACION-RESUMEN-DIA':sigUni});
  assert.equal(before,0);
  await storage.purgeAll();
  assert.equal((await storage.outboxStatus({actor_user_id:10,effective_user_id:20})).count,0);
});

test('F4: la caché offline vencida impide crear nuevas operaciones sin servidor',async()=>{
  const {storage,localStorage}=createStorage();allow(localStorage,united,sigUni);
  const run=await seed(storage,united,sigUni);
  const key='mantto:offline-access:10:20';
  const saved=JSON.parse(localStorage.getItem(key));saved.saved_at='2020-01-01T00:00:00Z';
  localStorage.setItem(key,JSON.stringify(saved));
  await assert.rejects(storage.enqueueOfflineAction(united,make('TICKET_COMMENT','tickets',3,sigUni,run,'Hola')),/venció/);
});

test('F5: claim/ACK exige token e identidad; confirmado desaparece del contador',async()=>{
  const {storage,localStorage,db}=createStorage();allow(localStorage,united,sigUni);
  const run=await seed(storage,united,sigUni);
  const op=await storage.enqueueOfflineAction(united,make('TICKET_COMMENT','tickets',3,sigUni,run,'Comentario confirmable'));
  const ready=await storage.listSendableActions({actor_user_id:10,effective_user_id:20});
  assert.equal(ready.length,1);
  const claimed=await storage.claimPendingAction(united,op.id);
  assert.equal(claimed.status,'ENVIANDO');assert.equal(claimed.attempts,1);
  await assert.rejects(storage.settlePendingAction(united,op.id,'token-invalido',{state:'ACK',ack:{}}),/reclamación/);
  const ack={idempotency_key:op.idempotency_key,id_interaccion:501,record_id:3,action:op.action};
  const settled=await storage.settlePendingAction(united,op.id,claimed.claim_token,{state:'ACK',ack});
  assert.equal(settled.status,'SINCRONIZADO');
  assert.equal(settled.server_ack.id_interaccion,501);
  assert.equal((await storage.outboxStatus(united)).count,0);
  assert.equal((await storage.listPendingActions(united)).length,0);
  assert.equal(db.stores.get('outbox').get(op.id).status,'SINCRONIZADO');
});

test('F5: red fallida deja pendiente con espera, evita duplicados por pestañas',async()=>{
  const {storage,localStorage}=createStorage();allow(localStorage,united,sigUni);
  const run=await seed(storage,united,sigUni);
  const op=await storage.enqueueOfflineAction(united,make('TICKET_MOVEMENT','tickets',3,sigUni,run));
  const claimed=await storage.claimPendingAction(united,op.id);
  await assert.rejects(storage.claimPendingAction(united,op.id),/aún no está disponible/);
  const deferred=await storage.settlePendingAction(united,op.id,claimed.claim_token,{state:'RETRY',reason:'Red no disponible'});
  assert.equal(deferred.status,'PENDIENTE_SINCRONIZACION');
  assert.ok(Date.parse(deferred.next_retry_at)>Date.now());
  assert.equal((await storage.listSendableActions(united)).length,0);
  assert.equal((await storage.outboxStatus(united)).count,1);
});

test('F5: conflicto mantiene texto, muestra revisión y permite reintento explícito',async()=>{
  const {storage,localStorage}=createStorage();allow(localStorage,corellian,sigCor);
  const run=await seed(storage,corellian,sigCor);
  const op=await storage.enqueueOfflineAction(corellian,make('PROJECT_COMMENT','proyectos',10,sigCor,run));
  const claim=await storage.claimPendingAction(corellian,op.id);
  const rejected=await storage.settlePendingAction(corellian,op.id,claim.claim_token,{state:'CONFLICT',reason:'Fuera de alcance'});
  assert.equal(rejected.status,'REQUIERE_REVISION');
  assert.equal((await storage.outboxStatus(corellian)).conflicts,1);
  assert.equal((await storage.listSendableActions(corellian)).length,0);
  assert.equal((await storage.listPendingActions(corellian))[0].payload.text,'Operación local');
  const again=await storage.requeueReviewedAction(corellian,op.id);
  assert.equal(again.status,'PENDIENTE_SINCRONIZACION');
  await storage.discardPendingAction(corellian,op.id);
  assert.equal((await storage.outboxStatus(corellian)).count,0);
});

test('F5: una confirmación falsa no puede vaciar la cola local',async()=>{
  const {storage,localStorage}=createStorage();allow(localStorage,united,sigUni);
  const run=await seed(storage,united,sigUni);
  const op=await storage.enqueueOfflineAction(united,make('TICKET_COMMENT','tickets',3,sigUni,run));
  const claim=await storage.claimPendingAction(united,op.id);
  await assert.rejects(storage.settlePendingAction(united,op.id,claim.claim_token,
    {state:'ACK',ack:{idempotency_key:'otro',id_interaccion:501,record_id:3,action:op.action}}),/no confirmó/);
  assert.equal((await storage.outboxStatus(united)).count,1);
  await assert.rejects(storage.settlePendingAction({...united,actor_user_id:99},op.id,claim.claim_token,
    {state:'RETRY',reason:'test'}),/identidad/);
});

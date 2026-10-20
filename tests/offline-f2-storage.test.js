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
  const sandbox={window:{indexedDB:db,crypto:{randomUUID:()=>Math.random().toString(16).slice(2)}},
    document:{addEventListener(name,fn){events[name]=fn;}},localStorage,Blob,Date,console};
  vm.runInNewContext(code,sandbox);
  return {storage:sandbox.window.ManttoOfflineStorage,db,events};
}
function context(){return {actor_user_id:10,effective_user_id:20,domain:'UNITED',dataset:'operacion-resumen-dia'};}
function manifest(signature='a'.repeat(64)){
  return {scope_signature:signature,alcance:{zona_ids:[2,4,6,8],zonas:['N','S','E','O']},
    kinds:{tickets:{count:2,max_id:10},portafolio:{count:1,max_id:9}}};
}

test('la generación de bloques conserva respaldo anterior hasta commit atómico',async()=>{
  const {storage}=createStorage();
  const c=context();
  const original=await storage.saveSnapshot(c,{data:{tickets:[{id:1}],portafolio:[]},alcance:{zona_ids:[2,4,6,8]}},{record_count:1});
  assert.equal(original.record_count,1);
  const id=await storage.beginDownload(c,manifest());
  await storage.appendDownload(c,id,'tickets',[{id:5},{id:10}]);
  const before=await storage.getSnapshot(c);
  assert.equal(before.schema_version,1);
  assert.equal(before.payload.data.tickets.length,1);
  await storage.appendDownload(c,id,'portafolio',[{id_portafolio:9}]);
  const next=await storage.finishDownload(c,id,manifest());
  assert.equal(next.schema_version,2);
  assert.equal(next.record_count,3);
  assert.equal(next.scope_signature,'a'.repeat(64));
  const restored=await storage.getSnapshot(c);
  assert.deepEqual(Array.from(restored.payload.data.tickets,x=>x.id),[5,10]);
  assert.deepEqual(Array.from(restored.payload.data.portafolio,x=>x.id_portafolio),[9]);
  assert.equal((await storage.listSnapshots({actor_user_id:10,effective_user_id:20})).length,1);
});

test('bloque duplicado/rechazado no reemplaza copia anterior',async()=>{
  const {storage}=createStorage();
  const c=context();
  await storage.saveSnapshot(c,{data:{tickets:[{id:1}],portafolio:[]},alcance:{zona_ids:[2,4,6,8]}},{record_count:1});
  const id=await storage.beginDownload(c,manifest());
  await assert.rejects(storage.appendDownload(c,id,'tickets',[{id:8},{id:8}]),/duplicados|orden/);
  await storage.abandonDownload(c,id);
  assert.equal((await storage.getSnapshot(c)).record_count,1);
});

test('respaldo incompleto no puede finalizar ni sustituir el anterior',async()=>{
  const {storage}=createStorage();
  const c=context();
  await storage.saveSnapshot(c,{data:{tickets:[{id:1}],portafolio:[]},alcance:{zona_ids:[2,4,6,8]}},{record_count:1});
  const id=await storage.beginDownload(c,manifest());
  await storage.appendDownload(c,id,'tickets',[{id:5},{id:10}]);
  await assert.rejects(storage.finishDownload(c,id,manifest()),/incompleto/);
  assert.equal((await storage.getSnapshot(c)).schema_version,1);
});

test('revocación de alcance purga snapshot, no añade operaciones a outbox',async()=>{
  const {storage}=createStorage();
  const c=context();
  await storage.saveSnapshot(c,{data:{tickets:[{id:1}],portafolio:[]},alcance:{zona_ids:[2,4,6,8]}},{record_count:1});
  await storage.pruneSnapshots({actor_user_id:10,effective_user_id:20},{'UNITED:OPERACION-RESUMEN-DIA':'a'.repeat(64)});
  assert.equal(await storage.getSnapshot(c),null,'copia antigua sin firma se purga al revalidar');
  assert.equal((await storage.outboxStatus()).enabled,true);
});

test('dos dominios pueden guardar sus generaciones sin mezclarse',async()=>{
  const {storage}=createStorage();
  const cor={actor_user_id:10,effective_user_id:20,domain:'CORELLIAN',dataset:'instalaciones-proyectos'};
  const m={scope_signature:'b'.repeat(64),alcance:{master_key:false,visible_user_count:2},
    kinds:{proyectos:{count:1,max_id:7}}};
  const id=await storage.beginDownload(cor,m);
  await storage.appendDownload(cor,id,'proyectos',[{id_ins_fl:7,proyecto:'A'}]);
  await storage.finishDownload(cor,id,m);
  const record=await storage.getSnapshot(cor);
  assert.equal(record.payload.data.proyectos[0].proyecto,'A');
  assert.equal(await storage.getSnapshot(context()),null);
});

test('el respaldo legado UNITED válido sigue vigente hasta su reemplazo y se limpia si cambian las zonas',async()=>{
  const {storage}=createStorage();
  const c=context();
  await storage.saveSnapshot(c,{data:{tickets:[{id:1}],portafolio:[]},alcance:{zona_ids:[2,4,6,8]}},{record_count:1});
  const key='UNITED:OPERACION-RESUMEN-DIA';
  await storage.pruneSnapshots({actor_user_id:10,effective_user_id:20},{[key]:{signature:'a'.repeat(64),zone_ids:[8,6,4,2]}});
  assert.equal((await storage.getSnapshot(c)).record_count,1);
  await storage.pruneSnapshots({actor_user_id:10,effective_user_id:20},{[key]:{signature:'b'.repeat(64),zone_ids:[2,5]}});
  assert.equal(await storage.getSnapshot(c),null);
});

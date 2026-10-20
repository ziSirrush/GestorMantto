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


function newManifest(counts,signature='a'.repeat(64)){
  return {scope_signature:signature,alcance:{zona_ids:[2,4,6,8]},
    kinds:Object.fromEntries(Object.entries(counts).map(([key,count])=>[key,{count,max_id:count?count:0}]))};
}
async function seedUnited(storage,count=6){
  const c=context(),m=newManifest({tickets:count,portafolio:1});
  const run=await storage.beginDownload(c,m);
  if(count){
    await storage.appendDownload(c,run,'tickets',Array.from({length:Math.min(count,3)},(_,i)=>({id:i+1,ticket:`UNO-${i+1}`,proyecto:'Norte'})));
    if(count>3)await storage.appendDownload(c,run,'tickets',Array.from({length:count-3},(_,i)=>({id:i+4,ticket:`CAMBIO-${i+4}`,proyecto:'Sur'})));
  }
  await storage.appendDownload(c,run,'portafolio',[{id_portafolio:10,numero_equipo:'10435-MEX-ELE-FEL'}]);
  await storage.finishDownload(c,run,m);
  return {c,m,run};
}
test('F3: verifica generación completa sin devolver filas masivas',async()=>{
  const {storage}=createStorage();const {c}=await seedUnited(storage);
  const data=await storage.verifiedSnapshot(c,'a'.repeat(64));
  assert.equal(data.schema_version,2);assert.equal(data.read_only,true);
  assert.equal(data.record_count,7);
  assert.equal(data.kind_counts.tickets,6);
  assert.equal(data.kind_counts.portafolio,1);
  assert.equal(data.payload,undefined);
  assert.ok(data.run_id);
});
test('F3: paginación consulta el histórico completo sin límite de 50 registros',async()=>{
  const {storage}=createStorage();const {c}=await seedUnited(storage,58);
  const sig='a'.repeat(64);
  // Con saltos de ID, se avanza por el PK y no por offsets de un arreglo global.
  const first=await storage.readSnapshotPage(c,{scope_signature:sig,kind:'tickets',limit:19,after_id:0});
  const second=await storage.readSnapshotPage(c,{scope_signature:sig,kind:'tickets',limit:19,after_id:first.next_cursor,run_id:first.run_id});
  const third=await storage.readSnapshotPage(c,{scope_signature:sig,kind:'tickets',limit:25,after_id:second.next_cursor,run_id:first.run_id});
  assert.deepEqual([first.rows.length,second.rows.length,third.rows.length],[19,19,20]);
  assert.equal(first.has_more,true);assert.equal(second.has_more,true);assert.equal(third.has_more,false);
  assert.equal(third.next_cursor,58);
});
test('F3: búsqueda acentuada recorre todos los bloques sin usar API',async()=>{
  const {storage}=createStorage();const {c}=await seedUnited(storage,8);
  const sig='a'.repeat(64);
  const find=await storage.readSnapshotPage(c,{scope_signature:sig,kind:'tickets',search:'cAmBiO-7',limit:2});
  assert.deepEqual(Array.from(find.rows,r=>r.id),[7]);
  const equipment=await storage.readSnapshotPage(c,{scope_signature:sig,kind:'portafolio',search:'10435',limit:2});
  assert.equal(equipment.rows.length,1);assert.equal(equipment.rows[0].numero_equipo,'10435-MEX-ELE-FEL');
});
test('F3: firma, dominio, módulo, actor y usuario efectivo no se pueden mezclar',async()=>{
  const {storage}=createStorage();const {c}=await seedUnited(storage);
  await assert.rejects(storage.verifiedSnapshot(c,'b'.repeat(64)),/alcance|validar/);
  await assert.rejects(storage.readSnapshotPage(c,{scope_signature:'b'.repeat(64),kind:'tickets'}),/alcance/);
  await assert.rejects(storage.readSnapshotPage(c,{scope_signature:'a'.repeat(64),kind:'proyectos'}),/fuera del módulo/);
  await assert.rejects(storage.readSnapshotPage({...c,effective_user_id:21},{scope_signature:'a'.repeat(64),kind:'tickets'}),/alcance/);
  await assert.rejects(storage.readSnapshotPage({...c,domain:'CORELLIAN',dataset:'instalaciones-proyectos'},
    {scope_signature:'a'.repeat(64),kind:'proyectos'}),/alcance/);
});
test('F3: detecta bloques faltantes y no abre copias dañadas',async()=>{
  const {storage,db}=createStorage();const {c,run}=await seedUnited(storage,6);
  const chunks=db.stores.get('backup_chunks');
  assert.ok(chunks.has(`${run}:tickets:1`));
  chunks.delete(`${run}:tickets:1`);
  await assert.rejects(storage.verifiedSnapshot(c,'a'.repeat(64)),/bloques|completo/);
  await assert.rejects(storage.readSnapshotPage(c,{scope_signature:'a'.repeat(64),kind:'tickets',limit:99}),/bloques|completo/);
});
test('F3: rechaza uso de una generación reemplazada durante la navegación',async()=>{
  const {storage}=createStorage();const {c,run}=await seedUnited(storage,2);
  const m=newManifest({tickets:0,portafolio:0});
  const next=await storage.beginDownload(c,m);
  await storage.finishDownload(c,next,m);
  await assert.rejects(storage.readSnapshotPage(c,{scope_signature:'a'.repeat(64),kind:'tickets',run_id:run}),/renovada/);
  const empty=await storage.readSnapshotPage(c,{scope_signature:'a'.repeat(64),kind:'tickets'});
  assert.equal(empty.rows.length,0);assert.equal(empty.has_more,false);
});
test('F3: CORELLIAN permite proyectos de su propia firma y rechaza tickets',async()=>{
  const {storage}=createStorage();const c={actor_user_id:10,effective_user_id:20,domain:'CORELLIAN',dataset:'instalaciones-proyectos'};
  const m=newManifest({proyectos:2},'b'.repeat(64));const run=await storage.beginDownload(c,m);
  await storage.appendDownload(c,run,'proyectos',[{id_ins_fl:3,proyecto:'BOSQUES'},{id_ins_fl:8,proyecto:'CENTRO'}]);
  await storage.finishDownload(c,run,m);
  const checked=await storage.verifiedSnapshot(c,'b'.repeat(64));
  assert.equal(checked.kind_counts.proyectos,2);
  const r=await storage.readSnapshotPage(c,{scope_signature:'b'.repeat(64),kind:'proyectos',search:'BOSQUES'});
  assert.equal(r.rows.length,1);assert.equal(r.rows[0].id_ins_fl,3);
  await assert.rejects(storage.readSnapshotPage(c,{scope_signature:'b'.repeat(64),kind:'tickets'}),/fuera del módulo/);
  assert.equal((await storage.outboxStatus()).enabled,true);
});
test('F3: conserva límites de página y búsqueda local',async()=>{
  const {storage}=createStorage();const {c}=await seedUnited(storage);
  for(const options of [{kind:'tickets',limit:101},{kind:'tickets',limit:0},{kind:'tickets',after_id:-1},
    {kind:'tickets',search:'a'.repeat(121)}]){
    await assert.rejects(storage.readSnapshotPage(c,{scope_signature:'a'.repeat(64),...options}),/inválidos/);
  }
});
test('F3: UI de lectura solo local; no autoriza cambios ni fake de adjuntos',()=>{
  const ui=fs.readFileSync(path.join(__dirname,'../modules/offline-pilot/offline-pilot.js'),'utf8');
  assert.match(ui,/verifiedSnapshot/);assert.match(ui,/readSnapshotPage/);
  assert.match(ui,/READER_FIELDS/);assert.match(ui,/renderReaderDetail/);
  assert.match(ui,/Buscar en todos los registros del respaldo/);
  assert.match(ui,/la firma del alcance|scope_signature/);
  assert.doesNotMatch(ui,/function enqueueMutation|function syncOutbox/);
  const worker=fs.readFileSync(path.join(__dirname,'../service-worker.js'),'utf8');
  assert.match(worker,/catalog-f5-v001/);
  assert.match(worker,/event\.respondWith\(fetch\(request\)\)/);
});

test('F3: interfaz abre un módulo respaldado, busca, cambia conjunto y muestra detalle local',async()=>{
  const ui=fs.readFileSync(path.join(__dirname,'../modules/offline-pilot/offline-pilot.js'),'utf8');
  const nodes=new Map(),memory=new Map(),calls=[];
  function node(tag='div'){
    const value={tag,style:{},children:[],hidden:false,disabled:false,checked:false,value:'',textContent:'',
      replaceChildren(...items){this.children=[...items];},
      append(...items){this.children.push(...items);},
      setAttribute(key,val){this[key]=val;},
      addEventListener(type,fn){this['on'+type]=fn;}};
    Object.defineProperty(value,'innerHTML',{get(){return this._html||'';},set(html){
      this._html=String(html);this.children=[];
      for(const m of html.matchAll(/id="([^"]+)"/g))nodes.set(m[1],node());
    }});
    return value;
  }
  const view=node('section'),scope='c'.repeat(64);
  const stored={schema_version:2,read_only:true,run_id:'run-10',actor_user_id:10,effective_user_id:10,
    domain:'UNITED',dataset:'OPERACION-RESUMEN-DIA',scope_signature:scope,record_count:2,byte_size:200,
    downloaded_at:'2026-10-20T18:00:00Z',kind_counts:{tickets:1,portafolio:1}};
  const catalog=[{code:'OPERACION_RESUMEN_DEL_DIA',name:'Resumen del Día',domain:'UNITED',grouping_name:'Operación',
    scope:{mode:'ZONAS',zone_ids:[2],zones:['N'],scope_signature:scope},datasets:['operacion-resumen-dia'],backup_status:'EXPORTADOR_COMPLETO'}];
  const caps={permission_code:'GENERAL_MODO_OFFLINE_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',effective_user_id:10,viewer_read_only:false,
    catalog_modules:catalog,datasets:[{key:'operacion-resumen-dia',domain:'UNITED'}]};
  const storage={
    listSnapshots:async()=>[stored],verifiedSnapshot:async()=>stored,
    readSnapshotPage:async(_ctx,opt)=>{calls.push(opt);
      return {kind:opt.kind,rows:opt.kind==='tickets'?[{id:9,ticket:'TK-9',proyecto:'<img src=x onerror=alert(1)>'}]:
        [{id_portafolio:12,numero_equipo:'12-CMX-ELE-BLT'}],has_more:false,run_id:'run-10'};
    },outboxStatus:async()=>({enabled:false,count:0})
  };
  const sandbox={window:{ManttoOfflineStorage:storage,ManttoOfflineScheduler:{evaluate:()=>({due:false})},
      ManttoPermissions:{state:()=>({exists:true,efectivo:true})},
      ManttoAuth:{getActorUser:()=>({id_SB:10}),getUser:()=>({id_SB:10}),apiGet:async()=>({data:caps})}},
    document:{getElementById:id=>id==='view-offline-configuracion'?view:(nodes.get(id)||null),
      createElement:node,addEventListener(){}},
    navigator:{onLine:true,storage:{estimate:async()=>({usage:100,quota:10000}),persisted:async()=>true}},
    localStorage:{getItem:key=>memory.get(key)||null,setItem:(key,val)=>memory.set(key,String(val)),removeItem:key=>memory.delete(key)},
    Date,Intl,console};
  vm.runInNewContext(ui,sandbox);
  assert.equal(await sandbox.window.ManttoOfflinePilot.init(),true);
  await new Promise(resolve=>setImmediate(resolve));
  const local=nodes.get('off-local-results');
  const card=local.children.find(c=>c.tag==='div');
  assert.ok(card);
  const btn=card.children.find(c=>c.tag==='button');
  assert.ok(btn);
  await btn.onclick();
  assert.equal(calls.length,1);
  assert.equal(calls[0].kind,'tickets');
  assert.equal(nodes.get('off-reader-heading').textContent,'UNITED · Resumen del Día');
  const find=(n,tag)=>[n,...(n?.children||[]).flatMap(c=>[c,...(c.children||[])])].find(x=>x.tag===tag);
  const readerList=nodes.get('off-reader-list');
  const table=readerList.children[0].children[0];
  const tb=table.children[1];
  const detailButton=tb.children[0].children.at(-1).children[0];
  detailButton.onclick();
  assert.equal(nodes.get('off-reader-detail').hidden,false);
  const textFields=nodes.get('off-reader-detail').children.flatMap(c=>c.children||[]).flatMap(c=>c.children||[]);
  assert.ok(textFields.some(c=>c.textContent==='<img src=x onerror=alert(1)>'));
  const tabs=nodes.get('off-reader-tabs');
  await tabs.children[1].onclick();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls.at(-1).kind,'portafolio');
  assert.equal(nodes.get('off-reader-list').hidden,false);
});

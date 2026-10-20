'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');

function fakeDom(){
  const nodes=new Map();
  function element(tag='div'){
    const n={tag,style:{},children:[],hidden:false,disabled:false,checked:false,value:'',textContent:'',
      replaceChildren(...items){this.children=[...items];},append(...items){this.children.push(...items);},
      remove(){this.removed=true;},setAttribute(name,val){this[name]=val;},
      addEventListener(type,fn){this['on'+type]=fn;}};
    Object.defineProperty(n,'innerHTML',{get(){return this._html||'';},set(v){this._html=String(v);this.children=[];
      for(const m of this._html.matchAll(/id="([^"]+)"/g))nodes.set(m[1],element());}});
    return n;
  }
  const view=element('section');
  const document={getElementById:id=>id==='view-offline-configuracion'?view:(nodes.get(id)||null),
    createElement:element,addEventListener(){},dispatchEvent(){}};
  return {document,nodes,view};
}
async function openDetail(view,nodes){
  const card=nodes.get('off-local-results').children.find(c=>c.tag==='div');
  await card.children.find(c=>c.tag==='button').onclick();
  const table=nodes.get('off-reader-list').children[0].children[0];
  const row=table.children[1].children[0];
  row.children.at(-1).children[0].onclick();
  return nodes.get('off-reader-detail');
}

test('F4: formulario anclado al Ticket envía intención a IndexedDB, nunca a API',async()=>{
  const {document,nodes,view}=fakeDom(),scope='a'.repeat(64),events=[],calls=[];
  const catalog=[{code:'OPERACION_RESUMEN_DEL_DIA',name:'Resumen del Día',domain:'UNITED',
    scope:{scope_signature:scope,mode:'ZONAS',zone_ids:[2]},datasets:['operacion-resumen-dia'],backup_status:'EXPORTADOR_COMPLETO'}];
  const caps={permission_code:'GENERAL_MODO_OFFLINE_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',effective_user_id:20,
    viewer_read_only:false,catalog_modules:catalog,datasets:[{key:'operacion-resumen-dia',domain:'UNITED'}]};
  const saved={schema_version:2,read_only:true,run_id:'run-safe',actor_user_id:10,effective_user_id:20,
    domain:'UNITED',dataset:'OPERACION-RESUMEN-DIA',scope_signature:scope,record_count:1,byte_size:120,
    downloaded_at:'2026-10-20T18:00:00Z',kind_counts:{tickets:1,portafolio:0}};
  const mockStorage={
    listSnapshots:async()=>[saved],verifiedSnapshot:async()=>saved,
    readSnapshotPage:async(_ctx,opt)=>({kind:opt.kind,rows:opt.kind==='tickets'?[{id:9,ticket:'TK-9',proyecto:'Comercial'}]:[],has_more:false}),
    outboxStatus:async()=>({enabled:true,count:events.length}),listPendingActions:async()=>events,
    enqueueOfflineAction:async(ctx,opt)=>{calls.push({ctx,opt});const e={id:'uuid-local',domain:ctx.domain,dataset:'OPERACION-RESUMEN-DIA',
      scope_signature:scope,action:opt.action,reference:'TK-9',created_at:new Date().toISOString(),payload:{text:opt.text}};
      events.push(e);return e;}
  };
  const memory=new Map(),sandbox={window:{ManttoOfflineStorage:mockStorage,ManttoOfflineScheduler:{evaluate:()=>({due:false}),refreshPendingNotice(){}},
    ManttoPermissions:{state:()=>({exists:true,efectivo:true})},
    ManttoAuth:{getActorUser:()=>({id_SB:10}),getUser:()=>({id_SB:20}),apiGet:async()=>({data:caps})},addEventListener(){}},
    document,navigator:{onLine:false,storage:{estimate:async()=>({usage:1,quota:100}),persisted:async()=>true}},
    localStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)},
    Date,Intl,console};
  memory.set('mantto:offline-access:10:20',JSON.stringify({saved_at:new Date().toISOString(),data:caps}));
  vm.runInNewContext(read('modules/offline-pilot/offline-pilot.js'),sandbox);
  assert.equal(await sandbox.window.ManttoOfflinePilot.init(),true);
  await new Promise(resolve=>setImmediate(resolve));
  const detail=await openDetail(view,nodes);
  const form=detail.children.find(x=>x.tag==='form');assert.ok(form);
  const choice=form.children.find(x=>x.tag==='label');
  assert.ok(choice);
  const textarea=form.children.flatMap(x=>x.children||[]).find(x=>x.tag==='textarea');
  textarea.value='Ticket atendido, reporto ajuste local';
  await form.onsubmit({preventDefault(){}});
  assert.equal(calls.length,1);
  assert.equal(calls[0].opt.action,'TICKET_COMMENT');
  assert.equal(calls[0].opt.record_id,9);
  assert.equal(calls[0].opt.scope_signature,scope);
  assert.equal(calls[0].opt.run_id,'run-safe');
  assert.equal(events.length,1);
  assert.match(nodes.get('off-pending-list').children[0].textContent,/1 operaciones/);
  assert.match(form.children.at(-1).textContent,/Aiven no se modificó/);
});

test('F4: Modo Visor no crea formulario de captura ni permite guardar pendientes',async()=>{
  const source=read('modules/offline-pilot/offline-pilot.js');
  assert.match(source,/if\(!r\|\|!detail\|\|isViewer\(\)\|\|!readerCanOpen/);
  assert.match(source,/if\(isViewer\(\)\|\|!activeReader/);
});

test('F4: aviso local se expone sin generar notificación falsa en Aiven',async()=>{
  const events=[],header={children:[],style:{},append(...x){this.children.push(...x);}},
    status={textContent:'Notificaciones nuevas'},card={children:[],append(...x){this.children.push(...x);}},
    placeholder={querySelector:s=>s==='h1'?status:s==='.placeholder .card'?card:null};
  const map=new Map([['hdr-notif-btn',header],['view-placeholder',placeholder]]);
  function el(tag){return {tag,children:[],style:{},textContent:'',append(...x){this.children.push(...x);},
    setAttribute(){},querySelector:s=>s==='[data-count]'?this.children.find(x=>x.tag==='p'):null};}
  const sandbox={window:{ManttoAuth:{getActorUser:()=>({id_SB:10}),getUser:()=>({id_SB:20})},
    ManttoOfflineStorage:{outboxStatus:async()=>({enabled:true,count:3})},
    ManttoPermissions:{},setTimeout(){return 0;},clearTimeout(){},setInterval(){return 0;},addEventListener(){}},
    document:{getElementById:id=>map.get(id)||null,addEventListener(){},dispatchEvent:e=>events.push(e)},
    navigator:{onLine:false},localStorage:{getItem(){return null;},setItem(){},removeItem(){}},
    CustomEvent:function CustomEvent(type,obj){this.type=type;this.detail=obj.detail;},Date,console};
  // No se necesita MutationObserver para comprobar el aviso inicial.
  sandbox.document.createElement=el;
  vm.runInNewContext(read('core/offline-scheduler.js'),sandbox);
  await sandbox.window.ManttoOfflineScheduler.refreshPendingNotice();
  assert.equal(header.children.length,1);
  assert.equal(header.children[0].textContent,'3');
  assert.ok(events.some(e=>e.type==='mantto:offline-sync-required'&&e.detail.count===3&&e.detail.local_only));
  assert.ok(card.children.some(x=>x.id==='bltnow-offline-local-event'));
  assert.equal(typeof sandbox.window.ManttoOfflineScheduler.syncOutbox,'undefined');
});

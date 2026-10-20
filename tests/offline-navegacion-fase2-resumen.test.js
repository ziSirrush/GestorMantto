'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ROOT=path.resolve(__dirname,'..');
const SRC=fs.readFileSync(path.join(ROOT,'core/offline-resumen-dia.js'),'utf8');
const SIG='a'.repeat(64);
const TICKETS=[
  {id:33,ticket:'T-33',proyecto:'OBRA UNO',codigo_equipo:'P-1',fecha_reporte:'2026-10-14',zona_oficial:'CENTRO'},
  {id:47,ticket:'T-47',proyecto:'OBRA DOS',codigo_equipo:'P-2',fecha_reporte:'2026-10-16',zona_oficial:'SUR'}
];
const PORTAFOLIO=[{id_portafolio:5,numero_equipo:'P-1',proyecto:'OBRA UNO',zona_oficial:'CENTRO'}];

function fixture({onLine=false,navStatus='OFFLINE',catalogDomain='UNITED',signature=SIG,
  actor=10,effective=10,copySigned=SIG,run='respaldo-generacion-1',invalid=false,
  verifiedFails=false}={}){
  const calls=[],httpCalls=[],events={},elements=new Map();
  const dataset={tickets:TICKETS.map(t=>({...t})),portafolio:PORTAFOLIO.map(p=>({...p}))};
  let currentActor=actor,currentEffective=effective,mode=navStatus,deny=false,localReads=0;
  const catalog=[{code:'OPERACION_RESUMEN_DEL_DIA',domain:catalogDomain,
    backup_status:'EXPORTADOR_COMPLETO',datasets:['operacion-resumen-dia'],scope:{scope_signature:signature}}];
  const storage={
    readCachedAccess(a,e){if(deny||a!==currentActor||e!==currentEffective)return null;
      return {permission_code:'GENERAL_MODO_OFFLINE_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
        actor_user_id:currentActor,effective_user_id:currentEffective,catalog_modules:catalog};},
    async verifiedSnapshot(ctx,scope){localReads++;
      if(verifiedFails)throw new Error('Bloques incompletos');
      assert.equal(ctx.domain,'UNITED');assert.equal(ctx.dataset,'operacion-resumen-dia');
      assert.equal(ctx.actor_user_id,currentActor);assert.equal(ctx.effective_user_id,currentEffective);
      return {schema_version:2,read_only:true,actor_user_id:currentActor,effective_user_id:currentEffective,
        domain:'UNITED',dataset:'operacion-resumen-dia',scope_signature:copySigned,run_id:run,
        kind_counts:{tickets:2,portafolio:1},record_count:3,
        downloaded_at:'2026-10-20T18:00:00.000Z'};},
    async getSnapshot(){localReads++;
      return {schema_version:2,read_only:true,actor_user_id:currentActor,effective_user_id:currentEffective,
        domain:'UNITED',dataset:'operacion-resumen-dia',scope_signature:copySigned,run_id:invalid?'wrong-run':run,
        payload:{data:dataset,alcance:{zona_ids:[1,3]}}};}
  };
  const ids={'rd-api-status':{textContent:'',className:'',classList:{remove(){}},removeAttribute(){},title:''},
    'rd-criticos-dia':{textContent:'0',title:'',removeAttribute(){}},
    'rd-vobo-save':{disabled:false,dataset:{},title:'',removeAttribute(){}}
  };
  for(const [id,el] of Object.entries(ids))elements.set(id,el);
  const view={id:'view-resumen'};elements.set('view-resumen',view);
  const navigation={isOffline:()=>mode==='OFFLINE',canOpenRouteOffline:route=>route==='resumen'&&!deny,
    status:()=>mode,check:async()=>{mode=onLine?'ONLINE':'OFFLINE';}};
  const http={get:async(path)=>{httpCalls.push(path);return {online:true};}};
  const window={location:{href:'https://bltnow.netlify.app/index.html'},MANTTO_API_BASE:'https://api.mantto.test',
    ManttoAuth:{getActorUser:()=>({id_SB:currentActor}),getUser:()=>({id_SB:currentEffective})},
    ManttoOfflineNavigation:navigation,ManttoOfflineStorage:storage,ManttoHttp:http,
    setTimeout(fn){Promise.resolve().then(fn);return 1;}};
  const document={getElementById:id=>elements.get(id)||null,addEventListener(name,fn){events[name]=fn;}};
  let route='resumen',reloads=0;
  window.ManttoRouter={getCurrent:()=>({route}),getHistory:()=>[{route:'resumen'}]};
  window.ManttoResumenDia={load:async()=>{reloads++;}};
  window.fetch=async(input,opts)=>{calls.push({input,opts});return new Response(JSON.stringify({ok:true,source:'aiven'}),{status:200});};
  vm.runInNewContext(SRC,{window,document,console,Promise,Response,URL,MutationObserver:class MutationObserver{
    constructor(fn){this.fn=fn;}observe(){}
  }});
  return {adapter:window.ManttoOfflineResumenDia,window,document,events,calls,httpCalls,dataset,storage,
    get localReads(){return localReads;},get reloads(){return reloads;},ids,
    mode(value){mode=value;},currentIdentity(a,e=a){currentActor=a;currentEffective=e;},revoke(){deny=true;},route(v){route=v;}};
}

test('F2: Resumen original recibe tickets y portafolio completos y territoriales desde IndexedDB',async()=>{
  const f=fixture();const response=await f.window.fetch('https://api.mantto.test/api/operacion/resumen-dia/inicial',{method:'GET'});
  assert.equal(response.status,200);const json=await response.json();
  assert.equal(json.offline,true);assert.equal(json.source,'indexeddb');
  assert.deepEqual(Array.from(json.data.tickets.map(t=>t.id)),[33,47]);
  assert.equal(json.data.portafolio[0].numero_equipo,'P-1');
  assert.deepEqual(Array.from(json.alcance.zona_ids),[1,3]);
  assert.equal(f.calls.length,0,'No se realizaron peticiones a la API');
  assert.ok(f.localReads>=2);
});

test('F2: en línea, la consulta funciona sin tocar la red ni cambiar el contrato',async()=>{
  const f=fixture({navStatus:'ONLINE',onLine:true});
  const response=await f.window.fetch('https://api.mantto.test/api/operacion/resumen-dia/inicial');
  assert.equal((await response.json()).source,'aiven');
  assert.equal(f.calls.length,1);assert.equal(f.localReads,0);
  const ok=await f.window.ManttoHttp.get('/api/tickets/T-33');
  assert.equal(ok.online,true);assert.deepEqual(f.httpCalls,['/api/tickets/T-33']);
});

test('F2: detalles de tickets respaldados se abren en el motor normal',async()=>{
  const f=fixture();
  const detail=await f.window.ManttoHttp.get('/api/tickets/T-47');
  assert.equal(detail.data.ticket,'T-47');assert.equal(detail.source,'indexeddb');
  const notFound=await f.window.fetch('https://api.mantto.test/api/tickets/T-999');
  assert.equal(notFound.status,404);
  assert.equal(f.calls.length,0);
});

test('F2: el historial no respaldado NO devuelve comentarios ficticios',async()=>{
  const f=fixture();
  await assert.rejects(f.window.ManttoHttp.get('/api/tickets/T-47/interacciones'),error=>
    error.status===503&&error.code==='OFFLINE_HISTORY_NOT_BACKED');
  const critical=await f.window.fetch('https://api.mantto.test/api/equipos-criticos?page=1&page_size=5000');
  assert.equal(critical.status,503);assert.equal((await critical.json()).code,'OFFLINE_DATA_NOT_BACKED');
});

test('F2: no permite usar respaldos CORELLIAN como datos UNITED',async()=>{
  const f=fixture({catalogDomain:'CORELLIAN'});
  const res=await f.window.fetch('https://api.mantto.test/api/operacion/resumen-dia/inicial');
  assert.equal(res.status,403);assert.equal(f.calls.length,0);
});

test('F2: firma o generación alterada falla cerrado sin filtrar datos',async()=>{
  const f=fixture({copySigned:'b'.repeat(64)});
  const bad=await f.window.fetch('https://api.mantto.test/api/operacion/resumen-dia/inicial');
  assert.equal(bad.status,403);assert.notEqual((await bad.json()).source,'indexeddb');
  const f2=fixture({invalid:true});
  const bad2=await f2.window.fetch('https://api.mantto.test/api/operacion/resumen-dia/inicial');
  assert.equal(bad2.status,403);
});

test('F2: ticket de Resumen se consulta desde el detalle nativo, no desde otro modulo',async()=>{
  const f=fixture();f.route('detalle');
  const inside=await f.window.ManttoHttp.get('/api/tickets/T-33');
  assert.equal(inside.data.ticket,'T-33');
  f.route('usuarios');
  const outside=await f.window.ManttoHttp.get('/api/tickets/T-33');
  assert.equal(outside.online,true);
  assert.deepEqual(f.httpCalls,['/api/tickets/T-33']);
});

test('F2: sin módulo offline autorizado nunca solicita red ni revela registros',async()=>{
  const f=fixture();f.revoke();
  const data=await f.window.fetch('https://api.mantto.test/api/operacion/resumen-dia/inicial');
  assert.equal(data.status,403);assert.equal(f.calls.length,0);
});

test('F2: los POST normales no se convierten en confirmaciones locales',async()=>{
  const f=fixture();
  const result=await f.window.fetch('https://api.mantto.test/api/tickets/T-33/vobo',{method:'POST',body:'{}'});
  assert.equal((await result.json()).source,'aiven','La solicitud no se hace pasar por respaldo local');
  assert.equal(f.calls.length,1);assert.equal(f.localReads,0);
});

test('F2: el fetch solo intercepta los endpoints declarados y el origen exacto',async()=>{
  const f=fixture();
  await f.window.fetch('https://otra-api.test/api/operacion/resumen-dia/inicial');
  await f.window.fetch('https://api.mantto.test/api/portafolio');
  assert.equal(f.calls.length,2);assert.equal(f.localReads,0);
});

test('F2: la sesión que cambia durante el respaldo invalida la respuesta',async()=>{
  const f=fixture();const original=f.storage.getSnapshot;
  f.storage.getSnapshot=async(ctx)=>{const out=await original(ctx);f.currentIdentity(20);return out;};
  const response=await f.window.fetch('https://api.mantto.test/api/operacion/resumen-dia/inicial');
  assert.equal(response.status,403);assert.equal(f.calls.length,0);
});

test('F2: navegación con conectividad aún en CHECKING espera la verificación F1',async()=>{
  const f=fixture({navStatus:'CHECKING',onLine:false});
  const r=await f.window.fetch('https://api.mantto.test/api/operacion/resumen-dia/inicial');
  assert.equal((await r.json()).source,'indexeddb');assert.equal(f.calls.length,0);
});

test('F2: refrescar vista abierta no cambia la ruta al perder o recuperar conexión',async()=>{
  const f=fixture();
  f.events['mantto:offline-navigation-changed']({detail:{offline:true}});
  await Promise.resolve();await Promise.resolve();
  assert.equal(f.reloads,1);
  f.mode('ONLINE');f.events['mantto:offline-navigation-changed']({detail:{offline:false}});
  await Promise.resolve();await Promise.resolve();
  assert.equal(f.reloads,2);
});

test('F2: indicador de criticidad no respaldado queda como desconocido; Vo.Bo. bloqueado',async()=>{
  const f=fixture();await f.adapter.readCompleteCopy();
  assert.equal(f.ids['rd-criticos-dia'].textContent,'—');
  assert.equal(f.ids['rd-vobo-save'].disabled,true);
  assert.match(f.ids['rd-api-status'].textContent,/Copia local/);
  f.mode('ONLINE');f.events['mantto:offline-navigation-changed']({detail:{offline:false}});
  await Promise.resolve();await Promise.resolve();
  assert.equal(f.ids['rd-vobo-save'].disabled,false);
});

test('F2: el worker precachea el lector sin guardar llamadas API',()=>{
  const sw=fs.readFileSync(path.join(ROOT,'service-worker.js'),'utf8');
  const nav=fs.readFileSync(path.join(ROOT,'core/offline-navigation.js'),'utf8');
  assert.match(sw,/\.\/core\/offline-resumen-dia\.js/);
  assert.match(sw,/\.\/modules\/resumen-dia\/resumen-dia\.js/);
  assert.match(sw,/\.\/modules\/resumen-dia\/resumen-dia\.css/);
  assert.match(nav,/bltnow-offline-resumen-f2/);
  assert.match(sw,/url\.pathname\.includes\('\/api\/'\)/);
});

test('F5 seguridad: sin permiso, el chat antiguo no puede enviar POST offline',()=>{
  const f=fixture();f.route('detalle');f.revoke();
  const flags={blocked:false,stopped:false};
  f.events.submit({type:'submit',target:{id:'mg-ticket-chat-form'},
    preventDefault(){flags.blocked=true;},stopImmediatePropagation(){flags.stopped=true;}});
  assert.equal(flags.blocked,true);
  assert.equal(flags.stopped,true);
  assert.equal(f.calls.length,0);
});

test('F5 privacidad: logout oculta DOM del Resumen y borra detalle anterior',async()=>{
  const f=fixture(),view=f.document.getElementById('view-resumen');
  view.style={};view.dataset={};view.setAttribute=function(){};
  view.removeAttribute=function(){};
  f.window.ManttoResumenDia._detailData={privado:[1]};
  f.events['mantto:logout']();
  assert.equal(view.style.visibility,'hidden');
  assert.equal(view.dataset.offlineIdentityLock,'1');
  assert.deepEqual(Object.keys(f.window.ManttoResumenDia._detailData),[]);
  f.currentIdentity(20);
  f.events['mantto:auth-ready']();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(view.style.visibility,'');
  assert.equal(view.dataset.offlineIdentityLock,undefined);
  assert.ok(f.reloads>=1);
});

test('F5 privacidad: carga iniciada antes de cambiar usuario no desbloquea vista',async()=>{
  const f=fixture(),view=f.document.getElementById('view-resumen');
  view.style={};view.dataset={};view.setAttribute=function(){};
  let finishLoad=null;
  f.window.ManttoResumenDia.load=()=>new Promise(resolve=>{finishLoad=resolve;});
  f.events['mantto:logout']();
  f.events['mantto:auth-ready']();
  await Promise.resolve();
  assert.equal(typeof finishLoad,'function');
  f.currentIdentity(99);f.events['mantto:view-user-changed']();
  finishLoad();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(view.style.visibility,'hidden');
  assert.equal(view.dataset.offlineIdentityLock,'1');
});

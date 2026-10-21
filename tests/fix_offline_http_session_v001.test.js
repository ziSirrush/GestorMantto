'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ROOT=path.resolve(__dirname,'..');
const code=p=>fs.readFileSync(path.join(ROOT,p),'utf8');
const SIG='a'.repeat(64);

function fullHttpOffline(){
  let route='resumen',offline=true;
  const outbound=[];
  const identity={id_SB:9};
  const modules=[
    {code:'OPERACION_RESUMEN_DEL_DIA',domain:'UNITED',backup_status:'EXPORTADOR_COMPLETO',
      datasets:['operacion-resumen-dia'],scope:{scope_signature:SIG}},
    {code:'INSTALACIONES_PROYECTOS',domain:'CORELLIAN',backup_status:'EXPORTADOR_COMPLETO',
      datasets:['instalaciones-proyectos'],scope:{scope_signature:SIG}}
  ];
  const storage={
    readCachedAccess(){return {permission_code:'GENERAL_MODO_OFFLINE_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
      actor_user_id:9,effective_user_id:9,catalog_modules:modules};},
    async verifiedSnapshot(ctx){return {schema_version:2,read_only:true,actor_user_id:9,effective_user_id:9,
      domain:ctx.domain,dataset:ctx.dataset,scope_signature:SIG,run_id:'run-1',
      kind_counts:ctx.domain==='UNITED'?{tickets:1,portafolio:1}:{proyectos:1},
      record_count:ctx.domain==='UNITED'?2:1,downloaded_at:'2026-10-20T00:00:00Z'};},
    async getSnapshot(ctx){return {schema_version:2,read_only:true,actor_user_id:9,effective_user_id:9,
      domain:ctx.domain,dataset:ctx.dataset,scope_signature:SIG,run_id:'run-1',
      payload:{data:ctx.domain==='UNITED'?
        {tickets:[{id:55,ticket:'T-55'}],portafolio:[{id_portafolio:1}]}:
        {proyectos:[{id_ins_fl:1,id_proyecto:'PP-55'}]}}};}
  };
  const document={body:{classList:{toggle(){}}},head:{appendChild(){}},
    createElement:()=>({appendChild(){}}),getElementById:()=>null,
    addEventListener(){},dispatchEvent(){}};
  const window={location:{href:'https://bltnow.netlify.app/'},MANTTO_API_BASE:'https://api.blt.invalid',
    ManttoOfflineStorage:storage,
    ManttoOfflineNavigation:{isOffline:()=>offline,status:()=>offline?'OFFLINE':'ONLINE',
      canOpenRouteOffline:()=>true},
    ManttoRouter:{getCurrent:()=>({route,payload:route==='detalle'?{type:'ticket',source:'resumen'}:null}),
      getHistory:()=>[{route:'resumen'}]},
    setTimeout:()=>1,clearTimeout(){},
    fetch:async(input,opts)=>{outbound.push({input,opts});return new Response(
      JSON.stringify({ok:true,source:'aiven'}),{status:200});}
  };
  window.ManttoAuth={getActorUser:()=>identity,getUser:()=>identity,authHeaders:()=>({}),
    async api(apiPath,opts={}){
      const response=await window.fetch(window.MANTTO_API_BASE+apiPath,{method:opts.method||'GET',body:opts.body});
      const payload=await response.json();
      if(!response.ok||payload.ok===false){const e=new Error(payload.message);e.status=response.status;e.code=payload.code;throw e;}
      return payload;
    }};
  const ctx={window,document,URL,Headers,Request,FormData,Response,Promise,Date,console,
    MutationObserver:class{observe(){}},CustomEvent:class{}};
  vm.runInNewContext(code('core/http.js'),ctx,{filename:'http.js'});
  const original={get:window.ManttoHttp.get,request:window.ManttoHttp.request};
  assert.equal(Object.isFrozen(window.ManttoHttp),true);
  vm.runInNewContext(code('core/offline-resumen-dia.js'),ctx,{filename:'offline-resumen-dia.js'});
  vm.runInNewContext(code('core/offline-instalaciones-proyectos.js'),ctx,{filename:'offline-instalaciones-proyectos.js'});
  assert.equal(window.ManttoHttp.get,original.get);
  assert.equal(window.ManttoHttp.request,original.request);
  return {window,outbound,route:v=>{route=v;},offline:v=>{offline=v;}};
}

test('FIX: ambos adaptadores cargan sin intentar mutar el ManttoHttp congelado',()=>{
  const f=fullHttpOffline();
  assert.ok(f.window.ManttoOfflineResumenDia);
  assert.ok(f.window.ManttoOfflineInstalacionesProyectos);
});

test('FIX: ManttoHttp.get sigue leyendo Resumen UNITED vía fetch offline autorizado',async()=>{
  const f=fullHttpOffline();
  const a=await f.window.ManttoHttp.get('/api/operacion/resumen-dia/inicial');
  assert.equal(a.offline,true);assert.equal(a.data.tickets[0].ticket,'T-55');
  assert.equal(f.outbound.length,0);
  f.route('detalle');
  const b=await f.window.ManttoHttp.get('/api/tickets/T-55');
  assert.equal(b.data.ticket,'T-55');assert.equal(f.outbound.length,0);
});

test('FIX: ManttoHttp.get sigue leyendo Instalaciones CORELLIAN sin abrir la API',async()=>{
  const f=fullHttpOffline();f.route('instalaciones-proyectos');
  const r=await f.window.ManttoHttp.get('/api/ins-fl?limit=5000');
  assert.equal(r.data[0].id_proyecto,'PP-55');assert.equal(f.outbound.length,0);
});

test('FIX: las escrituras CORELLIAN sin conexión siguen bloqueadas en fetch',async()=>{
  const f=fullHttpOffline();f.route('instalaciones-proyectos');
  await assert.rejects(f.window.ManttoHttp.request('/api/instalaciones/comentarios-junta',
    {method:'POST',body:'{}'}),e=>e.status===503&&e.code==='OFFLINE_COR_WRITE_DISABLED');
  assert.equal(f.outbound.length,0);
});

test('FIX: sesiones y orígenes ajenos no se interceptan y en línea se consulta Aiven',async()=>{
  const f=fullHttpOffline();f.route('instalaciones-proyectos');
  const auth=await f.window.fetch('https://api.blt.invalid/api/auth/me');
  const outside=await f.window.fetch('https://other.invalid/api/ins-fl');
  assert.equal((await auth.json()).source,'aiven');
  assert.equal((await outside.json()).source,'aiven');
  f.offline(false);const r=await f.window.ManttoHttp.get('/api/ins-fl');
  assert.equal(r.source,'aiven');assert.equal(f.outbound.length,3);
});

function sessionTest({pending=true,locks=false}={}){
  const timers=[];
  const window={MANTTO_API_BASE:'https://api.blt.invalid',MANTTO_SESSION_API_BASE:'https://api.blt.invalid',
    location:{href:'https://bltnow.netlify.app'},navigator:{},
    atob:s=>Buffer.from(s,'base64').toString('binary'),
    setTimeout(fn,ms){timers.push({fn,ms,cleared:false});return timers.length;},
    clearTimeout(i){if(timers[i-1])timers[i-1].cleared=true;},addEventListener(){}};
  if(locks)window.navigator.locks={request(_name,opts){return new Promise((_,reject)=>{
    opts.signal?.addEventListener('abort',()=>reject(new Error('Aborted')), {once:true});
  });}};
  const storage={getItem:()=>null,setItem(){},removeItem(){}};
  const fetch=(_url,opts={})=>pending?new Promise((_,reject)=>{
    opts.signal?.addEventListener('abort',()=>reject(new Error('Aborted')),{once:true});
  }):Promise.resolve({ok:true,status:200,json:async()=>({ok:true,source:'api'})});
  const exposed=code('core/auth.js').replace(/\}\)\(\);\s*$/,
    'window.__TEST__={fetchSessionBounded,refreshAccessToken,isTransientSessionError};})();');
  const ctx={window,localStorage:storage,sessionStorage:storage,fetch,AbortController,Promise,URL,
    FormData,Date,Buffer,console,document:{addEventListener(){},dispatchEvent(){},getElementById:()=>null}};
  vm.runInNewContext(exposed,ctx,{filename:'auth.js'});
  assert.ok(window.__TEST__);
  return {window,timers,...window.__TEST__};
}

test('FIX: autenticación con fetch bloqueado abandona Validando sesión al agotarse 12s',async()=>{
  const f=sessionTest();
  const pending=f.fetchSessionBounded('/api/auth/me',{});
  assert.equal(f.timers[0].ms,12000);
  f.timers[0].fn();
  await assert.rejects(pending,e=>e.code==='AUTH_NETWORK_TIMEOUT'&&e.name==='AbortError');
  assert.equal(f.timers[0].cleared,true);
});

test('FIX: Web Locks de refresh atascados también terminan después del límite',async()=>{
  const f=sessionTest({locks:true});
  const task=f.refreshAccessToken();
  assert.equal(f.timers[0].ms,12000);
  f.timers[0].fn();
  await assert.rejects(task,e=>e.code==='AUTH_NETWORK_TIMEOUT');
  assert.equal(f.timers[0].cleared,true);
});

test('FIX: HTTP 503 es transitorio; HTTP 401 sigue rechazado',()=>{
  const f=sessionTest({pending:false});
  assert.equal(f.isTransientSessionError({status:503}),true);
  assert.equal(f.isTransientSessionError({status:401}),false);
});

test('FIX: auth/me está acotado pero las solicitudes operativas conservan su flujo',async()=>{
  const f=sessionTest({pending:false});
  const auth=await f.window.ManttoAuth.apiGet('/api/auth/me');
  assert.equal(auth.source,'api');assert.equal(f.timers.length,1);
  assert.equal(f.timers[0].cleared,true);
  const operational=await f.window.ManttoAuth.apiGet('/api/operacion/resumen-dia/inicial');
  assert.equal(operational.source,'api');assert.equal(f.timers.length,1);
});

test('FIX: el caché PWA y las URLs de carga usan la misma versión nueva',()=>{
  const v='20261021-offline-http-session-v001';
  assert.match(code('index.html'),new RegExp('core/auth\\.js\\?v='+v));
  assert.match(code('index.html'),new RegExp('core/offline-scheduler\\.js\\?v='+v));
  assert.match(code('core/offline-scheduler.js'),new RegExp('core/offline-navigation\\.js\\?v='+v));
  assert.match(code('core/offline-navigation.js'),new RegExp('core/offline-resumen-dia\\.js\\?v='+v));
  assert.match(code('core/offline-navigation.js'),new RegExp('core/offline-instalaciones-proyectos\\.js\\?v='+v));
  assert.match(code('service-worker.js'),new RegExp('SERVICE_WORKER_VERSION = .'+v));
  assert.match(code('core/http.js'),/Object\.freeze\(\{ request, get/);
});

test('FIX: sesión guardada y auth/me sin respuesta dejan de mostrar spinner tras el límite',async()=>{
  const timerTasks=[];
  const values=new Map();
  const sessionValues=new Map();
  const tokenPayload={iat:Math.floor(Date.now()/1000)-60,exp:Math.floor(Date.now()/1000)+3600};
  const token='hdr.'+Buffer.from(JSON.stringify(tokenPayload)).toString('base64url')+'.sig';
  values.set('mantto_token',token);
  values.set('mantto_user',JSON.stringify({id_SB:9,nombre:'Tester',rol:'Supervisor'}));
  const storage=map=>({getItem:key=>map.get(key)||null,setItem:(key,v)=>map.set(key,String(v)),
    removeItem:key=>map.delete(key)});
  const display=new Map();
  const element=id=>{
    if(!display.has(id)){
      const classes=new Set(['auth-bootstrap-screen','auth-screen','app'].includes(id)?[]:[]);
      display.set(id,{textContent:'',className:'',style:{},classList:{
        add:k=>classes.add(k),remove:k=>classes.delete(k),contains:k=>classes.has(k)
      },addEventListener(){}});
    }
    return display.get(id);
  };
  const events=[];
  const window={MANTTO_API_BASE:'https://api.blt.invalid',MANTTO_SESSION_API_BASE:'https://api.blt.invalid',
    navigator:{},location:{href:'https://bltnow.netlify.app'},
    atob:input=>Buffer.from(input,'base64').toString('binary'),
    setTimeout(fn,ms){timerTasks.push({fn,ms,cleared:false});return timerTasks.length;},
    clearTimeout(id){if(timerTasks[id-1])timerTasks[id-1].cleared=true;},addEventListener(){}};
  const sandbox={window,AbortController,FormData,Promise,Date,Buffer,URL,console,
    localStorage:storage(values),sessionStorage:storage(sessionValues),
    document:{hidden:false,getElementById:element,querySelectorAll:()=>[],
      addEventListener(){},dispatchEvent:e=>events.push(e.type)},
    CustomEvent:class CustomEvent{constructor(type){this.type=type;}},
    fetch:(_url,opts)=>new Promise((_,reject)=>{
      opts.signal?.addEventListener('abort',()=>reject(new Error('timeout')),{once:true});
    })};
  vm.runInNewContext(code('core/auth.js'),sandbox,{filename:'auth.js'});
  const task=window.ManttoAuth.init();
  await Promise.resolve();await Promise.resolve();
  // Refresh se programa para el futuro; la validación pendiente dura como máximo 12 s.
  const deadline=timerTasks.find(t=>t.ms===12000);
  assert.ok(deadline,'No se programó límite para auth/me');
  deadline.fn();
  await task;
  assert.equal(element('auth-bootstrap-screen').classList.contains('hidden'),true);
  assert.equal(element('auth-screen').classList.contains('hidden'),true);
  assert.ok(events.includes('mantto:auth-ready'));
  assert.equal(values.get('mantto_token'),token,'No se eliminó la sesión guardada');
});

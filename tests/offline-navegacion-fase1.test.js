'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'core/offline-navigation.js'),'utf8');
const sigU='a'.repeat(64),sigC='b'.repeat(64);
const modules=[
  {code:'OPERACION_RESUMEN_DEL_DIA',domain:'UNITED',backup_status:'EXPORTADOR_COMPLETO',datasets:['operacion-resumen-dia'],scope:{scope_signature:sigU}},
  {code:'INSTALACIONES_PROYECTOS',domain:'CORELLIAN',backup_status:'EXPORTADOR_COMPLETO',datasets:['instalaciones-proyectos'],scope:{scope_signature:sigC}}
];

function fixture({online=false,navigatorOnline=false,allowCor=true,denied=false,wrongScope=false,identity=8}={}){
  const nodes=new Map(),events=[],network=[],permissionCalls=[],storageCalls=[];
  const documentListeners={},windowListeners={};
  let currentActor=identity,currentEffective=identity,revoked=denied,observedSidebar=null;
  class Node{
    constructor(tag='div'){
      this.tagName=tag.toUpperCase();this.hidden=false;this.style={};this.dataset={};this.children=[];
      this.listeners={};this.parentElement=null;this.textContent='';this.attributes={};this._id='';
    }
    set id(value){this._id=String(value);nodes.set(this._id,this);}
    get id(){return this._id;}
    append(...items){for(const item of items){item.parentElement=this;this.children.push(item);}}
    appendChild(item){this.append(item);}
    insertAdjacentElement(_where,item){this.parentElement?.appendChild(item);}
    addEventListener(type,callback){this.listeners[type]=callback;}
    setAttribute(name,value){this.attributes[name]=String(value);}
    querySelectorAll(sel){
      if(sel==='.side-item')return this.children.filter(item=>item.tagName==='BUTTON');
      if(sel==='.side-item[data-permission]')return this.groups.flatMap(group=>group.querySelectorAll('.side-item')).concat(this.home||[]);
      if(sel==='.side-group')return this.groups;
      return [];
    }
  }
  const app=new Node(),header=new Node('div');header.id='app-context-nav';header.parentElement=app;
  const groups=[];
  const home=new Node('button');home.dataset={route:'home',permission:'home'};home.hidden=true;
  const groupU=new Node('section');groupU.hidden=true;
  const uni=new Node('button');uni.dataset={route:'resumen',permission:'operacion_resumen'};uni.hidden=true;
  const notBacked=new Node('button');notBacked.dataset={route:'criticos',permission:'operacion_criticos'};notBacked.hidden=false;
  groupU.append(uni,notBacked);
  const groupC=new Node('section');groupC.hidden=true;
  const cor=new Node('button');cor.dataset={route:'instalaciones-proyectos',permission:'instalaciones_proyectos'};cor.hidden=true;
  groupC.append(cor);groups.push(groupU,groupC);
  const sidebar=new Node('aside');sidebar.id='sidebar';sidebar.groups=groups;sidebar.home=[home];
  nodes.set('sidebar',sidebar);
  const doc={readyState:'complete',hidden:false,head:new Node('head'),
    getElementById:id=>nodes.get(id)||null,createElement:tag=>new Node(tag),
    addEventListener(type,callback){documentListeners[type]=callback;},
    dispatchEvent(event){events.push(event);documentListeners[event.type]?.(event);}
  };
  const caps={permission_code:'GENERAL_MODO_OFFLINE_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
    effective_user_id:identity,actor_user_id:identity,catalog_modules:modules};
  const storage={
    readCachedAccess(actor,effective){return revoked||actor!==identity||effective!==identity?null:caps;},
    async verifiedSnapshot(ctx,signature){storageCalls.push({ctx,signature});
      if(wrongScope&&ctx.domain==='UNITED')throw new Error('Otro alcance');
      if(ctx.domain==='CORELLIAN'&&!allowCor)throw new Error('Copia incompleta');
      const expected=ctx.domain==='UNITED'?sigU:sigC;
      if(signature!==expected)throw new Error('Firma incorrecta');
      return {schema_version:2,read_only:true,actor_user_id:ctx.actor_user_id,
        effective_user_id:ctx.effective_user_id,domain:ctx.domain,dataset:ctx.dataset,
        scope_signature:expected};}
  };
  const win={MANTTO_API_BASE:'https://api.example.test',
    ManttoOfflineStorage:storage,
    ManttoAuth:{getActorUser:()=>({id_SB:currentActor}),getUser:()=>({id_SB:currentEffective})},
    ManttoPermissions:{async reload(){permissionCalls.push('reload');}},
    ManttoUserViewer:{applySidebar(){permissionCalls.push('applySidebar');}},
    ManttoOfflineScheduler:{async revalidateCopies(){permissionCalls.push('revalidate');},
      async syncPendingNow(){permissionCalls.push('sync');}},
    addEventListener(type,callback){windowListeners[type]=callback;},
    setTimeout(){return 1;},clearTimeout(){},setInterval(){return 2;}
  };
  const navigator={onLine:navigatorOnline};
  const sandbox={window:win,document:doc,navigator,
    fetch:async(url,options)=>{network.push({url,options});return {ok:online,json:async()=>({ok:online,database:online?'connected':'disconnected'})};},
    Date,Promise,AbortController,console,CustomEvent:class CustomEvent{constructor(type,opts){this.type=type;this.detail=opts?.detail;}},
    MutationObserver:class MutationObserver{constructor(callback){observedSidebar=callback;}observe(){}}
  };
  vm.runInNewContext(source,sandbox);
  return {nav:win.ManttoOfflineNavigation,network,storageCalls,permissionCalls,events,doc,win,navigator,
    items:{home,uni,cor,notBacked,groupU,groupC},
    get button(){return nodes.get('bltnow-offline-retry');},
    get banner(){return nodes.get('bltnow-offline-connection');},
    setIdentity(a,b=a){currentActor=a;currentEffective=b;},
    revoke(){revoked=true;},
    permissionRendererChanged(){observedSidebar?.([{type:'attributes',attributeName:'hidden'}]);}
  };
}

test('F1: navegacion offline usa solo copias integras con misma identidad y empresa',async()=>{
  const x=fixture();
  const result=await x.nav.check();await Promise.resolve();
  assert.equal(result.online,false);assert.equal(x.nav.isOffline(),true);
  assert.deepEqual(Array.from(x.nav.visibleRoutes()).sort(),['instalaciones-proyectos','resumen']);
  assert.equal(x.items.uni.hidden,false);assert.equal(x.items.cor.hidden,false);
  assert.equal(x.items.notBacked.hidden,true);assert.equal(x.items.groupU.hidden,false);
  assert.equal(x.banner.hidden,false);assert.equal(x.button.textContent,'↻ Reconectar');
  assert.equal(x.network.length,0,'No solicitar API con navegador declaradamente sin red');
});

test('F1: rechaza copia incompleta y firma territorial distinta',async()=>{
  const x=fixture({allowCor:false,wrongScope:true});
  await x.nav.check();await Promise.resolve();
  assert.deepEqual(Array.from(x.nav.visibleRoutes()),[]);
  assert.equal(x.items.uni.hidden,true);assert.equal(x.items.cor.hidden,true);
});

test('F1: sin catalogo autorizado vigente no se muestran los modulos',async()=>{
  const x=fixture({denied:true});await x.nav.check();await Promise.resolve();
  assert.deepEqual(Array.from(x.nav.visibleRoutes()),[]);assert.equal(x.items.home.hidden,false);
});

test('F1: API indisponible aunque el navegador diga online activa respaldo local',async()=>{
  const x=fixture({navigatorOnline:true,online:false});
  const result=await x.nav.check();await Promise.resolve();
  assert.equal(result.reason,'api-unavailable');assert.equal(x.nav.isOffline(),true);
  assert.ok(x.network[0].url.endsWith('/api/health?offline_probe='+x.network[0].url.split('offline_probe=')[1]));
  assert.equal(x.network[0].options.cache,'no-store');
});

test('F1: reconectar comprueba /api/health, recupera permisos, no cambia ruta',async()=>{
  const x=fixture({navigatorOnline:false,online:true});
  await x.nav.check();assert.equal(x.nav.isOffline(),true);
  const result=await x.nav.check({manual:true});
  assert.equal(result.online,true);assert.equal(x.nav.isOffline(),false);
  assert.equal(x.banner.hidden,true);assert.ok(x.network.some(c=>c.url.includes('/api/health')));
  assert.deepEqual(x.permissionCalls,['reload','applySidebar','revalidate','sync']);
  assert.deepEqual(Array.from(x.nav.visibleRoutes()),[]);
});

test('F1: reconexion fallida conserva respaldo y boton activo',async()=>{
  const x=fixture({online:false});await x.nav.check();
  const result=await x.nav.check({manual:true});
  assert.equal(result.online,false);assert.equal(x.nav.isOffline(),true);
  assert.equal(x.button.disabled,false);assert.equal(x.items.uni.hidden,false);
});

test('F1: cambio de actor invalida la visibilidad local',async()=>{
  const x=fixture();await x.nav.check();assert.ok(x.nav.canOpenRouteOffline('resumen'));
  x.setIdentity(9);
  await x.doc.dispatchEvent(new (class{constructor(){this.type='mantto:view-user-changed';}})());
  await x.nav.check();await Promise.resolve();
  assert.equal(x.nav.canOpenRouteOffline('resumen'),false);
});

test('F1: al expirar autorización local desaparecen módulos del menú',async()=>{
  const x=fixture();await x.nav.check();assert.equal(x.items.uni.hidden,false);
  x.revoke();await x.nav.check();await Promise.resolve();
  assert.equal(x.items.uni.hidden,true);assert.equal(x.items.cor.hidden,true);
  assert.deepEqual(Array.from(x.nav.visibleRoutes()),[]);
});

test('F1: se recupera el menu si el gestor de permisos intenta ocultarlo sin conexion',async()=>{
  const x=fixture();await x.nav.check();await Promise.resolve();
  x.items.uni.hidden=true;x.items.groupU.hidden=true;
  x.permissionRendererChanged();
  await Promise.resolve();await Promise.resolve();
  assert.equal(x.items.uni.hidden,false);
  assert.equal(x.items.groupU.hidden,false);
});

test('F1: el worker precachea el adaptador y rechaza datos API como recurso estatico',()=>{
  const code=fs.readFileSync(path.join(root,'service-worker.js'),'utf8');
  const registrations=[];
  const self={location:{origin:'https://app.test',href:'https://app.test/service-worker.js'},
    addEventListener:(type)=>registrations.push(type),clients:{},registration:{}};
  const sandbox={self,clients:self.clients,URL,URLSearchParams,Promise,Date,console,
    setTimeout(){return 1;},clearTimeout(){},MessageChannel:function MessageChannel(){}};
  vm.runInNewContext(code,sandbox);
  assert.equal(sandbox.isStaticShellRequest({method:'GET',url:'https://app.test/core/offline-navigation.js'}),true);
  assert.equal(sandbox.isStaticShellRequest({method:'GET',url:'https://app.test/api/health'}),false);
  assert.equal(sandbox.isStaticShellRequest({method:'GET',url:'https://app.test/api/offline/capabilities'}),false);
  assert.ok(registrations.includes('fetch'));assert.ok(registrations.includes('install'));
});

test('F1: detecta la presencia del adaptador en shell, sin cache de APIs',()=>{
  const worker=fs.readFileSync(path.join(root,'service-worker.js'),'utf8');
  const scheduler=fs.readFileSync(path.join(root,'core/offline-scheduler.js'),'utf8');
  assert.match(worker,/\.\/core\/offline-navigation\.js/);
  assert.match(worker,/url\.pathname\.includes\('\/api\/'\)/);
  assert.match(scheduler,/bltnow-offline-navigation-script/);
  assert.match(scheduler,/rememberAuthorizedCatalog\(caps,actor,effective\)/);
  assert.doesNotMatch(source,/\/(?:api\/tickets)\//);
});

test('F5 seguridad: permiso vencido durante verificacion larga no habilita rutas',async()=>{
  const f=fixture();
  const original=f.win.ManttoOfflineStorage.verifiedSnapshot;
  let checked=0;
  f.win.ManttoOfflineStorage.verifiedSnapshot=async function(...args){
    const data=await original(...args);
    if(++checked===1)f.revoke();
    return data;
  };
  await f.nav.check();await Promise.resolve();
  assert.deepEqual(Array.from(f.nav.visibleRoutes()),[]);
  assert.equal(f.items.uni.hidden,true);
  assert.equal(f.items.cor.hidden,true);
});

test('F5 seguridad: salud de API sin MySQL nunca habilita modo online',async()=>{
  const f=fixture({navigatorOnline:true,online:false});
  const state=await f.nav.check({manual:true});
  assert.equal(state.online,false);
  assert.equal(f.nav.isOffline(),true);
  assert.equal(f.permissionCalls.length,0);
});

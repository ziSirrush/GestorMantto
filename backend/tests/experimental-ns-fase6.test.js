'use strict';
// BLT NOW | Experimental NS F6 | Pruebas aisladas: SIN credenciales ni MySQL real.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Module = require('node:module');
const ROOT = path.join(__dirname,'../src/modules/experimental-ns');
const DRIVER = path.join(__dirname,'../../modules/experimental-ns/experimental-ns-live.js');
function loadMock(file,mocks){
  const full=path.join(ROOT,file);
  const original=Module._load;
  Module._load=function(name,parent,isMain){
    if(Object.prototype.hasOwnProperty.call(mocks,name))return mocks[name];
    return original.apply(this,arguments);
  };
  try{delete require.cache[require.resolve(full)];return require(full);}finally{Module._load=original;}
}
const fakeAccess={
  assertScope(req){if(req?.informationAccess?.dominio!=='UNITED')throw Error('denied');return req.informationAccess;},
  portafolioScope(){return {sql:'p.zona_id IN (?)',params:[12]};},
  ticketsScope(){return {sql:'EXISTS (SELECT 1 FROM ns_portafolio_pruebas p_scope WHERE p_scope.numero_equipo=t.codigo_equipo)',params:[12]};},
  assertNoProductionTables(sql){if(/\b(?:FROM|JOIN)\s+(?:tickets|portafolio)\b/i.test(sql))throw Error('production read');}
};
const authorized=()=>({informationAccess:{dominio:'UNITED',motor:'alcance_uni',acceso_puerta:true,
  agrupacion:{codigo:'EXPERIMENTAL_NS'},permission_code:'EXPERIMENTAL_NS_EQUIPOS_CRITICOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL'}});

test('F6: revision SQL consulta SOLO dos tablas NS con alcance territorial parametrizado',async()=>{
  const sql=[];
  const fakeDb={query:async(statement,params)=>{
    sql.push({statement,params});
    return [[{total:5,max_id:99,ultima:1_800_000_000,suma:9_000_000_000}]];
  }};
  const r=loadMock('experimental-ns-live.repository.js',{'../../config/db':fakeDb,'./experimental-ns.scope':fakeAccess});
  const revision=await r.revision(authorized());
  assert.match(revision,/^[0-9a-f]{64}$/);
  assert.equal(sql.length,2);
  assert.ok(sql[0].statement.includes('FROM ns_portafolio_pruebas p'));
  assert.ok(sql[1].statement.includes('FROM ns_tickets_pruebas t'));
  assert.ok(sql.every(({statement})=>!(/\b(?:FROM|JOIN)\s+(?:portafolio|tickets)\b/i.test(statement))));
  assert.deepEqual(sql[0].params,[12]);
  // FIX PERIODOS V001: Live revisa solamente la fecha correspondiente.
  assert.match(sql[1].statement,/t\.fecha_reporte\s*>=\s*\?/);
  assert.match(sql[1].statement,/t\.fecha_reporte\s*<\s*\?/);
  assert.equal(sql[1].params.length,3);
  assert.match(sql[1].params[0],/^\d{4}-\d{2}-\d{2} 00:00:00$/);
  assert.match(sql[1].params[1],/^\d{4}-\d{2}-\d{2} 00:00:00$/);
  assert.deepEqual(sql[1].params.slice(2),[12]);
  assert.match(sql[0].statement,/estado_registro\s*=\s*1/);
});

test('F6: huella varía con modificaciones y rechaza acceso sin alcance',async()=>{
  let changed=false;
  const db={query:async()=>[[{total:4,max_id:changed?101:100,ultima:changed?300:200,suma:1000}]]};
  const r=loadMock('experimental-ns-live.repository.js',{'../../config/db':db,'./experimental-ns.scope':fakeAccess});
  const first=await r.revision(authorized());changed=true;
  assert.notEqual(first,await r.revision(authorized()));
  await assert.rejects(r.revision({informationAccess:{dominio:'GENERAL'}}),/denied/);
});

test('F6: rutas GET independientes exigen autenticación, permiso individual y Programador',async()=>{
  const routes=[];const guards=[];
  const express=()=>({get(...args){routes.push(args);}});express.Router=()=>({get(...args){routes.push(args);}});
  const repo={revision:async()=>'a'.repeat(64)};
  const router=loadMock('experimental-ns-live.routes.js',{
    'express':express,
    '../../middleware/information-access-gnral.middleware':{
      humanInformationGuard_gnral:config=>{guards.push(config);return [(req,res,next)=>next(),(req,res,next)=>next()];}
    },
    './experimental-ns-live.repository':repo
  });
  assert.ok(router);
  assert.equal(routes.length,3);
  assert.deepEqual(guards.map(g=>g.permissionCode),[
    'EXPERIMENTAL_NS_RESUMEN_DIA_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
    'EXPERIMENTAL_NS_EQUIPOS_CRITICOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
    'EXPERIMENTAL_NS_PROYECTOS_MANTENIMIENTO_ACCESO_VISUAL_MODULO.ACCESO_VISUAL'
  ]);
  assert.ok(guards.every(g=>g.domain==='UNITED'&&g.groupingCode==='EXPERIMENTAL_NS'));
  for(const route of routes){
    assert.match(route[0],/^\/live\/[^/]+\/revision$/);
    assert.equal(route.length,5);
    const denied=[];
    const res={status(n){denied.push(n);return this;},json(v){denied.push(v);return v;}};
    route[2]({actorUser:{is_programador:false}},res,()=>{throw Error('guard bypass');});
    assert.equal(denied[0],403);
    const output=[];
    const authorizedRes={set(k,v){output.push([k,v]);},json(v){output.push(v);return v;}};
    await route[4]({actorUser:{is_programador:true}},authorizedRes,e=>{throw e;});
    assert.equal(output.at(-1).version,'a'.repeat(64));
    assert.deepEqual(output[0],['Cache-Control','no-store, private']);
  }
});

function driverFixture(){
  const listeners=new Map(),windowListeners=new Map();
  const root={child:null,firstChild:null,
    querySelector(selector){return selector==='.expns-live-line'?this.child:null;},
    insertBefore(node){this.child=node;this.firstChild=node;}
  };
  const document={hidden:false,
    getElementById(id){return id==='view-experimental-ns-resumen-dia'?root:null;},
    createElement(){return {dataset:{},textContent:'',className:'',setAttribute(){}};},
    addEventListener(name,fn){listeners.set(name,fn);}
  };
  let route='experimental-ns-resumen-dia',online=true;
  let value='a'.repeat(64), apiCalls=0,changes=0,resets=0;
  let actor={id_SB:12,rol:'Programador'},effective={id_SB:13,rol:'Programador'};
  const window={ManttoAuth:{getActorUser:()=>actor,getUser:()=>effective,getViewUser:()=>null,
    apiGet:async url=>{apiCalls++;assert.equal(url,'/api/experimental-ns/live/resumen-dia/revision');return {ok:true,source:'experimental-ns',version:value};}},
    ManttoRouter:{getCurrent:()=>({route})},setInterval:()=>1,setTimeout:fn=>{fn();return 1;},
    addEventListener(name,fn){windowListeners.set(name,fn);}
  };
  const ctx={window,document,console,Date,navigator:{get onLine(){return online;}}};
  vm.runInNewContext(fs.readFileSync(DRIVER,'utf8'),ctx,{filename:DRIVER});
  const live=window.ManttoExperimentalNsLive;
  const callbacks={refreshSilent:async()=>{changes++;return {changed:2};},reset:()=>{resets++;}};
  assert.equal(live.register(route,callbacks),true);live.markFetched(route);
  return {live,document,window,root,listeners,windowListeners,
    setVersion:v=>value=v,getApiCalls:()=>apiCalls,getChanges:()=>changes,getResets:()=>resets,
    setRoute:v=>route=v,setOnline:v=>online=v,setUser:v=>effective=v};
}

test('F6: cache inicial evita refrescar, revision diferente actualiza sin reiniciar',async()=>{
  const f=driverFixture();
  assert.equal(await f.live.checkActive(false),false);
  assert.equal(f.getChanges(),0);
  f.setVersion('b'.repeat(64));
  assert.equal(await f.live.checkActive(false),true);
  assert.equal(f.getChanges(),1);
  assert.match(f.root.child.textContent,/2 elementos visuales/);
  assert.equal(await f.live.checkActive(false),false);
  assert.equal(f.getChanges(),1);
});

test('F6: modulo inactivo/offline no consume API ni modifica pantalla',async()=>{
  const f=driverFixture();const before=f.getApiCalls();
  f.setRoute('home');await f.live.check('experimental-ns-resumen-dia',false);
  f.setRoute('experimental-ns-resumen-dia');f.setOnline(false);
  await f.live.checkActive(false);
  assert.equal(f.getApiCalls(),before);
  assert.equal(f.getChanges(),0);
});

test('F6: cambio de usuario efectivo invalida caché y llama reset',async()=>{
  const f=driverFixture();
  await f.live.checkActive(false);
  f.setUser({id_SB:14,rol:'Programador'});
  assert.equal(await f.live.checkActive(false),false);
  assert.equal(f.getResets(),1);
  assert.equal(f.getApiCalls(),1);
});

test('F6: no toca motores globales ni introduce escrituras',()=>{
  const live=fs.readFileSync(DRIVER,'utf8');
  assert.doesNotMatch(live,/ManttoDataSync|WebSocket|localStorage|sessionStorage|indexedDB/);
  assert.doesNotMatch(live,/\/(?:api\/tickets|api\/portafolio|api\/proyectos|api\/equipos-criticos)/);
  const repo=fs.readFileSync(path.join(ROOT,'experimental-ns-live.repository.js'),'utf8');
  assert.doesNotMatch(repo,/\b(?:INSERT|UPDATE|DELETE|DROP|ALTER)\b(?=\s+(?:INTO|\w))/i);
});

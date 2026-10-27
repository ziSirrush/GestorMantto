'use strict';

// BLT NOW INT9 Ajustadores F4: QA totalmente aislado, sin Aiven ni HTTP remoto.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const file=path.join(__dirname,'../modules/instalaciones-programacion-personal/instalaciones-programacion-personal-ajustadores.js');
const moduleCode=fs.readFileSync(file,'utf8');
const loader=fs.readFileSync(path.join(__dirname,'../core/module-loader.js'),'utf8');
const sw=fs.readFileSync(path.join(__dirname,'../service-worker.js'),'utf8');
const candidate=(id=15,fields={})=>({id_ins_fl:id,proyecto:'Plaza Norte',referencia_sitio:'EL-01',
  ajustador_origen:'Miguel Prueba',personas:[{id_personal:7,nombre:'Miguel Prueba'}],
  inicio:'2026-10-27',fin:'2026-11-02',estado:'VINCULABLE',...fields});

function harness({allowed=['VER','CREAR','DESACTIVAR'],viewer=false,pages=[],postResult=null,route='instalaciones-programacion-personal'}={}){
  const listeners=new Map();
  const rootEvents=new Map();
  const actions=[];
  const ui={status:{textContent:'',classList:{toggle(){}}},results:{innerHTML:'',replaceChildren(){this.innerHTML='';}},
    footer:{innerHTML:'',replaceChildren(){this.innerHTML='';}}, button:{disabled:false}};
  const panel={hidden:true,id:'',className:'',attributes:{},innerHTML:'',
    setAttribute(k,v){this.attributes[k]=v;},
    querySelector(selector){
      if(selector==='[data-aj-results]')return ui.results;
      if(selector==='[data-aj-footer]')return ui.footer;
      if(selector==='[data-aj-status]')return ui.status;
      if(selector==='[data-aj-action="consultar"]')return ui.button;
      return null;
    }};
  let widget=null;
  let currentRoute=route;
  let type='AJUSTADOR',view='calendario';
  let refreshes=0, confirmations=0;
  let observer=null;
  const anchor={insertAdjacentElement(where,el){assert.equal(where,'afterend');widget=el;}};
  const root={
    querySelector(sel){
      if(sel==='#ppc-calendario')return anchor;
      if(sel==='#ppc-aj-auto')return widget;
      if(sel==='[data-ppc="tipo"][data-tipo="AJUSTADOR"].active')return type==='AJUSTADOR'?{}:null;
      if(sel==='[data-ppc="seccion"][data-vista="calendario"].active')return view==='calendario'?{}:null;
      return null;
    },
    addEventListener(event,callback){rootEvents.set(event,callback);},
    contains(){return true;}
  };
  const document={readyState:'complete',
    getElementById(id){return id==='view-instalaciones-programacion-personal'?root:null;},
    createElement(tag){assert.equal(tag,'section');return panel;},
    addEventListener(event,callback){if(!listeners.has(event))listeners.set(event,[]);listeners.get(event).push(callback);}
  };
  const data=pages.map(p=>typeof p==='function'?p:()=>p);
  const auth={isViewingAs:()=>viewer,api:async (url,opts)=>{
    actions.push({url,opts});
    if(url.includes('/vinculaciones?'))return {data:(data.shift()||(()=>({registros:[],hay_mas:false})))()};
    return {data:postResult||{estado:'SINCRONIZADO',creadas:1,retiradas:0}};
  }};
  const context={window:{ManttoAuth:auth,
      ManttoPermissions:{state:code=>({exists:true,efectivo:allowed.includes(code.split('.').pop())})},
      ManttoRouter:{getCurrent:()=>({route:currentRoute})},
      ManttoInstalacionesProgramacionPersonal:{reload:async()=>{refreshes++;return true;}},
      confirm:()=>{confirmations++;return true;}},
    document,module:{exports:{}},URLSearchParams,MutationObserver:class{
      constructor(callback){observer=callback;}
      observe(){}
    },queueMicrotask,console};
  vm.runInNewContext(moduleCode,context,{filename:file});
  function emit(event,detail={}){for(const cb of listeners.get(event)||[])cb({detail});}
  function click(action,id){
    const target={dataset:{ajAction:action,equipo:String(id)},disabled:false,
      closest(selector){return selector==='[data-aj-action]'?this:null;}};
    rootEvents.get('click')({target});
  }
  const flush=async()=>new Promise(resolve=>setTimeout(resolve,5));
  return{ui,panel,root,document,actions,emit,click,flush,
    get test(){return context.module.exports._test;},
    get active(){return !panel.hidden;},
    get refreshes(){return refreshes;},
    get confirmations(){return confirmations;},
    setType(v){type=v;context.window.ManttoInstalacionesAjustadoresUI.boot();},
    setView(v){view=v;context.window.ManttoInstalacionesAjustadoresUI.boot();},
    setRoute(v){currentRoute=v;context.window.ManttoInstalacionesAjustadoresUI.boot();},
    setViewer(v){viewer=v;emit('mantto:view-user-changed');context.window.ManttoInstalacionesAjustadoresUI.boot();},
    setAllowed(v){allowed=v;emit('mantto:permissions-updated');},
    reset(){context.window.ManttoInstalacionesAjustadoresUI.reset();},
    notifyShellRebuild(){observer?.();}
  };
}

test('F4 está integrado al loader existente con JS y CSS versionados',()=>{
  assert.match(loader,/instalaciones-programacion-personal-ajustadores\.js\?v=20261027-int9-ajustadores-fase4-v001/);
  assert.match(loader,/instalaciones-programacion-personal-ajustadores\.css\?v=20261027-int9-ajustadores-fase4-v001/);
  const entry=loader.match(/'instalaciones-programacion-personal':\{css:\[([\s\S]*?)\],js:\[([\s\S]*?)\]\}/);
  assert.ok(entry);
  assert.ok(entry[2].indexOf('instalaciones-programacion-personal.js')<
    entry[2].indexOf('instalaciones-programacion-personal-ajustadores.js'));
  assert.match(sw,/int9-aj-f4-v001/);
});

test('El widget no realiza consultas al entrar; se limita a calendario Ajustadores',()=>{
  const h=harness();assert.equal(h.active,true);
  assert.equal(h.actions.length,0);
  h.setType('MONTADOR');assert.equal(h.active,false);
  h.setType('AJUSTADOR');assert.equal(h.active,true);
  h.setView('personal');assert.equal(h.active,false);
  h.setView('calendario');assert.equal(h.active,true);
  h.setRoute('home');assert.equal(h.active,false);
});

test('Escape HTML previene inyecciones desde proyecto y ajustador',async()=>{
  const h=harness({pages:[{registros:[candidate(15,{proyecto:'<img src=x onerror=alert(1)>',
    ajustador_origen:'<script>alert(1)</script>'})],hay_mas:false}]});
  h.click('consultar');await h.flush();
  assert.match(h.ui.results.innerHTML,/&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(h.ui.results.innerHTML,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(h.ui.results.innerHTML,/<script>/);
});

test('No muestra botones mutables sin CREAR o en Visor',async()=>{
  for(const opts of [{allowed:['VER']},{viewer:true}]){
    const h=harness({...opts,pages:[{registros:[candidate()],hay_mas:false}]});
    h.click('consultar');await h.flush();
    assert.doesNotMatch(h.ui.results.innerHTML,/data-aj-action="reconciliar"|data-aj-action="asignar"/);
  }
});

test('CREAR sin DESACTIVAR usa asignación F2, no reconciliación F3',async()=>{
  const h=harness({allowed:['VER','CREAR'],pages:[{registros:[candidate()],hay_mas:false},
    {registros:[candidate()],hay_mas:false}],postResult:{estado:'ASIGNADO',creadas:[{id_asignacion:15}]}});
  h.click('consultar');await h.flush();
  assert.match(h.ui.results.innerHTML,/data-aj-action="asignar"/);
  assert.doesNotMatch(h.ui.results.innerHTML,/data-aj-action="reconciliar"/);
  h.click('asignar',15);await h.flush();
  assert.equal(h.refreshes,1);
  assert.equal(h.actions[1].opts.method,'POST');
  assert.equal(h.actions[1].url,'/api/instalaciones/programacion/ajustadores/asignaciones-automaticas');
  assert.equal(JSON.parse(h.actions[1].opts.body).id_ins_fl,15);
  assert.match(h.ui.status.textContent,/1 asignación/);
});

test('Reconciliación F3 recarga calendario de inmediato y vuelve a consultar estado',async()=>{
  const h=harness({pages:[{registros:[candidate()],hay_mas:false},
    {registros:[candidate()],hay_mas:false}],postResult:{estado:'SINCRONIZADO',creadas:1,retiradas:1}});
  h.click('consultar');await h.flush();
  assert.match(h.ui.results.innerHTML,/data-aj-action="reconciliar"/);
  h.click('reconciliar',15);await h.flush();
  assert.equal(h.confirmations,1);
  assert.equal(h.refreshes,1);
  assert.equal(h.actions.length,3);
  assert.equal(h.actions[1].url,'/api/instalaciones/programacion/ajustadores/reconciliar');
  assert.match(h.ui.status.textContent,/1 creada\(s\), 1 retirada\(s\)/);
});

test('Paginación incremental de 50 con cursor; sin búsqueda inicial masiva',async()=>{
  const rows=Array.from({length:50},(_,i)=>candidate(i+1));
  const h=harness({pages:[{registros:rows,hay_mas:true,siguiente_cursor:50},
    {registros:[candidate(51)],hay_mas:false,siguiente_cursor:null}]});
  h.click('consultar');await h.flush();
  assert.match(h.ui.footer.innerHTML,/Ver siguientes 50/);
  h.click('mas');await h.flush();
  assert.match(h.actions[1].url,/cursor=50/);
  assert.match(h.ui.status.textContent,/51 equipo\(s\)/);
});

test('Paginación falla cerrado con filas duplicadas o desordenadas',()=>{
  const h=harness();
  assert.throws(()=>h.test.validPage({registros:[candidate(7),candidate(7)],hay_mas:false}),/repetidas/);
  assert.throws(()=>h.test.validPage({registros:[candidate(6)],hay_mas:true,siguiente_cursor:900}),/Cursor/);
  assert.throws(()=>h.test.validPage({registros:'exceso',hay_mas:false}),/formato/);
});

test('Limpia registros al cambiar de usuario, permisos y sesión',async()=>{
  const h=harness({pages:[{registros:[candidate()],hay_mas:false}]});
  h.click('consultar');await h.flush();
  assert.match(h.ui.results.innerHTML,/Plaza Norte/);
  h.emit('mantto:session-expired');
  assert.equal(h.ui.results.innerHTML,'');
  assert.equal(h.ui.footer.innerHTML,'');
  assert.equal(h.active,false);
  h.setViewer(true);assert.equal(h.active,true); // solo lectura si VER efectivo
  h.setAllowed([]);assert.equal(h.active,false);
});

test('Formatea fechas en DD/MM/AAAA y mensajes sin prometer éxito ante conflictos',()=>{
  const h=harness();
  assert.equal(h.test.dateLabel('2026-10-27'),'27/10/2026');
  assert.equal(h.test.dateLabel('invalid'),'—');
  assert.match(h.test.resultMessage({estado:'CONFLICTO'}),/No se modificó/);
  assert.match(h.test.resultMessage({estado:'REQUIERE_REVISION',motivo:'AMBIGUO'}),/No se modificó/);
});

test('F4 no inserta flags de apagado de notificaciones ni endpoints sin permisos',()=>{
  assert.doesNotMatch(moduleCode,/INTEGRATION_AUTH_ENABLED\s*=|INTEGRATION_INS_FL_ID\s*=/);
  assert.doesNotMatch(moduleCode,/CREATE TABLE|ALTER TABLE|DELETE FROM/i);
  assert.match(moduleCode,/ManttoPermissions/);
});

test('F4 recupera visualización tras auth-ready sin reconsultar datos previos',async()=>{
  const h=harness({pages:[{registros:[candidate()],hay_mas:false}]});
  h.click('consultar');await h.flush();
  assert.match(h.ui.results.innerHTML,/Plaza Norte/);
  h.emit('mantto:auth-ready');
  assert.equal(h.active,true);
  assert.equal(h.ui.results.innerHTML,'');
  assert.equal(h.actions.length,1);
});

test('F4 presenta fallos de consulta sin datos inventados y sin habilitar acciones',async()=>{
  const h=harness({pages:[()=>{throw Error('Consulta rechazada');}]});
  h.click('consultar');await h.flush();
  assert.match(h.ui.status.textContent,/Consulta rechazada/);
  assert.doesNotMatch(h.ui.results.innerHTML,/data-aj-action="reconciliar"|data-aj-action="asignar"/);
  assert.equal(h.refreshes,0);
});

test('F4 no reporta conflictos como sincronización exitosa',async()=>{
  const h=harness({pages:[{registros:[candidate()],hay_mas:false},
    {registros:[candidate()],hay_mas:false}],postResult:{estado:'CONFLICTO',conflictos:[{id_personal:7,motivo:'TRASLAPE'}]}});
  h.click('consultar');await h.flush();
  h.click('reconciliar',15);await h.flush();
  assert.match(h.ui.status.textContent,/Conflicto de fechas detectado/);
  assert.equal(h.refreshes,1); // Se refresca lectura de fechas heredadas sin modificar asignaciones.
});

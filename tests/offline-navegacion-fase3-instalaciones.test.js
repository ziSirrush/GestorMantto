'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ROOT=path.resolve(__dirname,'..');
const SRC=fs.readFileSync(path.join(ROOT,'core/offline-instalaciones-proyectos.js'),'utf8');
const COR_SIG='f'.repeat(64),UN_SIG='a'.repeat(64);
const SAMPLE=[
  {id_ins_fl:1,id_proyecto:'PP-11',referencia_sitio:'A-1',proyecto:'OBRA ALFA',estado:'CDMX',activo:1,avance_mo:50},
  {id_ins_fl:2,id_proyecto:'PP-11',referencia_sitio:'A-2',proyecto:'OBRA ALFA',estado:'CDMX',activo:1,avance_mo:70},
  {id_ins_fl:3,id_proyecto:'PP-22',referencia_sitio:'B-1',proyecto:'OBRA BETA',estado:'PUEBLA',activo:0,avance_mo:100}
];
function fakeElement(id){
  const children=[],classes=new Set();
  return {id,children,textContent:'',innerHTML:'',dataset:{},_attrs:{},
    classList:{contains:x=>classes.has(x),toggle(x,yes){if(yes)classes.add(x);else classes.delete(x);}},
    addEventListener(){},setAttribute(){},appendChild(item){children.push(item);},
    prepend(item){children.unshift(item);},remove(){},
    querySelector:()=>null
  };
}
function fixture(options={}){
  let mode=options.mode||'OFFLINE',actor=11,effective=11,revoked=false,reads=0;
  let route=options.route||'instalaciones-proyectos';
  let payload=options.payload||null;
  const events={},originalCalls=[],httpCalls=[],httpWriteCalls=[],nodes=new Map();
  const view=fakeElement('view-instalaciones-proyectos');
  const detail=fakeElement('view-detalle');
  const status=fakeElement('py-aiven-status');
  const note=fakeElement('note');note.innerHTML='Datos desde Aiven';
  view.querySelector=selector=>selector==='#py-aiven-status'?status:
    selector==='.py-source-note-wrap .py-note'?note:null;
  view.dataset.pyReady='1';
  nodes.set(view.id,view);nodes.set(detail.id,detail);
  const ids={getActorUser:()=>({id_SB:actor}),getUser:()=>({id_SB:effective})};
  const catalog=[{code:'INSTALACIONES_PROYECTOS',domain:options.domain||'CORELLIAN',
    backup_status:'EXPORTADOR_COMPLETO',datasets:['instalaciones-proyectos'],
    scope:{scope_signature:options.signature||COR_SIG}}];
  const data=options.rows||SAMPLE;
  const storage={
    readCachedAccess(a,e){if(revoked||a!==actor||e!==effective)return null;
      return {permission_code:'GENERAL_MODO_OFFLINE_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
        actor_user_id:actor,effective_user_id:effective,catalog_modules:catalog};},
    async verifiedSnapshot(context,sig){reads++;
      assert.equal(context.domain,'CORELLIAN');assert.equal(context.dataset,'instalaciones-proyectos');
      assert.equal(context.actor_user_id,actor);assert.equal(context.effective_user_id,effective);
      if(options.badBlocks)throw new Error('Faltan bloques');
      return {schema_version:2,read_only:true,actor_user_id:actor,effective_user_id:effective,
        domain:'CORELLIAN',dataset:'instalaciones-proyectos',scope_signature:options.copySig||COR_SIG,
        downloaded_at:'2026-10-19T08:00:00.000Z',record_count:data.length,
        kind_counts:{proyectos:data.length},run_id:'generacion-13'};
    },
    async getSnapshot(){reads++;
      if(options.switchIdentityDuringRead){actor=44;effective=44;}
      return {schema_version:2,read_only:true,actor_user_id:options.staleIdentity?999:11,
        effective_user_id:11,domain:'CORELLIAN',dataset:'instalaciones-proyectos',
        scope_signature:options.copySig||COR_SIG,run_id:options.badRun?'otra-generacion':'generacion-13',
        payload:{data:{proyectos:options.invalidData?[]:data}}};
    }
  };
  const css=new Set(),body={classList:{toggle(x,on){if(on)css.add(x);else css.delete(x);}}};
  const doc={body,head:fakeElement('head'),getElementById(id){return nodes.get(id)||null;},
    createElement:fakeElement,addEventListener(name,cb){events[name]=cb;}};
  const win={location:{href:'https://bltnow.netlify.app/index.html'},
    MANTTO_API_BASE:'https://api.example.test',
    ManttoAuth:ids,ManttoOfflineStorage:storage,
    ManttoOfflineNavigation:{isOffline:()=>mode==='OFFLINE',canOpenRouteOffline:name=>
      name==='instalaciones-proyectos'&&!revoked,status:()=>mode,
      async check(){mode='OFFLINE';}},
    ManttoRouter:{getCurrent:()=>({route,payload})},
    ManttoHttp:{get:async(...args)=>{httpCalls.push(args);return {source:'aiven'};},
      request:async(...args)=>{httpWriteCalls.push(args);return {source:'aiven'};}},
    ManttoInstalacionesProyectos:{reload:async()=>{win.reloadCount=(win.reloadCount||0)+1;}}
  };
  win.fetch=async(input,init)=>{originalCalls.push({input,init});return new Response(JSON.stringify({ok:true,source:'aiven'}),{status:200});};
  vm.runInNewContext(SRC,{window:win,document:doc,Response,URL,Promise,Date,console,
    MutationObserver:class MutationObserver{observe(){}}});
  return {window:win,adapter:win.ManttoOfflineInstalacionesProyectos,events,view,status,note,doc,
    originalCalls,httpCalls,httpWriteCalls,storage,css,
    get reads(){return reads;},route(v,p=null){route=v;payload=p;},mode(v){mode=v;},
    revoke(){revoked=true;},switchIdentity(a,e=a){actor=a;effective=e;}};
}

const INS_URL='https://api.example.test/api/ins-fl?limit=5000';
test('F3: Proyectos originales leen universo CORELLIAN completo desde IndexedDB',async()=>{
  const f=fixture();const response=await f.window.fetch(INS_URL);
  assert.equal(response.status,200);
  const json=await response.json();
  assert.equal(json.source,'indexeddb');assert.equal(json.offline,true);
  assert.deepEqual(Array.from(json.data.map(r=>r.id_proyecto)),['PP-11','PP-11','PP-22']);
  assert.equal(f.originalCalls.length,0);assert.equal(f.reads,2);
});
test('F3: limit=5000 del modulo online no recorta el historial offline',async()=>{
  const rows=Array.from({length:5001},(_,i)=>({id_ins_fl:i+1,id_proyecto:'PP-1',referencia_sitio:String(i)}));
  const f=fixture({rows});const result=await(await f.window.fetch(INS_URL)).json();
  assert.equal(result.data.length,5001);assert.equal(f.originalCalls.length,0);
});
test('F3: en linea la lectura original nunca se intercepta',async()=>{
  const f=fixture({mode:'ONLINE'});const response=await f.window.fetch(INS_URL);
  assert.equal((await response.json()).source,'aiven');assert.equal(f.reads,0);
  assert.equal(f.originalCalls.length,1);
  assert.equal((await f.window.ManttoHttp.get('/api/ins-fl?limit=5000')).source,'aiven');
});
test('F3: el expediente unificado nativo obtiene filas CORELLIAN con ManttoHttp',async()=>{
  const f=fixture({route:'detalle',payload:{type:'proyecto',id:'PP-11',source:'instalaciones-proyectos'}});
  const reply=await f.window.ManttoHttp.get('/api/ins-fl?limit=5000');
  assert.equal(reply.data.length,3);assert.equal(reply.source,'indexeddb');
  assert.equal(f.httpCalls.length,0);
});
test('F3: las consultas no respaldadas fallan explicitamente; no se simulan fotografias',async()=>{
  const f=fixture();
  const photos=await f.window.fetch('https://api.example.test/api/ins-fl/proyectos/fotografias?limit=5000');
  const comments=await f.window.fetch('https://api.example.test/api/instalaciones/comentarios-junta');
  assert.equal(photos.status,503);assert.equal(comments.status,503);
  assert.equal((await photos.json()).code,'OFFLINE_COR_DATA_NOT_BACKED');
  assert.equal(f.reads,0);assert.equal(f.originalCalls.length,0);
});
test('F3: en detalle no filtra ni fabrica datos UNITED o documentos',async()=>{
  const f=fixture({route:'detalle',payload:{type:'proyecto',id:'PP-11',source:'instalaciones-proyectos'}});
  await assert.rejects(f.window.ManttoHttp.get('/api/portafolio/proyectos/detalle/OBRA%20ALFA'),e=>
    e.status===503&&e.code==='OFFLINE_COR_DATA_NOT_BACKED');
  await assert.rejects(f.window.ManttoHttp.get('/api/instalaciones/bitacora/PP-11'),e=>e.status===503);
  assert.equal(f.originalCalls.length,0);assert.equal(f.reads,0);
});
test('F3: las escrituras POST/PATCH no salen a Aiven ni se confirman localmente',async()=>{
  const f=fixture();
  const post=await f.window.fetch('https://api.example.test/api/instalaciones/comentarios-junta',
    {method:'POST',body:'{}'});
  const patch=await f.window.fetch('https://api.example.test/api/ins-fl/proyectos/fotografias/PP-11/principal',
    {method:'PATCH',body:'{}'});
  assert.equal(post.status,503);assert.equal(patch.status,503);
  assert.equal((await post.json()).code,'OFFLINE_COR_WRITE_DISABLED');
  assert.equal(f.originalCalls.length,0);
});
test('F3: ManttoHttp.request no puede confirmar mutaciones sin conexion',async()=>{
  const f=fixture();
  await assert.rejects(f.window.ManttoHttp.request('/api/instalaciones/comentarios-junta',
    {method:'POST',body:'{}'}),e=>e.status===503&&e.code==='OFFLINE_COR_WRITE_DISABLED');
  assert.equal(f.httpWriteCalls.length,0);
  f.mode('ONLINE');
  const online=await f.window.ManttoHttp.request('/api/instalaciones/comentarios-junta',
    {method:'POST',body:'{}'});
  assert.equal(online.source,'aiven');assert.equal(f.httpWriteCalls.length,1);
});
test('F3: firma territorial, bloques, integridad y generacion incorrectas fallan cerrado',async()=>{
  for(const setting of [{signature:UN_SIG},{copySig:UN_SIG},{badBlocks:true},
    {badRun:true},{invalidData:true},{staleIdentity:true},{domain:'UNITED'}]){
    const f=fixture(setting);const response=await f.window.fetch(INS_URL);
    assert.equal(response.status,403,JSON.stringify(setting));assert.equal(f.originalCalls.length,0);
    assert.notEqual((await response.json()).source,'indexeddb');
  }
});
test('F3: cambio de actor durante la lectura invalida el resultado',async()=>{
  const f=fixture({switchIdentityDuringRead:true});const response=await f.window.fetch(INS_URL);
  assert.equal(response.status,403);assert.equal(f.originalCalls.length,0);
});
test('F3: revocar el permiso impide todo acceso aun con copia presente',async()=>{
  const f=fixture();f.revoke();const response=await f.window.fetch(INS_URL);
  assert.equal(response.status,403);assert.equal(f.reads,0);
});
test('F3: no intercepta otras pantallas ni otros origenes ni la salud real del servidor',async()=>{
  const f=fixture();f.route('usuarios');
  await f.window.fetch(INS_URL);
  f.route('instalaciones-proyectos');
  await f.window.fetch('https://other.example.test/api/ins-fl');
  await f.window.fetch('https://api.example.test/api/health');
  await f.window.fetch('https://api.example.test/api/offline/capabilities');
  assert.equal(f.originalCalls.length,4);assert.equal(f.reads,0);
});
test('F3: navegacion CHECKING espera Fase 1 antes de elegir fuente',async()=>{
  const f=fixture({mode:'CHECKING'});const response=await f.window.fetch(INS_URL);
  assert.equal((await response.json()).source,'indexeddb');assert.equal(f.originalCalls.length,0);
});
test('F3: cambiar de fuente recarga la misma pantalla, sin cambiar ruta',async()=>{
  const f=fixture();f.adapter.onConnectionChanged();await Promise.resolve();
  assert.equal(f.window.reloadCount,1);
  f.mode('ONLINE');f.adapter.onConnectionChanged();await Promise.resolve();
  assert.equal(f.window.reloadCount,2);
});
test('F3: al volver al modulo montado offline actualiza datos en su vista normal',async()=>{
  const f=fixture();f.adapter.onNavigation({detail:{route:'instalaciones-proyectos'}});
  await Promise.resolve();assert.equal(f.window.reloadCount,1);
});
test('F3: sesion nueva vacia la vista montada con datos de otro usuario',async()=>{
  const f=fixture();f.view.innerHTML='informacion reservada';
  f.events['mantto:logout']();await Promise.resolve();
  assert.equal(f.view.innerHTML,'');assert.equal(f.view.dataset.pyReady,'0');
});
test('F3: perdida del permiso aun en modo offline elimina los datos montados',async()=>{
  const f=fixture();f.view.innerHTML='datos previos de instalaciones';
  f.adapter.onConnectionChanged();f.revoke();f.adapter.onConnectionChanged();
  assert.equal(f.view.innerHTML,'');assert.equal(f.view.dataset.pyReady,'0');
});
test('F3: etiqueta offline dice copia local, nunca Aiven ni fotos confirmadas',async()=>{
  const f=fixture();await f.window.fetch(INS_URL);await Promise.resolve();
  assert.match(f.status.textContent,/Copia local/);
  assert.match(f.note.textContent,/fotografias|fotografías/i);
  assert.equal(f.view.classList.contains('bltnow-offline-cor'),true);
});
test('F3: SW precachea JS/CSS/plantilla original y nunca cachea API',()=>{
  const src=fs.readFileSync(path.join(ROOT,'service-worker.js'),'utf8');
  const self={location:{origin:'https://app.test',href:'https://app.test/service-worker.js'},
    addEventListener(){},clients:{}};
  const s={self,clients:self.clients,URL,URLSearchParams,Promise,Date,console,
    setTimeout(){return 1;},clearTimeout(){},MessageChannel:class{}};
  vm.runInNewContext(src,s);
  for(const file of [
    'core/offline-instalaciones-proyectos.js',
    'modules/instalaciones-proyectos/instalaciones-proyectos.js',
    'modules/instalaciones-proyectos/instalaciones-proyectos.css',
    'modules/instalaciones-proyectos/instalaciones-proyectos.html'
  ]){
    assert.equal(s.isStaticShellRequest({method:'GET',url:'https://app.test/'+file}),true,file);
    assert.ok(src.includes("'./"+file+"'"));
  }
  assert.equal(s.isStaticShellRequest({method:'GET',url:'https://app.test/api/ins-fl?limit=5000'}),false);
  assert.equal(s.isStaticShellRequest({method:'GET',url:'https://app.test/modules/other/secret.html'}),false);
});
test('F3: conserva cargadores, rutas y fuentes oficiales sin editar modulo productivo',()=>{
  const nav=fs.readFileSync(path.join(ROOT,'core/offline-navigation.js'),'utf8');
  assert.match(nav,/installInstalacionesOfflineAdapter\(\)/);
  assert.match(nav,/installResumenOfflineAdapter\(\)/);
  assert.match(nav,/resumen/);assert.match(nav,/instalaciones-proyectos/);
  const src=fs.readFileSync(path.join(ROOT,'core/offline-instalaciones-proyectos.js'),'utf8');
  assert.doesNotMatch(src,/\.\.\/\.\.\/.*backend|ALTER TABLE|CREATE TABLE/);
});

test('F5 seguridad: boton de escritura en proyecto montado se bloquea tras revocacion',()=>{
  const f=fixture();f.revoke();
  let prevented=false,stopped=false;
  f.events.click({type:'click',target:{closest:()=>({id:'py-lightbox-principal'})},
    preventDefault(){prevented=true;},stopImmediatePropagation(){stopped=true;}});
  assert.equal(prevented,true);assert.equal(stopped,true);
  assert.equal(f.originalCalls.length,0);
});

test('F5 seguridad: ninguna restriccion offline altera los botones online',()=>{
  const f=fixture({mode:'ONLINE'});let blocked=false;
  f.events.click({type:'click',target:{closest:()=>({id:'py-lightbox-principal'})},
    preventDefault(){blocked=true;},stopImmediatePropagation(){}});
  assert.equal(blocked,false);
});

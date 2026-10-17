'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname,'..');
const SOURCE = fs.readFileSync(path.join(ROOT,'modules/ventas-fotos-mapa/ventas-fotos-mapa.js'),'utf8');
const VERSION = '20261017-int10-b3-seguridad-v001';

const coreRow = (id=51) => ({
  id_photo:id, 'ID Proyecto':'COR-51', Proyecto:'Proyecto autorizado', Estado:'JAL',
  'FOTO BLT':'https://example.test/core-51.jpg', foto_principal:'foto_blt_1'
});
const unitedRow = () => ({
  id_photo:91, proyecto_united:'UNI-91', proyecto_corellian:'Proyecto autorizado',
  estado:'Jalisco', foto_1:'https://example.test/united-91.jpg', foto_principal:'foto_1'
});
const photoPage = () => ({
  ok:true,limit:500,offset:0,data:{corellian:[coreRow()],united:[unitedRow()]}
});
function response(payload,status=200){
  return {ok:status>=200&&status<300,status,text:async()=>JSON.stringify(payload)};
}
function forbidden(status){
  return {ok:false,status,text:async()=>'<html>Access denied</html>'};
}
function defer(){
  let resolve;
  let reject;
  const promise=new Promise((res,rej)=>{resolve=res;reject=rej;});
  return {promise,resolve,reject};
}
const microtasks = async () => {for(let n=0;n<12;n++)await Promise.resolve();};
function harness(){
  const handlers=new Map(), elements=new Map(), calls=[], warnings=[];
  let generalHandler = async () => response(photoPage());
  let sideHandler = async url => response({
    ok:true,limit:500,offset:Number(url.searchParams.get('offset')||0),
    data:url.pathname.endsWith('/navegacion-corellian') || url.pathname.endsWith('/fotografias-gestion')
      ?[{'ID Proyecto':'COR-51',id_ppns:'COR-51',Proyecto:'Proyecto autorizado'}]
      :[{proyecto_united:'UNI-91'}]
  });
  let permissionState=()=>({exists:true,efectivo:true});
  let resets=0,closes=0;
  const element = id=>({
    id,innerHTML:'',textContent:'',value:'',hidden:true,dataset:{},
    querySelectorAll:()=>[],querySelector:()=>null,addEventListener:()=>{}
  });
  for(const id of ['vfm-galeria','vfm-kpis','vfm-estado','vfm-buscar','vfm-aiven-status',
    'view-ventas-fotos-mapa','mg-photo-lightbox']) elements.set(id,element(id));
  const view=elements.get('view-ventas-fotos-mapa');
  view.dataset.ready='1';
  const lightbox=elements.get('mg-photo-lightbox');
  lightbox.hidden=true;
  lightbox.querySelector = selector => selector==='.mg-photo-close'
    ?{click(){closes++;lightbox.hidden=true;}}
    :null;
  const document={
    getElementById:id=>elements.get(id)||null,
    addEventListener:(name,cb)=>handlers.set(name,cb)
  };
  const window={
    MANTTO_API_BASE:'https://api.example.test',
    ManttoAuth:{getUser:()=>({id_SB:51}),authHeaders:()=>({Authorization:'Bearer TEST'})},
    ManttoPermissions:{state:(code)=>permissionState(code)},
    ManttoRouter:{getCurrent:()=>({route:'ventas-fotos-mapa'}),reset:()=>{resets++;}}
  };
  const instrumented=SOURCE.replace('window.ManttoVentasFotosMapa=api;',
    `window.__b3={load,refresh:refrescarProyectoFotografiasInt10,state:()=>({
      confirmed:int10CatalogoConfirmadoEnSesion,
      core:int10CatalogoCore.length,united:int10CatalogoUnited.length,
      projects:proyectos.map(p=>({id:p.id,count:carouselFotos(p).length,
        manage:p.canManageCorellian===true,navCor:p.canOpenCorellian===true,
        navUni:p.canOpenUnited===true}))
    })};window.ManttoVentasFotosMapa=api;`
  );
  assert.notEqual(instrumented,SOURCE,'Falta instrumentación aislada de B3');
  const fetchMock=async input=>{
    const url=new URL(input); calls.push(url.pathname+url.search);
    return url.pathname.endsWith('/catalogo-general/fotografias')
      ?generalHandler(url):sideHandler(url);
  };
  vm.runInNewContext(instrumented,{
    window,document,fetch:fetchMock,URL,
    setTimeout:(cb)=>{cb();return 1;},
    console:{warn:(...args)=>warnings.push(args)}
  },{filename:'ventas-fotos-mapa.js'});
  return {
    load:window.__b3.load,
    refresh:window.__b3.refresh,
    state:()=>JSON.parse(JSON.stringify(window.__b3.state())),
    setGeneral:cb=>{generalHandler=cb;},
    setSide:cb=>{sideHandler=cb;},
    setPermission:cb=>{permissionState=cb;},
    removePermissions:()=>{window.ManttoPermissions=null;},
    emit:name=>{assert.ok(handlers.has(name),'Evento inexistente: '+name);handlers.get(name)();},
    dom:id=>elements.get(id),
    openLightbox:()=>{lightbox.hidden=false;},
    calls,warnings,
    get closes(){return closes;},get resets(){return resets;}
  };
}

test('B3 ante 401 de CUALQUIER puerta de navegación cancela catálogo general aunque las fotos respondan 200',async()=>{
  const h=harness();
  await h.load();
  assert.equal(h.state().confirmed,true);
  h.setSide(async u=>u.pathname.endsWith('/navegacion-united')
    ?forbidden(401)
    :response({ok:true,limit:500,offset:0,data:[]}));
  await h.load();
  assert.equal(h.state().confirmed,false);
  assert.equal(h.state().core,0);
  assert.equal(h.state().united,0);
  assert.equal(h.state().projects.length,0);
  assert.match(h.dom('vfm-aiven-status').textContent,/Sesión requerida/);
});

test('B3 403 de guard independiente no invalida lectura GENERAL, pero niega accesos',async()=>{
  const h=harness();
  h.setSide(async u=>u.pathname.endsWith('/fotografias-gestion')
    ?forbidden(403)
    :response({ok:true,limit:500,offset:0,data:[]}));
  await h.load();
  assert.equal(h.state().core,1);
  assert.equal(h.state().confirmed,true);
  assert.equal(h.state().projects[0].manage,false);
  assert.equal(h.state().projects[0].navCor,false);
});

test('B3 403 del catálogo invalida referencias de refrescos selectivos en vuelo',async()=>{
  const h=harness();
  await h.load();
  const pending=defer();
  h.setGeneral(async u=>u.searchParams.has('core_project')
    ?pending.promise:forbidden(403));
  const refreshing=h.refresh('COR-51');
  await microtasks();
  const requestsBefore=h.calls.filter(x=>x.includes('core_project=COR-51')).length;
  assert.equal(requestsBefore,1,'Refresco selectivo debe estar pendiente');
  h.openLightbox();
  await h.load();
  assert.equal(h.state().confirmed,false);
  assert.equal(h.state().projects.length,0);
  assert.ok(h.closes>=1,'Un 403 del catálogo debe cerrar el lightbox');
  pending.resolve(response({ok:true,limit:5000,offset:0,filters:{core_project:'COR-51'},
    data:{corellian:[{...coreRow(), 'FOTO BLT 2':'https://example.test/ghost.jpg'}],united:[]}}));
  await refreshing;
  assert.equal(h.state().core,0,'La lectura antigua no puede restaurar fotografias');
  assert.equal(h.state().projects.length,0);
  assert.match(h.dom('vfm-aiven-status').textContent,/Sin acceso/);
});

test('B3 401 en refresco selectivo borra memoria y redirige si el módulo estaba abierto',async()=>{
  const h=harness();await h.load();
  h.openLightbox();
  h.setGeneral(async u=>u.searchParams.has('core_project')
    ?forbidden(401):response(photoPage()));
  await h.refresh('COR-51');
  assert.equal(h.state().confirmed,false);
  assert.equal(h.state().core,0);
  assert.equal(h.dom('view-ventas-fotos-mapa').dataset.ready,'0');
  assert.equal(h.dom('view-ventas-fotos-mapa').innerHTML,'');
  assert.equal(h.resets,1);
  assert.equal(h.closes,1);
});

test('B3 403 en refresco selectivo tampoco permite mostrar respaldo antiguo',async()=>{
  const h=harness();await h.load();
  h.setGeneral(async u=>u.searchParams.has('core_project')
    ?forbidden(403):response(photoPage()));
  await h.refresh('COR-51');
  assert.equal(h.state().confirmed,false);
  assert.equal(h.state().projects.length,0);
  assert.equal(h.resets,1);
});

test('B3 revocación de permiso GENERAL vacía catálogo, cierra carrusel y vuelve a Inicio',async()=>{
  const h=harness();await h.load();h.openLightbox();
  h.setPermission(()=>({exists:true,efectivo:false}));
  h.emit('mantto:permissions-updated');
  assert.equal(h.state().confirmed,false);
  assert.equal(h.state().projects.length,0);
  assert.equal(h.resets,1);
  assert.equal(h.closes,1);
  assert.equal(h.dom('view-ventas-fotos-mapa').dataset.ready,'0');
});

test('B3 permission state indeterminado o fallando también cierra acceso (fail closed)',async t=>{
  for(const mode of ['sin API','API lanza error','objeto sin estado','permiso no existente']){
    await t.test(mode,async()=>{
      const h=harness();await h.load();
      if(mode==='sin API')h.removePermissions();
      if(mode==='API lanza error')h.setPermission(()=>{throw new Error('sin permisos');});
      if(mode==='objeto sin estado')h.setPermission(()=>null);
      if(mode==='permiso no existente')h.setPermission(()=>({exists:false,efectivo:true}));
      h.emit('mantto:permissions-updated');
      assert.equal(h.state().confirmed,false);
      assert.equal(h.state().projects.length,0);
      assert.equal(h.resets,1);
    });
  }
});

test('B3 permiso GENERAL aún vigente congela edición anterior y revalida guard sin acceso gestor',async()=>{
  const h=harness();await h.load();
  assert.equal(h.state().projects[0].manage,true);
  h.openLightbox();
  const pending=defer();
  h.setGeneral(async()=>pending.promise);
  h.setSide(async u=>u.pathname.endsWith('/fotografias-gestion')
    ?forbidden(403)
    :response({ok:true,limit:500,offset:0,data:
      u.pathname.endsWith('/navegacion-corellian')?[{'ID Proyecto':'COR-51'}]:[]}));
  h.emit('mantto:permissions-updated');
  assert.equal(h.state().projects[0].manage,false,'No reutilizar gestor anterior mientras se espera');
  assert.equal(h.state().projects[0].navCor,false,'No reutilizar navegación anterior');
  assert.equal(h.closes,1,'Cerrar carrusel que contenía acciones editables');
  await microtasks();
  pending.resolve(response(photoPage()));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.state().confirmed,true);
  assert.equal(h.state().projects[0].manage,false,'El guard ahora denegado no autoriza edición');
  assert.equal(h.state().projects[0].navCor,true,'El guard separado sí puede reautorizar navegación');
  assert.equal(h.resets,0,'No expulsar del catálogo GENERAL si sigue autorizado');
});

test('B3 sesión/visor invalida catálogo mientras una carga GET anterior sigue pendiente',async t=>{
  for(const event of ['mantto:session-expired','mantto:view-user-changed','mantto:auth-ready']){
    await t.test(event,async()=>{
      const h=harness();
      const pending=defer();h.setGeneral(async()=>pending.promise);
      const loading=h.load();
      await microtasks();
      h.emit(event);
      pending.resolve(response(photoPage()));
      await loading;
      assert.equal(h.state().confirmed,false);
      assert.equal(h.state().core,0);
      assert.equal(h.state().projects.length,0);
      assert.equal(h.dom('view-ventas-fotos-mapa').dataset.ready,'0');
    });
  }
});

test('B3 no incluye SQL y conserva versionado puntual de JS/loader con B1+B2',()=>{
  const loader=fs.readFileSync(path.join(ROOT,'core/module-loader.js'),'utf8');
  const index=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
  assert.match(loader,new RegExp('ventas-fotos-mapa\\.js\\?v='+VERSION));
  assert.match(index,new RegExp('core/module-loader\\.js\\?v='+VERSION));
  assert.match(SOURCE,/const INT10_REINTENTOS_B2 = 2;/);
  assert.match(SOURCE,/const MAX_FOTOS_CARRUSEL=MAX_FOTOS_ORIGEN\*2;/);
  assert.match(SOURCE,/int10CatalogoConfirmadoEnSesion/);
  assert.ok(!SOURCE.includes('localStorage.setItem('));
  assert.ok(!SOURCE.includes('sessionStorage.setItem('));
});

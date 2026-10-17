'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'modules/ventas-fotos-mapa/ventas-fotos-mapa.js'), 'utf8');

function makeHarness() {
  let mode = 'success';
  let permissionEffective = true;
  const calls = [];
  const warnings = [];
  const events = new Map();
  const elements = new Map();
  const createElement = id => ({
    id,
    innerHTML:'',
    textContent:'',
    value:'',
    hidden:true,
    dataset:{},
    querySelectorAll:() => [],
    querySelector:() => null,
    addEventListener:() => {}
  });
  for (const id of ['vfm-galeria','vfm-kpis','vfm-estado','vfm-buscar','vfm-aiven-status','view-ventas-fotos-mapa','mg-photo-lightbox']) {
    elements.set(id,createElement(id));
  }
  const rowCore = {
    id_photo:123, 'ID Proyecto':'COR-123', Proyecto:'Proyecto B1', Estado:'JAL',
    'FOTO BLT':'https://static.example.test/core.jpg', foto_principal:'foto_blt_1'
  };
  const rowUnited = {
    id_photo:456, proyecto_united:'Proyecto Mantto B1', proyecto_corellian:'Proyecto B1',
    estado:'Jalisco', foto_1:'https://static.example.test/united.jpg', foto_principal:'foto_1'
  };
  const success = {
    ok:true, limit:500, offset:0,
    data:{corellian:[rowCore],united:[rowUnited]}
  };

  const fetchMock = async (url) => {
    const u=new URL(url);
    calls.push(u.pathname+u.search);
    if (u.pathname.endsWith('/catalogo-general/fotografias')) {
      if (mode==='offline') throw new TypeError('Network unavailable');
      if (mode==='server-error') return {ok:false,status:500,text:async()=>JSON.stringify({ok:false,message:'Service unavailable'})};
      if (mode==='forbidden-html') return {ok:false,status:403,text:async()=>'<html>Forbidden</html>'};
      if (mode==='unauthenticated') return {ok:false,status:401,text:async()=>JSON.stringify({ok:false,message:'Session expired'})};
      if (mode==='broken-pagination') return {ok:true,status:200,text:async()=>JSON.stringify({ok:true,data:{corellian:[rowCore],united:[]}})};
      if (mode==='partial-500') {
        const offset=Number(u.searchParams.get('offset'));
        if (offset===0){
          const fullPage=Array.from({length:500},(_,i)=>({...rowCore,id_photo:i+1000,'ID Proyecto':'COR-'+i,Proyecto:'P-'+i}));
          return {ok:true,status:200,text:async()=>JSON.stringify({ok:true,limit:500,offset,data:{corellian:fullPage,united:[]}})};
        }
        return {ok:false,status:500,text:async()=>JSON.stringify({ok:false,message:'Error pagina 2'})};
      }
      return {ok:true,status:200,text:async()=>JSON.stringify(success)};
    }
    const allowed = u.pathname.endsWith('/navegacion-corellian')
      || u.pathname.endsWith('/fotografias-gestion');
    return {ok:true,status:200,text:async()=>JSON.stringify({ok:true,limit:500,offset:Number(u.searchParams.get('offset')||0),data:allowed?[{'ID Proyecto':'COR-123',Proyecto:'Proyecto B1'}]:[]})};
  };

  const doc = {
    getElementById: id=>elements.get(id)||null,
    addEventListener: (event,cb)=>{events.set(event,cb);}
  };
  const win = {
    MANTTO_API_BASE:'https://api.example.test',
    ManttoAuth:{getUser:()=>({id_SB:101}),authHeaders:()=>({Authorization:'Bearer DEMO'})},
    ManttoPermissions:{state:()=>({exists:true,efectivo:permissionEffective})}
  };
  const exposed = SOURCE.replace(
    'window.ManttoVentasFotosMapa=api;',
    `window.__int10B1Test = { load, state:()=>({
      confirmado:int10CatalogoConfirmadoEnSesion,
      core:int10CatalogoCore.length,
      united:int10CatalogoUnited.length,
      projects:proyectos.map(p=>({
        id:p.id,
        count:carouselFotos(p).length,
        navCor:p.canOpenCorellian,
        navUni:p.canOpenUnited,
        manageCor:p.canManageCorellian
      }))
    }) };
    window.ManttoVentasFotosMapa=api;`
  );
  assert.notEqual(exposed,SOURCE,'No se insertó el gancho exclusivo de pruebas');
  vm.runInNewContext(exposed, {
    window:win,
    document:doc,
    fetch:fetchMock,
    URL,
    setTimeout:(cb)=>{cb();return 0;},
    console:{warn:(...args)=>warnings.push(args)}
  }, {filename:'ventas-fotos-mapa.js'});
  return {
    setMode:(next)=>{mode=next;},
    revokePermission:()=>{permissionEffective=false;},
    load:win.__int10B1Test.load,
    state:()=>JSON.parse(JSON.stringify(win.__int10B1Test.state())),
    dom:id=>elements.get(id),
    emit:(name)=>{assert.ok(events.has(name),`Evento no registrado: ${name}`);events.get(name)();},
    calls,
    warnings
  };
}

test('B1 conserva el último catálogo completo tras error temporal de conexión, en modo solo lectura',async()=>{
  const h=makeHarness();
  await h.load();
  assert.equal(h.state().confirmado,true);
  assert.equal(h.state().projects[0].count,2,'Se conserva el carrusel 7+7 (2 fotos disponibles)');
  assert.equal(h.state().projects[0].manageCor,true);
  assert.match(h.dom('vfm-galeria').innerHTML,/Proyecto B1/);
  h.setMode('offline');
  await h.load();
  assert.equal(h.state().confirmado,true);
  assert.equal(h.state().core,1);
  assert.equal(h.state().united,1);
  assert.equal(h.state().projects[0].count,2);
  assert.equal(h.state().projects[0].manageCor,false,'No conserva facultades sin nueva verificación');
  assert.equal(h.state().projects[0].navCor,false);
  assert.equal(h.state().projects[0].navUni,false);
  assert.match(h.dom('vfm-aiven-status').textContent,/últimos resultados válidos \(solo lectura\)/);
  assert.match(h.dom('vfm-galeria').innerHTML,/Proyecto B1/);
});

test('B1 conserva catálogo anterior si falla la segunda página y no presenta 500 resultados parciales',async()=>{
  const h=makeHarness();
  await h.load();
  h.setMode('partial-500');
  await h.load();
  assert.equal(h.state().projects.length,1);
  assert.equal(h.state().core,1);
  assert.match(h.dom('vfm-galeria').innerHTML,/Proyecto B1/);
  assert.ok(h.calls.some(x=>x.includes('/catalogo-general/fotografias?limit=500&offset=500')));
});

test('B1 conserva último válido si backend devuelve contrato incompatible y luego recupera carga correcta',async()=>{
  const h=makeHarness();
  await h.load();
  h.setMode('broken-pagination');
  await h.load();
  assert.equal(h.state().core,1);
  assert.equal(h.state().projects[0].manageCor,false);
  h.setMode('success');
  await h.load();
  assert.equal(h.state().projects[0].manageCor,true);
  assert.match(h.dom('vfm-aiven-status').textContent,/Catálogo General actualizado/);
});

test('B1 nunca inventa respaldo si la primera carga falla',async()=>{
  const h=makeHarness();
  h.setMode('server-error');
  await h.load();
  assert.equal(h.state().confirmado,false);
  assert.equal(h.state().core,0);
  assert.equal(h.state().united,0);
  assert.doesNotMatch(h.dom('vfm-galeria').innerHTML,/Proyecto B1/);
  assert.match(h.dom('vfm-aiven-status').textContent,/No fue posible cargar/);
});

test('B1 ante HTTP 403 aun con HTML no JSON borra fotografías previas y bloquea acceso',async()=>{
  const h=makeHarness();
  await h.load();
  h.setMode('forbidden-html');
  await h.load();
  assert.equal(h.state().confirmado,false);
  assert.equal(h.state().projects.length,0);
  assert.equal(h.state().core,0);
  assert.equal(h.state().united,0);
  assert.doesNotMatch(h.dom('vfm-galeria').innerHTML,/Proyecto B1/);
  assert.match(h.dom('vfm-aiven-status').textContent,/Sin acceso/);
});

test('B1 ante HTTP 401 no conserva datos de una sesión inválida',async()=>{
  const h=makeHarness();
  await h.load();
  h.setMode('unauthenticated');
  await h.load();
  assert.equal(h.state().projects.length,0);
  assert.equal(h.state().confirmado,false);
  assert.match(h.dom('vfm-aiven-status').textContent,/Sesión requerida/);
});

test('B1 invalida completamente cache en memoria con sesión, Visor y revocación de permiso',async()=>{
  for (const evento of ['mantto:session-expired','mantto:view-user-changed','mantto:auth-ready','mantto:permissions-updated']){
    const h=makeHarness();
    await h.load();
    assert.equal(h.state().confirmado,true);
    if(evento==='mantto:permissions-updated')h.revokePermission();
    h.emit(evento);
    assert.equal(h.state().confirmado,false,evento);
    assert.equal(h.state().core,0,evento);
    assert.equal(h.state().united,0,evento);
    assert.equal(h.state().projects.length,0,evento);
    assert.equal(h.dom('view-ventas-fotos-mapa').dataset.ready,'0');
  }
});

test('B1 distribuye únicamente los recursos frontend y sus versiones para invalidar cache',()=>{
  const loader=fs.readFileSync(path.join(ROOT,'core/module-loader.js'),'utf8');
  const index=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
  const ver='20261017-int10-b3-seguridad-v001';
  assert.ok(loader.includes(`ventas-fotos-mapa.js?v=${ver}`));
  assert.ok(index.includes(`core/module-loader.js?v=${ver}`));
  assert.ok(!SOURCE.includes('localStorage.setItem('));
  assert.ok(!SOURCE.includes('sessionStorage.setItem('));
  assert.ok(SOURCE.includes('int10CatalogoConfirmadoEnSesion=false;'));
  assert.ok(SOURCE.includes('status!==401&&status!==403'));
});

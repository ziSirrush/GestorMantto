'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(ROOT,'modules/ventas-fotos-mapa/ventas-fotos-mapa.js'),'utf8');

function coreRow(id=1,project='COR-1'){
  return {id_photo:id,'ID Proyecto':project,Proyecto:'Proyecto B2',Estado:'JAL',
    'FOTO BLT':`https://foto.example.test/core-${id}.jpg`,foto_principal:'foto_blt_1'};
}
function unitedRow(id=1,project='U-1'){
  return {id_photo:id,proyecto_united:project,proyecto_corellian:'Proyecto B2',
    estado:'Jalisco',foto_1:`https://foto.example.test/united-${id}.jpg`,foto_principal:'foto_1'};
}
function page(offset=0,corellian=[coreRow()],united=[unitedRow()]){
  return {ok:true,limit:500,offset,data:{corellian,united}};
}
function ok(payload){return {ok:true,status:200,text:async()=>JSON.stringify(payload)};}
function bad(status){return {ok:false,status,text:async()=>JSON.stringify({ok:false,message:'Error '+status})};}
function badHtml(status){return {ok:false,status,text:async()=>'<html>Gateway Error</html>'};}

function harness(options={}){
  const events=new Map(),elements=new Map(),calls=[],timers=[],warnings=[];
  let photoHandler=async u=>ok(page(Number(u.searchParams.get('offset'))));
  let navigationHandler=async u=>ok({ok:true,limit:500,offset:Number(u.searchParams.get('offset')||0),
    data:u.pathname.endsWith('/navegacion-corellian')||u.pathname.endsWith('/fotografias-gestion')
      ?[{'ID Proyecto':'COR-1',id_ppns:'COR-1',Proyecto:'Proyecto B2'}]:[]});
  let manualTimers=options.manualTimers===true;
  const element=id=>({id,innerHTML:'',textContent:'',value:'',hidden:true,dataset:{},
    querySelectorAll:()=>[],querySelector:()=>null,addEventListener:()=>{}});
  for(const id of ['vfm-galeria','vfm-kpis','vfm-estado','vfm-buscar','vfm-aiven-status','view-ventas-fotos-mapa','mg-photo-lightbox'])elements.set(id,element(id));
  const doc={getElementById:id=>elements.get(id)||null,addEventListener:(name,cb)=>events.set(name,cb)};
  const win={MANTTO_API_BASE:'https://api.example.test',
    ManttoAuth:{getUser:()=>({id_SB:101}),authHeaders:()=>({Authorization:'Bearer TEST'})},
    ManttoPermissions:{state:()=>({exists:true,efectivo:true})}};
  const instrumented=SOURCE.replace('window.ManttoVentasFotosMapa=api;',
    `window.__int10B2={load,refresh:refrescarProyectoFotografiasInt10,state:()=>({
      confirmed:int10CatalogoConfirmadoEnSesion,
      core:int10CatalogoCore.length,
      united:int10CatalogoUnited.length,
      total:proyectos.length,
      projects:proyectos.map(p=>({id:p.id,count:carouselFotos(p).length,
        manage:p.canManageCorellian,navCor:p.canOpenCorellian,navUni:p.canOpenUnited}))
    })};window.ManttoVentasFotosMapa=api;`);
  assert.notEqual(instrumented,SOURCE,'No se instrumentó exclusivamente la VM de pruebas');
  const fetchMock=async input=>{
    const url=new URL(input);
    calls.push(url.pathname+url.search);
    return url.pathname.endsWith('/catalogo-general/fotografias')
      ?photoHandler(url):navigationHandler(url);
  };
  vm.runInNewContext(instrumented,{
    window:win,document:doc,fetch:fetchMock,URL,
    setTimeout:(cb,ms)=>{
      timers.push({ms,cb,fired:!manualTimers});
      if(!manualTimers)cb();
      return timers.length;
    },
    console:{warn:(...args)=>warnings.push(args)}
  },{filename:'ventas-fotos-mapa.js'});
  return {
    setPhoto:handler=>{photoHandler=handler;},setNavigation:handler=>{navigationHandler=handler;},
    state:()=>JSON.parse(JSON.stringify(win.__int10B2.state())),
    load:()=>win.__int10B2.load(),refresh:id=>win.__int10B2.refresh(id),
    calls,timers,warnings,dom:id=>elements.get(id),
    fireTimers:()=>{timers.filter(timer=>!timer.fired).forEach(timer=>{timer.fired=true;timer.cb();});},
    emit:event=>{assert.ok(events.has(event));events.get(event)();}
  };
}
function photoCalls(h,offset){return h.calls.filter(x=>x.includes('/catalogo-general/fotografias?')
  &&(offset==null||x.includes('offset='+offset)));}

// Se recupera por red y HTTP 5xx con dos intentos MAXIMO despues del inicial.
test('B2 recupera dos fallos temporales y completa las dos fuentes en 3 intentos GET',async()=>{
  const h=harness();let attempts=0;
  h.setPhoto(async()=>{
    attempts++;
    if(attempts===1)throw new TypeError('offline');
    if(attempts===2)return bad(503);
    return ok(page());
  });
  await h.load();
  assert.equal(attempts,3);
  assert.equal(photoCalls(h).length,3);
  assert.deepEqual(h.timers.map(x=>x.ms),[200,400]);
  assert.equal(h.state().confirmed,true);
  assert.equal(h.state().core,1);
  assert.equal(h.state().united,1);
  assert.equal(h.state().projects[0].count,2);
  assert.equal(h.state().projects[0].manage,true);
});

test('B2 reintenta SOLO la segunda pagina y confirma el total de 501 registros',async()=>{
  const h=harness();let errorsOn500=0;
  h.setPhoto(async u=>{
    const offset=Number(u.searchParams.get('offset'));
    if(offset===0)return ok(page(0,Array.from({length:500},(_,i)=>coreRow(i+1,'COR-'+i)),[]));
    if(offset===500&&errorsOn500++===0)return bad(502);
    return ok(page(500,[coreRow(501,'COR-501')],[]));
  });
  await h.load();
  assert.equal(h.state().confirmed,true);
  assert.equal(h.state().core,501);
  assert.equal(photoCalls(h,0).length,1);
  assert.equal(photoCalls(h,500).length,2);
  assert.deepEqual(h.timers.map(x=>x.ms),[200]);
});

test('B2 tras agotar los 2 reintentos conserva B1 y NO mezcla pagina parcial',async()=>{
  const h=harness();
  await h.load();
  h.setPhoto(async u=>{
    if(Number(u.searchParams.get('offset'))===0){
      return ok(page(0,Array.from({length:500},(_,i)=>coreRow(i+100,'COR-'+i)),[]));
    }
    return bad(503);
  });
  const before=h.calls.length;
  await h.load();
  assert.equal(h.state().confirmed,true);
  assert.equal(h.state().core,1);
  assert.equal(h.state().united,1);
  assert.equal(h.state().projects[0].manage,false);
  assert.match(h.dom('vfm-aiven-status').textContent,/últimos resultados válidos.*solo lectura/);
  assert.equal(photoCalls({calls:h.calls.slice(before)},500).length,3);
});

test('B2 HTTP 401/403 no reintenta y borra los datos previos',async t=>{
  for(const status of [401,403]){
    await t.test('HTTP '+status,async()=>{
      const h=harness();await h.load();const before=h.calls.length;
      h.setPhoto(async()=>badHtml(status));
      await h.load();
      assert.equal(photoCalls({calls:h.calls.slice(before)}).length,1);
      assert.equal(h.state().confirmed,false);
      assert.equal(h.state().core,0);
      assert.equal(h.state().total,0);
    });
  }
});

test('B2 reintenta HTTP 408 y 429, nunca 400/404',async t=>{
  for(const status of [408,429,400,404]){
    await t.test('HTTP '+status,async()=>{
      const h=harness();let attempts=0;
      h.setPhoto(async()=>{attempts++;return attempts===1?bad(status):ok(page());});
      await h.load();
      assert.equal(attempts,[408,429].includes(status)?2:1);
      assert.equal(h.state().confirmed,[408,429].includes(status));
    });
  }
});

test('B2 contrato 200 no JSON no se reintenta ni sustituye ultimo conjunto valido',async()=>{
  const h=harness();await h.load();const before=h.calls.length;
  h.setPhoto(async()=>({ok:true,status:200,text:async()=>'<html>malformed</html>'}));
  await h.load();
  assert.equal(photoCalls({calls:h.calls.slice(before)}).length,1);
  assert.equal(h.state().core,1);
  assert.equal(h.state().projects[0].manage,false);
});

test('B2 rechaza respuestas incompletas, offset falso y filas excesivas sin reintentos',async t=>{
  const invalid=[
    ['offset',u=>page(500,[coreRow()],[])],
    ['limit',u=>({...page(),limit:499})],
    ['sin ok',u=>({...page(),ok:undefined})],
    ['arreglo mayor a 500',u=>page(0,Array.from({length:501},(_,i)=>coreRow(i+1)),[])],
    ['fila incompleta',u=>page(0,[{id_photo:8}],[])],
    ['fila no objeto',u=>page(0,['mala'],[])],
  ];
  for(const [name,build] of invalid){
    await t.test(name,async()=>{
      const h=harness();await h.load();const before=h.calls.length;
      h.setPhoto(async u=>ok(build(u)));
      await h.load();
      assert.equal(photoCalls({calls:h.calls.slice(before)}).length,1);
      assert.equal(h.state().core,1);
      assert.equal(h.state().projects[0].manage,false);
    });
  }
});

test('B2 detecta pagina repetida por id_photo en CORELLIAN y descarta la nueva consulta',async()=>{
  const h=harness();await h.load();const before=h.calls.length;
  h.setPhoto(async u=>{
    const offset=Number(u.searchParams.get('offset'));
    if(offset===0)return ok(page(0,Array.from({length:500},(_,i)=>coreRow(i+1,'COR-'+i)),[]));
    return ok(page(500,[coreRow(25,'COR-25')],[]));
  });
  await h.load();
  assert.equal(photoCalls({calls:h.calls.slice(before)},500).length,1);
  assert.equal(h.state().core,1);
  assert.equal(h.state().confirmed,true);
  assert.equal(h.state().projects[0].manage,false);
});

test('B2 recupera guard de gestión CORELLIAN cuando falla una vez su consulta',async()=>{
  const h=harness();let scopeCalls=0;
  h.setNavigation(async u=>{
    const offset=Number(u.searchParams.get('offset')||0);
    if(u.pathname.endsWith('/fotografias-gestion')){
      scopeCalls++;
      if(scopeCalls===1)return bad(503);
      return ok({ok:true,limit:500,offset,data:[{id_ppns:'COR-1'}]});
    }
    return ok({ok:true,limit:500,offset,data:u.pathname.endsWith('/navegacion-corellian')
      ?[{'ID Proyecto':'COR-1'}]:[]});
  });
  await h.load();
  assert.equal(scopeCalls,2);
  assert.equal(h.state().projects[0].manage,true);
});

test('B2 en 403 del guard no reintenta ni otorga edición; la galería sí se consulta',async()=>{
  const h=harness();let calls=0;
  h.setNavigation(async u=>{
    if(u.pathname.endsWith('/fotografias-gestion')){calls++;return bad(403);}
    return ok({ok:true,limit:500,offset:Number(u.searchParams.get('offset')||0),
      data:u.pathname.endsWith('/navegacion-corellian')?[{'ID Proyecto':'COR-1'}]:[]});
  });
  await h.load();
  assert.equal(calls,1);
  assert.equal(h.state().core,1);
  assert.equal(h.state().projects[0].navCor,true);
  assert.equal(h.state().projects[0].manage,false);
});

test('B2 cambio de identidad durante la espera cancela reintentos pendientes',async()=>{
  const h=harness({manualTimers:true});
  let attempts=0;
  h.setPhoto(async()=>{attempts++;throw new TypeError('offline');});
  const loading=h.load();
  // Aguarda a que se programe el primer reintento (no se ejecuta hasta fireTimers).
  for(let i=0;i<25&&h.timers.length===0;i++)await Promise.resolve();
  assert.equal(h.timers.length,1);
  h.emit('mantto:view-user-changed');
  h.fireTimers();
  await loading;
  assert.equal(attempts,1);
  assert.equal(h.state().confirmed,false);
  assert.equal(h.state().core,0);
});

test('B2 respeta 7+7, no mezcla origenes ni cambia el rol de gestión',async()=>{
  const h=harness();
  h.setPhoto(async()=>ok(page(0,[{
    ...coreRow(),...Object.fromEntries(Array.from({length:7},(_,i)=>[
      i===0?'FOTO BLT':'FOTO BLT '+(i+1),`https://foto.example.test/C${i}.jpg`
    ]))
  }],[{
    ...unitedRow(),...Object.fromEntries(Array.from({length:7},(_,i)=>[
      'foto_'+(i+1),`https://foto.example.test/U${i}.jpg`
    ]))
  }])));
  await h.load();
  assert.equal(h.state().projects[0].count,14);
  assert.equal(h.state().projects[0].manage,true);
});

test('B2 no otorga permisos si el endpoint de gestión devuelve offset incorrecto',async()=>{
  const h=harness();
  h.setNavigation(async u=>{
    const management=u.pathname.endsWith('/fotografias-gestion');
    return ok({ok:true,limit:500,offset:management?900:0,
      data:management?[{id_ppns:'COR-1'}]:[{'ID Proyecto':'COR-1'}]});
  });
  await h.load();
  assert.equal(h.state().confirmed,true);
  assert.equal(h.state().core,1);
  assert.equal(h.state().projects[0].manage,false);
  assert.equal(h.calls.filter(c=>c.includes('/fotografias-gestion')).length,1);
});

test('B2 rechaza una segunda página UNITED con id_photo repetido sin perder B1',async()=>{
  const h=harness();await h.load();
  h.setPhoto(async u=>{
    const offset=Number(u.searchParams.get('offset'));
    if(offset===0){
      return ok(page(0,[],Array.from({length:500},(_,i)=>unitedRow(i+1,'UNI-'+i))));
    }
    return ok(page(500,[],[unitedRow(25,'UNI-25')]));
  });
  await h.load();
  assert.equal(h.state().core,1);
  assert.equal(h.state().united,1);
  assert.equal(h.state().projects[0].manage,false);
});

test('B2 reintenta refresco GET selectivo; el motor de upload permanece intacto',async()=>{
  const h=harness();await h.load();
  let attempts=0;
  h.setPhoto(async u=>{
    if(u.searchParams.has('core_project')){
      attempts++;
      if(attempts===1)return bad(503);
      return ok({ok:true,limit:5000,offset:0,filters:{core_project:'COR-1'},
        data:{corellian:[{...coreRow(), 'FOTO BLT 2':'https://foto.example.test/new-photo.jpg'}],united:[]}});
    }
    return ok(page());
  });
  await h.refresh('COR-1');
  assert.equal(attempts,2);
  assert.equal(h.state().projects[0].count,3);
  assert.equal(h.calls.filter(c=>c.includes('core_project=COR-1')).length,2);
});

test('B2 invalidación de caché frontend coincide con nueva versión de módulo',()=>{
  const loader=fs.readFileSync(path.join(ROOT,'core/module-loader.js'),'utf8');
  const index=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
  assert.match(loader,/ventas-fotos-mapa\.js\?v=20261017-int10-b3-seguridad-v001/);
  assert.match(index,/core\/module-loader\.js\?v=20261017-int10-b3-seguridad-v001/);
  assert.match(SOURCE,/const INT10_REINTENTOS_B2 = 2;/);
  assert.ok(!SOURCE.includes('localStorage.setItem('));
  assert.ok(!SOURCE.includes('sessionStorage.setItem('));
});

'use strict';
// F8: todas las pruebas son aisladas. No hay NetSuite, Azure ni Aiven reales.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const coalescer=require('../src/modules/experimental-ns/experimental-ns-live-coalescer');
const FRONT=path.join(__dirname,'../../modules/experimental-ns');
const PERF=fs.readFileSync(path.join(FRONT,'experimental-ns-performance.js'),'utf8');
const LIVE=fs.readFileSync(path.join(FRONT,'experimental-ns-live.js'),'utf8');
const R1='experimental-ns-resumen-dia',R2='experimental-ns-equipos-criticos';
const PERMISSION='EXPERIMENTAL_NS_RESUMEN_DIA_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const ver=key=>crypto.createHash('sha256').update(key).digest('hex');
function req(zone,actor=1,permission=PERMISSION){return {user:{id_SB:actor},
  informationAccess:{dominio:'UNITED',acceso_puerta:true,
    agrupacion:{codigo:'EXPERIMENTAL_NS'},permission_code:permission},zone};}
function repoFixture(){
  let calls=0;
  const repo={
    queries(r){return {portafolio:'FROM ns_portafolio_pruebas p WHERE zona_id = ?',
      tickets:'FROM ns_tickets_pruebas t WHERE zona_id = ?',
      pParams:[r.zone],tParams:[r.zone]};},
    async revision(r){calls++;await sleep(12);return ver('rev:'+r.zone);}
  };
  return {repo,calls:()=>calls};
}

test('F8: 50 lectores de mismo alcance comparten una revision y no 50 consultas',async()=>{
  coalescer.resetForTests();const f=repoFixture();
  const v=await Promise.all(Array.from({length:50},(_,i)=>coalescer.revision(req(7,i+1),f.repo)));
  assert.equal(f.calls(),1);
  assert.equal(new Set(v).size,1);
  assert.match(v[0],/^[a-f0-9]{64}$/);
  assert.equal(coalescer.sizeForTests(),1);
});

test('F8: zonas y permisos distintos nunca comparten huellas por error',async()=>{
  coalescer.resetForTests();const f=repoFixture();
  const results=await Promise.all([
    coalescer.revision(req(1,1),f.repo),coalescer.revision(req(2,2),f.repo),
    coalescer.revision(req(1,3,'OTRO_PERMISO'),f.repo)
  ]);
  assert.equal(f.calls(),3);
  assert.notEqual(results[0],results[1]);
  assert.equal(results[0],results[2]); // Mismo alcance, pero distinta entrada por permiso.
});

test('F8: TTL y ausencia de scope no proporcionan permiso ni caché',async()=>{
  coalescer.resetForTests();const f=repoFixture();
  const authorized=req(3);
  await coalescer.revision(authorized,f.repo);
  await coalescer.revision(authorized,f.repo);
  assert.equal(f.calls(),1);
  await coalescer.revision({informationAccess:null,zone:3},f.repo);
  assert.equal(f.calls(),2);
  assert.ok(coalescer.TTL_MS<=1000);
  assert.ok(coalescer.MAX_ENTRIES<=128);
});

test('F8: los errores no se guardan como éxito en caché',async()=>{
  coalescer.resetForTests();let n=0;
  const f=repoFixture();f.repo.revision=async()=>{n++;if(n===1)throw Error('simulacion db no disponible');return ver('ok');};
  await assert.rejects(coalescer.revision(req(10),f.repo),/db no disponible/);
  assert.match(await coalescer.revision(req(10),f.repo),/^[a-f0-9]{64}$/);
  assert.equal(n,2);
});

function perfFixture(programmer=true){
  const timers=new Map();let tid=0,now=1;
  const document={querySelectorAll:()=>[],getElementById:()=>null};
  const window={
    ManttoAuth:{getActorUser:()=>({is_programador:programmer})},
    performance:{now:()=>now},
    setTimeout(fn){const id=++tid;timers.set(id,fn);return id;},
    clearTimeout(id){timers.delete(id);}
  };
  vm.runInNewContext(PERF,{window,document,Date,console,Promise,Map,Set,Math,Number},
    {filename:'experimental-ns-performance.js'});
  return {api:window.ManttoExperimentalNsPerformance,window,document,timers,
    advance:(ms)=>{now+=ms;},async drain(){const arr=[...timers.values()];timers.clear();
      await Promise.all(arr.map(fn=>Promise.resolve().then(fn)));
      await new Promise(resolve=>setImmediate(resolve));
    }};
}

test('F8: veinte avisos simultaneos se agrupan en una consulta',async()=>{
  const f=perfFixture();let count=0;
  const results=Array.from({length:20},()=>f.api.enqueue(R1,async()=>{count++;return true;}));
  assert.equal(f.timers.size,1);
  await f.drain();
  assert.deepEqual(await Promise.all(results),Array(20).fill(true));
  assert.equal(count,1);assert.equal(f.api.report(R1).coalesced,19);
});

test('F8: medicion sin datos sensibles, muestras acotadas y reinicio al cerrar sesion',async()=>{
  const f=perfFixture();const p=f.api;
  p.noteCheck(R1);
  for(let i=0;i<120;i++){
    await p.measureGet(R1,'revision',async()=>{f.advance(5);return {ok:true,version:ver(String(i))};});
  }
  await p.measureGet(R1,'datos',async()=>({data:[{ticket:'SECRETO-PRUEBA'}]}));
  p.noteRefresh(R1,4,11);
  const s=p.report(R1);
  assert.equal(s.requests,121);assert.equal(s.revisions,120);assert.equal(s.dataRequests,1);
  assert.equal(s.checks,1);assert.equal(s.visualChanges,4);assert.equal(s.p95Ms,5);
  assert.equal(p.config.samplesLimit,100);
  assert.doesNotMatch(JSON.stringify(s),/SECRETO-PRUEBA/);
  p.clear();assert.equal(p.report(R1).requests,0);
});

test('F8: prohibido mostrar indicadores tecnicos sin Programador validado',()=>{
  const f=perfFixture(false);let added=0;
  const view={querySelector:()=>null,insertBefore(){added++;}};
  f.api.render(R1,view);
  assert.equal(added,0);
});

test('F8: reconexion y backoff temporal sin impedir consulta manual',async()=>{
  let failures=1,calls=0;
  const node={dataset:{},setAttribute(){},textContent:''};
  const view={child:null,firstChild:null,
    querySelector(name){return name==='.expns-live-line'?this.child:null;},
    insertBefore(el){this.child=el;this.firstChild=el;}
  };
  const doc={hidden:false,addEventListener(){},
    getElementById:()=>view,
    createElement(){return {...node,dataset:{}};}
  };
  const win={ManttoAuth:{getUser:()=>({id_SB:1,rol:'Programador'}),
    getActorUser:()=>({id_SB:1,rol:'Programador',is_programador:true}),getViewUser:()=>null,
    apiGet:async()=>{calls++;if(failures-->0)throw Error('sin red de prueba');return {ok:true,source:'experimental-ns',version:ver('1')};}},
    ManttoRouter:{getCurrent:()=>({route:R1})},setInterval:()=>1,setTimeout:()=>1,addEventListener(){}
  };
  vm.runInNewContext(LIVE,{window:win,document:doc,console,Date,navigator:{onLine:true},Math,Map,Promise,Set},
    {filename:'experimental-ns-live.js'});
  const l=win.ManttoExperimentalNsLive;
  let refreshed=0;
  assert.equal(l.register(R1,{refreshSilent:async()=>{refreshed++;return {changed:1};},reset(){}}),true);
  l.markFetched(R1);
  await l.check(R1,false); assert.equal(calls,1);
  await l.check(R1,false); assert.equal(calls,1); // Backoff.
  await l.check(R1,true); assert.equal(calls,2);assert.equal(refreshed,1);
});

test('F8: solo toca Experimental NS y no introduce endpoints de escritura',()=>{
  const shell=fs.readFileSync(path.join(FRONT,'experimental-ns.js'),'utf8');
  assert.equal((shell.match(/experimental-ns-performance\.js/g)||[]).length,3);
  assert.equal((shell.match(/experimental-ns-performance\.css/g)||[]).length,3);
  assert.doesNotMatch(PERF,/ManttoDataSync|\/api\/(?:tickets|portafolio|proyectos)\b/);
  assert.doesNotMatch(PERF,/\b(?:fetch|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|indexedDB)\b/);
  const files=[
    path.join(FRONT,'resumen-dia/resumen-dia-ns.js'),
    path.join(FRONT,'equipos-criticos/equipos-criticos-ns.js'),
    path.join(FRONT,'proyectos-mantenimiento/proyectos-mantenimiento-ns.js')
  ];
  files.forEach(p=>assert.match(fs.readFileSync(p,'utf8'),/ManttoExperimentalNsPerformance/));
});

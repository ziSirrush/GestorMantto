'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../core/offline-scheduler.js'),'utf8');
const permission='GENERAL_MODO_OFFLINE_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';
const uniSig='a'.repeat(64),corSig='b'.repeat(64);
const entries=[
  {key:'operacion-resumen-dia',module_code:'OPERACION_RESUMEN_DEL_DIA',label:'Resumen del Día',domain:'UNITED',
    exporter:{manifest:'/api/offline/export/resumen-dia/manifest',page:'/api/offline/export/resumen-dia/page',kinds:['tickets','portafolio'],page_limit:2}},
  {key:'instalaciones-proyectos',module_code:'INSTALACIONES_PROYECTOS',label:'Proyectos',domain:'CORELLIAN',
    exporter:{manifest:'/api/offline/export/instalaciones-proyectos/manifest',page:'/api/offline/export/instalaciones-proyectos/page',kinds:['proyectos'],page_limit:2}}
];
const catalog=[
  {code:'OPERACION_RESUMEN_DEL_DIA',domain:'UNITED',scope:{scope_signature:uniSig},datasets:['operacion-resumen-dia']},
  {code:'INSTALACIONES_PROYECTOS',domain:'CORELLIAN',scope:{scope_signature:corSig},datasets:['instalaciones-proyectos']},
  {code:'ALMACEN_INVENTARIOS',domain:'CORELLIAN',scope:{scope_signature:corSig},datasets:[]}
];
function createEnv({alterFinal=false,failPage=false,excludeCor=false}={}){
  const values=new Map(),events=[],calls=[],chunks=[],committed=[],abandoned=[];
  if(excludeCor)values.set('mantto:offline-selection:f1:10:10',JSON.stringify({excluded_codes:['INSTALACIONES_PROYECTOS']}));
  const caps={permission_code:permission,effective_user_id:10,viewer_read_only:false,
    datasets:entries,catalog_modules:catalog};
  const uniManifest={ok:true,dataset:entries[0].key,domain:'UNITED',scope_signature:uniSig,
    kinds:{tickets:{count:2,max_id:10,max_updated:'2026-10-20T13:10:00Z'},
      portafolio:{count:1,max_id:9,max_updated:'2026-10-20T13:10:00Z'}},
    alcance:{zona_ids:[2,4,6,8],zonas:['N','S','E','O']}};
  const corManifest={ok:true,dataset:entries[1].key,domain:'CORELLIAN',scope_signature:corSig,
    kinds:{proyectos:{count:1,max_id:7,max_updated:'2026-10-20T13:10:00Z'}},
    alcance:{visible_user_count:2,master_key:false}};
  const metaReads={};
  async function api(p){
    calls.push(p);
    if(p.includes('/manifest')){
      const key=p.includes('instalaciones-proyectos')?'cor':'uni';
      metaReads[key]=(metaReads[key]||0)+1;
      const meta=key==='cor'?corManifest:uniManifest;
      if(alterFinal&&key==='uni'&&metaReads[key]>1)return {...meta,kinds:{...meta.kinds,tickets:{...meta.kinds.tickets,count:3}}};
      return meta;
    }
    if(failPage)throw new Error('Conexión perdida durante página');
    if(p.includes('/page?')){
      const q=new URL(p,'https://fake.test').searchParams;
      const kind=q.get('kind');
      const list=kind==='tickets'?[{id:5},{id:10}]:kind==='portafolio'?[{id_portafolio:9}]:[{id_ins_fl:7}];
      return {ok:true,dataset:kind==='proyectos'?entries[1].key:entries[0].key,
        domain:kind==='proyectos'?'CORELLIAN':'UNITED',scope_signature:kind==='proyectos'?corSig:uniSig,
        kind,rows:list,has_more:false,next_cursor:list[list.length-1][kind==='tickets'?'id':kind==='portafolio'?'id_portafolio':'id_ins_fl']};
    }
    throw new Error('Ruta no simulada '+p);
  }
  const store={
    async pruneSnapshots(filter,allowed){calls.push({prune:allowed,filter});return 0;},
    async beginDownload(ctx,manifest){const id=ctx.dataset+'-run';calls.push({begin:ctx});return id;},
    async appendDownload(ctx,id,kind,rows){chunks.push({ctx,id,kind,rows});return {count:rows.length};},
    async finishDownload(ctx,id,manifest){committed.push({ctx,id,manifest});return {record_count:ctx.domain==='UNITED'?3:1,byte_size:100};},
    async abandonDownload(ctx,id){abandoned.push({ctx,id});}
  };
  const document={hidden:false,addEventListener(){},dispatchEvent(e){events.push(e);}};
  const localStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};
  const window={ManttoAuth:{getActorUser:()=>({id_SB:10}),getUser:()=>({id_SB:10}),isViewingAs:()=>false,
    apiGet:async()=>({data:caps}),api},ManttoPermissions:{state:()=>({exists:true,efectivo:true})},
    ManttoOfflineStorage:store,addEventListener(){},setTimeout(){return 0;},setInterval(){return 0;}};
  const navigator={onLine:true,locks:{request:async(_n,_opts,cb)=>cb({name:'lock'})}};
  const sandbox={window,document,localStorage,navigator,Date,URL,URLSearchParams,CustomEvent:class CustomEvent{constructor(type,options){this.type=type;this.detail=options?.detail;}},console};
  vm.runInNewContext(source,sandbox);
  return {scheduler:window.ManttoOfflineScheduler,calls,chunks,committed,abandoned,events,values};
}

test('respaldo con módulos disponibles no marca PARTIAL por opciones aún no habilitadas',async()=>{
  const x=createEnv();
  const r=await x.scheduler.backupNow();
  assert.equal(r.status,'PASS');
  assert.equal(r.completed.length,2);
  assert.deepEqual(r.unsupported,['CORELLIAN:ALMACEN_INVENTARIOS']);
  assert.equal(x.committed.length,2);
  assert.deepEqual(x.chunks.map(c=>c.kind),['tickets','portafolio','proyectos']);
  assert.ok(x.events.some(e=>e.type==='mantto:offline-backup-progress'));
  assert.ok(x.events.some(e=>e.type==='mantto:offline-backup-summary'));
  const prune=x.calls.find(v=>typeof v==='object'&&v.prune);
  assert.equal(prune.prune['UNITED:OPERACION-RESUMEN-DIA'].signature,uniSig);
  assert.equal(prune.prune['CORELLIAN:INSTALACIONES-PROYECTOS'].signature,corSig);
  assert.equal(x.scheduler.readPreferences(10).last_backup_status,'PASS');
});

test('selección usuario excluye CORELLIAN sin ampliar alcance',async()=>{
  const x=createEnv({excludeCor:true});
  const r=await x.scheduler.backupNow();
  assert.equal(r.completed.length,1);
  assert.equal(x.committed[0].ctx.domain,'UNITED');
  assert.ok(!x.calls.some(v=>typeof v==='string'&&v.includes('/export/instalaciones-proyectos/')));
});

test('cambio de conteo durante respaldo aborta reemplazo y conserva copia anterior',async()=>{
  const x=createEnv({alterFinal:true,excludeCor:true});
  const r=await x.scheduler.backupNow();
  assert.equal(r.status,'FAIL');
  assert.equal(x.committed.length,0);
  assert.equal(x.abandoned.length,1);
  assert.match(r.failed[0].error,/cambió|alcance/);
});

test('corte de conexión durante página aborta sólo nueva generación',async()=>{
  const x=createEnv({failPage:true,excludeCor:true});
  const r=await x.scheduler.backupNow();
  assert.equal(r.status,'FAIL');
  assert.equal(x.committed.length,0);
  assert.equal(x.abandoned.length,1);
});

test('calendario: después de la hora se debe respaldo, antes no',()=>{
  const x=createEnv();
  const p={daily_enabled:true,preferred_time:'17:30',schedule_started_at:'2026-10-20T09:00:00'};
  assert.equal(x.scheduler.dueState(p,new Date('2026-10-20T17:29:00')).due,false);
  assert.equal(x.scheduler.dueState(p,new Date('2026-10-20T17:31:00')).due,true);
  assert.equal(x.scheduler.dueState({...p,last_backup_at:'2026-10-20T17:31:00'},new Date('2026-10-20T18:00:00')).due,false);
});

test('revalida alcance y catálogo aunque todavía no llegue la hora del respaldo',async()=>{
  const x=createEnv({excludeCor:true});
  const result=await x.scheduler.revalidateCopies(true);
  assert.equal(result.ok,true);
  const prune=x.calls.find(v=>typeof v==='object'&&v.prune);
  assert.equal(prune.prune['UNITED:OPERACION-RESUMEN-DIA'].signature,uniSig);
  assert.equal(prune.prune['CORELLIAN:INSTALACIONES-PROYECTOS'],undefined);
});

test('avance global real: dos modulos, conteo acumulado de tipos, y 100% solo con commit',async()=>{
  const x=createEnv(),report=await x.scheduler.backupNow();
  const progress=x.events.filter(e=>e.type==='mantto:offline-backup-progress').map(e=>e.detail);
  assert.equal(report.status,'PASS');
  assert.equal(report.total_modules,2);
  assert.equal(report.overall_percent,100);
  assert.equal(progress.length,3);
  assert.equal(progress[0].module_percent,66); // tickets 2 de 3 registros reales del módulo
  assert.equal(progress[0].overall_percent,33); // un medio módulo del total de 2 módulos
  assert.equal(progress[1].module_percent,99); // portafolio termina; falta verificación y commit
  assert.equal(progress[1].overall_percent,49);
  assert.equal(progress[2].module_percent,99);
  assert.equal(progress[2].overall_percent,99);
  const successes=x.events.filter(e=>e.type==='mantto:offline-backup-completed');
  assert.equal(successes.length,2);
  assert.equal(successes[0].detail.overall_percent,50);
  assert.equal(successes[1].detail.overall_percent,100);
  assert.ok(!progress.some(p=>p.overall_percent===100));
});

test('un fallo de descarga no provoca 100% general aunque existan datos descargados',async()=>{
  const x=createEnv({alterFinal:true}),report=await x.scheduler.backupNow();
  assert.equal(report.status,'FAIL');
  assert.equal(report.completed.length,1);
  assert.equal(report.overall_percent,50);
  assert.ok(x.events.filter(e=>e.type==='mantto:offline-backup-progress').every(e=>e.detail.overall_percent<100));
  assert.ok(x.events.some(e=>e.type==='mantto:offline-backup-error'));
});

test('F1 nueva navegación: respaldo exitoso renueva catálogo local ligado a identidad',async()=>{
  const x=createEnv();
  const result=await x.scheduler.backupNow();
  assert.equal(result.status,'PASS');
  const raw=x.values.get('mantto:offline-access:10:10');
  assert.ok(raw,'El catálogo validado debe quedar disponible para el siguiente arranque offline.');
  const cached=JSON.parse(raw);
  assert.equal(cached.data.permission_code,permission);
  assert.equal(cached.data.effective_user_id,10);
  assert.equal(cached.data.catalog_modules.length,3);
  assert.ok(x.events.some(e=>e.type==='mantto:offline-capabilities-updated'));
});

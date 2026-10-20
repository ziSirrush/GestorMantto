'use strict';
/* BLT NOW | 2026-10-20 | ALTAS FASE 5 V001
 * QA integral local SIN Aiven: cruza Guard CORELLIAN, rutas legacy,
 * procedencia de auditoria y corte prematuro de HTTP vs GAS.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const EventEmitter = require('node:events');
const MOD = path.resolve(__dirname,'../src/modules/instalaciones-administracion');
const INS_ROUTE = path.resolve(__dirname,'../src/routes/ins-fl.routes.js');
const ADMIN_ROUTE = path.join(MOD,'instalaciones-administracion.routes.js');
const GUARD = path.join(MOD,'instalaciones-administracion-altas-formula-guard.js');
const SYNC_GUARD = path.join(MOD,'instalaciones-administracion-altas-sync-guard.js');
const MOCK_COR = require('node:module');

function loadWith(file, dependencies) {
  const mod={exports:{}};
  const code=fs.readFileSync(file,'utf8');
  new Function('require','module','exports',code)(name=>{
    if(!Object.prototype.hasOwnProperty.call(dependencies,name))
      throw Error('Dependencia no declarada en QA F5: '+name);
    return dependencies[name];
  },mod,mod.exports);
  return mod.exports;
}
function response() {
  const r = new EventEmitter();
  r.statusCode = null; r.payload=null; r.writableFinished=false;
  r.status=code=>{r.statusCode=code;return r;};
  r.json=payload=>{r.payload=payload;r.writableFinished=true;r.emit('finish');return r;};
  return r;
}
function formGuardFixture(opt={}) {
  const calls=[];
  const records=opt.records??[
    {id_ins_fl:51,id_proyecto:'P555'},
    {id_ins_fl:52,id_proyecto:'P555'}
  ];
  const mockDb={query:async(sql,params)=>{
    calls.push(['SQL',sql,params]);
    if(opt.dbError)throw Error('Aiven no disponible');
    const ids=params.slice(0,params.length-(opt.project?1:0));
    return [records.filter(row=>ids.includes(row.id_ins_fl)
      &&(!opt.allowedIds || opt.allowedIds.includes(row.id_ins_fl)))];
  }};
  const scope=opt.scope??{mode:'ALL'};
  const repository={
    scopeClause_cor(){return {sql:scope.mode==='ALL'?'':' AND f.id_ins_fl IN (51)',params:[]};},
    parseProjectKey_cor(key){
      if(!/^P:[A-Za-z0-9]+$/.test(key))throw Object.assign(Error('PPNS invalido'),{statusCode:400});
      return {sql:'f.id_proyecto = ?', params:[key.slice(2)]};
    }
  };
  const mockService={ensureFullEditPermission_cor:async()=>{
    calls.push(['PERMISO']);
    if(opt.denied)throw Object.assign(Error('Sin permiso EDITAR'),{statusCode:403,code:'EDICION_DENEGADA'});
  }};
  const origin={humanCreatedIdsCor:async(_conn,rows)=>{
    calls.push(['AUDITORIA',rows.map(row=>row.id_ins_fl)]);
    if(opt.auditError)throw Error('Auditoria indisponible');
    return new Set(rows.filter(row=>(opt.humanIds||[]).includes(row.id_ins_fl)).map(row=>row.id_ins_fl));
  }};
  const guard=loadWith(GUARD,{
    '../../config/db':mockDb,
    '../ventas/ventas-visibility.service':{resolveVisibilityScope:async()=>scope},
    './instalaciones-administracion.repository':repository,
    './instalaciones-administracion.service':mockService,
    './instalaciones-administracion-altas-origin':origin
  });
  return {guard,calls,db:mockDb};
}
async function invoke(f,body,params={id:'51'}){
  let next=0;const res=response();
  await f.guard.protectHumanFormulasLegacyCor({body,params},res,()=>{next++;});
  return {res,next};
}

test('F5: catalogo de campos protegidos contiene PPNS y calculos de Excel',()=>{
  const {guard}=formGuardFixture();
  assert.deepEqual(guard.HUMAN_READONLY_COR,[
    'meses_garantia_restantes','anio_termino','costo_mensual_mantenimiento_cem','id_proyecto'
  ]);
});
test('F5: extrae campos de PATCH plano o por grupos sin aceptar campos desconocidos',()=>{
  const {guard}=formGuardFixture();
  assert.deepEqual(guard.requestedFieldsCor({changes:{costo_mensual_mantenimiento_cem:'80',marca:'BLT'}}),
    ['costo_mensual_mantenimiento_cem']);
  assert.deepEqual(guard.requestedFieldsCor({groups:{costos:{changes:{anio_termino:'2030'}},proyecto:{changes:{id_proyecto:'P555'}}}}),
    ['anio_termino','id_proyecto']);
  assert.deepEqual(guard.requestedFieldsCor({groups:[{changes:{id_proyecto:'x'}}]}),[]);
});
test('F5: valida IDs individuales y lotes antes del preflight',()=>{
  const {guard}=formGuardFixture();
  assert.deepEqual(guard.idsCor({params:{id:'51'}}),[51]);
  assert.deepEqual(guard.idsCor({body:{ids:[52,'51']}}),[52,51]);
  for(const ids of [[51,51],[0],['1 OR 1=1'],Array.from({length:21},(_,i)=>i+1)])
    assert.deepEqual(guard.idsCor({body:{ids}}),[]);
});
test('F5: no hace consultas por edicion legitima de otros campos',async()=>{
  const f=formGuardFixture({humanIds:[51]});
  const result=await invoke(f,{groups:{equipo:{changes:{marca:'BLT'}}}});
  assert.equal(result.next,1);assert.equal(result.res.statusCode,null);assert.deepEqual(f.calls,[]);
});
test('F5: rechaza solo campos formula de alta HUMANA por ruta legacy individual',async()=>{
  const f=formGuardFixture({humanIds:[51]});
  const result=await invoke(f,{groups:{costos:{changes:{costo_mensual_mantenimiento_cem:'999'}}}});
  assert.equal(result.next,0);assert.equal(result.res.statusCode,409);
  assert.equal(result.res.payload.code,'INSTALACIONES_ADMIN_ALTA_CALCULADO_SOLO_LECTURA');
  assert.ok(f.calls.find(x=>x[0]==='AUDITORIA'));
});
test('F5: prohíbe cambiar PPNS de alta humana para no perder marca de origen',async()=>{
  const f=formGuardFixture({humanIds:[51]});
  const result=await invoke(f,{changes:{id_proyecto:'P556'}});
  assert.equal(result.next,0);assert.equal(result.res.statusCode,409);
});
test('F5: permite manualmente los mismos campos en un equipo historico GAS',async()=>{
  const f=formGuardFixture({humanIds:[]});
  const result=await invoke(f,{changes:{meses_garantia_restantes:'24'}});
  assert.equal(result.next,1);assert.equal(result.res.statusCode,null);
});
test('F5: impide alterar lote si alguno de sus equipos es alta humana',async()=>{
  const f=formGuardFixture({humanIds:[52]});
  const result=await invoke(f,{groups:{costos:{changes:{costo_mensual_mantenimiento_cem:'100'}}}}, {projectKey:'P:P555'});
  // Sin ids el servicio posterior validaria el lote, no el preflight.
  assert.equal(result.next,1);
  const res=response();let next=0;
  await f.guard.protectHumanFormulasLegacyCor({body:{ids:[51,52],groups:{costos:{changes:{costo_mensual_mantenimiento_cem:'100'}}}},params:{projectKey:'P:P555'}},res,()=>next++);
  assert.equal(res.statusCode,409);assert.equal(next,0);
});
test('F5: pantalla Visor o usuario sin EDITAR no entra a consulta de datos',async()=>{
  const f=formGuardFixture({denied:true,humanIds:[51]});
  const out=await invoke(f,{changes:{meses_garantia_restantes:'5'}});
  assert.equal(out.res.statusCode,403);assert.equal(out.next,0);
  assert.equal(f.calls.filter(x=>x[0]==='SQL').length,0);
});
test('F5: alcance limitado no revela origen de equipos no visibles',async()=>{
  const f=formGuardFixture({humanIds:[52],allowedIds:[51],scope:{mode:'LIMITED'}});
  const out=await invoke(f,{changes:{anio_termino:'2030'}},{id:'52'});
  assert.equal(out.next,1);assert.equal(out.res.statusCode,null);
  // El servicio oficial aun negara 404 al no encontrar el equipo en scope.
  assert.deepEqual(f.calls.find(x=>x[0]==='AUDITORIA')[1],[]);
});
test('F5: falla de BD al verificar origen devuelve 503 y NUNCA permite PATCH',async()=>{
  const f=formGuardFixture({dbError:true});
  const out=await invoke(f,{changes:{anio_termino:'2030'}});
  assert.equal(out.res.statusCode,503);assert.equal(out.next,0);
});
test('F5: falla de auditoria devuelve 503 y NUNCA permite PATCH',async()=>{
  const f=formGuardFixture({auditError:true});
  const out=await invoke(f,{changes:{anio_termino:'2030'}});
  assert.equal(out.res.statusCode,503);assert.equal(out.next,0);
});
test('F5: rutas legacy individuales y multiples aplican preflight tras Guard CORELLIAN',()=>{
  const s=fs.readFileSync(ADMIN_ROUTE,'utf8');
  assert.equal((s.match(/protectHumanFormulasLegacyCor,/g)||[]).length,4);
  assert.match(s,/router\.post\('\/administracion\/altas', \.\.\.accessGuard_cor/);
  assert.match(s,/humanInformationGuard_gnral/);
});

function syncFixture({human=false,dbError=false,hold=false}={}){
  const events=[];let writeResolve;
  const conn={release(){events.push('RELEASE_CONN');},async query(sql){
    if(sql.includes('GET_LOCK')){events.push('LOCK');return [[{granted:1}]];}
    if(sql.includes('RELEASE_LOCK')){events.push('UNLOCK');return [[{released:1}]];}
    if(sql.includes('FROM ins_fl')){events.push('LOOKUP');if(dbError)throw Error('No BD');
      return [[{id_ins_fl:55,id_proyecto:'P555',referencia_sitio:'E1'}]];}
    throw Error('SQL desconocido');
  }};
  const guard=loadWith(SYNC_GUARD,{
    '../../config/db':{getConnection:async()=>conn},
    '../../shared/logger':{error:()=>events.push('LOG_ERROR')},
    './instalaciones-administracion-altas-origin':{
      acquireCor:async c=>(await c.query('SELECT GET_LOCK()'))[0][0].granted===1,
      releaseCor:async c=>(await c.query('SELECT RELEASE_LOCK()'))[0][0].released===1,
      humanCreatedIdsCor:async()=>new Set(human?[55]:[])
    }
  });
  return {events,guard,conn,hold};
}
test('F5: cierre HTTP PREMATURO no libera candado durante el controlador GAS',async()=>{
  const f=syncFixture(),req={body:{rows:[{id_proyecto:'P555',referencia_sitio:'E1'}]}},res=response();
  let next=0;
  await f.guard.protectManualAltasCor(req,res,()=>next++);
  assert.equal(next,1);
  res.emit('close');
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(f.events,['LOCK','LOOKUP']);
  await req.bltnowInsFlGuardReleaseCor();
  assert.deepEqual(f.events,['LOCK','LOOKUP','UNLOCK','RELEASE_CONN']);
});
test('F5: finish y finally no provocan doble liberacion ni doble release',async()=>{
  const f=syncFixture(),req={body:{rows:[{id_proyecto:'P555',referencia_sitio:'E1'}]}},res=response();
  await f.guard.protectManualAltasCor(req,res,()=>{});
  res.json({ok:true});
  await Promise.all([req.bltnowInsFlGuardReleaseCor(),req.bltnowInsFlGuardReleaseCor()]);
  assert.equal(f.events.filter(x=>x==='UNLOCK').length,1);
  assert.equal(f.events.filter(x=>x==='RELEASE_CONN').length,1);
});
test('F5: integracion GAS con 409 sigue fail-closed, no ejecuta controller',async()=>{
  const f=syncFixture({human:true}),req={body:{rows:[{id_proyecto:'P555',referencia_sitio:'E1'}]}},res=response();
  let next=0;
  await f.guard.protectManualAltasCor(req,res,()=>next++);
  assert.equal(res.statusCode,409);assert.equal(next,0);
  assert.deepEqual(f.events,['LOCK','LOOKUP','UNLOCK','RELEASE_CONN']);
});
test('F5: integration auth permanece ANTES del guard y del controlador GAS',()=>{
  const s=fs.readFileSync(INS_ROUTE,'utf8');
  assert.match(s,/router\.post\('\/sync', requireInsFlIntegration, protectManualAltasCor, syncWithHeldAltasLockCor\)/);
  assert.match(s,/finally\s*\{\s*if\(typeof req\.bltnowInsFlGuardReleaseCor/);
});

function routeFixture(){
  const events=[];const routes=new Map();
  const express={Router(){return {
    post(name,...handlers){routes.set('POST '+name,handlers);},
    get(){},delete(){},patch(){}
  }}};
  const multer=()=>({single:()=>()=>{}});multer.memoryStorage=()=>({});
  let resolveController;
  const blocker=new Promise(resolve=>{resolveController=resolve;});
  const controller={syncInsFl:async(_req,res)=>{
    events.push('CONTROLLER_START');
    await blocker;
    events.push('CONTROLLER_COMMIT');
    return res.json({ok:true});
  }};
  loadWith(INS_ROUTE,{
    express,multer,
    '../controllers/ins-fl.controller':controller,
    '../controllers/ins-fl-read-cor.controller':{},
    '../modules/instalaciones-administracion/instalaciones-administracion-altas-sync-guard':{protectManualAltasCor(_req,_res,next){next();}},
    '../services/storage/storage-file-policy.service':{getLimits_gnral:()=>({maxFileBytes:1000000})},
    '../middleware/integration-auth.middleware':{requireIntegrationAuthFor:()=>()=>{}},
    '../middleware/information-access-gnral.middleware':{humanInformationGuard_gnral:()=>[()=>{}]},
    '../middleware/project-photo.middleware':{requireProjectPhotoManager_gnral:()=>{},requireCorellianProjectPhotoScope_gnral:()=>{}}
  });
  return {routes,events,resolveController};
}
test('F5: wrapper NO libera candado si cliente corta conexion antes de COMMIT GAS',async()=>{
  const f=routeFixture();const route=f.routes.get('POST /sync');
  assert.equal(route.length,3);
  let releaseCount=0,releaseWhen=null;
  const req={bltnowInsFlGuardReleaseCor:async()=>{releaseCount++;releaseWhen=f.events.length;}};
  const res=response(),errors=[];
  const pending=route[2](req,res,e=>errors.push(e));
  await Promise.resolve();
  res.emit('close');
  assert.equal(releaseCount,0);
  f.resolveController();await pending;
  assert.equal(releaseCount,1);
  assert.deepEqual(f.events,['CONTROLLER_START','CONTROLLER_COMMIT']);
  assert.equal(releaseWhen,2);
  assert.deepEqual(errors,[]);
});

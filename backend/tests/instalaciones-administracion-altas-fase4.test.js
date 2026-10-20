'use strict';
/* BLT NOW - Altas Fase 4: QA de formulas persistidas, procedencia auditada,
 * guard de GAS, job diario y endpoints. SOLO MOCKS; no usa Aiven ni red.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const EventEmitter=require('node:events');
const MOD=path.resolve(__dirname,'../src/modules/instalaciones-administracion');
const JOB=path.resolve(__dirname,'../src/jobs/instalacionesAdministracionCalculados.job.js');
const ROUTES=path.resolve(__dirname,'../src/routes/ins-fl.routes.js');
const FRONT=path.resolve(__dirname,'../../modules/instalaciones-administracion/instalaciones-administracion-altas-captura_cor.js');
const persistence=require(path.join(MOD,'instalaciones-administracion-altas-persist.js'));
const origin=require(path.join(MOD,'instalaciones-administracion-altas-origin.js'));
const capture=require(FRONT);
function mockRequire(file,deps){
  const module={exports:{}};
  const source=fs.readFileSync(file,'utf8');
  new Function('require','module','exports',source)(p=>{
    if(!(p in deps))throw Error('Dependencia no declarada: '+p);
    return deps[p];
  },module,module.exports);
  return module.exports;
}
const example={
  proyecto:'Ejemplo',id_proyecto:'P90001',referencia_sitio:'Elevador 1',
  estatus:'04-M',fecha_visita:'2026-09-14',fecha_ccnr:'2026-09-07',
  fecha_descarga:'2026-09-07',fecha_fin_montaje_planeado:'2026-10-09',
  meses_garantia_actas:'24',meses_mantenimiento_gratuito:'24',
  presupuesto_mantenimiento_cem:'63576'
};

test('calcula y guarda formulas Excel del nuevo equipo como TEXTO SQL',()=>{
  const v=persistence.persistedForRowCor(example,'2026-10-16');
  assert.equal(v.meses_garantia_restantes,'24.000000');
  assert.equal(v.dias_restantes,'-6');
  assert.equal(v.dias_sin_visita,'32');
  assert.equal(v.costo_mensual_mantenimiento_cem,'2649.00');
  assert.equal(v.estatus_completo,'Equipos en Montaje');
  assert.equal(v.dias_sin_ccnr,'39');
  assert.equal(v.anio_termino,null);
  assert.equal('fecha_fin_montaje_real' in v,false);
  assert.equal('fecha_fin_ajuste_real' in v,false);
});
test('fechas invalidas, meses cero y nulos no producen fechas ni costos ficticios',()=>{
  const v=persistence.persistedForRowCor({fecha_visita:'-',presupuesto_mantenimiento_cem:'123',
    meses_mantenimiento_gratuito:'0',fecha_fin_montaje_planeado:'2026-02-30'},'2026-10-20');
  assert.equal(v.costo_mensual_mantenimiento_cem,null);
  assert.equal(v.dias_restantes,null);
  assert.equal(v.dias_sin_visita,null);
});
test('auditoria CREA/POST autentica id_ins_fl + PPNS antes de clasificar origen',async()=>{
  const conn={query:async(sql,params)=>{
    assert.match(sql,/JSON_EXTRACT\(payload_json/);
    assert.match(sql,/tipo_interaccion = 'CREAR'/);
    assert.deepEqual(params,['P90001','P90002']);
    return [[
      {audit_equipment_id:'10',id_referencia:'P90001'},
      {audit_equipment_id:'11',id_referencia:'P90001'},
      {audit_equipment_id:'999',id_referencia:'P90001'},
      {audit_equipment_id:'20',id_referencia:'P90001'}
    ]];
  }};
  const ids=await origin.humanCreatedIdsCor(conn,[
    {id_ins_fl:10,id_proyecto:'P90001'},
    {id_ins_fl:20,id_proyecto:'P90002'}
  ]);
  assert.deepEqual([...ids],[10]);
});
test('identidad sin PK o PPNS no dispara lectura de auditoria',async()=>{
  let calls=0;
  const ids=await origin.humanCreatedIdsCor({query:async()=>{calls++;return [[]]}},
    [{id_ins_fl:null,id_proyecto:'P90001'},{id_ins_fl:1,id_proyecto:null}]);
  assert.equal(ids.size,0);assert.equal(calls,0);
});

test('preflight GAS detecta proyecto + referencia auditada exacta',async()=>{
  const guard=mockRequire(path.join(MOD,'instalaciones-administracion-altas-sync-guard.js'),{
    '../../config/db':{},'../../shared/logger':{error(){}},
    './instalaciones-administracion-altas-origin':{
      humanCreatedIdsCor:async (_conn,rows)=>new Set(rows.filter(row=>row.id_ins_fl===101).map(row=>row.id_ins_fl))
    }
  });
  const conn={query:async(sql,args)=>{
    assert.match(sql,/FROM ins_fl/);
    assert.deepEqual(args,['P90001','Elevador 1']);
    return [[{id_ins_fl:101,id_proyecto:'P90001',referencia_sitio:'Elevador 1'}]];
  }};
  const result=await guard.conflictsCor(conn,[{id_proyecto:'P90001',referencia_sitio:'Elevador 1'}]);
  assert.equal(result.length,1);assert.equal(result[0].id_ins_fl,101);
});
function middlewareFixture({human=false,failed=false,lockBusy=false}={}){
  const calls=[];
  const conn={release(){calls.push('RELEASE_CONN')},async query(sql){
    if(sql.includes('GET_LOCK')){calls.push('LOCK');return [[{granted:lockBusy?0:1}]];}
    if(sql.includes('RELEASE_LOCK')){calls.push('UNLOCK');return [[{released:1}]];}
    if(sql.includes('FROM ins_fl')){
      calls.push('LOOKUP');if(failed)throw Error('sin BD');
      return [[{id_ins_fl:101,id_proyecto:'P90001',referencia_sitio:'Elevador 1'}]];
    }
    throw Error('SQL inesperado');
  }};
  const guard=mockRequire(path.join(MOD,'instalaciones-administracion-altas-sync-guard.js'),{
    '../../config/db':{getConnection:async()=>conn},
    '../../shared/logger':{error:()=>{}},
    './instalaciones-administracion-altas-origin':{
      acquireCor:async conn=>(await conn.query('SELECT GET_LOCK()'))[0][0].granted===1,
      releaseCor:async conn=>(await conn.query('SELECT RELEASE_LOCK()'))[0][0].released===1,
      humanCreatedIdsCor:async()=>new Set(human?[101]:[])
    }
  });
  const res=new EventEmitter();res.statusCode=null;res.payload=null;
  res.status=n=>{res.statusCode=n;return res};res.json=obj=>{res.payload=obj;res.emit('finish');return res};
  const req={body:{rows:[{id_proyecto:'P90001',referencia_sitio:'Elevador 1'}]}};
  let next=0;
  return {calls,req,res,guard,next:()=>{next++},nextCount:()=>next};
}
test('si GAS intenta pisar un alta humana, rechaza TODO el lote con 409',async()=>{
  const f=middlewareFixture({human:true});
  await f.guard.protectManualAltasCor(f.req,f.res,f.next);
  assert.equal(f.res.statusCode,409);
  assert.equal(f.res.payload.code,'INS_FL_SYNC_ALTA_HUMANA_PROTEGIDA');
  assert.equal(f.nextCount(),0);
  assert.deepEqual(f.calls,['LOCK','LOOKUP','UNLOCK','RELEASE_CONN']);
});
test('GAS no conflictivo conserva ruta original y lock hasta fin de respuesta',async()=>{
  const f=middlewareFixture();
  await f.guard.protectManualAltasCor(f.req,f.res,f.next);
  assert.equal(f.nextCount(),1);
  assert.deepEqual(f.calls,['LOCK','LOOKUP']);
  f.res.emit('finish');
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(f.calls,['LOCK','LOOKUP','UNLOCK','RELEASE_CONN']);
});
test('falla Aiven en preflight bloquea GAS (503) sin intentar sincronizar',async()=>{
  const f=middlewareFixture({failed:true});
  await f.guard.protectManualAltasCor(f.req,f.res,f.next);
  assert.equal(f.nextCount(),0);assert.equal(f.res.statusCode,503);
  assert.ok(f.calls.includes('UNLOCK'));
});
test('GAS con candado ocupado no continua a controller',async()=>{
  const f=middlewareFixture({lockBusy:true});
  await f.guard.protectManualAltasCor(f.req,f.res,f.next);
  assert.equal(f.nextCount(),0);assert.equal(f.res.statusCode,503);
  assert.deepEqual(f.calls,['LOCK','RELEASE_CONN']);
});
test('ruta /sync mantiene autenticacion integration y protege altas antes de syncInsFl',()=>{
  const src=fs.readFileSync(ROUTES,'utf8');
  assert.match(src,/router\.post\('\/sync', requireInsFlIntegration, protectManualAltasCor, syncWithHeldAltasLockCor\)/);
});

test('motor diario mantiene calculo heredado para GAS y usa Excel solo en altas humanas',()=>{
  const mockRules={TZ_COR:'America/Mexico_City',AUTO_FIELDS_COR:['dias_sin_visita'],
    DEPENDENCY_FIELDS_COR:['estatus','fecha_visita'],parseCivilDate_cor:()=>({kind:'valid'}),
    derivedForRow_cor:()=>({dias_sin_visita:'99'})};
  const job=mockRequire(JOB,{'../config/db':{},'../shared/logger':{error(){},info(){}},
    '../modules/instalaciones-administracion/instalaciones-administracion.auto-rules':mockRules,
    '../modules/instalaciones-administracion/instalaciones-administracion-altas-persist':persistence,
    '../modules/instalaciones-administracion/instalaciones-administracion-altas-origin':{
      humanCreatedIdsCor:async()=>new Set()
    }
  });
  assert.equal('dias_sin_visita' in job.changesForRow_cor({...example,dias_sin_visita:'32'},'2026-10-16',true),false);
  assert.deepEqual(job.changesForRow_cor({...example,dias_sin_visita:'32'},'2026-10-16',false),{dias_sin_visita:'99'});
  assert.ok(job.COMPARISON_FIELDS.includes('presupuesto_mantenimiento_cem'));
});
test('job diario recorre filas y no modifica terminaciones reales de equipos humanos',async()=>{
  const events=[];
  const row={id_ins_fl:101,...example,dias_sin_visita:'0',estatus_completo:'',
    fecha_fin_montaje_real:'2026-10-10',fecha_fin_ajuste_real:'2026-10-15'};
  const mockRules={TZ_COR:'America/Mexico_City',AUTO_FIELDS_COR:['dias_sin_visita','estatus_completo'],
    DEPENDENCY_FIELDS_COR:['estatus','fecha_visita','fecha_ccnr','fecha_fin_montaje_planeado','fecha_fin_montaje_modificado'],
    parseCivilDate_cor:()=>({kind:'valid'}),derivedForRow_cor:()=>({dias_sin_visita:'99',estatus_completo:'legacy'})};
  const db={getConnection:async()=>connection};
  const connection={release(){events.push('RELEASE')},async query(sql,params){
    if(sql.includes('GET_LOCK'))return [[{granted:1}]];
    if(sql.includes('RELEASE_LOCK'))return [[{released:1}]];
    if(sql.includes('FROM ins_fl')&&sql.startsWith('SELECT'))return [params[0]===0?[{...row}]:[]];
    if(sql.startsWith('UPDATE ins_fl')){
      events.push('UPDATE');
      const assignments=sql.split('SET ')[1].split(' WHERE ')[0];
      const fields=[...assignments.matchAll(/`([^`]+)`=\?/g)].map(x=>x[1]);
      fields.forEach((field,i)=>{row[field]=params[i]});
      return [{affectedRows:1}];
    }
    throw Error('SQL no simulado: '+sql.slice(0,90));
  }};
  const job=mockRequire(JOB,{'../config/db':db,'../shared/logger':{error(){},info(){}},
    '../modules/instalaciones-administracion/instalaciones-administracion.auto-rules':mockRules,
    '../modules/instalaciones-administracion/instalaciones-administracion-altas-persist':persistence,
    '../modules/instalaciones-administracion/instalaciones-administracion-altas-origin':{
      humanCreatedIdsCor:async()=>new Set([101])
    }
  });
  const result=await job.runDailyCor_cor('2026-10-16');
  assert.equal(result.scanned,1);assert.equal(result.updated,1);
  assert.equal(row.dias_sin_visita,'32');
  assert.equal(row.costo_mensual_mantenimiento_cem,'2649.00');
  assert.equal(row.fecha_fin_montaje_real,'2026-10-10');
  assert.equal(row.fecha_fin_ajuste_real,'2026-10-15');
  assert.deepEqual(events,['UPDATE','RELEASE']);
});
test('UI envia un unico cuerpo rows y NUNCA incluye formulas ni IDs tecnicos',()=>{
  const x=capture.helpers.createRow(1);x.values={proyecto:'Ejemplo',id_proyecto:'P90001',
    referencia_sitio:'Elevador 1',tipo_equipo:null};
  const result=capture.helpers.postRowsCor([x]);
  assert.deepEqual(result.rows,[{proyecto:'Ejemplo',id_proyecto:'P90001',
    referencia_sitio:'Elevador 1',tipo_equipo:null}]);
  x.values.dias_sin_visita='5';
  assert.throws(()=>capture.helpers.postRowsCor([x]),/no editable/);
});
test('UI no considera aceptado un lote parcial o con PK repetida',()=>{
  assert.deepEqual(capture.helpers.acceptedPostCor({ok:true,created:2,records:[
    {id_ins_fl:11},{id_ins_fl:12}]},2),[11,12]);
  for(const answer of [
    {ok:true,created:1,records:[{id_ins_fl:11}]},
    {ok:true,created:2,records:[{id_ins_fl:11},{id_ins_fl:11}]},
    {ok:true,created:2,records:[{id_ins_fl:11},{id_ins_fl:null}]}
  ])assert.throws(()=>capture.helpers.acceptedPostCor(answer,2));
});
test('frontend confirma, POST una sola vez, relee GET y no reintenta inciertos',()=>{
  const s=fs.readFileSync(FRONT,'utf8');
  assert.match(s,/env\.confirm\('Crear /);
  assert.match(s,/method:'POST'/);
  assert.match(s,/GET verificados/);
  assert.match(s,/uncertain=true/);
  assert.match(s,/NO reintentes/);
  assert.match(s,/\.refresh\(\{force:true\}\)/);
  assert.doesNotMatch(s,/(?:localStorage|sessionStorage|indexedDB)\./);
});

test('edicion posterior de equipo nuevo recalcula Excel; legado conserva reglas previas',async()=>{
  const repo={comparable_cor:v=>v==null?null:String(v)};
  const rules={derivedForRow_cor:()=>({dias_sin_visita:'999'})};
  const auto=mockRequire(path.join(MOD,'instalaciones-administracion.auto-service.js'),{
    '../../config/db':{},'../ventas/ventas-visibility.service':{},
    './instalaciones-administracion.service':{},
    './instalaciones-administracion.repository':repo,
    './instalaciones-administracion.audit-service':{},
    './instalaciones-administracion.constants':{GROUPS_COR:{},ALL_OPERATIONAL_FIELDS_COR:[]},
    './instalaciones-administracion.validation':{},
    './instalaciones-administracion.field-policy':{},
    './instalaciones-administracion.auto-rules':rules,
    './instalaciones-administracion-altas-persist':persistence,
    './instalaciones-administracion-altas-origin':{}
  });
  const before={id_ins_fl:101,...example, dias_sin_visita:'32'};
  const human=await auto.rowChanges_cor({},before,'fecha_visita','2026-10-01','2026-10-16',true);
  assert.equal(human.dias_sin_visita,'15');
  assert.equal(human.fecha_visita,'2026-10-01');
  assert.ok(!Object.keys(human).includes('fecha_fin_montaje_real'));
  const legacy=await auto.rowChanges_cor({},before,'fecha_visita','2026-10-01','2026-10-16',false);
  assert.equal(legacy.dias_sin_visita,'999');
});
test('edicion directa del nuevo equipo rechaza modificar formula desde HTTP',async()=>{
  const events=[];
  const row={id_ins_fl:101,...example,costo_mensual_mantenimiento_cem:'2649.00'};
  const conn={async beginTransaction(){events.push('BEGIN')},
    async rollback(){events.push('ROLLBACK')},release(){events.push('RELEASE')},
    async query(){throw Error('No deberia intentar UPDATE')}};
  const rules={
    assertManualFields_cor:changes=>Object.keys(changes)[0],
    knownError_cor:(statusCode,code,message)=>Object.assign(Error(message),{statusCode,code}),
    zonedToday_cor:()=>'2026-10-20',derivedForRow_cor:()=>({})
  };
  const repo={comparable_cor:v=>v==null?null:String(v),
    parseProjectKey_cor:key=>({key,params:[key.slice(2)]}),
    getRecordById_cor:async()=>({...row})};
  const auto=mockRequire(path.join(MOD,'instalaciones-administracion.auto-service.js'),{
    '../../config/db':{getConnection:async()=>conn},
    '../ventas/ventas-visibility.service':{resolveVisibilityScope:async()=>({mode:'ALL'})},
    './instalaciones-administracion.service':{
      ensureFullEditPermission_cor:async()=>{},
      resolveGroupPermissions_cor:async()=>({proyecto:{can_view:true}})
    },
    './instalaciones-administracion.repository':repo,
    './instalaciones-administracion.audit-service':{},
    './instalaciones-administracion.constants':{
      GROUPS_COR:{costos:{fields:['costo_mensual_mantenimiento_cem']}},
      ALL_OPERATIONAL_FIELDS_COR:['costo_mensual_mantenimiento_cem']
    },
    './instalaciones-administracion.validation':{
      positiveId_cor:v=>Number(v), normalizeGroupUpdate_cor:(_group,body)=>body.changes
    },
    './instalaciones-administracion.field-policy':{normalizeEditedFields_cor:v=>v},
    './instalaciones-administracion.auto-rules':rules,
    './instalaciones-administracion-altas-persist':persistence,
    './instalaciones-administracion-altas-origin':{humanCreatedIdsCor:async()=>new Set([101])}
  });
  await assert.rejects(()=>auto.updateDirect_cor({contextUser:{id_SB:25}},'P:P90001',101,{
    changes:{costo_mensual_mantenimiento_cem:'100'},
    expected:{costo_mensual_mantenimiento_cem:'2649.00'}
  }),{statusCode:400,code:'INSTALACIONES_ADMIN_ALTA_CALCULADO_SOLO_LECTURA'});
  assert.deepEqual(events,['BEGIN','ROLLBACK','RELEASE']);
});

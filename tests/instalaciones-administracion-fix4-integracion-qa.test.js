'use strict';
// [Aster | 2026-10-09 | ASTER-MG | FIX_4_INSTALACIONES_ADMINISTRACION_INTEGRACION_QA_V001]
// Pruebas offline: sin red, sin escrituras a Aiven ni despliegues.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ROOT = path.resolve(__dirname,'..');
const API_ROOT='/api/instalaciones/administracion';
const source = file => fs.readFileSync(path.join(ROOT,file),'utf8');
const qa = require('../validation/instalaciones-administracion-fix4-readonly-smoke');

const serviceFile = path.join(ROOT,'backend/src/modules/instalaciones-administracion/instalaciones-administracion.service.js');
function mockService_cor(stubs) {
  delete require.cache[serviceFile];
  const previous=Module._load;
  try {
    Module._load=function(request,parent,isMain){
      if (parent?.filename===serviceFile && Object.hasOwn(stubs,request)) return stubs[request];
      return previous.call(this,request,parent,isMain);
    };
    return require(serviceFile);
  } finally {Module._load=previous;}
}

function createService_cor() {
  let access=true,writeCount=0,auditCount=0;
  const data = {id_ins_fl:7,id_proyecto:'P200',proyecto:'Proyecto A',id_sup:5,estatus:'En proceso'};
  const constant={
    GROUPS_COR:{proyecto:{label:'Proyecto',fields:['id_proyecto','proyecto','estatus']},responsables:{label:'Responsables',fields:['id_sup']}},
    SYSTEM_READONLY_FIELDS_COR:['id_ins_fl','updated_at','created_at'],
    POLICY_PENDING_FIELDS_COR:['id_proyecto'],DERIVED_POLICY_PENDING_FIELDS_COR:[],
    RESPONSIBLE_ID_FIELDS_COR:['id_sup'],ALL_OPERATIONAL_FIELDS_COR:['id_proyecto','proyecto','estatus','id_sup'],
    GROUP_PERMISSIONS_COR:{proyecto:{view:'PROYECTO.VER',edit:'PROYECTO.EDITAR'},responsables:{view:'RESPONSABLES.VER',edit:'RESPONSABLES.EDITAR'}},
    ACCESS_PERMISSION_COR:'INSTALACIONES_ADMINISTRACION_ACCESO_VISUAL_MODULO.ACCESO_VISUAL'
  };
  const error=(code,message,status=400)=>Object.assign(new Error(message||code),{code,statusCode:status});
  const repository={
    getRecordById_cor:async()=>access?{...data}:null,
    listExistingActiveUsers_cor:async ids=>ids,
    updateRecordById_cor:async({changes,expected,beforeCommit})=>{
      for(const [field,value] of Object.entries(changes)){
        if(String(data[field])!==String(expected[field]))throw error('CONFLICTO','409',409);
      }
      const before={...data};Object.assign(data,changes);writeCount++;
      const after={...data};
      if (data.id_sup!==5) access=false;
      await beforeCommit({connection:{mock:true},before,after,changes});
      return {found:true,changed:true,before,after,changes};
    }
  };
  const validation={
    positiveId_cor:v=>Number(v),knownError_cor:(s,c,m)=>error(c,m,s),
    publicContract_cor:()=>[],VARCHAR_LIMITS_COR:{},
    normalizeGroupUpdate_cor:(g,body)=>{
      if(!constant.GROUPS_COR[g]||!body.changes||!Object.keys(body.changes).length)throw error('CAMBIOS_INVALIDOS');
      return {...body.changes};
    }
  };
  const service=mockService_cor({
    '../../config/db':{},
    '../ventas/ventas-visibility.service':{resolveVisibilityScope:async()=>({mode:'ALL'})},
    '../../services/permissions/effective-permission.service':{hasEffectivePermission:async()=>true},
    './instalaciones-administracion.repository':repository,
    './instalaciones-administracion.audit-service':{recordGroupUpdate_cor:async(_req,input)=>{auditCount++;assert.equal(input.executor.mock,true);return {id_interaccion:9};}},
    './instalaciones-administracion.constants':constant,
    './instalaciones-administracion.validation':validation,
    './instalaciones-administracion.field-policy':{fieldMeta_cor:()=>({kind:'text'}),normalizeEditedFields_cor:v=>v}
  });
  return {service, data,stats:()=>({access,writeCount,auditCount})};
}

const REQ={contextUser:{id_SB:100},viewerContext:{active:false}};
test('FIX4: PATCH historico no entrega valores posteriores tras perder alcance',async()=>{
  const {service,stats}=createService_cor();
  const response=await service.updateGroup_cor(REQ,7,'responsables',{
    changes:{id_sup:6},expected:{id_sup:5}
  });
  assert.equal(response.changed,true);
  assert.equal(response.group,'responsables');
  assert.deepEqual(response.changed_fields,['id_sup']);
  assert.equal(Object.hasOwn(response,'data'),false);
  assert.equal(Object.hasOwn(response,'after'),false);
  assert.equal(Object.hasOwn(response,'before'),false);
  assert.deepEqual(stats(),{access:false,writeCount:1,auditCount:1});
  await assert.rejects(()=>service.getRecord_cor(REQ,7),{statusCode:404});
});

test('FIX4: PATCH grupo no devuelve postimagen incluso si aun hay acceso',async()=>{
  const {service,stats}=createService_cor();
  const response=await service.updateGroup_cor(REQ,7,'proyecto',{
    changes:{estatus:'Terminado'},expected:{estatus:'En proceso'}
  });
  assert.equal(response.changed,true);
  assert.equal(Object.hasOwn(response,'data'),false);
  assert.deepEqual(stats(),{access:true,writeCount:1,auditCount:1});
  const reload=await service.getRecord_cor(REQ,7);
  assert.equal(reload.data.estatus,'Terminado');
});

test('FIX4: contrato conserva Guard CORELLIAN y sin nueva ruta PATCH sin autorizacion',()=>{
  const route=source('backend/src/modules/instalaciones-administracion/instalaciones-administracion.routes.js');
  assert.match(route,/humanInformationGuard_gnral/);
  assert.match(route,/domain:\s*'CORELLIAN'/);
  assert.match(route,/groupingCodesAny:\s*\['INSTALACIONES'\]/);
  assert.match(route,/permissionCode:\s*ACCESS_PERMISSION_COR/);
  assert.match(route,/requireGroupEdit_cor/);
  assert.match(route,/updateDetail_cor/);
  assert.match(route,/updateMulti_cor/);
});

test('FIX4: repositorio en lote exige PP NS, locks FOR UPDATE, expected y ROLLBACK',()=>{
  const repo=source('backend/src/modules/instalaciones-administracion/instalaciones-administracion.repository.js');
  const service=source('backend/src/modules/instalaciones-administracion/instalaciones-administracion.service.js');
  assert.match(repo,/async function updateProjectBatch_cor/);
  assert.match(repo,/if \(!project\.key\.startsWith\('P:'\)\)/);
  assert.match(repo,/forUpdate: true/);
  assert.match(repo,/String\(row\.id_proyecto \?\? ''\) !== expectedProjectId/);
  assert.match(repo,/concurrencyError_cor\(conflicts\)/);
  assert.match(repo,/await conn\.rollback\(\)/);
  assert.match(service,/const MAX_BATCH_EQUIPMENTS_COR = 20/);
  assert.match(service,/await ensureGroupEditPermission_cor\(req, groupKey\)/);
});

test('FIX4: smoke remoto rechaza ejecucion accidental sin opt-in',()=>{
  assert.throws(()=>qa.parseArgs_cor(['--base-url','https://fake.example/']),/--readonly/);
  assert.throws(()=>qa.parseArgs_cor(['--readonly','--base-url','http://fake.example/']),/HTTPS/);
  assert.throws(()=>qa.parseArgs_cor(['--readonly','--base-url','https://usr:pwd@fake.example/']),/HTTPS/);
  assert.throws(()=>qa.parseArgs_cor(['--readonly','--base-url','https://fake.example/api']),/HTTPS/);
  assert.throws(()=>qa.parseArgs_cor(['--readonly','--base-url','https://fake.example/','--record-id','x']),/entero/);
  const parsed=qa.parseArgs_cor(['--readonly','--base-url','https://fake.example/','--record-id','7']);
  assert.equal(parsed.baseUrl,'https://fake.example');assert.equal(parsed.recordId,7);
});

const contract={ok:true,groups:[
  {key:'proyecto',fields:['proyecto','id_proyecto','estatus'],permissions:{can_view:true,can_edit:true}},
  {key:'equipo',fields:['numero_equipo_fabrica'],permissions:{can_view:true,can_edit:false}},
  {key:'responsables',fields:['id_sup'],permissions:{can_view:false,can_edit:false}},
  ...Array.from({length:8},(_,i)=>({key:'oculto'+i,fields:['campo_secreto_'+i],permissions:{can_view:false,can_edit:false}}))
]};
function fetchSimulator_cor({leak=false,noProjects=false,projectDenied=false}={}){
  const calls=[];
  const fake=async (url,opts)=>{
    assert.equal(opts.method,'GET','El smoke nunca debe escribir');
    assert.equal(opts.redirect,'error');
    const authorized=opts.headers.Authorization==='Bearer permitido';
    const denied=opts.headers.Authorization==='Bearer denegado';
    const pathname=new URL(url).pathname,params=new URL(url).searchParams;
    calls.push({path:pathname,auth:authorized,method:opts.method});
    let status=200,data={ok:true};
    if(!authorized){status=denied?403:401;data={ok:false};}
    else if(pathname===API_ROOT+'/contrato')data={...contract,
      groups:contract.groups.map(g=>projectDenied&&g.key==='proyecto'?{...g,permissions:{can_view:false,can_edit:false}}:g)};
    else if(pathname===API_ROOT+'/registros/id-invalido')status=400;
    else if(pathname===API_ROOT+'/registros')data={ok:true,data:[{id_ins_fl:7,numero_equipo_fabrica:'ELE1',...(!projectDenied?{proyecto:'A',id_proyecto:'P200'}:{}),...(leak?{campo_secreto_1:'dato'}:{})}]};
    else if(pathname===API_ROOT+'/filtros'){
      if(projectDenied)status=403;
      else data={ok:true,estatus:['En proceso'],supervisores:[],permisos:{estatus:true,supervisor:false}};
    }else if(pathname===API_ROOT+'/proyectos'){
      if(projectDenied)status=403;
      else if(params.get('limit')==='51')status=400;
      else data={ok:true,total:noProjects?0:1,data:noProjects?[]:[{project_key:'P:P200',proyecto:'A',id_proyecto:'P200',equipos:2}]};
    }else if(/\/proyectos\/.*\/equipos$/.test(pathname))data={ok:true,total:2,data:[{id_ins_fl:7,proyecto:'A',id_proyecto:'P200',numero_equipo_fabrica:'ELE1'}]};
    else if(pathname===API_ROOT+'/registros/7')data={ok:true,data:{id_ins_fl:7,proyecto:'A',id_proyecto:'P200',estatus:'En proceso'}};
    else if(pathname===API_ROOT+'/registros/99')status=404;
    else throw Error('Endpoint no contemplado en mock: '+pathname);
    return {status,json:async()=>data};
  };
  return {fake,calls};
}

test('FIX4: smoke offline valida proyectos, equipos y detalle sin exponer campos ocultos',async()=>{
  const {fake,calls}=fetchSimulator_cor();
  const result=await qa.smoke_cor({baseUrl:'https://fake.example',deniedRecordId:99},{
    token:'permitido',deniedToken:'denegado',fetch:fake
  });
  assert.ok(result.checks.length>=14,result.checks.length);
  assert.equal(result.skipped.length,0);
  assert.ok(calls.some(c=>c.path.includes('/proyectos/')));
  assert.ok(calls.every(c=>c.method==='GET'));
});

test('FIX4: smoke falla cerrado si GET contiene un campo oculto',async()=>{
  const {fake}=fetchSimulator_cor({leak:true});
  await assert.rejects(()=>qa.smoke_cor({baseUrl:'https://fake.example'},{token:'permitido',fetch:fake}),/no autorizada/);
});

test('FIX4: sin PROYECTO.VER el smoke espera 403 en vista proyectos',async()=>{
  const {fake}=fetchSimulator_cor({projectDenied:true});
  const result=await qa.smoke_cor({baseUrl:'https://fake.example'},{token:'permitido',fetch:fake});
  assert.ok(result.checks.includes('proyectos sin permiso PROYECTO protegidos (403)'));
  assert.ok(result.skipped.some(s=>s.includes('PROYECTO.VER')));
});

test('FIX4: sin proyectos reporta casos no ejecutados y no inventa E2E',async()=>{
  const {fake}=fetchSimulator_cor({noProjects:true});
  const result=await qa.smoke_cor({baseUrl:'https://fake.example'},{token:'permitido',fetch:fake});
  assert.ok(result.skipped.some(s=>s.includes('sin proyectos')));
  assert.ok(result.skipped.some(s=>s.includes('sin --denied-record-id')));
});

test('FIX4: SQL de QA contiene solo lectura y no aplica permisos ni esquema',()=>{
  const sql=source('database/QA_FIX_4_INSTALACIONES_ADMINISTRACION_SOLO_LECTURA_V001.sql');
  assert.doesNotMatch(sql,/\b(CREATE|ALTER|DROP|TRUNCATE|INSERT|UPDATE|DELETE|REPLACE|GRANT|REVOKE|COMMIT|ROLLBACK|START\s+TRANSACTION)\b(?=\s+(TABLE|INTO|FROM|\w+))/i);
  assert.match(sql,/perm_subelemento_acciones/);
  assert.match(sql,/usuario_interacciones/);
  assert.match(sql,/ins_fl/);
});

'use strict';
// [Aster | 2026-10-08 | ASTER-MG | FIX_1_INSTALACIONES_ADMINISTRACION_REDISENO_V001]
// Unitarias con DB y API simuladas. No escribe en Aiven/Azure/GitHub.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname,'..');
const MOD = path.join(ROOT,'backend/src/modules/instalaciones-administracion');
const source = rel => fs.readFileSync(path.join(ROOT,rel),'utf8');
const sqlCalls = [];
const mockDb = {
  query:async (sql,values)=>{
    sqlCalls.push({sql,values});
    if (/SELECT COUNT\(\*\) AS total FROM \(/.test(sql)) return [[{total:2}]];
    if (/COUNT\(\*\) AS total/.test(sql)) return [[{total:1}]];
    if (/GROUP BY project_key/.test(sql)) return [[{project_key:'P:P123',id_proyecto:'P123',proyecto:'Proyecto X',equipos:3}]];
    return [[{id_ins_fl:5,proyecto:'Proyecto X',id_proyecto:'P123',numero_equipo_fabrica:'E-01'}]];
  }
};
function mockedImport(filename,fakes){
  const original=Module._load;
  try{
    Module._load=function(request,parent,isMain){
      if(parent?.filename?.endsWith(filename) && fakes[request])return fakes[request];
      return original.call(this,request,parent,isMain);
    };
    return require(path.join(MOD,filename));
  }finally{Module._load=original;}
}
const repository=mockedImport('instalaciones-administracion.repository.js',{
  '../../config/db':mockDb,
  './instalaciones-administracion.constants':{
    ALL_OPERATIONAL_FIELDS_COR:['proyecto','id_proyecto','referencia_sitio','estatus',
      'numero_equipo_fabrica','tipo_equipo','cliente','id_sup','marca','modelo','ciudad']
  }
});
const error = (statusCode,code,message)=>Object.assign(new Error(message),{statusCode,code});
const service=mockedImport('instalaciones-administracion.service.js',{
  '../../config/db':mockDb,
  '../ventas/ventas-visibility.service':{resolveVisibilityScope:async()=>({mode:'ALL'})},
  '../../services/permissions/effective-permission.service':{hasEffectivePermission:async()=>true},
  './instalaciones-administracion.repository':repository,
  './instalaciones-administracion.audit-service':{},
  './instalaciones-administracion.constants':{
    GROUPS_COR:{proyecto:{fields:['proyecto','id_proyecto','estatus']},responsables:{fields:['id_sup']}},
    GROUP_PERMISSIONS_COR:{proyecto:{view:'a',edit:'b'},responsables:{view:'c',edit:'d'}},
    SYSTEM_READONLY_FIELDS_COR:[],POLICY_PENDING_FIELDS_COR:[],DERIVED_POLICY_PENDING_FIELDS_COR:[],
    RESPONSIBLE_ID_FIELDS_COR:[],ACCESS_PERMISSION_COR:'perm'
  },
  './instalaciones-administracion.validation':{knownError_cor:error,positiveId_cor:Number,
    normalizeGroupUpdate_cor:()=>({}),publicContract_cor:()=>[],VARCHAR_LIMITS_COR:{}},
  './instalaciones-administracion.field-policy':{normalizeEditedFields_cor:x=>x,fieldMeta_cor:()=>({})}
});

test('FIX1: proyecto por PP NS; sin PP NS cada registro es independiente',()=>{
  assert.equal(repository.parseProjectKey_cor('P:P123').sql,'f.id_proyecto = ?');
  assert.match(repository.parseProjectKey_cor('R:42').sql,/f.id_ins_fl = \?/);
  assert.match(repository.parseProjectKey_cor('R:42').sql,/IS NULL/);
  assert.throws(()=>repository.parseProjectKey_cor('R:0'),{statusCode:400});
  assert.throws(()=>repository.parseProjectKey_cor('R:42 OR 1=1'),{statusCode:400});
  assert.throws(()=>repository.parseProjectKey_cor('P:'),{statusCode:400});
});

test('FIX1: busqueda, estatus y supervisor se parametrizan y aplican scope',()=>{
  const b=repository.buildBrowseWhere_cor({
    scope:{mode:'LIMITED',advisorIds:[3,4]},
    search:'ejemplo',estatus:'En proceso',supervisor:'8',projectKey:'P:P123',
    visibleFields:['proyecto','id_proyecto','estatus','id_sup']
  });
  assert.match(b.sql,/f.id_proyecto = \?/);
  assert.match(b.sql,/f\.\`proyecto\` LIKE \?/);
  assert.match(b.sql,/TRIM\(f.estatus\) = \?/);
  assert.match(b.sql,/f.id_sup = \?/);
  assert.match(b.sql,/f\.id_asesor IN/);
  assert.deepEqual(b.params,['P123','%ejemplo%','%ejemplo%','En proceso',8,3,4,3,4,3,4]);
  assert.doesNotMatch(b.sql,/ejemplo|En proceso|P123/);
});

test('FIX1: campos no autorizados no se usan para buscar ni filtrar',()=>{
  const b=repository.buildBrowseWhere_cor({scope:{mode:'ALL'},search:'Cliente',
    visibleFields:['proyecto']});
  assert.doesNotMatch(b.sql,/f\.\`cliente\` LIKE \?/);
  assert.match(b.sql,/f\.\`proyecto\` LIKE \?/);
  assert.throws(()=>repository.buildBrowseWhere_cor({scope:{mode:'ALL'},estatus:'Privado',
    visibleFields:['proyecto']}),/sin permiso/);
  assert.throws(()=>repository.buildBrowseWhere_cor({scope:{mode:'ALL'},supervisor:'1',
    visibleFields:['proyecto']}),/sin permiso/);
});

test('FIX1: resultados de proyectos estan agrupados y paginados por backend',async()=>{
  sqlCalls.length=0;
  const output=await repository.listProjects_cor({scope:{mode:'ALL'},search:'',estatus:'',supervisor:'',
    visibleFields:['proyecto','id_proyecto'],limit:20,offset:0});
  assert.equal(output.total,2);
  assert.equal(output.data[0].project_key,'P:P123');
  assert.equal(output.data[0].equipos,3);
  assert.equal(sqlCalls.length,2);
  assert.match(sqlCalls[0].sql,/GROUP BY project_key/);
  assert.match(sqlCalls[1].sql,/LIMIT \? OFFSET \?/);
  assert.equal(sqlCalls[1].values.at(-2),20);
});

test('FIX1: listado de equipos no devuelve cliente ni supervisor no autorizado',async()=>{
  sqlCalls.length=0;
  await repository.listProjectEquipments_cor({scope:{mode:'ALL'},projectKey:'P:P123',
    visibleFields:['proyecto','id_proyecto','numero_equipo_fabrica'],limit:30,offset:0});
  const query=sqlCalls[1].sql;
  assert.match(query,/f\.\`numero_equipo_fabrica\`/);
  assert.doesNotMatch(query,/f\.\`cliente\`/);
  assert.doesNotMatch(query,/supervisor_display|JOIN usuarios/);
  assert.match(query,/ORDER BY f.id_ins_fl ASC/);
});

test('FIX1: filtro supervisor usa FK id_sup (no texto legado)',()=>{
  const b=repository.buildBrowseWhere_cor({scope:{mode:'ALL'},supervisor:'SIN_ASIGNAR',
    visibleFields:['id_sup']});
  assert.match(b.sql,/f.id_sup IS NULL/);
  assert.doesNotMatch(b.sql,/supervisor_fl|supervisor_nombre/);
});

test('FIX1: un proyecto requiere VER y supervisor requiere VER de responsables',()=>{
  const allowed={proyecto:{can_view:true},responsables:{can_view:true}};
  const denied={proyecto:{can_view:true},responsables:{can_view:false}};
  assert.equal(service.normalizeBrowse_cor({supervisor:'10'},allowed).supervisor,'10');
  assert.throws(()=>service.normalizeBrowse_cor({supervisor:'10'},denied),{statusCode:403});
  assert.throws(()=>service.normalizeBrowse_cor({},{proyecto:{can_view:false}}),{statusCode:403});
  assert.throws(()=>service.normalizeBrowse_cor({supervisor:'abc'},allowed),{statusCode:400});
  assert.throws(()=>service.normalizeBrowse_cor({offset:'-10'},allowed),{statusCode:400});
  assert.throws(()=>service.normalizeBrowse_cor({limit:'999'},allowed),{statusCode:400});
});

test('FIX1: no crea tablas, no habilita mutacion masiva ni modifica permisos',()=>{
  const files=['backend/src/modules/instalaciones-administracion/instalaciones-administracion.repository.js',
    'backend/src/modules/instalaciones-administracion/instalaciones-administracion.service.js',
    'backend/src/modules/instalaciones-administracion/instalaciones-administracion.routes.js'];
  const all=files.map(source).join('\n');
  assert.doesNotMatch(all,/CREATE\s+TABLE|ALTER\s+TABLE|INSERT\s+INTO|DELETE\s+FROM\s+ins_fl/i);
  assert.match(all,/domain: 'CORELLIAN'/);
  assert.match(all,/groupingCodesAny: \['INSTALACIONES'\]/);
  assert.match(all,/router\.patch\(/);
  assert.doesNotMatch(all,/administracion\/lote|administracion\/masivo/i);
});

function fakeElement(id){
  const listeners={};
  return {id,dataset:{},innerHTML:'',textContent:'',hidden:false,disabled:false,value:'',
    listeners,addEventListener(t,fn){(listeners[t]??=[]).push(fn);},
    emit(t,e){for(const fn of listeners[t]||[])fn(e||{});},
    classList:{toggle(){}},querySelector(){return null;},querySelectorAll(){return [];},
    setAttribute(){},focus(){}};
}
function harness(){
  const ids=['view-instalaciones-administracion','iadm-cor-status','iadm-cor-alert',
    'iadm-cor-search-form','iadm-cor-search-input','iadm-cor-filter-status',
    'iadm-cor-filter-supervisor','iadm-cor-results','iadm-cor-search-meta',
    'iadm-cor-projects','iadm-cor-project','iadm-cor-project-title','iadm-cor-project-meta',
    'iadm-cor-project-pagination','iadm-cor-equipment-list','iadm-cor-equipment-pagination',
    'iadm-cor-selected','iadm-cor-empty','iadm-cor-group-picker','iadm-cor-groups',
    'iadm-cor-system-grid','iadm-cor-record-title','iadm-cor-record-tags',
    'iadm-cor-refresh','iadm-cor-search-btn','iadm-cor-clear','iadm-cor-change-record','iadm-cor-back-projects'];
  const nodes=Object.fromEntries(ids.map(id=>[id,fakeElement(id)]));
  const listeners={};const calls=[];
  const document={getElementById:id=>nodes[id]||null,
    addEventListener:t=>(listeners[t]??=[]),dispatchEvent:()=>{}};
  const auth={getToken:()=> 't1',getActorUser:()=>({id_SB:1}),getUser:()=>({id_SB:1}),
    getViewUser:()=>null,isViewingAs:()=>false,
    async api(url,opt){
      calls.push({url,method:opt.method});
      if(url.endsWith('/contrato'))return {groups:[{key:'proyecto',label:'Proyecto',fields:['proyecto'],
        permissions:{can_view:true,can_edit:false}}],system_readonly_fields:[],field_meta:{}};
      if(url.endsWith('/filtros'))return {permisos:{estatus:true,supervisor:true},
        estatus:['En proceso','Completado'],supervisores:[{id:7,nombre:'Supervisor 7'}],sin_supervisor:true};
      if(url.includes('/proyectos?'))return {data:[{project_key:'P:P123',id_proyecto:'P123',
        proyecto:'Proyecto X',equipos:2}],total:1,limit:20,offset:0};
      if(url.includes('/equipos?'))return {data:[{id_ins_fl:11,proyecto:'Proyecto X',
        numero_equipo_fabrica:'E-11',estatus:'En proceso'}],total:1,limit:30,offset:0};
      if(url.endsWith('/registros/11'))return {data:{id_ins_fl:11,proyecto:'Proyecto X',
        numero_equipo_fabrica:'E-11',estatus:'En proceso'}};
      throw new Error('Unexpected URL '+url);
    }};
  const window={ManttoAuth:auth,ManttoPermissions:{apply(){}},confirm:()=>true,
    ManttoRouter:{getCurrent:()=>({route:'instalaciones-administracion'})}};
  const view=nodes['view-instalaciones-administracion'];
  const context=vm.createContext({window,document,Promise,URLSearchParams,Date,Number,String,
    Set,Object,Boolean,fetch:async()=>({ok:true,text:async()=>'<div>UI</div>'})});
  vm.runInContext(source('modules/instalaciones-administracion/instalaciones-administracion_cor.js'),context);
  return {nodes,calls,view,app:window.ManttoInstalacionesAdministracion_cor};
}
function click(view,kind,value){
  const target={closest(selector){
    if(selector.startsWith('[data-'+kind+']'))return {dataset:{[kind.replace(/-([a-z])/g,(_,v)=>v.toUpperCase())]:value}};
    return null;
  }};
  view.emit('click',{target});
}
async function settle(){await new Promise(r=>setTimeout(r,0));}

test('FIX1: flujo UI Proyectos -> Equipos -> Detalle; filtros backend',async()=>{
  const h=harness();await h.app.init();
  assert.match(h.nodes['iadm-cor-results'].innerHTML,/Proyecto X/);
  assert.equal(h.nodes['iadm-cor-projects'].hidden,false);
  h.nodes['iadm-cor-filter-status'].value='En proceso';
  h.nodes['iadm-cor-filter-status'].emit('change');await settle();
  assert.ok(h.calls.some(c=>c.url.includes('/proyectos?') && c.url.includes('estatus=En+proceso')));
  h.nodes['iadm-cor-filter-supervisor'].value='7';
  h.nodes['iadm-cor-filter-supervisor'].emit('change');await settle();
  assert.ok(h.calls.some(c=>c.url.includes('supervisor=7')));
  click(h.view,'project-key','P:P123');await settle();
  assert.equal(h.nodes['iadm-cor-project'].hidden,false);
  assert.match(h.nodes['iadm-cor-equipment-list'].innerHTML,/E-11/);
  assert.ok(h.calls.some(c=>c.url.includes('/proyectos/P%3AP123/equipos?')));
  click(h.view,'record-id','11');await settle();
  assert.equal(h.nodes['iadm-cor-selected'].hidden,false);
  assert.match(h.nodes['iadm-cor-record-title'].textContent,/E-11/);
  h.nodes['iadm-cor-change-record'].emit('click');
  assert.equal(h.nodes['iadm-cor-project'].hidden,false);
  assert.equal(h.nodes['iadm-cor-selected'].hidden,true);
  assert.equal(h.calls.some(c=>c.method==='PATCH'),false);
});

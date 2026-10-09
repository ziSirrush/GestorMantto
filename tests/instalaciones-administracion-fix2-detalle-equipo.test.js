'use strict';
// [Aster | 2026-10-08 | ASTER-MG | FIX_2_INSTALACIONES_ADMINISTRACION_DETALLE_EQUIPO_V001]
// Pruebas locales. MySQL, auditoria y frontend se simulan: sin E2E ni escrituras externas.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const Module=require('node:module');
const ROOT=path.resolve(__dirname,'..');
const BASE=path.join(ROOT,'backend/src/modules/instalaciones-administracion');
const load=rel=>fs.readFileSync(path.join(ROOT,rel),'utf8');
const runMocked=(filename,stubs)=>{
  const before=Module._load;
  try{
    Module._load=function(request,parent,isMain){
      if(parent?.filename?.endsWith(filename)&&Object.prototype.hasOwnProperty.call(stubs,request)) return stubs[request];
      return before.call(this,request,parent,isMain);
    };
    return require(path.join(BASE,filename));
  }finally{Module._load=before;}
};
let authAllow=()=>true;
let auditFailAt=Infinity, audits=[];
let sqlScenario=null;
const db={
  query:async(sql,params)=>{
    if (/FROM usuarios/.test(sql))return [[{id_SB:7},{id_SB:8}]];
    throw new Error('DB query inesperada: '+sql);
  },
  getConnection:async()=>sqlScenario.connection()
};
const repository=runMocked('instalaciones-administracion.repository.js',{'../../config/db':db});
const service=runMocked('instalaciones-administracion.service.js',{
  '../../config/db':db,
  '../ventas/ventas-visibility.service':{resolveVisibilityScope:async()=>({mode:'ALL'})},
  '../../services/permissions/effective-permission.service':{
    hasEffectivePermission:async(_id,code)=>authAllow(code)
  },
  './instalaciones-administracion.repository':repository,
  './instalaciones-administracion.audit-service':{
    recordGroupUpdate_cor:async(req,payload)=>{
      audits.push({...payload});
      assert.equal(payload.executor,sqlScenario.rawConnection,'misma conexion SQL');
      if(audits.length===auditFailAt)throw new Error('Audit insert failed');
      return {id_interaccion:audits.length};
    }
  }
});
const req={contextUser:{id_SB:99},viewerContext:{active:false}};
function record(values={}){
  const row={id_ins_fl:7,id_proyecto:'P200',referencia_sitio:'Elevador 1',
    estatus:'En proceso',comentarios_fl:'Antes',avance_oc:'10%',
    presupuesto_mantenimiento_cem:'100.00',...values};
  let commits=0,rollbacks=0,updates=0,statements=[];
  return {
    row,
    stats:()=>({commits,rollbacks,updates,statements}),
    connection(){
      let snapshot=null;
      const connection={
        beginTransaction:async()=>{snapshot={...row};statements.push('BEGIN');},
        query:async(sql,params=[])=>{
          statements.push(sql);
          if(/SELECT f\.\*/.test(sql))return [[{...row}]];
          if(/UPDATE ins_fl/.test(sql)){
            updates++;
            for(const [i,m] of [...sql.matchAll(/`(\w+)` = \?/g)].entries())row[m[1]]=params[i];
            return [{affectedRows:1}];
          }
          throw new Error('SQL inesperado');
        },
        commit:async()=>{commits++;statements.push('COMMIT');},
        rollback:async()=>{rollbacks++;Object.assign(row,snapshot);statements.push('ROLLBACK');},
        release:()=>{}
      };
      this.rawConnection=connection;
      return connection;
    },rawConnection:null
  };
}
function payload(){return {groups:{
  proyecto:{changes:{estatus:'Terminado'},expected:{estatus:'En proceso'}},
  seguimiento:{changes:{comentarios_fl:'Despues',avance_oc:'25%'},
    expected:{comentarios_fl:'Antes',avance_oc:'10%'}}
}};}
function configure(values={}){sqlScenario=record(values);audits=[];auditFailAt=Infinity;authAllow=()=>true;}

test('FIX2: exige groups, cambios parciales y valores originales por grupo',()=>{
  assert.throws(()=>service.normalizeDetailUpdate_cor({}),{statusCode:400});
  assert.throws(()=>service.normalizeDetailUpdate_cor({groups:[]}),{statusCode:400});
  assert.throws(()=>service.normalizeDetailUpdate_cor({groups:{inexistente:{changes:{a:1},expected:{a:1}}}}),{statusCode:404});
  assert.throws(()=>service.normalizeDetailUpdate_cor({groups:{proyecto:{changes:{estatus:'N'}}}}),{statusCode:400});
  assert.throws(()=>service.normalizeDetailUpdate_cor({groups:{proyecto:{changes:{id_proyecto:'OTRO'},expected:{id_proyecto:'P200'}}}}),{statusCode:409});
  assert.throws(()=>service.normalizeDetailUpdate_cor({groups:{costos:{changes:{ciudad:'OTRA'},expected:{ciudad:'X'}}}}),{statusCode:400});
  assert.throws(()=>service.normalizeDetailUpdate_cor({groups:{seguimiento:{changes:{comentarios_fl:'X'},expected:{comentarios_fl:'Y'},extra:1}}}),{statusCode:400});
  assert.throws(()=>service.normalizeDetailUpdate_cor({groups:{proyecto:{changes:{estatus:'X'},expected:{estatus:'E'}}},id_ins_fl:8}),{statusCode:400});
  const valid=service.normalizeDetailUpdate_cor(payload());
  assert.deepEqual(Object.keys(valid.selected),['proyecto','seguimiento']);
  assert.equal(valid.expected.estatus,'En proceso');
  assert.equal(valid.changes.avance_oc,'25%');
});

test('FIX2: una transaccion y un UPDATE para 3 campos en 2 grupos; audita ambos',async()=>{
  configure();
  const result=await service.updateDetail_cor(req,7,payload());
  assert.equal(result.id_ins_fl,7);
  assert.equal(result.changed,true);
  assert.deepEqual(result.changed_groups,['proyecto','seguimiento']);
  assert.deepEqual(result.changed_fields,['estatus','comentarios_fl','avance_oc']);
  assert.equal('data' in result,false,'no expone informacion posterior sin Guard');
  assert.equal(sqlScenario.row.estatus,'Terminado');
  assert.equal(sqlScenario.row.comentarios_fl,'Despues');
  assert.equal(sqlScenario.row.presupuesto_mantenimiento_cem,'100.00');
  assert.deepEqual(Object.fromEntries(Object.entries(sqlScenario.stats()).filter(([key])=>key!=='statements')),
    {commits:1,rollbacks:0,updates:1});
  assert.equal(audits.length,2);
  assert.deepEqual(Object.keys(audits[0].changes),['estatus']);
  assert.deepEqual(Object.keys(audits[1].changes),['comentarios_fl','avance_oc']);
  const queries=sqlScenario.stats().statements;
  assert.ok(queries.indexOf('COMMIT')>queries.findIndex(x=>/UPDATE ins_fl/.test(x)));
});

test('FIX2: permisos EDITAR necesarios por cada grupo (sin permiso no escribe)',async()=>{
  configure();authAllow=code=>!code.includes('SEGUIMIENTO');
  await assert.rejects(()=>service.updateDetail_cor(req,7,payload()),{statusCode:403});
  assert.equal(sqlScenario.stats().updates,0);
  assert.equal(sqlScenario.stats().commits,0);
  assert.equal(audits.length,0);
});

test('FIX2: visor siempre solo lectura, aunque herede roles de edicion',async()=>{
  configure();
  await assert.rejects(()=>service.updateDetail_cor({...req,viewerContext:{active:true}},7,payload()),{statusCode:403});
  assert.equal(sqlScenario.stats().updates,0);
});

test('FIX2: conflicto 409 en un campo cancela TODOS los grupos sin auditoria',async()=>{
  configure({comentarios_fl:'Cambio externo'});
  await assert.rejects(()=>service.updateDetail_cor(req,7,payload()),{statusCode:409,code:'INSTALACIONES_ADMINISTRACION_CONFLICTO_CONCURRENCIA'});
  assert.equal(sqlScenario.row.estatus,'En proceso');
  assert.equal(sqlScenario.stats().updates,0);
  assert.equal(sqlScenario.stats().rollbacks,1);
  assert.equal(audits.length,0);
});

test('FIX2: error en la segunda auditoria revierte los cambios de TODOS los grupos',async()=>{
  configure();auditFailAt=2;
  await assert.rejects(()=>service.updateDetail_cor(req,7,payload()),/Audit insert failed/);
  assert.equal(sqlScenario.row.estatus,'En proceso');
  assert.equal(sqlScenario.row.comentarios_fl,'Antes');
  assert.equal(sqlScenario.stats().updates,1);
  assert.equal(sqlScenario.stats().commits,0);
  assert.equal(sqlScenario.stats().rollbacks,1);
});

test('FIX2: sin diferencias reales no hace UPDATE ni auditoria',async()=>{
  configure();
  const p={groups:{proyecto:{changes:{estatus:'En proceso'},expected:{estatus:'En proceso'}}}};
  const out=await service.updateDetail_cor(req,7,p);
  assert.equal(out.changed,false);
  assert.deepEqual(out.changed_groups,[]);
  assert.equal(sqlScenario.stats().updates,0);
  assert.equal(sqlScenario.stats().commits,1);
  assert.equal(audits.length,0);
});

test('FIX2: identifica un unico registro y no abre endpoint de edicion masiva',()=>{
  const routes=load('backend/src/modules/instalaciones-administracion/instalaciones-administracion.routes.js');
  const svc=load('backend/src/modules/instalaciones-administracion/instalaciones-administracion.service.js');
  assert.match(routes,/router\.patch\(\s*'\/administracion\/registros\/:id\/detalle'/);
  assert.match(routes,/\.\.\.accessGuard_cor,\s*controller\.updateDetail_cor/);
  assert.match(svc,/ensureGroupEditPermission_cor\(req, groupKey\)/);
  assert.match(svc,/beforeCommit: async/);
  assert.doesNotMatch(routes,/registros\/masivo|\/lote|\/bulk/);
  assert.doesNotMatch(svc,/CREATE TABLE|ALTER TABLE/i);
});

function fakeElement(id){
  const handlers={};
  return {id,dataset:{},innerHTML:'',textContent:'',hidden:false,disabled:false,value:'',
    classList:{toggle(){}},addEventListener:(t,h)=>{(handlers[t]??=[]).push(h);},
    emit:(t,event)=>{for(const h of handlers[t]||[])h(event);},
    querySelector(){return null;},querySelectorAll(){return [];},setAttribute(){},focus(){}};
}
function domHarness({onPatch}={}){
  const ids=['view-instalaciones-administracion','iadm-cor-status','iadm-cor-alert',
    'iadm-cor-search-form','iadm-cor-search-input','iadm-cor-filter-status',
    'iadm-cor-filter-supervisor','iadm-cor-results','iadm-cor-search-meta',
    'iadm-cor-projects','iadm-cor-project','iadm-cor-project-title','iadm-cor-project-meta',
    'iadm-cor-project-pagination','iadm-cor-equipment-list','iadm-cor-equipment-pagination',
    'iadm-cor-selected','iadm-cor-empty','iadm-cor-group-picker','iadm-cor-groups',
    'iadm-cor-system-grid','iadm-cor-record-title','iadm-cor-record-tags',
    'iadm-cor-refresh','iadm-cor-search-btn','iadm-cor-clear','iadm-cor-change-record',
    'iadm-cor-back-projects','iadm-cor-detail-edit-btn','iadm-cor-detail-hint'];
  const nodes=Object.fromEntries(ids.map(id=>[id,fakeElement(id)]));
  let row={id_ins_fl:7,proyecto:'Fase 2',id_proyecto:'P200',estatus:'En proceso',
    comentarios_fl:'Antes',presupuesto_mantenimiento_cem:'100.00'};
  const contract={groups:[
    {key:'proyecto',label:'Proyecto',fields:['proyecto','estatus'],editable_fields:['estatus'],permissions:{can_view:true,can_edit:true}},
    {key:'seguimiento',label:'Seguimiento',fields:['comentarios_fl'],editable_fields:['comentarios_fl'],permissions:{can_view:true,can_edit:true}},
    {key:'costos',label:'Costos',fields:['presupuesto_mantenimiento_cem'],editable_fields:[],permissions:{can_view:true,can_edit:false}}
  ],field_meta:{estatus:{kind:'text',max_length:255},comentarios_fl:{kind:'textarea',max_length:20000},
    presupuesto_mantenimiento_cem:{kind:'money',max_length:255}},system_readonly_fields:['id_ins_fl']};
  const calls=[];
  const auth={getToken:()=> 't',getActorUser:()=>({id_SB:99}),getUser:()=>({id_SB:99}),getViewUser:()=>null,isViewingAs:()=>false,
    async api(url,options){
      calls.push({url,options});
      if(url.endsWith('/contrato'))return contract;
      if(url.endsWith('/filtros'))return {permisos:{estatus:true,supervisor:false},estatus:['En proceso'],supervisores:[]};
      if(url.includes('/proyectos?'))return {data:[],total:0};
      if(url.endsWith('/registros/7'))return {data:{...row}};
      if(url.endsWith('/registros/7/detalle')){
        if(onPatch)return onPatch(url,options);
        const p=JSON.parse(options.body);
        for(const group of Object.values(p.groups))Object.assign(row,group.changes);
        return {ok:true,changed:true};
      }
      throw new Error('URL inesperada '+url);
    }
  };
  const window={ManttoAuth:auth,ManttoPermissions:{apply(){}},ManttoRouter:{getCurrent:()=>({route:'instalaciones-administracion'})},confirm:()=>true};
  const doc={getElementById(id){if(!nodes[id]&&id.startsWith('iadm-cor-input-'))nodes[id]=fakeElement(id);return nodes[id]||null;},
    addEventListener(){},dispatchEvent(){}};
  const ctx=vm.createContext({window,document:doc,Promise,URLSearchParams,Date,Number,String,Set,Object,Boolean,
    fetch:async()=>({ok:true,text:async()=>'<div>UI</div>'})});
  vm.runInContext(load('modules/instalaciones-administracion/instalaciones-administracion_cor.js'),ctx);
  const view=nodes['view-instalaciones-administracion'];
  const action=(name)=>view.emit('click',{target:{closest(selector){
    if(selector==='[data-action]')return {dataset:{action:name}};
    return null;
  }}});
  const input=(field,value)=>{
    nodes['iadm-cor-input-'+field]=fakeElement('iadm-cor-input-'+field);
    nodes['iadm-cor-input-'+field].value=value;
    view.emit('input',{target:{dataset:{fieldControl:field}}});
  };
  const send=()=>view.emit('submit',{target:{id:'iadm-cor-edit-form'},preventDefault(){}});
  return {nodes,calls,view,window,action,input,send,
    init:()=>window.ManttoInstalacionesAdministracion_cor.init({id:7})};
}
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
test('FIX2: ficha muestra todas las secciones y un unico formulario de equipo',async()=>{
  const h=domHarness();await h.init();h.action('start-edit');await tick();
  const markup=h.nodes['iadm-cor-groups'].innerHTML;
  assert.equal((markup.match(/<details class="iadm-cor-group/g)||[]).length,3);
  assert.equal((markup.match(/<form id="iadm-cor-edit-form"/g)||[]).length,1);
  assert.match(markup,/data-detail-group="proyecto"/);
  assert.match(markup,/data-detail-group="seguimiento"/);
  assert.match(markup,/data-detail-group="costos"/);
  assert.match(markup,/Guardar cambios del equipo/);
  assert.match(markup,/data-locked="true"/);
});

test('FIX2: UI envia dos grupos en UN PATCH al ID del equipo, sin campo readonly',async()=>{
  const h=domHarness();await h.init();h.action('start-edit');await tick();
  h.input('estatus','Terminado');h.input('comentarios_fl','Despues');
  h.send();await tick();await tick();
  const patch=h.calls.filter(c=>c.options.method==='PATCH');
  assert.equal(patch.length,1);
  assert.match(patch[0].url,/\/registros\/7\/detalle$/);
  const data=JSON.parse(patch[0].options.body);
  assert.deepEqual(Object.keys(data.groups),['proyecto','seguimiento']);
  assert.deepEqual(data.groups.proyecto,{changes:{estatus:'Terminado'},expected:{estatus:'En proceso'}});
  assert.deepEqual(data.groups.seguimiento,{changes:{comentarios_fl:'Despues'},expected:{comentarios_fl:'Antes'}});
  assert.equal(h.nodes['iadm-cor-status'].textContent,'Equipo guardado y auditado');
  assert.equal(h.calls.filter(c=>c.options.method==='PATCH'&&c.url.includes('/grupos/')).length,0);
});

test('FIX2: error 409 evita segundo guardado automatico y conserva formulario',async()=>{
  const h=domHarness({onPatch:async()=>{const e=new Error('Cambio externo');e.status=409;e.code='INSTALACIONES_ADMINISTRACION_CONFLICTO_CONCURRENCIA';throw e;}});
  await h.init();h.action('start-edit');await tick();h.input('estatus','Terminado');h.send();await tick();
  assert.match(h.nodes['iadm-cor-status'].textContent,/Cambio externo/);
  assert.match(h.nodes['iadm-cor-groups'].innerHTML,/iadm-cor-edit-form/);
  h.send();await tick();
  assert.equal(h.calls.filter(c=>c.options.method==='PATCH').length,1);
});

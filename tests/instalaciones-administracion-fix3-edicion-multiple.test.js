'use strict';
// [Aster | 2026-10-09 | ASTER-MG | FIX_3_INSTALACIONES_ADMINISTRACION_EDICION_MULTIPLE_V001]
// Pruebas aisladas con dobles de BD, permisos, alcance y navegador. No E2E.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const BASE = path.join(ROOT, 'backend/src/modules/instalaciones-administracion');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const requireWithStubs = (file, stubs) => {
  const abs = path.join(BASE, file);
  delete require.cache[abs];
  const prior = Module._load;
  try {
    Module._load = function(request, parent, isMain) {
      if (parent?.filename === abs && Object.prototype.hasOwnProperty.call(stubs, request)) return stubs[request];
      return prior.call(this, request, parent, isMain);
    };
    return require(abs);
  } finally { Module._load = prior; }
};

const GROUPS = {
  proyecto: { label: 'Proyecto', fields: ['proyecto', 'id_proyecto', 'referencia_sitio', 'estatus', 'activo'] },
  seguimiento: { label: 'Seguimiento', fields: ['comentarios_fl', 'avance_oc'] },
  responsables: { label: 'Responsables', fields: ['id_sup', 'id_asesor', 'id_admin'] },
  costos: { label: 'Costos', fields: ['presupuesto_mantenimiento_cem'] }
};
const constants = {
  GROUPS_COR: GROUPS,
  SYSTEM_READONLY_FIELDS_COR: ['id_ins_fl', 'created_at', 'updated_at'],
  POLICY_PENDING_FIELDS_COR: [],
  DERIVED_POLICY_PENDING_FIELDS_COR: [],
  RESPONSIBLE_ID_FIELDS_COR: ['id_sup', 'id_asesor', 'id_admin'],
  ALL_OPERATIONAL_FIELDS_COR: [...new Set(Object.values(GROUPS).flatMap(g => g.fields))],
  ACCESS_PERMISSION_COR: 'INSTALACIONES_ADMINISTRACION_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  FULL_EDIT_PERMISSION_COR: 'INSTALACIONES_ADMINISTRACION_ACCESO_VISUAL_MODULO.EDITAR',
  GROUP_PERMISSIONS_COR: Object.fromEntries(Object.keys(GROUPS).map(g => [g, {
    view: 'INSTALACIONES_ADMINISTRACION_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
    edit: 'INSTALACIONES_ADMINISTRACION_ACCESO_VISUAL_MODULO.EDITAR'
  }]))
};
function error(statusCode, code, message) {
  return Object.assign(new Error(message || code), { statusCode, code });
}
const validation = {
  knownError_cor: error,
  positiveId_cor(v) {
    const id = Number(v);
    if (!Number.isSafeInteger(id) || id <= 0) throw error(400, 'ID_INVALIDO');
    return id;
  },
  normalizeGroupUpdate_cor(g, item) {
    const group = GROUPS[g];
    if (!group) throw error(404, 'GRUPO_INVALIDO');
    if (!item?.changes || typeof item.changes !== 'object' || Array.isArray(item.changes) || !Object.keys(item.changes).length)
      throw error(400, 'CAMBIOS_REQUERIDOS');
    const out = {};
    for (const [field, value] of Object.entries(item.changes)) {
      if (constants.POLICY_PENDING_FIELDS_COR.includes(field)) throw error(409, 'POLITICA_PENDIENTE');
      if (!group.fields.includes(field)) throw error(400, 'CAMPO_FUERA_GRUPO');
      out[field] = value;
    }
    return out;
  },
  publicContract_cor: () => [], VARCHAR_LIMITS_COR: {}
};
let current = null, canPermission = () => true;
let auditFailAt = Infinity, audits = [];
const db = {
  query: async (sql) => { if (/FROM usuarios/.test(sql)) return [[{id_SB:5},{id_SB:6}]]; throw new Error('SQL global no previsto: ' + sql); },
  getConnection: async () => current.connection()
};
const repository = requireWithStubs('instalaciones-administracion.repository.js', {
  '../../config/db': db,
  './instalaciones-administracion.constants': constants
});
const service = requireWithStubs('instalaciones-administracion.service.js', {
  '../../config/db': db,
  '../ventas/ventas-visibility.service': {resolveVisibilityScope: async () => ({mode:'ALL'})},
  '../../services/permissions/effective-permission.service': {hasEffectivePermission: async (_userId, code) => canPermission(code)},
  './instalaciones-administracion.repository': repository,
  './instalaciones-administracion.audit-service': {recordGroupUpdate_cor: async (_req, data) => {
    assert.equal(data.executor, current.rawConnection, 'la auditoria usa la misma transaccion');
    audits.push({...data});
    if (audits.length === auditFailAt) throw new Error('Fallo de auditoria');
    return {id_interaccion: audits.length};
  }},
  './instalaciones-administracion.constants': constants,
  './instalaciones-administracion.validation': validation,
  './instalaciones-administracion.field-policy': {
    normalizeEditedFields_cor: value => value,
    fieldMeta_cor: () => ({kind:'text'})
  }
});

function fixture(overrides={}) {
  const records = new Map([
    [7,{id_ins_fl:7,id_proyecto:'P200',proyecto:'Proyecto A',estatus:'En proceso',comentarios_fl:'Antes 7',id_sup:5}],
    [8,{id_ins_fl:8,id_proyecto:'P200',proyecto:'Proyecto A',estatus:'En proceso',comentarios_fl:'Antes 8',id_sup:5}],
    [9,{id_ins_fl:9,id_proyecto:'P999',proyecto:'Proyecto B',estatus:'En proceso',comentarios_fl:'Antes 9',id_sup:5}]
  ]);
  for(const [key, changes] of Object.entries(overrides)) Object.assign(records.get(Number(key)), changes);
  let updates=0, commits=0, rollbacks=0, lockOrder=[];
  const api={
    records,
    stats:()=>({updates,commits,rollbacks,lockOrder}),
    rawConnection:null,
    connection(){
      let snapshot;
      const conn={
        async beginTransaction(){ snapshot=new Map([...records].map(([id,row])=>[id,{...row}])); },
        async query(sql,params=[]){
          if (/SELECT f\.\*/.test(sql)) {
            const id=Number(params[0]);
            if(/FOR UPDATE/.test(sql))lockOrder.push(id);
            const row=records.get(id);
            return [row ? [{...row}] : []];
          }
          if (/UPDATE ins_fl/.test(sql)) {
            updates++;
            const id=Number(params[params.length-1]);
            const row=records.get(id);
            if(!row)throw new Error('ID inexistente');
            [...sql.matchAll(/`(\w+)` = \?/g)].forEach((match,i)=>{row[match[1]]=params[i];});
            return [{affectedRows:1}];
          }
          throw new Error('SQL inesperado: '+sql);
        },
        async commit(){commits++;},
        async rollback(){rollbacks++;for(const [id,old] of snapshot)records.set(id,{...old});},
        release(){}
      };
      api.rawConnection=conn;return conn;
    }
  };
  return api;
}
const req={contextUser:{id_SB:100},viewerContext:{active:false}};
function payload(ids=[7,8], extra={}) {
  return {ids,groups:{
    proyecto:{changes:{estatus:'Terminado'}},
    seguimiento:{changes:{comentarios_fl:'Actualizado'}}
  },expected:Object.fromEntries(ids.map(id=>[String(id),{
    estatus:'En proceso',comentarios_fl:'Antes '+id
  }])),...extra};
}
function configure(overrides={}) {
  current=fixture(overrides);canPermission=()=>true;auditFailAt=Infinity;audits=[];
}

test('FIX3: dos equipos de un solo proyecto, transaccion unica, cuatro auditorias', async()=>{
  configure();const result=await service.updateMulti_cor(req,'P:P200',payload([8,7]));
  assert.deepEqual(result.records.map(r=>r.id_ins_fl),[7,8],'adquiere locks en orden ascendente');
  assert.deepEqual(current.stats(),{updates:2,commits:1,rollbacks:0,lockOrder:[7,8]});
  assert.equal(result.selected,2);assert.equal(result.updated,2);
  assert.equal(current.records.get(7).estatus,'Terminado');
  assert.equal(current.records.get(8).comentarios_fl,'Actualizado');
  assert.equal(audits.length,4);
  assert.deepEqual(audits.map(a=>[a.id_ins_fl,a.group]),[[7,'proyecto'],[7,'seguimiento'],[8,'proyecto'],[8,'seguimiento']]);
  assert.equal(result.data,undefined,'el PATCH no expone informacion posterior sin Guard');
});

test('FIX3: mezclando proyecto A + B se rechaza todo antes de UPDATE',async()=>{
  configure();await assert.rejects(()=>service.updateMulti_cor(req,'P:P200',payload([7,9])),
    {statusCode:409,code:'INSTALACIONES_ADMINISTRACION_PROYECTO_DISTINTO'});
  assert.equal(current.stats().updates,0);assert.equal(current.stats().rollbacks,1);
  assert.equal(audits.length,0);
});

test('FIX3: ID no autorizado/no encontrado bloquea lote completo',async()=>{
  configure();const p=payload([7,999]);
  await assert.rejects(()=>service.updateMulti_cor(req,'P:P200',p),{statusCode:404});
  assert.equal(current.stats().updates,0);assert.equal(current.stats().rollbacks,1);
});

test('FIX3: para proyectos sin PP NS nunca habilita lote',async()=>{
  configure();await assert.rejects(()=>service.updateMulti_cor(req,'R:7',payload()),{statusCode:400});
  assert.equal(current.stats().commits,0);
});

test('FIX3: exige 2-20 IDs unicos, expected completo, y campos permitidos',()=>{
  configure();
  assert.throws(()=>service.normalizeMultiUpdate_cor('P:P200',payload([7])),{statusCode:400});
  assert.throws(()=>service.normalizeMultiUpdate_cor('P:P200',payload(Array.from({length:21},(_,i)=>i+1))),{statusCode:400});
  assert.throws(()=>service.normalizeMultiUpdate_cor('P:P200',payload([7,7])),{statusCode:400});
  assert.throws(()=>service.normalizeMultiUpdate_cor('P:P200',{...payload(),expected:{7:{estatus:'En proceso'}}}),{statusCode:400});
  assert.throws(()=>service.normalizeMultiUpdate_cor('P:P200',{
    ...payload(), groups:{proyecto:{changes:{id_proyecto:'P999'}}}
  }),{statusCode:409});
  assert.throws(()=>service.normalizeMultiUpdate_cor('P:P200',{...payload(),extra:'colision'}),{statusCode:400});
});

test('FIX1 backend: sin EDITAR global no crea transaccion ni auditorias',async()=>{
  configure();canPermission=code=>!code.endsWith('.EDITAR');
  await assert.rejects(()=>service.updateMulti_cor(req,'P:P200',payload()),{statusCode:403});
  assert.equal(current.stats().updates,0);assert.equal(current.stats().commits,0);
});

test('FIX1 backend: sin ACCESO_VISUAL no admite agrupacion por URL, aunque tenga EDITAR',async()=>{
  configure();canPermission=code=>!code.endsWith('.ACCESO_VISUAL');
  const body={ids:[7,8],groups:{seguimiento:{changes:{comentarios_fl:'Masivo'}}},
    expected:{7:{comentarios_fl:'Antes 7'},8:{comentarios_fl:'Antes 8'}}};
  await assert.rejects(()=>service.updateMulti_cor(req,'P:P200',body),{statusCode:403});
  assert.equal(current.stats().updates,0);
  assert.equal(current.stats().commits,0);
});

test('FIX3: modo Visor siempre impide lote con permisos heredados',async()=>{
  configure();await assert.rejects(()=>service.updateMulti_cor({contextUser:{id_SB:100},viewerContext:{active:true}},'P:P200',payload()),{statusCode:403});
  assert.equal(current.stats().updates,0);
});

test('FIX3: conflicto optimistic expected del segundo ID impide modificar al primero',async()=>{
  configure({'8':{comentarios_fl:'Modificado por otra persona'}});
  await assert.rejects(()=>service.updateMulti_cor(req,'P:P200',payload()),{statusCode:409});
  assert.equal(current.records.get(7).estatus,'En proceso');
  assert.equal(current.stats().updates,0);
  assert.equal(current.stats().rollbacks,1);
  assert.equal(audits.length,0);
});

test('FIX3: fallo en auditoria del segundo registro revierte ambos equipos',async()=>{
  configure();auditFailAt=3;
  await assert.rejects(()=>service.updateMulti_cor(req,'P:P200',payload()),/Fallo de auditoria/);
  assert.equal(current.stats().updates,2);
  assert.equal(current.stats().commits,0);assert.equal(current.stats().rollbacks,1);
  assert.equal(current.records.get(7).estatus,'En proceso');
  assert.equal(current.records.get(8).estatus,'En proceso');
});

test('FIX3: solo modifica campos indicados y no reescribe valores no seleccionados',async()=>{
  configure();const body={ids:[7,8],groups:{proyecto:{changes:{estatus:'Terminado'}}},expected:{7:{estatus:'En proceso'},8:{estatus:'En proceso'}}};
  const res=await service.updateMulti_cor(req,'P:P200',body);
  assert.equal(res.updated,2);assert.equal(audits.length,2);
  assert.equal(current.records.get(7).comentarios_fl,'Antes 7');
  assert.equal(current.records.get(8).id_sup,5);
});

test('FIX3: valor igual en un equipo no genera UPDATE ni auditoria para ese equipo',async()=>{
  configure({'8':{estatus:'Terminado'}});
  const body={ids:[7,8],groups:{proyecto:{changes:{estatus:'Terminado'}}},expected:{7:{estatus:'En proceso'},8:{estatus:'Terminado'}}};
  const res=await service.updateMulti_cor(req,'P:P200',body);
  assert.equal(res.selected,2);assert.equal(res.updated,1);assert.equal(res.unchanged,1);
  assert.equal(current.stats().updates,1);assert.equal(audits.length,1);
});

test('FIX3: ruta reutiliza Guard CORELLIAN, y la validacion de proyecto ocurre bajo FOR UPDATE',()=>{
  const routes=read('backend/src/modules/instalaciones-administracion/instalaciones-administracion.routes.js');
  const repo=read('backend/src/modules/instalaciones-administracion/instalaciones-administracion.repository.js');
  assert.match(routes,/edicion-multiple'[\s\S]*?\.\.\.accessGuard_cor[\s\S]*?controller\.updateMulti_cor/);
  assert.match(repo,/getRecordById_cor\(\{ id, scope, connection: conn, forUpdate: true \}\)/);
  assert.match(repo,/row\.id_proyecto/);
  assert.match(repo,/await conn\.rollback\(\)/);
  assert.match(repo,/await conn\.commit\(\)/);
  assert.doesNotMatch(routes,/CREATE TABLE|ALTER TABLE/i);
});

function fakeNode(id){
  const handlers={};
  return {id,dataset:{},innerHTML:'',textContent:'',value:'',checked:false,hidden:false,disabled:false,
    classList:{toggle(){}},addEventListener:(name,cb)=>{(handlers[name]??=[]).push(cb);},
    emit:(name,event={})=>(handlers[name]||[]).forEach(cb=>cb(event)),
    querySelector:()=>null,querySelectorAll:()=>[],setAttribute(){},focus(){}};
}
function frontendHarness(){
  const ids=['view-instalaciones-administracion','iadm-cor-status','iadm-cor-alert',
    'iadm-cor-search-form','iadm-cor-search-input','iadm-cor-filter-status','iadm-cor-filter-supervisor',
    'iadm-cor-results','iadm-cor-search-meta','iadm-cor-projects','iadm-cor-project','iadm-cor-project-title',
    'iadm-cor-project-meta','iadm-cor-project-pagination','iadm-cor-equipment-list','iadm-cor-equipment-pagination',
    'iadm-cor-selected','iadm-cor-empty','iadm-cor-group-picker','iadm-cor-groups','iadm-cor-system-grid',
    'iadm-cor-record-title','iadm-cor-record-tags','iadm-cor-refresh','iadm-cor-search-btn','iadm-cor-clear',
    'iadm-cor-change-record','iadm-cor-back-projects','iadm-cor-detail-edit-btn','iadm-cor-detail-hint',
    'iadm-cor-bulk','iadm-cor-bulk-bar','iadm-cor-bulk-count','iadm-cor-bulk-open','iadm-cor-bulk-clear',
    'iadm-cor-bulk-back','iadm-cor-bulk-editor','iadm-cor-bulk-summary','iadm-cor-bulk-save','iadm-cor-bulk-form-count'];
  const nodes=Object.fromEntries(ids.map(id=>[id,fakeNode(id)]));
  const calls=[];
  const rows=new Map([
    [7,{id_ins_fl:7,id_proyecto:'P200',proyecto:'Proyecto A',numero_equipo_fabrica:'A01',estatus:'En proceso',comentarios_fl:'Antes 7'}],
    [8,{id_ins_fl:8,id_proyecto:'P200',proyecto:'Proyecto A',numero_equipo_fabrica:'A02',estatus:'En proceso',comentarios_fl:'Antes 8'}]
  ]);
  const contract={groups:[
    {key:'proyecto',label:'Proyecto',fields:['proyecto','id_proyecto','estatus'],editable_fields:['estatus'],permissions:{can_view:true,can_edit:true}},
    {key:'seguimiento',label:'Seguimiento',fields:['comentarios_fl'],editable_fields:['comentarios_fl'],permissions:{can_view:true,can_edit:true}}
  ],field_meta:{estatus:{kind:'text',max_length:255},comentarios_fl:{kind:'textarea',max_length:20000}},
    system_readonly_fields:['id_ins_fl']};
  const auth={
    getToken:()=> 'token',getActorUser:()=>({id_SB:100}),getUser:()=>({id_SB:100}),getViewUser:()=>null,isViewingAs:()=>false,
    async api(url,opt={}){
      calls.push({url,opt});
      if(url.endsWith('/contrato'))return contract;
      if(url.endsWith('/filtros'))return {permisos:{estatus:true,supervisor:false},estatus:['En proceso'],supervisores:[]};
      if(url.includes('/proyectos?'))return {data:[{project_key:'P:P200',id_proyecto:'P200',proyecto:'Proyecto A',equipos:2}],total:1};
      if(url.includes('/proyectos/P%3AP200/equipos?'))return {data:[...rows.values()].map(r=>({...r})),total:2};
      if(url.includes('/registros/')&&opt.method!=='PATCH')return {data:{...rows.get(Number(url.split('/').pop()))}};
      if(url.includes('/edicion-multiple')&&opt.method==='PATCH'){
        const body=JSON.parse(opt.body);
        for(const id of body.ids)for(const group of Object.values(body.groups))Object.assign(rows.get(id),group.changes);
        return {ok:true,selected:body.ids.length,updated:body.ids.length};
      }
      throw new Error('URL no simulada: '+url);
    }
  };
  const window={ManttoAuth:auth,ManttoPermissions:{apply(){}},ManttoRouter:{getCurrent:()=>({route:'instalaciones-administracion'})},confirm:()=>true};
  const document={getElementById(id){
    if(!nodes[id]&&id.startsWith('iadm-cor-bulk-input-'))nodes[id]=fakeNode(id);
    return nodes[id]||null;
  },addEventListener(){},dispatchEvent(){}};
  const ctx=vm.createContext({window,document,Promise,URLSearchParams,Date,Number,String,Set,Map,Object,Boolean,
    fetch:async()=>({ok:true,text:async()=>'<div>mock</div>'})});
  vm.runInContext(read('modules/instalaciones-administracion/instalaciones-administracion_cor.js'),ctx);
  const view=nodes['view-instalaciones-administracion'];
  const clickProject=()=>view.emit('click',{target:{closest(selector){return selector==='[data-project-key]'?{dataset:{projectKey:'P:P200'}}:null;}}});
  const select=(id,checked)=>view.emit('change',{target:{dataset:{bulkRecordId:String(id)},checked}});
  const mark=(field,checked)=>view.emit('change',{target:{dataset:{bulkApplyField:field},checked}});
  return {nodes,calls,rows,view,auth,window,clickProject,select,mark,
    init:()=>window.ManttoInstalacionesAdministracion_cor.init({}),
    openBulk:()=>nodes['iadm-cor-bulk-open'].emit('click',{}),
    submit:()=>view.emit('submit',{target:{id:'iadm-cor-bulk-form'},preventDefault(){}})};
}
const tick=()=>new Promise(done=>setTimeout(done,0));

test('FIX3 UI: marca solo 2 equipos del proyecto, carga GET autorizados y habilita formulario',async()=>{
  const h=frontendHarness();await h.init();h.clickProject();await tick();await tick();
  assert.match(h.nodes['iadm-cor-equipment-list'].innerHTML,/data-bulk-record-id="7"/);
  h.select(7,true);h.select(8,true);
  assert.match(h.nodes['iadm-cor-bulk-count'].textContent,/2 de 20/);
  h.openBulk();await tick();await tick();
  assert.equal(h.nodes['iadm-cor-bulk'].hidden,false);
  assert.match(h.nodes['iadm-cor-bulk-editor'].innerHTML,/data-bulk-apply-field="estatus"/);
  assert.equal(h.calls.filter(x=>x.url.endsWith('/registros/7')).length,1);
  assert.equal(h.calls.filter(x=>x.url.endsWith('/registros/8')).length,1);
});

test('FIX3 UI: solo los campos marcados se envian en UN PATCH con expected de cada equipo',async()=>{
  const h=frontendHarness();await h.init();h.clickProject();await tick();await tick();
  h.select(7,true);h.select(8,true);h.openBulk();await tick();await tick();
  h.mark('estatus',true);
  h.nodes['iadm-cor-bulk-input-estatus'].value='Terminado';
  h.view.emit('input',{target:{dataset:{bulkControl:'estatus'}}});
  h.submit();await tick();await tick();await tick();
  const patch=h.calls.filter(c=>c.opt.method==='PATCH');
  assert.equal(patch.length,1);
  assert.match(patch[0].url,/\/proyectos\/P%3AP200\/equipos\/edicion-multiple$/);
  const data=JSON.parse(patch[0].opt.body);
  assert.deepEqual(data.ids,[7,8]);
  assert.deepEqual(data.groups,{proyecto:{changes:{estatus:'Terminado'}}});
  assert.deepEqual(data.expected,{'7':{estatus:'En proceso'},'8':{estatus:'En proceso'}});
  assert.equal(h.rows.get(7).comentarios_fl,'Antes 7');
  assert.equal(h.nodes['iadm-cor-bulk'].hidden,true,'cierra datos anteriores tras mutacion');
  assert.equal(h.calls.some(c=>c.url.includes('/proyectos?')&&c.opt.method!=='PATCH'),true);
});

test('FIX3 UI: sin campos marcados no se ejecuta PATCH',async()=>{
  const h=frontendHarness();await h.init();h.clickProject();await tick();await tick();
  h.select(7,true);h.select(8,true);h.openBulk();await tick();await tick();
  h.submit();await tick();
  assert.equal(h.calls.some(c=>c.opt.method==='PATCH'),false);
});

test('FIX3: archivos HTML/CSS son responsive, navegacion y permisos sin DB nueva',()=>{
  const html=read('modules/instalaciones-administracion/instalaciones-administracion_cor.html');
  const css=read('modules/instalaciones-administracion/instalaciones-administracion-form_cor.css');
  const js=read('modules/instalaciones-administracion/instalaciones-administracion_cor.js');
  assert.match(html,/iadm-cor-bulk-open/);
  assert.match(html,/iadm-cor-bulk-editor/);
  assert.match(css,/@media\(max-width:480px\)/);
  assert.match(js,/clearBulkSelection_cor\(\)/);
  assert.match(js,/isCurrentContext_cor\(epoch\)/);
  assert.doesNotMatch(js,/localStorage|sessionStorage/);
});

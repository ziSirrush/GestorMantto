'use strict';
// [Aster | 2026-10-09 | ASTER-MG | FIX_3_INSTALACIONES_ADMINISTRACION_INTEGRACION_QA_AUTOGUARDADO_V001]
// Offline. DOM/API simulados; no envia escrituras a Azure ni Aiven.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname,'..');
const read = p => fs.readFileSync(path.join(ROOT,p),'utf8');
const src = read('modules/instalaciones-administracion/instalaciones-administracion_cor.js');
const html = read('modules/instalaciones-administracion/instalaciones-administracion_cor.html');
const css = read('modules/instalaciones-administracion/instalaciones-administracion-form_cor.css');

function later(){ let resolve,reject; const promise=new Promise((a,b)=>{resolve=a;reject=b;}); return {promise,resolve,reject}; }
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const flush=async()=>{await tick();await tick();await tick();};
function element(id){
  const handlers={};
  return {id,dataset:{},hidden:false,disabled:false,value:'',textContent:'',innerHTML:'',handlers,
    addEventListener(type,fn){(handlers[type]??=[]).push(fn);},
    emit(type,event){for(const fn of handlers[type]||[])fn(event||{});},
    classList:{toggle(){}},querySelector(){return null;},querySelectorAll(){return [];},
    removeAttribute(){},setAttribute(){},blur(){},focus(){}};
}
function harness({edit=true,viewer=false,patchHold=null,getAfterCommitError=null,patchFailure=null,afterPatch=null}={}){
  const names=['view-instalaciones-administracion','iadm-cor-status','iadm-cor-alert',
    'iadm-cor-refresh','iadm-cor-search-btn','iadm-cor-clear','iadm-cor-change-record',
    'iadm-cor-search-input','iadm-cor-search-form','iadm-cor-results','iadm-cor-search-meta',
    'iadm-cor-projects','iadm-cor-project','iadm-cor-selected','iadm-cor-empty',
    'iadm-cor-filter-status','iadm-cor-filter-supervisor','iadm-cor-project-title',
    'iadm-cor-project-meta','iadm-cor-project-pagination','iadm-cor-equipment-list',
    'iadm-cor-equipment-pagination','iadm-cor-group-picker','iadm-cor-groups',
    'iadm-cor-system-grid','iadm-cor-record-title','iadm-cor-record-tags','iadm-cor-form-count',
    'iadm-cor-detail-hint','iadm-cor-back-projects'];
  const nodes=Object.fromEntries(names.map(n=>[n,element(n)]));
  const badges=new Map();
  const view=nodes['view-instalaciones-administracion'];
  view.querySelector=sel=>{
    const m=/^\[data-(field-wrap|autosave-state|autosave-retry|user-hint|field-error|group-dirty)="([^"]+)"\]$/.exec(sel);
    if(!m)return null;
    const key=m[1]+':'+m[2];
    if(!badges.has(key)){const node=element(key);node.hidden=true;badges.set(key,node);}
    return badges.get(key);
  };
  const dListeners={};
  const doc={getElementById(id){
    if(!nodes[id]&&id.startsWith('iadm-cor-input-'))nodes[id]=element(id);
    return nodes[id]||null;
  },addEventListener(type,fn){(dListeners[type]??=[]).push(fn);},
  dispatch(type){for(const fn of dListeners[type]||[])fn({type});}};
  const contract={groups:[
    {key:'proyecto',label:'Proyecto',fields:['proyecto','id_proyecto','estatus','activo'],editable_fields:['proyecto','id_proyecto','estatus','activo'],permissions:{can_view:true,can_edit:edit}},
    {key:'seguimiento',label:'Seguimiento',fields:['comentarios_fl','fecha_visita'],editable_fields:['comentarios_fl','fecha_visita'],permissions:{can_view:true,can_edit:edit}},
    {key:'responsables',label:'Responsables',fields:['id_sup'],editable_fields:['id_sup'],permissions:{can_view:true,can_edit:edit}},
    {key:'costos',label:'Costos',fields:['presupuesto_mantenimiento_cem'],editable_fields:['presupuesto_mantenimiento_cem'],permissions:{can_view:true,can_edit:false}}
  ],field_meta:{proyecto:{kind:'text'},id_proyecto:{kind:'text'},estatus:{kind:'text'},activo:{kind:'boolean'},
    comentarios_fl:{kind:'textarea'},fecha_visita:{kind:'date'},id_sup:{kind:'user'},presupuesto_mantenimiento_cem:{kind:'money'}},
    system_readonly_fields:['id_ins_fl','created_at','updated_at']};
  let row={id_ins_fl:7,proyecto:'P200',id_proyecto:'P200',estatus:'En proceso',activo:1,
    comentarios_fl:'Antes',fecha_visita:'2026-10-01',id_sup:5,presupuesto_mantenimiento_cem:'55'};
  let session='qa-token', committed=0, patchCounter=0,confirmCount=0;
  const calls=[];
  const auth={getToken:()=>session,getActorUser:()=>({id_SB:100}),getUser:()=>({id_SB:100}),
    getViewUser:()=>viewer?({id_SB:2}):null,isViewingAs:()=>viewer,
    async api(url,opt={}){
      calls.push({url,opt});
      if(url.endsWith('/contrato'))return contract;
      if(url.endsWith('/filtros'))return {permisos:{estatus:true,supervisor:true},estatus:['En proceso','Terminado'],supervisores:[]};
      if(url.includes('/proyectos?'))return {data:[],total:0};
      if(url.endsWith('/usuarios'))return {data:[{id_SB:5,nombre:'Cinco'},{id_SB:6,nombre:'Seis'}]};
      if(url.endsWith('/registros/7')){
        if(committed&&getAfterCommitError){throw getAfterCommitError;}
        return {ok:true,data:{...row}};
      }
      const match=/\/registros\/7\/grupos\/([^/?]+)$/.exec(url);
      if(match){
        patchCounter++;
        const payload=JSON.parse(opt.body);
        assert.equal(opt.method,'PATCH');
        assert.equal(Object.keys(payload.changes).length,1,'un campo por PATCH');
        assert.equal(Object.keys(payload.expected).length,1,'expected del mismo campo');
        if(patchFailure){const error=await patchFailure({number:patchCounter,payload});if(error)throw error;}
        if(patchHold)await patchHold.promise;
        for(const [key,value] of Object.entries(payload.changes)){
          const stored=row[key]==null?null:String(row[key]);
          const exp=payload.expected[key]==null?null:String(payload.expected[key]);
          if(stored!==exp)throw Object.assign(new Error('Conflicto de concurrencia del servidor'),{status:409,code:'INSTALACIONES_ADMINISTRACION_CONFLICTO_CONCURRENCIA'});
          row[key]=value;
        }
        if(afterPatch)await afterPatch({number:patchCounter,payload,row});
        committed++;
        return {ok:true,changed:true,audit:'RECORDED_ATOMICALLY'};
      }
      throw Error('Endpoint desconocido: '+url);
    }};
  const win={ManttoAuth:auth,ManttoPermissions:{apply(){}},
    ManttoRouter:{getCurrent:()=>({route:'instalaciones-administracion'})},confirm(){confirmCount++;return true;}};
  const context=vm.createContext({window:win,document:doc,Promise,Date,Number,String,Boolean,Object,Array,
    URLSearchParams,Map,Set,fetch:async()=>({ok:true,text:async()=>'<div>UI</div>'})});
  vm.runInContext(src,context);
  const field=(name,value,event='input')=>{
    const node=doc.getElementById('iadm-cor-input-'+name);node.value=value;
    view.emit(event,{target:node});
    // Programmatic elements start with empty dataset; bind the field identity.
  };
  const put=(name,value,event='input')=>{
    const node=doc.getElementById('iadm-cor-input-'+name);node.value=value;node.dataset.fieldControl=name;
    view.emit(event,{target:node});return node;
  };
  const blur=name=>view.emit('focusout',{target:doc.getElementById('iadm-cor-input-'+name)});
  const change=(name,value)=>put(name,value,'change');
  const retry=name=>view.emit('click',{target:{closest(selector){
    return selector==='[data-autosave-retry]'?{dataset:{autosaveRetry:name}}:null;
  }}});
  const badge=(kind,name)=>view.querySelector(`[data-${kind}="${name}"]`);
  const form=()=>view.emit('submit',{target:{id:'iadm-cor-edit-form'},preventDefault(){}});
  return {view,nodes,badge,auth,calls,doc,put,blur,change,retry,form,
    get row(){return row;},get confirmCount(){return confirmCount;},get committed(){return committed;},get patchCounter(){return patchCounter;},
    expire(){session=null;doc.dispatch('mantto:session-expired');},
    async init(){await win.ManttoInstalacionesAdministracion_cor.init({id:7});},
    reload:()=>win.ManttoInstalacionesAdministracion_cor.refresh({force:true})};
}
function patches(h){return h.calls.filter(x=>x.opt.method==='PATCH');}
function error(status,message='error') {return Object.assign(new Error(message),{status,code:status===409?'INSTALACIONES_ADMINISTRACION_CONFLICTO_CONCURRENCIA':'ERROR_QA'});}


const incoming=()=>Object.assign(new Error('Conflicto de concurrencia'),{
  status:409,code:'INSTALACIONES_ADMINISTRACION_CONFLICTO_CONCURRENCIA'
});

test('FIX3: focusout de fecha legacy ilegible nunca envia NULL sin evento real',async()=>{
  const h=harness();h.row.fecha_visita='01/10/2026';
  await h.init();
  h.blur('fecha_visita');await flush();
  assert.equal(patches(h).length,0,'sin input/change no debe escribirse');
  assert.equal(h.row.fecha_visita,'01/10/2026','preservar dato historico');
  h.nodes['iadm-cor-change-record'].emit('click');
  assert.equal(h.confirmCount,0,'sin captura no debe advertir que hay cambios');
});

test('FIX3: focusout de numero legacy ilegible tampoco borra datos',async()=>{
  const h=harness();h.row.presupuesto_mantenimiento_cem='MXN 3,500';
  // La seccion costos del fixture es solo lectura. Validar que no se autoguarde.
  await h.init();h.blur('presupuesto_mantenimiento_cem');await flush();
  assert.equal(patches(h).length,0);
  assert.equal(h.row.presupuesto_mantenimiento_cem,'MXN 3,500');
});

test('FIX3: borrar explicitamente con Vaciar campo si envia NULL con expected anterior',async()=>{
  const h=harness();h.row.fecha_visita='01/10/2026';await h.init();
  h.view.emit('click',{target:{closest(sel){return sel==='[data-clear-field]'?{dataset:{clearField:'fecha_visita'}}:null;}}});
  await flush();
  assert.equal(patches(h).length,1);
  assert.deepEqual(JSON.parse(patches(h)[0].opt.body),{changes:{fecha_visita:null},expected:{fecha_visita:'01/10/2026'}});
  assert.equal(h.row.fecha_visita,null);
});

test('FIX3: recarga tras PATCH sincroniza un campo externo que no esta siendo editado',async()=>{
  const h=harness({afterPatch:({number,row})=>{if(number===1)row.comentarios_fl='Actualizado por otro usuario';}});
  await h.init();
  h.put('estatus','Terminado');h.blur('estatus');await flush();
  const comments=h.doc.getElementById('iadm-cor-input-comentarios_fl');
  assert.equal(comments.value,'Actualizado por otro usuario');
  h.put('comentarios_fl','Nueva revision');h.blur('comentarios_fl');await flush();
  assert.equal(patches(h).length,2);
  assert.deepEqual(JSON.parse(patches(h)[1].opt.body),{changes:{comentarios_fl:'Nueva revision'},expected:{comentarios_fl:'Actualizado por otro usuario'}});
  assert.equal(h.row.comentarios_fl,'Nueva revision');
});

test('FIX3: al recargar no avanza expected de campo con borrador; rechaza overwrite silencioso',async()=>{
  const h=harness({afterPatch:({number,row})=>{if(number===1)row.comentarios_fl='Valor externo';}});
  await h.init();
  h.put('comentarios_fl','Mi borrador');
  h.put('estatus','Terminado');h.blur('estatus');await flush();
  const comments=h.doc.getElementById('iadm-cor-input-comentarios_fl');
  assert.equal(comments.value,'Mi borrador','no borrar el texto que el usuario capturo');
  h.blur('comentarios_fl');await flush();
  assert.equal(patches(h).length,2);
  assert.deepEqual(JSON.parse(patches(h)[1].opt.body),{changes:{comentarios_fl:'Mi borrador'},expected:{comentarios_fl:'Antes'}});
  assert.equal(h.row.comentarios_fl,'Valor externo','409 deja la BD intacta');
  assert.match(h.badge('autosave-state','comentarios_fl').textContent,/Otro usuario modifico/);
});

test('FIX3: al actualizar detalles no se envia dato si no hay cambio real',async()=>{
  const h=harness();await h.init();
  h.put('estatus','En proceso');h.blur('estatus');await flush();
  assert.equal(patches(h).length,0);
  h.put('comentarios_fl','Antes');h.blur('comentarios_fl');await flush();
  assert.equal(patches(h).length,0);
});

test('FIX3: contrato exige control de acceso total, CORELLIAN y auditoria atomica',()=>{
  const constants=read('backend/src/modules/instalaciones-administracion/instalaciones-administracion.constants.js');
  const service=read('backend/src/modules/instalaciones-administracion/instalaciones-administracion.service.js');
  const route=read('backend/src/modules/instalaciones-administracion/instalaciones-administracion.routes.js');
  const repo=read('backend/src/modules/instalaciones-administracion/instalaciones-administracion.repository.js');
  assert.match(constants,/FULL_EDIT_PERMISSION_COR/);
  assert.match(service,/hasEffectivePermission\(userId, FULL_EDIT_PERMISSION_COR\)/);
  assert.match(service,/req\?\.viewerContext\?\.active === true/);
  assert.match(route,/domain: 'CORELLIAN'/);
  assert.match(repo,/forUpdate: true/);
  assert.match(repo,/await conn.rollback\(\)/);
  assert.match(repo,/beforeCommit/);
  assert.match(repo,/await conn.commit\(\)/);
});

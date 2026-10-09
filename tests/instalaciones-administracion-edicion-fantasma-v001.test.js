'use strict';
// [Aster | 2026-10-09 | ASTER-MG | FIX_INSTALACIONES_ADMINISTRACION_EDICION_FANTASMA_V001]
// Offline: DOM y API simulados; no se contacta GitHub, Azure ni Aiven.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const frontend = read('modules/instalaciones-administracion/instalaciones-administracion_cor.js');
const html = read('modules/instalaciones-administracion/instalaciones-administracion_cor.html');
const css = read('modules/instalaciones-administracion/instalaciones-administracion-form_cor.css');

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function el(id) {
  const listeners = {};
  return { id, dataset: {}, innerHTML: '', textContent: '', hidden: false, disabled: false,
    value: '', ariaBusy: false, listeners,
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    emit(type, event = {}) { for (const fn of listeners[type] || []) fn(event); },
    querySelector() { return null; }, querySelectorAll() { return []; },
    classList: { toggle() {} }, setAttribute() {}, removeAttribute(key) { if (key === 'aria-busy') this.ariaBusy = false; },
    focus() {} };
}
function harness({viewer = false, allowEdit = true, includeResponsables = false, delayedUsers = null, confirmDiscard = true} = {}) {
  const ids = [
    'view-instalaciones-administracion','iadm-cor-status','iadm-cor-alert','iadm-cor-refresh',
    'iadm-cor-search-btn','iadm-cor-clear','iadm-cor-change-record','iadm-cor-search-input',
    'iadm-cor-search-form','iadm-cor-results','iadm-cor-search-meta','iadm-cor-record-title',
    'iadm-cor-record-tags','iadm-cor-group-picker','iadm-cor-groups','iadm-cor-system-grid',
    'iadm-cor-selected','iadm-cor-empty','iadm-cor-projects','iadm-cor-project',
    'iadm-cor-project-title','iadm-cor-project-meta','iadm-cor-project-pagination',
    'iadm-cor-equipment-list','iadm-cor-equipment-pagination','iadm-cor-filter-status',
    'iadm-cor-filter-supervisor','iadm-cor-back-projects','iadm-cor-detail-hint',
    'iadm-cor-form-count','iadm-cor-save-btn','iadm-cor-discard-btn'
  ];
  const nodes = Object.fromEntries(ids.map(id => [id, el(id)]));
  const listeners = {};
  const doc = {
    getElementById(id) {
      if (!nodes[id] && id.startsWith('iadm-cor-input-')) nodes[id] = el(id);
      return nodes[id] || null;
    },
    addEventListener(type, cb) { (listeners[type] ||= []).push(cb); },
    dispatch(type) { for (const fn of listeners[type] || []) fn({type}); }
  };
  const contract = { groups: [
    {key:'proyecto', label:'Proyecto', fields:['proyecto','estatus'], editable_fields:['estatus'],
      permissions:{can_view:true, can_edit:allowEdit}},
    {key:'seguimiento', label:'Seguimiento', fields:['comentarios_fl'], editable_fields:['comentarios_fl'],
      permissions:{can_view:true, can_edit:allowEdit}},
    {key:'costos', label:'Costos', fields:['presupuesto_mantenimiento_cem'], editable_fields:[],
      permissions:{can_view:true, can_edit:false}},
    ...(includeResponsables ? [{key:'responsables',label:'Responsables',fields:['id_sup'],
      editable_fields:['id_sup'],permissions:{can_view:true,can_edit:allowEdit}}] : [])
  ], field_meta: {estatus:{kind:'text',max_length:255},comentarios_fl:{kind:'textarea',max_length:20000},
      id_sup:{kind:'user'},presupuesto_mantenimiento_cem:{kind:'money'}},
    system_readonly_fields:['id_ins_fl','created_at','updated_at'] };
  let row = {id_ins_fl:7,proyecto:'P200',estatus:'En proceso',comentarios_fl:'Antes',
    presupuesto_mantenimiento_cem:'500.00',id_sup:5};
  const calls = [];
  let session = 'qa-token';
  let confirmCount = 0;
  const auth = {
    getToken:()=>session,getActorUser:()=>({id_SB:100}),getUser:()=>({id_SB:100}),
    getViewUser:()=>viewer?({id_SB:1}):null,isViewingAs:()=>viewer,
    async api(url,opts={}) {
      calls.push({url,opts});
      if (url.endsWith('/contrato')) return contract;
      if (url.endsWith('/filtros')) return {permisos:{estatus:true,supervisor:false},estatus:['En proceso'],supervisores:[]};
      if (url.includes('/proyectos?')) return {data:[],total:0};
      if (url.endsWith('/usuarios')) return delayedUsers ? delayedUsers.promise :
        {data:[{id_SB:5,nombre:'Supervisor Uno'},{id_SB:9,nombre:'Supervisor Dos'}]};
      if (url.endsWith('/registros/7')) return {data:{...row}};
      if (/\/registros\/7\/grupos\/[^/]+$/.test(url)) {
        if (opts.method !== 'PATCH') throw new Error('Method expected PATCH');
        Object.assign(row,JSON.parse(opts.body).changes);
        return {ok:true,changed:true};
      }
      throw new Error('Unexpected URL '+url);
    }
  };
  const window={ManttoAuth:auth,ManttoPermissions:{apply(){}},
    ManttoRouter:{getCurrent:()=>({route:'instalaciones-administracion'})},
    confirm(){confirmCount++;return confirmDiscard;}};
  const ctx=vm.createContext({window,document:doc,Promise,Set,Map,URLSearchParams,Date,Number,String,
    Boolean,Object,Array,fetch:async()=>({ok:true,text:async()=>'<div>Fixture</div>'})});
  vm.runInContext(frontend, ctx);
  const view=nodes['view-instalaciones-administracion'];
  const input=(field,value)=>{
    const node=doc.getElementById('iadm-cor-input-'+field);
    node.value=value;
    view.emit('input',{target:{dataset:{fieldControl:field}}});
    return node;
  };
  const send=()=>view.emit('submit',{target:{id:'iadm-cor-edit-form'},preventDefault(){}});
  const finish=field=>view.emit('focusout',{target:{dataset:{fieldControl:field}}});
  const action=kind=>view.emit('click',{target:{closest(selector){
    return selector==='[data-action]'?{dataset:{action:kind}}:null;
  }}});
  return {app:window.ManttoInstalacionesAdministracion_cor, nodes, doc, calls, input,send,action,finish,
    get row(){return row;}, get confirmations(){return confirmCount;},
    expire(){session=null;doc.dispatch('mantto:session-expired');},
    initialize:()=>window.ManttoInstalacionesAdministracion_cor.init({id:7})};
}
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));

// Regresion funcional del pedido: no existe un segundo click Editar.
test('fantasma: abrir detalle muestra controles y guardado sin click Editar',async()=>{
  const h=harness();await h.initialize();
  const body=h.nodes['iadm-cor-groups'].innerHTML;
  assert.match(body,/<form id="iadm-cor-edit-form"[^>]*iadm-cor-ghost-detail/);
  assert.match(body,/data-field-control="estatus"/);
  assert.match(body,/data-field-control="comentarios_fl"/);
  assert.match(body,/data-locked="true"/);
  assert.match(body,/data-autosave-state="estatus"/);
  assert.doesNotMatch(body,/Guardar cambios del equipo/);
  assert.doesNotMatch(html,/id="iadm-cor-detail-edit-btn"|data-action="start-edit"/);
  assert.equal(h.nodes['iadm-cor-status'].textContent,'Registro cargado');
  assert.equal(h.calls.filter(({opts})=>opts.method==='PATCH').length,0);
});

test('fantasma: solo los campos EDITAR de las secciones autorizadas son controles',async()=>{
  const h=harness();await h.initialize();
  const body=h.nodes['iadm-cor-groups'].innerHTML;
  assert.match(body,/data-detail-group="proyecto"/);
  assert.match(body,/data-detail-group="costos"/);
  assert.doesNotMatch(body,/data-field-control="presupuesto_mantenimiento_cem"/);
  assert.match(body,/500\.00/);
});

test('fantasma: visor y usuarios sin EDITAR mantienen ficha de solo lectura',async()=>{
  for(const options of [{viewer:true},{allowEdit:false}]){
    const h=harness(options);await h.initialize();
    assert.doesNotMatch(h.nodes['iadm-cor-groups'].innerHTML,/id="iadm-cor-edit-form"/);
    assert.match(h.nodes['iadm-cor-groups'].innerHTML,/iadm-cor-field-grid/);
    h.send();await tick();
    assert.equal(h.calls.filter(c=>c.opts.method==='PATCH').length,0);
  }
});

// [Aster | 2026-10-09 | ASTER-MG | FIX_2_INSTALACIONES_ADMINISTRACION_AUTOGUARDADO_V001]
test('fantasma: no guarda al escribir, al salir emite PATCH por cada campo',async()=>{
  const h=harness();await h.initialize();
  h.input('estatus','Terminado');h.input('comentarios_fl','Despues');
  await tick();
  assert.equal(h.calls.filter(c=>c.opts.method==='PATCH').length,0);
  h.finish('estatus');await tick();await tick();
  h.finish('comentarios_fl');await tick();await tick();
  const patches=h.calls.filter(c=>c.opts.method==='PATCH');
  assert.equal(patches.length,2);
  assert.match(patches[0].url,/\/registros\/7\/grupos\/proyecto$/);
  assert.match(patches[1].url,/\/registros\/7\/grupos\/seguimiento$/);
  assert.deepEqual(JSON.parse(patches[0].opts.body),{changes:{estatus:'Terminado'},expected:{estatus:'En proceso'}});
  assert.deepEqual(JSON.parse(patches[1].opts.body),{changes:{comentarios_fl:'Despues'},expected:{comentarios_fl:'Antes'}});
  assert.equal(h.row.presupuesto_mantenimiento_cem,'500.00');
  assert.match(h.nodes['iadm-cor-groups'].innerHTML,/iadm-cor-edit-form/);
  assert.match(h.nodes['iadm-cor-status'].textContent,/guardado y auditado/);
});

test('fantasma: no ofrece boton Descartar ni guarda por submit accidental',async()=>{
  const h=harness();await h.initialize();
  h.input('estatus','Terminado');h.send();await tick();
  assert.doesNotMatch(h.nodes['iadm-cor-groups'].innerHTML,/Descartar cambios|Guardar cambios del equipo/);
  assert.equal(h.row.estatus,'En proceso');
  assert.equal(h.calls.filter(c=>c.opts.method==='PATCH').length,0);
});

test('fantasma: captura sin blur aun pendiente y no confirma cambio en servidor',async()=>{
  const h=harness({confirmDiscard:false});await h.initialize();
  h.input('estatus','Terminado');await tick();
  assert.equal(h.row.estatus,'En proceso');
  assert.equal(h.calls.filter(c=>c.opts.method==='PATCH').length,0);
  assert.equal(h.nodes['iadm-cor-status'].textContent,'Registro cargado');
});

test('fantasma: usuarios se cargan sin bloquear detalle y sin asignar accidental',async()=>{
  const pending=deferred();const h=harness({includeResponsables:true,delayedUsers:pending});
  const selector=h.doc.getElementById('iadm-cor-input-id_sup');
  selector.disabled=true;selector.value='5';
  await h.initialize();
  assert.match(h.nodes['iadm-cor-groups'].innerHTML,/data-field-control="id_sup" disabled aria-busy="true"/);
  assert.match(h.nodes['iadm-cor-groups'].innerHTML,/data-field-control="estatus"/);
  assert.equal(selector.disabled,true);
  assert.equal(h.calls.filter(c=>c.url.endsWith('/usuarios')).length,1);
  pending.resolve({data:[{id_SB:5,nombre:'Supervisor Uno'},{id_SB:9,nombre:'Supervisor Dos'}]});
  await tick();await tick();
  assert.equal(selector.disabled,false);
  assert.equal(selector.value,'5');
  assert.match(selector.innerHTML,/Supervisor Dos/);
  assert.equal(h.calls.filter(c=>c.opts.method==='PATCH').length,0);
});

test('fantasma: error de catalogo mantiene responsable deshabilitado, otros campos editables',async()=>{
  const pending=deferred();const h=harness({includeResponsables:true,delayedUsers:pending});
  const selector=h.doc.getElementById('iadm-cor-input-id_sup');
  selector.disabled=true;selector.value='5';
  await h.initialize();
  pending.reject(new Error('403 No autorizado'));
  await tick();await tick();
  assert.equal(selector.disabled,true);
  assert.match(h.nodes['iadm-cor-alert'].textContent,/No se pudieron cargar los usuarios/);
  assert.match(h.nodes['iadm-cor-groups'].innerHTML,/data-field-control="estatus"/);
});

test('fantasma: respuesta de usuarios del contexto anterior no actualiza selector',async()=>{
  const pending=deferred();const h=harness({includeResponsables:true,delayedUsers:pending});
  const selector=h.doc.getElementById('iadm-cor-input-id_sup');
  selector.disabled=true;selector.value='5';
  await h.initialize();h.expire();
  pending.resolve({data:[{id_SB:9,nombre:'Usuario Otra Sesion'}]});
  await tick();await tick();
  assert.equal(selector.disabled,true);
  assert.doesNotMatch(selector.innerHTML,/Usuario Otra Sesion/);
});

test('fantasma: CSS es solo ficha individual, mantiene accesibilidad y responsive',()=>{
  assert.match(css,/\.iadm-cor-ghost-detail/);
  assert.match(css,/:focus-visible/);
  assert.match(css,/@media\(max-width:760px\)/);
  assert.doesNotMatch(css,/zoom\s*:/i);
  assert.match(html,/instalaciones-administracion-form_cor\.css\?v=20261009-autoguardado-fix2-v001/);
  assert.match(frontend,/VERSION_COR='20261009-autoguardado-fix3-qa-v001'/);
  assert.doesNotMatch(frontend,/localStorage|sessionStorage/);
  assert.match(frontend,/administracion/);
  assert.match(frontend,/edicion-multiple/);
});

'use strict';

// Fase 6 - Pruebas funcionales con DOM/API simulados; no conectan a Aiven/Azure.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'modules',
  'instalaciones-administracion', 'instalaciones-administracion_cor.js'), 'utf8');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function el(id) {
  return {
    id, dataset:{}, innerHTML:'', textContent:'', hidden:false, disabled:false,
    value:'', classList:{toggle(){}},
    addEventListener(){}, querySelector(){return null;}, querySelectorAll(){return [];},
    setAttribute(){}, focus(){}
  };
}

function createHarness(config = {}) {
  const ids = [
    'view-instalaciones-administracion', 'iadm-cor-status', 'iadm-cor-alert',
    'iadm-cor-refresh', 'iadm-cor-search-btn', 'iadm-cor-clear',
    'iadm-cor-change-record', 'iadm-cor-search-input', 'iadm-cor-search-form',
    'iadm-cor-results', 'iadm-cor-search-meta', 'iadm-cor-record-title',
    'iadm-cor-record-tags', 'iadm-cor-group-picker', 'iadm-cor-groups',
    'iadm-cor-system-grid', 'iadm-cor-selected', 'iadm-cor-empty',
    'iadm-cor-projects', 'iadm-cor-project','iadm-cor-project-title',
    'iadm-cor-project-meta','iadm-cor-project-pagination',
    'iadm-cor-equipment-list','iadm-cor-equipment-pagination',
    'iadm-cor-filter-status','iadm-cor-filter-supervisor','iadm-cor-back-projects'
  ];
  const nodes = Object.fromEntries(ids.map(id => [id,el(id)]));
  nodes['iadm-cor-selected'].hidden = true;
  const listeners = new Map();
  const document = {
    getElementById: id => nodes[id] || null,
    addEventListener(type, cb) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(cb);
    },
    dispatchEvent(ev) { for (const cb of listeners.get(ev.type) || []) cb(ev); }
  };
  let actorId = 1;
  let viewerId = null;
  let token = 'token-1';
  let currentRoute = 'home';
  const calls = [];
  const users = {1:'Cuenta A',2:'Cuenta B',3:'Visor C'};
  const contract = {ok:true,groups:[{
    key:'proyecto',label:'Proyecto',fields:['proyecto'],editable_fields:['proyecto'],
    permissions:{can_view:true,can_edit:false}
  }], system_readonly_fields:['id_ins_fl','created_at','updated_at'],field_meta:{}};
  const auth = {
    getToken: () => token,
    getActorUser: () => ({id_SB:actorId}),
    getViewUser: () => viewerId ? {id_SB:viewerId} : null,
    getUser: () => ({id_SB:viewerId || actorId}),
    isViewingAs: () => viewerId !== null,
    async api(url, opts) {
      const scope = viewerId || actorId;
      const call = {url,method:opts.method,scope};
      calls.push(call);
      if (config.intercept) {
        const intercepted = config.intercept(call);
        if (intercepted !== undefined) return intercepted;
      }
      if (url.endsWith('/contrato')) return contract;
      if (url.endsWith('/filtros')) return {ok:true,estatus:[],supervisores:[],sin_supervisor:false,
        permisos:{estatus:true,supervisor:false}};
      if (url.includes('/proyectos?')) return {ok:true,data:[{
        project_key:'P:'+scope,id_proyecto:String(scope),proyecto:users[scope],equipos:1
      }],total:1,limit:20,offset:0};
      if (url.includes('/equipos?')) return {ok:true,data:[{
        id_ins_fl:scope,proyecto:users[scope]
      }],total:1,limit:30,offset:0};
      if (/\/registros\/\d+$/.test(url)) return {ok:true,data:{
        id_ins_fl:Number(url.split('/').at(-1)),proyecto:users[scope]
      }};
      throw new Error('API inesperada: '+url);
    }
  };
  const window = {
    ManttoAuth: auth,
    ManttoRouter: {getCurrent: () => ({route:currentRoute})},
    ManttoPermissions: {apply(){}},
    confirm: () => true
  };
  const ctx = vm.createContext({
    window,document,Promise,URLSearchParams,Date,Number,String,Set,Object,Boolean,
    fetch: async () => ({ok:true,text:async () => '<div>UI</div>'})
  });
  vm.runInContext(SOURCE,ctx,{filename:'instalaciones-administracion_cor.js'});
  return {
    nodes,calls,document,window,
    init: (payload) => window.ManttoInstalacionesAdministracion_cor.init(payload),
    setActor(id){ actorId=id; token='token-'+id; },
    setViewer(id){viewerId=id;},
    setToken(v){token=v;},
    setRoute(route){currentRoute=route;},
    emit(type,detail={}){document.dispatchEvent({type,detail});}
  };
}

async function tick() {
  await new Promise(resolve => setImmediate(resolve));
}

test('F6: al autenticar otro usuario se purgan listado y datos del anterior', async () => {
  const h=createHarness();
  await h.init();
  assert.match(h.nodes['iadm-cor-results'].innerHTML,/Cuenta A/);
  h.setActor(2);
  h.emit('mantto:auth-ready');
  assert.equal(h.nodes['iadm-cor-results'].innerHTML,'');
  assert.equal(h.nodes['iadm-cor-search-meta'].textContent,'');
  assert.equal(h.nodes['iadm-cor-record-title'].textContent,'');
  await h.init();
  const visible=h.nodes['iadm-cor-results'].innerHTML;
  assert.match(visible,/Cuenta B/);
  assert.doesNotMatch(visible,/Cuenta A/);
  assert.equal(h.calls.filter(c=>c.url.endsWith('/contrato')).length,2);
});

test('F6: respuesta de busqueda iniciada por usuario anterior se descarta', async () => {
  const held=deferred();
  let holding=true;
  const h=createHarness({intercept:call => {
    if (holding && call.url.includes('/proyectos?') && call.scope===1) {
      holding=false;
      return held.promise;
    }
    return undefined;
  }});
  const first=h.init();
  await tick();
  h.setActor(2);
  h.emit('mantto:auth-ready');
  held.resolve({ok:true,data:[{id_ins_fl:1,proyecto:'SECRETO DE CUENTA A'}]});
  await first;
  assert.doesNotMatch(h.nodes['iadm-cor-results'].innerHTML,/SECRETO/);
  await h.init();
  assert.match(h.nodes['iadm-cor-results'].innerHTML,/Cuenta B/);
});

test('F6: cambio de usuario efectivo en visor borra datos y revalida', async () => {
  const h=createHarness();
  await h.init();
  assert.match(h.nodes['iadm-cor-results'].innerHTML,/Cuenta A/);
  h.setViewer(3);
  h.emit('mantto:view-user-changed');
  assert.equal(h.nodes['iadm-cor-results'].innerHTML,'');
  // Navegacion hacia una vista previamente inicializada fuerza reconsulta.
  h.setRoute('instalaciones-administracion');
  h.emit('mantto:navigation',{route:'instalaciones-administracion',type:'open',payload:{}});
  await tick();
  assert.match(h.nodes['iadm-cor-results'].innerHTML,/Visor C/);
  assert.doesNotMatch(h.nodes['iadm-cor-results'].innerHTML,/Cuenta A/);
});

test('F6: caducidad de sesion purga toda la vista sensible', async () => {
  const h=createHarness();
  await h.init({id:1});
  assert.match(h.nodes['iadm-cor-record-tags'].innerHTML,/Cuenta A/);
  assert.equal(h.nodes['iadm-cor-selected'].hidden,false);
  h.setToken('');
  h.emit('mantto:session-expired');
  assert.equal(h.nodes['iadm-cor-results'].innerHTML,'');
  assert.equal(h.nodes['iadm-cor-record-title'].textContent,'');
  assert.equal(h.nodes['iadm-cor-selected'].hidden,true);
});

test('F6: GET de detalle anterior no reaparece tras cambio de identidad', async () => {
  const held=deferred();
  let holding=true;
  const h=createHarness({intercept:call => {
    if (holding && /\/registros\/1$/.test(call.url)) {
      holding=false;
      return held.promise;
    }
    return undefined;
  }});
  await h.init();
  h.setRoute('instalaciones-administracion');
  h.emit('mantto:navigation',{route:'instalaciones-administracion',type:'open',payload:{id:1}});
  await tick();
  h.setRoute('home');
  h.setActor(2);
  h.emit('mantto:auth-ready');
  held.resolve({ok:true,data:{id_ins_fl:1,proyecto:'SECRETO DETALLE ANTERIOR'}});
  await tick();
  assert.equal(h.nodes['iadm-cor-record-title'].textContent,'');
  assert.equal(h.nodes['iadm-cor-selected'].hidden,true);
});

test('F6: comprobaciones no introducen localStorage, nuevo scope ni tablas', () => {
  assert.match(SOURCE,/currentContext_cor/);
  assert.match(SOURCE,/mantto:auth-ready/);
  assert.match(SOURCE,/mantto:view-user-changed/);
  assert.match(SOURCE,/mantto:session-expired/);
  assert.doesNotMatch(SOURCE,/localStorage|sessionStorage/);
});

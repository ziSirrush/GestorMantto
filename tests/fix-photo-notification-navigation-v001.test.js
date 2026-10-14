'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Module = require('node:module');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function loadPhotoEmitter(state) {
  const file = path.join(ROOT, 'backend/src/services/notifications/project-photo-notification.service.js');
  const old = Module._load;
  Module._load = function(request, parent, main) {
    if (request === '../../config/db') return {
      query: async () => [state.directors.map(id => ({id_SB:id}))]
    };
    if (request === '../../shared/logger') return {
      info: (type, data) => state.logs.push({level:'info',type,data}),
      warn: (type, data) => state.logs.push({level:'warn',type,data}),
      error: (type, data) => state.logs.push({level:'error',type,data})
    };
    if (request === '../../middleware/project-photo.middleware') return {
      userCanManageProjectPhotos_gnral: (actor) =>
        Array.isArray(actor?.roles) && actor.roles.includes('Gestor de Fotografías')
    };
    if (request === './notification-business-emitter.service') return {
      emitBusinessEventSafe_gnral: async (payload) => {
        state.payloads.push(payload);
        return state.override || {
          ok:true,created:payload.destinatarios.length,skipped:0,
          recipients:payload.destinatarios,bell_recipients:payload.destinatarios,
          push_recipients:payload.destinatarios,trace_id:'photo-trace-v001'
        };
      }
    };
    return old.call(this, request, parent, main);
  };
  try { delete require.cache[require.resolve(file)]; return require(file); }
  finally { Module._load = old; }
}

const actor = {user:{id_SB:42,nombre:'Gestor',roles:['Gestor de Fotografías']}};
const input = {
  domain:'CORELLIAN',projectId:'P10152',photoRecordId:6,
  storageUrl:'https://storage.example/p.jpg',slot:'foto_blt_1',actionContext:actor
};

test('Corellian emite destino tipado y conserva Director General, incluido el actor', async () => {
  const state = {directors:[42,99],logs:[],payloads:[]};
  const service = loadPhotoEmitter(state);
  const result = await service.notifyProjectPhotoUploaded_gnral(input);
  assert.equal(result.created,2);
  assert.equal(state.payloads.length,1);
  assert.equal(state.payloads[0].ruta,'detalle:proyecto-corellian:P10152');
  assert.deepEqual(state.payloads[0].destinatarios,[42,99]);
  assert.equal(state.payloads[0].excludeActor,false);
  assert.equal(state.payloads[0].requireRoleMatrix,true);
  assert.equal(state.payloads[0].zonaOperativaNoAplica,true);
  assert.equal(state.logs.at(-1).type,'[PROJECT_PHOTO_NOTIFICATION_EMISSION]');
  assert.equal(state.logs.at(-1).data.push_elegibles,2);
  assert.equal(state.logs.at(-1).data.trace_id,'photo-trace-v001');
});

test('United conserva el detalle de Portafolio',async()=>{
  const state={directors:[42],logs:[],payloads:[]};
  const service=loadPhotoEmitter(state);
  await service.notifyProjectPhotoDeleted_gnral({...input,domain:'UNITED'});
  assert.equal(state.payloads[0].ruta,'detalle:proyecto:P10152');
  assert.match(state.payloads[0].mensaje,/\(United\)\.$/);
});

test('sin DG activo registra causa y no crea una notificación',async()=>{
  const state={directors:[],logs:[],payloads:[]};
  const service=loadPhotoEmitter(state);
  const result=await service.notifyProjectPhotoUploaded_gnral(input);
  assert.equal(result.reason,'SIN_DIRECTOR_GENERAL_ACTIVO');
  assert.equal(state.payloads.length,0);
  assert.equal(state.logs.at(-1).type,'[PROJECT_PHOTO_NOTIFICATION_NO_DIRECTORS]');
});

test('matriz sin emisión produce advertencia y nunca afirma entrega de Push',async()=>{
  const state={directors:[42],logs:[],payloads:[],override:{ok:true,created:0,skipped:1,reason:'MATRIZ_ROLES_NO_CONFIGURADA',trace_id:'diag-44'}};
  const service=loadPhotoEmitter(state);
  const result=await service.notifyProjectPhotoUploaded_gnral(input);
  assert.equal(result.created,0);
  assert.equal(state.logs.at(-1).type,'[PROJECT_PHOTO_NOTIFICATION_NOT_CREATED]');
  assert.equal(state.logs.at(-1).data.razon,'MATRIZ_ROLES_NO_CONFIGURADA');
});

function instantiateAdapter() {
  const calls=[];
  const listeners=new Map();
  const router={
    go: (...args) => {calls.push(['go',...args]); return args;},
    openTarget: (target) => {calls.push(['original',target]); return 'original';}
  };
  const document={
    readyState:'complete',
    addEventListener: (name,handler) => listeners.set(name,handler),
    head:{appendChild(){}},
  };
  const window={
    ManttoRouter:router,
    setTimeout: (fn)=>{fn();return 1;},
    ManttoHttp:{ request: async (...args) => {calls.push(['http',...args]);return {ok:true};}},
    ManttoHome:{ refreshHeaderNotifications: async ()=>{calls.push(['refresh']);return [];}}
  };
  vm.runInNewContext(read('core/photo-notification-navigation.js'),{window,document,encodeURIComponent,console});
  return {calls,listeners,router,window,document};
}

test('la campana/Home y el Push nuevos abren el detalle Corellian existente',()=>{
  const {router,calls}=instantiateAdapter();
  router.openTarget({route:'detalle:proyecto-corellian:P10152',notificationId:11});
  const [,route,payload]=calls.at(-1);
  assert.equal(route,'detalle');
  assert.equal(payload.id,'P10152');
  assert.equal(payload.type,'proyecto');
  assert.equal(payload.template,'cliente-unificado');
  assert.equal(payload.source,'instalaciones-concentrado-cliente');
  assert.equal(payload.notificationId,11);
  assert.equal(calls[0][0],'go');
});

test('un Push histórico usa únicamente el sufijo inequívoco emitido por nuestro motor',()=>{
  const {router,calls}=instantiateAdapter();
  router.openTarget({route:'detalle:proyecto:P10152',type:'FOTOGRAFIA_PROYECTO_ACTUALIZADA',body:'Gestor cargó una fotografía del proyecto P10152 (Corellian).'});
  assert.equal(calls.at(-1)[1],'detalle');
  assert.equal(calls.at(-1)[2].id,'P10152');
  calls.length=0;
  router.openTarget({route:'detalle:proyecto:P10152',type:'FOTOGRAFIA_PROYECTO_ACTUALIZADA',body:'Ambiguo'});
  assert.equal(calls.at(-1)[0],'original');
});

test('United y todas las rutas ajenas al FIX mantienen el enrutamiento original',()=>{
  const {router,calls}=instantiateAdapter();
  router.openTarget({route:'detalle:proyecto:P2026',type:'FOTOGRAFIA_PROYECTO_ACTUALIZADA',body:'Fotografía del proyecto P2026 (United).'});
  router.openTarget({route:'detalle:ticket:55',notificationId:3});
  router.openTarget({route:'home:tarea:30',notificationId:4});
  assert.equal(calls.length,3);
  assert.ok(calls.every(item=>item[0]==='original'));
});

test('el listado de Notificaciones marca como leída la foto antes de abrir Corellian',async()=>{
  const {listeners,calls}=instantiateAdapter();
  const row={dataset:{ruta:'detalle:proyecto-corellian:P10152',tipo:'FOTOGRAFIA_PROYECTO_ACTUALIZADA',message:'Foto',id:'77'}};
  let stopped=0;
  const event={target:{closest:(sel)=>sel.includes('notif-new-list')?row:null},preventDefault(){stopped++},stopImmediatePropagation(){stopped++}};
  await listeners.get('click')(event);
  assert.equal(stopped,2);
  assert.equal(calls[0][0], 'http');
  assert.equal(calls[0][1], '/api/notificaciones/77/abrir');
  assert.equal(calls[0][2].method, 'PATCH');
  assert.equal(calls.at(-1)[1],'detalle');
  assert.equal(calls.at(-1)[2].id,'P10152');
});

test('la lectura del histórico usa ambos registros fotográficos y falla cerrado ante ambigüedad',async()=>{
  const queries=[];
  const stub={query:async(sql)=>{queries.push(sql);return [[{
    id_notificacion:3,tipo_notificacion:'FOTOGRAFIA_PROYECTO_ACTUALIZADA',
    ruta_destino:'detalle:proyecto:P10152',ruta_destino_resuelta:'detalle:proyecto-corellian:P10152'
  }]];}};
  const old=Module._load;
  Module._load=function(request,parent,main){
    if(request==='../../config/db')return stub;
    if(request==='../../services/notifications/notification-policy')return {bellVisibilitySql_gnral:()=>'(1 = 1)'};
    return old.call(this,request,parent,main);
  };
  let repo;
  try{
    const file=path.join(ROOT,'backend/src/modules/notificaciones/notificaciones.repository.js');
    delete require.cache[require.resolve(file)];repo=require(file);
  }finally{Module._load=old;}
  const rows=await repo.getNotificaciones({whereSql:'WHERE n.id_usuario = ?',params:[42],orderSql:'ORDER BY n.id_notificacion DESC',limit:30});
  assert.equal(rows[0].ruta_destino,'detalle:proyecto-corellian:P10152');
  assert.equal(rows[0].ruta_destino_resuelta,undefined);
  assert.match(queries[0],/FROM ins_proyecto_fotos pf_cor/);
  assert.match(queries[0],/NOT EXISTS\s*\(\s*SELECT 1 FROM portafolio_proyecto_fotos pf_uni/);
  assert.match(queries[0],/pf_cor\.id_photo = n\.id_referencia/);
  assert.match(queries[0],/pf_uni\.id_photo = n\.id_referencia/);
  assert.match(queries[0], /THEN 'notifications'/);
  assert.doesNotMatch(queries[0],/\bUPDATE\b|\bDELETE\b/i);
});

test('config integra un solo archivo sin alterar la plataforma de API',()=>{
  const source=read('core/config.js');
  assert.match(source,/mg-photo-notification-routes/);
  assert.match(source,/photo-notification-navigation\.js/);
  assert.match(source,/window\.MANTTO_API_BASE/);
  assert.match(source,/window\.MANTTO_SESSION_API_BASE/);
});


test('rutas historicas ambiguas nunca se reescriben a Corellian o United', async () => {
  const calls=[];
  const old=Module._load;
  Module._load=function(request,parent,main){
    if(request==='../../config/db')return {query:async()=>[[{
      id_notificacion:17,ruta_destino:'detalle:proyecto:P10152',
      ruta_destino_resuelta:'notifications'
    }]]};
    if(request==='../../services/notifications/notification-policy')return {bellVisibilitySql_gnral:()=>'(1=1)'};
    return old.call(this,request,parent,main);
  };
  let repo;
  try{
    const file=path.join(ROOT,'backend/src/modules/notificaciones/notificaciones.repository.js');
    delete require.cache[require.resolve(file)];repo=require(file);
  }finally{Module._load=old;}
  const result=await repo.getNotificaciones({whereSql:'WHERE n.id_usuario = ?',params:[42],orderSql:'ORDER BY n.id_notificacion DESC',limit:10});
  assert.equal(result[0].ruta_destino,'notifications');
  assert.equal(result[0].ruta_destino_resuelta,undefined);
});

test('el bootstrap inserta una unica integracion de fotografias en navegador/PWA', () => {
  const scripts=[];
  const document={
    getElementById:()=>scripts[0] || null,
    createElement:()=>({}),
    head:{appendChild:(element)=>scripts.push(element)}
  };
  const window={location:{hostname:'bltnow.netlify.app',origin:'https://bltnow.netlify.app'}};
  vm.runInNewContext(read('core/config.js'),{window,document});
  assert.equal(scripts.length,1);
  assert.equal(scripts[0].id,'mg-photo-notification-routes');
  assert.match(scripts[0].src,/photo-notification-navigation\.js\?v=20261014-v001/);
  assert.equal(window.MANTTO_SESSION_API_BASE,'https://bltnow.netlify.app');
  assert.match(window.MANTTO_API_BASE,/azurewebsites\.net/);
  vm.runInNewContext(read('core/config.js'),{window,document});
  assert.equal(scripts.length,1);
});

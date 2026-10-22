'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const permission='GENERAL_MODO_OFFLINE_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';


test('backend exige permiso general y módulo específico en cada exportación',()=>{
  const routes=read('backend/src/modules/offline-pilot/offline-pilot.routes.js');
  const main=read('backend/src/routes/index.js');
  assert.match(routes,/humanInformationGuard_gnral/);
  assert.match(routes,/domain:\s*'GENERAL'/);
  assert.match(routes,/groupingCode:\s*'MODO_OFFLINE'/);
  assert.match(routes,/router\.get\('\/capabilities',\s*\.\.\.offlinePilotGuard/);
  assert.match(routes,/\.\.\.offlinePilotGuard, \.\.\.resumenDiaGuard/);
  assert.match(routes,/\.\.\.offlinePilotGuard,\.\.\.proyectosGuard/);
  assert.match(main,/router\.use\('\/offline',\s*offlinePilotRoutes\)/);
});

test('capacidades Fase 2 sólo anuncian datasets con permiso y no prometen ejecución cerrada',()=>{
  const service=require('../backend/src/modules/offline-pilot/offline-pilot.service');
  const req={user:{id_SB:99},contextUser:{id_SB:17},viewerContext:{active:true}};
  const rd=service.buildCapabilities(req,[{code:'OPERACION_RESUMEN_DEL_DIA',domain:'UNITED',datasets:['operacion-resumen-dia']}]);
  assert.equal(rd.effective_user_id,17);
  assert.equal(rd.viewer_read_only,true);
  assert.equal(rd.implementation_phase,5);
  assert.equal(rd.datasets.length,1);
  assert.equal(rd.datasets[0].key,'operacion-resumen-dia');
  assert.equal(rd.datasets[0].exporter.kinds.length,2);
  assert.equal(rd.wifi_confirmation_required,false);
  assert.equal(rd.scheduling.exact_background_execution,false);
  assert.equal(rd.scheduling.runs_when_app_is_closed,false);
  assert.equal(rd.synchronization.enabled,true);
  assert.equal(rd.storage_test.writes_operational_data,false);
  assert.deepEqual(service.buildCapabilities(req,[]).datasets,[]);
});

test('frontend conserva guard de permiso y separación de identidad',()=>{
  const index=read('index.html');
  const loader=read('core/module-loader.js');
  const router=read('core/router.js');
  const pilot=read('modules/offline-pilot/offline-pilot.js');
  const storage=read('core/offline-storage.js');
  assert.match(index,new RegExp(`data-permission-code="${permission.replace('.','\\.')}"`));
  assert.match(index,/data-route="offline-configuracion"/);
  assert.match(index,/id="view-offline-configuracion"/);
  assert.match(loader,/'offline-configuracion'.*offline-pilot\.js/);
  assert.match(router,/ManttoOfflinePilot\?\.init/);
  assert.match(pilot,/current\?\.exists===true/);
  assert.match(pilot,/current\?\.efectivo===true\?'granted':'denied'/);
  assert.match(pilot,/apiGet\('\/api\/offline\/capabilities'\)/);
  assert.match(index,/core\/offline-storage\.js/);
  assert.match(index,/core\/offline-scheduler\.js/);
  assert.match(storage,/actor_user_id/);
  assert.match(storage,/effective_user_id/);
  assert.match(storage,/partition_key/);
  assert.match(read('core/user-viewer.js'),/hasCachedOfflineAccess/);
});

test('runtime deniega si usuario carece de permiso offline',async()=>{
  const view={innerHTML:''};let apiCalls=0;
  const sandbox={window:{ManttoPermissions:{state:()=>({exists:true,efectivo:false})},
    ManttoAuth:{apiGet:async()=>{apiCalls++;return {ok:true};},getActorUser:()=>({id_SB:10}),getUser:()=>({id_SB:10})},
    ManttoOfflineStorage:{}},navigator:{onLine:true},
    localStorage:{getItem:()=>null,setItem(){}},
    document:{getElementById:id=>id==='view-offline-configuracion'?view:null},console};
  vm.runInNewContext(read('modules/offline-pilot/offline-pilot.js'),sandbox);
  assert.equal(await sandbox.window.ManttoOfflinePilot.init(),false);
  assert.equal(apiCalls,0);
  assert.match(view.innerHTML,/Modo Offline no habilitado/);
});

test('descarga automática F2 utiliza manifiesto, páginas, alcance y transacción sin Wi-Fi manual',()=>{
  const pilot=read('modules/offline-pilot/offline-pilot.js');
  const scheduler=read('core/offline-scheduler.js');
  const storage=read('core/offline-storage.js');
  assert.doesNotMatch(pilot,/id="off-wifi-confirm"/);
  assert.match(pilot,/ManttoOfflineScheduler\.backupNow\(\)/);
  assert.match(scheduler,/dataset\.exporter\.manifest/);
  assert.match(scheduler,/dataset\.exporter\.page/);
  assert.match(scheduler,/storage\.beginDownload/);
  assert.match(scheduler,/storage\.appendDownload/);
  assert.match(scheduler,/storage\.finishDownload/);
  assert.match(scheduler,/storage\.abandonDownload/);
  assert.match(storage,/schema_version:2/);
});

test('outbox habilitada solo localmente; envío a Aiven sigue deshabilitado',()=>{
  const storage=read('core/offline-storage.js');
  assert.match(storage,/OUTBOX_STORE='outbox'/);
  assert.match(storage,/enabled:true,uploads_enabled:true/);
  assert.doesNotMatch(storage,/syncOutbox|fetch\(/);
});

test('caché de acceso ligada a identidad y vigencia',()=>{
  const values=new Map();
  const localStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,String(v)),
    removeItem:k=>values.delete(k),key:i=>[...values.keys()][i]||null,get length(){return values.size;}};
  const sandbox={window:{indexedDB:null},document:{addEventListener(){}},localStorage,Date,console};
  vm.runInNewContext(read('core/offline-storage.js'),sandbox);
  values.set('mantto:offline-access:10:20',JSON.stringify({saved_at:new Date().toISOString(),data:{permission_code:permission,effective_user_id:20}}));
  assert.equal(sandbox.window.ManttoOfflineStorage.hasCachedAccess(10,20),true);
  assert.equal(sandbox.window.ManttoOfflineStorage.hasCachedAccess(10,21),false);
  assert.equal(sandbox.window.ManttoOfflineStorage.hasCachedAccess(11,20),false);
});

test('Service Worker mantiene caché sólo de shell estático, nunca respuestas API o fotografías',()=>{
  const worker=read('service-worker.js');
  assert.match(worker,/blt-now-shell-/);
  assert.match(worker,/url\.pathname\.includes\('\/api\/'\)/);
  assert.match(worker,/event\.respondWith\(fetch\(request\)\)/);
  assert.match(worker,/caches\.match\('\.\/index\.html'/);
  assert.match(worker,/assets\\\/img\\\/icons/);
  assert.doesNotMatch(worker,/\|jpg\|jpeg/);
  const self={location:{origin:'https://app.example.test',href:'https://app.example.test/'},clients:{},registration:{},addEventListener(){}};
  const sandbox={self,clients:self.clients,URL,URLSearchParams,Promise,Date,setTimeout(){return 0;},clearTimeout(){},MessageChannel:function MessageChannel(){}};
  vm.runInNewContext(worker,sandbox);
  assert.equal(sandbox.isStaticShellRequest({method:'GET',url:'https://app.example.test/core/auth.js'}),true);
  assert.equal(sandbox.isStaticShellRequest({method:'GET',url:'https://app.example.test/modules/offline-pilot/offline-pilot.css'}),true);
  assert.equal(sandbox.isStaticShellRequest({method:'GET',url:'https://app.example.test/uploads/ticket-photo.jpg'}),false);
  assert.equal(sandbox.isStaticShellRequest({method:'GET',url:'https://app.example.test/api/tickets'}),false);
});

test('programación F2 detecta hora preferida pero nunca promete tareas con aplicación cerrada',()=>{
  const listeners={};
  const sandbox={window:{addEventListener:(type,fn)=>listeners[type]=fn,
    setTimeout(){return 0;},clearTimeout(){},setInterval(){return 0;},ManttoAuth:{},ManttoPermissions:{}},
    document:{hidden:false,addEventListener:(type,fn)=>listeners[type]=fn,dispatchEvent(){}},
    localStorage:{getItem:()=>null,setItem(){},removeItem(){}},CustomEvent:function CustomEvent(){},
    Date,console};
  vm.runInNewContext(read('core/offline-scheduler.js'),sandbox);
  const s=sandbox.window.ManttoOfflineScheduler;
  const preferences={daily_enabled:true,preferred_time:'18:00',schedule_started_at:'2026-10-20T09:00:00'};
  assert.equal(s.dueState(preferences,new Date('2026-10-20T17:59:00')).due,false);
  assert.equal(s.dueState(preferences,new Date('2026-10-20T18:01:00')).due,true);
  assert.equal(typeof s.backupNow,'function');
});

'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'..','core','user-viewer.js'),'utf8');
const READ='OPERACION_RESUMEN_DEL_DIA_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';
const WRITE='OPERACION_RESUMEN_DEL_DIA_TICKET.EDITAR';

function memoryStorage(){
  const values=new Map();
  return {values,getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,String(value)),
    removeItem:key=>values.delete(key),key:index=>[...values.keys()][index]||null,
    get length(){return values.size;}};
}

function permissionPayload(){
  const base={agrupacion_codigo:'OPERACION',agrupacion_nombre:'Operación',agrupacion_empresa:'UNITED',
    agrupacion_activo:1,modulo_codigo:'OPERACION_RESUMEN_DEL_DIA',modulo_nombre:'Resumen del Día',
    modulo_ruta_frontend:'resumen',modulo_activo:1,modulo_interno_visual:0};
  return {data:{catalogo:[
    {...base,id_subelemento_accion:101,codigo_permiso:READ},
    {...base,id_subelemento_accion:102,codigo_permiso:WRITE}
  ],permisos:[
    {id_subelemento_accion:101,efectivo:true,configurado:true,heredado:true,personalizado:null},
    {id_subelemento_accion:102,efectivo:true,configurado:true,heredado:true,personalizado:null}
  ],puede_usar_visor:true}};
}

function fixture({storage,apiGet,access=true}={}){
  const listeners=new Map();
  const emptyList=()=>[];
  const body={classList:{toggle(){}},querySelectorAll:emptyList};
  const document={body,getElementById:()=>null,querySelectorAll:emptyList,querySelector:()=>null,
    addEventListener(type,handler){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(handler);},
    dispatchEvent(event){for(const handler of listeners.get(event.type)||[])handler(event);}};
  class Element{}
  const window={
    ManttoAuth:{getActorUser:()=>({id_SB:7}),getUser:()=>({id_SB:7}),isViewingAs:()=>false,apiGet},
    ManttoOfflineStorage:{
      readCachedAccess:(actor,effective)=>access&&actor===7&&effective===7?{
        permission_code:'GENERAL_MODO_OFFLINE_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
        effective_user_id:7,actor_user_id:7,catalog_modules:[]}:null,
      hasCachedAccess:()=>access
    },
    ManttoRouter:{getCurrent:()=>({route:'home'})},
    setTimeout(){return 1;},close(){},alert(){}
  };
  const sandbox={window,document,localStorage:storage,Element,CSS:{escape:value=>String(value)},
    MutationObserver:class{observe(){}},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},
    Date,Map,Set,Promise,console:{error(){},warn(){},log(){}}};
  vm.runInNewContext(source,sandbox);
  return {window,async init(){for(const handler of listeners.get('mantto:auth-ready')||[])await handler();}};
}

test('sidebar offline restaura el Guard de lectura de la misma identidad y bloquea edición',async()=>{
  const storage=memoryStorage();
  const online=fixture({storage,apiGet:async()=>permissionPayload()});
  await online.init();
  assert.equal(online.window.ManttoPermissions.can(READ),true);
  assert.equal(online.window.ManttoPermissions.can(WRITE),true);
  assert.ok(storage.getItem('mantto:offline-session-permissions:v1:7:7'));

  const offline=fixture({storage,apiGet:async()=>{throw new TypeError('Failed to fetch');}});
  await offline.init();
  assert.equal(offline.window.ManttoUserViewer.usingOfflinePermissions(),true);
  assert.equal(offline.window.ManttoPermissions.can(READ),true);
  assert.equal(offline.window.ManttoPermissions.can(WRITE),false);
});

test('sidebar offline no restaura permisos sin capability vigente o ante 403',async()=>{
  const storage=memoryStorage();
  const online=fixture({storage,apiGet:async()=>permissionPayload()});
  await online.init();

  const noAccess=fixture({storage,access:false,apiGet:async()=>{throw new TypeError('Failed to fetch');}});
  await noAccess.init();
  assert.equal(noAccess.window.ManttoUserViewer.usingOfflinePermissions(),false);
  assert.equal(noAccess.window.ManttoPermissions.state(READ).exists,false);

  const denied=new Error('Revocado');denied.status=403;
  const revoked=fixture({storage,apiGet:async()=>{throw denied;}});
  await revoked.init();
  assert.equal(revoked.window.ManttoUserViewer.usingOfflinePermissions(),false);
  assert.equal(revoked.window.ManttoPermissions.state(READ).exists,false);
});

test('shell offline enumera recursos y plantillas sólo de rutas solicitadas',()=>{
  const loader=fs.readFileSync(path.join(__dirname,'..','core','module-loader.js'),'utf8');
  assert.match(loader,/function offlineAssets\(routes\)/);
  assert.match(loader,/OFFLINE_ROUTE_TEMPLATES/);
  assert.match(loader,/instalaciones-administracion_cor\.html/);
  assert.match(loader,/assets\.add\(asset\)/);
  const scheduler=fs.readFileSync(path.join(__dirname,'..','core','offline-scheduler.js'),'utf8');
  assert.match(scheduler,/BLT_CACHE_MODULE_SHELL/);
  assert.match(scheduler,/caps\.catalog_modules\.map\(module=>module\?\.route\)/);

  const window={addEventListener(){}};
  const document={baseURI:'https://app.test/',readyState:'loading',querySelectorAll:()=>[],addEventListener(){}};
  vm.runInNewContext(loader,{window,document,URL,Map,Set,Promise,Date,CustomEvent:class{}});
  const assets=Array.from(window.ManttoModuleLoader.offlineAssets(['instalaciones-administracion','cx-dashboard']));
  assert.ok(assets.some(asset=>asset.includes('instalaciones-administracion_cor.html')));
  assert.ok(assets.some(asset=>asset.includes('customer-experience-dashboard.js')));
  assert.equal(assets.some(asset=>asset.includes('ventas-clientes')),false);
});

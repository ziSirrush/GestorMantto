'use strict';

// [ChatGPT | 2026-10-15 | BLT NOW | FASE4 REGRESSION V001]
// Cross-phase tests, in-memory DB only; never connects to live Aiven.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Module = require('node:module');
const crypto = require('node:crypto');
const installer = require('../tools/apply-cx-visitas-fase4-v001.cjs');
const root = path.resolve(__dirname, '..');
const f3Installer = require('../tools/apply-cx-visitas-fase3-v001.cjs');
const uiOriginal = fs.readFileSync(path.join(root,'release/cx-visitas-fase4/customer-experience-visitas.fase3.original.js'),'utf8');
const uiFinal = fs.readFileSync(path.join(root,'release/cx-visitas-fase4/customer-experience-visitas.js'),'utf8');
const servicePath = path.join(root,'backend/src/modules/customer-experience/customer-experience-visitas.service.js');
function sha(s){return crypto.createHash('sha256').update(s).digest('hex');}
function mockLoadService(repo){
  const real=Module._load;
  Module._load=function(request,parent,isMain){
    if(parent&&path.resolve(parent.filename)===servicePath
      &&request==='./customer-experience-visitas.repository')return repo;
    return real.call(this,request,parent,isMain);
  };
  try {delete require.cache[require.resolve(servicePath)];return require(servicePath);}
  finally{Module._load=real;}
}
function fakeRepo(){
  const rows=[],events=[];let id=1,locked=false;
  const conn={async beginTransaction(){locked=true;this.snap={
    rows:rows.map(x=>({...x})),events:events.map(x=>({...x})),id
  };},async commit(){locked=false;},async rollback(){
    if(this.snap){rows.splice(0,rows.length,...this.snap.rows);events.splice(0,events.length,...this.snap.events);id=this.snap.id;}
    locked=false;
  },release(){}};
  function visible(v,ctx){return ctx.full||ctx.users.includes(v.id_usuario_creador)||ctx.users.includes(v.id_usuario_responsable);}
  const repo={
    getConnection_cor:async()=>conn,
    list_cor:async(_c,f,ctx)=>{const found=rows.filter(x=>!x.inactivo&&visible(x,ctx)).filter(x=>!f.q||x.titulo.includes(f.q));return {rows:found.slice(f.offset,f.offset+f.page_size),total:found.length};},
    getById_cor:async(_c,x,ctx,opts={})=>rows.find(v=>v.id_visita===x&&(opts.includeInactive||!v.inactivo)&&visible(v,ctx))||null,
    listHistory_cor:async(_c,x,pg)=>{const found=events.filter(v=>v.id_visita===x).reverse();return {rows:found.slice(pg.offset,pg.offset+pg.page_size),total:found.length};},
    getActiveAssignee_cor:async(_c,x)=>x===11?{id_SB:11,empresa:'Corellian SA de CV'}:null,
    insert_cor:async(_c,data,actor)=>{const key=id++;rows.push({...data,id_visita:key,id_usuario_creador:actor,id_usuario_ultima_modificacion:actor,estado:'BORRADOR',inactivo:0,resultado:null,fecha_realizada_utc:null,created_at:'2026-10-15T18:00:00Z',updated_at:'2026-10-15T18:00:00Z'});return key;},
    update_cor:async(_c,x,change,actor)=>{const row=rows.find(v=>v.id_visita===x&&!v.inactivo);if(!row)return 0;Object.assign(row,change,{id_usuario_ultima_modificacion:actor});return 1;},
    deactivate_cor:async(_c,x,actor)=>{const row=rows.find(v=>v.id_visita===x&&!v.inactivo);if(!row)return 0;row.inactivo=1;row.id_usuario_ultima_modificacion=actor;return 1;},
    insertHistory_cor:async(_c,x,actor,action,detail)=>{events.push({id_evento:events.length+1,id_visita:x,id_actor_usuario:actor,accion:action,detalle:detail,created_at:'2026-10-15T18:00:00Z'});}
  };
  return {repo,rows,events,conn,getLocked:()=>locked};
}
function req(viewer=false){return {
  user:{id_SB:11},contextUser:{id_SB:11},actorUser:{id_SB:11},
  viewerContext:viewer?{active:true}:null,
  informationAccess:{actor_user_id:11,effective_user_id:11,
    acceso_puerta:true,dominio:'CORELLIAN',agrupacion:{codigo:'CUSTOMER_EXPERIENCE'},
    acceso_dominio_completo:false,requiere_filtro_usuario:true,usuarios_visibles:[11]}
};}
function createBrowser(service,{permission=true,viewer=false}={}){
  const requests=[];
  const nodes={
    'view-placeholder':{isConnected:true,innerHTML:'',handlers:{},contains(){return true;},
      addEventListener(key,fn){this.handlers[key]=fn;},querySelector(selector){return selector==='#cxv-dialog-overlay'?{addEventListener(){}}:null;}},
    'cxv-page':{},'cxv-feedback':{textContent:'',hidden:true,className:''},
    'cxv-results':{innerHTML:''},'cxv-counter':{textContent:''},'cxv-pager':{innerHTML:''},
    'cxv-dialog-overlay':{hidden:true,querySelector:()=>({focus(){}})},
    'cxv-dialog-title':{textContent:''},'cxv-dialog-content':{innerHTML:'',querySelector(){return null;},prepend(){}},
    'cxv-save':{disabled:false,textContent:''},'app-context-subtitle':{textContent:''}
  };
  async function callApi(url,opts){
    requests.push({url,method:opts.method||'GET'});
    const parsed=new URL(url,'http://localhost');
    const seg=parsed.pathname.split('/');
    const rootPath='/api/customer-experience/visitas';
    const q=Object.fromEntries(parsed.searchParams);
    const method=opts.method||'GET';
    const id=Number(seg[4]);
    const body=opts.body?JSON.parse(opts.body):null;
    const ctx=req(viewer);
    try{
      let data,code=200;
      if(parsed.pathname===rootPath){
        if(method==='GET')data=await service.list_cor(ctx,q);
        else if(method==='POST'){data=await service.create_cor(ctx,body);code=201;}
      } else if(Number.isSafeInteger(id)&&id>0){
        if(parsed.pathname.endsWith('/historial'))data=await service.history_cor(ctx,id,q);
        else if(method==='GET')data=await service.get_cor(ctx,id);
        else if(method==='PATCH')data=await service.edit_cor(ctx,id,body);
        else if(method==='DELETE')data=await service.deactivate_cor(ctx,id);
      }
      if(!data)throw new Error(`Operacion no reconocida: ${method} ${parsed.pathname}`);
      return {ok:true,source:'aiven',...data,status:code};
    }catch(error){
      error.status=error.status||500;throw error;
    }
  }
  const context={console,Date,Intl,URLSearchParams,Number,String,Object,Array,
    FormData:class FakeFormData {constructor(node){this.values=node.values||{};} *[Symbol.iterator](){yield*Object.entries(this.values);}},
    window:{confirm:()=>true,ManttoRouter:{getCurrent:()=>({route:'cx-visitas'})},
      ManttoAuth:{isViewingAs:()=>viewer,api:callApi},
      ManttoPermissions:{state(code){return {exists:true,efectivo:permission||(!code.endsWith('VER_HISTORIAL')&&code.endsWith('.VER'))};}}},
    document:{getElementById:id=>nodes[id]||null,addEventListener(){},createElement(){return {className:'',setAttribute(){},textContent:''};}}
  };
  vm.createContext(context);
  vm.runInContext(uiFinal,context,{filename:'cx-visitas-f4.js'});
  return {ui:context.window.ManttoCustomerExperienceVisitas,nodes,requests,context};
}
async function tick(){return new Promise(resolve=>setTimeout(resolve,15));}
function fixtureAppF3(){
  const base='(function(){\n'+
    '  // [Aster | 2026-10-07 | ASTER-MG | FASE 1 ENTREGAS V001]\n'+
    '  function bindGlobalNavigation(){\n    applyTemporarySidebarPermissions();\n    openSidebarGroup(null);\n  }\n'+
    '  function initAfterAuth(){\n    bindCustomerExperienceEncuestas_cor();\n    bindEntregasControl_gnral();\n  }\n})();';
  return f3Installer.transform(base,{verifyBlob:false}).content;
}
test('01 - Integridad de frontend F3 y F4',()=>{
  assert.equal(sha(uiOriginal),installer.SHA_F3_UI);
  assert.equal(sha(uiFinal),installer.SHA_F4_UI);
  assert.match(uiFinal,/cxv-history-lookup-form/);
  assert.match(uiFinal,/FASE 4 QA V001/);
});
test('02 - F4 mantiene sintaxis JS y marca F3 sin duplicarla',()=>{
  new vm.Script(uiFinal);new vm.Script(installer.transformAppF4(fixtureAppF3()));
  assert.equal((uiFinal.match(/FASE 3 FRONTEND V001/g)||[]).length,1);
});
test('03 - F4 modifica una sola URL JS y preserva CSS, Dashboard y Encuestas',()=>{
  const f3=fixtureAppF3(),f4=installer.transformAppF4(f3);
  assert.ok(f4.includes('customer-experience-visitas.js?v=20261015-fase4-v001'));
  assert.ok(!f4.includes('customer-experience-visitas.js?v=20261015-fase3-v001'));
  assert.equal((f4.match(/customer-experience-visitas.css\?v=20261015-fase3-v001/g)||[]).length,1);
  assert.ok(f4.includes('bindCustomerExperienceEncuestas_cor'));
  assert.ok(f4.includes('bindEntregasControl_gnral'));
  assert.equal(f4.length-f3.length,0);
});
test('04 - F4 conserva marcas de BLT NOW y GH sin modificar manifests',()=>{
  const html='<title>BLT NOW</title><meta name="app" content="BLT NOW GH">'+
    '<script src="./core/app.js?v=20261015-cx-visitas-fase3-v001"></script>';
  const out=installer.transformIndexF4(html);
  assert.match(out,/BLT NOW GH/);
  assert.match(out,/cx-visitas-fase4-v001/);
  assert.equal((out.match(/<script/g)||[]).length,1);
});
test('05 - Anclas incorrectas/multiples son rechazadas (fail-closed)',()=>{
  assert.throws(()=>installer.transformAppF4('console.log(1)'),/no tiene el enlace/);
  assert.throws(()=>installer.transformAppF4(fixtureAppF3()+fixtureAppF3()),/duplicada/);
  assert.throws(()=>installer.transformIndexF4('<title>BLT NOW</title>'),/PWA/);
});
test('06 - Estados mixtos de instalacion no son aceptados como instalados',()=>{
  const f3={app:'A',index:'B',ui:'C'},f4={app:'a',index:'b',ui:'c'};
  assert.equal(installer.classify({...f3},{phase3:f3,phase4:f4}),'LISTO_FASE3');
  assert.equal(installer.classify({...f4},{phase3:f3,phase4:f4}),'FASE4_APLICADA');
  assert.equal(installer.classify({app:'a',index:'B',ui:'c'},{phase3:f3,phase4:f4}),'CONFLICTO');
});
test('07 - Fuente JS completa: solo mejora historial, sin cambiar endpoints ni contrato',()=>{
  assert.match(uiFinal,/\/api\/customer-experience\/visitas/);
  assert.ok(uiFinal.includes("method: mode === 'edit' ? 'PATCH' : 'POST'"));
  assert.ok(uiFinal.includes("method: 'DELETE'"));
  assert.doesNotMatch(uiFinal,/localStorage\.setItem|indexedDB|MOCK_DATA/);
  assert.ok(uiFinal.includes('window.ManttoAuth.api'));
});
test('08 - SQL QA es estrictamente solo lectura sin DDL/DML',()=>{
  let sql=fs.readFileSync(path.join(root,'database/03_PRECHECK_RELEASE_CX_VISITAS_V001.sql'),'utf8');
  sql=sql.replace(/^\s*--.*$/gm,'');
  assert.doesNotMatch(sql,/\b(UPDATE|INSERT|DELETE|ALTER|TRUNCATE|DROP|CREATE|REPLACE|SET|GRANT|REVOKE)\b/i);
  assert.match(sql,/information_schema\.TABLES/i);
  assert.match(sql,/cx_visitas_historial/);
});
test('09 - F1 SQL, F2 backend y F4 frontend comparten tablas y cinco acciones',()=>{
  const sql=fs.readFileSync(path.join(root,'database/01_APLICAR_FASE_1_CX_VISITAS_V001.sql'),'utf8');
  const service=fs.readFileSync(servicePath,'utf8');
  const router=fs.readFileSync(path.join(root,'backend/src/modules/customer-experience/customer-experience-visitas.routes.js'),'utf8');
  for(const name of ['cx_visitas','cx_visitas_historial']){assert.match(sql,new RegExp(name));assert.match(router,/router\.(get|post|patch|delete)/);}
  for(const action of ['VER','CREAR','EDITAR','DESACTIVAR','VER_HISTORIAL']){
    assert.match(service,new RegExp('CUSTOMER_EXPERIENCE_VISITAS_GESTION_REGISTROS\\.'+action));
  }
});
test('10 - El historial por ID no se muestra si falta VER_HISTORIAL',async()=>{
  const {repo}=fakeRepo(),svc=mockLoadService(repo),browser=createBrowser(svc,{permission:false});
  await browser.ui.init();
  assert.doesNotMatch(browser.nodes['view-placeholder'].innerHTML,/id="cxv-history-lookup-form"/);
  const calls=browser.requests.length;
  browser.nodes['view-placeholder'].handlers.submit({preventDefault(){},target:{id:'cxv-history-lookup-form',values:{id_visita:'1'}}});
  await tick();
  assert.equal(browser.requests.length,calls);
});
test('11 - F4 boton de historial es accesible aunque visita esta desactivada',async()=>{
  const db=fakeRepo(),svc=mockLoadService(db.repo),browser=createBrowser(svc);
  const create=await svc.create_cor(req(),{titulo:'QA F4 prueba historica'});
  const id=create.visita.id_visita;
  await svc.edit_cor(req(),id,{titulo:'QA F4 editada'});
  await svc.deactivate_cor(req(),id);
  assert.equal((await svc.list_cor(req(),{})).total,0);
  assert.equal((await svc.history_cor(req(),id,{})).total,3);
  await browser.ui.init();
  assert.match(browser.nodes['view-placeholder'].innerHTML,/id="cxv-history-lookup-form"/);
  const el={id:'cxv-history-lookup-form',values:{id_visita:String(id)}};
  browser.nodes['view-placeholder'].handlers.submit({preventDefault(){},target:el});
  await tick();
  assert.ok(browser.requests.some(x=>x.url.includes(`/${id}/historial?`)));
  assert.match(browser.nodes['cxv-dialog-content'].innerHTML,/DESACTIVAR/);
  assert.match(browser.nodes['cxv-dialog-content'].innerHTML,/EDITAR/);
  assert.match(browser.nodes['cxv-dialog-content'].innerHTML,/CREAR/);
  assert.equal(browser.nodes['cxv-dialog-overlay'].hidden,false);
  assert.equal(db.getLocked(),false);
});
test('12 - Historial por ID rechaza IDs no validos sin realizar consulta',async()=>{
  const svc=mockLoadService(fakeRepo().repo),b=createBrowser(svc);await b.ui.init();
  const calls=b.requests.length;
  b.nodes['view-placeholder'].handlers.submit({preventDefault(){},target:{id:'cxv-history-lookup-form',values:{id_visita:'1 OR 1=1'}}});
  await tick();
  assert.equal(b.requests.length,calls);
  assert.match(b.nodes['cxv-feedback'].textContent,/ID de visita valido/);
});
test('13 - Visor lectura: backend rechaza escritura aunque UI sea alterada',async()=>{
  const svc=mockLoadService(fakeRepo().repo),b=createBrowser(svc,{viewer:true});await b.ui.init();
  assert.doesNotMatch(b.nodes['view-placeholder'].innerHTML,/data-cxv-action="new"/);
  await assert.rejects(svc.create_cor(req(true),{titulo:'intrusion'}),error=>error.code==='VIEWER_READ_ONLY');
});
test('14 - Guardar frontend no registra informacion de estado ni actor del cliente',async()=>{
  const db=fakeRepo(),svc=mockLoadService(db.repo),b=createBrowser(svc);await b.ui.init();
  b.nodes['view-placeholder'].handlers.click({target:{closest:()=>({dataset:{cxvAction:'new'},disabled:false})}});
  const form={id:'cxv-edit-form',dataset:{mode:'create'},values:{
    titulo:'QA UI E2E IN MEMORY',objetivo:'Observacion',observaciones:'',
    referencia_origen:'',referencia_id:'',proyecto_nombre:'Sitio Demo',
    cliente_nombre:'Cliente Prueba',ubicacion:'CDMX',
    fecha_programada_local:'2026-10-15T12:30',id_usuario_responsable:'11'
  }};
  b.nodes['view-placeholder'].handlers.submit({preventDefault(){},target:form});
  await tick();
  assert.equal(db.rows.length,1);
  assert.equal(db.rows[0].estado,'BORRADOR');
  assert.equal(db.rows[0].id_usuario_creador,11);
  assert.equal(db.rows[0].fecha_programada_utc,'2026-10-15 18:30:00.000');
  assert.equal(db.events.length,1);
  assert.equal(db.events[0].accion,'CREAR');
  assert.equal(db.events[0].id_actor_usuario,11);
});
test('15 - No se oculta un error de BD al usuario con datos ficticios',async()=>{
  const s=mockLoadService(fakeRepo().repo),browser=createBrowser(s);await browser.ui.init();
  browser.context.window.ManttoAuth.api=async()=>{const e=new Error('API no habilitada');e.status=503;e.code='CX_VISITAS_API_NOT_ENABLED';throw e;};
  await browser.ui.init();
  assert.match(browser.nodes['cxv-feedback'].textContent,/CX_VISITAS_API_ENABLED=true/);
  assert.match(browser.nodes['cxv-results'].innerHTML,/No fue posible consultar/);
});

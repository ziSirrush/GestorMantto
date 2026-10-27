'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Module = require('node:module');

const ROOT = path.join(__dirname, '../src/modules/experimental-ns');
// Lectura de constantes del repositorio F2 con DB simulada, sin credenciales.
let F2;
{
  const original = Module._load;
  Module._load = function(request, parent, isMain) {
    if(request === '../../config/db') return {query: async()=>[[]]};
    if(request === '../../services/information-record-scope-gnral.service') return {buildPortafolioScopeSql_gnral:()=>({sql:'1=0',params:[]}),buildTicketScopeSql_gnral:()=>({sql:'1=0',params:[]})};
    return original.call(this, request, parent, isMain);
  };
  try { F2 = require(path.join(ROOT, 'experimental-ns.repository')); }
  finally { Module._load = original; }
}
const PERMISSION = 'EXPERIMENTAL_NS_RESUMEN_DIA_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';
const REPO_PATH = path.join(ROOT, 'experimental-ns-resumen-dia.repository.js');
const SERVICE_PATH = path.join(ROOT, 'experimental-ns-resumen-dia.service.js');
const ROUTES_PATH = path.join(ROOT, 'experimental-ns-resumen-dia.routes.js');
const FRONT_PATH = path.join(__dirname,'../../modules/experimental-ns/resumen-dia/resumen-dia-ns.js');
const SHELL_PATH = path.join(__dirname,'../../modules/experimental-ns/experimental-ns.js');

function context(permission = PERMISSION, extra = {}) {
  return { informationAccess: {
    dominio:'UNITED', motor:'alcance_uni', agrupacion:{codigo:'EXPERIMENTAL_NS'},
    acceso_puerta:true, permission_code:permission,
    llave_maestra:false, zona_ids:[5], zona_codigos:['CENTRO'],
    ...extra
  }};
}

function freshModules(db, accessService) {
  const original = Module._load;
  const cached = [REPO_PATH, SERVICE_PATH, path.join(ROOT, 'experimental-ns.scope.js'),
    path.join(ROOT,'experimental-ns.repository.js')];
  cached.forEach(file=>{ try{delete require.cache[require.resolve(file)];}catch(_e){} });
  Module._load = function(request, parent, isMain) {
    if(request === '../../config/db') return db;
    if(request === '../../services/information-record-scope-gnral.service') return accessService;
    return original.call(this, request, parent, isMain);
  };
  try {
    const service = require(SERVICE_PATH);
    const repository = require(REPO_PATH);
    const scope = require(path.join(ROOT, 'experimental-ns.scope.js'));
    return {service, repository, scope};
  } finally {Module._load=original;}
}

function fakeDatabase(options = {}) {
  const statements = [];
  const db = { async query(sql,params=[]) {
    statements.push({sql,params});
    if(sql.includes('INFORMATION_SCHEMA.COLUMNS')) {
      const rows=[];
      for(const [table,cols] of Object.entries(F2.REQUIRED_COLUMNS)) {
        for(const col of cols) rows.push({TABLE_NAME:table,COLUMN_NAME:col});
      }
      if(options.missingColumn) return [rows.filter(r=>r.COLUMN_NAME!==options.missingColumn)];
      return [rows];
    }
    if(sql.includes('FROM ns_tickets_pruebas t')) return [[{ticket:'001',codigo_equipo:'ABC',fecha_reporte:'2026-10-26'}]];
    if(sql.includes('FROM ns_portafolio_pruebas p')) return [[{numero_equipo:'ABC',zona_id:5,proyecto:'CENTRO'}]];
    throw Error('SQL desconocida: '+sql.slice(0,130));
  }};
  return {db,statements};
}
const officialScope = {
  buildPortafolioScopeSql_gnral(){return {sql:'p.zona_id IN (?)',params:[5]};},
  buildTicketScopeSql_gnral(){return {
    sql:`t.codigo_equipo IS NOT NULL AND
      EXISTS (SELECT 1 FROM portafolio p_scope_uni_ticket_equipo WHERE p_scope_uni_ticket_equipo.zona_id IN (?))
      AND EXISTS (SELECT 1 FROM portafolio p_scope_uni_ticket_project_check WHERE p_scope_uni_ticket_project_check.zona_id IN (?))
      AND EXISTS (SELECT 1 FROM portafolio p_scope_uni_ticket_project WHERE p_scope_uni_ticket_project.zona_id IN (?))`,
    params:[5,5,5]
  };}
};

test('F3: puerta y permiso exclusivo de Resumen del Dia', async()=>{
  const {db}=fakeDatabase();const {service}=freshModules(db,officialScope);
  await assert.rejects(service.getInitialData(context('EXPERIMENTAL_NS_EQUIPOS_CRITICOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL')),
    e=>e.statusCode===403&&e.code==='EXPERIMENTAL_NS_RESUMEN_PERMISSION_REQUIRED');
});

test('F3: rechaza contexto sin agrupacion experimental', async()=>{
  const {db}=fakeDatabase();const {service}=freshModules(db,officialScope);
  await assert.rejects(service.getInitialData(context(PERMISSION,{agrupacion:{codigo:'PORTAFOLIO'}})),e=>e.statusCode===403);
});

test('F3: SQL de ambos universos no toca tablas productivas', async()=>{
  const {db,statements}=fakeDatabase();const {service}=freshModules(db,officialScope);
  const data=await service.getInitialData(context());
  assert.deepEqual(data.tablas,['ns_tickets_pruebas','ns_portafolio_pruebas']);
  assert.equal(data.modo,'SOLO_LECTURA');
  assert.equal(data.total.tickets,1);
  assert.equal(data.total.portafolio,1);
  assert.equal(data.criticidad,'PENDIENTE_FASE4');
  for(const {sql} of statements){
    assert.doesNotMatch(sql,/\b(?:FROM|JOIN)\s+`?(?:tickets|portafolio|z_op)`?(?=\s|$)/i);
    assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|REPLACE|TRUNCATE|ALTER|DROP)\b/i);
  }
  const ticketStatement=statements.find(({sql})=>sql.includes('FROM ns_tickets_pruebas t'));
  assert.ok(ticketStatement);
  assert.equal((ticketStatement.sql.match(/FROM ns_portafolio_pruebas/g)||[]).length,4);
  assert.deepEqual(ticketStatement.params,[5,5,5]);
});

test('F3: entrega alcance que realmente autorizo el backend', async()=>{
  const {db}=fakeDatabase();const {service}=freshModules(db,officialScope);
  const result=await service.getInitialData(context());
  assert.deepEqual(result.alcance.zona_ids,[5]);
  assert.deepEqual(result.alcance.zonas,['CENTRO']);
});

test('F3: sin columnas esenciales no consulta ninguna tabla experimental', async()=>{
  const {db,statements}=fakeDatabase({missingColumn:'custeventblt_mot_det'});
  const {service}=freshModules(db,officialScope);
  await assert.rejects(service.getInitialData(context()),e=>e.statusCode===503&&e.code==='EXPERIMENTAL_NS_SCHEMA_INCOMPLETE');
  assert.equal(statements.filter(({sql})=>sql.includes('FROM ns_tickets_pruebas t')).length,0);
});

test('F3: consultas fallidas no cambian a datos reales', async()=>{
  const {db}=fakeDatabase();const {repository}=freshModules(db,{
    buildPortafolioScopeSql_gnral: officialScope.buildPortafolioScopeSql_gnral,
    buildTicketScopeSql_gnral(){return {sql:'EXISTS (SELECT 1 FROM tickets t_produccion)',params:[]};}
  });
  await assert.rejects(repository.getInitialData(context()),e=>e.statusCode===503);
});

test('F3: en la ruta solo GET y permisos individuales',()=>{
  const original=Module._load;
  const seen=[];const calls=[];const router={
    use(...args){calls.push(['use',...args]);},
    get(...args){calls.push(['get',...args]);}
  };
  Module._load=function(request,parent,isMain){
    if(request==='express')return {Router(){return router;}};
    if(request==='./experimental-ns-resumen-dia.controller')return {getInitialData(){}};
    if(request==='../../middleware/information-access-gnral.middleware') return {
      humanInformationGuard_gnral(options){seen.push(options);return [()=>{},()=>{}];}
    };
    return original.call(this,request,parent,isMain);
  };
  try{delete require.cache[require.resolve(ROUTES_PATH)];require(ROUTES_PATH);}
  finally{Module._load=original;}
  assert.ok(calls.some(x=>x[0]==='get'&&x[1]==='/resumen-dia/inicial'));
  assert.ok(seen.some(x=>x.permissionCode===PERMISSION&&x.groupingCode==='EXPERIMENTAL_NS'));
  assert.equal(calls.filter(x=>x[0]==='get').length,1);
  assert.ok(calls.every(x=>x[0]!=='post'&&x[0]!=='put'&&x[0]!=='delete'));
});

test('F3: SQL de vista de proyecto no concede acceso con etiquetas libres',()=>{
  const {db}=fakeDatabase();const {repository}=freshModules(db,officialScope);
  const sql=repository.projectZoneDisplaySql('t');
  assert.match(sql,/COUNT\(DISTINCT p_ns_project\.zona_id\) = 1/);
  assert.match(sql,/p_ns_project\.estado_registro = 1/);
  assert.doesNotMatch(sql,/\bFROM portafolio\b/i);
});

test('F3: la interfaz solamente solicita el endpoint Experimental NS',()=>{
  const js=fs.readFileSync(FRONT_PATH,'utf8');
  const f1=fs.readFileSync(SHELL_PATH,'utf8');
  assert.match(js,/\/api\/experimental-ns\/resumen-dia\/inicial/);
  assert.doesNotMatch(js,/['"]\/api\/(?:operacion|equipos-criticos|tickets\/)/);
  assert.match(js,/data-nsns-detail/);
  assert.match(f1,/loadResumenDiaNS/);
  assert.match(f1,/window\.ManttoResumenDiaNS\.init\(\)/);
  assert.doesNotMatch(js,/ManttoDetails|ManttoResumenDia\._detailData/);
});

test('F3: inicia por el cascaron F1 sin consultar produccion', async()=>{
  const source=fs.readFileSync(SHELL_PATH,'utf8');
  let loaded=0,started=0;
  const view={innerHTML:''};
  const window={
    ManttoRouter:{getCurrent:()=>({route:'experimental-ns-resumen-dia'})},
    ManttoModuleLoader:{
      loadStyle(src){assert.ok(src.includes('resumen-dia')||src.includes('experimental-ns-protection.css')||src.includes('experimental-ns-performance.css'));return Promise.resolve();},
      loadScript(src){if(src.includes('experimental-ns-live.js')||src.includes('experimental-ns-protection.js')||src.includes('experimental-ns-performance.js'))return Promise.resolve();assert.match(src,/experimental-ns\/resumen-dia\/resumen-dia-ns\.js/);loaded++;window.ManttoResumenDiaNS={init(){started++;return true;}};return Promise.resolve();}
    }
  };
  const document={getElementById(id){return id==='view-experimental-ns-resumen-dia'?view:null;}};
  vm.runInNewContext(source,{window,document,console});
  assert.equal(window.ManttoExperimentalNsF1.init('experimental-ns-resumen-dia'),true);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(loaded,1);assert.equal(started,1);
});

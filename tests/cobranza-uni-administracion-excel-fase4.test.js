'use strict';
// [BLT NOW | 2026-10-23 | COBRANZA_UNI_ADMIN_EXCEL_FASE_4_V001]
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const B='backend/src/modules/cobranza-uni-administracion/';
const MP='modules/cobranza-uni/administracion/mantenimiento-preventivo/';
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const C=require('../backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.constants');
const formula=require('../backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.mp-formulas');
const goodRequest=()=>({informationAccess:{empresa:'UNITED',acceso_puerta:true},
  contextUser:{id_SB:17},query:{}});
const verified=Object.freeze({territorial:'mp.`id_proyecto_cobranza` = 777',
  canonical:'mp.`id_proyecto_cobranza`'});
function service({getConnection}={}){
  const mod={exports:{}};
  vm.runInNewContext(read(B+'cobranza-uni-administracion.mp-zona1-grid.js'),{
    module:mod,exports:mod.exports,require:name=>{
      if(name==='../../config/db')return {getConnection:getConnection||(()=>{throw Error('NO_DB');})};
      if(name==='../../services/cobranza-uni-scope.service')return {
        buildCobranzaProjectScopeSql_uni:()=>verified.territorial,
        canonicalProjectSql_uni:()=>verified.canonical
      };
      if(name==='./cobranza-uni-administracion.constants')return C;
      throw Error('require no permitido: '+name);
    }
  });
  return mod.exports;
}
function zone(overrides={}){
  const result={};
  for(const {name} of C.MP_ZONE1_COLUMNS_UNI)result[name]=null;
  return {...result,id_mp_zona_1:'77',id_dmp:'41',proyecto:'PROYECTO UNO',
    idns:'P111',cliente:'BLT',numero_factura_01:'F-001',...overrides};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function mockConn(rows=[zone()],total=rows.length){
  const queries=[];
  return {queries,conn:{async query(sql,params){queries.push({sql,params});
    return [sql.includes('COUNT(*)')?[{total:String(total)}]:rows];
  },release(){}}};
}
function zoneResponse(rows,opts={}){
  return {ok:true,source:'aiven',readonly:true,table:'detalle_mp_2026_zona_1',
    identity_verified:true,relation:'id_dmp',primary_key:'id_mp_zona_1',
    columns:C.MP_ZONE1_COLUMNS_UNI,rows,total:rows.length,pages:rows.length?1:0,
    page:1,page_size:25,sort:'id_mp_zona_1',order:'asc',...opts};
}
function zoneHarness(response,extra={}){
  const events={},nodes=new Map(),requests=[];
  const node=k=>{if(!nodes.has(k))nodes.set(k,{
    innerHTML:'',textContent:'',value:'',dataset:{},disabled:false,scrollTop:0,scrollLeft:0,
    setAttribute(){},focus(){}
  });return nodes.get(k);};
  const root={innerHTML:'',querySelector:node,querySelectorAll(){return [];},
    addEventListener(k,fn){events[k]=fn;},removeEventListener(k){delete events[k];},
    replaceChildren(){this.innerHTML='';}};
  const win={ManttoAuth:{apiGet:async url=>{requests.push(url);return typeof response==='function'?response(url):response;},
    api(){throw Error('Zona 1 no puede escribir en F4.');}}};
  vm.runInNewContext(read(MP+'mantenimiento-preventivo-zona1.js'),{window:win,URLSearchParams});
  const app=win.ManttoCobranzaMPZona1_uni.mount(root,{isCurrent:()=>true,...extra});
  return {app,events,node,root,requests};
}
test('F4 contrato: exactamente 128 campos y 12 bloques completos; 4 técnicos',()=>{
  assert.equal(C.MP_ZONE1_COLUMNS_UNI.length,128);
  assert.equal(new Set(C.MP_ZONE1_COLUMNS_UNI.map(c=>c.name)).size,128);
  for(let i=1;i<=12;i++){
    const n=String(i).padStart(2,'0');
    assert.equal(C.MP_ZONE1_COLUMNS_UNI.filter(c=>c.name.endsWith('_'+n)).length,9);
  }
  for(const k of ['id_mp_zona_1','id_dmp','created_at','updated_at'])
    assert.ok(C.MP_ZONE1_COLUMNS_UNI.some(c=>c.name===k&&c.kind==='protected'));
});
test('F4 SQL: JOIN exclusivamente por id_dmp, scope y canónica comprobados en COUNT y SELECT',()=>{
  const svc=service(),params=svc.parseGridParams_uni({});
  const sql=svc.buildGridSql_uni(params,verified);
  for(const query of [sql.countSql,sql.selectSql]){
    assert.match(query,/INNER JOIN `detalle_mp_2026` mp ON mp\.`id_dmp` = z\.`id_dmp`/);
    assert.match(query,/mp\.`id_proyecto_cobranza` = 777/);
    assert.match(query,/\(mp\.`id_proyecto_cobranza`\) IS NOT NULL/);
    assert.match(query,/mp\.`proyecto`/);
    assert.match(query,/mp\.`idns`/);
    assert.doesNotMatch(query,/JOIN[^\n]*ON[^\n]*proyecto\s*=/i);
    assert.doesNotMatch(query,/\bUPDATE\b|\bINSERT\b|\bDELETE\b/i);
  }
  assert.match(sql.selectSql,/LIMIT \? OFFSET \?/);
  assert.equal((sql.selectSql.match(/AS `id_mp_zona_1`/g)||[]).length,1);
  assert.deepEqual(Array.from(sql.selectParams),[25,0]);
});
test('F4 filtros: solo whitelist, paginación limitada y LIKE escapado',()=>{
  const svc=service();
  const cases=[{sort:'id_mp_zona_1; DROP TABLE pc'},{filter_column:'otro',filter_value:'abc'},
    {page:'0'},{page_size:'100'},{order:'up'},{filter_value:'x'},
    {search:['a']},{search:'a\u0000b'},{unknown:'foo'}];
  for(const data of cases)assert.throws(()=>svc.parseGridParams_uni(data),{statusCode:400});
  const opts=svc.parseGridParams_uni({page:'2',page_size:'15',sort:'facturacion_07',order:'desc',
    search:'A!_%',filter_column:'numero_factura_01',filter_value:'F_%'});
  const queries=svc.buildGridSql_uni(opts,verified);
  assert.match(queries.selectSql,/ORDER BY z\.`facturacion_07` DESC/);
  assert.equal(queries.countParams.length,6);
  assert.equal(queries.countParams[0],'%A!!!_!%%');
  assert.equal(queries.countParams.at(-1),'%F!_!%%');
  assert.equal(queries.selectParams.at(-2),15);
  assert.equal(queries.selectParams.at(-1),15);
});
test('F4 servicio: no conecta Aiven si falta puerta UNITED/alcance',async()=>{
  let connectionOpened=0;
  const svc=service({getConnection:async()=>{connectionOpened++;throw Error('NO_DB');}});
  await assert.rejects(svc.listMpZona1Grid_uni({...goodRequest(),informationAccess:{empresa:'CORELLIAN',acceso_puerta:true}}),
    {statusCode:403,code:'MP_ZONA1_GRID_ACCESO_DENEGADO'});
  await assert.rejects(svc.listMpZona1Grid_uni(goodRequest(),{
    scopeBuilder:()=>'',scopeService:{canonicalProjectSql_uni:()=>''}}),
    {statusCode:403,code:'MP_ZONA1_GRID_ALCANCE_NO_VERIFICADO'});
  assert.equal(connectionOpened,0);
});
test('F4 servicio: COUNT + SELECT paginados (sin N+1), filas auditables y ninguna escritura',async()=>{
  const svc=service(),f=mockConn([zone(),zone({id_mp_zona_1:'88',id_dmp:'42'})]);
  const data=await svc.listMpZona1Grid_uni(goodRequest(),{connection:f.conn});
  assert.equal(data.ok,true);assert.equal(data.readonly,true);
  assert.equal(data.table,'detalle_mp_2026_zona_1');
  assert.equal(data.identity_verified,true);assert.equal(data.rows.length,2);
  assert.equal(data.columns.length,128);assert.equal(f.queries.length,2);
  assert.ok(f.queries.every(x=>/^SELECT /.test(x.sql)));
  assert.match(f.queries[0].sql,/COUNT\(\*\)/);
  assert.match(f.queries[1].sql,/LIMIT \? OFFSET \?/);
});
test('F4 servicio: cuando no hay filas no lanza SELECT completo',async()=>{
  const svc=service(),f=mockConn([],0);
  const data=await svc.listMpZona1Grid_uni(goodRequest(),{connection:f.conn});
  assert.equal(data.rows.length,0);assert.equal(data.pages,0);assert.equal(f.queries.length,1);
});
test('F4 servicio: bloquea fila incompleta, id inválido, duplicados y conteos absurdos',async()=>{
  const svc=service();
  for(const f of [mockConn([zone({id_dmp:null})]),mockConn([zone(),zone()]),
    mockConn([(({id_dmp,...rest})=>rest)(zone())])]){
    await assert.rejects(svc.listMpZona1Grid_uni(goodRequest(),{connection:f.conn}),
      {statusCode:409,code:'MP_ZONA1_GRID_FILAS_INVALIDAS'});
  }
  const f=mockConn([],9007199254740992n);
  await assert.rejects(svc.listMpZona1Grid_uni(goodRequest(),{connection:f.conn}),
    {statusCode:409,code:'MP_ZONA1_GRID_CONTEO_INVALIDO'});
});
test('F4 ruta: MAIN + MP.VER, no concede acceso por EDITAR solamente',async()=>{
  const registry=[],guard=()=>{},P={MAIN_VISUAL:'MAIN',TABLE_PERMISSIONS:{detalle_mp_2026:{view:'MP_VER',edit:'MP_EDIT'}},ALL_TABLE_PERMISSIONS:[]};
  let rights=new Map(),called=0;
  const fake={exports:{}};
  vm.runInNewContext(read(B+'cobranza-uni-administracion.routes.js'),{
    module:fake,exports:fake.exports,
    require:name=>{
      if(name==='express')return {Router:()=>({get(route,...handlers){registry.push({method:'GET',route,handlers});},post(){},patch(){}})};
      if(name==='../../middleware/information-access-gnral.middleware')return {humanInformationGuard_gnral:()=>[guard]};
      if(name==='../../services/permissions/effective-permission.service')return {listEffectivePermissions:async()=>rights};
      if(name.endsWith('.permissions'))return P;
      if(name.endsWith('.constants'))return C;
      if(name.endsWith('.gc-service'))return {listGestionCredito_uni:()=>{}};
      if(name.endsWith('.pc-service'))return {listVentaAdicionalAdmin_uni:()=>{}};
      if(name.endsWith('.pc-edit-validation'))return {PHASE3_SAFE_FIELDS_UNI:[]};
      if(name.endsWith('.pc-edit-service'))return {pcEditFeatureEnabled_uni:()=>false,updateSinglePc_uni(){},updateMultiPc_uni(){}};
      if(name.endsWith('.pc-create-service'))return {createGateEnabled_uni:()=>false,preflightCreatePc_uni(){},createPc_uni(){}};
      if(name.endsWith('.gc-edit-service'))return {updateSingleGc_uni(){},updateMultiGc_uni(){}};
      if(name.endsWith('.mp-edit-validation'))return {PHASE4_SAFE_FIELDS_MP_UNI:[]};
      if(name.endsWith('.mp-edit-service'))return {mpEditFeatureEnabled_uni:()=>false,updateSingleMp_uni(){},updateMultiMp_uni(){}};
      if(name.endsWith('.mp-zona1-grid'))return {listMpZona1Grid_uni:async()=>{called++;return {ok:true,readonly:true};}};
      throw Error('Unexpected require '+name);
    }
  });
  const route=registry.find(x=>x.route==='/tablas/detalle_mp_2026/zona-1/registros');
  assert.ok(route);assert.ok(route.handlers.includes(guard));
  const respond=()=>{let code=200;return {status(n){code=n;return this;},json(payload){return {code,payload};}};};
  let response=await route.handlers.at(-1)({contextUser:{id_SB:17}},respond(),error=>{throw error;});
  assert.equal(response.code,403);assert.equal(called,0);
  rights=new Map([[P.TABLE_PERMISSIONS.detalle_mp_2026.edit,true]]);
  response=await route.handlers.at(-1)({contextUser:{id_SB:17}},respond(),error=>{throw error;});
  assert.equal(response.code,403);assert.equal(called,0);
  rights=new Map([[P.TABLE_PERMISSIONS.detalle_mp_2026.view,true]]);
  response=await route.handlers.at(-1)({contextUser:{id_SB:17}},respond(),error=>{throw error;});
  assert.equal(response.code,200);assert.equal(called,1);
  response=await route.handlers.at(-1)({},respond(),error=>{throw error;});
  assert.equal(response.code,401);
});
test('F4 frontend: 128 columnas Excel y una fila, sanitiza XSS, nunca POST/PATCH',async()=>{
  const ui=zoneHarness(zoneResponse([zone({cliente:'<img src=x onerror=alert(1)>',facturacion_12:'99.99'})]));
  await tick();const table=ui.node('[data-mpz-body]').innerHTML;
  assert.equal((table.match(/<td\b/g)||[]).length,128);
  assert.equal((ui.node('[data-mpz-head]').innerHTML.match(/<th\b/g)||[]).length,128);
  assert.match(table,/&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(table,/<img src/);
  assert.match(ui.node('[data-mpz-head]').innerHTML,/Factura 12/);
  assert.doesNotMatch(ui.root.innerHTML,/data-mpz-apply|data-mpz-edit|data-mpz-bulk-form/);
  assert.equal(ui.requests.length,1);ui.app.destroy();
});
test('F4 frontend: servidor sin confirmación de identidad no expone filas',async()=>{
  const res=zoneResponse([zone({cliente:'SECRETO'})],{identity_verified:false});
  const ui=zoneHarness(res);await tick();
  assert.doesNotMatch(ui.node('[data-mpz-body]').innerHTML,/SECRETO/);
  assert.match(ui.node('[data-mpz-status]').textContent,/No se pudo consultar Zona 1/);
  ui.app.destroy();
});
test('F4 frontend: navegación de tabla mantiene filtros, orden y paginación en GET',async()=>{
  const ui=zoneHarness(url=>{
    const p=new URL('http://localhost'+url).searchParams;
    return zoneResponse([zone()],{page:Number(p.get('page')),page_size:Number(p.get('page_size')),
      total:75,pages:3});
  });
  await tick();
  ui.node('[data-mpz-search]').value='UNO';
  ui.node('[data-mpz-filter-column]').value='numero_factura_01';
  ui.node('[data-mpz-filter-value]').value='F-001';
  let prevented=0;
  ui.events.submit({target:{matches:sel=>sel==='[data-mpz-form]'},preventDefault(){prevented++;}});
  await tick();
  assert.equal(prevented,1);
  assert.match(ui.requests.at(-1),/search=UNO/);
  assert.match(ui.requests.at(-1),/filter_column=numero_factura_01/);
  ui.events.click({target:{closest:sel=>sel==='[data-mpz-sort]'?{dataset:{mpzSort:'facturacion_01'}}:null}});
  await tick();assert.match(ui.requests.at(-1),/sort=facturacion_01/);
  ui.events.click({target:{closest:sel=>sel==='[data-mpz-next]'?{}:null}});
  await tick();assert.match(ui.requests.at(-1),/page=2/);
  ui.app.destroy();
});
test('F4 frontend: petición asincrónica después de destruir no modifica tabla',async()=>{
  let release;const ui=zoneHarness(()=>new Promise(resolve=>release=resolve));
  ui.app.destroy();release(zoneResponse([zone()]));await tick();
  assert.equal(ui.root.innerHTML,'');assert.equal(ui.node('[data-mpz-body]').innerHTML,'');
});
test('F4 integración: solo MP muestra dos pestañas, carga Zona 1 una vez y la destruye',async()=>{
  const events={},nodes=new Map(),calls=[];
  const node=selector=>{
    if(!nodes.has(selector))nodes.set(selector,{
      innerHTML:'',textContent:'',dataset:{},hidden:selector.includes('zona1'),disabled:false,
      value:'',setAttribute(name,value){this[name]=value;},reset(){},scrollLeft:0,scrollTop:0
    });
    return nodes.get(selector);
  };
  const root={innerHTML:'',querySelector:node,querySelectorAll:sel=>sel==='[data-mp-tab]'?
    [{dataset:{mpTab:'principal'},setAttribute(){}},{dataset:{mpTab:'zona1'},setAttribute(){}}]:[],
    addEventListener(name,fn){events[name]=fn;},replaceChildren(){this.innerHTML='';}};
  let mounted=0,destroyed=0;
  const win={ManttoCobranzaMPZona1_uni:{mount(){mounted++;return {destroy(){destroyed++;}};}},
    ManttoAuth:{apiGet:async url=>{
      calls.push(url);return {ok:true,table:'detalle_mp_2026',readonly:true,
        columns:C.MP_COLUMNS_UNI,rows:[],total:0,pages:0,
        formula_preview:formula.buildMpFormulaPreview_uni([])};
    }}};
  vm.runInNewContext(read(MP+'mantenimiento-preventivo.js'),{window:win,document:{},URLSearchParams});
  const app=win.ManttoCobranzaAdministracionMP_uni.mount(root,{isCurrent:()=>true});
  await tick();assert.match(root.innerHTML,/data-mp-tab="principal"/);
  assert.match(root.innerHTML,/data-mp-tab="zona1"/);
  assert.doesNotMatch(root.innerHTML,/data-mp-zona1-dialog|data-mp-zona1-preflight/);
  assert.equal(mounted,0);
  const clickTab=name=>events.click({target:{closest:s=>s==='[data-mp-tab]'?{dataset:{mpTab:name}}:null}});
  clickTab('zona1');assert.equal(mounted,1);
  assert.equal(node('[data-mp-panel="principal"]').hidden,true);
  assert.equal(node('[data-mp-panel="zona1"]').hidden,false);
  clickTab('principal');assert.equal(node('[data-mp-panel="zona1"]').hidden,true);
  clickTab('zona1');assert.equal(mounted,1);
  app.destroy();assert.equal(destroyed,1);assert.equal(calls.length,1);
});
test('F4 limpieza: no quedan grupos, modal Zona 1 ni preflight en frontend; backend legacy se conserva',()=>{
  const js=read(MP+'mantenimiento-preventivo.js');
  const css=read(MP+'mantenimiento-preventivo.css');
  const zoneJs=read(MP+'mantenimiento-preventivo-zona1.js');
  const main=read('modules/cobranza-uni/administracion/main/main.js');
  const backend=read(B+'cobranza-uni-administracion.routes.js');
  for(const old of ['data-mp-zona1-dialog','data-mp-zona1-apply','data-mp-zona1-preflight',
    'data-mp-zone1-open','openZona1','applyZone1','renderZone1Actions','data-mp-group']){
    assert.doesNotMatch(js,new RegExp(old));
  }
  assert.doesNotMatch(css,/\.cua-mp-zona1-dialog|\.cua-mp-zona1-backdrop/);
  // F5 solo permite PATCH con el contrato validado; nunca alta/vinculo POST.
  assert.match(zoneJs,/method:\s*'PATCH'/);
  assert.doesNotMatch(zoneJs,/method:\s*'POST'/);
  assert.match(main,/mantenimiento-preventivo-zona1\.js/);
  assert.match(main,/mantenimiento-preventivo\.js\?v=20261023-mp-manual-fields-v001/);
  assert.match(backend,/\/tablas\/detalle_mp_2026\/zona-1\/registros/);
  assert.match(backend,/\/tablas\/detalle_mp_2026\/registros\/:id\/zona-1/);
});

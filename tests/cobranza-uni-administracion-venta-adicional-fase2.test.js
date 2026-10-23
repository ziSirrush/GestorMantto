'use strict';
// [BLT NOW | 2026-10-23 | COBRANZA_UNI_VA_ADMIN_FASE_2_V001]
// Requiere solamente Node. Sin conexiones ni credenciales; no archivos ignorados.
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const vm=require('node:vm');
// F5: mock de lecturas relaciones para aislar el contrato F2/F4.
const mockPcRelationsF5_uni=async (_req,_conn,rows,cutoff)=>({
  source:'relaciones_aiven',mode:'preview_only',as_of:cutoff,
  rows:rows.map(row=>({id_pc:String(row.id_pc),values:{},warnings:[]})),
  fields:['terminos','zona_operativa','estado','estatus_cartera','adeudo','facturas_pendientes_pago'],
  project_summary:{projects:0,complete:0,incomplete:0},formula_rows:rows
});

const ROOT=path.resolve(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(ROOT,rel),'utf8');
const c=require('../backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.constants');
const q=require('../backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.pc-query');
const perm=require('../backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.permissions');
function make(params={},scope='pc.id_pc > 0'){
  return q.buildPcListQuery_uni(q.parseListPcQuery_uni(params),scope);
}

test('VA F2: conserva el contrato previo con 31 columnas y PK protegida',()=>{
  assert.equal(c.TABLES_UNI.pc.schemaReady,true);
  assert.equal(c.PC_COLUMNS_UNI.length,31);
  assert.equal(c.PC_COLUMNS_UNI.filter(x=>x.kind==='protected').length,2);
  assert.equal(c.PC_COLUMNS_UNI.filter(x=>x.kind==='derived').length,14);
  assert.equal(c.PC_COLUMNS_UNI.filter(x=>x.kind==='editable').length,15);
  assert.equal(c.getTableContract_uni('pc').primaryKey,'id_pc');
});

test('VA F2: READ ONLY SELECT/COUNT acotados por scope y columnas de lista blanca',()=>{
  const sql=make({page:'3',page_size:'30',sort:'fecha_factura',order:'desc'},'pc.id_pc > 100');
  assert.match(sql.countSql,/^SELECT COUNT\(\*\) AS total FROM `pc` pc WHERE \(pc.id_pc > 100\)/);
  assert.match(sql.selectSql,/^SELECT /);
  assert.match(sql.selectSql,/ORDER BY pc\.`fecha_factura` DESC, pc\.`id_pc` ASC LIMIT \? OFFSET \?/);
  assert.deepEqual(sql.selectParams,[30,60]);
  assert.deepEqual(sql.countParams,[]);
  assert.match(sql.selectSql,/CAST\(pc\.`id_pc` AS CHAR\) AS `id_pc`/);
  assert.match(sql.selectSql,/CAST\(pc\.`id_proyecto_cobranza` AS CHAR\) AS `id_proyecto_cobranza`/);
  for(const {name} of c.PC_COLUMNS_UNI)assert.ok(sql.selectSql.includes('`'+name+'`'),name);
  for(const statement of [sql.selectSql,sql.countSql])
    assert.doesNotMatch(statement,/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER|CREATE)\s+(?:TABLE\s+|INTO\s+|FROM\s+)?`?pc`?/i);
});

test('VA F2: filtros exactos de columna, búsqueda y caracteres LIKE escapados',()=>{
  const sql=make({search:'a_%!',filter_column:'comentarios_cobranza',filter_value:'T!_%'});
  assert.match(sql.selectSql,/CAST\(pc\.`comentarios_cobranza` AS CHAR\) LIKE \? ESCAPE '!'/);
  assert.equal(q.GLOBAL_SEARCH_FIELDS_UNI.length,10);
  assert.equal(sql.countParams.length,11);
  assert.equal(sql.countParams[0],'%a!_!%!!%');
  assert.equal(sql.countParams.at(-1),'%T!!!_!%%');
  assert.deepEqual(sql.selectParams.slice(0,-2),sql.countParams);
});

test('VA F2: deniega inyección de orden, filtro, página y controles',()=>{
  for(const p of [
    {sort:'id_pc; DROP TABLE pc'},
    {filter_column:'id_pc OR 1=1',filter_value:'1'},
    {filter_value:'1'},
    {order:'desc; DELETE'},
    {page:'-1'},{page:'1 OR 1=1'},{page:100001},
    {page_size:101},{page_size:0},
    {search:'a\n'},{search:'x'.repeat(121)},
    {sort:['id_pc']},{filter_column:{x:'id_pc'}}
  ])assert.throws(()=>q.parseListPcQuery_uni(p),{code:'COBRANZA_UNI_VA_ADMIN_CONSULTA_INVALIDA'});
  assert.throws(()=>make({},''),/Alcance UNITED no disponible/);
  assert.deepEqual(q.parseListPcQuery_uni({}),{
    page:1,pageSize:30,search:'',filterColumn:'',filterValue:'',sort:'id_pc',order:'desc'
  });
});

test('VA F2: el servicio usa el scope oficial con alias pc, paginación y BIGINT texto',async()=>{
  const code=read('backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.pc-service.js');
  const mod={exports:{}};
  const required=name=>{
    if(name==='../../config/db')return {getConnection(){throw Error('NO_AIVEN');}};
    if(name==='../../services/cobranza-uni-scope.service')return {buildCobranzaProjectScopeSql_uni(){throw Error('SCOPE_MOCK_ONLY');}};
    if(name.endsWith('.pc-query'))return q;
    if(name.endsWith('.pc-relations-service'))return {previewPcRelationsFromAiven_uni:mockPcRelationsF5_uni};
    if(name.endsWith('.pc-formulas'))return require('../backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.pc-formulas');
    if(name.endsWith('.constants'))return c;
    throw Error('Dependencia no prevista '+name);
  };
  vm.runInNewContext(code,{module:mod,exports:mod.exports,require:required});
  const used=[];
  const connection={async query(sql,params){
    used.push({sql,params});
    return used.length===1?[[{total:'95'}]]:[[{id_pc:'9007199254740993',proyecto:'ESTACION NORTE'}]];
  }};
  const aliases=[];
  const result=await mod.exports.listVentaAdicionalAdmin_uni({query:{page:'2',page_size:'30'}},{
    connection,scopeBuilder:(req,alias)=>{aliases.push(alias);return '(pc.id_pc > 0)';},
    relationsPreview:mockPcRelationsF5_uni
  });
  assert.deepEqual(aliases,['pc']);
  assert.equal(result.table,'pc');assert.equal(result.readonly,true);
  assert.equal(result.total,95);assert.equal(result.pages,4);
  assert.equal(result.rows[0].id_pc,'9007199254740993');
  assert.equal(result.columns.length,31);
  assert.equal(used.length,2);
  assert.match(used[0].sql,/pc\.id_pc > 0/);
  assert.match(used[1].sql,/pc\.id_pc > 0/);
  assert.equal(used[1].params.at(-1),30);
});

test('VA F2: página fuera de rango omite SELECT pero conserva COUNT acotado',async()=>{
  const code=read('backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.pc-service.js');
  const mod={exports:{}};
  vm.runInNewContext(code,{module:mod,exports:mod.exports,require:name=>{
    if(name==='../../config/db')return {};
    if(name==='../../services/cobranza-uni-scope.service')return {};
    if(name.endsWith('.pc-query'))return q;
    if(name.endsWith('.pc-relations-service'))return {previewPcRelationsFromAiven_uni:mockPcRelationsF5_uni};
    if(name.endsWith('.pc-formulas'))return require('../backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.pc-formulas');
    if(name.endsWith('.constants'))return c;
    throw Error(name);
  }});
  const queries=[];
  const r=await mod.exports.listVentaAdicionalAdmin_uni({query:{page:'100'}},{
    connection:{async query(sql){queries.push(sql);return [[{total:'20'}]];}},scopeBuilder:()=>'(1=1)',
    relationsPreview:mockPcRelationsF5_uni
  });
  assert.equal(queries.length,1);assert.equal(r.rows.length,0);
  assert.equal(r.pages,1);assert.equal(r.page,100);
});

test('VA F2: ruta requiere MAIN + permiso VER exclusivo de pc (EDITAR no basta)',async()=>{
  const registrations=[];
  const router={get(path,...handlers){registrations.push({method:'GET',path,handlers});},patch(){},post(){},use(){}};
  let rights=new Map();
  let listed=[];
  let reads=0;
  const guardFn=()=>{};
  const mod={exports:{}};
  vm.runInNewContext(read('backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.routes.js'),{
    module:mod,exports:mod.exports,require:name=>{
      if(name==='express')return {Router:()=>router};
      if(name==='../../middleware/information-access-gnral.middleware')
        return {humanInformationGuard_gnral:()=>[guardFn]};
      if(name==='../../services/permissions/effective-permission.service')
        return {listEffectivePermissions:async(id,codes)=>{listed.push({id,codes});return rights;}};
      if(name.endsWith('.constants'))return c;
      if(name.endsWith('.permissions'))return perm;
      if(name.endsWith('.gc-service'))return {listGestionCredito_uni() {throw Error('GC_CALLED');}};
      if(name.endsWith('.gc-edit-service'))return {updateSingleGc_uni(){},updateMultiGc_uni(){}};
      if(name.endsWith('.pc-service'))return {listVentaAdicionalAdmin_uni:async()=>{reads++;return {ok:true,table:'pc',readonly:true};}};
      if(name.endsWith('.pc-edit-validation'))return {PHASE3_SAFE_FIELDS_UNI:[]};
      if(name.endsWith('.pc-edit-service'))return {pcEditFeatureEnabled_uni:()=>false,updateSinglePc_uni(){},updateMultiPc_uni(){}};
      if(name.endsWith('.pc-create-service'))return {createGateEnabled_uni:()=>false,preflightCreatePc_uni(){},createPc_uni(){}};
      throw Error('Módulo no esperado '+name);
    }
  });
  const route=registrations.find(x=>x.path==='/tablas/pc/registros');
  assert.ok(route);
  assert.ok(route.handlers.includes(guardFn),'requiere guard MAIN, puerta UNITED, agrupación');
  const handler=route.handlers.at(-1);
  function response(){let code=200;return {status(n){code=n;return this;},json(payload){return {code,payload};}};}
  const req={contextUser:{id_SB:14},viewerContext:{active:false},query:{}};
  rights=new Map([[perm.TABLE_PERMISSIONS.pc.edit,true]]);
  let res=await handler(req,response(),error=>{throw error;});
  assert.equal(res.code,403);assert.equal(reads,0);
  assert.deepEqual(Array.from(listed.at(-1).codes),[perm.TABLE_PERMISSIONS.pc.view]);
  rights=new Map([[perm.TABLE_PERMISSIONS.pc.view,true]]);
  res=await handler(req,response(),error=>{throw error;});
  assert.equal(res.code,200);assert.equal(res.payload.readonly,true);assert.equal(reads,1);
  res=await handler({query:{}},response(),error=>{throw error;});
  assert.equal(res.code,401);
});

test('VA F2/F3: frontend conserva grupos, filtros, scroll y 31 columnas bajo edicion independiente',()=>{
  const main=read('modules/cobranza-uni/administracion/main/main.js');
  const js=read('modules/cobranza-uni/administracion/venta-adicional/venta-adicional.js');
  const css=read('modules/cobranza-uni/administracion/venta-adicional/venta-adicional.css');
  assert.match(main,/if\(table==='pc'\)/);
  assert.match(main,/ManttoCobranzaAdministracionPC_uni\?\.mount/);
  assert.match(main,/loader\.loadStyle\('\.\/modules\/cobranza-uni\/administracion\/venta-adicional\//);
  assert.match(main,/loader\.loadScript\('\.\/modules\/cobranza-uni\/administracion\/venta-adicional\//);
  for(const word of ['data-pc-search','data-pc-page-size','data-pc-filter-column',
    'data-pc-filter-value','data-pc-sort','data-pc-prev','data-pc-next','data-pc-group']){
    assert.ok(js.includes(word),word);
  }
  for(const group of ['resumen','operacion','facturacion','cartera','todas'])
    assert.ok(js.includes(group+':Object.freeze'),group);
  assert.match(js,/readonly!==true/);
  assert.match(js,/ManttoAuth\.apiGet/);
  assert.match(js,/method:'PATCH'/);
  assert.doesNotMatch(js,/\b(?:apiDelete|apiPut)\b|method\s*:\s*['"](?:PUT|DELETE)['"]/);
  assert.match(js,/method:'POST'/);
  assert.match(js,/options\.canEdit===true/);
  assert.match(css,/\.cua-uni-page:has\(\.cua-pc-admin\)\{width:100%;max-width:none/);
  assert.match(css,/overflow:auto/);
  assert.match(css,/position:sticky/);
  assert.match(css,/@media\(max-width:760px\)/);
});

test('VA F2/F3: no introduce SQL versionado ni elimina activadores GAS',()=>{
  const routes=read('backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.routes.js');
  assert.match(routes,/router\.patch\('\/tablas\/pc\/registros\/:id'/);
  assert.match(routes,/router\.patch\('\/tablas\/pc\/registros\/edicion-multiple'/);
  assert.match(routes,/router\.post\('\/tablas\/pc\/registros\/validar-alta'/);
  assert.match(routes,/router\.post\('\/tablas\/pc\/registros'/);
  assert.doesNotMatch(routes,/router\.(?:put|delete)\('\/tablas\/pc\//i);
  assert.match(read('.gitignore'),/^\*\.sql$/m);
  assert.ok(!fs.existsSync(path.join(ROOT,'database/migrations/20261023_venta_adicional_fase2.sql')));
});

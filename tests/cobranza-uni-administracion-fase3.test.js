'use strict';
// [BLT NOW | 2026-10-23 | COBRANZA_UNI_ADMINISTRACION_FASE_3_V001]
// Sin Aiven: tests de SQL, alcance, lecturas y cascaron.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const P = (rel) => fs.readFileSync(path.join(ROOT,rel),'utf8');
const contract = require('../backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.constants');
const query = require('../backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.gc-query');

function build(options={},scope='gc.id_gc > 0') {
  return query.buildGestionCreditoQuery_uni(query.parseListQuery_uni(options), scope);
}

test('F3: 29 campos GC, 20 editables incluido idns, 2 PK/FK y 7 calculados', () => {
  assert.equal(contract.GC_COLUMNS_UNI.length,29);
  assert.equal(contract.GC_EDITABLE_FIELDS_UNI.length,20);
  assert.equal(contract.GC_PROTECTED_FIELDS_UNI.length,2);
  assert.equal(contract.GC_DERIVED_FIELDS_UNI.length,7);
  assert.ok(contract.GC_EDITABLE_FIELDS_UNI.includes('idns'));
  assert.ok(contract.GC_DERIVED_FIELDS_UNI.includes('suministro'));
  assert.ok(contract.GC_DERIVED_FIELDS_UNI.includes('anticipo'));
});

test('F3: consulta SELECT separada del COUNT, aplica scope, pagina, limita columnas', () => {
  const sql = build({page:'2',page_size:'25',sort:'proyecto',order:'desc'});
  assert.match(sql.countSql,/SELECT COUNT\(\*\) AS total FROM `gestion_credito` gc WHERE \(gc\.id_gc > 0\)/);
  assert.match(sql.selectSql,/ORDER BY gc\.`proyecto` DESC, gc\.`id_gc` ASC LIMIT \? OFFSET \?/);
  assert.deepEqual(sql.selectParams,[25,25]);
  assert.deepEqual(sql.countParams,[]);
  assert.match(sql.selectSql,/CAST\(gc\.`id_gc` AS CHAR\) AS `id_gc`/);
  assert.match(sql.selectSql,/CAST\(gc\.`id_proyecto_cobranza` AS CHAR\) AS `id_proyecto_cobranza`/);
  for(const col of contract.GC_COLUMNS_UNI){
    assert.ok(sql.selectSql.includes('`'+col.name+'`'),col.name);
  }
  assert.doesNotMatch(sql.selectSql,/\b(?:UPDATE|DELETE|INSERT)\b/i);
});

test('F3: filtros por cualquier columna, comodines escapados y 11 parametros globales',()=>{
  const sql=build({search:'x_%!',filter_column:'anticipo',filter_value:'S_I',sort:'adeudo',order:'asc'});
  assert.match(sql.selectSql,/CAST\(gc\.`anticipo` AS CHAR\) LIKE \? ESCAPE '!'/);
  assert.match(sql.selectSql,/CAST\(gc\.`id_gc` AS CHAR\) LIKE \? ESCAPE '!'/);
  assert.equal(sql.countParams.length,query.GLOBAL_SEARCH_FIELDS.length+1);
  assert.equal(sql.countParams[0],'%x!_!%!!%');
  assert.equal(sql.countParams.at(-1),'%S!_I%');
  assert.deepEqual(sql.selectParams.slice(0,-2),sql.countParams);
});

test('F3: bloquea SQL injection por sort, columna, order, paginas y controles',()=>{
  for(const options of [
    {sort:'id_gc; DROP TABLE gestion_credito'},
    {filter_column:'gc.id_gc OR 1=1',filter_value:'1'},
    {page_size:'1000'},
    {page:'1 OR 1=1'},
    {page:0},
    {order:'desc; DELETE'},
    {filter_value:'SIN_COLUMNA'},
    {search:'a\n'},
    {search:'a'.repeat(121)}
  ]) assert.throws(()=>query.parseListQuery_uni(options),{code:'COBRANZA_UNI_ADMIN_CONSULTA_INVALIDA'});
  assert.throws(()=>build({},''),/Alcance UNITED no disponible/);
  assert.equal(query.parseListQuery_uni({}).pageSize,50); // default seguro
});

test('F3: obtiene totales y paginas usando conexion simulada sin conexion externa', async()=>{
  // Evita cargar mysql2 al importar service en estas pruebas.
  const Module=require('node:module');
  const source=P('backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.gc-service.js');
  const vm=require('node:vm');
  const moduleObject={exports:{}};
  const fakeRequire=(name)=>{
    if(name==='../../config/db')return {getConnection(){throw new Error('NO_AIVEN');}};
    if(name==='../../services/cobranza-uni-scope.service')return {buildCobranzaProjectScopeSql_uni(){return '1=0';}};
    if(name.endsWith('gc-query'))return query;
    if(name.endsWith('constants'))return contract;
    throw new Error('Require no esperado '+name);
  };
  vm.runInNewContext(source,{module:moduleObject,exports:moduleObject.exports,require:fakeRequire});
  const calls=[];
  const connection={async query(sql,params){calls.push({sql,params});return calls.length===1?[[{total:'37'}]]:[[{id_gc:'9007199254740993',proyecto:'TEST'}]];}};
  const result=await moduleObject.exports.listGestionCredito_uni({query:{page:'2',page_size:'25'}},{connection,scopeBuilder:()=>'(gc.id_gc > 1)'});
  assert.equal(result.total,37);assert.equal(result.pages,2);assert.equal(result.rows[0].id_gc,'9007199254740993');
  assert.equal(result.readonly,true);assert.equal(calls.length,2);
  assert.match(calls[0].sql,/gc\.id_gc > 1/);assert.match(calls[1].sql,/gc\.id_gc > 1/);
  assert.equal(calls[1].params.at(-1),25);
});

test('F3: bloqueo por permiso de VER de tabla y alcance UNITED backend',()=>{
  const routes=P('backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.routes.js');
  assert.match(routes,/humanInformationGuard_gnral/);
  assert.match(routes,/domain: 'UNITED'/);
  assert.match(routes,/groupingCode: 'COBRANZA_UNI'/);
  assert.match(routes,/router\.get\('\/tablas\/gestion_credito\/registros', \.\.\.guard/);
  assert.match(routes,/TABLE_PERMISSIONS\.gestion_credito\.view/);
  assert.match(routes,/rights\.get\(permission\) !== true/);
  // F3 continúa siendo lectura; los PATCH de F4 tienen rutas separadas.
  assert.match(routes,/router\.patch\('\/tablas\/gestion_credito\/registros/);
  const scope=P('backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.gc-service.js');
  assert.match(scope,/cobranzaScope\.buildCobranzaProjectScopeSql_uni/);
});

test('F3: frontend con scroll, cabeceras ordenables, filtros y paginacion, SIN escritura',()=>{
  const js=P('modules/cobranza-uni/administracion/gestion-credito/gestion-credito.js');
  const css=P('modules/cobranza-uni/administracion/gestion-credito/gestion-credito.css');
  const main=P('modules/cobranza-uni/administracion/main/main.js');
  assert.match(js,/URLSearchParams/);
  assert.match(js,/data-gc-sort/);assert.match(js,/data-gc-prev/);assert.match(js,/data-gc-next/);
  assert.match(js,/data-gc-filter-column/);
  assert.match(js,/ManttoAuth\.apiGet/);
  assert.match(js,/ESC\(value\)/);
  assert.match(css,/overflow:auto/);
  assert.match(css,/position:sticky/);
  assert.match(main,/ManttoCobranzaAdministracionGC_uni\?\.mount/);
  assert.match(main,/ManttoModuleLoader/);
  assert.match(main,/loader\.loadScript/);
  assert.match(main,/loader\.loadStyle/);
  // F4 solo escribe mediante PATCH explícito, con expected por celda.
  assert.match(js,/method:'PATCH'/);
  assert.match(js,/expected:/);
});

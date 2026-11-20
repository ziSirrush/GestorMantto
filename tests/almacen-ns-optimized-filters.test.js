'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const dbPath=require.resolve(path.join(root,'backend/src/config/db.js'));
const queryPath=require.resolve(path.join(root,'backend/src/modules/almacen/almacen.ns-query-service.js'));
const prevDb=require.cache[dbPath],prevQuery=require.cache[queryPath];
const oldFlag=process.env.BLT_OPT_ALMACEN_FILTERS_V1;
const calls=[];
const fakeDb={query: async (sql,params=[])=>{
  calls.push({sql,params});
  if(sql.includes('SELECT id_lote AS loteImportacion'))return [[{loteImportacion:'inv-1',fechaCorte:'2026-11-10'}]];
  if(sql.includes('SELECT COUNT(*) AS filas FROM almacen_ns_inventario'))return [[{filas:3}]];
  if(sql.includes('SELECT id_lote AS idLote FROM almacen_ns_lotes'))return [[{idLote:'cat-1'}]];
  if(sql.includes('GROUP BY empresa WITH ROLLUP'))return [[
    {empresa:'CORELLIAN',referencias:2,piezas:'10',__sinStock:1,filasConValor:2,valorTotal:'250'},
    {empresa:null,referencias:2,piezas:'10',__sinStock:1,filasConValor:2,valorTotal:'250'}
  ]];
  if(sql.includes('SELECT COUNT(*) AS referencias,COALESCE(SUM(fisico)'))return [[{referencias:2,piezas:'10',sinStock:1,filasConValor:2,valorTotal:'250'}]];
  if(sql.includes('SELECT empresa,COUNT(*) AS referencias'))return [[{empresa:'CORELLIAN',referencias:2,piezas:'10',filasConValor:2,valorTotal:'250'}]];
  if(sql.includes('SELECT COUNT(DISTINCT idUbicacionNs) AS almacenes'))return [[{almacenes:1}]];
  if(sql.includes('SELECT almacen,empresa,COUNT(*)'))return [[{almacen:'BODEGA',empresa:'CORELLIAN',referencias:2,piezas:'10',valorTotal:'250'}]];
  if(sql.includes('SELECT codigo,articulo,empresa,fisico AS total'))return [[{codigo:'AG-1',articulo:'A',empresa:'CORELLIAN',total:'10'}]];
  if(sql.includes('SELECT codigo,articulo,empresa,valor AS total'))return [[{codigo:'AG-1',articulo:'A',empresa:'CORELLIAN',total:'250'}]];
  if(sql.includes('SELECT DISTINCT empresa AS value'))return [[{value:'CORELLIAN'}]];
  if(sql.includes('SELECT DISTINCT categoria AS value'))return [[{value:'CAT'}]];
  if(sql.includes('SELECT DISTINCT almacen AS value'))return [[{value:'BODEGA'}]];
  throw new Error('SQL sin fixture: '+sql);
}};
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:fakeDb};
delete require.cache[queryPath];
const queries=require(queryPath);
const scope={subsidiaryIds:['2','3','5']};

test('dashboard produce salida equivalente y ahorra 1 agregacion al activar ROLLUP',async()=>{
  process.env.BLT_OPT_ALMACEN_FILTERS_V1='0';calls.length=0;
  const before=await queries.getDashboard(scope);
  assert.equal(calls.filter(c=>c.sql.includes('FROM (SELECT MIN(v.id)')).length,4);
  process.env.BLT_OPT_ALMACEN_FILTERS_V1='1';calls.length=0;
  const after=await queries.getDashboard(scope);
  assert.deepEqual(after,before,'los KPIs y las empresas son equivalentes');
  assert.equal(calls.filter(c=>c.sql.includes('WITH ROLLUP')).length,1);
  assert.equal(calls.filter(c=>c.sql.includes('AS sinStock')).length,0);
  assert.equal(calls.length,8,'3 metadatos de lote + 5 consultas de dashboard');
});

test('catalogos leen empresa y almacen directamente del inventario, sin cruzar catalogo',async()=>{
  process.env.BLT_OPT_ALMACEN_FILTERS_V1='1';calls.length=0;
  const result=await queries.getCatalogs(scope);
  assert.deepEqual(result.companies,['CORELLIAN']);
  assert.deepEqual(result.warehouses,['BODEGA']);
  assert.deepEqual(result.categories,['CAT']);
  const companies=calls.find(c=>c.sql.includes('SELECT DISTINCT empresa AS value'));
  const warehouses=calls.find(c=>c.sql.includes('SELECT DISTINCT almacen AS value'));
  const categories=calls.find(c=>c.sql.includes('SELECT DISTINCT categoria AS value'));
  for(const c of [companies,warehouses]){
    assert.match(c.sql,/FROM almacen_ns_inventario i/);
    assert.doesNotMatch(c.sql,/LEFT JOIN/);
    assert.match(c.sql,/id_subsidiaria_ns IN \(\?\)/);
    assert.deepEqual(c.params,['inv-1',scope.subsidiaryIds]);
  }
  assert.match(categories.sql,/LEFT JOIN/);
});

test.after(()=>{
  if(oldFlag===undefined)delete process.env.BLT_OPT_ALMACEN_FILTERS_V1;else process.env.BLT_OPT_ALMACEN_FILTERS_V1=oldFlag;
  if(prevDb)require.cache[dbPath]=prevDb;else delete require.cache[dbPath];
  if(prevQuery)require.cache[queryPath]=prevQuery;else delete require.cache[queryPath];
});

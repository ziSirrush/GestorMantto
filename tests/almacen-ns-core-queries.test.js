'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const dbPath=require.resolve(path.join(root,'backend/src/config/db.js'));
const modulePath=require.resolve(path.join(root,'backend/src/modules/almacen/almacen.ns-query-service.js'));
const oldDb=require.cache[dbPath],oldModule=require.cache[modulePath];
const previous=process.env.BLT_OPT_ALMACEN_FILTERS_V1;
const calls=[];
const fakeDb={query: async (sql,params=[])=>{
 calls.push({sql,params});
 if(sql.includes('SELECT id_lote AS loteImportacion'))return [[{loteImportacion:'inv-1',fechaCorte:'2026-11-10'}]];
 if(sql.includes('SELECT COUNT(*) AS filas FROM almacen_ns_inventario'))return [[{filas:10}]];
 if(sql.includes('SELECT id_lote AS idLote FROM almacen_ns_lotes'))return [[{idLote:'cat-1'}]];
 if(sql.includes('SELECT COUNT(DISTINCT idUbicacionNs) AS almacenes'))return [[{almacenes:1}]];
 return [[]];
}};
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:fakeDb};
delete require.cache[modulePath];
const ns=require(modulePath);const scope={subsidiaryIds:['2','3','5']};
test('consultas de ubicacion omiten catalogo en flag, conservan lote y alcance',async()=>{
 process.env.BLT_OPT_ALMACEN_FILTERS_V1='1';calls.length=0;
 await ns.getWarehouses(scope,{company:'CORELLIAN'});
 await ns.getAuditCatalogs(scope);
 await ns.getDashboard(scope);
 const relevant=calls.filter(x=>x.sql.includes('GROUP BY idSubsidiariaNs,idUbicacionNs')||x.sql.includes('COUNT(DISTINCT idUbicacionNs)'));
 assert.equal(relevant.length,4);
 for(const {sql,params} of relevant){
   assert.doesNotMatch(sql,/LEFT JOIN/);
   assert.match(sql,/id_subsidiaria_ns IN \(\?\)/);
   assert.ok(params.some(v=>Array.isArray(v)&&v.join(',')==='2,3,5'));
 }
});
test('el flujo sin bandera conserva JOIN del catalogo',async()=>{
 process.env.BLT_OPT_ALMACEN_FILTERS_V1='0';calls.length=0;
 await ns.getWarehouses(scope,{company:'CORELLIAN'});
 const warehouse=calls.find(x=>x.sql.includes('GROUP BY idSubsidiariaNs,idUbicacionNs'));
 assert.match(warehouse.sql,/LEFT JOIN/);
});
test.after(()=>{
 if(previous===undefined)delete process.env.BLT_OPT_ALMACEN_FILTERS_V1;else process.env.BLT_OPT_ALMACEN_FILTERS_V1=previous;
 if(oldDb)require.cache[dbPath]=oldDb;else delete require.cache[dbPath];
 if(oldModule)require.cache[modulePath]=oldModule;else delete require.cache[modulePath];
});

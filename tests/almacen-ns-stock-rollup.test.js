'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const path=require('node:path');const root=path.resolve(__dirname,'..');
const dbPath=require.resolve(path.join(root,'backend/src/config/db.js'));
const modPath=require.resolve(path.join(root,'backend/src/modules/almacen/almacen.ns-query-service.js'));
const oldDb=require.cache[dbPath],oldMod=require.cache[modPath],oldFlag=process.env.BLT_OPT_ALMACEN_FILTERS_V1;
const calls=[];
const db={query:async(sql,params=[])=>{
 calls.push({sql,params});
 if(sql.includes('SELECT id_lote AS loteImportacion'))return [[{loteImportacion:'inv-1'}]];
 if(sql.includes('SELECT COUNT(*) AS filas FROM almacen_ns_inventario'))return [[{filas:3}]];
 if(sql.includes('SELECT id_lote AS idLote FROM almacen_ns_lotes'))return [[{idLote:'cat-1'}]];
 if(sql.includes('GROUP BY empresa WITH ROLLUP'))return [[{empresa:'CORELLIAN',articulos:2},{empresa:null,articulos:2}]];
 if(sql.includes('SELECT DISTINCT empresa AS value'))return [[{value:'CORELLIAN'}]];
 if(sql.includes('SELECT COUNT(*) AS articulos'))return [[{articulos:2}]];
 if(sql.includes('SELECT id,codigo,articulo,empresa,fisico'))return [[{id:1,codigo:'A',articulo:'REF',empresa:'CORELLIAN',fisico:'10'}]];
 throw Error('Unexpected SQL: '+sql);
}};
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:db};
delete require.cache[modPath];const mod=require(modPath);const scope={subsidiaryIds:['2','3','5']};
test('stock con bandera conserva KPIs/listado y elimina una consulta agregada',async()=>{
 process.env.BLT_OPT_ALMACEN_FILTERS_V1='0';calls.length=0;
 const legacy=await mod.getStock(scope,{page:1});
 const queriesLegacy=calls.filter(({sql})=>sql.includes('SELECT COUNT(*) AS articulos')).length;
 process.env.BLT_OPT_ALMACEN_FILTERS_V1='1';calls.length=0;
 const optimized=await mod.getStock(scope,{page:1});
 assert.deepEqual(optimized,legacy);
 assert.equal(queriesLegacy,1);
 assert.equal(calls.filter(({sql})=>sql.includes('SELECT COUNT(*) AS articulos')).length,0);
 const rollup=calls.find(({sql})=>sql.includes('GROUP BY empresa WITH ROLLUP'));
 assert.ok(rollup);assert.match(rollup.sql,/id_subsidiaria_ns IN \(\?\)/);
 assert.ok(rollup.params.some(value=>Array.isArray(value)&&value.join(',')==='2,3,5'));
});
test.after(()=>{
 if(oldFlag===undefined)delete process.env.BLT_OPT_ALMACEN_FILTERS_V1;else process.env.BLT_OPT_ALMACEN_FILTERS_V1=oldFlag;
 if(oldDb)require.cache[dbPath]=oldDb;else delete require.cache[dbPath];
 if(oldMod)require.cache[modPath]=oldMod;else delete require.cache[modPath];
});

'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {getCommercialTables}=require('../src/modules/ventas-dashboard/ventas-dashboard.repository');
const oldFlag=process.env.BLT_OPT_VENTAS_CLIENT_KPIS_V1;
function fakeConn(){
 const queries=[];
 return {queries,async query(sql,params){
   queries.push({sql,params});
   if(sql.includes('FROM ventas_clientes vc')){
     const row={id_cliente:3,nombre_empresa:'CLIENTE TEST',razon_social:'CLIENTE',iniciales:'AA',ciudad:'CDMX',estado:'MX',tipo_cliente:'PROSPECTO'};
     if(sql.includes('AS __kpi_stats'))return [[{...row,__kpi_stats:JSON.stringify({cotizaciones:4,en_proceso:2,vendidas:1,perdidas:1})}]];
     return [[{...row,cotizaciones:4,en_proceso:2,vendidas:1,perdidas:1}]];
   }
   return [[]];
 }};
}
test('Ventas: conteos agrupados conservan exactamente el contrato y alcance de asesor',async()=>{
 process.env.BLT_OPT_VENTAS_CLIENT_KPIS_V1='0';const old=fakeConn();
 const oldResult=await getCommercialTables(old,[23],2026);
 process.env.BLT_OPT_VENTAS_CLIENT_KPIS_V1='1';const fast=fakeConn();
 const fastResult=await getCommercialTables(fast,[23],2026);
 assert.deepEqual(fastResult,oldResult);
 assert.equal(fast.queries.length,old.queries.length);
 const legacy=old.queries.find(q=>q.sql.includes('FROM ventas_clientes vc'));
 const newQuery=fast.queries.find(q=>q.sql.includes('FROM ventas_clientes vc'));
 assert.equal((legacy.sql.match(/FROM ventas_cotizaciones_cor q WHERE/g)||[]).length,4);
 assert.equal((newQuery.sql.match(/FROM ventas_cotizaciones_cor q WHERE/g)||[]).length,1);
 assert.deepEqual(newQuery.params,[[23],[23]]);
 assert.ok(!('__kpi_stats' in fastResult.clientes[0]));
});
test.after(()=>{if(oldFlag===undefined)delete process.env.BLT_OPT_VENTAS_CLIENT_KPIS_V1;else process.env.BLT_OPT_VENTAS_CLIENT_KPIS_V1=oldFlag;});

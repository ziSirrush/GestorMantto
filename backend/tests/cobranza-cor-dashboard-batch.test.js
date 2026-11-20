'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path');
const dbPath=require.resolve('../src/config/db.js');
const repoPath=require.resolve('../src/modules/cobranza-cor/cobranza-cor.repository.js');
const oldDb=require.cache[dbPath],oldRepo=require.cache[repoPath],oldFlag=process.env.BLT_OPT_COBRANZA_COR_BATCH_V1;
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{}};
delete require.cache[repoPath];
const dbRepository=require(repoPath);
const {listarDashboard_cor}=require('../src/modules/cobranza-cor/cobranza-cor-dashboard.service');

const records=[
 {ppns:'P1',proyecto:'Proyecto 1',monedas:['MXN'],anios:[2026]},
 {ppns:'P2',proyecto:'Proyecto 2',monedas:['MXN'],anios:[2026]}
];
const sourceByKey={P1:[{id_fuente_cor:1,condicion:'Anticipo',moneda:'MXN',pago_contabilizado:5}],
 P2:[{id_fuente_cor:2,condicion:'Hito',moneda:'MXN',pago_contabilizado:10}]};
const invoiceByKey={P1:[{id_factura_cor:100,factura:'A'}],P2:[{id_factura_cor:200,factura:'B'}]};
const fakeAccess={dominio:'CORELLIAN',requiere_filtro_usuario:true,usuarios_visibles:[23]};
function fixture(){
 const stats={advisor:0,source:0,invoice:0,details:[],connections:0,releases:0};
 const repo={
   async getConnection_cor(){stats.connections++;return {release(){stats.releases++;}};},
   async listDashboardAdvisors_cor(_connection,keys){
     stats.advisor++;return keys.map(key=>({ppns_key:key,id_asesor:23,iniciales:'AA'}));
   },
   async listFuenteEstadoCuentaBatch_cor(_connection,keys){
     stats.source++;assert.deepEqual(keys,['P1','P2']);
     return keys.flatMap(key=>sourceByKey[key].map(row=>({...row,__ppns_key:key})));
   },
   async listFacturasEstadoCuentaBatch_cor(_connection,keys){
     stats.invoice++;assert.deepEqual(keys,['P1','P2']);
     return keys.flatMap(key=>invoiceByKey[key].map(row=>({...row,__ppns_key:key})));
   }
 };
 const motor={
  async listarEstadosCuenta_cor(_filter,access){
   assert.strictEqual(access,fakeAccess);
   return {scope_aplicado:'USUARIOS_VISIBLES',data:records};
  },
  async detalleEstadoCuenta_cor(ppns,access,options){
   assert.strictEqual(access,fakeAccess);
   stats.details.push({ppns,options});
   return {
     proyecto:{ppns},estado_cuenta:options?.prefetchedSourceRows||sourceByKey[ppns],
     facturas:options?.prefetchedInvoiceRows||invoiceByKey[ppns],
     pagos:[],relaciones_pagos:[]
   };
  }
 };
 return {stats,repo,motor};
}
test('COR resumen reduce lecturas repetidas a dos consultas por lote sin cambiar la respuesta',async()=>{
 process.env.BLT_OPT_COBRANZA_COR_BATCH_V1='0';
 const old=fixture();const baseline=await listarDashboard_cor({tipo:'resumen'},fakeAccess,old.motor,old.repo);
 assert.equal(old.stats.source,0);assert.equal(old.stats.invoice,0);
 process.env.BLT_OPT_COBRANZA_COR_BATCH_V1='1';
 const now=fixture();const current=await listarDashboard_cor({tipo:'resumen'},fakeAccess,now.motor,now.repo);
 assert.deepEqual(current,baseline);
 assert.equal(now.stats.source,1);assert.equal(now.stats.invoice,1);
 assert.equal(now.stats.details.length,2);
 assert.equal(now.stats.connections,2);assert.equal(now.stats.releases,2);
 assert.equal(now.stats.details[0].options.prefetchedSourceRows[0].id_fuente_cor,1);
 assert.equal(now.stats.details[1].options.prefetchedInvoiceRows[0].id_factura_cor,200);
 assert.ok(now.stats.details.every(v=>!('__ppns_key' in v.options.prefetchedSourceRows[0])));
});
test('COR detalle no usa precarga de resumen y no amplía alcance',async()=>{
 process.env.BLT_OPT_COBRANZA_COR_BATCH_V1='1';const now=fixture();
 await listarDashboard_cor({tipo:'detalle'},fakeAccess,now.motor,now.repo);
 assert.equal(now.stats.source,0);assert.equal(now.stats.invoice,0);
 assert.ok(now.stats.details.every(v=>v.options===undefined));
});
test('repositorios de lote preservan identidad PPNS y limitan a 24',async()=>{
 let sql=[];
 const connection={async query(text,params){sql.push({text,params});return [[]];}};
 await dbRepository.listFuenteEstadoCuentaBatch_cor(connection,[' P1 ','P2']);
 await dbRepository.listFacturasEstadoCuentaBatch_cor(connection,['P1','P2']);
 assert.equal(sql.length,2);
 for(const query of sql){
   assert.match(query.text,/ IN \(\?\)/);
   assert.match(query.text,/__ppns_key/);
   assert.deepEqual(query.params,[['P1','P2']]);
 }
 await assert.rejects(dbRepository.listFuenteEstadoCuentaBatch_cor(connection,Array(25).fill('P')),TypeError);
});
test.after(()=>{
 if(oldFlag===undefined)delete process.env.BLT_OPT_COBRANZA_COR_BATCH_V1;
 else process.env.BLT_OPT_COBRANZA_COR_BATCH_V1=oldFlag;
 if(oldDb)require.cache[dbPath]=oldDb;else delete require.cache[dbPath];
 if(oldRepo)require.cache[repoPath]=oldRepo;else delete require.cache[repoPath];
});

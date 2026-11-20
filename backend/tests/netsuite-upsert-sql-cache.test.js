'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const tickets=require('../src/modules/netsuite-integration/netsuite-tickets.repository');
const portfolio=require('../src/modules/netsuite-integration/netsuite-portafolio.repository');
const oldFlag=process.env.BLT_OPT_NS_UPSERT_SQL_CACHE_V1;
test('SQL de UPSERT cacheado preserva exactamente la sentencia anterior',()=>{
 process.env.BLT_OPT_NS_UPSERT_SQL_CACHE_V1='0';
 const originalT=tickets.insertStatement(50),originalP=portfolio.insertStatement(50);
 process.env.BLT_OPT_NS_UPSERT_SQL_CACHE_V1='1';
 for(let i=0;i<20;i++){
   assert.equal(tickets.insertStatement(50),originalT);
   assert.equal(portfolio.insertStatement(50),originalP);
 }
 for(const sql of [originalT,originalP]){
   assert.match(sql,/ON DUPLICATE KEY UPDATE/);
   assert.match(sql,/COALESCE\(VALUES\(/);
 }
 assert.match(originalT,/ns_tickets_pruebas/);
 assert.match(originalP,/ns_portafolio_pruebas/);
});
test('SQL por tamaño no reutiliza el lote de otro tamaño',()=>{
 process.env.BLT_OPT_NS_UPSERT_SQL_CACHE_V1='1';
 assert.notEqual(tickets.insertStatement(1),tickets.insertStatement(50));
 assert.notEqual(portfolio.insertStatement(1),portfolio.insertStatement(50));
});
test.after(()=>{if(oldFlag===undefined)delete process.env.BLT_OPT_NS_UPSERT_SQL_CACHE_V1;
 else process.env.BLT_OPT_NS_UPSERT_SQL_CACHE_V1=oldFlag;});

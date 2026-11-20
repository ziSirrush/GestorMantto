'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path');
const dbPath=require.resolve('../src/config/db.js');
const repoPath=require.resolve('../src/modules/cobranza-cor/cobranza-cor.repository.js');
const pagosPath=require.resolve('../src/modules/cobranza-cor/cobranza-cor-pagos.repository.js');
const servicePath=require.resolve('../src/modules/cobranza-cor/cobranza-cor.service.js');
const prev=[dbPath,repoPath,pagosPath,servicePath].map(p=>require.cache[p]);
const flag=process.env.BLT_OPT_COBRANZA_COR_PAYMENT_INDEX_V1;
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{}};
require.cache[repoPath]={id:repoPath,filename:repoPath,loaded:true,exports:{}};
require.cache[pagosPath]={id:pagosPath,filename:pagosPath,loaded:true,exports:{}};
delete require.cache[servicePath];
const motor=require(servicePath);
const source=[{id_fuente_cor:12,condicion:'Finiquito',fecha_pago:'2026-01-01'}];
const groups=[{ids:[20,21],applied:120,row:{id_fuente_cor:12,tipo_concepto:'HITO',factura:'CFV-1',hito_condicion:'Finiquito'}}];
const pagos=[{id_pago_cor:30,fecha_pago:'2026-06-06',no_factura:'CFV-1'},
  {id_pago_cor:31,fecha_pago:'2026-02-02',no_factura:'CFV-1'}];
const relations=[{id_factura_cor:21,id_pago_cor:31,importe_aplicado:20},
  {id_factura_cor:99,id_pago_cor:30,importe_aplicado:5},
  {id_factura_cor:20,id_pago_cor:30,importe_aplicado:100}];
test('Indice de relaciones no cambia importes, fechas ni orden original de pagos parciales',()=>{
 process.env.BLT_OPT_COBRANZA_COR_PAYMENT_INDEX_V1='0';
 const prior=[...motor.buildPaymentDetailsByHito_cor(source,groups,pagos,relations)];
 process.env.BLT_OPT_COBRANZA_COR_PAYMENT_INDEX_V1='1';
 const current=[...motor.buildPaymentDetailsByHito_cor(source,groups,pagos,relations)];
 assert.deepEqual(current,prior);
 assert.deepEqual(current[0][1].fechas_pago,['2026-02-02','2026-06-06']);
 assert.equal(current[0][1].importe,120);
});
test('Sin relaciones se conserva fecha de fuente o pagos por folio',()=>{
 process.env.BLT_OPT_COBRANZA_COR_PAYMENT_INDEX_V1='0';
 const prior=[...motor.buildPaymentDetailsByHito_cor(source,groups,pagos,[])];
 process.env.BLT_OPT_COBRANZA_COR_PAYMENT_INDEX_V1='1';
 assert.deepEqual([...motor.buildPaymentDetailsByHito_cor(source,groups,pagos,[])],prior);
});
test.after(()=>{
 if(flag===undefined)delete process.env.BLT_OPT_COBRANZA_COR_PAYMENT_INDEX_V1;else process.env.BLT_OPT_COBRANZA_COR_PAYMENT_INDEX_V1=flag;
 [dbPath,repoPath,pagosPath,servicePath].forEach((p,i)=>{if(prev[i])require.cache[p]=prev[i];else delete require.cache[p];});
});

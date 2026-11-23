'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path');
const dbPath=require.resolve('../src/config/db.js');
const repositoryPath=require.resolve('../src/modules/cobranza-cor/cobranza-cor.repository.js');
const oldDb=require.cache[dbPath],oldRepository=require.cache[repositoryPath];
const oldFlag=process.env.BLT_OPT_COBRANZA_COR_DELTA_CACHE_V1;
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{}};
delete require.cache[repositoryPath];
const dashboard=require('../src/modules/cobranza-cor/cobranza-cor-dashboard.service');
const revisionRepo=require('../src/modules/cobranza-cor/cobranza-cor-cache.repository');
const info={dominio:'CORELLIAN',requiere_filtro_usuario:true,usuarios_visibles:[23]};
const p1={ppns:'P1',proyecto:'Uno',monedas:['MXN'],anios:[2026]};
const p2={ppns:'P2',proyecto:'Dos',monedas:['EUR'],anios:[2026]};
function setup(){
 const calls={details:[],revisions:[],connections:0,advisor:0};
 let portfolio=[p1,p2];
 let versions={P1:101,P2:202};
 const repo={
   async getConnection_cor(){calls.connections++;return {release(){}};},
   async listDashboardAdvisors_cor(_conn,keys){
     calls.advisor++;return keys.map(ppns_key=>({ppns_key,id_asesor:23,iniciales:'AA'}));
   }
 };
 const motor={
   async listarEstadosCuenta_cor(query,access){
     assert.strictEqual(access,info);
     return {scope_aplicado:'USUARIOS_VISIBLES',data:portfolio};
   },
   async detalleEstadoCuenta_cor(ppns,access){
     assert.strictEqual(access,info);
     calls.details.push(ppns);
     return {proyecto:{ppns},estado_cuenta:[{
       id_fuente_cor:ppns==='P1'?1:2,condicion:'ANTICIPO',
       moneda:ppns==='P1'?'MXN':'EUR',total:versions[ppns],pago_contabilizado:10
     }],facturas:[],pagos:[],relaciones_pagos:[]};
   }
 };
 const revisions={
   async listDashboardRevisionRows_cor(_conn,keys){
     calls.revisions.push([...keys]);
     return keys.map(ppns=>({ppns,tipo:'f',registros:1,suma:versions[ppns],xor_checksum:versions[ppns]}));
   }
 };
 return {calls,repo,motor,revisions,change:(ppns,value)=>{versions[ppns]=value;},
   limit:ppns=>{portfolio=portfolio.filter(row=>row.ppns===ppns);}};
}
async function sync(f,known=[]){
 return dashboard.listarDashboard_cor({tipo:'resumen'},info,f.motor,f.repo,
   {requested:true,known,repository:f.revisions});
}
test('bandera apagada preserva listado completo sin metadatos cache',async()=>{
 process.env.BLT_OPT_COBRANZA_COR_DELTA_CACHE_V1='0';
 const f=setup();const res=await sync(f);
 assert.equal(res.data.length,2);assert.equal(f.calls.details.length,2);
 assert.equal(res.cache,undefined);assert.equal(f.calls.revisions.length,0);
});
test('mismas revisiones evitan recalcular proyecto, sin importar version API',async()=>{
 process.env.BLT_OPT_COBRANZA_COR_DELTA_CACHE_V1='1';
 const f=setup();
 const first=await sync(f);
 assert.equal(first.data.length,2);
 assert.equal(first.cache.contract,dashboard.COR_CACHE_CONTRACT);
 assert.equal(first.cache.revisions.length,2);
 assert.equal(f.calls.details.length,2);
 const second=await sync(f,first.cache.revisions);
 assert.equal(second.data.length,0);
 assert.deepEqual(second.cache.revisions,first.cache.revisions);
 assert.equal(second.paginacion.proyectos_pagina,2);
 assert.equal(f.calls.details.length,2);
 assert.equal(f.calls.revisions.length,2);
});
test('un pago o factura modificada actualiza solo PPNS afectado',async()=>{
 process.env.BLT_OPT_COBRANZA_COR_DELTA_CACHE_V1='1';
 const f=setup();
 const previous=await sync(f);
 f.change('P2',203);
 const changed=await sync(f,previous.cache.revisions);
 assert.deepEqual(changed.data.map(row=>row.proyecto.ppns),['P2']);
 assert.equal(changed.data[0].estado_cuenta[0].total,203);
 assert.equal(changed.cache.revisions.find(x=>x.ppns==='P1').revision,
   previous.cache.revisions.find(x=>x.ppns==='P1').revision);
 assert.notEqual(changed.cache.revisions.find(x=>x.ppns==='P2').revision,
   previous.cache.revisions.find(x=>x.ppns==='P2').revision);
 assert.deepEqual(f.calls.details,['P1','P2','P2']);
});
test('revocacion de alcance nunca incluye proyecto no autorizado',async()=>{
 process.env.BLT_OPT_COBRANZA_COR_DELTA_CACHE_V1='1';
 const f=setup();
 const prior=await sync(f);
 f.limit('P1');
 const output=await sync(f,prior.cache.revisions);
 assert.equal(output.paginacion.total_proyectos,1);
 assert.deepEqual(output.cache.revisions.map(x=>x.ppns),['P1']);
 assert.equal(output.data.length,0);
 assert.deepEqual(f.calls.revisions[1],['P1']);
});
test('tokens invalidos y duplicados se rechazan',()=>{
 assert.throws(()=>dashboard.knownRevisions_cor([{ppns:'P1',revision:'n/a'}]),/Revision COR invalida/);
 assert.throws(()=>dashboard.knownRevisions_cor(Array(25).fill({ppns:'P1',revision:'a'.repeat(64)})),/limite/);
 assert.throws(()=>dashboard.knownRevisions_cor([{ppns:'P1',revision:'a'.repeat(64)},
    {ppns:'P1',revision:'a'.repeat(64)}]),/Revision COR invalida/);
});
test('revision SQL usa todas las entidades financieras y parametros',async()=>{
 const sql=[];
 const connection={async query(q,params){sql.push({q,params});return [[
   {ppns:'P1',tipo:'f',registros:1,suma:'100',xor_checksum:'100'}
 ]];}};
 const rows=await revisionRepo.listDashboardRevisionRows_cor(connection,['P1']);
 assert.equal(rows.length,1);assert.equal(sql.length,1);
 for(const name of ['cobranza_fuente_cor','cobranza_facturas_cor',
   'cobranza_pagos_cor','cobranza_rel_pagos']) assert.match(sql[0].q,new RegExp(name));
 assert.equal(sql[0].params.length,5);
 assert.deepEqual(sql[0].params[0],['P1']);
 assert.doesNotMatch(sql[0].q,/\b(INSERT|UPDATE|DELETE|DROP|ALTER)\s+(INTO|TABLE|cobranza)/i);
 await assert.rejects(
   revisionRepo.listDashboardRevisionRows_cor({query:async()=>[[{ppns:'P2'}]]},['P1']),
   /fuera del alcance/
 );
});
test.after(()=>{
 if(oldFlag===undefined)delete process.env.BLT_OPT_COBRANZA_COR_DELTA_CACHE_V1;
 else process.env.BLT_OPT_COBRANZA_COR_DELTA_CACHE_V1=oldFlag;
 if(oldDb)require.cache[dbPath]=oldDb;else delete require.cache[dbPath];
 if(oldRepository)require.cache[repositoryPath]=oldRepository;
 else delete require.cache[repositoryPath];
});

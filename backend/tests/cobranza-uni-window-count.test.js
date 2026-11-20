'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'../src/modules/cobranza-uni-administracion');
const dbPath=require.resolve('../src/config/db.js');
const previousDb=require.cache[dbPath];
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{getConnection:async()=>{throw Error('No DB real en tests');}}};
const forms=require.resolve(path.join(root,'cobranza-uni-administracion.pc-formulas.js'));
const modPath=require.resolve(path.join(root,'cobranza-uni-administracion.pc-service.js'));
const oldForms=require.cache[forms],oldMod=require.cache[modPath];
const previous=process.env.BLT_OPT_UNI_PC_WINDOW_COUNT_V1;
require.cache[forms]={id:forms,filename:forms,loaded:true,exports:{
 todayMexicoCity_uni:()=> '2026-11-20',
 previewPcLocalRows_uni:rows=>rows.map(x=>({id_pc:x.id_pc}))
}};
delete require.cache[modPath];
const service=require(modPath);
const fakeReq={query:{page:'1',page_size:'30'}};
const relation=async (_req,_conn,rows)=>({mode:'preview_only',rows,formula_rows:rows});
function mockConn(windowRows,count=3){
 const calls=[];
 return {calls,async query(sql,params){
   calls.push({sql,params});
   if(sql.includes('COUNT(*) OVER()'))return [windowRows];
   if(sql.startsWith('SELECT COUNT(*) AS total'))return [[{total:count}]];
   if(sql.includes('SELECT ')&&sql.includes('FROM '+String.fromCharCode(96)+'pc'))return [[{id_pc:'1',proyecto:'P'}]];
   throw Error('Consulta no prevista: '+sql);
 }};
}
const deps=conn=>({connection:conn,scopeBuilder:()=> 'pc.z_oper = 1',relationsPreview:relation,now:new Date('2026-11-20T00:00:00Z')});
test('Window UNI reduce SELECT a uno y conserva resultado/alcance',async()=>{
 process.env.BLT_OPT_UNI_PC_WINDOW_COUNT_V1='1';
 const conn=mockConn([{id_pc:'1',proyecto:'P',__blt_total:3}]);
 const res=await service.listVentaAdicionalAdmin_uni(fakeReq,deps(conn));
 assert.equal(conn.calls.length,1);
 assert.match(conn.calls[0].sql,/COUNT\(\*\) OVER\(\)/);
 assert.match(conn.calls[0].sql,/pc\.z_oper = 1/);
 assert.equal(res.total,3);assert.equal(res.rows[0].id_pc,'1');
 assert.ok(!Object.hasOwn(res.rows[0],'__blt_total'));
});
test('Pagina inexistente conserva total mediante consulta de respaldo',async()=>{
 process.env.BLT_OPT_UNI_PC_WINDOW_COUNT_V1='1';
 const conn=mockConn([],3);
 const res=await service.listVentaAdicionalAdmin_uni({query:{page:'5'}},deps(conn));
 assert.equal(res.total,3);assert.deepEqual(res.rows,[]);assert.equal(conn.calls.length,2);
});
test('Flag 0 preserva ruta antigua',async()=>{
 process.env.BLT_OPT_UNI_PC_WINDOW_COUNT_V1='0';
 const conn=mockConn([],3);
 const res=await service.listVentaAdicionalAdmin_uni(fakeReq,deps(conn));
 assert.equal(res.total,3);assert.equal(conn.calls.length,2);
 assert.ok(conn.calls.every(x=>!x.sql.includes('OVER()')));
});
test.after(()=>{
 if(previous===undefined)delete process.env.BLT_OPT_UNI_PC_WINDOW_COUNT_V1;else process.env.BLT_OPT_UNI_PC_WINDOW_COUNT_V1=previous;
 if(oldForms)require.cache[forms]=oldForms;else delete require.cache[forms];
 if(oldMod)require.cache[modPath]=oldMod;else delete require.cache[modPath];
 if(previousDb)require.cache[dbPath]=previousDb;else delete require.cache[dbPath];
});

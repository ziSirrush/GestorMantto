'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path');
const Module=require('node:module');
const filename=path.resolve(__dirname,'../src/modules/experimental-ns/experimental-ns-resumen-dia.repository.js');
const original=process.env.BLT_OPT_NS_RESUMEN_PROJECTION_V1;
function load(sql){
 const module=new Module(filename,moduleParent);
 module.filename=filename;module.paths=Module._nodeModulePaths(path.dirname(filename));
 module.require=function(key){
   if(key==='../../config/db')return {query:async(text,params)=>{
     sql.push({text,params});
     return [[]];
   }};
   if(key==='./experimental-ns.repository')return {requireSchema:async()=>{}};
   if(key==='./experimental-ns.scope')return {
     assertScope:()=>{},portafolioScope:()=>({sql:'p.zona_id IN (?)',params:[7]}),
     ticketsScope:()=>({sql:'t.zona_id IN (?)',params:[7]}),
     assertNoProductionTables:()=>{}
   };
   return Module.prototype.require.call(this,key);
 };
 module._compile(require('node:fs').readFileSync(filename,'utf8'),filename);
 return module.exports;
}
const moduleParent=module;
test('proyeccion NS excluye columnas ajenas y mantiene alcance/salida',async()=>{
 const sql=[];
 process.env.BLT_OPT_NS_RESUMEN_PROJECTION_V1='1';
 await load(sql).getInitialData({informationAccess:{dominio:'UNITED'},query:{fecha:'2026-11-20'}});
 assert.equal(sql.length,4);
 assert.match(sql[0].text,/SELECT p.numero_equipo,p.proyecto,p.identificacion_sitio/);
 assert.doesNotMatch(sql[0].text,/SELECT p\.\*/);
 assert.match(sql[0].text,/p.zona_id IN \(\?\)/);
 assert.deepEqual(sql[0].params.slice(0,1),[7]);
});
test('flag inactivo conserva SELECT p.*',async()=>{
 const sql=[];
 process.env.BLT_OPT_NS_RESUMEN_PROJECTION_V1='0';
 await load(sql).getInitialData({informationAccess:{dominio:'UNITED'},query:{fecha:'2026-11-20'}});
 assert.match(sql[0].text,/SELECT p\.\*/);
});
test.after(()=>{if(original===undefined)delete process.env.BLT_OPT_NS_RESUMEN_PROJECTION_V1;
 else process.env.BLT_OPT_NS_RESUMEN_PROJECTION_V1=original;});

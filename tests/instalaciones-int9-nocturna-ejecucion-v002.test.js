'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
test('INT9 nocturna: conciliacion secuencial, verificacion y control diario seguro',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'..','backend/src/jobs/instalacionesProgramacionAuditoria.job.js'),'utf8');
 const check=(ok,message)=>assert.ok(ok,message);

const checkEqual=(a,b,msg)=>check(JSON.stringify(a)===JSON.stringify(b),msg);
function fixture({unique=true,missing=false,close=true}={}){
 const calls=[],days=new Map(),module={exports:{}};
 const db={query:async(sql,params=[])=>{
   calls.push({sql,params});
   if(missing)throw Object.assign(Error('missing'),{code:'ER_NO_SUCH_TABLE'});
   if(sql.startsWith('SHOW INDEX'))return [[{Non_unique:unique?0:1,Key_name:'PRIMARY',Column_name:'fecha_cdmx'}]];
   if(sql.includes('LIMIT 0'))return [[]];
   if(sql.startsWith('INSERT INTO')){
     if(days.has(params[0]))throw Object.assign(Error('duplicate'),{code:'ER_DUP_ENTRY'});
     days.set(params[0],'EN_PROCESO');return [{affectedRows:1}];
   }
   if(sql.startsWith('SELECT estado FROM'))return [[...(days.has(params[0])?[{estado:days.get(params[0])}]:[])]];
   if(sql.startsWith('UPDATE instalaciones_programacion_conciliacion_diaria')){
     if(!close)return [{affectedRows:0}];
     days.set(params.at(-1),params[0]);return [{affectedRows:1}];
   }
   throw Error('SQL inesperado '+sql);
 }};
 new Function('require','module','console',source)(name=>{
   if(name==='../config/db')return db;
   throw Error('Motor no simulado '+name);
 },module,{info(){},error(){}});
 return {job:module.exports,db,calls,days};
}
let x=fixture(),order=[];
const ok={scanAdjusters:async()=>{order.push('A');return {total_equipos:2,creadas:1,actualizadas:1,historicas:0,errores:0};},scanInstallers:async()=>{order.push('M');return {total_equipos:3,creadas:2,historicas:1,errores:0};},verifyAfter:async()=>{order.push('V');return {revisiones:0,errores:0};}};
let result=await x.job.executeDaily('2026-11-24',ok);
checkEqual(order,['A','M','V'],'Motores secuenciales y auditoria al final');
check(result.estado==='COMPLETADO'&&result.total_equipos===5&&result.creadas===3&&result.actualizadas===1&&result.historicas===1,'Contadores correctos');
check(x.days.get('2026-11-24')==='COMPLETADO','Cierre persistente');
check((await x.job.executeDaily('2026-11-24',ok)).estado==='YA_REGISTRADO'&&order.length===3,'No duplica ejecucion diaria');
x=fixture();order=[];
result=await x.job.executeDaily('2026-11-24',{...ok,scanAdjusters:async()=>{order.push('A');throw Object.assign(Error('ocupado'),{code:'INT9_PRESION_DB'});}});
checkEqual(order,['A'],'Detiene motores siguientes por presion');
check(result.estado==='ERROR'&&result.fases.montadores.omitida&&x.days.get('2026-11-24')==='ERROR','No falsea cierre por presion');
x=fixture();order=[];
result=await x.job.executeDaily('2026-11-24',{...ok,scanInstallers:async()=>({interrumpida:true,motivo_interrupcion:'TIEMPO_MAXIMO',total_equipos:2})});
check(result.estado==='ERROR'&&result.fallos.some(s=>s.includes('TIEMPO_MAXIMO')),'Barrido parcial no se marca completo');
x=fixture();
result=await x.job.executeDaily('2026-11-24',{...ok,verifyAfter:async()=>({revisiones:2,errores:0})});
check(result.estado==='REQUIERE_REVISION'&&x.days.get('2026-11-24')==='ERROR','Incidencias remanentes identificadas');
for(const [options,expected] of [[{unique:false},'INT9_CONTROL_DIARIO_NO_UNICO'],[{missing:true},'ER_NO_SUCH_TABLE']]){
 x=fixture(options);order=[];let rejected=false;
 try{await x.job.executeDaily('2026-11-24',ok);}catch(e){rejected=e.code===expected;}
 check(rejected&&order.length===0,'Sin control seguro no escribe datos operativos: '+expected);
}
x=fixture({close:false});let rejected=false;
try{await x.job.executeDaily('2026-11-24',ok);}catch(e){rejected=e.code==='INT9_CONTROL_DIARIO_CIERRE_FALLIDO';}
check(rejected,'No afirma cierre no confirmado');
x=fixture();
check((await x.job.checkDaily(new Date('2026-11-25T05:58:00Z'))).estado==='FUERA_DE_VENTANA'&&x.calls.length===0,'Mantiene horario 23:59 CDMX');
check(x.job.clock(new Date('2026-11-25T05:59:00Z')).hour===23&&x.job.clock(new Date('2026-11-25T05:59:00Z')).minute===59,'Horario nocturno correcto');

});

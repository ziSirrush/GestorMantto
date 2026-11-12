'use strict';
// QA independiente Montadores 04-M, solo Programador autorizado.
const crypto=require('node:crypto');
const {authorize}=require('./panel-control-scripts.controller');
const job=require('../jobs/instalacionesProgramacionMontadores.job');
let current=null;
const EXPIRE=30*60*1000;
function summary(x){return x?{id:x.id,estado:x.estado,inicio:x.inicio,fin:x.fin||null,
 ...x.stats,mensaje:x.mensaje||null}:null;}
async function execute(record){
 try{
  record.stats=await job.scanEquipos({onProgress:x=>{record.stats=x;}});
  record.estado=record.stats.errores||record.stats.interrumpida?'ERROR':'COMPLETADO';
  record.mensaje=record.stats.revisiones?'Hay proyectos pendientes de corregir en FL o catálogo.':
    'Relaciones de contratistas 04-M conciliadas.';
 }catch(error){
  record.estado='ERROR';record.mensaje='Conciliación 04-M detenida. Verifica estructura y capacidad de Aiven.';
  record.stats.errores++;
  record.stats.detalles=[{codigo:String(error?.code||'ERROR')}];
 }finally{record.fin=new Date().toISOString();}
}
function start(req,res){
 if(current?.estado==='EN_PROCESO')return res.status(409).json({ok:false,
  code:'INT9_MONTAJE_QA_OCUPADO',message:'Ya hay una conciliación 04-M en curso.',data:summary(current)});
 current={id:crypto.randomUUID(),estado:'EN_PROCESO',inicio:new Date().toISOString(),
  stats:{fase:'EQUIPOS_04_M',total_equipos:0,creadas:0,historicas:0,revisiones:0,
   errores:0,detalles:[],lotes_completados:0,ultimo_id_ins_fl:0}};
 void execute(current);
 return res.status(202).json({ok:true,data:summary(current)});
}
function status(req,res){
 if(!current||(current.estado!=='EN_PROCESO'&&Date.now()-Date.parse(current.fin||current.inicio)>EXPIRE))
  return res.status(404).json({ok:false,code:'INT9_MONTAJE_QA_SIN_RESULTADO',message:'Resultado temporal no disponible en esta instancia.'});
 return res.json({ok:true,data:summary(current)});
}
module.exports={authorize,start,status};

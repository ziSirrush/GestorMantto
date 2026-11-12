'use strict';
// INT9 04-M | QA independiente: estado temporal por instancia y cancelacion
// cooperativa. El cierre se confirma solamente despues del trabajo en curso.
const crypto=require('node:crypto');
const {authorize}=require('./panel-control-scripts.controller');
const job=require('../jobs/instalacionesProgramacionMontadores.job');
const EXPIRE=30*60*1000;
let current=null;
const active=x=>x==='EN_PROCESO'||x==='CANCELANDO';
function summary(x){
  return x?{id:x.id,estado:x.estado,inicio:x.inicio,fin:x.fin||null,
    ...x.stats,cancelacion_solicitada:Boolean(x.cancelRequested),
    mensaje:x.mensaje||null}:null;
}
async function execute(record){
  try{
    const result=await job.scanEquipos({
      shouldStop:()=>record.cancelRequested===true,
      onProgress:x=>{record.stats=x;}
    });
    record.stats=result;
    if(result.interrumpida){
      record.estado=result.motivo_interrupcion==='CANCELADO'?'CANCELADO':'INCOMPLETO';
      record.mensaje=record.estado==='CANCELADO'
        ?'Cancelada tras la operacion vigente. Lo ya confirmado en Aiven permanece.'
        :'Se alcanzo el limite de seguridad; revisar antes de repetir.';
    }else if(result.errores){
      record.estado='ERROR';
      record.mensaje='Se completo el barrido con errores. Revisa los equipos reportados.';
    }else{
      record.estado='COMPLETADO';
      record.mensaje=result.revisiones
        ?'Barrido completo. Hay referencias o fechas que requieren correccion.'
        :'Relaciones 04-M conciliadas correctamente.';
    }
  }catch(error){
    record.estado='ERROR';
    record.mensaje='La conciliacion 04-M se detuvo por error tecnico; revisar Aiven.';
    record.stats.errores++;
    record.stats.detalles=(record.stats.detalles||[]).slice(0,23);
    record.stats.detalles.push({codigo:String(error?.code||'ERROR')});
    console.error('[INT9_MONTAJE_QA_ERROR]',JSON.stringify({
      id:record.id,code:String(error?.code||'ERROR')}));
  }finally{
    record.fin=new Date().toISOString();
  }
}
function start(req,res){
  if(current&&active(current.estado))
    return res.status(409).json({ok:false,code:'INT9_MONTAJE_QA_EN_PROCESO',
      message:'Hay una conciliacion en curso en esta instancia.',data:summary(current)});
  current={id:crypto.randomUUID(),estado:'EN_PROCESO',inicio:new Date().toISOString(),
    cancelRequested:false,stats:{fase:'EQUIPOS_04_M',total_equipos:0,creadas:0,
      historicas:0,revisiones:0,errores:0,detalles:[],lotes_completados:0,
      ultimo_id_ins_fl:0,equipos_en_capa:0,omitidos_por_limite:0}};
  void execute(current);
  return res.status(202).json({ok:true,data:summary(current)});
}
function status(req,res){
  if(!current||(!active(current.estado)&&
    Date.now()-Date.parse(current.fin||current.inicio)>EXPIRE))
    return res.status(404).json({ok:false,code:'INT9_MONTAJE_QA_SIN_RESULTADO',
      message:'La prueba no esta disponible en esta instancia.'});
  return res.json({ok:true,data:summary(current)});
}
function cancel(req,res){
  const id=req.body?.id;
  if(typeof id!=='string'||!/^[a-f0-9-]{36}$/i.test(id)||
     Object.keys(req.body||{}).length!==1)
    return res.status(400).json({ok:false,code:'INT9_MONTAJE_QA_ID_INVALIDO',
      message:'Debes indicar el identificador de la ejecucion.'});
  if(!current||current.id!==id)
    return res.status(404).json({ok:false,code:'INT9_MONTAJE_QA_INSTANCIA',
      message:'La ejecucion no esta en esta instancia; no se confirma su cancelacion.'});
  if(!active(current.estado))
    return res.status(409).json({ok:false,code:'INT9_MONTAJE_QA_FINALIZADA',
      message:'La ejecucion ya concluyo.',data:summary(current)});
  current.cancelRequested=true;
  current.estado='CANCELANDO';
  current.mensaje='Cancelacion solicitada: se detendra despues de la operacion actual.';
  return res.status(202).json({ok:true,data:summary(current)});
}
module.exports={authorize,start,status,cancel};

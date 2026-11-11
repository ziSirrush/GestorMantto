'use strict';

// Herramienta TEMPORAL de QA. No ejecuta SQL arbitrario ni registra
// una ejecucion nocturna. El POST solo lanza un script de lista blanca.
const crypto = require('node:crypto');
const db = require('../config/db');
const job = require('../jobs/instalacionesProgramacionPersonal.job');
const { hasEffectivePermission } = require('../services/permissions/effective-permission.service');

const PERMISO_PANEL = 'GENERAL_PANEL_DE_CONTROL_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';
const LOCK_NAME = 'bltnow_int9_prueba_manual_v1';
const MAX_AGE_MS = 30 * 60 * 1000;
let execution = null;

function actorId(req) {
  const id=Number(req.actorUser?.id_SB||req.user?.id_SB);
  return Number.isSafeInteger(id)&&id>0?id:null;
}
async function authorize(req,res,next){
  try{
    if(req.viewerContext?.active||req.user?.id_SB!==req.actorUser?.id_SB){
      return res.status(403).json({ok:false,code:'SCRIPTS_VIEWER_DENIED',message:'Las pruebas no se ejecutan desde el visor.'});
    }
    const id=actorId(req);
    const roles=Array.isArray(req.actorUser?.roles)?req.actorUser.roles:[];
    // Restringido al Programador maestro, no a todos los perfiles de Panel.
    if(!id||!roles.includes('Programador')||
       !await hasEffectivePermission(id,PERMISO_PANEL)){
      return res.status(403).json({ok:false,code:'SCRIPTS_PERMISSION_DENIED',message:'Solo Programador autorizado puede ejecutar esta prueba.'});
    }
    return next();
  }catch(error){return next(error);}
}
function summary(record){
  if(!record)return null;
  return {
    id:record.id,estado:record.estado,
    inicio:record.inicio,fin:record.fin||null,
    ...record.stats,
    mensaje:record.mensaje||null
  };
}
async function execute(record){
  let conn;
  let locked=false;
  try{
    conn=await db.getConnection();
    const [rows]=await conn.query('SELECT GET_LOCK(?,0) AS acquired',[LOCK_NAME]);
    if(Number(rows[0]?.acquired)!==1){
      record.estado='OCUPADO';
      record.mensaje='Otra instancia esta realizando la misma prueba.';
      return;
    }
    locked=true;
    const result=await job.scanEquipos({
      manual:true,
      onProgress:stats=>{record.stats=stats;}
    });
    record.stats=result;
    record.estado=result.errores?'ERROR':'COMPLETADO';
    record.mensaje=result.errores
      ?'Conciliacion completada con incidencias. Revisa los codigos reportados.'
      :'Conciliacion finalizada correctamente.';
  }catch(error){
    record.estado='ERROR';
    record.mensaje='Error tecnico durante la conciliacion.';
    record.codigo=String(error?.code||'SCRIPT_ERROR').slice(0,90);
    record.stats.detalles=(record.stats.detalles||[]).slice(0,4);
    record.stats.detalles.push({codigo:record.codigo});
    console.error('[INT9_PRUEBA_ERROR]',record.codigo);
  }finally{
    if(conn){
      if(locked){
        try{await conn.query('SELECT RELEASE_LOCK(?)',[LOCK_NAME]);}
        catch(error){console.error('[INT9_PRUEBA_RELEASE]',error?.code||'ERROR');}
      }
      conn.release();
    }
    record.fin=new Date().toISOString();
  }
}
async function start(req,res,next){
  try{
    if(execution?.estado==='EN_PROCESO'){
      return res.status(409).json({ok:false,code:'SCRIPTS_ALREADY_RUNNING',message:'Ya existe una prueba en curso.',data:summary(execution)});
    }
    const record={
      id:crypto.randomUUID(),estado:'EN_PROCESO',inicio:new Date().toISOString(),
      stats:{total_equipos:0,creadas:0,actualizadas:0,historicas:0,conflictos:0,errores:0,detalles:[]}
    };
    execution=record;
    // El proceso puede exceder la ventana de espera HTTP.
    // No guardar informacion de esta prueba en el control de fecha nocturno.
    void execute(record);
    console.info('[INT9_PRUEBA_INICIO]',JSON.stringify({id:record.id,actor:actorId(req)}));
    return res.status(202).json({ok:true,data:summary(record)});
  }catch(error){return next(error);}
}
function status(req,res){
  const record=execution;
  if(!record || (record.estado!=='EN_PROCESO' && Date.now()-Date.parse(record.fin||record.inicio)>MAX_AGE_MS))
    return res.status(404).json({ok:false,code:'SCRIPTS_RESULT_EXPIRED',message:'El resultado temporal no esta disponible en esta instancia.'});
  return res.json({ok:true,data:summary(record)});
}
module.exports={authorize,start,status};

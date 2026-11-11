'use strict';

// INT9: revision de respaldo a las 23:59 (America/Mexico_City).
// Reserva atomica por fecha_cdmx. Una ejecucion por dia entre replicas y reinicios.
const db=require('../config/db');
const {reconciliarEquipo}=require('../modules/instalaciones-programacion-personal/instalaciones-programacion-personal.conciliacion.service');
const TZ='America/Mexico_City';
const POLL_MS=10000;
const PAGE_SIZE=150;
let timer=null;
let running=false;

function cdmxParts(date=new Date()){
  const values=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
    timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',hourCycle:'h23'
  }).formatToParts(date).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return {day:`${values.year}-${values.month}-${values.day}`,
    hour:Number(values.hour),minute:Number(values.minute)};
}
// Motor comun de barrido: el job nocturno y el ensayo manual reutilizan
// exactamente la misma conciliacion por equipo. El ensayo no registra
// fecha alguna en instalaciones_programacion_conciliacion_diaria.
async function scanEquipos({onProgress=null,shouldStop=null,manual=false}={}){
  const stats={total_equipos:0,creadas:0,actualizadas:0,historicas:0,conflictos:0,revisiones:0,errores:0,detalles:[]};
  let last=0;
  let interrumpida=false;
  outer:for(;;){
    if(shouldStop?.()){interrumpida=true;break;}
    const [rows]=await db.query(
      `SELECT f.id_ins_fl FROM ins_fl f
        WHERE f.id_ins_fl>?
          AND (TRIM(f.estatus)='06-A'
               OR EXISTS (
                 SELECT 1 FROM instalaciones_programacion_asignaciones a
                 WHERE a.id_ins_fl=f.id_ins_fl
                   AND a.origen='AUTOMATICA_FL' AND a.activo=1
               ))
        ORDER BY f.id_ins_fl LIMIT ?`,[last,PAGE_SIZE]);
    if(!rows.length)break;
    for(const row of rows){
      if(shouldStop?.()){interrumpida=true;break outer;}
      const id=Number(row.id_ins_fl);last=id;stats.total_equipos++;
      try{
        const out=await reconciliarEquipo(id,{tecnico:true,actorId:null});
        stats.creadas+=out.creadas||0;
        stats.actualizadas+=out.actualizadas||0;
        stats.historicas+=out.historicas||0;
        stats.conflictos+=(out.conflictos||[]).length;
        if(out.estado==='REQUIERE_REVISION'){
          // Un dato incompleto en FL no implica una falla tecnica del barrido.
          const issues=Array.isArray(out.incidencias)?out.incidencias:[];
          if(issues.length)stats.revisiones++;
          else stats.errores++;
          if(stats.detalles.length<5)stats.detalles.push({
            id_ins_fl:id,codigo:String(out.motivo||out.estado).slice(0,100),
            codigos:issues.slice(0,8)
          });
        }
      }catch(error){
        stats.errores++;
        const code=String(error?.code||'ERROR').slice(0,100);
        if(stats.detalles.length<5)stats.detalles.push({id_ins_fl:id,codigo:code});
        console.error(manual?'[INT9_PRUEBA_EQUIPO]':'[INT9_NOCHE_EQUIPO]',JSON.stringify({id,code}));
      }
      if(onProgress)onProgress({...stats,detalles:[...stats.detalles]});
    }
    if(rows.length<PAGE_SIZE)break;
  }
  return {...stats,interrumpida};
}
async function executeDaily(date){
  // Una sola replica/instancia gana; no se reintenta el mismo dia.
  const [reserved]=await db.query(
    `INSERT IGNORE INTO instalaciones_programacion_conciliacion_diaria
      (fecha_cdmx,estado,inicio_en) VALUES (?,'EN_PROCESO',NOW())`,[date]);
  if(Number(reserved.affectedRows)!==1)return {estado:'YA_REGISTRADO',fecha_cdmx:date};
  const stats={total_equipos:0,creadas:0,actualizadas:0,historicas:0,conflictos:0,revisiones:0,errores:0};
  let failure=null;
  try{
    const result=await scanEquipos({onProgress:progress=>Object.assign(stats,progress)});
    Object.assign(stats,result);
  }catch(error){
    failure=String(error?.code||error?.message||'ERROR').slice(0,500);
    stats.errores++;
  }
  const estado=stats.errores?'ERROR':'COMPLETADO';
  await db.query(
    `UPDATE instalaciones_programacion_conciliacion_diaria
        SET estado=?,fin_en=NOW(),total_equipos=?,creadas=?,actualizadas=?,
            historicas=?,conflictos=?,errores=?,ultimo_error=?
      WHERE fecha_cdmx=? AND estado='EN_PROCESO'`,
    [estado,stats.total_equipos,stats.creadas,stats.actualizadas,stats.historicas,
      stats.conflictos,stats.errores,failure,date]);
  return {fecha_cdmx:date,estado,...stats};
}
async function checkDaily(date=new Date()){
  if(running)return {estado:'EN_PROCESO_LOCAL'};
  const clock=cdmxParts(date);
  if(clock.hour!==23||clock.minute!==59)return {estado:'FUERA_DE_VENTANA'};
  running=true;
  try{
    const result=await executeDaily(clock.day);
    console.info('[INT9_NOCHE]',JSON.stringify(result));
    return result;
  }catch(error){
    console.error('[INT9_NOCHE_ERROR]',String(error?.code||error?.message||'ERROR'));
    return {estado:'ERROR',fecha_cdmx:clock.day};
  }finally{running=false;}
}
function startJob(){
  if(timer)return timer;
  void checkDaily();
  timer=setInterval(()=>{void checkDaily();},POLL_MS);
  timer.unref?.();
  return timer;
}
function stopJob(){if(timer)clearInterval(timer);timer=null;}
module.exports={startJob,stopJob,checkDaily,executeDaily,cdmxParts,scanEquipos};

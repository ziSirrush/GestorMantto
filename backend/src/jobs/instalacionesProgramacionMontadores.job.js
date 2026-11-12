'use strict';
// INT9 04-M | QA por capas: no repetir relaciones vigentes, limitar esperas y
// permitir cancelacion entre operaciones confirmadas. No asigna montadores.
const db=require('../config/db');
const service=require('../modules/instalaciones-programacion-personal/instalaciones-programacion-personal.montadores.service');

const PAGE=50;
const BATCH=5;
const QUERY_TIMEOUT_MS=12000;
const POOL_WAIT_MS=8000;
const MAX_DURATION_MS=8*60*1000;
const MAX_EQUIPOS=3000;
const MAX_DETAILS=24;
let running=false;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function failure(code,message){
  return Object.assign(new Error(message),{code,statusCode:503});
}

// No dejar solicitudes de pool esperando indefinidamente. Si mysql2 entrega
// tarde la conexion solicitada, se libera al recibirla (no se filtra el pool).
function acquireConnection(dbHandle=db,timeoutMs=POOL_WAIT_MS){
  return new Promise((resolve,reject)=>{
    let finished=false;
    const timer=setTimeout(()=>{
      finished=true;
      reject(failure('INT9_MONTAJE_POOL_TIMEOUT',
        'Aiven no entrego una conexion dentro del limite de espera.'));
    },timeoutMs);
    Promise.resolve().then(()=>dbHandle.getConnection()).then(conn=>{
      if(finished){conn.release();return;}
      finished=true;clearTimeout(timer);resolve(conn);
    },err=>{
      if(finished)return;
      finished=true;clearTimeout(timer);reject(err);
    });
  });
}

const SOURCE_SQL=Object.freeze({
  EQUIPOS_04_M:
    "SELECT id_ins_fl FROM ins_fl WHERE id_ins_fl>? AND activo=1 AND TRIM(estatus)='04-M' ORDER BY id_ins_fl LIMIT ?",
  // Capa residual: no leer los 04-M ya reconciliados en la primera capa.
  // El JOIN solo incorpora relaciones activas cuyo equipo ya salio de 04-M,
  // quedo inactivo o falta. No se asigna ni se elimina personal.
  RELACIONES_OBSOLETAS:
    "SELECT DISTINCT r.id_ins_fl FROM instalaciones_programacion_contratistas_fl r "+
    "LEFT JOIN ins_fl f ON f.id_ins_fl=r.id_ins_fl "+
    "WHERE r.id_ins_fl>? AND r.activo=1 "+
    "AND (f.id_ins_fl IS NULL OR f.activo<>1 OR f.estatus IS NULL OR TRIM(f.estatus)<>'04-M') "+
    "ORDER BY r.id_ins_fl LIMIT ?"
});

async function readPage(phase,cursor){
  const sql=SOURCE_SQL[phase];
  if(!sql)throw Error('INT9_MONTAJE_FASE_INVALIDA');
  const conn=await acquireConnection();
  try{
    const [rows]=await conn.query({sql,timeout:QUERY_TIMEOUT_MS},[cursor,PAGE]);
    if(!Array.isArray(rows)||rows.length>PAGE)
      throw failure('INT9_MONTAJE_PAGINACION_INVALIDA','La pagina de Aiven no es valida.');
    return rows;
  }finally{conn.release();}
}

function stopReason(shouldStop,startedAt,count){
  if(shouldStop?.())return 'CANCELADO';
  if(Date.now()-startedAt>=MAX_DURATION_MS)return 'TIEMPO_MAXIMO';
  if(count>=MAX_EQUIPOS)return 'LIMITE_EQUIPOS';
  return null;
}
function interrupted(stats,reason,onProgress){
  stats.fase=reason;
  const result={...stats,interrumpida:true,motivo_interrupcion:reason};
  onProgress?.(result);
  return result;
}

async function scanEquipos({onProgress=null,shouldStop=null}={}){
  if(running)throw Object.assign(new Error('Ya hay una conciliacion 04-M en esta instancia.'),
    {code:'INT9_MONTAJE_EN_PROCESO',statusCode:409});
  running=true;
  const startedAt=Date.now();
  const stats={fase:'EQUIPOS_04_M',total_equipos:0,creadas:0,historicas:0,
    revisiones:0,errores:0,detalles:[],lotes_completados:0,
    ultimo_id_ins_fl:0,equipos_en_capa:0,omitidos_por_limite:0};
  try{
    for(const phase of Object.keys(SOURCE_SQL)){
      stats.fase=phase;
      stats.equipos_en_capa=0;
      onProgress?.({...stats});
      let cursor=0;
      while(true){
        const stop=stopReason(shouldStop,startedAt,stats.total_equipos);
        if(stop)return interrupted(stats,stop,onProgress);
        const rows=await readPage(phase,cursor);
        if(!rows.length)break;
        const nextCursor=Number(rows[rows.length-1].id_ins_fl);
        if(!Number.isSafeInteger(nextCursor)||nextCursor<=cursor)
          throw failure('INT9_MONTAJE_CURSOR_INVALIDO','La paginacion de 04-M no avanza.');
        for(let index=0;index<rows.length;index+=BATCH){
          const batch=rows.slice(index,index+BATCH);
          for(const row of batch){
            const check=stopReason(shouldStop,startedAt,stats.total_equipos);
            if(check)return interrupted(stats,check,onProgress);
            const id=Number(row.id_ins_fl);
            if(!Number.isSafeInteger(id)||id<=cursor){
              throw failure('INT9_MONTAJE_ID_INVALIDO','Aiven devolvio un ID de equipo fuera de orden.');
            }
            try{
              // Solo el QA utiliza los limites: guardados normales siguen su flujo.
              const result=await service.reconcile(id,{tecnico:true,actorId:null,
                poolTimeoutMs:POOL_WAIT_MS,queryTimeoutMs:QUERY_TIMEOUT_MS});
              stats.creadas+=Number(result.creadas)||0;
              stats.historicas+=Number(result.historicas)||0;
              if(result.estado==='REQUIERE_REVISION' || result.estado==='NO_DISPONIBLE'){
                stats.revisiones++;
                if(stats.detalles.length<MAX_DETAILS)
                  stats.detalles.push({id_ins_fl:id,codigo:result.motivo||result.estado});
              }
            }catch(error){
              stats.errores++;
              if(stats.detalles.length<MAX_DETAILS)
                stats.detalles.push({id_ins_fl:id,codigo:String(error?.code||'ERROR')});
            }
            stats.total_equipos++;
            stats.equipos_en_capa++;
            stats.ultimo_id_ins_fl=id;
          }
          stats.lotes_completados++;
          onProgress?.({...stats,detalles:stats.detalles.slice()});
          const stop=stopReason(shouldStop,startedAt,stats.total_equipos);
          if(stop)return interrupted(stats,stop,onProgress);
          await delay(250);
        }
        cursor=nextCursor;
        if(rows.length<PAGE)break;
      }
    }
    stats.fase='FINALIZADA';
    const result={...stats,interrumpida:false};
    onProgress?.(result);
    return result;
  }finally{running=false;}
}

module.exports={scanEquipos,_test:{SOURCE_SQL,stopReason,acquireConnection,readPage}};

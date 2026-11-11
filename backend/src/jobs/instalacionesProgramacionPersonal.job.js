'use strict';

// INT9: barrido progresivo de Ajustadores (Aiven es la fuente oficial).
// Fase 1: recorrer ins_fl por PK, incluida la variacion con espacios en estatus.
// Fase 2: revisar barras automaticas existentes para historizar las retiradas.
// En cada bloque se reserva UNA conexion, se protege mediante GET_LOCK y se
// libera ANTES de esperar. No se escribe en el control nocturno desde QA.
const db=require('../config/db');
const {reconciliarEquipo}=require('../modules/instalaciones-programacion-personal/instalaciones-programacion-personal.conciliacion.service');
const TZ='America/Mexico_City';
const POLL_MS=10000;
const SOURCE_PAGE=50;
const WORK_BATCH=5;
const PAUSE_MS=300;
const MAX_RETRIES=2;
const LOCK_NAME='bltnow_int9_conciliacion_bloque_v1';
let timer=null;
let running=false;
let scanRunning=false;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function cdmxParts(date=new Date()){
  const values=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
    timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',hourCycle:'h23'
  }).formatToParts(date).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return {day:`${values.year}-${values.month}-${values.day}`,
    hour:Number(values.hour),minute:Number(values.minute)};
}
function pressure(error){
  const code=String(error?.dbErrorCode||error?.code||'').toUpperCase();
  return ['DB_POOL_QUEUE_FULL','DB_CONNECTION_CAPACITY','ER_CON_COUNT_ERROR',
    'ER_TOO_MANY_USER_CONNECTIONS','ETIMEDOUT','ECONNRESET','EPIPE',
    'PROTOCOL_CONNECTION_LOST'].includes(code) ||
    /queue limit reached/i.test(String(error?.message||''));
}
function phaseLabel(phase){return phase==='06-A'?'EQUIPOS_06_A':'AUTOMATICAS_EXISTENTES';}
function publish(onProgress,stats){
  if(onProgress)onProgress({...stats,detalles:stats.detalles.slice()});
}
function addOutcome(stats,id,out){
  stats.total_equipos++;
  stats.creadas+=out.creadas||0;
  stats.actualizadas+=out.actualizadas||0;
  stats.historicas+=out.historicas||0;
  stats.conflictos+=(out.conflictos||[]).length;
  if(out.estado==='REQUIERE_REVISION'){
    const issues=Array.isArray(out.incidencias)?out.incidencias:[];
    if(issues.length)stats.revisiones++;
    else stats.errores++;
    if(stats.detalles.length<5)stats.detalles.push({
      id_ins_fl:id,codigo:String(out.motivo||out.estado).slice(0,100),
      codigos:issues.slice(0,8)
    });
  }
}
function addError(stats,id,error,manual){
  stats.total_equipos++;
  stats.errores++;
  const code=String(error?.code||'ERROR').slice(0,100);
  if(stats.detalles.length<5)stats.detalles.push({id_ins_fl:id,codigo:code});
  console.error(manual?'[INT9_PRUEBA_EQUIPO]':'[INT9_NOCHE_EQUIPO]',
    JSON.stringify({id,code}));
}
async function sourcePage(phase,last){
  if(phase==='06-A'){
    // Rango acotado en PRIMARY KEY: evita el OR EXISTS+TRIM que retenia
    // la primera consulta; TRIM en JS mantiene la semantica anterior.
    const [rows]=await db.query(
      `SELECT f.id_ins_fl,f.estatus FROM ins_fl f
       WHERE f.id_ins_fl>? ORDER BY f.id_ins_fl LIMIT ?`,
      [last,SOURCE_PAGE]);
    return rows;
  }
  // KEY idx_int9_asignacion_equipo (id_ins_fl, activo), sin OR contra ins_fl.
  // Agrupar por id_ins_fl evita procesar dos veces un equipo con dos ajustadores.
  const [rows]=await db.query(
    `SELECT a.id_ins_fl,f.estatus FROM instalaciones_programacion_asignaciones a
       JOIN ins_fl f ON f.id_ins_fl=a.id_ins_fl
      WHERE a.id_ins_fl>? AND a.activo=1 AND a.origen='AUTOMATICA_FL'
      GROUP BY a.id_ins_fl,f.estatus
      ORDER BY a.id_ins_fl ASC LIMIT ?`,[last,SOURCE_PAGE]);
  return rows;
}
function applicable(phase,row){
  const eligible=String(row.estatus??'').trim()==='06-A';
  return phase==='06-A'?eligible:!eligible;
}
async function processBlock(ids,stats,{onProgress,shouldStop,manual,phase}){
  let offset=0,attempt=0;
  while(offset<ids.length){
    if(shouldStop?.())return false;
    let conn=null,locked=false;
    try{
      conn=await db.getConnection();
      const [result]=await conn.query('SELECT GET_LOCK(?,0) AS acquired',[LOCK_NAME]);
      if(Number(result[0]?.acquired)!==1){
        const busy=new Error('Otra conciliacion procesa un bloque.');
        busy.code='INT9_BLOQUE_OCUPADO';throw busy;
      }
      locked=true;
      while(offset<ids.length){
        if(shouldStop?.())return false;
        const id=ids[offset];
        try{
          const out=await reconciliarEquipo(id,{
            tecnico:true,actorId:null,conexionCompartida:conn});
          addOutcome(stats,id,out);
        }catch(error){
          if(pressure(error))throw error;
          addError(stats,id,error,manual);
        }
        offset++;
        stats.equipos_en_capa++;
        stats.ultimo_id_ins_fl=id;
        stats.fase=phaseLabel(phase);
        publish(onProgress,stats);
      }
      attempt=0;
    }catch(error){
      if((pressure(error)||error?.code==='INT9_BLOQUE_OCUPADO')&&attempt<MAX_RETRIES){
        attempt++;
        stats.reintentos++;
        stats.fase='ESPERA_CAPACIDAD';
        publish(onProgress,stats);
        // la espera ocurre fuera del finally (sin conexion ni GET_LOCK).
      }else{
        const failure=new Error('Conciliacion pausada: capacidad de base de datos no disponible.');
        failure.code=pressure(error)?'INT9_PRESION_DB':
          error?.code==='INT9_BLOQUE_OCUPADO'?'INT9_BLOQUE_OCUPADO':
            String(error?.code||'INT9_ERROR_BLOQUE');
        throw failure;
      }
    }finally{
      if(conn){
        let releaseFailed=false;
        if(locked){
          try{
            const [released]=await conn.query('SELECT RELEASE_LOCK(?) AS released',[LOCK_NAME]);
            if(Number(released[0]?.released)!==1)releaseFailed=true;
          }catch(error){
            releaseFailed=true;
            console.error('[INT9_BLOQUE_RELEASE]',String(error?.code||'ERROR'));
          }
        }
        // Si el lock no se liberó, destruir el socket; nunca devolverlo al pool.
        if(releaseFailed && typeof conn.destroy==='function')conn.destroy();
        else conn.release();
      }
    }
    if(offset<ids.length)await wait(Math.min(10000,2000*Math.pow(2,Math.max(0,attempt-1))));
  }
  return true;
}
async function scanEquipos({onProgress=null,shouldStop=null,manual=false}={}){
  if(scanRunning){
    throw Object.assign(new Error('Ya existe un barrido de ajustadores en esta instancia.'),
      {code:'INT9_CONCILIACION_OCUPADA'});
  }
  scanRunning=true;
  try{
  const stats={total_equipos:0,creadas:0,actualizadas:0,historicas:0,
    conflictos:0,revisiones:0,errores:0,detalles:[],fase:'EQUIPOS_06_A',
    equipos_en_capa:0,ultimo_id_ins_fl:0,lotes_completados:0,reintentos:0};
  let interrumpida=false;
  for(const phase of ['06-A','HISTORICAS']){
    let last=0;stats.fase=phaseLabel(phase);stats.equipos_en_capa=0;
    publish(onProgress,stats);
    for(;;){
      if(shouldStop?.()){interrumpida=true;break;}
      // Buscar por paginas pequeñas, pero solo enviar 5 equipos a cada
      // transaccion protegida. Los que no requieren ajuste no se procesan.
      let rows;
      try{rows=await sourcePage(phase,last);}
      catch(error){
        if(pressure(error)){
          // No hay cursor confirmado: nunca saltar un segmento fallido.
          let recovered=false;
          for(let attempt=1;attempt<=MAX_RETRIES;attempt++){
            stats.fase='ESPERA_CAPACIDAD';stats.reintentos++;
            publish(onProgress,stats);
            await wait(Math.min(10000,2000*Math.pow(2,attempt-1)));
            if(shouldStop?.()){interrumpida=true;break;}
            try{rows=await sourcePage(phase,last);recovered=true;break;}
            catch(next){if(!pressure(next))throw next;}
          }
          if(interrumpida)break;
          if(!recovered){
            const failure=new Error('Presion de Aiven: fallo en consulta de pagina.');
            failure.code='INT9_PRESION_DB';throw failure;
          }
        }else throw error;
      }
      if(!rows.length)break;
      const maxId=Number(rows[rows.length-1].id_ins_fl);
      if(!Number.isSafeInteger(maxId)||maxId<=last)
        throw Object.assign(new Error('Cursor de FL no avanza.'),{code:'INT9_CURSOR_INVALIDO'});
      const relevant=rows.filter(row=>applicable(phase,row)).map(row=>Number(row.id_ins_fl));
      for(let pos=0;pos<relevant.length;pos+=WORK_BATCH){
        if(shouldStop?.()){interrumpida=true;break;}
        const ok=await processBlock(relevant.slice(pos,pos+WORK_BATCH),stats,{
          onProgress,shouldStop,manual,phase});
        if(!ok){interrumpida=true;break;}
        stats.lotes_completados++;
        publish(onProgress,stats);
        await wait(PAUSE_MS);
      }
      if(interrumpida)break;
      last=maxId;
      stats.ultimo_cursor_origen=last;
      stats.fase=phaseLabel(phase);
      publish(onProgress,stats);
      if(rows.length<SOURCE_PAGE)break;
      await wait(PAUSE_MS);
    }
    if(interrumpida)break;
  }
  if(interrumpida)stats.fase='INTERRUMPIDA';
  else stats.fase='FINALIZADA';
  publish(onProgress,stats);
  return {...stats,interrumpida};
  }finally{scanRunning=false;}
}
async function executeDaily(date){
  // Una sola reserva por fecha; no reintentar el cierre nocturno.
  const [reserved]=await db.query(
    `INSERT IGNORE INTO instalaciones_programacion_conciliacion_diaria
      (fecha_cdmx,estado,inicio_en) VALUES (?,'EN_PROCESO',NOW())`,[date]);
  if(Number(reserved.affectedRows)!==1)return {estado:'YA_REGISTRADO',fecha_cdmx:date};
  const stats={total_equipos:0,creadas:0,actualizadas:0,historicas:0,
    conflictos:0,revisiones:0,errores:0};
  let failure=null,interrupted=false;
  try{
    const result=await scanEquipos({onProgress:progress=>Object.assign(stats,progress)});
    Object.assign(stats,result);interrupted=result.interrumpida===true;
  }catch(error){
    failure=String(error?.code||error?.message||'ERROR').slice(0,500);
    stats.errores++;
  }
  const estado=stats.errores||interrupted?'ERROR':'COMPLETADO';
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

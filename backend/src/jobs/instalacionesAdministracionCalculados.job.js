'use strict';

// [Mantto Gestor | 2026-10-13 | FASE_1_INSTALACIONES_ADMIN_V2_BACKEND_V001]
// Refresco persistente de columnas derivadas de ins_fl en hora CDMX.
// Una corrida por dia/instancia, coordinada entre replicas por MySQL GET_LOCK.
// Las ediciones de usuarios se auditan atomicas en auto-service; este job
// SOLO mantiene derivados y deja un resumen tecnico en el log del backend.

const db = require('../config/db');
const logger = require('../shared/logger');
const rules = require('../modules/instalaciones-administracion/instalaciones-administracion.auto-rules');
const LOCK_NAME = 'mg:instalaciones:administracion:calculos:v1';
const PAGE_SIZE = 200;
const CHECK_MS = 15 * 60 * 1000;
const COMPARISON_FIELDS = Object.freeze([
  ...rules.DEPENDENCY_FIELDS_COR,...rules.AUTO_FIELDS_COR
]);
let timer = null;
let running = false;
let lastRunDay = null;

function zonedClock_cor(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone:rules.TZ_COR,
    year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'
  }).formatToParts(now).reduce((result,item)=>{
    if(['year','month','day','hour','minute'].includes(item.type))result[item.type]=item.value;
    return result;
  },{});
  return {day:`${parts.year}-${parts.month}-${parts.day}`,
    minute:Number(parts.hour)*60+Number(parts.minute)};
}

function changesForRow_cor(row,ymd) {
  const desired=rules.derivedForRow_cor(row,ymd);
  return Object.fromEntries(Object.entries(desired).filter(([field,value])=>
    rules.AUTO_FIELDS_COR.includes(field) &&
    // Comparacion canonica null/vacio: no reescribir indebidamente sin cambio.
    String(row[field]??'')!==String(value??'')
  ));
}

async function runDailyCor_cor(ymd, options={}) {
  if (rules.parseCivilDate_cor(ymd).kind!=='valid') throw new Error('Fecha de corte invalida.');
  const executor=options.db||db;
  const connection=typeof executor.getConnection==='function' ? await executor.getConnection() : executor;
  let acquired=false;
  try {
    const [locks]=await connection.query('SELECT GET_LOCK(?,0) AS granted',[LOCK_NAME]);
    acquired=Number(locks[0]?.granted)===1;
    if(!acquired)return {skipped:true,reason:'otra_instancia_procesando',day:ymd};
    let lastId=0,scanned=0,updated=0,conflicts=0,invalid=0;
    for (;;) {
      const [rows]=await connection.query(
        `SELECT id_ins_fl,${COMPARISON_FIELDS.map(f=>`\`${f}\``).join(',')}
           FROM ins_fl
          WHERE id_ins_fl > ?
          ORDER BY id_ins_fl ASC
          LIMIT ?`,[lastId,PAGE_SIZE]
      );
      if(!rows.length)break;
      for (const row of rows) {
        lastId=Number(row.id_ins_fl);
        scanned++;
        const changes=changesForRow_cor(row,ymd);
        if ([row.fecha_visita,row.fecha_ccnr,row.fecha_fin_montaje_modificado,row.fecha_fin_montaje_planeado]
          .some(value=>rules.parseCivilDate_cor(value).kind==='invalid')) invalid++;
        if(!Object.keys(changes).length)continue;
        // Compare-and-swap en la misma fila. Si un usuario edita fechas o
        // estado concurrentemente, NO se pisan derivados de su cambio.
        const fields=Object.keys(changes);
        const sets=fields.map(f=>`\`${f}\`=?`).join(',');
        const predicates=COMPARISON_FIELDS.map(f=>`\`${f}\` <=> ?`).join(' AND ');
        const [result]=await connection.query(
          `UPDATE ins_fl SET ${sets} WHERE id_ins_fl=? AND ${predicates}`,
          [...fields.map(f=>changes[f]),row.id_ins_fl,...COMPARISON_FIELDS.map(f=>row[f]??null)]
        );
        if(Number(result.affectedRows)===1)updated++;
        else conflicts++;
      }
      if(rows.length<PAGE_SIZE)break;
      if(options.yieldAfterPage!==false) await new Promise(resolve=>setTimeout(resolve,15));
    }
    return {ok:true,day:ymd,scanned,updated,conflicts,invalid};
  } finally {
    if(acquired){try{await connection.query('SELECT RELEASE_LOCK(?) AS released',[LOCK_NAME]);}
      catch(error){logger.error('[Instalaciones Admin] No fue posible liberar candado SQL.',error);}}
    if(connection!==executor && typeof connection.release==='function')connection.release();
  }
}

async function checkDailyCor_cor(now = new Date(), options={}) {
  if(running)return {skipped:true,reason:'ya_en_ejecucion'};
  const clock=zonedClock_cor(now);
  if(clock.minute<10)return {skipped:true,reason:'antes_de_00_10',day:clock.day};
  if(lastRunDay===clock.day&&!options.force)return {skipped:true,reason:'ya_ejecutado',day:clock.day};
  running=true;
  try {
    const result=await runDailyCor_cor(clock.day,options);
    if(result.ok){lastRunDay=clock.day;
      logger.info(`[Instalaciones Admin] Calculados actualizados: ${JSON.stringify(result)}`);}
    return result;
  }catch(error){
    logger.error('[Instalaciones Admin] Error refrescando calculados; proxima revision reintentara.',error);
    return {ok:false,day:clock.day,error: 'CALCULOS_FALLARON'};
  }finally{running=false;}
}

function startInstalacionesAdministracionCalculadosJob(){
  if(timer)return timer;
  // Corre al iniciar si son mas de las 00:10 CDMX y luego cada 15 minutos;
  // nunca escribe al importar el modulo y nunca habilita/deshabilita otros jobs.
  void checkDailyCor_cor();
  timer=setInterval(()=>{void checkDailyCor_cor();},CHECK_MS);
  timer.unref?.();
  return timer;
}

function stopInstalacionesAdministracionCalculadosJob(){
  if(timer)clearInterval(timer);
  timer=null;
}

module.exports={
  LOCK_NAME,PAGE_SIZE,COMPARISON_FIELDS,zonedClock_cor,changesForRow_cor,
  runDailyCor_cor,checkDailyCor_cor,
  startInstalacionesAdministracionCalculadosJob,
  stopInstalacionesAdministracionCalculadosJob
};

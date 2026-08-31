'use strict';
const crypto=require('crypto');
const db=require('../config/db');
const logger=require('../shared/logger');

const TZ=process.env.LOGISTICA_CIERRE_SEMANAL_TZ||'America/Mexico_City';
const HOUR=Number.parseInt(process.env.LOGISTICA_CIERRE_SEMANAL_HOUR||'12',10);
const MINUTE=Number.parseInt(process.env.LOGISTICA_CIERRE_SEMANAL_MINUTE||'0',10);
const ENABLED=String(process.env.LOGISTICA_CIERRE_SEMANAL_ENABLED||'true').toLowerCase()!=='false';
const RETRY_MS=5*60*1000;
let timer=null,lastRunKey=null,lastFailure=null;

function zonedParts(date=new Date()){
 const p=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).formatToParts(date).reduce((a,x)=>(a[x.type]=x.value,a),{});
 return {year:Number(p.year),month:Number(p.month),day:Number(p.day),weekday:p.weekday,hour:Number(p.hour),minute:Number(p.minute),date:`${p.year}-${p.month}-${p.day}`,datetime:`${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`};
}
function shiftYmd(y,m,d,delta){const x=new Date(Date.UTC(y,m-1,d));x.setUTCDate(x.getUTCDate()+delta);return {year:x.getUTCFullYear(),month:x.getUTCMonth()+1,day:x.getUTCDate(),date:x.toISOString().slice(0,10)};}
function isoWeekInfo(y,m,d){const x=new Date(Date.UTC(y,m-1,d));const day=x.getUTCDay()||7;x.setUTCDate(x.getUTCDate()+4-day);const year=x.getUTCFullYear(),start=new Date(Date.UTC(year,0,1));return {anio_iso:year,semana_iso:Math.ceil((((x-start)/86400000)+1)/7)};}
function latestDueTuesday(date=new Date()){
 const p=zonedParts(date),idx={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6}[p.weekday];if(idx===undefined)throw new Error(`Día no reconocido: ${p.weekday}`);
 const dueNow=idx===2&&(p.hour*60+p.minute)>=HOUR*60+MINUTE;const back=dueNow?0:(idx>2?idx-2:idx+5);const target=shiftYmd(p.year,p.month,p.day,-back);return {...target,...isoWeekInfo(target.year,target.month,target.day),scheduled_datetime:`${target.date} ${String(HOUR).padStart(2,'0')}:${String(MINUTE).padStart(2,'0')}:00`,execution_parts:p,recovery:target.date!==p.date||!dueNow};
}
function parseJson(v,fallback=[]){if(Array.isArray(v))return v;if(v&&typeof v==='object')return v;try{return JSON.parse(v);}catch(_e){return fallback;}}
function normalize(v){return String(v??'').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
function buildMovements(previous,current,timestamp){const map=new Map(previous.map(r=>[String(r.id_log_ops),r]));const out=[];for(const row of current){const old=map.get(String(row.id_log_ops));if(!old){out.push({tipo:'NUEVO_INGRESO',id_log_ops:row.id_log_ops,id_ppns:row.id_ppns,proyecto:row.proyecto,estatus_actual:row.estatus,fecha_movimiento:timestamp});continue;}if(normalize(old.estatus)!==normalize(row.estatus))out.push({tipo:'CAMBIO_ESTATUS',id_log_ops:row.id_log_ops,id_ppns:row.id_ppns,proyecto:row.proyecto,marca:row.marca,no_control:row.no_control,cantidad:row.cantidad,supervisor:row.supervisor,asesor:row.asesor,estatus_anterior:old.estatus,estatus_actual:row.estatus,fecha_movimiento:timestamp});}return out;}
async function currentSnapshot(){const [rows]=await db.query(`SELECT id_log_ops,id_ppns,proyecto,estatus,marca,no_control,cantidad,supervisor,asesor,pvo FROM log_ops ORDER BY id_log_ops`);return rows.map(r=>({...r,id_log_ops:Number(r.id_log_ops)}));}
async function previousCut(year,week){const [rows]=await db.query(`SELECT id_corte,snapshot_json FROM logistica_cortes_semanales WHERE estado='CERRADO' AND (anio_iso<? OR (anio_iso=? AND semana_iso<?)) ORDER BY anio_iso DESC,semana_iso DESC LIMIT 1`,[year,year,week]);return rows[0]||null;}
async function runWeeklyClose(date=new Date(),generatedBy=null,targetDate=null){
 const now=zonedParts(date),target=targetDate||{year:now.year,month:now.month,day:now.day,date:now.date},iso=isoWeekInfo(target.year,target.month,target.day);
 const [existing]=await db.query('SELECT id_corte,estado FROM logistica_cortes_semanales WHERE anio_iso=? AND semana_iso=? LIMIT 1',[iso.anio_iso,iso.semana_iso]);if(existing[0]?.estado==='CERRADO')return {skipped:true,reason:'already_closed',id_corte:existing[0].id_corte,...iso};
 const snapshot=await currentSnapshot(),previous=await previousCut(iso.anio_iso,iso.semana_iso),movements=previous?buildMovements(parseJson(previous.snapshot_json),snapshot,now.datetime):[];
 const ingresos=movements.filter(x=>x.tipo==='NUEVO_INGRESO').length,cambios=movements.filter(x=>x.tipo==='CAMBIO_ESTATUS').length;
 const snapshotJson=JSON.stringify(snapshot),movementsJson=JSON.stringify(movements),hash=crypto.createHash('sha256').update(`${snapshotJson}|${movementsJson}`).digest('hex');
 await db.query(`INSERT INTO logistica_cortes_semanales (anio_iso,semana_iso,fecha_corte,id_corte_anterior,total_log_ops,total_movimientos,total_ingresos,total_cambios_estatus,snapshot_json,movimientos_json,estado,hash_contenido,generado_por)
 VALUES (?,?,?,?,?,?,?,?,?,?,'CERRADO',?,?) ON DUPLICATE KEY UPDATE fecha_corte=VALUES(fecha_corte),id_corte_anterior=VALUES(id_corte_anterior),total_log_ops=VALUES(total_log_ops),total_movimientos=VALUES(total_movimientos),total_ingresos=VALUES(total_ingresos),total_cambios_estatus=VALUES(total_cambios_estatus),snapshot_json=VALUES(snapshot_json),movimientos_json=VALUES(movimientos_json),estado='CERRADO',hash_contenido=VALUES(hash_contenido),generado_por=COALESCE(generado_por,VALUES(generado_por))`,[iso.anio_iso,iso.semana_iso,now.datetime,previous?.id_corte||null,snapshot.length,movements.length,ingresos,cambios,snapshotJson,movementsJson,hash,generatedBy]);
 return {ok:true,...iso,fecha_programada:target.date,fecha_corte_real:now.datetime,recuperacion:target.date!==now.date,total_log_ops:snapshot.length,total_movimientos:movements.length,total_ingresos:ingresos,total_cambios_estatus:cambios,linea_base:!previous};
}
async function checkWeeklyClose(date=new Date()){if(!ENABLED)return {skipped:true,reason:'disabled'};const due=latestDueTuesday(date),key=`${due.anio_iso}-${due.semana_iso}`;if(lastFailure?.key===key&&Date.now()-lastFailure.at<RETRY_MS)return {skipped:true,reason:'retry_backoff',due};if(lastRunKey===key)return {skipped:true,reason:'already_ran_in_process',due};lastRunKey=key;try{const out=await runWeeklyClose(date,null,due);lastFailure=null;return out;}catch(e){lastRunKey=null;lastFailure={key,at:Date.now()};logger.error('[Logistica] Error ejecutando corte semanal.',e);return {ok:false,error:e.message,due};}}
function startLogisticaCierreSemanalJob(){if(!ENABLED||timer)return timer;logger.info(`[Logistica] Corte semanal activo: martes ${String(HOUR).padStart(2,'0')}:${String(MINUTE).padStart(2,'0')} (${TZ}).`);checkWeeklyClose().catch(e=>logger.error('[Logistica] Falló verificación inicial.',e));timer=setInterval(()=>checkWeeklyClose().catch(e=>logger.error('[Logistica] Falló job semanal.',e)),30000);timer.unref?.();return timer;}
function stopLogisticaCierreSemanalJob(){if(timer)clearInterval(timer);timer=null;}
module.exports={startLogisticaCierreSemanalJob,stopLogisticaCierreSemanalJob,checkWeeklyClose,runWeeklyClose,latestDueTuesday,isoWeekInfo,buildMovements};

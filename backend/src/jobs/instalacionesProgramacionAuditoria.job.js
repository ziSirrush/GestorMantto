'use strict';
// INT9: conciliacion nocturna 23:59 CDMX, motores independientes en serie.
// audit() permanece de solo lectura; la ejecucion diaria concilia y verifica.
const db=require('../config/db');
const PAGE=50,MAX_DETAILS=30,POLL_MS=10000;
let timer=null,working=false,executed=null;
function clock(date=new Date()){
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
    timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',hourCycle:'h23'
  }).formatToParts(date).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return {day:p.year+'-'+p.month+'-'+p.day,hour:Number(p.hour),minute:Number(p.minute)};
}
function norm(v){return String(v??'').normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('es-MX');}
function date(v){
  if(v instanceof Date)return v.toISOString().slice(0,10);
  const s=String(v??'').trim();return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:null;
}
function report(stats,type,id,reason){
  stats.revisiones++;
  if(stats.detalles.length<MAX_DETAILS)stats.detalles.push({tipo,id_ins_fl:Number(id),codigo:reason});
}
function grouped(rows){
  const map=new Map();
  for(const row of rows){const id=Number(row.id_ins_fl);
    if(!map.has(id))map.set(id,[]);
    map.get(id).push(row);
  }
  return map;
}
function findPeople(value,index){
  const original=String(value??'').trim();
  if(!original)return null;
  const exact=index.get(norm(original));
  if(exact?.length===1)return [Number(exact[0])];
  if(exact?.length>1)return null;
  const names=original.split('/').map(norm);
  if(names.length>5||names.some(x=>!x)||new Set(names).size!==names.length)return null;
  const list=[];
  for(const n of names){const options=index.get(n);
    if(!options||options.length!==1)return null;
    list.push(Number(options[0]));
  }
  return new Set(list).size===list.length?list:null;
}
async function audit(){
  const stats={total_equipos:0,ajustadores:0,montadores:0,
    revisiones:0,errores:0,detalles:[],ultimo_id_ins_fl:0};
  const [people]=await db.query(
    'SELECT id_personal,nombre FROM instalaciones_personal WHERE activo=1 AND tipo_personal=? LIMIT 5001',
    ['AJUSTADOR']);
  if(people.length>5000)throw Error('INT9_AUDITORIA_AJUSTADORES_EXCESIVOS');
  const index=new Map();
  for(const p of people){const n=norm(p.nombre);
    if(!index.has(n))index.set(n,[]);
    index.get(n).push(p.id_personal);
  }
  const [contractPeople]=await db.query(
    'SELECT iniciales,contratista FROM instalaciones_personal WHERE activo=1 AND tipo_personal=? LIMIT 5001',
    ['MONTADOR']);
  if(contractPeople.length>5000)throw Error('INT9_AUDITORIA_MONTADORES_EXCESIVOS');
  const contractors=new Map();
  for(const p of contractPeople){const initial=norm(p.iniciales),company=norm(p.contratista);
    if(!initial||!company)continue;
    if(!contractors.has(initial))contractors.set(initial,new Set());
    contractors.get(initial).add(company);
  }
  for(let last=0;;){
    const [equipos]=await db.query(
      'SELECT id_ins_fl,id_proyecto,activo,estatus,ajustador,subcontratista,'
      +'fecha_inicio_ajuste,fecha_fin_ajuste_real,fecha_fin_ajuste_modificado,fecha_fin_ajuste_planeado,'
      +'fecha_inicio_montaje,fecha_fin_montaje_real,fecha_fin_montaje_modificado,fecha_fin_montaje_planeado '
      +'FROM ins_fl WHERE id_ins_fl>? ORDER BY id_ins_fl ASC LIMIT ?',[last,PAGE]);
    if(!equipos.length)break;
    const ids=equipos.map(e=>Number(e.id_ins_fl));
    if(ids.some(n=>!Number.isSafeInteger(n)||n<=last))throw Error('INT9_AUDITORIA_CURSOR_INVALIDO');
    const placeholders=ids.map(()=>'?').join(',');
    const [aRows]=await db.query(
      'SELECT a.id_ins_fl,a.id_personal,a.fecha_desde,a.fecha_hasta,a.es_historico '
      +'FROM instalaciones_programacion_asignaciones a JOIN instalaciones_personal p ON p.id_personal=a.id_personal '
      +'WHERE a.id_ins_fl IN ('+placeholders+') AND a.activo=1 '
      +"AND a.origen='AUTOMATICA_FL' AND p.tipo_personal='AJUSTADOR'",ids);
    const [mRows]=await db.query(
      'SELECT id_ins_fl,id_proyecto,iniciales,contratista FROM instalaciones_programacion_contratistas_fl '
      +'WHERE id_ins_fl IN ('+placeholders+') AND activo=1',ids);
    const assigned=grouped(aRows),linked=grouped(mRows);
    for(const eq of equipos){
      const id=Number(eq.id_ins_fl),status=String(eq.estatus??'').trim();
      const active=Number(eq.activo)===1;
      const current=(assigned.get(id)||[]).filter(a=>Number(a.es_historico)!==1);
      const relation=linked.get(id)||[];
      stats.total_equipos++;
      if(active&&status==='06-A'){
        stats.ajustadores++;
        const expected=findPeople(eq.ajustador,index);
        if(!expected)report(stats,'AJUSTADOR',id,'IDENTIDAD_PENDIENTE');
        else if(current.length!==expected.length||expected.some(pid=>
          !current.some(a=>Number(a.id_personal)===pid)))
          report(stats,'AJUSTADOR',id,'ASIGNACION_INCORRECTA');
        else{
          const finish=date(eq.fecha_fin_ajuste_real)||date(eq.fecha_fin_ajuste_modificado)||
            date(eq.fecha_fin_ajuste_planeado);
          if(current.some(a=>!date(a.fecha_desde)||!date(a.fecha_hasta)||
            date(a.fecha_desde)>date(a.fecha_hasta)||(finish&&date(a.fecha_hasta)!==finish)))
            report(stats,'AJUSTADOR',id,'FECHAS_INCONSISTENTES');
        }
      }else if(current.length)report(stats,'AJUSTADOR',id,'FUERA_DE_06_A');
      if(active&&status==='04-M'){
        stats.montadores++;
        const initial=norm(eq.subcontratista),valid=contractors.get(initial);
        if(!eq.id_proyecto||!valid||valid.size!==1)
          report(stats,'MONTADOR',id,'CONTRATISTA_NO_RESUELTO');
        else if(relation.length!==1||norm(relation[0].id_proyecto)!==norm(eq.id_proyecto)||
          norm(relation[0].iniciales)!==initial||!valid.has(norm(relation[0].contratista)))
          report(stats,'MONTADOR',id,'RELACION_INCORRECTA');
      }else if(relation.length)report(stats,'MONTADOR',id,'FUERA_DE_04_M');
    }
    last=ids[ids.length-1];stats.ultimo_id_ins_fl=last;
    if(equipos.length<PAGE)break;
  }
  return stats;
}
// Control diario preexistente del motor de Ajustadores. No crear esquema.
// Sin reserva unica y comprobable por fecha no ejecutar escrituras operativas.
async function reserveDaily(day,connection){
  const [indexes]=await connection.query('SHOW INDEX FROM instalaciones_programacion_conciliacion_diaria');
  const unique=new Map();
  for(const row of indexes){
    if(Number(row.Non_unique)!==0)continue;
    const name=String(row.Key_name);
    if(!unique.has(name))unique.set(name,[]);
    unique.get(name).push(String(row.Column_name));
  }
  if(![...unique.values()].some(cols=>cols.length===1&&cols[0]==='fecha_cdmx'))
    throw Object.assign(new Error('El control diario requiere clave unica por fecha_cdmx.'),{code:'INT9_CONTROL_DIARIO_NO_UNICO'});
  await connection.query('SELECT estado,fin_en,total_equipos,creadas,actualizadas,historicas,conflictos,errores,ultimo_error FROM instalaciones_programacion_conciliacion_diaria LIMIT 0');
  try{
    const [reserved]=await connection.query(
      "INSERT INTO instalaciones_programacion_conciliacion_diaria (fecha_cdmx,estado,inicio_en) VALUES (?,'EN_PROCESO',NOW())",[day]);
    if(Number(reserved.affectedRows)===1)return true;
    throw Object.assign(new Error('No se pudo reservar la conciliacion nocturna.'),{code:'INT9_CONTROL_DIARIO_RESERVA_FALLIDA'});
  }catch(error){
    if(error?.code!=='ER_DUP_ENTRY')throw error;
    const [existing]=await connection.query(
      'SELECT estado FROM instalaciones_programacion_conciliacion_diaria WHERE fecha_cdmx=? LIMIT 1',[day]);
    if(existing.length===1)return false;
    throw error;
  }
}
function pressureFailure(error){
  return ['INT9_PRESION_DB','INT9_BLOQUE_OCUPADO','INT9_CONCILIACION_OCUPADA',
    'INT9_MONTAJE_EN_PROCESO','INT9_MONTAJE_POOL_TIMEOUT','DB_POOL_QUEUE_FULL','DB_CONNECTION_CAPACITY',
    'ER_CON_COUNT_ERROR','ER_TOO_MANY_USER_CONNECTIONS','ETIMEDOUT','ECONNRESET','EPIPE','PROTOCOL_CONNECTION_LOST']
    .includes(String(error?.dbErrorCode||error?.code||'').toUpperCase()) ||
    /queue limit reached/i.test(String(error?.message||''));
}
async function executeDaily(day,{
  connection=db,
  scanAdjusters=options=>require('./instalacionesProgramacionPersonal.job').scanEquipos(options),
  scanInstallers=options=>require('./instalacionesProgramacionMontadores.job').scanEquipos(options),
  verifyAfter=audit
}={}){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(day)))
    throw Object.assign(new Error('Fecha de conciliacion invalida.'),{code:'INT9_FECHA_DIARIA_INVALIDA'});
  if(!await reserveDaily(day,connection))return {estado:'YA_REGISTRADO',fecha_cdmx:day};
  const phases={ajustadores:null,montadores:null,auditoria:null};
  const failures=[];
  let blocked=false;
  // Cada motor valida FL y aplica solo los cambios pertinentes. No ejecutar
  // los dos a la vez ni reservar una conexion del pool durante todo el barrido.
  for(const [name,run] of [['ajustadores',scanAdjusters],['montadores',scanInstallers]]){
    if(blocked){phases[name]={omitida:true,motivo:'PRESION_O_CONCURRENCIA'};failures.push(name+':OMITIDO');continue;}
    try{
      const result=await run({onProgress:progress=>{phases[name]={...progress};}});
      phases[name]={...result};
      if(!result||result.interrumpida||Number(result.errores)>0){
        failures.push(name+':'+(result?.motivo_interrupcion||'ERRORES_O_INCOMPLETO'));
        if(result?.detalles?.some(item=>pressureFailure({code:item.codigo})))blocked=true;
      }
    }catch(error){
      phases[name]={...(phases[name]||{}),error:String(error?.code||'ERROR')};
      failures.push(name+':'+String(error?.code||'ERROR'));
      blocked=pressureFailure(error);
    }
  }
  if(!blocked){
    try{phases.auditoria=await verifyAfter();if(!phases.auditoria||Number(phases.auditoria.errores)>0)failures.push('auditoria:ERRORES');}
    catch(error){phases.auditoria={error:String(error?.code||'ERROR')};failures.push('auditoria:'+String(error?.code||'ERROR'));}
  }else{phases.auditoria={omitida:true,motivo:'PRESION_O_CONCURRENCIA'};failures.push('auditoria:OMITIDA');}
  const totals={total_equipos:0,creadas:0,actualizadas:0,historicas:0,conflictos:0,errores:0};
  for(const result of [phases.ajustadores,phases.montadores]){
    for(const key of Object.keys(totals))totals[key]+=Number(result?.[key])||0;
  }
  totals.errores=Math.max(totals.errores,failures.length);
  const pending=(Number(phases.auditoria?.revisiones)||0)>0 ||
    [phases.ajustadores,phases.montadores].some(x=>Number(x?.revisiones)>0||Number(x?.conflictos)>0);
  const estado=failures.length?'ERROR':pending?'REQUIERE_REVISION':'COMPLETADO';
  // El control diario previo admite EN_PROCESO/ERROR/COMPLETADO.
  // Una revision pendiente no equivale a un cierre limpio.
  const persisted=estado==='COMPLETADO'?'COMPLETADO':'ERROR';
  const detail=failures.length?failures.join('; '):pending?'REQUIERE_REVISION':null;
  const [closed]=await connection.query(
    "UPDATE instalaciones_programacion_conciliacion_diaria SET estado=?,fin_en=NOW(),total_equipos=?,creadas=?,actualizadas=?,historicas=?,conflictos=?,errores=?,ultimo_error=? WHERE fecha_cdmx=? AND estado='EN_PROCESO'",
    [persisted,totals.total_equipos,totals.creadas,totals.actualizadas,totals.historicas,totals.conflictos,totals.errores,detail?.slice(0,500)||null,day]);
  if(Number(closed.affectedRows)!==1)
    throw Object.assign(new Error('No se pudo confirmar el cierre diario.'),{code:'INT9_CONTROL_DIARIO_CIERRE_FALLIDO'});
  return {fecha_cdmx:day,estado,...totals,fases:phases,fallos:failures};
}
async function checkDaily(now=new Date()){
  const nowMx=clock(now);
  if(nowMx.hour!==23||nowMx.minute!==59)return {estado:'FUERA_DE_VENTANA'};
  if(working||executed===nowMx.day)return {estado:'YA_EJECUTADO'};
  working=true;executed=nowMx.day;
  try{
    const result=await executeDaily(nowMx.day);
    console.info('[INT9_CONCILIACION_NOCHE]',JSON.stringify(result));
    return result;
  }catch(error){
    console.error('[INT9_CONCILIACION_NOCHE_ERROR]',String(error?.code||error?.message||'ERROR'));
    return {estado:'ERROR',fecha_cdmx:nowMx.day};
  }finally{working=false;}
}
function startJob(){
  if(timer)return timer;
  void checkDaily();
  timer=setInterval(()=>{void checkDaily();},POLL_MS);
  timer.unref?.();
  return timer;
}
function stopJob(){if(timer)clearInterval(timer);timer=null;}
module.exports={startJob,stopJob,checkDaily,executeDaily,audit,clock};

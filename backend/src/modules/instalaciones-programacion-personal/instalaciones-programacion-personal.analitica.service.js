'use strict';

// [Mantto Gestor | 2026-10-16 | INT9-F3 | HISTORIAL DISPONIBILIDAD SIMULACION V001]
// Consultas SOLO LECTURA sobre instalaciones_personal y las asignaciones de F1/F2.
// Ins_fl es autoridad de fechas; no se infiere asistencia o trabajo ejecutado.
const db = require('../../config/db');
const recordScope = require('../../services/information-record-scope-gnral.service');
const assignmentService = require('./instalaciones-programacion-personal.asignaciones.service');
const shared = assignmentService._read;

const MAX_FILAS_HISTORIAL = 15000;
const MAX_PAGINA = 100;
const LIMITES_PERIODOS = Object.freeze({dia:186,semana:160,mes:61});
const COLUMNAS_EQUIPO = `f.proyecto,f.id_proyecto,f.referencia_sitio,f.estatus,
 f.fecha_inicio_montaje,f.fecha_fin_montaje_planeado,f.fecha_fin_montaje_modificado,f.fecha_fin_montaje_real,
 f.fecha_inicio_ajuste,f.fecha_fin_ajuste_planeado,f.fecha_fin_ajuste_modificado,f.fecha_fin_ajuste_real`;

function issue(statusCode,code,message){const e=new Error(message);e.statusCode=statusCode;e.code=code;return e;}
function dateOptional(value,name){return shared.manualDate(value,name);}
function historyRange(q){
  const desde=dateOptional(q.desde,'desde'),hasta=dateOptional(q.hasta,'hasta');
  if(desde&&hasta&&hasta<desde)throw issue(400,'INT9_RANGO_INVALIDO','La fecha final no puede ser anterior a la inicial.');
  if(desde&&hasta&&shared.inclusiveDays(desde,hasta)>7305)throw issue(400,'INT9_RANGO_LARGO','El historial permite hasta 20 años por consulta.');
  return {desde,hasta};
}
function intParam(value,def,max,name){
  if(value===undefined||value===null||value==='')return def;
  const n=Number(value);
  if(!Number.isSafeInteger(n)||n<1||n>max)throw issue(400,'INT9_NUMERO_INVALIDO',`${name}: número fuera de rango (1 a ${max}).`);
  return n;
}
function searchTerm(value){
  const t=String(value||'').trim();
  if(t.length>120)throw issue(400,'INT9_BUSQUEDA_LARGA','La búsqueda admite hasta 120 caracteres.');
  return t;
}
function eqRange(row,type){return shared.windowAsignacion(type,row,row);}
function inWindow(a,desde,hasta){
  if(!a.valida)return !desde&&!hasta;
  return (!desde||a.fin>=desde)&&(!hasta||a.inicio<=hasta);
}
function projectedDays(window,desde,hasta,today){
  if(!window.valida)return{transcurridos:0,futuros:0};
  const start=desde&&desde>window.inicio?desde:window.inicio;
  const end=hasta&&hasta<window.fin?hasta:window.fin;
  if(end<start)return{transcurridos:0,futuros:0};
  const passedEnd=end<today?end:today;
  const futureStart=start>today?start:shared.addDays(today,1);
  return{
    transcurridos:passedEnd>=start?shared.inclusiveDays(start,passedEnd):0,
    futuros:end>=futureStart?shared.inclusiveDays(futureStart,end):0
  };
}
function summaryHistory(rows){
  const active=rows.filter(x=>x.asignacion_activa);
  return{
    total_asignaciones:rows.length,
    asignaciones_activas:active.length,
    asignaciones_retiradas:rows.length-active.length,
    proyectos_distintos:new Set(rows.map(x=>x.id_ins_fl)).size,
    dias_programados_transcurridos:active.reduce((s,x)=>s+x.dias_programados_transcurridos,0),
    dias_programados_futuros:active.reduce((s,x)=>s+x.dias_programados_futuros,0)
  };
}
async function historial(req){
  const q=req.query||{},type=shared.tipo(q.tipo),access=shared.scope(req),period=historyRange(q);
  const page=intParam(q.page,1,100000,'Página');
  const limit=intParam(q.limit,30,MAX_PAGINA,'Límite');
  const personId=q.id_personal?shared.positive(q.id_personal,'Persona'):null;
  const term=searchTerm(q.q).toLocaleLowerCase('es');
  const statuses=new Set(['Pasada','En curso','Futura','Sin fechas','Retirada']);
  const status=q.estado?String(q.estado).trim():null;
  if(status&&!statuses.has(status))throw issue(400,'INT9_ESTADO_INVALIDO','Estado de programación inválido.');
  // Filtrar por alcance en SQL, no en navegador. Incluye bajas lógicas para auditoría de programación.
  // No expone equipo ni asignación alguna fuera del alcance CORELLIAN.
  const where=['p.tipo_personal=?',`(${access.sql})`];
  const params=[type,...access.params];
  if(personId){where.push('a.id_personal=?');params.push(personId);}
  // Acotar en MySQL antes de LIMIT; los filtros de fecha/texto deben funcionar
  // incluso con historiales que superan 15,000 registros acumulados.
  const fase=type==='MONTADOR'?'montaje':'ajuste';
  const startExpr=`COALESCE(a.fecha_desde,f.fecha_inicio_${fase})`;
  const endExpr=`COALESCE(a.fecha_hasta,f.fecha_fin_${fase}_real,f.fecha_fin_${fase}_modificado,f.fecha_fin_${fase}_planeado)`;
  if(period.desde){where.push(`(${endExpr}>=? OR ${endExpr} IS NULL)`);params.push(period.desde);}
  if(period.hasta){where.push(`(${startExpr}<=? OR ${startExpr} IS NULL)`);params.push(period.hasta);}
  if(term){
    const like='%'+term+'%';
    where.push('(p.nombre LIKE ? OR p.contratista LIKE ? OR p.puesto LIKE ? OR f.proyecto LIKE ? OR f.referencia_sitio LIKE ? OR f.id_proyecto LIKE ?)');
    params.push(...Array.from({length:6},()=>like));
  }
  const [fetched]=await db.query(
    `SELECT a.id_asignacion,a.id_personal,a.id_ins_fl,a.fecha_desde,a.fecha_hasta,
            a.notas,a.activo AS asignacion_activa,p.nombre,p.contratista,p.puesto,p.categoria,p.activo AS persona_activa,
            ${COLUMNAS_EQUIPO}
       FROM instalaciones_programacion_asignaciones a
       JOIN instalaciones_personal p ON p.id_personal=a.id_personal
       JOIN ins_fl f ON f.id_ins_fl=a.id_ins_fl
      WHERE ${where.join(' AND ')}
      ORDER BY a.id_asignacion DESC LIMIT ${MAX_FILAS_HISTORIAL+1}`,params);
  if(fetched.length>MAX_FILAS_HISTORIAL)throw issue(422,'INT9_HISTORIAL_DEMASIADO_GRANDE','La consulta supera el límite verificable; reduce filtros o fechas.');
  const today=shared.mxToday();
  let all=[];
  for(const row of fetched){
    const x=eqRange(row,type),active=Number(row.asignacion_activa)===1;
    if(!inWindow(x,period.desde,period.hasta))continue;
    const stage=!active?'Retirada':!x.valida?'Sin fechas':x.fin<today?'Pasada':x.inicio>today?'Futura':'En curso';
    if(status&&stage!==status)continue;
    if(term && ![row.nombre,row.contratista,row.proyecto,row.referencia_sitio,row.id_proyecto,row.puesto]
      .map(v=>String(v||'').toLocaleLowerCase('es')).some(v=>v.includes(term)))continue;
    const days=active?projectedDays(x,period.desde,period.hasta,today):{transcurridos:0,futuros:0};
    all.push({
      id_asignacion:Number(row.id_asignacion),id_personal:Number(row.id_personal),
      id_ins_fl:Number(row.id_ins_fl),nombre:row.nombre,contratista:row.contratista||null,
      puesto:row.puesto||null,categoria:row.categoria||null,
      proyecto:row.proyecto||row.id_proyecto||null,equipo:row.referencia_sitio||null,
      inicio:x.inicio,fin:x.fin,dias:x.dias,fuente_fin:x.fuente_fin,
      inicio_manual:x.inicio_manual,fin_manual:x.fin_manual,
      estado:stage,asignacion_activa:active,persona_activa:Number(row.persona_activa)===1,
      dias_programados_transcurridos:days.transcurridos,dias_programados_futuros:days.futuros,
      notas:row.notas||null
    });
  }
  all.sort((a,b)=>String(b.inicio||'').localeCompare(String(a.inicio||'')) || b.id_asignacion-a.id_asignacion);
  const resumen=summaryHistory(all),offset=(page-1)*limit;
  return {tipo:type,hoy:today,desde:period.desde,hasta:period.hasta,page,limit,total:all.length,
    filas:all.slice(offset,offset+limit),resumen,
    advertencia:'Días transcurridos son días PROGRAMADOS, no asistencia ni trabajo comprobado. Fechas calculadas con el reporte vigente.'};
}
function validPlanningRange(q){
  const desde=dateOptional(q.desde,'desde'),hasta=dateOptional(q.hasta,'hasta');
  if(!desde||!hasta)throw issue(400,'INT9_RANGO_OBLIGATORIO','Indica fecha inicial y final.');
  if(hasta<desde)throw issue(400,'INT9_RANGO_INVALIDO','La fecha final debe ser igual o posterior a la inicial.');
  if(shared.inclusiveDays(desde,hasta)>3700)throw issue(400,'INT9_RANGO_LARGO','La proyección no puede superar 3700 días.');
  return{desde,hasta};
}
function periods(desde,hasta,gran){
  const chunks=[];
  if(gran==='dia'){
    for(let d=desde;d<=hasta;d=shared.addDays(d,1))chunks.push({desde:d,hasta:d});
  }else if(gran==='semana'){
    const weekday=new Date(`${desde}T00:00:00Z`).getUTCDay();
    let cursor=shared.addDays(desde,-((weekday+6)%7));
    while(cursor<=hasta){
      const end=shared.addDays(cursor,6);
      chunks.push({desde:cursor<desde?desde:cursor,hasta:end>hasta?hasta:end});
      cursor=shared.addDays(cursor,7);
    }
  }else{
    let [y,m]=desde.split('-').map(Number);
    for(;;){
      const beginning=`${y}-${String(m).padStart(2,'0')}-01`;
      if(beginning>hasta)break;
      const monthEnd=new Date(Date.UTC(y,m,0)).toISOString().slice(0,10);
      chunks.push({desde:beginning<desde?desde:beginning,hasta:monthEnd>hasta?hasta:monthEnd});
      if(m===12){y++;m=1;}else m++;
    }
  }
  if(chunks.length>LIMITES_PERIODOS[gran])throw issue(400,'INT9_GRANULARIDAD_EXCESIVA',
    `Demasiados periodos para ${gran}: máximo ${LIMITES_PERIODOS[gran]}.`);
  return chunks;
}
function activityByPerson(assignments){
  const out=new Map();
  for(const a of assignments){const id=a.id_personal;
    if(!out.has(id))out.set(id,{fechadas:[],sin_fecha:false});
    const item=out.get(id);
    if(a.valida)item.fechadas.push(a);
    else item.sin_fecha=true;
  }
  return out;
}
function summarizePeriod(personas,activity,desde,hasta,type){
  const groups={},counters={total:personas.length,ocupados:0,libres:0,indeterminados:0};
  for(const p of personas){
    const group=type==='MONTADOR'?(p.puesto||'Sin puesto'):(p.categoria||'Sin categoría');
    if(!groups[group])groups[group]={total:0,ocupados:0,libres:0,indeterminados:0};
    const a=activity.get(p.id_personal),occupied=Boolean(a?.fechadas.some(x=>shared.intersect(x.inicio,x.fin,desde,hasta)));
    // Sin ventana valida la disponibilidad NO se puede confirmar como libre.
    const category=occupied?'ocupados':a?.sin_fecha?'indeterminados':'libres';
    groups[group].total++;groups[group][category]++;counters[category]++;
  }
  return{...counters,grupos:groups};
}
async function disponibilidad(req){
  const q=req.query||{},type=shared.tipo(q.tipo);
  shared.scope(req);
  const {desde,hasta}=validPlanningRange(q);
  const gran=['dia','semana','mes'].includes(q.granularidad)?q.granularidad:'semana';
  if(q.granularidad && !['dia','semana','mes'].includes(q.granularidad))throw issue(400,'INT9_GRAN_INVALIDA','Granularidad inválida.');
  const chunks=periods(desde,hasta,gran);
  const people=await shared.fetchPeople(db,type,searchTerm(q.q));
  const assignments=await shared.fetchAssignmentRows(db,type,people.map(x=>x.id_personal),req);
  const act=activityByPerson(assignments);
  return{tipo:type,desde,hasta,hoy:shared.mxToday(),granularidad:gran,
    total_personal:people.length,grupos:[...new Set(people.map(p=>type==='MONTADOR'?p.puesto||'Sin puesto':p.categoria||'Sin categoría'))].sort(),
    buckets:chunks.map(b=>({...b,...summarizePeriod(people,act,b.desde,b.hasta,type)})),
    advertencia:'Libres = sin asignación en el periodo. Indeterminados = asignaciones sin fechas válidas; no se suponen libres.'};
}
async function loadVisibleEquipment(req,id){
  const scope=shared.scope(req);
  const [rows]=await db.query(
    `SELECT ${COLUMNAS_EQUIPO},f.id_ins_fl
       FROM ins_fl f WHERE f.id_ins_fl=? AND f.activo=1 AND (${scope.sql}) LIMIT 1`,
    [shared.positive(id,'Equipo'),...scope.params]);
  if(!rows.length)throw issue(404,'INT9_EQUIPO_NO_VISIBLE','Equipo inexistente o fuera del alcance permitido.');
  return rows[0];
}
function requiredInteger(value,field){
  if(value===undefined||value===null||value==='')return 0;
  const x=Number(value);
  if(!Number.isSafeInteger(x)||x<0||x>60)throw issue(400,'INT9_REQUERIDOS_INVALIDOS',`${field}: requiere un entero de 0 a 60.`);
  return x;
}
async function simulacion(req){
  const q=req.query||{},type=shared.tipo(q.tipo);
  shared.scope(req);
  const teamId=q.id_ins_fl?shared.positive(q.id_ins_fl,'Equipo'):null;
  const team=teamId?await loadVisibleEquipment(req,teamId):null;
  const teamDates=team?shared.windowEquipo(type,team):null;
  const first=dateOptional(q.fecha_inicio,'fecha_inicio')||teamDates?.inicio||null;
  const last=dateOptional(q.fecha_fin,'fecha_fin')||teamDates?.fin||null;
  if(!first||!last)throw issue(400,'INT9_SIMULACION_SIN_FECHAS','Captura fechas o selecciona un equipo con fechas válidas.');
  validPlanningRange({desde:first,hasta:last});
  const required=type==='MONTADOR'
    ? {'Mecánico':requiredInteger(q.mecanicos,'Mecánicos'),'Ayudante':requiredInteger(q.ayudantes,'Ayudantes')}
    : {'Ajustador':requiredInteger(q.ajustadores,'Ajustadores')};
  if(!Object.values(required).some(n=>n>0))throw issue(400,'INT9_SIMULACION_SIN_PERSONAL','Indica al menos una persona requerida.');
  const people=await shared.fetchPeople(db,type,searchTerm(q.q));
  const assign=await shared.fetchAssignmentRows(db,type,people.map(x=>x.id_personal),req);
  const act=activityByPerson(assign),libres=[],ocupados=[],indeterminados=[];
  for(const p of people){
    const a=act.get(p.id_personal),inTeam=Boolean(team&&a?.fechadas.some(x=>Number(x.id_ins_fl)===Number(team.id_ins_fl)));
    const conflicting=(a?.fechadas||[]).filter(x=>
      (!team||Number(x.id_ins_fl)!==Number(team.id_ins_fl))&&shared.intersect(x.inicio,x.fin,first,last));
    const uncertain=Boolean(a?.sin_fecha);
    const base={...p,ya_asignado:inTeam};
    if(conflicting.length){
      const end=conflicting.reduce((mx,x)=>x.fin>mx?x.fin:mx,'0000-00-00');
      ocupados.push({...base,ocupado_hasta:end,libre_desde:shared.addDays(end,1),
        ocupado_en:conflicting.map(shared.redact)});
    }else if(uncertain)indeterminados.push({...base,motivo:'Asignación sin fechas válidas. Disponibilidad no comprobable.'});
    else if(inTeam)ocupados.push({...base,ya_asignado:true,ocupado_en:[],motivo:'Ya asignado al equipo seleccionado.'});
    else libres.push(base);
  }
  const resumen=Object.entries(required).filter(([,n])=>n>0).map(([group,n])=>{
    const available=libres.filter(p=>type==='AJUSTADOR'||p.puesto===group).length;
    return{grupo:group,requeridos:n,libres:available,faltantes:Math.max(0,n-available)};
  });
  return{tipo:type,fase:type==='MONTADOR'?'montaje':'ajuste',ventana:{inicio:first,fin:last,dias:shared.inclusiveDays(first,last),
    desde_reporte:Boolean(teamDates?.valida&&first===teamDates.inicio&&last===teamDates.fin),fuente_fin:teamDates?.fuente_fin||null},
    equipo:team?{id_ins_fl:Number(team.id_ins_fl),proyecto:team.proyecto||team.id_proyecto,equipo:team.referencia_sitio}:null,
    libres,ocupados,indeterminados,requeridos:required,resumen,viable:resumen.every(x=>x.faltantes===0),
    advertencia:'Simulación teórica, NO reserva ni registra personal. Asignaciones sin fecha se clasifican indeterminadas.'};
}

module.exports={historial,disponibilidad,simulacion,
  _test:{projectedDays,periods,activityByPerson,summarizePeriod,historyRange,validPlanningRange}};

'use strict';
// INT9 04-M / Montadores. Vincula proyecto e iniciales a UN contratista.
// Nunca asigna personas automáticamente; Ajustadores 06-A permanece separado.
const db=require('../../config/db');
// Lazy require: el servicio de asignaciones también importa este motor.
const assignments=()=>require('./instalaciones-programacion-personal.asignaciones.service');
const TABLE='instalaciones_programacion_contratistas_fl';
const MAX_CANDIDATOS=1000;
const MAX_RELACIONES=5000;
const RELEVANT_FIELDS=Object.freeze(['estatus','activo','id_proyecto','proyecto',
  'referencia_sitio','subcontratista','fecha_inicio_montaje',
  'fecha_fin_montaje_real','fecha_fin_montaje_modificado','fecha_fin_montaje_planeado']);
const FIELDS=`f.id_ins_fl,f.id_proyecto,f.proyecto,f.referencia_sitio,f.estatus,f.activo,
  f.subcontratista,f.fecha_inicio_montaje,f.fecha_fin_montaje_real,
  f.fecha_fin_montaje_modificado,f.fecha_fin_montaje_planeado`;

function failure(statusCode,code,message){
  return Object.assign(new Error(message),{statusCode,code});
}
function normalize(v){
  return String(v??'').normalize('NFKC').normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toUpperCase();
}
function code(v){
  const n=normalize(v);
  return n && !['-','.','N/A','NA','FALTA','FALTANTE','PENDIENTE','SIN DATO','S/D'].includes(n)
    && n.length<=30 ? n : null;
}
function identity(rows,iniciales){
  const matches=rows.filter(row=>code(row.iniciales)===iniciales && Number(row.activo)===1);
  const group=new Map();
  for(const row of matches){
    const key=normalize(row.contratista);
    if(!key)continue;
    if(!group.has(key))group.set(key,new Set());
    group.get(key).add(String(row.contratista).trim());
  }
  if(!group.size)return {estado:'SIN_CONTRATISTA_CATALOGO'};
  if(group.size!==1)return {estado:'INICIALES_AMBIGUAS'};
  const display=[...group.values()][0];
  return {estado:'IDENTIFICADO',contratista:[...display][0],personas:matches.length};
}
function evaluate(row,candidates=[]){
  if(!row||Number(row.activo)!==1||String(row.estatus??'').trim()!=='04-M')
    return {estado:'NO_ELEGIBLE',vinculable:false};
  const iniciales=code(row.subcontratista);
  if(!String(row.id_proyecto??'').trim())return {estado:'PROYECTO_SIN_ID',vinculable:false};
  if(!iniciales)return {estado:'SUBCONTRATISTA_SIN_INICIALES',vinculable:false};
  const window=assignments()._read.windowEquipo('MONTADOR',row);
  if(!window.valida)return {estado:'FECHAS_MONTAJE_INVALIDAS',vinculable:false,iniciales};
  const resolved=identity(candidates,iniciales);
  return {...resolved,vinculable:resolved.estado==='IDENTIFICADO',
    iniciales,inicio:window.inicio,fin:window.fin,fuente_fin:window.fuente_fin};
}
function sqlError(error){
  if(['ER_NO_SUCH_TABLE','ER_BAD_FIELD_ERROR'].includes(error?.code))
    throw failure(503,'INT9_MONTAJE_SQL_PENDIENTE',
      'Falta aplicar la tabla de relación 04-M o la columna iniciales en Aiven.');
  if(error?.code==='ER_DUP_ENTRY')
    throw failure(409,'INT9_MONTAJE_RELACION_CONCURRENTE',
      'La relación fue modificada simultáneamente; vuelve a consultar.');
  throw error;
}
async function readiness(){
  const [columns]=await db.query("SHOW COLUMNS FROM instalaciones_personal LIKE 'iniciales'");
  const [tables]=await db.query("SHOW TABLES LIKE 'instalaciones_programacion_contratistas_fl'");
  return {disponible:columns.length===1&&tables.length===1,
    columna_iniciales:columns.length===1,tabla_relacion:tables.length===1};
}
async function candidates(conn,iniciales){
  const [rows]=await conn.query(
    `SELECT id_personal,nombre,contratista,iniciales,activo FROM instalaciones_personal
      WHERE tipo_personal='MONTADOR' AND activo=1 AND TRIM(iniciales)=?
      ORDER BY id_personal ASC LIMIT ${MAX_CANDIDATOS+1}`,[iniciales]);
  if(rows.length>MAX_CANDIDATOS)throw failure(422,'INT9_MONTAJE_CATALOGO_EXCESIVO',
    'Demasiados montadores con las mismas iniciales; revisar catálogo.');
  return rows;
}
async function reconcile(idValue,{tecnico=false,actorId=null,access=null}={}){
  const id=Number(idValue);
  if(!Number.isSafeInteger(id)||id<1)throw failure(400,'INT9_MONTAJE_ID_INVALIDO','ID de equipo inválido.');
  if(!tecnico&&!access)throw failure(403,'INT9_MONTAJE_ALCANCE_REQUERIDO','Falta alcance CORELLIAN.');
  if(tecnico&&actorId!==null)throw failure(403,'INT9_MONTAJE_ACTOR_TECNICO','No se permite suplantar usuarios.');
  const conn=await db.getConnection();
  try{
    await conn.beginTransaction();
    const [found]=await conn.query(
      `SELECT ${FIELDS} FROM ins_fl f WHERE f.id_ins_fl=?
       ${access?'AND ('+access.sql+')':''} LIMIT 1 FOR UPDATE`,
      [id,...(access?.params||[])]);
    if(!found.length){await conn.rollback();return {id_ins_fl:id,estado:'NO_DISPONIBLE',creadas:0,historicas:0};}
    const row=found[0];
    const [current]=await conn.query(
      `SELECT id_relacion,id_proyecto,iniciales,contratista FROM ${TABLE}
       WHERE id_ins_fl=? AND activo=1 FOR UPDATE`,[id]);
    if(current.length>1)throw failure(409,'INT9_MONTAJE_RELACIONES_DUPLICADAS',
      'Existen relaciones activas conflictivas.');
    const ref=current[0]||null;
    const initial=evaluate(row);
    const candidatesRows=initial.estado==='FECHAS_MONTAJE_INVALIDAS'||initial.estado==='NO_ELEGIBLE'
      ?[]:initial.iniciales?await candidates(conn,initial.iniciales):[];
    const target=evaluate(row,candidatesRows);
    if(target.vinculable&&ref&&
      normalize(ref.id_proyecto)===normalize(row.id_proyecto)&&
      code(ref.iniciales)===target.iniciales&&normalize(ref.contratista)===normalize(target.contratista)){
      await conn.rollback();
      return {id_ins_fl:id,estado:'SIN_CAMBIOS',creadas:0,historicas:0,contratista:ref.contratista};
    }
    let historicas=0;
    if(ref){
      await conn.query(`UPDATE ${TABLE} SET activo=0,es_historico=1,updated_by=?
        WHERE id_relacion=? AND activo=1`,[actorId,ref.id_relacion]);
      historicas=1;
    }
    let creadas=0;
    if(target.vinculable){
      await conn.query(
        `INSERT INTO ${TABLE}
         (id_ins_fl,id_proyecto,iniciales,contratista,activo,es_historico,created_by,updated_by)
         VALUES (?,?,?,?,1,0,?,?)`,
        [id,String(row.id_proyecto).trim(),target.iniciales,target.contratista,actorId,actorId]);
      creadas=1;
    }
    await conn.commit();
    return {id_ins_fl:id,estado:target.vinculable?'VINCULADO':
      target.estado==='NO_ELEGIBLE'?'NO_ELEGIBLE':'REQUIERE_REVISION',
      motivo:target.vinculable?null:target.estado,creadas,historicas,
      ...(target.vinculable?{contratista:target.contratista,iniciales:target.iniciales}:{})};
  }catch(error){
    await conn.rollback().catch(()=>{});
    sqlError(error);
  }finally{conn.release();}
}
async function notifySaved(id,fields){
  if(!Array.isArray(fields)||!fields.some(field=>RELEVANT_FIELDS.includes(field)))return null;
  try{return await reconcile(id,{tecnico:true,actorId:null});}
  catch(error){
    console.error('[INT9_MONTAJE_NOTIFY]',JSON.stringify({
      id_ins_fl:Number(id),code:String(error?.code||'ERROR')}));
    return {estado:'REQUIERE_ATENCION',code:String(error?.code||'ERROR')};
  }
}
// Solo crea asignaciones MANUALES después de comprobar la relación vigente.
async function validarAsignacion(conn,equipo,personas){
  if(String(equipo?.estatus??'').trim()!=='04-M')
    throw failure(409,'INT9_MONTAJE_ESTATUS_INVALIDO','El equipo no está en montaje 04-M.');
  const [links]=await conn.query(
    `SELECT id_proyecto,iniciales,contratista FROM ${TABLE}
       WHERE id_ins_fl=? AND activo=1 LIMIT 2 FOR UPDATE`,[equipo.id_ins_fl]);
  if(links.length!==1)throw failure(409,'INT9_MONTAJE_SIN_RELACION',
    'El equipo no tiene una relación única y activa con su contratista.');
  const link=links[0];
  if(normalize(equipo.id_proyecto)!==normalize(link.id_proyecto)||
     code(equipo.subcontratista)!==code(link.iniciales))
    throw failure(409,'INT9_MONTAJE_RELACION_DESACTUALIZADA',
      'El proyecto o las iniciales cambiaron en FL; conciliar antes de asignar.');
  const invalid=personas.some(p=>code(p.iniciales)!==code(link.iniciales)||
    normalize(p.contratista)!==normalize(link.contratista));
  if(invalid)throw failure(409,'INT9_MONTAJE_PERSONA_OTRO_CONTRATISTA',
    'Solo pueden asignarse montadores del contratista relacionado por iniciales.');
  return link;
}
async function relaciones(req){
  const scope=assignments()._read.scope(req);
  const query=req.query||{};
  const desde=assignments()._read.manualDate(query.desde,'desde');
  const hasta=assignments()._read.manualDate(query.hasta,'hasta');
  if(!desde||!hasta||hasta<desde)throw failure(400,'INT9_MONTAJE_RANGO_INVALIDO',
    'Indica fechas desde y hasta válidas.');
  const [rows]=await db.query(
    `SELECT r.id_relacion,r.id_ins_fl,r.id_proyecto,r.iniciales,r.contratista,
       f.proyecto,f.referencia_sitio,f.estatus,f.fecha_inicio_montaje,
       f.fecha_fin_montaje_real,f.fecha_fin_montaje_modificado,f.fecha_fin_montaje_planeado
       FROM ${TABLE} r JOIN ins_fl f ON f.id_ins_fl=r.id_ins_fl
       WHERE r.activo=1 AND f.activo=1 AND TRIM(f.estatus)='04-M'
         AND (${scope.sql})
       ORDER BY r.id_ins_fl ASC LIMIT ${MAX_RELACIONES+1}`,scope.params);
  if(rows.length>MAX_RELACIONES)throw failure(422,'INT9_MONTAJE_RELACIONES_EXCESIVAS',
    'La consulta supera el límite seguro; filtrar por alcance.');
  const result=rows.map(row=>{
    const window=assignments()._read.windowEquipo('MONTADOR',row);
    return {id_relacion:Number(row.id_relacion),id_ins_fl:Number(row.id_ins_fl),
      id_proyecto:row.id_proyecto,proyecto:row.proyecto||row.id_proyecto,
      equipo:row.referencia_sitio||'',contratista:row.contratista,
      iniciales:row.iniciales,inicio:window.inicio,fin:window.fin,
      fuente_fin:window.fuente_fin,valida:window.valida,dias:window.dias};
  }).filter(row=>row.valida&&assignments()._read.intersect(row.inicio,row.fin,desde,hasta));
  return {relaciones:result,total:result.length,desde,hasta};
}
module.exports={reconcile,notifySaved,validarAsignacion,relaciones,readiness,RELEVANT_FIELDS,
  _test:{normalize,code,identity,evaluate}};

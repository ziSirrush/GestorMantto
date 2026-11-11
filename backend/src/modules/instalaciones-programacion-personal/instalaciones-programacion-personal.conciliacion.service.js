'use strict';

// INT9 - Fuente oficial: ins_fl. Automatico azul y manual naranja son independientes.
// Un UPDATE por persona/equipo/origen, aun cuando la barra azul pase a historico.
const db=require('../../config/db');
const assignments=require('./instalaciones-programacion-personal.asignaciones.service');
const refs=require('./instalaciones-programacion-personal.ajustadores.service')._shared;
const AUTO='AUTOMATICA_FL';
const TYPE='AJUSTADOR';
const FIELDS=`id_ins_fl,estatus,activo,ajustador,fecha_inicio_ajuste,fecha_fin_ajuste_real,
  fecha_fin_ajuste_modificado,fecha_fin_ajuste_planeado`;

async function equipment(executor,id,lock=false,access=null){
  const condition=access?` AND (${access.sql})`:'';
  const [rows]=await executor.query(
    `SELECT ${FIELDS} FROM ins_fl f WHERE f.id_ins_fl=?${condition} LIMIT 1${lock?' FOR UPDATE':''}`,
    [id,...(access?.params||[])]);
  return rows[0]||null;
}
async function autoRows(executor,id){
  const [rows]=await executor.query(
    `SELECT a.id_asignacion,a.id_personal,a.fecha_desde,a.fecha_hasta,a.origen,a.es_historico
       FROM instalaciones_programacion_asignaciones a
       JOIN instalaciones_personal p ON p.id_personal=a.id_personal
      WHERE a.id_ins_fl=? AND a.activo=1 AND p.tipo_personal='AJUSTADOR'
      ORDER BY a.id_personal,a.id_asignacion`,[id]);
  return rows;
}
function eligible(row){
  return Boolean(row&&Number(row.activo)===1&&String(row.estatus??'').trim()==='06-A');
}
function signature(x){
  return JSON.stringify([x.estatus,x.activo,x.ajustador,x.fecha_inicio_ajuste,
    x.fecha_fin_ajuste_real,x.fecha_fin_ajuste_modificado,x.fecha_fin_ajuste_planeado]);
}
function result(id,estado,extras={}){
  return {id_ins_fl:id,estado,creadas:0,actualizadas:0,historicas:0,retiradas:0,
    existentes:0,conflictos:[],...extras};
}
async function reconciliarEquipo(idValue,{actorId=null,access=null,tecnico=false}={}){
  const id=Number(idValue);
  if(!Number.isSafeInteger(id)||id<1)throw refs.fallo(400,'INT9_ID_INVALIDO','Equipo invalido.');
  if(!tecnico&&!access)throw refs.fallo(403,'INT9_ALCANCE_REQUERIDO','Se requiere alcance CORELLIAN.');
  if(tecnico&&actorId!==null)throw refs.fallo(403,'INT9_IDENTIDAD_TECNICA','No se permite suplantar usuarios.');

  const preliminary=await equipment(db,id,false,access);
  if(!preliminary)return result(id,'REQUIERE_REVISION',{motivo:'EQUIPO_NO_DISPONIBLE'});
  let index=null, initial=null;
  if(eligible(preliminary)){
    const [people]=await db.query(
      `SELECT id_personal,nombre FROM instalaciones_personal
        WHERE activo=1 AND tipo_personal='AJUSTADOR' ORDER BY id_personal
        LIMIT ${refs.MAX_AJUSTADORES_CATALOGO+1}`);
    if(people.length>refs.MAX_AJUSTADORES_CATALOGO)
      return result(id,'REQUIERE_REVISION',{motivo:'CATALOGO_EXCESIVO'});
    index=refs.indicePersonal(people);
    initial=refs.presentarEquipo(preliminary,index);
    if(initial.estado!=='VINCULABLE')
      return result(id,'REQUIERE_REVISION',{motivo:initial.estado});
  }
  const before=await autoRows(db,id);
  const targets=initial?initial.personas.map(p=>p.id_personal):[];
  const lockIds=[...new Set([...before.map(x=>Number(x.id_personal)),...targets])].sort((a,b)=>a-b);
  const conn=await db.getConnection();
  let open=false;
  try{
    await conn.beginTransaction();open=true;
    if(lockIds.length){
      const [locked]=await conn.query(
        `SELECT id_personal,activo FROM instalaciones_personal
          WHERE tipo_personal='AJUSTADOR'
            AND id_personal IN (${lockIds.map(()=>'?').join(',')})
          ORDER BY id_personal FOR UPDATE`,lockIds);
      if(locked.length!==lockIds.length||targets.some(id=>Number(locked.find(p=>Number(p.id_personal)===id)?.activo)!==1))
        throw refs.fallo(409,'INT9_PERSONAL_CAMBIO','El catalogo cambio durante conciliacion.');
    }
    const row=await equipment(conn,id,true,access);
    if(!row||signature(row)!==signature(preliminary))
      throw refs.fallo(409,'INT9_FL_CAMBIO','El equipo cambio durante conciliacion.');
    const current=await autoRows(conn,id);
    const fingerprint=list=>JSON.stringify(list.map(x=>[
      Number(x.id_asignacion),Number(x.id_personal),x.origen,Number(x.es_historico),
      String(x.fecha_desde||''),String(x.fecha_hasta||'')]));
    if(fingerprint(before)!==fingerprint(current))
      throw refs.fallo(409,'INT9_ASIGNACION_CAMBIO','Las asignaciones cambiaron durante conciliacion.');

    const isEligible=eligible(row);
    const updated=isEligible?refs.presentarEquipo(row,index):null;
    if(isEligible && (updated.estado!=='VINCULABLE'||
      JSON.stringify(updated.personas.map(x=>x.id_personal).sort())!==JSON.stringify([...targets].sort())))
      throw refs.fallo(409,'INT9_IDENTIDAD_CAMBIO','Ajustador no estable durante conciliacion.');
    const autos=current.filter(x=>x.origen===AUTO);
    const desired=new Set(isEligible?targets:[]);
    let creadas=0,actualizadas=0,historicas=0;
    for(const a of autos){
      if(desired.has(Number(a.id_personal))){
        const start=assignments._read.parseDate(a.fecha_desde);
        const end=assignments._read.parseDate(a.fecha_hasta);
        if(start!==updated.inicio||end!==updated.fin||Number(a.es_historico)!==0){
          await conn.execute(
            `UPDATE instalaciones_programacion_asignaciones
                SET fecha_desde=?,fecha_hasta=?,es_historico=0,updated_by=?
              WHERE id_asignacion=? AND origen='AUTOMATICA_FL' AND activo=1`,
            [updated.inicio,updated.fin,actorId,a.id_asignacion]);
          actualizadas++;
        }
      }else if(Number(a.es_historico)!==1){
        const fallback=assignments._read.windowEquipo(TYPE,row);
        await conn.execute(
          `UPDATE instalaciones_programacion_asignaciones
              SET fecha_desde=COALESCE(fecha_desde,?),
                  fecha_hasta=COALESCE(fecha_hasta,?),
                  es_historico=1,updated_by=?
            WHERE id_asignacion=? AND origen='AUTOMATICA_FL' AND activo=1`,
          [fallback.valida?fallback.inicio:null,fallback.valida?fallback.fin:null,
            actorId,a.id_asignacion]);
        historicas++;
      }
    }
    const known=new Set(autos.map(x=>Number(x.id_personal)));
    for(const pid of desired){
      if(known.has(pid))continue;
      await conn.execute(
        `INSERT INTO instalaciones_programacion_asignaciones
          (id_personal,id_ins_fl,origen,es_historico,fecha_desde,fecha_hasta,notas,
           activo,created_by,updated_by)
         VALUES(?,?,'AUTOMATICA_FL',0,?,?,?,1,?,?)`,
        [pid,id,updated.inicio,updated.fin,refs.NOTA_AUTO,actorId,actorId]);
      creadas++;
    }
    // El traslape automatico NO cancela la asignacion; se muestra una marca.
    const manual=current.filter(x=>x.origen==='MANUAL'&&Number(x.es_historico)!==1);
    const conflicts=isEligible&&manual.some(x=>{
      const w=assignments._read.windowAsignacion(TYPE,row,x);
      return w.valida&&assignments._read.intersect(w.inicio,w.fin,updated.inicio,updated.fin);
    })?[{motivo:'TRASLAPE_PROYECCION_MANUAL'}]:[];
    if(!creadas&&!actualizadas&&!historicas){
      await conn.rollback();open=false;
      return result(id,'SIN_CAMBIOS',{existentes:autos.length,conflictos:conflicts});
    }
    await conn.commit();open=false;
    return result(id,'SINCRONIZADO',{creadas,actualizadas,historicas,
      existentes:autos.length,conflictos:conflicts});
  }catch(error){
    if(open)await conn.rollback().catch(()=>{});
    if(error?.code==='ER_DUP_ENTRY')throw refs.fallo(409,'INT9_AUTO_DUPLICADO','Asignacion automatica duplicada.');
    throw error;
  }finally{conn.release();}
}
const RELEVANT_FIELDS=Object.freeze([
  'estatus','activo','ajustador','fecha_inicio_ajuste','fecha_fin_ajuste_real',
  'fecha_fin_ajuste_modificado','fecha_fin_ajuste_planeado'
]);
async function notifySaved(id,fields){
  if(!fields||!fields.some(f=>RELEVANT_FIELDS.includes(f)))return null;
  try{return await reconciliarEquipo(id,{tecnico:true,actorId:null});}
  catch(error){
    console.error('[INT9_POST_SAVE_RECONCILIACION]',JSON.stringify({
      id_ins_fl:id,code:error?.code||'ERROR'
    }));
    return {estado:'ERROR_PENDIENTE_CONCILIACION'};
  }
}
module.exports={reconciliarEquipo,notifySaved,eligible,RELEVANT_FIELDS};

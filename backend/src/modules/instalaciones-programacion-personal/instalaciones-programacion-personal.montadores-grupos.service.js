'use strict';
// INT9 04-M: consulta de equipo y guardado atomico por contratista.
// No toca las relaciones automaticas FL ni asignaciones de Ajustadores 06-A.
const crypto=require('node:crypto');
const db=require('../../config/db');
const asignaciones=require('./instalaciones-programacion-personal.asignaciones.service');
const MAX_EQUIPOS=25;
const MAX_PERSONAS=200;
const MAX_PERSONAL_CATALOGO=500;
const MAX_BLOQUEOS=650;
const MAX_OPERACIONES=250;
const MAX_ASIGNACIONES=800;

const fallo=(statusCode,code,message)=>Object.assign(new Error(message),{statusCode,code});
const positive=(v,nombre)=>{
  const n=Number(v);
  if(!Number.isSafeInteger(n)||n<1)throw fallo(400,'INT9_GRUPO_ID_INVALIDO',nombre+' invalido.');
  return n;
};
const normal=v=>String(v??'').normalize('NFKC').normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toUpperCase();
const codigo=v=>normal(v);
const placeholders=n=>Array.from({length:n},()=>'?').join(',');
const rol=v=>v==='Mecánico'||v==='Ayudante';
const propio=(persona,relacion)=>persona?.tipo_personal==='MONTADOR'&&
  Number(persona.activo)===1&&rol(persona.puesto)&&
  normal(persona.contratista)===normal(relacion.contratista)&&
  codigo(persona.iniciales)===codigo(relacion.iniciales);
const fecha=v=>asignaciones._read.parseDate(v);

function snapshot(rows,relacion){
  const list=rows.filter(a=>a.origen==='MANUAL').map(a=>[
    Number(a.id_asignacion),Number(a.id_personal),fecha(a.fecha_desde),
    fecha(a.fecha_hasta),String(a.notas||'')
  ]).sort((a,b)=>a[0]-b[0]);
  return crypto.createHash('sha256')
    .update(JSON.stringify([Number(relacion.id_relacion),list]))
    .digest('hex');
}
function resumenPersona(p){
  return {id_personal:Number(p.id_personal),nombre:p.nombre||'',
    puesto:p.puesto||'',contratista:p.contratista||'',iniciales:p.iniciales||''};
}
async function equipoRel(conn,req,id,lock=false){
  const sc=asignaciones._read.scope(req);
  const [rows]=await conn.query(
    `SELECT r.id_relacion,r.id_proyecto AS id_proyecto_rel,
       r.contratista,r.iniciales,f.id_ins_fl,f.id_proyecto,
       f.proyecto,f.referencia_sitio,f.estatus,f.subcontratista,
       f.fecha_inicio_montaje,f.fecha_fin_montaje_real,
       f.fecha_fin_montaje_modificado,f.fecha_fin_montaje_planeado
     FROM ins_fl f
     JOIN instalaciones_programacion_contratistas_fl r
       ON r.id_ins_fl=f.id_ins_fl AND r.activo=1
     WHERE f.id_ins_fl=? AND f.activo=1 AND TRIM(f.estatus)='04-M'
       AND (${sc.sql})
     ORDER BY r.id_relacion LIMIT 2${lock?' FOR UPDATE':''}`,
    [id,...sc.params]);
  if(!rows.length)throw fallo(404,'INT9_GRUPO_EQUIPO_NO_DISPONIBLE',
    'Equipo 04-M no encontrado, sin relacion o fuera de alcance.');
  if(rows.length!==1)throw fallo(409,'INT9_GRUPO_RELACION_AMBIGUA',
    'El equipo tiene mas de una relacion activa.');
  const row=rows[0];
  if(normal(row.id_proyecto)!==normal(row.id_proyecto_rel)||
     codigo(row.subcontratista)!==codigo(row.iniciales))
    throw fallo(409,'INT9_GRUPO_RELACION_DESACTUALIZADA',
      'Las iniciales o proyecto de FL cambiaron; primero conciliar 04-M.');
  const ventana=asignaciones._read.windowEquipo('MONTADOR',row);
  return {...row,ventana};
}
async function personalElegible(conn,relacion){
  const [rows]=await conn.query(
    `SELECT id_personal,tipo_personal,nombre,puesto,contratista,iniciales,activo
     FROM instalaciones_personal
     WHERE activo=1 AND tipo_personal='MONTADOR'
       AND UPPER(TRIM(iniciales))=UPPER(TRIM(?))
       AND UPPER(TRIM(contratista))=UPPER(TRIM(?))
     ORDER BY puesto,nombre,id_personal LIMIT ${MAX_PERSONAL_CATALOGO+1}`,
    [relacion.iniciales,relacion.contratista]);
  if(rows.length>MAX_PERSONAL_CATALOGO)
    throw fallo(422,'INT9_GRUPO_CATALOGO_EXCESIVO','Demasiado personal del contratista.');
  return rows.filter(p=>propio(p,relacion));
}
async function filasAsignadas(conn,id,lock=false){
  const [rows]=await conn.query(
    `SELECT a.id_asignacion,a.id_ins_fl,a.id_personal,a.fecha_desde,a.fecha_hasta,
       a.notas,a.origen,p.nombre,p.puesto,p.contratista,p.iniciales,p.activo,p.tipo_personal
     FROM instalaciones_programacion_asignaciones a
     JOIN instalaciones_personal p ON p.id_personal=a.id_personal
     WHERE a.id_ins_fl=? AND a.activo=1 AND a.es_historico=0
       AND p.tipo_personal='MONTADOR'
     ORDER BY a.id_asignacion LIMIT ${MAX_ASIGNACIONES+1}${lock?' FOR UPDATE':''}`,[id]);
  if(rows.length>MAX_ASIGNACIONES)
    throw fallo(422,'INT9_GRUPO_ASIGNACIONES_EXCESIVAS','Demasiadas asignaciones para un equipo.');
  return rows;
}
function serializarDetalle(equipo,rows,candidatos){
  const asignadas=rows.filter(a=>a.origen==='MANUAL'&&propio(a,equipo));
  return {
    relacion:{id_relacion:Number(equipo.id_relacion),id_ins_fl:Number(equipo.id_ins_fl),
      contratista:equipo.contratista,iniciales:equipo.iniciales,
      id_proyecto:equipo.id_proyecto,proyecto:equipo.proyecto||equipo.id_proyecto,
      equipo:equipo.referencia_sitio||'',inicio:equipo.ventana.inicio,
      fin:equipo.ventana.fin,fuente_fin:equipo.ventana.fuente_fin,
      fechas_validas:equipo.ventana.valida},
    personal:candidatos.map(resumenPersona),
    asignaciones:asignadas.map(a=>({
      id_asignacion:Number(a.id_asignacion),id_personal:Number(a.id_personal),
      nombre:a.nombre,puesto:a.puesto,fecha_desde:fecha(a.fecha_desde),
      fecha_hasta:fecha(a.fecha_hasta)})),
    // Los historicos/ajustadores y asignaciones ajenas no pueden ser editados aqui.
    otras_asignaciones:rows.filter(a=>a.origen!=='MANUAL'||!propio(a,equipo))
      .map(a=>({id_asignacion:Number(a.id_asignacion),
        nombre:a.nombre,puesto:a.puesto,origen:a.origen})),
    revision:snapshot(rows,equipo)
  };
}
async function detalle(req){
  const id=positive(req.params?.id,'Equipo');
  const equipo=await equipoRel(db,req,id);
  const [filas,candidatos]=await Promise.all([
    filasAsignadas(db,id),personalElegible(db,equipo)
  ]);
  return serializarDetalle(equipo,filas,candidatos);
}
function validarCuerpo(body){
  if(!body||typeof body!=='object'||Array.isArray(body)||
     Object.keys(body).some(k=>!['contratista','cambios'].includes(k)))
    throw fallo(400,'INT9_GRUPO_CUERPO_INVALIDO','Cuerpo de guardado invalido.');
  const contratista=String(body.contratista||'').trim();
  if(!contratista||contratista.length>160)
    throw fallo(400,'INT9_GRUPO_CONTRATISTA_INVALIDO','Contratista invalido.');
  const cambios=body.cambios;
  if(!Array.isArray(cambios)||!cambios.length||cambios.length>MAX_EQUIPOS)
    throw fallo(400,'INT9_GRUPO_EQUIPOS_INVALIDOS',
      `Selecciona entre 1 y ${MAX_EQUIPOS} equipos por guardado.`);
  const ids=new Set();
  const parsed=cambios.map(row=>{
    if(!row||Array.isArray(row)||typeof row!=='object'||
       Object.keys(row).some(k=>!['id_ins_fl','ids_personal','revision'].includes(k)))
      throw fallo(400,'INT9_GRUPO_CAMBIO_INVALIDO','Equipo de guardado invalido.');
    const id=positive(row.id_ins_fl,'Equipo');
    if(ids.has(id))throw fallo(400,'INT9_GRUPO_EQUIPO_DUPLICADO','El equipo se repite.');
    ids.add(id);
    if(!Array.isArray(row.ids_personal)||row.ids_personal.length>MAX_PERSONAS)
      throw fallo(400,'INT9_GRUPO_PERSONAL_INVALIDO',
        'Supera el limite seguro de personal por equipo.');
    const personas=row.ids_personal.map(x=>positive(x,'Persona'));
    if(new Set(personas).size!==personas.length)
      throw fallo(400,'INT9_GRUPO_PERSONA_DUPLICADA','Persona duplicada en un equipo.');
    if(typeof row.revision!=='string'||!/^[a-f0-9]{64}$/i.test(row.revision))
      throw fallo(400,'INT9_GRUPO_REVISION_INVALIDA','Vuelve a abrir el detalle del equipo.');
    return {id_ins_fl:id,ids_personal:personas.sort((a,b)=>a-b),revision:row.revision};
  }).sort((a,b)=>a.id_ins_fl-b.id_ins_fl);
  return {contratista,cambios:parsed};
}
function actor(req){
  const id=Number(req?.user?.id_SB||req?.user?.id||0);
  if(!Number.isSafeInteger(id)||id<1)
    throw fallo(401,'INT9_GRUPO_SESION_INVALIDA','Sesion de usuario requerida.');
  return id;
}
async function guardar(req){
  const body=validarCuerpo(req.body);
  const actorId=actor(req);
  const idsEquipos=body.cambios.map(c=>c.id_ins_fl);
  const conn=await db.getConnection();
  let started=false;
  try{
    await conn.beginTransaction();started=true;
    // Primero bloquear TODAS las personas, luego equipos y relaciones.
    // Conserva el orden del servicio de asignaciones manuales existente.
    const [previas]=await conn.query(
      `SELECT DISTINCT id_personal FROM instalaciones_programacion_asignaciones
       WHERE id_ins_fl IN (${placeholders(idsEquipos.length)})
         AND origen='MANUAL' AND activo=1 AND es_historico=0`,
      idsEquipos);
    const idsPersonas=[...new Set([
      ...previas.map(x=>Number(x.id_personal)),
      ...body.cambios.flatMap(c=>c.ids_personal)
    ])].sort((a,b)=>a-b);
    if(idsPersonas.length>MAX_BLOQUEOS)
      throw fallo(422,'INT9_GRUPO_LOTE_EXCESIVO','Demasiadas personas para un solo guardado.');
    let personas=[];
    if(idsPersonas.length){
      [personas]=await conn.query(
        `SELECT id_personal,tipo_personal,nombre,puesto,contratista,iniciales,activo
         FROM instalaciones_personal WHERE id_personal IN
         (${placeholders(idsPersonas.length)}) ORDER BY id_personal FOR UPDATE`,
        idsPersonas);
    }
    const byPerson=new Map(personas.map(p=>[Number(p.id_personal),p]));
    const resultItems=[];
    const remove=new Set();
    const additions=[];
    for(const change of body.cambios){
      const equipo=await equipoRel(conn,req,change.id_ins_fl,true);
      if(normal(equipo.contratista)!==normal(body.contratista))
        throw fallo(409,'INT9_GRUPO_CONTRATISTA_CAMBIO',
          'El equipo ya no pertenece al contratista seleccionado.');
      const current=await filasAsignadas(conn,change.id_ins_fl,true);
      if(snapshot(current,equipo)!==change.revision)
        throw fallo(409,'INT9_GRUPO_CAMBIOS_CONCURRENTES',
          'Otro usuario modifico la agrupacion. Actualiza el calendario y vuelve a seleccionar.');
      const currentByPerson=new Map();
      for(const a of current.filter(x=>x.origen==='MANUAL')){
        const pid=Number(a.id_personal);
        if(currentByPerson.has(pid))
          throw fallo(409,'INT9_GRUPO_ASIGNACIONES_REPETIDAS',
            'Existen duplicados manuales que requieren revision.');
        currentByPerson.set(pid,a);
      }
      const requested=new Set(change.ids_personal);
      for(const id of requested){
        const person=byPerson.get(id);
        if(!propio(person,equipo))
          throw fallo(409,'INT9_GRUPO_PERSONA_OTRO_CONTRATISTA',
            'Solo se permite personal activo con iniciales y puesto del contratista.');
      }
      for(const a of current){
        if(a.origen==='MANUAL'&&propio(a,equipo)&&!requested.has(Number(a.id_personal)))
          remove.add(Number(a.id_asignacion));
      }
      for(const id of requested){
        if(currentByPerson.has(id))continue;
        if(!equipo.ventana.valida)
          throw fallo(409,'INT9_GRUPO_FECHAS_INVALIDAS',
            'No hay fechas de montaje validas para nuevas asignaciones.');
        additions.push({id_personal:id,id_ins_fl:change.id_ins_fl,
          inicio:equipo.ventana.inicio,fin:equipo.ventana.fin});
      }
      resultItems.push(change.id_ins_fl);
    }
    if(remove.size+additions.length>MAX_OPERACIONES)
      throw fallo(422,'INT9_GRUPO_OPERACIONES_EXCESIVAS',
        'Divide las modificaciones en varios guardados por contratista.');
    // Los conflictos consideran tambien ocupacion en equipos fuera de alcance,
    // pero el error no revela sus identidades ni proyectos.
    if(additions.length){
      const ids=[...new Set(additions.map(a=>a.id_personal))];
      const ocupacion=await asignaciones._read.fetchAssignmentRows(conn,'MONTADOR',ids,req);
      for(const add of additions){
        for(const ocupada of ocupacion){
          if(ocupada.id_personal!==add.id_personal||ocupada.es_historico||
             !ocupada.valida||remove.has(Number(ocupada.id_asignacion)))continue;
          if(asignaciones._read.intersect(add.inicio,add.fin,ocupada.inicio,ocupada.fin))
            throw fallo(409,'INT9_GRUPO_TRASLAPE',
              'Un montador ya tiene otra asignacion en esas fechas. Revisa su disponibilidad.');
        }
      }
      for(let i=0;i<additions.length;i++)for(let j=i+1;j<additions.length;j++){
        const a=additions[i],b=additions[j];
        if(a.id_personal===b.id_personal&&
           asignaciones._read.intersect(a.inicio,a.fin,b.inicio,b.fin))
          throw fallo(409,'INT9_GRUPO_TRASLAPE_INTERNO',
            'No puedes asignar a la misma persona en equipos con fechas superpuestas.');
      }
    }
    for(const id of [...remove].sort((a,b)=>a-b)){
      const [updated]=await conn.execute(
        `UPDATE instalaciones_programacion_asignaciones
         SET activo=0,updated_by=?
         WHERE id_asignacion=? AND origen='MANUAL' AND activo=1 AND es_historico=0`,
        [actorId,id]);
      if(updated.affectedRows!==1)
        throw fallo(409,'INT9_GRUPO_CONCURRENCIA_BAJA',
          'Una asignacion fue modificada durante el guardado.');
    }
    for(const add of additions){
      await conn.execute(
        `INSERT INTO instalaciones_programacion_asignaciones
         (id_personal,id_ins_fl,fecha_desde,fecha_hasta,notas,origen,
          es_historico,activo,created_by,updated_by)
         VALUES (?,?,?, ?,NULL,'MANUAL',0,1,?,?)`,
        [add.id_personal,add.id_ins_fl,add.inicio,add.fin,actorId,actorId]);
    }
    await conn.commit();started=false;
    return {contratista:body.contratista,equipos:resultItems.length,
      creadas:additions.length,retiradas:remove.size,
      mensaje:'Agrupacion guardada. Las relaciones automaticas de FL no se modificaron.'};
  }catch(ex){
    if(started)await conn.rollback().catch(()=>{});
    if(ex.code==='ER_DUP_ENTRY')
      throw fallo(409,'INT9_GRUPO_ASIGNACION_DUPLICADA',
        'La persona ya fue asignada por otra operacion. Actualiza el calendario.');
    throw ex;
  }finally{conn.release();}
}
module.exports={detalle,guardar,_test:{normal,codigo,propio,snapshot,validarCuerpo,serializarDetalle}};

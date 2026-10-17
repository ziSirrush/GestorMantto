'use strict';

// [Mantto Gestor | 2026-10-16 | INT9-F2 | CALENDARIO Y ASIGNACIONES AIVEN MYSQL V001]
// La programacion usa ins_fl (equipos reales) y el catalogo unificado de Fase 1.
// El Guard CORELLIAN de las rutas resuelve permiso, puerta y alcance.
// Para operaciones de un equipo se vuelve a verificar el alcance a nivel registro.
// La ocupacion de una persona puede considerar equipos fuera del alcance:
// se devuelven fechas y disponibilidad, NUNCA identificadores/detalles de esos equipos.
const db = require('../../config/db');
const recordScope = require('../../services/information-record-scope-gnral.service');

const TIPOS = Object.freeze(['MONTADOR', 'AJUSTADOR']);
const MAX_PERSONAS_ALTA = 60;
const MAX_CALENDARIO_DIAS = 100;
const MAX_CALENDARIO_PERSONAS = 1600;
const MAX_ASIGNACIONES_CONSULTA = 15000;
const MAX_EQUIPOS_CONSULTA = 2000;
const MAX_EQUIPOS_RESPUESTA = 250;

function error(statusCode, code, message) {
  const e = new Error(message);
  e.statusCode = statusCode;
  e.code = code;
  return e;
}
function positive(value, field) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1) throw error(400, 'INT9_ID_INVALIDO', `${field} debe ser un entero positivo.`);
  return n;
}
function tipo(value) {
  const s = String(value || '').trim().toUpperCase();
  if (s === 'MONTADOR' || s === 'MONTADORES') return 'MONTADOR';
  if (s === 'AJUSTADOR' || s === 'AJUSTADORES') return 'AJUSTADOR';
  throw error(400, 'INT9_TIPO_INVALIDO', 'Tipo de personal inválido.');
}
function asFlag(value) { return value === true || value === 1 || value === '1' || value === 'true'; }
function plainText(value, max, label = 'Texto') {
  const s = value === null || value === undefined ? '' : String(value).trim();
  if (s.length > max) throw error(400, 'INT9_TEXTO_LARGO', `${label} permite máximo ${max} caracteres.`);
  return s || null;
}
function parseDate(value) {
  if (value === null || value === undefined || value === '') return null;
  let source = value;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    source = `${value.getUTCFullYear()}-${String(value.getUTCMonth()+1).padStart(2,'0')}-${String(value.getUTCDate()).padStart(2,'0')}`;
  }
  const raw = String(source).trim();
  let y, m, d, match;
  if ((match = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/.exec(raw))) {
    y=+match[1]; m=+match[2]; d=+match[3];
  } else if ((match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw))) {
    d=+match[1]; m=+match[2]; y=+match[3];
  } else return null;
  const ts = new Date(Date.UTC(y,m-1,d));
  if (ts.getUTCFullYear() !== y || ts.getUTCMonth() !== m-1 || ts.getUTCDate() !== d) return null;
  return `${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}
function manualDate(value, field) {
  if (value == null || value === '') return null;
  const result = parseDate(value);
  if (!result || !/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    throw error(400,'INT9_FECHA_INVALIDA', `${field} debe tener formato AAAA-MM-DD válido.`);
  }
  return result;
}
function dayNumber(value) { return Math.floor(Date.parse(`${value}T00:00:00.000Z`)/86400000); }
function addDays(value, amount) { return new Date((dayNumber(value)+amount)*86400000).toISOString().slice(0,10); }
function inclusiveDays(a,b) { return dayNumber(b)-dayNumber(a)+1; }
function intersect(a,b,c,d) { return a<=d && b>=c; }
function mxToday() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone:'America/Mexico_City', year:'numeric',month:'2-digit',day:'2-digit'
  }).formatToParts(new Date());
  const obj=Object.fromEntries(parts.map(p=>[p.type,p.value]));
  return `${obj.year}-${obj.month}-${obj.day}`;
}
function windowEquipo(type, row) {
  const prefix = type === 'MONTADOR' ? 'montaje' : 'ajuste';
  const inicio = parseDate(row[`fecha_inicio_${prefix}`]);
  let fin=null,fuente_fin=null;
  for (const source of ['real','modificado','planeado']) {
    const date = parseDate(row[`fecha_fin_${prefix}_${source}`]);
    if (date) { fin=date; fuente_fin=source; break; }
  }
  const valida=Boolean(inicio && fin && fin >= inicio);
  return {inicio,fin,fuente_fin,dias:valida?inclusiveDays(inicio,fin):null,valida};
}
function windowAsignacion(type, equipo, asignacion) {
  const plan=windowEquipo(type,equipo);
  const desde=parseDate(asignacion.fecha_desde);
  const hasta=parseDate(asignacion.fecha_hasta);
  const inicio=desde||plan.inicio,fin=hasta||plan.fin;
  const valida=Boolean(inicio && fin && fin >= inicio);
  return {inicio,fin,dias:valida?inclusiveDays(inicio,fin):null,valida,
    fuente_fin:hasta?'manual':plan.fuente_fin,inicio_manual:Boolean(desde),fin_manual:Boolean(hasta)};
}
function range(query = {}) {
  const desde=manualDate(query.desde,'desde');
  const hasta=manualDate(query.hasta,'hasta');
  if (!desde || !hasta) throw error(400,'INT9_RANGO_OBLIGATORIO','Se requieren desde y hasta.');
  if (hasta < desde) throw error(400,'INT9_RANGO_INVALIDO','hasta debe ser igual o posterior a desde.');
  if (inclusiveDays(desde,hasta)>MAX_CALENDARIO_DIAS) {
    throw error(400,'INT9_RANGO_DEMASIADO_AMPLIO',`El calendario permite un máximo de ${MAX_CALENDARIO_DIAS} días.`);
  }
  return {desde,hasta};
}
function scope(req) {
  // NO delegar la seguridad al navegador ni al rol del usuario.
  if (!req?.informationAccess || req.informationAccess.empresa !== 'CORELLIAN') {
    throw error(403,'INT9_ALCANCE_NO_DISPONIBLE','No se pudo verificar el alcance CORELLIAN.');
  }
  return recordScope.buildInsFlScopeSql_gnral(req,'f');
}
function equipFields(prefix='f') {
  const a=prefix;
  return `${a}.id_ins_fl,${a}.proyecto,${a}.id_proyecto,${a}.referencia_sitio,${a}.estatus,
    ${a}.fecha_inicio_montaje,${a}.fecha_fin_montaje_planeado,${a}.fecha_fin_montaje_modificado,${a}.fecha_fin_montaje_real,
    ${a}.fecha_inicio_ajuste,${a}.fecha_fin_ajuste_planeado,${a}.fecha_fin_ajuste_modificado,${a}.fecha_fin_ajuste_real`;
}
function placeholders(n) { return Array.from({length:n},()=>'?').join(','); }
function personName(row) { return String(row.nombre || '').trim(); }
function normalizedPerson(row) {
  return {id_personal:Number(row.id_personal),tipo_personal:row.tipo_personal,nombre:personName(row),
    contratista:row.tipo_personal==='MONTADOR'?row.contratista:null,
    puesto:row.tipo_personal==='MONTADOR'?row.puesto:null,categoria:row.categoria||null,
    experiencia:row.tipo_personal==='AJUSTADOR'?row.experiencia:null,
    grupo:row.tipo_personal==='MONTADOR'?(row.puesto||'Sin puesto'):(row.categoria||'Sin categoría')};
}
async function fetchPeople(connection, type, query='', limit=MAX_CALENDARIO_PERSONAS) {
  const q=plainText(query,120,'Búsqueda');
  const params=[type];
  let extra='';
  if (q) {
    extra=` AND (p.nombre LIKE ? OR COALESCE(p.contratista,'') LIKE ? OR COALESCE(p.puesto,'') LIKE ? OR COALESCE(p.categoria,'') LIKE ? OR COALESCE(p.experiencia,'') LIKE ?)`;
    params.push(...Array.from({length:5},()=>`%${q}%`));
  }
  // Se devuelve error si se supera el máximo: nunca se oculta personal silenciosamente.
  const [rows]=await connection.query(
    `SELECT p.id_personal,p.tipo_personal,p.nombre,p.contratista,p.puesto,p.categoria,p.experiencia
       FROM instalaciones_personal p WHERE p.activo=1 AND p.tipo_personal=? ${extra}
       ORDER BY p.nombre,p.id_personal LIMIT ${limit+1}`,params);
  if (rows.length>limit) throw error(422,'INT9_MUCHAS_PERSONAS','Usa el buscador para reducir el calendario.');
  return rows.map(normalizedPerson);
}
async function fetchAssignmentRows(connection, type, personIds, req, opts={}) {
  if (Array.isArray(personIds) && !personIds.length) return [];
  const access=scope(req);
  const params=[...access.params,type];
  let personClause='';
  if (Array.isArray(personIds)) {
    personClause=` AND a.id_personal IN (${placeholders(personIds.length)})`;
    params.push(...personIds);
  }
  // CASE evalúa alcance por registro sin filtrar las ocupaciones ajenas.
  // Todo detalle externo se redacta antes de construir la respuesta.
  const [rows]=await connection.query(
    `SELECT a.id_asignacion,a.id_personal,a.id_ins_fl,a.fecha_desde,a.fecha_hasta,a.notas,
            ${equipFields()}, CASE WHEN (${access.sql}) THEN 1 ELSE 0 END AS visible
       FROM instalaciones_programacion_asignaciones a
       JOIN instalaciones_personal p ON p.id_personal=a.id_personal
       JOIN ins_fl f ON f.id_ins_fl=a.id_ins_fl AND f.activo=1
       WHERE a.activo=1 AND p.tipo_personal=? ${personClause}
       ORDER BY a.id_personal,a.id_asignacion LIMIT ${MAX_ASIGNACIONES_CONSULTA+1}`,params);
  if (rows.length>MAX_ASIGNACIONES_CONSULTA) {
    throw error(422,'INT9_DEMASIADAS_ASIGNACIONES','Consulta demasiado amplia; usa filtros de personal.');
  }
  return rows.map(row=>({
    ...row,
    id_asignacion:Number(row.id_asignacion),id_personal:Number(row.id_personal),id_ins_fl:Number(row.id_ins_fl),
    visible:Number(row.visible)===1,
    ...windowAsignacion(type,row,row)
  }));
}
function redact(row) {
  if (row.visible) {
    return {id_asignacion:row.id_asignacion,id_personal:row.id_personal,id_ins_fl:row.id_ins_fl,
      proyecto:row.proyecto||row.id_proyecto||'',id_proyecto:row.id_proyecto||null,equipo:row.referencia_sitio||'',
      estatus:row.estatus||null,notas:row.notas||null,
      fecha_desde:parseDate(row.fecha_desde),fecha_hasta:parseDate(row.fecha_hasta),
      inicio:row.inicio,fin:row.fin,dias:row.dias,valida:row.valida,fuente_fin:row.fuente_fin,
      inicio_manual:row.inicio_manual,fin_manual:row.fin_manual,visible:true};
  }
  // Alcances ajenos: solo ocupación por persona/fechas; no IDs de equipos/proyectos.
  return {id_asignacion:null,id_personal:row.id_personal,id_ins_fl:null,
    proyecto:null,id_proyecto:null,equipo:null,estatus:null,notas:null,fecha_desde:null,fecha_hasta:null,
    inicio:row.inicio,fin:row.fin,dias:row.dias,valida:row.valida,fuente_fin:null,
    inicio_manual:false,fin_manual:false,visible:false};
}
async function loadEquipo(connection, req, id, lock=false) {
  const sc=scope(req);
  const [rows]=await connection.query(
    `SELECT ${equipFields()} FROM ins_fl f
       WHERE f.id_ins_fl=? AND f.activo=1 AND (${sc.sql}) LIMIT 1${lock?' FOR UPDATE':''}`,
    [positive(id,'Equipo'),...sc.params]);
  if (!rows.length) throw error(404,'INT9_EQUIPO_NO_ENCONTRADO','Equipo no encontrado o fuera de alcance.');
  return rows[0];
}
function actor(req) {
  const id=Number(req?.user?.id_SB||req?.user?.id||0);
  if (!Number.isSafeInteger(id)||id<1) throw error(401,'INT9_SESION_INVALIDA','Sesión requerida.');
  return id;
}
async function equipos(req) {
  const type=tipo(req.query?.tipo);
  const access=scope(req);
  const q=plainText(req.query?.q||'',120,'Búsqueda');
  const params=[...access.params];
  const where=[`f.activo=1`, `(${access.sql})`];
  if(req.query?.id_ins_fl!==undefined && req.query?.id_ins_fl!==''){
    where.push('f.id_ins_fl=?');params.push(positive(req.query.id_ins_fl,'Equipo'));
  }
  if (q) {
    where.push(`(f.proyecto LIKE ? OR COALESCE(f.id_proyecto,'') LIKE ? OR COALESCE(f.referencia_sitio,'') LIKE ?)`);
    params.push(...Array.from({length:3},()=>`%${q}%`));
  }
  const [rows]=await db.query(
    `SELECT ${equipFields()} FROM ins_fl f WHERE ${where.join(' AND ')}
       ORDER BY f.proyecto,f.referencia_sitio,f.id_ins_fl LIMIT ${MAX_EQUIPOS_CONSULTA+1}`,params);
  if (rows.length>MAX_EQUIPOS_CONSULTA) throw error(422,'INT9_DEMASIADOS_EQUIPOS','Hay demasiados equipos. Refina la búsqueda.');
  // Conteo de asignados del tipo solicitado, limitado a equipos visibles.
  const ids=rows.map(x=>Number(x.id_ins_fl));
  const assigned=new Map();
  if (ids.length) {
    const [counts]=await db.query(
      `SELECT a.id_ins_fl,COUNT(*) AS n FROM instalaciones_programacion_asignaciones a
       JOIN instalaciones_personal p ON p.id_personal=a.id_personal
       WHERE a.activo=1 AND p.tipo_personal=? AND a.id_ins_fl IN (${placeholders(ids.length)})
       GROUP BY a.id_ins_fl`,[type,...ids]);
    for (const row of counts) assigned.set(Number(row.id_ins_fl),Number(row.n));
  }
  const desde=req.query?.desde?manualDate(req.query.desde,'desde'):null;
  const hasta=req.query?.hasta?manualDate(req.query.hasta,'hasta'):null;
  if (desde&&hasta&&hasta<desde) throw error(400,'INT9_RANGO_INVALIDO','hasta debe ser posterior a desde.');
  const onlyUncovered=asFlag(req.query?.solo_sin_personal);
  const all=rows.map(row=>{
    const ven=windowEquipo(type,row),asignados=assigned.get(Number(row.id_ins_fl))||0;
    return {id_ins_fl:Number(row.id_ins_fl),proyecto:row.proyecto||row.id_proyecto||'',
      id_proyecto:row.id_proyecto,equipo:row.referencia_sitio||'',estatus:row.estatus,
      inicio:ven.inicio,fin:ven.fin,fuente_fin:ven.fuente_fin,dias:ven.dias,valida:ven.valida,asignados};
  }).filter(e=>!(onlyUncovered&&e.asignados>0) &&
    (!desde&&!hasta || (e.valida && intersect(e.inicio,e.fin,desde||'0000-01-01',hasta||'9999-12-31'))));
  all.sort((a,b)=>Number(b.valida)-Number(a.valida)||String(a.inicio||'').localeCompare(String(b.inicio||''))||a.proyecto.localeCompare(b.proyecto,'es'));
  const limit=Number(req.query?.limit||MAX_EQUIPOS_RESPUESTA);
  if (!Number.isSafeInteger(limit)||limit<1||limit>MAX_EQUIPOS_RESPUESTA) {
    throw error(400,'INT9_LIMITE_INVALIDO',`El límite debe ser de 1 a ${MAX_EQUIPOS_RESPUESTA}.`);
  }
  return {tipo:type,equipos:all.slice(0,limit),total:all.length,mostrados:Math.min(all.length,limit),hay_mas:all.length>limit};
}
async function calendario(req) {
  const type=tipo(req.query?.tipo);
  const {desde,hasta}=range(req.query||{});
  const personas=await fetchPeople(db,type,req.query?.q||'');
  const ids=personas.map(p=>p.id_personal);
  const all=await fetchAssignmentRows(db,type,ids,req);
  const current=all.filter(a=>a.valida&&intersect(a.inicio,a.fin,desde,hasta)).map(redact);
  const withoutDates=all.filter(a=>!a.valida&&a.visible).map(redact);
  return {tipo:type,fase:type==='MONTADOR'?'montaje':'ajuste',desde,hasta,hoy:mxToday(),
    personal:personas,asignaciones:current,sin_fechas:withoutDates};
}
async function lockPeople(connection, type, ids, requireActive=true) {
  const [rows]=await connection.query(
    `SELECT id_personal,tipo_personal,nombre,puesto,contratista FROM instalaciones_personal
      WHERE tipo_personal=? ${requireActive?'AND activo=1':''} AND id_personal IN (${placeholders(ids.length)})
      ORDER BY id_personal FOR UPDATE`,[type,...ids]);
  if (rows.length!==ids.length) throw error(404,'INT9_PERSONA_NO_ENCONTRADA','Una o más personas no están activas en el catálogo.');
  return rows;
}
function clashes(all,pid,inicio,fin,excludeId=null,excludeTeam=null) {
  return all.filter(a=>a.id_personal===pid && a.valida && a.id_asignacion!==excludeId &&
    a.id_ins_fl!==excludeTeam && intersect(a.inicio,a.fin,inicio,fin));
}
function conflictInfo(x) {return {inicio:x.inicio,fin:x.fin,visible:x.visible,
  proyecto:x.visible?(x.proyecto||x.id_proyecto||null):null,
  equipo:x.visible?(x.referencia_sitio||null):null,id_asignacion:x.visible?x.id_asignacion:null};}
function validateManual(body) {
  const desde=manualDate(body.fecha_desde,'fecha_desde');
  const hasta=manualDate(body.fecha_hasta,'fecha_hasta');
  if (desde&&hasta&&hasta<desde) throw error(400,'INT9_FECHAS_INVERTIDAS','fecha_hasta no puede ser anterior a fecha_desde.');
  return {desde,hasta};
}
function rejectOtherFields(body, allowed) {
  if (!body||typeof body!=='object'||Array.isArray(body)) throw error(400,'INT9_CUERPO_INVALIDO','Datos inválidos.');
  for (const key of Object.keys(body)) {
    if (!allowed.has(key)) throw error(400,'INT9_CAMPO_INVALIDO',`Campo no permitido: ${key}.`);
  }
}
async function crearAsignaciones(req) {
  const b=req.body||{};
  rejectOtherFields(b,new Set(['tipo','id_ins_fl','ids_personal','id_personal','fecha_desde','fecha_hasta','notas','permitir_traslape']));
  const type=tipo(b.tipo);
  const raw=Array.isArray(b.ids_personal)?b.ids_personal:(b.id_personal===undefined?[]:[b.id_personal]);
  if (!raw.length||raw.length>MAX_PERSONAS_ALTA) throw error(400,'INT9_PERSONAS_REQUERIDAS',`Selecciona entre 1 y ${MAX_PERSONAS_ALTA} personas.`);
  const ids=[...new Set(raw.map(v=>positive(v,'Persona')))].sort((a,b)=>a-b);
  const idEquipo=positive(b.id_ins_fl,'Equipo');
  const {desde,hasta}=validateManual(b);
  const notas=plainText(b.notas,1000,'Notas');
  const uid=actor(req);
  const connection=await db.getConnection();
  try {
    await connection.beginTransaction();
    const personas=await lockPeople(connection,type,ids);
    const equipo=await loadEquipo(connection,req,idEquipo,true);
    const ventana=windowAsignacion(type,equipo,{fecha_desde:desde,fecha_hasta:hasta});
    if (!ventana.valida) throw error(400,'INT9_EQUIPO_SIN_FECHAS','El equipo no tiene fechas válidas: captura desde y hasta manualmente.');
    const prev=await fetchAssignmentRows(connection,type,ids,req);
    const repeated=personas.filter(p=>prev.some(a=>a.id_personal===Number(p.id_personal)&&a.id_ins_fl===idEquipo));
    if (repeated.length) throw error(409,'INT9_ASIGNACION_DUPLICADA',
      `Ya está asignado al equipo: ${repeated.map(p=>p.nombre).join(', ')}.`);
    const conflicts=personas.map(p=>({p,con:clashes(prev,Number(p.id_personal),ventana.inicio,ventana.fin)}))
      .filter(x=>x.con.length).map(x=>({id_personal:Number(x.p.id_personal),nombre:x.p.nombre,con:x.con.map(conflictInfo)}));
    if (conflicts.length&&!asFlag(b.permitir_traslape)) {
      await connection.rollback();
      return {creadas:[],conflictos:conflicts,requiere_confirmacion:true,ventana};
    }
    const created=[];
    for (const pid of ids) {
      const [result]=await connection.execute(
        `INSERT INTO instalaciones_programacion_asignaciones
         (id_personal,id_ins_fl,fecha_desde,fecha_hasta,notas,activo,created_by,updated_by)
         VALUES(?,?,?,?,?,1,?,?)`,[pid,idEquipo,desde,hasta,notas,uid,uid]);
      created.push(Number(result.insertId));
    }
    await connection.commit();
    return {creadas:created,conflictos:conflicts,requiere_confirmacion:false,ventana};
  } catch(ex) {
    await connection.rollback().catch(()=>{});
    if (ex?.code==='ER_DUP_ENTRY') throw error(409,'INT9_ASIGNACION_DUPLICADA','Una persona ya está asignada a este equipo.');
    throw ex;
  } finally {connection.release();}
}
async function getAssignment(connection, id) {
  const [rows]=await connection.query(
    `SELECT a.id_asignacion,a.id_personal,a.id_ins_fl,a.fecha_desde,a.fecha_hasta,a.notas,
      p.tipo_personal,p.nombre FROM instalaciones_programacion_asignaciones a
      JOIN instalaciones_personal p ON p.id_personal=a.id_personal
      WHERE a.id_asignacion=? AND a.activo=1 LIMIT 1`,[positive(id,'Asignación')]);
  if (!rows.length) throw error(404,'INT9_ASIGNACION_NO_ENCONTRADA','Asignación no encontrada.');
  return rows[0];
}
async function editarAsignacion(req) {
  const id=positive(req.params?.id,'Asignación');
  const b=req.body||{};
  rejectOtherFields(b,new Set(['fecha_desde','fecha_hasta','notas','permitir_traslape']));
  const uid=actor(req),connection=await db.getConnection();
  try {
    await connection.beginTransaction();
    const initial=await getAssignment(connection,id);
    // Bloqueo de la persona antes de modificar: serializa altas y cambios concurrentes.
    await lockPeople(connection,initial.tipo_personal,[Number(initial.id_personal)],false);
    const current=await getAssignment(connection,id);
    const equipo=await loadEquipo(connection,req,current.id_ins_fl,true);
    const fecha_desde=Object.prototype.hasOwnProperty.call(b,'fecha_desde') ? b.fecha_desde : parseDate(current.fecha_desde);
    const fecha_hasta=Object.prototype.hasOwnProperty.call(b,'fecha_hasta') ? b.fecha_hasta : parseDate(current.fecha_hasta);
    const {desde,hasta}=validateManual({fecha_desde,fecha_hasta});
    const ventana=windowAsignacion(current.tipo_personal,equipo,{fecha_desde:desde,fecha_hasta:hasta});
    if (!ventana.valida) throw error(400,'INT9_EQUIPO_SIN_FECHAS','Captura fechas válidas para esta asignación.');
    const assignments=await fetchAssignmentRows(connection,current.tipo_personal,[Number(current.id_personal)],req);
    const conflicts=clashes(assignments,Number(current.id_personal),ventana.inicio,ventana.fin,id)
      .map(conflictInfo);
    if (conflicts.length&&!asFlag(b.permitir_traslape)) {
      await connection.rollback();
      return {actualizada:false,requiere_confirmacion:true,
        conflictos:[{id_personal:Number(current.id_personal),nombre:current.nombre,con:conflicts}]};
    }
    const notas=Object.prototype.hasOwnProperty.call(b,'notas') ? plainText(b.notas,1000,'Notas') : current.notas;
    await connection.execute(`UPDATE instalaciones_programacion_asignaciones
      SET fecha_desde=?,fecha_hasta=?,notas=?,updated_by=?
      WHERE id_asignacion=? AND activo=1`,[desde,hasta,notas,uid,id]);
    await connection.commit();
    return {actualizada:true,requiere_confirmacion:false,id_asignacion:id,conflictos:[]};
  } catch(ex) {await connection.rollback().catch(()=>{});throw ex;}
  finally {connection.release();}
}
async function eliminarAsignacion(req) {
  const id=positive(req.params?.id,'Asignación');
  const uid=actor(req),connection=await db.getConnection();
  try {
    await connection.beginTransaction();
    const first=await getAssignment(connection,id);
    await lockPeople(connection,first.tipo_personal,[Number(first.id_personal)],false);
    const current=await getAssignment(connection,id);
    await loadEquipo(connection,req,current.id_ins_fl,true);
    await connection.execute(`UPDATE instalaciones_programacion_asignaciones
      SET activo=0,updated_by=? WHERE id_asignacion=? AND activo=1`,[uid,id]);
    await connection.commit();
    return {id_asignacion:id,activo:false};
  } catch(ex) {await connection.rollback().catch(()=>{});throw ex;}
  finally {connection.release();}
}
async function tieneAsignacionesVigentes(connection, idPersonal) {
  // Llamar solo DESPUES de bloquear la fila instalaciones_personal FOR UPDATE.
  // Las altas y ediciones tambien bloquean primero esa fila: sin carrera de baja.
  const [rows]=await connection.query(
    `SELECT a.fecha_desde,a.fecha_hasta,p.tipo_personal,${equipFields()}
     FROM instalaciones_programacion_asignaciones a
     JOIN instalaciones_personal p ON p.id_personal=a.id_personal
     JOIN ins_fl f ON f.id_ins_fl=a.id_ins_fl AND f.activo=1
     WHERE a.id_personal=? AND a.activo=1`,[positive(idPersonal,'Persona')]);
  const today=mxToday();
  return rows.filter(row=>{
    const w=windowAsignacion(row.tipo_personal,row,row);
    return !w.valida || w.fin>=today;
  }).length;
}
module.exports={
  equipos,calendario,crearAsignaciones,editarAsignacion,eliminarAsignacion,tieneAsignacionesVigentes,
  _read:Object.freeze({parseDate,manualDate,dayNumber,addDays,inclusiveDays,intersect,mxToday,
    windowEquipo,windowAsignacion,scope,fetchPeople,fetchAssignmentRows,redact,positive,tipo}),
  _test:{parseDate,manualDate,windowEquipo,windowAsignacion,range,mxToday,clashes,redact}
};

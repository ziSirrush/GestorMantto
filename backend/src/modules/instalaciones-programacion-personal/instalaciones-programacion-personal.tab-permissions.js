'use strict';
// INT9 04-M / 06-A: autorización por pestaña, complementa (NO sustituye)
// sesión, permiso general, puerta y alcance CORELLIAN del Guard existente.
const db=require('../../config/db');
const {listEffectivePermissions}=require('../../services/permissions/effective-permission.service');

const CODES=Object.freeze({
  MONTADOR:'INSTALACIONES_PROGRAMACION_PERSONAL_CALENDARIO_MONTADORES.VER',
  AJUSTADOR:'INSTALACIONES_PROGRAMACION_PERSONAL_CALENDARIO_AJUSTADORES.VER'
});
const denied=(status,code,message)=>({status,code,message});
function tipo(value){
  const raw=String(value??'').trim().toUpperCase();
  if(raw==='MONTADOR'||raw==='MONTADORES')return 'MONTADOR';
  if(raw==='AJUSTADOR'||raw==='AJUSTADORES')return 'AJUSTADOR';
  return null;
}
function effectiveId(req){
  const u=req?.contextUser||req?.user||{};
  const id=Number(u.id_SB||u.id||0);
  return Number.isSafeInteger(id)&&id>0?id:null;
}
async function permisos(req){
  if(req._int9TabPermissions)return req._int9TabPermissions;
  const id=effectiveId(req);
  if(!id)throw Object.assign(new Error('Se requiere una sesión de usuario válida.'),{statusCode:401,code:'INT9_TAB_SESION_REQUERIDA'});
  const states=await listEffectivePermissions(id,Object.values(CODES));
  const grants={MONTADOR:states.get(CODES.MONTADOR)===true,
    AJUSTADOR:states.get(CODES.AJUSTADOR)===true};
  req._int9TabPermissions=grants;
  return grants;
}
async function tabGuard(req,res,next,from){
  try{
    const raw=typeof from==='function'?await from(req):from;
    const kind=tipo(raw);
    if(!kind)return res.status(400).json({ok:false,code:'INT9_TAB_TIPO_INVALIDO',
      message:'Indica un tipo de personal válido.'});
    const allowed=await permisos(req);
    if(!allowed[kind])return res.status(403).json({ok:false,code:'INT9_TAB_SIN_PERMISO',
      message:'No tienes permiso para consultar esta pestaña.'});
    return next();
  }catch(error){return next(error);}
}
function onlyTab(typeSource){
  return (req,res,next)=>tabGuard(req,res,next,typeSource);
}
function oneTab(req,res,next){
  return permisos(req).then(allowed=>
    allowed.MONTADOR||allowed.AJUSTADOR?next():
    res.status(403).json({ok:false,code:'INT9_TABS_SIN_ACCESO',
      message:'No tienes permiso para Montadores ni Ajustadores.'})
  ).catch(next);
}
async function assignmentType(req){
  const id=Number(req.params?.id);
  if(!Number.isSafeInteger(id)||id<1)
    throw Object.assign(new Error('ID de asignación inválido.'),{statusCode:400,code:'INT9_TAB_ID_INVALIDO'});
  const [rows]=await db.query(
    `SELECT p.tipo_personal FROM instalaciones_programacion_asignaciones a
      JOIN instalaciones_personal p ON p.id_personal=a.id_personal
      WHERE a.id_asignacion=? AND a.activo=1 LIMIT 1`,[id]);
  if(rows.length!==1)
    throw Object.assign(new Error('Asignación no encontrada.'),{statusCode:404,code:'INT9_TAB_ASIGNACION_NO_ENCONTRADA'});
  return rows[0].tipo_personal;
}
function byAssignment(req,res,next){
  assignmentType(req).then(kind=>tabGuard(req,res,next,kind)).catch(next);
}
module.exports={CODES,tipo,permisos,onlyTab,oneTab,byAssignment,
  _test:{effectiveId,assignmentType}};

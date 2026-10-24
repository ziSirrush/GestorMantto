'use strict';
// [BLT NOW | 2026-10-23 | COBRANZA_UNI_VA_ADMIN_FASE_3_V001]
// Captura VA y derivados persistidos bajo una sola transaccion.
// Aiven es la fuente de escritura humana; permiso y alcance se revalidan en cada transaccion.
const db=require('../../config/db');
const scope=require('../../services/cobranza-uni-scope.service');
const {listEffectivePermissions}=require('../../services/permissions/effective-permission.service');
const {MAIN_VISUAL,TABLE_PERMISSIONS}=require('./cobranza-uni-administracion.permissions');
const {
  failPc_uni,idPc_uni,comparablePc_uni,normalizeSinglePc_uni,normalizeBulkPc_uni
}=require('./cobranza-uni-administracion.pc-edit-validation');
const {auditPcCell_uni}=require('./cobranza-uni-administracion.pc-edit-audit');
const {persistPcDerivedAfterEdit_uni}=require('./cobranza-uni-administracion.pc-derived-write');

const RIGHTS=[MAIN_VISUAL,TABLE_PERMISSIONS.pc.view,TABLE_PERMISSIONS.pc.edit];
function pcEditFeatureEnabled_uni(){
  const flag=String(process.env.PC_ADMIN_EDIT_ENABLED||'').trim().toLowerCase();
  return flag==='' || ['true','1','yes','on'].includes(flag);
}
function actorId_uni(req){
  const raw=req?.informationAccess?.effective_user_id||req?.contextUser?.id_SB||
    req?.contextUser?.id||req?.user?.id_SB||req?.user?.id;
  const id=Number(raw);
  return Number.isSafeInteger(id)&&id>0?id:null;
}
async function authorizePcWrite_uni(req,conn,permissionResolver,featureEnabled){
  if(!(featureEnabled??pcEditFeatureEnabled_uni()))
    throw failPc_uni(403,'VA_ADMIN_ESCRITURA_DESHABILITADA',
      'Edicion de Venta Adicional deshabilitada por configuracion.');
  if(!req||req.viewerContext?.active===true||req.informationAccess?.empresa!=='UNITED'||
    req.informationAccess?.acceso_puerta!==true)
    throw failPc_uni(403,'VA_ADMIN_ACCESO_DENEGADO','Contexto UNITED no autorizado.');
  const userId=actorId_uni(req);
  if(!userId)throw failPc_uni(401,'EFFECTIVE_USER_REQUIRED','Sesion requerida.');
  const rights=await (permissionResolver||listEffectivePermissions)(userId,RIGHTS,conn);
  if(!RIGHTS.every(code=>rights?.get(code)===true))
    throw failPc_uni(403,'VA_ADMIN_EDICION_DENEGADA',
      'Se requieren los permisos MAIN, VER y EDITAR de Venta Adicional.');
  return userId;
}
function getTerritoryPc_uni(req,scopeBuilder){
  const sql=(scopeBuilder||scope.buildCobranzaProjectScopeSql_uni)(req,'pc');
  if(typeof sql!=='string'||!sql.trim())
    throw failPc_uni(403,'VA_ADMIN_ALCANCE_INVALIDO','Alcance UNITED no disponible.');
  return sql;
}
async function editOnePc_uni(conn,req,input,territorySql,actor,deps){
  const {id,field,value,expected,operation}=input;
  const [rows]=await conn.query(
    `SELECT CAST(pc.\`id_pc\` AS CHAR) AS id_pc, pc.\`${field}\` AS original_value, `+
    'pc.`proyecto` AS original_project, '+
    'CAST(pc.`id_proyecto_cobranza` AS CHAR) AS original_fk '+
    `FROM \`pc\` pc WHERE pc.\`id_pc\` = ? AND (${territorySql}) FOR UPDATE`,[id]
  );
  if(!Array.isArray(rows)||rows.length!==1)
    throw failPc_uni(404,'VA_ADMIN_REGISTRO_NO_DISPONIBLE',
      'Registro inexistente o fuera de alcance.');
  const before=rows[0].original_value??null;
  if(comparablePc_uni(field,before)!==expected)
    throw failPc_uni(409,'VA_ADMIN_CONFLICTO_CONCURRENCIA',
      'Este campo cambio desde la consulta. Actualiza y revisa el registro.',{id,field});
  if(before===value||comparablePc_uni(field,before)===value)
    return {id,field,changed:false};
  const [updated]=await conn.query(
    `UPDATE \`pc\` pc SET pc.\`${field}\` = ? `+
    `WHERE pc.\`id_pc\` = ? AND (${territorySql})`,[value,id]
  );
  if(Number(updated?.affectedRows)!==1)
    throw failPc_uni(409,'VA_ADMIN_CONFLICTO_ACTUALIZACION',
      'El registro dejo de estar disponible. Operacion revertida.',{id,field});
  if(field==='proyecto'){
    const canonical=(deps.scopeService||scope).canonicalProjectSql_uni('pc');
    if(typeof canonical!=='string'||!canonical.trim())
      throw failPc_uni(403,'VA_ADMIN_IDENTIDAD_NO_DISPONIBLE',
        'No se pudo comprobar la identidad del proyecto.');
    const [visible]=await conn.query(
      'SELECT CAST(pc.`id_pc` AS CHAR) AS id_pc FROM `pc` pc '+
      `WHERE pc.\`id_pc\` = ? AND (${territorySql}) AND (${canonical}) IS NOT NULL `+
      'LIMIT 1 FOR UPDATE',[id]);
    if(!Array.isArray(visible)||visible.length!==1)
      throw failPc_uni(409,'VA_ADMIN_PROYECTO_FUERA_DE_ALCANCE',
        'El proyecto nuevo queda fuera del alcance; cambio revertido.',{id,field});
  }
  await (deps.auditRecorder||auditPcCell_uni)(req,{id,field,before,after:value,operation,actor},conn);
  return {id,field,changed:true,actor,
    oldProject:rows[0].original_project,oldFk:rows[0].original_fk};
}
async function editPcTransaction_uni(req,body,deps={},bulk=false){
  const normalized=bulk?normalizeBulkPc_uni(body):normalizeSinglePc_uni(body);
  const ids=bulk?normalized.ids:[idPc_uni(deps.recordId)];
  // No abrir conexion cuando el corte de emergencia este activo.
  if(!(deps.featureEnabled??pcEditFeatureEnabled_uni()))
    throw failPc_uni(403,'VA_ADMIN_ESCRITURA_DESHABILITADA',
      'Edicion de Venta Adicional deshabilitada por configuracion.');
  const conn=deps.connection||await db.getConnection();
  let transaction=false;
  try{
    await conn.beginTransaction();transaction=true;
    const actor=await authorizePcWrite_uni(req,conn,deps.permissionResolver,deps.featureEnabled);
    const sql=getTerritoryPc_uni(req,deps.scopeBuilder);
    const results=[];
    for(const id of ids){
      results.push(await editOnePc_uni(conn,req,{
        id,field:normalized.field,value:normalized.value,
        expected:bulk?normalized.expected[id]:normalized.expected,
        operation:bulk?'bulk':'single'
      },sql,actor,deps));
    }
    const changedRows=results.filter(row=>row.changed);
    const derived=changedRows.length
      ?await (deps.derivedWriter||persistPcDerivedAfterEdit_uni)(conn,req,changedRows,{
        ...deps,scopeBuilder:deps.scopeBuilder||scope.buildCobranzaProjectScopeSql_uni})
      :{calculated:0,projects:0};
    await conn.commit();transaction=false;
    return {ok:true,table:'pc',field:normalized.field,total:results.length,
      changed:changedRows.length,calculated:derived.calculated||0,results};
  }catch(error){
    if(transaction){try{await conn.rollback();}catch(_rollback){error.rollbackFailed=true;}}
    throw error;
  }finally{if(!deps.connection)conn.release();}
}
module.exports=Object.freeze({
  pcEditFeatureEnabled_uni,authorizePcWrite_uni,
  updateSinglePc_uni(req,id,body,deps={}){
    return editPcTransaction_uni(req,body,{...deps,recordId:id},false);
  },
  updateMultiPc_uni(req,body,deps={}){
    return editPcTransaction_uni(req,body,deps,true);
  }
});

'use strict';
// [BLT NOW | 2026-10-23 | COBRANZA_UNI_ADMIN_MP_FASE_3_V001]
// PATCH humano autorizado: permisos efectivos, identidad, alcance y auditoria.
// MP_ADMIN_EDIT_ENABLED=false permite un corte de emergencia.
const db=require('../../config/db');
const scope=require('../../services/cobranza-uni-scope.service');
const {listEffectivePermissions}=require('../../services/permissions/effective-permission.service');
const {MAIN_VISUAL,TABLE_PERMISSIONS}=require('./cobranza-uni-administracion.permissions');
const {auditMpCell_uni}=require('./cobranza-uni-administracion.mp-edit-audit');
const {previewMontoAnualMp_uni}=require('./cobranza-uni-administracion.mp-formulas');
const {
  failMp_uni,idMp_uni,comparableMp_uni,normalizeSingleMp_uni,normalizeBulkMp_uni
}=require('./cobranza-uni-administracion.mp-edit-validation');

const RIGHTS_MP_UNI=Object.freeze([
  MAIN_VISUAL,TABLE_PERMISSIONS.detalle_mp_2026.view,
  TABLE_PERMISSIONS.detalle_mp_2026.edit
]);
function mpEditFeatureEnabled_uni(){
  const flag=String(process.env.MP_ADMIN_EDIT_ENABLED||'').trim().toLowerCase();
  return flag==='' || ['true','1','yes','on'].includes(flag);
}
function actorId_uni(req){
  const x=req?.informationAccess?.effective_user_id ?? req?.contextUser?.id_SB ??
    req?.contextUser?.id ?? req?.user?.id_SB ?? req?.user?.id;
  const id=Number(x);
  return Number.isSafeInteger(id)&&id>0?id:null;
}
async function assertAuthorizedMp_uni(req,conn,deps={}){
  if(!req || req.viewerContext?.active===true||req.informationAccess?.empresa!=='UNITED'||
    req.informationAccess?.acceso_puerta!==true)
    throw failMp_uni(403,'MP_ADMIN_ACCESO_DENEGADO','Contexto UNITED no autorizado.');
  const actor=actorId_uni(req);
  if(!actor)throw failMp_uni(401,'EFFECTIVE_USER_REQUIRED','Sesion efectiva requerida.');
  const perms=await (deps.permissionResolver||listEffectivePermissions)(actor,RIGHTS_MP_UNI,conn);
  if(!RIGHTS_MP_UNI.every(code=>perms?.get(code)===true))
    throw failMp_uni(403,'MP_ADMIN_EDICION_DENEGADA',
      'Se requieren permisos MAIN, VER y EDITAR de Mantenimiento Preventivo.');
  return actor;
}
function officialScope_uni(req,deps={}){
  const service=deps.scopeService||scope;
  const sql=(deps.scopeBuilder||service.buildCobranzaProjectScopeSql_uni)(req,'mp');
  if(typeof sql!=='string'||!sql.trim())
    throw failMp_uni(403,'MP_ADMIN_ALCANCE_INVALIDO','El alcance UNITED no esta disponible.');
  const verified=service.canonicalProjectSql_uni('mp');
  if(typeof verified!=='string'||!verified.trim())
    throw failMp_uni(403,'MP_ADMIN_IDENTIDAD_NO_DISPONIBLE','No esta disponible la identidad de proyecto oficial.');
  return {territory:sql,identity:verified};
}
async function editOneMp_uni(conn,rowChange,boundary,actor,req,deps={}){
  const {id,field,value,expected,operation}=rowChange;
  const where=`mp.\`id_dmp\` = ? AND (${boundary.territory}) AND (${boundary.identity}) IS NOT NULL`;
  const [rows]=await conn.query(
    `SELECT CAST(mp.\`id_dmp\` AS CHAR) AS id_dmp, mp.\`${field}\` AS original_value `+
    (field==='factor_monto_anual'?
      ', mp.`iguala` AS original_iguala, mp.`monto_anual` AS original_monto_anual ':' ')+
    `FROM \`detalle_mp_2026\` mp WHERE ${where} FOR UPDATE`,[id]
  );
  if(!Array.isArray(rows)||rows.length!==1)
    throw failMp_uni(404,'MP_ADMIN_REGISTRO_NO_DISPONIBLE',
      'Registro inexistente, identidad conflictiva o fuera de alcance.');
  const original=rows[0].original_value??null;
  const before=comparableMp_uni(field,original);
  if(before!==expected)
    throw failMp_uni(409,'MP_ADMIN_CONFLICTO_CONCURRENCIA',
      'Este campo cambio desde la consulta. Actualiza el registro.',{id,field});
  if(before===value)
    return {id,field,changed:false,derived_changes:[]};
  // El factor recalcula monto_anual en la misma transaccion.
  // NULL factor conserva monto almacenado. Sin iguala: conserva monto, no inventa 0.
  const setters=[`mp.\`${field}\` = ?`];
  const bindings=[value];
  const derived=[];
  if(field==='factor_monto_anual' && value!==null){
    const preview=(deps.formulaEngine||{previewMontoAnualMp_uni})
      .previewMontoAnualMp_uni({
        iguala:rows[0].original_iguala,
        factor_monto_anual:value,
        monto_anual:rows[0].original_monto_anual
      });
    if(!['ready','sin_iguala'].includes(preview.status))
      throw failMp_uni(422,'MP_ADMIN_FACTOR_CALCULO_INVALIDO',
        'No se pudo calcular MONTO ANUAL con el factor solicitado.',{id,status:preview.status});
    if(preview.status==='ready' && !preview.matches_stored){
      setters.push('mp.`monto_anual` = ?');
      bindings.push(preview.calculated);
      derived.push({field:'monto_anual',before:rows[0].original_monto_anual??null,
        after:preview.calculated});
    }
  }
  const [written]=await conn.query(
    `UPDATE \`detalle_mp_2026\` mp SET ${setters.join(', ')} WHERE ${where}`,
    [...bindings,id]
  );
  if(Number(written?.affectedRows)!==1)
    throw failMp_uni(409,'MP_ADMIN_CONFLICTO_ACTUALIZACION',
      'El registro no se pudo actualizar; cambios revertidos.',{id,field});
  await (deps.auditRecorder||auditMpCell_uni)(req,
    {id,field,before:original,after:value,operation,actor,derived_changes:derived},conn);
  return {id,field,changed:true,derived_changes:derived};
}
async function editMpTransaction_uni(req,body,deps={},bulk=false){
  // No abrir conexion si el corte de emergencia esta activo.
  if(!(deps.featureEnabled===true || (deps.featureEnabled===undefined && mpEditFeatureEnabled_uni())))
    throw failMp_uni(403,'MP_ADMIN_ESCRITURA_DESHABILITADA',
      'Edicion MP deshabilitada por configuracion.');
  const data=bulk?normalizeBulkMp_uni(body):normalizeSingleMp_uni(body);
  const ids=bulk?data.ids:[idMp_uni(deps.recordId)];
  const conn=deps.connection||await db.getConnection();
  let started=false;
  try{
    await conn.beginTransaction();started=true;
    const actor=await assertAuthorizedMp_uni(req,conn,deps);
    const boundary=officialScope_uni(req,deps);
    const results=[];
    for(const id of ids){
      results.push(await editOneMp_uni(conn,{
        id,field:data.field,value:data.value,
        expected:bulk?data.expected[id]:data.expected,
        operation:bulk?'bulk':'single'
      },boundary,actor,req,deps));
    }
    await conn.commit();started=false;
    return {ok:true,table:'detalle_mp_2026',field:data.field,total:results.length,
      changed:results.filter(r=>r.changed).length,
      calculated:results.reduce((sum,r)=>sum+(r.derived_changes?.length||0),0),results};
  }catch(error){
    if(started){try{await conn.rollback();}catch(_rollback){error.rollbackFailed=true;}}
    throw error;
  }finally{if(!deps.connection)conn.release();}
}
module.exports=Object.freeze({
  mpEditFeatureEnabled_uni,assertAuthorizedMp_uni,
  updateSingleMp_uni(req,id,body,deps={}){
    return editMpTransaction_uni(req,body,{...deps,recordId:id},false);
  },
  updateMultiMp_uni(req,body,deps={}){
    return editMpTransaction_uni(req,body,deps,true);
  }
});

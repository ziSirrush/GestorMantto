'use strict';

// [BLT NOW | 2026-10-23 | COBRANZA_UNI_ADMINISTRACION_FASE_5_V001]
// PATCH manual F4 + formulas F5 en un UPDATE y auditoria unica por fila,
// con detalle de cada derivado, dentro de la MISMA transaccion.
const db = require('../../config/db');
const scope = require('../../services/cobranza-uni-scope.service');
const {listEffectivePermissions} = require('../../services/permissions/effective-permission.service');
const {MAIN_VISUAL,TABLE_PERMISSIONS} = require('./cobranza-uni-administracion.permissions');
const {GC_COLUMNS_UNI,GC_DERIVED_FIELDS_UNI} = require('./cobranza-uni-administracion.constants');
const {deriveForChange_uni} = require('./cobranza-uni-administracion.gc-formulas');
const {id_uni,comparable_uni,normalizeSingle_uni,normalizeBulk_uni,fail_uni} =
  require('./cobranza-uni-administracion.gc-edit-validation');
const {recordGcCell_uni} = require('./cobranza-uni-administracion.gc-edit-audit');
const {markManualEdit_uni} = require('./cobranza-uni-administracion.gc-sync-guard');

const SELECT_FIELDS = GC_COLUMNS_UNI.map(({name}) =>
  name === 'id_gc' || name === 'id_proyecto_cobranza'
    ? `CAST(gc.\`${name}\` AS CHAR) AS \`${name}\``
    : `gc.\`${name}\``).join(', ');
const ALLOWED_CODES = [MAIN_VISUAL,TABLE_PERMISSIONS.gestion_credito.view,TABLE_PERMISSIONS.gestion_credito.edit];
const DERIVED_ALLOWED = new Set(GC_DERIVED_FIELDS_UNI);

function effectiveId_uni(req) {
  const effective=req.informationAccess?.effective_user_id;
  const fallback=req.contextUser?.id_SB || req.contextUser?.id || req.user?.id_SB || req.user?.id;
  const id=Number(effective || fallback);
  return Number.isSafeInteger(id) && id>0 ? id : null;
}

async function assertAuthorized_uni(req,conn,permissionResolver) {
  if (req.viewerContext?.active === true || req.informationAccess?.empresa !== 'UNITED' ||
      req.informationAccess?.acceso_puerta !== true) {
    throw fail_uni(403,'GC_ADMIN_ACCESO_DENEGADO','Edición no autorizada para el contexto actual.');
  }
  const userId=effectiveId_uni(req);
  if(!userId) throw fail_uni(401,'EFFECTIVE_USER_REQUIRED','Sesión requerida.');
  const check=permissionResolver || listEffectivePermissions;
  const rights=await check(userId, ALLOWED_CODES, conn);
  if (!ALLOWED_CODES.every(code=>rights?.get(code) === true)) {
    throw fail_uni(403,'GC_ADMIN_EDICION_DENEGADA','Se requieren permisos de Administración, VER y EDITAR de Gestión de Crédito.');
  }
}

function scopeSql_uni(req,scopeBuilder) {
  const built=(scopeBuilder || scope.buildCobranzaProjectScopeSql_uni)(req,'gc');
  if(typeof built!=='string' || !built.trim()) {
    throw fail_uni(403,'GC_ADMIN_ALCANCE_INVALIDO','No se pudo validar el alcance UNITED.');
  }
  return built;
}

async function lockedRow_uni(conn,id,territorySql) {
  const [rows]=await conn.query(
    `SELECT ${SELECT_FIELDS} FROM \`gestion_credito\` gc `+
    `WHERE gc.\`id_gc\` = ? AND (${territorySql}) FOR UPDATE`, [id]
  );
  if(!Array.isArray(rows) || rows.length !== 1) {
    throw fail_uni(404,'GC_ADMIN_REGISTRO_NO_DISPONIBLE','Registro inexistente o fuera de tu alcance.');
  }
  return rows[0];
}

async function validateProjectScopeAfter_uni(conn,id,req,territorySql,scopeDependencies) {
  const canonical=scopeDependencies || scope;
  const verifiedSql=canonical.canonicalProjectSql_uni('gc');
  if(typeof verifiedSql!=='string' || !verifiedSql.trim())throw new Error('Validador de identidad oficial ausente.');
  const [rows]=await conn.query(
    `SELECT CAST(gc.\`id_gc\` AS CHAR) AS id_gc FROM \`gestion_credito\` gc `+
    `WHERE gc.\`id_gc\` = ? AND (${territorySql}) AND (${verifiedSql}) IS NOT NULL LIMIT 1`,[id]
  );
  if(!Array.isArray(rows) || rows.length !== 1) {
    throw fail_uni(409,'GC_ADMIN_IDENTIDAD_PROYECTO_CONFLICTIVA',
      'El proyecto modificado no coincide con su identidad oficial/FK o queda fuera del alcance. Cambios cancelados.');
  }
}

async function mutateCell_uni(conn,req,params,territorySql, deps={}) {
  const {id,field,value,expected,operation}=params;
  const row=await lockedRow_uni(conn,id,territorySql);
  const before=comparable_uni(field,row[field]);
  if (before !== expected) {
    throw fail_uni(409,'GC_ADMIN_CONFLICTO_CONCURRENCIA',
      `El campo ${field} cambió desde que se cargó. Actualiza la tabla y revisa el registro.`,{id,field});
  }
  if (before === value) return {id,field,changed:false,value:row[field]??null,
    derived_changes:[],warnings:[]};

  // Derivados: solo los dependientes de la celda editada. Los nombres se
  // validan contra el contrato; nunca vienen del navegador.
  const generated=(deps.formulaEngine || {deriveForChange_uni})
    .deriveForChange_uni(row,field,value);
  const derived=Object.keys(generated.patch);
  if(derived.some(name=>!DERIVED_ALLOWED.has(name))) {
    throw new Error('El motor intento escribir un campo fuera del contrato.');
  }
  const columns=[field,...derived];
  const setters=columns.map(name=>`gc.\`${name}\` = ?`).join(', ');
  const bindings=[value,...derived.map(name=>generated.patch[name]),id];
  // Origen y formulas se guardan EN UN SOLO UPDATE (atomico y bajo lock).
  const [result]=await conn.query(
    `UPDATE \`gestion_credito\` gc SET ${setters} `+
    `WHERE gc.\`id_gc\` = ? AND (${territorySql})`,bindings
  );
  if(Number(result?.affectedRows)!==1) {
    throw fail_uni(409,'GC_ADMIN_CONFLICTO_ACTUALIZACION','El registro dejó de estar disponible. Cambios cancelados.',{id,field});
  }
  if (field === 'proyecto') {
    await validateProjectScopeAfter_uni(conn,id,req,territorySql,deps.scopeService);
  }
  // Orden obligatorio: registro bloqueado > UPDATE > proteccion GAS > auditoria > COMMIT.
  // Si falla cualquiera, el cambio humano y su proteccion se revierten juntos.
  const protect=deps.protectionRecorder || markManualEdit_uni;
  await protect(conn,{id,field,actor:effectiveId_uni(req)});
  const audit=deps.auditRecorder || recordGcCell_uni;
  await audit(req,{id,field,before:row[field]??null,after:value,operation,
    derived_changes:generated.changes},conn);
  return {id,field,changed:true,value,
    derived_changes:generated.changes, warnings:generated.warnings};
}

async function runTransaction_uni(req,input,deps={},bulk=false) {
  if (!req || typeof req!=='object') {
    throw fail_uni(403,'GC_ADMIN_ACCESO_DENEGADO','Contexto de seguridad ausente.');
  }
  const normalized=bulk?normalizeBulk_uni(input):normalizeSingle_uni(input);
  const ids=bulk?normalized.ids:[id_uni(deps.recordId)];
  const conn=deps.connection || await db.getConnection();
  let inTransaction=false;
  try{
    await conn.beginTransaction();
    inTransaction=true;
    await assertAuthorized_uni(req,conn,deps.permissionResolver);
    const territorySql=scopeSql_uni(req,deps.scopeBuilder);
    const result=[];
    for(const id of ids){
      result.push(await mutateCell_uni(conn,req,{
        id,field:normalized.field,value:normalized.value,
        expected:bulk?normalized.expected[id]:normalized.expected,
        operation:bulk?'bulk':'single'
      },territorySql,deps));
    }
    await conn.commit();
    inTransaction=false;
    return {
      ok:true,table:'gestion_credito',field:normalized.field,
      total:result.length,changed:result.filter(x=>x.changed).length,
      calculated:result.reduce((n,r)=>n+r.derived_changes.length,0),
      warnings:result.flatMap(r=>r.warnings.map(w=>({...w,id:r.id}))),
      results:result
    };
  }catch(error){
    if(inTransaction){try{await conn.rollback();}catch(rollbackError){
      error.rollbackFailed=true;
    }}
    throw error;
  }finally{
    if(!deps.connection)conn.release();
  }
}

module.exports=Object.freeze({
  updateSingleGc_uni(req,id,body,deps={}){
    return runTransaction_uni(req,body,{...deps,recordId:id},false);
  },
  updateMultiGc_uni(req,body,deps={}){
    return runTransaction_uni(req,body,deps,true);
  }
});

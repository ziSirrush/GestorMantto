'use strict';
// [BLT NOW | 2026-10-23 | COBRANZA_UNI_ADMIN_MP_FASE_6_V001]
// Read-only preflight + transactional implementation prepared, all writes OFF.
// No name-based discovery: explicit MP id and linked/candidate Zona1 PK only.
const db=require('../../config/db');
const scope=require('../../services/cobranza-uni-scope.service');
const {MP_RULES_UNI,MP_ZONE1_BASE_UNI}=require('./cobranza-uni-administracion.constants');
const {assertAuthorizedMp_uni,mpEditFeatureEnabled_uni}=require('./cobranza-uni-administracion.mp-edit-service');
const {idMp_uni,failMp_uni}=require('./cobranza-uni-administracion.mp-edit-validation');
const {auditZone1_uni}=require('./cobranza-uni-administracion.mp-zona1-audit');
const {
  INVOICE_FIELDS_MP_UNI,idZone1_uni,invoiceValue_uni,
  normalizeInvoiceEdit_uni,normalizeInvoiceCreate_uni,normalizeLink_uni
}=require('./cobranza-uni-administracion.mp-zona1-validation');

const GENERAL=MP_ZONE1_BASE_UNI.map(x=>x[0]);
const MAIN_FIELDS=GENERAL.map(name=>`mp.\`${name}\``).join(', ');
const TEXT=value=>value===null||value===undefined?'':
  String(value).trim().normalize('NFC').toLocaleUpperCase('es-MX');
function flag_uni(name){return String(process.env[name]||'').trim().toLowerCase()==='true';}
function zone1WriteEnabled_uni(){
  return MP_RULES_UNI.zone1WritesEnabled===true &&
    MP_RULES_UNI.gasSyncRemainsActive===false && mpEditFeatureEnabled_uni() &&
    flag_uni('MP_ADMIN_ZONA1_WRITE_ENABLED');
}
function requireWriteGate_uni(deps){
  // Test-only dependency injection; HTTP routes never supply dependencies.
  if(!(deps.featureEnabled===true || (deps.featureEnabled===undefined && zone1WriteEnabled_uni())))
    throw failMp_uni(403,'MP_ZONA1_ESCRITURA_DESHABILITADA',
      'Escritura Zona 1 cerrada: GAS sigue activo y falta corte GC+VA+MP autorizado.');
}
function officialWhere_uni(req,deps){
  const official=deps.scopeService||scope;
  const territorial=(deps.scopeBuilder||official.buildCobranzaProjectScopeSql_uni)(req,'mp');
  const canonical=official.canonicalProjectSql_uni('mp');
  if(typeof territorial!=='string'||!territorial.trim()||
    typeof canonical!=='string'||!canonical.trim())
    throw failMp_uni(403,'MP_ZONA1_ALCANCE_INVALIDO','Falta alcance o identidad oficial.');
  return `mp.\`id_dmp\` = ? AND (${territorial}) AND (${canonical}) IS NOT NULL`;
}
async function readParent_uni(conn,id,where,locked){
  const [rows]=await conn.query(
    `SELECT CAST(mp.\`id_dmp\` AS CHAR) AS id_dmp, ${MAIN_FIELDS} `+
    `FROM \`detalle_mp_2026\` mp WHERE ${where} LIMIT 1${locked?' FOR UPDATE':''}`,[id]);
  if(!Array.isArray(rows)||rows.length!==1||String(rows[0].id_dmp)!==id)
    throw failMp_uni(404,'MP_ZONA1_REGISTRO_NO_DISPONIBLE',
      'Registro MP no disponible o sin identidad de proyecto confiable.');
  return rows[0];
}
async function readLinked_uni(conn,id,locked){
  const [rows]=await conn.query(
    'SELECT CAST(z.`id_mp_zona_1` AS CHAR) AS id_mp_zona_1, '+
    'CAST(z.`id_dmp` AS CHAR) AS id_dmp, z.`proyecto`, z.`idns`, z.`cliente` '+
    'FROM `detalle_mp_2026_zona_1` z WHERE z.`id_dmp` = ? LIMIT 2'+
    (locked?' FOR UPDATE':''),[id]);
  if(!Array.isArray(rows)||rows.length>1)
    throw failMp_uni(409,'MP_ZONA1_RELACION_AMBIGUA','Mas de una fila vinculada a MP.');
  return rows[0]||null;
}
async function readCandidate_uni(conn,zonaId,locked){
  const [rows]=await conn.query(
    'SELECT CAST(z.`id_mp_zona_1` AS CHAR) AS id_mp_zona_1, '+
    'CAST(z.`id_dmp` AS CHAR) AS id_dmp, z.`proyecto`, z.`idns`, z.`cliente` '+
    'FROM `detalle_mp_2026_zona_1` z '+
    'WHERE z.`id_mp_zona_1` = ? AND z.`id_dmp` IS NULL LIMIT 1'+
    (locked?' FOR UPDATE':''),[zonaId]);
  if(!Array.isArray(rows)||rows.length!==1)
    throw failMp_uni(409,'MP_ZONA1_VINCULO_NO_DISPONIBLE',
      'Fila Zona 1 no disponible o ya vinculada.');
  return rows[0];
}
function assertMatch_uni(parent,candidate,requiresIdns){
  if(!TEXT(parent.proyecto)||!TEXT(candidate.proyecto)||
    TEXT(parent.proyecto)!==TEXT(candidate.proyecto))
    throw failMp_uni(409,'MP_ZONA1_IDENTIDAD_CONFLICTIVA','Proyecto de Zona 1 no coincide.');
  const id1=TEXT(parent.idns),id2=TEXT(candidate.idns);
  if((id1&&id2&&id1!==id2)||(requiresIdns&&(!id1||!id2||id1!==id2)))
    throw failMp_uni(409,'MP_ZONA1_IDENTIDAD_CONFLICTIVA','Identificador IDNS no verificable.');
  const a=TEXT(parent.cliente),b=TEXT(candidate.cliente);
  if(a&&b&&a!==b)
    throw failMp_uni(409,'MP_ZONA1_IDENTIDAD_CONFLICTIVA','Cliente de Zona 1 no coincide.');
  return true;
}
async function checkedEditRow_uni(conn,id,zonaId,where,field,locked,parent){
  const [rows]=await conn.query(
    `SELECT CAST(z.\`id_mp_zona_1\` AS CHAR) AS id_mp_zona_1, `+
    `CAST(z.\`id_dmp\` AS CHAR) AS id_dmp, z.\`${field}\` AS original_value, `+
    'z.`proyecto`, z.`idns`, z.`cliente` '+
    'FROM `detalle_mp_2026_zona_1` z '+
    'INNER JOIN `detalle_mp_2026` mp ON mp.`id_dmp` = z.`id_dmp` '+
    `WHERE ${where} AND z.\`id_mp_zona_1\` = ? LIMIT 1${locked?' FOR UPDATE':''}`,
    [id,zonaId]);
  if(!Array.isArray(rows)||rows.length!==1||String(rows[0].id_dmp)!==id||
    String(rows[0].id_mp_zona_1)!==zonaId)
    throw failMp_uni(404,'MP_ZONA1_REGISTRO_NO_DISPONIBLE',
      'Factura no disponible dentro del proyecto autorizado.');
  assertMatch_uni(parent,rows[0],false);
  return rows[0];
}
async function run_uni(req,idInput,body,deps,operation,zonaInput){
  const isWrite=['create','link','edit'].includes(operation);
  if(isWrite)requireWriteGate_uni(deps);
  const id=idMp_uni(idInput);
  const input=operation.endsWith('create')?normalizeInvoiceCreate_uni(body):
    operation.endsWith('link')?normalizeLink_uni(body):normalizeInvoiceEdit_uni(body);
  const zoneId=operation.endsWith('edit')?idZone1_uni(zonaInput):
    operation.endsWith('link')?input.id_mp_zona_1:null;
  if(operation.endsWith('edit')&&input.id_mp_zona_1&&input.id_mp_zona_1!==zoneId)
    throw failMp_uni(400,'MP_ZONA1_ID_CONFLICTIVO','IDs de Zona 1 diferentes.');
  const conn=deps.connection||await db.getConnection();
  let transaction=false;
  try{
    if(isWrite){await conn.beginTransaction();transaction=true;}
    const actor=await assertAuthorizedMp_uni(req,conn,deps);
    const where=officialWhere_uni(req,deps);
    const parent=await readParent_uni(conn,id,where,isWrite);
    let linked;
    if(operation.endsWith('edit')){
      const current=await checkedEditRow_uni(conn,id,zoneId,where,input.field,isWrite,parent);
      const before=current.original_value??null;
      const compared=invoiceValue_uni(input.field,before,false);
      if(compared!==input.expected)
        throw failMp_uni(409,'MP_ZONA1_CONFLICTO_CONCURRENCIA',
          'Celda cambiada desde la ultima consulta. Recarga Zona 1.');
      const changed=compared!==input.value;
      if(!isWrite)return {ok:true,mode:'preview_only',table:'detalle_mp_2026_zona_1',
        id_dmp:id,id_mp_zona_1:zoneId,operation:'edit',field:input.field,
        before,after:input.value,changed,can_write:false};
      if(changed){
        const [result]=await conn.query(
          `UPDATE \`detalle_mp_2026_zona_1\` z SET z.\`${input.field}\` = ? `+
          'WHERE z.`id_mp_zona_1` = ? AND z.`id_dmp` = ?',
          [input.value,zoneId,id]);
        if(Number(result?.affectedRows)!==1)
          throw failMp_uni(409,'MP_ZONA1_CAMBIO_CONFLICTIVO','Cambio no confirmado.');
        await (deps.auditRecorder||auditZone1_uni)(req,{operation:'edit',actor,id_dmp:id,
          id_mp_zona_1:zoneId,field:input.field,before,after:input.value},conn);
      }
      await conn.commit();transaction=false;
      return {ok:true,table:'detalle_mp_2026_zona_1',operation:'edit',id_dmp:id,
        id_mp_zona_1:zoneId,field:input.field,changed};
    }
    linked=await readLinked_uni(conn,id,isWrite);
    if(linked)throw failMp_uni(409,'MP_ZONA1_YA_VINCULADA',
      'Este mantenimiento ya cuenta con una fila Zona 1; no se duplicara.');
    if(operation.endsWith('link')){
      const candidate=await readCandidate_uni(conn,zoneId,isWrite);
      assertMatch_uni(parent,candidate,true); // never link by project name alone
      if(!isWrite)return {ok:true,mode:'preview_only',table:'detalle_mp_2026_zona_1',
        operation:'link',id_dmp:id,id_mp_zona_1:zoneId,identity_verified:true,
        can_write:false};
      const [updated]=await conn.query(
        'UPDATE `detalle_mp_2026_zona_1` z SET z.`id_dmp` = ? '+
        'WHERE z.`id_mp_zona_1` = ? AND z.`id_dmp` IS NULL',[id,zoneId]);
      if(Number(updated?.affectedRows)!==1)
        throw failMp_uni(409,'MP_ZONA1_VINCULO_CONFLICTIVO','Fila asignada por otra operacion.');
      await (deps.auditRecorder||auditZone1_uni)(req,{operation:'link',actor,id_dmp:id,
        id_mp_zona_1:zoneId,previous_link:null},conn);
      await conn.commit();transaction=false;
      return {ok:true,table:'detalle_mp_2026_zona_1',operation:'link',linked:true,
        id_dmp:id,id_mp_zona_1:zoneId};
    }
    // Creation: the identity and all 16 general fields are inherited from the
    // validated parent; requests may set invoice fields ONLY. No fake formulas.
    if(!isWrite)return {ok:true,mode:'preview_only',table:'detalle_mp_2026_zona_1',
      operation:'create',id_dmp:id,linked:false,fields:input.fields,
      count:input.fields.length,identity_source:'detalle_mp_2026',can_write:false};
    const names=['id_dmp',...GENERAL,...input.fields];
    const values=[id,...GENERAL.map(name=>parent[name]??null),
      ...input.fields.map(field=>input.changes[field])];
    const sql='INSERT INTO `detalle_mp_2026_zona_1` ('+
      names.map(name=>'`'+name+'`').join(', ')+') VALUES ('+
      names.map(()=>'?').join(', ')+')';
    const [inserted]=await conn.query(sql,values);
    if(Number(inserted?.affectedRows)!==1)
      throw failMp_uni(409,'MP_ZONA1_ALTA_NO_CONFIRMADA','No se confirmo la nueva fila.');
    const [ids]=await conn.query('SELECT CAST(LAST_INSERT_ID() AS CHAR) AS id_mp_zona_1');
    const createdId=idZone1_uni(ids?.[0]?.id_mp_zona_1);
    await (deps.auditRecorder||auditZone1_uni)(req,{operation:'create',actor,
      id_dmp:id,id_mp_zona_1:createdId,fields:input.fields},conn);
    await conn.commit();transaction=false;
    return {ok:true,table:'detalle_mp_2026_zona_1',operation:'create',created:true,
      id_dmp:id,id_mp_zona_1:createdId,fields:input.fields};
  }catch(error){
    if(transaction){try{await conn.rollback();}catch(_rollback){error.rollbackFailed=true;}}
    if(error?.code==='ER_DUP_ENTRY')throw failMp_uni(409,'MP_ZONA1_DUPLICADO',
      'Otra fila esta vinculada a este mantenimiento.');
    throw error;
  }finally{if(!deps.connection)conn.release();}
}
module.exports=Object.freeze({
  zone1WriteEnabled_uni,INVOICE_FIELDS_MP_UNI,
  preflightCreateZone1_uni(req,id,body,deps={}){return run_uni(req,id,body,deps,'preflight_create');},
  createZone1_uni(req,id,body,deps={}){return run_uni(req,id,body,deps,'create');},
  preflightLinkZone1_uni(req,id,body,deps={}){return run_uni(req,id,body,deps,'preflight_link');},
  linkZone1_uni(req,id,body,deps={}){return run_uni(req,id,body,deps,'link');},
  preflightEditZone1_uni(req,id,zonaId,body,deps={}){
    return run_uni(req,id,body,deps,'preflight_edit',zonaId);
  },
  editZone1_uni(req,id,zonaId,body,deps={}){
    return run_uni(req,id,body,deps,'edit',zonaId);
  },
  _test:Object.freeze({assertMatch_uni})
});

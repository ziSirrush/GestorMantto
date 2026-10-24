'use strict';
// [BLT NOW | 2026-10-23 | COBRANZA_UNI_EXCEL_FASE_5_V001]
// Edicion multiple de facturas Zona 1, 2-20 registros, una transaccion.
// Solo UPDATE por PK+FK validada; identidad/alcance en el mismo SELECT con LOCK.
const db=require('../../config/db');
const {assertAuthorizedMp_uni}=require('./cobranza-uni-administracion.mp-edit-service');
const {failMp_uni}=require('./cobranza-uni-administracion.mp-edit-validation');
const {invoiceValue_uni,idZone1_uni,INVOICE_FIELDS_MP_UNI}=
  require('./cobranza-uni-administracion.mp-zona1-validation');
const {auditZone1_uni}=require('./cobranza-uni-administracion.mp-zona1-audit');
const {zone1ExcelWriteEnabled_uni}=require('./cobranza-uni-administracion.mp-zona1-write-service');
const {verifyScope_uni,buildVerifiedZone1Where_uni}=require('./cobranza-uni-administracion.mp-zona1-grid');
const MAX_ROWS=20;
const FIELDS=new Set(INVOICE_FIELDS_MP_UNI);
function plain_uni(value){
  return value!==null&&typeof value==='object'&&!Array.isArray(value)&&
    (Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null||
      Object.getPrototypeOf(Object.getPrototypeOf(value))===null);
}
function normalizeBulkZone1_uni(body){
  if(!plain_uni(body)||Object.keys(body).some(k=>!['ids','changes','expected'].includes(k))||
    !Array.isArray(body.ids)||body.ids.length<2||body.ids.length>MAX_ROWS||
    !plain_uni(body.changes)||Object.keys(body.changes).length!==1||
    !plain_uni(body.expected))
    throw failMp_uni(400,'MP_ZONA1_LOTE_INVALIDO','Lote invalido: 2-20 filas, changes y expected.');
  const field=Object.keys(body.changes)[0];
  if(!FIELDS.has(field))
    throw failMp_uni(400,'MP_ZONA1_CAMPO_NO_PERMITIDO','Campo protegido, calculado o no autorizado.');
  const value=invoiceValue_uni(field,body.changes[field],true);
  const ids=body.ids.map(idZone1_uni);
  if(new Set(ids).size!==ids.length)
    throw failMp_uni(400,'MP_ZONA1_LOTE_DUPLICADO','No se admiten IDs repetidos.');
  ids.sort((a,b)=>BigInt(a)<BigInt(b)?-1:BigInt(a)>BigInt(b)?1:0);
  if(Object.keys(body.expected).length!==ids.length ||
    Object.keys(body.expected).some(id=>!ids.includes(id)))
    throw failMp_uni(400,'MP_ZONA1_EXPECTED_REQUERIDO','Valores anteriores obligatorios para todo el lote.');
  const expected=Object.create(null);
  for(const id of ids){
    const valueByField=body.expected[id];
    if(!plain_uni(valueByField)||Object.keys(valueByField).length!==1||
      !Object.hasOwn(valueByField,field))
      throw failMp_uni(400,'MP_ZONA1_EXPECTED_REQUERIDO','Valor previo de celda requerido.');
    expected[id]=invoiceValue_uni(field,valueByField[field],false);
  }
  return {field,value,ids,expected};
}
async function editBulkZone1Excel_uni(req,body,deps={}){
  // Antes de SQL o conexión: nunca reanudar escrituras sin los tres controles.
  if(!(deps.featureEnabled===true || (deps.featureEnabled===undefined && zone1ExcelWriteEnabled_uni())))
    throw failMp_uni(403,'MP_ZONA1_ESCRITURA_DESHABILITADA',
      'Edicion Zona 1 inactiva: requiere corte GAS confirmado y conciliacion GC+VA+MP.');
  const data=normalizeBulkZone1_uni(body);
  const verified=verifyScope_uni(req,deps); // fail-closed antes de obtener MySQL.
  const conn=deps.connection||await db.getConnection();
  let transaction=false;
  try{
    await conn.beginTransaction();transaction=true;
    const actor=await assertAuthorizedMp_uni(req,conn,deps);
    // Reusa EXACTAMENTE los criterios de identidad/alcance de la tabla F4.
    const where=buildVerifiedZone1Where_uni(verified);
    const placeholders=data.ids.map(()=>'?').join(', ');
    const [rows]=await conn.query(
      'SELECT CAST(z.`id_mp_zona_1` AS CHAR) AS id_mp_zona_1, '+
      'CAST(z.`id_dmp` AS CHAR) AS id_dmp, '+
      `CAST(z.\`${data.field}\` AS CHAR) AS original_value `+
      'FROM `detalle_mp_2026_zona_1` z '+
      'INNER JOIN `detalle_mp_2026` mp ON mp.`id_dmp` = z.`id_dmp` '+
      `WHERE ${where} AND z.\`id_mp_zona_1\` IN (${placeholders}) `+
      'ORDER BY z.`id_mp_zona_1` ASC FOR UPDATE',data.ids);
    if(!Array.isArray(rows)||rows.length!==data.ids.length)
      throw failMp_uni(404,'MP_ZONA1_LOTE_FUERA_ALCANCE',
        'Alguna fila no existe, carece de identidad verificable o esta fuera de alcance.');
    const indexed=new Map();
    for(const row of rows){
      const id=String(row?.id_mp_zona_1??''),mp=String(row?.id_dmp??'');
      if(!data.ids.includes(id)||indexed.has(id)||!/^[1-9]\d*$/.test(mp))
        throw failMp_uni(409,'MP_ZONA1_LOTE_FILAS_CONFLICTIVAS','Respuesta de filas no confiable.');
      indexed.set(id,row);
    }
    // Preflight de TODO el lote ANTES del primer UPDATE.
    for(const id of data.ids){
      const old=indexed.get(id);
      if(!old)throw failMp_uni(409,'MP_ZONA1_LOTE_FILAS_CONFLICTIVAS','Falta una fila del lote.');
      const before=old.original_value===undefined?null:old.original_value;
      if(invoiceValue_uni(data.field,before,false)!==data.expected[id])
        throw failMp_uni(409,'MP_ZONA1_CONFLICTO_CONCURRENCIA',
          'El valor de una celda cambio. Vuelve a cargar el lote.',{id,field:data.field});
    }
    const results=[];
    for(const id of data.ids){
      const row=indexed.get(id),before=row.original_value??null;
      const changed=invoiceValue_uni(data.field,before,false)!==data.value;
      if(changed){
        const [updated]=await conn.query(
          `UPDATE \`detalle_mp_2026_zona_1\` z SET z.\`${data.field}\` = ? `+
          'WHERE z.`id_mp_zona_1` = ? AND z.`id_dmp` = ?',
          [data.value,id,row.id_dmp]);
        if(Number(updated?.affectedRows)!==1)
          throw failMp_uni(409,'MP_ZONA1_CAMBIO_CONFLICTIVO','Lote no confirmado. Rollback.');
        await (deps.auditRecorder||auditZone1_uni)(req,{operation:'edit',actor,
          id_dmp:row.id_dmp,id_mp_zona_1:id,field:data.field,
          before,after:data.value},conn);
      }
      results.push({id_mp_zona_1:id,id_dmp:row.id_dmp,changed});
    }
    await conn.commit();transaction=false;
    return {ok:true,table:'detalle_mp_2026_zona_1',operation:'bulk',field:data.field,
      total:results.length,changed:results.filter(x=>x.changed).length,results};
  }catch(error){
    if(transaction){try{await conn.rollback();}catch(_rollback){error.rollbackFailed=true;}}
    throw error;
  }finally{if(!deps.connection)conn.release();}
}
module.exports=Object.freeze({normalizeBulkZone1_uni,editBulkZone1Excel_uni});

'use strict';
// [BLT NOW | 2026-10-23 | MP ZONA1 FASE 8 V001]
// Planchado inicial M2M autorizado: SOLO INSERT, nunca UPSERT ni UPDATE.
// No reutiliza la puerta de edicion humana ni modifica el trigger GAS actual.
const db = require('../../config/db');
const scope = require('../../services/cobranza-uni-scope.service');
const {MP_ZONE1_META_UNI} = require('./cobranza-uni-administracion.mp-contract');
const {normalizeBatch,SHEET_FIELDS,identity,canonicalValue} =
  require('./cobranza-uni-administracion.mp-zona1-import-validation');
const {failMp_uni} = require('./cobranza-uni-administracion.mp-edit-validation');

const COLUMNS_SQL = SHEET_FIELDS.map(name=>'`'+name+'`').join(', ');
const VALUES_SQL = SHEET_FIELDS.map(()=>'?').join(', ');
const INSERT_SQL = 'INSERT INTO `detalle_mp_2026_zona_1` (`id_dmp`, '+COLUMNS_SQL+') VALUES (?, '+VALUES_SQL+')';
const ZONE_FIELDS_SQL = SHEET_FIELDS.map(name=>'z.`'+name+'`').join(', ');

function enabled(name){return String(process.env[name]||'').trim().toLowerCase()==='true';}
function writeGate(){
  return enabled('MP_ZONA1_INITIAL_IMPORT_ENABLED') &&
    enabled('MP_ZONA1_INITIAL_IMPORT_CONFIRMED');
}
function fail(status,code,message,details){return failMp_uni(status,code,message,details);}
async function schemaReady(conn){
  const [cols]=await conn.query(
    'SELECT COUNT(*) AS total FROM information_schema.COLUMNS '+
    'WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?', ['detalle_mp_2026_zona_1']);
  const [keys]=await conn.query(
    'SELECT COUNT(*) AS total FROM information_schema.KEY_COLUMN_USAGE '+
    'WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? '+
    'AND REFERENCED_TABLE_NAME = ? AND REFERENCED_COLUMN_NAME = ?',
    ['detalle_mp_2026_zona_1','id_dmp','detalle_mp_2026','id_dmp']);
  const [uniques]=await conn.query(
    'SELECT COUNT(*) AS total FROM information_schema.STATISTICS '+
    'WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? '+
    'AND COLUMN_NAME = ? AND NON_UNIQUE = 0',
    ['detalle_mp_2026_zona_1','uq_mp_zona1_id_dmp','id_dmp']);
  if(Number(cols?.[0]?.total)!==MP_ZONE1_META_UNI.totalColumns ||
     Number(keys?.[0]?.total)!==1 || Number(uniques?.[0]?.total)!==1)
    throw fail(409,'MPZ1_IMPORT_SCHEMA_MISMATCH',
      'La estructura, FK o indice UNIQUE de Zona 1 no coincide con la Fase 1.');
}
async function readParents(conn,ids,locked,service){
  const canonical=service.canonicalProjectSql_uni('mp');
  if(typeof canonical!=='string'||!canonical.trim())
    throw fail(409,'MPZ1_IMPORT_IDENTITY_SERVICE_UNAVAILABLE','Identidad oficial no disponible.');
  const parameters=ids.map(()=>'?').join(', ');
  const [rows]=await conn.query(
    'SELECT CAST(mp.`id_dmp` AS CHAR) AS id_dmp, mp.`proyecto`, mp.`idns`, mp.`cliente`, '+
    '('+canonical+') AS proyecto_oficial FROM `detalle_mp_2026` mp '+
    'WHERE mp.`id_dmp` IN ('+parameters+') ORDER BY mp.`id_dmp` ASC'+
    (locked?' FOR UPDATE':''),ids);
  if(!Array.isArray(rows))throw new Error('Consulta de MP devolvio una respuesta no valida.');
  const map=new Map();
  for(const row of rows){
    const id=String(row.id_dmp);
    if(map.has(id))throw fail(409,'MPZ1_IMPORT_PARENT_AMBIGUOUS','Consecutivo MP duplicado.');
    map.set(id,row);
  }
  return map;
}
async function readExistingBatch(conn,ids,locked){
  if(!ids.length)return new Map();
  const parameters=ids.map(()=>'?').join(', ');
  const [rows]=await conn.query(
    'SELECT CAST(z.`id_dmp` AS CHAR) AS id_dmp, '+ZONE_FIELDS_SQL+
    ' FROM `detalle_mp_2026_zona_1` z WHERE z.`id_dmp` IN ('+parameters+') '+
    'ORDER BY z.`id_dmp` ASC'+(locked?' FOR UPDATE':''),ids);
  if(!Array.isArray(rows))throw new Error('Consulta de Zona 1 devolvio una respuesta no valida.');
  const map=new Map();
  for(const row of rows){
    const id=String(row.id_dmp);
    if(map.has(id))throw fail(409,'MPZ1_IMPORT_DUPLICATE_EXISTING',
      'La relacion Zona 1 es ambigua.');
    map.set(id,row);
  }
  return map;
}
function rowStatus(row,parent,existing){
  const info={sheet_row:row.sheet_row,id_dmp:row.id_dmp};
  if(!parent)return {...info,status:'missing_mp'};
  // Autorizacion: incluso M2M debe comprobar identidad oficial del registro.
  if(!identity(parent.proyecto_oficial)||!identity(parent.proyecto)||
     identity(parent.proyecto)!==identity(row.data.proyecto)||
     !identity(parent.idns)||identity(parent.idns)!==identity(row.data.idns)||
     (identity(parent.cliente)&&identity(row.data.cliente)&&
       identity(parent.cliente)!==identity(row.data.cliente)))
    return {...info,status:'identity_conflict'};
  if(!existing)return {...info,status:'ready_to_insert'};
  let differences=0;
  for(const field of SHEET_FIELDS){
    const actual=existing[field]??null;
    // Comparacion exacta decimal/string: nunca convertir importes grandes a Number.
    const equal=canonicalValue(field,actual)===row.data[field];
    if(!equal)differences++;
  }
  return differences===0?{...info,status:'already_imported'}:
    {...info,status:'existing_conflict',different_fields:differences};
}
async function importInitialZone1_uni(body,deps={}){
  const input=normalizeBatch(body);
  if(input.mode==='import' && !(deps.featureEnabled??writeGate()))
    throw fail(403,'MPZ1_IMPORT_DISABLED',
      'La importacion inicial no esta autorizada en servidor. El GAS existente debe permanecer activo.');
  const conn=deps.connection||await db.getConnection();
  let transaction=false;
  try{
    if(input.mode==='import'){await conn.beginTransaction();transaction=true;}
    await (deps.schemaCheck||schemaReady)(conn);
    const canonical=deps.scopeService||scope;
    // Una consulta de MP y otra de Zona 1 por lote (max. 20), no 40 SELECT.
    // IDs ordenados para minimizar contencion mientras se mantienen locks.
    const ids=input.rows.map(item=>item.id_dmp);
    const parents=await readParents(conn,ids,transaction,canonical);
    const existing=await readExistingBatch(conn,ids.filter(id=>parents.has(id)),transaction);
    const results=input.rows.map(item=>rowStatus(item,
      parents.get(item.id_dmp)||null,existing.get(item.id_dmp)||null));
    const blocked=results.filter(row=>!['ready_to_insert','already_imported'].includes(row.status));
    if(blocked.length && transaction)
      throw fail(409,'MPZ1_IMPORT_CONFLICT',
        'Lote no conciliado: ningun registro del lote fue insertado.',{results});
    let created=0;
    if(input.mode==='import'){
      for(let index=0;index<results.length;index++){
        if(results[index].status!=='ready_to_insert')continue;
        const row=input.rows[index];
        const values=[row.id_dmp,...SHEET_FIELDS.map(name=>row.data[name])];
        const [result]=await conn.query(INSERT_SQL,values);
        if(Number(result?.affectedRows)!==1)
          throw fail(409,'MPZ1_IMPORT_INSERT_UNCONFIRMED','La insercion no fue confirmada.');
        results[index]={...results[index],status:'created'};
        created++;
      }
      await conn.commit();transaction=false;
      console.info('[MPZ1_F8_IMPORT]',JSON.stringify({
        batch_id_prefix:input.batch_id.slice(0,12),received:results.length,created,
        existing:results.filter(row=>row.status==='already_imported').length
      }));
    }
    return {ok:true,table:'detalle_mp_2026_zona_1',source:'sheets_m2m',
      mode:input.mode==='import'?'insert_only':'preview_only',
      batch_id:input.batch_id,readonly:input.mode==='preview',
      ready:blocked.length===0,total:results.length,created,
      already_imported:results.filter(row=>row.status==='already_imported').length,
      results};
  }catch(error){
    if(transaction){try{await conn.rollback();}catch(_rollback){error.rollbackFailed=true;}}
    if(error?.code==='ER_DUP_ENTRY')throw fail(409,'MPZ1_IMPORT_CONCURRENT_DUPLICATE',
      'Otro envio creo la fila durante el planchado. Reintenta el lote para conciliar.');
    throw error;
  }finally{if(!deps.connection)conn.release();}
}
module.exports=Object.freeze({importInitialZone1_uni,writeGate,
  _test:Object.freeze({rowStatus,schemaReady,INSERT_SQL})});

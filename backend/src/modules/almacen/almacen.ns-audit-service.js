'use strict';

// [BLT NOW | 2026-10-19 | ALMACEN NS | FASE 1]
// La tabla almacen_auditoria se conserva; las muestras nuevas proceden solo
// del cierre NetSuite publicado activo. Ninguna FK hacia el Excel retirado.

const crypto = require('crypto');
const db = require('../../config/db');
const { mexicoCityDate } = require('../../utils/temporal');
const ns = require('./almacen.ns-query-service');

const TABLE='almacen_auditoria';
const OPEN_STATUSES=new Set(['BORRADOR','EN_PROCESO','REVISADA']);
function fail(message,status=400,code='ALMACEN_NS_AUDIT_ERROR'){
  const e=new Error(message);e.status=status;e.code=code;return e;
}
function folioCode(value){
  const folio=String(value||'').trim();
  if(!folio||folio.length>50||!/^[A-Z0-9_-]+$/i.test(folio))throw fail('Folio de auditoria invalido.');
  return folio;
}
function userId(req){
  const user=req?.contextUser||req?.user||{};
  const id=Number(user.id_SB||user.id||user.user_id);
  if(!Number.isInteger(id)||id<=0)throw fail('Usuario efectivo invalido.',401);
  return id;
}
function dec(value){return value==null?null:Number(value);}
function numeric(value){
  if(value==null||value==='')return null;
  const n=Number(value);
  if(!Number.isFinite(n)||n<0)throw fail('La existencia fisica debe ser un numero no negativo.',422);
  return n;
}
function note(value){
  if(value==null)return null;
  const s=String(value).trim();
  if(s.length>4000)throw fail('Las observaciones exceden 4000 caracteres.',422);
  return s||null;
}
function calc(rows){
  let completed=0,exact=0,expectedPieces=0,foundPieces=0,valued=0,valueDifference=0;
  for(const row of rows){
    const expected=Number(row.existenciaEsperada||0);expectedPieces+=expected;
    if(row.existenciaFisica==null)continue;
    const found=Number(row.existenciaFisica);foundPieces+=found;completed++;
    if(Math.abs(found-expected)<1e-9)exact++;
    if(row.valorDiferencia!=null){valued++;valueDifference+=Number(row.valorDiferencia);}
  }
  return {total:rows.length,completed,exact,pending:rows.length-completed,
    matchPercent:rows.length?100*exact/rows.length:0,
    expectedPieces,foundPieces,pieceDifference:foundPieces-expectedPieces,valued,valueDifference};
}

async function allowedCompanies(scope,conn=db){
  const names=new Set(scope.domain==='CORELLIAN'?['Corellian']:['United']);
  const [rows]=await conn.query(
    'SELECT DISTINCT subsidiaria FROM almacen_ns_inventario WHERE id_subsidiaria_ns=? AND subsidiaria IS NOT NULL',
    [scope.subsidiaryId]
  );
  for(const row of rows){const name=String(row.subsidiaria||'').trim();if(name)names.add(name);}
  return [...names];
}
function sameAllowed(rows,names){
  if(rows.some(row=>!names.includes(String(row.empresa||'').trim())))
    throw fail('La auditoria incluye una subsidiaria fuera del alcance autorizado.',403,'ALMACEN_NS_AUDIT_SCOPE_DENIED');
}
async function listAudits(scope,query={}){
  const names=await allowedCompanies(scope);
  const condition=['empresa IN (?)'];const params=[names];
  const lot=String(query.loteImportacion||'').trim();
  const status=String(query.estatus||'').trim().toUpperCase();
  if(lot){condition.push('lote_importacion=?');params.push(lot);}
  if(status){condition.push('estatus=?');params.push(status);}
  const limit=Math.floor(Math.min(250,Math.max(1,Number(query.limit)||100))); 
  const [rows]=await db.query(`SELECT folio_auditoria AS folioAuditoria,
      MAX(lote_importacion) AS loteImportacion,MAX(fecha_corte) AS fechaCorte,
      MAX(empresa) AS empresa,MAX(almacen) AS almacen,MAX(estatus) AS estatus,
      COUNT(*) AS referencias,SUM(CASE WHEN existencia_fisica IS NOT NULL THEN 1 ELSE 0 END) AS capturadas,
      SUM(existencia_esperada) AS existenciaEsperada,COALESCE(SUM(existencia_fisica),0) AS existenciaFisica,
      COALESCE(SUM(diferencia),0) AS diferencia,COALESCE(SUM(valor_diferencia),0) AS valorDiferencia,
      MAX(auditado_por) AS auditadoPor,MAX(fecha_inicio) AS fechaInicio,
      MAX(fecha_cierre) AS fechaCierre,MAX(updated_at) AS updatedAt
    FROM ${TABLE} WHERE ${condition.join(' AND ')}
    GROUP BY folio_auditoria ORDER BY MAX(fecha_inicio) DESC LIMIT ?`,[...params,limit]);
  return {ok:true,rows:rows.map(row=>({
    ...row,referencias:Number(row.referencias||0),capturadas:Number(row.capturadas||0),
    existenciaEsperada:Number(row.existenciaEsperada||0),existenciaFisica:Number(row.existenciaFisica||0),
    diferencia:Number(row.diferencia||0),valorDiferencia:Number(row.valorDiferencia||0)
  }))};
}

async function getAudit(scope,folioValue,conn=db){
  const folio=folioCode(folioValue);
  const names=await allowedCompanies(scope,conn);
  // Primero comprobar que ninguna fila del folio cruza dominios; fail closed.
  const [companies]=await conn.query(`SELECT DISTINCT empresa FROM ${TABLE} WHERE folio_auditoria=?`,[folio]);
  if(!companies.length)throw fail('La auditoria solicitada no existe.',404);
  sameAllowed(companies,names);
  const [rows]=await conn.query(`SELECT id_auditoria AS idAuditoria,
      folio_auditoria AS folioAuditoria,lote_importacion AS loteImportacion,
      fecha_corte AS fechaCorte,empresa,almacen,codigo_articulo AS codigo,articulo,categoria,
      unidad_medida AS unidadMedida,existencia_esperada AS existenciaEsperada,
      precio_unitario AS precioUnitario,valor_esperado AS valorEsperado,
      existencia_fisica AS existenciaFisica,diferencia,valor_diferencia AS valorDiferencia,
      observaciones,estatus,auditado_por AS auditadoPor,cerrado_por AS cerradoPor,
      fecha_inicio AS fechaInicio,fecha_cierre AS fechaCierre,
      created_at AS createdAt,updated_at AS updatedAt
    FROM ${TABLE} WHERE folio_auditoria=? ORDER BY id_auditoria`,[folio]);
  if(!rows.length)throw fail('La auditoria solicitada no existe.',404);
  sameAllowed(rows,names);
  const items=rows.map(r=>({...r,idAuditoria:Number(r.idAuditoria),
    existenciaEsperada:Number(r.existenciaEsperada||0),precioUnitario:dec(r.precioUnitario),
    valorEsperado:dec(r.valorEsperado),existenciaFisica:dec(r.existenciaFisica),
    diferencia:dec(r.diferencia),valorDiferencia:dec(r.valorDiferencia)}));
  const x=items[0];
  return {ok:true,audit:{folioAuditoria:x.folioAuditoria,loteImportacion:x.loteImportacion,
    fechaCorte:x.fechaCorte,empresa:x.empresa,almacen:x.almacen,estatus:x.estatus,
    auditadoPor:x.auditadoPor,cerradoPor:x.cerradoPor,fechaInicio:x.fechaInicio,
    fechaCierre:x.fechaCierre,items,metrics:calc(items)}};
}

async function createAudit(scope,input={},req){
  const user=userId(req);
  const company=String(input.company||input.empresa||'').trim();
  const warehouse=String(input.warehouse||input.almacen||'').trim();
  if(!company||!warehouse)throw fail('Empresa y almacen son requeridos.',400);
  const sampleResult=await ns.getAuditSample(scope,{...input,company,warehouse});
  const sample=sampleResult.sample;
  if(!sample?.items?.length)throw fail('No existe muestra de inventario NetSuite disponible.',422);
  const allowed=await allowedCompanies(scope);
  if(!allowed.includes(company))throw fail('Subsidiaria no autorizada.',403);
  const folio=`AUD-${mexicoCityDate().replace(/-/g,'')}-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
  const conn=await db.getConnection();
  try{
    await conn.beginTransaction();
    const sql=`INSERT INTO ${TABLE}
      (folio_auditoria,lote_importacion,fecha_corte,empresa,almacen,codigo_articulo,
      articulo,categoria,unidad_medida,existencia_esperada,precio_unitario,
      valor_esperado,existencia_fisica,observaciones,estatus,auditado_por,
      fecha_inicio,created_by,updated_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NULL,NULL,'EN_PROCESO',?,CURRENT_TIMESTAMP,?,?)`;
    for(const item of sample.items){
      if(!allowed.includes(item.company)||item.warehouse!==warehouse)throw fail('La muestra incluye un renglon fuera del alcance.',403);
      await conn.query(sql,[folio,sample.loteImportacion,sample.fechaCorte||null,
        item.company,item.warehouse,item.code||null,item.article||'Sin descripcion',
        item.category||null,null,Number(item.expected||0),
        item.unitValue==null?null:Number(item.unitValue),
        item.expectedValue==null?null:Number(item.expectedValue),user,user,user]);
    }
    await conn.commit();
  }catch(e){try{await conn.rollback();}catch(_){}throw e;}finally{conn.release();}
  return getAudit(scope,folio);
}

async function updateAuditItem(scope,folioValue,idValue,input={},req){
  const folio=folioCode(folioValue),id=Number(idValue),user=userId(req);
  if(!Number.isInteger(id)||id<=0)throw fail('Renglon de auditoria invalido.',400);
  const physical=numeric(input.existenciaFisica??input.found),observations=note(input.observaciones);
  const conn=await db.getConnection();
  try{
    await conn.beginTransaction();
    const names=await allowedCompanies(scope,conn);
    const [all]=await conn.query(`SELECT empresa FROM ${TABLE} WHERE folio_auditoria=? FOR UPDATE`,[folio]);
    if(!all.length)throw fail('La auditoria no existe.',404);
    sameAllowed(all,names);
    const [rows]=await conn.query(`SELECT estatus,empresa FROM ${TABLE}
      WHERE id_auditoria=? AND folio_auditoria=? FOR UPDATE`,[id,folio]);
    if(!rows.length)throw fail('El renglon solicitado no existe.',404);
    sameAllowed(rows,names);
    if(!OPEN_STATUSES.has(String(rows[0].estatus||'').toUpperCase()))throw fail('La auditoria ya no admite cambios.',409);
    await conn.query(`UPDATE ${TABLE} SET existencia_fisica=?,observaciones=?,estatus='EN_PROCESO',updated_by=?
      WHERE id_auditoria=? AND folio_auditoria=?`,[physical,observations,user,id,folio]);
    await conn.commit();
  }catch(e){try{await conn.rollback();}catch(_){}throw e;}finally{conn.release();}
  return getAudit(scope,folio);
}

async function closeAudit(scope,folioValue,req){
  const folio=folioCode(folioValue),user=userId(req);
  const conn=await db.getConnection();
  try{
    await conn.beginTransaction();
    const names=await allowedCompanies(scope,conn);
    const [rows]=await conn.query(`SELECT estatus,empresa,existencia_fisica
      FROM ${TABLE} WHERE folio_auditoria=? FOR UPDATE`,[folio]);
    if(!rows.length)throw fail('La auditoria no existe.',404);
    sameAllowed(rows,names);
    if(rows.some(r=>r.estatus==='CANCELADA'||r.estatus==='CERRADA'))throw fail('La auditoria ya esta cancelada o cerrada.',409);
    const pending=rows.filter(r=>r.existencia_fisica==null).length;
    if(pending)throw fail(`Completa todos los conteos antes de cerrar (${pending} pendientes).`,422);
    await conn.query(`UPDATE ${TABLE} SET estatus='CERRADA',cerrado_por=?,fecha_cierre=CURRENT_TIMESTAMP,
      updated_by=? WHERE folio_auditoria=?`,[user,user,folio]);
    await conn.commit();
  }catch(e){try{await conn.rollback();}catch(_){}throw e;}finally{conn.release();}
  return getAudit(scope,folio);
}

module.exports={listAudits,getAudit,createAudit,updateAuditItem,closeAudit};

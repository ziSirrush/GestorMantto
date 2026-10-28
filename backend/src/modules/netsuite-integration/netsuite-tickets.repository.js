'use strict';
// Receptor TICKETS: DML permitido EXCLUSIVAMENTE en ns_tickets_pruebas.
// DDL inexistente en sabana 07/10/2026: exige precheck de esquema vivo ANTES de escribir.
const mapping=require('./netsuite-tickets.mapping');
const TABLE='ns_tickets_pruebas';
const CHUNK_ROWS=50;
const LOOKUP_CHUNK_ROWS=500;
const TEXT_TYPES=new Set(['char','varchar','text','tinytext','mediumtext','longtext']);
const DATE_TYPES=new Set(['datetime','timestamp']);
const DECIMAL_TYPES=new Set(['decimal','numeric']);
const DATES=new Set(mapping.DATES.map(([name])=>name));
function blocked(reason='estructura no validada') {
  return mapping.invalid('No se escribio en ns_tickets_pruebas: '+reason,503,'NS_TICKETS_SCHEMA_BLOCKED');
}
function pool() {return require('../../config/db');}
async function preflight(database=pool()) {
  const [tables]=await database.query(`
    SELECT ENGINE FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ns_tickets_pruebas'`);
  if (!Array.isArray(tables) || tables.length!==1 ||
      String(tables[0].ENGINE).toUpperCase()!=='INNODB') throw blocked('tabla inexistente o no InnoDB');

  const [cols]=await database.query(`
    SELECT COLUMN_NAME,DATA_TYPE,CHARACTER_MAXIMUM_LENGTH,
      NUMERIC_PRECISION,NUMERIC_SCALE,EXTRA,IS_NULLABLE,COLUMN_DEFAULT
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ns_tickets_pruebas'`);
  const byName=new Map((cols||[]).map(c=>[c.COLUMN_NAME,c]));
  const id=byName.get('id');
  if (!id || !/auto_increment/i.test(String(id.EXTRA||''))) throw blocked('PK id autoincremental ausente');
  const result=new Map();
  for (const name of mapping.COLUMNS) {
    const info=byName.get(name),type=String(info?.DATA_TYPE||'').toLowerCase();
    if (!info) throw blocked('columna ausente: '+name);
    if (DATES.has(name)) {
      if (!DATE_TYPES.has(type)) throw blocked('columna fecha incompatible: '+name);
      result.set(name,{type:'date'});
    } else if (mapping.NUMERIC.has(name)) {
      const precision=Number(info.NUMERIC_PRECISION),scale=Number(info.NUMERIC_SCALE);
      if (!DECIMAL_TYPES.has(type) || !Number.isInteger(precision) || !Number.isInteger(scale) ||
          precision<=scale || scale<0) throw blocked('columna decimal incompatible: '+name);
      result.set(name,{type:'decimal',precision,scale});
    } else {
      const max=Number(info.CHARACTER_MAXIMUM_LENGTH);
      if (!TEXT_TYPES.has(type) || !(max>=1)) throw blocked('columna texto incompatible: '+name);
      result.set(name,{type:'text',max});
    }
  }
  if (String(byName.get('ticket').IS_NULLABLE).toUpperCase()!=='NO') {
    throw blocked('ticket debe ser NOT NULL');
  }
  // Evitar DML con columnas obligatorias no cubiertas por el contrato.
  for (const c of cols||[]) {
    if (c.COLUMN_NAME==='id' || mapping.COLUMNS.includes(c.COLUMN_NAME)) continue;
    if (String(c.IS_NULLABLE).toUpperCase()==='NO' && c.COLUMN_DEFAULT==null &&
        !/auto_increment|generated/i.test(String(c.EXTRA||''))) {
      throw blocked('columna obligatoria no mapeada: '+c.COLUMN_NAME);
    }
  }
  const [indexes]=await database.query(`
    SELECT INDEX_NAME,NON_UNIQUE,COLUMN_NAME,SEQ_IN_INDEX
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ns_tickets_pruebas'`);
  const groups=new Map();
  for (const i of indexes||[]) {
    if (!groups.has(i.INDEX_NAME)) groups.set(i.INDEX_NAME,[]);
    groups.get(i.INDEX_NAME).push(i);
  }
  const primary=groups.get('PRIMARY')||[];
  if (primary.length!==1 || primary[0].COLUMN_NAME!=='id') throw blocked('PRIMARY KEY debe ser id');
  if (![...groups.entries()].some(([name,rows])=>name!=='PRIMARY' && rows.length===1 &&
      Number(rows[0].NON_UNIQUE)===0 && rows[0].COLUMN_NAME==='ticket')) {
    throw blocked('UNIQUE(ticket) requerido');
  }
  for (const [name,rows] of groups) {
    if (name==='PRIMARY') continue;
    if (rows.some(r=>Number(r.NON_UNIQUE)===0) &&
        !(rows.length===1 && rows[0].COLUMN_NAME==='ticket')) {
      throw blocked('indice UNIQUE adicional ajeno a ticket');
    }
  }
  const [triggers]=await database.query(`
    SELECT TRIGGER_NAME FROM INFORMATION_SCHEMA.TRIGGERS
    WHERE TRIGGER_SCHEMA=DATABASE() AND EVENT_OBJECT_TABLE='ns_tickets_pruebas'`);
  if (!Array.isArray(triggers) || triggers.length>0) throw blocked('triggers no auditados');
  const [foreignKeys]=await database.query(`
    SELECT CONSTRAINT_NAME,REFERENCED_TABLE_NAME
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ns_tickets_pruebas'
      AND REFERENCED_TABLE_NAME IS NOT NULL`);
  if (!Array.isArray(foreignKeys) || foreignKeys.length>0) throw blocked('FKs no auditadas');
  return result;
}
function insertStatement(count) {
  if (!Number.isSafeInteger(count) || count<1 || count>CHUNK_ROWS) throw blocked('fragmento invalido');
  const cols=mapping.COLUMNS.map(name=>'`'+name+'`');
  const fields='('+cols.join(',')+')';
  const params='('+mapping.COLUMNS.map(()=>'?').join(',')+')';
  const changes=mapping.COLUMNS.filter(name=>name!=='ticket').map(name=>{
    const col='`'+name+'`';
    return `${col}=COALESCE(VALUES(${col}),${col})`;
  }).join(',');
  return `INSERT INTO \`${TABLE}\` ${fields} VALUES ${Array(count).fill(params).join(',')} `+
    `ON DUPLICATE KEY UPDATE ${changes}`;
}
async function publishRows(rows,database=pool(),shouldContinue=()=>true) {
  if (!Array.isArray(rows) || rows.length<1 || rows.length>10000) {
    throw mapping.invalid('Volumen de Tickets fuera del limite.',422,'NS_TICKETS_ROW_LIMIT');
  }
  if (!shouldContinue()) throw mapping.invalid('Carga Tickets no autorizada.',503,'NS_TICKETS_PAUSED');
  await preflight(database);
  const connection=await database.getConnection();
  let inTransaction=false;
  try {
    if (!shouldContinue()) throw mapping.invalid('Carga Tickets no autorizada.',503,'NS_TICKETS_PAUSED');
    await connection.beginTransaction();inTransaction=true;
    // Comprobar identidades ANTES del primer INSERT y en grupos de 500
    // para limitar viajes a Aiven sin generar un IN de 10,000 placeholders.
    for (let i=0;i<rows.length;i+=LOOKUP_CHUNK_ROWS) {
      if (!shouldContinue()) throw mapping.invalid('Tickets deshabilitado durante validacion.',503,'NS_TICKETS_PAUSED');
      const batch=rows.slice(i,i+LOOKUP_CHUNK_ROWS),tickets=batch.map(row=>row.ticket);
      const lookup=`SELECT \`ticket\`,\`id_interno\` FROM \`${TABLE}\` `+
        `WHERE \`ticket\` IN (${tickets.map(()=>'?').join(',')}) FOR UPDATE`;
      const [existing]=await connection.execute(lookup,tickets);
      const incoming=new Map(batch.map(row=>[row.ticket,row.id_interno]));
      for (const old of existing||[]) {
        if (old.id_interno!=null && String(old.id_interno).trim() &&
            String(old.id_interno).trim()!==incoming.get(old.ticket)) {
          throw mapping.invalid('Ticket existente corresponde a otro ID de NetSuite.',409,'NS_TICKETS_ID_CONFLICT');
        }
      }
    }
    for (let i=0;i<rows.length;i+=CHUNK_ROWS) {
      if (!shouldContinue()) throw mapping.invalid('Tickets deshabilitado durante publicacion.',503,'NS_TICKETS_PAUSED');
      const chunk=rows.slice(i,i+CHUNK_ROWS);
      const params=chunk.flatMap(row=>mapping.COLUMNS.map(name=>row[name]));
      await connection.execute(insertStatement(chunk.length),params);
    }
    if (!shouldContinue()) throw mapping.invalid('Tickets deshabilitado antes del COMMIT.',503,'NS_TICKETS_PAUSED');
    await connection.commit();inTransaction=false;
    return {filasConfirmadas:rows.length};
  } catch (error) {
    if (inTransaction) {
      try {await connection.rollback();}
      catch (rollbackError) {console.error('[NS_TICKETS_ROLLBACK_ERROR]',rollbackError.code||'UNKNOWN');}
    }
    throw error;
  } finally {connection.release();}
}
module.exports={TABLE,CHUNK_ROWS,LOOKUP_CHUNK_ROWS,preflight,insertStatement,publishRows};

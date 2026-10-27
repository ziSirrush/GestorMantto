'use strict';
// Tests sin red, MySQL real, Azure ni NetSuite. Solo contrato, staging y transacciones simuladas.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mapping = require('../src/modules/netsuite-integration/netsuite-portafolio.mapping');
const repository = require('../src/modules/netsuite-integration/netsuite-portafolio.repository');
const { createReceiver } = require('../src/modules/netsuite-integration/netsuite-portafolio.receiver');

const uuid='9fe679ae-cd0c-4ba3-93d5-b30a55f89a4d';
const savedSearch='customsearch_ns_portafolio_all';
const hash=object => crypto.createHash('sha256').update(typeof object === 'string'?object:JSON.stringify(object)).digest('hex');
const columns=mapping.FIELD_MAP.map((f,i)=>({indice:i,nombre:f.name,join:f.join||null,summary:null,label:null}));
const env={NS_PORTAFOLIO_WRITE_ENABLED:process.env.NS_PORTAFOLIO_WRITE_ENABLED,
  NS_PORTAFOLIO_SEARCH_ID:process.env.NS_PORTAFOLIO_SEARCH_ID,
  NS_PORTAFOLIO_DATE_FORMAT:process.env.NS_PORTAFOLIO_DATE_FORMAT};
process.env.NS_PORTAFOLIO_WRITE_ENABLED='true';
process.env.NS_PORTAFOLIO_SEARCH_ID=savedSearch;
process.env.NS_PORTAFOLIO_DATE_FORMAT='DD/MM/YYYY';
process.once('exit',()=>{
  for(const [key,value] of Object.entries(env)){
    if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
});
const fullLengths=()=>new Map(mapping.COLUMNS.map(key=>[key,255]));
function row(id,position=id){
  return { posicion:position,idOrigen:String(id),tipoOrigen:'customer',
    valores:mapping.FIELD_MAP.map(f=>{
      if(f.column==='numero_equipo')return 'EQ-'+id;
      if(f.column==='id_equipo_ns')return 'NS-'+id;
      if(f.column==='inactivo')return false;
      if(f.column.startsWith('fecha_') || f.column==='termino_garantia')return '27/10/2026';
      return 'Valor de prueba';
    }) };
}
function begin(count=2,id=uuid){return {versionContrato:1,loteId:id,origen:'NETSUITE',
  dataset:'PORTAFOLIO',modoCarga:'COMPLETA',busquedaGuardada:savedSearch,
  fechaExtraccionUtc:'2026-10-27T16:00:00.000Z',filasEsperadas:count,
  tamanoPagina:300,paginasEsperadas:Math.ceil(count/300),columnas:columns};}
function page(n,rows){return {pagina:n,filas:rows,hashPagina:hash(rows)};}
function finish(start,pages){return {loteId:start.loteId,filasEsperadas:start.filasEsperadas,
  paginasEsperadas:start.paginasEsperadas,hashCarga:hash(pages.map(p=>p.hashPagina).join('\n'))};}
function fakeRepository(){
  const state={commits:[], preflights:0};
  return {state, preflight:async()=>{state.preflights++;return fullLengths();},
    publishRows:async(rows,_db,gate)=>{assert.equal(gate(),true);state.commits.push(rows);
      return {filasConfirmadas:rows.length};}};
}

test('Solo los 53 campos autorizados; desconocidos y repetidos se rechazan',()=>{
  assert.deepEqual(mapping.validateColumns(columns),mapping.COLUMNS);
  const wrong=columns.map(c=>({...c}));wrong[0].nombre='filainventada';
  assert.throws(()=>mapping.validateColumns(wrong),/inesperado/);
  wrong[0].nombre=columns[1].nombre;wrong[0].join=columns[1].join;
  assert.throws(()=>mapping.validateColumns(wrong),/repetido/);
});

test('Filas: valida claves, booleanos, fechas, longitud y omite valores vacios',()=>{
  const obj=mapping.convertRow(row(1),mapping.validateColumns(columns),fullLengths(),'DD/MM/YYYY');
  assert.equal(obj.numero_equipo,'EQ-1');
  assert.equal(obj.id_equipo_ns,'NS-1');
  assert.equal(obj.inactivo,'0');
  const flag=row(1);flag.valores[mapping.COLUMNS.indexOf('inactivo')]='F';
  assert.equal(mapping.convertRow(flag,mapping.COLUMNS,fullLengths(),'DD/MM/YYYY').inactivo,'0');
  flag.valores[mapping.COLUMNS.indexOf('inactivo')]='N/D';
  assert.throws(()=>mapping.convertRow(flag,mapping.COLUMNS,fullLengths(),'DD/MM/YYYY'),
    err=>err.code==='NS_PORTAFOLIO_BOOL_INVALID');
  assert.equal(obj.fecha_instalacion,'27/10/2026');
  const bad=row(1);bad.valores.pop();
  assert.throws(()=>mapping.convertRow(bad,mapping.COLUMNS,fullLengths(),'DD/MM/YYYY'),/Cantidad de valores/);
  const bad2=row(1);bad2.valores[0]='x'.repeat(256);
  assert.throws(()=>mapping.convertRow(bad2,mapping.COLUMNS,fullLengths(),'DD/MM/YYYY'),/supera longitud/);
  assert.equal(mapping.convertRow(row(1),mapping.COLUMNS,fullLengths(),'DD/MM/YYYY').categoria,'Valor de prueba');
});

test('Fechas USA se normalizan con configuracion explicita; fechas invalidas no pasan',()=>{
  const us=row(3);
  for(const [i,c] of mapping.COLUMNS.entries()){
    if(['fecha_instalacion','fecha_entrega','termino_garantia','fecha_recepcion_mantenimiento','fecha_ingreso_portafolio'].includes(c))
      us.valores[i]='10/27/2026';
  }
  const obj=mapping.convertRow(us,mapping.COLUMNS,fullLengths(),'MM/DD/YYYY');
  assert.equal(obj.fecha_entrega,'27/10/2026');
  assert.throws(()=>mapping.convertRow(us,mapping.COLUMNS,fullLengths(),'DD/MM/YYYY'),/Fecha NS invalida/);
});

test('Lote completo en staging y una sola publicacion atomica al finalizar',async()=>{
  const db=fakeRepository();const receiver=createReceiver({repository:()=>db});
  const b=begin();const p=page(1,[row(1),row(2)]);
  assert.equal(receiver.status().persistenciaHabilitada,true);
  const start=await receiver.begin(b);
  assert.equal(start.estado,'RECIBIENDO');
  await receiver.begin(b); // begin repetido por cada tarea MAP: idempotente.
  const ack=await receiver.page(b.loteId,p);
  assert.equal(ack.estado,'PAGINA_RECIBIDA');
  await receiver.page(b.loteId,p); // reintento de pagina sin duplicacion.
  assert.equal(db.state.commits.length,0,'No debe escribir antes de FINALIZAR');
  const f=finish(b,[p]);
  const result=await receiver.finish(b.loteId,f);
  assert.equal(result.estado,'PUBLICADO');
  assert.equal(db.state.commits.length,1);
  assert.equal(db.state.commits[0].length,2);
  assert.equal((await receiver.finish(b.loteId,f)).estado,'PUBLICADO');
  assert.equal((await receiver.page(b.loteId,p)).estado,'PUBLICADO');
  assert.equal(db.state.commits.length,1,'Finalizacion repetida no escribe nuevamente');
});

test('Lote incompleto nunca escribe y puede recuperarse con pagina faltante',async()=>{
  const db=fakeRepository();const receiver=createReceiver({repository:()=>db});
  const b=begin(301);await receiver.begin(b);
  const first=page(1,Array.from({length:300},(_,i)=>row(i+1)));
  await receiver.page(b.loteId,first);
  const last=page(2,[row(301,301)]);
  await assert.rejects(()=>receiver.finish(b.loteId,finish(b,[first,last])),
    err=>err.code==='NS_PORTAFOLIO_INCOMPLETE');
  assert.equal(db.state.commits.length,0);
  await receiver.page(b.loteId,last);
  assert.equal((await receiver.finish(b.loteId,finish(b,[first,last]))).filasConfirmadas,301);
  assert.equal(db.state.commits.length,1);
});

test('Numero de equipo duplicado entre paginas bloquea el lote sin escribir',async()=>{
  const db=fakeRepository();const receiver=createReceiver({repository:()=>db});
  const b=begin(301);await receiver.begin(b);
  await receiver.page(b.loteId,page(1,Array.from({length:300},(_,i)=>row(i+1))));
  await assert.rejects(()=>receiver.page(b.loteId,page(2,[row(1,301)])),
    err=>err.code==='NS_PORTAFOLIO_DUPLICATE_KEY');
  assert.equal(db.state.commits.length,0);
});

test('Conflictos de pagina, manifiesto SHA y dataset son bloqueados',async()=>{
  const db=fakeRepository();const receiver=createReceiver({repository:()=>db});
  const b=begin(1);await receiver.begin(b);
  const p=page(1,[row(1)]);await receiver.page(b.loteId,p);
  const bad=page(1,[row(2,1)]);
  await assert.rejects(()=>receiver.page(b.loteId,bad),err=>err.code==='NS_PORTAFOLIO_PAGE_CONFLICT');
  const broken=finish(b,[p]);broken.hashCarga='a'.repeat(64);
  await assert.rejects(()=>receiver.finish(b.loteId,broken),err=>err.code==='NS_PORTAFOLIO_BATCH_HASH_MISMATCH');
  assert.equal(db.state.commits.length,0);
  const b2=begin(1,'ed18009e-5427-4f46-8170-5885561f0d13');b2.dataset='TICKETS';
  await assert.rejects(()=>receiver.begin(b2),err=>err.code==='NS_PORTAFOLIO_SOURCE_DENIED');
});

test('Kill switch deshabilita inicio y finalizacion sin escribir',async()=>{
  const db=fakeRepository();const receiver=createReceiver({repository:()=>db});
  const b=begin(1);await receiver.begin(b);
  const p=page(1,[row(1)]);await receiver.page(b.loteId,p);
  process.env.NS_PORTAFOLIO_WRITE_ENABLED='false';
  try {
    await assert.rejects(()=>receiver.finish(b.loteId,finish(b,[p])),
      err=>err.code==='NS_DATASET_DESTINATION_PENDING');
    assert.equal(db.state.commits.length,0);
  } finally {process.env.NS_PORTAFOLIO_WRITE_ENABLED='true';}
});

test('Preflight InnoDB / PK / unique numero_equipo; falla cerrado si falta indice',async()=>{
  const cols=mapping.COLUMNS.map(name=>({COLUMN_NAME:name,DATA_TYPE:'varchar',
    CHARACTER_MAXIMUM_LENGTH:255,EXTRA:'',IS_NULLABLE:name==='numero_equipo'?'NO':'YES'}));
  cols.push({COLUMN_NAME:'id_portafolio',DATA_TYPE:'bigint',EXTRA:'auto_increment'});
  cols.push({COLUMN_NAME:'zona_id',DATA_TYPE:'bigint',EXTRA:''});
  cols.push({COLUMN_NAME:'estado_registro',DATA_TYPE:'tinyint',EXTRA:'',COLUMN_DEFAULT:'1',IS_NULLABLE:'NO'});
  const indexes=[{INDEX_NAME:'PRIMARY',NON_UNIQUE:0,COLUMN_NAME:'id_portafolio',SEQ_IN_INDEX:1},
    {INDEX_NAME:'uq_portafolio_numero_equipo',NON_UNIQUE:0,COLUMN_NAME:'numero_equipo',SEQ_IN_INDEX:1}];
  const fake={async query(sql){if(sql.includes('INFORMATION_SCHEMA.TRIGGERS'))return [[]];return [
    sql.includes('INFORMATION_SCHEMA.TABLES')?[{ENGINE:'InnoDB'}]:
    sql.includes('INFORMATION_SCHEMA.COLUMNS')?cols:indexes]}};
  assert.equal((await repository.preflight(fake)).size,53);
  fake.query=async sql=>[sql.includes('INFORMATION_SCHEMA.TRIGGERS')?[]:sql.includes('INFORMATION_SCHEMA.TABLES')?[{ENGINE:'InnoDB'}]:
    sql.includes('INFORMATION_SCHEMA.COLUMNS')?cols:indexes.slice(0,1)];
  await assert.rejects(()=>repository.preflight(fake),err=>err.code==='NS_PORTAFOLIO_SCHEMA_BLOCKED');
});

test('Persistencia: un unico commit sobre la tabla NS, sin SQL productivo',async()=>{
  const cols=mapping.COLUMNS.map(name=>({COLUMN_NAME:name,DATA_TYPE:'varchar',
    CHARACTER_MAXIMUM_LENGTH:255,EXTRA:'',IS_NULLABLE:name==='numero_equipo'?'NO':'YES'}));
  cols.push({COLUMN_NAME:'id_portafolio',DATA_TYPE:'bigint',EXTRA:'auto_increment'});
  cols.push({COLUMN_NAME:'zona_id',DATA_TYPE:'bigint',EXTRA:''});
  cols.push({COLUMN_NAME:'estado_registro',DATA_TYPE:'tinyint',EXTRA:'',COLUMN_DEFAULT:'1',IS_NULLABLE:'NO'});
  const indexes=[{INDEX_NAME:'PRIMARY',NON_UNIQUE:0,COLUMN_NAME:'id_portafolio',SEQ_IN_INDEX:1},
    {INDEX_NAME:'uq',NON_UNIQUE:0,COLUMN_NAME:'numero_equipo',SEQ_IN_INDEX:1}];
  const calls=[];
  const conn={async beginTransaction(){calls.push('BEGIN');},
    async execute(sql,params){calls.push({sql,params});},async commit(){calls.push('COMMIT');},
    async rollback(){calls.push('ROLLBACK');},release(){calls.push('RELEASE');}};
  const fake={async query(sql){return [sql.includes('INFORMATION_SCHEMA.TRIGGERS')?[]:sql.includes('INFORMATION_SCHEMA.TABLES')?[{ENGINE:'InnoDB'}]:
    sql.includes('INFORMATION_SCHEMA.COLUMNS')?cols:indexes]},async getConnection(){return conn;}};
  const record=mapping.convertRow(row(1),mapping.COLUMNS,fullLengths(),'DD/MM/YYYY');
  const result=await repository.publishRows([record],fake);
  assert.equal(result.filasConfirmadas,1);
  assert.deepEqual(calls.filter(v=>typeof v==='string'),['BEGIN','COMMIT','RELEASE']);
  const sql=calls.find(v=>typeof v==='object').sql;
  assert.match(sql,/INSERT INTO `ns_portafolio_pruebas`/);
  assert.match(sql,/ON DUPLICATE KEY UPDATE/);
  assert.doesNotMatch(sql,/\b(?:INTO|UPDATE|FROM)\s+`?portafolio`?/);
});

test('Error de SQL revierte el lote completo y libera conexion',async()=>{
  // La prueba simula preflight exitoso devolviendo metadatos sin invocar Aiven.
  const fake={async query(sql){
    const cols=mapping.COLUMNS.map(name=>({COLUMN_NAME:name,DATA_TYPE:'varchar',CHARACTER_MAXIMUM_LENGTH:255,
      EXTRA:'',IS_NULLABLE:name==='numero_equipo'?'NO':'YES'}));
    cols.push({COLUMN_NAME:'id_portafolio',EXTRA:'auto_increment'},
      {COLUMN_NAME:'estado_registro',COLUMN_DEFAULT:'1',IS_NULLABLE:'NO'},{COLUMN_NAME:'zona_id'});
    const idx=[{INDEX_NAME:'PRIMARY',NON_UNIQUE:0,COLUMN_NAME:'id_portafolio'},
      {INDEX_NAME:'uq',NON_UNIQUE:0,COLUMN_NAME:'numero_equipo'}];
    return [sql.includes('INFORMATION_SCHEMA.TRIGGERS')?[]:sql.includes('INFORMATION_SCHEMA.TABLES')?[{ENGINE:'InnoDB'}]:
      sql.includes('INFORMATION_SCHEMA.COLUMNS')?cols:idx];
  },async getConnection(){return conn;}};
  const calls=[];
  const conn={async beginTransaction(){calls.push('BEGIN');},async execute(){throw new Error('SQL_TEST_FAIL');},
    async commit(){calls.push('COMMIT');},async rollback(){calls.push('ROLLBACK');},release(){calls.push('RELEASE');}};
  const record=mapping.convertRow(row(1),mapping.COLUMNS,fullLengths(),'DD/MM/YYYY');
  await assert.rejects(()=>repository.publishRows([record],fake),/SQL_TEST_FAIL/);
  assert.deepEqual(calls,['BEGIN','ROLLBACK','RELEASE']);
});

test('No permite otro lote paralelo aunque haya varias tareas MAP',async()=>{
  const db=fakeRepository();const receiver=createReceiver({repository:()=>db});
  const b=begin(1);await receiver.begin(b);
  const another=begin(1,'ed18009e-5427-4f46-8170-5885561f0d13');
  await assert.rejects(()=>receiver.begin(another),err=>err.statusCode===429);
  assert.equal(db.state.commits.length,0);
});

test('Prueba de capacidad simulada: 3714 registros completos sin escrituras hasta finalizar',async()=>{
  const db=fakeRepository();const receiver=createReceiver({repository:()=>db});
  const total=3714;const b=begin(total);await receiver.begin(b);
  const pages=[];
  for(let start=1,number=1;start<=total;start+=300,number++){
    const n=Math.min(300,total-start+1);
    const p=page(number,Array.from({length:n},(_,i)=>row(start+i)));
    pages.push(p);
    await receiver.page(b.loteId,p);
  }
  assert.equal(receiver.status().filasRecibidas,total);
  assert.equal(receiver.status().paginasRecibidas,13);
  assert.equal(db.state.commits.length,0);
  assert.equal((await receiver.finish(b.loteId,finish(b,pages))).filasConfirmadas,total);
  assert.equal(db.state.commits.length,1);
});

test('SuiteScript V002: no envia con flag apagado y usa getText para campos select',()=>{
  const fs=require('node:fs');
  const path=require('node:path');
  const vm=require('node:vm');
  const source=fs.readFileSync(path.join(__dirname,'../../netsuite/BLTNOW_NS_Emisor_MR_V002.js'),'utf8');
  let factoryExports;
  let posts=0;
  const rec=row(1);
  const sortedColumns=columns.map(c=>({...c,name:c.nombre,sort:c.nombre==='formulatext'?'ASC':null}));
  const result={id:'10001',recordType:'customer',
    getValue(c){return c.name==='custentity1'?'999':rec.valores[c.indice];},
    getText(c){return c.name==='custentity1'?'Zona de prueba':rec.valores[c.indice];}};
  const saved={columns:sortedColumns,runPaged(){return {
    count:1,pageRanges:[{index:0}],fetch(){return {data:[result]}}}}};
  const params={custscript_blt_ns_busqueda:savedSearch,custscript_blt_ns_dataset:'PORTAFOLIO',
    custscript_blt_ns_azure_base:'',custscript_blt_ns_habilitar_envio:false};
  const noCrypto={HashAlg:{SHA256:'sha256'},createHash(){const c=crypto.createHash('sha256');return {
    update({input}){c.update(input)},digest(){return c.digest('hex')}}}};
  const dependencies={
    'N/search':{load:()=>saved},
    'N/runtime':{getCurrentScript(){return {getParameter({name}){return params[name]}}}},
    'N/https':{post(){posts++;throw new Error('No debe enviar sin autorizacion')}},
    'N/crypto':noCrypto,
    'N/encode':{Encoding:{UTF_8:'utf8',HEX:'hex'}},
    'N/crypto/random':{generateUUID:()=>uuid}
  };
  const context={define(names,factory){factoryExports=factory(...names.map(n=>dependencies[n]));},
    log:{audit(){},error(){}},Date,Map,Set,JSON,Number,Math,String,Error};
  vm.runInNewContext(source,context,{timeout:1500});
  const work=factoryExports.getInputData();
  assert.equal(work.length,1);
  const savedPage=[];
  factoryExports.map({value:JSON.stringify(work[0]),write(row){savedPage.push(row)}});
  assert.equal(posts,0);
  const entry=JSON.parse(savedPage[0].value);
  assert.equal(entry.enviado,false);
  assert.equal(entry.filasRecibidas,1);
});

'use strict';
// Contrato general NetSuite, Portafolio experimental: todo simulado; sin Azure ni Aiven real.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mapping = require('../src/modules/netsuite-integration/netsuite-portafolio.mapping');
const repository = require('../src/modules/netsuite-integration/netsuite-portafolio.repository');
const { createReceiver, configReady } = require('../src/modules/netsuite-integration/netsuite-portafolio.receiver');

const uuid = '9fe679ae-cd0c-4ba3-93d5-b30a55f89a4d';
const sourceId = 'customscript_portafolio_test';
const hash = data => crypto.createHash('sha256')
  .update(typeof data === 'string' ? data : JSON.stringify(data)).digest('hex');
const columns = mapping.FIELD_MAP.map((f,i) => ({
  indice:i, nombre:f.name, join:f.join||null, summary:null, label:null
}));
const previous = {
  INTEGRATION_NETSUITE_ID: process.env.INTEGRATION_NETSUITE_ID,
  INTEGRATION_NETSUITE_SECRET: process.env.INTEGRATION_NETSUITE_SECRET
};
process.env.INTEGRATION_NETSUITE_ID = 'netsuite-bltnow';
process.env.INTEGRATION_NETSUITE_SECRET = 'TEST_ONLY_NOT_REAL_AUTH_GENERAL_SECRET';
process.once('exit', () => {
  for (const [key,value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
const lengths = () => new Map(mapping.COLUMNS.map(name => [name,255]));
function row(id,position=id) {
  return { posicion:position, idOrigen:String(id), tipoOrigen:'customer',
    valores:mapping.FIELD_MAP.map(f => {
      if (f.column==='numero_equipo') return 'EQ-'+id;
      if (f.column==='id_equipo_ns') return 'NS-'+id;
      if (f.column==='inactivo') return false;
      if (f.column.startsWith('fecha_') || f.column==='termino_garantia') return '27/10/2026';
      return 'Valor de prueba';
    }) };
}
function begin(count=2,id=uuid) {
  return {versionContrato:1,loteId:id,origen:'NETSUITE',dataset:'PORTAFOLIO',
    modoCarga:'COMPLETA',busquedaGuardada:sourceId,
    fechaExtraccionUtc:'2026-10-27T16:00:00.000Z',filasEsperadas:count,
    tamanoPagina:300,paginasEsperadas:Math.ceil(count/300),columnas:columns};
}
function page(n,rows) {return {pagina:n,filas:rows,hashPagina:hash(rows)};}
function finish(b,pages) {return {loteId:b.loteId,filasEsperadas:b.filasEsperadas,
  paginasEsperadas:b.paginasEsperadas,hashCarga:hash(pages.map(p=>p.hashPagina).join('\n'))};}
function fakeRepository() {
  const state={commits:[],preflights:0};
  return {state,preflight:async()=>{state.preflights++;return lengths();},
    publishRows:async(rows,_db,gate)=>{
      assert.equal(gate(),true);state.commits.push(rows);return {filasConfirmadas:rows.length};
    }};
}

test('Se reutiliza exclusivamente la credencial M2M general: ninguna NS_PORTAFOLIO_* es obligatoria', () => {
  const saved = ['NS_PORTAFOLIO_WRITE_ENABLED','NS_PORTAFOLIO_SEARCH_ID','NS_PORTAFOLIO_DATE_FORMAT']
    .map(key=>[key,process.env[key]]);
  try {
    saved.forEach(([key])=>delete process.env[key]);
    assert.equal(configReady(),true);
    assert.equal(createReceiver({repository:fakeRepository}).status().persistenciaHabilitada,true);
  } finally {
    saved.forEach(([key,value])=>{if(value===undefined)delete process.env[key]; else process.env[key]=value;});
  }
});

test('Se exigen ID y secreto del contrato general',()=>{
  const oldId=process.env.INTEGRATION_NETSUITE_ID;
  const oldSecret=process.env.INTEGRATION_NETSUITE_SECRET;
  try {
    delete process.env.INTEGRATION_NETSUITE_ID;
    assert.equal(configReady(),false);
    process.env.INTEGRATION_NETSUITE_ID=oldId;
    delete process.env.INTEGRATION_NETSUITE_SECRET;
    assert.equal(configReady(),false);
  } finally {
    process.env.INTEGRATION_NETSUITE_ID=oldId;
    process.env.INTEGRATION_NETSUITE_SECRET=oldSecret;
  }
});

test('Solo los 53 campos autorizados; se rechazan desconocidos/repetidos',()=>{
  assert.deepEqual(mapping.validateColumns(columns),mapping.COLUMNS);
  const wrong=columns.map(c=>({...c}));wrong[0].nombre='filainventada';
  assert.throws(()=>mapping.validateColumns(wrong),/inesperado/);
  wrong[0].nombre=columns[1].nombre;wrong[0].join=columns[1].join;
  assert.throws(()=>mapping.validateColumns(wrong),/repetido/);
});

test('Filas: claves, booleanos, fechas, longitud y campos vacios',()=>{
  const out=mapping.convertRow(row(1),mapping.validateColumns(columns),lengths(),'DD/MM/YYYY');
  assert.equal(out.numero_equipo,'EQ-1');
  assert.equal(out.id_equipo_ns,'NS-1');
  assert.equal(out.inactivo,'0');
  assert.equal(out.fecha_instalacion,'27/10/2026');
  const flag=row(1);flag.valores[mapping.COLUMNS.indexOf('inactivo')]='N/D';
  assert.throws(()=>mapping.convertRow(flag,mapping.COLUMNS,lengths(),'DD/MM/YYYY'),
    e=>e.code==='NS_PORTAFOLIO_BOOL_INVALID');
  const short=row(1);short.valores.pop();
  assert.throws(()=>mapping.convertRow(short,mapping.COLUMNS,lengths(),'DD/MM/YYYY'),/Cantidad de valores/);
  const long=row(1);long.valores[0]='x'.repeat(256);
  assert.throws(()=>mapping.convertRow(long,mapping.COLUMNS,lengths(),'DD/MM/YYYY'),/supera longitud/);
});

test('El contrato de fechas es DD/MM/YYYY o ISO; formato de EUA no se presume',async()=>{
  const db=fakeRepository(),r=createReceiver({repository:()=>db}),b=begin(1);
  await r.begin(b);
  const bad=row(1);
  for(const [i,c] of mapping.COLUMNS.entries()){
    if(['fecha_instalacion','fecha_entrega','termino_garantia',
      'fecha_recepcion_mantenimiento','fecha_ingreso_portafolio'].includes(c)) bad.valores[i]='10/27/2026';
  }
  await assert.rejects(()=>r.page(b.loteId,page(1,[bad])),
    e=>e.code==='NS_PORTAFOLIO_DATE_FORMAT');
  assert.equal(db.state.commits.length,0);
});

test('Publica lote completo, pagina idempotente y una sola persistencia',async()=>{
  const db=fakeRepository(),r=createReceiver({repository:()=>db}),b=begin();
  const p=page(1,[row(1),row(2)]);
  assert.equal(r.status().persistenciaHabilitada,true);
  assert.equal((await r.begin(b)).estado,'RECIBIENDO');
  await r.begin(b);
  await r.page(b.loteId,p);
  await r.page(b.loteId,p);
  assert.equal(db.state.commits.length,0);
  assert.equal((await r.finish(b.loteId,finish(b,[p]))).estado,'PUBLICADO');
  assert.equal(db.state.commits.length,1);
  assert.equal((await r.finish(b.loteId,finish(b,[p]))).estado,'PUBLICADO');
  assert.equal(db.state.commits.length,1);
});

test('Lote incompleto no escribe y admite recuperar pagina faltante',async()=>{
  const db=fakeRepository(),r=createReceiver({repository:()=>db}),b=begin(301);
  await r.begin(b);
  const p1=page(1,Array.from({length:300},(_,i)=>row(i+1)));
  const p2=page(2,[row(301)]);
  await r.page(b.loteId,p1);
  await assert.rejects(()=>r.finish(b.loteId,finish(b,[p1,p2])),
    e=>e.code==='NS_PORTAFOLIO_INCOMPLETE');
  assert.equal(db.state.commits.length,0);
  await r.page(b.loteId,p2);
  assert.equal((await r.finish(b.loteId,finish(b,[p1,p2]))).filasConfirmadas,301);
});

test('Duplicados entre paginas bloquean el lote',async()=>{
  const db=fakeRepository(),r=createReceiver({repository:()=>db}),b=begin(301);
  await r.begin(b);
  await r.page(b.loteId,page(1,Array.from({length:300},(_,i)=>row(i+1))));
  await assert.rejects(()=>r.page(b.loteId,page(2,[row(1,301)])),
    e=>e.code==='NS_PORTAFOLIO_DUPLICATE_KEY');
  assert.equal(db.state.commits.length,0);
});

test('Rechaza hash incorrecto, dataset TICKETS y fuentes customsearch_',async()=>{
  const db=fakeRepository(),r=createReceiver({repository:()=>db}),b=begin(1);
  await r.begin(b);
  const p=page(1,[row(1)]);await r.page(b.loteId,p);
  const bad=finish(b,[p]);bad.hashCarga='a'.repeat(64);
  await assert.rejects(()=>r.finish(b.loteId,bad),e=>e.code==='NS_PORTAFOLIO_BATCH_HASH_MISMATCH');
  const invalidDataset=begin(1,'ed18009e-5427-4f46-8170-5885561f0d13');
  invalidDataset.dataset='TICKETS';
  await assert.rejects(()=>r.begin(invalidDataset),e=>e.code==='NS_PORTAFOLIO_SOURCE_DENIED');
  const invalidSource=begin(1,'ed18009e-5427-4f46-8170-5885561f0d13');
  invalidSource.busquedaGuardada='customsearch_blt_por_equipo';
  await assert.rejects(()=>r.begin(invalidSource),e=>e.code==='NS_PORTAFOLIO_SOURCE_DENIED');
});

test('Retirar credenciales de API durante lote impide publicar',async()=>{
  const db=fakeRepository(),r=createReceiver({repository:()=>db}),b=begin(1);
  await r.begin(b);
  const p=page(1,[row(1)]);await r.page(b.loteId,p);
  const old=process.env.INTEGRATION_NETSUITE_SECRET;
  delete process.env.INTEGRATION_NETSUITE_SECRET;
  try {
    await assert.rejects(()=>r.finish(b.loteId,finish(b,[p])),
      e=>e.code==='NS_DATASET_DESTINATION_PENDING');
    assert.equal(db.state.commits.length,0);
  } finally {process.env.INTEGRATION_NETSUITE_SECRET=old;}
});

test('No permite otro lote paralelo',async()=>{
  const db=fakeRepository(),r=createReceiver({repository:()=>db}),b=begin(1);
  await r.begin(b);
  await assert.rejects(()=>r.begin(begin(1,'ed18009e-5427-4f46-8170-5885561f0d13')),
    e=>e.statusCode===429);
});

test('Capacidad: 3720 registros / 13 paginas, un COMMIT y ninguna escritura parcial',async()=>{
  const db=fakeRepository(),r=createReceiver({repository:()=>db});
  const total=3720,b=begin(total);await r.begin(b);
  const pages=[];
  for(let start=1,n=1;start<=total;start+=300,n++) {
    const p=page(n,Array.from({length:Math.min(300,total-start+1)},(_,i)=>row(start+i)));
    pages.push(p);await r.page(b.loteId,p);
  }
  assert.equal(r.status().paginasRecibidas,13);
  assert.equal(r.status().filasRecibidas,total);
  assert.equal(db.state.commits.length,0);
  assert.equal((await r.finish(b.loteId,finish(b,pages))).filasConfirmadas,total);
  assert.equal(db.state.commits.length,1);
});

test('Preflight exige InnoDB, PK, UNIQUE numero_equipo y prohíbe triggers',async()=>{
  const cols=mapping.COLUMNS.map(name=>({COLUMN_NAME:name,DATA_TYPE:'varchar',
    CHARACTER_MAXIMUM_LENGTH:255,EXTRA:'',IS_NULLABLE:name==='numero_equipo'?'NO':'YES'}));
  cols.push({COLUMN_NAME:'id_portafolio',DATA_TYPE:'bigint',EXTRA:'auto_increment'});
  cols.push({COLUMN_NAME:'zona_id',DATA_TYPE:'bigint',EXTRA:''});
  cols.push({COLUMN_NAME:'estado_registro',DATA_TYPE:'tinyint',EXTRA:'',COLUMN_DEFAULT:'1',IS_NULLABLE:'NO'});
  const indexes=[{INDEX_NAME:'PRIMARY',NON_UNIQUE:0,COLUMN_NAME:'id_portafolio',SEQ_IN_INDEX:1},
    {INDEX_NAME:'uq_numero_equipo',NON_UNIQUE:0,COLUMN_NAME:'numero_equipo',SEQ_IN_INDEX:1}];
  const db={async query(sql){return [sql.includes('INFORMATION_SCHEMA.TRIGGERS')?[]:
    sql.includes('INFORMATION_SCHEMA.TABLES')?[{ENGINE:'InnoDB'}]:
    sql.includes('INFORMATION_SCHEMA.COLUMNS')?cols:indexes];}};
  assert.equal((await repository.preflight(db)).size,53);
  db.query=async sql=>[sql.includes('INFORMATION_SCHEMA.TRIGGERS')?[]:
    sql.includes('INFORMATION_SCHEMA.TABLES')?[{ENGINE:'InnoDB'}]:
    sql.includes('INFORMATION_SCHEMA.COLUMNS')?cols:indexes.slice(0,1)];
  await assert.rejects(()=>repository.preflight(db),e=>e.code==='NS_PORTAFOLIO_SCHEMA_BLOCKED');
});

test('SQL usa exclusivamente ns_portafolio_pruebas y un COMMIT',async()=>{
  const cols=mapping.COLUMNS.map(name=>({COLUMN_NAME:name,DATA_TYPE:'varchar',
    CHARACTER_MAXIMUM_LENGTH:255,EXTRA:'',IS_NULLABLE:name==='numero_equipo'?'NO':'YES'}));
  cols.push({COLUMN_NAME:'id_portafolio',DATA_TYPE:'bigint',EXTRA:'auto_increment'});
  cols.push({COLUMN_NAME:'zona_id',DATA_TYPE:'bigint',EXTRA:''});
  cols.push({COLUMN_NAME:'estado_registro',DATA_TYPE:'tinyint',EXTRA:'',COLUMN_DEFAULT:'1',IS_NULLABLE:'NO'});
  const indexes=[{INDEX_NAME:'PRIMARY',NON_UNIQUE:0,COLUMN_NAME:'id_portafolio',SEQ_IN_INDEX:1},
    {INDEX_NAME:'uq_numero_equipo',NON_UNIQUE:0,COLUMN_NAME:'numero_equipo',SEQ_IN_INDEX:1}];
  const calls=[];
  const cn={async beginTransaction(){calls.push('BEGIN');},
    async execute(sql,params){calls.push({sql,params});},async commit(){calls.push('COMMIT');},
    async rollback(){calls.push('ROLLBACK');},release(){calls.push('RELEASE');}};
  const db={async query(sql){return [sql.includes('INFORMATION_SCHEMA.TRIGGERS')?[]:
    sql.includes('INFORMATION_SCHEMA.TABLES')?[{ENGINE:'InnoDB'}]:
    sql.includes('INFORMATION_SCHEMA.COLUMNS')?cols:indexes];},async getConnection(){return cn;}};
  const item=mapping.convertRow(row(1),mapping.COLUMNS,lengths(),'DD/MM/YYYY');
  assert.equal((await repository.publishRows([item],db)).filasConfirmadas,1);
  assert.deepEqual(calls.filter(v=>typeof v==='string'),['BEGIN','COMMIT','RELEASE']);
  const sql=calls.find(v=>typeof v==='object').sql;
  assert.match(sql,/INSERT INTO `ns_portafolio_pruebas`/);
  assert.doesNotMatch(sql,/\b(?:INTO|UPDATE|FROM)\s+`?portafolio`?/);
});

test('Error SQL provoca ROLLBACK',async()=>{
  const cols=mapping.COLUMNS.map(name=>({COLUMN_NAME:name,DATA_TYPE:'varchar',
    CHARACTER_MAXIMUM_LENGTH:255,EXTRA:'',IS_NULLABLE:name==='numero_equipo'?'NO':'YES'}));
  cols.push({COLUMN_NAME:'id_portafolio',EXTRA:'auto_increment'},
    {COLUMN_NAME:'estado_registro',COLUMN_DEFAULT:'1',IS_NULLABLE:'NO'},{COLUMN_NAME:'zona_id'});
  const indexes=[{INDEX_NAME:'PRIMARY',NON_UNIQUE:0,COLUMN_NAME:'id_portafolio'},
    {INDEX_NAME:'uq',NON_UNIQUE:0,COLUMN_NAME:'numero_equipo'}];
  const calls=[];
  const cn={async beginTransaction(){calls.push('BEGIN');},async execute(){throw new Error('SQL_TEST_FAIL');},
    async commit(){calls.push('COMMIT');},async rollback(){calls.push('ROLLBACK');},release(){calls.push('RELEASE');}};
  const db={async query(sql){return [sql.includes('INFORMATION_SCHEMA.TRIGGERS')?[]:
    sql.includes('INFORMATION_SCHEMA.TABLES')?[{ENGINE:'InnoDB'}]:
    sql.includes('INFORMATION_SCHEMA.COLUMNS')?cols:indexes];},async getConnection(){return cn;}};
  const item=mapping.convertRow(row(1),mapping.COLUMNS,lengths(),'DD/MM/YYYY');
  await assert.rejects(()=>repository.publishRows([item],db),/SQL_TEST_FAIL/);
  assert.deepEqual(calls,['BEGIN','ROLLBACK','RELEASE']);
});

test('SuiteScript V002 legado: reutiliza la consulta original sin Saved Searches',()=>{
  const fs=require('node:fs');
  const path=require('node:path');
  const vm=require('node:vm');
  const source=fs.readFileSync(path.join(__dirname,'../../netsuite/BLTNOW_NS_Emisor_MR_V002.js'),'utf8');
  let factoryExports;
  let posts=0,createCalls=0,loadCalls=0;
  const rec=row(1);
  const originalColumns=[];
  const result={id:'10001',recordType:'customer',
    getValue(c){if(c.name==='isinactive')return false;
      if(c.name==='custentity1')return '999';
      return rec.valores[c.indice];},
    getText(c){if(c.name==='custentity1')return 'Zona de prueba';
      if(c.name==='custrecord18')return '28 Nombre Superintendente';
      if(c.name==='custrecord_blt_supervisor_zona')return '34 Nombre Supervisor';
      return rec.valores[c.indice];}
  };
  const params={custscript_blt_ns_busqueda:sourceId,custscript_blt_ns_dataset:'PORTAFOLIO',
    custscript_blt_ns_azure_base:'',custscript_blt_ns_habilitar_envio:false};
  const noCrypto={HashAlg:{SHA256:'sha256'},createHash(){const c=crypto.createHash('sha256');return {
    update({input}){c.update(input);},digest(){return c.digest('hex');}};}};
  const dependencies={
    'N/search':{
      Sort:{ASC:'ASC'},
      createColumn(def){return {...def};},
      create(opts){
        createCalls++;
        assert.equal(opts.type,'job');
        assert.equal(JSON.stringify(opts.filters),JSON.stringify([
          ['custentity_blt_codigo_equipo','noneof','@NONE@'],
          'AND',['subsidiary','anyof','2','5'],
          'AND',['custentity_blt_depto_proyecto','anyof','2','7'],
          'AND',['custentityblt_cambio_cliente','is','F']
        ]));
        const cols=opts.columns.map((c,i)=>({...c,indice:i}));
        if(!originalColumns.length)originalColumns.push(...cols);
        return {columns:cols,runPaged(){return {
          count:1,pageRanges:[{index:0}],fetch(){return {data:[result]}}}}};
      },
      load(){loadCalls++;throw new Error('No se debe usar Saved Search');}
    },
    'N/runtime':{getCurrentScript(){return {getParameter({name}){return params[name];}}}},
    'N/https':{post(){posts++;throw new Error('No debe enviar sin autorizacion');}},
    'N/crypto':noCrypto,
    'N/encode':{Encoding:{UTF_8:'utf8',HEX:'hex'}},
    'N/crypto/random':{generateUUID:()=>uuid}
  };
  const context={define(names,factory){factoryExports=factory(...names.map(n=>dependencies[n]));},
    log:{audit(){},error(){}},Date,Map,Set,JSON,Number,Math,String,Error};
  vm.runInNewContext(source,context,{timeout:1500});
  const work=factoryExports.getInputData();
  assert.equal(work.length,1);
  assert.equal(work[0].busqueda,sourceId);
  const savedPage=[];
  factoryExports.map({value:JSON.stringify(work[0]),write(entry){savedPage.push(entry);}});
  assert.equal(posts,0);
  assert.equal(loadCalls,0);
  assert.equal(createCalls,2);
  assert.equal(originalColumns.length,53);
  assert.equal(originalColumns[1].name,'formulatext');
  assert.equal(originalColumns[1].sort,'ASC');
  assert.equal(originalColumns[1].formula,
    'CONCAT({custentity_blt_codigo_equipo.name}, {custentity_blt_codigo_equipo.altname})');
  assert.deepEqual(originalColumns.map(c=>`${c.name.toLowerCase()}|${(c.join||'').toLowerCase()}`),
    mapping.FIELD_MAP.map(c=>`${c.name.toLowerCase()}|${c.join.toLowerCase()}`));
  const entry=JSON.parse(savedPage[0].value);
  assert.equal(entry.enviado,false);
  assert.equal(entry.filasRecibidas,1);
});

test('SuiteScript V002 legado: contrato F9A, HMAC, 53 campos sin cambiar IDs',()=>{
  const fs=require('node:fs');
  const path=require('node:path');
  const vm=require('node:vm');
  const source=fs.readFileSync(path.join(__dirname,'../../netsuite/BLTNOW_NS_Emisor_MR_V002.js'),'utf8');
  const rec=row(1);
  const originalId='customsearch_blt_por_equipo';
  const secret='SIMULATED_KEY_ONLY';
  const urlBase='https://example.azurewebsites.net';
  const sent=[];
  let exports;
  let searchLoadCalls=0;
  const params={custscript_blt_ns_busqueda:originalId,custscript_blt_ns_dataset:'PORTAFOLIO',
    custscript_blt_ns_azure_base:urlBase,custscript_blt_ns_habilitar_envio:true};
  const result={id:'10001',recordType:'customer',
    getValue(c){return c.name==='isinactive'?false:rec.valores[c.indice];},
    getText(c){
      if(c.name==='custrecord18')return '23 Ana General';
      if(c.name==='custrecord_blt_supervisor_zona')return '99 Juan Supervisor';
      return rec.valores[c.indice];}
  };
  const hash=()=>{
    const h=crypto.createHash('sha256');
    return {update({input}){h.update(input);},digest(){return h.digest('hex');}};
  };
  const dependencies={
    'N/search':{
      Sort:{ASC:'ASC'},
      createColumn(c){return {...c};},
      create({type,columns}){
        assert.equal(type,'job');
        const cols=columns.map((c,i)=>({...c,indice:i}));
        return {columns:cols,runPaged(){return {
          count:1,pageRanges:[{index:0}],fetch(){return {data:[result]}}}}};
      },
      load(){searchLoadCalls++;throw new Error('BG no autorizada');}
    },
    'N/runtime':{getCurrentScript(){return {getParameter({name}){return params[name];}}}},
    'N/https':{post({url,body,headers}){
      sent.push({url,body:JSON.parse(body),rawBody:body,headers});
      const route=new URL(url).pathname;
      if(route.endsWith('/finalizar'))return {code:200,body:JSON.stringify({ok:true,loteId:uuid,estado:'PUBLICADO'})};
      if(route.endsWith('/paginas'))return {code:200,body:JSON.stringify({ok:true,loteId:uuid,pagina:1})};
      return {code:200,body:JSON.stringify({ok:true,loteId:uuid})};
    }},
    'N/crypto':{
      HashAlg:{SHA256:'sha256'},createHash:hash,
      createSecretKey(){return {secret};},
      createHmac({key}){
        const h=crypto.createHmac('sha256',key.secret);
        return {update({input}){h.update(input);},digest(){return h.digest('hex');}};
      }
    },
    'N/encode':{Encoding:{UTF_8:'utf8',HEX:'hex'}},
    'N/crypto/random':{generateUUID:()=>uuid}
  };
  vm.runInNewContext(source,{define(names,factory){exports=factory(...names.map(n=>dependencies[n]));},
    log:{audit(){},error(){}},Date,Map,Set,JSON,Number,Math,String,Error},{timeout:1500});
  const jobs=exports.getInputData();
  assert.equal(jobs.length,1);
  const output=[];
  exports.map({value:JSON.stringify(jobs[0]),write(entry){output.push(entry);}});
  exports.summarize({
    inputSummary:{error:null},
    mapSummary:{errors:{iterator(){return {each(){return true;}}}}},
    output:{iterator(){return {each(cb){for(const entry of output)cb(entry.key,entry.value);}}}}
  });
  assert.equal(searchLoadCalls,0);
  assert.equal(sent.length,3);
  const [start,pg,done]=sent;
  assert.deepEqual(sent.map(x=>new URL(x.url).pathname),[
    '/api/integraciones/netsuite/v1/lotes',
    '/api/integraciones/netsuite/v1/lotes/'+uuid+'/paginas',
    '/api/integraciones/netsuite/v1/lotes/'+uuid+'/finalizar'
  ]);
  assert.equal(start.body.busquedaGuardada,originalId);
  assert.equal(start.body.dataset,'PORTAFOLIO');
  assert.equal(start.body.columnas.length,53);
  assert.deepEqual(mapping.validateColumns(start.body.columnas),mapping.COLUMNS);
  assert.equal(pg.body.filas[0].valores[1],'EQ-1');
  assert.equal(pg.body.filas[0].valores[51],'Ana General');
  assert.equal(pg.body.filas[0].valores[52],'Juan Supervisor');
  assert.equal(done.body.filasEsperadas,1);
  assert.equal(done.body.paginasEsperadas,1);
  for(const request of sent){
    const header=request.headers;
    const route=new URL(request.url).pathname;
    const expected=crypto.createHmac('sha256',secret).update(
      `${header['X-Integration-Timestamp']}\nPOST\n${route}\n${request.rawBody}`
    ).digest('hex');
    assert.equal(header['X-Integration-Id'],'netsuite-bltnow');
    assert.equal(header['X-Integration-Signature'],expected);
  }
});

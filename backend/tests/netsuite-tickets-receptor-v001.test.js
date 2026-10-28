'use strict';
// QA aislada con mocks: NO se conecta a Aiven/Azure/NetSuite, NO escribe en GitHub.
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const Module=require('node:module');
const mapping=require('../src/modules/netsuite-integration/netsuite-tickets.mapping');
const repository=require('../src/modules/netsuite-integration/netsuite-tickets.repository');
const {createReceiver}=require('../src/modules/netsuite-integration/netsuite-tickets.receiver');
const contract=require('../src/modules/netsuite-integration/netsuite-integration.contract');
const path=require('node:path');
const fs=require('node:fs');
const vm=require('node:vm');
const DATASET='TICKETS';
const ID='5ba8905a-8597-49ae-b5ed-d49e31d663e8';
const secret='MOCK_SECRET_ONLY_NEVER_USE_IN_AZURE';
const envBackup={
  INTEGRATION_NETSUITE_ID:process.env.INTEGRATION_NETSUITE_ID,
  INTEGRATION_NETSUITE_SECRET:process.env.INTEGRATION_NETSUITE_SECRET,
  NS_TICKETS_WRITE_ENABLED:process.env.NS_TICKETS_WRITE_ENABLED
};
process.env.INTEGRATION_NETSUITE_ID='mock-test';
process.env.INTEGRATION_NETSUITE_SECRET=secret;
process.env.NS_TICKETS_WRITE_ENABLED='true';
process.once('exit',()=>{for(const [k,v] of Object.entries(envBackup)){
  if(v==null)delete process.env[k];else process.env[k]=v;
}});
const h=s=>crypto.createHash('sha256').update(s,'utf8').digest('hex');
const manifest=()=>mapping.FIELD_MAP.map((f,indice)=>({indice,nombre:f.name,join:f.join||null,
  summary:null,label:f.label}));
function row(id='101',ticket='CASO-101',posicion=1) {
  const valores=mapping.COLUMNS.map(()=>null);
  valores[0]=id;valores[1]=ticket;valores[6]='EQ-123';
  valores[10]='28/10/2026';valores[11]='11:58 pm';
  valores[13]='27/10/2026';valores[14]='08:30';
  valores[24]=1.5;valores[25]=3.25;valores[35]='Causa detallada';
  return {posicion,idOrigen:id,tipoOrigen:'supportcase',valores};
}
const begin=(n=1)=>({versionContrato:1,loteId:ID,origen:'NETSUITE',dataset:DATASET,
  modoCarga:'COMPLETA',busquedaGuardada:'customscript_bltnow_ns_tickets_fuente',
  fechaExtraccionUtc:'2026-10-28T17:58:00.000Z',filasEsperadas:n,
  tamanoPagina:300,paginasEsperadas:Math.ceil(n/300),columnas:manifest()});
const page=rows=>({pagina:1,filas:rows,hashPagina:h(JSON.stringify(rows))});
const finish=packet=>({loteId:ID,filasEsperadas:packet.filas.length,paginasEsperadas:1,
  hashCarga:h(packet.hashPagina)});
function schema(){const map=new Map();for(const c of mapping.COLUMNS){
  if(['fecha_reporte','fecha_llegada','fecha_cierre'].includes(c))map.set(c,{type:'date'});
  else if(mapping.NUMERIC.has(c))map.set(c,{type:'decimal',precision:10,scale:2});
  else map.set(c,{type:'text',max:2000});
}return map;}
function fakeDatabase(options={}) {
  const events=[],data=[];
  const columns=[{COLUMN_NAME:'id',DATA_TYPE:'bigint',EXTRA:'auto_increment',IS_NULLABLE:'NO',COLUMN_DEFAULT:null},
    ...mapping.COLUMNS.map(name=>{
      const decimal=mapping.NUMERIC.has(name),date=['fecha_reporte','fecha_llegada','fecha_cierre'].includes(name);
      return {COLUMN_NAME:name,DATA_TYPE:date?'datetime':decimal?'decimal':'varchar',
        CHARACTER_MAXIMUM_LENGTH:date||decimal?null:3000,
        NUMERIC_PRECISION:decimal?10:null,NUMERIC_SCALE:decimal?2:null,
        EXTRA:'',IS_NULLABLE:name==='ticket'?'NO':'YES',COLUMN_DEFAULT:null};
    }),{COLUMN_NAME:'actualizado_en',DATA_TYPE:'timestamp',EXTRA:'',
      IS_NULLABLE:'YES',COLUMN_DEFAULT:null}];
  if(options.missing)columns.splice(columns.findIndex(c=>c.COLUMN_NAME===options.missing),1);
  if(options.badDate)columns.find(c=>c.COLUMN_NAME==='fecha_reporte').DATA_TYPE='varchar';
  const indexes=[{INDEX_NAME:'PRIMARY',NON_UNIQUE:0,COLUMN_NAME:'id',SEQ_IN_INDEX:1},
    {INDEX_NAME:options.missingUnique?'ix_ticket':'uq_tickets_ticket',
      NON_UNIQUE:options.missingUnique?1:0,COLUMN_NAME:'ticket',SEQ_IN_INDEX:1}];
  if(options.extraUnique)indexes.push({INDEX_NAME:'uq_id_interno',NON_UNIQUE:0,COLUMN_NAME:'id_interno',SEQ_IN_INDEX:1});
  const db={events,data,async query(sql){events.push(['meta',sql]);
      if(sql.includes('INFORMATION_SCHEMA.TABLES'))return [[{ENGINE:options.badEngine?'MyISAM':'InnoDB'}]];
      if(sql.includes('INFORMATION_SCHEMA.COLUMNS'))return [columns];
      if(sql.includes('INFORMATION_SCHEMA.STATISTICS'))return [indexes];
      if(sql.includes('INFORMATION_SCHEMA.TRIGGERS'))return [options.trigger?[{TRIGGER_NAME:'t'}]:[]];
      if(sql.includes('INFORMATION_SCHEMA.KEY_COLUMN_USAGE'))return [options.foreignKey?[{CONSTRAINT_NAME:'fk_prod',REFERENCED_TABLE_NAME:'tickets'}]:[]];
      throw Error('UNEXPECTED META SQL');
    },async getConnection(){events.push(['getConnection']);return {
      async beginTransaction(){events.push(['BEGIN']);},
      async execute(sql,values){events.push(['EXECUTE',sql,values]);
        if(sql.startsWith('SELECT'))return [options.existing||[]];
        if(options.failInsert)throw Error('MOCK INSERT FAILURE');
        if(!sql.startsWith('INSERT INTO `ns_tickets_pruebas`'))throw Error('DML FUERA DEL CLON');
        data.push(values);return [{affectedRows:values.length}];
      },async commit(){events.push(['COMMIT']);},async rollback(){events.push(['ROLLBACK']);},
      release(){events.push(['RELEASE']);}
    };}
  };
  return db;
}
function expectErr(fn,code){assert.throws(fn,error=>error.code===code);}
async function rejectsCode(promise,code){await assert.rejects(promise,error=>error.code===code);}

test('Manifest Tickets: 36 columnas y campos repetidos se distinguen por etiqueta',()=>{
  assert.equal(mapping.FIELD_MAP.length,36);assert.equal(mapping.COLUMNS.length,36);
  assert.equal(mapping.validateColumns(manifest())[35],'custeventblt_mot_det');
  const modified=manifest();modified[33].label='Codigo Equipo';
  expectErr(()=>mapping.validateColumns(modified),'NS_TICKETS_COLUMNS');
  const changed=manifest();[changed[24],changed[25]]=[changed[25],changed[24]];
  expectErr(()=>mapping.validateColumns(changed),'NS_TICKETS_COLUMNS');
  const changedJoin=manifest();changedJoin[27].join='customer';
  expectErr(()=>mapping.validateColumns(changedJoin),'NS_TICKETS_COLUMNS');
  const truncated=manifest().slice(0,35);expectErr(()=>mapping.validateColumns(truncated),'NS_TICKETS_COLUMNS');
});
test('Contrato Universal V003.4 acepta Tickets como dataset, bloquea hash falso',()=>{
  assert.equal(contract.validateBegin(begin()).dataset,'TICKETS');
  const p=page([row()]);assert.equal(contract.validatePage(ID,p).cantidad,1);
  assert.equal(contract.validateFinish(ID,finish(p)).loteId,ID);
  p.filas[0].valores[1]='ALTERADO';expectErr(()=>contract.validatePage(ID,p),'NS_PAGE_HASH_MISMATCH');
});
test('36 campos se corresponden con Fuente Tickets V003 local, si esta disponible',()=>{
  const file=process.env.NS_TICKETS_SOURCE_FILE;
  if(!file){return;}
  const code=fs.readFileSync(path.resolve(file),'utf8');let exported=null;
  const search={Sort:{ASC:'ASC'},createColumn:col=>({...col}),create:obj=>obj};
  const sandbox={define:(_deps,factory)=>{exported=factory(search,{audit(){}});}};
  vm.runInNewContext(code,sandbox,{timeout:1000});
  const columns=exported.execute.createSearch().columns;
  assert.equal(columns.length,36);
  columns.forEach((col,i)=>{
    assert.equal(String(col.name).toLowerCase(),mapping.FIELD_MAP[i].name);
    assert.equal(String(col.join||'').toLowerCase(),mapping.FIELD_MAP[i].join.toLowerCase());
    assert.equal(String(col.label).trim(),mapping.FIELD_MAP[i].label.trim());
  });
  assert.equal(columns[0].sort,'ASC');
});
test('Ticket mantiene identidades, metadatos, fechas+horas CDMX y decimal',()=>{
  const r=mapping.convertRow(row(),mapping.validateColumns(manifest()),schema(),'DD/MM/YYYY');
  assert.equal(r.ticket,'CASO-101');assert.equal(r.id_interno,'101');
  assert.equal(r.fecha_reporte,'2026-10-28 23:58:00');
  assert.equal(r.fecha_llegada,'2026-10-27 08:30:00');
  assert.equal(r.tiempo_llegada,'1.5');
  assert.equal(r.custeventblt_mot_det,'Causa detallada');
  assert.equal(r.fecha_cierre,null);
});
test('Fecha invalida, hora ambigua, decimal fuera escala y origen falso se rechazan',()=>{
  const cases=[
    [r=>r.valores[10]='31/02/2026','NS_TICKETS_DATE_INVALID'],
    [r=>r.valores[11]='25:77','NS_TICKETS_TIME_INVALID'],
    [r=>r.valores[11]='mediodia','NS_TICKETS_TIME_FORMAT'],
    [r=>r.valores[24]='1.999','NS_TICKETS_DECIMAL_RANGE'],
    [r=>r.idOrigen='999','NS_TICKETS_ORIGIN_MISMATCH'],
    [r=>r.tipoOrigen='customer','NS_TICKETS_ORIGIN_MISMATCH'],
    [r=>r.valores[0]='ABC','NS_TICKETS_KEY_MISSING'],
    [r=>r.valores[35]=Array(2),'NS_TICKETS_VALUE_TYPE'],
    [r=>r.valores[35]='\x00BAD','NS_TICKETS_VALUE_CONTROL']
  ];
  for(const [change,code] of cases){const r=row();change(r);
    expectErr(()=>mapping.convertRow(r,mapping.COLUMNS,schema(),'DD/MM/YYYY'),code);
  }
});
test('Parseo de fechas no cruza locales ni inventa horas',()=>{
  assert.deepEqual(mapping.parseDate('2026-10-28','DD/MM/YYYY'),{day:'2026-10-28',clock:''});
  assert.equal(mapping.parseTime('12:00 am'),'00:00:00');
  assert.equal(mapping.parseTime('12:00 pm'),'12:00:00');
  expectErr(()=>mapping.parseDate('02/30/2026','MM/DD/YYYY'),'NS_TICKETS_DATE_INVALID');
});
test('Preflight solo abre ns_tickets_pruebas InnoDB con UNIQUE(ticket), sin triggers',async()=>{
  const good=fakeDatabase();const result=await repository.preflight(good);
  assert.equal(result.get('fecha_reporte').type,'date');
  assert.equal(result.get('ticket').type,'text');
  assert.ok(good.events.every(e=>e[0]==='meta'));
  for(const [opts] of [[{missing:'custeventblt_mot_det'}],[{missingUnique:true}],[{extraUnique:true}],
    [{trigger:true}],[{foreignKey:true}],[{badEngine:true}],[{badDate:true}]]) {
    const bad=fakeDatabase(opts);await rejectsCode(repository.preflight(bad),'NS_TICKETS_SCHEMA_BLOCKED');
    assert.equal(bad.events.some(e=>e[0]==='getConnection'),false);
  }
});
test('UPSERT usa placeholders y no modifica tabla productiva tickets',()=>{
  const sql=repository.insertStatement(2);
  assert.match(sql,/INSERT INTO `ns_tickets_pruebas`/);
  assert.match(sql,/ON DUPLICATE KEY UPDATE/);
  assert.doesNotMatch(sql,/INSERT INTO `tickets`/);
  assert.match(sql,/COALESCE\(VALUES\(`custeventblt_mot_det`\)/);
  assert.doesNotMatch(sql,/`ticket`=COALESCE/);
  assert.equal((sql.match(/\?/g)||[]).length,72);
});
test('Publicacion: 1 transaccion, lectura de identidad, commit al final',async()=>{
  const db=fakeDatabase();const record=mapping.convertRow(row(),mapping.COLUMNS,schema(),'DD/MM/YYYY');
  const result=await repository.publishRows([record],db);
  assert.equal(result.filasConfirmadas,1);
  const steps=db.events.map(e=>e[0]);assert.ok(steps.indexOf('BEGIN')<steps.indexOf('COMMIT'));
  assert.equal(steps.filter(x=>x==='COMMIT').length,1);
  assert.equal(steps.filter(x=>x==='ROLLBACK').length,0);
  assert.equal(db.data.length,1);
});
test('Si existe ticket con otro ID interno, rollback sin DML',async()=>{
  const db=fakeDatabase({existing:[{ticket:'CASO-101',id_interno:'999'}]});
  const record=mapping.convertRow(row(),mapping.COLUMNS,schema(),'DD/MM/YYYY');
  await rejectsCode(repository.publishRows([record],db),'NS_TICKETS_ID_CONFLICT');
  assert.equal(db.data.length,0);
  assert.equal(db.events.filter(e=>e[0]==='ROLLBACK').length,1);
  assert.equal(db.events.filter(e=>e[0]==='COMMIT').length,0);
});
test('Error de INSERT hace ROLLBACK y no confirma',async()=>{
  const db=fakeDatabase({failInsert:true});const record=mapping.convertRow(row(),mapping.COLUMNS,schema(),'DD/MM/YYYY');
  await assert.rejects(repository.publishRows([record],db),/MOCK INSERT FAILURE/);
  assert.equal(db.events.filter(e=>e[0]==='ROLLBACK').length,1);
  assert.equal(db.events.filter(e=>e[0]==='COMMIT').length,0);
});
test('Desactivacion de escritura evita iniciar transaccion',async()=>{
  const db=fakeDatabase();const record=mapping.convertRow(row(),mapping.COLUMNS,schema(),'DD/MM/YYYY');
  await rejectsCode(repository.publishRows([record],db,()=>false),'NS_TICKETS_PAUSED');
  assert.equal(db.events.length,0);
});
test('Receiver empieza, acepta pagina sin DML, finaliza PUBLICADO e idempotente',async()=>{
  const events=[];let confirmed=0;const repo={
    async preflight(){events.push('preflight');return schema();},
    async publishRows(rows,_db,allowed){assert.ok(allowed());events.push('commit');confirmed++;
      return {filasConfirmadas:rows.length};}
  };
  const receiver=createReceiver({repository:()=>repo});const b=begin(),p=page([row()]);
  assert.equal((await receiver.begin(b)).estado,'RECIBIENDO');
  assert.equal((await receiver.page(ID,p)).estado,'PAGINA_RECIBIDA');
  assert.deepEqual(events,['preflight']);
  const out=await receiver.finish(ID,finish(p));
  assert.equal(out.estado,'PUBLICADO');assert.equal(out.filasConfirmadas,1);
  assert.equal(confirmed,1);
  assert.equal((await receiver.finish(ID,finish(p))).estado,'PUBLICADO');
  assert.equal((await receiver.abort(ID,{loteId:ID})).estado,'PUBLICADO');
  assert.equal(confirmed,1);
});
test('Receiver: pagina con clave duplicada es rechazada, abort sin DML',async()=>{
  const repo={async preflight(){return schema();},async publishRows(){throw Error('NO COMMIT');}};
  const receiver=createReceiver({repository:()=>repo});
  await receiver.begin(begin(2));
  const duplicated=page([row('101','CASO-101',1),row('102','CASO-101',2)]);
  await rejectsCode(receiver.page(ID,duplicated),'NS_TICKETS_DUPLICATE_KEY');
  assert.equal((await receiver.abort(ID,{loteId:ID})).estado,'ABORTADO');
});
test('Receiver: ID NS duplicado con folios distintos se bloquea',async()=>{
  const repo={async preflight(){return schema();}};
  const receiver=createReceiver({repository:()=>repo});
  await receiver.begin(begin(2));
  const duplicated=page([row('101','CASO-101',1),row('101','CASO-102',2)]);
  await rejectsCode(receiver.page(ID,duplicated),'NS_TICKETS_DUPLICATE_ORIGIN');
});
test('Receiver: manifiesto incorrecto bloquea publicacion',async()=>{
  let committed=false;
  const repo={async preflight(){return schema();},async publishRows(){committed=true;}};
  const receiver=createReceiver({repository:()=>repo});const p=page([row()]);
  await receiver.begin(begin());await receiver.page(ID,p);
  await rejectsCode(receiver.finish(ID,{...finish(p),hashCarga:h('incorrecto')}),'NS_TICKETS_BATCH_HASH_MISMATCH');
  assert.equal(committed,false);
});
test('Receiver: TICKETS cerrado por defecto, aunque HMAC este configurado',async()=>{
  process.env.NS_TICKETS_WRITE_ENABLED='false';
  try {
    const receiver=createReceiver();
    assert.equal(receiver.status().persistenciaHabilitada,false);
    await rejectsCode(receiver.begin(begin()),'NS_DATASET_DESTINATION_PENDING');
  } finally {process.env.NS_TICKETS_WRITE_ENABLED='true';}
});
// Ruteo real, motores simulados: comprueba que TICKETS no llama a Portafolio.
test('Rutas compartidas: lotes se enrutan por UUID sin cruzar datos',async()=>{
  const trace=[],posts=new Map(),gets=new Map(),uses=[];
  const fakeExpress={Router:()=>({
    use(...handlers){uses.push(handlers);},get(p,...h){gets.set(p,h);},post(p,...h){posts.set(p,h);}
  })};
  function fakeReceiver(dataset){return {
    status(){return {persistenciaHabilitada:dataset==='PORTAFOLIO'||
      process.env.NS_TICKETS_WRITE_ENABLED==='true',destino:dataset};},
    async begin(body){trace.push(['begin',dataset,body.loteId]);return {estado:'RECIBIENDO'};},
    async page(id){trace.push(['page',dataset,id]);return {estado:'PAGINA_RECIBIDA'};},
    async finish(id){trace.push(['finish',dataset,id]);return {estado:'PUBLICADO'};},
    async abort(id){trace.push(['abort',dataset,id]);return {estado:'ABORTADO'};}
  };}
  const oldLoad=Module._load;
  Module._load=function(request,parent,isMain){
    if(request==='express')return fakeExpress;
    if(request==='../../middleware/integration-auth.middleware')return {requireIntegrationAuthFor:()=>()=>{}};
    if(request==='./netsuite-portafolio.receiver')return {createReceiver:()=>fakeReceiver('PORTAFOLIO')};
    if(request==='./netsuite-tickets.receiver')return {createReceiver:()=>fakeReceiver('TICKETS')};
    return oldLoad.apply(this,[request,parent,isMain]);
  };
  const routePath=require.resolve('../src/modules/netsuite-integration/netsuite-integration.routes');
  try {delete require.cache[routePath];require(routePath);}finally{Module._load=oldLoad;delete require.cache[routePath];}
  assert.equal(uses.length,1);assert.equal(posts.size,4);
  async function execute(p,body,loteId=body.loteId||ID) {
    const handler=posts.get(p)?.[0];assert.ok(handler,'Falta ruta '+p);
    return new Promise((resolve,reject)=>{
      const req={body,params:{loteId}},res={statusCode:200,
        status(code){this.statusCode=code;return this;},json(result){resolve({status:this.statusCode,result});return this;}};
      handler(req,res,reject);
    });
  }
  const p=page([row()]);const f=finish(p);
  assert.equal((await execute('/lotes',begin())).result.estado,'RECIBIENDO');
  assert.equal((await execute('/lotes/:loteId/paginas',p)).result.estado,'PAGINA_RECIBIDA');
  assert.equal((await execute('/lotes/:loteId/finalizar',f)).result.estado,'PUBLICADO');
  assert.deepEqual(trace.slice(0,3).map(e=>e[1]),['TICKETS','TICKETS','TICKETS']);
  const status={payload:null,json(body){this.payload=body;}};
  gets.get('/estado')[0]({},status);assert.equal(status.payload.destinos.TICKETS,true);
  const other='d9dcd371-8c34-414c-8071-d019856536df';
  const pBegin={...begin(),loteId:other,dataset:'PORTAFOLIO'};
  await execute('/lotes',pBegin,other);
  assert.equal(trace.at(-1)[1],'PORTAFOLIO');
  await execute('/lotes/:loteId/abortar',{loteId:other},other);
  assert.equal(trace.at(-1)[1],'PORTAFOLIO');
  // Un UUID no puede transicionar entre datasets antes de caducar.
  await rejectsCode(execute('/lotes',{...begin(),dataset:'PORTAFOLIO'}),'NS_DATASET_LOTE_CONFLICT');
});

test('El receptor Tickets no puede recibir dataset PORTAFOLIO',async()=>{
  const repo={async preflight(){throw Error('NO DEBE LLEGAR A AIVEN');}};
  const receiver=createReceiver({repository:()=>repo});
  await rejectsCode(receiver.begin({...begin(),dataset:'PORTAFOLIO'}),'NS_TICKETS_SOURCE_DENIED');
});
test('El receptor Tickets rechaza volumen superior a 10000 antes de preflight',async()=>{
  let checked=false;const repo={async preflight(){checked=true;}};
  const receiver=createReceiver({repository:()=>repo});
  const tooBig={...begin(),filasEsperadas:10001,paginasEsperadas:34};
  await rejectsCode(receiver.begin(tooBig),'NS_TICKETS_CAPACITY_LIMIT');
  assert.equal(checked,false);
});
test('Preflight bloquea columnas requeridas sin default y evita DML',async()=>{
  const db=fakeDatabase();
  const oldQuery=db.query.bind(db);
  db.query=async sql=>{
    const result=await oldQuery(sql);
    if(sql.includes('INFORMATION_SCHEMA.COLUMNS'))result[0].push({
      COLUMN_NAME:'columna_extra',DATA_TYPE:'varchar',EXTRA:'',IS_NULLABLE:'NO',COLUMN_DEFAULT:null
    });
    return result;
  };
  await rejectsCode(repository.preflight(db),'NS_TICKETS_SCHEMA_BLOCKED');
  assert.equal(db.events.some(e=>e[0]==='getConnection'),false);
});
test('Preflight bloquea tabla faltante sin abrir conexiones',async()=>{
  const db=fakeDatabase();const oldQuery=db.query.bind(db);
  db.query=async sql=>sql.includes('INFORMATION_SCHEMA.TABLES')?[[]]:oldQuery(sql);
  await rejectsCode(repository.preflight(db),'NS_TICKETS_SCHEMA_BLOCKED');
  assert.equal(db.events.some(e=>e[0]==='getConnection'),false);
});
test('Se bloquea repetir una pagina con hash distinto despues de aceptarla',async()=>{
  const receiver=createReceiver({repository:()=>({async preflight(){return schema();}})});
  await receiver.begin(begin());const p=page([row()]);
  assert.equal((await receiver.page(ID,p)).estado,'PAGINA_RECIBIDA');
  assert.equal((await receiver.page(ID,p)).estado,'PAGINA_RECIBIDA');
  const altered=page([row('101','CASO-MODIFICADO')]);
  await rejectsCode(receiver.page(ID,altered),'NS_TICKETS_PAGE_CONFLICT');
});
test('Despues de desactivar Tickets, finalizar no publica datos',async()=>{
  let committed=false;
  const receiver=createReceiver({repository:()=>({
    async preflight(){return schema();},async publishRows(){committed=true;}
  })});
  await receiver.begin(begin());const p=page([row()]);await receiver.page(ID,p);
  process.env.NS_TICKETS_WRITE_ENABLED='false';
  try {await rejectsCode(receiver.finish(ID,finish(p)),'NS_DATASET_DESTINATION_PENDING');}
  finally {process.env.NS_TICKETS_WRITE_ENABLED='true';}
  assert.equal(committed,false);
  assert.equal((await receiver.abort(ID,{loteId:ID})).estado,'ABORTADO');
});

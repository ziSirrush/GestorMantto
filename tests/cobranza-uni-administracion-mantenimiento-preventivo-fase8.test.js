'use strict';
// [BLT NOW | 2026-10-23 | MP F8 V001] 100% sin Aiven/HTTP externo.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const base='backend/src/modules/cobranza-uni-administracion/';
const c=require('../backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.mp-contract');
const val=require('../backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.mp-zona1-import-validation');
const serviceSource=fs.readFileSync(path.join(root,base+'cobranza-uni-administracion.mp-zona1-import-service.js'),'utf8');
const routeSource=fs.readFileSync(path.join(root,'backend/src/routes/detalle-mp-2026.routes.js'),'utf8');
const gasSource=fs.readFileSync(path.join(root,'scripts/cobranza_uni/BLTNOW_MP_ZONA1_FASE8.gs'),'utf8');
const FIELDS=val.SHEET_FIELDS;
const HASH='a'.repeat(64);
function data(overrides={}){
  const obj={};for(const name of FIELDS)obj[name]=null;
  Object.assign(obj,{proyecto:'ESTACION UNO',idns:'E-111',cliente:'BLT',iguala:'100.00',
    fecha_factura_01:'2026-10-23',numero_factura_01:'F-2026',dias_vencimiento_01:'2'},overrides);
  return obj;
}
function entry(id='11',row=2,changes={}){return {id_dmp:id,sheet_row:row,data:data(changes)};}
function batch(mode='preview',rows=[entry()]){return {contract:val.CONTRACT,batch_id:HASH,mode,rows};}
function mockConnection(options={}){
  const used=[],tx={began:0,committed:0,rolledBack:0,released:0};
  const parents=options.parents||{'11':{id_dmp:'11',proyecto:'ESTACION UNO',idns:'E-111',cliente:'BLT',proyecto_oficial:'ESTACION UNO'}};
  const existing=options.existing||{};
  const conn={
    async beginTransaction(){tx.began++;},async commit(){tx.committed++;},
    async rollback(){tx.rolledBack++;},release(){tx.released++;},
    async query(sql,params){
      used.push({sql,params});
      if(options.failure && sql.includes(options.failure))throw Object.assign(new Error('DB_ERROR'),{code:options.failureCode||'DB_ERROR'});
      if(sql.includes('information_schema.COLUMNS'))return [[{total:options.wrongSchema?127:128}]];
      if(sql.includes('information_schema.KEY_COLUMN_USAGE'))return [[{total:1}]];
      if(sql.includes('information_schema.STATISTICS'))return [[{total:1}]];
      if(sql.includes('FROM `detalle_mp_2026` mp'))return [params.map(id=>parents[id]||null).filter(Boolean)];
      if(sql.includes('FROM `detalle_mp_2026_zona_1` z'))return [params.map(id=>
        existing[id]?{...existing[id],id_dmp:id}:null).filter(Boolean)];
      if(sql.startsWith('INSERT INTO `detalle_mp_2026_zona_1`')){
        if(options.duplicate)throw Object.assign(new Error('Duplicate entry'),{code:'ER_DUP_ENTRY'});
        return [{affectedRows:1}];
      }
      throw new Error('SQL mock inesperada: '+sql.slice(0,90));
    }
  };
  return {conn,used,tx};
}
function svc(fake){
  const module={exports:{}};
  vm.runInNewContext(serviceSource,{module,exports:module.exports,
    console:{info(){}},process:{env:{}},require:(p)=>{
      if(p==='../../config/db')return {getConnection(){throw Error('ACCIDENTAL_CONNECTION');}};
      if(p==='../../services/cobranza-uni-scope.service')return {canonicalProjectSql_uni:()=>'(CASE WHEN 1=1 THEN mp.proyecto ELSE NULL END)'};
      if(p.endsWith('.mp-contract'))return c;
      if(p.endsWith('.mp-zona1-import-validation'))return val;
      if(p.endsWith('.mp-edit-validation'))return require('../backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.mp-edit-validation');
      throw Error('Unsupported require '+p);
    }
  });
  return module.exports;
}
const deps=(fake,gate)=>({connection:fake.conn,featureEnabled:gate,
  scopeService:{canonicalProjectSql_uni:()=>'mp.proyecto'}});

test('F8 contrato 124 columnas, 12 bloques y tabla existente de 128',()=>{
  assert.equal(FIELDS.length,124);
  assert.equal(c.MP_ZONE1_SQL_SPEC_UNI.length,128);
  assert.equal(FIELDS.at(-1),'forma_pago_12');
  assert.equal(FIELDS[0],'zona_adm');
  assert.equal(FIELDS[16],'facturacion_01');
  assert.ok(FIELDS.includes('fecha_pago_12'));
  assert.ok(!FIELDS.includes('id_dmp'));
  assert.ok(!FIELDS.includes('id_mp_zona_1'));
});
test('F8 recibe JSON exacto completo y conserva IDs como texto',()=>{
  const x=val.normalizeBatch(batch());
  assert.equal(x.rows[0].id_dmp,'11');
  assert.equal(x.rows[0].data.iguala,'100.00');
  assert.equal(x.rows[0].data.facturas_pendientes,null);
  assert.equal(x.rows[0].data.numero_factura_01,'F-2026');
  assert.equal(Object.keys(x.rows[0].data).length,124);
  assert.equal(val.normalizeBatch(batch('preview',[entry('9007199254740993')])).rows[0].id_dmp,'9007199254740993');
});
test('F8 bloquea extras, campos omitidos, modos invalidos y 21 registros',()=>{
  for(const input of [
    {...batch(),anything:true}, {...batch(),contract:'OTRO'}, {...batch(),mode:'upsert'},
    {...batch(),batch_id:'b'}, {...batch(),rows:[]},
    {...batch(),rows:Array.from({length:21},(_,i)=>entry(String(i+1),i+2))},
    batch('preview',[{...entry(),data:{proyecto:'A',idns:'B'}}]),
    batch('preview',[{...entry(),data:{...data(),campo_inventado:1}}])
  ])assert.throws(()=>val.normalizeBatch(input),{statusCode:400});
});
test('F8 rechaza consecutivos repetidos, filas repetidas y proyectos sin ID',()=>{
  for(const rows of [
    [entry('11',2),entry('11',3)],[entry('11',2),entry('12',2)],
    [entry('11',2,{idns:null})],[entry('11',2,{proyecto:''})]
  ])assert.throws(()=>val.normalizeBatch(batch('preview',rows)),{statusCode:400});
});
test('F8 tipos fecha ISO reales y bisiestos, 2 decimales, INT y VARCHAR',()=>{
  assert.equal(val.canonicalValue('fecha_pago_01','2024-02-29'),'2024-02-29');
  assert.equal(val.canonicalValue('iguala','1234567890123456.78'),'1234567890123456.78');
  assert.equal(val.canonicalValue('dias_vencimiento_01','-2147483648'),'-2147483648');
  assert.equal(val.canonicalValue('idns','  ABC  '),'ABC');
  for(const [field,raw] of [
    ['fecha_pago_01','2025-02-29'],['fecha_pago_01','23/10/2026'],
    ['iguala','10.999'],['iguala','99999999999999999.00'],
    ['dias_vencimiento_01','2147483648'],['idns','X'.repeat(101)],
    ['facturacion_01',{a:1}]
  ])assert.throws(()=>val.canonicalValue(field,raw),{statusCode:400});
});
test('F8 preflight no inicia transaccion ni ejecuta INSERT',async()=>{
  const fake=mockConnection();const s=svc();
  const r=await s.importInitialZone1_uni(batch(),deps(fake,false));
  assert.equal(r.mode,'preview_only');assert.equal(r.ready,true);assert.equal(r.created,0);
  assert.equal(r.results[0].status,'ready_to_insert');
  assert.equal(fake.tx.began,0);assert.equal(fake.tx.committed,0);
  assert.equal(fake.used.filter(x=>/\b(?:INSERT|UPDATE|DELETE)\b/.test(x.sql)).length,0);
});
test('F8 no permite INSERT cuando gate de importacion esta apagado, ni abre conexion',async()=>{
  const fake=mockConnection();const s=svc();
  await assert.rejects(s.importInitialZone1_uni(batch('import'),deps(fake,false)),
    {statusCode:403,code:'MPZ1_IMPORT_DISABLED'});
  assert.equal(fake.used.length,0);assert.equal(fake.tx.began,0);
});
test('F8 habilitado inserta exclusivamente en Zona1 y deja GC VA MP sin alteraciones',async()=>{
  const fake=mockConnection();const s=svc();
  const r=await s.importInitialZone1_uni(batch('import'),deps(fake,true));
  assert.equal(r.mode,'insert_only');assert.equal(r.created,1);
  assert.equal(r.results[0].status,'created');
  assert.equal(fake.tx.began,1);assert.equal(fake.tx.committed,1);
  assert.equal(fake.tx.rolledBack,0);
  const writes=fake.used.filter(x=>/^(?:INSERT|UPDATE|DELETE)/i.test(x.sql));
  assert.equal(writes.length,1);
  assert.match(writes[0].sql,/^INSERT INTO `detalle_mp_2026_zona_1`/);
  assert.equal(writes[0].params.length,125);
  assert.equal(writes[0].params[0],'11');
});
test('F8 reenvio con datos identicos es idempotente, no sobrescribe',async()=>{
  const fake=mockConnection({existing:{'11':data()}});
  const r=await svc().importInitialZone1_uni(batch('import'),deps(fake,true));
  assert.equal(r.created,0);assert.equal(r.already_imported,1);
  assert.equal(r.results[0].status,'already_imported');
  assert.equal(fake.used.filter(x=>/^(?:INSERT|UPDATE|DELETE)/.test(x.sql)).length,0);
  assert.equal(fake.tx.committed,1);
});
test('F8 cambio en fila ya importada produce conflicto, no UPSERT',async()=>{
  const fake=mockConnection({existing:{'11':data({numero_factura_01:'EDITADA'})}});
  const r=await svc().importInitialZone1_uni(batch(),deps(fake,false));
  assert.equal(r.ready,false);
  assert.equal(r.results[0].status,'existing_conflict');
  await assert.rejects(svc().importInitialZone1_uni(batch('import'),deps(fake,true)),
    {statusCode:409,code:'MPZ1_IMPORT_CONFLICT'});
  assert.equal(fake.tx.rolledBack,1);
  assert.equal(fake.used.filter(x=>x.sql.startsWith('INSERT')).length,0);
});
test('F8 identidad oficial, proyecto, IDNS y cliente no son suposiciones',async()=>{
  for(const overrides of [
    {proyecto_oficial:null},{proyecto:'OTRO PROYECTO'},
    {idns:'OTRO-ID'},{cliente:'OTRO CLIENTE'}
  ]){
    const fake=mockConnection({parents:{'11':{id_dmp:'11',proyecto:'ESTACION UNO',
      idns:'E-111',cliente:'BLT',proyecto_oficial:'ESTACION UNO',...overrides}}});
    const result=await svc().importInitialZone1_uni(batch(),deps(fake,false));
    assert.equal(result.results[0].status,'identity_conflict');
  }
});
test('F8 MP no encontrado ni identidad no validada: lectura sin escritura',async()=>{
  const fake=mockConnection({parents:{}});
  const r=await svc().importInitialZone1_uni(batch(),deps(fake,false));
  assert.equal(r.results[0].status,'missing_mp');
  assert.equal(fake.tx.committed,0);
});
test('F8 lote con conflicto es atomico, conserva filas validas',async()=>{
  const fake=mockConnection({parents:{
    '11':{id_dmp:'11',proyecto:'ESTACION UNO',idns:'E-111',cliente:'BLT',proyecto_oficial:'ESTACION UNO'},
    '12':{id_dmp:'12',proyecto:'ESTACION UNO',idns:'E-111',cliente:'OTRO',proyecto_oficial:'ESTACION UNO'}
  }});
  await assert.rejects(svc().importInitialZone1_uni(batch('import',[entry('11',2),entry('12',3)]),deps(fake,true)),
    {statusCode:409,code:'MPZ1_IMPORT_CONFLICT'});
  assert.equal(fake.tx.rolledBack,1);
  assert.equal(fake.used.some(x=>x.sql.startsWith('INSERT')),false);
});
test('F8 error SQL durante INSERT revierte TODA la transaccion',async()=>{
  const fake=mockConnection({failure:'INSERT INTO `detalle_mp_2026_zona_1`'});
  await assert.rejects(svc().importInitialZone1_uni(batch('import'),deps(fake,true)),/DB_ERROR/);
  assert.equal(fake.tx.rolledBack,1);
  assert.equal(fake.tx.committed,0);
});
test('F8 UNIQUE concurrente se devuelve como conflicto y ROLLBACK',async()=>{
  const fake=mockConnection({duplicate:true});
  await assert.rejects(svc().importInitialZone1_uni(batch('import'),deps(fake,true)),
    {statusCode:409,code:'MPZ1_IMPORT_CONCURRENT_DUPLICATE'});
  assert.equal(fake.tx.rolledBack,1);
});
test('F8 esquema sin las 128 columnas deja el planchado bloqueado',async()=>{
  const fake=mockConnection({wrongSchema:true});
  await assert.rejects(svc().importInitialZone1_uni(batch('import'),deps(fake,true)),
    {code:'MPZ1_IMPORT_SCHEMA_MISMATCH'});
  assert.equal(fake.tx.rolledBack,1);
  assert.equal(fake.used.some(x=>x.sql.startsWith('INSERT')),false);
});
test('F8 M2M HMAC forzoso incluso con auth global OFF; sync legado sin cambios',()=>{
  assert.match(routeSource,/router\.post\('\/zona-1\/importacion-inicial', requireMpZone1ImportM2M/);
  assert.match(routeSource,/requireIntegrationAuthFor\('INTEGRATION_COBRANZA_UNI_ID',\{\s*alwaysRequireAuth:true,algorithm:'sha256'/);
  assert.match(routeSource,/router\.post\('\/sync', requireCobranzaUniIntegration, detalleMp2026LegacyController\.syncDetalleMp2026\)/);
  assert.match(routeSource,/router\.get\('\/:id', \.\.\.mantenimientoPreventivoGuard/);
  assert.doesNotMatch(routeSource,/router\.(?:patch|put|delete)\('\/zona-1\/importacion-inicial/);
});
test('F8 ruta POST deniega cuando auth falla y devuelve 403 para gate apagado',async()=>{
  let requireArgs=[],routes=[],called=0;
  const router={get(){},post(path,...handlers){routes.push({path,handlers});}};
  const mod={exports:{}};
  vm.runInNewContext(routeSource,{module:mod,exports:mod.exports,require:p=>{
    if(p==='express')return {Router:()=>router};
    if(p==='../controllers/detalle-mp-2026.controller')return {syncDetalleMp2026(){}};
    if(p==='../controllers/cobranza-uni-relaciones-protegidas.controller')return {getMainDetalleMp2026(){},getDetalleMp2026(){}};
    if(p==='../middleware/information-access-gnral.middleware')return {humanInformationGuard_gnral:()=>[]};
    if(p==='../middleware/integration-auth.middleware')return {requireIntegrationAuthFor:(...args)=>{
      requireArgs.push(args);return (_req,_res,next)=>next();}};
    if(p.includes('mp-zona1-import-service'))return {importInitialZone1_uni:async()=>{called++;throw Object.assign(new Error('OFF'),{statusCode:403,code:'MPZ1_IMPORT_DISABLED'});}};
    throw Error('Require inesperado '+p);
  }});
  const r=routes.find(x=>x.path==='/zona-1/importacion-inicial');
  assert.ok(r);assert.equal(r.handlers.length,2);
  assert.equal(requireArgs[1][1].alwaysRequireAuth,true);
  const res={statusCode:200,status(n){this.statusCode=n;return this;},json(obj){this.payload=obj;return this;}};
  await r.handlers.at(-1)({body:batch('import')},res,e=>{throw e;});
  assert.equal(res.statusCode,403);assert.equal(called,1);
});
function gasSandbox(overrides={}){
  const sandbox={console:{log(){}},Date,JSON,Number,String,Object,Array,Math,RegExp,
    ...overrides};
  vm.runInNewContext(gasSource,sandbox);
  return sandbox;
}
test('F8 GAS genera los 124 encabezados de contrato, incluyendo variaciones',()=>{
  const gas=gasSandbox();
  const rows=gas.MPZ1_F8_Contrato_();
  assert.deepEqual(Array.from(rows,x=>x[0]),FIELDS);
  assert.deepEqual(Array.from(rows,x=>x[1]),c.MP_ZONE1_SHEET_HEADERS_UNI.map(x=>x.sheetHeader));
  assert.equal(rows.length,124);
});
test('F8 GAS no instala ni desactiva triggers; importacion separada de previa',()=>{
  for(const func of ['MPZ1_F8_ValidarPlanchado','MPZ1_F8_ImportarPlanchado','MPZ1_F8_ResetearCheckpoint'])
    assert.match(gasSource,new RegExp('function '+func+'\\('));
  assert.doesNotMatch(gasSource,/ScriptApp\.newTrigger|\.deleteTrigger|ScriptApp\.deleteTrigger/);
  assert.match(gasSource,/X-Integration-Signature/);
  assert.match(gasSource,/computeHmacSha256Signature/);
  assert.match(gasSource,/LockService\.getScriptLock/);
  assert.match(gasSource,/checkpointKey/);
  assert.doesNotMatch(gasSource,/setValues\(|appendRow\(|clearContents\(/);
});
test('F8 GAS importacion no sale sin propiedad de confirmacion',()=>{
  const gas=gasSandbox({
    LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
    PropertiesService:{getScriptProperties:()=>({getProperty(){return '';}})}
  });
  assert.throws(()=>gas.MPZ1_F8_ImportarPlanchado(),/Falta propiedad/);
});
test('F8 GAS mapea main A C D a id_dmp sin crear columnas ni adivinar por nombre',()=>{
  let captured=[];
  const tmp=gasSandbox();
  const defs=tmp.MPZ1_F8_Contrato_();
  const source=defs.map(()=>''),header=defs.map(row=>row[1]);
  source[1]='ESTACION UNO';source[2]='E-111';source[9]=100.25;
  source[16+3]='2026-10-23';source[16+6]=2;
  const main={getLastColumn:()=>18,getLastRow:()=>2,getSheetId:()=>1,
    getRange:(row,col,count,width)=>({getDisplayValues:()=>
      row===1?[['Consecutivo','ZONA ADM','PROYECTO','ID']]:[['11','CENTRO','ESTACION UNO','E-111']]})};
  const zona={getLastColumn:()=>124,getLastRow:()=>2,getSheetId:()=>2,
    getRange:(row,col,count,width)=>({
      getDisplayValues:()=>row===1?[header]:[['CENTRO','ESTACION UNO','E-111','BLT']],
      getValues:()=>[source]
    })};
  const gas=gasSandbox({
    PropertiesService:{getScriptProperties:()=>({getProperty(name){
      return {MPZ1_F8_SPREADSHEET_ID:'SHEET',MPZ1_F8_MAIN_SHEET_NAME:'MP'}[name]||'';
    }})},
    SpreadsheetApp:{openById:()=>({getSheetByName:n=>n==='MP'?main:n==='DETALLE MP 2026 ZONA 1'?zona:null,
      getSpreadsheetTimeZone:()=>'America/Mexico_City'})},
    Utilities:{Charset:{UTF_8:'UTF_8'},DigestAlgorithm:{SHA_256:'SHA_256'},
      computeDigest:()=>Array(32).fill(10),formatDate() {throw Error('NO_DATE');}}
  });
  const output=gas.MPZ1_F8_Leer_();
  assert.equal(output.rows.length,1);
  assert.equal(output.rows[0].id_dmp,'11');
  assert.equal(output.rows[0].sheet_row,2);
  assert.equal(output.rows[0].data.iguala,'100.25');
  assert.equal(output.rows[0].data.fecha_factura_01,'2026-10-23');
  assert.equal(output.rows[0].data.dias_vencimiento_01,'2');
  assert.equal(output.hash.length,64);
});
test('F8 GAS fallo de identidad inexacta bloquea toda transferencia',()=>{
  const gas=gasSandbox();
  const hoja={getLastColumn:()=>18,getLastRow:()=>3,
    getRange:()=>({getDisplayValues:()=>[['Consecutivo','ZONA ADM','PROYECTO','ID']]})};
  assert.equal(typeof gas.MPZ1_F8_MapaPrincipal_,'function');
  // Esta fuente no tiene dos columnas de proyecto + ID válidas para registros.
  assert.throws(()=>gas.MPZ1_F8_MapaPrincipal_(hoja,1));
});
test('F8 no habilita puertas de escritura humana y conserva F7',()=>{
  const admin=fs.readFileSync(path.join(root,base+'cobranza-uni-administracion.routes.js'),'utf8');
  assert.match(admin,/\/tablas\/detalle_mp_2026\/conciliacion/);
  assert.match(admin,/\/tablas\/detalle_mp_2026\/zona-1\/:id/);
  const contract=fs.readFileSync(path.join(root,base+'cobranza-uni-administracion.mp-contract.js'),'utf8');
  assert.match(contract,/gasSyncRemainsActive:true/);
  assert.match(contract,/zone1WritesEnabled:false/);
  assert.match(contract,/writesEnabled:false/);
});

test('F8 ejecuta solo dos SELECT de datos por lote, evitando N+1 en Aiven',async()=>{
  const parents={};const rows=[];
  for(let i=11;i<=20;i++){
    parents[String(i)]={id_dmp:String(i),proyecto:'ESTACION UNO',
      idns:'E-111',cliente:'BLT',proyecto_oficial:'ESTACION UNO'};
    rows.push(entry(String(i),i));
  }
  const fake=mockConnection({parents});
  const r=await svc().importInitialZone1_uni(batch('preview',rows),deps(fake,false));
  assert.equal(r.total,10);
  assert.equal(fake.used.filter(x=>x.sql.includes('FROM `detalle_mp_2026` mp')).length,1);
  assert.equal(fake.used.filter(x=>x.sql.includes('FROM `detalle_mp_2026_zona_1` z')).length,1);
  assert.equal(fake.used.length,5); // 3 metadatos + 2 consultas por lote.
  assert.ok(fake.used.some(x=>x.sql.includes(' IN (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')));
});

test('F8 GAS firma HMAC el body EXACTO y path registrado, sin exponer secreto',()=>{
  const crypto=require('node:crypto');
  const captured=[];
  const prop={MPZ1_F8_API_BASE_URL:'https://example.azurewebsites.net',
    MPZ1_F8_INTEGRATION_ID:'cobranza-id',MPZ1_F8_INTEGRATION_SECRET:'secret-only-in-gas'};
  const gas=gasSandbox({
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>prop[k]||''})},
    Utilities:{Charset:{UTF_8:'utf8'},computeHmacSha256Signature:(msg,secret)=>
      Array.from(crypto.createHmac('sha256',secret).update(msg).digest())},
    UrlFetchApp:{fetch:(url,options)=>{captured.push({url,options});return {
      getResponseCode:()=>200,getContentText:()=>JSON.stringify({ok:true,
        batch_id:HASH,total:1,table:'detalle_mp_2026_zona_1',ready:true,results:[]})};}}
  });
  const body=batch('preview');
  const response=gas.MPZ1_F8_HTTP_(body);
  assert.equal(response.ok,true);
  assert.equal(captured.length,1);
  const {url,options}=captured[0];
  assert.equal(url,'https://example.azurewebsites.net'+gas.MPZ1_F8_CONF.path);
  const h=options.headers;
  const signed=h['X-Integration-Timestamp']+'\nPOST\n'+gas.MPZ1_F8_CONF.path+'\n'+options.payload;
  const expected=crypto.createHmac('sha256',prop.MPZ1_F8_INTEGRATION_SECRET).update(signed).digest('hex');
  assert.equal(h['X-Integration-Signature'],expected);
  assert.equal(h['X-Integration-Id'],'cobranza-id');
  assert.equal(options.payload,JSON.stringify(body));
  assert.ok(!JSON.stringify(options).includes('secret-only-in-gas'));
});

test('F8 GAS checkpoint solo avanza cuando el lote fue confirmado por API',()=>{
  let ck=null,calls=0;
  const store={getProperty:()=>ck,setProperty:(name,val)=>{ck=val;},deleteProperty:()=>{ck=null;}};
  const gas=gasSandbox({
    LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
    PropertiesService:{getScriptProperties:()=>store}
  });
  const rows=Array.from({length:21},(_,i)=>entry(String(i+1),i+2));
  gas.MPZ1_F8_Leer_=()=>({hash:HASH,rows});
  let attempts=0;
  gas.MPZ1_F8_HTTP_=request=>{
    attempts++;
    if(attempts===2)throw new Error('HTTP 503');
    return {ok:true,ready:true,total:request.rows.length,created:request.rows.length,
      batch_id:HASH,table:'detalle_mp_2026_zona_1',results:request.rows.map(row=>({
        status:'created',id_dmp:row.id_dmp,sheet_row:row.sheet_row}))};
  };
  gas.MPZ1_F8_Prop_=()=>gas.MPZ1_F8_CONF.importConfirmText;
  assert.throws(()=>gas.MPZ1_F8_ImportarPlanchado(),/HTTP 503/);
  assert.equal(JSON.parse(ck).offset,20);
  gas.MPZ1_F8_HTTP_=request=>({ok:true,ready:true,total:request.rows.length,created:request.rows.length,
    batch_id:HASH,table:'detalle_mp_2026_zona_1',results:request.rows.map(row=>({
      status:'created',id_dmp:row.id_dmp,sheet_row:row.sheet_row}))});
  const result=gas.MPZ1_F8_ImportarPlanchado();
  assert.equal(result.created,1);assert.equal(result.offset,21);
  assert.equal(ck,null);
});

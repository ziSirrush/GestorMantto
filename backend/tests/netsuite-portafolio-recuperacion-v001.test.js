'use strict';
// QA local: recovery de lotes sin NetSuite, HTTP, Azure, MySQL real ni escrituras.
// El receiver y el contrato se ejecutan con el repositorio y el mapping simulados.
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const Module=require('node:module');
const path=require('node:path');
const receiverPath=path.resolve(__dirname,'../src/modules/netsuite-integration/netsuite-portafolio.receiver.js');
const contract=require('../src/modules/netsuite-integration/netsuite-integration.contract');
const lote='9fe679ae-cd0c-4ba3-93d5-b30a55f89a4d';
const nuevo='ed18009e-5427-4f46-8170-5885561f0d13';
const sha=s=>crypto.createHash('sha256').update(s,'utf8').digest('hex');
const invalid=(message,statusCode=422,code='INVALID')=>Object.assign(new Error(message),{statusCode,code});
const fields=['numero_equipo','id_equipo_ns'];
const mapping={
  invalid,
  validateColumns(columns){
    if(columns.length!==2 || columns[0].nombre!=='formulatext' || columns[1].nombre!=='entityid')
      throw invalid('Columnas invalidas',422,'COLUMNS');
    return fields;
  },
  convertRow(row,cols,lengths,dateFormat){
    if(dateFormat!=='DD/MM/YYYY')throw invalid('Formato fecha inesperado');
    if(!row.valores[0]||!row.valores[1])throw invalid('Clave faltante');
    if(cols.length!==2||lengths.size!==2)throw invalid('Mapping incorrecto');
    return {numero_equipo:row.valores[0],id_equipo_ns:row.valores[1]};
  }
};
const original=Module._load;
Module._load=function(name,parent,isMain){
  if(parent?.filename===receiverPath && name==='./netsuite-portafolio.mapping')return mapping;
  return original.apply(this,arguments);
};
let createReceiver;
try {
  ({createReceiver}=require(receiverPath));
} finally {Module._load=original;}

const oldEnv={id:process.env.INTEGRATION_NETSUITE_ID,secret:process.env.INTEGRATION_NETSUITE_SECRET};
process.env.INTEGRATION_NETSUITE_ID='netsuite-bltnow';
process.env.INTEGRATION_NETSUITE_SECRET='CLAVE_MOCK_SOLO_QA_LOCAL';
process.once('exit',()=>{
  if(oldEnv.id===undefined)delete process.env.INTEGRATION_NETSUITE_ID;
  else process.env.INTEGRATION_NETSUITE_ID=oldEnv.id;
  if(oldEnv.secret===undefined)delete process.env.INTEGRATION_NETSUITE_SECRET;
  else process.env.INTEGRATION_NETSUITE_SECRET=oldEnv.secret;
});

const columns=[{indice:0,nombre:'formulatext',join:null,summary:null,label:'Equipo'},
  {indice:1,nombre:'entityid',join:null,summary:null,label:'NS'}];
function begin(id=lote, count=2) {
  return {versionContrato:1,loteId:id,origen:'NETSUITE',dataset:'PORTAFOLIO',
    modoCarga:'COMPLETA',busquedaGuardada:'customscript_portafolio_test',
    fechaExtraccionUtc:'2026-10-27T21:15:00.000Z',filasEsperadas:count,
    tamanoPagina:300,paginasEsperadas:Math.ceil(count/300),columnas:columns};
}
function page(id=lote, count=2) {
  const filas=Array.from({length:count},(_,idx)=>({posicion:idx+1,idOrigen:String(idx+1),
    tipoOrigen:'job',valores:['EQ'+(idx+1),'NS'+(idx+1)]}));
  return {pagina:1,filas,hashPagina:sha(JSON.stringify(filas))};
}
function finish(id=lote,p=page(id)) {
  return {loteId:id,filasEsperadas:p.filas.length,paginasEsperadas:1,
    hashCarga:sha(p.hashPagina)};
}
function fakeDb(){
  const state={commits:[],preflights:0};
  return {state,async preflight(){state.preflights++;return new Map(fields.map(k=>[k,255]))},
    async publishRows(rows,_db,gate){assert.equal(gate(),true);state.commits.push(rows);
      return {filasConfirmadas:rows.length}}};
}

test('Contrato cancelar: UUID y body deben coincidir, no acepta campos extras',()=>{
  assert.deepEqual(contract.validateAbort(lote,{loteId:lote}),{loteId:lote});
  assert.throws(()=>contract.validateAbort(lote,{loteId:nuevo}),e=>e.code==='NS_LOTE_MISMATCH');
  assert.throws(()=>contract.validateAbort(lote,{loteId:lote,force:true}),e=>e.code==='NS_ABORT_BODY_INVALID');
  assert.throws(()=>contract.validateAbort('123',{loteId:lote}),e=>e.code==='NS_LOTE_ID_INVALID');
});

test('Abortar lote con pagina en staging: 0 COMMIT, libera y permite nueva carga',async()=>{
  const db=fakeDb();const receiver=createReceiver({repository:()=>db});
  await receiver.begin(begin());await receiver.page(lote,page());
  assert.equal(receiver.status().paginasRecibidas,1);
  assert.equal(receiver.status().loteId,lote);
  assert.equal(receiver.abort(lote,{loteId:lote}).estado,'ABORTADO');
  assert.equal(receiver.status().loteActivo,false);
  assert.equal(db.state.commits.length,0);
  await assert.rejects(()=>receiver.finish(lote,finish()),e=>e.code==='NS_PORTAFOLIO_LOTE_NOT_FOUND');
  await assert.rejects(()=>receiver.page(lote,page()),e=>e.code==='NS_PORTAFOLIO_LOTE_NOT_FOUND');
  assert.equal((await receiver.begin(begin(nuevo))).estado,'RECIBIENDO');
  assert.equal(db.state.commits.length,0);
});

test('Lote diferente no puede cancelar el lote activo (fail closed)',async()=>{
  const receiver=createReceiver({repository:()=>fakeDb()});
  await receiver.begin(begin());
  assert.throws(()=>receiver.abort(nuevo,{loteId:nuevo}),e=>e.code==='NS_PORTAFOLIO_ABORT_DIFFERENT_LOT');
  assert.equal(receiver.status().loteId,lote);
  assert.equal(receiver.abort(lote,{loteId:lote}).estado,'ABORTADO');
  assert.equal(receiver.abort(lote,{loteId:lote}).estado,'SIN_LOTE_ACTIVO');
});

test('No permite cancelar durante COMMIT y no revierte lote PUBLICADO',async()=>{
  let release;
  const pending=new Promise(resolve=>{release=resolve});
  let calls=0;
  const db=fakeDb();
  db.publishRows=async(rows,_db,gate)=>{calls++;assert.equal(gate(),true);await pending;
    return {filasConfirmadas:rows.length};};
  const receiver=createReceiver({repository:()=>db});
  await receiver.begin(begin());const pg=page();await receiver.page(lote,pg);
  const publishing=receiver.finish(lote,finish(lote,pg));
  await new Promise(resolve=>setImmediate(resolve));
  assert.throws(()=>receiver.abort(lote,{loteId:lote}),e=>e.code==='NS_PORTAFOLIO_COMMITTING');
  release();
  assert.equal((await publishing).estado,'PUBLICADO');
  assert.equal(receiver.abort(lote,{loteId:lote}).estado,'PUBLICADO');
  assert.equal(calls,1);
});

test('Abortar durante preflight no permite aceptar el inicio posteriormente',async()=>{
  let release;
  const pending=new Promise(resolve=>{release=resolve});
  const db=fakeDb();
  db.preflight=async()=>pending;
  const receiver=createReceiver({repository:()=>db});
  const working=receiver.begin(begin());
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(receiver.abort(lote,{loteId:lote}).estado,'ABORTADO');
  release(new Map(fields.map(k=>[k,255])));
  await assert.rejects(()=>working,e=>e.code==='NS_PORTAFOLIO_LOTE_NOT_FOUND');
  assert.equal(receiver.status().loteActivo,false);
  assert.equal(db.state.commits.length,0);
});

test('Expiracion de staging tras 40min, sin modificar datos',async()=>{
  let now=10_000;
  const db=fakeDb();const receiver=createReceiver({repository:()=>db,clock:()=>now});
  await receiver.begin(begin());
  now+=40*60*1000+1;
  assert.equal(receiver.status().loteActivo,false);
  assert.equal((await receiver.begin(begin(nuevo))).estado,'RECIBIENDO');
  assert.equal(db.state.commits.length,0);
});

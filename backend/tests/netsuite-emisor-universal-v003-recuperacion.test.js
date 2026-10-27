'use strict';
// QA local sin acceso a NetSuite, Azure ni Aiven. Contrato general, 1 inicio,
// paginas por MAP, cancelacion unica y errores visibles en Summarize.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const EMISOR = path.join(__dirname,'../../netsuite/BLTNOW_NS_Emisor_Universal_MR_V003.js');
const LOTE = '9fe679ae-cd0c-4ba3-93d5-b30a55f89a4d';
const BASE = '/api/integraciones/netsuite/v1';
const SECRET = 'PRUEBA_LOCAL_NO_ES_CREDENCIAL_REAL';

function makeEmisor({count=600,send=true,failPage=0,failBegin=false,failFinish=false,
  finishAckEstado='PUBLICADO',sourceId='customscript_portafolio_test'}={}) {
  const events=[];
  const requests=[];
  const pageCount=Math.ceil(count/300);
  const params={
    custscript_blt_ns_busqueda:sourceId,
    custscript_blt_ns_dataset:'PORTAFOLIO',
    custscript_blt_ns_azure_base:'https://example.azurewebsites.net',
    custscript_blt_ns_habilitar_envio:send
  };
  const searchObj={
    columns:[{name:'entityid',join:null,sort:'ASC',label:'ID Equipo'}],
    runPaged({pageSize}) {
      assert.equal(pageSize,300);
      return {
        count,
        pageRanges:Array.from({length:pageCount},(_,index)=>({index})),
        fetch({index}) {
          const n=Math.min(300,count-index*300);
          return {data:Array.from({length:n},(_,i)=>({
            id:String(index*300+i+1),
            recordType:'job'
          }))};
        }
      };
    }
  };
  const provider=function execute() {};
  provider.dataset='PORTAFOLIO';
  provider.createSearch=()=>searchObj;
  provider.serializeRow=result=>[result.id];
  const deps={
    'N/search': {
      Type:{SCHEDULED_SCRIPT:'scheduledscript'},
      create({type,filters,columns}) {
        assert.equal(type,'scheduledscript');
        assert.equal(filters[0][2],sourceId);
        assert.deepEqual(Array.from(columns),['scriptid','scriptfile']);
        return {run(){return {getRange(){return [{getValue({name}){
          return name==='scriptid'?sourceId:70001;
        }}]}}}};
      }
    },
    'N/file': {load(){return {path:'/SuiteScripts/portafolio_fuente.js'}}},
    require:([name],callback)=>{
      assert.equal(name,'/SuiteScripts/portafolio_fuente.js');
      callback({execute:provider});
    },
    'N/runtime': {getCurrentScript:()=>({getParameter:({name})=>params[name]})},
    'N/https': {post({url,body,headers}) {
      const relative=new URL(url).pathname;
      requests.push({relative,body:JSON.parse(body),raw:body,headers});
      const h=headers;
      const expected=crypto.createHmac('sha256',SECRET).update(
        `${h['X-Integration-Timestamp']}\nPOST\n${relative}\n${body}`).digest('hex');
      assert.equal(h['X-Integration-Id'],'netsuite-bltnow');
      assert.equal(h['X-Integration-Signature'],expected);
      if (relative===BASE+'/lotes') {
        if (failBegin) return {code:429,body:JSON.stringify({ok:false,code:'NS_PORTAFOLIO_BUSY'})};
        return {code:200,body:JSON.stringify({ok:true,loteId:LOTE})};
      }
      if (relative.endsWith('/paginas')) {
        if (failPage==='all' || failPage===JSON.parse(body).pagina)
          return {code:422,body:JSON.stringify({ok:false,code:'NS_PORTAFOLIO_DATE_FORMAT'})};
        return {code:200,body:JSON.stringify({ok:true,loteId:LOTE,pagina:JSON.parse(body).pagina})};
      }
      if (relative.endsWith('/finalizar')) {
        if (failFinish) return {code:500,body:JSON.stringify({ok:false,code:'NS_PORTAFOLIO_DB_ERROR'})};
        return {code:200,body:JSON.stringify({ok:true,loteId:LOTE,estado:finishAckEstado})};
      }
      if (relative.endsWith('/abortar')) {
        return {code:200,body:JSON.stringify({ok:true,loteId:LOTE,estado:'ABORTADO'})};
      }
      throw new Error('Ruta inesperada: '+relative);
    }},
    'N/crypto': {
      HashAlg:{SHA256:'sha256'},
      createHash(){const h=crypto.createHash('sha256');return {
        update({input}){h.update(input)},digest(){return h.digest('hex')}
      }},
      createSecretKey(){return {secret:SECRET}},
      createHmac(){const h=crypto.createHmac('sha256',SECRET);return {
        update({input}){h.update(input)},digest(){return h.digest('hex')}
      }}
    },
    'N/encode':{Encoding:{UTF_8:'utf8',HEX:'hex'}},
    'N/crypto/random':{generateUUID:()=>LOTE}
  };
  const audit=(title,details,type)=>events.push({title,details,type});
  let exported;
  const globals={define(names,factory){exported=factory(...names.map(n=>deps[n]));},
    log:{audit({title,details}){audit(title,details,'AUDIT')},
      error({title,details}){audit(title,details,'ERROR')}},
    Date,Map,Set,JSON,Number,String,Math,Error};
  vm.runInNewContext(fs.readFileSync(EMISOR,'utf8'),globals,{timeout:5000});
  return {exported,events,requests,params};
}

function runMaps(t,jobs) {
  const output=[];
  const errors=[];
  for(const [key,job] of jobs.entries()) {
    try {
      t.exported.map({value:JSON.stringify(job),
        write({key,value}){output.push({key,value})}});
    } catch(error) {
      errors.push({key:String(key),error:JSON.stringify({name:error.name,message:error.message})});
    }
  }
  return {output,errors};
}

function summary(t,{output,errors},inputError=null) {
  t.exported.summarize({
    inputSummary:{error:inputError},
    mapSummary:{errors:{iterator(){return {each(callback){
      errors.forEach((r,i)=>callback(r.key,r.error,i+1));return true;
    }}}}},
    output:{iterator(){return {each(callback){
      output.forEach(r=>callback(r.key,r.value));return true;
    }}}}
  });
}

test('SIN ENVIO: control + 2 paginas, sin HTTP, resumen correcto',()=>{
  const t=makeEmisor({count:350,send:false});
  const jobs=t.exported.getInputData();
  assert.equal(jobs.length,3);
  const result=runMaps(t,jobs);
  assert.equal(result.errors.length,0);
  summary(t,result);
  assert.equal(t.requests.length,0);
  const audit=t.events.find(e=>e.title==='NS universal: simulacion sin envio');
  assert.equal(audit.details.filas,350);
  assert.equal(audit.details.paginas,2);
});

test('ENVIO: 3720 filas / 13 paginas, un solo POST inicial, luego finalizar',()=>{
  const t=makeEmisor({count:3720});
  const jobs=t.exported.getInputData();
  assert.equal(jobs.length,14,'13 paginas + un trabajo de control');
  assert.equal(t.requests.length,1,'getInputData inicia el lote una vez');
  const result=runMaps(t,jobs);
  assert.equal(result.errors.length,0);
  assert.equal(t.requests.filter(r=>r.relative===BASE+'/lotes').length,1);
  assert.equal(t.requests.filter(r=>r.relative.endsWith('/paginas')).length,13);
  assert.equal(t.requests.filter(r=>r.relative.endsWith('/finalizar')).length,0);
  summary(t,result);
  assert.equal(t.requests.filter(r=>r.relative.endsWith('/finalizar')).length,1);
  assert.equal(t.requests.filter(r=>r.relative.endsWith('/abortar')).length,0);
  const published=t.events.find(e=>e.title==='NS universal: lote publicado');
  assert.equal(published.details.filas,3720);
  assert.equal(published.details.paginas,13);
  assert.equal(published.details.loteId,LOTE);
});

test('Una pagina 422: muestra codigo real y cancela lote una sola vez',()=>{
  const t=makeEmisor({count:920,failPage:3});
  const jobs=t.exported.getInputData();
  const result=runMaps(t,jobs);
  assert.equal(result.errors.length,1);
  summary(t,result);
  assert.equal(t.requests.filter(r=>r.relative===BASE+'/lotes').length,1);
  assert.equal(t.requests.filter(r=>r.relative.endsWith('/paginas')).length,4);
  assert.equal(t.requests.filter(r=>r.relative.endsWith('/finalizar')).length,0);
  assert.equal(t.requests.filter(r=>r.relative.endsWith('/abortar')).length,1);
  assert.equal(t.events.filter(e=>e.title==='NS universal: lote abortado en Azure').length,1);
  const failure=t.events.find(e=>e.title==='NS universal: pagina fallida');
  assert.match(failure.details.error.message,/HTTP 422 NS_PORTAFOLIO_DATE_FORMAT/);
  assert.equal(t.events.find(e=>e.title==='NS universal: lote no publicado').details.errores,1);
});

test('Inicio 429: error exacto, NO se transmiten paginas',()=>{
  const t=makeEmisor({count:600,failBegin:true});
  assert.throws(()=>t.exported.getInputData(),/HTTP 429 NS_PORTAFOLIO_BUSY/);
  assert.equal(t.requests.filter(r=>r.relative===BASE+'/lotes').length,1);
  assert.equal(t.requests.filter(r=>r.relative.endsWith('/paginas')).length,0);
  assert.equal(t.requests.filter(r=>r.relative.endsWith('/abortar')).length,0,
    '429 conocido no intenta cancelar un lote ajeno');
  assert.equal(t.events.find(e=>e.title==='NS universal: inicio rechazado por Azure')
    .details.error.message.includes('NS_PORTAFOLIO_BUSY'),true);
});

test('Finalizar 500: no anuncia PUBLICADO, solicita cancelacion y registra codigo',()=>{
  const t=makeEmisor({count:350,failFinish:true});
  const result=runMaps(t,t.exported.getInputData());
  assert.throws(()=>summary(t,result),/HTTP 500 NS_PORTAFOLIO_DB_ERROR/);
  assert.equal(t.requests.filter(r=>r.relative.endsWith('/abortar')).length,1);
  assert.ok(!t.events.some(e=>e.title==='NS universal: lote publicado'));
});

test('Ausencia de control rechaza manifiesto y aborta sin publicar',()=>{
  const t=makeEmisor({count:350});
  const result=runMaps(t,t.exported.getInputData());
  result.output=result.output.filter(x=>x.key!=='__BLTNOW_LOTE__');
  summary(t,result);
  assert.equal(t.requests.filter(r=>r.relative.endsWith('/finalizar')).length,0);
  assert.equal(t.requests.filter(r=>r.relative.endsWith('/abortar')).length,1);
});

test('13 de 13 paginas fallan: un solo aborto aunque no haya paginas confirmadas',()=>{
  const t=makeEmisor({count:3720,failPage:'all'});
  const result=runMaps(t,t.exported.getInputData());
  assert.equal(result.errors.length,13);
  assert.equal(result.output.length,1,'Permanece registro de control del lote');
  summary(t,result);
  assert.equal(t.requests.filter(r=>r.relative.endsWith('/abortar')).length,1);
  assert.equal(t.requests.filter(r=>r.relative.endsWith('/finalizar')).length,0);
  assert.equal(t.requests.filter(r=>r.relative===BASE+'/lotes').length,1);
  const audit=t.events.find(e=>e.title==='NS universal: lote no publicado');
  assert.equal(audit.details.errores,13);
  assert.equal(audit.details.loteId,LOTE);
  assert.equal(t.events.filter(e=>e.title==='NS universal: pagina fallida').length,13);
});

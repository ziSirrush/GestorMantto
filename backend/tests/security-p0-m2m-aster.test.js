'use strict';
// [Aster | 2026-10-29 | ASTER-MG | QA P0 M2M FAIL CLOSED V001]
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const auth=require('../src/middleware/integration-auth.middleware');
const route='/api/logistica/sync';
const secret='qa-aster-local-secret-not-for-production';
function make(body, supplied={}){
  return {method:'POST',originalUrl:route,body,rawBody:Buffer.from(JSON.stringify(body)),get(name){return supplied[String(name).toLowerCase()];}};
}
function signed(body, id='qa-logistica'){
  const timestamp=String(Math.floor(Date.now()/1000));
  const canonical=`${timestamp}\nPOST\n${route}\n${JSON.stringify(body)}`;
  return {'x-integration-id':id,'x-integration-timestamp':timestamp,
    'x-integration-signature':crypto.createHmac('sha256',secret).update(canonical).digest('hex')};
}
function invoke(middleware,req){
  return new Promise((resolve,reject)=>{
    const res={statusCode:200,body:null,status(n){this.statusCode=n;return this;},json(x){this.body=x;resolve({res:this,nextCalled:false});return this;}};
    try{middleware(req,res,(err)=>err?reject(err):resolve({res,nextCalled:true}));}
    catch(error){reject(error);}
  });
}
const env=['INTEGRATION_AUTH_ENABLED','INTEGRATION_LOGISTICA_ID','INTEGRATION_LOGISTICA_SECRET','NODE_ENV','AUTH_RATE_LIMIT_REDIS_URL','AUTH_RATE_LIMIT_REDIS_TOKEN'];
let previous;
test.beforeEach(()=>{
  previous=Object.fromEntries(env.map(k=>[k,process.env[k]]));
  process.env.INTEGRATION_AUTH_ENABLED='false';
  process.env.INTEGRATION_LOGISTICA_ID='qa-logistica';
  process.env.INTEGRATION_LOGISTICA_SECRET=secret;
  process.env.NODE_ENV='test';
  delete process.env.AUTH_RATE_LIMIT_REDIS_URL;
  delete process.env.AUTH_RATE_LIMIT_REDIS_TOKEN;
});
test.afterEach(()=>{for(const k of env){if(previous[k]===undefined)delete process.env[k];else process.env[k]=previous[k];}});
test('M2M sin HMAC permanece bloqueado con flag global false',async()=>{
  const m=auth.requireIntegrationAuthFor('INTEGRATION_LOGISTICA_ID');
  const response=await invoke(m,make({rows:[]}));
  assert.equal(response.nextCalled,false);
  assert.equal(response.res.statusCode,401);
  assert.equal(response.res.body.code,'INTEGRATION_AUTH_HEADERS_MISSING');
});
test('M2M con firma valida pasa incluso si INTEGRATION_AUTH_ENABLED=false',async()=>{
  const m=auth.requireIntegrationAuthFor('INTEGRATION_LOGISTICA_ID');
  const body={rows:[]};
  const req=make({...body,nonce:'first'},signed({...body,nonce:'first'}));
  const response=await invoke(m,req);
  assert.equal(response.nextCalled,true);
  assert.equal(req.integrationAuth.integrationId,'qa-logistica');
});

test('M2M firma valida pasa; firma falsa, identidad ajena y JWT humano no pasan',async()=>{
  const m=auth.requireIntegrationAuthFor('INTEGRATION_LOGISTICA_ID');
  const body={rows:[]};
  const valid=make(body,signed({...body,nonce:'one'}));
  valid.rawBody=Buffer.from(JSON.stringify({...body,nonce:'one'}));
  assert.equal(await invoke(m,valid).nextCalled,true);
  assert.equal(valid.integrationAuth.integrationId,'qa-logistica');
  const tampered=signed(body);tampered['x-integration-signature']='0'.repeat(64);
  assert.equal(await invoke(m,make(body,tampered)).res.body.code,'INTEGRATION_AUTH_INVALID_SIGNATURE');
  assert.equal(await invoke(m,make(body,signed(body,'unknown-id'))).res.statusCode,401);
  const human=make(body);human.user={id_SB:1};
  assert.equal(await invoke(m,human).res.body.code,'INTEGRATION_AUTH_HEADERS_MISSING');
});
test('El middleware directo exige HMAC aun con flag global false',async()=>{
  const body={rows:[]};
  assert.equal(await invoke(auth.requireIntegrationAuth,make(body)).res.body.code,'INTEGRATION_AUTH_HEADERS_MISSING');
  const signedRequest=make({...body,nonce:'direct'},signed({...body,nonce:'direct'}));
  assert.equal(await invoke(auth.requireIntegrationAuth,signedRequest).nextCalled,true);
});

test('Fallback humano historico solo admite JWT si no hay encabezados HMAC',async()=>{
  const fallback=(req,res,next)=>req.user?next():res.status(401).json({code:'SESSION_REQUIRED'});
  const m=auth.requireIntegrationAuthFor('INTEGRATION_LOGISTICA_ID',{whenDisabled:[fallback]});
  const body={rows:[]};
  assert.equal(await invoke(m,make(body)).res.body.code,'SESSION_REQUIRED');
  const human=make(body);human.user={id_SB:1};
  assert.equal(await invoke(m,human).nextCalled,true);
  const partial=make(body,{'x-integration-id':'qa-logistica'});partial.user={id_SB:1};
  assert.equal(await invoke(m,partial).res.body.code,'INTEGRATION_AUTH_HEADERS_MISSING');
  const empty=make(body,{'x-integration-id':''});empty.user={id_SB:1};
  assert.equal(await invoke(m,empty).res.body.code,'INTEGRATION_AUTH_HEADERS_MISSING');
  const good=make({...body,nonce:'historical'},signed({...body,nonce:'historical'}));
  assert.equal(await invoke(m,good).nextCalled,true);
  process.env.INTEGRATION_AUTH_ENABLED='true';
  assert.equal(await invoke(m,human).res.body.code,'INTEGRATION_AUTH_HEADERS_MISSING');
});

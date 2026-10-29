'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const auth=require('../src/middleware/integration-auth.middleware');
test('HMAC firmado no se reutiliza en modo local de prueba',async()=>{
 const prior={};for(const name of ['NODE_ENV','INTEGRATION_LOGISTICA_ID','INTEGRATION_LOGISTICA_SECRET','INTEGRATION_AUTH_ENABLED','AUTH_RATE_LIMIT_REDIS_URL','AUTH_RATE_LIMIT_REDIS_TOKEN'])prior[name]=process.env[name];
 try{
  process.env.NODE_ENV='test';process.env.INTEGRATION_AUTH_ENABLED='false';
  process.env.INTEGRATION_LOGISTICA_ID='test-id';process.env.INTEGRATION_LOGISTICA_SECRET='test-secret';
  delete process.env.AUTH_RATE_LIMIT_REDIS_URL;delete process.env.AUTH_RATE_LIMIT_REDIS_TOKEN;
  const ts=String(Math.floor(Date.now()/1000)),path='/api/logistica/sync',body=Buffer.from('{}');
  const sign=crypto.createHmac('sha256','test-secret').update(ts+'\nPOST\n'+path+'\n').update(body).digest('hex');
  function call(){return new Promise(resolve=>{
    const headers={'x-integration-id':'test-id','x-integration-timestamp':ts,'x-integration-signature':sign};
    const req={originalUrl:path,method:'POST',rawBody:body,get:name=>headers[name.toLowerCase()]};
    const res={statusCode:200,status(n){this.statusCode=n;return this},json(x){resolve({status:this.statusCode,body:x})}};
    auth.requireIntegrationAuthFor('INTEGRATION_LOGISTICA_ID')(req,res,err=>resolve({next:!err,err}));
  })}
  assert.equal((await call()).next,true);
  const repeat=await call();assert.equal(repeat.status,401);assert.equal(repeat.body.code,'INTEGRATION_AUTH_REPLAY');
 }finally{for(const [k,v]of Object.entries(prior)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});

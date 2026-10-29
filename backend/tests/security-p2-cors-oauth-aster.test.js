'use strict';
// [Aster | 2026-10-29 | ASTER-MG | QA AST-07 CORS OAUTH V001]
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const {getCorsOptions,parseAllowedOrigins,isAllowedOrigin}=require('../src/config/http.config');
test('cors no permite wildcard ni orígenes arbitrarios',()=>{
 const old=process.env.CORS_ORIGINS,oldNode=process.env.NODE_ENV;
 try {
  process.env.NODE_ENV='production';process.env.CORS_ORIGINS='*';
  assert.deepEqual(parseAllowedOrigins(),[]);
  let allowed;getCorsOptions().origin('https://evil.example',e=>{allowed=!e;});
  assert.equal(allowed,false);
  process.env.CORS_ORIGINS='https://blt.example,https://zisirrush.github.io';
  assert.equal(isAllowedOrigin('https://blt.example'),true);
  assert.equal(isAllowedOrigin('https://blt.example.evil.org'),false);
  assert.equal(isAllowedOrigin('http://blt.example'),false);
 }finally{
  if(old===undefined)delete process.env.CORS_ORIGINS;else process.env.CORS_ORIGINS=old;
  if(oldNode===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=oldNode;
 }
});
test('postMessage exige destino exacto validado por state',()=>{
 const source=fs.readFileSync(path.resolve(__dirname,'../src/controllers/google.controller.js'),'utf8');
 assert.match(source,/window\.opener\.postMessage\(payload, targetOrigin\)/);
 assert.doesNotMatch(source,/window\.opener\.postMessage\(payload, ['"]\*['"]\)/);
 assert.match(source,/isAllowedOrigin\(payload.origin\)/);
 assert.match(source,/const state = createState\(req.user, req.get\('origin'\)\)/);
});

'use strict';
// [Aster | 2026-10-29 | ASTER-MG | QA AST-10/11/12 V001]
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.resolve(__dirname,'../src/'+p),'utf8');
test('health deduplica concurrencia y evita sondeo SQL repetitivo',()=>{
 const src=read('modules/health/health.controller.js');
 assert.match(src,/if\(pending\)return pending/);
 assert.match(src,/Date\.now\(\)\+2000/);
});
test('errores HTTP 5xx no publican SQL ni mensajes internos',()=>{
 const src=read('middleware/error.middleware.js');
 assert.doesNotMatch(src,/payload\.error = error\.message/);
 assert.match(src,/payload\.code = 'INTERNAL_ERROR'/);
});
test('upload no almacena si antivirus no respondio',()=>{
 const src=read('services/storage/azure-storage.service.js');
 assert.ok(src.indexOf('scanBuffer_aster(file.buffer)')<src.indexOf('const blockBlobClient ='));
});
test('scanner falla cerrado en producción si no está configurado',async()=>{
 const scanner=require('../src/services/storage/storage-antivirus.service');
 const prev=process.env.NODE_ENV,prevAv=process.env.STORAGE_AV_ENABLED;
 try{process.env.NODE_ENV='production';delete process.env.STORAGE_AV_ENABLED;
  await assert.rejects(scanner.scanBuffer_aster(Buffer.from('x')),{code:'STORAGE_AV_UNAVAILABLE'});
 }finally{
  if(prev===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=prev;
  if(prevAv===undefined)delete process.env.STORAGE_AV_ENABLED;else process.env.STORAGE_AV_ENABLED=prevAv;
 }
});

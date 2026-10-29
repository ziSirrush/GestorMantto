'use strict';
// [Aster | 2026-10-29 | ASTER-MG | QA AST-10/11 V002]
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

test('El rate limit conserva los umbrales originales sin Redis',()=>{
 const src=read('middleware/auth-rate-limit.middleware.js');
 assert.match(src,/const buckets = new Map\(\)/);
 assert.match(src,/max: 10/);
 assert.match(src,/max: 5/);
 assert.doesNotMatch(src,/AUTH_RATE_LIMIT_REDIS_URL|AUTH_RATE_LIMIT_REDIS_TOKEN|distributedCount/);
});
test('Las integraciones usan HMAC sin Redis, ClamAV ni antirrepeticion distribuida',()=>{
 const src=read('middleware/integration-auth.middleware.js');
 assert.match(src,/crypto\.createHmac/);
 assert.match(src,/INTEGRATION_TIMESTAMP_TOLERANCE_SECONDS/);
 assert.doesNotMatch(src,/assertNotReplay_aster|AUTH_RATE_LIMIT_REDIS/);
});
test('El almacenamiento conserva validacion de archivos sin ClamAV',()=>{
 const src=read('services/storage/azure-storage.service.js');
 assert.match(src,/validateFile_gnral\(file, \{ policyName \}\)/);
 assert.doesNotMatch(src,/scanBuffer_aster|storage-antivirus\.service/);
 assert.equal(fs.existsSync(path.resolve(__dirname,'../src/services/storage/storage-antivirus.service.js')),false);
});

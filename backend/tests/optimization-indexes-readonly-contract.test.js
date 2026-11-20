'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const p=path.join(__dirname,'../scripts/qa-optimization-indexes-readonly.js');
const src=fs.readFileSync(p,'utf8');
const {CHECKS,inspectIndexes}=require(p);
test('QA SQL no incluye DDL/DML y exige habilitacion explicita',()=>{
 assert.match(src,/BLT_QA_OPT_READONLY/);assert.match(src,/--allow-live-readonly/);
 assert.doesNotMatch(CHECKS.map(x=>x.sql).join('\n'),/\b(?:DELETE|INSERT|UPDATE|ALTER|DROP|CREATE|TRUNCATE)\b/i);
 assert.ok(CHECKS.length>=5);
});
test('SHOW INDEX y EXPLAIN por tabla, sin recuperar datos',async()=>{
 const calls=[];
 const db={query:async(sql,params)=>{calls.push({sql,params});
  if(sql.startsWith('SHOW INDEX'))return [[{Key_name:'idx',Column_name:'fecha_reporte',Non_unique:1}]];
  if(sql.startsWith('EXPLAIN FORMAT=JSON'))return [[{EXPLAIN:'{}'}]];
  throw Error('No permitido');
 }};
 const result=await inspectIndexes(db);
 assert.equal(result.length,CHECKS.length);assert.equal(calls.length,CHECKS.length*2);
 assert.ok(calls.every(c=>/^SHOW INDEX|^EXPLAIN FORMAT=JSON SELECT/.test(c.sql)));
});

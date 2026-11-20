'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const file=require.resolve('../src/modules/instalaciones-dashboard/instalaciones-dashboard.repository.js');
const dbPath=require.resolve('../src/config/db.js');
const oldDb=require.cache[dbPath],oldRepository=require.cache[file],oldFlag=process.env.BLT_OPT_INSTALACIONES_PROJECT_JOIN_V1;
const sql=[];
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{query:async(q,params)=>{sql.push({q,params});return [[{project_key:'ID:1',total_equipos:2,equipos_no_entregados:1}]];}}};
delete require.cache[file];const repo=require(file);
test('sin supervisores la seleccion de claves se elimina con flag',async()=>{
  process.env.BLT_OPT_INSTALACIONES_PROJECT_JOIN_V1='0';sql.length=0;
  const original=await repo.listActiveProjects_cor([]);
  assert.match(sql[0].q,/INNER JOIN \(/);
  process.env.BLT_OPT_INSTALACIONES_PROJECT_JOIN_V1='1';sql.length=0;
  const result=await repo.listActiveProjects_cor([]);
  assert.deepEqual(result,original);
  assert.doesNotMatch(sql[0].q,/INNER JOIN \(/);
  assert.match(sql[0].q,/FROM ins_fl f/);
});
test('con supervisor se conserva el filtro de acceso',async()=>{
  process.env.BLT_OPT_INSTALACIONES_PROJECT_JOIN_V1='1';sql.length=0;
  await repo.listActiveProjects_cor(['AA']);
  assert.match(sql[0].q,/INNER JOIN \(/);
  assert.deepEqual(sql[0].params,['AA']);
});
test.after(()=>{
  if(oldFlag===undefined)delete process.env.BLT_OPT_INSTALACIONES_PROJECT_JOIN_V1;
  else process.env.BLT_OPT_INSTALACIONES_PROJECT_JOIN_V1=oldFlag;
  if(oldDb)require.cache[dbPath]=oldDb;else delete require.cache[dbPath];
  if(oldRepository)require.cache[file]=oldRepository;else delete require.cache[file];
});

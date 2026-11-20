'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'../src');
const dbPath=require.resolve(path.join(root,'config/db.js'));
const scopePath=require.resolve(path.join(root,'modules/experimental-ns/experimental-ns.scope.js'));
const repoPath=require.resolve(path.join(root,'modules/experimental-ns/experimental-ns-live.repository.js'));
const old=[dbPath,scopePath,repoPath].map(p=>require.cache[p]),oldFlag=process.env.BLT_OPT_NS_REVISION_COMBINED_V1;
const requests=[],allowed=[];
const first={total:9,max_id:28,ultima:50,suma:90};
const second={total:11,max_id:48,ultima:80,suma:120};
const fakeDb={query:async(sql,params=[])=>{
 requests.push({sql,params});
 if(sql.includes('CROSS JOIN'))return [[{
 p_total:first.total,p_max_id:first.max_id,p_ultima:first.ultima,p_suma:first.suma,
 t_total:second.total,t_max_id:second.max_id,t_ultima:second.ultima,t_suma:second.suma
 }]];
 if(sql.includes('FROM ns_portafolio_pruebas p'))return [[first]];
 if(sql.includes('FROM ns_tickets_pruebas t'))return [[second]];
 throw new Error('Unexpected SQL: '+sql);
}};
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:fakeDb};
require.cache[scopePath]={id:scopePath,filename:scopePath,loaded:true,exports:{
 assertScope(req){if(req?.informationAccess?.dominio!=='UNITED')throw Error('denied');},
 portafolioScope:()=>({sql:'p.zona_id IN (?)',params:[22]}),
 ticketsScope:()=>({sql:'t.zona_id IN (?)',params:[22]}),
 assertNoProductionTables(sql){allowed.push(sql);if(/\bFROM\s+(?:portafolio|tickets)\b/i.test(sql))throw Error('official forbidden');}
}};
delete require.cache[repoPath];const repo=require(repoPath);
const req={informationAccess:{dominio:'UNITED'}};
test('revision combinada devuelve exactamente la misma huella y menos viajes a MySQL',async()=>{
 process.env.BLT_OPT_NS_REVISION_COMBINED_V1='0';requests.length=0;
 const before=await repo.revision(req);assert.equal(requests.length,2);
 process.env.BLT_OPT_NS_REVISION_COMBINED_V1='1';requests.length=0;
 const after=await repo.revision(req);
 assert.equal(requests.length,1);assert.equal(after,before);
 assert.match(requests[0].sql,/CROSS JOIN/);
 assert.match(requests[0].sql,/ns_portafolio_pruebas/);
 assert.match(requests[0].sql,/ns_tickets_pruebas/);
 assert.deepEqual(requests[0].params.slice(0,1),[22]);
 assert.equal(requests[0].params.at(-1),22);
});
test('scope denegado no consulta ninguna tabla',async()=>{
 requests.length=0;
 await assert.rejects(repo.revision({informationAccess:{dominio:'CORELLIAN'}}),/denied/);
 assert.equal(requests.length,0);
});
test.after(()=>{
 if(oldFlag===undefined)delete process.env.BLT_OPT_NS_REVISION_COMBINED_V1;else process.env.BLT_OPT_NS_REVISION_COMBINED_V1=oldFlag;
 [dbPath,scopePath,repoPath].forEach((p,i)=>{if(old[i])require.cache[p]=old[i];else delete require.cache[p];});
});

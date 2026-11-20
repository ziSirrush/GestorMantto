'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const repoPath=require.resolve('../src/modules/logistica-dashboard/logistica-dashboard.repository.js');
const servicePath=require.resolve('../src/modules/logistica-dashboard/logistica-dashboard.service.js');
const oldRepo=require.cache[repoPath],oldService=require.cache[servicePath],oldFlag=process.env.BLT_OPT_LOGISTICA_PERIOD_AGG_V1;
const calls=[];
const stub={
 statusCounts_cor:async()=>[],deliveredByYear_cor:async()=>[],averageYears_cor:async()=>[],analysisYears_cor:async()=>[],
 currentYearContainers_cor:async()=>({contenedores_20_dc:2,contenedores_40_hq:1,operaciones_con_dato:2}),
 currentYearContainersByMonth_cor:async()=>[],
 averageDepartureByPort_cor:async()=>[],averageTransitByPortMode_cor:async()=>[],averageByRoute_cor:async()=>[],
 periodContainers_cor:async()=>{calls.push('legacyTotal');return {contenedores_20_dc:5,contenedores_40_hq:3,operaciones_con_dato:6};},
 periodContainerMonths_cor:async()=>{calls.push('monthly');return [
 {mes:1,contenedores_20_dc:3,contenedores_40_hq:2,operaciones_con_dato:4},
 {mes:2,contenedores_20_dc:2,contenedores_40_hq:1,operaciones_con_dato:2}];},
 freightRouteCatalogCurrentYear_cor:async()=>[]
};
require.cache[repoPath]={id:repoPath,filename:repoPath,loaded:true,exports:stub};delete require.cache[servicePath];
const service=require(servicePath);
test('Logistica ETD con flag recicla agregacion mensual conservando totales',async()=>{
 process.env.BLT_OPT_LOGISTICA_PERIOD_AGG_V1='0';calls.length=0;
 const legacy=await service.analytics_cor('all');assert.deepEqual(calls,['legacyTotal','monthly']);
 process.env.BLT_OPT_LOGISTICA_PERIOD_AGG_V1='1';calls.length=0;
 const optimized=await service.analytics_cor('all');assert.deepEqual(calls,['monthly']);
 assert.deepEqual(optimized.contenedores_periodo,legacy.contenedores_periodo);
 assert.deepEqual(optimized.contenedores,legacy.contenedores);
});
test.after(()=>{if(oldFlag===undefined)delete process.env.BLT_OPT_LOGISTICA_PERIOD_AGG_V1;else process.env.BLT_OPT_LOGISTICA_PERIOD_AGG_V1=oldFlag;
 if(oldRepo)require.cache[repoPath]=oldRepo;else delete require.cache[repoPath];
 if(oldService)require.cache[servicePath]=oldService;else delete require.cache[servicePath];
});

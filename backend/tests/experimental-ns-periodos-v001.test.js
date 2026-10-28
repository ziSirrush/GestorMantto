'use strict';
// BLT NOW | FIX_EXP_NS_PERIODOS_V001 | Pruebas locales solo mocks, SIN escrituras.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const vm=require('node:vm');
const ROOT=path.resolve(__dirname,'../src/modules/experimental-ns');
const FRONT=path.resolve(__dirname,'../../modules/experimental-ns');
const TODAY='2026-10-28';
function importMocked(file,mocks={}) {
  const location=path.join(ROOT,file);
  const inst=new Module(location,module);
  inst.filename=location;
  inst.paths=Module._nodeModulePaths(path.dirname(location));
  inst.require=function(name){
    if(Object.prototype.hasOwnProperty.call(mocks,name))return mocks[name];
    return Module.prototype.require.call(this,name);
  };
  inst._compile(fs.readFileSync(location,'utf8'),location);
  return inst.exports;
}
const metricsTime={
  todayInMexico:()=>TODAY,
  offsetDay:(iso,days)=>new Date(Date.parse(iso+'T00:00:00Z')+days*86400000).toISOString().slice(0,10)
};
const periods=importMocked('experimental-ns-periodos.js',{
  './experimental-ns-equipos-criticos.metrics':metricsTime
});
const scope={
  assertScope(req){if(!req?.informationAccess)throw new Error('DENIED');return req.informationAccess;},
  portafolioScope(){return {sql:'p.zona_id IN (?)',params:[12]};},
  ticketsScope(){return {sql:'t.zona = ?',params:['NORTE']};},
  assertNoProductionTables(sql){if(/\b(?:FROM|JOIN)\s+(?:tickets|portafolio)\b/i.test(sql))throw Error('PROD');}
};
function request(query={}){return {query,informationAccess:{domain:'UNITED'},user:{criticos_periodo:35}};}
function mocked(db={query:async()=>[[]]}){
  return {'../../config/db':db,'./experimental-ns.scope':scope,
    './experimental-ns.repository':{requireSchema:async()=>{}},
    './experimental-ns-periodos':periods};
}

test('periodo civil: valido, 29 febrero y rechazo de fechas imposibles',()=>{
  assert.equal(periods.assertDate('2024-02-29'),'2024-02-29');
  for(const invalid of ['2026-02-29','2026-13-01','2026-1-1','28/10/2026','9999-01-01']) {
    assert.throws(()=>periods.assertDate(invalid),e=>e.statusCode===400);
  }
  assert.deepEqual(periods.dayWindow('2026-10-28'),{
    inicio:'2026-10-28 00:00:00',fin:'2026-10-29 00:00:00'
  });
});

test('periodo base = union ano vigente/U365; no historico',()=>{
  assert.deepEqual(periods.historicalWindow(),{
    inicio:'2025-10-29 00:00:00', fin:'2026-10-29 00:00:00',
    desde:'2025-10-29',hasta:TODAY
  });
  assert.equal(periods.historicalWindow('2026-02-01').desde,'2025-02-02');
  assert.equal(periods.historicalWindow('2026-10-28',[900]).desde,metricsTime.offsetDay(TODAY,-900));
  assert.throws(()=>periods.historicalWindow(undefined,[9000]),e=>e.statusCode===400);
});

test('Resumen: SQL limita tickets al dia solicitado y respeta scope',async()=>{
  const calls=[];
  const db={query:async(sql,params)=>{
    calls.push({sql,params});
    if(calls.length===1)return [[{id:1}]]; // Portafolio
    if(calls.length===2)return [[{ticket:'T1',fecha_reporte:'2026-10-28'}]];
    if(calls.length===3)return [[{fecha:'2026-10-27'}]];
    if(calls.length===4)return [[{fecha:'2026-10-29'}]];
    throw Error('Extra SQL');
  }};
  const repo=importMocked('experimental-ns-resumen-dia.repository.js',mocked(db));
  const res=await repo.getInitialData(request({fecha:TODAY}));
  assert.equal(res.fecha,TODAY);
  assert.equal(res.anterior,'2026-10-27');
  assert.equal(res.siguiente,'2026-10-29');
  assert.equal(res.tickets.length,1);
  assert.equal(calls.length,4);
  assert.match(calls[1].sql,/WHERE t\.fecha_reporte >= \? AND t\.fecha_reporte < \? AND \(t\.zona = \?\)/);
  assert.deepEqual(calls[1].params,[TODAY+' 00:00:00','2026-10-29 00:00:00','NORTE',10001]);
  assert.match(calls[2].sql,/ORDER BY t\.fecha_reporte DESC LIMIT 1/);
  assert.match(calls[3].sql,/ORDER BY t\.fecha_reporte ASC LIMIT 1/);
});

test('Resumen: rechaza fecha invalida antes de tocar Aiven',async()=>{
  let reads=0;
  const repo=importMocked('experimental-ns-resumen-dia.repository.js',mocked({query:async()=>{reads++;return [[]];}}));
  await assert.rejects(repo.getInitialData(request({fecha:'2026-02-30'})),e=>e.statusCode===400);
  assert.equal(reads,0);
});

test('Resumen: limite se aplica al dia, no a los 53k historicos',async()=>{
  let calls=0;
  const repo=importMocked('experimental-ns-resumen-dia.repository.js',mocked({query:async()=>{
    calls++;
    return [calls===1?[]:Array.from({length:10001},()=>({ticket:'T'}))];
  }}));
  await assert.rejects(repo.getInitialData(request()),e=>e.code==='EXPERIMENTAL_NS_RESUMEN_DIA_LIMIT');
  assert.equal(calls,2);
});

test('Proyectos: SQL ano vigente + U365 sin SELECT historico completo',()=>{
  const repo=importMocked('experimental-ns-proyectos-mantenimiento.repository.js',mocked());
  const q=repo.queryStatements(request());
  assert.match(q.tSql,/WHERE t\.fecha_reporte >= \? AND t\.fecha_reporte < \? AND \(t\.zona = \?\)/);
  assert.deepEqual(q.tParams,['2025-10-29 00:00:00','2026-10-29 00:00:00','NORTE',50001]);
  assert.deepEqual(q.pParams,[12,50001]);
});

test('Proyectos: periodo de criticidad mayor se amplia solo cuando se solicita',()=>{
  const repo=importMocked('experimental-ns-proyectos-mantenimiento.repository.js',mocked());
  const q=repo.queryStatements(request({dias_criticos:'900'}));
  assert.equal(q.window.desde,metricsTime.offsetDay(TODAY,-900));
  assert.throws(()=>repo.queryStatements(request({dias_criticos:'900000'})),e=>e.statusCode===400);
});

test('Criticos: base U365 y extension de periodo pedida',()=>{
  const repo=importMocked('experimental-ns-equipos-criticos.repository.js',mocked());
  const q=repo.queryStatements(request());
  assert.match(q.tSql,/WHERE t\.fecha_reporte >= \? AND t\.fecha_reporte < \?/);
  assert.deepEqual(q.tParams,['2025-10-29 00:00:00','2026-10-29 00:00:00','NORTE',50001]);
  const extended=repo.queryStatements(request({dias_proyectos:'900'}));
  assert.equal(extended.window.desde,metricsTime.offsetDay(TODAY,-900));
});

test('Proyectos: grafica anterior se agrega en SQL solo por equipos del proyecto',async()=>{
  const statements=[];
  const db={query:async(sql,params)=>{
    statements.push({sql,params});
    return [[{mes:'2025-01',total:2},{mes:'2025-12',total:3}]];
  }};
  const repo=importMocked('experimental-ns-proyectos-mantenimiento.repository.js',mocked(db));
  const result=await repo.previousYearMonthly(request(),['E1','E2'],2025);
  assert.equal(result.length,12);
  assert.deepEqual(result[0],{mes:'2025-01',total:2});
  assert.deepEqual(result[11],{mes:'2025-12',total:3});
  assert.match(statements[0].sql,/COUNT\(\*\) AS total/);
  assert.match(statements[0].sql,/t\.codigo_equipo IN \(\?,\?\)/);
  assert.deepEqual(statements[0].params,['2025-01-01 00:00:00','2026-01-01 00:00:00','E1','E2','NORTE']);
  assert.deepEqual(await repo.previousYearMonthly(request(),[],2025).then(x=>x.every(v=>v.total===0)),true);
});

test('LIVE: revision Resumen considera solo fecha y alcance',()=>{
  const repo=importMocked('experimental-ns-live.repository.js',mocked());
  const q=repo.queries({...request({fecha:'2026-10-26'}),path:'/live/resumen-dia/revision'});
  assert.match(q.tickets,/t\.fecha_reporte >= \? AND t\.fecha_reporte < \?/);
  assert.deepEqual(q.tParams,['2026-10-26 00:00:00','2026-10-27 00:00:00','NORTE']);
});

test('LIVE: revision Proyectos/ Criticos no consulta todo historico',()=>{
  const repo=importMocked('experimental-ns-live.repository.js',mocked());
  for(const p of ['proyectos-mantenimiento','equipos-criticos']) {
    const q=repo.queries({...request(),path:`/live/${p}/revision`});
    assert.deepEqual(q.tParams,['2025-10-29 00:00:00','2026-10-29 00:00:00','NORTE']);
  }
});

test('LIVE y front: solamente lectura, sin tocar productivo ni motor universal NS',()=>{
  const files=[
    'experimental-ns-resumen-dia.repository.js',
    'experimental-ns-proyectos-mantenimiento.repository.js',
    'experimental-ns-equipos-criticos.repository.js',
    'experimental-ns-live.repository.js'
  ];
  for(const file of files){
    const code=fs.readFileSync(path.join(ROOT,file),'utf8');
    assert.doesNotMatch(code,/\b(?:UPDATE|DELETE|INSERT|TRUNCATE|ALTER|DROP)\s+(?:FROM|TABLE|INTO|ns_)/i);
    assert.doesNotMatch(code,/\b(?:FROM|JOIN)\s+(?:tickets|portafolio)\b/i);
  }
  const frontend=fs.readFileSync(path.join(FRONT,'resumen-dia/resumen-dia-ns.js'),'utf8');
  assert.match(frontend,/const url=ENDPOINT\+\(requested\?'\?fecha='/);
  assert.doesNotMatch(frontend,/\/api\/tickets/);
});

test('Frontend Resumen solicita solamente el dia elegido sin fetch historico',async()=>{
  const pathFront=path.join(FRONT,'resumen-dia/resumen-dia-ns.js');
  const calls=[];
  const window={ManttoAuth:{apiGet:async url=>{
    calls.push(url);
    return {ok:true,source:'experimental-ns',fecha:'2026-10-25',anterior:'2026-10-24',
      siguiente:'2026-10-26',truncado:false,data:{tickets:[],portafolio:[]}};
  }}};
  const document={getElementById:()=>null};
  vm.runInNewContext(fs.readFileSync(pathFront,'utf8'),{window,document,Date,Number,Map,Set,Promise,console});
  assert.equal(typeof window.ManttoResumenDiaNS.load,'function');
  const done=await window.ManttoResumenDiaNS.load({date:'2026-10-25'});
  assert.equal(done.changed,0);
  assert.deepEqual(calls,['/api/experimental-ns/resumen-dia/inicial?fecha=2026-10-25']);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const metrics = require('../src/modules/experimental-ns/experimental-ns-equipos-criticos.metrics');
const moduleBase = '../src/modules/experimental-ns/';
const today = '2026-10-26';

function criteria({eqMin=3,proMin=5,eqDays=35,proDays=35,eqPage=1}={}) {
  return {
    equipos: {dias:eqDays,min_fallas:eqMin,page:eqPage,page_size:25,zona:'',proyecto:'',search:''},
    proyectos: {dias:proDays,min_fallas:proMin,min_fallas_equipo:3,page:1,page_size:25,zona:'',proyecto:''}
  };
}
function p(code,zone=10,id=null) {
  return {id_portafolio:code==='E1'?1:2,id_proyecto_cobranza:id,
    numero_equipo:code,proyecto:'HOTEL CENTRO',ciudad:'CDMX',
    zona_id:zone,zona_operativa:zone===10?'NORTE':'SUR',
    identificacion_sitio:'Ref '+code,supervisor_zona:'Supervisor',
    superintendente:'Superintendente',estatus_servicio:'En Servicio',inactivo:'NO',estado_registro:1};
}
function t(code,i,day='2026-10-25',resp='BLT',project='HOTEL CENTRO') {
  return {id:i,ticket:'F-'+i,codigo_equipo:code,proyecto:project,
    fecha_dia:day,fecha_reporte:day+' 12:00:00',responsabilidad:resp,
    estado_ticket:'Cerrado',causa_falla:'Falla',custeventblt_mot_det:'Detalle NS'};
}
function fixture() {
  const portfolio=[p('E1',10),p('E2',20)];
  const tickets=[
    ...Array.from({length:5},(_,i)=>t('E1',i+1,'2026-10-25','BLT',i===0?'PROYECTO EQUIVOCADO':'HOTEL CENTRO')),
    ...Array.from({length:3},(_,i)=>t('E2',10+i)),
    t('E1',25,'2026-08-01','BLT'),
    t('E1',30,'2026-10-25','CLIENTE'),
    t('UNKNOWN',31),
    t('E1',32,'2026-10-28','BLT')
  ];
  return {portfolio,tickets};
}
function withMockImports(target, mocks) {
  const originalLoad=Module._load;
  Module._load=function(request,parent,isMain) {
    if(Object.prototype.hasOwnProperty.call(mocks,request)) return mocks[request];
    return originalLoad.apply(this,arguments);
  };
  try {const resolved=require.resolve(target);delete require.cache[resolved];return require(target);}
  finally {Module._load=originalLoad;}
}

test('F4: dia local CDMX y rangos U365 deterministas',()=>{
  assert.equal(metrics.todayInMexico(new Date('2026-10-26T03:00:00.000Z')),'2026-10-25');
  assert.equal(metrics.offsetDay(today,-364),'2025-10-27');
});
test('F4: dos equipos con fallas BLT, no agrupa proyectos homonimos de zonas distintas',()=>{
  const f=fixture();const out=metrics.evaluate(f.portfolio,f.tickets,criteria(),today);
  assert.equal(out.equipos.total,2);
  assert.equal(out.proyectos.total,1);
  assert.equal(out.proyectos.data[0].equipos_activos,1);
  assert.equal(out.proyectos.data[0].fallas_blt_periodo,5);
  assert.equal(out.u365.total,2);
});
test('F4: mapeo de proyecto SIEMPRE por equipo NS, nunca por texto libre de ticket',()=>{
  const f=fixture();const out=metrics.evaluate(f.portfolio,f.tickets,criteria(),today);
  const row=out.equipos.data.find(row=>row.codigo_equipo==='E1');
  assert.equal(row.proyecto,'HOTEL CENTRO');
  assert.equal(out.calidad.tickets_proyecto_discrepante,1);
  const detail=out.details.proyecto(row.proyecto_clave,35);
  assert.equal(detail.length,5);
  assert.ok(detail.every(x=>x.proyecto_oficial==='HOTEL CENTRO'));
});
test('F4: no cuenta tickets sin equipo activo/visible',()=>{
  const out=metrics.evaluate(...Object.values(fixture()),criteria(),today);
  assert.equal(out.calidad.tickets_sin_equipo_activo,1);
});
test('F4: distingue BLT, CLIENTE, fallas fuera periodo y llamadas año',()=>{
  const f=fixture();const out=metrics.evaluate(f.portfolio,f.tickets,criteria(),today);
  const row=out.equipos.data.find(x=>x.codigo_equipo==='E1');
  assert.equal(row.fallas_blt_periodo,5);
  assert.equal(row.resp_cliente_periodo,1);
  assert.equal(row.fallas_blt_fuera_periodo,1);
  assert.equal(row.fallas_blt_anio,6);
  assert.equal(row.calls_anio,7);
  assert.equal(row.mtbc_dias,7);
});
test('F4: no cuenta fechas futuras',()=>{
  const out=metrics.evaluate(...Object.values(fixture()),criteria(),today);
  assert.equal(out.equipos.data.find(x=>x.codigo_equipo==='E1').fallas_blt_periodo,5);
});
test('F4: la fecha del periodo se incluye con limite inferior',()=>{
  const f=fixture();f.tickets.push(t('E1',60,'2026-09-21'));
  const out=metrics.evaluate(f.portfolio,f.tickets,criteria(),today);
  assert.equal(out.equipos.data.find(x=>x.codigo_equipo==='E1').fallas_blt_periodo,6);
});
test('F4: MTBC Ano Actual y U365 son calculos independientes del periodo',()=>{
  const f=fixture();const out=metrics.evaluate(f.portfolio,f.tickets,criteria(),today);
  const row=out.equipos.data.find(x=>x.codigo_equipo==='E1');
  const days=1+(Date.parse(today+'T00:00:00Z')-Date.parse('2026-01-01T00:00:00Z'))/86400000;
  assert.equal(row.mtbc_anio,Math.round(days/6*1000)/1000);
  assert.equal(row.mtbc_365,Math.round(365/6*1000)/1000);
});
test('F4: parametros de filtros sobre equipo, zona y proyecto',()=>{
  const f=fixture();const c=criteria();c.equipos.zona='NORTE';c.proyectos.proyecto='OTRO';
  const out=metrics.evaluate(f.portfolio,f.tickets,c,today);
  assert.equal(out.equipos.total,1);
  assert.equal(out.proyectos.total,0);
});
test('F4: detalles por equipo revelan SOLO tickets BLT de codigo autorizado',()=>{
  const f=fixture();const out=metrics.evaluate(f.portfolio,f.tickets,criteria(),today);
  assert.equal(out.details.equipo('E1',35).length,5);
  assert.equal(out.details.equipo('E2',35).length,3);
  assert.deepEqual(out.details.equipo('UNKNOWN',35),[]);
});
test('F4: equipos con codigo duplicado en NS fallan cerrado',()=>{
  const f=fixture();f.portfolio.push({...p('E1',10),id_portafolio:999});
  assert.throws(()=>metrics.evaluate(f.portfolio,f.tickets,criteria(),today),
    e=>e.statusCode===503 && e.code==='EXPERIMENTAL_NS_DUPLICATE_EQUIPMENT');
});
test('F4: inactivos y NO EN SERVICIO no se consideran activos',()=>{
  const f=fixture();f.portfolio[0].inactivo='SI';f.portfolio[1].estatus_servicio='No en Servicio';
  const out=metrics.evaluate(f.portfolio,f.tickets,criteria(),today);
  assert.equal(out.equipos.total,0);
  assert.equal(out.proyectos.total,0);
});
test('F4: agrupacion por ID de proyecto, cuando esta disponible',()=>{
  const a=p('E1',10,777),b=p('E2',20,777);const f=fixture();
  const out=metrics.evaluate([a,b],f.tickets,criteria(),today);
  assert.equal(out.proyectos.total,1);
  assert.equal(out.proyectos.data[0].equipos_activos,2);
});
test('F4: paginacion y U365 independientes',()=>{
  const f=fixture();const c=criteria({eqPage:2});
  c.equipos.page_size=1;
  const out=metrics.evaluate(f.portfolio,f.tickets,c,today);
  assert.equal(out.equipos.total,2);
  assert.equal(out.equipos.data.length,1);
  assert.equal(out.u365.total,2);
});

// Contrato de aislamiento SQL en fuente. Todas las consultas son parametrizadas.
const fakeScope={
  assertScope(req){if(!req.informationAccess)throw new Error('Sin scope');return req.informationAccess;},
  portafolioScope(){return {sql:'p.zona_id IN (?)',params:[10]}},
  ticketsScope(){return {sql:"EXISTS (SELECT 1 FROM ns_portafolio_pruebas p_scope_uni_ticket_equipo WHERE p_scope_uni_ticket_equipo.numero_equipo=t.codigo_equipo AND p_scope_uni_ticket_equipo.zona_id=?)",params:[10]}},
  assertNoProductionTables(sql){if(/\b(?:FROM|JOIN)\s+(?:portafolio|tickets)\b/i.test(sql))throw new Error('PRODUCTION_SCOPE_TABLE');}
};
const fakeBase={requireSchema:async()=>{}};
function loadRepository(mockDb) {
  return withMockImports(moduleBase+'experimental-ns-equipos-criticos.repository',{
    '../../config/db':mockDb,
    './experimental-ns.repository':fakeBase,
    './experimental-ns.scope':fakeScope
  });
}

test('F4: SQL productivo NO aparece en ninguna consulta principal ni en scope',()=>{
  const repo=loadRepository({query:async()=>[[]]});
  const q=repo.queryStatements({informationAccess:{}});
  assert.match(q.pSql,/FROM ns_portafolio_pruebas p/i);
  assert.match(q.tSql,/FROM ns_tickets_pruebas t/i);
  assert.match(q.tSql,/FROM ns_portafolio_pruebas p_scope_uni_ticket_equipo/i);
  for(const sql of [q.pSql,q.tSql])assert.doesNotMatch(sql,/\b(?:FROM|JOIN)\s+`?(?:portafolio|tickets)`?(?:\s|$)/i);
  assert.deepEqual(q.pParams,[10,50001]);
  // FIX PERIODOS V001: el filtro historico de Tickets usa [inicio,fin).
  assert.match(q.tSql,/t\.fecha_reporte\s*>=\s*\?/);
  assert.match(q.tSql,/t\.fecha_reporte\s*<\s*\?/);
  assert.equal(q.tParams.length,4);
  assert.match(q.tParams[0],/^\d{4}-\d{2}-\d{2} 00:00:00$/);
  assert.match(q.tParams[1],/^\d{4}-\d{2}-\d{2} 00:00:00$/);
  assert.ok(q.tParams[0] < q.tParams[1]);
  assert.deepEqual(q.tParams.slice(2),[10,50001]);
});
test('F4: ausencia de columnas necesarias bloquea SELECT de datos',async()=>{
  let reads=0;
  const repo=loadRepository({query:async()=>{reads++;return [[{TABLE_NAME:'ns_portafolio_pruebas',COLUMN_NAME:'numero_equipo'}]];}});
  await assert.rejects(()=>repo.readSnapshot({informationAccess:{}}),e=>e.statusCode===503 && e.code==='EXPERIMENTAL_NS_CRITICAL_SCHEMA_INCOMPLETE');
  assert.equal(reads,1);
});
test('F4: al exceder limite, nunca devuelve agregados parciales',async()=>{
  let reads=0;
  const repo=loadRepository({query:async()=>{
    reads++;
    if(reads===1) return [[...Object.entries(repo.COLUMNS).flatMap(([TABLE_NAME, cols])=>cols.map(COLUMN_NAME=>({TABLE_NAME,COLUMN_NAME})))]];
    if(reads===2) return [Array.from({length:50001},(_,i)=>({id_portafolio:i}))];
    throw new Error('No debe consultar Tickets si Portafolio excedio limite');
  }});
  await assert.rejects(()=>repo.readSnapshot({informationAccess:{}}),e=>e.statusCode===503 && e.code==='EXPERIMENTAL_NS_EQUIPMENT_LIMIT');
  assert.equal(reads,2);
});
test('F4: repositorio no contiene SQL de escritura ni consulta tabla operativa',()=>{
  const content=fs.readFileSync(path.join(__dirname,'../src/modules/experimental-ns/experimental-ns-equipos-criticos.repository.js'),'utf8');
  assert.doesNotMatch(content,/\b(?:INSERT\s+INTO|UPDATE\s+ns_|DELETE\s+FROM|REPLACE\s+INTO)\b/i);
  assert.doesNotMatch(content,/\bFROM\s+portafolio\b|\bFROM\s+tickets\b/i);
});
test('F4: servicio exige permiso individual antes de obtener snapshot',async()=>{
  let readCount=0;
  const service=withMockImports(moduleBase+'experimental-ns-equipos-criticos.service',{
    './experimental-ns-equipos-criticos.repository':{readSnapshot:async()=>{readCount++;return {portafolio:[],tickets:[]}}},
    './experimental-ns.scope':{assertScope:()=>({permission_code:'OTRO',dominio:'UNITED'})}
  });
  await assert.rejects(()=>service.getInitial({query:{},user:{}}),e=>e.statusCode===403);
  assert.equal(readCount,0);
});
test('F4: servicio responde usando las dos fuentes NS y sin escritura',async()=>{
  const f=fixture();
  const service=withMockImports(moduleBase+'experimental-ns-equipos-criticos.service',{
    './experimental-ns-equipos-criticos.repository':{readSnapshot:async()=>({portafolio:f.portfolio,tickets:f.tickets})},
    './experimental-ns.scope':{assertScope:()=>({permission_code:'EXPERIMENTAL_NS_EQUIPOS_CRITICOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL'})}
  });
  const out=await service.getInitial({query:{},user:{criticos_fallas:3,criticos_periodo:35}});
  assert.equal(out.ok,true);
  assert.deepEqual(out.tablas,['ns_portafolio_pruebas','ns_tickets_pruebas']);
  assert.equal(out.modo,'SOLO_LECTURA');
});
test('F4: rutas GET y guard de Programador, no hay rutas de escritura',()=>{
  const endpoints=[];
  const fakeExpress={Router:()=>({
    get:(...args)=>endpoints.push(args),
    post:()=>assert.fail('POST prohibido'),put:()=>assert.fail('PUT prohibido'),
    patch:()=>assert.fail('PATCH prohibido'),delete:()=>assert.fail('DELETE prohibido')
  })};
  const router=withMockImports(moduleBase+'experimental-ns-equipos-criticos.routes',{
    express:fakeExpress,
    '../../middleware/information-access-gnral.middleware':{
      humanInformationGuard_gnral:({permissionCode,groupingCode})=>{
        assert.equal(groupingCode,'EXPERIMENTAL_NS');
        assert.equal(permissionCode,'EXPERIMENTAL_NS_EQUIPOS_CRITICOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL');
        return [(_req,_res,next)=>next(),(_req,_res,next)=>next()];
      }
    },
    './experimental-ns-equipos-criticos.controller':{initial(){},detail(){}},
    './experimental-ns-equipos-criticos.service':{REQUIRED_PERMISSION:'EXPERIMENTAL_NS_EQUIPOS_CRITICOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL'}
  });
  assert.ok(router);
  assert.equal(endpoints.length,2);
  assert.deepEqual(endpoints.map(x=>x[0]),['/equipos-criticos/inicial','/equipos-criticos/detalle']);
  for(const endpoint of endpoints){
    const guard=endpoint[2],res={status(c){this.code=c;return this;},json(v){this.body=v;return this;}};
    guard({actorUser:{is_programador:false}},res,()=>assert.fail('No autorizar no Programador'));
    assert.equal(res.code,403);
    let nextCalled=false;
    guard({actorUser:{is_programador:true}},res,()=>nextCalled=true);
    assert.equal(nextCalled,true);
  }
});
test('F4: interfaz experimental no invoca API ni componentes productivos',()=>{
  const root=path.join(__dirname,'../../modules/experimental-ns');
  const code=fs.readFileSync(path.join(root,'equipos-criticos/equipos-criticos-ns.js'),'utf8');
  const shell=fs.readFileSync(path.join(root,'experimental-ns.js'),'utf8');
  assert.match(code,/\/api\/experimental-ns\/equipos-criticos/);
  assert.doesNotMatch(code,/\/api\/(?:equipos-criticos|proyectos-criticos|indicadores\/mtbc|portafolio|tickets)/);
  assert.doesNotMatch(code,/ManttoDetails\.|ManttoEquiposCriticos\.|mantto:criticos-preferencias-updated/);
  assert.match(shell,/modules\/equipos-criticos\/equipos-criticos\.css/);
  assert.doesNotMatch(shell,/loadScript\('\.\/modules\/equipos-criticos\/equipos-criticos\.js/);
});

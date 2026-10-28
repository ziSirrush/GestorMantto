'use strict';

// BLT NOW Experimental NS F5 | QA aislado: SIN credenciales, sin SQL real.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const Module=require('node:module');
const root=path.join(__dirname,'../src/modules/experimental-ns');
const metrics=require(path.join(root,'experimental-ns-proyectos-mantenimiento.metrics'));
const today='2026-10-26';
const criteria=overrides=>({...metrics.parseCriteria({}),...overrides});
const p=(code,project,zone=10,id=null)=>({id_portafolio:code,id_proyecto_cobranza:id,
  numero_equipo:code,proyecto:project,proyecto_cc_x_port:project,
  ciudad:'CDMX',estado:'México',zona_id:zone,zona_operativa:zone===10?'NORTE':'SUR',
  supervisor_zona:'SUP A',identificacion_sitio:code,producto:'Elevador',
  tipo_poliza:'Cobranza',estatus_servicio:'En Servicio',inactivo:'NO',estado_registro:1});
const t=(code,id,date,resp='BLT',status='Funcionando',project='PLAZA NORTE')=>({id,ticket:'T'+id,
  codigo_equipo:code,proyecto:project,proyecto_padre:project,estado_ticket:'Cerrado',
  fecha_reporte:date+' 09:00:00',fecha_cierre:date+' 13:00:00',
  estatus_equipo_final:status,responsabilidad:resp,causa:'Prueba',causa_falla:'Mantenimiento',
  custeventblt_mot_det:'Motivo '+id});
function fixture(){return {
  portafolio:[p('E1','PLAZA NORTE',10,101),p('E2','PLAZA NORTE',10,101),
    p('E3','PLAZA NORTE',20),p('E4','PLAZA NORTE',10),p('E5','OTRO',10,102)],
  tickets:[t('E1',1,'2026-10-25','BLT','No funciona','OTRO'),
    t('E1',2,'2026-10-20','CLIENTE','Funcionando'),
    t('E1',3,'2026-01-21','BLT'),t('E2',4,'2026-10-24','BLT'),
    t('E2',5,'2025-11-01','BLT'),t('E3',6,'2026-10-22','BLT'),
    t('E4',7,'2026-10-21','BLT'),t('E5',8,'2026-10-24','CLIENTE'),
    t('UNKNOWN',9,'2026-10-24','BLT')]
};}
function fakeContext(permission='EXPERIMENTAL_NS_PROYECTOS_MANTENIMIENTO_ACCESO_VISUAL_MODULO.ACCESO_VISUAL'){
  return {query:{},actorUser:{is_programador:true},user:{},informationAccess:{
    dominio:'UNITED',motor:'alcance_uni',agrupacion:{codigo:'EXPERIMENTAL_NS'},
    acceso_puerta:true,permission_code:permission}};
}
function mockImports(filepath,mocks){const absolute=path.join(root,filepath+'.js');
  const original=Module._load;
  delete require.cache[require.resolve(absolute)];
  Module._load=function(name,parent,isMain){if(Object.hasOwn(mocks,name))return mocks[name];return original.apply(this,arguments);};
  try{return require(absolute);}finally{Module._load=original;}}

// Calculo puro / identidades / cruces.
test('F5: solo agrupa equipos bajo ID canonico; fallback zona+nombre independiente',()=>{
  const f=fixture(),out=metrics.calc(f.portafolio,f.tickets,criteria(),today);
  assert.equal(out.total,4);
  const ids=out.rows.map(x=>x.proyecto_clave);
  assert.equal(new Set(ids).size,4);
  assert.ok(ids.includes('ID:101'));
  assert.ok(ids.some(k=>k.startsWith('Z:20:PLAZA NORTE')));
  assert.ok(ids.some(k=>k.startsWith('Z:10:PLAZA NORTE')));
  assert.equal(out.rows.find(x=>x.proyecto_clave==='ID:101').equipos,2);
});
test('F5: los tickets asignan proyecto por codigo de equipo y nunca por nombre libre',()=>{
  const f=fixture(),out=metrics.calc(f.portafolio,f.tickets,criteria(),today);
  assert.equal(out.quality.tickets_proyecto_discrepante,2);// E1 discrepante y E5 categoria distinta
  assert.equal(out.quality.tickets_sin_equipo_activo,1);
  const project=out.detalle('ID:101');
  assert.equal(project.total.tickets,5);
  assert.equal(project.tickets.some(x=>x.ticket==='T9'),false);
  assert.equal(project.tickets.some(x=>x.ticket==='T6'),false);
  assert.equal(project.tickets.some(x=>x.ticket==='T1'),true);
});
test('F5: mismo nombre de proyecto en otra zona no mezcla equipos ni tickets',()=>{
  const f=fixture();const out=metrics.calc(f.portafolio,f.tickets,criteria(),today);
  const south=out.detalle('Z:20:PLAZA NORTE');
  assert.deepEqual(south.equipos.map(x=>x.numero_equipo),['E3']);
  assert.deepEqual(south.tickets.map(x=>x.ticket),['T6']);
});
test('F5: tickets sin codigo NS autorizado no se incorporan a totales',()=>{
  const f=fixture(),out=metrics.calc(f.portafolio,f.tickets,criteria(),today);
  assert.equal(out.rows.reduce((a,p)=>a+p.llamadas_total_anio,0),7);
});
test('F5: KPI de MTBC U365 (365 * equipos con BLT / fallas BLT)',()=>{
  const out=metrics.calc(fixture().portafolio,fixture().tickets,criteria(),today);
  const p=out.detalle('ID:101').proyecto;
  assert.equal(p.fallas_blt_365d,4);
  assert.equal(p.equipos_con_falla_blt_365,2);
  assert.equal(p.mtbc_365,182.5);
  assert.equal(out.summary.mtbc_365,round3(365*4/6));
});
function round3(n){return Math.round(n*1000)/1000;}
test('F5: parados se determinan solo por ultimo ticket de cada equipo',()=>{
  const f=fixture(),out=metrics.calc(f.portafolio,f.tickets,criteria(),today);
  const p=out.detalle('ID:101');
  assert.equal(p.proyecto.parados,1);
  const e1=p.equipos.find(x=>x.numero_equipo==='E1');
  assert.equal(e1.estado_operativo,'Parado');
  assert.equal(e1.dias_parado,1);
});
test('F5: calculo de tiempo y mensualidades respeta fechas de calendario CDMX',()=>{
  const out=metrics.calc(fixture().portafolio,fixture().tickets,criteria(),today);
  const p=out.detalle('ID:101');
  assert.equal(p.mensual_actual.length,12);
  assert.equal(p.mensual_anterior.length,12);
  assert.equal(p.mensual_actual.find(x=>x.mes==='2026-10').total,3);
  assert.equal(p.mensual_anterior.find(x=>x.mes==='2025-11').total,1);
});
test('F5: resp BLT/CLIENTE y criterio de 35 dias independientes',()=>{
  const out=metrics.calc(fixture().portafolio,fixture().tickets,criteria(),today);
  const p=out.detalle('ID:101').proyecto;
  assert.equal(p.llamadas_blt_anio,3);
  assert.equal(p.llamadas_cliente_anio,1);
  assert.equal(p.tickets_35d,3);
});
test('F5: filtros de zona, estado, supervisor y búsqueda se acotan a proyectos autorizados',()=>{
  const f=fixture();
  const out=metrics.calc(f.portafolio,f.tickets,criteria({zona:'SUR'}),today);
  assert.equal(out.total,1);
  assert.deepEqual(out.rows.map(x=>x.proyecto_clave),['Z:20:PLAZA NORTE']);
  assert.equal(out.detalle('ID:101'),null);
  assert.equal(out.filters.zonas.length,2);
  assert.equal(metrics.calc(f.portafolio,f.tickets,criteria({search:'E2'}),today).total,1);
});
test('F5: pagina solo contiene el subconjunto pero summary contabiliza todos los filtrados',()=>{
  const f=fixture();f.portafolio.push(...Array.from({length:6},(_,i)=>p('X'+i,'PROYECTO-'+i,10,900+i)));
  const out=metrics.calc(f.portafolio,f.tickets,criteria({page:2,page_size:5}),today);
  assert.equal(out.total,10);assert.equal(out.rows.length,5);assert.equal(out.summary.proyectos,10);
});
test('F5: detalle no puede abrir proyectos que no estan autorizados',()=>{
  const f=fixture(),out=metrics.calc(f.portafolio,f.tickets,criteria({zona:'SUR'}),today);
  assert.equal(out.detalle('ID:101'),null);
});
test('F5: conflicto ID y nombres de proyecto distintos aborta, sin mezclarlos',()=>{
  const f=fixture();f.portafolio.push(p('E999','PROYECTO INCORRECTO',10,101));
  assert.throws(()=>metrics.calc(f.portafolio,f.tickets,criteria(),today),e=>e.statusCode===503&&e.code==='EXPERIMENTAL_NS_PROJECT_ID_CONFLICT');
});
test('F5: codigo de equipo duplicado aborta calculos',()=>{
  const f=fixture();f.portafolio.push({...f.portafolio[0]});
  assert.throws(()=>metrics.calc(f.portafolio,f.tickets,criteria(),today),e=>e.code==='EXPERIMENTAL_NS_PROJECT_DUPLICATE_EQUIPMENT');
});
test('F5: ticket duplicado aborta calculos',()=>{
  const f=fixture();f.tickets.push({...f.tickets[0]});
  assert.throws(()=>metrics.calc(f.portafolio,f.tickets,criteria(),today),e=>e.code==='EXPERIMENTAL_NS_PROJECT_DUPLICATE_TICKET');
});
test('F5: fecha futura se ignora y deja rastro de calidad',()=>{
  const f=fixture();f.tickets.push(t('E1',100,'2026-11-03'));
  const out=metrics.calc(f.portafolio,f.tickets,criteria(),today);
  assert.equal(out.quality.tickets_fecha_futura,1);
  assert.equal(out.detalle('ID:101').total.tickets,5);
});
test('F5: inactivos, NO EN SERVICIO y proyectos sin zona ni ID no abren acceso',()=>{
  const f=fixture();f.portafolio[0].inactivo='SI';f.portafolio[1].estatus_servicio='No en Servicio';
  f.portafolio.push(p('N0','SIN ZONA',null));
  const out=metrics.calc(f.portafolio,f.tickets,criteria(),today);
  assert.equal(out.detalle('ID:101'),null);
  assert.equal(out.quality.equipos_sin_proyecto_verificable,1);
});
test('F5: parametros maliciosos y no numericos se rechazan ANTES de leer datos',()=>{
  assert.throws(()=>metrics.parseCriteria({page:'1; DROP TABLE tickets'}),e=>e.statusCode===400);
  assert.throws(()=>metrics.parseCriteria({zona:'NORTE\nSQL'}),e=>e.statusCode===400);
  assert.throws(()=>metrics.parseCriteria({page_size:9999}),e=>e.statusCode===400);
});
test('F5: motivo detalle custeventblt_mot_det se conserva en historico NS',()=>{
  const out=metrics.calc(fixture().portafolio,fixture().tickets,criteria(),today);
  assert.equal(out.detalle('ID:101').tickets[0].custeventblt_mot_det,'Motivo 1');
});
test('F5: limites de detalle no fabrican registros y senalan truncado',()=>{
  const f={portafolio:[p('A','PROYECTO A',10,11)],tickets:Array.from({length:1001},(_,i)=>t('A',i+1,'2026-10-20'))};
  const out=metrics.calc(f.portafolio,f.tickets,criteria(),today);
  const d=out.detalle('ID:11');
  assert.equal(d.total.tickets,1001);assert.equal(d.tickets.length,1000);assert.equal(d.limitado.tickets,true);
});

// Unitarias de seguridad, esquema y enrutado (mocks de Aiven).
const F2_REQUIRED=require(path.join(root,'experimental-ns-equipos-criticos.metrics'));
const fakeScope={
  assertScope(req){if(!req.informationAccess)throw new Error('sin acceso');return req.informationAccess;},
  portafolioScope(){return {sql:'p.zona_id IN (?)',params:[10]};},
  ticketsScope(){return {sql:'EXISTS (SELECT 1 FROM ns_portafolio_pruebas p_scope_uni_ticket_equipo WHERE p_scope_uni_ticket_equipo.numero_equipo=t.codigo_equipo AND p_scope_uni_ticket_equipo.zona_id=?)',params:[10]};},
  assertNoProductionTables(sql){if(/\b(?:FROM|JOIN)\s+`?(?:portafolio|tickets)`?(?=\s|$)/i.test(sql))throw Error('Se leyo produccion');}
};
function repoMock(db,extras={}){
  return mockImports('experimental-ns-proyectos-mantenimiento.repository',{
    '../../config/db':db,
    './experimental-ns.repository':extras.base||{requireSchema:async()=>{}},
    './experimental-ns.scope':fakeScope
  });
}

test('F5: todas las consultas SQL contienen solo fuentes ns_ y scope territorial',()=>{
  const r=repoMock({query:async()=>[[]]});const q=r.queryStatements(fakeContext());
  assert.match(q.pSql,/FROM ns_portafolio_pruebas p/);
  assert.match(q.tSql,/FROM ns_tickets_pruebas t/);
  assert.match(q.tSql,/FROM ns_portafolio_pruebas p_scope_uni_ticket_equipo/);
  assert.deepEqual(q.pParams,[10,50001]);
  // FIX PERIODOS V001: verificamos el filtro de fecha sin asumir el dia de CI.
  assert.match(q.tSql,/t\.fecha_reporte\s*>=\s*\?/);
  assert.match(q.tSql,/t\.fecha_reporte\s*<\s*\?/);
  assert.equal(q.tParams.length,4);
  assert.match(q.tParams[0],/^\d{4}-\d{2}-\d{2} 00:00:00$/);
  assert.match(q.tParams[1],/^\d{4}-\d{2}-\d{2} 00:00:00$/);
  assert.ok(q.tParams[0] < q.tParams[1]);
  assert.deepEqual(q.tParams.slice(2),[10,50001]);
  for(const sql of [q.pSql,q.tSql]){
    assert.doesNotMatch(sql,/\b(?:FROM|JOIN)\s+`?(?:portafolio|tickets|z_op)`?(?=\s|$)/i);
    assert.doesNotMatch(sql,/\b(?:UPDATE|INSERT|DELETE|REPLACE|TRUNCATE|ALTER|DROP)\s+/i);
  }
});
test('F5: esquema faltante aborta ANTES de leer un solo registro',async()=>{
  let reads=0;
  const r=repoMock({query:async(sql)=>{reads++;assert.match(sql,/INFORMATION_SCHEMA/);return [[{TABLE_NAME:'ns_portafolio_pruebas',COLUMN_NAME:'numero_equipo'}]];}});
  await assert.rejects(()=>r.readSnapshot(fakeContext()),e=>e.code==='EXPERIMENTAL_NS_PROJECT_SCHEMA_INCOMPLETE');
  assert.equal(reads,1);
});
test('F5: limite de 50k aborta resultados parciales y evita consulta de tickets',async()=>{
  let reads=0;let r;
  const db={query:async sql=>{
    reads++;
    if(reads===1)return [[...Object.entries(r.SELECT_COLUMNS).flatMap(([TABLE_NAME,cols])=>cols.map(COLUMN_NAME=>({TABLE_NAME,COLUMN_NAME})))]];
    if(reads===2)return [Array.from({length:50001},(_,i)=>({id_portafolio:i}))];
    assert.fail('No debe consultarse Tickets con limite de Portafolio excedido');
  }};
  r=repoMock(db);
  await assert.rejects(()=>r.readSnapshot(fakeContext()),e=>e.code==='EXPERIMENTAL_NS_PROJECT_EQUIPMENT_LIMIT');
  assert.equal(reads,2);
});
test('F5: lectura del snapshot utiliza dos consultas secuenciales (sin paralelismo)',async()=>{
  const calls=[];let r;
  const db={query:async(sql,params)=>{
    calls.push(sql);
    if(calls.length===1)return [[...Object.entries(r.SELECT_COLUMNS).flatMap(([TABLE_NAME,cols])=>cols.map(COLUMN_NAME=>({TABLE_NAME,COLUMN_NAME})))]];
    if(calls.length===2)return [[{...p('A','PROYECTO',10,5)}]];
    if(calls.length===3)return [[{...t('A',7,'2026-10-25')}]];
    assert.fail('Consulta inesperada');
  }};
  r=repoMock(db);const out=await r.readSnapshot(fakeContext());
  assert.equal(calls.length,3);assert.equal(out.portafolio.length,1);assert.equal(out.tickets.length,1);
});
test('F5: permiso individual obligatorio antes de snapshot',async()=>{
  let called=0;
  const service=mockImports('experimental-ns-proyectos-mantenimiento.service',{
    './experimental-ns-proyectos-mantenimiento.repository':{readSnapshot:async()=>{called++;return {}; }},
    './experimental-ns.scope':{assertScope(req){return req.informationAccess;}}
  });
  await assert.rejects(()=>service.getInitial(fakeContext('OTRO_PERMISO')),e=>e.statusCode===403);
  assert.equal(called,0);
});
test('F5: contrato respuesta publica exclusivamente ambas tablas NS',async()=>{
  const f=fixture();const service=mockImports('experimental-ns-proyectos-mantenimiento.service',{
    './experimental-ns-proyectos-mantenimiento.repository':{readSnapshot:async()=>f},
    './experimental-ns.scope':{assertScope(req){return req.informationAccess;}}
  });
  const result=await service.getInitial(fakeContext());
  assert.equal(result.source,'experimental-ns');assert.equal(result.modo,'SOLO_LECTURA');
  assert.deepEqual(result.tablas,['ns_portafolio_pruebas','ns_tickets_pruebas']);
  assert.equal(result.pagination.total,4);
});
test('F5: detalle por ID canonico conserva causa y dato adicional NS',async()=>{
  const service=mockImports('experimental-ns-proyectos-mantenimiento.service',{
    './experimental-ns-proyectos-mantenimiento.repository':{readSnapshot:async()=>fixture()},
    './experimental-ns.scope':{assertScope(req){return req.informationAccess;}}
  });
  const req=fakeContext();req.query.proyecto_clave='ID:101';
  const result=await service.getDetail(req);
  assert.equal(result.ok,true);assert.equal(result.data.proyecto.equipos,2);
  assert.ok(result.data.tickets.some(x=>x.custeventblt_mot_det==='Motivo 1'));
});
test('F5: endpoint detalle no expone otro proyecto por clave o scope',async()=>{
  const service=mockImports('experimental-ns-proyectos-mantenimiento.service',{
    './experimental-ns-proyectos-mantenimiento.repository':{readSnapshot:async()=>fixture()},
    './experimental-ns.scope':{assertScope(req){return req.informationAccess;}}
  });
  const req=fakeContext();req.query={proyecto_clave:'NO_EXISTE'};
  await assert.rejects(()=>service.getDetail(req),e=>e.statusCode===404);
});
test('F5: rutas exclusivamente GET, guarda rol Programador efectivo y permiso UNITED',()=>{
  const endpoints=[];
  const fakeExpress={Router:()=>({
    get:(...args)=>endpoints.push(args),post:()=>assert.fail('POST no permitido'),
    put:()=>assert.fail('PUT no permitido'),patch:()=>assert.fail('PATCH no permitido'),delete:()=>assert.fail('DELETE no permitido')
  })};
  const router=mockImports('experimental-ns-proyectos-mantenimiento.routes',{
    express:fakeExpress,
    '../../middleware/information-access-gnral.middleware':{
      humanInformationGuard_gnral(settings){
        assert.equal(settings.groupingCode,'EXPERIMENTAL_NS');assert.equal(settings.domain,'UNITED');
        assert.equal(settings.permissionCode,'EXPERIMENTAL_NS_PROYECTOS_MANTENIMIENTO_ACCESO_VISUAL_MODULO.ACCESO_VISUAL');
        return [(_req,_res,next)=>next(),(_req,_res,next)=>next()];
      }
    },
    './experimental-ns-proyectos-mantenimiento.controller':{initial(){},detail(){}},
    './experimental-ns-proyectos-mantenimiento.service':{REQUIRED_PERMISSION:'EXPERIMENTAL_NS_PROYECTOS_MANTENIMIENTO_ACCESO_VISUAL_MODULO.ACCESO_VISUAL'}
  });
  assert.ok(router);assert.deepEqual(endpoints.map(x=>x[0]),['/proyectos-mantenimiento/inicial','/proyectos-mantenimiento/detalle']);
  for(const e of endpoints){const r={status(n){this.code=n;return this;},json(x){this.body=x;return this;}};
    e[2]({actorUser:{is_programador:false}},r,()=>assert.fail('sin rol'));
    assert.equal(r.code,403);let passed=false;
    e[2]({actorUser:{is_programador:true}},r,()=>passed=true);assert.equal(passed,true);
  }
});
test('F5: no hay consultas o mutaciones productivas en codigo experimental',()=>{
  const files=['experimental-ns-proyectos-mantenimiento.repository.js',
    'experimental-ns-proyectos-mantenimiento.metrics.js',
    'experimental-ns-proyectos-mantenimiento.service.js',
    'experimental-ns-proyectos-mantenimiento.controller.js',
    'experimental-ns-proyectos-mantenimiento.routes.js'];
  for(const file of files){const text=fs.readFileSync(path.join(root,file),'utf8');
    assert.doesNotMatch(text,/\b(?:FROM|JOIN)\s+`?(?:tickets|portafolio|ins_fl|z_op)`?(?=\s|$)/i);
    assert.doesNotMatch(text,/\b(?:INSERT\s+INTO|UPDATE\s+ns_|DELETE\s+FROM|REPLACE\s+INTO)\b/i);
  }
});
test('F5: frontend solo usa /api/experimental-ns; no se invoca JS/endpoint productivo',()=>{
  const front=path.join(__dirname,'../../modules/experimental-ns');
  const js=fs.readFileSync(path.join(front,'proyectos-mantenimiento/proyectos-mantenimiento-ns.js'),'utf8');
  const shell=fs.readFileSync(path.join(front,'experimental-ns.js'),'utf8');
  assert.match(js,/\/api\/experimental-ns\/proyectos-mantenimiento/);
  assert.doesNotMatch(js,/\/api\/(?:proyectos|tickets|portafolio|indicadores\/mtbc|equipos-criticos)/i);
  assert.doesNotMatch(js,/ManttoDetails\.|ManttoProyectos\.|EstadosVisuales_gnral/);
  assert.match(shell,/modules\/proyectos\/proyectos\.css/);
  assert.doesNotMatch(shell,/loadScript\('\.\/modules\/proyectos\/proyectos\.js/);
});
test('F5: shell mantiene F3, F4 y F5 sin reutilizar rutas de produccion',()=>{
  const s=fs.readFileSync(path.join(__dirname,'../../modules/experimental-ns/experimental-ns.js'),'utf8');
  for(const route of ['experimental-ns-resumen-dia','experimental-ns-equipos-criticos','experimental-ns-proyectos-mantenimiento']){
    assert.match(s,new RegExp(route));
  }
  assert.match(s,/loadResumenDiaNS/);assert.match(s,/loadEquiposCriticosNS/);assert.match(s,/loadProyectosMantenimientoNS/);
});

test('F5: frontend VM inicia por API exclusiva NS y no solicita ningun endpoint adicional',async()=>{
  const js=fs.readFileSync(path.join(__dirname,'../../modules/experimental-ns/proyectos-mantenimiento/proyectos-mantenimiento-ns.js'),'utf8');
  const requests=[];
  const root={innerHTML:'',addEventListener(){},querySelector(){return null;},querySelectorAll(){return [];}};
  const context={
    console,URLSearchParams,
    document:{getElementById(id){return id==='view-experimental-ns-proyectos-mantenimiento'?root:null;},addEventListener(){}},
    window:{
      ManttoRouter:{getCurrent(){return {route:'experimental-ns-proyectos-mantenimiento'};}},
      ManttoAuth:{getUser(){return {criticos_fallas:3,criticos_periodo:35};},
        async apiGet(url){requests.push(url);return {ok:true,source:'experimental-ns',modo:'SOLO_LECTURA',tablas:['ns_portafolio_pruebas','ns_tickets_pruebas'],data:[],filtros:{},summary:{},pagination:{page:1,total:0}};}}
    }
  };
  vm.runInNewContext(js,context,{filename:'proyectos-mantenimiento-ns.js'});
  assert.equal(context.window.ManttoProyectosMantenimientoNS.init(),true);
  assert.match(root.innerHTML,/Proyectos de Mantenimiento/);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(requests.length,1);
  assert.ok(requests[0].startsWith('/api/experimental-ns/proyectos-mantenimiento/inicial?'));
  assert.ok(!requests[0].includes('/api/proyectos/'));
});
test('F5: frontend no acepta una respuesta que aparente origen productivo',async()=>{
  const js=fs.readFileSync(path.join(__dirname,'../../modules/experimental-ns/proyectos-mantenimiento/proyectos-mantenimiento-ns.js'),'utf8');
  const requests=[];
  const root={innerHTML:'',addEventListener(){},querySelector(){return null;},querySelectorAll(){return [];}};
  const context={
    console:{error(){}},URLSearchParams,
    document:{getElementById(id){return id==='view-experimental-ns-proyectos-mantenimiento'?root:null;},addEventListener(){}},
    window:{
      ManttoRouter:{getCurrent(){return {route:'experimental-ns-proyectos-mantenimiento'};}},
      ManttoAuth:{getUser(){return {};},async apiGet(url){requests.push(url);return {ok:true,source:'aiven',modo:'SOLO_LECTURA',tablas:['tickets','portafolio'],data:[]};}}
    }
  };
  vm.runInNewContext(js,context,{filename:'proyectos-mantenimiento-ns.js'});
  assert.equal(context.window.ManttoProyectosMantenimientoNS.init(),true);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(requests.length,1); // sin fallback ni reintentos a Produccion
});

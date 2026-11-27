'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const backend='backend/src/modules/experimental-resumen-dia/experimental-resumen-dia.service.js';
const frontend='modules/experimental-resumen-dia/experimental-resumen-dia.js';
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const loadBackend=repo=>{
  const target=path.join(root,backend);
  delete require.cache[require.resolve(target)];
  const original=Module._load;
  const scope={
    buildTicketScopeSql_gnral:()=>({sql:'t.id IN (?)',params:[5]}),
    buildPortafolioScopeSql_gnral:()=>({sql:'p.zona_id IN (?)',params:[7]}),
    buildZoneIdScopeSql_gnral:()=>({sql:'z.id_zona IN (?)',params:[7]}),
    zoneCodes_gnral:()=>['Z1','Z2'],
    zoneIds_gnral:()=>[7]
  };
  Module._load=function(request){
    if(request.includes('experimental-resumen-dia.repository'))return repo;
    if(request.includes('information-record-scope-gnral.service'))return scope;
    return original.apply(this,arguments);
  };
  try{return require(target);}finally{Module._load=original;}
};
const now=new Date('2026-11-27T15:00:00Z');
const base={id:5,ticket:'T5',estado:'CDMX',zona:'Z1',zona_legacy:'OTRA',zona_id_oficial:7,
  supervisor:'SUP A',proyecto:'PROY 1',codigo_equipo:'E5',descripcion:'<texto>',
  estado_ticket:'En proceso',responsabilidad:'BLT garantía',tiempo_llegada:2,
  fecha_reporte_fecha:'2026-11-27',h_reporte:'08:00:00',fecha_llegada_fecha:'2026-11-27',
  h_llegada:'10:00:00',causa_falla:'Falla',selected_filter:1};
test('backend: rango corto, agregados sin hoy, filtros y alcance en todas las consultas',async()=>{
  const calls=[];
  const repo={query:async(sql,params)=>{
    calls.push({sql,params});
    assert.equal((sql.match(/\?/g)||[]).length,params.length);
    if(sql.includes('ORDER BY t.fecha_reporte DESC'))return [[base,{...base,id:6,ticket:'T6',estado:'PUEBLA',zona:'Z2',supervisor:'SUP B',selected_filter:0},
      {...base,id:7,ticket:'T7',fecha_reporte_fecha:'2026-11-26',estado_ticket:'Cerrado'}]];
    if(sql.includes('SELECT DISTINCT TRIM(p.estado)'))return [[{estado:'CDMX',zona:'Z1',supervisor:'SUP A'},
      {estado:'OAXACA',zona:'Z3',supervisor:'SUP C'}]];
    if(sql.includes('SELECT COUNT(*) AS year_total'))return [[{month_total:52,year_total:330}]];
    throw Error('Consulta inesperada');
  }};
  const service=loadBackend(repo);
  const result=await service.getResumenDia_exp({query:{estado:'CDMX',zona:'Z1',supervisor:'SUP A'}},now);
  assert.equal(calls.length,3);
  assert.deepEqual(calls[0].params,['CDMX','Z1','SUP A','2026-11-26 00:00:00','2026-11-28 00:00:00',5]);
  assert.match(calls[0].sql,/p_sup_exp\.zona_id = z_exp_ticket\.id_zona/);
  assert.match(calls[0].sql,/p_sup_exp\.numero_equipo = TRIM\(t\.codigo_equipo\)/);
  assert.deepEqual(calls[1].params,[7,7]);
  assert.deepEqual(calls[2].params,['2026-11-01 00:00:00','2026-01-01 00:00:00','2026-11-27 00:00:00',5,'CDMX','Z1','SUP A']);
  assert.equal(result.today.total,1);
  assert.equal(result.today.estado_tickets.en_curso,1);
  assert.equal(result.yesterday.total,1);
  assert.equal(result.tickets.length,1);
  assert.equal(result.tickets[0].proyecto,'PROY 1');
  assert.equal(result.tickets[0].estado_ticket_normalizado,'en_curso');
  assert.equal(result.tickets[0].responsabilidad_normalizada,'blt');
  assert.equal(result.tickets[0].zona,'Z1');
  assert.deepEqual(result.filters.supervisores,['SUP A','SUP B','SUP C']);
  assert.deepEqual(result.filters.disponibilidad.supervisores,['SUP A','SUP B']);
  assert.deepEqual(result.filters.disponibilidad.zonas,['Z1','Z2']);
  assert.deepEqual(result.promedios.mes,{desde:'2026-11-01',hasta:'2026-11-26',dias:26,tickets:52,promedio:2});
  assert.equal(result.promedios.anio.dias,330);
  assert.equal(result.promedios.anio.promedio,1);
});
test('backend: primer día del año sin promedio y estados desconocidos no son En curso',()=>{
  const s=loadBackend({});
  const p=s._test.averagePeriods_exp('2026-01-01',{year_total:0,month_total:0});
  assert.equal(p.mes.promedio,null);assert.equal(p.anio.promedio,null);
  const summary=s._test.buildSummary_exp([{estado_ticket:'Abierto'},{estado_ticket:'Cancelado'}]);
  assert.equal(summary.estado_tickets.en_curso,0);
  assert.equal(summary.estado_tickets.porcentajes.en_curso,0);
  assert.equal(summary.estado_tickets.porcentajes.abiertos,50);
});
test('frontend: catálogo completo, chips sin tickets deshabilitados, 18 columnas y drills coherentes',()=>{
  const window={};
  const document={addEventListener(){}};
  const source=read(frontend);
  const marker='  window.ManttoResumenDiaExperimental_exp = {';
  assert.ok(source.includes(marker));
  vm.runInNewContext(source.replace(marker,'  window.testPhase1={state_exp,renderChips_exp,drillRows_exp,drillTable_exp,TICKETS_CONTEXTUAL_UNI_HEADERS};\n'+marker),{window,document,Set,Map});
  const f=window.testPhase1;
  const host={innerHTML:''};
  f.renderChips_exp(host,['SUP A','SUP B'],['SUP A'],'','supervisor');
  assert.match(host.innerHTML,/data-rdx-exp-filter-value="SUP B" aria-pressed="false" disabled/);
  assert.doesNotMatch(host.innerHTML,/data-rdx-exp-filter-value="SUP A" aria-pressed="false" disabled/);
  assert.match(host.innerHTML,/data-rdx-exp-filter-value="" aria-pressed="true">Todos/);
  f.state_exp.tickets=[{...base,estado_ticket_normalizado:'en_curso',responsabilidad_normalizada:'blt',fecha_reporte:'2026-11-27'},
    {...base,ticket:'T6',estado_ticket_normalizado:'otro',codigo_equipo:''}];
  assert.equal(f.drillRows_exp('En curso').length,1);
  assert.equal(f.drillRows_exp('Abierto').length,0);
  assert.equal(f.drillRows_exp('BLT').length,1);
  assert.equal(f.drillRows_exp('parados').length,1);
  const table=f.drillTable_exp(f.drillRows_exp('En curso'));
  assert.equal((table.match(/<th scope="col">/g)||[]).length,18);
  assert.equal((table.match(/<td>/g)||[]).length,18);
  assert.match(table,/&lt;texto&gt;/);
  for(const type of ['ticket','proyecto','equipo']) assert.ok(table.includes('data-rdx-exp-reference="'+type+'"'));
  const dgb=read('modules/resumen-dia/resumen-dia.js');
  const contract=dgb.match(/const TICKETS_CONTEXTUAL_UNI_HEADERS = (\[[^\n]+\]);/);
  assert.ok(contract);
  assert.equal(JSON.stringify(f.TICKETS_CONTEXTUAL_UNI_HEADERS),JSON.stringify(vm.runInNewContext(contract[1])));
  assert.match(source,/mantto:view-user-changed/);
  assert.match(source,/params\.set\('supervisor'/);
});

'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const Module=require('node:module');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const backend='backend/src/modules/resumen-dia/resumen-dia.service.js';
const exp='backend/src/modules/experimental-resumen-dia/experimental-resumen-dia.service.js';
const frontend='modules/resumen-dia/resumen-dia.js';
const req={query:{},informationAccess:{dominio:'UNITED',requiere_filtro_zona:true,zona_ids:[7],zona_codigos:['Z1']},user:{criticos_periodo:35,criticos_fallas:3}};
test('DGB: contrato anterior, modo compacto optativo y criticidad oficial',async()=>{
  const target=path.join(root,backend);delete require.cache[require.resolve(target)];
  let legacy=0,summary=0,critical=0;
  const original=Module._load;
  Module._load=function(request){
    if(request==='./resumen-dia.repository')return{
      getInitialData:async()=>{legacy++;return {tickets:[{ticket:'T1'}],portafolio:[],criticos_codigos:[],criticidad:{}};},
      getCriticosCodigos:async(r,days,min)=>{critical++;assert.equal(r.informationAccess.dominio,'UNITED');assert.equal(days,35);assert.equal(min,3);return [{codigo_equipo:'EQ1'},{codigo_equipo:'EQ2'}];}
    };
    if(request.includes('information-record-scope-gnral.service'))return{hasUnrestrictedUnitedScope_gnral:()=>false};
    if(request==='../experimental-resumen-dia/experimental-resumen-dia.service')return{getResumenDia_exp:async(r,now,options)=>{
      summary++;assert.equal(r.informationAccess.dominio,'UNITED');assert.equal(options.soloDia,true);assert.equal(options.fecha,'2026-11-26');
      return {tickets:[{ticket:'T1',codigo_equipo:'EQ1',zona:'Z1'}],period:{today:options.fecha},filters:{disponibilidad:{}},promedios:{mes:{promedio:2},anio:{promedio:3}},alcance:{zona_ids:[7]}};
    }};
    return original.apply(this,arguments);
  };
  try{
    const svc=require(target);
    const old=await svc.getInitialData(req);
    assert.equal(old.mode,'SNAPSHOT_FULL');assert.equal(old.data.tickets.length,1);
    const compact=await svc.getInitialData({...req,query:{vista:'ejecutiva',fecha:'2026-11-26'}});
    assert.equal(compact.mode,'RESUMEN_DIA_EJECUTIVO_V001');
    assert.equal(compact.data.tickets[0].zona_oficial,'Z1');
    assert.deepEqual(compact.data.criticos_codigos,['EQ1']);
    assert.equal(compact.promedios.mes.promedio,2);
    assert.deepEqual([legacy,summary,critical],[1,1,1]);
    await assert.rejects(svc.getInitialData({...req,informationAccess:{dominio:'CORELLIAN'},query:{vista:'ejecutiva'}}),{status:403});
    assert.equal(summary,1);
  }finally{Module._load=original;}
});
test('DGB: consulta un día, conserva alcance y rechaza fechas inválidas',async()=>{
  const target=path.join(root,exp);delete require.cache[require.resolve(target)];
  const old=Module._load,calls=[];
  Module._load=function(request){
    if(request.includes('experimental-resumen-dia.repository'))return{query:async(sql,params)=>{
      calls.push({sql,params});assert.equal((sql.match(/\?/g)||[]).length,params.length);
      if(sql.includes('ORDER BY t.fecha_reporte DESC'))return [[{id:1,ticket:'T1',codigo_equipo:'EQ1',zona:'Z1',estado_ticket:'Abierto',fecha_reporte_fecha:'2026-11-26',selected_filter:1}]];
      if(sql.includes('SELECT DISTINCT TRIM(p.estado)'))return [[]];
      if(sql.includes('COUNT(*) AS year_total'))return [[{year_total:12,month_total:2}]];
      throw Error('SQL inesperado');
    }};
    if(request.includes('information-record-scope-gnral.service'))return{buildTicketScopeSql_gnral:()=>({sql:'t.id IN (?)',params:[1]}),buildPortafolioScopeSql_gnral:()=>({sql:'1 = 1',params:[]}),buildZoneIdScopeSql_gnral:()=>({sql:'1 = 1',params:[]}),zoneCodes_gnral:()=>['Z1'],zoneIds_gnral:()=>[7]};
    return old.apply(this,arguments);
  };
  let svc;try{svc=require(target);}finally{Module._load=old;}
  const now=new Date('2026-11-27T15:00:00Z');
  const data=await svc.getResumenDia_exp(req,now,{fecha:'2026-11-26',soloDia:true});
  assert.equal(data.period.today,'2026-11-26');assert.equal(data.period.operational_today,'2026-11-27');
  assert.deepEqual(calls[0].params,['2026-11-26 00:00:00','2026-11-27 00:00:00',1]);
  assert.equal(data.tickets.length,1);
  for(const fecha of ['2026-02-30','2026-11-28','no'])await assert.rejects(svc.getResumenDia_exp(req,now,{fecha,soloDia:true}),{status:400});
});
test('DGB: sólo elementos solicitados y compatibilidad de ruta y tabla',()=>{
  const doc=read('index.html');
  const start=doc.indexOf('id="view-resumen">');
  const end=doc.indexOf('<section aria-label="Centro de Ayuda"',start);
  assert.ok(start>=0&&end>start);
  const view=doc.slice(start,end);
  for(const id of ['rd-atrap','rd-agua','rd-voltaje','rd-criticos-dia','rd-nofunc','rd-sla','rd-promedio-mes','rd-promedio-anio','rd-filter-supervisor','rd-api-status','rd-tbody'])assert.ok(view.includes('id="'+id+'"'),id);
  assert.equal((view.match(/class="rd-ex-bubble rd-ex-bubble-/g)||[]).length,6);
  for(const id of ['rd-avg-llegada','rd-avg-cierre','rd-blt','rd-cli','rd-svg-caf-blt','rd-svg-resp','rd-bar-zona','rd-bar-tipo','rd-bar-edo'])assert.ok(!view.includes('id="'+id+'"'),id);
  assert.match(read('backend/src/routes/data/resumen-dia.routes.js'),/groupingCodesAny: \['OPERACION'\]/);
  const js=read(frontend);assert.match(js,/const TICKETS_CONTEXTUAL_UNI_HEADERS = \[/);
  assert.match(js,/const initial = await fetchResumenInicial\(\)/);
  assert.match(js,/offlineMode\?'—':new Set/);
  assert.match(js,/data\.criticos_codigos/);
});
test('DGB: permisos efectivos, respaldo local y promedio de días completos',()=>{
  const window={ManttoPermissions:{state:code=>({efectivo:code==='OPERACION_RESUMEN_DEL_DIA_KPI_TICKETS.VER'})},ManttoOfflineResumenDia:{routeAllowed:()=>true}};
  const document={addEventListener(){},getElementById(){return null;}};
  const marker='  window.ManttoResumenDia = ';
  const source=read(frontend);
  vm.runInNewContext(source.replace(marker,'  window.testRd={canRd,canLinkRd,offlineCatalogRd,offlineAveragesRd,prepareOfflineRd,ticketMatchesRd,setData(rows,pf,day,filters){allTickets=rows;portafolioItems=pf;selectedDay=day;filtersRd=filters;},setOffline(value){offlineMode=value;},getTickets:()=>allTickets};\n'+marker),{window,document,console});
  const f=window.testRd;
  assert.equal(f.canRd('KPI_TICKETS.VER'),true);
  assert.equal(f.canRd('KPI_TICKETS.ABRIR_DETALLE'),false);
  assert.equal(f.canLinkRd('ticket'),false);
  f.setData([{fr:'2026-11-26',cod:'E1',zon:'Z1',edo:'CDMX'},{fr:'2026-11-01',cod:'E1',zon:'Z1',edo:'CDMX'},{fr:'2026-11-26',cod:'E2',zon:'Z1',edo:'CDMX',sup:'LEGACY'}],[{cod:'E1',zon:'Z1',estado:'CDMX',supervisor:'SUP A',estadoRegistro:1},{cod:'E2',zon:'Z2',estado:'CDMX',supervisor:'SUP B',estadoRegistro:1}], '2026-11-26',{estado:'',zona:'',supervisor:'SUP A'});
  f.prepareOfflineRd();assert.equal(f.getTickets()[2].sup,'');
  const p=f.offlineAveragesRd('2026-11-26');assert.equal(p.mes.dias,25);assert.equal(p.mes.tickets,1);assert.equal(p.mes.promedio,.04);
  const catalog=f.offlineCatalogRd(f.getTickets().filter(t=>t.fr==='2026-11-26'));
  assert.deepEqual(Array.from(catalog.supervisores),['SUP A','SUP B']);assert.deepEqual(Array.from(catalog.disponibilidad.supervisores),['SUP A']);
  f.setOffline(true);assert.equal(f.canRd('KPI_TICKETS.VER'),true);
  window.ManttoOfflineResumenDia.routeAllowed=()=>false;assert.equal(f.canRd('KPI_TICKETS.VER'),false);
});

test('DGB: ancho disponible, filtros adaptables y desplazamiento interno de la tabla',()=>{
  const css=read('modules/resumen-dia/resumen-dia.css');
  assert.match(css,/\.rd-executive\{[^}]*width:100%;max-width:none;min-width:0;[^}]*grid-template-columns:minmax\(0,1fr\)/);
  assert.doesNotMatch(css,/\.rd-executive\{[^}]*max-width:\s*\d+px/);
  assert.match(css,/\.rd-ex-chips\{[^}]*flex-wrap:wrap/);
  assert.match(css,/@media\(max-width:760px\)[^\n]*\.rd-ex-chips\{flex-wrap:nowrap;overflow-x:auto/);
  assert.match(css,/#view-resumen \.rd-ex-ticket-section \.rd-table-wrap\{width:100%;max-width:100%;min-width:0;overflow:auto\}/);
  assert.match(css,/\.rd-tickets-contextual-uni\{min-width:2580px\}/);
  const loader=read('core/module-loader.js');
  const html=read('index.html');
  // La etiqueta de caché del cargador global cambia al publicar otros módulos.
  // La prueba exige que el CSS versionado siga asociado a la ruta oficial.
  assert.match(loader,/\bresumen:\{css:\['\.\/modules\/resumen-dia\/resumen-dia\.css\?v=[0-9A-Za-z._-]+'/);
  assert.match(html,/<script src="\.\/core\/module-loader\.js\?v=[0-9A-Za-z._-]+"><\/script>/);
});

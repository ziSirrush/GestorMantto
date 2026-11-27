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
const engine='backend/src/modules/experimental-resumen-dia/experimental-resumen-dia.service.js';
const frontend='modules/resumen-dia/resumen-dia.js';
const dg={id_SB:7,rol:'Director General',roles:['Director General']};
const programmer={id_SB:8,rol:'Programador',roles:['Programador']};
const secondary={id_SB:9,rol:'Director Mantenimiento',roles:['Director Mantenimiento','Director General']};
function req(actor=dg,effective=actor,query={vista:'ejecutiva'}){
  return {query,actorUser:actor,contextUser:effective,user:effective,viewerContext:actor!==effective?{active:true}:null,
    informationAccess:{dominio:'UNITED',requiere_filtro_zona:true,zona_ids:[1],zona_codigos:['Z1'],actor_user_id:actor.id_SB,effective_user_id:effective.id_SB}};
}
test('Entregas DGB: rol real exclusivo, visor denegado y snapshot anterior intacto',async()=>{
  const target=path.join(root,backend);delete require.cache[require.resolve(target)];
  let calls=0,legacy=0,options;
  const old=Module._load;
  Module._load=function(name){
    if(name==='./resumen-dia.repository')return{getInitialData:async()=>{legacy++;return{tickets:[],portafolio:[],criticidad:{},criticos_codigos:[]};},getCriticosCodigos:async()=>[]};
    if(name.includes('information-record-scope-gnral.service'))return{hasUnrestrictedUnitedScope_gnral:()=>false};
    if(name==='../experimental-resumen-dia/experimental-resumen-dia.service')return{getResumenDia_exp:async(r,n,o)=>{calls++;options=o;return{tickets:[],period:{today:'2026-11-27'},filters:{},promedios:{}};}};
    return old.apply(this,arguments);
  };
  try{
    const svc=require(target),on={vista:'ejecutiva',entregas_recientes:'1'};
    const normal=await svc.getInitialData(req(dg));assert.deepEqual(normal.entregas_recientes,{disponible:true,activa:false,meses:12});assert.equal(options.entregasRecientes,false);
    const active=await svc.getInitialData(req(dg,dg,on));assert.equal(active.entregas_recientes.activa,true);assert.equal(options.entregasRecientes,true);
    const secondaryResult=await svc.getInitialData(req(secondary,secondary,on));assert.equal(secondaryResult.entregas_recientes.disponible,true);
    assert.equal((await svc.getInitialData(req(programmer))).entregas_recientes.disponible,false);
    const before=calls;
    for(const request of [req(programmer,programmer,on),req(programmer,dg,on),req(dg,programmer,on),{...req(dg,dg,on),viewerContext:{active:true}},{...req(dg,dg,on),actorUser:undefined},{...req(dg,dg,on),informationAccess:{...req().informationAccess,effective_user_id:8}}])
      await assert.rejects(svc.getInitialData(request),{status:403,code:'RESUMEN_DIA_ENTREGAS_NO_AUTORIZADO'});
    assert.equal(calls,before,'No se ejecutan consultas del resumen cuando el guard niega la opción');
    await assert.rejects(svc.getInitialData(req(dg,dg,{vista:'ejecutiva',entregas_recientes:['1','0']})),{status:400});
    await assert.rejects(svc.getInitialData(req(dg,dg,{entregas_recientes:'1'})),{status:400});
    const snapshot=await svc.getInitialData(req(programmer,programmer,{}));assert.equal(snapshot.mode,'SNAPSHOT_FULL');assert.equal(snapshot.entregas_recientes,undefined);assert.equal(legacy,1);
  }finally{Module._load=old;delete require.cache[require.resolve(target)];}
});
test('Entregas DGB: misma cohorte en tickets, disponibilidad y agregados; query Experimental no habilita opción',async()=>{
  const target=path.join(root,engine);delete require.cache[require.resolve(target)];
  const old=Module._load,calls=[];
  const base={id:1,ticket:'T1',codigo_equipo:'EQ1',zona:'Z1',estado:'CDMX',supervisor:'SUP A',estado_ticket:'Abierto',fecha_reporte_fecha:'2026-11-26',selected_filter:1};
  Module._load=function(name){
    if(name.includes('experimental-resumen-dia.repository'))return{query:async(sql,params)=>{
      calls.push({sql,params});assert.equal((sql.match(/\?/g)||[]).length,params.length);
      const recent=sql.includes('INTERVAL 12 MONTH');
      if(sql.includes('ORDER BY t.fecha_reporte DESC'))return [recent?[base]:[base,{...base,id:2,ticket:'T2',codigo_equipo:'EQ2',supervisor:'SUP B'}]];
      if(sql.includes('SELECT DISTINCT TRIM(p.estado)'))return [[{estado:'CDMX',zona:'Z1',supervisor:'SUP A'},{estado:'CDMX',zona:'Z1',supervisor:'SUP B'}]];
      if(sql.includes('COUNT(*) AS year_total'))return [[{year_total:recent?20:100,month_total:recent?10:50}]];
      throw Error('SQL inesperado');
    }};
    if(name.includes('information-record-scope-gnral.service'))return{buildTicketScopeSql_gnral:()=>({sql:'t.id IN (?)',params:[1]}),buildPortafolioScopeSql_gnral:()=>({sql:'1 = 1',params:[]}),buildZoneIdScopeSql_gnral:()=>({sql:'1 = 1',params:[]}),zoneCodes_gnral:()=>['Z1'],zoneIds_gnral:()=>[1]};
    return old.apply(this,arguments);
  };
  let svc;try{svc=require(target);}finally{Module._load=old;}
  const now=new Date('2026-11-27T15:00:00Z'),r=req(dg,dg,{entregas_recientes:'1'});
  const result=await svc.getResumenDia_exp(r,now,{fecha:'2026-11-26',soloDia:true,entregasRecientes:true});
  assert.equal(result.tickets.length,1);assert.equal(result.today.total,1);
  assert.deepEqual(result.filters.disponibilidad.supervisores,['SUP A']);
  assert.deepEqual(result.filters.supervisores,['SUP A','SUP B']);
  assert.equal(result.promedios.mes.tickets,10);assert.equal(result.promedios.anio.tickets,20);
  for(const call of [calls[0],calls[2]]){
    assert.match(call.sql,/p_sup_exp\.estado_registro = 1/);
    assert.match(call.sql,/p_sup_exp\.zona_id = z_exp_ticket\.id_zona/);
    assert.match(call.sql,/p_sup_exp\.fecha_recepcion_mantenimiento/);
    assert.match(call.sql,/DATE_SUB\(CAST\(\? AS DATE\), INTERVAL 12 MONTH\)/);
    assert.match(call.sql,/<= CAST\(\? AS DATE\)/);
    assert.match(call.sql,/t\.id IN \(\?\)/);
    assert.deepEqual(call.params.slice(-2),['2026-11-27','2026-11-27']);
  }
  assert.deepEqual(calls[0].params,['2026-11-26 00:00:00','2026-11-27 00:00:00',1,'2026-11-27','2026-11-27']);
  assert.deepEqual(calls[2].params,['2026-11-01 00:00:00','2026-01-01 00:00:00','2026-11-26 00:00:00',1,'2026-11-27','2026-11-27']);
  const general=await svc.getResumenDia_exp(r,now,{fecha:'2026-11-26',soloDia:true});
  assert.equal(general.tickets.length,2);
  assert.equal(general.promedios.mes.tickets,50);
  assert.doesNotMatch(calls[3].sql,/fecha_recepcion_mantenimiento/);
  assert.doesNotMatch(calls[5].sql,/fecha_recepcion_mantenimiento/);
  delete require.cache[require.resolve(target)];
});
test('Entregas DGB: el checkbox espera autorización de API, no se hereda en visor ni offline',()=>{
  let actor=dg,effective=dg,viewing=false,offline=false;
  const elements={'rd-recent-control':{hidden:true},'rd-recent-check':{checked:false,disabled:true}};
  const window={ManttoAuth:{getActorUser:()=>actor,getUser:()=>effective,isViewingAs:()=>viewing},ManttoOfflineNavigation:{isOffline:()=>offline}};
  const document={addEventListener(){},getElementById:id=>elements[id]||null};
  const source=read(frontend),marker='  window.ManttoResumenDia = ';
  assert.ok(source.includes(marker));
  vm.runInNewContext(source.replace(marker,'  window.recentTest={canUseRecentRd,renderRecentControlRd,setState(available,active,local,ready=true){recentAvailableRd=available;recentActiveRd=active;offlineMode=local;dataReady=ready;}};\n'+marker),{window,document,console});
  const f=window.recentTest,host=elements['rd-recent-control'],check=elements['rd-recent-check'];
  f.renderRecentControlRd();assert.equal(host.hidden,true);
  f.setState(true,false,false);f.renderRecentControlRd();assert.equal(host.hidden,false);assert.equal(check.checked,false);assert.equal(check.disabled,false);
  f.setState(true,true,false);f.renderRecentControlRd();assert.equal(check.checked,true);
  f.setState(true,true,false,false);f.renderRecentControlRd();assert.equal(check.disabled,true);
  actor=programmer;effective=dg;viewing=true;f.renderRecentControlRd();assert.equal(host.hidden,true);assert.equal(check.checked,false);
  actor=dg;effective=dg;viewing=false;offline=true;f.renderRecentControlRd();assert.equal(host.hidden,true);
  offline=false;actor=programmer;effective=programmer;f.renderRecentControlRd();assert.equal(host.hidden,true);
  actor=secondary;effective=secondary;f.setState(true,false,false);f.renderRecentControlRd();assert.equal(host.hidden,false);
  const html=read('index.html');
  assert.match(html,/id="rd-recent-control" hidden><input type="checkbox" id="rd-recent-check" disabled/);
  assert.match(source,/if\(recentActiveRd && canUseRecentRd\(\)\)params\.set\('entregas_recientes','1'\)/);
  assert.match(source,/recentActive!==params\.has\('entregas_recientes'\)/);
  assert.match(source,/recentAvailableRd=false;recentActiveRd=false;/);
});

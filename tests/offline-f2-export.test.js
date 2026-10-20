'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const exp=require('../backend/src/modules/offline-pilot/offline-pilot.export');
const catalog=require('../backend/src/modules/offline-pilot/offline-pilot.catalog');
const service=require('../backend/src/modules/offline-pilot/offline-pilot.service');

function requestUnited({master=false,zones=[2,4,6,8]}={}){
  return {offlineExportDataset:'operacion-resumen-dia',query:{kind:'tickets',after_id:'0',upper_id:'99',limit:'300'},informationAccess:{
    acceso_puerta:true,dominio:'UNITED',requiere_filtro_zona:!master,
    zona_ids:master?null:zones,zona_codigos:master?null:zones.map(String),
    alcance:{empresa:'UNITED',motor:'alcance_uni',llave_maestra:master}
  }};
}
function requestCorellian({master=false,users=[14,22]}={}){
  return {offlineExportDataset:'instalaciones-proyectos',query:{kind:'proyectos',after_id:'0',upper_id:'900',limit:'300'},informationAccess:{
    acceso_puerta:true,dominio:'CORELLIAN',requiere_filtro_usuario:!master,
    usuarios_visibles:master?null:users,
    alcance:{empresa:'CORELLIAN',motor:'alcance_cor',llave_maestra:master}
  }};
}
const stubScope={
  buildPortafolioScopeSql_gnral(){return {sql:'p.zona_id IN (?,?,?,?)',params:[2,4,6,8]};},
  buildTicketScopeSql_gnral(){return {sql:'EXISTS (SELECT 1 FROM portafolio p_scope WHERE p_scope.zona_id IN (?,?,?,?))',params:[2,4,6,8]};},
  buildInsFlScopeSql_gnral(){return {sql:'f.id_sup IN (?,?)',params:[14,22]};}
};
const stubRepo={officialProjectZoneSql(){return 'NULL';},officialProjectZoneIdSql(){return 'NULL';}};

test('catálogo mantiene dos exportadores aislados por empresa, sin conceder acceso ajeno',()=>{
  const req={contextUser:{id_SB:31}};
  const cor={code:'INSTALACIONES_PROYECTOS',domain:'CORELLIAN',datasets:['instalaciones-proyectos']};
  const uni={code:'OPERACION_RESUMEN_DEL_DIA',domain:'UNITED',datasets:['operacion-resumen-dia']};
  const corOnly=service.buildCapabilities(req,[cor]);
  const uniOnly=service.buildCapabilities(req,[uni]);
  assert.deepEqual(corOnly.datasets.map(x=>x.key),['instalaciones-proyectos']);
  assert.deepEqual(uniOnly.datasets.map(x=>x.key),['operacion-resumen-dia']);
  assert.equal(corOnly.implementation_phase,5);
  assert.equal(corOnly.wifi_confirmation_required,false);
  assert.equal(corOnly.datasets[0].exporter.kinds[0],'proyectos');
});

test('UNITED: firma de 4 zonas, llave maestra abre solo UNITED',()=>{
  const limited=exp.effectiveScope(requestUnited());
  const master=exp.effectiveScope(requestUnited({master:true}));
  assert.deepEqual(limited.alcance.zona_ids,[2,4,6,8]);
  assert.deepEqual(master.alcance.zona_ids,null);
  assert.notEqual(master.scope_signature,limited.scope_signature);
  assert.equal(limited.scope_signature,catalog.scopeFingerprint('UNITED',false,[8,4,6,2]));
  assert.throws(()=>exp.effectiveScope(requestUnited({zones:[]})),{status:403});
  assert.throws(()=>exp.effectiveScope({...requestUnited(),informationAccess:{...requestUnited().informationAccess,dominio:'CORELLIAN'}}),{status:403});
});

test('CORELLIAN: visibles y llave maestra se separan de UNITED',()=>{
  const scoped=exp.effectiveScope(requestCorellian());
  const master=exp.effectiveScope(requestCorellian({master:true}));
  assert.equal(scoped.alcance.visible_user_count,2);
  assert.equal(master.alcance.master_key,true);
  assert.notEqual(scoped.scope_signature,master.scope_signature);
  assert.equal(scoped.scope_signature,catalog.scopeFingerprint('CORELLIAN',false,[22,14]));
  assert.throws(()=>exp.effectiveScope(requestCorellian({users:[]})),{status:403});
});

test('manifiesto verifica conteos, límites y campos de actualización para respaldo completo',async()=>{
  const queries=[];
  const connection={async query(sql,params){
    queries.push({sql,params});
    if(sql.includes('FROM tickets'))return [[{total:13722,max_id:55001,max_updated:'2026-10-20T12:00:00Z'}]];
    return [[{total:3714,max_id:33000,max_updated:'2026-10-20T12:00:00Z'}]];
  }};
  const manifest=await exp.getManifest(requestUnited(),{connection,scope:stubScope});
  assert.equal(manifest.kinds.tickets.count,13722);
  assert.equal(manifest.kinds.portafolio.count,3714);
  assert.equal(manifest.domain,'UNITED');
  assert.equal(manifest.page_limit,300);
  assert.ok(queries.some(q=>q.sql.includes('WHERE (p.zona_id IN')));
  assert.ok(queries.some(q=>q.sql.includes('WHERE (EXISTS')));
  assert.deepEqual(queries.find(q=>q.sql.includes('FROM tickets')).params,[2,4,6,8]);
});

test('páginas de tickets se filtran por alcance oficial y cursor estable',async()=>{
  let sqlString='',values=[];
  const req=requestUnited();
  req.query={kind:'tickets',after_id:'5',upper_id:'99',limit:'2'};
  const page=await exp.getPage(req,{scope:stubScope,resumenRepository:stubRepo,
    connection:{async query(sql,params){sqlString=sql;values=params;return [[
      {id:6,codigo_equipo:'A',zona_oficial:'N'},
      {id:8,codigo_equipo:'B',zona_oficial:'S'},
      {id:11,codigo_equipo:'C',zona_oficial:'N'}
    ]];}}});
  assert.equal(page.rows.length,2);
  assert.equal(page.has_more,true);
  assert.equal(page.next_cursor,8);
  assert.match(sqlString,/WHERE \(EXISTS/);
  assert.match(sqlString,/t\.id > \? AND t\.id <= \?/);
  assert.deepEqual(values.slice(-3),[5,99,3]);
  assert.equal(page.rows[0].zona,'N');
});

test('páginas CORELLIAN usan ins_fl y filtro personas oficial, no una consulta global',async()=>{
  let sql='',params=[];
  const page=await exp.getPage(requestCorellian(),{scope:stubScope,connection:{async query(s,p){sql=s;params=p;return [[{id_ins_fl:17,proyecto:'Uno'}]];}}});
  assert.equal(page.rows[0].proyecto,'Uno');
  assert.match(sql,/FROM ins_fl f/);
  assert.match(sql,/f\.id_sup IN \(\?,\?\)/);
  assert.deepEqual(params.slice(0,2),[14,22]);
});

test('falla cerrado ante cursor inválido, duplicado o modulo sin exportador registrado',async()=>{
  assert.throws(()=>exp.queryOptions({...requestUnited(),query:{kind:'fotografias',after_id:'0',upper_id:'2'}}),{status:400});
  assert.throws(()=>exp.queryOptions({...requestUnited(),query:{kind:'tickets',after_id:'0',upper_id:'99',limit:'9999'}}),{status:400});
  assert.throws(()=>exp.queryOptions({...requestUnited(),offlineExportDataset:'tabla-arbitraria'}),{status:400});
  await assert.rejects(exp.getPage({...requestUnited(),query:{kind:'tickets',after_id:'5',upper_id:'15',limit:'3'}},{
    scope:stubScope,resumenRepository:stubRepo,
    connection:{async query(){return [[{id:7},{id:7}]];}}
  }),/duplicados|cursor/);
});

test('rutas requieren ambos Guards, y la lista de permisos de Resumen coincide con el módulo vigente',()=>{
  const routes=fs.readFileSync(path.join(root,'backend/src/modules/offline-pilot/offline-pilot.routes.js'),'utf8');
  const original=fs.readFileSync(path.join(root,'backend/src/routes/data/resumen-dia.routes.js'),'utf8');
  const codes=[...original.matchAll(/'OPERACION_RESUMEN_DEL_DIA_[A-Z_]+\.VER'/g)].map(x=>x[0]);
  assert.ok(codes.length>10);
  for(const code of codes)assert.ok(routes.includes(code),`Falta ${code}`);
  assert.match(routes,/\.\.\.offlinePilotGuard, \.\.\.resumenDiaGuard/);
  assert.match(routes,/\.\.\.offlinePilotGuard,\.\.\.proyectosGuard/);
  assert.match(routes,/INSTALACIONES_PROYECTOS_TABLA_ACTIVOS_REGISTROS\.VER/);
  assert.match(routes,/router\.post\('\/actions\/sync\/united'/);
});

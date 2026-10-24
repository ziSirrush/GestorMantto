'use strict';
// [BLT NOW | 2026-10-23 | COBRANZA_UNI_ADMIN_MP_FASE_7_V001]
// Pruebas locales sin red, credenciales ni escrituras reales en Aiven.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ROOT=path.resolve(__dirname,'..');
const BASE='backend/src/modules/cobranza-uni-administracion/';
const read=rel=>fs.readFileSync(path.join(ROOT,rel),'utf8');
const constants=require('../backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.constants');
const permissions={
  MAIN_VISUAL:'MAIN.VER',
  TABLE_PERMISSIONS:{
    gestion_credito:{view:'GC.VER',edit:'GC.EDITAR'},
    pc:{view:'VA.VER',edit:'VA.EDITAR'},
    detalle_mp_2026:{view:'MP.VER',edit:'MP.EDITAR'}
  },ALL_TABLE_PERMISSIONS:['GC.VER','GC.EDITAR','VA.VER','VA.EDITAR','MP.VER','MP.EDITAR']
};
function load(relative,mocks){
  const module={exports:{}};
  vm.runInNewContext(read(relative),{module,exports:module.exports,require(name){
    if(Object.hasOwn(mocks,name))return mocks[name];
    throw new Error('Dependencia no permitida '+name);
  },process:{env:{}},Buffer});
  return module.exports;
}
const SERVICE=BASE+'cobranza-uni-administracion.mp-reconciliation.js';
function makeService(){
  return load(SERVICE,{
    '../../config/db':{getConnection(){throw Error('NO_AIVEN');}},
    '../../services/cobranza-uni-scope.service':{},
    '../../services/permissions/effective-permission.service':{},
    './cobranza-uni-administracion.permissions':permissions,
    './cobranza-uni-administracion.constants':constants
  });
}
const service=makeService();
const req={informationAccess:{empresa:'UNITED',acceso_puerta:true,effective_user_id:7},
  contextUser:{id_SB:7},viewerContext:{active:false}};
function schemaRows(){
  return [
    ...constants.MP_SQL_SPEC_UNI.map(([name,type,nullable])=>({
      TABLE_NAME:'detalle_mp_2026',COLUMN_NAME:name,COLUMN_TYPE:type,
      IS_NULLABLE:nullable?'YES':'NO'})),
    ...constants.MP_ZONE1_SQL_SPEC_UNI.map(([name,type,nullable])=>({
      TABLE_NAME:'detalle_mp_2026_zona_1',COLUMN_NAME:name,COLUMN_TYPE:type,
      IS_NULLABLE:nullable?'YES':'NO'}))
  ];
}
const keys={fk_valid:1,unique_valid:1,pk_valid:1};
function countRow(overrides={}){
  const fields=['mp_visibles','zona1_vinculadas','zona1_sin_vinculo','identidad_conflictiva',
    'fk_mp_sin_asignar','estatus_sin_definir','estatus_fuera_catalogo',
    'factor_sin_definir','factor_cero','monto_anual_discrepante','pendiente_discrepante',
    'buscarv_diferencias','buscarv_sin_dato','facturas_con_campos'];
  const counts=Object.fromEntries(fields.map(f=>[f,'0']));
  return {...counts,mp_visibles:'2',zona1_vinculadas:'1',zona1_sin_vinculo:'1',
    facturas_con_campos:'4',...overrides};
}
function makeFakeSql(options={}){
  const executed=[];
  let release=0;
  const conn={async query(sql,params){
    executed.push({sql,params});
    if(sql.includes('information_schema.COLUMNS'))return [options.schema||schemaRows()];
    if(sql.includes('information_schema.KEY_COLUMN_USAGE'))return [[options.keys||keys]];
    return [[options.counts||countRow()]];
  },release(){release++;}};
  return {executed,conn,get release(){return release;}};
}
const deps=(connection,permissionResolver)=>({connection,
  permissionResolver:permissionResolver|| (async()=>new Map([['MAIN.VER',true],['MP.VER',true]])),
  scopeBuilder:()=>'(mp.id_dmp > 10)',
  scopeService:{canonicalProjectSql_uni:()=>'(mp.proyecto)'}
});

test('MP F7: el esquema esperado es 20+128, incluye factor y 12 bloques',()=>{
  assert.equal(constants.MP_SQL_SPEC_UNI.length,20);
  assert.equal(constants.MP_ZONE1_SQL_SPEC_UNI.length,128);
  assert.ok(constants.MP_SQL_SPEC_UNI.some(row=>row[0]==='factor_monto_anual'));
  assert.equal(constants.MP_ZONE1_INVOICE_BLOCKS_UNI,12);
  const schema=service._test.checkSchema_uni(schemaRows(),keys);
  assert.equal(schema.matches,true);
  assert.equal(schema.observed_zone1_columns,128);
});

test('MP F7: detecta columna faltante, tipo equivocado, campo extra y FK ausente',()=>{
  const rows=schemaRows();
  const removed=rows.filter(r=>r.COLUMN_NAME!=='factor_monto_anual');
  assert.ok(service._test.checkSchema_uni(removed,keys).missing.includes('detalle_mp_2026.factor_monto_anual'));
  const altered=schemaRows();altered.find(r=>r.COLUMN_NAME==='factor_monto_anual').COLUMN_TYPE='varchar(5)';
  assert.ok(service._test.checkSchema_uni(altered,keys).type_conflicts.includes('detalle_mp_2026.factor_monto_anual'));
  const extra=schemaRows();extra.push({TABLE_NAME:'detalle_mp_2026_zona_1',COLUMN_NAME:'col_sobrante',COLUMN_TYPE:'int',IS_NULLABLE:'YES'});
  assert.ok(service._test.checkSchema_uni(extra,keys).extra.includes('detalle_mp_2026_zona_1.col_sobrante'));
  assert.equal(service._test.checkSchema_uni(schemaRows(),{...keys,fk_valid:0}).matches,false);
  assert.equal(service._test.checkSchema_uni(schemaRows(),{...keys,unique_valid:0}).matches,false);
});

test('MP F7: GET solo hace SELECT, limita a identidad MP verificada y JOIN por id_dmp',async()=>{
  const mock=makeFakeSql();
  const result=await service.reconcileMpAdmin_uni(req,deps(mock.conn));
  assert.equal(result.ok,true);assert.equal(result.readonly,true);
  assert.equal(result.source,'aiven');assert.equal(result.mode,'diagnostic_only');
  assert.equal(result.scope,'united_authorized_rows_with_verified_identity');
  assert.equal(result.counts.mp_visibles,2);
  assert.equal(result.counts.zona1_vinculadas,1);
  assert.equal(result.counts.facturas_con_campos,4);
  assert.equal(result.cutover_ready,false);
  assert.equal(result.gas_must_remain_active,true);
  assert.equal(mock.executed.length,3);
  const sql=mock.executed[2].sql;
  assert.match(sql,/LEFT JOIN `detalle_mp_2026_zona_1` z ON z\.`id_dmp` = mp\.`id_dmp`/);
  assert.match(sql,/WHERE \(\(mp\.id_dmp > 10\)\) AND \(\(mp\.proyecto\)\) IS NOT NULL/);
  assert.doesNotMatch(sql,/JOIN[^\n]+(?:ON|WHERE)[^\n]+z\.`proyecto`\s*=/i);
  assert.ok(mock.executed.every(x=>/^\s*SELECT\b/i.test(x.sql)));
  for(const {sql} of mock.executed)assert.doesNotMatch(sql,/\b(?:UPDATE|INSERT|DELETE|ALTER|DROP|TRUNCATE)\s+(?:TABLE|INTO|FROM|`detalle)/i);
});

test('MP F7: los nueve campos de los doce bloques se inspeccionan sin datos ajenos',()=>{
  const sql=service._test.sqlAggregateMp_uni('(mp.id_dmp = 99)');
  for(const block of ['01','06','12']){
    for(const [name] of constants.MP_ZONE1_BLOCK_BASE_UNI)
      assert.ok(sql.includes('`'+name+'_'+block+'`'),name+'_'+block);
  }
  for(const field of ['iguala','condiciones_pago','pendiente_corriente','pendiente_vencido','pendiente','facturas_pendientes'])
    assert.match(sql,new RegExp('z\\.`'+field+'`'));
  assert.equal(sql.match(/AS buscarv_diferencias/g)?.length,1);
  assert.throws(()=>service._test.sqlAggregateMp_uni(''),{code:'MP_F7_ALCANCE_NO_VERIFICADO'});
});

test('MP F7: sin permisos o puerta UNITED no consulta la base',async()=>{
  const mock=makeFakeSql();
  await assert.rejects(service.reconcileMpAdmin_uni({...req,informationAccess:{empresa:'CORELLIAN',acceso_puerta:true}},deps(mock.conn)),
    {code:'MP_F7_ACCESO_DENEGADO'});
  await assert.rejects(service.reconcileMpAdmin_uni({...req,contextUser:null,informationAccess:{empresa:'UNITED',acceso_puerta:true}},deps(mock.conn)),
    {code:'EFFECTIVE_USER_REQUIRED'});
  await assert.rejects(service.reconcileMpAdmin_uni(req,deps(mock.conn,async()=>new Map([['MAIN.VER',true],['MP.VER',false]]))),
    {code:'MP_F7_PERMISO_DENEGADO'});
  assert.equal(mock.executed.length,0);
});

test('MP F7: metadata de esquema inválida bloquea lectura de datos y corte',async()=>{
  const rows=schemaRows();const incomplete=rows.filter(r=>r.COLUMN_NAME!=='factor_monto_anual');
  const mock=makeFakeSql({schema:incomplete});
  const result=await service.reconcileMpAdmin_uni(req,deps(mock.conn));
  assert.equal(result.schema.matches,false);
  assert.equal(result.counts,null);
  assert.equal(result.status,'ESQUEMA_INVALIDO');
  assert.equal(result.cutover_authorized,false);
  assert.equal(mock.executed.length,2);
});

test('MP F7: resumen indica diferencias, pero JAMAS habilita corte por estadisticas',()=>{
  const schema=service._test.checkSchema_uni(schemaRows(),keys);
  const happy=service._test.reconcileSummary_uni(schema,
    service._test.normalizeCounts_uni(countRow({mp_visibles:'1',zona1_vinculadas:'1',zona1_sin_vinculo:'0',facturas_con_campos:'1'})));
  assert.equal(happy.status,'SIN_DIFERENCIAS_DETECTADAS_EN_ALCANCE');
  assert.equal(happy.cutover_ready,false);
  assert.equal(happy.gas_must_remain_active,true);
  assert.ok(happy.pending_checks.includes('comparacion_completa_con_sheets_y_su_fecha_de_corte'));
  const bad=service._test.reconcileSummary_uni(schema,service._test.normalizeCounts_uni(countRow({buscarv_diferencias:'3'})));
  assert.equal(bad.status,'REVISAR');
  assert.equal(bad.cutover_authorized,false);
});

test('MP F7: conteos inválidos, desbalanceados y números inseguros fallan cerrado',()=>{
  assert.throws(()=>service._test.normalizeCounts_uni(countRow({mp_visibles:'9007199254740993'})),/Conteo no confiable/);
  assert.throws(()=>service._test.normalizeCounts_uni(countRow({identidad_conflictiva:'-1'})),/Conteo no confiable/);
  assert.throws(()=>service._test.normalizeCounts_uni(countRow({zona1_sin_vinculo:'0'})),/Totales por proyecto incoherentes/);
  assert.throws(()=>service._test.normalizeCounts_uni(countRow({identidad_conflictiva:'2'})),/Resultados de identidad incoherentes/);
  const incomplete=countRow();delete incomplete.buscarv_sin_dato;
  assert.throws(()=>service._test.normalizeCounts_uni(incomplete),/Conteo no confiable/);
});

test('MP F7: ruta GET utiliza el guard de Administracion y no introduce rutas de escritura',async()=>{
  const registered=[];
  const guard=()=>{};
  const router={get(route,...handlers){registered.push({method:'GET',route,handlers});},
    post(route,...handlers){registered.push({method:'POST',route,handlers});},
    patch(route,...handlers){registered.push({method:'PATCH',route,handlers});}};
  const noop=()=>{};
  const mocks={
    express:{Router:()=>router},
    '../../middleware/information-access-gnral.middleware':{humanInformationGuard_gnral:()=>[guard]},
    '../../services/permissions/effective-permission.service':{listEffectivePermissions:async()=>new Map()},
    './cobranza-uni-administracion.constants':constants,
    './cobranza-uni-administracion.permissions':permissions,
    './cobranza-uni-administracion.gc-service':{listGestionCredito_uni:noop},
    './cobranza-uni-administracion.pc-service':{listVentaAdicionalAdmin_uni:noop},
    './cobranza-uni-administracion.gc-edit-service':{updateSingleGc_uni:noop,updateMultiGc_uni:noop},
    './cobranza-uni-administracion.pc-edit-service':{pcEditFeatureEnabled_uni:()=>false,updateSinglePc_uni:noop,updateMultiPc_uni:noop},
    './cobranza-uni-administracion.pc-edit-validation':{PHASE3_SAFE_FIELDS_UNI:[]},
    './cobranza-uni-administracion.pc-create-service':{createGateEnabled_uni:()=>false,preflightCreatePc_uni:noop,createPc_uni:noop},
    './cobranza-uni-administracion.mp-edit-service':{mpEditFeatureEnabled_uni:()=>false,updateSingleMp_uni:noop,updateMultiMp_uni:noop},
    './cobranza-uni-administracion.mp-edit-validation':{PHASE4_SAFE_FIELDS_MP_UNI:[]},
    './cobranza-uni-administracion.mp-zona1-write-service':{zone1WriteEnabled_uni:()=>false}
  };
  let queried=0;
  mocks['./cobranza-uni-administracion.mp-reconciliation']={reconcileMpAdmin_uni:async()=>{
    queried++;return {ok:true,readonly:true,mode:'diagnostic_only',cutover_ready:false};}};
  load(BASE+'cobranza-uni-administracion.routes.js',mocks);
  const found=registered.filter(x=>x.route==='/tablas/detalle_mp_2026/conciliacion');
  assert.equal(found.length,1);assert.equal(found[0].method,'GET');
  assert.ok(found[0].handlers.includes(guard));
  const payload=await found[0].handlers.at(-1)(req,{json(data){return data;}},e=>{throw e;});
  assert.equal(payload.mode,'diagnostic_only');assert.equal(queried,1);
  const baseline=registered.filter(x=>x.route.includes('/tablas/pc/'));
  assert.ok(baseline.length>=2);
  assert.ok(registered.some(x=>x.route==='/tablas/detalle_mp_2026/zona-1/:id/validar-alta'));
  assert.equal(registered.filter(x=>x.method==='POST'&&x.route==='/tablas/detalle_mp_2026/conciliacion').length,0);
});

test('MP F7: la vista consulta solo GET y no interpreta un informe como autorizacion de corte',async()=>{
  const handlers={},nodes=new Map(),calls=[];
  const node=selector=>{if(!nodes.has(selector))nodes.set(selector,{innerHTML:'',textContent:'',dataset:{},
    hidden:true,disabled:false,checked:false,value:'',setAttribute(){},reset(){}});return nodes.get(selector);};
  const root={innerHTML:'',addEventListener(event,cb){handlers[event]=cb;},
    querySelector:node,querySelectorAll(){return [];},replaceChildren(){this.innerHTML='';}};
  const mpFormula=require('../backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.mp-formulas');
  const win={ManttoAuth:{apiGet:async url=>{
    calls.push(url);
    if(url.endsWith('/conciliacion'))return {
      ok:true,mode:'diagnostic_only',readonly:true,cutover_ready:false,
      gas_must_remain_active:true,status:'REVISAR',schema:{matches:true},
      counts:service._test.normalizeCounts_uni(countRow())
    };
    return {ok:true,table:'detalle_mp_2026',readonly:true,columns:constants.MP_COLUMNS_UNI,
      rows:[],total:0,pages:0,formula_preview:mpFormula.buildMpFormulaPreview_uni([])};
  }}};
  vm.runInNewContext(read('modules/cobranza-uni/administracion/mantenimiento-preventivo/mantenimiento-preventivo.js'),
    {window:win,document:{},URLSearchParams});
  const editor=win.ManttoCobranzaAdministracionMP_uni.mount(root,{isCurrent:()=>true});
  await new Promise(resolve=>setImmediate(resolve));
  assert.ok(root.innerHTML.includes('data-mp-reconcile'));
  handlers.click({target:{closest(selector){return selector==='[data-mp-reconcile]'?{}:null;}}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls.filter(x=>x.endsWith('/conciliacion')).length,1);
  assert.match(node('[data-mp-reconcile-report]').textContent,/no habilita cambios de configuración ni escritura de Zona 1/);
  assert.match(node('[data-mp-reconcile-report]').textContent,/Zona 1 vinculadas 1/);
  assert.ok(!calls.some(x=>x.includes('validar-alta')));
  editor.destroy();
});

test('MP F7: se preservan las puertas de escritura y GC/VA no se modifican',()=>{
  assert.equal(constants.MP_RULES_UNI.gasSyncRemainsActive,true);
  assert.equal(constants.MP_RULES_UNI.writesEnabled,false);
  assert.equal(constants.MP_RULES_UNI.zone1WritesEnabled,false);
  const routes=read(BASE+'cobranza-uni-administracion.routes.js');
  for(const field of ['gestion_credito','pc','detalle_mp_2026'])assert.ok(routes.includes(field));
  const zone=read(BASE+'cobranza-uni-administracion.mp-zona1-write-service.js');
  assert.match(zone,/zone1WritesEnabled===true/);
  assert.match(zone,/gasSyncRemainsActive===false/);
  assert.doesNotMatch(read(SERVICE),/\b(?:INSERT INTO|UPDATE `|DELETE FROM|ALTER TABLE|CREATE TABLE|TRUNCATE TABLE)\b/i);
});

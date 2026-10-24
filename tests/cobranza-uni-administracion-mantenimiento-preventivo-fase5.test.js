'use strict';
// [BLT NOW | 2026-10-23 | COBRANZA_UNI_ADMIN_MP_FASE_5_V001]
// Sin Aiven: cubre guard, ID/cross-project, payloads y UI Zona 1.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ROOT=path.resolve(__dirname,'..');
const sub='backend/src/modules/cobranza-uni-administracion/';
const text=rel=>fs.readFileSync(path.join(ROOT,rel),'utf8');
const C=require('../backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.constants');
const V=require('../backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.mp-edit-validation');
const F=require('../backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.mp-formulas');
// Misma configuracion del main GitHub; se inyecta porque el ZIP de fases
// incrementales NO incluye el archivo de permisos ya presente en el repo.
const perm={MAIN_VISUAL:'COBRANZA_UNI_ADMINISTRACION_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  TABLE_PERMISSIONS:{
    gestion_credito:{view:'COBRANZA_UNI_ADMINISTRACION_GESTION_CREDITO.VER',edit:'COBRANZA_UNI_ADMINISTRACION_GESTION_CREDITO.EDITAR'},
    pc:{view:'COBRANZA_UNI_ADMINISTRACION_VENTA_ADICIONAL.VER',edit:'COBRANZA_UNI_ADMINISTRACION_VENTA_ADICIONAL.EDITAR'},
    detalle_mp_2026:{view:'COBRANZA_UNI_ADMINISTRACION_MANTENIMIENTO_PREVENTIVO.VER',edit:'COBRANZA_UNI_ADMINISTRACION_MANTENIMIENTO_PREVENTIVO.EDITAR'}
  }
};
perm.ALL_TABLE_PERMISSIONS=Object.values(perm.TABLE_PERMISSIONS).flatMap(v=>[v.view,v.edit]);
const REQ={informationAccess:{empresa:'UNITED',acceso_puerta:true},contextUser:{id_SB:17},viewerContext:{active:false}};
const MAIN={id_dmp:'41',proyecto:'PROYECTO SUR',idns:'P100',cliente:'CLIENTE UNO',
  iguala:'125.50',condiciones_pago:'30',pendiente_corriente:'200.00',
  pendiente_vencido:'30.00',pendiente:'230.00',facturas_pendientes:2};
function zone(changes={}){
  const base=Object.fromEntries(C.MP_ZONE1_COLUMNS_UNI.map(c=>[c.name,null]));
  return {...base,id_mp_zona_1:'801',id_dmp:'41',proyecto:'proyecto sur',idns:'P100',cliente:'cliente uno',
    iguala:'125.5',condiciones_pago:'30',pendiente_corriente:'200',pendiente_vencido:'30',
    pendiente:'230.00',facturas_pendientes:2,fecha_factura_01:'2026-10-21',...changes};
}
function mockedService(){
  const mod={exports:{}};
  const fakeRequire=name=>{
    if(name==='../../config/db')return {getConnection(){throw Error('NO_MYSQL');}};
    if(name==='../../services/cobranza-uni-scope.service')return {
      buildCobranzaProjectScopeSql_uni(){throw Error('SCOPE_NOT_PROVIDED');},
      canonicalProjectSql_uni(){throw Error('IDENTITY_NOT_PROVIDED');}
    };
    if(name.endsWith('.constants'))return C;
    if(name.endsWith('.mp-edit-validation'))return V;
    throw Error('Require inesperado: '+name);
  };
  vm.runInNewContext(text(sub+'cobranza-uni-administracion.mp-zona1-service.js'),{
    module:mod,exports:mod.exports,require:fakeRequire
  });
  return mod.exports;
}
const S=mockedService();
function harness(zones=[zone()],main=[MAIN]){
  const queries=[];
  let released=0;
  const connection={async query(sql,params){
    queries.push({sql,params});
    return sql.includes('FROM `detalle_mp_2026_zona_1` z')?[zones]:[main];
  },release(){released++;}};
  const scopeService={
    buildCobranzaProjectScopeSql_uni(_req,alias){assert.equal(alias,'mp');return '(mp.`id_dmp` > 0)';},
    canonicalProjectSql_uni(alias){assert.equal(alias,'mp');return '(verified_identity_mp)';}
  };
  return {connection,scopeService,queries,releases:()=>released};
}
const run=(h,id='41',req=REQ)=>S.getZona1DetalleMp_uni(req,id,{connection:h.connection,scopeService:h.scopeService});

// ------------------ CONTRATO / SQL ------------------
test('MP F5: Zona 1 conserva 128 columnas y 12 bloques de 9 sin mutar F1-F4',()=>{
  assert.equal(C.MP_COLUMNS_UNI.length,20);
  assert.equal(C.MP_ZONE1_COLUMNS_UNI.length,128);
  assert.equal(C.MP_ZONE1_SHEET_HEADERS_UNI.length,124);
  assert.equal(C.MP_ZONE1_META_UNI.invoiceBlocks,12);
  assert.equal(C.MP_ZONE1_FOREIGN_KEY_UNI.field,'id_dmp');
  assert.equal(C.MP_ZONE1_FOREIGN_KEY_UNI.unique,true);
  assert.equal(C.MP_RULES_UNI.zone1WritesEnabled,false);
  for(let i=1;i<=12;i++){
    const suffix=String(i).padStart(2,'0');
    assert.equal(C.MP_ZONE1_COLUMNS_UNI.filter(c=>c.name.endsWith('_'+suffix)).length,9);
  }
  assert.equal(C.MP_ZONE1_COLUMNS_UNI.filter(c=>c.editable).length,0);
});
test('MP F5: GET por ID usa scope oficial, identidad validada, dos SELECT y PK BIGINT texto',async()=>{
  const h=harness();const result=await run(h);
  assert.equal(result.ok,true);assert.equal(result.readonly,true);
  assert.equal(result.table,'detalle_mp_2026_zona_1');
  assert.equal(result.linked,true);assert.equal(result.identity_verified,true);
  assert.equal(result.row.id_mp_zona_1,'801');
  assert.equal(result.row.id_dmp,'41');
  assert.equal(result.columns.length,128);
  assert.equal(result.invoice_blocks,12);
  assert.equal(h.queries.length,2);
  assert.match(h.queries[0].sql,/CAST\(mp\.`id_dmp` AS CHAR\)/);
  assert.match(h.queries[0].sql,/mp\.`id_dmp` = \? AND \(\(mp\.`id_dmp` > 0\)\) AND \(\(verified_identity_mp\)\) IS NOT NULL LIMIT 1/);
  assert.match(h.queries[1].sql,/FROM `detalle_mp_2026_zona_1` z INNER JOIN `detalle_mp_2026` mp ON mp\.`id_dmp` = z\.`id_dmp` WHERE z\.`id_dmp` = \? AND \(\(mp\.`id_dmp` > 0\)\) AND \(\(verified_identity_mp\)\) IS NOT NULL LIMIT 2/);
  assert.match(h.queries[1].sql,/CAST\(z\.`id_mp_zona_1` AS CHAR\)/);
  assert.deepEqual(JSON.parse(JSON.stringify(h.queries.map(q=>q.params))),[['41'],['41']]);
  for(const {sql} of h.queries)assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|ALTER|TRUNCATE|CREATE)\b/i);
  assert.ok(!h.queries[1].sql.includes('LIKE'));
});
test('MP F5: si no existe vinculo id_dmp, retorna sin datos sin buscar por proyecto',async()=>{
  const h=harness([]);const result=await run(h);
  assert.equal(result.linked,false);assert.equal(result.row,null);
  assert.equal(result.identity_verified,false);assert.equal(result.lookup_preview,null);
  assert.equal(result.status,'sin_vinculo_id_dmp');
  assert.equal(h.queries.length,2);
  assert.ok(h.queries.every(q=>q.params.length===1&&q.params[0]==='41'));
});
test('MP F5: proyecto equivocado queda en cuarentena sin exponer Zona 1',async()=>{
  const h=harness([zone({proyecto:'PROYECTO AJENO'})]);
  await assert.rejects(()=>run(h),e=>e.statusCode===409&&e.code==='MP_ZONA1_IDENTIDAD_CONFLICTIVA');
});
test('MP F5: IDNS contradictorio queda bloqueado, aun con FK compatible',async()=>{
  const h=harness([zone({idns:'P999'})]);
  await assert.rejects(()=>run(h),{statusCode:409,code:'MP_ZONA1_IDENTIDAD_CONFLICTIVA'});
});
test('MP F5: cliente diferente queda bloqueado; nulos no se inventan',async()=>{
  await assert.rejects(()=>run(harness([zone({cliente:'OTRA EMPRESA'})])),{
    statusCode:409,code:'MP_ZONA1_IDENTIDAD_CONFLICTIVA'
  });
  const result=await run(harness([zone({cliente:null,idns:null})]));
  assert.equal(result.linked,true);
  assert.equal(result.identity.idns_checked,false);
  assert.equal(result.identity.cliente_checked,false);
});
test('MP F5: FKs opuestas o identificadores de origen inconsistentes no se muestran',async()=>{
  for(const changes of [{id_dmp:'42'},{id_mp_zona_1:null},{id_mp_zona_1:'0'}]){
    await assert.rejects(()=>run(harness([zone(changes)])),{statusCode:409,code:'MP_ZONA1_IDENTIDAD_CONFLICTIVA'});
  }
});
test('MP F5: se bloquea relacion duplicada y origen con columnas faltantes',async()=>{
  await assert.rejects(()=>run(harness([zone(),zone()])),{statusCode:409,code:'MP_ZONA1_RELACION_AMBIGUA'});
  const partial={...zone()};delete partial.facturacion_12;
  await assert.rejects(()=>run(harness([partial])),{statusCode:409,code:'MP_ZONA1_DATOS_INCOMPLETOS'});
});
test('MP F5: no revela registro principal ajeno, inexistente o con identidad no verificada',async()=>{
  for(const main of [[],[{...MAIN,id_dmp:'999'}]]){
    const h=harness([zone()],main);
    await assert.rejects(()=>run(h),{statusCode:404,code:'MP_ZONA1_REGISTRO_NO_DISPONIBLE'});
    assert.equal(h.queries.length,1,'Nunca toca Zona 1 si MP no es visible');
  }
});
test('MP F5: sin puerta UNITED o ID invalido no abre conexion',async()=>{
  await assert.rejects(()=>run(harness(), '41', {}),{statusCode:403});
  for(const id of ['0','-1','1 OR 1=1','9223372036854775808','1.5']){
    const h=harness();
    await assert.rejects(()=>run(h,id),{statusCode:400,code:'MP_ADMIN_ID_INVALIDO'});
    assert.equal(h.queries.length,0);
  }
});
test('MP F5: sin scope o identidad oficial falla cerrado antes del SQL',async()=>{
  const h=harness();h.scopeService.canonicalProjectSql_uni=()=>'';
  await assert.rejects(()=>run(h),{statusCode:403,code:'MP_ZONA1_ALCANCE_INDETERMINADO'});
  assert.equal(h.queries.length,0);
});
test('MP F5: falla en consulta no se transforma en respuesta vacia ni altera datos',async()=>{
  const mod=harness();mod.connection.query=async()=>{throw new Error('DB_DOWN');};
  await assert.rejects(()=>run(mod),/DB_DOWN/);
});
// ------------------ COMPARATIVO BUSCARV ------------------
test('MP F5: BUSCARV del origen se compara con 6 campos, sin recalculos ni escrituras',async()=>{
  const result=await run(harness());
  const compare=result.lookup_preview;
  assert.equal(compare.mode,'preview_only');assert.equal(compare.origin,'detalle_mp_2026_zona_1');
  assert.equal(compare.comparisons.length,6);
  assert.equal(compare.summary.match,6);
  assert.equal(compare.summary.different,0);
  assert.equal(compare.summary.missing,0);
  assert.equal(compare.summary.invalid,0);
});
test('MP F5: diferencias de cartera, faltantes y montos decimales precisos se reportan',async()=>{
  const z=zone({iguala:'125.51',condiciones_pago:null,pendiente_corriente:'XYZ',pendiente_vencido:'30.0'});
  const result=await run(harness([z]));
  assert.equal(result.lookup_preview.summary.different,1);
  assert.equal(result.lookup_preview.summary.missing,1);
  assert.equal(result.lookup_preview.summary.invalid,1);
  assert.equal(result.lookup_preview.summary.match,3);
  assert.equal(S._test.compareValue_uni('pendiente','100.0').value,'10000');
  assert.equal(S._test.compareValue_uni('pendiente','-0.00').value,'0');
  assert.equal(S._test.compareValue_uni('pendiente','10000000000000000.00').valid,false);
  assert.equal(S._test.compareValue_uni('facturas_pendientes','2147483648').valid,false);
  assert.equal(S._test.compareValue_uni('condiciones_pago','   ').value,null);
});
// ------------------ RUTAS / PERMISOS ------------------
test('MP F5: API exige MAIN + MP.VER (EDITAR por si solo no concede lectura)',async()=>{
  const gets=[];const guardFn=()=>{};
  const router={get(route,...handlers){gets.push({route,handlers});},post(){},patch(){}};
  let rights=new Map(),called=0;
  const fakeModule={exports:{}};
  vm.runInNewContext(text(sub+'cobranza-uni-administracion.routes.js'),{
    module:fakeModule,exports:fakeModule.exports,
    require:name=>{
      if(name==='express')return {Router:()=>router};
      if(name==='../../middleware/information-access-gnral.middleware')return {humanInformationGuard_gnral:()=>[guardFn]};
      if(name==='../../services/permissions/effective-permission.service')return {
        listEffectivePermissions:async()=>rights
      };
      if(name.endsWith('.permissions'))return perm;
      if(name.endsWith('.constants'))return C;
      if(name.endsWith('.gc-service'))return {listGestionCredito_uni(){}};
      if(name.endsWith('.pc-service'))return {listVentaAdicionalAdmin_uni(){}};
      if(name.endsWith('.pc-edit-validation'))return {PHASE3_SAFE_FIELDS_UNI:[]};
      if(name.endsWith('.pc-edit-service'))return {pcEditFeatureEnabled_uni:()=>false,updateSinglePc_uni(){},updateMultiPc_uni(){}};
      if(name.endsWith('.pc-create-service'))return {createGateEnabled_uni:()=>false,preflightCreatePc_uni(){},createPc_uni(){}};
      if(name.endsWith('.gc-edit-service'))return {updateSingleGc_uni(){},updateMultiGc_uni(){}};
      if(name.endsWith('.mp-edit-validation'))return {PHASE4_SAFE_FIELDS_MP_UNI:[]};
      if(name.endsWith('.mp-edit-service'))return {mpEditFeatureEnabled_uni:()=>false,updateSingleMp_uni(){},updateMultiMp_uni(){}};
      if(name.endsWith('.mp-zona1-service'))return {getZona1DetalleMp_uni:async(req,id)=>{
        called++;return {ok:true,readonly:true,table:'detalle_mp_2026_zona_1',id_dmp:id};
      }};
      throw new Error('Modulo inesperado '+name);
    }
  });
  const match=gets.find(g=>g.route==='/tablas/detalle_mp_2026/registros/:id/zona-1');
  assert.ok(match);assert.ok(match.handlers.includes(guardFn));
  const handler=match.handlers.at(-1);
  const res=()=>{let status=200;return {status(n){status=n;return this;},json(payload){return {status,payload};}};};
  const req={contextUser:{id_SB:17},params:{id:'41'}};
  rights=new Map([[perm.TABLE_PERMISSIONS.detalle_mp_2026.edit,true]]);
  let answer=await handler(req,res(),e=>{throw e;});
  assert.equal(answer.status,403);assert.equal(called,0);
  rights=new Map([[perm.TABLE_PERMISSIONS.detalle_mp_2026.view,true]]);
  answer=await handler(req,res(),e=>{throw e;});
  assert.equal(answer.status,200);assert.equal(called,1);
  assert.equal(answer.payload.id_dmp,'41');
  answer=await handler({params:{id:'41'}},res(),e=>{throw e;});
  assert.equal(answer.status,401);
});
test('MP F5: rutas y cliente no introducen alta ni escritura de Zona 1',()=>{
  const routes=text(sub+'cobranza-uni-administracion.routes.js');
  const client=text('modules/cobranza-uni/administracion/mantenimiento-preventivo/mantenimiento-preventivo.js');
  assert.match(routes,/router\.get\('\/tablas\/detalle_mp_2026\/registros\/:id\/zona-1'/);
  assert.doesNotMatch(routes,/router\.(?:post|put|delete|patch)\('\/tablas\/detalle_mp_2026\/registros\/:id\/zona-1'/);
  assert.match(client,/data-mp-tab=\"zona1\"/);
  assert.doesNotMatch(client,/data-mp-zona1-dialog|data-mp-zona1-preflight/);
  const zoneClient=text('modules/cobranza-uni/administracion/mantenimiento-preventivo/mantenimiento-preventivo-zona1.js');
  assert.match(zoneClient,/ManttoAuth\.apiGet\(API\+'\?'\+query\.toString\(\)\)/);
  assert.doesNotMatch(client,/method\s*:\s*['"](?:PUT|DELETE)['"]/);
  assert.ok(C.MP_RULES_UNI.gasSyncRemainsActive);
  assert.ok(!C.MP_RULES_UNI.writesEnabled);
});
// ------------------ CLIENTE (editor anterior sustituido por pestaña) ------------------
function zoneGridResponse(rows){return {
  ok:true,readonly:true,table:'detalle_mp_2026_zona_1',relation:'id_dmp',
  identity_verified:true,primary_key:'id_mp_zona_1',columns:C.MP_ZONE1_COLUMNS_UNI,
  rows,total:rows.length,pages:Math.ceil(rows.length/25),page:1,page_size:25
};}
function clientMock(response){
  const handlers={},nodes=new Map(),calls=[];
  const findNode=selector=>{
    if(!nodes.has(selector))nodes.set(selector,{innerHTML:'',textContent:'',dataset:{},value:'',
      disabled:false,scrollLeft:0,scrollTop:0,setAttribute(){},focus(){},reset(){}});
    return nodes.get(selector);
  };
  const root={innerHTML:'',querySelector:findNode,querySelectorAll(){return [];},
    addEventListener(event,fn){handlers[event]=fn;},removeEventListener(event){delete handlers[event];},
    replaceChildren(){this.innerHTML='';}};
  const win={ManttoAuth:{apiGet:async url=>{calls.push(url);
    return typeof response==='function'?response():response;
  }}};
  vm.runInNewContext(text('modules/cobranza-uni/administracion/mantenimiento-preventivo/mantenimiento-preventivo-zona1.js'),{
    window:win,URLSearchParams
  });
  const editor=win.ManttoCobranzaMPZona1_uni.mount(root,{isCurrent:()=>true});
  return {editor,root,nodes,findNode,calls,handlers};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('MP F5: nueva pestaña presenta 128 celdas por fila y sanitiza contenido',async()=>{
  const z=zone({id_mp_zona_1:'77',id_dmp:'41',cliente:'<svg onload=alert(1)>',
    numero_factura_01:'FAC-001',forma_pago_12:'RECIBO'});
  const ui=clientMock(zoneGridResponse([z]));await tick();
  const html=ui.findNode('[data-mpz-body]').innerHTML;
  assert.match(html,/FAC-001/);assert.match(html,/RECIBO/);
  assert.match(html,/&lt;svg onload=alert\(1\)&gt;/);
  assert.doesNotMatch(html,/<svg onload/);
  assert.equal((html.match(/<td\b/g)||[]).length,128);
  const header=ui.findNode('[data-mpz-head]').innerHTML;
  assert.match(header,/Factura 12/);assert.match(header,/Forma de pago/);
  assert.doesNotMatch(ui.root.innerHTML,/data-mp-zona1-dialog|data-mpz-apply/);
  assert.equal(ui.calls.length,1);ui.editor.destroy();
});
test('MP F5: cliente no presenta Zona 1 cuando backend omite identidad verificada',async()=>{
  const fake={...zoneGridResponse([zone({id_mp_zona_1:'77',id_dmp:'41'})]),
    identity_verified:false};
  const ui=clientMock(fake);await tick();
  assert.equal(ui.findNode('[data-mpz-body]').innerHTML.includes('FAC-001'),false);
  assert.match(ui.findNode('[data-mpz-status]').textContent,/No se pudo consultar Zona 1/);
  assert.equal(ui.calls.length,1);ui.editor.destroy();
});
test('MP F5: Zona 1 vacía no inventa registros por nombre',async()=>{
  const ui=clientMock(zoneGridResponse([]));await tick();
  assert.match(ui.findNode('[data-mpz-body]').innerHTML,/Sin filas verificadas/);
  assert.match(ui.findNode('[data-mpz-status]').textContent,/0 filas verificadas/);
  ui.editor.destroy();
});
test('MP F5: destrucción invalida respuesta de Zona 1 pendiente',async()=>{
  let finish;
  const pending=new Promise(resolve=>finish=resolve);
  const ui=clientMock(()=>pending);
  ui.editor.destroy();
  finish(zoneGridResponse([zone({id_mp_zona_1:'77',id_dmp:'41'})]));
  await tick();
  assert.equal(ui.root.innerHTML,'');
  assert.equal(ui.findNode('[data-mpz-body]').innerHTML,'');
});

'use strict';
// [BLT NOW | 2026-10-23 | COBRANZA_UNI_EXCEL_FASE_5_V001]
// Pruebas locales de autorización, bulk atomico y UI fantasma; nunca Aiven real.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ROOT=path.join(__dirname,'..');
const B='backend/src/modules/cobranza-uni-administracion/';
const UI='modules/cobranza-uni/administracion/mantenimiento-preventivo/mantenimiento-preventivo-zona1.js';
const read=p=>fs.readFileSync(path.join(ROOT,p),'utf8');
const C=require('../backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.constants');
const V=require('../backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.mp-zona1-validation');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const goodRequest=()=>({informationAccess:{empresa:'UNITED',acceso_puerta:true,effective_user_id:14},
  contextUser:{id_SB:14},viewerContext:{active:false}});
const verified={territorial:'mp.`id_proyecto_cobranza` = 777',canonical:'mp.`id_proyecto_cobranza`'};
const scopeService={buildCobranzaProjectScopeSql_uni:()=>verified.territorial,
  canonicalProjectSql_uni:()=>verified.canonical};
function load(rel,mocks,env={}){
  const mod={exports:{}};
  vm.runInNewContext(read(B+rel),{module:mod,exports:mod.exports,require:name=>{
    if(Object.hasOwn(mocks,name))return mocks[name];
    throw Error('Unexpected require: '+name);
  },process:{env},Buffer,Date,BigInt,Set,Map});
  return mod.exports;
}
const grid=load('cobranza-uni-administracion.mp-zona1-grid.js',{
  '../../config/db':{},'../../services/cobranza-uni-scope.service':scopeService,
  './cobranza-uni-administracion.constants':C
});
const writeEnv={MP_ADMIN_ZONA1_EXCEL_EDIT_ENABLED:'true',
  MP_ADMIN_GAS_CUTOVER_CONFIRMED:'true',MP_ADMIN_GC_VA_MP_RECONCILED:'true'};
function legacy(env={},authorized=true){
  const f=load('cobranza-uni-administracion.mp-zona1-write-service.js',{
    '../../config/db':{getConnection(){throw Error('NO AIVEN');}},
    '../../services/cobranza-uni-scope.service':scopeService,
    './cobranza-uni-administracion.constants':C,
    './cobranza-uni-administracion.mp-edit-service':{
      mpEditFeatureEnabled_uni:()=>true,
      assertAuthorizedMp_uni:async()=>{if(!authorized){let e=new Error('DENIED');e.statusCode=403;throw e;}return 14;}
    },
    './cobranza-uni-administracion.mp-edit-validation':require('../backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.mp-edit-validation'),
    './cobranza-uni-administracion.mp-zona1-validation':V,
    './cobranza-uni-administracion.mp-zona1-audit':{auditZone1_uni:async()=>({})},
    './cobranza-uni-administracion.mp-zone1-derived-write':{propagateZone1ToMp_uni:async()=>[]},
    './cobranza-uni-administracion.pc-derived-write':{persistPcDerivedForMpChange_uni:async()=>({})}
  },env);
  return f;
}
function bulk({env=writeEnv,authorized=true}={}){
  const feature=legacy(env).zone1ExcelWriteEnabled_uni;
  return load('cobranza-uni-administracion.mp-zona1-excel-bulk.js',{
    '../../config/db':{getConnection(){throw Error('NO AIVEN');}},
    './cobranza-uni-administracion.mp-edit-service':{
      assertAuthorizedMp_uni:async()=>{if(!authorized){let e=new Error('DENIED');e.statusCode=403;throw e;}return 14;}
    },
    './cobranza-uni-administracion.mp-edit-validation':require('../backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.mp-edit-validation'),
    './cobranza-uni-administracion.mp-zona1-validation':V,
    './cobranza-uni-administracion.mp-zona1-audit':{auditZone1_uni:async()=>({})},
    './cobranza-uni-administracion.mp-zona1-write-service':{zone1ExcelWriteEnabled_uni:feature},
    './cobranza-uni-administracion.mp-zona1-grid':grid,
    './cobranza-uni-administracion.mp-zone1-derived-write':{propagateZone1ToMp_uni:async()=>[]},
    './cobranza-uni-administracion.pc-derived-write':{persistPcDerivedForMpChange_uni:async()=>({})}
  },env);
}
const payload={ids:['77','88'],changes:{numero_factura_01:'F-202'},
  expected:{'77':{numero_factura_01:'F-101'},'88':{numero_factura_01:'F-102'}}};
function mockConn({values=['F-101','F-102'],missing=false,affected=1,auditFail=false}={}){
  const sql=[],events=[],calls={audit:0};
  const rows=[{id_mp_zona_1:'77',id_dmp:'41',original_value:values[0]},
    {id_mp_zona_1:'88',id_dmp:'42',original_value:values[1]}];
  const conn={async beginTransaction(){events.push('begin');},
    async commit(){events.push('commit');},
    async rollback(){events.push('rollback');},release(){events.push('release');},
    async query(statement,params=[]){sql.push({statement,params});
      if(/^SELECT /.test(statement))return [missing?rows.slice(0,1):rows];
      if(/^UPDATE /.test(statement))return [{affectedRows:affected}];
      throw Error('unexpected SQL '+statement);
    }};
  const auditRecorder=async()=>{calls.audit++;if(auditFail)throw Error('AUDIT_FAILED');};
  return {conn,sql,events,calls,auditRecorder};
}

test('F5 contrato: 124 campos manuales y cuatro técnicos protegidos',()=>{
  assert.equal(C.MP_ZONE1_COLUMNS_UNI.length,128);
  assert.equal(V.INVOICE_FIELDS_MP_UNI.length,124);
  const forbidden=['id_mp_zona_1','id_dmp','created_at','updated_at'];
  for(const field of forbidden)assert.ok(!V.INVOICE_FIELDS_MP_UNI.includes(field));
  for(const field of ['proyecto','idns','cliente','monto_anual','iguala','pendiente'])
    assert.ok(V.INVOICE_FIELDS_MP_UNI.includes(field));
  for(const n of ['01','12'])assert.ok(V.INVOICE_FIELDS_MP_UNI.includes('numero_factura_'+n));
});
test('F5 puerta: Excel activo por defecto, apagado explícito y create/link OFF',async()=>{
  const env={MP_ADMIN_ZONA1_EXCEL_EDIT_ENABLED:'false'};
  assert.equal(legacy(env).zone1ExcelWriteEnabled_uni(),false);
  await assert.rejects(bulk({env}).editBulkZone1Excel_uni(goodRequest(),payload),{
    code:'MP_ZONA1_ESCRITURA_DESHABILITADA',statusCode:403});
  assert.equal(legacy({}).zone1ExcelWriteEnabled_uni(),true);
  assert.equal(legacy(writeEnv).zone1ExcelWriteEnabled_uni(),true);
  assert.equal(legacy(writeEnv).zone1WriteEnabled_uni(),false);
});
test('F5 validacion: exactamente un campo, 2 a 20 IDs, expected individual y sin alteracion de identidad',()=>{
  const mod=bulk();const good=mod.normalizeBulkZone1_uni(payload);
  assert.equal(good.field,'numero_factura_01');assert.deepEqual(Array.from(good.ids),['77','88']);
  for(const invalid of [
    {...payload,ids:['77','77']},
    {...payload,ids:['77']},
    {...payload,ids:['77','88','99']},
    {...payload,changes:{id_dmp:'11'}},
    {...payload,expected:{'77':{numero_factura_01:'X'}}},
    {...payload,expected:{'77':{numero_factura_01:'X'},'88':{numero_factura_01:'Y'},'99':{numero_factura_01:'Z'}}},
    {...payload,changes:{numero_factura_01:'X',fecha_pago_01:'2026-10-23'}},
    {...payload,extra:true},
    {...payload,ids:['0','88']},
    {...payload,ids:['77','18446744073709551616']},
    {...payload,changes:{fecha_pago_01:'2026-02-30'},expected:{'77':{fecha_pago_01:null},'88':{fecha_pago_01:null}}}
  ])assert.throws(()=>mod.normalizeBulkZone1_uni(invalid));
});
test('F5 seguridad: antes de abrir DB bloquea identidad/puerta/alcance UNITED',async()=>{
  const svc=bulk();const bad={...goodRequest(),informationAccess:{empresa:'CORELLIAN',acceso_puerta:true}};
  await assert.rejects(svc.editBulkZone1Excel_uni(bad,payload),{statusCode:403});
  const noScope={scopeBuilder:()=>'',scopeService:{canonicalProjectSql_uni:()=>''}};
  await assert.rejects(svc.editBulkZone1Excel_uni(goodRequest(),payload,noScope),{statusCode:403});
});
test('F5 bulk: SELECT scope+identidad + locking, luego 2 UPDATE y 2 auditorias, COMMIT',async()=>{
  const svc=bulk();const f=mockConn();
  const data=await svc.editBulkZone1Excel_uni(goodRequest(),payload,{
    connection:f.conn,scopeBuilder:()=>verified.territorial,scopeService,
    auditRecorder:f.auditRecorder});
  assert.equal(data.ok,true);assert.equal(data.total,2);assert.equal(data.changed,2);
  assert.deepEqual(f.events,['begin','commit']);assert.equal(f.calls.audit,2);
  assert.equal(f.sql.length,3);
  assert.match(f.sql[0].statement,/INNER JOIN `detalle_mp_2026` mp ON mp.`id_dmp` = z.`id_dmp`/);
  assert.match(f.sql[0].statement,/mp.`id_proyecto_cobranza` = 777/);
  assert.match(f.sql[0].statement,/`idns`/);
  assert.match(f.sql[0].statement,/IN \(\?, \?\)/);
  assert.match(f.sql[0].statement,/FOR UPDATE/);
  assert.equal(f.sql[0].params.length,2);
  for(const q of f.sql.slice(1)){
    assert.match(q.statement,/^UPDATE `detalle_mp_2026_zona_1`/);
    assert.match(q.statement,/WHERE z.`id_mp_zona_1` = \? AND z.`id_dmp` = \?/);
    assert.equal(q.params[0],'F-202');
  }
});
test('F5 reparación: proyecto desajustado usa FK y scope; facturas conservan identidad estricta',async()=>{
  const svc=bulk(),f=mockConn({values:['PROYECTO VIEJO','PROYECTO VIEJO']});
  const repair={ids:['77','88'],changes:{proyecto:'PROYECTO NUEVO'},
    expected:{'77':{proyecto:'PROYECTO VIEJO'},'88':{proyecto:'PROYECTO VIEJO'}}};
  const result=await svc.editBulkZone1Excel_uni(goodRequest(),repair,{
    connection:f.conn,scopeBuilder:()=>verified.territorial,scopeService,
    auditRecorder:f.auditRecorder});
  assert.equal(result.changed,2);
  assert.match(f.sql[0].statement,/z\.`id_dmp` IS NOT NULL/);
  assert.doesNotMatch(f.sql[0].statement,/UPPER\(TRIM\(mp\.`idns`\)\)/);
  assert.deepEqual(f.events,['begin','commit']);
});
test('F5 bulk: falla concurrencia en la ultima fila sin efectuar ningún UPDATE',async()=>{
  const svc=bulk(),f=mockConn({values:['F-101','CAMBIADO']});
  await assert.rejects(svc.editBulkZone1Excel_uni(goodRequest(),payload,{
    connection:f.conn,scopeBuilder:()=>verified.territorial,scopeService,
    auditRecorder:f.auditRecorder}),{code:'MP_ZONA1_CONFLICTO_CONCURRENCIA'});
  assert.deepEqual(f.events,['begin','rollback']);assert.equal(f.sql.length,1);
  assert.equal(f.calls.audit,0);
});
test('F5 bulk: fila fuera de alcance bloquea todo; auditoría o UPDATE fallidos hacen rollback',async()=>{
  const svc=bulk();
  for(const config of [{missing:true},{affected:0},{auditFail:true}]){
    const f=mockConn(config);
    await assert.rejects(svc.editBulkZone1Excel_uni(goodRequest(),payload,{
      connection:f.conn,scopeBuilder:()=>verified.territorial,scopeService,
      auditRecorder:f.auditRecorder}));
    assert.deepEqual(f.events,['begin','rollback']);
  }
});
test('F5 bulk: sin permiso EDITAR efectivo no realiza SELECT ni UPDATE',async()=>{
  const svc=bulk({authorized:false}),f=mockConn();
  await assert.rejects(svc.editBulkZone1Excel_uni(goodRequest(),payload,{
    connection:f.conn,scopeBuilder:()=>verified.territorial,scopeService,
    auditRecorder:f.auditRecorder}),{statusCode:403});
  assert.equal(f.sql.length,0);assert.deepEqual(f.events,['begin','rollback']);
});
test('F5 GET: CAST de fechas a AAAA-MM-DD, claves BIGINT texto y whitelist de 128 columnas',()=>{
  const sql=grid.buildGridSql_uni(grid.parseGridParams_uni({}),verified).selectSql;
  assert.match(sql,/CAST\(z.`fecha_pago_01` AS CHAR\) AS `fecha_pago_01`/);
  assert.match(sql,/CAST\(z.`id_mp_zona_1` AS CHAR\) AS `id_mp_zona_1`/);
  assert.match(sql,/CAST\(z.`id_dmp` AS CHAR\) AS `id_dmp`/);
  assert.match(sql,/z.`numero_factura_01`/);
});
test('F5 rutas: bulk antes que PATCH legacy; acceso solo revela campos si EDITAR y corte',()=>{
  const source=read(B+'cobranza-uni-administracion.routes.js');
  const posBulk=source.indexOf("router.patch('/tablas/detalle_mp_2026/zona-1/registros/edicion-multiple'");
  const posLegacy=source.indexOf("router.patch(zona1BasePath_uni+'/:zonaId'");
  assert.ok(posBulk>0&&posLegacy>0&&posBulk<posLegacy);
  assert.match(source,/can_write_zone1:canWriteZone1/);
  assert.match(source,/zona1_editable_fields:canWriteZone1/);
  assert.match(source,/zone1ExcelWriteEnabled_uni\(\)/);
  assert.match(source,/sendZone1Error_uni/);
  assert.doesNotMatch(source,/router\.delete\(/);
});
function zoneRow(id='77',override={}){
  const result={};for(const c of C.MP_ZONE1_COLUMNS_UNI)result[c.name]=null;
  return {...result,id_mp_zona_1:id,id_dmp:id==='77'?'41':'42',
    proyecto:'P',idns:'P11',cliente:'C',numero_factura_01:id==='77'?'F-101':'F-102',...override};
}
function uiHarness({canEdit=true,viewer=false,failPatch=false,repairMode=false,
  fields=V.INVOICE_FIELDS_MP_UNI}={}){
  const nodes=new Map(),events=new Map(),writes=[],reads=[];
  const rows=[zoneRow('77',repairMode?{repair_only:true}:{}),zoneRow('88',
    repairMode?{repair_only:false}:{})];
  const node=selector=>{if(!nodes.has(selector))nodes.set(selector,{
    innerHTML:'',textContent:'',value:'',dataset:{},disabled:false,scrollLeft:0,scrollTop:0,
    setAttribute(){},focus(){},select(){}});return nodes.get(selector);};
  const doc={createElement(tag){return {tagName:tag.toUpperCase(),value:'',attributes:{},
    setAttribute(name,value){this.attributes[name]=value;},
    matches(sel){return sel==='[data-mpz-cell-input]'&&Object.hasOwn(this.attributes,'data-mpz-cell-input');},
    focus(){this.focused=true;},select(){this.selected=true;}};}};
  const root={ownerDocument:doc,innerHTML:'',querySelector:node,addEventListener(k,v){events.set(k,v);},
    removeEventListener(k){events.delete(k);},replaceChildren(){this.innerHTML='';}};
  const win={document:doc,confirm:()=>true,ManttoAuth:{isViewingAs:()=>viewer,
    async apiGet(url){reads.push(url);return {ok:true,table:'detalle_mp_2026_zona_1',readonly:true,
      identity_verified:!repairMode,scope_verified:repairMode,repair_mode:repairMode,
      relation:'id_dmp',primary_key:'id_mp_zona_1',
      columns:C.MP_ZONE1_COLUMNS_UNI,rows:rows.map(r=>({...r})),total:2,pages:1,page:1,page_size:25};},
    async api(url,opts){const body=JSON.parse(opts.body);writes.push({url,method:opts.method,body});
      if(failPatch)throw Error('CONFLICTO');
      const field=Object.keys(body.changes)[0],value=body.changes[field];
      if(url.endsWith('/edicion-multiple')){
        for(const id of body.ids){const r=rows.find(x=>x.id_mp_zona_1===id);
          assert.equal(r[field],body.expected[id][field]);r[field]=value;}
        return {ok:true,table:'detalle_mp_2026_zona_1',operation:'bulk',field,total:body.ids.length,changed:2};
      }
      const parts=url.split('/'),zoneId=parts.at(-1),parent=parts.at(-2);
      const row=rows.find(x=>x.id_mp_zona_1===zoneId);
      assert.ok(row);assert.equal(row.id_dmp,parent);
      assert.equal(row[field],body.expected[field]);row[field]=value;
      return {ok:true,table:'detalle_mp_2026_zona_1',operation:'edit',id_dmp:parent,
        id_mp_zona_1:zoneId,field,changed:true};
    }} };
  vm.runInNewContext(read(UI),{window:win,URLSearchParams});
  const app=win.ManttoCobranzaMPZona1_uni.mount(root,{canEdit,editableFields:fields,isCurrent:()=>true});
  function cell(field='numero_factura_01',id='77'){
    const classes=new Set(['cua-mpz-canedit']);let current;
    return {dataset:{mpzField:field},classList:{contains:v=>classes.has(v),add:v=>classes.add(v),remove:v=>classes.delete(v)},
      closest(sel){return sel==='tr'?{dataset:{mpzId:id}}:null;},
      matches(sel){return sel==='td.cua-mpz-canedit';},
      replaceChildren(input){current=input;},querySelector(sel){return sel==='[data-mpz-cell-input]'?current:null;},
      focus(){this.focused=true;},innerHTML:'',get input(){return current;}};
  }
  return {app,root,node,events,rows,writes,reads,cell};
}
const dbl=(h,td)=>h.events.get('dblclick')({target:{closest:sel=>sel==='td.cua-mpz-canedit'?td:null}});
const key=(h,target,name)=>h.events.get('keydown')({target,key:name,preventDefault(){}});
test('F5 UI: doble clic abre celda fantasma, Enter guarda PATCH expected/ID y recarga',async()=>{
  const h=uiHarness();await tick();
  assert.match(h.node('[data-mpz-body]').innerHTML,/cua-mpz-canedit/);
  assert.match(h.node('[data-mpz-body]').innerHTML,/data-mpz-select/);
  const td=h.cell();dbl(h,td);assert.equal(td.input?.value,'F-101');
  td.input.value='F-999';key(h,td.input,'Enter');await tick();
  assert.equal(h.writes.length,1);
  assert.equal(h.writes[0].url,'/api/cobranza-uni/administracion/tablas/detalle_mp_2026/zona-1/41/77');
  assert.deepEqual(h.writes[0].body,{changes:{numero_factura_01:'F-999'},expected:{numero_factura_01:'F-101'}});
  assert.equal(h.rows[0].numero_factura_01,'F-999');assert.equal(h.reads.length,2);
  h.app.destroy();
});
test('F5 UI: ESC cancela, no PATCH y conserva celda; celda protegida nunca es editada',async()=>{
  const h=uiHarness();await tick();const td=h.cell();dbl(h,td);
  td.input.value='MAL';key(h,td.input,'Escape');await tick();
  assert.equal(h.writes.length,0);assert.match(td.innerHTML,/F-101/);
  const bad=h.cell('id_dmp');dbl(h,bad);assert.equal(bad.input,undefined);
  h.app.destroy();
});
test('F5 UI: fila desajustada visible para EDITAR, solo identidad habilitada',async()=>{
  const h=uiHarness({repairMode:true});await tick();
  assert.match(h.node('[data-mpz-body]').innerHTML,/Identidad desajustada/);
  const blocked=h.cell('numero_factura_01');dbl(h,blocked);
  assert.equal(blocked.input,undefined);
  const repair=h.cell('idns');dbl(h,repair);
  assert.ok(repair.input);
  repair.input.value='P12';key(h,repair.input,'Enter');await tick();await tick();
  assert.equal(h.writes.length,1);
  assert.deepEqual(h.writes[0].body,{changes:{idns:'P12'},expected:{idns:'P11'}});
  h.app.destroy();
});
test('F5 UI: usuario VER o vista simulada muestra 128 columnas sin edición ni POST',async()=>{
  for(const options of [{canEdit:false},{canEdit:true,viewer:true}]){
    const h=uiHarness(options);await tick();
    assert.equal((h.node('[data-mpz-head]').innerHTML.match(/<th /g)||[]).length,128);
    assert.doesNotMatch(h.root.innerHTML,/data-mpz-bulk-form/);
    assert.doesNotMatch(h.node('[data-mpz-body]').innerHTML,/cua-mpz-canedit/);
    assert.doesNotMatch(h.root.innerHTML,/data-mpz-dialog/);
    const td=h.cell();dbl(h,td);assert.equal(td.input,undefined);
    h.app.destroy();
  }
});
test('F5 UI: selección 2 filas, lote PATCH expected independiente y recarga; sin nuevos GET por fila',async()=>{
  const h=uiHarness();await tick();
  for(const id of ['77','88'])h.events.get('change')({target:{value:id,checked:true,
    matches:sel=>sel==='[data-mpz-select]'}});
  h.node('[data-mpz-bulk-field]').value='numero_factura_01';
  h.node('[data-mpz-bulk-input]').value='F-ALL';
  h.events.get('submit')({target:{matches:sel=>sel==='[data-mpz-bulk-form]'},preventDefault(){}});
  await tick();assert.equal(h.writes.length,1);
  assert.ok(h.writes[0].url.endsWith('/edicion-multiple'));
  assert.equal(h.writes[0].body.expected['77'].numero_factura_01,'F-101');
  assert.equal(h.writes[0].body.expected['88'].numero_factura_01,'F-102');
  assert.equal(h.reads.length,2);
  assert.equal(h.rows[1].numero_factura_01,'F-ALL');h.app.destroy();
});
test('F5 UI: rechazo de PATCH recarga y no modifica datos (concurrency)',async()=>{
  const h=uiHarness({failPatch:true});await tick();const td=h.cell();dbl(h,td);
  td.input.value='MAL';key(h,td.input,'Enter');await tick();
  assert.equal(h.rows[0].numero_factura_01,'F-101');
  assert.equal(h.reads.length,2);assert.equal(h.node('[data-mpz-status]').dataset.kind,'error');
  h.app.destroy();
});
test('F5 UI: no inserta HTML sin escapar; desconecta eventos al destruir',async()=>{
  const h=uiHarness();await tick();
  assert.doesNotMatch(h.root.innerHTML,/data-mpz-dialog|data-mpz-preflight/);
  assert.match(read(UI),/replace\(/); // escape en contenido y atributos.
  assert.deepEqual([...h.events.keys()].sort(),['change','click','dblclick','focusout','keydown','submit']);
  h.app.destroy();assert.equal(h.events.size,0);assert.equal(h.root.innerHTML,'');
});

test('F5 single: puerta completa habilita PATCH legado solo para facturas, con auditoria y COMMIT',async()=>{
  const S=legacy(writeEnv);
  const events=[],calls=[];
  const conn={async beginTransaction(){events.push('begin');},async commit(){events.push('commit');},
    async rollback(){events.push('rollback');},release(){},
    async query(sql,params){calls.push({sql,params});
      if(/FROM `detalle_mp_2026` mp WHERE/.test(sql))return [[{
        id_dmp:'41',proyecto:'PROYECTO UNO',idns:'P111',cliente:'CLIENTE'
      }]];
      if(/INNER JOIN `detalle_mp_2026` mp ON mp.`id_dmp` = z.`id_dmp`/.test(sql))
        return [[{id_mp_zona_1:'77',id_dmp:'41',original_value:'F-101',
          proyecto:'PROYECTO UNO',idns:'P111',cliente:'CLIENTE'}]];
      if(/^UPDATE /.test(sql))return [{affectedRows:1}];
      throw Error('Unknown SQL '+sql);
    }};
  const data=await S.editZone1_uni(goodRequest(),'41','77',{
    changes:{numero_factura_01:'F-222'},expected:{numero_factura_01:'F-101'}
  },{connection:conn,scopeBuilder:()=>verified.territorial,scopeService,
    auditRecorder:async()=>{events.push('audit');}});
  assert.equal(data.ok,true);assert.equal(data.changed,true);
  assert.deepEqual(events,['begin','audit','commit']);
  assert.equal(calls.length,3);
  assert.match(calls[1].sql,/FOR UPDATE/);
  assert.match(calls[1].sql,/CAST\(z.`numero_factura_01` AS CHAR\) AS original_value/);
  assert.match(calls[2].sql,/WHERE z.`id_mp_zona_1` = \? AND z.`id_dmp` = \?/);
  await assert.rejects(S.linkZone1_uni(goodRequest(),'41',{id_mp_zona_1:'77'}),
    {code:'MP_ZONA1_ESCRITURA_DESHABILITADA'});
});

test('F5 single: IDNS ausente aun con mismo proyecto impide UPDATE y revierte transaccion',async()=>{
  const S=legacy(writeEnv),events=[],sql=[];
  const conn={async beginTransaction(){events.push('begin');},async commit(){events.push('commit');},
    async rollback(){events.push('rollback');},release(){},async query(q){sql.push(q);
      if(/FROM `detalle_mp_2026` mp WHERE/.test(q))return [[{id_dmp:'41',proyecto:'P',idns:'P11',cliente:'C'}]];
      return [[{id_mp_zona_1:'77',id_dmp:'41',proyecto:'P',idns:null,cliente:'C',original_value:'F-101'}]];
    }};
  await assert.rejects(S.editZone1_uni(goodRequest(),'41','77',{
    changes:{numero_factura_01:'X'},expected:{numero_factura_01:'F-101'}
  },{connection:conn,scopeBuilder:()=>verified.territorial,scopeService,
    auditRecorder:async()=>{throw Error('Should not be reached');}}),
  {code:'MP_ZONA1_IDENTIDAD_CONFLICTIVA'});
  assert.deepEqual(events,['begin','rollback']);assert.equal(sql.length,2);
  assert.ok(sql.every(q=>/^SELECT/.test(q)));
});

test('F5 ruta de acceso: devuelve 124 editables si MP.EDITAR y corte autorizado',async()=>{
  const registrations=[],rights={current:new Map()},auth={enabled:true};
  const perms={MAIN_VISUAL:'MAIN',TABLE_PERMISSIONS:{
    gestion_credito:{view:'GC.VER',edit:'GC.EDITAR'},
    pc:{view:'PC.VER',edit:'PC.EDITAR'},
    detalle_mp_2026:{view:'MP.VER',edit:'MP.EDITAR'}},ALL_TABLE_PERMISSIONS:[]};
  const mods={
    'express':{Router:()=>({get(route,...handlers){registrations.push({method:'GET',route,handlers});},
      post(){},patch(){}})},
    '../../middleware/information-access-gnral.middleware':{humanInformationGuard_gnral:()=>[()=>{}]},
    '../../services/permissions/effective-permission.service':{listEffectivePermissions:async()=>rights.current},
    './cobranza-uni-administracion.permissions':perms,
    './cobranza-uni-administracion.constants':C,
    './cobranza-uni-administracion.gc-service':{listGestionCredito_uni:()=>{}},
    './cobranza-uni-administracion.pc-service':{listVentaAdicionalAdmin_uni:()=>{}},
    './cobranza-uni-administracion.pc-edit-validation':{PHASE3_SAFE_FIELDS_UNI:[]},
    './cobranza-uni-administracion.pc-edit-service':{pcEditFeatureEnabled_uni:()=>false,
      updateSinglePc_uni(){},updateMultiPc_uni(){}},
    './cobranza-uni-administracion.pc-create-service':{createGateEnabled_uni:()=>false,
      preflightCreatePc_uni(){},createPc_uni(){}},
    './cobranza-uni-administracion.gc-edit-service':{updateSingleGc_uni(){},updateMultiGc_uni(){}},
    './cobranza-uni-administracion.mp-edit-service':{mpEditFeatureEnabled_uni:()=>true,
      updateSingleMp_uni(){},updateMultiMp_uni(){}},
    './cobranza-uni-administracion.mp-edit-validation':{PHASE4_SAFE_FIELDS_MP_UNI:[]},
    './cobranza-uni-administracion.mp-zona1-write-service':{
      zone1ExcelWriteEnabled_uni:()=>auth.enabled,zone1WriteEnabled_uni:()=>false},
    './cobranza-uni-administracion.mp-zona1-validation':V
  };
  const m={exports:{}};
  vm.runInNewContext(read(B+'cobranza-uni-administracion.routes.js'),{
    module:m,exports:m.exports,require:name=>{if(!Object.hasOwn(mods,name))throw Error('Unexpected '+name);return mods[name];}
  });
  const path='/tablas/:tabla/acceso',route=registrations.find(x=>x.route===path);
  assert.ok(route);
  const res=()=>{const output={code:200,body:null,status(code){this.code=code;return this;},
    json(data){this.body=data;return this;}};return output;};
  const req={...goodRequest(),params:{tabla:'detalle_mp_2026'}};
  rights.current=new Map([['MP.VER',true],['MP.EDITAR',true]]);
  const yes=res();await route.handlers.at(-1)(req,yes,e=>{throw e;});
  assert.equal(yes.code,200);assert.equal(yes.body.can_write_zone1,true);
  assert.equal(yes.body.zona1_editable_fields.length,124);
  rights.current=new Map([['MP.VER',true],['MP.EDITAR',false]]);
  const no=res();await route.handlers.at(-1)(req,no,e=>{throw e;});
  assert.equal(no.body.can_write_zone1,false);assert.deepEqual(Array.from(no.body.zona1_editable_fields),[]);
  auth.enabled=false;
  rights.current=new Map([['MP.VER',true],['MP.EDITAR',true]]);
  const off=res();await route.handlers.at(-1)(req,off,e=>{throw e;});
  assert.equal(off.body.can_write_zone1,false);assert.equal(off.body.zona1_editable_fields.length,0);
});

'use strict';
// [BLT NOW | 2026-10-23 | COBRANZA_UNI_ADMIN_MP_FASE_6_V001]
// In-memory SQL mocks ONLY. Never connects to Aiven or modifies remote data.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const BASE='backend/src/modules/cobranza-uni-administracion/';
const txt=rel=>fs.readFileSync(path.join(ROOT,rel),'utf8');
const C=require('../backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.constants');
const MAIN=Object.freeze({id_dmp:'41',proyecto:'PROYECTO UNO',idns:'P010',cliente:'CLIENTE',
  zona_adm:'NORTE',periodicidad:'MENSUAL',momento_facturacion:'INICIO DE MES',
  estado:'JALISCO',z_oper:'OCCIDENTE',forma_pago:'FACTURA',iguala:'100.00',
  condiciones_pago:'30',monto_anual:'600.00',pendiente_corriente:'12.00',
  pendiente_vencido:'3.00',pendiente:'15.00',facturas_pendientes:2});
const ZONE=Object.freeze({id_mp_zona_1:'99',id_dmp:null,proyecto:MAIN.proyecto,
  idns:MAIN.idns,cliente:MAIN.cliente});
function load(rel,mocks){
  const module={exports:{}};
  vm.runInNewContext(txt(rel),{module,exports:module.exports,require:name=>{
    if(Object.hasOwn(mocks,name))return mocks[name];
    throw new Error('Unexpected dependency: '+name);
  },process:{env:{}},Buffer,Date,BigInt});
  return module.exports;
}
const V=load(BASE+'cobranza-uni-administracion.mp-zona1-validation.js',{
  './cobranza-uni-administracion.constants':C,
  './cobranza-uni-administracion.mp-edit-validation':
    require('../backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.mp-edit-validation')
});
const recordAudit=async()=>true;
const S=load(BASE+'cobranza-uni-administracion.mp-zona1-write-service.js',{
  '../../config/db':{getConnection(){throw new Error('NO LIVE DATABASE');}},
  '../../services/cobranza-uni-scope.service':{},
  './cobranza-uni-administracion.constants':C,
  './cobranza-uni-administracion.mp-edit-service':{
    mpEditFeatureEnabled_uni:()=>false,
    assertAuthorizedMp_uni:async(req,_conn)=>{
      if(!req?.informationAccess?.acceso_puerta||req.viewerContext?.active===true||
        req.informationAccess?.empresa!=='UNITED'||req.authorized!==true){
        const err=new Error('DENIED');err.statusCode=403;err.code='DENIED';throw err;
      }
      return 7;
    }
  },
  './cobranza-uni-administracion.mp-edit-validation':
    require('../backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.mp-edit-validation'),
  './cobranza-uni-administracion.mp-zona1-validation':V,
  './cobranza-uni-administracion.mp-zona1-audit':{auditZone1_uni:recordAudit}
});
const REQ={informationAccess:{acceso_puerta:true,empresa:'UNITED',effective_user_id:7},
  viewerContext:{active:false},authorized:true};
const scopeService={canonicalProjectSql_uni:()=> 'verified_scope(mp)'};
const DEPS={scopeBuilder:()=> 'territory_scope(mp)',scopeService};
const bodyCreate={changes:{facturacion_01:'ENERO',numero_factura_01:'F-101'}};
const bodyLink={id_mp_zona_1:'99'};
const bodyEdit={changes:{numero_factura_01:'F-202'},expected:{numero_factura_01:'F-101'}};
function mockConnection(mode,config={}){
  const sqlCalls=[],events=[];
  const conn={sqlCalls,events,
    async beginTransaction(){events.push('begin');},
    async commit(){events.push('commit');},
    async rollback(){events.push('rollback');},
    release(){events.push('release');},
    async query(sql,params=[]){
      sqlCalls.push({sql,params});
      if(/FROM `detalle_mp_2026` mp WHERE/.test(sql))return [[{...MAIN,...config.main}]];
      if(/FROM `detalle_mp_2026_zona_1` z WHERE z\.`id_dmp` =/.test(sql))
        return [[...(config.linked?[config.linked]:[])]];
      if(/FROM `detalle_mp_2026_zona_1` z WHERE z\.`id_mp_zona_1` =/.test(sql))
        return [[config.candidate??ZONE]];
      if(/INNER JOIN `detalle_mp_2026` mp ON mp\.`id_dmp` = z\.`id_dmp`/.test(sql))
        return [[{...ZONE,id_dmp:'41',original_value:config.before??'F-101',...config.editRow}]];
      if(/^INSERT INTO/.test(sql))return [{affectedRows:1}];
      if(/^UPDATE/.test(sql))return [{affectedRows:config.affectedRows??1}];
      if(/LAST_INSERT_ID\(\)/.test(sql))return [[{id_mp_zona_1:'18446744073709551000'}]];
      throw new Error('Unexpected SQL '+sql);
    }
  };
  return conn;
}
function deps(conn,extra={}){return {...DEPS,connection:conn,...extra};}
function onlySelect(conn){
  assert.ok(conn.sqlCalls.every(c=>/^SELECT/.test(c.sql)));
  assert.ok(conn.sqlCalls.every(c=>!/DELETE|TRUNCATE|DROP|ALTER/.test(c.sql)));
}

test('MP F6: 108 candidate invoice fields; all technical, identity and lookup columns remain protected',()=>{
  assert.equal(V.INVOICE_FIELDS_MP_UNI.length,108);
  assert.equal(new Set(V.INVOICE_FIELDS_MP_UNI).size,108);
  assert.equal(V.INVOICE_FIELDS_MP_UNI[0],'facturacion_01');
  assert.equal(V.INVOICE_FIELDS_MP_UNI.at(-1),'forma_pago_12');
  for(const field of ['id_dmp','id_mp_zona_1','created_at','updated_at',
    'proyecto','idns','cliente','zona_adm','iguala','pendiente']){
    assert.ok(!V.INVOICE_FIELDS_MP_UNI.includes(field));
    assert.throws(()=>V.normalizeInvoiceCreate_uni({changes:{[field]:'x'}}),{code:'MP_ZONA1_CAMPO_NO_PERMITIDO'});
  }
  assert.equal(C.MP_ZONE1_COLUMNS_UNI.length,128);
  assert.equal(C.MP_ZONE1_META_UNI.invoiceBlocks,12);
});
test('MP F6: no writes with GAS even if all environment flags true',async()=>{
  assert.equal(S.zone1WriteEnabled_uni(),false);
  assert.equal(C.MP_RULES_UNI.zone1WritesEnabled,false);
  assert.equal(C.MP_RULES_UNI.gasSyncRemainsActive,true);
  for(const fn of [()=>S.linkZone1_uni(REQ,'41',bodyLink),
    ()=>S.createZone1_uni(REQ,'41',bodyCreate),
    ()=>S.editZone1_uni(REQ,'41','99',bodyEdit)]){
    await assert.rejects(fn(),{code:'MP_ZONA1_ESCRITURA_DESHABILITADA'});
  }
});
test('MP F6: input coercion, dates, signed days and unsigned zone ID validate correctly',()=>{
  assert.equal(V.idZone1_uni('18446744073709551615'),'18446744073709551615');
  assert.throws(()=>V.idZone1_uni('18446744073709551616'),{code:'MP_ZONA1_ID_INVALIDO'});
  assert.throws(()=>V.idZone1_uni('-1'),{code:'MP_ZONA1_ID_INVALIDO'});
  assert.equal(V.invoiceValue_uni('fecha_pago_02','2026-02-28',true),'2026-02-28');
  assert.throws(()=>V.invoiceValue_uni('fecha_pago_02','2026-02-30',true),{code:'MP_ZONA1_FECHA_INVALIDA'});
  assert.equal(V.invoiceValue_uni('dias_vencimiento_11',-4,true),'-4');
  assert.throws(()=>V.invoiceValue_uni('dias_vencimiento_11','2147483648',true),{code:'MP_ZONA1_ENTERO_INVALIDO'});
  assert.equal(V.invoiceValue_uni('numero_factura_03','F-003',true),'F-003');
  assert.throws(()=>V.invoiceValue_uni('numero_factura_03','X'.repeat(151),true),{code:'MP_ZONA1_TEXTO_EXCESIVO'});
});
test('MP F6: one-column edit uses required expected; creation never accepts parent fields',()=>{
  assert.equal(V.normalizeInvoiceEdit_uni(bodyEdit).field,'numero_factura_01');
  assert.throws(()=>V.normalizeInvoiceEdit_uni({changes:{numero_factura_01:'X'},expected:{}}),
    {code:'MP_ZONA1_PAYLOAD_INVALIDO'});
  assert.throws(()=>V.normalizeInvoiceEdit_uni({changes:{numero_factura_01:'X'},expected:{numero_factura_01:'A'},evil:true}),
    {code:'MP_ZONA1_PAYLOAD_INVALIDO'});
  assert.throws(()=>V.normalizeInvoiceCreate_uni({changes:{numero_factura_01:null}}),
    {code:'MP_ZONA1_CAPTURA_VACIA'});
  assert.throws(()=>V.normalizeLink_uni({id_mp_zona_1:'99',proyecto:'INJECT'}),
    {code:'MP_ZONA1_VINCULO_INVALIDO'});
});
test('MP F6: identity requires project+IDNS equality, cannot link by text alone',()=>{
  assert.ok(S._test.assertMatch_uni(MAIN,ZONE,true));
  assert.throws(()=>S._test.assertMatch_uni(MAIN,{...ZONE,idns:null},true),
    {code:'MP_ZONA1_IDENTIDAD_CONFLICTIVA'});
  assert.throws(()=>S._test.assertMatch_uni(MAIN,{...ZONE,proyecto:'OTRO'},true),
    {code:'MP_ZONA1_IDENTIDAD_CONFLICTIVA'});
  assert.throws(()=>S._test.assertMatch_uni(MAIN,{...ZONE,cliente:'OTRO'},true),
    {code:'MP_ZONA1_IDENTIDAD_CONFLICTIVA'});
});
test('MP F6: preflight create is scoped read-only and copies parent identity later',async()=>{
  const conn=mockConnection('create');
  const result=await S.preflightCreateZone1_uni(REQ,'41',bodyCreate,deps(conn));
  assert.equal(result.mode,'preview_only');
  assert.equal(result.operation,'create');assert.equal(result.can_write,false);
  assert.equal(result.count,2);assert.equal(result.identity_source,'detalle_mp_2026');
  onlySelect(conn);assert.deepEqual(conn.events,[]);
  assert.match(conn.sqlCalls[0].sql,/territory_scope\(mp\)/);
  assert.match(conn.sqlCalls[0].sql,/verified_scope\(mp\)/);
});
test('MP F6: preflight link reads candidate by explicit PK, no project LIKE/OR fallback',async()=>{
  const conn=mockConnection('link');
  const result=await S.preflightLinkZone1_uni(REQ,'41',bodyLink,deps(conn));
  assert.equal(result.mode,'preview_only');assert.equal(result.identity_verified,true);
  assert.equal(result.id_mp_zona_1,'99');onlySelect(conn);
  const candidate=conn.sqlCalls.at(-1);
  assert.match(candidate.sql,/id_mp_zona_1` = \? AND z\.`id_dmp` IS NULL/);
  assert.deepEqual(Array.from(candidate.params),['99']);
  assert.doesNotMatch(candidate.sql,/LIKE|cliente`\s*=\s*\?/);
});
test('MP F6: preflight edit uses scoped JOIN, row identity and expected value',async()=>{
  const conn=mockConnection('edit');
  const result=await S.preflightEditZone1_uni(REQ,'41','99',bodyEdit,deps(conn));
  assert.equal(result.mode,'preview_only');assert.equal(result.operation,'edit');
  assert.equal(result.before,'F-101');assert.equal(result.after,'F-202');
  assert.equal(result.changed,true);onlySelect(conn);
  assert.match(conn.sqlCalls.at(-1).sql,/INNER JOIN `detalle_mp_2026` mp/);
  assert.match(conn.sqlCalls.at(-1).sql,/territory_scope\(mp\)/);
});
test('MP F6: preflights deny mismatched territory or viewer and never read orphan row',async()=>{
  const conn=mockConnection('link');
  await assert.rejects(S.preflightLinkZone1_uni({...REQ,authorized:false},'41',bodyLink,deps(conn)),{code:'DENIED'});
  assert.equal(conn.sqlCalls.length,0);
  const bad=mockConnection('link',{main:{proyecto:'UNSAFE'},candidate:ZONE});
  await assert.rejects(S.preflightLinkZone1_uni(REQ,'41',bodyLink,deps(bad)),{code:'MP_ZONA1_IDENTIDAD_CONFLICTIVA'});
  onlySelect(bad);
});
test('MP F6: preflight denies duplicate existing id_dmp link',async()=>{
  const conn=mockConnection('link',{linked:{...ZONE,id_dmp:'41'}});
  await assert.rejects(S.preflightLinkZone1_uni(REQ,'41',bodyLink,deps(conn)),{code:'MP_ZONA1_YA_VINCULADA'});
  assert.equal(conn.sqlCalls.length,2);
});
test('MP F6: edit expected conflict blocks UPDATE, even with mocked cutover',async()=>{
  const conn=mockConnection('edit',{before:'CHANGED'});
  await assert.rejects(S.editZone1_uni(REQ,'41','99',bodyEdit,deps(conn,{featureEnabled:true})),
    {code:'MP_ZONA1_CONFLICTO_CONCURRENCIA'});
  assert.deepEqual(conn.events,['begin','rollback']);onlySelect(conn);
});
test('MP F6: link transaction locks records, updates one FK, audits, commits',async()=>{
  const conn=mockConnection('link');let audit=0;
  const result=await S.linkZone1_uni(REQ,'41',bodyLink,deps(conn,{featureEnabled:true,
    auditRecorder:async(_req,change)=>{audit++;assert.equal(change.operation,'link');}}));
  assert.equal(result.linked,true);assert.equal(audit,1);
  assert.deepEqual(conn.events,['begin','commit']);
  assert.ok(conn.sqlCalls.filter(x=>/FOR UPDATE$/.test(x.sql)).length>=3);
  assert.match(conn.sqlCalls.at(-1).sql,/UPDATE `detalle_mp_2026_zona_1` z SET z\.`id_dmp`/);
});
test('MP F6: new row creation fills general fields server-side and only whitelisted invoice values',async()=>{
  const conn=mockConnection('create');let audited=null;
  const result=await S.createZone1_uni(REQ,'41',bodyCreate,deps(conn,{featureEnabled:true,
    auditRecorder:async(_req,change)=>{audited=change;}}));
  assert.equal(result.created,true);assert.equal(result.id_mp_zona_1,'18446744073709551000');
  assert.equal(audited.operation,'create');
  assert.deepEqual(conn.events,['begin','commit']);
  const insert=conn.sqlCalls.find(x=>/^INSERT/.test(x.sql));
  assert.ok(insert);assert.match(insert.sql,/`id_dmp`, `zona_adm`, `proyecto`, `idns`, `cliente`/);
  assert.match(insert.sql,/`facturacion_01`, `numero_factura_01`/);
  assert.ok(!insert.sql.includes('id_mp_zona_1'));
  assert.equal(insert.params[0],'41');assert.equal(insert.params[2],MAIN.proyecto);
  assert.equal(insert.params.at(-1),'F-101');
});
test('MP F6: edit updates exactly one allowed invoice field and transactionally audits',async()=>{
  const conn=mockConnection('edit');let audited=null;
  const result=await S.editZone1_uni(REQ,'41','99',bodyEdit,deps(conn,{featureEnabled:true,
    auditRecorder:async(_req,change)=>{audited=change;}}));
  assert.equal(result.changed,true);assert.equal(audited.operation,'edit');
  assert.equal(audited.before,'F-101');assert.equal(audited.after,'F-202');
  assert.deepEqual(conn.events,['begin','commit']);
  const update=conn.sqlCalls.find(x=>/^UPDATE/.test(x.sql));
  assert.deepEqual(Array.from(update.params),['F-202','99','41']);
  assert.match(update.sql,/z\.`numero_factura_01` = \?/);
});
test('MP F6: failed audit rolls back the whole transaction',async()=>{
  const conn=mockConnection('link');
  await assert.rejects(S.linkZone1_uni(REQ,'41',bodyLink,deps(conn,{featureEnabled:true,
    auditRecorder:async()=>{throw new Error('AUDIT_ERROR');}})),/AUDIT_ERROR/);
  assert.deepEqual(conn.events,['begin','rollback']);
});
test('MP F6: conflicting UPDATE or duplicate link rolls back',async()=>{
  const conn=mockConnection('link',{affectedRows:0});
  await assert.rejects(S.linkZone1_uni(REQ,'41',bodyLink,deps(conn,{featureEnabled:true})),
    {code:'MP_ZONA1_VINCULO_CONFLICTIVO'});
  assert.deepEqual(conn.events,['begin','rollback']);
});
test('MP F6: route set contains three read-only previews plus gated writers',()=>{
  const routes=txt(BASE+'cobranza-uni-administracion.routes.js');
  const main=txt('modules/cobranza-uni/administracion/main/main.js');
  const ui=txt('modules/cobranza-uni/administracion/mantenimiento-preventivo/mantenimiento-preventivo.js');
  assert.match(routes,/zona1BasePath_uni='\/tablas\/detalle_mp_2026\/zona-1\/:id'/);
  for(const op of ['validar-vinculo','validar-alta','validar-cambio'])assert.ok(routes.includes(op));
  for(const op of ['createZone1_uni','linkZone1_uni','editZone1_uni'])assert.ok(routes.includes(op));
  assert.match(routes,/\.\.\.guard/);
  assert.doesNotMatch(routes,/can_prepare_zone1/);assert.match(routes,/can_write_zone1/);
  assert.doesNotMatch(main,/canPrepareZone1:response\.can_prepare_zone1===true/);
  // F5: la puerta de editar Zona 1 viene estrictamente del backend.
  assert.match(main,/canWriteZone1:response\.can_write_zone1===true/);
  assert.match(main,/mantenimiento-preventivo-zona1\.js/);
  assert.doesNotMatch(ui,/canPrepareZone1|preflightZone1\(kind\)/);
  assert.match(ui,/canEdit:options\.canWriteZone1===true/);
  assert.match(ui,/data-mp-tab/);
  assert.doesNotMatch(routes,/router\.delete\(/i);
});

test('MP F6: routes preserve MAIN guard and 403 for disabled Zona 1 writes',async()=>{
  const registrations=[];const guard=()=>{};
  const router={get(route,...handlers){registrations.push({method:'GET',route,handlers});},
    post(route,...handlers){registrations.push({method:'POST',route,handlers});},
    patch(route,...handlers){registrations.push({method:'PATCH',route,handlers});}};
  const perms={MAIN_VISUAL:'MAIN',TABLE_PERMISSIONS:{
    gestion_credito:{view:'GC.VER',edit:'GC.EDITAR'},pc:{view:'PC.VER',edit:'PC.EDITAR'},
    detalle_mp_2026:{view:'MP.VER',edit:'MP.EDITAR'}},
    ALL_TABLE_PERMISSIONS:['GC.VER','GC.EDITAR','PC.VER','PC.EDITAR','MP.VER','MP.EDITAR']};
  const forbidden=async()=>{const e=new Error('GAS ACTIVE');e.statusCode=403;
    e.code='MP_ZONA1_ESCRITURA_DESHABILITADA';throw e;};
  const writers={zone1WriteEnabled_uni:()=>false,
    preflightLinkZone1_uni:async(_r,id)=>({ok:true,table:'detalle_mp_2026_zona_1',mode:'preview_only',id_dmp:id}),
    preflightCreateZone1_uni:async(_r,id)=>({ok:true,table:'detalle_mp_2026_zona_1',mode:'preview_only',id_dmp:id}),
    preflightEditZone1_uni:async(_r,id)=>({ok:true,table:'detalle_mp_2026_zona_1',mode:'preview_only',id_dmp:id}),
    linkZone1_uni:forbidden,createZone1_uni:forbidden,editZone1_uni:forbidden};
  const routeMocks={
    express:{Router:()=>router},
    '../../middleware/information-access-gnral.middleware':{humanInformationGuard_gnral:()=>[guard]},
    '../../services/permissions/effective-permission.service':{listEffectivePermissions:async()=>new Map([['MP.VER',true],['MP.EDITAR',true]])},
    './cobranza-uni-administracion.constants':C,
    './cobranza-uni-administracion.permissions':perms,
    './cobranza-uni-administracion.gc-service':{listGestionCredito_uni(){}},
    './cobranza-uni-administracion.pc-service':{listVentaAdicionalAdmin_uni(){}},
    './cobranza-uni-administracion.gc-edit-service':{updateSingleGc_uni(){},updateMultiGc_uni(){}},
    './cobranza-uni-administracion.pc-edit-service':{pcEditFeatureEnabled_uni:()=>false,updateSinglePc_uni(){},updateMultiPc_uni(){}},
    './cobranza-uni-administracion.pc-edit-validation':{PHASE3_SAFE_FIELDS_UNI:[]},
    './cobranza-uni-administracion.pc-create-service':{createGateEnabled_uni:()=>false,preflightCreatePc_uni(){},createPc_uni(){}},
    './cobranza-uni-administracion.mp-edit-service':{mpEditFeatureEnabled_uni:()=>false,updateSingleMp_uni(){},updateMultiMp_uni(){}},
    './cobranza-uni-administracion.mp-edit-validation':{PHASE4_SAFE_FIELDS_MP_UNI:[]},
    './cobranza-uni-administracion.mp-zona1-write-service':writers
  };
  const registered=load(BASE+'cobranza-uni-administracion.routes.js',routeMocks);
  assert.equal(registered,router);
  const base='/tablas/detalle_mp_2026/zona-1/:id';
  for(const name of ['/validar-vinculo','/validar-alta','/validar-cambio/:zonaId','/vincular','']){
    const item=registrations.find(x=>x.method==='POST'&&x.route===base+name);
    assert.ok(item,base+name);assert.ok(item.handlers.includes(guard));
  }
  const patch=registrations.find(x=>x.method==='PATCH'&&x.route===base+'/:zonaId');
  assert.ok(patch);assert.ok(patch.handlers.includes(guard));
  const res=()=>{let code=200;return{status(n){code=n;return this;},
    json(payload){return {code,payload};}};};
  const req={...REQ,contextUser:{id_SB:7},params:{id:'41',zonaId:'99'},body:{}};
  const ok=registrations.find(x=>x.route===base+'/validar-alta').handlers.at(-1);
  let answer=await ok(req,res(),e=>{throw e;});
  assert.equal(answer.code,200);assert.equal(answer.payload.mode,'preview_only');
  for(const method of [...registrations.filter(x=>x.method==='POST'&&[base+'/vincular',base].includes(x.route)),patch]){
    answer=await method.handlers.at(-1)(req,res(),e=>{throw e;});
    assert.equal(answer.code,403);
    assert.equal(answer.payload.code,'MP_ZONA1_ESCRITURA_DESHABILITADA');
  }
});

test('MP F6: la pestaña sustituye preflight UI sin alterar endpoints protegidos', async()=>{
  const handlers={},nodes=new Map(),calls=[];
  const el=key=>{
    if(!nodes.has(key))nodes.set(key,{innerHTML:'',textContent:'',dataset:{},value:'',
      hidden:true,disabled:false,setAttribute(){},focus(){},reset(){}});
    return nodes.get(key);
  };
  const root={innerHTML:'',addEventListener(name,cb){handlers[name]=cb;},
    querySelector:el,querySelectorAll(){return [];},replaceChildren(){this.innerHTML='';}};
  const F=require('../backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.mp-formulas');
  let mounted=0;
  const win={ManttoCobranzaMPZona1_uni:{mount(){mounted++;return {destroy(){}};}},
    ManttoAuth:{apiGet:async url=>{calls.push({url,method:'GET'});return {
      ok:true,readonly:true,table:'detalle_mp_2026',columns:C.MP_COLUMNS_UNI,
      rows:[MAIN],total:1,pages:1,formula_preview:F.buildMpFormulaPreview_uni([MAIN])
    };},api:async(url,options)=>{calls.push({url,method:options.method});throw Error('No escribir Zona 1');}}};
  vm.runInNewContext(txt('modules/cobranza-uni/administracion/mantenimiento-preventivo/mantenimiento-preventivo.js'),
    {window:win,document:{},URLSearchParams});
  const editor=win.ManttoCobranzaAdministracionMP_uni.mount(root,{isCurrent:()=>true,canPrepareZone1:true,canWriteZone1:true});
  await new Promise(resolve=>setImmediate(resolve));
  handlers.click({target:{closest(sel){return sel==='[data-mp-tab]'?{dataset:{mpTab:'zona1'}}:null;}}});
  assert.equal(mounted,1);
  assert.doesNotMatch(root.innerHTML,/data-mp-zona1-preflight|data-mp-zona1-apply/);
  assert.ok(calls.every(x=>x.method==='GET'));
  editor.destroy();
});

test('MP F6: no preparation controls when there is no effective EDITAR permission',async()=>{
  const handlers={},nodes=new Map();
  const el=key=>{if(!nodes.has(key))nodes.set(key,{innerHTML:'',textContent:'',dataset:{},
    hidden:true,disabled:false,checked:false,setAttribute(){}});return nodes.get(key);};
  const root={innerHTML:'',addEventListener(type,fn){handlers[type]=fn;},querySelector:el,
    querySelectorAll(){return [];},replaceChildren(){this.innerHTML='';}};
  const format=require('../backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.mp-formulas');
  const win={ManttoAuth:{apiGet:async()=>({ok:true,readonly:true,table:'detalle_mp_2026',
    columns:C.MP_COLUMNS_UNI,rows:[MAIN],total:1,pages:1,
    formula_preview:format.buildMpFormulaPreview_uni([MAIN])})}};
  vm.runInNewContext(txt('modules/cobranza-uni/administracion/mantenimiento-preventivo/mantenimiento-preventivo.js'),
    {window:win,document:{},URLSearchParams});
  const editor=win.ManttoCobranzaAdministracionMP_uni.mount(root,{isCurrent:()=>true});
  await new Promise(resolve=>setImmediate(resolve));
  assert.ok(!root.innerHTML.includes('data-mp-zona1-apply'));
  assert.doesNotMatch(root.innerHTML,/data-mp-zona1-preflight|data-mp-zona1-dialog/);
  editor.destroy();
});

test('MP F6: auditoria uses existing usuario_interacciones in same transaction',async()=>{
  let audited;
  const A=load(BASE+'cobranza-uni-administracion.mp-zona1-audit.js',{
    '../../services/interactions/interactions.service':{
      recordFromRequest_gnral:async(req,payload,options)=>{
        audited={req,payload,options};return {id_interaccion:'82'};
      }
    },
    './cobranza-uni-administracion.mp-edit-validation':
      require('../backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.mp-edit-validation')
  });
  const conn={query(){}};
  const id=await A.auditZone1_uni(REQ,{operation:'edit',actor:7,id_dmp:'41',
    id_mp_zona_1:'99',field:'numero_factura_01',before:'A',after:'B'},conn);
  assert.equal(id,'82');assert.equal(audited.options.executor,conn);
  assert.equal(audited.payload.tipo_interaccion,'AUDITAR_CAMBIO');
  assert.equal(audited.payload.entidad,'detalle_mp_2026_zona_1');
  assert.equal(audited.payload.metodo_http,'PATCH');
  assert.equal(audited.payload.detalle_json.before,'A');
});

test('MP F6: audit failure rejects operation (to trigger rollback)',async()=>{
  const A=load(BASE+'cobranza-uni-administracion.mp-zona1-audit.js',{
    '../../services/interactions/interactions.service':{
      recordFromRequest_gnral:async()=>({id_interaccion:null})
    },
    './cobranza-uni-administracion.mp-edit-validation':
      require('../backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.mp-edit-validation')
  });
  await assert.rejects(A.auditZone1_uni(REQ,{operation:'link',actor:7,id_dmp:'41',
    id_mp_zona_1:'99'},{query(){}}),{code:'MP_ZONA1_AUDITORIA_FALLIDA'});
});

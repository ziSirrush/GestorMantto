'use strict';
// [BLT NOW | 2026-10-23 | COBRANZA_UNI_ADMIN_MP_FASE_3_V001]
// Sin Aiven ni escritura remota. Simula transacciones, concurrencia y auditoria.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ROOT=path.resolve(__dirname,'..');
const rel='backend/src/modules/cobranza-uni-administracion/';
const read=file=>fs.readFileSync(path.join(ROOT,file),'utf8');
const C=require('../backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.constants');
const V=require('../backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.mp-edit-validation');
const F=require('../backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.mp-formulas');
const PERM={
  MAIN_VISUAL:'ADMIN.MAIN',
  TABLE_PERMISSIONS:{
    gestion_credito:{view:'GC.VER',edit:'GC.EDITAR'},
    pc:{view:'PC.VER',edit:'PC.EDITAR'},
    detalle_mp_2026:{view:'MP.VER',edit:'MP.EDITAR'}
  },
  ALL_TABLE_PERMISSIONS:['GC.VER','GC.EDITAR','PC.VER','PC.EDITAR','MP.VER','MP.EDITAR']
};
const RIGHTS=new Map([['ADMIN.MAIN',true],['MP.VER',true],['MP.EDITAR',true]]);
const REQ={informationAccess:{effective_user_id:25,empresa:'UNITED',acceso_puerta:true},
  contextUser:{id_SB:25},viewerContext:{active:false},originalUrl:'/api/cobranza-uni/administracion/tablas/detalle_mp_2026/registros/41'};
function vmLoad(file,deps,extras={}){
  const mod={exports:{}};
  vm.runInNewContext(read(file),{module:mod,exports:mod.exports,
    require:name=>{
      if(Object.hasOwn(deps,name))return deps[name];
      throw Error('Dependencia no simulada: '+name);
    },...extras});
  return mod.exports;
}
function makeService(options={}){
  const aliases=[],audits=[];
  const module=vmLoad(rel+'cobranza-uni-administracion.mp-edit-service.js',{
    '../../config/db':{getConnection(){throw Error('Conexion Aiven no simulada');}},
    '../../services/cobranza-uni-scope.service':{
      buildCobranzaProjectScopeSql_uni(req,alias){aliases.push(alias);return 'mp.id_dmp > 0';},
      canonicalProjectSql_uni(alias){assert.equal(alias,'mp');return 'mp.proyecto';}
    },
    '../../services/permissions/effective-permission.service':{listEffectivePermissions:async()=>RIGHTS},
    './cobranza-uni-administracion.permissions':PERM,
    './cobranza-uni-administracion.constants':C,
    './cobranza-uni-administracion.mp-edit-audit':{auditMpCell_uni(){throw Error('Auditoria real prohibida');}},
    './cobranza-uni-administracion.mp-edit-validation':V,
    './cobranza-uni-administracion.mp-formulas':F,
    './cobranza-uni-administracion.pc-derived-write':{
      persistPcDerivedForMpChange_uni:async()=>({calculated:0,projects:0})
    }
  },{process:{env:options.env||{}}});
  return {module,aliases,audits};
}
function makeConnection(input={}){
  const values={41:'ORIGEN',42:'SUR',43:'NORTE',...(input.values||{})};
  const log=[];let commits=0,rollbacks=0,begins=0,released=0;
  const connection={
    async beginTransaction(){log.push(['BEGIN']);begins++;},
    async query(sql,params){
      log.push([sql,params]);
      if(/FOR UPDATE/.test(sql)){
        const id=params[0];
        if(input.hideId===id)return [[]];
        return [[{id_dmp:id,original_value:values[id]??null,
          original_project:input.project||'PROYECTO UNO',
          original_client:input.client||'CLIENTE UNO'}]];
      }
      if(/^UPDATE `detalle_mp_2026` mp/.test(sql)){
        if(input.failUpdate)return [{affectedRows:0}];
        const [value,id]=params;
        values[id]=value;
        return [{affectedRows:1}];
      }
      throw Error('Consulta no esperada '+sql);
    },
    async commit(){log.push(['COMMIT']);commits++;},
    async rollback(){log.push(['ROLLBACK']);rollbacks++;},
    release(){released++;}
  };
  return {connection,values,log,stats:()=>({commits,rollbacks,begins,released})};
}
function deps(db,extra={}){
  const audit=[];
  return {connection:db.connection,featureEnabled:true,
    permissionResolver:async()=>(extra.rights||RIGHTS),
    auditRecorder:async(req,change,conn)=>{
      assert.equal(conn,db.connection);audit.push(change);
      if(extra.failAudit)throw Error('Auditoria rechazada');
      return '200';
    },...extra,
    getAudit:()=>audit};
}

// ---------- contrato ----------
test('MP: las once capturas son editables y los derivados/IDs siguen protegidos',()=>{
  assert.deepEqual(V.PHASE3_SAFE_FIELDS_MP_UNI,
    ['zona_adm','periodicidad','momento_facturacion','forma_pago']);
  assert.equal(C.MP_COLUMNS_UNI.length,20);
  assert.equal(C.MP_RULES_UNI.writesEnabled,false);
  assert.equal(C.MP_ZONE1_META_UNI.writesEnabled,false);
  assert.deepEqual(V.PHASE4_SAFE_FIELDS_MP_UNI,C.MP_EDITABLE_FIELDS_UNI);
  assert.ok(V.PHASE3_SAFE_FIELDS_MP_UNI.every(x=>C.MP_EDITABLE_FIELDS_UNI.includes(x)));
  for(const field of ['id_dmp','id_proyecto_cobranza',
    'iguala','condiciones_pago','monto_anual','pendiente',
    'pendiente_corriente','pendiente_vencido','facturas_pendientes',
    ]){
    assert.throws(()=>V.normalizeSingleMp_uni({changes:{[field]:'X'},expected:{[field]:null}}),
      {code:'MP_ADMIN_CAMPO_PROTEGIDO'},field);
  }
});
test('MP F3: expected obligatorio, una celda, LONGITUD y tipos estrictos',()=>{
  assert.deepEqual(V.normalizeSingleMp_uni({changes:{zona_adm:'  CENTRO  '},expected:{zona_adm:'NORTE'}}),
    {field:'zona_adm',value:'CENTRO',expected:'NORTE'});
  assert.equal(V.normalizeSingleMp_uni({changes:{zona_adm:''},expected:{zona_adm:'ORIGEN'}}).value,null);
  for(const body of [
    null,{}, {changes:{zona_adm:'x'},expected:{}},
    {changes:{zona_adm:'x'},expected:{zona_adm:'y'},injected:true},
    {changes:{zona_adm:'x',periodicidad:'y'},expected:{zona_adm:'y'}},
    {changes:{zona_adm:12},expected:{zona_adm:null}},
    {changes:{zona_adm:'x'.repeat(101)},expected:{zona_adm:null}},
    {changes:{zona_adm:'a\x00b'},expected:{zona_adm:null}},
    {changes:{zona_adm:'X'},expected:{zona_adm:12}}
  ])assert.throws(()=>V.normalizeSingleMp_uni(body));
});
test('MP F3: lote 2..20, orden BIGINT sin Number, esperado exacto por ID',()=>{
  const normalized=V.normalizeBulkMp_uni({ids:['9007199254740993','42'],
    changes:{zona_adm:'SUR'},expected:{
      '42':{zona_adm:'NORTE'},'9007199254740993':{zona_adm:'CENTRO'}
    }});
  assert.deepEqual(normalized.ids,['42','9007199254740993']);
  for(const ids of [['41'],['41','41'],Array.from({length:21},(_,i)=>String(i+1))]){
    const expected=Object.fromEntries(ids.map(id=>[id,{zona_adm:null}]));
    assert.throws(()=>V.normalizeBulkMp_uni({ids,changes:{zona_adm:'X'},expected}));
  }
  for(const id of ['0','01','-1','900719925474099312345','9223372036854775808','1 OR 1=1']){
    assert.throws(()=>V.idMp_uni(id),{code:'MP_ADMIN_ID_INVALIDO'});
  }
  assert.equal(V.idMp_uni('9223372036854775807'),'9223372036854775807');
});
test('MP F3: edición habilitada por defecto; false e inválidos bloquean antes de DB',async()=>{
  const absent=makeService({env:{}}).module;
  assert.equal(absent.mpEditFeatureEnabled_uni(),true);
  assert.equal(makeService({env:{MP_ADMIN_EDIT_ENABLED:'true'}}).module.mpEditFeatureEnabled_uni(),true);
  assert.equal(makeService({env:{MP_ADMIN_EDIT_ENABLED:'1'}}).module.mpEditFeatureEnabled_uni(),true);
  assert.equal(makeService({env:{MP_ADMIN_EDIT_ENABLED:'invalid'}}).module.mpEditFeatureEnabled_uni(),false);
  const {module}=makeService({env:{MP_ADMIN_EDIT_ENABLED:'false'}});
  assert.equal(module.mpEditFeatureEnabled_uni(),false);
  await assert.rejects(module.updateSingleMp_uni(REQ,'41',{
    changes:{zona_adm:'SUR'},expected:{zona_adm:'ORIGEN'}
  }),{statusCode:403,code:'MP_ADMIN_ESCRITURA_DESHABILITADA'});
});
test('MP F3: flag de emergencia false bloquea ANTES de abrir transacción MySQL',async()=>{
  const {module}=makeService({env:{MP_ADMIN_EDIT_ENABLED:'false'}});
  const db=makeConnection();
  await assert.rejects(module.updateSingleMp_uni(REQ,'41',{
    changes:{zona_adm:'SUR'},expected:{zona_adm:'ORIGEN'}
  },{connection:db.connection}),{code:'MP_ADMIN_ESCRITURA_DESHABILITADA'});
  assert.equal(db.log.length,0);
});

// ---------- transacciones ----------
test('MP F3: single transaccional con scope+identidad, FOR UPDATE, expected y auditoria',async()=>{
  const {module,aliases}=makeService();
  const db=makeConnection();const d=deps(db);
  const result=await module.updateSingleMp_uni(REQ,'41',{
    changes:{zona_adm:' SUR '},expected:{zona_adm:'ORIGEN'}
  },d);
  assert.equal(result.ok,true);assert.equal(result.changed,1);assert.equal(result.total,1);
  assert.equal(result.table,'detalle_mp_2026');assert.deepEqual(aliases,['mp']);
  assert.equal(db.values[41],'SUR');
  assert.deepEqual(db.stats(),{commits:1,rollbacks:0,begins:1,released:0});
  assert.equal(d.getAudit().length,1);
  assert.equal(d.getAudit()[0].before,'ORIGEN');
  assert.equal(d.getAudit()[0].after,'SUR');
  assert.equal(d.getAudit()[0].operation,'single');
  assert.match(db.log[1][0],/FOR UPDATE$/);
  assert.match(db.log[1][0],/AND \(mp\.proyecto\) IS NOT NULL/);
  assert.match(db.log[1][0],/AND \(mp\.id_dmp > 0\)/);
  assert.match(db.log[2][0],/^UPDATE `detalle_mp_2026` mp SET mp\.`zona_adm` = \?/);
  assert.deepEqual(Array.from(db.log[2][1]),['SUR','41']);
});
test('MP: cambio de estado recalcula VA en la misma transacción y revierte si falla',async()=>{
  const {module}=makeService(),db=makeConnection();
  const calls=[];
  const d=deps(db,{vaDerivedWriter:async(conn,req,refs,actor)=>{
    assert.equal(conn,db.connection);assert.equal(req,REQ);assert.equal(actor,25);
    calls.push(refs);return {calculated:3};
  }});
  const body={changes:{estado:'JALISCO'},expected:{estado:'ORIGEN'}};
  const result=await module.updateSingleMp_uni(REQ,'41',body,d);
  assert.equal(result.calculated,3);
  assert.equal(calls.length,1);
  assert.equal(calls[0][0].proyecto,'PROYECTO UNO');
  assert.deepEqual(db.stats(),{commits:1,rollbacks:0,begins:1,released:0});
  const bad=makeConnection();
  await assert.rejects(module.updateSingleMp_uni(REQ,'41',body,
    deps(bad,{vaDerivedWriter:async()=>{throw Error('VA_DERIVADO');}})),/VA_DERIVADO/);
  assert.equal(bad.stats().commits,0);
  assert.equal(bad.stats().rollbacks,1);
});
test('MP F3: no-op no audita, pero valida identidad y expected bajo lock',async()=>{
  const {module}=makeService();const db=makeConnection();const d=deps(db);
  const result=await module.updateSingleMp_uni(REQ,'41',{
    changes:{zona_adm:'ORIGEN'},expected:{zona_adm:'ORIGEN'}
  },d);
  assert.equal(result.changed,0);
  assert.equal(d.getAudit().length,0);
  assert.equal(db.log.filter(x=>/^UPDATE/.test(x[0])).length,0);
  assert.equal(db.stats().commits,1);
});
test('MP F3: concurrencia conflictiva => 409 y rollback sin UPDATE',async()=>{
  const {module}=makeService();const db=makeConnection();const d=deps(db);
  await assert.rejects(module.updateSingleMp_uni(REQ,'41',{
    changes:{zona_adm:'SUR'},expected:{zona_adm:'VALOR ANTIGUO'}
  },d),{statusCode:409,code:'MP_ADMIN_CONFLICTO_CONCURRENCIA'});
  assert.equal(db.stats().rollbacks,1);assert.equal(db.stats().commits,0);
  assert.equal(db.log.filter(x=>/^UPDATE/.test(x[0])).length,0);
});
test('MP F3: datos sin identidad/territorio se rechazan antes de actualizar',async()=>{
  const {module}=makeService();const db=makeConnection({hideId:'41'});
  await assert.rejects(module.updateSingleMp_uni(REQ,'41',{
    changes:{zona_adm:'SUR'},expected:{zona_adm:'ORIGEN'}
  },deps(db)),{statusCode:404,code:'MP_ADMIN_REGISTRO_NO_DISPONIBLE'});
  assert.equal(db.stats().rollbacks,1);
});
test('MP F3: auditoria fallida => ROLLBACK, no COMMIT',async()=>{
  const {module}=makeService();const db=makeConnection();
  await assert.rejects(module.updateSingleMp_uni(REQ,'41',{
    changes:{zona_adm:'SUR'},expected:{zona_adm:'ORIGEN'}
  },deps(db,{failAudit:true})),/Auditoria rechazada/);
  assert.equal(db.stats().rollbacks,1);assert.equal(db.stats().commits,0);
  assert.ok(db.log.some(x=>/^UPDATE/.test(x[0])));
});
test('MP F3: affectedRows=0 => 409 y rollback; nunca registra auditoria',async()=>{
  const {module}=makeService();const db=makeConnection({failUpdate:true});const d=deps(db);
  await assert.rejects(module.updateSingleMp_uni(REQ,'41',{
    changes:{zona_adm:'SUR'},expected:{zona_adm:'ORIGEN'}
  },d),{statusCode:409,code:'MP_ADMIN_CONFLICTO_ACTUALIZACION'});
  assert.equal(db.stats().rollbacks,1);assert.equal(d.getAudit().length,0);
});
test('MP F3: lote correcto, una transaccion y auditoria por fila (orden ascendente)',async()=>{
  const {module}=makeService();const db=makeConnection();const d=deps(db);
  const response=await module.updateMultiMp_uni(REQ,{
    ids:['42','41'],changes:{zona_adm:'CENTRO'},
    expected:{'41':{zona_adm:'ORIGEN'},'42':{zona_adm:'SUR'}}
  },d);
  assert.equal(response.total,2);assert.equal(response.changed,2);
  assert.deepEqual(d.getAudit().map(x=>x.id),['41','42']);
  assert.ok(d.getAudit().every(x=>x.operation==='bulk'));
  assert.equal(db.stats().begins,1);assert.equal(db.stats().commits,1);
});
test('MP F3: lote con segunda fila distinta => rollback completo, sin commit parcial',async()=>{
  const {module}=makeService();const db=makeConnection();
  await assert.rejects(module.updateMultiMp_uni(REQ,{
    ids:['41','42'],changes:{zona_adm:'CENTRO'},
    expected:{'41':{zona_adm:'ORIGEN'},'42':{zona_adm:'NO EXISTE'}}
  },deps(db)),{code:'MP_ADMIN_CONFLICTO_CONCURRENCIA'});
  assert.equal(db.stats().rollbacks,1);assert.equal(db.stats().commits,0);
});
test('MP F3: MAIN+VER+EDITAR efectivos, puerta UNITED y viewer activo denegados',async()=>{
  const {module}=makeService();
  for(const req of [
    {...REQ,viewerContext:{active:true}},
    {...REQ,informationAccess:{...REQ.informationAccess,empresa:'CORELLIAN'}},
    {...REQ,informationAccess:{...REQ.informationAccess,acceso_puerta:false}},
    {...REQ,informationAccess:{...REQ.informationAccess,effective_user_id:null},contextUser:null,user:null}
  ]){
    const db=makeConnection();
    await assert.rejects(module.updateSingleMp_uni(req,'41',{
      changes:{zona_adm:'SUR'},expected:{zona_adm:'ORIGEN'}
    },deps(db)),{statusCode:req.contextUser===null?401:403});
    assert.equal(db.stats().rollbacks,1);
  }
  for(const key of ['ADMIN.MAIN','MP.VER','MP.EDITAR']){
    const db=makeConnection();const rights=new Map(RIGHTS);rights.delete(key);
    await assert.rejects(module.updateSingleMp_uni(REQ,'41',{
      changes:{zona_adm:'SUR'},expected:{zona_adm:'ORIGEN'}
    },deps(db,{rights})),{statusCode:403,code:'MP_ADMIN_EDICION_DENEGADA'});
    assert.equal(db.stats().rollbacks,1);
  }
});

// ---------- registro de auditoria oficial ----------
test('MP F3: usuario_interacciones se registra mediante executor=misma conexion',async()=>{
  const recorded=[];
  const audit=vmLoad(rel+'cobranza-uni-administracion.mp-edit-audit.js',{
    '../../services/interactions/interactions.service':{
      async recordFromRequest_gnral(req,event,opts){recorded.push({req,event,opts});return {id_interaccion:'551'};}
    },
    './cobranza-uni-administracion.mp-edit-validation':V,
    './cobranza-uni-administracion.mp-formulas':F
  },{Buffer});
  const conn={query(){}};
  const id=await audit.auditMpCell_uni(REQ,{id:'41',field:'zona_adm',before:'ORIGEN',
    after:'SUR',operation:'single',actor:25},conn);
  assert.equal(id,'551');
  assert.equal(recorded.length,1);
  assert.equal(recorded[0].opts.executor,conn);
  assert.equal(recorded[0].event.tipo_interaccion,'AUDITAR_CAMBIO');
  assert.equal(recorded[0].event.entidad,'detalle_mp_2026');
  assert.equal(recorded[0].event.metodo_http,'PATCH');
  assert.equal(recorded[0].event.detalle_json.id_dmp,'41');
});

// ---------- rutas / UI ----------
test('MP F3: rutas PATCH llevan guard MAIN y reportan 403 con GAS sin corte',async()=>{
  const registrations=[],guard=()=>{};
  const router={get(route,...handlers){registrations.push({method:'GET',route,handlers});},
    patch(route,...handlers){registrations.push({method:'PATCH',route,handlers});},post(){} };
  const routes=vmLoad(rel+'cobranza-uni-administracion.routes.js',{
    'express':{Router:()=>router},
    '../../middleware/information-access-gnral.middleware':{humanInformationGuard_gnral:()=>[guard]},
    '../../services/permissions/effective-permission.service':{listEffectivePermissions:async()=>RIGHTS},
    './cobranza-uni-administracion.constants':C,
    './cobranza-uni-administracion.permissions':PERM,
    './cobranza-uni-administracion.gc-service':{listGestionCredito_uni(){}},
    './cobranza-uni-administracion.pc-service':{listVentaAdicionalAdmin_uni(){}},
    './cobranza-uni-administracion.mp-service':{listMantenimientoPreventivoAdmin_uni(){}},
    './cobranza-uni-administracion.gc-edit-service':{updateSingleGc_uni(){},updateMultiGc_uni(){}},
    './cobranza-uni-administracion.pc-edit-validation':{PHASE3_SAFE_FIELDS_UNI:[]},
    './cobranza-uni-administracion.pc-edit-service':{
      pcEditFeatureEnabled_uni:()=>false,updateSinglePc_uni(){},updateMultiPc_uni(){}
    },
    './cobranza-uni-administracion.pc-create-service':{
      createGateEnabled_uni:()=>false,preflightCreatePc_uni(){},createPc_uni(){}
    },
    './cobranza-uni-administracion.mp-edit-validation':V,
    './cobranza-uni-administracion.mp-zona1-write-service':{zone1WriteEnabled_uni:()=>false},
    './cobranza-uni-administracion.mp-edit-service':{
      mpEditFeatureEnabled_uni:()=>false,
      updateSingleMp_uni:async()=>{const e=new Error('GAS');e.statusCode=403;e.code='MP_ADMIN_ESCRITURA_DESHABILITADA';throw e;},
      updateMultiMp_uni:async()=>{const e=new Error('GAS');e.statusCode=403;e.code='MP_ADMIN_ESCRITURA_DESHABILITADA';throw e;}
    }
  });
  assert.equal(routes,router);
  const pathSingle='/tablas/detalle_mp_2026/registros/:id';
  const pathBulk='/tablas/detalle_mp_2026/registros/edicion-multiple';
  const single=registrations.find(x=>x.method==='PATCH'&&x.route===pathSingle);
  const bulk=registrations.find(x=>x.method==='PATCH'&&x.route===pathBulk);
  assert.ok(single&&bulk);
  assert.ok(single.handlers.includes(guard)&&bulk.handlers.includes(guard));
  function response(){let statusCode=200;return {status(n){statusCode=n;return this;},json(body){return {statusCode,body};}};}
  const singleRes=await single.handlers.at(-1)({...REQ,params:{id:'41'},body:{}},response(),e=>{throw e;});
  assert.equal(singleRes.statusCode,403);
  assert.equal(singleRes.body.code,'MP_ADMIN_ESCRITURA_DESHABILITADA');
  const bulkRes=await bulk.handlers.at(-1)({...REQ,body:{}},response(),e=>{throw e;});
  assert.equal(bulkRes.statusCode,403);
  const contract=registrations.find(x=>x.method==='GET'&&x.route==='/contrato').handlers.at(-1);
  const answer=await contract({...REQ,contextUser:{id_SB:25}},response(),e=>{throw e;});
  assert.equal(answer.body.tables.find(t=>t.table==='detalle_mp_2026').can_edit,false);
});
test('MP F3: editor Excel fantasma dentro de TD, sin modal y con whitelist de backend',async()=>{
  const code=read('modules/cobranza-uni/administracion/mantenimiento-preventivo/mantenimiento-preventivo.js');
  const css=read('modules/cobranza-uni/administracion/mantenimiento-preventivo/mantenimiento-preventivo.css');
  const main=read('modules/cobranza-uni/administracion/main/main.js');
  for(const part of ['data-mp-bulk-form','data-mp-cell-input','cua-mp-canedit',"method:'PATCH'",'expected'])
    assert.ok(code.includes(part),part);
  assert.match(css,/@media\(max-width:540px\)/);
  assert.match(main,/editableFields:Array\.isArray\(response\.editable_fields\)/);
  const events={},nodes=new Map(),requests=[];
  function el(selector){
    if(!nodes.has(selector))nodes.set(selector,{innerHTML:'',textContent:'',dataset:{},value:'',
      hidden:true,checked:false,disabled:false,focus(){},setAttribute(){}});
    return nodes.get(selector);
  }
  const root={innerHTML:'',addEventListener(type,handler){events[type]=handler;},
    querySelector:el,querySelectorAll(){return [];},replaceChildren(){this.innerHTML='';},
    contains(){return true;}};
  const uiRows=[{id_dmp:'41',proyecto:'<script>x</script>',zona_adm:'ORIGEN'},
    {id_dmp:'42',proyecto:'B',zona_adm:'SUR'}];
  const win={ManttoAuth:{apiGet:async()=>({ok:true,table:'detalle_mp_2026',readonly:true,
    columns:C.MP_COLUMNS_UNI,rows:uiRows,total:2,pages:1,
    formula_preview:F.buildMpFormulaPreview_uni(uiRows)}),
    api:async(url,options)=>{requests.push({url,options});return {
      ok:true,table:'detalle_mp_2026',field:'zona_adm',total:1,changed:1};}
  }};
  let created;
  const doc={createElement(kind){
    created={tagName:String(kind).toUpperCase(),value:'',setAttribute(){},
      focus(){},select(){},matches(sel){return sel==='[data-mp-cell-input]';}};
    return created;
  }};
  vm.runInNewContext(code,{window:win,document:doc,URLSearchParams});
  const view=win.ManttoCobranzaAdministracionMP_uni.mount(root,{
    canEdit:true,editableFields:['zona_adm','id_dmp','factor_monto_anual'],isCurrent:()=>true
  });
  await new Promise(done=>setImmediate(done));
  assert.ok(view);
  assert.match(root.innerHTML,/data-mp-bulk-form/);
  assert.match(el('[data-mp-body]').innerHTML,/cua-mp-canedit/);
  assert.doesNotMatch(el('[data-mp-body]').innerHTML,/<script>x<\/script>/);
  assert.match(el('[data-mp-body]').innerHTML,/&lt;script&gt;/);
  // Doble clic directamente en celda autorizada; sin modal ni boton Editar.
  const td={dataset:{mpField:'zona_adm'},classList:{contains:v=>v==='cua-mp-canedit',add(){},remove(){}},
    closest:selector=>selector==='tr'?{dataset:{mpId:'41'}}:null,
    replaceChildren(input){this.input=input;},
    querySelector:selector=>selector==='[data-mp-cell-input]'?td.input:null,
    focus(){},innerHTML:''};
  assert.equal(typeof events.dblclick,'function');
  events.dblclick({target:{closest:selector=>selector==='td.cua-mp-canedit'?td:null}});
  assert.equal(created.value,'ORIGEN');
  created.value='NORTE';
  events.keydown({target:created,key:'Enter',preventDefault(){}});
  await new Promise(done=>setImmediate(done));
  assert.equal(requests.length,1);
  assert.equal(requests[0].options.method,'PATCH');
  assert.deepEqual(JSON.parse(requests[0].options.body),{
    changes:{zona_adm:'NORTE'},expected:{zona_adm:'ORIGEN'}
  });
  view.destroy();
  assert.equal(root.innerHTML,'');
});

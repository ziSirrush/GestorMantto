'use strict';
// [BLT NOW | 2026-10-23 | COBRANZA_UNI_VA_ADMIN_FASE_3_V001]
// Isolated tests; no Aiven reads/writes, no GAS, no network.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const BASE=path.resolve(__dirname,'..');
const dir='../backend/src/modules/cobranza-uni-administracion/';
const read=p=>fs.readFileSync(path.join(BASE,p),'utf8');
const v=require(dir+'cobranza-uni-administracion.pc-edit-validation');
const c=require(dir+'cobranza-uni-administracion.constants');
const rights=require(dir+'cobranza-uni-administracion.permissions');

function serviceMock(env=process.env){
  const mod={exports:{}};
  const stub=name=>{
    if(name==='../../config/db')return {getConnection(){throw Error('NO_AIVEN');}};
    if(name==='../../services/cobranza-uni-scope.service')return {buildCobranzaProjectScopeSql_uni(){throw Error('NEVER_USE_REAL_SCOPE');}};
    if(name==='../../services/permissions/effective-permission.service')return {listEffectivePermissions(){throw Error('PERMISSIONS_MUST_BE_MOCKED');}};
    if(name.endsWith('.permissions'))return rights;
    if(name.endsWith('.pc-edit-validation'))return v;
    if(name.endsWith('.pc-edit-audit'))return {auditPcCell_uni(){throw Error('AUDIT_MUST_BE_MOCKED');}};
    throw Error('Missing mocked dependency '+name);
  };
  vm.runInNewContext(read('backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.pc-edit-service.js'),
    {require:stub,module:mod,exports:mod.exports,process:{env}});
  return mod.exports;
}
const svc=serviceMock();
const request={contextUser:{id_SB:61},user:{id_SB:61},viewerContext:{active:false},
  informationAccess:{empresa:'UNITED',acceso_puerta:true,effective_user_id:61}};
const permit=async(_id,codes)=>new Map(codes.map(c=>[c,true]));
const rows=()=>({
  '2041':{id_pc:'2041',ov:'OV-1',comentarios_cobranza:'INICIAL',fecha_pago:'2026-10-01'},
  '2043':{id_pc:'2043',ov:'OV-2',comentarios_cobranza:null,fecha_pago:null}
});
function txFixture(overrides={}){
  const dbRows=structuredClone(overrides.rows||rows());
  const calls=[];let pendingAudits=[],committedAudits=[];
  let snapshot=null,commits=0,rollbacks=0;
  const conn={
    beginTransaction:async()=>{snapshot=structuredClone(dbRows);calls.push('BEGIN');},
    commit:async()=>{commits++;committedAudits=pendingAudits.slice();calls.push('COMMIT');},
    rollback:async()=>{
      rollbacks++;for(const id of Object.keys(dbRows))delete dbRows[id];
      Object.assign(dbRows,structuredClone(snapshot));pendingAudits=[];calls.push('ROLLBACK');
    },
    release(){throw Error('Connection was borrowed');},
    async query(sql,params){
      calls.push({sql,params});
      assert.match(sql,/\(\(pc\.id_pc > 0\)\)/);
      if(sql.startsWith('SELECT CAST(pc.`id_pc`')){
        assert.match(sql,/FOR UPDATE$/);
        const id=String(params[0]),field=/pc\.\`([^`]+)\` AS original_value/.exec(sql)?.[1];
        assert.ok(v.PHASE3_SAFE_FIELDS_UNI.includes(field));
        return [dbRows[id]?[{id_pc:id,original_value:dbRows[id][field]}]:[]];
      }
      if(sql.startsWith('UPDATE `pc` pc SET')){
        assert.match(sql,/^UPDATE `pc` pc SET pc\.\`[a-z_]+\` = \? WHERE pc\.\`id_pc\` = \? /);
        const id=String(params[1]),field=/SET pc\.\`([^`]+)\`/.exec(sql)[1];
        if(!dbRows[id])return [{affectedRows:0}];
        dbRows[id][field]=params[0];return [{affectedRows:1}];
      }
      throw Error('SQL not in mock: '+sql);
    }
  };
  const deps={connection:conn,featureEnabled:true,
    scopeBuilder:()=>'(pc.id_pc > 0)',permissionResolver:permit,
    auditRecorder:async(_req,change,executor)=>{
      assert.equal(executor,conn);pendingAudits.push(change);
      if(overrides.auditFails)throw Error('AUDIT_DOWN');
      return String(pendingAudits.length);
    }};
  return {dbRows,calls,deps,get commits(){return commits;},get rollbacks(){return rollbacks;},
    get audits(){return committedAudits;}};
}

test('VA F3: only eight safe fields; derived, identity, FK and financial origins stay locked',()=>{
  assert.deepEqual(v.PHASE3_SAFE_FIELDS_UNI,[
    'zona_adm','ov','concepto','no_factura','estatus_operativo',
    'fecha_pago','refacturacion_sustitucion','comentarios_cobranza'
  ]);
  assert.equal(c.PC_COLUMNS_UNI.length,31);
  assert.equal(c.PC_EDITABLE_FIELDS_UNI.length,15);
  assert.equal(c.PC_DERIVED_FIELDS_UNI.length,14);
  for(const field of ['id_pc','id_proyecto_cobranza','venta_total','estatus','adeudo',
      'proyecto','cliente','fecha_factura','fecha_ov','precio_venta','tipo_pago','estatus_administrativo']){
    assert.throws(()=>v.inputValue_uni(field,'DATO'),{code:'VA_ADMIN_CAMPO_NO_DISPONIBLE'},field);
  }
  assert.ok(v.PHASE3_SAFE_FIELDS_UNI.every(field=>c.PC_EDITABLE_FIELDS_UNI.includes(field)));
});

test('VA F3: validates SQL types, dates, comments, NULL and strict ID',()=>{
  assert.equal(v.inputValue_uni('ov',' OV-02 '),'OV-02');
  assert.equal(v.inputValue_uni('fecha_pago','2024-02-29'),'2024-02-29');
  assert.equal(v.inputValue_uni('fecha_pago',null),null);
  for(const date of ['2026-02-30','2026-13-01','2026-04-31','1/1/2026','0000-00-00'])
    assert.throws(()=>v.inputValue_uni('fecha_pago',date),{code:'VA_ADMIN_FECHA_INVALIDA'});
  assert.throws(()=>v.inputValue_uni('ov','X'.repeat(101)),{code:'VA_ADMIN_VALOR_EXCESIVO'});
  assert.throws(()=>v.inputValue_uni('comentarios_cobranza','X'.repeat(4001)),{code:'VA_ADMIN_VALOR_EXCESIVO'});
  assert.throws(()=>v.inputValue_uni('ov',{value:'F'}),{code:'VA_ADMIN_VALOR_INVALIDO'});
  assert.throws(()=>v.inputValue_uni('ov','bad\u0000text'),{code:'VA_ADMIN_VALOR_INVALIDO'});
  assert.equal(v.idPc_uni('9007199254740993'),'9007199254740993');
  assert.throws(()=>v.idPc_uni(Number.MAX_SAFE_INTEGER+1),{code:'VA_ADMIN_ID_INVALIDO'});
  assert.throws(()=>v.idPc_uni('0'),{code:'VA_ADMIN_ID_INVALIDO'});
  assert.throws(()=>v.idPc_uni('9223372036854775808'),{code:'VA_ADMIN_ID_INVALIDO'});
});

test('VA F3: optimistic concurrency is mandatory for single and bulk',()=>{
  const one=v.normalizeSinglePc_uni({changes:{ov:'OV-2'},expected:{ov:'OV-1'}});
  assert.equal(one.field,'ov');assert.equal(one.expected,'OV-1');
  for(const body of [
    {changes:{ov:'X'}},
    {changes:{ov:'X'},expected:{no_factura:'X'}},
    {changes:{ov:'X',concepto:'Y'},expected:{ov:'A'}},
    {changes:{ov:'X'},expected:{ov:'A'},unexpected:'A'},
    {changes:{ov:['X']},expected:{ov:'A'}}
  ])assert.throws(()=>v.normalizeSinglePc_uni(body));
  const bulk=v.normalizeBulkPc_uni({ids:['2043','2041'],changes:{ov:'NUEVA'},
    expected:{'2041':{ov:'OV-1'},'2043':{ov:'OV-2'}}});
  assert.deepEqual(bulk.ids,['2041','2043']);
  assert.equal(bulk.expected['2041'],'OV-1');
  assert.throws(()=>v.normalizeBulkPc_uni({ids:['2041','2041'],changes:{ov:'A'},
    expected:{'2041':{ov:'A'}}}),{code:'VA_ADMIN_LOTE_DUPLICADO'});
  assert.throws(()=>v.normalizeBulkPc_uni({ids:['2041'],changes:{ov:'A'},expected:{}}),{code:'VA_ADMIN_LOTE_INVALIDO'});
  assert.throws(()=>v.normalizeBulkPc_uni({ids:Array.from({length:21},(_,i)=>String(i+1)),
    changes:{ov:'A'},expected:{}}),{code:'VA_ADMIN_LOTE_INVALIDO'});
});

test('VA F3: escritura OFF sin flag; requiere habilitacion explicita y respeta false',async()=>{
  const absent=serviceMock({});
  assert.equal(absent.pcEditFeatureEnabled_uni(),false);
  await assert.rejects(absent.updateSinglePc_uni(request,'2041',{
    changes:{ov:'N'},expected:{ov:'OV-1'}
  }),{code:'VA_ADMIN_ESCRITURA_DESHABILITADA',statusCode:403});
  assert.equal(serviceMock({PC_ADMIN_EDIT_ENABLED:'true'}).pcEditFeatureEnabled_uni(),true);
  assert.equal(serviceMock({PC_ADMIN_EDIT_ENABLED:'1'}).pcEditFeatureEnabled_uni(),true);
  assert.equal(serviceMock({PC_ADMIN_EDIT_ENABLED:'garbage'}).pcEditFeatureEnabled_uni(),false);
  const s=serviceMock({PC_ADMIN_EDIT_ENABLED:'false'});
  await assert.rejects(s.updateSinglePc_uni(request,'2041',{
    changes:{ov:'N'},expected:{ov:'OV-1'}
  }),{code:'VA_ADMIN_ESCRITURA_DESHABILITADA',statusCode:403});
});

test('VA F3: successful edit locks scoped row, audits in transaction, commits',async()=>{
  const t=txFixture();
  const r=await svc.updateSinglePc_uni(request,'2041',{
    changes:{ov:'OV-NEW'},expected:{ov:'OV-1'}},t.deps);
  assert.equal(r.ok,true);assert.equal(r.table,'pc');assert.equal(r.changed,1);
  assert.equal(t.dbRows['2041'].ov,'OV-NEW');assert.equal(t.commits,1);assert.equal(t.rollbacks,0);
  assert.equal(t.audits.length,1);assert.equal(t.audits[0].before,'OV-1');
  assert.equal(t.audits[0].after,'OV-NEW');assert.equal(t.audits[0].actor,61);
  assert.equal(t.calls[0],'BEGIN');assert.equal(t.calls.at(-1),'COMMIT');
  assert.ok(t.calls.some(x=>x.sql?.includes('FOR UPDATE')));
  assert.ok(t.calls.some(x=>x.sql?.startsWith('UPDATE `pc`')));
});

test('VA F3: stale expected causes 409 + rollback; no write',async()=>{
  const t=txFixture();
  await assert.rejects(svc.updateSinglePc_uni(request,'2041',{
    changes:{ov:'X'},expected:{ov:'STALE'}},t.deps),
  {code:'VA_ADMIN_CONFLICTO_CONCURRENCIA',statusCode:409});
  assert.equal(t.rollbacks,1);assert.equal(t.commits,0);
  assert.equal(t.dbRows['2041'].ov,'OV-1');
  assert.ok(!t.calls.some(x=>x.sql?.startsWith('UPDATE `pc`')));
});

test('VA F3: bulk edits 2 rows with ordered locks and one commit',async()=>{
  const t=txFixture();
  const r=await svc.updateMultiPc_uni(request,{
    ids:['2043','2041'],changes:{ov:'LOTE'},
    expected:{'2041':{ov:'OV-1'},'2043':{ov:'OV-2'}}
  },t.deps);
  assert.equal(r.total,2);assert.equal(r.changed,2);
  assert.equal(t.dbRows['2041'].ov,'LOTE');assert.equal(t.dbRows['2043'].ov,'LOTE');
  assert.equal(t.commits,1);assert.equal(t.audits.length,2);
  assert.deepEqual(Array.from(r.results,x=>x.id),['2041','2043']);
});

test('VA F3: bulk conflict on second row reverts first row and audit',async()=>{
  const t=txFixture();
  await assert.rejects(svc.updateMultiPc_uni(request,{
    ids:['2043','2041'],changes:{ov:'LOTE'},
    expected:{'2041':{ov:'OV-1'},'2043':{ov:'OUTDATED'}}
  },t.deps),{code:'VA_ADMIN_CONFLICTO_CONCURRENCIA'});
  assert.equal(t.dbRows['2041'].ov,'OV-1');assert.equal(t.dbRows['2043'].ov,'OV-2');
  assert.equal(t.commits,0);assert.equal(t.rollbacks,1);assert.equal(t.audits.length,0);
});

test('VA F3: audit failure rolls back data change',async()=>{
  const t=txFixture({auditFails:true});
  await assert.rejects(svc.updateSinglePc_uni(request,'2041',{
    changes:{ov:'CHANGED'},expected:{ov:'OV-1'}},t.deps),/AUDIT_DOWN/);
  assert.equal(t.dbRows['2041'].ov,'OV-1');assert.equal(t.commits,0);assert.equal(t.rollbacks,1);
});

test('VA F3: impersonation, unrelated company or edit permission absent => deny',async()=>{
  for(const changes of [
    {viewerContext:{active:true}},
    {informationAccess:{empresa:'CORELLIAN',acceso_puerta:true,effective_user_id:61}},
    {informationAccess:{empresa:'UNITED',acceso_puerta:false,effective_user_id:61}}
  ]){
    const t=txFixture();
    await assert.rejects(svc.updateSinglePc_uni({...request,...changes},'2041',{
      changes:{ov:'N'},expected:{ov:'OV-1'}},t.deps),{code:'VA_ADMIN_ACCESO_DENEGADO'});
    assert.equal(t.commits,0);assert.equal(t.rollbacks,1);
  }
  const t=txFixture();
  t.deps.permissionResolver=async()=>new Map([
    [rights.MAIN_VISUAL,true],[rights.TABLE_PERMISSIONS.pc.view,true],
    [rights.TABLE_PERMISSIONS.pc.edit,false]
  ]);
  await assert.rejects(svc.updateSinglePc_uni(request,'2041',{
    changes:{ov:'N'},expected:{ov:'OV-1'}},t.deps),{code:'VA_ADMIN_EDICION_DENEGADA'});
  assert.equal(t.commits,0);assert.equal(t.rollbacks,1);
});

test('VA F3: audit uses existing interactions service and same SQL connection',async()=>{
  const mod={exports:{}};let captured;
  vm.runInNewContext(read('backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.pc-edit-audit.js'),{
    module:mod,exports:mod.exports,Buffer,
    require:name=>{
      if(name==='../../services/interactions/interactions.service')return {
        recordFromRequest_gnral:async(_req,change,deps)=>{captured={change,deps};return {id_interaccion:'99'};}
      };
      if(name.endsWith('.pc-edit-validation'))return v;
      throw Error(name);
    }
  });
  const conn={query(){}};
  const id=await mod.exports.auditPcCell_uni(request,{
    id:'2041',field:'ov',before:'OV-1',after:'OV-NEW',actor:61,operation:'single'
  },conn);
  assert.equal(id,'99');assert.equal(captured.deps.executor,conn);
  assert.equal(captured.change.entidad,'pc');assert.equal(captured.change.metodo_http,'PATCH');
  assert.equal(captured.change.detalle_json.id_pc,'2041');
});

test('VA F3: route access checks canEdit flag, readonly GET remains, PATCH guarded',async()=>{
  const registrations=[];let feature=false,rightsMap=new Map(),called=[];
  const guardFn=()=>{};
  const fakeRouter={get(path,...handlers){registrations.push({method:'GET',path,handlers});},
    patch(path,...handlers){registrations.push({method:'PATCH',path,handlers});},
    post(path,...handlers){registrations.push({method:'POST',path,handlers});},use(){}};
  const mod={exports:{}};
  vm.runInNewContext(read('backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.routes.js'),{
    module:mod,exports:mod.exports,
    require:name=>{
      if(name==='express')return {Router:()=>fakeRouter};
      if(name==='../../middleware/information-access-gnral.middleware')return {humanInformationGuard_gnral:()=>[guardFn]};
      if(name==='../../services/permissions/effective-permission.service')return {
        listEffectivePermissions:async()=>rightsMap
      };
      if(name.endsWith('.constants'))return c;
      if(name.endsWith('.permissions'))return rights;
      if(name.endsWith('.gc-service'))return {listGestionCredito_uni(){}};
      if(name.endsWith('.gc-edit-service'))return {updateMultiGc_uni(){},updateSingleGc_uni(){}};
      if(name.endsWith('.pc-service'))return {listVentaAdicionalAdmin_uni:async()=>({ok:true,readonly:true,table:'pc'})};
      if(name.endsWith('.pc-edit-validation'))return v;
      if(name.endsWith('.pc-create-service'))return {createGateEnabled_uni:()=>false,preflightCreatePc_uni(){},createPc_uni(){}};
      if(name.endsWith('.pc-edit-service'))return {
        pcEditFeatureEnabled_uni:()=>feature,
        updateMultiPc_uni:async(req,body)=>{called.push({req,body});return {ok:true,table:'pc'};},
        updateSinglePc_uni:async(req,id,body)=>{called.push({req,id,body});return {ok:true,table:'pc'};}
      };
      throw Error('Not mocked '+name);
    }
  });
  const req={contextUser:{id_SB:61},viewerContext:{active:false}};
  const codes=rights.TABLE_PERMISSIONS.pc;
  rightsMap=new Map([[codes.view,true],[codes.edit,true]]);
  const response=()=>({statusCode:200,status(n){this.statusCode=n;return this;},json(payload){return {status:this.statusCode,body:payload};}});
  const access=registrations.find(x=>x.path==='/tablas/:tabla/acceso').handlers.at(-1);
  let r=await access({...req,params:{tabla:'pc'}},response(),error=>{throw error;});
  assert.equal(r.body.can_edit,false);assert.deepEqual(Array.from(r.body.editable_fields),[]);
  feature=true;
  r=await access({...req,params:{tabla:'pc'}},response(),error=>{throw error;});
  assert.equal(r.body.can_edit,true);
  assert.equal(r.body.editable_fields.length,8);
  r=await access({...req,viewerContext:{active:true},params:{tabla:'pc'}},response(),error=>{throw error;});
  assert.equal(r.body.can_edit,false);
  for(const path of ['/tablas/pc/registros/:id','/tablas/pc/registros/edicion-multiple']){
    const entry=registrations.find(x=>x.method==='PATCH'&&x.path===path);
    assert.ok(entry);assert.ok(entry.handlers.includes(guardFn));
    const payload=await entry.handlers.at(-1)({...req,params:{id:'2041'},body:{changes:{ov:'N'},expected:{ov:'OV-1'}}},
      response(),error=>{throw error;});
    assert.equal(payload.status,200);
  }
  assert.equal(called.length,2);
  // Este test valida exclusivamente POST de VA: MP Zona 1 tiene rutas POST propias.
  assert.deepEqual(registrations.filter(x=>x.method==='POST' && x.path.startsWith('/tablas/pc/')).map(x=>x.path),
    ['/tablas/pc/registros/validar-alta','/tablas/pc/registros']);
  assert.ok(!registrations.some(x=>['PUT','DELETE'].includes(x.method))); 
});

test('VA F3: edicion fantasma Excel, lote y alta independiente sin SQL en frontend',()=>{
  const main=read('modules/cobranza-uni/administracion/main/main.js');
  const ui=read('modules/cobranza-uni/administracion/venta-adicional/venta-adicional.js');
  const css=read('modules/cobranza-uni/administracion/venta-adicional/venta-adicional.css');
  assert.match(main,/editableFields:Array\.isArray\(response\.editable_fields\)/);
  assert.match(main,/canEdit:response.can_edit===true/);
  for(const field of ['data-pc-cell-input','cua-pc-canedit','data-pc-bulk-form',
    'data-pc-select','data-pc-bulk-null','data-pc-create-dialog'])
    assert.ok(ui.includes(field),field);
  assert.doesNotMatch(ui,/data-pc-dialog hidden|data-pc-group|data-pc-edit-field|\bGROUPS\b/);
  assert.match(ui,/root\.addEventListener\('dblclick',onDblClick\)/);
  assert.match(ui,/function cancelCellEdit\(\)/);
  assert.match(css,/\.cua-pc-edit-input/);
  assert.doesNotMatch(css,/\.cua-pc-group(?:\s|\{|:)/);
  assert.match(ui,/method:'PATCH'/);
  assert.match(ui,/options\.canEdit===true/);
  assert.match(ui,/method:'POST'/);
  assert.doesNotMatch(ui,/method:'DELETE'/);
  assert.match(css,/\.cua-pc-dialog\[hidden\]/);
  assert.match(css,/position:fixed/);
  assert.match(css,/max-width:none/);
  assert.match(read('.gitignore'),/^\*\.sql$/m);
});

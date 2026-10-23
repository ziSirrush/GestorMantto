'use strict';
// [BLT NOW | 2026-10-23 | COBRANZA_UNI_ADMINISTRACION_FASE_4_V001]
// Sin conexión a Aiven: dobles de SQL, scope, permiso y auditoría transaccional.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const R=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(R,p),'utf8');
const mod='backend/src/modules/cobranza-uni-administracion/';
const validation=require('../backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.gc-edit-validation');
const contract=require('../backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.constants');
const permissions=require('../backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.permissions');

function serviceMock() {
  const moduleObject={exports:{}};
  const serviceCode=read(mod+'cobranza-uni-administracion.gc-edit-service.js');
  const fakeRequire=name=>{
    if(name==='../../config/db')return {getConnection(){throw Error('No accedas a Aiven en tests');}};
    if(name==='../../services/cobranza-uni-scope.service')return {
      buildCobranzaProjectScopeSql_uni:()=>'(gc.id_gc>0)',
      canonicalProjectSql_uni:()=>'(gc.proyecto IS NOT NULL)'
    };
    if(name==='../../services/permissions/effective-permission.service')return {
      listEffectivePermissions:async()=>new Map()
    };
    if(name.endsWith('gc-edit-audit'))return {recordGcCell_uni:async()=>{throw Error('AUDIT missing');}};
    if(name.endsWith('gc-sync-guard'))return {markManualEdit_uni:async()=>{throw Error('Guard missing mock');}};
    if(name.endsWith('gc-formulas'))return require('../backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.gc-formulas');
    if(name.endsWith('gc-edit-validation'))return validation;
    if(name.endsWith('constants'))return contract;
    if(name.endsWith('permissions'))return permissions;
    throw Error('Require no esperado: '+name);
  };
  vm.runInNewContext(serviceCode,{module:moduleObject,exports:moduleObject.exports,require:fakeRequire,BigInt,Object});
  return moduleObject.exports;
}
const service=serviceMock();
const allowedRequest={user:{id_SB:70},contextUser:{id_SB:70},informationAccess:{
  empresa:'UNITED',acceso_puerta:true,effective_user_id:70
},viewerContext:{active:false}};
const permissionResolver=async()=>new Map([
  [permissions.MAIN_VISUAL,true],
  [permissions.TABLE_PERMISSIONS.gestion_credito.view,true],
  [permissions.TABLE_PERMISSIONS.gestion_credito.edit,true]
]);

function fakeTransaction(initial,options={}){
  const rows=structuredClone(initial);
  const calls=[];
  let backup=null,changes=[],audits=[],commit=0,rollback=0,locked=0;
  const conn={
    async beginTransaction(){backup=structuredClone(rows);calls.push('BEGIN');},
    async commit(){commit++;calls.push('COMMIT');},
    async rollback(){rollback++;calls.push('ROLLBACK');
      for(const key of Object.keys(rows))delete rows[key];Object.assign(rows,structuredClone(backup));
      changes=[];audits=[];
    },
    release(){calls.push('RELEASE');},
    async query(sql,params){
      calls.push({sql,params});
      if(/FOR UPDATE$/.test(sql)){
        locked++;
        return [[rows[String(params[0])] ? {...rows[String(params[0])]} : undefined].filter(Boolean)];
      }
      if(/^UPDATE `gestion_credito` gc SET /i.test(sql)){
        const [,field]=/SET gc\.\`([^`]+)\` = \?/i.exec(sql)||[];
        assert.ok(contract.GC_EDITABLE_FIELDS_UNI.includes(field),'Lista blanca SQL');
        const id=String(params[1]);
        if(!rows[id])return [{affectedRows:0}];
        rows[id][field]=params[0];changes.push({id,field,value:params[0]});
        return [{affectedRows:1}];
      }
      if(/IS NOT NULL LIMIT 1/.test(sql)){
        const id=String(params[0]);
        return [options.rejectProject ? [] : rows[id]?[{id_gc:id}]:[]];
      }
      throw Error('SQL inesperado: '+sql);
    }
  };
  const auditRecorder=async(req,change,executor)=>{
    assert.equal(req,allowedRequest);assert.equal(executor,conn);
    if(options.rejectAudit)throw Error('Auditoría no registrada');
    audits.push(change);
  };
  const deps={connection:conn,auditRecorder,protectionRecorder:async()=>{},permissionResolver,
    scopeBuilder:()=>'(gc.id_gc>0)',scopeService:{canonicalProjectSql_uni:()=>'(gc.proyecto IS NOT NULL)'}};
  return {conn,rows,deps,calls,get commit(){return commit;},get rollback(){return rollback;},
    get locked(){return locked;},get changes(){return changes;},get audits(){return audits;}};
}

const baseline=()=>({
  '9007199254740993':{id_gc:'9007199254740993',id_proyecto_cobranza:'2',proyecto:'ALFA',idns:'U-1',cliente:'C',monto_va:'120.00',facturas_va:2},
  '9007199254740994':{id_gc:'9007199254740994',id_proyecto_cobranza:'2',proyecto:'ALFA',idns:'U-2',cliente:'C2',monto_va:'200.00',facturas_va:1}
});

test('F4: lista blanca de escritura no contiene PK, FK ni 7 derivados',()=>{
  assert.equal(contract.GC_EDITABLE_FIELDS_UNI.length,20);
  assert.ok(contract.GC_EDITABLE_FIELDS_UNI.includes('idns'));
  for(const name of [...contract.GC_PROTECTED_FIELDS_UNI,...contract.GC_DERIVED_FIELDS_UNI]){
    assert.throws(()=>validation.normalizeSingle_uni({changes:{[name]:'1'},expected:{[name]:null}}),
      {code:'GC_ADMIN_CAMPO_PROTEGIDO'});
  }
  assert.throws(()=>validation.normalizeSingle_uni({changes:{'idns` = NULL; DROP TABLE pc; --':'x'},expected:{}}));
});

test('F4: validación de textos y números sin precisión flotante',()=>{
  assert.equal(validation.normalizeEdited_uni('idns','  U-15  '),'U-15');
  assert.equal(validation.normalizeEdited_uni('idns',' '),null);
  assert.equal(validation.normalizeEdited_uni('monto_va','-000005.2'),'-5.20');
  assert.equal(validation.normalizeEdited_uni('monto_va','9999999999999999.99'),'9999999999999999.99');
  assert.equal(validation.normalizeEdited_uni('facturas_va','0000009'),'9');
  assert.throws(()=>validation.normalizeEdited_uni('monto_va','1.234'),{code:'GC_ADMIN_VALOR_INVALIDO'});
  assert.throws(()=>validation.normalizeEdited_uni('monto_va','10000000000000000'),{code:'GC_ADMIN_VALOR_INVALIDO'});
  assert.throws(()=>validation.normalizeEdited_uni('facturas_va','-1'),{code:'GC_ADMIN_VALOR_INVALIDO'});
  assert.throws(()=>validation.normalizeEdited_uni('cliente','A'.repeat(256)),{code:'GC_ADMIN_VALOR_INVALIDO'});
  assert.throws(()=>validation.normalizeEdited_uni('proyecto','A\nB'),{code:'GC_ADMIN_VALOR_INVALIDO'});
  assert.throws(()=>validation.id_uni(Number.MAX_SAFE_INTEGER+1),{code:'GC_ADMIN_ID_INVALIDO'});
  assert.equal(validation.id_uni('9007199254740993'),'9007199254740993');
});

test('F4: rechazo cerrado de payload, expected, inyección, lote duplicado y +20',()=>{
  for (const payload of [
    {changes:{idns:'N'}},
    {changes:{idns:'N'},expected:{otro:'A'}},
    {changes:{idns:'N',proyecto:'P'},expected:{idns:'A',proyecto:'P'}},
    {changes:{idns:'N'},expected:{idns:'A'},unexpected:true},
    {changes:{idns:[]},expected:{idns:'A'}}
  ])assert.throws(()=>validation.normalizeSingle_uni(payload));
  assert.throws(()=>validation.normalizeBulk_uni({ids:['1','1'],changes:{idns:'N'},expected:{1:{idns:'A'}}}),{code:'GC_ADMIN_LOTE_DUPLICADO'});
  assert.throws(()=>validation.normalizeBulk_uni({ids:Array.from({length:21},(_,i)=>String(i+1)),changes:{idns:'X'},expected:{}}),{code:'GC_ADMIN_LOTE_INVALIDO'});
  assert.throws(()=>validation.normalizeBulk_uni({ids:['1','2'],changes:{idns:'X'},expected:{1:{idns:'A'}}}),{code:'GC_ADMIN_EXPECTED_REQUERIDO'});
});

test('F4: operación individual con bloqueo, auditoría y COMMIT exactos',async()=>{
  const context=fakeTransaction(baseline());
  const result=await service.updateSingleGc_uni(allowedRequest,'9007199254740993',{
    changes:{idns:'NUEVO-ID'},expected:{idns:'U-1'}
  },context.deps);
  assert.equal(result.ok,true);assert.equal(result.changed,1);assert.equal(result.total,1);
  assert.equal(context.rows['9007199254740993'].idns,'NUEVO-ID');
  assert.equal(context.commit,1);assert.equal(context.rollback,0);assert.equal(context.locked,1);
  assert.equal(context.audits.length,1);
  assert.equal(context.audits[0].before,'U-1');assert.equal(context.audits[0].after,'NUEVO-ID');
  assert.match(context.calls.find(x=>x.sql?.startsWith('UPDATE')).sql,/WHERE gc\.\`id_gc\` = \? AND \(\(gc.id_gc>0\)\)/);
});

test('F4: expected stale = conflicto 409, rollback sin UPDATE ni auditoría',async()=>{
  const context=fakeTransaction(baseline());
  await assert.rejects(service.updateSingleGc_uni(allowedRequest,'9007199254740993',{
    changes:{idns:'Z'},expected:{idns:'OTRO'}
  },context.deps),{code:'GC_ADMIN_CONFLICTO_CONCURRENCIA',statusCode:409});
  assert.equal(context.commit,0);assert.equal(context.rollback,1);
  assert.equal(context.rows['9007199254740993'].idns,'U-1');
  assert.equal(context.changes.length,0);assert.equal(context.audits.length,0);
});

test('F4: lote de 2 registra auditoría por fila y una sola transacción',async()=>{
  const context=fakeTransaction(baseline());
  const result=await service.updateMultiGc_uni(allowedRequest,{
    ids:['9007199254740994','9007199254740993'],
    changes:{cliente:'NUEVO CLIENTE'},
    expected:{'9007199254740993':{cliente:'C'},'9007199254740994':{cliente:'C2'}}
  },context.deps);
  assert.equal(result.changed,2);assert.equal(context.commit,1);assert.equal(context.audits.length,2);
  assert.equal(context.rows['9007199254740993'].cliente,'NUEVO CLIENTE');
  assert.equal(context.rows['9007199254740994'].cliente,'NUEVO CLIENTE');
  assert.equal(result.results[0].id,'9007199254740993');
});

test('F4: lote atómico cancela el cambio previo si falla segundo expected',async()=>{
  const context=fakeTransaction(baseline());
  await assert.rejects(service.updateMultiGc_uni(allowedRequest,{
    ids:['9007199254740993','9007199254740994'],
    changes:{cliente:'NUEVO'},
    expected:{'9007199254740993':{cliente:'C'},'9007199254740994':{cliente:'CONFLICTO'}}
  },context.deps),{code:'GC_ADMIN_CONFLICTO_CONCURRENCIA'});
  assert.equal(context.commit,0);assert.equal(context.rollback,1);
  assert.equal(context.rows['9007199254740993'].cliente,'C');
  assert.equal(context.audits.length,0);
});

test('F4: visor, permiso denegado o puerta equivocada no escriben',async()=>{
  for(const changes of [
    {viewerContext:{active:true}},
    {informationAccess:{empresa:'CORELLIAN',acceso_puerta:true,effective_user_id:70}},
    {informationAccess:{empresa:'UNITED',acceso_puerta:false,effective_user_id:70}}
  ]){
    const context=fakeTransaction(baseline());
    const req={...allowedRequest,...changes};
    await assert.rejects(service.updateSingleGc_uni(req,'9007199254740993',{
      changes:{idns:'N'},expected:{idns:'U-1'}
    },context.deps),{code:'GC_ADMIN_ACCESO_DENEGADO'});
    assert.equal(context.changes.length,0);assert.equal(context.rollback,1);
  }
  const c=fakeTransaction(baseline());
  c.deps.permissionResolver=async()=>new Map([[permissions.MAIN_VISUAL,true],
    [permissions.TABLE_PERMISSIONS.gestion_credito.view,true],
    [permissions.TABLE_PERMISSIONS.gestion_credito.edit,false]]);
  await assert.rejects(service.updateSingleGc_uni(allowedRequest,'9007199254740993',{
    changes:{idns:'N'},expected:{idns:'U-1'}
  },c.deps),{code:'GC_ADMIN_EDICION_DENEGADA'});
  assert.equal(c.changes.length,0);
});

test('F4: proyecto editado que rompe identidad territorial provoca ROLLBACK',async()=>{
  const c=fakeTransaction(baseline(),{rejectProject:true});
  await assert.rejects(service.updateSingleGc_uni(allowedRequest,'9007199254740993',{
    changes:{proyecto:'PROYECTO AJENO'},expected:{proyecto:'ALFA'}
  },c.deps),{code:'GC_ADMIN_IDENTIDAD_PROYECTO_CONFLICTIVA'});
  assert.equal(c.rows['9007199254740993'].proyecto,'ALFA');assert.equal(c.commit,0);
});

test('F4: si auditoría falla, no se confirma UPDATE',async()=>{
  const c=fakeTransaction(baseline(),{rejectAudit:true});
  await assert.rejects(service.updateSingleGc_uni(allowedRequest,'9007199254740993',{
    changes:{cliente:'OTRO'},expected:{cliente:'C'}
  },c.deps),/Auditoría no registrada/);
  assert.equal(c.commit,0);assert.equal(c.rows['9007199254740993'].cliente,'C');
});

test('F4: auditoría oficial escribe en usuario_interacciones con la MISMA conexión',async()=>{
  const modObject={exports:{}};
  const source=read(mod+'cobranza-uni-administracion.gc-edit-audit.js');
  let capture=null;
  const fakeReq=name=>{
    if(name==='../../services/interactions/interactions.service')return {
      async recordFromRequest_gnral(req,data,options){capture={req,data,options};return{id_interaccion:88};}
    };
    if(name.endsWith('gc-edit-validation'))return validation;
    throw Error(name);
  };
  vm.runInNewContext(source,{module:modObject,exports:modObject.exports,require:fakeReq,Buffer,BigInt});
  const executor={query(){}};
  await modObject.exports.recordGcCell_uni(allowedRequest,{
    id:'9007199254740993',field:'idns',before:'X',after:'Y',operation:'single'
  },executor);
  assert.equal(capture.req,allowedRequest);
  assert.equal(capture.options.executor,executor);
  assert.equal(capture.data.tipo_interaccion,'AUDITAR_CAMBIO');
  assert.equal(capture.data.detalle_json.before,'X');
  assert.equal(capture.data.detalle_json.after,'Y');
});

test('F4: UI solo habilita escritura con canEdit y PATCH a rutas nuevas',()=>{
  const js=read('modules/cobranza-uni/administracion/gestion-credito/gestion-credito.js');
  const main=read('modules/cobranza-uni/administracion/main/main.js');
  const routes=read(mod+'cobranza-uni-administracion.routes.js');
  const srv=read(mod+'cobranza-uni-administracion.gc-edit-service.js');
  assert.match(js,/options\.canEdit===true/);
  assert.match(js,/method:'PATCH'/);
  assert.match(js,/data-gc-bulk-form/);
  assert.match(js,/data-gc-cell-input/);
  assert.match(main,/canEdit:response\.can_edit===true/);
  assert.match(routes,/router\.patch\('\/tablas\/gestion_credito\/registros\/edicion-multiple'/);
  assert.match(routes,/router\.patch\('\/tablas\/gestion_credito\/registros\/:id'/);
  assert.match(srv,/FOR UPDATE/);
  assert.match(srv,/\.beginTransaction\(/);
  assert.match(srv,/\.rollback\(/);
  assert.match(srv,/\.commit\(/);
  assert.match(srv,/canonicalProjectSql_uni/);
});

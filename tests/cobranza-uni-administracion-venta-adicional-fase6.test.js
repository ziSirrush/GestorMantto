'use strict';
// [BLT NOW | 2026-10-23 | COBRANZA_UNI_VA_ADMIN_FASE_6_V001]
// Seguridad y alta: TODOS los accesos son simulados; no conecta Aiven ni GAS.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const dir='../backend/src/modules/cobranza-uni-administracion/';
const validator=require(dir+'cobranza-uni-administracion.pc-create-validation');
const contract=require(dir+'cobranza-uni-administracion.constants');
const pure=require(dir+'cobranza-uni-administracion.pc-relations');
const money=require(dir+'cobranza-uni-administracion.pc-formulas');
const CUT='2026-10-23T21:00:00Z';
const req={user:{id_SB:61},contextUser:{id_SB:61},viewerContext:{active:false},
  informationAccess:{empresa:'UNITED',acceso_puerta:true,effective_user_id:61}};
const identity={valido:true,estado:'VALIDO_SIN_ID',proyecto:'TORRE A',id_proyecto_cobranza:'100'};
const mp=[{id_dmp:'1',proyecto:'TORRE A',id_proyecto_cobranza:'100',cliente:'C000',
  condiciones_pago:'30',z_oper:'NORTE',estado:'NL',estatus_cartera:'Activo'}];
const sibling={id_pc:'2041',proyecto:'TORRE A',id_proyecto_cobranza:'100',cliente:'C000',
  precio_venta:'100.00',tipo_pago:'FACTURA',fecha_factura:'2026-09-01',
  terminos:'30',estatus_administrativo:'Abierta'};
const fields=()=>({proyecto:'TORRE A',cliente:'C000',precio_venta:'200.00',
  tipo_pago:'FACTURA',estatus_administrativo:'Abierta',fecha_factura:'2026-09-10',
  ov:'OV-2',no_factura:'F0002',comentarios_cobranza:'Alta controlada'});
const payload=(id=null)=>({id_pc:id,fields:fields()});

function makeFixture(over={}){
  const queries=[];let transaction=false,commits=0,rollbacks=0,inserts=0,readOnly=false;
  const dbRows=new Map([['2041',sibling]]);
  const conn={
    async beginTransaction(){transaction=true;queries.push('BEGIN');},
    async commit(){commits++;queries.push('COMMIT');transaction=false;},
    async rollback(){rollbacks++;queries.push('ROLLBACK');transaction=false;dbRows.delete('2286');},
    release(){throw new Error('no debe liberar conexion prestada');},
    async query(sql,params){
      queries.push({sql,params});
      if(sql.includes('AS autorizado FROM')){
        assert.deepEqual(Array.from(params),['TORRE A','100']);
        return [over.deniedScope?[]:[{autorizado:1}]];
      }
      if(sql.startsWith('SELECT CAST(MAX(`id_pc`)'))return [[{max_id:'2285'}]];
      if(sql.startsWith('SELECT CAST(`id_pc` AS CHAR)')){
        const id=String(params[0]);
        return [over.duplicate||dbRows.has(id)?[{id_pc:id}]:[]];
      }
      if(sql.startsWith('INSERT INTO `pc`')){
        assert.equal(transaction,true,'INSERT siempre en transaccion');
        if(over.duplicateDriver){const e=new Error('Duplicate');e.code='ER_DUP_ENTRY';throw e;}
        if(over.insertFails)throw Error('DB_INSERT_FAILURE');
        const headers=sql.match(/INSERT INTO `pc` \(([^)]+)\)/)[1].split(', ').map(x=>x.replaceAll('`',''));
        assert.equal(headers.length,31);
        const obj=Object.fromEntries(headers.map((h,i)=>[h,params[i]]));
        assert.equal(obj.id_pc,'2286');
        assert.equal(obj.id_proyecto_cobranza,'100');
        assert.equal(obj.venta_total,'232.00');
        assert.equal(obj.adeudo,'348.00');
        assert.equal(obj.facturas_pendientes_pago,2);
        assert.equal(obj.fecha_vencimiento,'2026-10-10');
        assert.equal(obj.terminos,'30');
        assert.equal(obj.estado,'NL');
        assert.equal(obj.estatus_cartera,'Activo');
        assert.equal(obj.estatus,'VENCIDO');
        assert.equal(obj.comentarios_cobranza,'Alta controlada');
        if(over.auditFails)readOnly=false;
        dbRows.set(String(obj.id_pc),obj);inserts++;
        return [{affectedRows:1}];
      }
      throw Error('SQL no simulado: '+sql);
    }
  };
  const deps={connection:conn,now:new Date(CUT),
    createEnabled:over.feature??false,
    async authorizeWrite(r,c){
      assert.equal(c,conn);
      if(over.deniedPermission)throw Object.assign(new Error('permisos'),{statusCode:403,code:'SIN_EDITAR'});
      if(r?.viewerContext?.active===true||r?.informationAccess?.empresa!=='UNITED' ||
         r?.informationAccess?.acceso_puerta!==true)throw Object.assign(new Error('contexto'),{statusCode:403});
      return 61;
    },
    scopeBuilder(_r,alias){assert.equal(alias,'pc');return 'pc.proyecto IS NOT NULL';},
    identityResolver:{
      async resolverIdentidadProyecto_uni({proyecto}){
        assert.equal(proyecto,'TORRE A');
        return over.invalidIdentity?{valido:false,estado:'SIN_MAPEO'}:identity;
      },
      construirFiltroIdentidadProyecto_uni(alias){return {protegido:true,
        sql:`${alias}.proyecto = ? AND ${alias}.id_proyecto_cobranza = ?`,params:['TORRE A','100']};}
    },
    async relationsPreview(r,c,page,cutoff,{pendingRows}){
      assert.equal(r,req);assert.equal(c,conn);assert.equal(cutoff,'2026-10-23');
      assert.equal(page.length,1);
      assert.equal(pendingRows.length,1);
      assert.equal(page[0],pendingRows[0]);
      const preview=pure.buildPcRelationPreview_uni({pageRows:page,
        identities:new Map([[page[0].id_pc,identity]]),mpRows:over.conflictingMp?
          [...mp,{...mp[0],id_dmp:'2',condiciones_pago:'45'}]:mp,
        siblingRows:[sibling,...pendingRows],cutoffIso:cutoff});
      return preview;
    },
    async auditRecorder(_r,change,c){
      assert.equal(c,conn);assert.equal(change.id,'2286');
      if(over.auditFails)throw Error('AUDIT_DOWN');
      queries.push('AUDIT');return '99';
    }
  };
  return {deps,conn,queries,dbRows,
    get commits(){return commits;},get rollbacks(){return rollbacks;},get inserts(){return inserts;}};
}
function serviceWithNoNetwork(){
  const src=read('backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.pc-create-service.js');
  const mod={exports:{}};
  vm.runInNewContext(src,{module:mod,exports:mod.exports,process,Date,Set,BigInt,Buffer,
    require:name=>{
      if(name==='../../config/db')return {getConnection(){throw Error('NO_CONNECTION_WHEN_DISABLED');}};
      if(name==='../../services/cobranza-uni-scope.service')return {buildCobranzaProjectScopeSql_uni(){throw Error('SCOPE_INJECT_REQUIRED');}};
      if(name==='../../services/cobranza-uni/identidad-proyecto.service')return {crearServicioIdentidadProyectoUni(){throw Error('RESOLVER_INJECT_REQUIRED');}};
      if(name.endsWith('.constants'))return contract;
      if(name.endsWith('.pc-edit-validation'))return require(dir+'cobranza-uni-administracion.pc-edit-validation');
      if(name.endsWith('.pc-create-validation'))return validator;
      if(name.endsWith('.pc-edit-service'))return {authorizePcWrite_uni(){throw Error('AUTHORIZE_INJECT_REQUIRED');}};
      if(name.endsWith('.pc-formulas'))return money;
      if(name.endsWith('.pc-relations-service'))return {previewPcRelationsFromAiven_uni(){throw Error('PREVIEW_INJECT_REQUIRED');}};
      if(name.endsWith('.pc-create-audit'))return {auditPcCreate_uni(){throw Error('AUDIT_INJECT_REQUIRED');}};
      throw Error('Dependencia no simulada: '+name);
    }
  });
  return mod.exports;
}
const svc=serviceWithNoNetwork();

// Validation independent of Aiven

test('VA F6: creacion requiere solo campos manuales, nunca FK ni derivados',()=>{
  assert.equal(validator.CREATE_FIELDS_UNI.length,15);
  assert.equal(validator.PROHIBITED_DERIVED_UNI.length,14);
  assert.deepEqual(Object.keys(validator.normalizeCreatePc_uni(payload('2286')).fields),
    contract.PC_EDITABLE_FIELDS_UNI);
  for(const key of ['id_pc','id_proyecto_cobranza','mes_ov','terminos',
    'venta_total','adeudo','estatus_cartera']){
    assert.throws(()=>validator.normalizeCreatePc_uni({id_pc:'2286',fields:{...fields(),[key]:'1'}}),
      {code:'VA_ADMIN_ALTA_CAMPO_PROTEGIDO'});
  }
});
test('VA F6: fechas, dinero, comentarios y entrada no confiable se rechazan',()=>{
  for(const bad of ['2026-02-30','1899-12-30','2026-13-01'])
    assert.throws(()=>validator.normalizeCreatePc_uni({fields:{...fields(),fecha_factura:bad}}));
  for(const bad of ['1.001','10000000000000000','1e7',{},'-'])
    assert.throws(()=>validator.normalizeCreatePc_uni({fields:{...fields(),precio_venta:bad}}));
  assert.throws(()=>validator.normalizeCreatePc_uni({fields:{...fields(),comentarios_cobranza:'x'.repeat(4001)}}));
  assert.throws(()=>validator.normalizeCreatePc_uni({fields:{...fields(),proyecto:'\u0000'}}));
  assert.throws(()=>validator.normalizeCreatePc_uni({fields:{...fields(),precio_venta:''}}));
  assert.throws(()=>validator.normalizeCreatePc_uni({id_pc:'0',fields:fields()}));
  assert.throws(()=>validator.normalizeCreatePc_uni({id_pc:'9223372036854775808',fields:fields()}));
  assert.throws(()=>validator.normalizeCreatePc_uni({fields:{...fields(),estatus_administrativo:'Abierta',fecha_factura:null}}));
  assert.throws(()=>validator.normalizeCreatePc_uni({id_pc:'2286',fields:fields(),unexpected:true}));
});
test('VA F6: borradores por facturar permiten fecha factura NULL',()=>{
  const x=validator.normalizeCreatePc_uni({fields:{...fields(),fecha_factura:null,
    estatus_administrativo:'Por facturar'}});
  assert.equal(x.fields.fecha_factura,null);
});
test('VA F6: necesita consecutivo explicitamente confirmado para INSERT',()=>{
  assert.throws(()=>validator.normalizeCreatePc_uni(payload(),{requireId:true}),
    {code:'VA_ADMIN_ALTA_ID_REQUERIDO'});
  assert.equal(validator.normalizeCreatePc_uni(payload('2286'),{requireId:true}).id_pc,'2286');
});
test('VA F6: triple candado GAS activo por defecto (ningun flag aislado abre alta)',()=>{
  assert.equal(svc.createGateEnabled_uni({}),false);
  for(const key of ['PC_ADMIN_EDIT_ENABLED','PC_ADMIN_CREATE_ENABLED',
    'PC_ADMIN_GAS_CUTOVER_CONFIRMED']){
    assert.equal(svc.createGateEnabled_uni({[key]:'true'}),false);
  }
  assert.equal(svc.createGateEnabled_uni({PC_ADMIN_EDIT_ENABLED:'true',
    PC_ADMIN_CREATE_ENABLED:'true',PC_ADMIN_GAS_CUTOVER_CONFIRMED:'true'}),true);
  assert.equal(svc.createGateEnabled_uni({PC_ADMIN_EDIT_ENABLED:'1',
    PC_ADMIN_CREATE_ENABLED:'on',PC_ADMIN_GAS_CUTOVER_CONFIRMED:'yes'}),true);
});
test('VA F6: GAS activo bloquea POST real ANTES de abrir DB',async()=>{
  await assert.rejects(svc.createPc_uni(req,payload('2286')),{code:'VA_ADMIN_ALTA_DESHABILITADA'});
});
test('VA F6: simulacion valida identidad, 14 formulas y acumulado sin INSERT',async()=>{
  const t=makeFixture();
  const result=await svc.preflightCreatePc_uni(req,payload(),t.deps);
  assert.equal(result.mode,'preview_only');assert.equal(result.id_pc,'2286');
  assert.equal(result.id_sugerido,true);assert.equal(result.id_proyecto_cobranza,'100');
  assert.equal(Object.keys(result.derived).length,14);
  assert.equal(result.derived.venta_total,'232.00');assert.equal(result.derived.adeudo,'348.00');
  assert.equal(result.derived.facturas_pendientes_pago,2);
  assert.equal(result.derived.fecha_vencimiento,'2026-10-10');
  assert.equal(result.derived.estatus,'VENCIDO');
  assert.equal(t.inserts,0);assert.equal(t.commits,0);
  assert.ok(t.queries.filter(q=>typeof q==='object').every(q=>q.sql.trim().startsWith('SELECT ')));
});
test('VA F6: alta solo con gate, consecutivo unico y auditoria atomica',async()=>{
  const t=makeFixture({feature:true});
  const result=await svc.createPc_uni(req,payload('2286'),t.deps);
  assert.deepEqual({...result},{ok:true,table:'pc',created:true,id_pc:'2286',
    id_proyecto_cobranza:'100',as_of:'2026-10-23'});
  assert.equal(t.inserts,1);assert.equal(t.commits,1);assert.equal(t.rollbacks,0);
  assert.equal(t.queries.at(-2),'AUDIT');assert.equal(t.queries.at(-1),'COMMIT');
  assert.ok(t.queries.some(x=>typeof x==='object'&&x.sql.includes('FOR UPDATE')));
  assert.ok(!t.queries.some(x=>typeof x==='object'&&/^\s*(UPDATE|DELETE|ALTER|DROP)/i.test(x.sql)));
});
test('VA F6: falta de permiso de edicion impide generar alta',async()=>{
  const t=makeFixture({feature:true,deniedPermission:true});
  await assert.rejects(svc.createPc_uni(req,payload('2286'),t.deps),{code:'SIN_EDITAR'});
  assert.equal(t.inserts,0);assert.equal(t.commits,0);assert.equal(t.rollbacks,1);
});
test('VA F6: identidad generica sin respaldo verificado no permite INSERT',async()=>{
  const t=makeFixture({feature:true,invalidIdentity:true});
  await assert.rejects(svc.createPc_uni(req,payload('2286'),t.deps),
    {code:'VA_ADMIN_ALTA_IDENTIDAD_NO_VERIFICADA'});
  assert.equal(t.inserts,0);assert.equal(t.rollbacks,1);
});
test('VA F6: alcance UNITED sin cobertura deniega el alta',async()=>{
  const t=makeFixture({feature:true,deniedScope:true});
  await assert.rejects(svc.createPc_uni(req,payload('2286'),t.deps),
    {code:'VA_ADMIN_ALTA_FUERA_DE_ALCANCE'});
  assert.equal(t.inserts,0);assert.equal(t.rollbacks,1);
});
test('VA F6: conflicto de terminos MP bloquea alta en lugar de inventar valores',async()=>{
  const t=makeFixture({feature:true,conflictingMp:true});
  await assert.rejects(svc.createPc_uni(req,payload('2286'),t.deps));
  assert.equal(t.inserts,0);assert.equal(t.rollbacks,1);
});
test('VA F6: consecutivo existente devuelve conflicto y no inserta',async()=>{
  const t=makeFixture({feature:true,duplicate:true});
  await assert.rejects(svc.createPc_uni(req,payload('2286'),t.deps),{code:'VA_ADMIN_ALTA_ID_EXISTENTE'});
  assert.equal(t.inserts,0);assert.equal(t.rollbacks,1);
});
test('VA F6: duplicidad entre SELECT e INSERT sigue protegida por PK',async()=>{
  const t=makeFixture({feature:true,duplicateDriver:true});
  await assert.rejects(svc.createPc_uni(req,payload('2286'),t.deps),{code:'VA_ADMIN_ALTA_ID_EXISTENTE'});
  assert.equal(t.inserts,0);assert.equal(t.rollbacks,1);
});
test('VA F6: fallo de auditoria revierte la fila creada',async()=>{
  const t=makeFixture({feature:true,auditFails:true});
  await assert.rejects(svc.createPc_uni(req,payload('2286'),t.deps),/AUDIT_DOWN/);
  assert.equal(t.commits,0);assert.equal(t.rollbacks,1);
  assert.equal(t.dbRows.has('2286'),false);
});
test('VA F6: panel de alta no comprime grilla y deshabilita Crear sin gate',()=>{
  const ui=read('modules/cobranza-uni/administracion/venta-adicional/venta-adicional.js');
  const css=read('modules/cobranza-uni/administracion/venta-adicional/venta-adicional.css');
  const main=read('modules/cobranza-uni/administracion/main/main.js');
  assert.match(ui,/canPrepareCreate=options\.canPrepareCreate===true/);
  assert.match(ui,/canCreate=canPrepareCreate && options\.canCreate===true/);
  for(const marker of ['data-pc-create-open','data-pc-create-form','data-pc-create-id',
    'data-pc-create-save','data-pc-create-check'])assert.ok(ui.includes(marker));
  assert.match(css,/\.cua-pc-create-panel\{width:min\(820px,100vw\)/);
  assert.match(css,/\.cua-pc-create-fields\{display:grid/);
  assert.match(main,/canPrepareCreate:response\.can_prepare_create===true/);
  assert.match(main,/canCreate:response\.can_create===true/);
});
test('VA F6: backend mantiene permisos MAIN + VER + EDITAR y rutas de alta con guard',()=>{
  const routes=read('backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.routes.js');
  assert.match(routes,/router\.post\('\/tablas\/pc\/registros\/validar-alta', \.\.\.guard/);
  assert.match(routes,/router\.post\('\/tablas\/pc\/registros', \.\.\.guard/);
  assert.match(routes,/can_prepare_create:canView && req\.viewerContext\?\.active !== true/);
  assert.match(routes,/can_create:canView && req\.viewerContext\?\.active !== true/);
  const code=read('backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.pc-create-service.js');
  assert.match(code,/authorizePcWrite_uni/);
  assert.match(code,/buildCobranzaProjectScopeSql_uni/);
  assert.match(code,/PC_ADMIN_GAS_CUTOVER_CONFIRMED/);
  assert.match(read('.gitignore'),/^\*\.sql$/m);
});
test('VA F6: proyecto pendiente de alta no se mezcla con hermanos en F5',()=>{
  const trial={...fields(),id_pc:'NUEVO',id_proyecto_cobranza:'100'};
  const related=pure.buildPcRelationPreview_uni({pageRows:[trial],
    identities:new Map([['NUEVO',identity]]),mpRows:mp,siblingRows:[sibling,trial],
    cutoffIso:'2026-10-23'});
  assert.equal(related.project_summary.projects,1);
  assert.equal(related.project_summary.adeudo,'348.00');
});

test('VA F6: GET /acceso entrega simulacion segun EDITAR, alta deshabilitada con GAS',async()=>{
  const src=read('backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.routes.js');
  const rights=require(dir+'cobranza-uni-administracion.permissions');
  const registrations=[];const guardFn=()=>{};
  let access=new Map(),cutover=false;
  const fakeRouter={get(path,...handlers){registrations.push({method:'GET',path,handlers});},
    patch(path,...handlers){registrations.push({method:'PATCH',path,handlers});},
    post(path,...handlers){registrations.push({method:'POST',path,handlers});},use(){}};
  const mod={exports:{}};
  vm.runInNewContext(src,{module:mod,exports:mod.exports,require:name=>{
    if(name==='express')return {Router:()=>fakeRouter};
    if(name==='../../middleware/information-access-gnral.middleware')return {humanInformationGuard_gnral:()=>[guardFn]};
    if(name==='../../services/permissions/effective-permission.service')return {
      listEffectivePermissions:async()=>access};
    if(name.endsWith('.constants'))return contract;
    if(name.endsWith('.permissions'))return rights;
    if(name.endsWith('.gc-service'))return {listGestionCredito_uni(){}};
    if(name.endsWith('.gc-edit-service'))return {updateSingleGc_uni(){},updateMultiGc_uni(){}};
    if(name.endsWith('.pc-service'))return {listVentaAdicionalAdmin_uni(){}};
    if(name.endsWith('.pc-edit-validation'))return {PHASE3_SAFE_FIELDS_UNI:[]};
    if(name.endsWith('.pc-edit-service'))return {
      pcEditFeatureEnabled_uni:()=>false,updateSinglePc_uni(){},updateMultiPc_uni(){}};
    if(name.endsWith('.pc-create-service'))return {createGateEnabled_uni:()=>cutover,
      preflightCreatePc_uni:async()=>({ok:true,mode:'preview_only'}),
      createPc_uni:async()=>({ok:true,created:true})};
    throw Error('Sin mock: '+name);
  }});
  const handler=registrations.find(x=>x.method==='GET'&&x.path==='/tablas/:tabla/acceso').handlers.at(-1);
  const response=()=>({status(n){this.statusCode=n;return this;},json(x){return {status:this.statusCode||200,data:x};}});
  access=new Map([[rights.TABLE_PERMISSIONS.pc.view,true],[rights.TABLE_PERMISSIONS.pc.edit,true]]);
  let res=await handler({...req,params:{tabla:'pc'}},response(),err=>{throw err});
  assert.equal(res.data.can_prepare_create,true);assert.equal(res.data.can_create,false);
  assert.equal(res.data.can_edit,false);
  cutover=true;
  res=await handler({...req,params:{tabla:'pc'}},response(),err=>{throw err});
  assert.equal(res.data.can_prepare_create,true);assert.equal(res.data.can_create,true);
  res=await handler({...req,viewerContext:{active:true},params:{tabla:'pc'}},response(),err=>{throw err});
  assert.equal(res.data.can_prepare_create,false);assert.equal(res.data.can_create,false);
  access=new Map([[rights.TABLE_PERMISSIONS.pc.view,true]]);
  res=await handler({...req,params:{tabla:'pc'}},response(),err=>{throw err});
  assert.equal(res.data.can_prepare_create,false);assert.equal(res.data.can_create,false);
  for(const action of ['/tablas/pc/registros/validar-alta','/tablas/pc/registros']){
    const entry=registrations.find(x=>x.method==='POST'&&x.path===action);
    assert.ok(entry);assert.ok(entry.handlers.includes(guardFn));
  }
});

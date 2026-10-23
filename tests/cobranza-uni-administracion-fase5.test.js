'use strict';
// [BLT NOW | 2026-10-23 | COBRANZA_UNI_ADMINISTRACION_FASE_5_V001]
// Pruebas deterministas sin Aiven, sin cambios de BD ni HTTP productivo.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname,'..');
const backend = '../backend/src/modules/cobranza-uni-administracion/';
const contracts=require(backend+'cobranza-uni-administracion.constants');
const formula=require(backend+'cobranza-uni-administracion.gc-formulas');
const validation=require(backend+'cobranza-uni-administracion.gc-edit-validation');
const permissions=require(backend+'cobranza-uni-administracion.permissions');
const read = file => fs.readFileSync(path.join(root,file),'utf8');

const baseRow=(overrides={})=>({
  id_gc:'9007199254740993',id_proyecto_cobranza:'7',
  idns:'U1',proyecto:'CASA ALFA',cliente:'C1',
  categoria:'Residencial',recuento_no_equipos:5,
  montp_mp:'199.95',monto_va:'0.05',adeudo:'200.00',
  facturas_mp:1,facturas_va:0,facts_adeudadas:1,
  credito_para_va:'30000.00',credito_disponible_venta:'29800.00',
  suministro:'SUMINISTRO',nivel_riesgo_credito:'BAJO',anticipo:'NO',
  ...overrides
});
const find=(result,field)=>result.changes.find(x=>x.field===field);
const next=(row,field,value)=>({ ...row,[field]:value,...formula.deriveForChange_uni(row,field,value).patch});

function svcMock(){
  const module={exports:{}};
  const source=read('backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.gc-edit-service.js');
  const fakeRequire=(n)=>{
    if(n==='../../config/db')return {getConnection(){throw Error('No conectar Aiven');}};
    if(n==='../../services/cobranza-uni-scope.service')return {
      buildCobranzaProjectScopeSql_uni:()=>'(gc.id_gc>0)',
      canonicalProjectSql_uni:()=>'(gc.proyecto IS NOT NULL)'
    };
    if(n==='../../services/permissions/effective-permission.service')return {
      listEffectivePermissions:async()=>new Map()
    };
    if(n.endsWith('gc-edit-audit'))return {recordGcCell_uni:async()=>{throw Error('Auditoria no simulada');}};
    if(n.endsWith('gc-sync-guard'))return {markManualEdit_uni:async()=>{throw Error('Guard sin simular');}};
    if(n.endsWith('gc-edit-validation'))return validation;
    if(n.endsWith('gc-formulas'))return formula;
    if(n.endsWith('constants'))return contracts;
    if(n.endsWith('permissions'))return permissions;
    throw Error('Dependencia inesperada: '+n);
  };
  vm.runInNewContext(source,{module,exports:module.exports,require:fakeRequire,BigInt,Object,Set});
  return module.exports;
}
const service=svcMock();
const req={user:{id_SB:70},contextUser:{id_SB:70},viewerContext:{active:false},informationAccess:{
  empresa:'UNITED',acceso_puerta:true,effective_user_id:70
}};
const resolver=async()=>new Map([
  [permissions.MAIN_VISUAL,true],
  [permissions.TABLE_PERMISSIONS.gestion_credito.view,true],
  [permissions.TABLE_PERMISSIONS.gestion_credito.edit,true]
]);

function txMock(records,config={}){
  const rows=structuredClone(Object.fromEntries(records.map(r=>[r.id_gc,r])));
  const state={commit:0,rollback:0,audits:[],updates:[],locked:0};
  let snapshot;
  const conn={
    async beginTransaction(){snapshot=structuredClone(rows);},
    async commit(){state.commit++;},
    async rollback(){state.rollback++;for(const id of Object.keys(rows))delete rows[id];
      Object.assign(rows,structuredClone(snapshot));},
    release(){throw Error('Tests no deben liberar conexiones ajenas');},
    async query(sql,params){
      if(/FOR UPDATE$/.test(sql)){
        state.locked++;
        const id=String(params[0]);return [rows[id]?[{...rows[id]}]:[]];
      }
      if(sql.startsWith('UPDATE `gestion_credito` gc SET ')){
        const update=sql.split(' WHERE ')[0];
        const fields=[...update.matchAll(/gc\.\`([^`]+)\` = \?/g)].map(m=>m[1]);
        assert.ok(fields.length>0);
        assert.equal(fields.length+1,params.length);
        assert.equal(new Set(fields).size,fields.length);
        assert.ok(contracts.GC_EDITABLE_FIELDS_UNI.includes(fields[0]));
        fields.slice(1).forEach(field=>assert.ok(contracts.GC_DERIVED_FIELDS_UNI.includes(field)));
        assert.match(sql,/WHERE gc\.\`id_gc\` = \? AND \(\(gc\.id_gc>0\)\)$/);
        const id=String(params[params.length-1]);
        if(!rows[id])return [{affectedRows:0}];
        fields.forEach((name,index)=>rows[id][name]=params[index]);
        state.updates.push({id,fields});
        return [{affectedRows:1}];
      }
      if(sql.includes(' IS NOT NULL LIMIT 1')){
        const id=String(params[0]);return [rows[id]&&config.projectValid!==false?[{id_gc:id}]:[]];
      }
      throw Error('SQL no simulado: '+sql);
    }
  };
  const auditRecorder=async(_req,change,executor)=>{
    assert.equal(executor,conn);
    if(config.rejectAudit)throw Error('Auditoria rechazada');
    assert.equal(change.id,String(change.id));
    assert.ok(Array.isArray(change.derived_changes));
    state.audits.push(change);
  };
  return {rows,state,deps:{connection:conn,scopeBuilder:()=>'(gc.id_gc>0)',
    auditRecorder,protectionRecorder:async()=>{},permissionResolver:resolver,scopeService:{canonicalProjectSql_uni:()=>'(gc.proyecto IS NOT NULL)'}}};
}

test('F5: 7 formulas y orden topologico aprobado',()=>{
  assert.equal(contracts.GC_DERIVED_FIELDS_UNI.length,7);
  assert.deepEqual([...formula.ORDER],['adeudo','facts_adeudadas','credito_para_va',
    'nivel_riesgo_credito','suministro','credito_disponible_venta','anticipo']);
  const index=new Map(formula.ORDER.map((f,i)=>[f,i]));
  for(const [field,deps] of Object.entries(contracts.GC_DERIVED_DEPENDENCIES_UNI)){
    for(const dep of deps)if(index.has(dep))assert.ok(index.get(dep)<index.get(field),field);
  }
});

test('F5: credito por categoria y umbral exacto de 5 equipos, nombres actuales',()=>{
  const cases=[
    ['Residencial',15000,30000],['Comercial',50000,80000],
    ['Oficinas',50000,80000],['Hotel',50000,80000],
    ['Hospital',50000,80000],['Fábrica',50000,80000],
    ['Aeropuerto',50000,80000],['Otro',10000,30000],
    ['MIXTO',10000,40000],['ESCUELA',10000,30000]
  ];
  for(const [category,low,high] of cases){
    const row=baseRow({categoria:category,recuento_no_equipos:4});
    assert.equal(next(row,'recuento_no_equipos','4').credito_para_va,`${low}.00`);
    const atFour=formula.deriveForChange_uni(row,'categoria',category+' ');
    assert.equal(atFour.patch.credito_para_va,`${low}.00`,category);
    const atFive=formula.deriveForChange_uni(row,'recuento_no_equipos','5');
    const withKnownHigh=formula.deriveForChange_uni({...row,categoria:category,credito_para_va:'0.00'},'recuento_no_equipos','5');
    assert.equal(withKnownHigh.patch.credito_para_va,`${high}.00`,category);
    assert.ok(atFive); // cambio mismo valor (engine pura) sin dependencia de editar UI
  }
  assert.equal(formula.deriveForChange_uni(baseRow({categoria:' fabrica ',recuento_no_equipos:2}),
    'recuento_no_equipos','5').patch.credito_para_va,'80000.00');
});

test('F5: adeudo exacto en centavos, disponible negativo y suministro al exceder limite',()=>{
  const a=next(baseRow(),'monto_va','30000.10');
  assert.equal(a.adeudo,'30200.05');
  assert.equal(a.suministro,'NO SUMINISTRO');
  assert.equal(a.credito_disponible_venta,'-200.05');
  assert.equal(a.facts_adeudadas,1); // otra rama no se toca
  assert.equal(a.credito_para_va,'30000.00');
  const b=next(baseRow(),'monto_va','29800.05');
  assert.equal(b.adeudo,'30000.00');
  assert.equal(b.suministro,'SUMINISTRO'); // V=Z mantiene suministro
  assert.equal(b.credito_disponible_venta,'0.00');
  assert.equal(formula.money_uni(999999999999999999n,'adeudo'),'9999999999999999.99');
});

test('F5: riesgo 0,1 BAJO; 2 MEDIO; 3+ ALTO con anticipo SI/NO',()=>{
  const base=baseRow({facturas_mp:0,facturas_va:0,facts_adeudadas:0});
  for(const [count,risk,advance] of [[0,'BAJO','NO'],[1,'BAJO','NO'],
    [2,'MEDIO','SI'],[3,'ALTO','SI'],[100,'ALTO','SI']]){
    const row=next(base,'facturas_mp',String(count));
    assert.equal(String(row.facts_adeudadas),String(count));
    assert.equal(row.nivel_riesgo_credito,risk);
    assert.equal(row.anticipo,advance);
  }
  assert.equal(formula.labelRisk_uni(2n),'MEDIO');
  assert.equal(formula.labelRisk_uni(3n),'ALTO');
});

test('F5: rama de facturas no reescribe importes y viceversa',()=>{
  const row=baseRow();
  const count=formula.deriveForChange_uni(row,'facturas_va','3');
  assert.deepEqual(Object.keys(count.patch).sort(),
    ['facts_adeudadas','nivel_riesgo_credito','anticipo'].sort());
  const amount=formula.deriveForChange_uni(row,'monto_va','20000.00');
  assert.deepEqual(Object.keys(amount.patch).sort(),
    ['adeudo','credito_disponible_venta'].sort()); // suministro sigue 'SUMINISTRO'
  assert.deepEqual(Object.keys(formula.deriveForChange_uni(row,'cliente','Nuevo').patch),[]);
});

test('F5: celdas vacias suman cero sin inventar una categoria de credito',()=>{
  const row=baseRow({categoria:'Sin categoría',credito_para_va:'30000.00',
    monto_va:null,montp_mp:null,facturas_mp:null,facturas_va:null});
  const result=formula.deriveForChange_uni(row,'categoria','Sin categoría ');
  assert.equal(result.patch.credito_para_va,null);
  assert.equal(result.patch.suministro,null);
  assert.equal(result.patch.credito_disponible_venta,null);
  assert.equal(result.warnings.length,1);
  assert.equal(result.warnings[0].code,'CATEGORIA_SIN_REGLA');
  assert.equal(next(row,'monto_va','0.01').adeudo,'0.01');
  assert.equal(next(row,'facturas_va','2').facts_adeudadas,'2');
});

test('F5: comprobacion de rangos y datos invalidos rechaza antes de UPDATE',()=>{
  const tooBig=baseRow({montp_mp:'9999999999999999.99',monto_va:'0.00'});
  assert.throws(()=>formula.deriveForChange_uni(tooBig,'monto_va','0.01'),
    {code:'GC_ADMIN_CALCULO_FUERA_RANGO',statusCode:422});
  const bigInt=baseRow({facturas_mp:2147483647,facturas_va:0});
  assert.throws(()=>formula.deriveForChange_uni(bigInt,'facturas_va','1'),
    {code:'GC_ADMIN_CALCULO_FUERA_RANGO',statusCode:422});
  assert.throws(()=>formula.deriveForChange_uni(baseRow({montp_mp:'abc'}),'monto_va','1.00'),
    {code:'GC_ADMIN_ORIGEN_NUMERICO_INVALIDO',statusCode:422});
  assert.throws(()=>formula.deriveForChange_uni(baseRow({recuento_no_equipos:'abc'}),'categoria','Hotel'),
    {code:'GC_ADMIN_ORIGEN_NUMERICO_INVALIDO',statusCode:422});
});

test('F5: no recalcular por origen sin cambios ni permitir entrada directa a derivados',()=>{
  const calc=formula.deriveForChange_uni(baseRow(),'monto_va','0.05');
  assert.equal(calc.changes.length,0);
  assert.throws(()=>formula.deriveForChange_uni(baseRow(),'adeudo','999.00'));
  assert.throws(()=>validation.normalizeEdited_uni('anticipo','SI'),{code:'GC_ADMIN_CAMPO_PROTEGIDO'});
});

test('F5: PATCH de monto persiste campos dependientes en un solo UPDATE y auditoria',async()=>{
  const {rows,state,deps}=txMock([baseRow()]);
  const result=await service.updateSingleGc_uni(req,'9007199254740993',{
    changes:{monto_va:'30000.10'},expected:{monto_va:'0.05'}
  },deps);
  const changed=rows['9007199254740993'];
  assert.equal(state.commit,1);assert.equal(state.rollback,0);
  assert.equal(state.updates.length,1);assert.equal(state.audits.length,1);
  assert.deepEqual(state.updates[0].fields.sort(),
    ['monto_va','adeudo','credito_disponible_venta','suministro'].sort());
  assert.equal(changed.adeudo,'30200.05');
  assert.equal(changed.suministro,'NO SUMINISTRO');
  assert.equal(changed.credito_disponible_venta,'-200.05');
  assert.equal(result.calculated,3);
  assert.deepEqual(state.audits[0].derived_changes.map(c=>c.field).sort(),
    ['adeudo','suministro','credito_disponible_venta'].sort());
  assert.equal(find({changes:state.audits[0].derived_changes},'adeudo').before,'200.00');
  assert.equal(find({changes:state.audits[0].derived_changes},'adeudo').after,'30200.05');
});

test('F5: cambios de categoria actualizan credito y suministro; idns no activa formulas',async()=>{
  const {rows,state,deps}=txMock([baseRow()]);
  let result=await service.updateSingleGc_uni(req,'9007199254740993',{
    changes:{categoria:'Comercial'},expected:{categoria:'Residencial'}
  },deps);
  assert.equal(result.calculated,2); // credito_para_va y disponible, suministro igual
  assert.equal(rows['9007199254740993'].credito_para_va,'80000.00');
  assert.equal(rows['9007199254740993'].credito_disponible_venta,'79800.00');
  assert.equal(rows['9007199254740993'].suministro,'SUMINISTRO');
  result=await service.updateSingleGc_uni(req,'9007199254740993',{
    changes:{idns:'U2'},expected:{idns:'U1'}
  },deps);
  assert.equal(result.calculated,0);
  assert.equal(state.updates[1].fields.length,1);
  assert.equal(state.audits[1].derived_changes.length,0);
});

test('F5: lote calcula por fila (equipo 4 versus 5) y audita cada actualizacion',async()=>{
  const r1=baseRow();
  const r2=baseRow({id_gc:'9007199254740994',recuento_no_equipos:2,
    credito_para_va:'15000.00',credito_disponible_venta:'14800.00'});
  const {rows,state,deps}=txMock([r1,r2]);
  const result=await service.updateMultiGc_uni(req,{
    ids:[r2.id_gc,r1.id_gc],changes:{categoria:'Comercial'},
    expected:{[r1.id_gc]:{categoria:'Residencial'},[r2.id_gc]:{categoria:'Residencial'}}
  },deps);
  assert.equal(result.changed,2);assert.equal(result.calculated,4);
  assert.equal(rows[r1.id_gc].credito_para_va,'80000.00');
  assert.equal(rows[r2.id_gc].credito_para_va,'50000.00');
  assert.equal(state.updates.length,2);
  assert.equal(state.audits.length,2);assert.equal(state.commit,1);
});

test('F5: segundo registro sin dato numerico valido aborta lote completo',async()=>{
  const r1=baseRow();
  const r2=baseRow({id_gc:'9007199254740994',facturas_mp:'X'});
  const {rows,state,deps}=txMock([r1,r2]);
  await assert.rejects(service.updateMultiGc_uni(req,{
    ids:[r1.id_gc,r2.id_gc],changes:{facturas_va:'2'},
    expected:{[r1.id_gc]:{facturas_va:0},[r2.id_gc]:{facturas_va:0}}
  },deps),{code:'GC_ADMIN_ORIGEN_NUMERICO_INVALIDO',statusCode:422});
  assert.equal(state.commit,0);assert.equal(state.rollback,1);
  assert.equal(rows[r1.id_gc].facturas_va,0); // restaurado
});

test('F5: error de auditoria impide confirmar formulas',async()=>{
  const baseline=baseRow();
  const {rows,state,deps}=txMock([baseline],{rejectAudit:true});
  await assert.rejects(service.updateSingleGc_uni(req,baseline.id_gc,{
    changes:{monto_va:'1.00'},expected:{monto_va:'0.05'}
  },deps),/Auditoria rechazada/);
  assert.equal(state.commit,0);assert.equal(state.rollback,1);
  assert.equal(rows[baseline.id_gc].monto_va,'0.05');
  assert.equal(rows[baseline.id_gc].adeudo,'200.00');
});

test('F5: origen desactualizado sigue rechazando con 409 y cero recálculos',async()=>{
  const row=baseRow();const {state,deps}=txMock([row]);
  await assert.rejects(service.updateSingleGc_uni(req,row.id_gc,{
    changes:{facturas_va:'2'},expected:{facturas_va:9}
  },deps),{code:'GC_ADMIN_CONFLICTO_CONCURRENCIA'});
  assert.equal(state.updates.length,0);assert.equal(state.commit,0);assert.equal(state.rollback,1);
});

test('F5: categoria no soportada se guarda NULL con aviso, NO credito inventado',async()=>{
  const row=baseRow();const {rows,state,deps}=txMock([row]);
  const result=await service.updateSingleGc_uni(req,row.id_gc,{
    changes:{categoria:'Industrial'},expected:{categoria:'Residencial'}
  },deps);
  assert.equal(rows[row.id_gc].credito_para_va,null);
  assert.equal(rows[row.id_gc].credito_disponible_venta,null);
  assert.equal(rows[row.id_gc].suministro,null);
  assert.equal(result.calculated,3);assert.equal(result.warnings.length,1);
  assert.equal(state.audits[0].derived_changes.length,3);
});

test('F5: UI indica recálculo y route HTTP conoce errores de formula 422',()=>{
  const routes=read('backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.routes.js');
  const ui=read('modules/cobranza-uni/administracion/gestion-credito/gestion-credito.js');
  const audit=read('backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.gc-edit-audit.js');
  assert.match(routes,/413,422/);
  assert.match(ui,/response\?\.calculated/);
  assert.match(ui,/categoría sin regla/);
  assert.match(audit,/derived_changes/);
  assert.doesNotMatch(ui,/se incorporan en Fase 5/);
});

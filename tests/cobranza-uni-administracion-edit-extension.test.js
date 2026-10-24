'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const dir='../backend/src/modules/cobranza-uni-administracion/';
const source=fs.readFileSync(path.resolve(__dirname,
  '../backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.pc-derived-write.js'),'utf8');
const mod={exports:{}};
vm.runInNewContext(source,{module:mod,exports:mod.exports,Buffer,require:name=>{
  if(name==='../../services/cobranza-uni-scope.service')return {};
  if(name==='../../services/cobranza-uni/identidad-proyecto.service')return {};
  if(name.endsWith('.pc-relations-service'))return {};
  if(name.endsWith('.pc-edit-audit'))return {};
  if(name.endsWith('.constants'))return require(dir+'cobranza-uni-administracion.constants');
  if(name.endsWith('.pc-edit-validation'))return require(dir+'cobranza-uni-administracion.pc-edit-validation');
  if(name.endsWith('.pc-formulas'))return require(dir+'cobranza-uni-administracion.pc-formulas');
  throw Error('Dependencia no simulada: '+name);
}});
const {persistPcDerivedAfterEdit_uni}=mod.exports;
const {PHASE3_SAFE_FIELDS_UNI,inputValue_uni}=require(
  dir+'cobranza-uni-administracion.pc-edit-validation');
const {PHASE4_SAFE_FIELDS_MP_UNI}=require(
  dir+'cobranza-uni-administracion.mp-edit-validation');
const {INVOICE_FIELDS_MP_UNI}=require(
  dir+'cobranza-uni-administracion.mp-zona1-validation');
const C=require(dir+'cobranza-uni-administracion.constants');
const gridMod={exports:{}};
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,
  '../backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.mp-zona1-grid.js'),'utf8'),
{module:gridMod,exports:gridMod.exports,require:name=>{
  if(name==='../../config/db')return {};
  if(name==='../../services/cobranza-uni-scope.service')return {};
  if(name.endsWith('.constants'))return C;
  throw Error('Dependencia no simulada: '+name);
},Buffer,Date,BigInt,Set,Map});
const GRID=gridMod.exports;

test('VA, MP y Zona 1 incluyen todos los campos manuales; protegen IDs y derivados',()=>{
  assert.equal(PHASE3_SAFE_FIELDS_UNI.length,15);
  assert.equal(PHASE4_SAFE_FIELDS_MP_UNI.length,11);
  assert.equal(INVOICE_FIELDS_MP_UNI.length,124);
  for(const name of ['proyecto','cliente','ov','fecha_ov','precio_venta','tipo_pago',
    'no_factura','fecha_factura'])assert.ok(PHASE3_SAFE_FIELDS_UNI.includes(name),name);
  for(const name of ['proyecto','idns','cliente','estado','z_oper','estatus_cartera'])
    assert.ok(PHASE4_SAFE_FIELDS_MP_UNI.includes(name),name);
  for(const name of ['proyecto','idns','cliente','iguala','fecha_factura_01',
    'numero_factura_12'])assert.ok(INVOICE_FIELDS_MP_UNI.includes(name),name);
  for(const name of ['id_pc','id_proyecto_cobranza','venta_total','adeudo'])
    assert.ok(!PHASE3_SAFE_FIELDS_UNI.includes(name),name);
  for(const name of ['id_dmp','id_proyecto_cobranza','monto_anual','iguala'])
    assert.ok(!PHASE4_SAFE_FIELDS_MP_UNI.includes(name),name);
  for(const name of ['id_mp_zona_1','id_dmp','created_at','updated_at'])
    assert.ok(!INVOICE_FIELDS_MP_UNI.includes(name),name);
  assert.equal(inputValue_uni('precio_venta','1.5'),'1.50');
  assert.throws(()=>inputValue_uni('precio_venta','1.234'),
    {code:'VA_ADMIN_IMPORTE_INVALIDO'});
});

test('VA guarda capturas y derivados locales/relacionales usando el mismo ejecutor',async()=>{
  const row={id_pc:'2041',proyecto:'OBRA',id_proyecto_cobranza:'71',
    cliente:'CLIENTE',fecha_ov:'2026-10-01',precio_venta:'100.00',
    tipo_pago:'FACTURA',fecha_factura:'2026-10-01',
    estatus_administrativo:'Abierta',terminos:'30'};
  const calls=[],audits=[];
  const conn={async query(sql,params){
    calls.push({sql,params});
    if(sql.includes(' IN (?)'))return [[row]];
    if(sql.includes('LIMIT ? FOR UPDATE'))return [[row]];
    if(sql.startsWith('UPDATE'))return [{affectedRows:1}];
    throw Error('SQL inesperado: '+sql);
  }};
  const identityResolver={
    async resolverIdentidadProyecto_uni(){return {valido:true};},
    construirFiltroIdentidadProyecto_uni(){return {protegido:true,sql:'pc.`id_pc` = 2041',params:[]};}
  };
  const relation={mode:'preview_only',project_summary:{complete:1,incomplete:0},
    rows:[{id_pc:'2041',warnings:[],values:{terminos:'30',zona_operativa:'NORTE',
      estado:'MX',estatus_cartera:'Activo',facturas_pendientes_pago:0,adeudo:'0.00'}}],
    formula_rows:[{...row,terminos:'30'}]};
  const result=await persistPcDerivedAfterEdit_uni(conn,{},[{
    id:'2041',field:'precio_venta',actor:5
  }],{
    scopeBuilder:()=> '1=1',identityResolver,
    relationsPreview:async(_req,executor,rows,cutoff,deps)=>{
      assert.equal(executor,conn);assert.equal(rows.length,1);
      assert.equal(cutoff,'2026-10-23');
      assert.equal(deps.siblingRowsOverride,rows);
      return relation;
    },
    now:new Date('2026-10-23T15:00:00Z'),
    auditRecorder:async(_req,change,executor)=>{
      assert.equal(executor,conn);audits.push(change);
    }
  });
  assert.equal(result.projects,1);
  assert.ok(result.calculated>=10);
  assert.ok(calls.some(call=>call.sql.startsWith('UPDATE `pc` pc SET')&&
    call.sql.includes('`venta_total`')));
  assert.ok(audits.some(audit=>audit.operation==='derived'&&
    audit.derived_changes.some(change=>change.field==='venta_total')));
});

test('Zona 1 muestra identidad desajustada solo en modo reparación con scope y FK',async()=>{
  const req={informationAccess:{empresa:'UNITED',acceso_puerta:true},query:{}};
  const verified={territorial:'mp.`id_dmp` = 41',canonical:'mp.`id_proyecto_cobranza`'};
  const normal=GRID.buildGridSql_uni(GRID.parseGridParams_uni({}),verified);
  const repair=GRID.buildGridSql_uni(GRID.parseGridParams_uni({}),verified,true);
  assert.match(normal.countSql,/UPPER\(TRIM\(mp\.`idns`\)\)/);
  assert.doesNotMatch(repair.countSql,/UPPER\(TRIM\(mp\.`idns`\)\)/);
  assert.match(repair.countSql,/mp\.`id_dmp` = z\.`id_dmp`/);
  assert.match(repair.selectSql,/CASE WHEN/);
  const row=Object.fromEntries(C.MP_ZONE1_COLUMNS_UNI.map(column=>[column.name,null]));
  Object.assign(row,{id_mp_zona_1:'9',id_dmp:'41',proyecto:'P',idns:'VIEJO',identity_match:0});
  const queries=[];
  const conn={async query(sql){queries.push(sql);
    return sql.startsWith('SELECT COUNT')?[[{total:1}]]:[[row]];
  }};
  const result=await GRID.listMpZona1Grid_uni(req,{repairMode:true,connection:conn,
    scopeBuilder:()=>verified.territorial,
    scopeService:{canonicalProjectSql_uni:()=>verified.canonical}});
  assert.equal(result.scope_verified,true);
  assert.equal(result.identity_verified,false);
  assert.equal(result.rows[0].repair_only,true);
  assert.equal(result.rows[0].identity_match,undefined);
  assert.equal(queries.length,2);
});

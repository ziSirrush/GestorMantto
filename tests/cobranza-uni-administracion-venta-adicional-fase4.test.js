'use strict';
// [BLT NOW | 2026-10-23 | COBRANZA_UNI_VA_ADMIN_FASE_4_V001]
// Pruebas deterministas, sin Aiven, sin GAS y sin archivos ignorados.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
// F5: mock de lecturas relaciones para aislar el contrato F2/F4.
const mockPcRelationsF5_uni=async (_req,_conn,rows,cutoff)=>({
  source:'relaciones_aiven',mode:'preview_only',as_of:cutoff,
  rows:rows.map(row=>({id_pc:String(row.id_pc),values:{},warnings:[]})),
  fields:['terminos','zona_operativa','estado','estatus_cartera','adeudo','facturas_pendientes_pago'],
  project_summary:{projects:0,complete:0,incomplete:0},formula_rows:rows
});

const BASE=path.resolve(__dirname,'..');
const file=name=>fs.readFileSync(path.join(BASE,name),'utf8');
const f=require('../backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.pc-formulas');
const c=require('../backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.constants');
const q=require('../backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.pc-query');
const cutoff='2026-10-23';
const row={
  id_pc:'2284',fecha_ov:'2026-10-13',precio_venta:'100.00',tipo_pago:'FACTURA',
  estatus_administrativo:'Abierta',fecha_factura:'2026-10-13',terminos:'0',
  fecha_vencimiento:'2026-10-13',dias_vencimiento:0,estatus:'CORRIENTE',
  zona_operativa:'NORESTE',estado:'NL',estatus_cartera:'Activo',
  facturas_pendientes_pago:4,adeudo:'464.00'
};
const calc=(over={},date=cutoff)=>f.calculatePcLocal_uni({...row,...over},date);

test('VA F4: ocho formulas locales exactas, sin invadir seis derivados de relaciones',()=>{
  assert.deepEqual(f.PC_LOCAL_FORMULA_FIELDS_UNI,[
    'mes_ov','pagado_iva','no_pagado_iva','venta_total',
    'mes_factura','fecha_vencimiento','dias_vencimiento','estatus'
  ]);
  assert.equal(c.PC_DERIVED_FIELDS_UNI.length,14);
  for(const name of f.PC_LOCAL_FORMULA_FIELDS_UNI) assert.ok(c.PC_DERIVED_FIELDS_UNI.includes(name),name);
  const local=new Set(f.PC_LOCAL_FORMULA_FIELDS_UNI);
  assert.deepEqual(c.PC_DERIVED_FIELDS_UNI.filter(name=>!local.has(name)),[
    'facturas_pendientes_pago','adeudo','terminos','zona_operativa','estado','estatus_cartera'
  ]);
});

test('VA F4: CDMX calcula fecha civil sin desplazamiento UTC',()=>{
  assert.equal(f.TIME_ZONE_UNI,'America/Mexico_City');
  assert.equal(f.todayMexicoCity_uni(new Date('2026-10-24T04:59:59Z')),'2026-10-23');
  assert.equal(f.todayMexicoCity_uni(new Date('2026-10-24T06:00:00Z')),'2026-10-24');
  assert.equal(f.todayMexicoCity_uni(new Date('2026-01-01T04:30:00Z')),'2025-12-31');
  assert.throws(()=>f.todayMexicoCity_uni('INVALID'),TypeError);
});

test('VA F4: meses es-MX de Sheets, febrero bisiesto, sin fechas falsas',()=>{
  assert.equal(calc().values.mes_ov,'oct-26');
  assert.equal(calc({fecha_ov:'2024-02-29',fecha_factura:'2026-09-01'}).values.mes_ov,'feb-24');
  assert.equal(calc({fecha_factura:'2026-09-01'}).values.mes_factura,'sep-26');
  assert.equal(calc({fecha_ov:null,fecha_factura:null}).values.mes_ov,null);
  assert.equal(f.dateIso_uni('2026-02-29'),null);
  assert.equal(f.dateIso_uni('2024-02-29').iso,'2024-02-29');
  assert.equal(f.dateIso_uni('0000-00-00'),null);
});

test('VA F4: IVA 16% y RECIBO sin IVA, con DECIMAL exacto',()=>{
  assert.equal(calc().values.venta_total,'116.00');
  assert.equal(calc({tipo_pago:' recibo '}).values.venta_total,'100.00');
  assert.equal(calc({tipo_pago:'Recibo',precio_venta:'0.99'}).values.venta_total,'0.99');
  assert.equal(calc({precio_venta:'0.03'}).values.venta_total,'0.03');
  assert.equal(calc({precio_venta:'0.04'}).values.venta_total,'0.05');
  assert.equal(calc({precio_venta:'10.13'}).values.venta_total,'11.75');
  assert.equal(calc({precio_venta:'-10.13'}).values.venta_total,'-11.75');
  assert.equal(calc({precio_venta:'123456789012345.67',tipo_pago:'RECIBO'}).values.venta_total,'123456789012345.67');
});

test('VA F4: pagado IVA y no pagado IVA dependen de W, no de V',()=>{
  const opened=calc();
  assert.equal(opened.values.pagado_iva,'0.00');
  assert.equal(opened.values.no_pagado_iva,'116.00');
  const paid=calc({estatus_administrativo:'PAGADO POR COMPLETO'});
  assert.equal(paid.values.pagado_iva,'116.00');
  assert.equal(paid.values.no_pagado_iva,'0.00');
  const cancelled=calc({estatus_administrativo:'Cancelada'});
  assert.equal(cancelled.values.pagado_iva,'0.00');
  assert.equal(cancelled.values.no_pagado_iva,'0.00');
  assert.equal(calc({estatus:'VENCIDO',estatus_administrativo:'por facturar'}).values.pagado_iva,'0.00');
});

test('VA F4: plazo cero, factura 2284, corte 2026-10-23 -> 10 dias VENCIDO',()=>{
  const result=calc();
  assert.equal(result.values.fecha_vencimiento,'2026-10-13');
  assert.equal(result.values.dias_vencimiento,10);
  assert.equal(result.values.estatus,'VENCIDO');
  assert.deepEqual(result.warnings,[]);
});

test('VA F4: diferentes plazos y dias negativos/futuros',()=>{
  const result=calc({terminos:'30',fecha_factura:'2026-10-01'});
  assert.equal(result.values.fecha_vencimiento,'2026-10-31');
  assert.equal(result.values.dias_vencimiento,-8);
  assert.equal(result.values.estatus,'CORRIENTE');
  assert.equal(calc({terminos:'45',fecha_factura:'2026-09-01'}).values.fecha_vencimiento,'2026-10-16');
  assert.equal(calc({terminos:'60',fecha_factura:'2026-08-01'}).values.fecha_vencimiento,'2026-09-30');
  assert.equal(calc({terminos:'15',fecha_factura:'2026-09-30'}).values.fecha_vencimiento,'2026-10-15');
  assert.equal(calc({terminos:'120',fecha_factura:'2026-06-01'}).values.fecha_vencimiento,'2026-09-29');
  assert.equal(calc({terminos:'30',fecha_factura:'2026-09-23'}).values.dias_vencimiento,0);
});

test('VA F4: pagadas, canceladas y por facturar no generan dias vencidos',()=>{
  for(const estatus of ['pagado por completo','CANCELADA','Por Facturar','En crédito']){
    const r=calc({estatus_administrativo:estatus,fecha_factura:'2026-01-01',terminos:'0'});
    assert.equal(r.values.dias_vencimiento,0,estatus);
    assert.equal(r.values.estatus,'CORRIENTE',estatus);
    assert.equal(r.values.fecha_vencimiento,'2026-01-01',estatus);
  }
});

test('VA F4: fecha_factura NULL impide fecha 1899-12-30 y conserva alerta',()=>{
  for(const invoice of [null,'']){
    const result=calc({fecha_factura:invoice,fecha_vencimiento:'1899-12-30'});
    assert.equal(result.values.fecha_vencimiento,null);
    assert.equal(result.values.mes_factura,null);
    assert.equal(result.values.dias_vencimiento,0);
    assert.equal(result.values.estatus,'CORRIENTE');
    assert.ok(result.warnings.includes('FECHA_FACTURA_AUSENTE'));
  }
});

test('VA F4: invalidez de datos impide inventar fechas, no bloquea consulta',()=>{
  const r=calc({fecha_ov:'2026-02-30',fecha_factura:'2026-02-29',terminos:'NETO 30',precio_venta:'NO_NUMERICO'});
  assert.equal(r.values.mes_ov,null);
  assert.equal(r.values.venta_total,null);
  assert.equal(r.values.fecha_vencimiento,null);
  assert.ok(r.warnings.includes('FECHA_OV_INVALIDA'));
  assert.ok(r.warnings.includes('FECHA_FACTURA_INVALIDA'));
  assert.ok(r.warnings.includes('PRECIO_VENTA_NO_CALCULABLE'));
  const t=calc({fecha_factura:'2026-10-01',terminos:'30 dias'});
  assert.equal(t.values.fecha_vencimiento,null);
  assert.ok(t.warnings.includes('TERMINOS_INVALIDOS_O_AUSENTES'));
});

test('VA F4: rango DECIMAL(18,2) protegido y tasas exactas',()=>{
  assert.equal(f.moneyToCents_uni('9999999999999999.99'),999999999999999999n);
  assert.equal(f.moneyToCents_uni('10000000000000000'),null);
  assert.equal(f.moneyToCents_uni('1.234'),null);
  assert.equal(calc({precio_venta:'9999999999999999.99'}).values.venta_total,null);
  assert.ok(calc({precio_venta:'9999999999999999.99'}).warnings.includes('PRECIO_IVA_EXCEDE_DECIMAL'));
});

test('VA F4: 31 campos originales sin mutacion; acumulados/terminos quedan F5',()=>{
  const frozen=Object.freeze({...row});
  const before=JSON.stringify(frozen);
  const result=f.calculatePcLocal_uni(frozen,cutoff);
  assert.equal(JSON.stringify(frozen),before);
  assert.equal(result.values.adeudo,undefined);
  assert.equal(result.values.facturas_pendientes_pago,undefined);
  assert.equal(result.values.terminos,undefined);
  assert.equal(result.values.estado,undefined);
  assert.equal(result.values.estatus_cartera,undefined);
  assert.equal(Object.isFrozen(result.values),true);
  assert.equal(Object.isFrozen(result.warnings),true);
});

test('VA F4: preview 100 registros, una unica fecha de corte, ID BIGINT textual',()=>{
  const arr=Array.from({length:100},(_,i)=>({
    ...row,id_pc:String(9007199254740993n+BigInt(i))
  }));
  const before=JSON.stringify(arr);
  const p=f.previewPcLocalRows_uni(arr,{now:new Date('2026-10-24T04:00:00Z')});
  assert.equal(p.mode,'preview_only');assert.equal(p.as_of,'2026-10-23');
  assert.equal(p.time_zone,'America/Mexico_City');
  assert.equal(p.rows.length,100);
  assert.equal(p.rows[0].id_pc,'9007199254740993');
  assert.equal(p.rows[0].values.dias_vencimiento,10);
  assert.equal(JSON.stringify(arr),before);
  assert.equal(Object.isFrozen(p.rows),true);
});

test('VA F4: servicio solo ejecuta SELECT/COUNT con scope y adjunta calculos aparte',async()=>{
  const code=file('backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.pc-service.js');
  const module={exports:{}};
  vm.runInNewContext(code,{module,exports:module.exports,require:name=>{
    if(name==='../../config/db')return {getConnection(){throw Error('NO AIVEN');}};
    if(name==='../../services/cobranza-uni-scope.service')return {};
    if(name.endsWith('.constants'))return c;
    if(name.endsWith('.pc-query'))return q;
    if(name.endsWith('.pc-relations-service'))return {previewPcRelationsFromAiven_uni:mockPcRelationsF5_uni};
    if(name.endsWith('.pc-formulas'))return f;
    throw Error('Unknown dependency: '+name);
  }});
  const stored={...row};const calls=[];
  const conn={async query(sql,params){calls.push({sql,params});return calls.length===1?[[{total:'1'}]]:[[stored]];}};
  const res=await module.exports.listVentaAdicionalAdmin_uni({query:{}},{
    connection:conn,scopeBuilder:()=>'(pc.id_pc > 0)',now:new Date('2026-10-24T04:59:59Z'),
    relationsPreview:mockPcRelationsF5_uni
  });
  assert.equal(calls.length,2);
  assert.match(calls[0].sql,/^SELECT COUNT/);assert.match(calls[1].sql,/^SELECT /);
  assert.ok(calls.every(x=>!/(?:UPDATE|DELETE|INSERT|CREATE|DROP|ALTER)\s+`?pc`?\b/i.test(x.sql)));
  assert.equal(res.rows[0],stored);
  assert.equal(res.rows[0].estatus,'CORRIENTE'); // persistido desde GAS, sin modificar
  assert.equal(res.formula_preview.rows[0].values.estatus,'VENCIDO');
  assert.equal(res.formula_preview.rows[0].values.dias_vencimiento,10);
  assert.equal(res.formula_preview.as_of,'2026-10-23');
  assert.equal(res.readonly,true);
});

test('VA F4: listado vacio conserva la respuesta y el preview sin consulta de datos',async()=>{
  const mod=require('../backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.pc-formulas');
  const preview=mod.previewPcLocalRows_uni([],{cutoffIso:cutoff});
  assert.deepEqual(preview.rows,[]);
  assert.equal(preview.as_of,'2026-10-23');
  assert.deepEqual(preview.fields,f.PC_LOCAL_FORMULA_FIELDS_UNI);
});

test('VA F4: frontend muestra marca de previa, mantiene puerta de escritura y usa escaping',()=>{
  const ui=file('modules/cobranza-uni/administracion/venta-adicional/venta-adicional.js');
  const css=file('modules/cobranza-uni/administracion/venta-adicional/venta-adicional.css');
  const service=file('backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.pc-edit-service.js');
  assert.match(ui,/formula_preview/);
  assert.match(ui,/preview_only/);
  assert.match(ui,/ESC\(title\)/);
  assert.match(ui,/Vista previa/);
  assert.match(css,/cua-pc-preview-cell/);
  assert.match(service,/PC_ADMIN_EDIT_ENABLED/);
  assert.match(ui,/method:'POST'/); // F6: simulacion y alta protegida
  assert.doesNotMatch(ui,/method:'DELETE'/);
});

test('VA F4: formula no gestiona GAS y editor Excel usa puerta backend',()=>{
  const service=file('backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.pc-edit-service.js');
  const code=file('backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.pc-formulas.js');
  const ui=file('modules/cobranza-uni/administracion/venta-adicional/venta-adicional.js');
  assert.match(ui,/data-pc-cell-input/);
  assert.match(ui,/beginCellEdit/);
  assert.match(service,/PC_ADMIN_EDIT_ENABLED/);
  assert.doesNotMatch(ui,/GAS sigue activo para GC, VA y MP/);
  assert.doesNotMatch(code,/require\(['"]\.\.\/\.\.\/config\/db/);
  assert.doesNotMatch(code,/setInterval|fetch\(|app\.script|ScriptApp|deleteTrigger/i);
  const ignored=file('.gitignore');
  assert.match(ignored,/\*\.sql/);
});

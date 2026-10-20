'use strict';
/* BLT NOW | 2026-10-20 | ALTAS FASE 5 V001
 * QA funcional del borrador y paridad de calculos backend/frontend.
 * Sin navegador, sin peticiones HTTP ni escrituras.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const folder=path.join(ROOT,'modules/instalaciones-administracion');
const backend=path.join(ROOT,'backend/src/modules/instalaciones-administracion');
const frontend=require(path.join(folder,'instalaciones-administracion-altas-captura_cor.js'));
const calculator=require(path.join(folder,'instalaciones-administracion-altas-formulas_cor.js'));
const serverCalc=require(path.join(backend,'instalaciones-administracion-altas-formulas.js'));
const persist=require(path.join(backend,'instalaciones-administracion-altas-persist.js'));
const helpers=frontend.helpers;
const sample={proyecto:'Nuevo Hotel',id_proyecto:'P15777',referencia_sitio:'Elevador 1',
  estatus:'04-M',fecha_visita:'2026-09-14',fecha_ccnr:'2026-09-14',fecha_descarga:'2026-09-01',
  fecha_fin_montaje_planeado:'2026-10-28',fecha_fin_montaje_modificado:'-',
  meses_garantia_sitio:'24',meses_garantia_actas:'12',meses_mantenimiento_gratuito:'24',
  presupuesto_mantenimiento_cem:'63576'};
const toRow=(n,mod={})=>({draft_id:n,values:{...sample,referencia_sitio:'Equipo '+n,...mod}});

test('F5 UI: matriz conserva maximo de veinte equipos',()=>{
  assert.equal(helpers.MAX,20);
  assert.equal(helpers.assessRows(Array.from({length:20},(_,i)=>toRow(i))).ok,true);
  assert.equal(helpers.assessRows(Array.from({length:21},(_,i)=>toRow(i))).ok,false);
});
test('F5 UI: permite un solo equipo con todos los opcionales NULL',()=>{
  const row=helpers.createRow(1);row.values={proyecto:'Prueba',id_proyecto:'P1',referencia_sitio:'Equipo',marca:null};
  const payload=helpers.postRowsCor([row]);
  assert.equal(payload.rows.length,1);
  assert.equal(payload.rows[0].marca,null);
});
test('F5 UI: lote mixto 2 PP NS no combina identidades',()=>{
  const list=[toRow(1,{id_proyecto:'P1',proyecto:'Uno'}),toRow(2,{id_proyecto:'P2',proyecto:'Dos'})];
  assert.equal(helpers.assessRows(list).ok,true);
  assert.deepEqual(helpers.postRowsCor(list).rows.map(x=>x.id_proyecto),['P1','P2']);
});
test('F5 UI: mismo PPNS y misma referencia en distinto formato es duplicado',()=>{
  const list=[toRow(1,{referencia_sitio:'Elevador  A'}),toRow(2,{referencia_sitio:' elevador a ',proyecto:'nuevo hotel'})];
  assert.equal(helpers.assessRows(list).ok,false);
});
test('F5 UI: mismo PPNS con dos nombres falla antes de POST',()=>{
  assert.equal(helpers.assessRows([toRow(1),toRow(2,{proyecto:'Distinto'})]).ok,false);
});
test('F5 UI: prohíbe filas vacías o marcadores de PPNS',()=>{
  const row=helpers.createRow(1);assert.equal(helpers.assessRows([row]).ok,false);
  row.values={...sample,id_proyecto:'SIN PP NS'};
  assert.equal(helpers.assessRows([row]).ok,false);
});
test('F5 UI: nunca sube calculados, FK ni campos de sistema desde el navegador',()=>{
  for(const key of [...calculator.ALL_PREVIEW_FIELDS,'id_ins_fl','created_at','id_admin','rel_admin']) {
    const row=toRow(1,{[key]:'2026-01-01'});
    assert.throws(()=>helpers.postRowsCor([row]),/no editable/);
  }
});
test('F5 UI: prepara el lote sin mutar filas ni asignar datos derivados',()=>{
  const row=toRow(1);const before=JSON.stringify(row);
  const out=helpers.postRowsCor([row]);
  assert.deepEqual(out.rows[0],row.values);
  assert.equal(JSON.stringify(row),before);
  assert.equal(Object.hasOwn(row.values,'dias_restantes'),false);
});
test('F5 UI: una respuesta parcialmente guardada se considera no confirmada',()=>{
  assert.throws(()=>helpers.acceptedPostCor({ok:true,created:1,records:[{id_ins_fl:1}]},2));
  assert.throws(()=>helpers.acceptedPostCor({ok:true,created:2,records:[{id_ins_fl:1},{id_ins_fl:1}]},2));
  assert.deepEqual(helpers.acceptedPostCor({ok:true,created:2,records:[{id_ins_fl:1},{id_ins_fl:2}]},2),[1,2]);
});
test('F5 UI: contratos de las 7 formulas son identicos en navegador y backend',()=>{
  assert.deepEqual(calculator.EXCEL_COLUMNS,serverCalc.EXCEL_COLUMNS);
  assert.deepEqual(calculator.ALL_PREVIEW_FIELDS,serverCalc.ALL_PREVIEW_FIELDS);
});
test('F5 UI: 7 formulas de Hoja1 mapeadas AG AR AS BB BJ BU CC',()=>{
  assert.deepEqual(Object.keys(calculator.EXCEL_COLUMNS),['AG','AR','AS','BB','BJ','BU','CC']);
});
test('F5 UI: paridad de formulas en varios cortes de fecha',()=>{
  for(const today of ['2026-01-01','2026-02-28','2026-10-09','2026-10-20','2026-12-31']) {
    const a=calculator.calculateCor(sample,{today}),b=serverCalc.calculateCor(sample,{today});
    assert.deepEqual(a,b,today);
  }
});
test('F5 UI: garantia restante solo se calcula cuando hay datos suficientes',()=>{
  assert.equal(calculator.calculateCor({meses_garantia_actas:'12'},{today:'2026-10-20'}).meses_garantia_restantes,12);
  assert.equal(calculator.calculateCor({meses_garantia_sitio:'24'},{today:'2026-10-20'}).meses_garantia_restantes,null);
});
test('F5 UI: días laborales se limitan al estatus 04-M',()=>{
  const yes=calculator.calculateCor(sample,{today:'2026-10-20'});
  const no=calculator.calculateCor({...sample,estatus:'02-OC'},{today:'2026-10-20'});
  assert.equal(yes.dias_restantes,7);assert.equal(no.dias_restantes,null);
});
test('F5 UI: DIAS360 difiere intencionalmente de dias naturales',()=>{
  const result=calculator.calculateCor({fecha_visita:'2026-01-31'},{today:'2026-02-28'});
  assert.equal(result.dias_sin_visita,28);
  assert.notEqual(result.dias_sin_visita,31);
});
test('F5 UI: costo mensual no divide entre cero ni inventa montos',()=>{
  const a=calculator.calculateCor({...sample,meses_mantenimiento_gratuito:'0'},{today:'2026-10-20'});
  assert.equal(a.costo_mensual_mantenimiento_cem,null);
  assert.equal(persist.persistedForRowCor(sample,'2026-10-20').costo_mensual_mantenimiento_cem,'2649.00');
});
test('F5 UI: las fechas previstas AR/BB no se insertan en columnas REAL',()=>{
  const p=persist.persistedForRowCor(sample,'2026-10-20');
  assert.equal(Object.hasOwn(p,'fecha_fin_montaje_real'),false);
  assert.equal(Object.hasOwn(p,'fecha_fin_ajuste_real'),false);
  assert.equal(calculator.isSuggestedDateCor('fecha_fin_montaje_real'),true);
});
test('F5 UI: se conservan fechas reales ya almacenadas; motor puro solo previsualiza',()=>{
  const row={...sample,fecha_fin_montaje_real:'2026-10-15',fecha_fin_ajuste_real:'2026-10-18'};
  const before=JSON.stringify(row);
  const p=helpers.previewRowCor(row,calculator,'2026-10-20');
  assert.equal(p.fecha_fin_montaje_real,'2026-10-28');
  assert.equal(row.fecha_fin_montaje_real,'2026-10-15');
  assert.equal(JSON.stringify(row),before);
});
test('F5 UI: la capa de captura no escribe en storage ni ejecuta POST sin confirmacion',()=>{
  const source=fs.readFileSync(path.join(folder,'instalaciones-administracion-altas-captura_cor.js'),'utf8');
  assert.match(source,/env\.confirm\('Crear /);
  assert.match(source,/method:'POST'/);
  assert.match(source,/uncertain\s*=\s*true/);
  assert.match(source,/GET verificados/);
  assert.doesNotMatch(source,/\b(?:localStorage|sessionStorage|indexedDB)\./);
});
test('F5 UI: cambio de identidad, sesion o visor limpia datos sensibles',()=>{
  const source=fs.readFileSync(path.join(folder,'instalaciones-administracion-altas-captura_cor.js'),'utf8');
  for(const event of ['mantto:auth-ready','mantto:view-user-changed','mantto:session-expired','mantto:logout','mantto:permissions-updated'])
    assert.ok(source.includes(event),event);
  assert.match(source,/function clearSensitive\(\)/);
  assert.match(source,/rows=\[\]/);
});

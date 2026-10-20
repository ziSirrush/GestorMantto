'use strict';
/* BLT NOW - F3: QA aislado del motor de formulas por fila.
 * Excel FieldLine Instalaciones.xlsx, Hoja1: AG3/AR3/AS3/BB3/BJ3/BU3/CC3.
 * Las formulas en xlsx son TEXTO y mencionan fila 2633: las reinterpretamos
 * como dependencias de columnas de cada equipo, nunca ejecutamos Excel.
 * No requiere navegador, MySQL, Azure ni red.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..');
const FRONT=path.join(ROOT,'modules/instalaciones-administracion/instalaciones-administracion-altas-formulas_cor.js');
const BACK=path.join(ROOT,'backend/src/modules/instalaciones-administracion/instalaciones-administracion-altas-formulas.js');
const CAPTURE=path.join(ROOT,'modules/instalaciones-administracion/instalaciones-administracion-altas-captura_cor.js');
const front=require(FRONT);
const back=require(BACK);
const capture=require(CAPTURE);
const NOW='2026-10-16'; // Coincide con la fila 2: 14 sep -> 16 oct = 32 DIAS360.
const calc=(v,engine=front,now=NOW)=>engine.calculateCor(v,{today:now});
const sample={
  proyecto:'WALMART BA OTILIO GONZALEZ',id_proyecto:'P14596',referencia_sitio:'Montacargas Unico',
  estatus:'04-M',fecha_visita:'2026-09-14',meses_garantia_actas:'24',meses_garantia_sitio:'-',
  fecha_descarga:'2026-09-07',fecha_fin_montaje_planeado:'2026-10-09',fecha_fin_montaje_modificado:'-',
  meses_mantenimiento_gratuito:'24',presupuesto_mantenimiento_cem:'63576',
  fecha_fin_ajuste_planeado:'-',fecha_fin_ajuste_modificado:'-',fecha_entrega_cliente:'-'
};
function hash(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}

test('Backend y frontend usan EXACTAMENTE el mismo motor de calculos',()=>{
  assert.equal(hash(FRONT),hash(BACK));
  assert.deepEqual(front.EXCEL_COLUMNS,{
    AG:'meses_garantia_restantes',AR:'fecha_fin_montaje_real',AS:'dias_restantes',
    BB:'fecha_fin_ajuste_real',BJ:'anio_termino',BU:'dias_sin_visita',
    CC:'costo_mensual_mantenimiento_cem'
  });
});
test('Se conservan las 7 formulas Excel + 2 vistas calculadas legadas',()=>{
  assert.equal(front.EXCEL_FIELDS.length,7);
  assert.equal(front.ALL_PREVIEW_FIELDS.length,9);
});
test('Fila 2 Excel: meses actas 24 cuando sitio es guion (AG)',()=>{
  assert.equal(calc(sample).meses_garantia_restantes,24);
});
test('Fila 2 Excel: AR usa final de montaje planeado al faltar modificado',()=>{
  assert.equal(calc(sample).fecha_fin_montaje_real,'2026-10-09');
  assert.equal(front.isSuggestedDateCor('fecha_fin_montaje_real'),true);
});
test('Fila 2 Excel: AS DIAS.LAB del 16 oct al 9 oct = -6',()=>{
  assert.equal(calc(sample).dias_restantes,-6);
});
test('Fila 2 Excel: BU DIAS360 desde 14 septiembre a 16 octubre = 32',()=>{
  assert.equal(calc(sample).dias_sin_visita,32);
});
test('Fila 2 Excel: CC 63576/24 = 2649',()=>{
  assert.equal(calc(sample).costo_mensual_mantenimiento_cem,2649);
  assert.equal(front.formatCor('costo_mensual_mantenimiento_cem',2649),'$2,649.00');
});
test('Fila 2 Excel: ajuste, entrega y anio ausentes -> NULL',()=>{
  const v=calc(sample);
  assert.equal(v.fecha_fin_ajuste_real,null);
  assert.equal(v.anio_termino,null);
});
test('AR/BB eligen fecha MODIFICADA cuando se proporciona',()=>{
  const v=calc({...sample,fecha_fin_montaje_modificado:'2026-11-01',
    fecha_fin_ajuste_planeado:'2026-12-01',fecha_fin_ajuste_modificado:'2026-12-20'});
  assert.equal(v.fecha_fin_montaje_real,'2026-11-01');
  assert.equal(v.fecha_fin_ajuste_real,'2026-12-20');
});
test('AR/BB NO inventan fecha real si la modificada es invalida',()=>{
  assert.equal(calc({...sample,fecha_fin_montaje_modificado:'SIN DATO'}).fecha_fin_montaje_real,null);
  assert.equal(calc({...sample,fecha_fin_ajuste_planeado:'2026-12-01',fecha_fin_ajuste_modificado:'???'}).fecha_fin_ajuste_real,null);
});
test('Dias restantes solo calcula cuando estatus es 04-M',()=>{
  assert.equal(calc({...sample,estatus:'05-PA'}).dias_restantes,null);
  assert.equal(calc({...sample,estatus:null}).dias_restantes,null);
});
test('DIAS.LAB incluye inicio y final, excluye sabado y domingo',()=>{
  const f=front.civilCor;
  assert.equal(front.workingDaysCor(f('2026-10-16'),f('2026-10-16')),1);
  assert.equal(front.workingDaysCor(f('2026-10-17'),f('2026-10-18')),0);
  assert.equal(front.workingDaysCor(f('2026-10-16'),f('2026-10-19')),2);
  assert.equal(front.workingDaysCor(f('2026-10-19'),f('2026-10-16')),-2);
});
test('DIAS360 interpreta final de febrero / fin de mes segun NASD',()=>{
  const f=front.civilCor;
  assert.equal(front.days360UsCor(f('2026-02-28'),f('2026-03-31')),30);
  assert.equal(front.days360UsCor(f('2026-01-31'),f('2026-02-28')),28);
  assert.equal(front.days360UsCor(f('2026-01-30'),f('2026-02-28')),28);
});
test('AG con meses en sitio calcula fraccion de dias / 30 sin redondear',()=>{
  const r=calc({...sample,meses_garantia_sitio:'24'},front,'2026-10-20');
  const diff=(Date.UTC(2026,9,20)-Date.UTC(2026,8,7))/86400000;
  assert.equal(r.meses_garantia_restantes,24-diff/30);
});
test('Meses sitio invalidos o sin fecha descarga no inventan restantes',()=>{
  assert.equal(calc({...sample,meses_garantia_sitio:'X'}).meses_garantia_restantes,null);
  assert.equal(calc({...sample,meses_garantia_sitio:'24',fecha_descarga:'-'}).meses_garantia_restantes,null);
});
test('No divide entre cero ni inventa costo mensual al faltar meses',()=>{
  assert.equal(calc({...sample,meses_mantenimiento_gratuito:'0'}).costo_mensual_mantenimiento_cem,null);
  assert.equal(calc({...sample,meses_mantenimiento_gratuito:'-'}).costo_mensual_mantenimiento_cem,null);
  assert.equal(calc({...sample,presupuesto_mantenimiento_cem:'-'}).costo_mensual_mantenimiento_cem,null);
});
test('Ano de termino deriva de entrega al cliente, no del montaje',()=>{
  assert.equal(calc({...sample,fecha_entrega_cliente:'2028-01-05'}).anio_termino,2028);
});
test('Campos existentes: estatus completo y dias sin CCNR naturales',()=>{
  const v=calc({...sample,fecha_ccnr:'2026-09-07'});
  assert.equal(v.estatus_completo,'Equipos en Montaje');
  assert.equal(v.dias_sin_ccnr,39);
});
test('Sin informacion opcional: 9 formulas sin valores fantasma',()=>{
  const r=calc({});
  assert.deepEqual(Object.values(r),Array(9).fill(null));
});
test('Fechas invalidas y 29 febrero imposible se rechazan en preview',()=>{
  assert.equal(front.civilCor('2026-02-29'),null);
  assert.ok(front.civilCor('2028-02-29'));
  assert.equal(calc({...sample,fecha_visita:'2026-02-29'}).dias_sin_visita,null);
});
test('La fecha hoy usa calendario CDMX, independiente del host',()=>{
  assert.equal(front.todayMexicoCor(new Date('2026-10-20T03:00:00.000Z')),'2026-10-19');
  assert.equal(front.todayMexicoCor(new Date('2026-10-20T18:00:00.000Z')),'2026-10-20');
});
test('La captura reutiliza la calculadora sin mutar borradores',()=>{
  const row=capture.helpers.createRow(1);
  row.values={...sample};
  const initial=JSON.stringify(row.values);
  const preview=capture.helpers.previewRowCor(row.values,front,NOW);
  assert.equal(preview.dias_sin_visita,32);
  assert.equal(preview.dias_restantes,-6);
  assert.equal(JSON.stringify(row.values),initial);
  assert.equal('dias_sin_visita' in row.values,false);
});
test('Fechas previstas no son editables desde alta y estan marcadas como NO REAL',()=>{
  for(const f of ['fecha_fin_montaje_real','fecha_fin_ajuste_real']){
    assert.equal(capture.helpers.editable(f),false);
    assert.equal(front.isSuggestedDateCor(f),true);
  }
  const src=fs.readFileSync(CAPTURE,'utf8');
  assert.match(src,/Fecha PREVISTA · no REAL/);
  assert.match(src,/Guardar lote/);
});
test('Motor de formulas sigue puro: captura hace POST confirmado por Fase 4',()=>{
  const captureSrc=fs.readFileSync(CAPTURE,'utf8');
  const formulaSrc=fs.readFileSync(FRONT,'utf8');
  const serverSrc=fs.readFileSync(BACK,'utf8');
  assert.match(captureSrc,/method:'POST'/);
  assert.match(captureSrc,/env\.confirm\('Crear /);
  assert.doesNotMatch(captureSrc,/\b(?:localStorage|sessionStorage|indexedDB)\./i);
  for(const src of [formulaSrc,serverSrc]){
    assert.doesNotMatch(src,/\bmethod:\s*['"](?:POST|PATCH|PUT|DELETE)['"]/i);
    assert.doesNotMatch(src,/\b(?:localStorage|sessionStorage|indexedDB)\./i);
    assert.doesNotMatch(src,/\b(?:INSERT|UPDATE|DELETE)\s+(?:INTO|FROM|ins_fl)/i);
  }
});

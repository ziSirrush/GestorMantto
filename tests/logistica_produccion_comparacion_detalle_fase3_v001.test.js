'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
Object.assign(process.env,{DB_HOST:'127.0.0.1',DB_PORT:'3306',DB_USER:'unit',DB_PASSWORD:'unit',DB_NAME:'unit',DB_SSL:'false'});

const root=path.resolve(__dirname,'..');
const js=fs.readFileSync(path.join(root,'modules/logistica-produccion/logistica-produccion.js'),'utf8');
const css=fs.readFileSync(path.join(root,'modules/logistica-produccion/logistica-produccion.css'),'utf8');
const service=fs.readFileSync(path.join(root,'backend/src/modules/logistica-produccion/logistica-produccion.service.js'),'utf8');
const loader=fs.readFileSync(path.join(root,'core/module-loader.js'),'utf8');
const {buildDateComparison}=require('../backend/src/modules/logistica-produccion/logistica-produccion.service');

function sliceFunction(source,start,end){
  const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
  assert.ok(a>=0,start+' no encontrado');
  assert.ok(b>a,end+' no encontrado');
  return source.slice(a,b);
}

test('Backend construye comparacion explicita sin sobrescribir la captura',()=>{
  assert.deepEqual(buildDateComparison({captured:'2026-10-01',source:'2026-10-01',sourceName:'log_ops.pvo',linked:true}),{
    capturada:'2026-10-01',fuente:'2026-10-01',fuentes:['2026-10-01'],fuente_origen:'log_ops.pvo',estado:'COINCIDE',coincide:true
  });
  assert.equal(buildDateComparison({captured:'2026-10-01',source:'2026-10-02',sourceName:'log_ops.pvo',linked:true}).estado,'DIFERENTE');
  assert.equal(buildDateComparison({captured:'2026-10-01',sourceRaw:'2026-10-01, 2026-10-02',sourceName:'ins_fl.fecha_visita',linked:true}).estado,'FUENTE_MULTIPLE');
  assert.equal(buildDateComparison({captured:'',source:'2026-10-02',sourceName:'log_ops.pvo',linked:true}).estado,'SIN_CAPTURA');
  assert.equal(buildDateComparison({captured:'2026-10-01',source:'',sourceName:'log_ops.pvo',linked:true}).estado,'SIN_FUENTE');
  assert.equal(buildDateComparison({captured:'2026-10-01',source:'2026-10-01',sourceName:'log_ops.pvo',linked:false}).estado,'SIN_VINCULO');
});

test('Detalle API entrega las tres comparaciones con sus fuentes oficiales',()=>{
  assert.match(service,/comparacion_fechas:comparacionFechas/);
  assert.match(service,/sourceName:'log_ops\.pvo'/);
  assert.match(service,/sourceName:'ins_fl\.fecha_visita'/);
  assert.match(service,/sourceName:'ins_fl\.fecha_posible_recepcion_cubo'/);
});

test('Comparacion visual existe en Resumen de Detalle para PVO Visita y Cubos',()=>{
  assert.match(js,/function comparisonLabel\(key\)/);
  assert.match(js,/comparisonLabel\('fecha_pvo'\)/);
  assert.match(js,/comparisonLabel\('fecha_visita'\)/);
  assert.match(js,/comparisonLabel\('fecha_cubos'\)/);
  for(const label of ['Coincide','Diferente','Sin fecha capturada','Sin fecha en fuente','Fuente con m\u00faltiples fechas']){
    assert.match(js,new RegExp(label));
  }
  assert.match(css,/#view-logistica-produccion-detalle \.lp-date-compare-badge\.match/);
  assert.match(css,/#view-logistica-produccion-detalle \.lp-date-compare-badge\.diff/);
});

test('Comparacion no se pinta en Main ni en Crear nuevo',()=>{
  const main=sliceFunction(js,'function renderMainRows(view){','async function loadMain(view){');
  const nuevo=sliceFunction(js,'async function loadNew(view,resetMode=true){','function statusOptions(selected){');
  assert.doesNotMatch(main,/comparisonLabel|lp-date-compare|comparacion_fechas/);
  assert.doesNotMatch(nuevo,/comparisonLabel|lp-date-compare|comparacion_fechas/);
});

test('Cache bust final Fase 4 cubre las cinco rutas PVO',()=>{
  const matches=loader.match(/20261005-pvo-cierre-fase4-v001/g)||[];
  assert.equal(matches.length,10);
});

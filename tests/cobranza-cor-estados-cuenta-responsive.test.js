
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const ROOT=path.resolve(__dirname,'..');
const read=relative=>fs.readFileSync(path.join(ROOT,relative),'utf8');

test('Main y detalle conservan tablas y solo sus wrappers hacen scroll horizontal en movil',()=>{
  const css=read('modules/cobranza-cor/cobranza-cor-estados-cuenta.css');
  assert.match(css,/COBRANZA COR ESTADOS RESPONSIVE SCROLL V002/);assert.match(css,/@media \(max-width:760px\)/);
  assert.match(css,/\.ccor-ec-table-wrap,[\s\S]*?overflow-x:auto!important/);assert.match(css,/\.ccor-ec-detail-table\{[\s\S]*?min-width:1100px!important/);
});

test('Crear Editar conserva Hitos horizontal y Equipos simplificado',()=>{
  const css=read('modules/cobranza-cor/cobranza-cor-estados-cuenta-form.css');
  assert.match(css,/COBRANZA COR FORM RESPONSIVE SCROLL V002/);assert.match(css,/\.ccor-ec-form-section \.ccor-ec-table-wrap\{[\s\S]*?overflow-x:auto!important/);
  assert.match(css,/\.ccor-ec-form-hitos-table\{[\s\S]*?min-width:2200px!important/);
  assert.match(css,/\.ccor-ec-form-equipment-ids/);
});

test('Controles y paneles permanecen contenidos en viewport',()=>{
  const main=read('modules/cobranza-cor/cobranza-cor-estados-cuenta.css');const form=read('modules/cobranza-cor/cobranza-cor-estados-cuenta-form.css');
  assert.match(main,/\.ccor-ec-page\{[\s\S]*?overflow-x:hidden/);assert.match(form,/\.ccor-ec-form-page\{[\s\S]*?overflow-x:hidden/);assert.match(form,/min-height:44px/);
});

test('Cache bust fuerza consolidacion F3',()=>{
  const loader=read('core/module-loader.js');const index=read('index.html');
  assert.match(loader,/cobranza-cor-estados-cuenta\.css\?v=20261001-cobranza-pagos-detalle-v001/);
  assert.match(loader,/cobranza-cor-estados-cuenta\.js\?v=20261001-cobranza-pagos-detalle-v001/);
  assert.match(loader,/cobranza-cor-estados-cuenta-form\.css\?v=20260930-cobranza-consolidacion-f3-v001/);
  assert.match(loader,/cobranza-cor-estados-cuenta-form\.js\?v=20260930-equipos-validacion100-v001/);
  assert.match(index,/core\/module-loader\.js\?v=20261001-cobranza-pagos-detalle-v001/);
});

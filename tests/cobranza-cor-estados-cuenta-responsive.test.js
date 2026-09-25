'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');

const ROOT=path.resolve(__dirname,'..');
const read=relative=>fs.readFileSync(path.join(ROOT,relative),'utf8');

test('Main y detalle conservan tablas y solo sus wrappers hacen scroll horizontal en movil',()=>{
  const css=read('modules/cobranza-cor/cobranza-cor-estados-cuenta.css');
  assert.match(css,/COBRANZA COR ESTADOS RESPONSIVE SCROLL V002/);
  assert.match(css,/@media \(max-width:760px\)/);
  assert.match(css,/\.ccor-ec-table-wrap,[\s\S]*?overflow-x:auto!important/);
  assert.match(css,/\.ccor-ec-projects-table\.ccor-ec-main-v001\{[\s\S]*?min-width:1480px!important/);
  assert.match(css,/\.ccor-ec-detail-table\{[\s\S]*?min-width:1100px!important/);
  assert.match(css,/\.ccor-ec-projects-table thead,[\s\S]*?display:table-header-group/);
  assert.match(css,/\.ccor-ec-detail-table tbody\{display:table-row-group\}/);
  assert.doesNotMatch(css,/\.ccor-ec-main-v001 thead\{display:none\}/);
  assert.doesNotMatch(css,/\.ccor-ec-detail-table thead\{display:none\}/);
});

test('Crear Editar conserva Equipos e Hitos como tablas horizontales',()=>{
  const css=read('modules/cobranza-cor/cobranza-cor-estados-cuenta-form.css');
  assert.match(css,/COBRANZA COR FORM RESPONSIVE SCROLL V002/);
  assert.match(css,/\.ccor-ec-form-section \.ccor-ec-table-wrap\{[\s\S]*?overflow-x:auto!important/);
  assert.match(css,/\.ccor-ec-form-equipment-table\{[\s\S]*?min-width:1320px!important/);
  assert.match(css,/\.ccor-ec-form-hitos-table\{[\s\S]*?min-width:2700px!important/);
  assert.match(css,/\.ccor-ec-form-equipment-table thead,[\s\S]*?display:table-header-group/);
  assert.doesNotMatch(css,/\.ccor-ec-form-equipment-table thead\{display:none\}/);
  assert.doesNotMatch(css,/\.ccor-ec-form-hitos-table thead\{display:none\}/);
});

test('Controles y paneles permanecen contenidos en el viewport',()=>{
  const main=read('modules/cobranza-cor/cobranza-cor-estados-cuenta.css');
  const form=read('modules/cobranza-cor/cobranza-cor-estados-cuenta-form.css');
  assert.match(main,/\.ccor-ec-page\{[\s\S]*?overflow-x:hidden/);
  assert.match(main,/\.ccor-ec-hero-actions\{[\s\S]*?flex-wrap:wrap/);
  assert.match(form,/\.ccor-ec-form-page\{[\s\S]*?overflow-x:hidden/);
  assert.match(form,/\.ccor-ec-form-fields\{grid-template-columns:1fr\}/);
  assert.match(form,/min-height:44px/);
  assert.match(form,/font-size:16px/);
});

test('Cache bust fuerza la version scroll V002',()=>{
  const loader=read('core/module-loader.js');
  const index=read('index.html');
  assert.match(loader,/cobranza-cor-estados-cuenta\.css\?v=20260924-estados-responsive-scroll-v002/);
  assert.match(loader,/cobranza-cor-estados-cuenta-form\.css\?v=20260925-equipos-phns-v001/);
  assert.match(loader,/cobranza-cor-estados-cuenta-form\.js\?v=20260925-equipos-phns-v001/);
  assert.match(index,/core\/module-loader\.js\?v=20260925-cobranza-equipos-phns-v001/);
});

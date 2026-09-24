
'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');

const ROOT=path.resolve(__dirname,'..');
const read=relative=>fs.readFileSync(path.join(ROOT,relative),'utf8');

test('Main y detalle de Estados de Cuenta tienen modo movil sin tabla ancha',()=>{
  const css=read('modules/cobranza-cor/cobranza-cor-estados-cuenta.css');
  assert.match(css,/COBRANZA COR ESTADOS RESPONSIVE MOVIL V001/);
  assert.match(css,/@media \(max-width:760px\)/);
  assert.match(css,/\.ccor-ec-projects-table\.ccor-ec-main-v001\{[\s\S]*?min-width:0!important/);
  assert.match(css,/\.ccor-ec-main-v001 thead\{display:none\}/);
  assert.match(css,/\.ccor-ec-detail-table\{[\s\S]*?min-width:0!important/);
  assert.match(css,/\.ccor-ec-detail-table thead\{display:none\}/);
  assert.match(css,/td:nth-child\(12\)::before\{content:'Contractual'\}/);
  assert.match(css,/td:nth-child\(12\)::before\{content:'Por cobrar'\}/);
});

test('Crear Editar convierte Equipos e Hitos a tarjetas en movil',()=>{
  const css=read('modules/cobranza-cor/cobranza-cor-estados-cuenta-form.css');
  assert.match(css,/COBRANZA COR FORM RESPONSIVE MOVIL V001/);
  assert.match(css,/\.ccor-ec-form-equipment-table\{[\s\S]*?min-width:0!important/);
  assert.match(css,/\.ccor-ec-form-equipment-table thead\{display:none\}/);
  assert.match(css,/\.ccor-ec-form-hitos-table\{[\s\S]*?min-width:0!important/);
  assert.match(css,/\.ccor-ec-form-hitos-table thead\{display:none\}/);
  assert.match(css,/td:nth-child\(20\)::before\{content:'Acciones'\}/);
  assert.match(css,/font-size:16px/);
  assert.match(css,/min-height:44px/);
});

test('General y acciones se apilan para telefono',()=>{
  const css=read('modules/cobranza-cor/cobranza-cor-estados-cuenta-form.css');
  assert.match(css,/\.ccor-ec-form-fields\{grid-template-columns:1fr\}/);
  assert.match(css,/\.ccor-ec-form-kpis\{grid-template-columns:1fr\}/);
  assert.match(css,/@media\(max-width:480px\)\{[\s\S]*?\.ccor-ec-form-actions\{grid-template-columns:1fr\}/);
});

test('Cache bust carga CSS responsive actual',()=>{
  const loader=read('core/module-loader.js');
  const index=read('index.html');
  assert.match(loader,/cobranza-cor-estados-cuenta\.css\?v=20260924-estados-responsive-v001/);
  assert.match(loader,/cobranza-cor-estados-cuenta-form\.css\?v=20260924-estados-responsive-v001/);
  assert.match(index,/core\/module-loader\.js\?v=20260924-cobranza-estados-responsive-v001/);
});

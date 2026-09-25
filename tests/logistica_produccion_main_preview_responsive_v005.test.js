'use strict';
const fs=require('fs');
const path=require('path');
const assert=require('assert');
const root=path.resolve(__dirname,'..');
const js=fs.readFileSync(path.join(root,'modules/logistica-produccion/logistica-produccion.js'),'utf8');
const css=fs.readFileSync(path.join(root,'modules/logistica-produccion/logistica-produccion.css'),'utf8');
const loader=fs.readFileSync(path.join(root,'core/module-loader.js'),'utf8');
let passed=0;
function ok(name,fn){fn();passed++;console.log('OK',name);}
ok('modal PDF usa FitH para ajustar al ancho y no FitV',()=>{
  assert(js.includes("mode==='modal'?'#page=1&view=FitH&toolbar=0&navpanes=0&scrollbar=1'"));
  assert(!js.includes("mode==='modal'?'#page=1&view=FitV"));
});
ok('Main de PVO contiene overflow horizontal solo dentro de la tabla',()=>{
  assert(css.includes('#view-logistica-produccion{width:100%;max-width:100%;min-width:0;overflow-x:hidden}'));
  assert(css.includes('#view-logistica-produccion .lp-table-wrap{display:block;overflow-x:auto;overflow-y:hidden'));
  assert(css.includes('#view-logistica-produccion .lp-main-table{width:100%;min-width:900px}'));
});
ok('Main movil apila toolbar e indicadores sin ampliar el viewport',()=>{
  assert(css.includes('#view-logistica-produccion .lp-toolbar{display:grid;grid-template-columns:minmax(0,1fr)'));
  assert(css.includes('#view-logistica-produccion .lp-indicator-legend>div{display:grid;grid-template-columns:1fr'));
});
ok('Modal movil usa el ancho real del contenedor sin 100vw',()=>{
  assert(css.includes('.lp-doc-modal{padding:0;place-items:stretch}'));
  assert(css.includes('.lp-doc-modal-panel{width:100%;max-width:100%;height:100dvh;max-height:100dvh'));
  assert(css.includes('.lp-doc-modal-viewer iframe{width:100%;max-width:100%;height:100%;min-width:0'));
});
ok('cache bust V005 aplicado en rutas PVO',()=>{
  const tag='20260924-pvo-main-preview-responsive-v005';
  const count=(loader.match(new RegExp(tag,'g'))||[]).length;
  assert.strictEqual(count,10);
});
ok('no se incluyen patch files por contrato de entrega',()=>{
  const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
  assert(!walk(root).some(f=>f.endsWith('.patch')));
});
console.log(`RESULT ${passed}/6`);

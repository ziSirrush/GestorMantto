'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const js=fs.readFileSync(path.join(root,'modules/logistica-produccion/logistica-produccion.js'),'utf8');
const css=fs.readFileSync(path.join(root,'modules/logistica-produccion/logistica-produccion.css'),'utf8');
const loader=fs.readFileSync(path.join(root,'core/module-loader.js'),'utf8');

test('modal inicia siempre en hoja 1 y usa ajuste vertical',()=>{
  assert.match(js,/mode==='modal'\?'#page=1&view=FitV&toolbar=0&navpanes=0&scrollbar=1'/);
  assert.match(js,/pdfPreviewUrl\(url,'modal'\)/);
  assert.match(js,/lp-doc-modal-page-chip/);
});

test('visor ampliado permite interaccion para scroll o zoom',()=>{
  assert.match(js,/tabindex="0"/);
  assert.match(css,/\.lp-doc-modal-viewer iframe\{[^}]*pointer-events:auto/);
  assert.match(css,/\.lp-doc-modal-viewer iframe\{[^}]*touch-action:auto/);
});

test('miniaturas conservan preview fija sin interaccion',()=>{
  assert.match(js,/#page=1&view=Fit&toolbar=0&navpanes=0&scrollbar=0/);
  assert.match(css,/\.lp-pdf-preview-window iframe\{[^}]*pointer-events:none/);
});

test('responsive mantiene visor contenido dentro del modal',()=>{
  assert.match(css,/\.lp-doc-modal-viewer\{position:relative;width:100%;height:100%;min-height:0/);
  assert.match(css,/@media\(max-width:760px\)\{[\s\S]*\.lp-doc-modal-body\{padding:4px\}/);
});

test('module-loader usa cache bust v003 en las cinco rutas PVO',()=>{
  const count=loader.match(/20260924-pvo-preview-hoja1-v003/g)||[];
  assert.equal(count.length,10);
  for(const route of ['logistica-produccion','logistica-produccion-nuevo','logistica-produccion-detalle','logistica-pvo','logistica-documentos']){
    assert.match(loader,new RegExp("'"+route+"':\\{css:"));
  }
});

test('module-loader conserva FIX Cobranza COR responsive movil solicitado',()=>{
  assert.match(loader,/cobranza-cor-estados-cuenta\.css\?v=20260924-estados-responsive-v001/);
  assert.match(loader,/cobranza-cor-estados-cuenta-form\.css\?v=20260924-estados-responsive-v001/);
  assert.match(loader,/cobranza-cor-estados-cuenta-form\.js\?v=20260924-fondo-garantia-general-v002/);
});

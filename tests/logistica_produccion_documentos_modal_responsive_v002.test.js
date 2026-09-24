'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const js=fs.readFileSync(path.join(root,'modules/logistica-produccion/logistica-produccion.js'),'utf8');
const css=fs.readFileSync(path.join(root,'modules/logistica-produccion/logistica-produccion.css'),'utf8');
const service=fs.readFileSync(path.join(root,'backend/src/modules/logistica-produccion/logistica-produccion.service.js'),'utf8');
const loader=fs.readFileSync(path.join(root,'core/module-loader.js'),'utf8');

test('cada documento permite abrir una vista previa flotante',()=>{
  assert.match(js,/data-doc-preview-id/);
  assert.match(js,/function documentModalShell\(\)/);
  assert.match(js,/function openDocumentModal\(file\)/);
  assert.match(js,/role="dialog" aria-modal="true"/);
  assert.match(js,/bindDocumentPreview\(view\)/);
});

test('modal conserva primera hoja y acciones abrir y descargar',()=>{
  assert.match(js,/#page=1&view=Fit&toolbar=0&navpanes=0&scrollbar=0/);
  assert.match(js,/id="lp-doc-modal-download"/);
  assert.match(js,/id="lp-doc-modal-open"/);
  assert.match(js,/Abrir documento/);
  assert.match(js,/Descargar/);
});

test('backend genera URL SAS específica de descarga para Azure Blob',()=>{
  assert.match(service,/url_descarga/);
  assert.match(service,/download:true/);
  assert.match(service,/createReadSas_gnral/);
  assert.match(service,/storage_provider==='LEGACY_URL'.*url_descarga:null/);
});

test('cerrar modal limpia preview y admite Escape',()=>{
  assert.match(js,/frame\.src='about:blank'/);
  assert.match(js,/event\.key==='Escape'/);
  assert.match(js,/lp-doc-preview-open/);
});

test('responsive elimina scroll horizontal del Resumen y usa modal casi full screen',()=>{
  assert.match(css,/#view-logistica-produccion-detalle \.lp-summary-table\{display:block;min-width:0;width:100%\}/);
  assert.match(css,/#view-logistica-produccion-detalle \.lp-upload-grid,#view-logistica-produccion-detalle \.lp-doc-preview-grid\{grid-template-columns:1fr\}/);
  assert.match(css,/\.lp-doc-modal-panel\{width:calc\(100vw - 12px\);height:calc\(100dvh - 12px\)/);
  assert.match(css,/@media\(max-width:420px\)\{\.lp-doc-modal-actions\{grid-template-columns:1fr\}/);
});

test('module-loader usa cache bust nuevo en las cinco rutas del modulo',()=>{
  const count=loader.match(/20260924-pvo-doc-modal-responsive-v002/g)||[];
  assert.equal(count.length,10);
  for(const route of ['logistica-produccion','logistica-produccion-nuevo','logistica-produccion-detalle','logistica-pvo','logistica-documentos']){
    assert.match(loader,new RegExp("'"+route+"':\\{css:"));
  }
  assert.match(loader,/cobranza-cor-estados-cuenta-form\.css\?v=20260923-fondo-garantia-v001/);
  assert.match(loader,/cobranza-cor-estados-cuenta-form\.js\?v=20260923-fondo-garantia-v001/);
});

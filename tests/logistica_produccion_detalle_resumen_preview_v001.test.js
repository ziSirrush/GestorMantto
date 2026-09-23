'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const js=fs.readFileSync(path.join(root,'modules/logistica-produccion/logistica-produccion.js'),'utf8');
const css=fs.readFileSync(path.join(root,'modules/logistica-produccion/logistica-produccion.css'),'utf8');
const loader=fs.readFileSync(path.join(root,'core/module-loader.js'),'utf8');

test('Detalle Resumen usa tabla de fields compacta',()=>{
  assert.match(js,/function detailSummaryTable\(p,fl\)/);
  assert.match(js,/class=\\?"lp-summary-table\\?"/);
  assert.match(js,/Resumen del registro de PVO-Producción/);
  assert.doesNotMatch(js,/<div class=\\?"lp-fields\\?">\$\{summary\}<\/div>/);
});

test('Zona de carga muestra vista previa fija de hoja 1 para PDF',()=>{
  assert.match(js,/#page=1&view=Fit&toolbar=0&navpanes=0&scrollbar=0/);
  assert.match(js,/class=\\?"lp-pdf-preview-window\\?"/);
  assert.match(js,/Vista previa fija de la primera hoja/);
  assert.match(js,/Abrir PDF completo/);
  assert.match(css,/\.lp-pdf-preview-window iframe\{[^}]*pointer-events:none/);
  assert.match(css,/\.lp-pdf-preview-window\{[^}]*overflow:hidden/);
});

test('Archivos no PDF mantienen carga y fallback sin restringir selector',()=>{
  assert.match(js,/Vista previa disponible únicamente para archivos PDF/);
  assert.doesNotMatch(js,/accept=\\?"application\/pdf/);
  assert.match(js,/Archivo \(máximo 25 MB por archivo\)<input name=\\?"archivo\\?" type=\\?"file\\?" required>/);
});

test('Conserva eliminar, abrir y reemplazar documentos',()=>{
  assert.match(js,/data-file-delete/);
  assert.match(js,/data-upload=\\?"\$\{type\}\\?"/);
  assert.match(js,/Cargar \/ reemplazar/);
});

test('Cache bust compartido se actualiza en todas las rutas del modulo',()=>{
  const matches=loader.match(/20260923-pvo-nuevo-busqueda-calendario-v001/g)||[];
  assert.equal(matches.length,10);
  for(const route of ['logistica-produccion','logistica-produccion-nuevo','logistica-produccion-detalle','logistica-pvo','logistica-documentos']){
    assert.match(loader,new RegExp("'"+route+"'"));
  }
});

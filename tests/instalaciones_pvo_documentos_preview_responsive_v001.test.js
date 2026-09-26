'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const details=fs.readFileSync(path.join(root,'core/details.js'),'utf8');
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');

function block(startText,endText){
  const start=details.indexOf(startText);
  const end=details.indexOf(endText,start);
  assert.notEqual(start,-1,`No se encontro ${startText}`);
  assert.notEqual(end,-1,`No se encontro final ${endText}`);
  return details.slice(start,end);
}

test('muestra preview embebido de la hoja 1 para PDF',()=>{
  const render=block('function renderProjectPvoDocuments','function projectPvoPanelHtml');
  assert.match(render,/mg-pvo-doc-preview-window/);
  assert.match(render,/<iframe src=/);
  assert.match(render,/projectPvoPdfPreviewUrl\(url,'thumb'\)/);
  assert.match(render,/Hoja 1/);
});

test('thumbnail queda fijo sin scroll ni interaccion dentro del iframe',()=>{
  assert.match(details,/mode==='thumb'\?'#page=1&view=Fit&toolbar=0&navpanes=0&scrollbar=0'/);
  assert.match(details,/\.mg-pvo-doc-preview-window iframe\{[^}]*pointer-events:none/);
});

test('click en preview abre el visor reutilizable',()=>{
  const render=block('function renderProjectPvoDocuments','function projectPvoPanelHtml');
  assert.match(render,/mg-pvo-doc-preview-hitbox/);
  assert.match(render,/data-pvo-doc-id/);
  assert.match(render,/openProjectPvoDocumentModal\(file\)/);
});

test('visor ampliado permite scroll y zoom dentro del PDF',()=>{
  assert.match(details,/'#page=1&view=FitH&toolbar=0&navpanes=0&scrollbar=1'/);
  assert.match(details,/\.mg-pvo-doc-modal-viewer iframe\{[^}]*pointer-events:auto[^}]*touch-action:pan-y pinch-zoom/);
});

test('documentacion sigue siendo solo lectura en Detalle Proyecto',()=>{
  const render=block('function renderProjectPvoDocuments','function projectPvoPanelHtml');
  assert.doesNotMatch(render,/data-file-delete|Cargar \/ reemplazar|type="file"/);
});

test('responsive usa dos columnas en tablet y una en movil',()=>{
  assert.match(details,/@media\(max-width:980px\)\{\.mg-pvo-documents-list\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(details,/@media\(max-width:720px\)[\s\S]*?\.mg-pvo-documents-list\{grid-template-columns:1fr\}/);
  assert.match(details,/@media\(max-width:420px\)/);
});

test('tarjetas y visor limitan ancho para evitar overflow horizontal',()=>{
  assert.match(details,/\.mg-pvo-doc-card\{[^}]*min-width:0[^}]*max-width:100%/);
  assert.match(details,/\.mg-pvo-doc-modal-panel\{[^}]*max-width:100%/);
});

test('index fuerza recarga del details actualizado',()=>{
  assert.match(index,/\.\/core\/details\.js\?v=20260925-instalaciones-pvo-preview-responsive-v001/);
});

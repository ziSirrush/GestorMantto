'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('MAIN y GC usan el ancho disponible en PC sin alterar el corte móvil',()=>{
  const main=read('modules/cobranza-uni/administracion/main/main.css');
  const gc=read('modules/cobranza-uni/administracion/gestion-credito/gestion-credito.css');
  assert.match(main,/\.cua-uni-page\{[^}]*width:100%;max-width:none;min-width:0/);
  assert.match(main,/\.cua-uni-detail\{[^}]*width:100%;min-width:0/);
  assert.doesNotMatch(main,/max-width:1320px/);
  assert.match(main,/@media\(max-width:900px\)\{\.cua-uni-options\{grid-template-columns:1fr\}/);
  assert.match(gc,/\.cua-gc-admin\{width:100%;max-width:100%;min-width:0/);
  assert.match(gc,/\.cua-gc-scroll\{[^}]*width:100%;max-width:100%/);
});

test('VA y MP quedan editables por defecto pero conservan cierre explícito',()=>{
  const pc=read('backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.pc-edit-service.js');
  const mp=read('backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.mp-edit-service.js');
  for(const source of [pc,mp]){
    assert.match(source,/flag==='' \|\| \['true','1','yes','on'\]\.includes\(flag\)/);
    assert.match(source,/EDITAR/);
  }
});

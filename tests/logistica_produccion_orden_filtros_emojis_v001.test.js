'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const js=fs.readFileSync(path.join(root,'modules/logistica-produccion/logistica-produccion.js'),'utf8');
const css=fs.readFileSync(path.join(root,'modules/logistica-produccion/logistica-produccion.css'),'utf8');
const repo=fs.readFileSync(path.join(root,'backend/src/modules/logistica-produccion/logistica-produccion.repository.js'),'utf8');
const loader=fs.readFileSync(path.join(root,'core/module-loader.js'),'utf8');

test('muestra leyenda visible de los indicadores actuales',()=>{
  for(const expected of ['📍','Falta Archivo PVO','🥨','Falta PPNS','💾','Faltan Docs de Producción','Sin faltantes detectados']){
    assert.ok(js.includes(expected),expected);
  }
});

test('expone filtros por faltantes verificables del modulo',()=>{
  for(const value of ['falta_archivo_pvo','falta_ppns','sin_documentos','sin_pvo','sin_visita','sin_cubos','sin_asesor','sin_supervisor','sin_estatus_produccion']){
    assert.ok(js.includes(`value="${value}"`),value);
    assert.ok(repo.includes(`vista==='${value}'`),value+' backend');
  }
});

test('todas las diez columnas del main permiten orden ascendente y descendente',()=>{
  for(const key of ['docs','proyecto','asesor','supervisor','fecha_pvo','fecha_visita','fecha_cubos','semana','comentario','estatus']){
    assert.ok(js.includes(`sortTh('${key}'`),key);
  }
  assert.match(js,/state\.mainSort\.direction==='asc'\?'desc':'asc'/);
  assert.match(js,/localeCompare\(String\(bv\),'es'/);
});

test('el orden inicial es semana reciente y PVO ascendente con vacios al final',()=>{
  assert.match(repo,/COALESCE\(p\.anio_registro,0\) DESC/);
  assert.match(repo,/COALESCE\(p\.semana_registro,0\) DESC/);
  assert.match(repo,/CASE WHEN \$\{pvoDateExpr\} IS NULL THEN 1 ELSE 0 END ASC/);
  assert.match(repo,/\$\{pvoDateExpr\} ASC/);
});

test('estilos y cache bust del modulo quedan actualizados sin revertir dashboard logistica',()=>{
  assert.match(css,/\.lp-indicator-legend/);
  assert.match(css,/\.lp-sort/);
  assert.match(loader,/20260923-pvo-nuevo-busqueda-calendario-v001/);
  assert.match(loader,/20260923-dashboard-ppns-final-v001/);
});

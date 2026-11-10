'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {parsePart,normalize,bump,read,releaseDate}=require('../tools/release-version');
const root=path.resolve(__dirname,'..');

test('Nomenclatura nueva DDMMYY.API.DDMMYY.FE corresponde a manifiestos',()=>{
  const state=read();
  assert.equal(state.api,'101126.3');
  assert.equal(state.frontend,'101126.1');
  assert.equal(state.combined,'101126.3.101126.1');
  assert.match(fs.readFileSync(path.join(root,'tools/generate-build-info.js'),'utf8'),/readReleaseVersion/);
});
test('Solo front incrementa su contador sin tocar API',()=>{
  const s=read();
  assert.deepEqual(bump('frontend',s,'091126'),
    {api:'101126.3',frontend:'091126.1',combined:'101126.3.091126.1'});
});
test('Al cambiar de fecha el front reinicia revision y API permanece estable',()=>{
  const s=read();
  assert.deepEqual(bump('frontend',s,'101126'),
    {api:'101126.3',frontend:'101126.2',combined:'101126.3.101126.2'});
});
test('Cambio de API incrementa base y reinicia revision frontend',()=>{
  const s=read();
  assert.deepEqual(bump('api',s,'091126'),
    {api:'091126.1',frontend:'091126.1',combined:'091126.1.091126.1'});
  assert.deepEqual(bump('api',s,'101126'),
    {api:'101126.4',frontend:'101126.1',combined:'101126.4.101126.1'});
});
test('El formato rechaza fechas y revisiones invalidas',()=>{
  for(const value of ['311126.1','091326.1','091126.0','110926','-091126.1','091126.1.1']){
    assert.throws(()=>parsePart(value),Error);
  }
  assert.throws(()=>normalize({version:'091126.6'},{apiVersion:'091126.5',version:'091126.1'}));
});
test('La fecha del corte de America/Mexico_City se interpreta correctamente',()=>{
  assert.equal(releaseDate(new Date('2026-11-10T02:00:00Z')),'091126');
  assert.equal(releaseDate(new Date('2026-11-10T07:00:00Z')),'101126');
});
test('Ambos YML aplican un verificador y tienen triggers selectivos del manifiesto',()=>{
  const pages=fs.readFileSync(path.join(root,'.github/workflows/pages.yml'),'utf8');
  const api=fs.readFileSync(path.join(root,'.github/workflows/main_mantto-gestor-api.yml'),'utf8');
  assert.match(pages,/config\/releases\/frontend\.json/);
  assert.doesNotMatch(pages,/config\/releases\/api\.json/);
  assert.match(api,/config\/releases\/api\.json/);
  assert.doesNotMatch(api,/config\/releases\/frontend\.json/);
  assert.match(pages,/node tools\/release-version\.js verify/);
  assert.match(api,/node tools\/release-version\.js verify/);
});

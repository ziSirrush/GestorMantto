'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {parsePart,normalize,bump,read,releaseDate}=require('../tools/release-version');
const {generate:generateBuildInfo}=require('../tools/generate-build-info');
const root=path.resolve(__dirname,'..');

test('Nomenclatura DDMMYY.API.DDMMYY.FE corresponde a manifiestos',()=>{
  const state=read();
  const api=parsePart(state.api);
  const frontend=parsePart(state.frontend);
  assert.equal(state.combined,state.api+'.'+state.frontend);
  assert.match(api.date,/^\d{6}$/);
  assert.match(frontend.date,/^\d{6}$/);
  assert.equal(normalize({version:'111126.7'},{apiVersion:'111126.7',version:'121126.1'}).combined,'111126.7.121126.1');
  assert.match(fs.readFileSync(path.join(root,'tools/generate-build-info.js'),'utf8'),/readReleaseVersion/);
});

test('Solo frontend incrementa su contador sin tocar API',()=>{
  const s=read(); const frontend=parsePart(s.frontend);
  const next=bump('frontend',s,frontend.date);
  assert.equal(next.api,s.api);
  assert.equal(parsePart(next.frontend).date,frontend.date);
  assert.equal(parsePart(next.frontend).revision,frontend.revision+1);
});

test('Al cambiar de fecha el frontend reinicia revision y API permanece estable',()=>{
  const s=read(); const next=bump('frontend',s,'131126');
  assert.equal(next.api,s.api);
  assert.equal(next.frontend,'131126.1');
});

test('Cambio de API incrementa API y reinicia Frontend enlazado',()=>{
  const s=read(); const api=parsePart(s.api);
  const same=bump('api',s,api.date);
  assert.equal(parsePart(same.api).revision,api.revision+1);
  assert.equal(same.frontend,api.date+'.1');
  assert.equal(same.combined,same.api+'.'+same.frontend);
  assert.deepEqual(bump('api',s,'131126'),{
    api:'131126.1',frontend:'131126.1',combined:'131126.1.131126.1'
  });
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

test('YML separados validan la combinación y escuchan solo su manifiesto',()=>{
  const pages=fs.readFileSync(path.join(root,'.github/workflows/pages.yml'),'utf8');
  const api=fs.readFileSync(path.join(root,'.github/workflows/main_mantto-gestor-api.yml'),'utf8');
  assert.match(pages,/Validar nomenclatura API \+ Frontend/);
  assert.match(api,/Validar nomenclatura API \+ Frontend/);
  assert.match(pages,/config\/releases\/frontend\.json/);
  assert.doesNotMatch(pages,/config\/releases\/api\.json/);
  assert.match(api,/config\/releases\/api\.json/);
  assert.doesNotMatch(api,/config\/releases\/frontend\.json/);
  assert.match(pages,/node tools\/release-version\.js verify/);
  assert.match(api,/node tools\/release-version\.js verify/);
  assert.equal(fs.existsSync(path.join(root,'.github/workflows/commit-version.yml')),false);
});

test('Build publicado muestra API + Frontend y no una tercera versión global',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'blt-build-info-'));
  try{
    const output=path.join(dir,'build-info.generated.js');
    const payload=generateBuildInfo({
      output,
      commit:'a'.repeat(40),
      message:'Version 111126.1.111126.1',
      provider:'GITHUB_PAGES',
      generatedAt:'2026-11-11T06:30:00.000Z'
    });
    const release=read();
    assert.equal(payload.version,release.combined);
    assert.equal(payload.apiVersion,release.api);
    assert.equal(payload.frontendVersion,release.frontend);
    assert.equal(Object.prototype.hasOwnProperty.call(payload,'deploymentVersion'),false);
    assert.ok(fs.readFileSync(output,'utf8').includes('"version": "'+release.combined+'"'));
  }finally{
    fs.rmSync(dir,{recursive:true,force:true});
  }
});

'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {parsePart,normalize,bump,read,releaseDate,classifyChanges,verifyTransition}=require('../tools/release-version');
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

const fixture=normalize({version:'181126.7'},{apiVersion:'181126.7',version:'191126.18'});
const at=(api,frontend)=>normalize({version:api},{apiVersion:api,version:frontend});
test('Solo frontend incrementa su contador sin tocar API',()=>{
  assert.deepEqual(bump('frontend',fixture,'191126'),at('181126.7','191126.19'));
  assert.deepEqual(bump('frontend',fixture,'201126'),at('181126.7','201126.1'));
});

test('Solo API conserva la fecha y el consecutivo completos de Frontend',()=>{
  assert.deepEqual(bump('api',fixture,'181126'),at('181126.8','191126.18'));
  assert.deepEqual(bump('api',fixture,'191126'),at('191126.1','191126.18'));
  assert.deepEqual(bump('api',fixture,'201126'),at('201126.1','191126.18'));
});

test('Ambos componentes avanzan independientemente en la misma publicacion',()=>{
  assert.deepEqual(bump('both',fixture,'191126'),at('191126.1','191126.19'));
  assert.deepEqual(bump('both',at('191126.4','181126.7'),'191126'),at('191126.5','191126.1'));
  assert.deepEqual(bump('both',at('191126.4','191126.8'),'191126'),at('191126.5','191126.9'));
  assert.deepEqual(bump('both',fixture,'201126'),at('201126.1','201126.1'));
  assert.throws(()=>bump('both',fixture,'181126'),/retroceder/);
});

test('La validacion de cambios funcionales distingue API, Frontend, ambos y metadata',()=>{
  const api=['backend/src/app.js','config/releases/api.json','config/releases/frontend.json'];
  const fe=['modules/ejemplo.js','config/releases/frontend.json'];
  const none=['config/releases/frontend.json','tools/release-version.js','tests/ejemplo.test.js','backend/tests/ejemplo.test.js','docs/ejemplo.md','core/build-info.generated.js'];
  assert.deepEqual(classifyChanges(api),{api:true,frontend:false});
  assert.deepEqual(classifyChanges(fe),{api:false,frontend:true});
  assert.deepEqual(classifyChanges([...api,...fe]),{api:true,frontend:true});
  assert.deepEqual(classifyChanges(none),{api:false,frontend:false});
  assert.deepEqual(classifyChanges(['tools/build-frontend.js']),{api:false,frontend:true});
  assert.deepEqual(classifyChanges(['backend/package-lock.json']),{api:true,frontend:false});
  const options={date:'191126'};
  assert.deepEqual(verifyTransition(fixture,at('191126.1','191126.18'),api,options),at('191126.1','191126.18'));
  assert.throws(()=>verifyTransition(fixture,at('191126.1','191126.1'),api,options),/Versionado independiente/);
  assert.throws(()=>verifyTransition(fixture,at('191126.1','191126.19'),api,options),/Versionado independiente/);
  assert.deepEqual(verifyTransition(fixture,at('181126.7','191126.19'),fe,options),at('181126.7','191126.19'));
  assert.throws(()=>verifyTransition(fixture,fixture,fe,options),/Versionado independiente/);
  assert.deepEqual(verifyTransition(fixture,at('191126.1','191126.19'),[...api,...fe],options),at('191126.1','191126.19'));
  assert.throws(()=>verifyTransition(fixture,at('191126.1','191126.18'),[...api,...fe],options),/Versionado independiente/);
  assert.deepEqual(verifyTransition(fixture,fixture,none,options),fixture);
  assert.throws(()=>verifyTransition(fixture,at('181126.7','191126.19'),none,options),/Versionado independiente/);
});

test('Regularizacion historica solo desde el padre autorizado y sin cambios funcionales',()=>{
  const before=at('241126.4','241126.2'),after=at('241126.4','241126.5');
  const opts={date:'241126',parentSha:'72e1e641dc860753a4d74ccc942710d3fa95d790'};
  assert.deepEqual(verifyTransition(before,after,['config/releases/frontend.json','tools/release-version.js'],opts),after);
  assert.throws(()=>verifyTransition(before,after,['config/releases/frontend.json'],{...opts,parentSha:'x'}),/Versionado independiente/);
  assert.throws(()=>verifyTransition(before,after,['modules/ejemplo.js'],opts),/Versionado independiente/);
  assert.throws(()=>verifyTransition(before,at('241126.4','241126.6'),[],opts),/Versionado independiente/);
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
  assert.match(pages,/fetch-depth: 2/);
  assert.match(api,/fetch-depth: 2/);
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

'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {
  parsePart,normalize,bump,read,releaseDate,
  commitVersionDate,parseOfficialVersion,parseOfficialSubject,nextOfficialRevision
}=require('../tools/release-version');
const root=path.resolve(__dirname,'..');

test('Metadatos de despliegue API/Frontend conservan su contrato técnico',()=>{
  const state=read();
  const api=parsePart(state.api);
  const frontend=parsePart(state.frontend);
  assert.equal(state.combined,state.api+'.'+state.frontend);
  assert.equal(frontend.date,api.date);
  assert.match(fs.readFileSync(path.join(root,'tools/generate-build-info.js'),'utf8'),/readReleaseVersion/);
});

test('Bump técnico de frontend no toca API',()=>{
  const s=read(); const api=parsePart(s.api); const frontend=parsePart(s.frontend);
  const next=bump('frontend',s,frontend.date);
  assert.equal(next.api,s.api);
  assert.equal(parsePart(next.frontend).date,frontend.date);
  assert.equal(parsePart(next.frontend).revision,frontend.revision+1);
});

test('Formato oficial de commit es MMDDYY.N',()=>{
  assert.deepEqual(parseOfficialSubject('Version 111026.2'),{date:'111026',revision:2,version:'111026.2'});
  assert.deepEqual(parseOfficialVersion('111026.9'),{date:'111026',revision:9,version:'111026.9'});
  for(const value of ['Version 101126.19.101126.3','Version 131026.1','Fix Call Center','Version 113126.1']){
    assert.throws(()=>parseOfficialSubject(value),Error);
  }
});

test('Consecutivo oficial es global e ignora títulos legacy',()=>{
  const subjects=[
    'Version 111026.1',
    'Version 111026.1',
    'Version 101126.19.101126.3',
    'Fix Call Center U365 endpoints y navegacion'
  ];
  assert.equal(nextOfficialRevision(subjects,'111026'),2);
  assert.equal(nextOfficialRevision(subjects,'111126'),1);
});

test('Fecha oficial usa America/Mexico_City en MMDDYY',()=>{
  assert.equal(commitVersionDate(new Date('2026-11-10T02:00:00Z')),'110926');
  assert.equal(commitVersionDate(new Date('2026-11-10T07:00:00Z')),'111026');
});

test('Fecha técnica heredada permanece DDMMYY para manifiestos',()=>{
  assert.equal(releaseDate(new Date('2026-11-10T02:00:00Z')),'091126');
  assert.equal(releaseDate(new Date('2026-11-10T07:00:00Z')),'101126');
});

test('Manifiestos técnicos siguen validando fechas y revisiones',()=>{
  for(const value of ['311126.1','091326.1','091126.0','110926','-091126.1','091126.1.1']){
    assert.throws(()=>parsePart(value),Error);
  }
  assert.throws(()=>normalize({version:'091126.6'},{apiVersion:'091126.5',version:'091126.1'}));
});

test('CI valida nomenclatura oficial y existe guard global de historial',()=>{
  const pages=fs.readFileSync(path.join(root,'.github/workflows/pages.yml'),'utf8');
  const api=fs.readFileSync(path.join(root,'.github/workflows/main_mantto-gestor-api.yml'),'utf8');
  const guard=fs.readFileSync(path.join(root,'.github/workflows/commit-version.yml'),'utf8');
  assert.match(pages,/Validar nomenclatura oficial/);
  assert.match(api,/Validar nomenclatura oficial/);
  assert.match(pages,/node tools\/release-version\.js verify/);
  assert.match(api,/node tools\/release-version\.js verify/);
  assert.match(guard,/fetch-depth: 0/);
  assert.match(guard,/node tools\/release-version\.js verify-history/);
});

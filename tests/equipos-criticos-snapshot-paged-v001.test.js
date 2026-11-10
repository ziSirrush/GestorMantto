'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const front=fs.readFileSync(path.resolve(__dirname,'../modules/equipos-criticos/equipos-criticos.js'),'utf8');

test('Equipos Críticos usa snapshots paginados ya enriquecidos',()=>{
  assert.match(front,/state\.pro\.rows = Array\.isArray\(data\.data\)/);
  assert.doesNotMatch(front,/\/api\/indicadores\/mtbc\/proyectos/);
  assert.doesNotMatch(front,/\/api\/indicadores\/mtbc\/equipos/);
});

test('U365 es lazy y usa MTBC incluido en criticidad corporativa',()=>{
  assert.match(front,/u365:\{ rows:\[\], expanded:false, loaded:false, loading:false \}/);
  assert.match(front,/if\(opening&&!state\.u365\.loaded/);
  assert.doesNotMatch(front,/enrichEquipmentMtbc_uni/);
});

test('Preferencias iniciales salen de sesión; PATCH de guardado se conserva',()=>{
  const loadStart=front.indexOf('async function loadUserPreferences');
  const loadEnd=front.indexOf('async function saveUserPreferences',loadStart);
  const load=front.slice(loadStart,loadEnd);
  assert.doesNotMatch(load,/\/api\/usuarios\/me\/criticos-preferencias/);
  assert.match(front,/method:'PATCH'/);
});

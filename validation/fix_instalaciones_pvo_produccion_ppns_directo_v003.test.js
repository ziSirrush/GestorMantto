'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const repo=fs.readFileSync(path.join(root,'backend/src/modules/logistica-produccion/logistica-produccion.repository.js'),'utf8');

function byPpnsBlock(){
  const start=repo.indexOf('async function byPpnsExact');
  const end=repo.indexOf('\nasync function ppnsOptions',start);
  assert.notEqual(start,-1,'No se encontro byPpnsExact');
  assert.notEqual(end,-1,'No se encontro el final de byPpnsExact');
  return repo.slice(start,end);
}

test('La relacion de Detalle Proyecto es ins_fl.id_proyecto contra logistica_produccion.ppns',()=>{
  const block=byPpnsBlock();
  assert.match(block,/TRIM\(p\.ppns\)=TRIM\(ip\.id_proyecto\)/);
});

test('id_log_ops no es requisito para recuperar el proyecto',()=>{
  const block=byPpnsBlock();
  assert.doesNotMatch(block,/p\.id_log_ops\s+IS\s+NOT\s+NULL/i);
});

test('La consulta sigue validando que el id_proyecto exista activo en ins_fl',()=>{
  const block=byPpnsBlock();
  assert.match(block,/FROM ins_fl ip/);
  assert.match(block,/ip\.activo=1/);
  assert.match(block,/TRIM\(ip\.id_proyecto\)=TRIM\(\?\)/);
});

test('Las fechas de Instalaciones se agregan usando logistica_produccion.ppns',()=>{
  assert.match(repo,/LEFT JOIN \(\$\{FL_AGG\}\) fl ON fl\.id_proyecto=TRIM\(p\.ppns\)/);
});

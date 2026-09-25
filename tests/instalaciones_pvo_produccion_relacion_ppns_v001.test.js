'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const repoFile=path.resolve(__dirname,'../backend/src/modules/logistica-produccion/logistica-produccion.repository.js');
const source=fs.readFileSync(repoFile,'utf8');

function byPpnsBlock(){
  const start=source.indexOf('async function byPpnsExact');
  const end=source.indexOf('\nasync function ppnsOptions',start);
  assert.notEqual(start,-1,'Debe existir byPpnsExact');
  assert.notEqual(end,-1,'Debe terminar antes de ppnsOptions');
  return source.slice(start,end);
}

test('relaciona Detalle Proyecto con PVO-Produccion por PPNS',()=>{
  const block=byPpnsBlock();
  assert.match(block,/FROM ins_fl ip/);
  assert.match(block,/TRIM\(ip\.id_proyecto\)=TRIM\(\?\)/);
  assert.match(block,/TRIM\(l\.id_ppns\)=TRIM\(ip\.id_proyecto\)/);
});

test('solo considera registros activos de Instalaciones y PVO-Produccion',()=>{
  const block=byPpnsBlock();
  assert.match(block,/p\.activo=1/);
  assert.match(block,/ip\.activo=1/);
});

test('mantiene id_log_ops como identificador del registro logistico',()=>{
  const block=byPpnsBlock();
  assert.match(block,/p\.id_log_ops IS NOT NULL/);
  assert.match(block,/ORDER BY l\.id_log_ops ASC,p\.id_produccion ASC/);
});

test('usa EXISTS para no duplicar filas por multiples equipos de ins_fl',()=>{
  const block=byPpnsBlock();
  assert.match(block,/AND EXISTS \(/);
});

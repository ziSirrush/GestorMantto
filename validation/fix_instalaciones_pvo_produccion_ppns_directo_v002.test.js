'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const repo=fs.readFileSync(path.join(root,'backend/src/modules/logistica-produccion/logistica-produccion.repository.js'),'utf8');
const service=fs.readFileSync(path.join(root,'backend/src/modules/logistica-produccion/logistica-produccion.service.js'),'utf8');
const sql=fs.readFileSync(path.join(root,'database/fixes/20260925_fix_logistica_produccion_ppns_directo_v002.sql'),'utf8');

test('Detalle de proyecto relaciona ins_fl.id_proyecto contra logistica_produccion.ppns',()=>{
  assert.match(repo,/TRIM\(p\.ppns\)=TRIM\(ip\.id_proyecto\)/);
  assert.doesNotMatch(repo,/TRIM\(l\.id_ppns\)=TRIM\(ip\.id_proyecto\)/);
});

test('Las fechas de Instalaciones se agregan usando el PPNS persistido en PVO-Produccion',()=>{
  assert.match(repo,/LEFT JOIN \(\$\{FL_AGG\}\) fl ON fl\.id_proyecto=TRIM\(p\.ppns\)/);
});

test('Las altas nuevas persisten el PPNS del registro logistico',()=>{
  assert.match(service,/const sourcePpns=requiredText\(source\.id_ppns,'PPNS del registro logístico',255\)/);
  assert.match(service,/ppns:sourcePpns/);
});

test('Cambiar id_log_ops actualiza tambien el PPNS persistido',()=>{
  assert.match(service,/next\.ppns=requiredText\(source\.id_ppns,'PPNS del registro logístico',255\)/);
});

test('El backfill solo completa PPNS nulos o vacios y no cambia esquema',()=>{
  assert.match(sql,/UPDATE logistica_produccion p/);
  assert.match(sql,/SET p\.ppns=TRIM\(l\.id_ppns\)/);
  assert.match(sql,/p\.ppns IS NULL OR TRIM\(p\.ppns\)=''/);
  assert.doesNotMatch(sql,/\b(?:CREATE|ALTER|DROP)\s+TABLE\b/i);
});

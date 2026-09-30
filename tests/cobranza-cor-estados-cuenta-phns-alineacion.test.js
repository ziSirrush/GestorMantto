'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const ROOT=path.resolve(__dirname,'..');
const read=relative=>fs.readFileSync(path.join(ROOT,relative),'utf8');
const slice=(text,a,b)=>text.slice(text.indexOf(a),text.indexOf(b,text.indexOf(a)));

test('PHNS final conserva solo IDs P de log_ops.ph_ns normalizados y sin duplicados en el resumen',()=>{
  const frontend=read('modules/cobranza-cor/cobranza-cor-estados-cuenta-form.js');
  assert.match(frontend,/function logOpsEquipmentIds_cor\(\)/);assert.match(frontend,/\.split\(','\)/);assert.match(frontend,/\^P\\d\+\$/);assert.match(frontend,/seen\.has\(id\)/);
  assert.match(frontend,/function normalizedLogOpsPhns_cor/);
});

test('Plantilla muestra equipos de ins_fl y permite relacion PHNS sin reintroducir Alineacion ni Ubicacion Torre',()=>{
  const frontend=read('modules/cobranza-cor/cobranza-cor-estados-cuenta-form.js');
  const shell=slice(frontend,'function renderShell_cor','function partidaCurrencyOptions_cor');
  assert.doesNotMatch(shell,/data-equipo-insfl|Ubicaci[oó]n \/ Torre|Alineaci[oó]n por PHNS/);
  assert.match(shell,/Los equipos se leen de ins_fl/);
  assert.match(frontend,/data-equipo-logops/);
  assert.match(frontend,/id="ccor-ec-form-manual-ref"/);
  assert.match(frontend,/id="ccor-ec-form-manual-phns"/);
});

test('Cache bust usa FIX equipos validacion 100 V001 sin tocar el CSS consolidado',()=>{
  const loader=read('core/module-loader.js');
  assert.match(loader,/cobranza-cor-estados-cuenta-form\.css\?v=20260930-cobranza-consolidacion-f3-v001/);
  assert.match(loader,/cobranza-cor-estados-cuenta-form\.js\?v=20260930-equipos-validacion100-v001/);
});

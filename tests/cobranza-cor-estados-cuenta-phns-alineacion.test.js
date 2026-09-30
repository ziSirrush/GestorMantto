
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const ROOT=path.resolve(__dirname,'..');
const read=relative=>fs.readFileSync(path.join(ROOT,relative),'utf8');
const slice=(text,a,b)=>text.slice(text.indexOf(a),text.indexOf(b,text.indexOf(a)));

test('Equipos final usa IDs P de log_ops ph_ns y elimina duplicados',()=>{
  const frontend=read('modules/cobranza-cor/cobranza-cor-estados-cuenta-form.js');
  assert.match(frontend,/function logOpsEquipmentIds_cor\(\)/);assert.match(frontend,/\.split\(','\)/);assert.match(frontend,/\^P\\d\+\$/);assert.match(frontend,/seen\.has\(id\)/);
});

test('Plantilla ya no permite alineacion manual ni Ubicacion Torre',()=>{
  const frontend=read('modules/cobranza-cor/cobranza-cor-estados-cuenta-form.js');
  const shell=slice(frontend,'function renderShell_cor','function partidaCurrencyOptions_cor');
  assert.doesNotMatch(shell,/data-equipo-insfl|data-equipo-logops|Ubicaci[oó]n \/ Torre|Alineaci[oó]n por PHNS/);
  assert.match(shell,/Fuente: log_ops\.ph_ns/);
});

test('Cache bust usa consolidacion F3',()=>{
  const loader=read('core/module-loader.js');const index=read('index.html');
  assert.match(loader,/cobranza-cor-estados-cuenta-form\.css\?v=20260930-cobranza-consolidacion-f3-v001/);
  assert.match(loader,/cobranza-cor-estados-cuenta-form\.js\?v=20260930-cobranza-consolidacion-f3-v001/);
  assert.match(index,/core\/module-loader\.js\?v=20260930-cobranza-facturas-f4-v001/);
});

'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');

const ROOT=path.resolve(__dirname,'..');
const read=relative=>fs.readFileSync(path.join(ROOT,relative),'utf8');

test('Alineacion usa PHNS y no IDs de fila como criterio',()=>{
  const frontend=read('modules/cobranza-cor/cobranza-cor-estados-cuenta-form.js');
  assert.match(frontend,/function normalizePhns_cor/);
  assert.match(frontend,/function splitLogOpsPhns_cor/);
  assert.match(frontend,/\.split\(','\)/);
  assert.match(frontend,/row&&row\.referencia_sitio/);
  assert.match(frontend,/splitLogOpsPhns_cor\(log\.ph_ns\)/);
  assert.match(frontend,/phnsLog\.includes\(phnsIns\)/);
});

test('Equipos permite seleccionar manualmente PHNS de Instalaciones y Logistica',()=>{
  const frontend=read('modules/cobranza-cor/cobranza-cor-estados-cuenta-form.js');
  assert.match(frontend,/data-equipo-insfl/);
  assert.match(frontend,/data-equipo-logops/);
  assert.match(frontend,/PHNS Instalaciones \/ Referencia/);
  assert.match(frontend,/PHNS Log/);
  assert.match(frontend,/exactLogOpsIdForPhns_cor/);
});

test('Diferencias de fuente se muestran hasta alinear ambos conjuntos',()=>{
  const frontend=read('modules/cobranza-cor/cobranza-cor-estados-cuenta-form.js');
  const css=read('modules/cobranza-cor/cobranza-cor-estados-cuenta-form.css');
  assert.match(frontend,/missingInIns/);
  assert.match(frontend,/onlyInIns/);
  assert.match(frontend,/Instalaciones:/);
  assert.match(frontend,/Revisar posici/);
  assert.match(css,/tr\.is-phns-mismatch td/);
  assert.match(css,/tr\.is-phns-incomplete td/);
});

test('Comparacion se refresca cada 60 segundos sin cambiar la norma de scroll de tablas',()=>{
  const frontend=read('modules/cobranza-cor/cobranza-cor-estados-cuenta-form.js');
  const css=read('modules/cobranza-cor/cobranza-cor-estados-cuenta-form.css');
  assert.match(frontend,/const EQUIPMENT_ALIGNMENT_REFRESH_MS=60000/);
  assert.match(frontend,/window\.setInterval/);
  assert.match(frontend,/refreshEquipmentSources_cor\(\{silent:true\}\)/);
  assert.match(css,/\.ccor-ec-form-section \.ccor-ec-table-wrap\{[\s\S]*?overflow-x:auto!important/);
  assert.match(css,/\.ccor-ec-form-equipment-table\{[\s\S]*?min-width:1320px!important/);
});

test('Cache bust carga el formulario PHNS V001',()=>{
  const loader=read('core/module-loader.js');
  const index=read('index.html');
  assert.match(loader,/cobranza-cor-estados-cuenta-form\.css\?v=20260925-equipos-phns-v001/);
  assert.match(loader,/cobranza-cor-estados-cuenta-form\.js\?v=20260925-equipos-phns-v001/);
  assert.match(index,/core\/module-loader\.js\?v=20260925-cobranza-equipos-phns-v001/);
});

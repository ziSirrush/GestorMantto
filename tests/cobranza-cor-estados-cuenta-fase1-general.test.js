
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const ROOT=path.resolve(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(ROOT,rel),'utf8');

test('Fase 1 registra cobranza_partidas_cor y el IVA general',()=>{
  const repository=read('backend/src/modules/cobranza-cor/cobranza-cor.repository.js');
  const service=read('backend/src/modules/cobranza-cor/cobranza-cor.service.js');
  assert.match(repository,/partidas:\s*'cobranza_partidas_cor'/);
  assert.match(repository,/'iva_general_pct'/);
  assert.match(repository,/listPartidasEstadoCuenta_cor/);
  assert.match(repository,/lockPartidasEstadoCuentaPpns_cor/);
  assert.match(repository,/updatePartidaEstadoCuenta_cor/);
  assert.match(service,/IVA_GENERAL_ALLOWED_COR\s*=\s*Object\.freeze\(\[0, 0\.08, 0\.16\]\)/);
  assert.match(service,/PARTIDA_CURRENCIES_COR\s*=\s*new Set\(\['MXN', 'USD', 'EUR'\]\)/);
});

test('General expone IVA 0 8 16 y N partidas monetarias',()=>{
  const frontend=read('modules/cobranza-cor/cobranza-cor-estados-cuenta-form.js');
  assert.match(frontend,/id="ccor-ec-form-iva-general"/);
  assert.match(frontend,/>0%<\/option>/);assert.match(frontend,/>8%<\/option>/);assert.match(frontend,/>16%<\/option>/);
  assert.match(frontend,/id="ccor-ec-form-add-partida"/);
  assert.match(frontend,/data-partida-field="moneda"/);
  assert.match(frontend,/data-partida-field="monto_base"/);
  assert.match(frontend,/state\.partidas\.push\(emptyPartida_cor\(\)\)/);
  assert.match(frontend,/Varias partidas de la misma moneda se suman/);
});

test('Partidas permiten repetir moneda y se agregan por moneda para el 100 base',()=>{
  const frontend=read('modules/cobranza-cor/cobranza-cor-estados-cuenta-form.js');
  const service=read('backend/src/modules/cobranza-cor/cobranza-cor.service.js');
  assert.match(frontend,/totals\.set\(currency,\(totals\.get\(currency\)\|\|0\)\+amount\)/);
  assert.doesNotMatch(frontend,/moneda.*duplicad|duplicad.*moneda/i);
  assert.doesNotMatch(service,/moneda.*duplicad|duplicad.*moneda/i);
});

test('Crear y Editar persisten partidas sin tocar el Detalle',()=>{
  const service=read('backend/src/modules/cobranza-cor/cobranza-cor.service.js');
  const detail=read('modules/cobranza-cor/cobranza-cor-estados-cuenta.js');
  assert.match(service,/repository\.TABLES_COR\.partidas/);
  assert.match(service,/partidas_creadas/);assert.match(service,/partidas_actualizadas/);assert.match(service,/partidas_desactivadas/);
  assert.doesNotMatch(detail,/ccor-ec-form-add-partida|cobranza_partidas_cor/);
});

test('Fases acumuladas mantienen General y dejan Facturas Pagos para Detalle',()=>{
  const frontend=read('modules/cobranza-cor/cobranza-cor-estados-cuenta-form.js');
  assert.match(frontend,/function logOpsEquipmentIds_cor/);
  assert.match(frontend,/Se llenará desde Facturas relacionadas/);
  assert.match(frontend,/Facturación, pagos y sus estatus quedan fuera de Crear\/Editar/);
});

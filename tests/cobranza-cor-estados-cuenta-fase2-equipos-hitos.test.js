
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const ROOT=path.resolve(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(ROOT,rel),'utf8');
const slice=(text,a,b)=>text.slice(text.indexOf(a),text.indexOf(b,text.indexOf(a)));

test('Fase 2 Equipos usa log_ops.ph_ns sin Alineacion ni Ubicacion Torre en la plantilla',()=>{
  const form=read('modules/cobranza-cor/cobranza-cor-estados-cuenta-form.js');
  assert.match(form,/function logOpsEquipmentIds_cor\(\)/);
  assert.match(form,/String\(row&&row\.ph_ns\|\|''\)\.split\(','\)/);
  assert.match(form,/\^P\\d\+\$/);assert.match(form,/seen\.has\(id\)/);
  const shell=slice(form,'function renderShell_cor','function partidaCurrencyOptions_cor');
  assert.doesNotMatch(shell,/Alineaci[oó]n por PHNS|Ubicaci[oó]n \/ Torre|data-equipo-insfl|data-equipo-logops/);
  assert.match(shell,/Fuente: log_ops\.ph_ns/);
});

test('Hitos finales conservan solo captura propia y Factura informativa',()=>{
  const form=read('modules/cobranza-cor/cobranza-cor-estados-cuenta-form.js');
  const render=slice(form,'function renderHitos_cor','function syncTotalFromAmounts_cor');
  for(const field of ['orden_hito','condicion','porcentaje','anio_proyecto','moneda','subtotal','iva','total','factura','fecha_vencimiento','dias_vencimiento','estimado_pago','fecha_programada','fecha_notificada']) assert.match(render,new RegExp(field));
  assert.match(render,/factura',row\.factura,'maxlength="150" readonly/);
  for(const field of ['pago_total','estatus_factura','fecha_pago','estatus_vencimiento','estatus_hito']) assert.doesNotMatch(render,new RegExp(field));
  assert.doesNotMatch(render,/data-hito-field="activo"|created_at|created_by|updated_at|updated_by/);
});

test('Moneda de Hito sale de Partidas General y porcentaje suma 100 por moneda',()=>{
  const form=read('modules/cobranza-cor/cobranza-cor-estados-cuenta-form.js');
  const service=read('backend/src/modules/cobranza-cor/cobranza-cor.service.js');
  assert.match(form,/function activeGeneralCurrencies_cor\(\)/);assert.match(form,/state\.partidas/);assert.match(form,/deben sumar exactamente 100%/);
  assert.match(service,/activePartidaTotals_cor/);assert.match(service,/applyHitoFinancialRules_cor/);assert.match(service,/deben sumar exactamente 100%/);
});

test('Subtotal IVA Total se calculan desde Base General y el IVA general',()=>{
  const form=read('modules/cobranza-cor/cobranza-cor-estados-cuenta-form.js');
  const service=read('backend/src/modules/cobranza-cor/cobranza-cor.service.js');
  assert.match(form,/generalBaseByCurrency_cor/);assert.match(form,/base\*\(pct\/100\)/);
  assert.match(service,/totals\.get\(currency\) \* hito\.porcentaje/);assert.match(service,/subtotal \* input\.iva_general_pct/);
});

test('Año NULL ya no se serializa como 0',()=>{
  const service=read('backend/src/modules/cobranza-cor/cobranza-cor.service.js');
  assert.match(service,/function integerOrNull_cor\(value\) \{\s*if \(value === undefined \|\| value === null \|\| value === ''\) return null;/);
});

test('Equipos manuales dejan de ser requisito y no se implementa Pagos TDC',()=>{
  const service=read('backend/src/modules/cobranza-cor/cobranza-cor.service.js');
  const form=read('modules/cobranza-cor/cobranza-cor-estados-cuenta-form.js');
  assert.match(service,/if \(input\.equipos\.length\) await validateEstadoCuentaEquipos_cor/);
  assert.doesNotMatch(service,/Selecciona al menos un equipo del PPNS/);
  assert.match(form,/const equipos=\[\];/);
  assert.doesNotMatch(form,/tipo_cambio|tdc_dia|pagos_parciales|tabla_pagos/);
});

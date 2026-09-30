'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const ROOT=path.resolve(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(ROOT,rel),'utf8');
const slice=(text,a,b)=>text.slice(text.indexOf(a),text.indexOf(b,text.indexOf(a)));

test('Equipos usa ins_fl como filas y log_ops.ph_ns como relacion PHNS sin Ubicacion Torre',()=>{
  const form=read('modules/cobranza-cor/cobranza-cor-estados-cuenta-form.js');
  assert.match(form,/state\.equipos=mergeEquipos_cor\(Array\.isArray\(selection&&selection\.equipos\)/);
  assert.match(form,/function logOpsEquipmentIds_cor\(\)/);
  assert.match(form,/function normalizedLogOpsPhns_cor/);
  assert.match(form,/\^P\\d\+\$/);
  const shell=slice(form,'function renderShell_cor','function partidaCurrencyOptions_cor');
  assert.doesNotMatch(shell,/Alineaci[oó]n por PHNS|Ubicaci[oó]n \/ Torre|data-equipo-insfl/);
  assert.match(shell,/Los equipos se leen de ins_fl/);
  assert.match(form,/data-equipo-logops/);
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
  assert.match(form,/function renderCurrencyValidation_cor/);assert.match(form,/100% \/ 100%/);
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

test('Relaciones de equipos son opcionales pero vuelven a persistirse al capturarlas',()=>{
  const service=read('backend/src/modules/cobranza-cor/cobranza-cor.service.js');
  const form=read('modules/cobranza-cor/cobranza-cor-estados-cuenta-form.js');
  assert.match(service,/if \(input\.equipos\.length\) await validateEstadoCuentaEquipos_cor/);
  assert.match(form,/const equipos=\[\];[\s\S]*?state\.equipos\.forEach/);
  assert.match(form,/id_ins_fl:Number\(row\.id_ins_fl\)\|\|null/);
  assert.match(form,/id_log_ops:row\.id_log_ops\?Number\(row\.id_log_ops\):null/);
  assert.doesNotMatch(form,/tipo_cambio|tdc_dia|pagos_parciales|tabla_pagos/);
});

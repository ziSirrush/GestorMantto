
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const ROOT=path.resolve(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(ROOT,rel),'utf8');
const slice=(text,a,b)=>text.slice(text.indexOf(a),text.indexOf(b,text.indexOf(a)));

test('Fase 3 cierra Crear Editar sin mezclar Facturas Pagos o estatus derivados',()=>{
  const form=read('modules/cobranza-cor/cobranza-cor-estados-cuenta-form.js');
  const render=slice(form,'function renderHitos_cor','function syncTotalFromAmounts_cor');
  const payload=slice(form,'function collectPayload_cor','function validatePayload_cor');
  assert.match(render,/factura',row\.factura,'maxlength="150" readonly/);
  for(const field of ['pago_total','estatus_factura','fecha_pago','estatus_vencimiento','estatus_hito']){
    assert.doesNotMatch(render,new RegExp(field));
    assert.doesNotMatch(payload,new RegExp(field+'\\s*:'));
  }
  for(const field of ['orden_hito','condicion','porcentaje','anio_proyecto','moneda','fecha_vencimiento','dias_vencimiento','estimado_pago','fecha_programada','fecha_notificada']) assert.match(payload,new RegExp(field));
  assert.match(form,/Facturación, pagos y sus estatus quedan fuera de Crear\/Editar/);
});

test('Backend no permite que el formulario reescriba campos que pertenecen a Facturas Pagos',()=>{
  const service=read('backend/src/modules/cobranza-cor/cobranza-cor.service.js');
  const mutation=slice(service,'function fuenteMutationRecord_cor','async function validateEstadoCuentaEquipos_cor');
  for(const field of ['factura','pago_total','estatus_factura','fecha_pago','estatus_vencimiento','estatus_hito']) assert.doesNotMatch(mutation,new RegExp(field+'\\s*:'));
  for(const field of ['fecha_vencimiento','dias_vencimiento','estimado_pago','fecha_programada','fecha_notificada']) assert.match(mutation,new RegExp(field+'\\s*:'));
  assert.doesNotMatch(service,/ESTATUS_HITO_COR/);
  assert.doesNotMatch(service,/normalizeEstatusFacturaForm_cor/);
});

test('Datos legacy de facturacion pago siguen serializandose y no se borran en Fase 3',()=>{
  const service=read('backend/src/modules/cobranza-cor/cobranza-cor.service.js');
  const serializer=slice(service,'function serializeFuenteEstadoCuenta_cor','function buildEstadoCuentaSummary_cor');
  for(const field of ['factura','pago_total','estatus_factura','fecha_pago','estatus_vencimiento','estatus_hito']) assert.match(serializer,new RegExp(field));
});

test('Proyecto Cliente son manipulables y PPNS conserva identidad',()=>{
  const form=read('modules/cobranza-cor/cobranza-cor-estados-cuenta-form.js');
  const service=read('backend/src/modules/cobranza-cor/cobranza-cor.service.js');
  const shell=slice(form,'function renderShell_cor','function partidaCurrencyOptions_cor');
  assert.match(shell,/id="ccor-ec-form-proyecto"/);
  assert.match(shell,/id="ccor-ec-form-cliente"/);
  assert.doesNotMatch(shell,/readonlyProject|readonlyClient|Proyecto \*/);
  assert.match(shell,/id="ccor-ec-form-ppns"[\s\S]*?readonly/);
  assert.doesNotMatch(service,/requiredText_cor\(payload\.proyecto/);
  assert.doesNotMatch(service,/input\.proyecto = project\.proyecto|input\.cliente = project\.cliente/);
});

test('IDs estables quedan listos para relacion Facturas de Fase 4',()=>{
  const repository=read('backend/src/modules/cobranza-cor/cobranza-cor.repository.js');
  assert.match(repository,/f\.id_fuente_cor/);
  assert.match(repository,/a\.id_aditiva_cor/);
  assert.match(repository,/facturas: 'cobranza_facturas_cor'/);
  assert.match(repository,/id_fuente_cor/);
  assert.match(repository,/id_aditiva_cor/);
});

'use strict';
// [BLT NOW | 2026-10-23 | COBRANZA_UNI_ADMIN_VENTA_ADICIONAL_FASE_1_V001]
// Pruebas puras, sin Aiven, sin SQL y sin escribir en ningun repositorio remoto.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const c = require('../backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.constants');

const root = path.resolve(__dirname, '..');
const fields = Object.fromEntries(c.PC_COLUMNS_UNI.map(col => [col.name, col]));
const expectedNames = [
  'id_pc', 'zona_adm', 'proyecto', 'id_proyecto_cobranza', 'cliente', 'ov',
  'fecha_ov', 'mes_ov', 'concepto', 'precio_venta', 'pagado_iva', 'no_pagado_iva',
  'venta_total', 'facturas_pendientes_pago', 'adeudo', 'tipo_pago', 'no_factura',
  'fecha_factura', 'mes_factura', 'terminos', 'fecha_vencimiento', 'dias_vencimiento',
  'estatus', 'estatus_administrativo', 'estatus_operativo', 'fecha_pago',
  'refacturacion_sustitucion', 'zona_operativa', 'estado',
  'comentarios_cobranza', 'estatus_cartera'
];

test('VA F1: tabla pc con 31 columnas reales y FK del DDL', () => {
  assert.deepEqual(c.PC_COLUMNS_UNI.map(col => col.name), expectedNames);
  assert.equal(c.TABLES_UNI.pc.primaryKey, 'id_pc');
  assert.equal(c.TABLES_UNI.pc.schemaReady, true);
  assert.equal(c.getTableContract_uni('pc').columns, c.PC_COLUMNS_UNI);
  assert.equal(c.getTableContract_uni('detalle_mp_2026').columns, null);
  assert.equal(fields.id_pc.sqlType, 'bigint');
  assert.equal(fields.id_pc.nullable, false);
  assert.equal(fields.id_proyecto_cobranza.sqlType, 'bigint unsigned');
  assert.equal(fields.id_proyecto_cobranza.nullable, true);
  assert.equal(c.PC_FOREIGN_KEY_UNI.referencesTable, 'cobranza_proyectos');
  assert.equal(c.PC_FOREIGN_KEY_UNI.onDelete, 'RESTRICT');
  assert.equal(c.PC_FOREIGN_KEY_UNI.onUpdate, 'CASCADE');
  assert.equal(fields.comentarios_cobranza.sqlType, 'text');
  for (const field of ['precio_venta','pagado_iva','no_pagado_iva','venta_total','adeudo']) {
    assert.equal(fields[field].sqlType, 'decimal(18,2)', field);
  }
  for (const field of ['fecha_ov','fecha_factura','fecha_vencimiento','fecha_pago']) {
    assert.equal(fields[field].sqlType, 'date', field);
  }
  assert.equal(fields.facturas_pendientes_pago.sqlType, 'int');
  assert.equal(fields.dias_vencimiento.sqlType, 'int');
  assert.equal(fields.terminos.sqlType, 'varchar(100)');
  assert.equal(fields.concepto.sqlType, 'varchar(500)');
});

test('VA F1: 15 editables, 14 calculados, dos protegidos', () => {
  assert.equal(c.PC_EDITABLE_FIELDS_UNI.length, 15);
  assert.equal(c.PC_DERIVED_FIELDS_UNI.length, 14);
  assert.deepEqual(c.PC_PROTECTED_FIELDS_UNI, ['id_pc', 'id_proyecto_cobranza']);
  assert.deepEqual(c.PC_COLUMNS_UNI.filter(x=>x.editable).map(x=>x.name),c.PC_EDITABLE_FIELDS_UNI);
  for (const name of c.PC_PROTECTED_FIELDS_UNI) {
    assert.equal(fields[name].kind, 'protected');
    assert.equal(fields[name].editable, false);
  }
  for (const [name, deps] of Object.entries(c.PC_DERIVED_DEPENDENCIES_UNI)) {
    assert.equal(fields[name].kind, 'derived');
    assert.equal(fields[name].editable, false);
    for (const dependency of deps) {
      assert.ok(fields[dependency], `${name} depende de ${dependency}`);
    }
  }
  for (const name of ['precio_venta','tipo_pago','estatus_administrativo','comentarios_cobranza']) {
    assert.equal(fields[name].editable,true,name);
  }
});

test('VA F1: encabezados Sheets A:AD tienen correspondencia unica y FK sin cabecera', () => {
  assert.equal(c.PC_SHEET_HEADERS_UNI.length, 30);
  const columnNames=c.PC_SHEET_HEADERS_UNI.map(x=>x[2]);
  const letters=c.PC_SHEET_HEADERS_UNI.map(x=>x[0]);
  assert.equal(new Set(columnNames).size,30);
  assert.equal(new Set(letters).size,30);
  assert.ok(!columnNames.includes('id_proyecto_cobranza'));
  assert.ok(c.PC_SHEET_HEADERS_UNI.some(x=>x[0]==='G'&&x[2]==='mes_ov'));
  assert.ok(c.PC_SHEET_HEADERS_UNI.some(x=>x[0]==='R'&&x[2]==='mes_factura'));
  assert.equal(fields.estatus_administrativo.sheetColumn, 'W');
  assert.equal(fields.estatus.sheetColumn, 'V');
  assert.equal(fields.estatus_cartera.sheetColumn, 'AD');
  assert.equal(fields.id_proyecto_cobranza.sheetColumn, null);
  for (const name of columnNames) assert.ok(fields[name],name);
});

test('VA F1: BUSCARV Aiven mixto, sin equiparar clientes o proyectos ambiguos', () => {
  const lookup=c.PC_LOOKUP_CONTRACT_UNI;
  assert.equal(lookup.table,'detalle_mp_2026');
  assert.equal(lookup.primary,'id_proyecto_cobranza_validado');
  assert.equal(lookup.projectFallback,'proyecto_unico_y_sin_contradicciones');
  assert.equal(lookup.termsClientFallback,'cliente_con_condiciones_consistentes');
  assert.equal(lookup.rejectAmbiguous,true);
  assert.deepEqual(lookup.fields, {
    terminos:'condiciones_pago',zona_operativa:'z_oper',
    estado:'estado',estatus_cartera:'estatus_cartera'
  });
  const mpPath=path.join(root,'backend/src/controllers/detalle-mp-2026.controller.js');
  if (fs.existsSync(mpPath)) {
    const mpSource=fs.readFileSync(mpPath,'utf8');
    for (const mpName of Object.values(lookup.fields)) {
      assert.match(mpSource,new RegExp(`\\b${mpName}\\b`), mpName);
    }
  }
});

test('VA F1: reglas de 16% IVA, RECIBO, ceros, fecha CDMX y acumulados', () => {
  const rules=c.PC_RULES_UNI;
  assert.equal(rules.timeZone,'America/Mexico_City');
  assert.equal(rules.cutOffDate,'CURRENT_DATE_IN_TIME_ZONE');
  assert.equal(rules.termUnit,'days');
  assert.equal(rules.zeroTermDays,'same_day_due');
  assert.equal(rules.nullInvoiceDate,'null_due_date');
  assert.equal(rules.vatPercent,16);
  assert.equal(rules.vatExemptPaymentType,'RECIBO');
  assert.equal(rules.administrativeOpenStatus,'Abierta');
  assert.equal(rules.administrativePaidStatus,'pagado por completo');
  assert.equal(rules.onlyOpenAccruesDue,true);
  assert.equal(rules.agingEvaluation,'on_read_and_on_write');
  assert.equal(rules.sheetMonthFormat,'MMM-YY');
  assert.equal(rules.monthLocale,'es-MX');
  assert.equal(rules.currentStatus,'CORRIENTE');
  assert.equal(rules.overdueStatus,'VENCIDO');
  assert.equal(rules.projectAggregates,'repeat_per_row_count_once_in_kpis');
  assert.equal(rules.creationIdPolicy,'explicit_id_checked_by_pk_no_auto_increment');
  assert.equal(rules.writesEnabled,false);
  assert.equal(rules.schemaOnly,false);
  assert.equal(rules.syncTriggerPolicy,'deactivate_only_after_authorized_cutover');
});

test('VA F1: contrato congelado; las rutas nuevas respetan fases posteriores', () => {
  assert.ok(Object.isFrozen(c.PC_COLUMNS_UNI));
  assert.ok(Object.isFrozen(c.PC_COLUMNS_UNI[0]));
  assert.ok(Object.isFrozen(c.PC_RULES_UNI));
  assert.ok(Object.isFrozen(c.PC_LOOKUP_CONTRACT_UNI.fields));
  assert.ok(Object.isFrozen(c.PC_DERIVED_DEPENDENCIES_UNI));
  const adminRoutes=fs.readFileSync(path.join(root,
    'backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.routes.js'),'utf8');
  assert.match(adminRoutes,/router\.patch\('\/tablas\/pc\/registros\/:id'/);
  assert.match(adminRoutes,/router\.patch\('\/tablas\/pc\/registros\/edicion-multiple'/);
  assert.match(adminRoutes,/router\.post\('\/tablas\/pc\/registros'/);
  assert.match(adminRoutes,/router\.post\('\/tablas\/pc\/registros\/validar-alta'/);
  assert.doesNotMatch(adminRoutes,/router\.(?:put|delete)\('\/tablas\/pc\//i);
  assert.match(adminRoutes,/pcEditFeatureEnabled_uni/);
  const source=fs.readFileSync(path.join(root,
    'backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.pc-contract.js'),'utf8');
  assert.doesNotMatch(source,/require\(['"](?:\.\.\/\.\.\/config\/db|mysql2)/);
  assert.doesNotMatch(source,/\b(?:INSERT INTO|UPDATE `?pc`?|DELETE FROM|ALTER TABLE|CREATE TABLE)\s+pc\b/i);
});

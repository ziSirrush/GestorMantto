'use strict';

// [BLT NOW | 2026-10-23 | COBRANZA_UNI_ADMIN_VENTA_ADICIONAL_FASE_1_V001]
// Contrato de estructura de pc: NO consultas SQL, NO cambios en Aiven, NO escritura.
// Referencias: DDL MySQL de pc; encabezados y formulas Sheets aportados para VA.
// Las fases 2-6 implementaran pantallas, escritura, formulas y nuevas altas.

// Orden y tipos EXACTOS del DDL MySQL de pc: [nombre, tipo, nullable].
// id_pc NO es AUTO_INCREMENT; la estrategia de altas queda para la fase 6.
const PC_SQL_SPEC_UNI = Object.freeze([
  ['id_pc', 'bigint', false],
  ['zona_adm', 'varchar(100)', true],
  ['proyecto', 'varchar(255)', true],
  ['id_proyecto_cobranza', 'bigint unsigned', true],
  ['cliente', 'varchar(255)', true],
  ['ov', 'varchar(100)', true],
  ['fecha_ov', 'date', true],
  ['mes_ov', 'varchar(50)', true],
  ['concepto', 'varchar(500)', true],
  ['precio_venta', 'decimal(18,2)', true],
  ['pagado_iva', 'decimal(18,2)', true],
  ['no_pagado_iva', 'decimal(18,2)', true],
  ['venta_total', 'decimal(18,2)', true],
  ['facturas_pendientes_pago', 'int', true],
  ['adeudo', 'decimal(18,2)', true],
  ['tipo_pago', 'varchar(100)', true],
  ['no_factura', 'varchar(100)', true],
  ['fecha_factura', 'date', true],
  ['mes_factura', 'varchar(50)', true],
  ['terminos', 'varchar(100)', true],
  ['fecha_vencimiento', 'date', true],
  ['dias_vencimiento', 'int', true],
  ['estatus', 'varchar(100)', true],
  ['estatus_administrativo', 'varchar(150)', true],
  ['estatus_operativo', 'varchar(150)', true],
  ['fecha_pago', 'date', true],
  ['refacturacion_sustitucion', 'varchar(150)', true],
  ['zona_operativa', 'varchar(100)', true],
  ['estado', 'varchar(150)', true],
  ['comentarios_cobranza', 'text', true],
  ['estatus_cartera', 'varchar(150)', true]
].map(item => Object.freeze(item)));

// Mapeo completo Sheets -> Aiven. El ID de Cobranza es exclusivo de Aiven.
// Se diferencian los dos encabezados "MES" por letras G y R.
const PC_SHEET_HEADERS_UNI = Object.freeze([
  ['A', 'Consecutivo', 'id_pc'],
  ['B', 'ZONA ADM', 'zona_adm'],
  ['C', 'PROYECTO', 'proyecto'],
  ['D', 'CLIENTE', 'cliente'],
  ['E', 'OV', 'ov'],
  ['F', 'FECHA OV', 'fecha_ov'],
  ['G', 'MES', 'mes_ov'],
  ['H', 'CONCEPTO', 'concepto'],
  ['I', 'PRECIO DE VENTA', 'precio_venta'],
  ['J', 'PAGADO IVA', 'pagado_iva'],
  ['K', 'NO PAGADO IVA', 'no_pagado_iva'],
  ['L', 'VENTA TOTAL', 'venta_total'],
  ['M', 'FACTURAS PENDIENTES DE PAGO', 'facturas_pendientes_pago'],
  ['N', 'Adeudo', 'adeudo'],
  ['O', 'TIPO DE PAGO', 'tipo_pago'],
  ['P', 'NO.FACTURA', 'no_factura'],
  ['Q', 'FECHA FACTURA', 'fecha_factura'],
  ['R', 'MES', 'mes_factura'],
  ['S', 'TERMINOS', 'terminos'],
  ['T', 'FECHA DE VENCIMIENTO', 'fecha_vencimiento'],
  ['U', 'DÍAS DE VENCIMIENTO', 'dias_vencimiento'],
  ['V', 'ESTATUS', 'estatus'],
  ['W', 'ESTATUS ADMINISTRATIVO', 'estatus_administrativo'],
  ['X', 'ESTATUS OPERATIVO', 'estatus_operativo'],
  ['Y', 'FECHA DE PAGO', 'fecha_pago'],
  ['Z', '¿REFACTURACIÓN O SUSTITUCIÓN?', 'refacturacion_sustitucion'],
  ['AA', 'Zona Operativa', 'zona_operativa'],
  ['AB', 'Estado', 'estado'],
  ['AC', 'COMENTARIOS COBRANZA', 'comentarios_cobranza'],
  ['AD', 'ESTATUS CARTERA', 'estatus_cartera']
].map(entry => Object.freeze(entry)));

const PC_FOREIGN_KEY_UNI = Object.freeze({
  name: 'fk_pc_cobranza_proyecto',
  field: 'id_proyecto_cobranza',
  referencesTable: 'cobranza_proyectos',
  referencesField: 'id_proyecto_cobranza',
  onDelete: 'RESTRICT',
  onUpdate: 'CASCADE'
});

const PC_PROTECTED_FIELDS_UNI = Object.freeze(['id_pc', 'id_proyecto_cobranza']);

// Contratos de dependencia (solo declarativos). Origen externo se documenta
// en PC_LOOKUP_CONTRACT_UNI: no se sustituye el resultado de un BUSCARV con
// una coincidencia por nombre/cliente sin identidad segura y datos consistentes.
const PC_DERIVED_DEPENDENCIES_UNI = Object.freeze({
  mes_ov: Object.freeze(['fecha_ov']),
  pagado_iva: Object.freeze(['estatus_administrativo', 'tipo_pago', 'precio_venta']),
  no_pagado_iva: Object.freeze(['estatus_administrativo', 'tipo_pago', 'precio_venta']),
  venta_total: Object.freeze(['tipo_pago', 'precio_venta']),
  facturas_pendientes_pago: Object.freeze(['id_proyecto_cobranza', 'proyecto', 'estatus']),
  adeudo: Object.freeze(['id_proyecto_cobranza', 'proyecto', 'estatus', 'estatus_administrativo', 'venta_total']),
  mes_factura: Object.freeze(['fecha_factura']),
  terminos: Object.freeze(['id_proyecto_cobranza', 'proyecto', 'cliente']),
  fecha_vencimiento: Object.freeze(['fecha_factura', 'terminos']),
  dias_vencimiento: Object.freeze(['estatus_administrativo', 'fecha_vencimiento']),
  estatus: Object.freeze(['dias_vencimiento']),
  zona_operativa: Object.freeze(['id_proyecto_cobranza', 'proyecto']),
  estado: Object.freeze(['id_proyecto_cobranza', 'proyecto']),
  estatus_cartera: Object.freeze(['id_proyecto_cobranza', 'proyecto'])
});

const PC_DERIVED_FIELDS_UNI = Object.freeze(Object.keys(PC_DERIVED_DEPENDENCIES_UNI));
const protectedSet_uni = new Set(PC_PROTECTED_FIELDS_UNI);
const derivedSet_uni = new Set(PC_DERIVED_FIELDS_UNI);
const bySheet_uni = new Map(PC_SHEET_HEADERS_UNI.map(([letter, header, name]) => [name, {letter, header}]));

const PC_COLUMNS_UNI = Object.freeze(PC_SQL_SPEC_UNI.map(([name, sqlType, nullable]) => {
  const kind = protectedSet_uni.has(name) ? 'protected'
    : derivedSet_uni.has(name) ? 'derived' : 'editable';
  const sheet = bySheet_uni.get(name) || null;
  return Object.freeze({
    name, sqlType, nullable, kind, editable: kind === 'editable',
    sheetColumn: sheet?.letter || null,
    sheetHeader: sheet?.header || null
  });
}));

const PC_EDITABLE_FIELDS_UNI = Object.freeze(
  PC_COLUMNS_UNI.filter(column => column.editable).map(column => column.name)
);

// Fuente validada en el controlador existente de MP:
// detalle_mp_2026.{condiciones_pago,z_oper,estado,estatus_cartera}.
// Campo terminos en pc sigue siendo VARCHAR(100), aunque los valores
// observados en BD se representan como dias: 0,15,30,45,60,90,120.
// NO se impone una lista cerrada de plazos sin autorizacion adicional.
const PC_LOOKUP_CONTRACT_UNI = Object.freeze({
  table: 'detalle_mp_2026',
  primary: 'id_proyecto_cobranza_validado',
  projectFallback: 'proyecto_unico_y_sin_contradicciones',
  termsClientFallback: 'cliente_con_condiciones_consistentes',
  rejectAmbiguous: true,
  fields: Object.freeze({
    terminos: 'condiciones_pago',
    zona_operativa: 'z_oper',
    estado: 'estado',
    estatus_cartera: 'estatus_cartera'
  })
});

const PC_RULES_UNI = Object.freeze({
  timeZone: 'America/Mexico_City',
  cutOffDate: 'CURRENT_DATE_IN_TIME_ZONE',
  termUnit: 'days',
  zeroTermDays: 'same_day_due',
  nullInvoiceDate: 'null_due_date',
  vatPercent: 16,
  vatExemptPaymentType: 'RECIBO',
  administrativeOpenStatus: 'Abierta',
  administrativePaidStatus: 'pagado por completo',
  onlyOpenAccruesDue: true,
  agingEvaluation: 'on_read_and_on_write',
  sheetMonthFormat: 'MMM-YY',
  monthLocale: 'es-MX',
  currentStatus: 'CORRIENTE',
  overdueStatus: 'VENCIDO',
  projectAggregates: 'repeat_per_row_count_once_in_kpis',
  creationIdPolicy: 'explicit_id_checked_by_pk_no_auto_increment',
  syncTriggerPolicy: 'deactivate_only_after_authorized_cutover',
  schemaOnly: false,
  writesEnabled: false
});

module.exports = Object.freeze({
  PC_SQL_SPEC_UNI,
  PC_SHEET_HEADERS_UNI,
  PC_COLUMNS_UNI,
  PC_PROTECTED_FIELDS_UNI,
  PC_FOREIGN_KEY_UNI,
  PC_DERIVED_DEPENDENCIES_UNI,
  PC_DERIVED_FIELDS_UNI,
  PC_EDITABLE_FIELDS_UNI,
  PC_LOOKUP_CONTRACT_UNI,
  PC_RULES_UNI
});
